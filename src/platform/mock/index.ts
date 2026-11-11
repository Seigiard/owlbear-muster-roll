import type { JsonValue } from '@/core/json';
import { err, ok, type Result } from '@/core/result';
import { TIMING, type Timing } from '@/core/timing';
import type {
  PartyMember,
  Platform,
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
import { createMemoryRoom, createPageRoom, type MockRoom } from './room';

export { createMemoryBus, createMemoryRoom, type MockRoom };

const MOCK_PLAYER_ID = 'mock-player';
const MOCK_PLAYER_NAME = 'Mock GM';
const MOCK_NOTIFICATION_ID = 'mock-notification';
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

  function joinParty(): void {
    joined = true;
    room.join({ id: playerId, connectionId, name, role });
  }

  // Owlbear lists every member but the caller.
  function others(): PartyMember[] {
    return room.members().filter((member) => member.connectionId !== connectionId);
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
      create: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
    popover: {
      open: () => Promise.resolve(),
      close: () => Promise.resolve(),
    },
    action: {
      open: () => Promise.resolve(),
    },
    notification: {
      show: (message) => {
        notifications.push(message);

        return Promise.resolve(MOCK_NOTIFICATION_ID);
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
