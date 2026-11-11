import type { JsonValue } from '@/core/json';
import type { WindowSize } from '@/core/preset';
import { err, ok, type Result } from '@/core/result';
import { TIMING, type Timing } from '@/core/timing';
import type {
  ContextMenuItem,
  PartyMember,
  Platform,
  Popover,
  PlayerRole,
  SendFailure,
  StorageFailure,
  StorageOperation,
  Theme,
} from '@/platform/ports';

import {
  CATCH_UP_TIMEOUT_PARAM,
  GM_LINK_TIMEOUT_PARAM,
  CLIENT_PARAM,
  DEVICE_PARAM,
  deviceStoragePrefix,
  MOCK_CONNECTION_ID,
  MOCK_ROOM_ID,
  mockConnectionId,
  NAME_PARAM,
  PLAYER_PARAM,
  ROLE_PARAM,
  SNAPSHOT_JITTER_PARAM,
  SNAPSHOT_PAUSE_PARAM,
} from './client-params';
import { createMemoryBus, createPageBus, type LocalBus } from './local-bus';
import {
  createMemoryRoom,
  createPageRoom,
  type MockRoom,
  type MockScene,
  type MockSceneChange,
} from './room';

export { createMemoryBus, createMemoryRoom, type MockRoom, type MockScene };

const MOCK_PLAYER_ID = 'mock-player';
const MOCK_PLAYER_NAME = 'Mock GM';
const MOCK_NOTIFICATION_ID = 'mock-notification';

// The element id Owlbear passes to a context menu click: the menu entry that was pressed.
const MOCK_MENU_ELEMENT_ID = 'mock-context-menu-element';

const THEME_READ_FAILS_PARAM = 'mock-theme-read-fails';
const THEME_READ_SLOW_PARAM = 'mock-theme-read-slow';
const THEME_READ_SLOW_MS = 200;

// The longest delay a browser timer keeps; a longer one fires at once.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

// The default device lists no key that starts with this, so mock bookkeeping stays out of it.
const MOCK_STORAGE_PREFIX = 'mock-';

const MOCK_THEME: Theme = {
  mode: 'DARK',
  primary: { main: '#D9B36C', contrastText: '#222222' },
  background: { default: '#2A2A2A', paper: '#333333' },
  text: { primary: '#DDDDDD', secondary: '#AAAAAA' },
};

type ThemeListener = (theme: Theme) => void;

export type MockStorageBacking = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  keys: () => string[];
};

// One client of a room: a connection and the player behind it. Two GM tabs of one account are two
// clients with one player id.
export type MockClient = {
  room: MockRoom;
  connectionId: string;
  playerId: string;
  name: string;
  role: PlayerRole;
};

// One context menu port call, in the order this page made it.
export type ContextMenuCall = { kind: 'create' | 'remove'; id: string };

// One scene label call, read or write, in the order this page made it.
export type SceneLabelCall = { kind: 'read' | 'write'; itemId: string };

export type WindowSizeCall = WindowSize;

export type MockPlatform = Platform & {
  setTheme: (theme: Theme) => void;
  // `rejoin: false` changes only the player's own role, as Owlbear does, with no party change.
  setRole: (role: PlayerRole, options?: { rejoin: boolean }) => void;
  setFailingStorageOperations: (operations: StorageOperation[]) => void;
  failNextSends: (failures: SendFailure[]) => void;
  // Adds this client to the room's party, as Owlbear lists a connected client. One page per client
  // joins, so the party lists each connection once.
  joinParty: () => void;
  leaveParty: () => void;
  // Puts a REMOTE message on the room as if the given connection had sent it.
  sendRemoteAs: (connectionId: string, channel: string, data: JsonValue) => void;
  // Every notification this page has shown, oldest first.
  shownNotifications: () => string[];
  // The context menu items this page has created and not removed, in the order they were created.
  contextMenuItems: () => ContextMenuItem[];
  contextMenuCalls: () => ContextMenuCall[];
  // The next call of each listed kind rejects and changes nothing, one per entry.
  failNextContextMenuCalls: (kinds: ContextMenuCall['kind'][]) => void;
  // Presses an item for the selected items, as Owlbear calls it back. Owlbear applies the filters
  // before it shows an item, so the caller picks a selection the filters would show it for. False
  // when no such item exists.
  clickContextMenuItem: (id: string, itemIds: string[]) => boolean;
  openedPopovers: () => Popover[];
  closedPopovers: () => string[];
  // How many times this page asked Owlbear to open the action window.
  actionOpens: () => number;
  // The next request to open the action window rejects, as Owlbear can refuse one.
  failNextActionOpen: () => void;
  // Every size this page asked Owlbear to give the action window, oldest first, failed ones too.
  actionSizes: () => WindowSizeCall[];
  // The next request to size the action window rejects.
  failNextActionSize: () => void;
  // The room's scene, shared by every client of the room. Each call is one change Owlbear reports:
  // a readiness change, or one item list. Both are reported even when nothing changed, as Owlbear
  // reports every item update.
  setSceneReady: (ready: boolean) => void;
  addSceneItems: (itemIds: string[]) => void;
  removeSceneItems: (itemIds: string[]) => void;
  // Replaces the whole item list, as another scene's items would, in one change.
  setSceneItems: (itemIds: string[]) => void;
  // Sets the label of an item in the scene, as the GM would type it in Owlbear, in one item change.
  // `null` makes the item one with no label text, as a shape. Does nothing for an item the scene
  // does not hold.
  setSceneItemLabel: (itemId: string, label: string | null) => void;
  // The label Owlbear would show under an item: "" for none, `null` for an item not in the scene or
  // with no label text.
  sceneItemLabel: (itemId: string) => string | null;
  sceneLabelCalls: () => SceneLabelCall[];
  // The next call of each listed kind rejects and changes nothing, one per entry.
  failNextSceneLabelCalls: (kinds: SceneLabelCall['kind'][]) => void;
};

declare global {
  interface Window {
    // Playwright reaches the mock through this. The mock never enters a production build.
    setMockTheme: (theme: Theme) => void;
    mockPlatform: MockPlatform;
  }
}

const pageClient = clientFromPageUrl();

const mockPlatform = createMockPlatform(
  createPageBus(pageClient.connectionId),
  createPageBacking(new URLSearchParams(window.location.search).get(DEVICE_PARAM) ?? ''),
  pageClient,
);

// The background page stands for its client in the party, as long as it is open.
if (window.location.pathname.endsWith('/background.html')) {
  mockPlatform.joinParty();
  window.addEventListener('pagehide', mockPlatform.leaveParty);
}

export const platform: Platform = mockPlatform;

// The background's timing: `TIMING`, with the catch-up and GM link timeouts and the room copy
// pause a test page names in its URL.
export const timing: Timing = timingFromPageUrl();

window.setMockTheme = mockPlatform.setTheme;

window.mockPlatform = mockPlatform;

export function createMockPlatform(
  localBus: LocalBus = createMemoryBus(),
  backing: MockStorageBacking = createMemoryBacking(),
  client: MockClient = defaultClient(createMemoryRoom()),
): MockPlatform {
  const themeListeners = new Set<ThemeListener>();
  const roleListeners = new Set<() => void>();
  const sendFailures: SendFailure[] = [];
  const notifications: string[] = [];
  const menuItems = new Map<string, ContextMenuItem>();
  const menuCalls: ContextMenuCall[] = [];
  const menuFailures: ContextMenuCall['kind'][] = [];
  const opened: Popover[] = [];
  const closed: string[] = [];
  const labelCalls: SceneLabelCall[] = [];
  const labelFailures: SceneLabelCall['kind'][] = [];
  let actionOpens = 0;
  let actionOpenFails = false;
  const actionSizes: WindowSizeCall[] = [];
  let actionSizeFails = false;
  const { room, connectionId, playerId, name } = client;
  let role: PlayerRole = client.role;
  let joined = false;
  let failingStorageOperations = new Set<StorageOperation>();
  let currentTheme = MOCK_THEME;

  function attemptStorage<Value>(
    operation: StorageOperation,
    action: () => Value,
  ): Result<Value, StorageFailure> {
    if (failingStorageOperations.has(operation)) {
      return err({ operation, reason: 'mock storage failure' });
    }

    return ok(action());
  }

  function takeMenuFailure(kind: ContextMenuCall['kind']): boolean {
    const index = menuFailures.indexOf(kind);

    if (index === -1) {
      return false;
    }

    menuFailures.splice(index, 1);

    return true;
  }

  function takeLabelFailure(kind: SceneLabelCall['kind']): boolean {
    const index = labelFailures.indexOf(kind);

    if (index === -1) {
      return false;
    }

    labelFailures.splice(index, 1);

    return true;
  }

  function joinParty(): void {
    joined = true;
    room.join({ id: playerId, connectionId, name, role });
  }

  // Owlbear lists every member but the caller.
  function others(): PartyMember[] {
    return room.members().filter((member) => member.connectionId !== connectionId);
  }

  function changeScene(kind: MockSceneChange, change: (scene: MockScene) => MockScene): void {
    room.setScene(change(room.getScene()), kind);
  }

  function readLabel(itemId: string): string | null {
    const scene = room.getScene();
    const label = scene.labels[itemId];

    if (!scene.itemIds.includes(itemId)) {
      return null;
    }

    return label === undefined ? '' : label;
  }

  // An update of one item, which Owlbear reports as an item list.
  function labelItem(itemId: string, label: string | null): void {
    changeScene('items', (scene) => ({ ...scene, labels: { ...scene.labels, [itemId]: label } }));
  }

  return {
    onReady: (callback) => {
      queueMicrotask(callback);
    },
    broadcast: {
      sendMessage: (channel, data, options) => {
        const failure = sendFailures.shift();

        if (failure !== undefined) {
          return Promise.resolve(err(failure));
        }

        // LOCAL stays within this client. REMOTE reaches the other clients of the room only, as
        // Owlbear never echoes it to its sender.
        if (options.destination === 'LOCAL') {
          localBus.post(channel, data, connectionId);
        } else {
          room.postRemote(channel, data, connectionId);
        }

        return Promise.resolve(ok(undefined));
      },
      onMessage: (channel, callback) => {
        const unsubscribeLocal = localBus.subscribe(channel, callback);
        const unsubscribeRemote = room.onRemote(channel, connectionId, callback);

        return () => {
          unsubscribeLocal();
          unsubscribeRemote();
        };
      },
    },
    metadata: {
      getRoomId: () => MOCK_ROOM_ID,
      getMetadata: () => Promise.resolve(room.getMetadata()),
      setMetadata: (update) => {
        room.setMetadata(update);

        return Promise.resolve();
      },
      onMetadataChange: (callback) => room.onMetadataChange(callback),
    },
    party: {
      getPlayers: () => Promise.resolve(others()),
      onChange: (callback) =>
        room.onPartyChange(() => {
          callback(others());
        }),
    },
    player: {
      getId: () => Promise.resolve(playerId),
      getConnectionId: () => Promise.resolve(connectionId),
      getName: () => Promise.resolve(name),
      getRole: () => Promise.resolve(role),
      onRoleChange: (callback) => {
        roleListeners.add(callback);

        return () => {
          roleListeners.delete(callback);
        };
      },
    },
    storage: {
      getItem: (key) => attemptStorage('read', () => backing.get(key)),
      setItem: (key, value) => {
        return attemptStorage('write', () => {
          backing.set(key, value);
        });
      },
      removeItem: (key) => {
        return attemptStorage('remove', () => {
          backing.remove(key);
        });
      },
      keys: () => attemptStorage('list', () => backing.keys()),
    },
    contextMenu: {
      // As in Owlbear, an item created again under its id replaces the old one.
      create: (item) => {
        if (takeMenuFailure('create')) {
          return Promise.reject(new Error('mock context menu create failed'));
        }

        menuItems.delete(item.id);
        menuItems.set(item.id, item);
        menuCalls.push({ kind: 'create', id: item.id });

        return Promise.resolve();
      },
      remove: (id) => {
        if (takeMenuFailure('remove')) {
          return Promise.reject(new Error('mock context menu remove failed'));
        }

        menuItems.delete(id);
        menuCalls.push({ kind: 'remove', id });

        return Promise.resolve();
      },
    },
    popover: {
      open: (popover) => {
        opened.push(popover);

        return Promise.resolve();
      },
      close: (id) => {
        closed.push(id);

        return Promise.resolve();
      },
    },
    // A test opens the window page itself, as Owlbear would load it.
    action: {
      open: () => {
        actionOpens += 1;

        if (actionOpenFails) {
          actionOpenFails = false;

          return Promise.reject(new Error('mock action open failed'));
        }

        return Promise.resolve();
      },
      setSize: (width, height) => {
        actionSizes.push({ width, height });

        if (actionSizeFails) {
          actionSizeFails = false;

          return Promise.reject(new Error('mock action size failed'));
        }

        return Promise.resolve();
      },
    },
    notification: {
      show: (message) => {
        notifications.push(message);

        return Promise.resolve(MOCK_NOTIFICATION_ID);
      },
    },
    // Owlbear calls back once per change, also with a readiness or a list it already reported.
    scene: {
      isReady: () => Promise.resolve(room.getScene().ready),
      onReadyChange: (callback) =>
        room.onSceneChange((scene, change) => {
          if (change === 'ready') {
            callback(scene.ready);
          }
        }),
      getItemIds: () => Promise.resolve(room.getScene().itemIds),
      onItemsChange: (callback) =>
        room.onSceneChange((scene, change) => {
          if (change === 'items') {
            callback(scene.itemIds);
          }
        }),
      getItemLabel: (itemId) => {
        labelCalls.push({ kind: 'read', itemId });

        if (takeLabelFailure('read')) {
          return Promise.reject(new Error('mock scene label read failed'));
        }

        return Promise.resolve(readLabel(itemId));
      },
      setItemLabel: (itemId, label) => {
        labelCalls.push({ kind: 'write', itemId });

        if (takeLabelFailure('write')) {
          return Promise.reject(new Error('mock scene label write failed'));
        }

        // As the adapter: only a GM sets a label, and only on an item with label text.
        if (role !== 'GM') {
          return Promise.reject(new Error('Only a GM sets a token label'));
        }

        if (readLabel(itemId) === null) {
          return Promise.reject(new Error(`mock scene has no labelled item ${itemId}`));
        }

        labelItem(itemId, label);

        return Promise.resolve();
      },
    },
    theme: {
      getTheme: () => {
        const params = new URLSearchParams(window.location.search);

        if (params.has(THEME_READ_FAILS_PARAM)) {
          return Promise.reject(new Error('mock theme read failed'));
        }

        // The real read crosses frames, so it resolves after React could commit.
        if (params.has(THEME_READ_SLOW_PARAM)) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(currentTheme);
            }, THEME_READ_SLOW_MS);
          });
        }

        return Promise.resolve(currentTheme);
      },
      onChange: (callback) => {
        themeListeners.add(callback);

        return () => {
          themeListeners.delete(callback);
        };
      },
    },
    setTheme: (theme) => {
      currentTheme = theme;

      for (const listener of themeListeners) {
        listener(theme);
      }
    },
    setRole: (next, options = { rejoin: true }) => {
      role = next;

      if (joined && options.rejoin) {
        joinParty();
      }

      for (const listener of roleListeners) {
        listener();
      }
    },
    setFailingStorageOperations: (operations) => {
      failingStorageOperations = new Set(operations);
    },
    failNextSends: (failures) => {
      sendFailures.push(...failures);
    },
    joinParty,
    leaveParty: () => {
      joined = false;
      room.leave(connectionId);
    },
    sendRemoteAs: (sender, channel, data) => {
      room.postRemote(channel, data, sender);
    },
    shownNotifications: () => [...notifications],
    contextMenuItems: () => [...menuItems.values()],
    contextMenuCalls: () => [...menuCalls],
    failNextContextMenuCalls: (kinds) => {
      menuFailures.push(...kinds);
    },
    clickContextMenuItem: (id, itemIds) => {
      const item = menuItems.get(id);

      if (item === undefined) {
        return false;
      }

      item.onClick?.({ items: itemIds.map((itemId) => ({ id: itemId })) }, MOCK_MENU_ELEMENT_ID);

      return true;
    },
    openedPopovers: () => [...opened],
    closedPopovers: () => [...closed],
    actionOpens: () => actionOpens,
    failNextActionOpen: () => {
      actionOpenFails = true;
    },
    actionSizes: () => [...actionSizes],
    failNextActionSize: () => {
      actionSizeFails = true;
    },
    setSceneReady: (ready) => {
      changeScene('ready', (scene) => ({ ...scene, ready }));
    },
    addSceneItems: (itemIds) => {
      changeScene('items', (scene) => ({
        ...scene,
        itemIds: [...scene.itemIds, ...itemIds.filter((id) => !scene.itemIds.includes(id))],
      }));
    },
    removeSceneItems: (itemIds) => {
      changeScene('items', (scene) => ({
        ...scene,
        itemIds: scene.itemIds.filter((id) => !itemIds.includes(id)),
      }));
    },
    setSceneItems: (itemIds) => {
      changeScene('items', (scene) => ({ ...scene, itemIds: [...itemIds] }));
    },
    setSceneItemLabel: (itemId, label) => {
      if (room.getScene().itemIds.includes(itemId)) {
        labelItem(itemId, label);
      }
    },
    sceneItemLabel: readLabel,
    sceneLabelCalls: () => [...labelCalls],
    failNextSceneLabelCalls: (kinds) => {
      labelFailures.push(...kinds);
    },
  };
}

// The one GM client every test had before rooms had several.
export function defaultClient(room: MockRoom): MockClient {
  return {
    room,
    connectionId: MOCK_CONNECTION_ID,
    playerId: MOCK_PLAYER_ID,
    name: MOCK_PLAYER_NAME,
    role: 'GM',
  };
}

function createMemoryBacking(): MockStorageBacking {
  const stored = new Map<string, string>();

  return {
    get: (key) => stored.get(key) ?? null,
    set: (key, value) => {
      stored.set(key, value);
    },
    remove: (key) => {
      stored.delete(key);
    },
    keys: () => [...stored.keys()],
  };
}

// Real pages share this browser's storage, as Owlbear iframes do. A named device keeps its own
// keys under a prefix, as a second browser would.
function createPageBacking(device: string): MockStorageBacking {
  const prefix = deviceStoragePrefix(device);

  function ownKey(key: string): boolean {
    return prefix === '' ? !key.startsWith(MOCK_STORAGE_PREFIX) : key.startsWith(prefix);
  }

  return {
    get: (key) => localStorage.getItem(`${prefix}${key}`),
    set: (key, value) => {
      localStorage.setItem(`${prefix}${key}`, value);
    },
    remove: (key) => {
      localStorage.removeItem(`${prefix}${key}`);
    },
    keys: () =>
      Array.from({ length: localStorage.length }, readKey)
        .filter(ownKey)
        .map((key) => key.slice(prefix.length)),
  };
}

function readKey(_value: undefined, index: number): string {
  return localStorage.key(index) ?? '';
}

// An empty `mock-client` is the one client every page had before rooms had several.
function clientFromPageUrl(): MockClient {
  const params = new URLSearchParams(window.location.search);
  const client = params.get(CLIENT_PARAM) ?? '';
  const role: PlayerRole = params.get(ROLE_PARAM) === 'PLAYER' ? 'PLAYER' : 'GM';

  return {
    room: createPageRoom(MOCK_ROOM_ID),
    connectionId: mockConnectionId(client),
    playerId: params.get(PLAYER_PARAM) ?? MOCK_PLAYER_ID,
    name: params.get(NAME_PARAM) ?? MOCK_PLAYER_NAME,
    role,
  };
}

function timingFromPageUrl(): Timing {
  const params = new URLSearchParams(window.location.search);

  return {
    ...TIMING,
    catchUpTimeoutMs: durationParam(params, CATCH_UP_TIMEOUT_PARAM) ?? TIMING.catchUpTimeoutMs,
    gmLinkTimeoutMs: gmLinkTimeoutParam(params) ?? TIMING.gmLinkTimeoutMs,
    snapshotPauseMs: timerParam(params, SNAPSHOT_PAUSE_PARAM) ?? TIMING.snapshotPauseMs,
    snapshotJitterMs: timerParam(params, SNAPSHOT_JITTER_PARAM) ?? TIMING.snapshotJitterMs,
  };
}

// 0, or a value past the longest timer delay, would ping in a loop with no pause.
function gmLinkTimeoutParam(params: URLSearchParams): number | null {
  const value = durationParam(params, GM_LINK_TIMEOUT_PARAM);

  return value !== null && value > 0 && value <= MAX_TIMER_DELAY_MS ? value : null;
}

// A value past the longest timer delay would fire at once.
function timerParam(params: URLSearchParams, name: string): number | null {
  const value = durationParam(params, name);

  return value !== null && value <= MAX_TIMER_DELAY_MS ? value : null;
}

function durationParam(params: URLSearchParams, name: string): number | null {
  // An empty value counts as absent, as `Number('')` would read it as 0.
  const text = params.get(name) ?? '';
  const value = text === '' ? Number.NaN : Number(text);

  return Number.isFinite(value) && value >= 0 ? value : null;
}
