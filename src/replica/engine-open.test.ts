import { describe, expect, spyOn, test } from 'bun:test';

import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { Timing } from '@/core/timing';
import {
  parseEngineMessage,
  UI_CHANNEL,
  type Command,
  type EngineMessage,
  type OpenSheetRequest,
} from '@/core/ui-messages';
import type { JsonValue } from '@/core/json';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  createRoomRig,
  pause,
  type RigClient,
  type RigPage,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

// Long enough for every queued LOCAL message to land.
const SETTLE_MS = 30;

const OPEN_ITEM = 'app.muster-roll/open-sheet';

const MENU_COPY = {
  linkSheet: 'Привязать лист…',
  unlinkSheet: 'Отвязать лист',
  openSheet: 'Открыть лист',
  unlinkFailed: 'Не удалось отвязать лист. Попробуйте ещё раз.',
};

const PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      tabs: [
        {
          title: 'Основное',
          sections: [
            { rows: [[{ kind: 'field', type: 'text', id: 'name' }]] },
            { rows: [[{ kind: 'field', type: 'number', id: 'str' }]] },
          ],
        },
        {
          title: 'Заметки мастера',
          visibility: 'gm',
          sections: [
            {
              repeat: true,
              tokens: true,
              rows: [[{ kind: 'field', type: 'text', id: 'secret' }]],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      tabs: [
        {
          sections: [
            {
              repeat: true,
              tokens: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'foe' },
                  { kind: 'field', type: 'number', id: 'hp' },
                ],
              ],
            },
          ],
        },
      ],
    },
  ],
};

// "Брок" is a sheet of the "pc" set, "Скелет" a repeat block of the GM-only single sheet "npc",
// "Лиза" was deleted. t-pc, t-npc and t-gone link to them.
const ROOM: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:name', d: { name: 'Брок' }, c: 1, a: 'seed' },
  {
    k: 'rep:brok:secret:hidden',
    d: { order: 0, cells: { secret: 'Лич' } },
    c: 1,
    a: 'seed',
  },
  { k: 'rep:npc:foe:skel', d: { order: 0, cells: { foe: 'Скелет', hp: 7 } }, c: 1, a: 'seed' },
  { k: 'sheet:liza', d: null, c: 2, a: 'seed' },
  { k: 'link:t-pc', d: { s: 'brok' }, c: 1, a: 'seed' },
  { k: 'link:t-secret', d: { s: 'brok', i: 'hidden' }, c: 1, a: 'seed' },
  { k: 'link:t-npc', d: { s: 'npc', i: 'skel' }, c: 1, a: 'seed' },
  { k: 'link:t-gone', d: { s: 'liza' }, c: 1, a: 'seed' },
];

// One client's background, with no window until a test opens one. `requests` holds every open
// request the engine has put on the client's LOCAL bus, in order.
type Background = {
  room: RigRoom;
  client: RigClient;
  platform: MockPlatform;
  readonly requests: OpenSheetRequest[];
};

type Window = { store: RigPage['store']; client: RigPage['window'] };

const roomRig = createRoomRig({ seeded: ROOM });

describe('open from token', () => {
  test('with the window closed, a GM press opens the action window and the window that connects gets the character', async () => {
    // #given
    const background = await startBackground('GM');

    // #when
    click(background, 't-pc');

    const window = await openWindow(background);

    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect({
      actionOpens: background.platform.actionOpens(),
      target: target(background, window),
    }).toEqual({ actionOpens: 1, target: { sheetId: 'brok', instanceId: null } });
  });

  test('with the window open, a press reaches it at once', async () => {
    // #given
    const background = await startBackground('GM');
    const window = await openWindow(background);

    // #when
    click(background, 't-npc');
    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect(target(background, window)).toEqual({ sheetId: 'npc', instanceId: 'skel' });
  });

  test('a GM press on a repeat block on a hidden tab reaches the window', async () => {
    // #given
    const background = await startBackground('GM');
    const window = await openWindow(background);

    // #when
    click(background, 't-secret');
    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect(target(background, window)).toEqual({ sheetId: 'brok', instanceId: 'hidden' });
  });

  test('reprojects before it re-sends a held open request after the stream restarts', async () => {
    // #given
    const background = await startBackground('GM');
    const window = await openWindow(background);
    click(background, 't-pc');
    await waitUntil(() => window.store.$openRequest.get() !== null);
    const sent = background.client.local.length;

    // #when
    background.platform.setRole('PLAYER');
    await waitUntil(() => window.store.$sync.get().role === 'PLAYER');
    await waitUntil(
      () => localEngineMessageTypes(background.client.local.slice(sent)).at(-1) === 'open-sheet',
    );

    // #then
    expect({
      messages: localEngineMessageTypes(background.client.local.slice(sent)),
      target: target(background, window),
    }).toEqual({
      messages: ['delta', 'projection', 'open-sheet'],
      target: { sheetId: 'brok', instanceId: null },
    });
  });

  test('a player press on a character token reaches the window', async () => {
    // #given
    const background = await startBackground('PLAYER');
    const window = await openWindow(background);

    // #when
    click(background, 't-pc');
    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect({
      actionOpens: background.platform.actionOpens(),
      target: target(background, window),
    }).toEqual({ actionOpens: 1, target: { sheetId: 'brok', instanceId: null } });
  });

  test('a winning same-counter preset from another author refreshes token-menu visibility', async () => {
    // #given
    const background = await startBackground('GM');
    const before = background.platform.contextMenuItems().some((item) => item.id === OPEN_ITEM);

    const withoutCharacterSheet: VersionedRecord = {
      k: 'preset',
      d: encodePreset({
        ...PRESET,
        templates: PRESET.templates.filter((template) => template.id !== 'pc'),
      }),
      c: 1,
      a: 'zz-author',
    };

    background.room.join('gm-new', 'GM');

    // #when
    background.room.post('gm-new', {
      v: 3,
      g: { n: 0, a: '' },
      t: 'commit',
      records: [withoutCharacterSheet],
    });
    await pause(SETTLE_MS);

    // #then
    const after = background.platform
      .contextMenuItems()
      .find((item) => item.id === OPEN_ITEM)
      ?.icons.at(0)?.filter;

    expect({ before, after }).toEqual({
      before: true,
      after: {
        max: 1,
        roles: ['GM'],
        every: [{ key: 'layer', value: 'CHARACTER' }],
        some: [{ key: 'id', value: 't-npc' }],
      },
    });
  });

  for (const [role, tokenId] of [
    ['PLAYER', 't-npc'],
    ['PLAYER', 't-secret'],
    ['GM', 't-gone'],
    ['GM', 't-none'],
  ] as const) {
    test(`a ${role} press on ${tokenId} opens nothing`, async () => {
      // #given: Owlbear would not show the item there, but a press can race a change.
      const background = await startBackground(role);
      const window = await openWindow(background);

      // #when
      click(background, tokenId);
      await pause(SETTLE_MS);

      // #then
      expect({
        actionOpens: background.platform.actionOpens(),
        requests: background.requests,
        shown: window.store.$openRequest.get(),
      }).toEqual({ actionOpens: 0, requests: [], shown: null });
    });
  }

  test('once a window acknowledges the request, a reload or a second window does not get it again', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');

    const first = await openWindow(background);

    await waitUntil(() => first.store.$openRequest.get() !== null);

    const id = first.store.$openRequest.get()?.id ?? '';

    // #when
    first.client.acknowledgeOpen(id);
    await pause(SETTLE_MS);

    const before = background.requests.length;
    const second = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(before),
      second: second.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], second: null });
  });

  test('until a window acknowledges it, every window that connects gets the request again', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');

    const first = await openWindow(background);

    await waitUntil(() => first.store.$openRequest.get() !== null);

    // #when: the first window closes with no acknowledgement.
    first.client.stop();

    const second = await openWindow(background);

    await waitUntil(() => second.store.$openRequest.get() !== null);

    // #then
    expect(second.store.$openRequest.get()).toEqual(first.store.$openRequest.get());
  });

  test('a newer press replaces the request still held', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');
    click(background, 't-npc');

    // #when
    const window = await openWindow(background);

    await waitUntil(() => window.store.$openRequest.get() !== null);

    // #then
    expect({
      shown: target(background, window),
      actionOpens: background.platform.actionOpens(),
    }).toEqual({ shown: { sheetId: 'npc', instanceId: 'skel' }, actionOpens: 2 });
  });

  test('an acknowledgement of a replaced request leaves the newer one held', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');
    click(background, 't-npc');

    const [older] = background.requests;
    const first = await openWindow(background);

    // #when
    first.client.acknowledgeOpen(older?.id ?? '');
    await pause(SETTLE_MS);

    const second = await openWindow(background);

    await waitUntil(() => second.store.$openRequest.get() !== null);

    // #then
    expect(target(background, second)).toEqual({ sheetId: 'npc', instanceId: 'skel' });
  });

  test('a request no window took within its lifetime is dropped', async () => {
    // #given
    const background = await startBackground('GM', { openRequestTtlMs: 40 });

    click(background, 't-pc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    await pause(80);

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a request expires at the exact end of its lifetime', async () => {
    // #given
    const background = await startBackground('GM', { openRequestTtlMs: 40 });
    let now = 1000;

    spyOn(Date, 'now').mockImplementation(() => now);
    click(background, 't-pc');
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    now = 1040;

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a request is dropped at once when Owlbear refuses to open the window', async () => {
    // #given
    const background = await startBackground('GM');

    background.platform.failNextActionOpen();

    // #when
    click(background, 't-pc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    await pause(SETTLE_MS);

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a request whose sheet is deleted before delivery is discarded', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-pc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    command(background, { type: 'sheet-delete', sheetId: 'brok' });
    await pause(SETTLE_MS);

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a request whose repeat block is deleted before delivery is discarded', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-npc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    command(background, {
      type: 'repeat-block-delete',
      sheetId: 'npc',
      sectionId: 'foe',
      instanceId: 'skel',
    });
    await pause(SETTLE_MS);

    const window = await openWindow(background);

    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });

  test('a GM request for an NPC is discarded when the GM becomes a player before delivery', async () => {
    // #given
    const background = await startBackground('GM');

    click(background, 't-npc');

    // The press itself goes out once, to whatever window is open.
    await waitUntil(() => background.requests.length === 1);

    const sent = background.requests.length;

    // #when
    background.platform.setRole('PLAYER');
    await pause(SETTLE_MS);

    const window = await openWindow(background);

    await waitUntil(() => window.store.$sync.get().role === 'PLAYER');
    await pause(SETTLE_MS);

    // #then
    expect({
      sentAfter: background.requests.slice(sent),
      shown: window.store.$openRequest.get(),
    }).toEqual({ sentAfter: [], shown: null });
  });
});

async function startBackground(
  role: PlayerRole,
  timing: Partial<Timing> = {},
): Promise<Background> {
  const room = roomRig.openRoom();

  // A GM loads the room from its storage. A player loads nothing and gets it from a GM peer.
  if (role === 'PLAYER') {
    const peer = roomRig.createClient(room, 'gm-peer');
    await peer.startEngine();
  }

  const client = roomRig.createClient(room, 'client-a', {
    role,
    seeded: role === 'GM' ? ROOM : [],
    timing,
    engine: { menuCopy: MENU_COPY },
  });

  await client.startEngine();
  await waitUntil(() => client.platform.contextMenuItems().some((item) => item.id === OPEN_ITEM));

  return {
    room,
    client,
    platform: client.platform,
    get requests() {
      return client.local.flatMap((data) =>
        Object(data).t === 'open-sheet'
          ? [
              {
                id: String(Object(data).id),
                sheetId: String(Object(data).sheetId),
                instanceId:
                  Object(data).instanceId === null ? null : String(Object(data).instanceId),
              },
            ]
          : [],
      );
    },
  };
}

async function openWindow(background: Background): Promise<Window> {
  const page: RigPage = background.client.openWindow();

  await waitUntil(() => page.store.$loaded.get());

  return { store: page.store, client: page.window };
}

// The sheet and repeat block the engine sent in the request the window holds.
function target(background: Background, window: Window): Omit<OpenSheetRequest, 'id'> | null {
  const id = window.store.$openRequest.get()?.id;
  const request = background.requests.find((one) => one.id === id);

  return request === undefined
    ? null
    : { sheetId: request.sheetId, instanceId: request.instanceId };
}

function localEngineMessageTypes(messages: readonly JsonValue[]): EngineMessage['t'][] {
  return messages.flatMap((message) => {
    const parsed = parseEngineMessage(message);

    return parsed.ok ? [parsed.value.t] : [];
  });
}

function click(background: Background, tokenId: string): void {
  if (!background.platform.clickContextMenuItem(OPEN_ITEM, [tokenId])) {
    throw new Error('the menu has no "Открыть лист"');
  }
}

// A GM command as a window would send it, with no window to keep its store.
function command(background: Background, intent: Command): void {
  void background.platform.broadcast.sendMessage(
    UI_CHANNEL,
    { t: 'command', id: `test-${Date.now()}`, command: intent },
    { destination: 'LOCAL' },
  );
}
