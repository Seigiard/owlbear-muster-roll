import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import type { JsonObject, JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { Command, Notice, RoomCopyStatus } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine, type ReplicaEngine } from '@/replica/engine';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';

const TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 25,
  projectionIncompleteTimeoutMs: 80,
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 400,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 5,
  gmLinkTimeoutMs: 60000,
  // Far past any test: a test that wants the pause names a short one.
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
};

// Short enough to see the write, long enough to see that nothing was written before it.
const SHORT_PAUSE: Partial<Timing> = { snapshotPauseMs: 60, snapshotJitterMs: 0 };

// The key and the limit of the 2.5 spec, written out by hand.
const KEY = 'app.muster-roll/snapshot';
const LIMIT = 15500;

const STORAGE_PREFIX = 'mr2:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const INITIAL: Generation = { n: 0, a: '' };
const HIGHER: Generation = { n: 1, a: 'importer' };
const GHOST = 'ghost-gm';
const ROW_STR = { kind: 'row', rowId: 'str' } as const;

const PRESET: Preset = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      sections: [
        {
          rows: [
            [{ kind: 'field', type: 'text', id: 'name' }],
            [{ kind: 'field', type: 'number', id: 'str' }],
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK = sheet('brok');
const MIRA = sheet('mira', 1);
const GONE: VersionedRecord = { k: 'link:token-1', d: null, c: 4, a: 'seed' };
const ACL: VersionedRecord = { k: 'acl:brok:p1', d: { name: 'Лиза' }, c: 2, a: 'seed' };

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
  untilLive?: boolean;
  platform?: (platform: MockPlatform) => MockPlatform;
  random?: () => number;
};

type Client = {
  connectionId: string;
  platform: MockPlatform;
  backing: MockStorageBacking;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
};

type Heard = { from: string; data: JsonValue };

type Room = { room: MockRoom; heard: Heard[] };

// Calls to the metadata port, so a test can hold a read, drop a write or have it fail.
type MetadataGate = {
  writes: number;
  // Resolves the next read only when the test releases it.
  heldRead: Promise<void> | null;
  holdNextRead: () => { release: () => void };
  dropWrites: boolean;
  rejectWrites: boolean;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  mock.restore();

  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function sheet(id: string, order = 0, c = 1, a = 'seed'): VersionedRecord {
  return { k: `sheet:${id}`, d: { set: 'pc', order }, c, a };
}

// The stored room copy as the spec describes it, built by hand with fflate.
function copyValue(g: Generation, records: readonly VersionedRecord[], v = 2): JsonObject {
  const deflated = deflateSync(strToU8(JSON.stringify({ g, records })));

  return { v, data: Buffer.from(deflated).toString('base64') };
}

// The room copy read back by hand: its `v`, generation and records.
function roomCopyOf(room: Room): { v: JsonValue; g: JsonValue; records: JsonValue } | null {
  const value = room.room.getMetadata()[KEY];

  if (value === undefined) {
    return null;
  }

  const data = String(Object(value).data);
  const content = JSON.parse(strFromU8(inflateSync(new Uint8Array(Buffer.from(data, 'base64')))));

  return { v: Object(value).v, g: content.g, records: content.records };
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

function openRoom(): Room {
  const room = createMemoryRoom();

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
      heard.push({ from: event.connectionId, data: event.data });
    }),
  );

  return { room, heard };
}

function joinAs(room: Room, connectionId: string, role: PlayerRole): void {
  room.room.join({ id: connectionId, connectionId, name: connectionId, role });
}

function gated(gate: MetadataGate): (platform: MockPlatform) => MockPlatform {
  return (platform) => ({
    ...platform,
    metadata: {
      ...platform.metadata,
      getMetadata: async () => {
        const held = gate.heldRead;

        gate.heldRead = null;
        await held;

        return platform.metadata.getMetadata();
      },
      setMetadata: (update) => {
        gate.writes += 1;

        if (gate.rejectWrites) {
          return Promise.reject(new Error('metadata write failed'));
        }

        // Owlbear reports success for a write it drops.
        return gate.dropWrites ? Promise.resolve() : platform.metadata.setMetadata(update);
      },
    },
  });
}

function createGate(): MetadataGate {
  const gate: MetadataGate = {
    writes: 0,
    heldRead: null,
    dropWrites: false,
    rejectWrites: false,
    holdNextRead: () => {
      let release = (): void => undefined;

      gate.heldRead = new Promise((resolve) => {
        release = resolve;
      });

      return { release };
    },
  };

  return gate;
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const backing = createBacking();
  const bus = createMemoryBus();

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role: options.role ?? 'GM',
  };

  const created = createMockPlatform(bus, backing, identity);
  const platform = options.platform?.(created) ?? created;

  for (const record of options.seeded ?? [PRESET_RECORD, BROK]) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  created.joinParty();

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: { ...TIMING, ...options.timing },
    random: options.random ?? (() => 0),
  });

  const store = createProjectionStore();

  const window = startReplicaClient(
    createMockPlatform(bus, backing, identity).broadcast,
    createSendQueue(created.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop);
  await waitUntil(() => store.$loaded.get());

  if (options.untilLive === true) {
    await waitUntil(() => store.$sync.get().state === 'live');
  }

  return { connectionId, platform: created, backing, engine, store, window };
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

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function send(client: Client, command: Command): void {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }
}

function setStr(value: number): Command {
  return { type: 'field-patch', sheetId: 'brok', target: ROW_STR, fieldId: 'str', value };
}

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function stored(client: Client, key: string): VersionedRecord | null {
  const text = client.backing.get(`${STORAGE_PREFIX}${key}`);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
}

function notices(client: Client): readonly Notice[] {
  return client.store.$notices.get();
}

function roomCopyStatus(client: Client): RoomCopyStatus {
  return client.store.$roomCopy.get();
}

function requestsOf(room: Room, from: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === 'state-request' ? [message.data] : [],
  );
}

function metadataBytes(room: Room): number {
  return new TextEncoder().encode(JSON.stringify(room.room.getMetadata())).length;
}

// Lets every promise that is already settled run its handlers.
async function settle(): Promise<void> {
  await pause(0);
}

describe('writer triggers', () => {
  test('a live GM writes every record with its tombstones, versions and generation, sorted by key, once edits pause', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, MIRA, BROK, GONE, ACL],
      timing: SHORT_PAUSE,
      untilLive: true,
    });

    // #when
    send(client, setStr(14));
    await waitUntil(() => shown(client, 'row:brok:str') !== undefined);

    const beforePause = roomCopyOf(room);

    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect({ beforePause, copy: roomCopyOf(room) }).toEqual({
      beforePause: null,
      copy: {
        v: 2,
        g: INITIAL,
        records: [
          ACL,
          GONE,
          PRESET_RECORD,
          { k: 'row:brok:str', d: { str: 14 }, c: 1, a: 'gm-a' },
          BROK,
          MIRA,
        ],
      },
    });
  });

  test('each edit puts the write off by the whole pause again', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      timing: { snapshotPauseMs: 150, snapshotJitterMs: 0 },
      untilLive: true,
    });

    // #when
    send(client, setStr(1));
    await pause(100);
    send(client, setStr(2));
    await pause(100);

    const midway = roomCopyOf(room);

    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect({ midway, written: roomCopyOf(room)?.records }).toEqual({
      midway: null,
      written: [PRESET_RECORD, { k: 'row:brok:str', d: { str: 2 }, c: 2, a: 'gm-a' }, BROK],
    });
  });

  test('a live GM writes at once when its page becomes hidden, with no edit and no pause', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    client.engine.pageHidden();
    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect(roomCopyOf(room)?.records).toEqual([PRESET_RECORD, BROK]);
  });

  test('a player never writes the room copy', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'player-p', { role: 'PLAYER', untilLive: true });

    // #when
    client.engine.pageHidden();
    await pause(50);

    // #then
    expect(room.room.getMetadata()).toEqual({});
  });
});

describe('writer read and merge', () => {
  test('merges a copy of its generation before it writes, so records from the copy stay', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a', { untilLive: true });

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });

    // #when
    client.engine.pageHidden();
    await waitUntil(
      () => roomCopyOf(room)?.records !== undefined && shown(client, MIRA.k) !== undefined,
    );

    // #then
    expect({
      copy: roomCopyOf(room)?.records,
      shown: shown(client, MIRA.k),
      saved: stored(client, MIRA.k),
    }).toEqual({
      copy: [PRESET_RECORD, BROK, MIRA],
      shown: MIRA,
      saved: MIRA,
    });
  });

  test('a GM of a higher generation leaves a lower-generation copy unmerged and replaces it', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });

    // A new device: no stored record, so it takes the copy's generation at start.
    const client = await startClient(room, 'gm-a', { seeded: [], untilLive: true });

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });

    // #when
    client.engine.pageHidden();
    await waitUntil(() => JSON.stringify(roomCopyOf(room)?.g) === JSON.stringify(HIGHER));

    // #then
    expect({ copy: roomCopyOf(room), mira: shown(client, MIRA.k) ?? null }).toEqual({
      copy: { v: 2, g: HIGHER, records: [PRESET_RECORD, BROK] },
      mira: null,
    });
  });

  test('a copy of a higher generation is not overwritten: the GM adopts it in place of its own data', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a', { untilLive: true });
    const higher = copyValue(HIGHER, [PRESET_RECORD, MIRA]);

    joinAs(room, GHOST, 'GM');
    room.room.setMetadata({ [KEY]: higher });
    await waitUntil(() => shown(client, MIRA.k) !== undefined);

    // #when
    client.engine.pageHidden();
    await settle();

    // #then
    expect({
      copy: room.room.getMetadata()[KEY],
      mira: shown(client, MIRA.k),
      brok: shown(client, BROK.k) ?? null,
    }).toEqual({ copy: higher, mira: MIRA, brok: null });
  });

  test.each<[string, JsonValue, Notice[]]>([
    ['a higher v', { v: 3, data: 'from a newer build' }, ['room-copy-not-saved', 'new-version']],
    ['data that does not decode', { v: 2, data: 'bm90IGRlZmxhdGU=' }, ['room-copy-not-saved']],
  ])(
    'a copy with %s stops the write, keeps the copy and raises its notices',
    async (_name, value, expectedNotices) => {
      // #given
      spyOn(console, 'error').mockImplementation(() => undefined);

      const room = openRoom();
      const client = await startClient(room, 'gm-a', { untilLive: true });

      room.room.setMetadata({ [KEY]: value });

      // #when
      client.engine.pageHidden();
      await waitUntil(() => notices(client).includes('room-copy-not-saved'));

      // #then
      expect({
        copy: room.room.getMetadata()[KEY],
        status: roomCopyStatus(client).state,
        notices: notices(client),
      }).toEqual({ copy: value, status: 'failed', notices: expectedNotices });
    },
  );
});

// AD-12, CAP-31: no migration reads a copy of an older format. Only a wipe or an import replaces
// it.
describe('a room copy of an older format', () => {
  test('a GM that reads it at catch-up shows the older-format notice and outcome older, and its writes never replace it', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();
    const gate = createGate();
    const older = copyValue(INITIAL, [MIRA], 1);

    room.room.setMetadata({ [KEY]: older });

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: SHORT_PAUSE,
      untilLive: true,
    });

    // #when: an edit after the pause and a hidden page each try a write.
    send(client, setStr(14));
    client.engine.pageHidden();
    await waitUntil(() => shown(client, 'row:brok:str') !== undefined);
    await pause(150);

    // #then
    expect({
      writes: gate.writes,
      copy: room.room.getMetadata()[KEY],
      notices: notices(client),
      status: roomCopyStatus(client),
      mira: shown(client, MIRA.k) ?? null,
    }).toEqual({
      writes: 0,
      copy: older,
      notices: ['room-copy-older-format'],
      status: expect.objectContaining({ state: 'none', outcome: 'older' }),
      mira: null,
    });
  });

  test('a player with no GM gets outcome older and no older-format notice', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK], 1) });

    // #when
    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      untilLive: true,
    });

    // #then
    expect({
      outcome: roomCopyStatus(client).outcome,
      notices: notices(client),
      brok: shown(client, BROK.k) ?? null,
    }).toEqual({ outcome: 'older', notices: [], brok: null });
  });
});

describe('size check', () => {
  test('over the limit with all metadata counted, the write is skipped, the previous copy stays and the notice shows', async () => {
    // #given
    const room = openRoom();
    const previous = copyValue(INITIAL, [PRESET_RECORD]);

    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(15400), [KEY]: previous });

    const client = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));

    // #then
    expect({ copy: room.room.getMetadata()[KEY], status: roomCopyStatus(client).state }).toEqual({
      copy: previous,
      status: 'failed',
    });
  });
});

describe('interruption and rescheduling', () => {
  test('a resume between the read and the write stops the write, also once the GM is live again', async () => {
    // #given
    const room = openRoom();
    const gate = createGate();

    // Alone, so the resume's catch-up ends before the read returns: only the page change can stop
    // the write.
    const client = await startClient(room, 'gm-a', { platform: gated(gate), untilLive: true });
    const read = gate.holdNextRead();

    client.engine.pageHidden();
    await settle();

    // #when
    client.engine.catchUp();
    await waitUntil(() => requestsOf(room, 'gm-a').length === 2);
    await pause(20);
    read.release();
    await settle();

    // #then
    expect(gate.writes).toBe(0);
  });

  test('a hidden page during a pause write stops that write and writes on its own', async () => {
    // #given
    const room = openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), untilLive: true });
    const read = gate.holdNextRead();

    client.engine.pageHidden();
    await settle();

    // #when
    client.engine.pageHidden();
    read.release();
    await waitUntil(() => roomCopyOf(room) !== null);
    await settle();

    // #then
    expect(gate.writes).toBe(1);
  });

  test('a stopped write is written again once catch-up ends', async () => {
    // #given
    const room = openRoom();
    const gate = createGate();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { ...SHORT_PAUSE, catchUpTimeoutMs: 100 },
      untilLive: true,
    });

    const read = gate.holdNextRead();

    client.engine.pageHidden();
    await settle();
    client.engine.catchUp();
    read.release();
    await settle();

    const afterStop = gate.writes;

    // #when
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect({ afterStop, copy: roomCopyOf(room)?.records }).toEqual({
      afterStop: 0,
      copy: [PRESET_RECORD, BROK],
    });
  });

  test('a trigger during catch-up writes nothing then, and writes once catch-up ends', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { ...SHORT_PAUSE, catchUpTimeoutMs: 300 },
    });

    // #when
    client.engine.pageHidden();
    await pause(100);

    const during = { state: client.store.$sync.get().state, copy: roomCopyOf(room) };

    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect({ during, copy: roomCopyOf(room)?.records }).toEqual({
      during: { state: 'catching-up', copy: null },
      copy: [PRESET_RECORD, BROK],
    });
  });
});

describe('read-back', () => {
  test('a write the room dropped fails the read-back and raises the notice', async () => {
    // #given
    const room = openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), untilLive: true });

    gate.dropWrites = true;

    // #when
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));

    // #then
    expect({
      writes: gate.writes,
      copy: roomCopyOf(room),
      status: roomCopyStatus(client).state,
    }).toEqual({
      writes: 1,
      copy: null,
      status: 'failed',
    });
  });

  test('the next verified write clears the notice', async () => {
    // #given
    const room = openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), untilLive: true });

    gate.dropWrites = true;
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));
    gate.dropWrites = false;

    // #when
    client.engine.pageHidden();
    await waitUntil(() => !notices(client).includes('room-copy-not-saved'));

    // #then
    expect({ notices: notices(client), status: roomCopyStatus(client).state }).toEqual({
      notices: [],
      status: 'saved',
    });
  });
});

describe('catch-up merge', () => {
  test('a GM merges the copy before it broadcasts state-request on a later catch-up', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 50 },
      untilLive: true,
    });

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });

    // The stored records at the moment the second request goes out.
    let storedAtRequest: VersionedRecord | null | undefined;

    cleanups.push(
      createMockPlatform(createMemoryBus(), createBacking(), {
        room: room.room,
        connectionId: 'listener',
        playerId: 'listener',
        name: 'listener',
        role: 'PLAYER',
      }).broadcast.onMessage(SYNC_CHANNEL, (event) => {
        if (Object(event.data).t === 'state-request' && storedAtRequest === undefined) {
          storedAtRequest = stored(client, MIRA.k);
        }
      }),
    );

    // #when
    client.engine.catchUp();
    await waitUntil(() => storedAtRequest !== undefined);

    // #then
    expect(storedAtRequest).toEqual(MIRA);
  });

  test('a GM alone in the room merges the copy and leaves catching-up with no wait', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });

    // #when
    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });

    await waitUntil(() => client.store.$sync.get().state === 'live');

    // #then
    expect({ mira: shown(client, MIRA.k), brok: shown(client, BROK.k) }).toEqual({
      mira: MIRA,
      brok: BROK,
    });
  });

  test('a GM on a new device with no other GM gets the data from the copy and saves it', async () => {
    // #given
    const room = openRoom();

    const writer = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, BROK, MIRA],
      untilLive: true,
    });

    writer.engine.pageHidden();
    await waitUntil(() => roomCopyOf(room) !== null);
    writer.engine.stop();
    room.room.leave('gm-a');

    // #when
    const newDevice = await startClient(room, 'gm-b', { seeded: [], untilLive: true });

    // #then
    expect({
      shown: [shown(newDevice, BROK.k), shown(newDevice, MIRA.k), shown(newDevice, 'preset')],
      saved: stored(newDevice, MIRA.k),
    }).toEqual({ shown: [BROK, MIRA, PRESET_RECORD], saved: MIRA });
  });

  test('a player with no data takes the copy of a higher generation, merges it and asks in it', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');
    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });

    // #when
    const client = await startClient(room, 'player-p', { role: 'PLAYER', seeded: [] });

    await waitUntil(() => shown(client, BROK.k) !== undefined);

    // #then
    expect(requestsOf(room, 'player-p').map((request) => Object(request).g)).toEqual([HIGHER]);
  });

  test('a client that holds records of its generation does not merge a copy of a lower one', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });

    const client = await startClient(room, 'gm-a', { seeded: [], untilLive: true });

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });

    // #when
    client.engine.catchUp();
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await settle();

    // #then
    expect(shown(client, MIRA.k) ?? null).toBeNull();
  });
});

describe('room copy status in the projection', () => {
  test('with no copy yet it is none, with the limit less all room metadata free', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(1000) });

    // #when
    const client = await startClient(room, 'gm-a', { untilLive: true });

    // #then
    // {"other.extension/data":"xxx…"} is 1000 bytes of x and 27 of JSON around them.
    expect(roomCopyStatus(client)).toEqual({
      state: 'none',
      usedBytes: 0,
      freeBytes: LIMIT - 1027,
      outcome: 'none',
    });
  });

  test('after a verified write it is saved, with the copy key bytes used and the rest free', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    client.engine.pageHidden();
    await waitUntil(() => roomCopyStatus(client).state === 'saved');

    // #then
    const total = metadataBytes(room);

    // The copy is the only key: all its bytes but the two braces are its own.
    expect(roomCopyStatus(client)).toEqual({
      state: 'saved',
      usedBytes: total - 2,
      freeBytes: LIMIT - total,
      // The start catch-up found no copy; a write is not a catch-up read.
      outcome: 'none',
    });
  });
});

describe('review cases', () => {
  test('a start whose room copy read never ends still starts, and catch-up ends on the timeout', async () => {
    // #given
    const room = openRoom();
    const gate = createGate();

    gate.holdNextRead();

    // #when
    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { catchUpTimeoutMs: 100 },
      untilLive: true,
    });

    // #then
    expect(client.store.$sync.get()).toMatchObject({ state: 'live', firstCatchUpDone: true });
  });

  test('an edit queued during catch-up lands in the room copy after catch-up ends', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { ...SHORT_PAUSE, catchUpTimeoutMs: 200 },
    });

    // #when
    send(client, setStr(21));
    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect(roomCopyOf(room)?.records).toEqual([
      PRESET_RECORD,
      { k: 'row:brok:str', d: { str: 21 }, c: 1, a: 'gm-a' },
      BROK,
    ]);
  });

  test('the jitter puts the write off past the pause', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      timing: { snapshotPauseMs: 50, snapshotJitterMs: 100 },
      random: () => 1,
      untilLive: true,
    });

    // #when
    send(client, setStr(3));
    await pause(100);

    const early = roomCopyOf(room);

    await pause(100);

    // #then
    expect({ early, late: roomCopyOf(room) !== null }).toEqual({ early: null, late: true });
  });

  test('a GM that takes a higher generation from the copy saves under that generation', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });

    // #when
    const client = await startClient(room, 'gm-a', { seeded: [], untilLive: true });

    // #then
    expect(client.backing.get('mr2:mock-room:1:importer:sheet:brok')).toBe(JSON.stringify(BROK));
  });

  test('a demotion clears the not-saved notice', async () => {
    // #given
    const room = openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), untilLive: true });

    gate.dropWrites = true;
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));

    // #when
    client.platform.setRole('PLAYER');
    await waitUntil(() => client.store.$sync.get().role === 'PLAYER');

    // #then
    expect(notices(client)).toEqual([]);
  });

  test('a rejected write raises the notice and the failed state', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), untilLive: true });

    gate.rejectWrites = true;

    // #when
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));

    // #then
    expect(roomCopyStatus(client).state).toBe('failed');
  });

  test('a player with no GM reads the sheet set from the copy, and no value of a GM-only single sheet reaches its window', async () => {
    // #given
    const room = openRoom();
    const goblin: VersionedRecord = { k: 'row:npc:hp', d: { hp: 7 }, c: 1, a: 'seed' };

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK, goblin]) });

    // #when
    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      untilLive: true,
    });

    // #then
    expect({ brok: shown(client, BROK.k), goblin: shown(client, goblin.k) ?? null }).toEqual({
      brok: BROK,
      goblin: null,
    });
  });

  test('the writer adopts a copy of a higher generation it reads, and writes none of its own', async () => {
    // #given: the copy appears with no change event, as one another GM wrote while this one slept.
    const room = openRoom();
    const gate = createGate();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { catchUpTimeoutMs: 50 },
      untilLive: true,
    });

    const higher = copyValue(HIGHER, [PRESET_RECORD, MIRA]);
    const writes = gate.writes;

    room.room.setMetadata({ [KEY]: higher });

    // #when
    client.engine.pageHidden();
    await waitUntil(() => shown(client, MIRA.k) !== undefined);
    await waitUntil(() => client.store.$sync.get().state === 'live');

    // #then
    expect({
      writes: gate.writes - writes,
      copy: room.room.getMetadata()[KEY],
      brok: shown(client, BROK.k) ?? null,
    }).toEqual({ writes: 0, copy: higher, brok: null });
  });

  test('a GM that cannot read the copy at catch-up shows the failed state', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    room.room.setMetadata({ [KEY]: { v: 2, data: 'bm90IGRlZmxhdGU=' } });

    // #when
    const client = await startClient(room, 'gm-a', { untilLive: true });

    // #then
    expect(roomCopyStatus(client).state).toBe('failed');
  });

  test('another extension taking room metadata updates the free size, with no write', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(1000) });
    await waitUntil(() => roomCopyStatus(client).freeBytes !== LIMIT - 2);

    // #then
    // {"other.extension/data":"xxx…"} is 1000 bytes of x and 27 of JSON around them.
    expect({ status: roomCopyStatus(client), copy: roomCopyOf(room) }).toEqual({
      status: { state: 'none', usedBytes: 0, freeBytes: LIMIT - 1027, outcome: 'none' },
      copy: null,
    });
  });

  test('a commit merged from another GM schedules this GM to write the copy', async () => {
    // #given
    const room = openRoom();
    const a = await startClient(room, 'gm-a', { timing: SHORT_PAUSE, untilLive: true });
    const b = await startClient(room, 'gm-b', { untilLive: true });

    // #when
    send(b, setStr(9));
    await waitUntil(() => shown(a, 'row:brok:str') !== undefined);
    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect(roomCopyOf(room)?.records).toEqual([
      PRESET_RECORD,
      { k: 'row:brok:str', d: { str: 9 }, c: 1, a: 'gm-b' },
      BROK,
    ]);
  });
});

// TASK-37 AC 2: records stored before new ids got shorter, under 21-character nanoid ids.
describe('ids made before TASK-37', () => {
  test('records under 21-character ids load, merge, sync, take an edit and reach the room copy', async () => {
    // #given: the room copy and the writer's storage hold competing versions of two old-id keys.
    const room = openRoom();
    const sheetId = 'V1StGXR8_Z5jdHi6B-myT';
    const repKey = `rep:${sheetId}:attack:Uakgb_J5m9g-0JDMbcJqL`;
    const rowKey = `row:${sheetId}:str`;
    const storedSheet = sheet(sheetId);
    const copiedSheet = sheet(sheetId, 1, 4, 'other');
    const storedRep: VersionedRecord = { k: repKey, d: { order: 0, cells: {} }, c: 3, a: 'seed' };
    const copiedRep: VersionedRecord = { k: repKey, d: { order: 5, cells: {} }, c: 2, a: 'other' };
    const storedRow: VersionedRecord = { k: rowKey, d: { str: 5 }, c: 2, a: 'seed' };

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [copiedSheet, copiedRep]) });

    const writer = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, storedSheet, storedRep, storedRow],
      untilLive: true,
    });

    const newDevice = await startClient(room, 'gm-b', { seeded: [], untilLive: true });

    // #when
    send(newDevice, { type: 'field-patch', sheetId, target: ROW_STR, fieldId: 'str', value: 12 });
    await waitUntil(() => shown(writer, rowKey)?.c === 3);
    writer.engine.pageHidden();
    await waitUntil(() => JSON.stringify(roomCopyOf(room)).includes('"str":12'));

    // #then: the higher version of each key wins, and the edit raises the row's counter.
    const editedRow: VersionedRecord = { k: rowKey, d: { str: 12 }, c: 3, a: 'gm-b' };

    expect({
      synced: [shown(newDevice, copiedSheet.k), shown(newDevice, repKey), shown(newDevice, rowKey)],
      copy: roomCopyOf(room)?.records,
    }).toEqual({
      synced: [copiedSheet, storedRep, editedRow],
      copy: [PRESET_RECORD, storedRep, editedRow, copiedSheet],
    });
  });
});
