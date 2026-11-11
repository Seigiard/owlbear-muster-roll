import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type Command } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole, StorageOperation } from '@/platform/ports';
import { createSendQueue, type Wait } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';

const TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 25,
  projectionIncompleteTimeoutMs: 80,
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 200,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 5,
  // Far past any test, so no ping goes out unless a test asks for one.
  gmLinkTimeoutMs: 60000,
  // Far past any test, so no room copy is written unless a test asks for one.
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const INITIAL = { n: 0, a: '' };
const ROW_STR = { kind: 'row', rowId: 'str' } as const;
const ROW_NOTES = { kind: 'row', rowId: 'notes' } as const;

// A plain row with a number and a check, and a text row of its own.
const PRESET: Preset = {
  v: 1,
  character: {
    sections: [
      {
        rows: [
          [
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'field', type: 'check', id: 'str_tired' },
          ],
          [{ kind: 'field', type: 'text', id: 'notes' }],
        ],
      },
    ],
  },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

const BROK: VersionedRecord = sheet('brok', 'Брок');

type ClientOptions = {
  role?: PlayerRole;
  playerId?: string;
  backing?: MockStorageBacking;
  wait?: Wait;
  seeded?: readonly VersionedRecord[];
  generationPrefix?: string;
  // Fail from the start, so the engine meets them while it loads.
  failingStorage?: StorageOperation[];
};

type Client = {
  connectionId: string;
  platform: MockPlatform;
  backing: MockStorageBacking;
  store: ProjectionStore;
  window: ReplicaClient;
  // Every delta the background has sent its windows so far, and the keys they carried in order.
  deltas: () => number;
  deltaKeys: string[];
};

type Heard = { from: string; data: JsonValue };

type Listener = { heard: Heard[]; post: (from: string, data: JsonValue) => void };

const cleanups: (() => void)[] = [];

afterEach(() => {
  mock.restore();

  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function sheet(id: string, name: string, c = 1, a = 'seed'): VersionedRecord {
  return { k: `sheet:${id}`, d: { kind: 'pc', name, order: 0 }, c, a };
}

function createBacking(): MockStorageBacking {
  const entries = new Map<string, string>();

  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
    keys: () => [...entries.keys()],
  };
}

// One client of the room: its background engine and one window, on a LOCAL bus of their own.
async function startClient(
  room: MockRoom,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const backing = options.backing ?? createBacking();
  const bus = createMemoryBus();

  const identity = {
    room,
    connectionId,
    playerId: options.playerId ?? 'owner',
    name: connectionId,
    role: options.role ?? 'GM',
  };

  const platform = createMockPlatform(bus, backing, identity);

  for (const record of options.seeded ?? [PRESET_RECORD, BROK]) {
    backing.set(`${options.generationPrefix ?? STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  platform.setFailingStorageOperations(options.failingStorage ?? []);
  platform.joinParty();

  const engine = await startReplicaEngine(
    platform,
    createSendQueue(platform.broadcast, TIMING, options.wait),
    { timing: TIMING },
  );

  // The window is a page of the same client, so it has the same connection id and joins no party.
  const windowPlatform = createMockPlatform(bus, backing, identity);
  const store = createProjectionStore();
  let deltas = 0;
  const deltaKeys: string[] = [];

  cleanups.push(
    windowPlatform.broadcast.onMessage(UI_CHANNEL, (event) => {
      const message = Object(event.data);

      if (message.t === 'delta') {
        deltas += 1;
        deltaKeys.push(
          ...recordSchema
            .array()
            .parse(message.records)
            .map((record) => record.k),
        );
      }
    }),
  );

  const window = startReplicaClient(
    windowPlatform.broadcast,
    createSendQueue(windowPlatform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop);
  // A client catches up on start, and an edit made before that ends would wait in the queue.
  await waitUntil(() => store.$loaded.get() && store.$sync.get().state === 'live');

  return { connectionId, platform, backing, store, window, deltas: () => deltas, deltaKeys };
}

// A connection that is in the room and not in the party: it hears every REMOTE message of the
// given types.
function listen(room: MockRoom, types: readonly string[] = ['commit']): Listener {
  const observer = createMockPlatform(createMemoryBus(), createBacking(), {
    room,
    connectionId: 'observer',
    playerId: 'observer',
    name: 'observer',
    role: 'PLAYER',
  });

  const heard: Heard[] = [];

  cleanups.push(
    observer.broadcast.onMessage(SYNC_CHANNEL, (event) => {
      if (types.includes(String(Object(event.data).t))) {
        heard.push({ from: event.connectionId, data: event.data });
      }
    }),
  );

  return {
    heard,
    post: (from, data) => {
      observer.sendRemoteAs(from, SYNC_CHANNEL, data);
    },
  };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('the condition never became true');
    }

    // Polling is the point here: each round has to let the paced queues run.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function send(client: Client, command: Command): void {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }
}

function patch(target: typeof ROW_STR | typeof ROW_NOTES, fieldId: string, value: JsonValue) {
  return { type: 'field-patch', sheetId: 'brok', target, fieldId, value } satisfies Command;
}

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function stored(client: Client, key: string, prefix = STORAGE_PREFIX): VersionedRecord | null {
  const text = client.backing.get(`${prefix}${key}`);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
}

function storedKeys(client: Client): string[] {
  return client.backing.keys();
}

function commit(records: VersionedRecord[], g = INITIAL, v = 1): JsonValue {
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
  const marker = sheet('marker', 'Метка', 1, from);

  post(from, commit([marker]));
  await waitUntil(() => shown(client, marker.k) !== undefined);
}

function commitsFrom(heard: readonly Heard[], from: string): JsonValue[] {
  return heard.flatMap((message) => (message.from === from ? [message.data] : []));
}

describe('GM edit goes out', () => {
  test('as one commit on REMOTE with the written record, after it is merged and persisted', async () => {
    // #given
    const room = createMemoryRoom();
    const wire = listen(room);
    const gmA = await startClient(room, 'gm-a');
    const storedWhenSent: (VersionedRecord | null)[] = [];

    cleanups.push(
      createMockPlatform(createMemoryBus(), createBacking(), {
        room,
        connectionId: 'probe',
        playerId: 'probe',
        name: 'probe',
        role: 'PLAYER',
      }).broadcast.onMessage(SYNC_CHANNEL, (event) => {
        if (Object(event.data).t === 'commit') {
          storedWhenSent.push(stored(gmA, 'row:brok:str'));
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
    const room = createMemoryRoom();
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
    const room = createMemoryRoom();
    const wire = listen(room);
    const releases: (() => void)[] = [];
    let hold: Promise<void> | null = null;

    const wait: Wait = (milliseconds) =>
      hold ?? new Promise((resolve) => setTimeout(resolve, milliseconds));

    const gmA = await startClient(room, 'gm-a', { wait });

    hold = new Promise((resolve) => {
      releases.push(resolve);
    });

    // #when
    send(gmA, patch(ROW_STR, 'str', 1));
    send(gmA, patch(ROW_STR, 'str', 2));
    send(gmA, patch(ROW_NOTES, 'notes', 'Хромает'));
    await waitUntil(() => stored(gmA, 'row:brok:notes') !== null);
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
    const room = createMemoryRoom();
    const backing = shared ? createBacking() : undefined;
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
        stored: [stored(gm, str.k), stored(gm, notes.k)],
      })),
    ).toEqual([
      { shown: [str, notes], stored: [str, notes] },
      { shown: [str, notes], stored: [str, notes] },
    ]);
  });

  test('settle on the record with the higher (c, a) when both edit one row at once', async () => {
    // #given
    const room = createMemoryRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    // #when
    send(gmA, patch(ROW_STR, 'str', 12));
    send(gmB, patch(ROW_STR, 'str_tired', true));

    // #then: both mint c 1, and "gm-b" is the higher author.
    const winner = { k: 'row:brok:str', d: { str_tired: true }, c: 1, a: 'gm-b' };

    await waitUntil(() => [gmA, gmB].every((gm) => shown(gm, winner.k)?.a === 'gm-b'));

    expect([gmA, gmB].map((gm) => [shown(gm, winner.k), stored(gm, winner.k)])).toEqual([
      [winner, winner],
      [winner, winner],
    ]);
  });

  test('edit a row the other just changed from the record it received', async () => {
    // #given
    const room = createMemoryRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    send(gmA, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(gmB, 'row:brok:str') !== undefined);

    // #when
    send(gmB, patch(ROW_STR, 'str_tired', true));

    // #then
    const latest = { k: 'row:brok:str', d: { str: 12, str_tired: true }, c: 2, a: 'gm-b' };

    await waitUntil(() => shown(gmA, latest.k)?.c === 2);

    expect([shown(gmA, latest.k), stored(gmA, latest.k), shown(gmB, latest.k)]).toEqual([
      latest,
      latest,
      latest,
    ]);
  });

  test('see a sheet created, renamed and deleted by the other', async () => {
    // #given
    const room = createMemoryRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    // #when
    send(gmA, { type: 'sheet-create', sheetId: 'lisa', kind: 'pc', name: 'Лиза' });
    await waitUntil(() => shown(gmB, 'sheet:lisa') !== undefined);

    const created = shown(gmB, 'sheet:lisa');

    send(gmA, { type: 'sheet-rename', sheetId: 'lisa', name: 'Лиза Смелая' });
    await waitUntil(() => shown(gmB, 'sheet:lisa')?.c === 2);

    const renamed = shown(gmB, 'sheet:lisa');

    send(gmA, { type: 'sheet-delete', sheetId: 'lisa' });
    await waitUntil(() => shown(gmB, 'sheet:lisa')?.c === 3);

    // #then
    expect({ created, renamed, deleted: shown(gmB, 'sheet:lisa') }).toEqual({
      created: { k: 'sheet:lisa', d: { kind: 'pc', name: 'Лиза', order: 1 }, c: 1, a: 'gm-a' },
      renamed: {
        k: 'sheet:lisa',
        d: { kind: 'pc', name: 'Лиза Смелая', order: 1 },
        c: 2,
        a: 'gm-a',
      },
      deleted: { k: 'sheet:lisa', d: null, c: 3, a: 'gm-a' },
    });
  });

  test('of one player id are both known, so the commits of each apply on the other', async () => {
    // #given
    const room = createMemoryRoom();
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
    const room = createMemoryRoom();
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
    const room = createMemoryRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    await startClient(room, 'gm-b');
    spyOn(gm.platform.party, 'getPlayers').mockResolvedValue([
      { id: 'owner', connectionId: 'late', name: 'late', role: 'GM' },
      { id: 'owner', connectionId: 'gm-b', name: 'gm-b', role: 'GM' },
    ]);

    // #when
    wire.post('late', commit([sheet('first', 'Первый', 1, 'late')]));
    wire.post('gm-b', commit([sheet('second', 'Второй', 1, 'gm-b')]));
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
    const room = createMemoryRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    await startClient(room, 'gm-b');

    const reads = spyOn(gm.platform.party, 'getPlayers');

    // #when
    wire.post('stranger', commit([sheet('lisa', 'Лиза', 1, 'stranger')]));
    await afterMarker(wire.post, 'gm-b', gm);

    // #then
    expect({ shown: shown(gm, 'sheet:lisa'), reads: reads.mock.calls.length }).toEqual({
      shown: undefined,
      reads: 1,
    });
  });

  test('drops a commit from a known player', async () => {
    // #given
    const room = createMemoryRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    await startClient(room, 'gm-b');
    await startClient(room, 'player-p', { role: 'PLAYER', playerId: 'lisa' });

    // #when
    wire.post('player-p', commit([sheet('lisa', 'Лиза', 1, 'player-p')]));
    await afterMarker(wire.post, 'gm-b', gm);

    // #then
    expect({ shown: shown(gm, 'sheet:lisa'), stored: stored(gm, 'sheet:lisa') }).toEqual({
      shown: undefined,
      stored: null,
    });
  });

  test.each([
    ['higher', { n: 1, a: 'x' }, ''],
    ['lower', INITIAL, 'mr1:mock-room:1:x:'],
  ])('drops a GM commit of a %s generation', async (_name, g, ownPrefix) => {
    // #given: a GM whose storage is at generation 1 has that generation as its own.
    const room = createMemoryRoom();
    const wire = listen(room);
    const prefix = ownPrefix === '' ? STORAGE_PREFIX : ownPrefix;
    const gm = await startClient(room, 'gm-a', { generationPrefix: prefix });

    await startClient(room, 'gm-b', { generationPrefix: prefix });

    const ownGeneration = ownPrefix === '' ? INITIAL : { n: 1, a: 'x' };

    // #when
    wire.post('gm-b', commit([sheet('lisa', 'Лиза', 1, 'gm-b')], g));
    wire.post('gm-b', commit([sheet('marker', 'Метка', 1, 'gm-b')], ownGeneration));
    await waitUntil(() => shown(gm, 'sheet:marker') !== undefined);

    // #then
    expect({ shown: shown(gm, 'sheet:lisa'), stored: stored(gm, 'sheet:lisa', prefix) }).toEqual({
      shown: undefined,
      stored: null,
    });
  });

  test('drops a message with a lower v and shows no notice', async () => {
    // #given
    const room = createMemoryRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    await startClient(room, 'gm-b');

    // #when
    wire.post('gm-b', commit([sheet('lisa', 'Лиза', 1, 'gm-b')], INITIAL, 0));
    await afterMarker(wire.post, 'gm-b', gm);

    // #then
    expect({ shown: shown(gm, 'sheet:lisa'), notices: gm.store.$notices.get() }).toEqual({
      shown: undefined,
      notices: [],
    });
  });

  test('drops a message with a higher v and keeps the new-version notice after later deltas', async () => {
    // #given
    const room = createMemoryRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    await startClient(room, 'gm-b');

    // #when
    wire.post('gm-b', { v: 2, t: 'commit', unread: 'a field of a newer build' });
    await waitUntil(() => gm.store.$notices.get().includes('new-version'));
    await afterMarker(wire.post, 'gm-b', gm);

    // #then
    expect({ notices: gm.store.$notices.get(), stored: storedKeys(gm).sort() }).toEqual({
      notices: ['new-version'],
      stored: [
        `${STORAGE_PREFIX}preset`,
        `${STORAGE_PREFIX}sheet:brok`,
        `${STORAGE_PREFIX}sheet:marker`,
      ],
    });
  });

  test.each<[string, JsonValue]>([
    ['a record that fails its schema', commit([{ ...sheet('lisa', 'Лиза'), c: 0 }])],
    ['an unknown type', { v: 1, g: INITIAL, t: 'shout', records: [] }],
    ['a type with no handler yet', { v: 1, g: INITIAL, t: 'ping' }],
    ['no envelope at all', 'commit'],
  ])('drops a message with the right v and %s, and throws nothing', async (_name, message) => {
    // #given
    const room = createMemoryRoom();
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
    const room = createMemoryRoom();
    const wire = listen(room);
    const gm = await startClient(room, 'gm-a');

    spyOn(console, 'error').mockImplementation(() => undefined);
    await startClient(room, 'gm-b');
    gm.platform.setFailingStorageOperations(['write']);

    // #when
    wire.post('gm-b', commit([sheet('lisa', 'Лиза', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'sheet:lisa') !== undefined);

    // #then
    expect({
      shown: shown(gm, 'sheet:lisa'),
      stored: stored(gm, 'sheet:lisa'),
      notices: gm.store.$notices.get(),
    }).toEqual({
      shown: sheet('lisa', 'Лиза', 1, 'gm-b'),
      stored: null,
      notices: ['local-save-failed'],
    });
  });

  test('that loses to the local one sends no delta and writes nothing', async () => {
    // #given: the GM holds Брок at c 5.
    const room = createMemoryRoom();
    const wire = listen(room);
    const local = sheet('brok', 'Брок', 5, 'seed');
    const gm = await startClient(room, 'gm-a', { seeded: [PRESET_RECORD, local] });

    await startClient(room, 'gm-b');

    const writes = spyOn(gm.backing, 'set');
    const deltasBefore = gm.deltas();

    // #when
    wire.post('gm-b', commit([sheet('brok', 'Старый', 2, 'gm-b')]));
    await afterMarker(wire.post, 'gm-b', gm);

    // #then: only the marker made a delta and a write.
    expect({
      shown: shown(gm, local.k),
      deltas: gm.deltas() - deltasBefore,
      writes: writes.mock.calls.map(([key]) => key),
    }).toEqual({ shown: local, deltas: 1, writes: [`${STORAGE_PREFIX}sheet:marker`] });
  });
});

describe('GM whose storage could not be read', () => {
  test('applies its own edit and sends no commit', async () => {
    // #given
    const room = createMemoryRoom();
    const wire = listen(room);

    spyOn(console, 'error').mockImplementation(() => undefined);

    const gm = await startClient(room, 'gm-a', { failingStorage: ['list'], seeded: [] });

    // #when
    send(gm, { type: 'sheet-create', sheetId: 'lisa', kind: 'pc', name: 'Лиза' });
    await waitUntil(() => shown(gm, 'sheet:lisa') !== undefined);

    // A commit would sit in the queue ahead of the rename's delta.
    send(gm, { type: 'sheet-rename', sheetId: 'lisa', name: 'Лиза Смелая' });
    await waitUntil(() => shown(gm, 'sheet:lisa')?.c === 2);

    // #then
    expect(wire.heard).toEqual([]);
  });
});

describe('remote record too large for one message', () => {
  test('is dropped, and the other records of its commit still apply', async () => {
    // #given: the record fits the commit, but not a window message with its envelope reserve.
    const room = createMemoryRoom();
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
    wire.post('gm-b', commit([huge, sheet('lisa', 'Лиза', 1, 'gm-b')]));
    await waitUntil(() => shown(gm, 'sheet:lisa') !== undefined);

    // #then
    expect({ shown: shown(gm, huge.k), stored: stored(gm, huge.k) }).toEqual({
      shown: undefined,
      stored: null,
    });
  });
});

describe('player client', () => {
  test.each<Command>([
    { type: 'sheet-create', sheetId: 'lisa', kind: 'pc', name: 'Лиза' },
    { type: 'sheet-rename', sheetId: 'brok', name: 'Брок Смелый' },
    { type: 'sheet-delete', sheetId: 'brok' },
    {
      type: 'preset-upload',
      data: encodePreset(PRESET),
      expectedCount: 0,
      expectedDigest: '811c9dc5',
    },
    patch(ROW_STR, 'str', 12),
    { type: 'repeat-row-add', sheetId: 'brok', sectionId: 'attack', instanceId: 'i1' },
    { type: 'repeat-row-delete', sheetId: 'brok', sectionId: 'attack', instanceId: 'i1' },
  ])('refuses %o as not allowed and changes nothing', async (command) => {
    // #given: the player holds Брок and the preset from a GM commit.
    const room = createMemoryRoom();
    const wire = listen(room);
    const player = await startClient(room, 'player-p', { role: 'PLAYER', seeded: [] });

    await startClient(room, 'gm-a');
    wire.post('gm-a', commit([PRESET_RECORD, BROK]));
    await waitUntil(() => shown(player, BROK.k) !== undefined);
    // The player heard gm-a as a GM return and caught up; its end sends a delta of its own.
    await waitUntil(() => player.store.$sync.get().state === 'live');

    const before = [...player.store.$records.get().values()];
    const deltasBefore = player.deltas();
    const sent = player.window.sendCommand(command);

    // #when
    await waitUntil(() => sent.ok && player.store.$rejections.get().has(sent.value));

    // #then
    expect({
      reason: sent.ok ? player.store.$rejections.get().get(sent.value)?.reason : sent.error,
      records: [...player.store.$records.get().values()],
      deltas: player.deltas() - deltasBefore,
      heard: commitsFrom(wire.heard, 'player-p'),
    }).toEqual({ reason: 'not-allowed', records: before, deltas: 0, heard: [] });
  });

  test('merges a GM commit into its replica and persists nothing', async () => {
    // #given
    const room = createMemoryRoom();
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, 'player-p', { role: 'PLAYER', seeded: [] });

    // #when
    send(gm, { type: 'sheet-create', sheetId: 'lisa', kind: 'pc', name: 'Лиза' });

    // #then
    await waitUntil(() => shown(player, 'sheet:lisa') !== undefined);

    expect({ shown: shown(player, 'sheet:lisa'), stored: storedKeys(player) }).toEqual({
      shown: { k: 'sheet:lisa', d: { kind: 'pc', name: 'Лиза', order: 1 }, c: 1, a: 'gm-a' },
      stored: [],
    });
  });
});
