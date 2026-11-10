import { describe, expect, test } from 'bun:test';

import type { JsonObject, JsonValue } from '@/core/json';
import { platform as currentPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';

import { LIGHT_THEME } from '../../../tests/support/colors';
import { createMemoryBus, createMemoryRoom, createMockPlatform, type MockPlatform } from './index';
import type { MockRoom } from './room';

describe('mock broadcast', () => {
  test('delivers a LOCAL message to a listener on the same channel', async () => {
    // #given
    const platform = createMockPlatform();
    const received: { data: JsonValue; connectionId: string }[] = [];

    platform.broadcast.onMessage('ui', (event) => {
      received.push(event);
    });

    // #when
    await platform.broadcast.sendMessage('ui', { t: 'ping' }, { destination: 'LOCAL' });

    // #then
    expect(received).toEqual([{ data: { t: 'ping' }, connectionId: 'mock-connection' }]);
  });

  test('does not deliver a message to a listener on another channel', async () => {
    // #given
    const platform = createMockPlatform();
    const received: JsonValue[] = [];

    platform.broadcast.onMessage('sync', (event) => {
      received.push(event.data);
    });

    // #when
    await platform.broadcast.sendMessage('ui', 'hello', { destination: 'LOCAL' });

    // #then
    expect(received).toEqual([]);
  });

  test('does not echo a REMOTE message to its sender', async () => {
    // #given
    const platform = createMockPlatform();
    const received: JsonValue[] = [];

    platform.broadcast.onMessage('sync', (event) => {
      received.push(event.data);
    });

    // #when
    await platform.broadcast.sendMessage('sync', 'hello', { destination: 'REMOTE' });

    // #then
    expect(received).toEqual([]);
  });

  test('stops calling a removed listener and keeps calling the others', async () => {
    // #given
    const platform = createMockPlatform();
    const removed: JsonValue[] = [];
    const kept: JsonValue[] = [];

    const unsubscribe = platform.broadcast.onMessage('ui', (event) => {
      removed.push(event.data);
    });

    platform.broadcast.onMessage('ui', (event) => {
      kept.push(event.data);
    });

    // #when
    unsubscribe();
    await platform.broadcast.sendMessage('ui', 'after', { destination: 'LOCAL' });

    // #then
    expect({ removed, kept }).toEqual({ removed: [], kept: ['after'] });
  });
});

describe('mock LOCAL bus shared between pages', () => {
  test('delivers a LOCAL message to every platform on the bus, the sender included', async () => {
    // #given
    const bus = createMemoryBus();
    const sender = createMockPlatform(bus);
    const receiver = createMockPlatform(bus);
    const received: string[] = [];

    sender.broadcast.onMessage('ui', () => {
      received.push('sender');
    });

    receiver.broadcast.onMessage('ui', () => {
      received.push('receiver');
    });

    // #when
    await sender.broadcast.sendMessage('ui', 'hello', { destination: 'LOCAL' });

    // #then
    expect(received).toEqual(['sender', 'receiver']);
  });
});

describe('mock room with several clients', () => {
  test('delivers REMOTE to every page of the other clients with the sender id, and to no page of the sender', async () => {
    // #given: client A has a background and a window on one LOCAL bus.
    const room = createMemoryRoom();
    const busA = createMemoryBus();
    const backgroundA = client(room, 'a', 'GM', busA);
    const windowA = client(room, 'a', 'GM', busA);
    const busB = createMemoryBus();
    const received: string[] = [];

    for (const [label, page] of [
      ['window A', windowA],
      ['background B', client(room, 'b', 'GM', busB)],
      ['window B', client(room, 'b', 'GM', busB)],
    ] as const) {
      page.broadcast.onMessage('sync', (event) => {
        received.push(`${label} from ${event.connectionId}`);
      });
    }

    // #when
    await backgroundA.broadcast.sendMessage('sync', 'hello', { destination: 'REMOTE' });

    // #then
    expect(received).toEqual(['background B from a', 'window B from a']);
  });

  test('keeps LOCAL within the sending client', async () => {
    // #given
    const room = createMemoryRoom();
    const busA = createMemoryBus();
    const backgroundA = client(room, 'a', 'GM', busA);
    const received: string[] = [];

    client(room, 'a', 'GM', busA).broadcast.onMessage('ui', () => {
      received.push('window A');
    });

    client(room, 'b').broadcast.onMessage('ui', () => {
      received.push('client B');
    });

    // #when
    await backgroundA.broadcast.sendMessage('ui', 'hello', { destination: 'LOCAL' });

    // #then
    expect(received).toEqual(['window A']);
  });

  test('lists every joined member but the caller, as Owlbear does', async () => {
    // #given
    const room = createMemoryRoom();
    const gm = client(room, 'a');
    const player = client(room, 'p', 'PLAYER');

    gm.joinParty();
    player.joinParty();

    // #when
    const seenByGm = await gm.party.getPlayers();

    // #then
    expect(seenByGm).toEqual([
      { id: 'player-p', connectionId: 'p', name: 'Name p', role: 'PLAYER' },
    ]);
  });

  test('tells party listeners about a join, a role change and a leave', () => {
    // #given
    const room = createMemoryRoom();
    const watcher = client(room, 'w');
    const other = client(room, 'b');
    const seen: string[][] = [];

    watcher.party.onChange((players) => {
      seen.push(players.map((player) => `${player.connectionId} ${player.role}`));
    });

    // #when
    other.joinParty();
    other.setRole('PLAYER');
    other.leaveParty();

    // #then
    expect(seen).toEqual([['b GM'], ['b PLAYER'], []]);
  });

  test('puts a message on the room as if another connection had sent it', () => {
    // #given
    const room = createMemoryRoom();
    const sender = client(room, 'a');
    const received: string[] = [];

    client(room, 'b').broadcast.onMessage('sync', (event) => {
      received.push(event.connectionId);
    });

    // #when
    sender.sendRemoteAs('stranger', 'sync', 'hello');

    // #then
    expect(received).toEqual(['stranger']);
  });

  test('reads its own player from the client it was made for', async () => {
    // #given
    const platform = client(createMemoryRoom(), 'a', 'PLAYER');

    // #when
    const read = await Promise.all([
      platform.player.getId(),
      platform.player.getConnectionId(),
      platform.player.getName(),
      platform.player.getRole(),
    ]);

    // #then
    expect(read).toEqual(['player-a', 'a', 'Name a', 'PLAYER']);
  });
});

describe('mock send failures', () => {
  test('reports a simulated rate limit and delivers nothing', async () => {
    // #given
    const platform = createMockPlatform();
    const received: JsonValue[] = [];

    platform.broadcast.onMessage('ui', (event) => {
      received.push(event.data);
    });

    platform.failNextSends([{ kind: 'rate-limited' }]);

    // #when
    const result = await platform.broadcast.sendMessage('ui', 'x', { destination: 'LOCAL' });

    // #then
    expect({ result, received }).toEqual({
      result: { ok: false, error: { kind: 'rate-limited' } },
      received: [],
    });
  });

  test('fails only the simulated number of sends', async () => {
    // #given
    const platform = createMockPlatform();

    platform.failNextSends([{ kind: 'failed', reason: 'gone' }]);
    await platform.broadcast.sendMessage('ui', 'first', { destination: 'LOCAL' });

    // #when
    const second = await platform.broadcast.sendMessage('ui', 'second', { destination: 'LOCAL' });

    // #then
    expect(second).toEqual({ ok: true, value: undefined });
  });
});

describe('mock role', () => {
  test('is the GM until a test changes it', async () => {
    // #given
    const platform = createMockPlatform();
    const initial = await platform.player.getRole();

    // #when
    platform.setRole('PLAYER');

    // #then
    expect({ initial, changed: await platform.player.getRole() }).toEqual({
      initial: 'GM',
      changed: 'PLAYER',
    });
  });
});

describe('mock metadata', () => {
  test('merges an update and removes keys set to undefined', async () => {
    // #given
    const platform = createMockPlatform();

    await platform.metadata.setMetadata({ keep: 1, drop: 2 });

    // #when
    await platform.metadata.setMetadata({ drop: undefined, add: 3 });

    // #then
    expect(await platform.metadata.getMetadata()).toEqual({ keep: 1, add: 3 });
  });

  test('stops notifying a removed metadata listener', async () => {
    // #given
    const platform = createMockPlatform();
    const seen: JsonValue[] = [];

    const unsubscribe = platform.metadata.onMetadataChange((metadata) => {
      seen.push(metadata);
    });

    await platform.metadata.setMetadata({ first: 1 });

    // #when
    unsubscribe();
    await platform.metadata.setMetadata({ second: 2 });

    // #then
    expect(seen).toEqual([{ first: 1 }]);
  });
});

describe('mock metadata isolation', () => {
  test('keeps nested values out of reach of writers, listeners and readers', async () => {
    // #given
    const platform = createMockPlatform();
    const written: number[] = [1];

    platform.metadata.onMetadataChange(pushIntoList);
    await platform.metadata.setMetadata({ list: written });

    // #when
    written.push(2);
    pushIntoList(await platform.metadata.getMetadata());

    // #then
    expect(await platform.metadata.getMetadata()).toEqual({ list: [1] });
  });
});

describe('mock storage', () => {
  test('reads back a stored value and lists its key', () => {
    // #given
    const platform = createMockPlatform();

    // #when
    platform.storage.setItem('mr1:room:0::preset', 'value');

    // #then
    expect({
      value: platform.storage.getItem('mr1:room:0::preset'),
      keys: platform.storage.keys(),
    }).toEqual({
      value: { ok: true, value: 'value' },
      keys: { ok: true, value: ['mr1:room:0::preset'] },
    });
  });

  test('returns null for a removed key', () => {
    // #given
    const platform = createMockPlatform();

    platform.storage.setItem('key', 'value');

    // #when
    platform.storage.removeItem('key');

    // #then
    expect(platform.storage.getItem('key')).toEqual({ ok: true, value: null });
  });

  test('reports a simulated write failure and keeps the stored value', () => {
    // #given
    const platform = createMockPlatform();

    platform.storage.setItem('key', 'old');
    platform.setFailingStorageOperations(['write']);

    // #when
    const written = platform.storage.setItem('key', 'new');

    // #then
    expect({ written, read: platform.storage.getItem('key') }).toEqual({
      written: { ok: false, error: { operation: 'write', reason: 'mock storage failure' } },
      read: { ok: true, value: 'old' },
    });
  });

  test.each([
    ['read', 'getItem'],
    ['remove', 'removeItem'],
    ['list', 'keys'],
  ] as const)('reports a simulated %s failure from %s', (operation, method) => {
    // #given
    const platform = createMockPlatform();

    platform.setFailingStorageOperations([operation]);

    // #when
    const result = platform.storage[method]('key');

    // #then
    expect(result).toEqual({ ok: false, error: { operation, reason: 'mock storage failure' } });
  });

  test('stops failing once the failing operations are cleared', () => {
    // #given
    const platform = createMockPlatform();

    platform.setFailingStorageOperations(['write']);
    platform.setFailingStorageOperations([]);

    // #when
    const written = platform.storage.setItem('key', 'value');

    // #then
    expect(written).toEqual({ ok: true, value: undefined });
  });
});

describe('mock theme', () => {
  test('tells listeners about a theme change and returns it on the next read', async () => {
    // #given
    const platform = createMockPlatform();
    const seen: string[] = [];

    platform.theme.onChange((theme) => {
      seen.push(theme.mode);
    });

    // #when
    platform.setTheme(LIGHT_THEME);

    // #then
    expect({ seen, read: (await platform.theme.getTheme()).mode }).toEqual({
      seen: ['LIGHT'],
      read: 'LIGHT',
    });
  });

  test('stops calling a removed theme listener', () => {
    // #given
    const platform = createMockPlatform();
    const seen: string[] = [];

    const unsubscribe = platform.theme.onChange((theme) => {
      seen.push(theme.mode);
    });

    // #when
    unsubscribe();
    platform.setTheme(LIGHT_THEME);

    // #then
    expect(seen).toEqual([]);
  });
});

describe('mock readiness', () => {
  test('calls the ready callback', async () => {
    // #given
    const platform = createMockPlatform();

    // #when
    const ready = await new Promise<boolean>((resolve) => {
      platform.onReady(() => {
        resolve(true);
      });
    });

    // #then
    expect(ready).toBe(true);
  });
});

describe('current platform under bun test', () => {
  test('resolves to the mock adapter', () => {
    // #when
    const roomId = currentPlatform.metadata.getRoomId();

    // #then
    expect(roomId).toBe('mock-room');
  });
});

function client(
  room: MockRoom,
  connectionId: string,
  role: PlayerRole = 'GM',
  bus = createMemoryBus(),
): MockPlatform {
  return createMockPlatform(bus, undefined, {
    room,
    connectionId,
    playerId: `player-${connectionId}`,
    name: `Name ${connectionId}`,
    role,
  });
}

function pushIntoList(metadata: JsonObject): void {
  const list = metadata['list'];

  if (!Array.isArray(list)) {
    throw new Error('metadata has no list');
  }

  list.push(99);
}
