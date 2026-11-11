import { afterEach, describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import type { Command } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { ContextMenuIconFilter, PlayerRole } from '@/platform/ports';
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
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
};

const STORAGE_PREFIX = 'mr2:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const GHOST = 'ghost-gm';
const LINK_ITEM = 'app.muster-roll/link-sheet';
const UNLINK_ITEM = 'app.muster-roll/unlink-sheet';
const OPEN_ITEM = 'app.muster-roll/open-sheet';
const UNLINK_FAILED = 'Не удалось отвязать лист. Попробуйте ещё раз.';

const MENU_COPY = {
  linkSheet: 'Привязать лист…',
  unlinkSheet: 'Отвязать лист',
  openSheet: 'Открыть лист',
  unlinkFailed: UNLINK_FAILED,
};

// "pc" links whole sheets and has a repeat section a token cannot link to. "npc" links only its
// repeat blocks.
const PRESET: Preset = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      sections: [
        {
          rows: [
            [{ kind: 'field', type: 'text', id: 'name' }],
            [{ kind: 'field', type: 'number', id: 'str' }],
          ],
        },
        { repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'item' }]] },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [
        {
          repeat: true,
          tokens: true,
          rows: [
            [
              { kind: 'field', type: 'text', id: 'mob' },
              { kind: 'field', type: 'number', id: 'hp' },
            ],
          ],
        },
      ],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

// "Брок" is live and "Лиза" was deleted. The NPC "Скелет" is a live repeat block, "gone" a removed
// one, and "Меч" a live repeat block of a section no token links to.
const BASE: readonly VersionedRecord[] = [
  PRESET_RECORD,
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:name', d: { name: 'Брок' }, c: 1, a: 'seed' },
  { k: 'rep:brok:item:sword', d: { order: 0, cells: { item: 'Меч' } }, c: 1, a: 'seed' },
  { k: 'sheet:liza', d: null, c: 2, a: 'seed' },
  { k: 'rep:npc:mob:sk1', d: { order: 0, cells: { mob: 'Скелет', hp: 7 } }, c: 1, a: 'seed' },
  { k: 'rep:npc:mob:gone', d: null, c: 2, a: 'seed' },
];

// A field edit, which changes no menu filter.
const FIELD_EDIT: Command = {
  type: 'field-patch',
  sheetId: 'brok',
  target: { kind: 'row', rowId: 'str' },
  fieldId: 'str',
  value: 3,
};

// "Привязать лист…" for any token of the character layer.
const LINK_ANY: ContextMenuIconFilter = {
  max: 1,
  roles: ['GM'],
  every: [{ key: 'layer', value: 'CHARACTER' }],
};

type Client = {
  platform: MockPlatform;
  stop: () => void;
  backing: MockStorageBacking;
  store: ProjectionStore;
  window: ReplicaClient;
};

type Heard = { from: string; data: JsonValue };

type Room = { room: MockRoom; heard: Heard[] };

type ClientOptions = {
  // Port calls that fail from the start, before the first catch-up creates the menu.
  failMenuCalls?: ('create' | 'remove')[];
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
};

// One menu item as Owlbear gets it: its id, and each icon's label and filter.
type OwlbearMenuItem = {
  id: string;
  icons: { label: string; filter: ContextMenuIconFilter | null }[];
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('link-set', () => {
  test('writes link:{tokenId} with the sheet id at c: 1 by this connection, saved and sent', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, { type: 'link-set', tokenId: 't1', sheetId: 'brok', instanceId: null });
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    const expected: VersionedRecord = { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'gm-a' };

    expect({
      shown: shown(client, 'link:t1'),
      stored: stored(client, 'link:t1'),
      sent: committed(room, 'gm-a'),
    }).toEqual({ shown: expected, stored: expected, sent: [expected] });
  });

  test('keeps two tokens linked to one sheet, and a token picked again holds only the new sheet', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 3, a: 'seed' }],
    });

    // #when
    send(client, { type: 'link-set', tokenId: 't2', sheetId: 'brok', instanceId: null });
    send(client, { type: 'link-set', tokenId: 't1', sheetId: 'npc', instanceId: 'sk1' });
    await waitUntil(() => shown(client, 'link:t1')?.c === 4);
    await waitUntil(() => shown(client, 'link:t2') !== undefined);

    // #then
    expect([shown(client, 'link:t1'), shown(client, 'link:t2')]).toEqual([
      { k: 'link:t1', d: { s: 'npc', i: 'sk1' }, c: 4, a: 'gm-a' },
      { k: 'link:t2', d: { s: 'brok' }, c: 1, a: 'gm-a' },
    ]);
  });

  test('writes a link to a repeat block of a linkable section with the sheet and instance ids', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, { type: 'link-set', tokenId: 't1', sheetId: 'npc', instanceId: 'sk1' });
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    const expected: VersionedRecord = { k: 'link:t1', d: { s: 'npc', i: 'sk1' }, c: 1, a: 'gm-a' };

    expect({ stored: stored(client, 'link:t1'), sent: committed(room, 'gm-a') }).toEqual({
      stored: expected,
      sent: [expected],
    });
  });

  for (const [sheetId, instanceId, reason] of [
    ['liza', null, 'deleted-sheet'],
    ['nobody', null, 'unknown-sheet'],
    ['bad:id', null, 'invalid-sheet-id'],
    // AD-19: "npc" has no `tokens`, and the section of "Меч" has none either.
    ['npc', null, 'not-linkable'],
    ['brok', 'sword', 'not-linkable'],
    ['npc', 'gone', 'unknown-instance'],
    ['npc', 'nobody', 'unknown-instance'],
    ['npc', 'a:b', 'invalid-instance-id'],
  ] as const) {
    test(`refuses a link to "${sheetId}" block ${JSON.stringify(instanceId)} with "${reason}" and writes nothing`, async () => {
      // #given
      const room = openRoom();
      const client = await startClient(room, 'gm-a');

      // #when
      const id = send(client, { type: 'link-set', tokenId: 't1', sheetId, instanceId });
      await waitUntil(() => rejection(client, id) !== undefined);

      // #then
      expect({
        reason: rejection(client, id),
        shown: shown(client, 'link:t1'),
        stored: stored(client, 'link:t1'),
      }).toEqual({ reason, shown: undefined, stored: null });
    });
  }

  test('refuses a token id a link key cannot hold', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    const id = send(client, {
      type: 'link-set',
      tokenId: 'a:b',
      sheetId: 'brok',
      instanceId: null,
    });

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect(rejection(client, id)).toBe('invalid-token-id');
  });

  test('refuses a player', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });

    // #when
    const id = send(client, { type: 'link-set', tokenId: 't1', sheetId: 'brok', instanceId: null });
    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect(rejection(client, id)).toBe('not-allowed');
  });
});

describe('link-clear', () => {
  test('tombstones the link and keeps the sheet', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 2, a: 'seed' }],
    });

    // #when
    send(client, { type: 'link-clear', tokenId: 't1' });
    await waitUntil(() => shown(client, 'link:t1')?.d === null);

    // #then
    expect({
      link: stored(client, 'link:t1'),
      sheet: stored(client, 'sheet:brok'),
    }).toEqual({
      link: { k: 'link:t1', d: null, c: 3, a: 'gm-a' },
      sheet: { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
    });
  });

  test('refuses a token with no link', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: null, c: 2, a: 'seed' }],
    });

    // #when
    const id = send(client, { type: 'link-clear', tokenId: 't1' });
    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({ reason: rejection(client, id), stored: stored(client, 'link:t1')?.c }).toEqual({
      reason: 'unknown-link',
      stored: 2,
    });
  });
});

describe('a repeat block removal', () => {
  test('tombstones the links to the repeat block in the same commit, and keeps other links', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [
        ...BASE,
        { k: 'link:t1', d: { s: 'npc', i: 'sk1' }, c: 2, a: 'seed' },
        { k: 'link:t2', d: { s: 'npc', i: 'sk1' }, c: 1, a: 'seed' },
        { k: 'link:t3', d: { s: 'brok' }, c: 1, a: 'seed' },
      ],
    });

    // #when
    send(client, {
      type: 'repeat-block-delete',
      sheetId: 'npc',
      sectionId: 'mob',
      instanceId: 'sk1',
    });
    await waitUntil(() => commits(room, 'gm-a').length === 1);

    // #then
    expect({
      sent: commits(room, 'gm-a'),
      kept: stored(client, 'link:t3'),
      menu: menuOf(client).map((item) => item.id),
    }).toEqual({
      sent: [
        [
          { k: 'rep:npc:mob:sk1', d: null, c: 2, a: 'gm-a' },
          { k: 'link:t1', d: null, c: 3, a: 'gm-a' },
          { k: 'link:t2', d: null, c: 2, a: 'gm-a' },
        ],
      ],
      kept: { k: 'link:t3', d: { s: 'brok' }, c: 1, a: 'seed' },
      menu: [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM],
    });
  });
});

describe('token menu', () => {
  test('gives a GM with no link only "Привязать лист…", for one token of the character layer', async () => {
    // #given
    const room = openRoom();

    // #when
    const client = await startClient(room, 'gm-a');

    // #then
    expect(menuOf(client)).toEqual([
      { id: LINK_ITEM, icons: [{ label: 'Привязать лист…', filter: LINK_ANY }] },
    ]);
  });

  test('keeps a linked token out of "Привязать лист…" and shows "Открыть лист" and "Отвязать лист" only on it', async () => {
    // #given
    const room = openRoom();

    // #when
    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    // #then
    expect(menuOf(client)).toEqual([
      {
        id: LINK_ITEM,
        icons: [
          {
            label: 'Привязать лист…',
            filter: {
              max: 1,
              roles: ['GM'],
              every: [
                { key: 'layer', value: 'CHARACTER' },
                { key: 'id', value: 't1', operator: '!=' },
              ],
            },
          },
        ],
      },
      {
        id: OPEN_ITEM,
        icons: [
          {
            label: 'Открыть лист',
            filter: {
              max: 1,
              roles: ['GM'],
              every: [{ key: 'layer', value: 'CHARACTER' }],
              some: [{ key: 'id', value: 't1' }],
            },
          },
          {
            label: 'Открыть лист',
            filter: {
              max: 1,
              roles: ['PLAYER'],
              every: [{ key: 'layer', value: 'CHARACTER' }],
              some: [{ key: 'id', value: 't1' }],
            },
          },
        ],
      },
      {
        id: UNLINK_ITEM,
        icons: [
          {
            label: 'Отвязать лист',
            filter: {
              max: 1,
              roles: ['GM'],
              every: [{ key: 'layer', value: 'CHARACTER' }],
              some: [{ key: 'id', value: 't1' }],
            },
          },
        ],
      },
    ]);
  });

  test('treats a link to a deleted sheet as no link', async () => {
    // #given
    const room = openRoom();

    // #when
    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'liza' }, c: 1, a: 'seed' }],
    });

    // #then
    expect(menuOf(client)).toEqual([
      { id: LINK_ITEM, icons: [{ label: 'Привязать лист…', filter: LINK_ANY }] },
    ]);
  });

  test('re-creates every item when a link is written', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');
    const before = client.platform.contextMenuCalls().length;

    // #when
    send(client, { type: 'link-set', tokenId: 't1', sheetId: 'npc', instanceId: 'sk1' });
    await waitUntil(() => client.platform.contextMenuCalls().length === before + 3);

    // #then
    expect(client.platform.contextMenuCalls().slice(before)).toEqual([
      { kind: 'create', id: LINK_ITEM },
      { kind: 'create', id: OPEN_ITEM },
      { kind: 'create', id: UNLINK_ITEM },
    ]);
  });

  test('re-creates nothing for a change that leaves the filters as they were', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    const before = client.platform.contextMenuCalls();

    // #when: a rename, which is a field edit of the name field, and another field edit.
    send(client, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'name' },
      fieldId: 'name',
      value: 'Брок 2',
    });
    send(client, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 3,
    });
    await waitUntil(() => shown(client, 'row:brok:str') !== undefined);

    // #then
    expect(client.platform.contextMenuCalls()).toEqual(before);
  });

  test('removes "Отвязать лист" and frees the token when the linked sheet is deleted', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    // #when
    send(client, { type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => client.platform.contextMenuItems().length === 1);

    // #then
    expect({ link: stored(client, 'link:t1')?.d, menu: menuOf(client) }).toEqual({
      link: null,
      menu: [{ id: LINK_ITEM, icons: [{ label: 'Привязать лист…', filter: LINK_ANY }] }],
    });
  });

  test('follows a link another GM client commits', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');
    const other = await startClient(room, 'gm-b');

    // #when
    send(other, { type: 'link-set', tokenId: 't9', sheetId: 'brok', instanceId: null });
    await waitUntil(() => menuOf(client).length === 3);

    // #then
    expect(menuOf(client).map((item) => item.icons[0]?.filter)).toEqual([
      {
        max: 1,
        roles: ['GM'],
        every: [
          { key: 'layer', value: 'CHARACTER' },
          { key: 'id', value: 't9', operator: '!=' },
        ],
      },
      {
        max: 1,
        roles: ['GM'],
        every: [{ key: 'layer', value: 'CHARACTER' }],
        some: [{ key: 'id', value: 't9' }],
      },
      {
        max: 1,
        roles: ['GM'],
        every: [{ key: 'layer', value: 'CHARACTER' }],
        some: [{ key: 'id', value: 't9' }],
      },
    ]);
  });

  test('gives a player with no link no item', async () => {
    // #given
    const room = openRoom();

    // #when
    const client = await startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });

    // #then
    expect(client.platform.contextMenuCalls()).toEqual([]);
  });

  test('removes the GM items when the GM becomes a player, and keeps "Открыть лист"', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    await waitUntil(() => menuOf(client).length === 3);

    // #when
    client.platform.setRole('PLAYER');
    await waitUntil(() => client.platform.contextMenuItems().length === 1);

    // #then
    expect({
      calls: client.platform.contextMenuCalls().slice(-2),
      menu: menuOf(client).map((item) => item.id),
    }).toEqual({
      calls: [
        { kind: 'remove', id: LINK_ITEM },
        { kind: 'remove', id: UNLINK_ITEM },
      ],
      menu: [OPEN_ITEM],
    });
  });

  test('makes no item before the first catch-up ends, and makes them when it ends', async () => {
    // #given: a GM in the party that never answers holds the catch-up open.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 300 } });

    // A queued intent tells the windows of the pending view, during catch-up.
    send(client, { type: 'sheet-create', sheetId: 'kira', set: 'pc' });
    await waitUntil(() => shown(client, 'sheet:kira') !== undefined);

    const during = client.platform.contextMenuCalls();

    // #when
    await waitUntil(() => client.store.$sync.get().state === 'live');

    // #then
    expect({ during, after: menuOf(client).map((item) => item.id) }).toEqual({
      during: [],
      after: [LINK_ITEM],
    });
  });

  test('"Привязать лист…" opens the link picker for the token, anchored to the pressed entry', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    client.platform.clickContextMenuItem(LINK_ITEM, ['tok-7']);

    // #then
    expect(client.platform.openedPopovers()).toEqual([
      {
        id: 'app.muster-roll/link-picker',
        url: '/picker.html?token=tok-7',
        width: 280,
        height: 360,
        anchorElementId: 'mock-context-menu-element',
      },
    ]);
  });

  test('"Отвязать лист" tombstones the token\'s link', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    // #when
    client.platform.clickContextMenuItem(UNLINK_ITEM, ['t1']);
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    expect({ link: stored(client, 'link:t1'), sent: committed(room, 'gm-a') }).toEqual({
      link: { k: 'link:t1', d: null, c: 2, a: 'gm-a' },
      sent: [{ k: 'link:t1', d: null, c: 2, a: 'gm-a' }],
    });
  });

  test('shows a notification when the engine refuses "Отвязать лист"', async () => {
    // #given: Owlbear would not show the item on t2, which has no link, but a press can race one.
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    await waitUntil(() => menuOf(client).length === 3);

    // #when
    client.platform.clickContextMenuItem(UNLINK_ITEM, ['t2']);
    await waitUntil(() => client.platform.shownNotifications().length === 1);

    // #then
    expect(client.platform.shownNotifications()).toEqual([UNLINK_FAILED]);
  });

  test('creates an item again on the next change after its create failed', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a', { failMenuCalls: ['create'] });

    await pause(20);

    const failed = menuOf(client).length;

    // #when: a field edit changes no filter, but the item is owed.
    send(client, FIELD_EDIT);
    await waitUntil(() => menuOf(client).length === 1);

    // #then
    expect({ failed, menu: menuOf(client) }).toEqual({
      failed: 0,
      menu: [{ id: LINK_ITEM, icons: [{ label: 'Привязать лист…', filter: LINK_ANY }] }],
    });
  });

  test('removes an item again on the next change after its remove failed', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    await waitUntil(() => menuOf(client).length === 3);
    client.platform.failNextContextMenuCalls(['remove']);
    send(client, { type: 'link-clear', tokenId: 't1' });
    await waitUntil(() => itemOf(client, LINK_ITEM)?.icons[0]?.filter?.every?.length === 1);
    await pause(20);

    const failed = menuOf(client)
      .map((item) => item.id)
      .sort();

    // #when
    send(client, FIELD_EDIT);
    await waitUntil(() => menuOf(client).length === 1);

    // #then
    expect({ failed, after: menuOf(client).map((item) => item.id) }).toEqual({
      failed: [LINK_ITEM, OPEN_ITEM],
      after: [LINK_ITEM],
    });
  });

  test('stop() takes every item back out of Owlbear', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    await waitUntil(() => menuOf(client).length === 3);

    // #when
    client.stop();
    await waitUntil(() => menuOf(client).length === 0);

    // #then
    expect(client.platform.contextMenuCalls().slice(-3)).toEqual([
      { kind: 'remove', id: LINK_ITEM },
      { kind: 'remove', id: OPEN_ITEM },
      { kind: 'remove', id: UNLINK_ITEM },
    ]);
  });

  test('creates the items when a player becomes GM', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });

    // #when
    client.platform.setRole('GM');
    await waitUntil(() => menuOf(client).length === 1);

    // #then
    expect(menuOf(client)).toEqual([
      { id: LINK_ITEM, icons: [{ label: 'Привязать лист…', filter: LINK_ANY }] },
    ]);
  });

  test('ignores a press for more than one token', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'link:t1', d: { s: 'brok' }, c: 1, a: 'seed' }],
    });

    // #when
    client.platform.clickContextMenuItem(LINK_ITEM, ['t2', 't3']);
    client.platform.clickContextMenuItem(UNLINK_ITEM, ['t1', 't2']);
    client.platform.clickContextMenuItem(OPEN_ITEM, ['t1', 't2']);
    await pause(20);

    // #then
    expect({
      popovers: client.platform.openedPopovers(),
      link: stored(client, 'link:t1')?.d,
      actionOpens: client.platform.actionOpens(),
      openRequest: client.store.$openRequest.get(),
    }).toEqual({ popovers: [], link: { s: 'brok' }, actionOpens: 0, openRequest: null });
  });
});

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const backing = createBacking();
  const bus = createMemoryBus();
  const role = options.role ?? 'GM';

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role,
  };

  const platform = createMockPlatform(bus, backing, identity);

  for (const record of options.seeded ?? BASE) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  platform.joinParty();
  platform.failNextContextMenuCalls(options.failMenuCalls ?? []);

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: { ...TIMING, ...options.timing },
    menuCopy: MENU_COPY,
  });

  const store = createProjectionStore();

  const window = startReplicaClient(
    createMockPlatform(bus, backing, identity).broadcast,
    createSendQueue(platform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop);
  await waitUntil(() => store.$loaded.get());

  return { platform, stop: engine.stop, backing, store, window };
}

function openRoom(): Room {
  const room = createMemoryRoom();
  const heard: Heard[] = [];

  room.onRemote(SYNC_CHANNEL, 'observer', (event) => {
    heard.push({ from: event.connectionId, data: event.data });
  });

  return { room, heard };
}

function joinAs(room: Room, connectionId: string, role: PlayerRole): void {
  room.room.join({ id: connectionId, connectionId, name: connectionId, role });
}

// The records of each commit one client sent to the room, one list per message, in send order.
function commits(room: Room, from: string): VersionedRecord[][] {
  return room.heard.flatMap((message) => {
    const data = Object(message.data);

    return message.from === from && data.t === 'commit'
      ? [recordSchema.array().parse(data.records)]
      : [];
  });
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

function itemOf(client: Client, id: string): OwlbearMenuItem | undefined {
  return menuOf(client).find((item) => item.id === id);
}

function menuOf(client: Client): OwlbearMenuItem[] {
  return client.platform.contextMenuItems().map((item) => ({
    id: item.id,
    icons: item.icons.map((icon) => ({ label: icon.label, filter: icon.filter ?? null })),
  }));
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

function send(client: Client, command: Command): string {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }

  return sent.value;
}

function rejection(client: Client, id: string): string | undefined {
  return client.store.$rejections.get().get(id)?.reason;
}

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function stored(client: Client, key: string): VersionedRecord | null {
  const text = client.backing.get(`${STORAGE_PREFIX}${key}`);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
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
