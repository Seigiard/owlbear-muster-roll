import { afterEach, describe, expect, test } from 'bun:test';

import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type Command, type OpenSheetRequest } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockClient,
  type MockPlatform,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
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
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;

// Long enough for every queued LOCAL message to land.
const SETTLE_MS = 30;

const OPEN_ITEM = 'app.muster-roll/open-sheet';

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

// "Брок" is a character, "Скелет" an NPC, "Лиза" was deleted. t-pc, t-npc and t-gone link to them.
const ROOM: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { kind: 'pc', name: 'Брок', order: 0 }, c: 1, a: 'seed' },
  { k: 'sheet:skel', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'seed' },
  { k: 'sheet:liza', d: null, c: 2, a: 'seed' },
  { k: 'link:t-pc', d: 'brok', c: 1, a: 'seed' },
  { k: 'link:t-npc', d: 'skel', c: 1, a: 'seed' },
  { k: 'link:t-gone', d: 'liza', c: 1, a: 'seed' },
];

// One client's background, with no window until a test opens one. `requests` holds every open
// request the engine has put on the client's LOCAL bus, in order.
type Background = {
  platform: MockPlatform;
  bus: ReturnType<typeof createMemoryBus>;
  identity: MockClient;
  backing: MockStorageBacking;
  requests: OpenSheetRequest[];
};

type Window = { store: ProjectionStore; client: ReplicaClient };

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('open from token', () => {
  test('with the window closed, a GM press opens the action window and the window that connects gets the character', async () => {
    // #given
    const background = await startBackground('GM');

    // #when
    click(background, 't-pc');

    const window = await openWindow(background);

    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect({
      actionOpens: background.platform.actionOpens(),
      sheet: window.store.$openRequest.get()?.sheetId,
    }).toEqual({ actionOpens: 1, sheet: 'brok' });
  });

  test('with the window open, a press reaches it at once', async () => {
    // #given
    const background = await startBackground('GM');
    const window = await openWindow(background);

    // #when
    click(background, 't-npc');
    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect(window.store.$openRequest.get()?.sheetId).toBe('skel');
  });

  test('a player press on a character token reaches the window', async () => {
    // #given
    const background = await startBackground('PLAYER');
    const window = await openWindow(background);

    // #when
    click(background, 't-pc');
    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect({
      actionOpens: background.platform.actionOpens(),
      sheet: window.store.$openRequest.get()?.sheetId,
    }).toEqual({ actionOpens: 1, sheet: 'brok' });
  });

  for (const [role, tokenId] of [
    ['PLAYER', 't-npc'],
    ['GM', 't-gone'],
    ['GM', 't-none'],
  ] as const) {
    test(`a ${role} press on ${tokenId} opens nothing`, async () => {
      // #given: Owlbear would not show the item there, but a press can race a change.
      const background = await startBackground(role);
      const window = await openWindow(background);

      // #when
      click(background, tokenId);
      await pause(SETTLE_MS);

      // #then
      expect({
        actionOpens: background.platform.actionOpens(),
        requests: background.requests,
        shown: window.store.$openRequest.get(),
      }).toEqual({ actionOpens: 0, requests: [], shown: null });
    });
  }

  test('once a window acknowledges the request, a reload or a second window does not get it again', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');

    const first = await openWindow(background);

    await waitUntil(() => first.store.$openRequest.get() !== null);

    const id = first.store.$openRequest.get()?.id ?? '';

    // #when
    first.client.acknowledgeOpen(id);
    await pause(SETTLE_MS);

    const before = background.requests.length;
    const second = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(before),
      second: second.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], second: null });
  });

  test('until a window acknowledges it, every window that connects gets the request again', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');

    const first = await openWindow(background);

    await waitUntil(() => first.store.$openRequest.get() !== null);

    // #when: the first window closes with no acknowledgement.
    first.client.stop();

    const second = await openWindow(background);

    await waitUntil(() => second.store.$openRequest.get() !== null);

    // #then
    expect(second.store.$openRequest.get()).toEqual(first.store.$openRequest.get());
  });

  test('a newer press replaces the request still held', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');
    click(background, 't-npc');

    // #when
    const window = await openWindow(background);

    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect({
      shown: window.store.$openRequest.get()?.sheetId,
      actionOpens: background.platform.actionOpens(),
    }).toEqual({ shown: 'skel', actionOpens: 2 });
  });

  test('an acknowledgement of a replaced request leaves the newer one held', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');
    click(background, 't-npc');

    const [older] = background.requests;
    const first = await openWindow(background);

    // #when
    first.client.acknowledgeOpen(older?.id ?? '');
    await pause(SETTLE_MS);

    const second = await openWindow(background);

    await waitUntil(() => second.store.$openRequest.get() !== null);

    // #then
    expect(second.store.$openRequest.get()?.sheetId).toBe('skel');
  });

  test('a request no window took within its lifetime is dropped', async () => {
    // #given
    const background = await startBackground('GM', { openRequestTtlMs: 40 });

    click(background, 't-pc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    await pause(80);

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a request is dropped at once when Owlbear refuses to open the window', async () => {
    // #given
    const background = await startBackground('GM');

    background.platform.failNextActionOpen();

    // #when
    click(background, 't-pc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    await pause(SETTLE_MS);

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a request whose sheet is deleted before delivery is discarded', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    command(background, { type: 'sheet-delete', sheetId: 'brok' });
    await pause(SETTLE_MS);

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a GM request for an NPC is discarded when the GM becomes a player before delivery', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-npc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    background.platform.setRole('PLAYER');
    await pause(SETTLE_MS);

    const window = await openWindow(background);

    await waitUntil(() => window.store.$sync.get().role === 'PLAYER');
    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });
});

async function startBackground(
  role: PlayerRole,
  timing: Partial<Timing> = {},
): Promise<Background> {
  const backing = createBacking();
  const bus = createMemoryBus();

  const identity: MockClient = {
    room: createMemoryRoom(),
    connectionId: 'client-a',
    playerId: 'client-a',
    name: 'client-a',
    role,
  };

  const platform = createMockPlatform(bus, backing, identity);

  // A GM loads the room from its storage. A player loads nothing and gets it from a GM peer.
  if (role === 'GM') {
    for (const record of ROOM) {
      backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
    }
  } else {
    await startGmPeer(identity.room);
  }

  platform.joinParty();

  const requests: OpenSheetRequest[] = [];

  cleanups.push(
    bus.subscribe(UI_CHANNEL, (event) => {
      const message = Object(event.data);

      if (message.t === 'open-sheet') {
        requests.push({ id: String(message.id), sheetId: String(message.sheetId) });
      }
    }),
  );

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: { ...TIMING, ...timing },
    menuCopy: MENU_COPY,
  });

  cleanups.push(engine.stop);
  await waitUntil(() => platform.contextMenuItems().some((item) => item.id === OPEN_ITEM));

  return { platform, bus, identity, backing, requests };
}

// A GM client of the same room that answers the player's catch-up with the room's records.
async function startGmPeer(room: MockClient['room']): Promise<void> {
  const backing = createBacking();

  for (const record of ROOM) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  const identity: MockClient = {
    room,
    connectionId: 'gm-peer',
    playerId: 'gm-peer',
    name: 'gm-peer',
    role: 'GM',
  };

  const platform = createMockPlatform(createMemoryBus(), backing, identity);

  platform.joinParty();

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: TIMING,
  });

  cleanups.push(engine.stop);
}

async function openWindow(background: Background): Promise<Window> {
  const store = createProjectionStore();

  const client = startReplicaClient(
    createMockPlatform(background.bus, background.backing, background.identity).broadcast,
    createSendQueue(background.platform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(client.stop);
  await waitUntil(() => store.$loaded.get());

  return { store, client };
}

function click(background: Background, tokenId: string): void {
  if (!background.platform.clickContextMenuItem(OPEN_ITEM, [tokenId])) {
    throw new Error('the menu has no "Открыть лист"');
  }
}

// A GM command as a window would send it, with no window to keep its store.
function command(background: Background, intent: Command): void {
  void background.platform.broadcast.sendMessage(
    UI_CHANNEL,
    { t: 'command', id: `test-${Date.now()}`, command: intent },
    { destination: 'LOCAL' },
  );
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
