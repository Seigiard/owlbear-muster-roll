// What a mock page reads from its URL and how it names a client's connection and storage. Free of
// side effects, so Playwright helpers can import it without starting a mock platform.

export const MOCK_ROOM_ID = 'mock-room';

export const MOCK_CONNECTION_ID = 'mock-connection';

// Both pages of one client carry the same client params.
export const CLIENT_PARAM = 'mock-client';

export const PLAYER_PARAM = 'mock-player';

export const ROLE_PARAM = 'mock-role';

export const NAME_PARAM = 'mock-name';

export const DEVICE_PARAM = 'mock-device';

// A shorter catch-up timeout for tests, in milliseconds. A production build reads only `TIMING`.
export const CATCH_UP_TIMEOUT_PARAM = 'mock-catch-up-timeout-ms';

// The party of a mock room lives in localStorage under this prefix and the room id, and a
// BroadcastChannel of this prefix and the room id tells the other pages it changed. It starts with
// `mock-`, so the default storage namespace never lists it.
export const PARTY_STORAGE_PREFIX = 'mock-party:';

export const PARTY_CHANNEL_PREFIX = 'muster-roll-mock-party:';

// Keys of a non-default device live under this prefix, and the default device lists no key that
// starts with `mock-`.
const DEVICE_STORAGE_PREFIX = 'mock-device:';

// An empty client is the one client every page had before rooms had several.
export function mockConnectionId(client: string): string {
  return client === '' ? MOCK_CONNECTION_ID : `${MOCK_CONNECTION_ID}-${client}`;
}

// The empty device is the browser's own storage, shared by every client that names none.
export function deviceStoragePrefix(device: string): string {
  return device === '' ? '' : `${DEVICE_STORAGE_PREFIX}${device}:`;
}
