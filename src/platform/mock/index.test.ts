import { describe, expect, test } from 'bun:test';
import type { JsonObject, JsonValue } from '@/core/json';
import { platform as currentPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import { LIGHT_THEME } from '../../../tests/support/colors';
import { createMemoryBus, createMemoryRoom, createMockPlatform, type MockPlatform } from './index';
import { createPageRoom, type MockRoom, type MockScene } from './room';

describe('mock broadcast', () => {
  test('delivers a LOCAL message to a listener on the same channel', async () => {
    // #given
    const platform = createMockPlatform();

    const received: {
      data: JsonValue;
      connectionId: string;
    }[] = [];

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

describe('mock room metadata', () => {
  test('drops a write past 16 kB in silence, as Owlbear does, and keeps what the room held', async () => {
    // #given
    const room = createMemoryRoom();
    const writer = client(room, 'a', 'GM');
    const heard: JsonObject[] = [];
    await writer.metadata.setMetadata({ kept: 1 });
    writer.metadata.onMetadataChange((metadata) => {
      heard.push(metadata);
    });
    // #when
    await writer.metadata.setMetadata({ big: 'x'.repeat(16 * 1024) });
    // #then
    expect({ read: await writer.metadata.getMetadata(), heard }).toEqual({
      read: { kept: 1 },
      heard: [],
    });
  });
  test('one client reads what another client of the room wrote, and its listener hears it', async () => {
    // #given
    const room = createMemoryRoom();
    const writer = client(room, 'a', 'GM');
    const reader = client(room, 'b', 'PLAYER');
    const heard: JsonObject[] = [];
    reader.metadata.onMetadataChange((metadata) => {
      heard.push(metadata);
    });
    // #when
    await writer.metadata.setMetadata({ copy: { v: 1 } });
    // #then
    expect({ read: await reader.metadata.getMetadata(), heard }).toEqual({
      read: { copy: { v: 1 } },
      heard: [{ copy: { v: 1 } }],
    });
  });
  test('a client of another room reads none of it', async () => {
    // #given
    const writer = client(createMemoryRoom(), 'a', 'GM');
    const other = client(createMemoryRoom(), 'b', 'GM');
    // #when
    await writer.metadata.setMetadata({ copy: 1 });
    // #then
    expect(await other.metadata.getMetadata()).toEqual({});
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

describe('mock map selection', () => {
  test("adds and removes items as Owlbear's select with no replace and deselect do, for every page of the client only", async () => {
    // #given: client A has a background and a window, client B one page.
    const room = createMemoryRoom();
    const busA = createMemoryBus();
    const windowA = client(room, 'a', 'GM', busA);
    const backgroundA = client(room, 'a', 'GM', busA);
    const pageB = client(room, 'b', 'GM', createMemoryBus());
    const heard: string[][] = [];
    windowA.setMapSelection(['tree']);
    backgroundA.selection.onChange((itemIds) => {
      heard.push(itemIds);
    });
    // #when
    await windowA.selection.select(['t1', 't2', 'tree']);
    await windowA.selection.deselect(['t1', 'missing']);
    // #then
    expect({
      a: await backgroundA.selection.getSelection(),
      b: await pageB.selection.getSelection(),
      heard,
    }).toEqual({
      a: ['tree', 't2'],
      b: [],
      heard: [
        ['tree', 't1', 't2'],
        ['tree', 't2'],
      ],
    });
  });
  test('an empty list and a selection of the same ids call nothing back', async () => {
    // #given
    const platform = createMockPlatform();
    const heard: string[][] = [];
    platform.setMapSelection(['t1']);
    platform.selection.onChange((itemIds) => {
      heard.push(itemIds);
    });
    // #when
    await platform.selection.select([]);
    await platform.selection.deselect([]);
    await platform.selection.select(['t1']);
    // #then
    expect(heard).toEqual([]);
  });
  test('a failed write rejects and leaves the selection as it was', async () => {
    // #given
    const platform = createMockPlatform();
    platform.setMapSelection(['t1']);
    platform.failNextSelectionWrite();

    // #when
    const outcome = await platform.selection.deselect(['t1']).then(
      () => 'resolved',
      () => 'rejected',
    );

    // #then
    expect({ outcome, selection: await platform.selection.getSelection() }).toEqual({
      outcome: 'rejected',
      selection: ['t1'],
    });
  });
});

describe('mock scene', () => {
  test('opens ready with no item', async () => {
    // #given
    const platform = createMockPlatform();

    // #when
    const scene = {
      ready: await platform.scene.isReady(),
      items: await platform.scene.getItemIds(),
    };

    // #then
    expect(scene).toEqual({ ready: true, items: [] });
  });
  test('is one scene for the room: every client hears each change, a repeated one included', async () => {
    // #given
    const room = createMemoryRoom();
    const writer = client(room, 'a', 'GM');
    const reader = client(room, 'b', 'GM');
    const heard: string[] = [];
    reader.scene.onReadyChange((ready) => {
      heard.push(`ready ${String(ready)}`);
    });
    reader.scene.onItemsChange((itemIds) => {
      heard.push(`items ${itemIds.join(',')}`);
    });
    // #when
    writer.addSceneItems(['t1', 't2']);
    writer.addSceneItems(['t2']);
    writer.removeSceneItems(['t1']);
    writer.setSceneReady(false);
    writer.setSceneItems(['other']);
    writer.setSceneReady(true);
    // #then
    expect({ heard, items: await reader.scene.getItemIds() }).toEqual({
      heard: ['items t1,t2', 'items t1,t2', 'items t2', 'ready false', 'items other', 'ready true'],
      items: ['other'],
    });
  });
  test('stops calling a removed scene listener', () => {
    // #given
    const platform = createMockPlatform();
    const heard: string[][] = [];

    const unsubscribe = platform.scene.onItemsChange((itemIds) => {
      heard.push(itemIds);
    });

    // #when
    unsubscribe();
    platform.addSceneItems(['t1']);
    // #then
    expect(heard).toEqual([]);
  });
});

describe('mock scene labels', () => {
  test('reads "" for an item with no label, the label once set, and null for an item not in the scene or with no label text', async () => {
    // #given
    const platform = createMockPlatform();
    platform.addSceneItems(['t1', 't2', 'circle']);
    platform.setSceneItemLabel('t2', 'Гоблин 2');
    platform.setSceneItemLabel('circle', null);
    platform.setSceneItemLabel('absent', 'Призрак');

    // #when
    const read = {
      t1: await platform.scene.getItemLabel('t1'),
      t2: await platform.scene.getItemLabel('t2'),
      circle: await platform.scene.getItemLabel('circle'),
      absent: await platform.scene.getItemLabel('absent'),
      hook: platform.sceneItemLabel('absent'),
    };

    // #then
    expect(read).toEqual({ t1: '', t2: 'Гоблин 2', circle: null, absent: null, hook: null });
  });
  test('a label write shows to every client of the room as one item change, the list unchanged', async () => {
    // #given
    const room = createMemoryRoom();
    const writer = client(room, 'a', 'GM');
    const reader = client(room, 'b', 'GM');
    const heard: string[][] = [];
    writer.addSceneItems(['t1', 'map']);
    reader.scene.onItemsChange((itemIds) => {
      heard.push(itemIds);
    });
    // #when
    await writer.scene.setItemLabel('t1', 'Арагорн');
    // #then
    expect({
      heard,
      label: reader.sceneItemLabel('t1'),
      other: reader.sceneItemLabel('map'),
    }).toEqual({ heard: [['t1', 'map']], label: 'Арагорн', other: '' });
  });
  test.each<[string, string, PlayerRole, string | null]>([
    ['an item not in the scene', 'absent', 'GM', null],
    ['an item with no label text', 'circle', 'GM', null],
    ['a player client', 't1', 'PLAYER', 'Гоблин'],
  ])('a label write to %s rejects and changes nothing', async (_name, itemId, role, label) => {
    // #given
    const room = createMemoryRoom();
    const platform = client(room, 'a', role);
    platform.addSceneItems(['t1', 'circle']);
    platform.setSceneItemLabel('t1', 'Гоблин');
    platform.setSceneItemLabel('circle', null);
    // #when
    const [write] = await Promise.allSettled([platform.scene.setItemLabel(itemId, 'Арагорн')]);
    // #then
    expect({ write: write?.status, label: platform.sceneItemLabel(itemId) }).toEqual({
      write: 'rejected',
      label,
    });
  });
  test('an item keeps its label when it leaves the scene and comes back', () => {
    // #given
    const platform = createMockPlatform();
    platform.addSceneItems(['t1', 't2']);
    platform.setSceneItemLabel('t1', 'Арагорн');
    platform.setSceneItemLabel('t2', 'Гоблин');
    // #when: t1 leaves and comes back; t2 leaves with another list and comes back.
    platform.removeSceneItems(['t1']);
    platform.addSceneItems(['t1']);
    platform.setSceneItems(['t1']);
    platform.addSceneItems(['t2']);
    // #then
    expect({ t1: platform.sceneItemLabel('t1'), t2: platform.sceneItemLabel('t2') }).toEqual({
      t1: 'Арагорн',
      t2: 'Гоблин',
    });
  });
  test('records each label call, and fails only the listed next calls', async () => {
    // #given
    const platform = createMockPlatform();
    platform.addSceneItems(['t1']);
    platform.failNextSceneLabelCalls(['read', 'write']);

    // #when
    const outcomes = await Promise.allSettled([
      platform.scene.getItemLabel('t1'),
      platform.scene.setItemLabel('t1', 'Арагорн'),
      platform.scene.getItemLabel('t1'),
    ]);

    // #then
    expect({
      outcomes: outcomes.map((outcome) => outcome.status),
      calls: platform.sceneLabelCalls(),
      label: platform.sceneItemLabel('t1'),
    }).toEqual({
      outcomes: ['rejected', 'rejected', 'fulfilled'],
      calls: [
        { kind: 'read', itemId: 't1' },
        { kind: 'write', itemId: 't1' },
        { kind: 'read', itemId: 't1' },
      ],
      label: '',
    });
  });
});

describe('mock page room scene', () => {
  test('another page hears every step in order, even when it reads them after the last one', async () => {
    // #given
    const writer = createPageRoom('scene-order-room');
    const reader = createPageRoom('scene-order-room');
    const heard: string[] = [];
    reader.onSceneChange((scene, change) => {
      heard.push(`${change} ${String(scene.ready)} ${scene.itemIds.join(',')}`);
    });
    // #when: three steps before the first message can arrive.
    writer.setScene({ ready: false, itemIds: [], labels: {} }, 'ready');
    writer.setScene({ ready: false, itemIds: ['b1'], labels: {} }, 'items');
    writer.setScene({ ready: true, itemIds: ['b1'], labels: { b1: 'Гоблин' } }, 'ready');
    await waitFor(() => heard.length === 3);
    // #then
    const read: MockScene = reader.getScene();
    expect({ heard, read }).toEqual({
      heard: ['ready false ', 'items false b1', 'ready true b1'],
      read: { ready: true, itemIds: ['b1'], labels: { b1: 'Гоблин' } },
    });
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

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;

  while (!condition() && Date.now() < deadline) {
    // Polling is the point here: the channel delivers on its own schedule.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 2);
    });
  }
}
