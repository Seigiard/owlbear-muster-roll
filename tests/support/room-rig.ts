import { afterEach, mock } from 'bun:test';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { FORMAT_VERSION } from '@/core/format-version';
import type { JsonObject, JsonValue } from '@/core/json';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import {
  parseEngineMessage,
  type Command,
  type CommandRejectedMessage,
  type SyncState,
} from '@/core/ui-messages';
import type { ReplicaEngineOptions, ReplicaEngine } from '@/replica/engine';
import {
  createMemoryBacking,
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import { createSendQueue, type Wait } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';

export { createProjectionStore, startReplicaClient };

const RIG_ROOM_ID = 'mock-room';
const RIG_FORMAT = FORMAT_VERSION;
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;

const roomCopyContentSchema = z.object({
  g: z.json().optional(),
  records: z.json().optional(),
});

// These values keep ordinary engine tests fast while leaving timers unrelated to the test idle.
// The two long values are deliberately longer than any ordinary test scenario.
export const RIG_TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 25,
  projectionIncompleteTimeoutMs: 80,
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 400,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 0,
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
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
  wipeTimeoutMs: 60000,
  accessChangeTimeoutMs: 5000,
  linkSetTimeoutMs: 5000,
  rollTimeoutMs: 90000,
  commandTimeoutMs: 15000,
};

export type RigOutcome =
  | { kind: 'answered'; answer: JsonValue | undefined }
  | { kind: 'refused'; rejection: CommandRejectedMessage }
  | { kind: 'timed-out' };

export type RigHeard = { from: string; data: JsonValue; at: number };

export type RigRoom = {
  room: MockRoom;
  heard: RigHeard[];
  events: string[];
  post: (from: string, data: JsonValue) => void;
  join: (id: string, role: PlayerRole, name?: string) => void;
};

export type RigPage = {
  platform: MockPlatform;
  store: ProjectionStore;
  window: ReplicaClient;
  stop: () => void;
};

export type RigClient = {
  connectionId: string;
  playerId: string;
  platform: MockPlatform;
  backing: MockStorageBacking;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
  startEngine: (options?: RigStartOptions) => Promise<void>;
  local: JsonValue[];
  mintedIds: string[];
  commandOutcomes: Map<string, RigOutcome>;
  writes: string[];
  seeded: ReadonlySet<string>;
  newPage: () => MockPlatform;
  openWindow: (options?: RigPageOptions) => RigPage;
  stop: () => void;
};

export type RigPageOptions = {
  newId?: () => string;
  queueTiming?: Partial<Timing>;
  beforeStart?: (platform: MockPlatform) => void;
};

export type RigStartOptions = {
  engine?: Omit<ReplicaEngineOptions, 'timing'>;
};

export type RigClientOptions = {
  role?: PlayerRole;
  name?: string;
  playerId?: string;
  seeded?: readonly VersionedRecord[];
  generation?: GenerationLike;
  entries?: Readonly<Record<string, string>>;
  backing?: MockStorageBacking;
  timing?: Partial<Timing>;
  engine?: Omit<ReplicaEngineOptions, 'timing'>;
  platform?: (platform: MockPlatform) => MockPlatform;
  sendWait?: Wait;
  until?: 'loaded' | 'live';
};

export type RoomRigOptions = {
  timing?: Partial<Timing>;
  waitLimitMs?: number;
  seeded?: readonly VersionedRecord[];
  generation?: GenerationLike;
  until?: 'loaded' | 'live';
  engine?: Omit<ReplicaEngineOptions, 'timing'>;
};

export type RoomRig = {
  openRoom: (scene?: string[] | { itemIds: string[]; ready?: boolean }) => RigRoom;
  createClient: (
    room: RigRoom | MockRoom,
    connectionId: string,
    options?: RigClientOptions,
  ) => RigClient;
  startClient: (
    room: RigRoom | MockRoom,
    connectionId: string,
    options?: RigClientOptions,
  ) => Promise<RigClient>;
  cleanup: (cleanup: () => void) => void;
  waitUntil: (condition: () => boolean) => Promise<void>;
  pause: (milliseconds: number) => Promise<void>;
};

type GenerationLike = { n: number; a: string };

export function createRoomRig(options: RoomRigOptions = {}): RoomRig {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }

    mock.restore();
  });

  const rigTiming = { ...RIG_TIMING, ...options.timing };
  const waitLimitMs = options.waitLimitMs ?? WAIT_LIMIT_MS;
  const rigEngine = options.engine ?? {};

  function openRoom(scene?: string[] | { itemIds: string[]; ready?: boolean }): RigRoom {
    const room = createMemoryRoom();

    const heard: RigHeard[] = [];

    const events: string[] = [];

    cleanups.push(
      room.onRemote(SYNC_CHANNEL, 'observer', (event) => {
        heard.push({ from: event.connectionId, data: event.data, at: Date.now() });
        events.push(String(Object(event.data).t));
      }),
      room.onMetadataChange(() => {
        events.push('copy');
      }),
    );

    if (scene !== undefined) {
      const itemIds = Array.isArray(scene) ? scene : scene.itemIds;
      room.setScene(
        {
          ready: Array.isArray(scene) ? true : (scene.ready ?? true),
          itemIds: [...itemIds],
          labels: {},
        },
        'items',
      );
    }

    return {
      room,
      heard,
      events,
      post: (from, data) => {
        room.postRemote(SYNC_CHANNEL, data, from);
      },
      join: (id, role, name = id) => {
        room.join({ id, connectionId: id, name, role });
      },
    };
  }

  function createClient(
    roomOrRig: RigRoom | MockRoom,
    connectionId: string,
    clientOptions: RigClientOptions = {},
  ): RigClient {
    const room = roomOf(roomOrRig);
    const bus = createMemoryBus();
    const backing = clientOptions.backing ?? createMemoryBacking();
    const role = clientOptions.role ?? 'GM';
    const playerId = clientOptions.playerId ?? connectionId;

    const identity = {
      room,
      connectionId,
      playerId,
      name: clientOptions.name ?? connectionId,
      role,
    };

    const seeded = clientOptions.seeded ?? options.seeded ?? [];
    const seededKeys = new Set(seeded.map((record) => record.k));

    const writes: string[] = [];

    const trackedBacking = trackBacking(backing, writes);

    const local: JsonValue[] = [];
    const mintedIds: string[] = [];
    const commandOutcomes = new Map<string, RigOutcome>();
    const created = createMockPlatform(bus, trackedBacking, identity);
    const effectiveTiming = { ...rigTiming, ...clientOptions.timing };

    for (const record of seeded) {
      backing.set(
        storageKey(record.k, clientOptions.generation ?? options.generation),
        JSON.stringify(record),
      );
    }

    for (const [key, value] of Object.entries(clientOptions.entries ?? {})) {
      trackedBacking.set(key, value);
    }

    bus.subscribe('app.muster-roll/ui', (event) => {
      local.push(event.data);
    });

    created.joinParty();

    let engine: ReplicaEngine | null = null;
    let store: ProjectionStore | null = null;
    let window: ReplicaClient | null = null;
    const pages: RigPage[] = [];

    async function startEngine(startOptions: RigStartOptions = {}): Promise<void> {
      if (engine !== null) {
        engine.stop();
        engine = null;
      }

      const enginePlatform = clientOptions.platform?.(created) ?? created;

      const engineOptions: ReplicaEngineOptions = {
        ...rigEngine,
        ...clientOptions.engine,
        ...startOptions.engine,
        timing: effectiveTiming,
      };

      engine = await startReplicaEngine(
        enginePlatform,
        createSendQueue(enginePlatform.broadcast, effectiveTiming, clientOptions.sendWait),
        engineOptions,
      );

      cleanups.push(engine.stop);
    }

    function openWindow(pageOptions: RigPageOptions = {}): RigPage {
      const pagePlatform = createMockPlatform(bus, trackedBacking, identity);
      const pageStore = createProjectionStore();
      const pageTiming = { ...effectiveTiming, ...pageOptions.queueTiming };
      const makeId = pageOptions.newId ?? nanoid;
      pageOptions.beforeStart?.(pagePlatform);

      const pageWindow = startReplicaClient(
        pagePlatform.broadcast,
        createSendQueue(pagePlatform.broadcast, pageTiming),
        pageStore,
        effectiveTiming,
        () => {
          const id = makeId();

          mintedIds.push(id);

          return id;
        },
      );

      const page: RigPage = {
        platform: pagePlatform,
        store: pageStore,
        window: pageWindow,
        stop: pageWindow.stop,
      };

      pages.push(page);
      cleanups.push(pageWindow.stop);

      if (store === null || window === null) {
        store = pageStore;
        window = pageWindow;
      }

      return page;
    }

    function stop(): void {
      for (const page of pages.splice(0)) {
        page.stop();
      }

      engine?.stop();
      engine = null;
    }

    return {
      connectionId,
      playerId,
      platform: created,
      backing: trackedBacking,
      get engine() {
        if (engine === null) {
          throw new Error('the rig engine has not started');
        }

        return engine;
      },
      get store() {
        if (store === null) {
          throw new Error('the rig window has not started');
        }

        return store;
      },
      get window() {
        if (window === null) {
          throw new Error('the rig window has not started');
        }

        return window;
      },
      startEngine,
      local,
      mintedIds,
      commandOutcomes,
      writes,
      seeded: seededKeys,
      newPage: () => createMockPlatform(bus, trackedBacking, identity),
      openWindow,
      stop,
    };
  }

  async function startClient(
    roomOrRig: RigRoom | MockRoom,
    connectionId: string,
    clientOptions: RigClientOptions = {},
  ): Promise<RigClient> {
    const client = createClient(roomOrRig, connectionId, clientOptions);
    await client.startEngine();
    client.openWindow();

    await waitWithin(waitLimitMs, () => client.store.$loaded.get());

    const until = clientOptions.until ?? options.until ?? 'loaded';

    if (until === 'live') {
      await waitWithin(waitLimitMs, () => client.store.$sync.get().state === 'live');
    }

    return client;
  }

  return {
    openRoom,
    createClient,
    startClient,
    cleanup: (cleanup) => cleanups.push(cleanup),
    waitUntil: (condition) => waitWithin(waitLimitMs, condition),
    pause,
  };
}

export async function waitUntil(condition: () => boolean): Promise<void> {
  return waitWithin(WAIT_LIMIT_MS, condition);
}

async function waitWithin(limitMs: number, condition: () => boolean): Promise<void> {
  const deadline = Date.now() + limitMs;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('the condition never became true');
    }

    // Polling lets paced queues and LOCAL messages run between checks.
    // oxlint-disable-next-line no-await-in-loop
    await pause(POLL_MS);
  }
}

export function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function send(
  client: Pick<RigClient, 'window' | 'mintedIds' | 'commandOutcomes'>,
  command: Command,
): string {
  return trackWindowOutcome(client, () => client.window.sendCommand(command));
}

export function requestPresetDiff(
  client: Pick<RigClient, 'window' | 'mintedIds' | 'commandOutcomes'>,
  data: string,
): string {
  return trackWindowOutcome(client, () => client.window.requestPresetDiff(data));
}

export function requestRoll(
  client: Pick<RigClient, 'window' | 'mintedIds' | 'commandOutcomes'>,
  request: Parameters<ReplicaClient['requestRoll']>[0],
  onWaitingAccess?: () => void,
): string {
  return trackWindowOutcome(client, () => client.window.requestRoll(request, onWaitingAccess));
}

function trackWindowOutcome(
  tracked: Pick<RigClient, 'window' | 'mintedIds' | 'commandOutcomes'>,
  start: () => Promise<RigOutcome>,
): string {
  const before = tracked.mintedIds.length;
  const pending = Promise.resolve(start());
  const id = tracked.mintedIds.at(-1);

  if (id === undefined || tracked.mintedIds.length !== before + 1) {
    throw new Error('the window minted no command id');
  }

  void pending
    .then((settled) => {
      tracked.commandOutcomes.set(id, settled);
    })
    .catch(() => {
      console.error('the window outcome rejected');
    });

  return id;
}

export function shown(client: Pick<RigClient, 'store'>, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

export function sync(client: Pick<RigClient, 'store'>): SyncState {
  return client.store.$sync.get();
}

export function rejection(
  client: Pick<RigClient, 'local' | 'commandOutcomes'>,
  id: string,
): string | undefined {
  const settled = client.commandOutcomes.get(id);

  if (settled?.kind === 'refused') {
    return settled.rejection.reason;
  }

  for (let index = client.local.length - 1; index >= 0; index -= 1) {
    const message = client.local[index];

    if (message === undefined) {
      continue;
    }

    const parsed = parseEngineMessage(message);

    if (parsed.ok && parsed.value.t === 'command-rejected' && parsed.value.id === id) {
      return parsed.value.reason;
    }
  }

  return undefined;
}

export function outcome(
  client: Pick<RigClient, 'commandOutcomes'>,
  id: string,
): RigOutcome | undefined {
  return client.commandOutcomes.get(id);
}

export function refusal(
  client: Pick<RigClient, 'commandOutcomes'>,
  id: string,
): CommandRejectedMessage | undefined {
  const settled = outcome(client, id);

  return settled?.kind === 'refused' ? settled.rejection : undefined;
}

export function heardOf(room: Pick<RigRoom, 'heard'>, from: string, t: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === t ? [message.data] : [],
  );
}

export function requestsOf(room: Pick<RigRoom, 'heard'>, from: string): string[] {
  return heardOf(room, from, 'state-request').map((message) => String(Object(message).r));
}

export function lastRequest(room: Pick<RigRoom, 'heard'>, from: string): string {
  const nonce = requestsOf(room, from).at(-1);

  if (nonce === undefined) {
    throw new Error(`${from} has asked for no state`);
  }

  return nonce;
}

export function storageKey(
  key: string,
  generation: GenerationLike = { n: 0, a: '' },
  place: { roomId?: string; format?: number } = {},
): string {
  const roomId = place.roomId ?? RIG_ROOM_ID;
  const format = place.format ?? RIG_FORMAT;

  return `mr${format}:${roomId}:${generation.n}:${generation.a}:${key}`;
}

export function storedRecord(
  client: Pick<RigClient, 'backing'>,
  key: string,
  generation?: GenerationLike,
): VersionedRecord | null {
  const text = client.backing.get(storageKey(key, generation));

  return text === null ? null : recordSchema.parse(JSON.parse(text));
}

export function storedKeys(client: Pick<RigClient, 'backing'>): string[] {
  return [...client.backing.keys()].sort();
}

export function copyValue(
  generation: GenerationLike,
  records: readonly VersionedRecord[],
  version = FORMAT_VERSION,
): JsonObject {
  const deflated = deflateSync(strToU8(JSON.stringify({ g: generation, records })));

  return { v: version, data: Buffer.from(deflated).toString('base64') };
}

export function roomCopyOf(
  room: Pick<RigRoom, 'room'>,
): { v: JsonValue; g: JsonValue; records: JsonValue } | null {
  const value = room.room.getMetadata()['app.muster-roll/snapshot'];

  if (value === undefined) {
    return null;
  }

  const data = String(Object(value).data);

  const content = roomCopyContentSchema.parse(
    JSON.parse(strFromU8(inflateSync(new Uint8Array(Buffer.from(data, 'base64'))))),
  );

  return { v: Object(value).v ?? null, g: content.g ?? null, records: content.records ?? null };
}

function roomOf(roomOrRig: RigRoom | MockRoom): MockRoom {
  return 'room' in roomOrRig ? roomOrRig.room : roomOrRig;
}

function trackBacking(backing: MockStorageBacking, writes: string[]): MockStorageBacking {
  return {
    get: backing.get,
    set: (key, value) => {
      writes.push(key);
      backing.set(key, value);
    },
    remove: backing.remove,
    keys: backing.keys,
  };
}
