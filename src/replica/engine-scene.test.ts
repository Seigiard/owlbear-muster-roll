import { afterEach, describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
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
import type { ContextMenuKeyFilter, PlayerRole } from '@/platform/ports';
import { createSendQueue } from '@/platform/send-queue';
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
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;

// Long enough for a removal to reach the room through the paced queues if it were sent.
const SETTLE_MS = 40;

const GHOST = 'ghost-gm';
const UNLINK_ITEM = 'app.muster-roll/unlink-sheet';
const INITIAL = { n: 0, a: '' };

const MENU_COPY = {
  linkSheet: 'Привязать лист…',
  unlinkSheet: 'Отвязать лист',
  openSheet: 'Открыть лист',
  unlinkFailed: 'Не удалось отвязать лист. Попробуйте ещё раз.',
};

const PRESET: Preset = {
  v: 1,
  character: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
};

// "Брок" has the tokens t1 and t2, "Скелет" has t3.
const SEEDED: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { kind: 'pc', name: 'Брок', order: 0 }, c: 1, a: 'seed' },
  { k: 'sheet:skel', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'seed' },
  { k: 'link:t1', d: 'brok', c: 1, a: 'seed' },
  { k: 'link:t2', d: 'brok', c: 1, a: 'seed' },
  { k: 'link:t3', d: 'skel', c: 1, a: 'seed' },
];

type Client = {
  platform: MockPlatform;
  backing: MockStorageBacking;
  store: ProjectionStore;
  window: ReplicaClient;
  // Every `command-rejected` the engine sent on the LOCAL channel.
  rejections: string[];
  // How many times the engine called the scene port, subscriptions included.
  sceneCalls: () => number;
};

type Heard = { from: string; data: JsonValue };

type Room = { room: MockRoom; heard: Heard[] };

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('a token deleted from the open scene', () => {
  test('tombstones its link through the GM command path: saved, sent, shown, menu updated', async () => {
    // #given
    const room = openRoom(['t1', 't2', 't3', 'map']);
    const client = await startClient(room, 'gm-a');

    await waitUntil(() => itemIds(client).includes(UNLINK_ITEM));

    // #when
    client.platform.removeSceneItems(['t1']);
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    const tombstone: VersionedRecord = { k: 'link:t1', d: null, c: 2, a: 'gm-a' };

    await waitUntil(() => shown(client, 'link:t1')?.d === null);
    expect({
      sent: committed(room, 'gm-a'),
      stored: stored(client, 'link:t1'),
      shown: shown(client, 'link:t1'),
      others: [stored(client, 'link:t2')?.d, stored(client, 'link:t3')?.d],
      unlinkFilter: unlinkIds(client),
    }).toEqual({
      sent: [tombstone],
      stored: tombstone,
      shown: tombstone,
      others: ['brok', 'skel'],
      unlinkFilter: [
        { key: 'id', value: 't2', coordinator: '||' },
        { key: 'id', value: 't3' },
      ],
    });
  });

  test('tombstones the link of every linked token deleted at once', async () => {
    // #given
    const room = openRoom(['t1', 't2', 't3', 'map']);
    const client = await startClient(room, 'gm-a');

    // #when
    client.platform.removeSceneItems(['t1', 't3', 'map']);
    await waitUntil(() => committed(room, 'gm-a').length === 2);

    // #then
    expect({
      sent: committed(room, 'gm-a').map((record) => [record.k, record.d]),
      kept: stored(client, 'link:t2')?.d,
    }).toEqual({
      sent: [
        ['link:t1', null],
        ['link:t3', null],
      ],
      kept: 'brok',
    });
  });

  test('keeps the link of a token never seen in the open scene, as on another scene', async () => {
    // #given: t2 and t3 are not in this scene.
    const room = openRoom(['t1', 'map']);
    const client = await startClient(room, 'gm-a');

    // #when
    client.platform.removeSceneItems(['map']);
    await pause(SETTLE_MS);

    // #then
    expect({
      sent: committed(room, 'gm-a'),
      links: ['t1', 't2', 't3'].map((tokenId) => stored(client, `link:${tokenId}`)?.d),
    }).toEqual({ sent: [], links: ['brok', 'brok', 'skel'] });
  });

  test('keeps every link when the scene changes to another one and back', async () => {
    // #given
    const room = openRoom(['t1', 't2', 't3']);
    const client = await startClient(room, 'gm-a');

    // #when: Owlbear reports the scene not ready while it changes, one step at a time.
    for (const step of [
      () => client.platform.setSceneReady(false),
      () => client.platform.setSceneItems(['other-token']),
      () => client.platform.setSceneReady(true),
      () => client.platform.setSceneReady(false),
      () => client.platform.setSceneItems(['t1', 't2', 't3']),
      () => client.platform.setSceneReady(true),
    ]) {
      step();
      // Steps run one after another, so each awaits its turn.
      // oxlint-disable-next-line no-await-in-loop
      await pause(SETTLE_MS);
    }

    // #then
    expect({
      sent: committed(room, 'gm-a'),
      links: ['t1', 't2', 't3'].map((tokenId) => stored(client, `link:${tokenId}`)?.d),
    }).toEqual({ sent: [], links: ['brok', 'brok', 'skel'] });
  });

  test('removes nothing while the scene is not ready, and counts removals once a ready list is seen', async () => {
    // #given: the scene is still loading when the engine starts.
    const room = openRoom(['t1', 't2', 't3'], false);
    const client = await startClient(room, 'gm-a');

    client.platform.removeSceneItems(['t1']);
    await pause(SETTLE_MS);

    const whileLoading = committed(room, 'gm-a');

    // #when
    client.platform.setSceneReady(true);
    await pause(SETTLE_MS);
    client.platform.removeSceneItems(['t2']);
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    expect({
      whileLoading,
      sent: committed(room, 'gm-a').map((record) => record.k),
      t1: stored(client, 'link:t1')?.d,
    }).toEqual({ whileLoading: [], sent: ['link:t2'], t1: 'brok' });
  });

  test('leaves the link removed when the token comes back, as with an Owlbear undo', async () => {
    // #given
    const room = openRoom(['t1']);
    const client = await startClient(room, 'gm-a');

    client.platform.removeSceneItems(['t1']);
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #when
    client.platform.addSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #then
    expect({ sent: committed(room, 'gm-a').length, link: stored(client, 'link:t1')?.d }).toEqual({
      sent: 1,
      link: null,
    });
  });

  test('does nothing on a player client, which never reads the scene', async () => {
    // #given: the GM's link reached the player through a catch-up answer.
    const room = openRoom(['t1']);
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, 'player-a', { role: 'PLAYER' });

    await waitUntil(() => shown(player, 'link:t1')?.d === 'brok');
    gm.stop();

    // #when
    player.platform.removeSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #then
    expect({
      sceneCalls: player.sceneCalls(),
      sent: room.heard.filter((message) => message.from === 'player-a' && isEdit(message.data)),
      link: shown(player, 'link:t1')?.d,
    }).toEqual({ sceneCalls: 0, sent: [], link: 'brok' });
  });

  test('starts to watch when a player becomes GM, with no removal from before', async () => {
    // #given
    const room = openRoom(['t1', 't2']);
    const client = await startClient(room, 'client-a', { role: 'PLAYER' });

    client.platform.removeSceneItems(['t1']);
    client.platform.setRole('GM');
    await waitUntil(() => isLive(client));
    await pause(SETTLE_MS);

    const beforeRemoval = committed(room, 'client-a');

    // #when
    client.platform.removeSceneItems(['t2']);
    await waitUntil(() => committed(room, 'client-a').length === 1);

    // #then
    expect({
      beforeRemoval,
      sent: committed(room, 'client-a').map((record) => record.k),
      t1: stored(client, 'link:t1')?.d,
    }).toEqual({ beforeRemoval: [], sent: ['link:t2'], t1: 'brok' });
  });
});

describe('the watch', () => {
  test('stops, with the removals it held, when the GM becomes a player', async () => {
    // #given: a catch-up held open keeps the removal of t1 waiting.
    const room = openRoom(['t1', 't2']);

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 300 } });

    client.platform.removeSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #when
    client.platform.setRole('PLAYER');
    await pause(SETTLE_MS);

    const calls = client.sceneCalls();

    client.platform.removeSceneItems(['t2']);

    const callsAsPlayer = client.sceneCalls() - calls;

    // A GM again, alone, so its catch-up ends at once: the removal held before is gone.
    room.room.leave(GHOST);
    client.platform.setRole('GM');
    await waitUntil(() => isLive(client));
    await pause(SETTLE_MS);

    // #then
    expect({
      callsAsPlayer,
      sent: room.heard.filter((message) => message.from === 'gm-a' && isEdit(message.data)),
      links: [stored(client, 'link:t1')?.d, stored(client, 'link:t2')?.d],
    }).toEqual({ callsAsPlayer: 0, sent: [], links: ['brok', 'brok'] });
  });

  test('stops with the engine', async () => {
    // #given
    const room = openRoom(['t1']);
    const client = await startClient(room, 'gm-a');

    // #when
    client.stop();

    const calls = client.sceneCalls();

    client.platform.removeSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #then
    expect({ calls: client.sceneCalls() - calls, sent: committed(room, 'gm-a') }).toEqual({
      calls: 0,
      sent: [],
    });
  });
});

describe('during catch-up', () => {
  test('remembers the removal and clears the link when the catch-up ends', async () => {
    // #given: a GM in the party that never answers holds the catch-up open, and this client learns
    // of the link to t1 only after t1 was deleted.
    const room = openRoom(['t1', 't2']);

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 300 },
      seeded: SEEDED.filter((record) => record.k !== 'link:t1'),
    });

    // #when
    client.platform.removeSceneItems(['t1']);
    post(room, GHOST, commit([{ k: 'link:t1', d: 'brok', c: 1, a: 'seed' }]));
    await waitUntil(() => stored(client, 'link:t1')?.d === 'brok');
    await pause(SETTLE_MS);

    const during = { state: client.store.$sync.get().state, sent: committed(room, 'gm-a') };

    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    expect({
      during,
      sent: committed(room, 'gm-a').map((record) => [record.k, record.d]),
      kept: stored(client, 'link:t2')?.d,
    }).toEqual({
      during: { state: 'catching-up', sent: [] },
      sent: [['link:t1', null]],
      kept: 'brok',
    });
  });

  test('sends nothing and shows nothing when another GM cleared the link meanwhile', async () => {
    // #given
    const room = openRoom(['t1']);

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 300 } });

    client.platform.removeSceneItems(['t1']);
    post(room, GHOST, commit([{ k: 'link:t1', d: null, c: 2, a: GHOST }]));
    await waitUntil(() => stored(client, 'link:t1')?.d === null);

    // #when
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await pause(SETTLE_MS);

    // #then
    expect({
      sent: committed(room, 'gm-a'),
      link: stored(client, 'link:t1'),
      rejections: client.rejections,
      notifications: client.platform.shownNotifications(),
    }).toEqual({
      sent: [],
      link: { k: 'link:t1', d: null, c: 2, a: GHOST },
      rejections: [],
      notifications: [],
    });
  });
});

describe('two GM clients', () => {
  test('a link another GM writes for a token this client saw deleted is cleared when it arrives', async () => {
    // #given: gm-b has not heard of the deletion yet when it links t1 again.
    const room = openRoom(['t1']);
    const first = await startClient(room, 'gm-a');
    const second = await startClient(room, 'gm-b');

    await waitUntil(() => isLive(second));
    first.platform.removeSceneItems(['t1']);
    await waitUntil(() => stored(second, 'link:t1')?.d === null);

    // #when
    send(second, { type: 'link-set', tokenId: 't1', sheetId: 'skel' });
    await waitUntil(() => stored(second, 'link:t1')?.c === 4);

    // #then
    expect({
      first: stored(first, 'link:t1')?.d,
      second: stored(second, 'link:t1')?.d,
      cleared: committed(room, 'gm-a').filter((record) => record.c === 4),
    }).toEqual({
      first: null,
      second: null,
      cleared: [{ k: 'link:t1', d: null, c: 4, a: 'gm-a' }],
    });
  });

  test('a token back in the scene, as after an undo, can be linked again', async () => {
    // #given
    const room = openRoom(['t1']);
    const first = await startClient(room, 'gm-a');
    const second = await startClient(room, 'gm-b');

    await waitUntil(() => isLive(second));
    first.platform.removeSceneItems(['t1']);
    await waitUntil(() => stored(first, 'link:t1')?.d === null);
    first.platform.addSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #when
    send(second, { type: 'link-set', tokenId: 't1', sheetId: 'skel' });
    await waitUntil(() => stored(first, 'link:t1')?.d === 'skel');
    await pause(SETTLE_MS);

    // #then
    expect({ first: stored(first, 'link:t1')?.d, second: stored(second, 'link:t1')?.d }).toEqual({
      first: 'skel',
      second: 'skel',
    });
  });

  test('both clear the link, both keep one record, and neither shows a message', async () => {
    // #given
    const room = openRoom(['t1']);
    const first = await startClient(room, 'gm-a');
    const second = await startClient(room, 'gm-b');

    await waitUntil(() => second.store.$sync.get().state === 'live');

    // #when
    first.platform.removeSceneItems(['t1']);
    await waitUntil(
      () => committed(room, 'gm-a').length === 1 && committed(room, 'gm-b').length === 1,
    );
    await pause(SETTLE_MS);

    // #then: the higher author wins the equal counter.
    const winner: VersionedRecord = { k: 'link:t1', d: null, c: 2, a: 'gm-b' };

    expect({
      first: stored(first, 'link:t1'),
      second: stored(second, 'link:t1'),
      rejections: [...first.rejections, ...second.rejections],
      notifications: [
        ...first.platform.shownNotifications(),
        ...second.platform.shownNotifications(),
      ],
    }).toEqual({ first: winner, second: winner, rejections: [], notifications: [] });
  });
});

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client & { stop: () => void }> {
  const backing = createBacking();
  const bus = createMemoryBus();
  const role = options.role ?? 'GM';

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role,
  };

  const platform = createMockPlatform(bus, backing, identity);
  const scene = platform.scene;
  let sceneCalls = 0;

  platform.scene = {
    isReady: () => {
      sceneCalls += 1;

      return scene.isReady();
    },
    onReadyChange: (callback) => {
      sceneCalls += 1;

      return scene.onReadyChange(callback);
    },
    getItemIds: () => {
      sceneCalls += 1;

      return scene.getItemIds();
    },
    onItemsChange: (callback) => {
      sceneCalls += 1;

      return scene.onItemsChange(callback);
    },
    getItemLabel: (itemId) => {
      sceneCalls += 1;

      return scene.getItemLabel(itemId);
    },
    setItemLabel: (itemId, label) => {
      sceneCalls += 1;

      return scene.setItemLabel(itemId, label);
    },
  };

  // A player reads none of it until it becomes GM.
  for (const record of options.seeded ?? SEEDED) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  platform.joinParty();

  const rejections: string[] = [];

  cleanups.push(
    platform.broadcast.onMessage(UI_CHANNEL, (event) => {
      const data = Object(event.data);

      if (data.t === 'command-rejected') {
        rejections.push(String(data.id));
      }
    }),
  );

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: { ...TIMING, ...options.timing },
    menuCopy: MENU_COPY,
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

  return {
    platform,
    stop: engine.stop,
    backing,
    store,
    window,
    rejections,
    sceneCalls: () => sceneCalls,
  };
}

// A room whose open scene holds these items.
function openRoom(itemIds: string[], ready = true): Room {
  const room = createMemoryRoom();
  const heard: Heard[] = [];

  room.setScene({ ready, itemIds, labels: {} }, 'items');
  room.onRemote(SYNC_CHANNEL, 'observer', (event) => {
    heard.push({ from: event.connectionId, data: event.data });
  });

  return { room, heard };
}

// A party member that never answers by itself. The test speaks for it.
function joinAs(room: Room, connectionId: string, role: PlayerRole): void {
  room.room.join({ id: connectionId, connectionId, name: connectionId, role });
}

function post(room: Room, from: string, data: JsonValue): void {
  room.room.postRemote(SYNC_CHANNEL, data, from);
}

function commit(records: VersionedRecord[]): JsonValue {
  return { v: 1, g: INITIAL, t: 'commit', records };
}

function send(client: Client, command: Command): void {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }
}

function isLive(client: Client): boolean {
  return client.store.$sync.get().state === 'live';
}

function isEdit(data: JsonValue): boolean {
  const type = Object(data).t;

  return type === 'commit' || type === 'propose';
}

// The records one client sent to the room in commits, in send order.
function committed(room: Room, from: string): VersionedRecord[] {
  return room.heard.flatMap((message) => {
    const data = Object(message.data);

    return message.from === from && data.t === 'commit'
      ? recordSchema.array().parse(data.records)
      : [];
  });
}

function itemIds(client: Client): string[] {
  return client.platform.contextMenuItems().map((item) => item.id);
}

// The id filters "Отвязать лист" shows on.
function unlinkIds(client: Client): ContextMenuKeyFilter[] {
  const item = client.platform.contextMenuItems().find((one) => one.id === UNLINK_ITEM);

  return item?.icons[0]?.filter?.some ?? [];
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

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function stored(client: Client, key: string): VersionedRecord | null {
  const text = client.backing.get(`${STORAGE_PREFIX}${key}`);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
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
