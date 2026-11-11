import { afterEach, describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import { encodeStateRecords } from '@/core/state-records';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { GmLink } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
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
  catchUpTimeoutMs: 150,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 5,
  // Far past any test, so a test that is not about pings sees none.
  gmLinkTimeoutMs: 60000,
  // Far past any test, so no room copy is written unless a test asks for one.
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
};

const WAIT_LIMIT_MS = 3000;
const POLL_MS = 2;
const INITIAL: Generation = { n: 0, a: '' };
const GHOST = 'ghost-gm';

const PRESET: Preset = {
  v: 1,
  character: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

const BROK: VersionedRecord = {
  k: 'sheet:brok',
  d: { kind: 'pc', name: 'Брок', order: 0 },
  c: 1,
  a: 'seed',
};

// The digest of PRESET_RECORD and BROK, from a separate FNV-1a implementation.
const SEEDED_DIGEST = 690848185;

const OTHER_DIGEST = 12345;

const LIZA: VersionedRecord = {
  k: 'sheet:liza',
  d: { kind: 'pc', name: 'Лиза', order: 1 },
  c: 1,
  a: 'seed',
};

// Drift counts one difference per sender in half this timeout.
const DRIFT_TIMING: Partial<Timing> = { gmLinkTimeoutMs: 200 };

// Past one counting window of DRIFT_TIMING.
const NEXT_WINDOW_MS = 130;

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  // The generation the seeded records are stored under.
  generation?: Generation;
  timing?: Partial<Timing>;
  untilLive?: boolean;
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
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

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
  const generation = options.generation ?? INITIAL;

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role: options.role ?? 'GM',
  };

  const platform = createMockPlatform(bus, backing, identity);

  for (const record of options.seeded ?? [PRESET_RECORD, BROK]) {
    backing.set(
      `mr1:mock-room:${generation.n}:${generation.a}:${record.k}`,
      JSON.stringify(record),
    );
  }

  platform.joinParty();

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: { ...TIMING, ...options.timing },
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

function gmLink(client: Client): GmLink {
  return client.store.$sync.get().gmLink;
}

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function keysOf(client: Client): string[] {
  return [...client.store.$records.get().keys()].sort();
}

function syncState(client: Client): string {
  return client.store.$sync.get().state;
}

function heardOf(room: Room, from: string, t: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === t ? [message.data] : [],
  );
}

function requestsOf(room: Room, from: string): string[] {
  return heardOf(room, from, 'state-request').map((message) => String(Object(message).r));
}

function lastRequest(room: Room, from: string): string {
  const nonce = requestsOf(room, from).at(-1);

  if (nonce === undefined) {
    throw new Error(`${from} has asked for no state`);
  }

  return nonce;
}

function alive(digest: number, g: Generation = INITIAL): JsonValue {
  return { v: 1, g, t: 'alive', digest };
}

function ping(g: Generation = INITIAL): JsonValue {
  return { v: 1, g, t: 'ping' };
}

function commit(records: VersionedRecord[], g: Generation = INITIAL): JsonValue {
  return { v: 1, g, t: 'commit', records };
}

function stateMessage(r: string, records: readonly VersionedRecord[]): JsonValue {
  return { v: 1, g: INITIAL, t: 'state', r, i: 1, n: 1, records: encodeStateRecords(records) };
}

// A GM client that is live and alone, then hears from a GM that only the test speaks for.
async function liveGmWithGhost(room: Room, timing: Partial<Timing> = {}): Promise<Client> {
  const client = await startClient(room, 'gm-b', {
    untilLive: true,
    timing: { ...DRIFT_TIMING, ...timing },
  });

  joinAs(room, GHOST, 'GM');

  return client;
}

// Messages are handled in order, and a live GM answers a ping at once, so once its answer is heard
// every message posted before the ping has been handled.
async function settled(room: Room, client: Client): Promise<number> {
  const before = heardOf(room, client.connectionId, 'alive').length;

  room.post(GHOST, ping());
  await waitUntil(() => heardOf(room, client.connectionId, 'alive').length > before);

  return requestsOf(room, client.connectionId).length;
}

// Two `alive` from `from` with `digest`, one counting window apart.
async function differTwice(room: Room, from: string, digest: number): Promise<void> {
  room.post(from, alive(digest));
  await pause(NEXT_WINDOW_MS);
  room.post(from, alive(digest));
}

describe('gmLink', () => {
  test('starts offline for any client', async () => {
    // #given
    const room = openRoom();

    // #when
    const client = await startClient(room, 'player-p', { role: 'PLAYER', seeded: [] });

    // #then
    expect(client.store.$sync.get()).toEqual({
      state: 'catching-up',
      firstCatchUpDone: false,
      gmAnswered: false,
      gmLink: 'offline',
      role: 'PLAYER',
    });
  });

  test('turns online when any admitted message from a GM sender arrives', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      untilLive: true,
    });

    const before = gmLink(client);

    // #when
    room.post(GHOST, ping());
    await waitUntil(() => gmLink(client) === 'online');

    // #then
    expect({ before, after: gmLink(client) }).toEqual({ before: 'offline', after: 'online' });
  });

  test('stays offline for a message from a player or one the gate drops', async () => {
    // #given: this client is of generation 1, so a GM commit of generation 0 is dropped.
    const room = openRoom();
    const generation = { n: 1, a: 'x' };
    const client = await startClient(room, 'gm-b', { untilLive: true, generation });

    joinAs(room, 'player-q', 'PLAYER');
    joinAs(room, GHOST, 'GM');

    // #when: the player's last ping is answered only after every message before it was handled.
    room.post('player-q', ping());
    room.post(GHOST, commit([BROK], INITIAL));
    room.post('stranger', alive(SEEDED_DIGEST, generation));
    room.post('player-q', ping());
    await waitUntil(() => heardOf(room, 'gm-b', 'alive').length === 2);

    // #then
    expect(gmLink(client)).toBe('offline');
  });

  test('turns offline when no GM-origin message arrives for the timeout', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { gmLinkTimeoutMs: 300 },
    });

    room.post(GHOST, stateMessage(lastRequest(room, 'player-p'), [PRESET_RECORD]));
    await waitUntil(() => gmLink(client) === 'online');

    const online = Date.now();

    // #when
    await waitUntil(() => gmLink(client) === 'offline');

    // #then
    const waited = Date.now() - online;

    expect({ late: waited < 250, early: waited >= 600 }).toEqual({ late: false, early: false });
  });

  test('no ping and no offline mark comes after stop', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { gmLinkTimeoutMs: 100 },
    });

    room.post(GHOST, ping());
    await waitUntil(() => gmLink(client) === 'online');

    const pingsAtStop = heardOf(room, 'player-p', 'ping').length;

    // #when
    client.engine.stop();
    await pause(250);

    // #then
    expect({ pings: heardOf(room, 'player-p', 'ping').length, link: gmLink(client) }).toEqual({
      pings: pingsAtStop,
      link: 'online',
    });
  });

  test('stays offline while the party lists a GM that sends nothing', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    // #when
    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { gmLinkTimeoutMs: 200 },
      untilLive: true,
    });

    await pause(250);

    // #then
    expect({
      link: gmLink(client),
      firstCatchUpDone: client.store.$sync.get().firstCatchUpDone,
    }).toEqual({ link: 'offline', firstCatchUpDone: true });
  });

  test('a GM tab that only answers pings keeps a player online', async () => {
    // #given: the GM's own timers never fire within the test, as in a hidden tab.
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { gmLinkTimeoutMs: 120 },
    });

    await waitUntil(() => gmLink(player) === 'online');

    const links: GmLink[] = [];

    // #when
    const deadline = Date.now() + 600;

    while (Date.now() < deadline) {
      links.push(gmLink(player));
      // oxlint-disable-next-line no-await-in-loop
      await pause(POLL_MS);
    }

    // #then
    expect({
      offline: links.filter((link) => link === 'offline').length,
      gmPings: heardOf(room, gm.connectionId, 'ping').length,
      playerPinged: heardOf(room, 'player-p', 'ping').length >= 4,
    }).toEqual({ offline: 0, gmPings: 0, playerPinged: true });
  });
});

describe('ping', () => {
  test('a client that hears no GM for half the timeout sends a ping, and repeats it', async () => {
    // #given
    const room = openRoom();
    const started = Date.now();

    // #when
    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { gmLinkTimeoutMs: 200 },
    });

    await waitUntil(() => heardOf(room, client.connectionId, 'ping').length === 2);

    // #then
    expect({
      pings: heardOf(room, client.connectionId, 'ping'),
      waited: Date.now() - started >= 200,
    }).toEqual({ pings: [ping(), ping()], waited: true });
  });

  test('a GM-origin message puts off the ping', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { gmLinkTimeoutMs: 200 },
    });

    // #when: the GM speaks every 50 ms, well inside the 100 ms before a ping.
    for (let round = 0; round < 8; round += 1) {
      room.post(GHOST, alive(0));
      // oxlint-disable-next-line no-await-in-loop
      await pause(50);
    }

    // #then
    expect(heardOf(room, client.connectionId, 'ping')).toEqual([]);
  });

  test('a live GM answers a ping at once with its generation and the digest of its records', async () => {
    // #given
    const room = openRoom();

    joinAs(room, 'player-p', 'PLAYER');

    const client = await startClient(room, 'gm-b', { untilLive: true });

    // #when
    room.post('player-p', ping());
    await waitUntil(() => heardOf(room, client.connectionId, 'alive').length === 1);

    // #then
    expect(heardOf(room, client.connectionId, 'alive')).toEqual([alive(SEEDED_DIGEST)]);
  });

  test('a GM answers a ping of another generation with its own generation', async () => {
    // #given
    const room = openRoom();

    joinAs(room, 'player-p', 'PLAYER');

    const client = await startClient(room, 'gm-b', { untilLive: true });

    // #when
    room.post('player-p', ping({ n: 5, a: 'z' }));
    await waitUntil(() => heardOf(room, client.connectionId, 'alive').length === 1);

    // #then
    expect(heardOf(room, client.connectionId, 'alive')).toEqual([alive(SEEDED_DIGEST, INITIAL)]);
  });

  test('a GM in catching-up does not answer a ping', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');
    joinAs(room, 'player-p', 'PLAYER');

    const client = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 400 } });

    // #when
    room.post('player-p', ping());
    await waitUntil(() => syncState(client) === 'live');

    // #then
    expect(heardOf(room, client.connectionId, 'alive')).toEqual([]);
  });

  test('a player does not answer a ping', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      untilLive: true,
    });

    // #when
    room.post(GHOST, ping());
    await waitUntil(() => gmLink(client) === 'online');
    await pause(30);

    // #then
    expect(heardOf(room, client.connectionId, 'alive')).toEqual([]);
  });
});

describe('drift', () => {
  test('a digest that differs in two windows from one GM enters catching-up', async () => {
    // #given
    const room = openRoom();
    const client = await liveGmWithGhost(room);

    // #when
    await differTwice(room, GHOST, OTHER_DIGEST);
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);

    // #then
    expect(syncState(client)).toBe('catching-up');
  });

  test('a burst of differing alive within one window starts no catch-up', async () => {
    // #given
    const room = openRoom();
    const client = await liveGmWithGhost(room);

    // #when
    room.post(GHOST, alive(OTHER_DIGEST));
    room.post(GHOST, alive(OTHER_DIGEST));
    room.post(GHOST, alive(OTHER_DIGEST));

    // #then
    expect({ requests: await settled(room, client), state: syncState(client) }).toEqual({
      requests: 1,
      state: 'live',
    });
  });

  test('a digest that differs once and then matches starts no catch-up', async () => {
    // #given
    const room = openRoom();
    const client = await liveGmWithGhost(room);

    // #when
    room.post(GHOST, alive(OTHER_DIGEST));
    await pause(NEXT_WINDOW_MS);
    room.post(GHOST, alive(SEEDED_DIGEST));
    await pause(NEXT_WINDOW_MS);
    room.post(GHOST, alive(OTHER_DIGEST));

    // #then
    expect({ requests: await settled(room, client), state: syncState(client) }).toEqual({
      requests: 1,
      state: 'live',
    });
  });

  test('differences from two GMs do not add up', async () => {
    // #given
    const room = openRoom();
    const client = await liveGmWithGhost(room);

    joinAs(room, 'gm-c', 'GM');

    // #when
    room.post(GHOST, alive(OTHER_DIGEST));
    await pause(NEXT_WINDOW_MS);
    room.post('gm-c', alive(OTHER_DIGEST));

    // #then
    expect({ requests: await settled(room, client), state: syncState(client) }).toEqual({
      requests: 1,
      state: 'live',
    });
  });

  test('differences do not carry across a catch-up', async () => {
    // #given
    const room = openRoom();
    const client = await liveGmWithGhost(room, { catchUpTimeoutMs: 150 });

    room.post(GHOST, alive(OTHER_DIGEST));
    await settled(room, client);

    // #when: a return starts a catch-up that times out, past one counting window.
    client.engine.catchUp();
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);
    await waitUntil(() => syncState(client) === 'live');
    room.post(GHOST, alive(OTHER_DIGEST));

    // #then
    expect({ requests: await settled(room, client), state: syncState(client) }).toEqual({
      requests: 2,
      state: 'live',
    });
  });

  test('an alive of another generation is not compared', async () => {
    // #given: this client is of generation 1, and the ghost speaks from generation 0.
    const room = openRoom();
    const generation = { n: 1, a: 'x' };

    const client = await startClient(room, 'gm-b', {
      untilLive: true,
      generation,
      timing: DRIFT_TIMING,
    });

    joinAs(room, GHOST, 'GM');

    // #when
    room.post(GHOST, alive(OTHER_DIGEST, INITIAL));
    await pause(NEXT_WINDOW_MS);
    room.post(GHOST, alive(OTHER_DIGEST, INITIAL));

    // #then
    const before = heardOf(room, 'gm-b', 'alive').length;

    room.post(GHOST, ping(generation));
    await waitUntil(() => heardOf(room, 'gm-b', 'alive').length > before);
    expect({ requests: requestsOf(room, 'gm-b').length, state: syncState(client) }).toEqual({
      requests: 1,
      state: 'live',
    });
  });

  test('after a complete answer from a GM, its unchanged digest is ignored until it changes', async () => {
    // #given: a lagging ghost drives a catch-up and answers it in full.
    const room = openRoom();
    const client = await liveGmWithGhost(room);

    await differTwice(room, GHOST, OTHER_DIGEST);
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), []));
    await waitUntil(() => syncState(client) === 'live');

    // #when
    await differTwice(room, GHOST, OTHER_DIGEST);

    const ignored = await settled(room, client);

    await differTwice(room, GHOST, OTHER_DIGEST + 1);
    await waitUntil(() => requestsOf(room, 'gm-b').length === 3);

    // #then
    expect({ ignored, state: syncState(client) }).toEqual({ ignored: 2, state: 'catching-up' });
  });

  test('drift from one GM answered in full by another ignores the drifting GM too', async () => {
    // #given: the ghost lags, and gm-y answers the catch-up its drift starts.
    const room = openRoom();
    const client = await liveGmWithGhost(room);

    joinAs(room, 'gm-y', 'GM');
    await differTwice(room, GHOST, OTHER_DIGEST);
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);
    room.post('gm-y', stateMessage(lastRequest(room, 'gm-b'), []));
    await waitUntil(() => syncState(client) === 'live');

    // #when
    await differTwice(room, GHOST, OTHER_DIGEST);

    // #then
    expect({ requests: await settled(room, client), state: syncState(client) }).toEqual({
      requests: 2,
      state: 'live',
    });
  });

  test('a catch-up that ends by timeout starts no ignore', async () => {
    // #given
    const room = openRoom();
    const client = await liveGmWithGhost(room, { catchUpTimeoutMs: 100 });

    await differTwice(room, GHOST, OTHER_DIGEST);
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);
    await waitUntil(() => syncState(client) === 'live');

    // #when
    await differTwice(room, GHOST, OTHER_DIGEST);
    await waitUntil(() => requestsOf(room, 'gm-b').length === 3);

    // #then
    expect(syncState(client)).toBe('catching-up');
  });

  test('a complete answer that comes late, while live, starts no ignore', async () => {
    // #given: the start catch-up timed out, and the ghost has said its digest once.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-b', {
      untilLive: true,
      timing: { ...DRIFT_TIMING, catchUpTimeoutMs: 100 },
    });

    room.post(GHOST, alive(OTHER_DIGEST));

    // #when
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), []));
    await pause(NEXT_WINDOW_MS);
    room.post(GHOST, alive(OTHER_DIGEST));
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);

    // #then
    expect(syncState(client)).toBe('catching-up');
  });

  test('a player compares digests too', async () => {
    // #given: the ghost answers the start catch-up, so its later messages are no GM return.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: DRIFT_TIMING,
    });

    await waitUntil(() => requestsOf(room, 'player-p').length === 1);
    room.post(GHOST, stateMessage(lastRequest(room, 'player-p'), []));
    await waitUntil(() => syncState(client) === 'live');

    // #when
    await differTwice(room, GHOST, OTHER_DIGEST);
    await waitUntil(() => requestsOf(room, 'player-p').length === 2);

    // #then
    expect(syncState(client)).toBe('catching-up');
  });

  test('two GM clients that drift from each other answer each other and converge', async () => {
    // #given: gm-b took gm-a's records at its start, and gm-a never got gm-b's own.
    const room = openRoom();

    const timing: Partial<Timing> = {
      ...DRIFT_TIMING,
      catchUpTimeoutMs: 300,
      // Each answer leaves after both clients have entered their drift catch-up.
      stateAnswerDelayMinMs: 50,
      stateAnswerDelayMaxMs: 50,
    };

    const a = await startClient(room, 'gm-a', { untilLive: true, timing });

    const b = await startClient(room, 'gm-b', {
      untilLive: true,
      timing,
      seeded: [PRESET_RECORD, LIZA],
    });

    joinAs(room, GHOST, 'GM');

    // #when: the ghost's pings make both answer, so each hears the other's digest at once.
    const deadline = Date.now() + WAIT_LIMIT_MS;

    while (shown(a, LIZA.k) === undefined && Date.now() < deadline) {
      room.post(GHOST, ping());
      // oxlint-disable-next-line no-await-in-loop
      await pause(40);
    }

    // #then
    expect({ a: keysOf(a), b: keysOf(b) }).toEqual({
      a: ['preset', 'sheet:brok', 'sheet:liza'],
      b: ['preset', 'sheet:brok', 'sheet:liza'],
    });
  });
});
