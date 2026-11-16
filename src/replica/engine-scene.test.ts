import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type LinkData, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL } from '@/core/ui-messages';
import type { ContextMenuKeyFilter, PlayerRole } from '@/platform/ports';
import {
  createRoomRig,
  pause,
  send,
  shown,
  storedRecord,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

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

// "pc" links whole sheets, and "npc" links its repeat blocks.
const PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] }],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      tabs: [
        {
          sections: [
            { repeat: true, tokens: true, rows: [[{ kind: 'field', type: 'text', id: 'mob' }]] },
          ],
        },
      ],
    },
  ],
};

// The link data of "Брок" and of the NPC "Скелет".
const BROK: LinkData = { s: 'brok' };
const SKEL: LinkData = { s: 'npc', i: 'sk1' };

// "Брок" has the tokens t1 and t2, "Скелет" has t3.
const SEEDED: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:name', d: { name: 'Брок' }, c: 1, a: 'seed' },
  { k: 'rep:npc:mob:sk1', d: { order: 0, cells: { mob: 'Скелет' } }, c: 1, a: 'seed' },
  { k: 'link:t1', d: BROK, c: 1, a: 'seed' },
  { k: 'link:t2', d: BROK, c: 1, a: 'seed' },
  { k: 'link:t3', d: SKEL, c: 1, a: 'seed' },
];

type Client = RigClient & {
  // Every `command-rejected` the engine sent on the LOCAL channel.
  rejections: string[];
  // How many times the engine called the scene port, subscriptions included.
  sceneCalls: () => number;
};

type Room = RigRoom;

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
};

const roomRig = createRoomRig({ seeded: SEEDED });

describe('a token deleted from the open scene', () => {
  test('an engine-made scene command sends no command-done to windows', async () => {
    // #given
    const room = openRoom(['t1']);
    const client = await startClient(room, 'gm-a');

    // #when
    client.platform.removeSceneItems(['t1']);
    await waitUntil(() => committed(room, 'gm-a').length === 1);
    await pause(SETTLE_MS);

    // #then
    expect(client.local.filter((message) => Object(message).t === 'command-done').length).toBe(0);
  });

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
      stored: storedRecord(client, 'link:t1'),
      shown: shown(client, 'link:t1'),
      others: [storedRecord(client, 'link:t2')?.d, storedRecord(client, 'link:t3')?.d],
      unlinkFilter: unlinkIds(client),
    }).toEqual({
      sent: [tombstone],
      stored: tombstone,
      shown: tombstone,
      others: [BROK, SKEL],
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
      kept: storedRecord(client, 'link:t2')?.d,
    }).toEqual({
      sent: [
        ['link:t1', null],
        ['link:t3', null],
      ],
      kept: BROK,
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
      links: ['t1', 't2', 't3'].map((tokenId) => storedRecord(client, `link:${tokenId}`)?.d),
    }).toEqual({ sent: [], links: [BROK, BROK, SKEL] });
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
      links: ['t1', 't2', 't3'].map((tokenId) => storedRecord(client, `link:${tokenId}`)?.d),
    }).toEqual({ sent: [], links: [BROK, BROK, SKEL] });
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
      t1: storedRecord(client, 'link:t1')?.d,
    }).toEqual({ whileLoading: [], sent: ['link:t2'], t1: BROK });
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
    expect({
      sent: committed(room, 'gm-a').length,
      link: storedRecord(client, 'link:t1')?.d,
    }).toEqual({
      sent: 1,
      link: null,
    });
  });

  test('does nothing on a player client, which never reads the scene', async () => {
    // #given: the GM's link reached the player through a catch-up answer.
    const room = openRoom(['t1']);
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, 'player-a', { role: 'PLAYER' });

    await waitUntil(() => sameData(shown(player, 'link:t1'), BROK));
    gm.stop();

    // #when
    player.platform.removeSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #then
    expect({
      sceneCalls: player.sceneCalls(),
      sent: room.heard.filter((message) => message.from === 'player-a' && isEdit(message.data)),
      link: shown(player, 'link:t1')?.d,
    }).toEqual({ sceneCalls: 0, sent: [], link: BROK });
  });

  test('does not show the unlink failure notice for an unrelated rejected command', async () => {
    // #given
    const room = openRoom(['t1']);
    const player = await startClient(room, 'player-a', { role: 'PLAYER' });

    // #when
    const id = send(player, { type: 'sheet-create', sheetId: 'late', set: 'pc' });
    await waitUntil(() => player.rejections.includes(id));

    // #then
    expect(player.platform.shownNotifications()).toEqual([]);
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
      t1: storedRecord(client, 'link:t1')?.d,
    }).toEqual({ beforeRemoval: [], sent: ['link:t2'], t1: BROK });
  });
});

describe('the watch', () => {
  test('subscribes again after a demotion and later promotion', async () => {
    // #given
    const room = openRoom(['t1', 't2']);
    const client = await startClient(room, 'gm-a');

    client.platform.setRole('PLAYER');
    await waitUntil(() => client.store.$sync.get().role === 'PLAYER');
    client.platform.setRole('GM');
    await waitUntil(() => isLive(client) && client.store.$sync.get().role === 'GM');

    // #when
    client.platform.removeSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #then
    expect(storedRecord(client, 'link:t1')).toEqual({
      k: 'link:t1',
      d: null,
      c: 2,
      a: 'gm-a',
    });
  });

  test('stops, with the removals it held, when the GM becomes a player', async () => {
    // #given: a catch-up held open keeps the removal of t1 waiting.
    const room = openRoom(['t1', 't2']);

    room.join(GHOST, 'GM');

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
      links: [storedRecord(client, 'link:t1')?.d, storedRecord(client, 'link:t2')?.d],
    }).toEqual({ callsAsPlayer: 0, sent: [], links: [BROK, BROK] });
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

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 300 },
      seeded: SEEDED.filter((record) => record.k !== 'link:t1'),
    });

    // #when
    client.platform.removeSceneItems(['t1']);
    post(room, GHOST, commit([{ k: 'link:t1', d: BROK, c: 1, a: 'seed' }]));
    await waitUntil(() => sameData(storedRecord(client, 'link:t1'), BROK));
    await pause(SETTLE_MS);

    const during = { state: client.store.$sync.get().state, sent: committed(room, 'gm-a') };

    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    expect({
      during,
      sent: committed(room, 'gm-a').map((record) => [record.k, record.d]),
      kept: storedRecord(client, 'link:t2')?.d,
    }).toEqual({
      during: { state: 'catching-up', sent: [] },
      sent: [['link:t1', null]],
      kept: BROK,
    });
  });

  test('sends nothing and shows nothing when another GM cleared the link meanwhile', async () => {
    // #given
    const room = openRoom(['t1']);

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 300 } });

    client.platform.removeSceneItems(['t1']);
    post(room, GHOST, commit([{ k: 'link:t1', d: null, c: 2, a: GHOST }]));
    await waitUntil(() => storedRecord(client, 'link:t1')?.d === null);

    // #when
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await pause(SETTLE_MS);

    // #then
    expect({
      sent: committed(room, 'gm-a'),
      link: storedRecord(client, 'link:t1'),
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
    await waitUntil(() => storedRecord(second, 'link:t1')?.d === null);
    first.platform.addSceneItems(['map']);
    await pause(SETTLE_MS);

    // #when
    send(second, { type: 'link-set', tokenId: 't1', sheetId: 'npc', instanceId: 'sk1' });
    await waitUntil(() => (storedRecord(second, 'link:t1')?.c ?? 0) >= 3);
    await pause(SETTLE_MS);

    // #then
    expect({
      first: storedRecord(first, 'link:t1')?.d,
      second: storedRecord(second, 'link:t1')?.d,
      cleared: committed(room, 'gm-a').filter((record) => record.c === 4),
    }).toEqual({
      first: null,
      second: null,
      cleared: [{ k: 'link:t1', d: null, c: 4, a: 'gm-a' }],
    });
  });

  test('forgets the oldest deletion after the bounded scene history fills', async () => {
    // #given
    const removed = Array.from({ length: 1025 }, (_, index) => `old-${index}`);
    const room = openRoom([...removed, 'anchor']);
    const oldest: VersionedRecord = { k: 'link:old-0', d: BROK, c: 1, a: 'seed' };
    const first = await startClient(room, 'gm-a', { seeded: [...SEEDED, oldest] });

    room.join(GHOST, 'GM');
    await pause(SETTLE_MS);
    first.platform.removeSceneItems(removed);
    await pause(SETTLE_MS);

    const relinked: VersionedRecord = { ...oldest, c: 3, a: GHOST };

    // #when
    post(room, GHOST, commit([relinked]));
    await waitUntil(() => (storedRecord(first, oldest.k)?.c ?? 0) >= 3);
    await pause(SETTLE_MS);

    // #then
    expect(storedRecord(first, oldest.k)).toEqual(relinked);
  });

  test('a token back in the scene, as after an undo, can be linked again', async () => {
    // #given
    const room = openRoom(['t1']);
    const first = await startClient(room, 'gm-a');
    const second = await startClient(room, 'gm-b');

    await waitUntil(() => isLive(second));
    first.platform.removeSceneItems(['t1']);
    await waitUntil(() => storedRecord(first, 'link:t1')?.d === null);
    first.platform.addSceneItems(['t1']);
    await pause(SETTLE_MS);

    // #when
    send(second, { type: 'link-set', tokenId: 't1', sheetId: 'npc', instanceId: 'sk1' });
    await waitUntil(() => sameData(storedRecord(first, 'link:t1'), SKEL));
    await pause(SETTLE_MS);

    // #then
    expect({
      first: storedRecord(first, 'link:t1')?.d,
      second: storedRecord(second, 'link:t1')?.d,
    }).toEqual({
      first: SKEL,
      second: SKEL,
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
      first: storedRecord(first, 'link:t1'),
      second: storedRecord(second, 'link:t1'),
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
): Promise<Client> {
  let sceneCalls = 0;
  const rejections: string[] = [];

  const client = await roomRig.startClient(room, connectionId, {
    ...options,
    engine: { menuCopy: MENU_COPY },
    platform: (platform) => {
      const scene = platform.scene;

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

      roomRig.cleanup(
        platform.broadcast.onMessage(UI_CHANNEL, (event) => {
          if (Object(event.data).t === 'command-rejected') {
            rejections.push(String(Object(event.data).id));
          }
        }),
      );

      return platform;
    },
  });

  return {
    ...client,
    rejections,
    sceneCalls: () => sceneCalls,
  };
}

// A room whose open scene holds these items.
function openRoom(itemIds: string[], ready = true): Room {
  return roomRig.openRoom({ itemIds, ready });
}

function post(room: Room, from: string, data: JsonValue): void {
  room.room.postRemote(SYNC_CHANNEL, data, from);
}

function commit(records: VersionedRecord[]): JsonValue {
  return { v: 3, g: INITIAL, t: 'commit', records };
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

// Records hold their data as JSON, so two equal links are two objects.
function sameData(record: VersionedRecord | null | undefined, d: JsonValue): boolean {
  return JSON.stringify(record?.d) === JSON.stringify(d);
}
