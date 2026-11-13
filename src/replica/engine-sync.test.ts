import { describe, expect, spyOn, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Command } from '@/core/ui-messages';
import { createMemoryBacking, type MockStorageBacking } from '@/platform/current';
import type { PlayerRole, StorageOperation } from '@/platform/ports';
import type { Wait } from '@/platform/send-queue';
import {
  createRoomRig,
  send,
  shown,
  storageKey,
  storedKeys,
  storedRecord,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '@/replica/room-rig';

const INITIAL = { n: 0, a: '' };
const ROW_STR = { kind: 'row', rowId: 'str' } as const;
const ROW_NOTES = { kind: 'row', rowId: 'notes' } as const;
const ROW_NAME = { kind: 'row', rowId: 'name' } as const;

// A sheet set with a name row, a plain row with a number and a check, and a text row of its own.
const PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [{ kind: 'field', type: 'text', id: 'name' }],
                [
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'field', type: 'check', id: 'str_tired' },
                ],
                [{ kind: 'field', type: 'text', id: 'notes' }],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] }],
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
  generation?: { n: number; a: string };
  // Fail from the start, so the engine meets them while it loads.
  failingStorage?: StorageOperation[];
};

type Client = RigClient & {
  // Every delta the background has sent its windows so far, and the keys they carried in order.
  deltas: () => number;
  deltaKeys: string[];
};

type Heard = { from: string; data: JsonValue };

type Listener = { heard: Heard[]; post: (from: string, data: JsonValue) => void };

function sheet(id: string, c = 1, a = 'seed'): VersionedRecord {
  return { k: `sheet:${id}`, d: { set: 'pc', order: 0 }, c, a };
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
  return { type: 'field-patch', sheetId: 'brok', target, fieldId, value } satisfies Command;
}

// A rename is a patch of the sheet set's name field.
function rename(sheetId: string, name: string) {
  return {
    type: 'field-patch',
    sheetId,
    target: ROW_NAME,
    fieldId: 'name',
    value: name,
  } satisfies Command;
}

function commit(records: VersionedRecord[], g = INITIAL, v = 3): JsonValue {
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
          storedWhenSent.push(storedRecord(gmA, 'row:brok:str'));
        }
      }),
    );

    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    await waitUntil(() => wire.heard.length === 1);

    // #then
    const written = { k: 'row:brok:str', d: { str: 12 }, c: 1, a: 'gm-a' };

    expect({ heard: wire.heard, storedWhenSent, shown: shown(gmA, written.k) }).toEqual({
      heard: [{ from: 'gm-a', data: commit([written]) }],
      storedWhenSent: [written],
      shown: written,
    });
  });

  test('splits a commit over the message limit into parts that each fit and together hold all', async () => {
    // #given: each row key is over 4000 bytes, so its tombstone is too.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const rowKeys = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => `row:brok:${'ы'.repeat(2000)}${id}`);
    const rows = rowKeys.map((k): VersionedRecord => ({ k, d: { str: 3 }, c: 1, a: 'seed' }));
    const gmA = await startClient(room, 'gm-a', { seeded: [PRESET_RECORD, BROK, ...rows] });
    const gmB = await startClient(room, 'gm-b', { seeded: [PRESET_RECORD, BROK, ...rows] });

    // #when
    send(gmA, { type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => rowKeys.every((k) => shown(gmB, k)?.d === null));

    // #then
    const sent = commitsFrom(wire.heard, 'gm-a');
    const records = sent.flatMap((message) => recordSchema.array().parse(Object(message).records));

    expect({
      parts: sent.length,
      underLimit: sent.every((message) => jsonByteLength(message) < MESSAGE_BYTE_LIMIT),
      keys: records.map((record) => record.k).sort(),
      sheetOnB: shown(gmB, 'sheet:brok'),
    }).toEqual({
      parts: 2,
      underLimit: true,
      keys: [...rowKeys, 'sheet:brok'].sort(),
      sheetOnB: { k: 'sheet:brok', d: null, c: 2, a: 'gm-a' },
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
    await waitUntil(() => storedRecord(gmA, 'row:brok:notes') !== null);
    hold = null;

    for (const release of releases) {
      release();
    }

    await waitUntil(() => wire.heard.length > 0);
    await waitUntil(() => shown(gmA, 'row:brok:notes') !== undefined);

    // #then
    expect(wire.heard).toEqual([
      {
        from: 'gm-a',
        data: commit([
          { k: 'row:brok:str', d: { str: 2 }, c: 2, a: 'gm-a' },
          { k: 'row:brok:notes', d: { notes: 'Хромает' }, c: 1, a: 'gm-a' },
        ]),
      },
    ]);
  });
});

describe('two GM clients', () => {
  test.each([
    ['on two devices', false],
    ['in two tabs of one browser', true],
  ])('%s keep edits to different rows made at once, on both and in storage', async (_n, shared) => {
    // #given
    const room = roomRig.openRoom();
    const backing = shared ? createMemoryBacking() : undefined;
    const gmA = await startClient(room, 'gm-a', { backing });
    const gmB = await startClient(room, 'gm-b', { backing });

    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    send(gmB, patch(ROW_NOTES, 'notes', 'Хромает'));

    // #then
    const str = { k: 'row:brok:str', d: { str: 12 }, c: 1, a: 'gm-a' };
    const notes = { k: 'row:brok:notes', d: { notes: 'Хромает' }, c: 1, a: 'gm-b' };

    await waitUntil(() =>
      [gmA, gmB].every((gm) => shown(gm, str.k) !== undefined && shown(gm, notes.k) !== undefined),
    );

    expect(
      [gmA, gmB].map((gm) => ({
        shown: [shown(gm, str.k), shown(gm, notes.k)],
        stored: [storedRecord(gm, str.k), storedRecord(gm, notes.k)],
      })),
    ).toEqual([
      { shown: [str, notes], stored: [str, notes] },
      { shown: [str, notes], stored: [str, notes] },
    ]);
  });

  test('settle on the record with the higher (c, a) when both edit one row at once', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    send(gmB, patch(ROW_STR, 'str_tired', true));

    // #then: both mint c 1, and "gm-b" is the higher author.
    const winner = { k: 'row:brok:str', d: { str_tired: true }, c: 1, a: 'gm-b' };

    await waitUntil(() => [gmA, gmB].every((gm) => shown(gm, winner.k)?.a === 'gm-b'));

    expect([gmA, gmB].map((gm) => [shown(gm, winner.k), storedRecord(gm, winner.k)])).toEqual([
      [winner, winner],
      [winner, winner],
    ]);
  });

  test('edit a row the other just changed from the record it received', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    send(gmA, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(gmB, 'row:brok:str') !== undefined);

    // #when
    send(gmB, patch(ROW_STR, 'str_tired', true));

    // #then
    const latest = { k: 'row:brok:str', d: { str: 12, str_tired: true }, c: 2, a: 'gm-b' };

    await waitUntil(() => shown(gmA, latest.k)?.c === 2);

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
    await waitUntil(() => shown(gmB, 'sheet:lisa') !== undefined);

    const created = shown(gmB, 'sheet:lisa');

    send(gmA, rename('lisa', 'Лиза Смелая'));
    await waitUntil(() => shown(gmB, 'row:lisa:name') !== undefined);

    const renamed = shown(gmB, 'row:lisa:name');

    send(gmA, { type: 'sheet-delete', sheetId: 'lisa' });
    await waitUntil(() => shown(gmB, 'sheet:lisa')?.c === 2);

    // #then
    expect({ created, renamed, deleted: shown(gmB, 'sheet:lisa') }).toEqual({
      created: { k: 'sheet:lisa', d: { set: 'pc', order: 1 }, c: 1, a: 'gm-a' },
      renamed: { k: 'row:lisa:name', d: { name: 'Лиза Смелая' }, c: 1, a: 'gm-a' },
      deleted: { k: 'sheet:lisa', d: null, c: 2, a: 'gm-a' },
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
    await waitUntil(
      () => shown(gmA, 'row:brok:notes') !== undefined && shown(gmB, 'row:brok:str') !== undefined,
    );

    expect([shown(gmA, 'row:brok:notes')?.a, shown(gmB, 'row:brok:str')?.a]).toEqual([
      'gm-b',
      'gm-a',
    ]);
  });

  test('do not send a received commit on again', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(gmB, 'row:brok:str') !== undefined);
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
    spyOn(gm.platform.party, 'getPlayers').mockResolvedValue([
      { id: 'owner', connectionId: 'late', name: 'late', role: 'GM' },
      { id: 'owner', connectionId: 'gm-b', name: 'gm-b', role: 'GM' },
    ]);

    // #when
    wire.post('late', commit([sheet('first', 1, 'late')]));
    wire.post('gm-b', commit([sheet('second', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'sheet:second') !== undefined);
    await waitUntil(() => shown(gm, 'sheet:first') !== undefined);

    // #then
    expect(gm.deltaKeys.filter((key) => key !== 'sheet:brok')).toEqual([
      'sheet:first',
      'sheet:second',
    ]);
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
    expect({ shown: shown(gm, 'sheet:lisa'), reads: reads.mock.calls.length }).toEqual({
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
    expect({ shown: shown(gm, 'sheet:lisa'), stored: storedRecord(gm, 'sheet:lisa') }).toEqual({
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
    await waitUntil(() => shown(gm, 'sheet:marker') !== undefined);

    // #then
    expect({
      shown: shown(gm, 'sheet:lisa'),
      stored: storedRecord(gm, 'sheet:lisa', ownGeneration),
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
    expect({ shown: shown(gm, 'sheet:lisa'), notices: gm.store.$notices.get() }).toEqual({
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
    wire.post('gm-b', { v: 4, t: 'commit', unread: 'a field of a newer build' });
    await waitUntil(() => gm.store.$notices.get().includes('new-version'));
    await afterMarker(wire.post, 'gm-b', gm);

    // #then
    expect({ notices: gm.store.$notices.get(), stored: storedKeys(gm).sort() }).toEqual({
      notices: ['new-version'],
      stored: [storageKey('preset'), storageKey('sheet:brok'), storageKey('sheet:marker')],
    });
  });

  test.each<[string, JsonValue]>([
    ['a record that fails its schema', commit([{ ...sheet('lisa'), c: 0 }])],
    ['an unknown type', { v: 3, g: INITIAL, t: 'shout', records: [] }],
    ['a type with no handler yet', { v: 3, g: INITIAL, t: 'ping' }],
    ['no envelope at all', 'commit'],
  ])('drops a message with the right v and %s, and throws nothing', async (_name, message) => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');
    const errors = spyOn(console, 'error');

    await startClient(room, 'gm-b');

    // #when
    wire.post('gm-b', message);
    await afterMarker(wire.post, 'gm-b', gm);

    // #then
    expect({ shown: shown(gm, 'sheet:lisa'), errors: errors.mock.calls }).toEqual({
      shown: undefined,
      errors: [],
    });
  });
});

describe('remote record', () => {
  test('that cannot be saved stays in the replica and raises the local-save notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    spyOn(console, 'error').mockImplementation(() => undefined);
    await startClient(room, 'gm-b');
    gm.platform.setFailingStorageOperations(['write']);

    // #when
    wire.post('gm-b', commit([sheet('lisa', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'sheet:lisa') !== undefined);

    // #then
    expect({
      shown: shown(gm, 'sheet:lisa'),
      stored: storedRecord(gm, 'sheet:lisa'),
      notices: gm.store.$notices.get(),
    }).toEqual({
      shown: sheet('lisa', 1, 'gm-b'),
      stored: null,
      notices: ['local-save-failed'],
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
    }).toEqual({ shown: local, deltas: 1, writes: [storageKey('sheet:marker')] });
  });
});

describe('GM whose storage could not be read', () => {
  test('applies its own edit and sends no commit', async () => {
    // #given
    const room = roomRig.openRoom();
    const wire = listen(room);

    spyOn(console, 'error').mockImplementation(() => undefined);

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
    await waitUntil(() => shown(gm, 'sheet:lisa') !== undefined);

    // A commit would sit in the queue ahead of the rename's delta.
    send(gm, rename('lisa', 'Лиза Смелая'));
    await waitUntil(() => shown(gm, 'row:lisa:name') !== undefined);

    // #then
    expect(wire.heard).toEqual([]);
  });
});

describe('remote record too large for one message', () => {
  test('is dropped, and the other records of its commit still apply', async () => {
    // #given: the record fits the commit, but not a window message with its envelope reserve.
    const room = roomRig.openRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    const huge: VersionedRecord = {
      k: 'row:brok:notes',
      d: { notes: 'ы'.repeat(7300) },
      c: 1,
      a: 'gm-b',
    };

    spyOn(console, 'error').mockImplementation(() => undefined);
    await startClient(room, 'gm-b');

    // #when
    wire.post('gm-b', commit([huge, sheet('lisa', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'sheet:lisa') !== undefined);

    // #then
    expect({ shown: shown(gm, huge.k), stored: storedRecord(gm, huge.k) }).toEqual({
      shown: undefined,
      stored: null,
    });
  });
});

describe('player client', () => {
  test.each<Command>([
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
    const settled = await Promise.resolve(player.window.sendCommand(command));

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
    await waitUntil(() => shown(player, 'sheet:lisa') !== undefined);

    expect({ shown: shown(player, 'sheet:lisa'), stored: storedKeys(player) }).toEqual({
      shown: { k: 'sheet:lisa', d: { set: 'pc', order: 1 }, c: 1, a: 'gm-a' },
      stored: [],
    });
  });
});
