import type { JsonObject } from '@/core/json';
import { err, ok, type Result } from '@/core/result';
import type {
  Platform,
  PlayerRole,
  SendFailure,
  StorageFailure,
  StorageOperation,
  Theme,
  Unsubscribe,
} from '@/platform/ports';

import { createMemoryBus, createPageBus, type LocalBus } from './local-bus';

export { createMemoryBus };

const MOCK_ROOM_ID = 'mock-room';
const MOCK_PLAYER_ID = 'mock-player';
const MOCK_CONNECTION_ID = 'mock-connection';
const MOCK_PLAYER_NAME = 'Mock GM';
const MOCK_NOTIFICATION_ID = 'mock-notification';
const THEME_READ_FAILS_PARAM = 'mock-theme-read-fails';
const THEME_READ_SLOW_PARAM = 'mock-theme-read-slow';
const THEME_READ_SLOW_MS = 200;
const ROLE_PARAM = 'mock-role';

const unsubscribeNothing: Unsubscribe = () => undefined;

const MOCK_THEME: Theme = {
  mode: 'DARK',
  primary: { main: '#D9B36C', contrastText: '#222222' },
  background: { default: '#2A2A2A', paper: '#333333' },
  text: { primary: '#DDDDDD', secondary: '#AAAAAA' },
};

type MetadataListener = (metadata: JsonObject) => void;

type ThemeListener = (theme: Theme) => void;

export type MockStorageBacking = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  keys: () => string[];
};

export type MockPlatform = Platform & {
  setTheme: (theme: Theme) => void;
  setRole: (role: PlayerRole) => void;
  setFailingStorageOperations: (operations: StorageOperation[]) => void;
  failNextSends: (failures: SendFailure[]) => void;
};

declare global {
  interface Window {
    // Playwright reaches the mock through this. The mock never enters a production build.
    setMockTheme: (theme: Theme) => void;
    mockPlatform: MockPlatform;
  }
}

const mockPlatform = createMockPlatform(createPageBus(), createPageBacking());

mockPlatform.setRole(roleFromPageUrl());

export const platform: Platform = mockPlatform;

window.setMockTheme = mockPlatform.setTheme;

window.mockPlatform = mockPlatform;

export function createMockPlatform(
  localBus: LocalBus = createMemoryBus(),
  backing: MockStorageBacking = createMemoryBacking(),
): MockPlatform {
  const metadataListeners = new Set<MetadataListener>();
  const themeListeners = new Set<ThemeListener>();
  const sendFailures: SendFailure[] = [];
  let role: PlayerRole = 'GM';
  let failingStorageOperations = new Set<StorageOperation>();
  let metadata: JsonObject = {};
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

        // One mock client has no peers, and Owlbear never echoes REMOTE to its sender.
        if (options.destination === 'LOCAL') {
          localBus.post(channel, data, MOCK_CONNECTION_ID);
        }

        return Promise.resolve(ok(undefined));
      },
      onMessage: (channel, callback) => localBus.subscribe(channel, callback),
    },
    metadata: {
      getRoomId: () => MOCK_ROOM_ID,
      getMetadata: () => Promise.resolve(structuredClone(metadata)),
      setMetadata: (update) => {
        const next: JsonObject = { ...metadata };

        for (const [key, value] of Object.entries(update)) {
          if (value === undefined) {
            delete next[key];
          } else {
            next[key] = structuredClone(value);
          }
        }

        metadata = next;

        for (const listener of metadataListeners) {
          listener(structuredClone(metadata));
        }

        return Promise.resolve();
      },
      onMetadataChange: (callback) => {
        metadataListeners.add(callback);

        return () => {
          metadataListeners.delete(callback);
        };
      },
    },
    party: {
      getPlayers: () => Promise.resolve([]),
      onChange: () => unsubscribeNothing,
    },
    player: {
      getId: () => Promise.resolve(MOCK_PLAYER_ID),
      getConnectionId: () => Promise.resolve(MOCK_CONNECTION_ID),
      getName: () => Promise.resolve(MOCK_PLAYER_NAME),
      getRole: () => Promise.resolve(role),
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
      show: () => Promise.resolve(MOCK_NOTIFICATION_ID),
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
    setRole: (next) => {
      role = next;
    },
    setFailingStorageOperations: (operations) => {
      failingStorageOperations = new Set(operations);
    },
    failNextSends: (failures) => {
      sendFailures.push(...failures);
    },
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

// Real pages of one mock client share this browser's storage, as Owlbear iframes do.
function createPageBacking(): MockStorageBacking {
  return {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => {
      localStorage.setItem(key, value);
    },
    remove: (key) => {
      localStorage.removeItem(key);
    },
    keys: () => Array.from({ length: localStorage.length }, readKey),
  };
}

function readKey(_value: undefined, index: number): string {
  return localStorage.key(index) ?? '';
}

function roleFromPageUrl(): PlayerRole {
  return new URLSearchParams(window.location.search).get(ROLE_PARAM) === 'PLAYER' ? 'PLAYER' : 'GM';
}
