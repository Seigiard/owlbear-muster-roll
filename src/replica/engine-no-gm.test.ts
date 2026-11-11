import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { deflateSync, strToU8 } from 'fflate';

import type { JsonObject, JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import { encodeStateRecords } from '@/core/state-records';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { RoomCopyStatus, SyncState } from '@/core/ui-messages';
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
  // Short, so a player alone in the room is live soon.
  catchUpTimeoutMs: 100,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 5,
  // Far past any test, unless a test wants the link to drop.
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

// The key of the 2.5 spec, written out by hand.
const KEY = 'app.muster-roll/snapshot';

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const INITIAL: Generation = { n: 0, a: '' };
const GHOST = 'ghost-gm';
const PLAYER = 'player-p';

const PRESET: Preset = {
  v: 1,
  character: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK = sheet('brok', 'Брок');
const MIRA = sheet('mira', 'Мира');
const BROK_STR: VersionedRecord = { k: 'row:brok:str', d: { str: 12 }, c: 1, a: 'seed' };

const GOBLIN: VersionedRecord = {
  k: 'sheet:gob',
  d: { kind: 'npc', name: 'Гоблин', order: 1 },
  c: 1,
  a: 'seed',
};

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
  untilLive?: boolean;
  platform?: (platform: MockPlatform) => MockPlatform;
};

type Client = {
  connectionId: string;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
};

type Heard = { from: string; data: JsonValue };

type Room = {
  room: MockRoom;
  heard: Heard[];
  post: (from: string, data: JsonValue) => void;
};

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

// The stored room copy as the 2.5 spec describes it, built by hand with fflate.
function copyValue(g: Generation, records: readonly VersionedRecord[], v = 1): JsonObject {
  const deflated = deflateSync(strToU8(JSON.stringify({ g, records })));

  return { v, data: Buffer.from(deflated).toString('base64') };
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

  return {
    room,
    heard,
    post: (from, data) => {
      observer.sendRemoteAs(from, SYNC_CHANNEL, data);
    },
  };
}

// A party member with no engine behind it. The test speaks for it.
function joinAs(room: Room, connectionId: string, role: PlayerRole): void {
  room.room.join({ id: connectionId, connectionId, name: connectionId, role });
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
    random: () => 0,
  });

  const store = createProjectionStore();

  const window = startReplicaClient(
    createMockPlatform(bus, backing, identity).broadcast,
    createSendQueue(platform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop);
  await waitUntil(() => store.$loaded.get());

  if (options.untilLive === true) {
    await waitUntil(() => store.$sync.get().state === 'live');
  }

  return { connectionId, engine, store, window };
}

// A player alone in the room: its start catch-up times out with nobody to answer.
async function playerAlone(room: Room, timing: Partial<Timing> = {}): Promise<Client> {
  return startClient(room, PLAYER, { role: 'PLAYER', seeded: [], timing, untilLive: true });
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

function keysOf(client: Client): string[] {
  return [...client.store.$records.get().keys()].sort();
}

function sync(client: Client): SyncState {
  return client.store.$sync.get();
}

function roomCopy(client: Client): RoomCopyStatus {
  return client.store.$roomCopy.get();
}

function typesFrom(room: Room, from: string): string[] {
  return room.heard.flatMap((message) =>
    message.from === from ? [String(Object(message.data).t)] : [],
  );
}

function requestsOf(room: Room, from: string): string[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === 'state-request'
      ? [String(Object(message.data).r)]
      : [],
  );
}

function lastRequest(room: Room, from: string): string {
  const nonce = requestsOf(room, from).at(-1);

  if (nonce === undefined) {
    throw new Error(`${from} has asked for no state`);
  }

  return nonce;
}

function stateMessage(r: string, records: readonly VersionedRecord[]): JsonValue {
  return { v: 1, g: INITIAL, t: 'state', r, i: 1, n: 1, records: encodeStateRecords(records) };
}

function commit(records: readonly VersionedRecord[]): JsonValue {
  return { v: 1, g: INITIAL, t: 'commit', records: [...records] };
}

function ping(): JsonValue {
  return { v: 1, g: INITIAL, t: 'ping' };
}

// What a player alone in the room shows once its start catch-up timed out.
const ALONE: Omit<SyncState, 'role'> = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: false,
  gmLink: 'offline',
};

describe('a player alone reads the room copy', () => {
  test('a readable copy: every character, no NPC, outcome read, still no GM', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK, BROK_STR, GOBLIN]) });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({ keys: keysOf(player), outcome: roomCopy(player).outcome, sync: sync(player) }).toEqual(
      {
        keys: ['preset', 'row:brok:str', 'sheet:brok'],
        outcome: 'read',
        sync: { ...ALONE, role: 'PLAYER' },
      },
    );
  });

  test('a readable copy with a preset and no character: outcome read, the preset only', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, GOBLIN]) });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({ keys: keysOf(player), outcome: roomCopy(player).outcome }).toEqual({
      keys: ['preset'],
      outcome: 'read',
    });
  });

  test('a readable copy with no preset: outcome read, no preset', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [BROK]) });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({
      preset: keysOf(player).includes('preset'),
      outcome: roomCopy(player).outcome,
    }).toEqual({ preset: false, outcome: 'read' });
  });

  test('no copy: outcome none, nothing held', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ 'other.extension/data': 'x' });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({ keys: keysOf(player), outcome: roomCopy(player).outcome }).toEqual({
      keys: [],
      outcome: 'none',
    });
  });

  test('a copy of a newer build: outcome newer, the new-version notice, nothing read', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK], 2) });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({
      keys: keysOf(player),
      outcome: roomCopy(player).outcome,
      notices: player.store.$notices.get(),
    }).toEqual({ keys: [], outcome: 'newer', notices: ['new-version'] });
  });

  test('a copy that does not decode: outcome unreadable, no notice for a player', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    room.room.setMetadata({ [KEY]: { v: 1, data: 'bm90IGRlZmxhdGU=' } });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({
      keys: keysOf(player),
      outcome: roomCopy(player).outcome,
      state: roomCopy(player).state,
      notices: player.store.$notices.get(),
    }).toEqual({ keys: [], outcome: 'unreadable', state: 'none', notices: [] });
  });

  test('before any catch-up read the outcome is unknown', async () => {
    // #given: the window's store before its first projection.
    const store = createProjectionStore();

    // #then
    expect(store.$roomCopy.get().outcome).toBeNull();
  });

  test('sends no commit and no edit: only state-request reaches the room, and edits are refused', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK]) });

    const player = await playerAlone(room, { gmLinkTimeoutMs: 60 });

    // #when: an edit attempt, and long enough for pings to go out.
    const sent = player.window.sendCommand({
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 3,
    });

    await waitUntil(() => sent.ok && player.store.$rejections.get().has(sent.value));
    await pause(100);

    // #then
    expect({
      reason: sent.ok ? player.store.$rejections.get().get(sent.value)?.reason : sent.error,
      sentTypes: [...new Set(typesFrom(room, PLAYER))].sort(),
      keys: keysOf(player),
    }).toEqual({
      reason: 'not-allowed',
      sentTypes: ['ping', 'state-request'],
      keys: ['preset', 'sheet:brok'],
    });
  });
});

describe('a GM returns', () => {
  test('the first GM-origin message while live sends a player to catching-up with a new r, and a complete answer brings current data', async () => {
    // #given: the player reads the copy with no GM.
    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK]) });

    const player = await playerAlone(room, { catchUpTimeoutMs: 400 });
    const first = lastRequest(room, PLAYER);

    joinAs(room, GHOST, 'GM');

    // #when
    room.post(GHOST, commit([MIRA]));
    await waitUntil(() => requestsOf(room, PLAYER).length === 2);

    const during = sync(player);
    const renamed = sheet('brok', 'Брок Смелый', 2, GHOST);

    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD, renamed, MIRA]));
    await waitUntil(() => sync(player).gmAnswered);

    // #then
    expect({
      fresh: lastRequest(room, PLAYER) !== first,
      during: { state: during.state, gmLink: during.gmLink },
      after: sync(player),
      brok: player.store.$records.get().get(renamed.k),
      keys: keysOf(player),
    }).toEqual({
      fresh: true,
      during: { state: 'catching-up', gmLink: 'online' },
      after: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
      brok: renamed,
      keys: ['preset', 'sheet:brok', 'sheet:mira'],
    });
  });

  test('a GM that speaks again after the link went offline starts another catch-up with a new r', async () => {
    // #given: the ghost was heard during the start catch-up, then went quiet past the timeout.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100, gmLinkTimeoutMs: 150 },
    });

    expect(sync(player).state).toBe('catching-up');
    room.post(GHOST, ping());
    await waitUntil(() => sync(player).gmLink === 'online');
    await waitUntil(() => sync(player).state === 'live');
    await waitUntil(() => sync(player).gmLink === 'offline');

    const before = requestsOf(room, PLAYER);

    // #when
    room.post(GHOST, commit([BROK]));
    await waitUntil(() => requestsOf(room, PLAYER).length === before.length + 1);

    // #then
    expect({
      fresh: !before.includes(lastRequest(room, PLAYER)),
      state: sync(player).state,
    }).toEqual({ fresh: true, state: 'catching-up' });
  });

  test('a GM heard during the start catch-up is asked again with the same r, and no new one', async () => {
    // #given: the start request went out before any GM was there.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 400 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 1);
    expect(sync(player).state).toBe('catching-up');

    // #when
    room.post(GHOST, commit([PRESET_RECORD]));
    await waitUntil(() => requestsOf(room, PLAYER).length === 2);
    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD, BROK]));
    await waitUntil(() => sync(player).state === 'live');
    // A third request would go out at once.
    await pause(50);

    // #then
    expect({
      nonces: new Set(requestsOf(room, PLAYER)).size,
      requests: requestsOf(room, PLAYER).length,
      sync: sync(player),
    }).toEqual({
      nonces: 1,
      requests: 2,
      sync: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });

  test('a GM joining during a player start catch-up answers it once its own catch-up ends', async () => {
    // #given: the player asks with nobody there, and a silent GM keeps the joining GM catching up.
    const room = openRoom();

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 1500 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 1);
    joinAs(room, GHOST, 'GM');

    // #when
    const renamed = sheet('brok', 'Брок Смелый', 2, 'gm-a');

    await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, renamed, MIRA],
      timing: { catchUpTimeoutMs: 200 },
    });

    await waitUntil(() => sync(player).gmAnswered);

    // #then
    expect({ keys: keysOf(player), brok: player.store.$records.get().get(renamed.k) }).toEqual({
      keys: ['preset', 'sheet:brok', 'sheet:mira'],
      brok: renamed,
    });
  });

  test('a player gm-return request that reaches a GM still in its start catch-up is answered once that ends', async () => {
    // #given: the player is live with no GM, and a silent GM keeps the joining GM catching up.
    const room = openRoom();
    const player = await playerAlone(room, { catchUpTimeoutMs: 1500 });

    joinAs(room, GHOST, 'GM');

    // #when
    const renamed = sheet('brok', 'Брок Смелый', 2, 'gm-a');

    await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, renamed, MIRA],
      timing: { catchUpTimeoutMs: 200 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 2);
    await waitUntil(() => sync(player).gmAnswered);

    // #then
    expect({
      keys: keysOf(player),
      brok: player.store.$records.get().get(renamed.k),
      sync: sync(player),
    }).toEqual({
      keys: ['preset', 'sheet:brok', 'sheet:mira'],
      brok: renamed,
      sync: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });

  test('a live GM that hears a new GM tab stays live and asks for nothing', async () => {
    // #given: gm-a is live and alone.
    const room = openRoom();
    const gmA = await startClient(room, 'gm-a', { untilLive: true });

    joinAs(room, GHOST, 'GM');

    // #when: the ghost asks for state, as a GM tab that just opened does.
    room.post(GHOST, { v: 1, g: INITIAL, t: 'state-request', r: 'ghost-r' });
    await waitUntil(() =>
      room.heard.some(
        (message) =>
          message.from === 'gm-a' &&
          Object(message.data).t === 'state' &&
          Object(message.data).r === 'ghost-r',
      ),
    );

    // #then
    expect({ requests: requestsOf(room, 'gm-a').length, sync: sync(gmA) }).toEqual({
      requests: 1,
      sync: { ...ALONE, gmLink: 'online', role: 'GM' },
    });
  });

  test('a GM-origin message while the link is online starts no catch-up', async () => {
    // #given: the player heard the ghost answer its start catch-up.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 400 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 1);
    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD]));
    await waitUntil(() => sync(player).state === 'live');

    // #when
    room.post(GHOST, commit([BROK]));
    await waitUntil(() => player.store.$records.get().has(BROK.k));
    await pause(50);

    // #then
    expect({ requests: requestsOf(room, PLAYER).length, state: sync(player).state }).toEqual({
      requests: 1,
      state: 'live',
    });
  });

  test('a complete answer after the timeout from a GM not heard before counts, and starts no catch-up', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const player = await playerAlone(room);

    // #when
    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD]));
    await waitUntil(() => sync(player).gmAnswered);
    await pause(50);

    // #then
    expect({ requests: requestsOf(room, PLAYER).length, sync: sync(player) }).toEqual({
      requests: 1,
      sync: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });
});

describe('outcomes with nothing to read', () => {
  test('a failed metadata read with no outcome yet shows the copy as unreadable', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    // #when
    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      untilLive: true,
      platform: (platform) => ({
        ...platform,
        metadata: {
          ...platform.metadata,
          getMetadata: () => Promise.reject(new Error('metadata read failed')),
        },
      }),
    });

    // #then
    expect(roomCopy(player).outcome).toBe('unreadable');
  });

  test('a copy of another generation that the player cannot take is unreadable', async () => {
    // #given: the player holds a record of its own generation from a GM commit.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 200 },
    });

    expect(sync(player).state).toBe('catching-up');
    room.post(GHOST, commit([BROK]));
    await waitUntil(() => player.store.$records.get().has(BROK.k));
    await waitUntil(() => sync(player).state === 'live');
    room.room.setMetadata({ [KEY]: copyValue({ n: 1, a: 'importer' }, [PRESET_RECORD, MIRA]) });

    // #when
    player.engine.catchUp();
    await waitUntil(() => roomCopy(player).outcome === 'unreadable');

    // #then
    expect(keysOf(player)).toEqual(['sheet:brok']);
  });
});
