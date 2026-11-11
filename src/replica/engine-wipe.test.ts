import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import type { JsonObject, JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
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
  gmLinkTimeoutMs: 60000,
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 60,
  incompleteRequestMaxMs: 240,
  snapshotImportTimeoutMs: 60000,
};

// The strings and keys of the spec, written out by hand.
const DATA_REPLACED = 'Данные комнаты заменены';
const KEY = 'app.muster-roll/snapshot';
const ROOM_PREFIX = 'mr2:mock-room:';
const OLD_PREFIX = 'mr2:mock-room:0::';
const WAIT_LIMIT_MS = 3000;
const POLL_MS = 2;
const INITIAL: Generation = { n: 0, a: '' };
const WIPED: Generation = { n: 1, a: 'gm-a' };
const GHOST = 'ghost-gm';

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
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK: VersionedRecord = { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' };
const BROK_STR: VersionedRecord = { k: 'row:brok:str', d: { str: 10 }, c: 3, a: 'seed' };
const ACL: VersionedRecord = { k: 'acl:brok:player-p', d: { name: 'Лиза' }, c: 2, a: 'seed' };
const ROOM: readonly VersionedRecord[] = [PRESET_RECORD, BROK, BROK_STR, ACL];

// Keys of storage format 1 for this room and for another one, as an older build left them.
const OTHER_ROOM_KEY = 'mr1:other-room:0::preset';
const OTHER_ROOM_VALUE = '{"k":"preset","d":"x","c":1,"a":"seed"}';

const FORMAT_1 = {
  'mr1:mock-room:0::preset': '{"k":"preset","d":"x","c":1,"a":"seed"}',
  'mr1:mock-room:0::sheet:brok': '{"k":"sheet:brok","d":{"kind":"pc"},"c":1,"a":"seed"}',
  [OTHER_ROOM_KEY]: OTHER_ROOM_VALUE,
} satisfies Readonly<Record<string, string>>;

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  // Raw storage entries next to the seeded records, as another build or generation left them.
  stored?: Readonly<Record<string, string>>;
  // The storage of an earlier run, for a reload.
  backing?: MockStorageBacking;
  timing?: Partial<Timing>;
  untilLive?: boolean;
};

type Client = {
  platform: MockPlatform;
  backing: MockStorageBacking;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
  // Every message the engine sent its windows, in order.
  local: JsonValue[];
};

type Heard = { from: string; data: JsonValue };

type Room = {
  room: MockRoom;
  heard: Heard[];
  // What happened in the room, in order: `copy` for a room copy write, and each `t` heard.
  events: string[];
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  mock.restore();

  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

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
  const events: string[] = [];

  cleanups.push(
    observer.broadcast.onMessage(SYNC_CHANNEL, (event) => {
      heard.push({ from: event.connectionId, data: event.data });
      events.push(String(Object(event.data).t));
    }),
    room.onMetadataChange(() => {
      events.push('copy');
    }),
  );

  return { room, heard, events };
}

function joinAs(room: Room, connectionId: string, role: PlayerRole): void {
  room.room.join({ id: connectionId, connectionId, name: connectionId, role });
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const backing = options.backing ?? createBacking();
  const bus = createMemoryBus();

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role: options.role ?? 'GM',
  };

  const platform = createMockPlatform(bus, backing, identity);

  for (const record of options.seeded ?? ROOM) {
    backing.set(`${OLD_PREFIX}${record.k}`, JSON.stringify(record));
  }

  for (const [key, value] of Object.entries(options.stored ?? {})) {
    backing.set(key, value);
  }

  platform.joinParty();

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: { ...TIMING, ...options.timing },
    random: () => 0,
    dataReplaced: DATA_REPLACED,
  });

  const store = createProjectionStore();
  const windowPlatform = createMockPlatform(bus, backing, identity);
  const local: JsonValue[] = [];

  const window = startReplicaClient(
    windowPlatform.broadcast,
    createSendQueue(platform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(
    engine.stop,
    window.stop,
    windowPlatform.broadcast.onMessage(UI_CHANNEL, (event) => {
      local.push(event.data);
    }),
  );

  await waitUntil(() => store.$loaded.get());

  if (options.untilLive === true) {
    await waitUntil(() => store.$sync.get().state === 'live');
  }

  return { platform, backing, engine, store, window, local };
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

function send(client: Client, command: Command): string {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }

  return sent.value;
}

// The engine's answer to the wipe: `wiped`, or the rejection.
async function wipe(client: Client): Promise<JsonValue> {
  const id = send(client, { type: 'wipe' });

  await waitUntil(() => answerOf(client, id) !== null);

  return answerOf(client, id);
}

function answerOf(client: Client, id: string): JsonValue {
  const rejection = client.store.$rejections.get().get(id);

  if (rejection !== undefined) {
    return { ...rejection };
  }

  return (
    client.local.find((message) => Object(message).t === 'wiped' && Object(message).id === id) ??
    null
  );
}

function shownKeys(client: Client): string[] {
  return [...client.store.$records.get().keys()].sort();
}

function roomKeys(client: Client): string[] {
  return client.backing
    .keys()
    .filter((key) => key.startsWith('mr1:mock-room:') || key.startsWith(ROOM_PREFIX))
    .sort();
}

function heardOf(room: Room, from: string, t: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === t ? [message.data] : [],
  );
}

describe('a wipe', () => {
  test('empties the room in a new generation, writes its empty copy over an older-format one, then sends reset and answers', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD], 1) });

    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const eventsBefore = room.events.length;

    // #when
    const answer = await wipe(gm);

    await waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    // The window asks for the new engine's projection, which reaches it after the answer.
    await waitUntil(() => shownKeys(gm).length === 0);

    // #then
    expect({
      answer,
      shown: shownKeys(gm),
      copy: roomCopyOf(room),
      events: room.events.slice(eventsBefore).filter((one) => one === 'copy' || one === 'reset'),
      reset: heardOf(room, 'gm-a', 'reset'),
    }).toEqual({
      answer: { t: 'wiped', id: expect.any(String) },
      shown: [],
      copy: { v: 2, g: WIPED, records: [] },
      events: ['copy', 'reset'],
      reset: [{ v: 2, g: WIPED, t: 'reset' }],
    });
  });

  test('takes the older-format notice away', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD], 1) });

    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const before = gm.store.$notices.get();

    // #when
    await wipe(gm);
    // The delta with the notices reaches the window after the answer.
    await pause(30);

    // #then
    expect({ before, after: gm.store.$notices.get() }).toEqual({
      before: ['room-copy-older-format'],
      after: [],
    });
  });

  test("deletes this room's keys of every format and generation, and leaves other rooms' keys", async () => {
    // #given: keys of format 1, and the records of generation 0.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', { stored: FORMAT_1, untilLive: true });

    // #when
    await wipe(gm);
    await waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);

    // #then
    expect({ room: roomKeys(gm), other: gm.backing.get(OTHER_ROOM_KEY) }).toEqual({
      room: ['mr2:mock-room:1:gm-a:#generation'],
      other: OTHER_ROOM_VALUE,
    });
  });

  test('keeps its empty generation over a reload with no room copy', async () => {
    // #given: the copy is gone, so only the stored marker can name generation 1.
    const room = openRoom();
    const first = await startClient(room, 'gm-a', { untilLive: true });

    await wipe(first);
    await waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    first.engine.stop();
    room.room.setMetadata({ [KEY]: undefined });

    // #when
    const reloaded = await startClient(room, 'gm-a', {
      backing: first.backing,
      seeded: [],
      untilLive: true,
    });

    // The copy it writes names the generation it loaded.
    reloaded.engine.pageHidden();
    await waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect({ shown: shownKeys(reloaded), copy: roomCopyOf(room) }).toEqual({
      shown: [],
      copy: { v: 2, g: WIPED, records: [] },
    });
  });

  test('another GM adopts the empty room, drops its own older-format keys and is notified', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const other = await startClient(room, 'gm-b', { stored: FORMAT_1, untilLive: true });

    // #when
    await wipe(gm);
    await waitUntil(
      () =>
        shownKeys(other).length === 0 &&
        other.store.$sync.get().state === 'live' &&
        roomKeys(other).every((key) => !key.startsWith(OLD_PREFIX)),
    );

    // #then
    expect({
      keys: roomKeys(other),
      other: other.backing.get(OTHER_ROOM_KEY),
      notified: other.platform.shownNotifications(),
    }).toEqual({
      keys: ['mr2:mock-room:1:gm-a:#generation'],
      other: OTHER_ROOM_VALUE,
      notified: [DATA_REPLACED],
    });
  });

  test('a player sees an empty room', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      untilLive: true,
    });

    await waitUntil(() => shownKeys(player).includes(BROK.k));

    // #when
    await wipe(gm);
    await waitUntil(() => shownKeys(player).length === 0);

    // #then
    expect({
      shown: shownKeys(player),
      notified: player.platform.shownNotifications(),
    }).toEqual({ shown: [], notified: [DATA_REPLACED] });
  });

  test('is refused while the GM client is catching up', async () => {
    // #given: another GM that never answers keeps the catch-up open.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const gm = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 2000 } });

    // #when
    const answer = await wipe(gm);

    // #then
    expect({ reason: Object(answer).reason, shown: shownKeys(gm) }).toEqual({
      reason: 'catching-up',
      shown: [ACL.k, PRESET_RECORD.k, BROK_STR.k, BROK.k],
    });
  });

  test("is refused to a player's window", async () => {
    // #given
    const room = openRoom();

    await startClient(room, 'gm-a', { untilLive: true });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      untilLive: true,
    });

    // #when
    const answer = await wipe(player);

    // #then
    expect({ reason: Object(answer).reason, resets: heardOf(room, 'player-p', 'reset') }).toEqual({
      reason: 'not-allowed',
      resets: [],
    });
  });
});
