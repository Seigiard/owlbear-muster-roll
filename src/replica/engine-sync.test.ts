import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, spyOn, test } from 'bun:test';
import { Result } from 'better-result';
import type { JsonValue } from '@/core/json';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type BlockData, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { WireCommand } from '@/core/ui-messages';
import { createMemoryBacking, type MockStorageBacking } from '@/platform/current';
import type { PlayerRole, StorageOperation } from '@/platform/ports';
import type { Wait } from '@/platform/send-queue';
import {
  createRoomRig,
  diagnostics,
  pause,
  send,
  sendWire,
  shown,
  storageKey,
  storedKeys,
  storedRecord,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

const INITIAL = { n: 0, a: '' };
const ROW_STR = { kind: 'row', rowId: 'str' } as const;
const ROW_NOTES = { kind: 'row', rowId: 'notes' } as const;
const ROW_NAME = { kind: 'row', rowId: 'name' } as const;

// A sheet set with a name row, a plain row with a number and a check, and a text row of its own.
const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'str' },
                    { kind: 'field', type: 'check', id: 'str_tired' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'text', id: 'notes' }] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',

      title: 'NPC',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK: VersionedRecord = sheet('brok');

type ClientOptions = {
  role?: PlayerRole;
  playerId?: string;
  backing?: MockStorageBacking;
  sendWait?: Wait;
  seeded?: readonly VersionedRecord[];
  generation?: {
    n: number;
    a: string;
  };
  // Fail from the start, so the engine meets them while it loads.
  failingStorage?: StorageOperation[];
};

type Client = RigClient & {
  // Every delta the background has sent its windows so far, and the keys they carried in order.
  deltas: () => number;
  deltaKeys: string[];
};

type Heard = {
  from: string;
  data: JsonValue;
};

type Listener = {
  heard: Heard[];
  post: (from: string, data: JsonValue) => void;
};

function sheet(id: string, c = 1, a = 'seed'): VersionedRecord {
  return { k: `blk:${id}`, d: { set: 'pc', order: 0, cells: {} }, c, a, l: [1, 'seed'] };
}

const roomRig = createRoomRig({
  seeded: [PRESET_RECORD, BROK],
  timing: { catchUpTimeoutMs: 200, stateAnswerDelayMaxMs: 5 },
  until: 'live',
});

// One client of the room: its background engine and one window, on a LOCAL bus of their own.
async function startClient(
  room: RigRoom,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const client = await roomRig.startClient(room, connectionId, {
    ...options,
    generation: options.generation,
    sendWait: options.sendWait,
    platform: (platform) => {
      platform.setFailingStorageOperations(options.failingStorage ?? []);

      return platform;
    },
  });

  return {
    ...client,
    deltas: () => client.local.filter((message) => Object(message).t === 'delta').length,
    get deltaKeys() {
      return client.local
        .filter((message) => Object(message).t === 'delta')
        .flatMap((message) =>
          recordSchema
            .array()
            .parse(Object(message).records)
            .map((record) => record.k),
        );
    },
  };
}

// A connection that is in the room and not in the party: it hears every REMOTE message of the
// given types.
function listen(room: RigRoom, types: readonly string[] = ['commit']): Listener {
  return {
    get heard() {
      return room.heard.flatMap((message) =>
        types.includes(String(Object(message.data).t))
          ? [{ from: message.from, data: message.data }]
          : [],
      );
    },
    post: room.post,
  };
}

function patch(target: typeof ROW_STR | typeof ROW_NOTES, fieldId: string, value: JsonValue) {
  return { type: 'field-patch', sheetId: 'brok', target, fieldId, value } satisfies WireCommand;
}

// A rename is a patch of the sheet set's name field.
function rename(sheetId: string, name: string) {
  return {
    type: 'field-patch',
    sheetId,
    target: ROW_NAME,
    fieldId: 'name',
    value: name,
  } satisfies WireCommand;
}

function commit(records: VersionedRecord[], g = INITIAL, v = 4): JsonValue {
  return { v, g, t: 'commit', records };
}

// A valid commit from a known GM, sent after a message under test. Room messages are handled in
// arrival order, so once the window shows it, the message before it has been handled too, and its
// delta, if any, went out first.
async function afterMarker(
  post: (from: string, data: JsonValue) => void,
  from: string,
  client: Client,
): Promise<void> {
  const marker = sheet('marker', 1, from);
  post(from, commit([marker]));
  await waitUntil(() => shown(client, marker.k) !== undefined);
}

function commitsFrom(heard: readonly Heard[], from: string): JsonValue[] {
  return heard.flatMap((message) => (message.from === from ? [message.data] : []));
}

describe('GM edit goes out', () => {
  test('as one commit on REMOTE with the written record, after it is merged and persisted', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gmA = await startClient(room, 'gm-a');
    const storedWhenSent: (VersionedRecord | null)[] = [];
    roomRig.cleanup(
      room.room.onRemote(SYNC_CHANNEL, 'probe', (event) => {
        if (Object(event.data).t === 'commit') {
          storedWhenSent.push(storedRecord(gmA, 'blk:brok'));
        }
      }),
    );
    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    await waitUntil(() => wire.heard.length === 1);

    // #then
    const written: VersionedRecord = {
      k: 'blk:brok',
      d: { set: 'pc', order: 0, cells: { str: [12, 2, 'gm-a'] } },
      c: 2,
      a: 'gm-a',
      l: [1, 'seed'],
    };

    expect({ heard: wire.heard, storedWhenSent, shown: shown(gmA, written.k) }).toEqual({
      heard: [{ from: 'gm-a', data: commit([written]) }],
      storedWhenSent: [written],
      shown: written,
    });
  });
  test('splits a commit over the message limit into parts that each fit and together hold all', async () => {
    // #given: enough descendant blocks exist that their tombstones need more than one message.
    const room = roomRig.openRoom();
    const wire = listen(room);

    const blockKeys = Array.from(
      { length: 300 },
      (_, index) => `blk:brok:attack:i${String(index).padStart(3, '0')}`,
    );

    const blocks = blockKeys.map((k): VersionedRecord =>
      fixtureRecord(k, { order: 0, cells: {} }, 1, 'seed'),
    );

    const gmA = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, BROK, ...blocks],
    });

    const gmB = await startClient(room, 'gm-b', {
      seeded: [PRESET_RECORD, BROK, ...blocks],
    });

    // #when
    send(gmA, { type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => blockKeys.every((k) => shown(gmB, k)?.d === null));
    // #then
    const sent = commitsFrom(wire.heard, 'gm-a');
    const records = sent.flatMap((message) => recordSchema.array().parse(Object(message).records));
    expect({
      parts: sent.length,
      underLimit: sent.every((message) => jsonByteLength(message) < MESSAGE_BYTE_LIMIT),
      keys: records.map((record) => record.k).sort(),
      sheetOnB: shown(gmB, 'blk:brok'),
    }).toEqual({
      parts: 2,
      underLimit: true,
      keys: [...blockKeys, 'blk:brok'].sort(),
      sheetOnB: { k: 'blk:brok', d: null, c: 2, a: 'gm-a', l: [1, 'seed'] },
    });
  });
});

describe('coalescing', () => {
  test('sends only the newer record of a key edited twice while the queue is held, and keeps the other keys', async () => {
    // #given: once the queue has sent the first delta, its spacing pause holds until released.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const releases: (() => void)[] = [];
    let hold: Promise<void> | null = null;

    const wait: Wait = (milliseconds) =>
      hold ?? new Promise((resolve) => setTimeout(resolve, milliseconds));

    const gmA = await startClient(room, 'gm-a', { sendWait: wait });
    hold = new Promise((resolve) => {
      releases.push(resolve);
    });
    // #when
    send(gmA, patch(ROW_STR, 'str', 1));
    send(gmA, patch(ROW_STR, 'str', 2));
    send(gmA, patch(ROW_NOTES, 'notes', 'Хромает'));
    await waitUntil(() => storedRecord(gmA, 'blk:brok') !== null);
    hold = null;

    for (const release of releases) {
      release();
    }

    await waitUntil(() => wire.heard.length > 0);
    await waitUntil(() => shown(gmA, 'blk:brok') !== undefined);
    // #then
    expect(wire.heard).toEqual([
      {
        from: 'gm-a',
        data: commit([
          {
            k: 'blk:brok',
            d: {
              set: 'pc',
              order: 0,
              cells: {
                str: [2, 3, 'gm-a'],
                notes: ['Хромает', 4, 'gm-a'],
              },
            },
            c: 4,
            a: 'gm-a',
            l: [1, 'seed'],
          },
        ]),
      },
    ]);
  });
});

describe('two GM clients', () => {
  test.each([
    ['on two devices', false],
    ['in two tabs of one browser', true],
  ])(
    '%s keep edits to different cells made at once, on both and in storage',
    async (_n, shared) => {
      // #given
      const room = roomRig.openRoom();
      const backing = shared ? createMemoryBacking() : undefined;
      const gmA = await startClient(room, 'gm-a', { backing });
      const gmB = await startClient(room, 'gm-b', { backing });
      // #when
      send(gmA, patch(ROW_STR, 'str', 12));
      send(gmB, patch(ROW_NOTES, 'notes', 'Хромает'));

      // #then
      const merged: VersionedRecord = {
        k: 'blk:brok',
        d: {
          set: 'pc',
          order: 0,
          cells: {
            str: [12, 2, 'gm-a'],
            notes: ['Хромает', 2, 'gm-b'],
          },
        },
        c: 2,
        a: 'gm-b',
        l: [1, 'seed'],
      };

      await waitUntil(() =>
        [gmA, gmB].every(
          (gm) =>
            Object(shown(gm, merged.k)?.d).cells?.str?.[0] === 12 &&
            Object(shown(gm, merged.k)?.d).cells?.notes?.[0] === 'Хромает' &&
            Object(storedRecord(gm, merged.k)?.d).cells?.str?.[0] === 12 &&
            Object(storedRecord(gm, merged.k)?.d).cells?.notes?.[0] === 'Хромает',
        ),
      );
      expect([gmA, gmB].map((gm) => [shown(gm, merged.k), storedRecord(gm, merged.k)])).toEqual([
        [merged, merged],
        [merged, merged],
      ]);
    },
  );
  test('keep both cells when both edit one block at once', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');
    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    send(gmB, patch(ROW_STR, 'str_tired', true));

    // #then: both mint cell version 2, and the root takes the higher author.
    const merged: VersionedRecord = {
      k: 'blk:brok',
      d: {
        set: 'pc',
        order: 0,
        cells: { str: [12, 2, 'gm-a'], str_tired: [true, 2, 'gm-b'] },
      },
      c: 2,
      a: 'gm-b',
      l: [1, 'seed'],
    };

    await waitUntil(() =>
      [gmA, gmB].every(
        (gm) =>
          Object(shown(gm, merged.k)?.d).cells?.str?.[0] === 12 &&
          Object(shown(gm, merged.k)?.d).cells?.str_tired?.[0] === true,
      ),
    );
    expect([gmA, gmB].map((gm) => [shown(gm, merged.k), storedRecord(gm, merged.k)])).toEqual([
      [merged, merged],
      [merged, merged],
    ]);
  });
  test('edit a row the other just changed from the record it received', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');
    send(gmA, patch(ROW_STR, 'str', 12));
    await waitUntil(() => Object(shown(gmB, 'blk:brok')?.d).cells?.str?.[0] === 12);
    // #when
    send(gmB, patch(ROW_STR, 'str_tired', true));

    // #then
    const latest: VersionedRecord = {
      k: 'blk:brok',
      d: {
        set: 'pc',
        order: 0,
        cells: { str: [12, 2, 'gm-a'], str_tired: [true, 3, 'gm-b'] },
      },
      c: 3,
      a: 'gm-b',
      l: [1, 'seed'],
    };

    await waitUntil(() => shown(gmA, latest.k)?.c === 3);
    expect([shown(gmA, latest.k), storedRecord(gmA, latest.k), shown(gmB, latest.k)]).toEqual([
      latest,
      latest,
      latest,
    ]);
  });
  test('see a sheet created, renamed and deleted by the other', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');
    // #when
    send(gmA, { type: 'sheet-create', sheetId: 'lisa', set: 'pc' });
    await waitUntil(() => shown(gmB, 'blk:lisa') !== undefined);
    const created = shown(gmB, 'blk:lisa');
    send(gmA, rename('lisa', 'Лиза Смелая'));
    await waitUntil(() => Object(shown(gmB, 'blk:lisa')?.d).cells?.name?.[0] === 'Лиза Смелая');
    const renamed = shown(gmB, 'blk:lisa');
    send(gmA, { type: 'sheet-delete', sheetId: 'lisa' });
    await waitUntil(() => shown(gmB, 'blk:lisa')?.c === 3);
    // #then
    expect({ created, renamed, deleted: shown(gmB, 'blk:lisa') }).toEqual({
      created: {
        k: 'blk:lisa',
        d: { set: 'pc', order: 1, cells: {} },
        c: 1,
        a: 'gm-a',
        l: [1, 'gm-a'],
      },
      renamed: {
        k: 'blk:lisa',
        d: {
          set: 'pc',
          order: 1,
          cells: { name: ['Лиза Смелая', 2, 'gm-a'] },
        },
        c: 2,
        a: 'gm-a',
        l: [1, 'gm-a'],
      },
      deleted: { k: 'blk:lisa', d: null, c: 3, a: 'gm-a', l: [1, 'gm-a'] },
    });
  });
  test('of one player id are both known, so the commits of each apply on the other', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a', { playerId: 'owner' });
    const gmB = await startClient(room, 'gm-b', { playerId: 'owner' });
    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    send(gmB, patch(ROW_NOTES, 'notes', 'Хромает'));
    // #then
    await waitUntil(() =>
      [gmA, gmB].every(
        (gm) =>
          Object(shown(gm, 'blk:brok')?.d).cells?.str?.[0] === 12 &&
          Object(shown(gm, 'blk:brok')?.d).cells?.notes?.[0] === 'Хромает',
      ),
    );

    const merged: BlockData = {
      set: 'pc',
      order: 0,
      cells: {
        str: [12, 2, 'gm-a'],
        notes: ['Хромает', 2, 'gm-b'],
      },
    };

    expect([shown(gmA, 'blk:brok')?.d, shown(gmB, 'blk:brok')?.d]).toEqual([merged, merged]);
  });
  test('do not send a received commit on again', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');
    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(gmB, 'blk:brok') !== undefined);
    await afterMarker(wire.post, 'gm-a', gmB);
    // #then
    expect(commitsFrom(wire.heard, 'gm-b')).toEqual([]);
  });
});

describe('gate', () => {
  test('handles room messages in arrival order, also when the first needs a party read', async () => {
    // #given: "late" is a GM the last party change did not list, so its message waits for a read.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    spyOn(gm.platform.party, 'getPlayers').mockResolvedValue(
      Result.ok([
        { id: 'owner', connectionId: 'late', name: 'late', role: 'GM' },
        { id: 'owner', connectionId: 'gm-b', name: 'gm-b', role: 'GM' },
      ]),
    );
    // #when
    wire.post('late', commit([sheet('first', 1, 'late')]));
    wire.post('gm-b', commit([sheet('second', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'blk:second') !== undefined);
    await waitUntil(() => shown(gm, 'blk:first') !== undefined);
    // #then
    expect(gm.deltaKeys.filter((key) => key !== 'blk:brok')).toEqual(['blk:first', 'blk:second']);
  });
  test('drops a commit from a connection the party does not know after one re-read', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    const reads = spyOn(gm.platform.party, 'getPlayers');
    // #when
    wire.post('stranger', commit([sheet('lisa', 1, 'stranger')]));
    await afterMarker(wire.post, 'gm-b', gm);
    // #then
    expect({ shown: shown(gm, 'blk:lisa'), reads: reads.mock.calls.length }).toEqual({
      shown: undefined,
      reads: 1,
    });
  });
  test('drops a commit from a known player', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    await startClient(room, 'player-p', { role: 'PLAYER', playerId: 'lisa' });
    // #when
    wire.post('player-p', commit([sheet('lisa', 1, 'player-p')]));
    await afterMarker(wire.post, 'gm-b', gm);
    // #then
    expect({ shown: shown(gm, 'blk:lisa'), stored: storedRecord(gm, 'blk:lisa') }).toEqual({
      shown: undefined,
      stored: null,
    });
  });
  test.each([
    ['higher', { n: 1, a: 'x' }, INITIAL],
    ['lower', INITIAL, { n: 1, a: 'x' }],
  ])('drops a GM commit of a %s generation', async (_name, g, ownGeneration) => {
    // #given: a GM whose storage is at generation 1 has that generation as its own.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a', { generation: ownGeneration });
    await startClient(room, 'gm-b', { generation: ownGeneration });
    // #when
    wire.post('gm-b', commit([sheet('lisa', 1, 'gm-b')], g));
    wire.post('gm-b', commit([sheet('marker', 1, 'gm-b')], ownGeneration));
    await waitUntil(() => shown(gm, 'blk:marker') !== undefined);
    // #then
    expect({
      shown: shown(gm, 'blk:lisa'),
      stored: storedRecord(gm, 'blk:lisa', ownGeneration),
    }).toEqual({
      shown: undefined,
      stored: null,
    });
  });
  test('drops a message with a lower v and shows no notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    // #when
    wire.post('gm-b', commit([sheet('lisa', 1, 'gm-b')], INITIAL, 1));
    await afterMarker(wire.post, 'gm-b', gm);
    // #then
    expect({ shown: shown(gm, 'blk:lisa'), notices: gm.store.$notices.get() }).toEqual({
      shown: undefined,
      notices: [],
    });
  });
  test('drops a message with a higher v and keeps the new-version notice after later deltas', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    // #when
    wire.post('gm-b', { v: 5, t: 'commit', unread: 'a field of a newer build' });
    await waitUntil(() => gm.store.$notices.get().includes('new-version'));
    await afterMarker(wire.post, 'gm-b', gm);
    // #then
    expect({ notices: gm.store.$notices.get(), stored: storedKeys(gm).sort() }).toEqual({
      notices: ['new-version'],
      stored: [storageKey('blk:brok'), storageKey('blk:marker'), storageKey('preset')],
    });
  });
  test('a stopped engine ignores newer-format room ingress after live ingress worked', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    wire.post('gm-b', commit([sheet('live-control', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'blk:live-control') !== undefined);
    await pause(20);
    const sentBeforeStop = gm.local.length;
    gm.engine.stop();
    // #when
    wire.post('gm-b', { v: 5, t: 'commit', unread: 'newer build data' });
    await pause(30);
    // #then
    expect({
      control: shown(gm, 'blk:live-control'),
      postStop: gm.local.slice(sentBeforeStop),
      notices: gm.store.$notices.get(),
    }).toEqual({
      control: sheet('live-control', 1, 'gm-b'),
      postStop: [],
      notices: [],
    });
  });
  test.each<[string, JsonValue]>([
    ['a record that fails its schema', commit([{ ...sheet('lisa'), c: 0 }])],
    ['an unknown type', { v: 4, g: INITIAL, t: 'shout', records: [] }],
    ['no envelope at all', 'commit'],
  ])('drops a message with the right v and %s, and throws nothing', async (_name, message) => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    // #when
    wire.post('gm-b', message);
    await afterMarker(wire.post, 'gm-b', gm);
    // #then
    expect({
      shown: shown(gm, 'blk:lisa'),
      diagnostics: diagnostics(gm).map(({ tag }) => tag),
    }).toEqual({
      shown: undefined,
      diagnostics: ['message-rejected'],
    });
  });
  test('answers a valid v4 ping without reporting a rejection', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room, ['alive']);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    const heardBeforePing = wire.heard.length;
    // #when
    wire.post('gm-b', { v: 4, g: INITIAL, t: 'ping' });
    await afterMarker(wire.post, 'gm-b', gm);
    await waitUntil(() => wire.heard.slice(heardBeforePing).some(({ from }) => from === 'gm-a'));
    // #then
    expect({
      shown: shown(gm, 'blk:lisa'),
      diagnostics: diagnostics(gm).map(({ tag }) => tag),
    }).toEqual({ shown: undefined, diagnostics: [] });
  });
});

describe('remote record', () => {
  test('that cannot be saved stays in the replica and raises the local-save notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    await startClient(room, 'gm-b');
    gm.platform.setFailingStorageOperations(['write']);
    // #when
    wire.post('gm-b', commit([sheet('lisa', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'blk:lisa') !== undefined);
    // #then
    expect({
      shown: shown(gm, 'blk:lisa'),
      stored: storedRecord(gm, 'blk:lisa'),
      notices: gm.store.$notices.get(),
      diagnostics: diagnostics(gm).map(({ tag }) => tag),
    }).toEqual({
      shown: sheet('lisa', 1, 'gm-b'),
      stored: null,
      notices: ['local-save-failed'],
      diagnostics: ['StorageFailure'],
    });
  });
  test('that loses to the local one sends no delta and writes nothing', async () => {
    // #given: the GM holds Брок at c 5.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const local = sheet('brok', 5, 'seed');
    const gm = await startClient(room, 'gm-a', { seeded: [PRESET_RECORD, local] });
    await startClient(room, 'gm-b');
    const writes = spyOn(gm.backing, 'set');
    const deltasBefore = gm.deltas();
    // #when
    wire.post('gm-b', commit([sheet('brok', 2, 'gm-b')]));
    await afterMarker(wire.post, 'gm-b', gm);
    // #then: only the marker made a delta and a write.
    expect({
      shown: shown(gm, local.k),
      deltas: gm.deltas() - deltasBefore,
      writes: writes.mock.calls.map(([key]) => key),
    }).toEqual({ shown: local, deltas: 1, writes: [storageKey('blk:marker')] });
  });
  test('an unchanged winner does not read failed persistence or raise a notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const local = sheet('brok', 5, 'seed');
    const gm = await startClient(room, 'gm-a', { seeded: [PRESET_RECORD, local] });
    await startClient(room, 'gm-b');
    gm.platform.setFailingStorageOperations(['read']);
    // #when
    wire.post('gm-b', commit([sheet('brok', 2, 'gm-b')]));
    await pause(30);
    // #then
    expect({
      shown: shown(gm, local.k),
      notices: gm.store.$notices.get(),
      diagnostics: diagnostics(gm).map(({ tag }) => tag),
    }).toEqual({ shown: local, notices: [], diagnostics: [] });
  });
});

describe('GM whose storage could not be read', () => {
  test('applies its own edit and sends no commit', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a', { failingStorage: ['list'], seeded: [] });
    // #when: a new sheet needs a preset, and the GM holds none.
    send(gm, {
      type: 'preset-upload',
      data: encodePreset(PRESET),
      expectedCount: 0,
      expectedSheets: 0,
      expectedDigest: '811c9dc5',
    });
    await waitUntil(() => shown(gm, 'preset') !== undefined);
    send(gm, { type: 'sheet-create', sheetId: 'lisa', set: 'pc' });
    await waitUntil(() => shown(gm, 'blk:lisa') !== undefined);
    // A commit would sit in the queue ahead of the rename's delta.
    send(gm, rename('lisa', 'Лиза Смелая'));
    await waitUntil(() => shown(gm, 'blk:lisa') !== undefined);
    // #then
    expect({ heard: wire.heard, diagnostics: diagnostics(gm).map(({ tag }) => tag) }).toEqual({
      heard: [],
      diagnostics: ['StorageFailure'],
    });
  });
});

describe('remote record too large for one message', () => {
  test('is dropped, and the other records of its commit still apply', async () => {
    // #given: the record fits the commit, but not a window message with its envelope reserve.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    const huge: VersionedRecord = {
      k: 'blk:brok',
      d: { order: 0, cells: { notes: ['ы'.repeat(7300), 1, 'gm-b'] } },
      c: 1,
      a: 'gm-b',
      l: [1, 'seed'],
    };

    await startClient(room, 'gm-b');
    // #when
    wire.post('gm-b', commit([huge, sheet('lisa', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'blk:lisa') !== undefined);
    // #then
    expect({
      shown: shown(gm, huge.k),
      stored: storedRecord(gm, huge.k),
      diagnostics: diagnostics(gm).map(({ tag }) => tag),
    }).toEqual({
      shown: BROK,
      stored: BROK,
      diagnostics: ['record-too-large'],
    });
  });
});

describe('player client', () => {
  test.each<WireCommand>([
    { type: 'sheet-create', sheetId: 'lisa', set: 'pc' },
    rename('brok', 'Брок Смелый'),
    { type: 'sheet-delete', sheetId: 'brok' },
    {
      type: 'preset-upload',
      data: encodePreset(PRESET),
      expectedCount: 0,
      expectedSheets: 0,
      expectedDigest: '811c9dc5',
    },
    patch(ROW_STR, 'str', 12),
    { type: 'repeat-block-add', sheetId: 'brok', sectionId: 'attack', instanceId: 'i1' },
    { type: 'repeat-block-delete', sheetId: 'brok', sectionId: 'attack', instanceId: 'i1' },
    {
      type: 'repeat-block-duplicate',
      sheetId: 'brok',
      sectionId: 'attack',
      instanceId: 'i1',
      count: 1,
    },
    { type: 'wipe' },
  ])('refuses %o as not allowed and changes nothing', async (command) => {
    // #given: the player holds Брок and the preset from a GM commit.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const player = await startClient(room, 'player-p', { role: 'PLAYER', seeded: [] });
    await startClient(room, 'gm-a');
    wire.post('gm-a', commit([PRESET_RECORD, BROK]));
    await waitUntil(() => shown(player, BROK.k) !== undefined);
    // The player heard gm-a as a GM return and caught up; its end sends a delta of its own.
    await waitUntil(() => player.store.$sync.get().state === 'live');
    const before = [...player.store.$records.get().values()];
    const deltasBefore = player.deltas();
    // #when
    const settled = await Promise.resolve(sendWire(player.window, command));
    // #then
    expect({
      reason: settled.kind === 'refused' ? settled.rejection.reason : settled.kind,
      records: [...player.store.$records.get().values()],
      deltas: player.deltas() - deltasBefore,
      heard: commitsFrom(wire.heard, 'player-p'),
    }).toEqual({ reason: 'not-allowed', records: before, deltas: 0, heard: [] });
  });
  test('merges a GM commit into its replica and persists nothing', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, 'player-p', { role: 'PLAYER', seeded: [] });
    // #when
    send(gm, { type: 'sheet-create', sheetId: 'lisa', set: 'pc' });
    // #then
    await waitUntil(() => shown(player, 'blk:lisa') !== undefined);
    expect({ shown: shown(player, 'blk:lisa'), stored: storedKeys(player) }).toEqual({
      shown: {
        k: 'blk:lisa',
        d: { set: 'pc', order: 1, cells: {} },
        c: 1,
        a: 'gm-a',
        l: [1, 'gm-a'],
      },
      stored: [],
    });
  });
});
