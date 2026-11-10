import { describe, expect, test } from 'bun:test';

import type { JsonObject, JsonValue } from '@/core/json';
import { platform as currentPlatform } from '@/platform/current';

import { createMockPlatform } from './index';

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
    }).toEqual({ value: 'value', keys: ['mr1:room:0::preset'] });
  });

  test('returns null for a removed key', () => {
    // #given
    const platform = createMockPlatform();

    platform.storage.setItem('key', 'value');

    // #when
    platform.storage.removeItem('key');

    // #then
    expect(platform.storage.getItem('key')).toBeNull();
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

function pushIntoList(metadata: JsonObject): void {
  const list = metadata['list'];

  if (!Array.isArray(list)) {
    throw new Error('metadata has no list');
  }

  list.push(99);
}
