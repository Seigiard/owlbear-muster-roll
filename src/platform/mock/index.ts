import type { JsonObject } from '@/core/json';
import type { BroadcastEvent, Platform, Theme, Unsubscribe } from '@/platform/ports';

const MOCK_ROOM_ID = 'mock-room';
const MOCK_PLAYER_ID = 'mock-player';
const MOCK_CONNECTION_ID = 'mock-connection';
const MOCK_PLAYER_NAME = 'Mock GM';
const MOCK_NOTIFICATION_ID = 'mock-notification';
const THEME_READ_FAILS_PARAM = 'mock-theme-read-fails';
const THEME_READ_SLOW_PARAM = 'mock-theme-read-slow';
const THEME_READ_SLOW_MS = 200;

const unsubscribeNothing: Unsubscribe = () => undefined;

const MOCK_THEME: Theme = {
  mode: 'DARK',
  primary: { main: '#D9B36C', contrastText: '#222222' },
  background: { default: '#2A2A2A', paper: '#333333' },
  text: { primary: '#DDDDDD', secondary: '#AAAAAA' },
};

type BroadcastListener = (event: BroadcastEvent) => void;

type MetadataListener = (metadata: JsonObject) => void;

type ThemeListener = (theme: Theme) => void;

export type MockPlatform = Platform & { setTheme: (theme: Theme) => void };

declare global {
  interface Window {
    // Playwright reaches the mock through this. The mock never enters a production build.
    setMockTheme: (theme: Theme) => void;
  }
}

const mockPlatform = createMockPlatform();

export const platform: Platform = mockPlatform;

window.setMockTheme = mockPlatform.setTheme;

export function createMockPlatform(): MockPlatform {
  const broadcastListeners = new Map<string, Set<BroadcastListener>>();
  const metadataListeners = new Set<MetadataListener>();
  const themeListeners = new Set<ThemeListener>();
  const stored = new Map<string, string>();
  let metadata: JsonObject = {};
  let currentTheme = MOCK_THEME;

  return {
    onReady: (callback) => {
      queueMicrotask(callback);
    },
    broadcast: {
      sendMessage: (channel, data, options) => {
        // One mock client has no peers, and Owlbear never echoes REMOTE to its sender.
        if (options.destination === 'LOCAL') {
          for (const listener of broadcastListeners.get(channel) ?? []) {
            listener({ data: structuredClone(data), connectionId: MOCK_CONNECTION_ID });
          }
        }

        return Promise.resolve();
      },
      onMessage: (channel, callback) => {
        const listeners = broadcastListeners.get(channel) ?? new Set<BroadcastListener>();

        broadcastListeners.set(channel, listeners);
        listeners.add(callback);

        return () => {
          listeners.delete(callback);
        };
      },
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
      getRole: () => Promise.resolve('GM'),
    },
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        stored.set(key, value);
      },
      removeItem: (key) => {
        stored.delete(key);
      },
      keys: () => [...stored.keys()],
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
  };
}
