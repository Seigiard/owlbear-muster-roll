import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { deflateSync, strToU8 } from 'fflate';

import { deflateToBase64 } from '@/core/deflate';
import type { JsonObject } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { NOTHING_ERASED } from '@/core/preset-migrate';
import type { VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { Command } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
  type WindowSizeCall,
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
  stateAnswerDelayMaxMs: 0,
  // Far past any test, so no ping goes out and no GM goes offline.
  gmLinkTimeoutMs: 60000,
  // Far past any test, so no room copy is written.
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 60000,
  proposeResendMaxMs: 60000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const SNAPSHOT_KEY = 'app.muster-roll/snapshot';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const GENERATION: Generation = { n: 0, a: '' };

// The sizes of the 5.4 spec, written out by hand.
const DEFAULT: WindowSizeCall = { width: 600, height: 600 };
const WIDE: WindowSizeCall = { width: 900, height: 700 };

const PLAIN: Preset = {
  v: 1,
  character: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
};

const SIZED: Preset = { ...PLAIN, window: WIDE };

// The same size as SIZED, and a new section title.
const SIZED_RETITLED: Preset = {
  ...SIZED,
  character: { sections: [{ title: 'Сила', rows: PLAIN.character.sections[0]?.rows ?? [] }] },
};

type Client = {
  platform: MockPlatform;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
};

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  beforeStart?: (platform: MockPlatform) => void;
  timing?: Partial<Timing>;
  // False: the client is returned while its first catch-up may still run.
  untilLive?: boolean;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('the window size at start', () => {
  test('a GM that holds a preset with a size takes that size', async () => {
    // #when
    const gm = await startClient(createMemoryRoom(), 'gm-a', { seeded: [presetRecord(SIZED)] });

    // #then
    expect(gm.platform.actionSizes()).toEqual([WIDE]);
  });

  test('a GM that holds a preset with no size takes 600 by 600', async () => {
    // #when
    const gm = await startClient(createMemoryRoom(), 'gm-a', { seeded: [presetRecord(PLAIN)] });

    // #then
    expect(gm.platform.actionSizes()).toEqual([DEFAULT]);
  });

  test('a GM in a room with no preset takes 600 by 600', async () => {
    // #when
    const gm = await startClient(createMemoryRoom(), 'gm-a', { seeded: [] });

    // #then
    expect(gm.platform.actionSizes()).toEqual([DEFAULT]);
  });

  test('a player takes the size of the preset a GM sends, and no size before it', async () => {
    // #given
    const room = createMemoryRoom();
    await startClient(room, 'gm-a', { seeded: [presetRecord(SIZED)] });

    // #when
    const player = await startClient(room, 'player-a', { role: 'PLAYER' });
    await waitUntil(() => player.store.$records.get().has('preset'));

    // #then
    expect(player.platform.actionSizes()).toEqual([WIDE]);
  });

  test('a GM with no saved data takes the size of the preset another GM sends, and no size before it', async () => {
    // #given
    const room = createMemoryRoom();
    await startClient(room, 'gm-a', { seeded: [presetRecord(SIZED)] });

    // #when
    const second = await startClient(room, 'gm-b', { seeded: [] });

    // #then
    expect(second.platform.actionSizes()).toEqual([WIDE]);
  });
});

describe('the window size during the first catch-up', () => {
  test('a GM with a saved preset with a size has that size while its first catch-up runs', async () => {
    // #given: another GM that never answers keeps the catch-up open.
    const room = createMemoryRoom();
    room.join({ id: 'gm-ghost', connectionId: 'gm-ghost', name: 'gm-ghost', role: 'GM' });

    // #when
    const gm = await startClient(room, 'gm-a', {
      seeded: [presetRecord(SIZED)],
      timing: { catchUpTimeoutMs: 60000 },
      untilLive: false,
    });

    // #then
    expect({ state: gm.store.$sync.get().state, sizes: gm.platform.actionSizes() }).toEqual({
      state: 'catching-up',
      sizes: [WIDE],
    });
  });

  test('a player in a room with no preset gets one 600 by 600, and only when its first catch-up ends', async () => {
    // #given: no GM answers, so the catch-up ends at its timeout.
    const player = await startClient(createMemoryRoom(), 'player-a', {
      role: 'PLAYER',
      untilLive: false,
    });

    const during = player.platform.actionSizes();

    // #when
    await waitUntil(() => player.store.$sync.get().state === 'live');
    await pause(20);

    // #then
    expect({ during, after: player.platform.actionSizes() }).toEqual({
      during: [],
      after: [DEFAULT],
    });
  });
});

describe('the window size after a preset change', () => {
  test('an upload with a new size resizes the GM and the player', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(PLAIN));

    // #when
    send(gm, upload(SIZED));
    await waitUntil(() => player.platform.actionSizes().length === 2);

    // #then
    expect({
      gm: gm.platform.actionSizes(),
      player: player.platform.actionSizes(),
    }).toEqual({ gm: [DEFAULT, WIDE], player: [DEFAULT, WIDE] });
  });

  test('an upload with no size takes every client back to 600 by 600', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(SIZED));

    // #when
    send(gm, upload(PLAIN));
    await waitUntil(() => player.platform.actionSizes().length === 2);

    // #then
    expect({
      gm: gm.platform.actionSizes(),
      player: player.platform.actionSizes(),
    }).toEqual({ gm: [WIDE, DEFAULT], player: [WIDE, DEFAULT] });
  });

  test('an upload with the same size asks for no size again', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(SIZED));
    const before = gm.store.$records.get().get('preset');

    // #when
    send(gm, upload(SIZED_RETITLED));
    await waitUntil(() => player.store.$records.get().get('preset')?.c === (before?.c ?? 0) + 1);

    // #then
    expect({
      gm: gm.platform.actionSizes(),
      player: player.platform.actionSizes(),
    }).toEqual({ gm: [WIDE], player: [WIDE] });
  });

  test('a preset this build cannot read keeps the current size', async () => {
    // #given
    const room = createMemoryRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [presetRecord(SIZED)] });

    const newer: VersionedRecord = {
      k: 'preset',
      d: deflateToBase64(JSON.stringify({ v: 2, layout: 'unknown' })),
      c: 2,
      a: 'gm-x',
    };

    room.join({ id: 'gm-x', connectionId: 'gm-x', name: 'gm-x', role: 'GM' });

    // #when
    room.postRemote(SYNC_CHANNEL, { v: 1, g: GENERATION, t: 'commit', records: [newer] }, 'gm-x');
    await waitUntil(() => gm.store.$records.get().get('preset')?.c === 2);
    await pause(20);

    // #then
    expect(gm.platform.actionSizes()).toEqual([WIDE]);
  });

  test('a stopped engine asks for no size for records that come later', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(PLAIN));

    player.engine.stop();

    // #when
    send(gm, upload(SIZED));
    await waitUntil(() => gm.platform.actionSizes().length === 2);
    await pause(20);

    // #then
    expect(player.platform.actionSizes()).toEqual([DEFAULT]);
  });

  test('a GM that adopts an imported generation takes the size of its preset', async () => {
    // #given
    const room = createMemoryRoom();
    const gm = await startClient(room, 'gm-b', { seeded: [presetRecord(PLAIN)] });
    const generation: Generation = { n: 1, a: 'gm-a' };
    const imported: VersionedRecord = { k: 'preset', d: encodePreset(SIZED), c: 1, a: 'gm-a' };

    // #when
    room.setMetadata({ [SNAPSHOT_KEY]: copyValue(generation, [imported]) });
    await waitUntil(() => gm.platform.actionSizes().length === 2);

    // #then
    expect(gm.platform.actionSizes()).toEqual([DEFAULT, WIDE]);
  });

  test('a size that failed is logged and asked for again on the next replica change', async () => {
    // #given
    const logged = spyOn(console, 'error').mockImplementation(() => {});
    cleanups.push(() => logged.mockRestore());

    const gm = await startClient(createMemoryRoom(), 'gm-a', {
      seeded: [presetRecord(SIZED)],
      beforeStart: (platform) => platform.failNextActionSize(),
    });

    const failures = logged.mock.calls.filter(
      ([message]) => message === 'Muster Roll could not size its window',
    ).length;

    // #when
    send(gm, { type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
    await waitUntil(() => gm.store.$records.get().has('sheet:brok'));

    // #then
    expect({ failures, sizes: gm.platform.actionSizes() }).toEqual({
      failures: 1,
      sizes: [WIDE, WIDE],
    });
  });
});

async function gmAndPlayer(preset: VersionedRecord): Promise<{ gm: Client; player: Client }> {
  const room = createMemoryRoom();
  const gm = await startClient(room, 'gm-a', { seeded: [preset] });
  const player = await startClient(room, 'player-a', { role: 'PLAYER' });

  await waitUntil(() => player.platform.actionSizes().length === 1);

  return { gm, player };
}

async function startClient(
  room: MockRoom,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const backing = createBacking();
  const bus = createMemoryBus();

  const identity = {
    room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role: options.role ?? 'GM',
  };

  const platform = createMockPlatform(bus, backing, identity);

  for (const record of options.seeded ?? []) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  platform.joinParty();
  options.beforeStart?.(platform);

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
  await waitUntil(
    () =>
      store.$loaded.get() && (options.untilLive === false || store.$sync.get().state === 'live'),
  );

  return { platform, engine, store, window };
}

function presetRecord(preset: Preset): VersionedRecord {
  return { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' };
}

// An upload that erases nothing, as every preset of this file keeps the same fields.
function upload(preset: Preset): Command {
  return {
    type: 'preset-upload',
    data: encodePreset(preset),
    expectedCount: 0,
    expectedDigest: NOTHING_ERASED,
  };
}

function copyValue(g: Generation, records: readonly VersionedRecord[]): JsonObject {
  const deflated = deflateSync(strToU8(JSON.stringify({ g, records })));

  return { v: 1, data: Buffer.from(deflated).toString('base64') };
}

function send(client: Client, command: Command): void {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('the condition never became true');
    }

    // Polling is the point here: each round has to let the paced queues run.
    // oxlint-disable-next-line no-await-in-loop
    await pause(POLL_MS);
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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
