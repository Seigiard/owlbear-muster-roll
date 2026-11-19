import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { JsonValue } from '@/core/json';
import {
  ADD,
  addPartyMember,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  postRemote,
  record,
  seedStorage,
  storedCell,
  storedData,
  storedRecords,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const ADD_ATTACK = 'Добавить в «Атаки»';
const DENIED = 'Нет прав на правку';
const CAN_EDIT = 'Можно править';
const READ_ONLY = 'Только чтение';
const SHEET_NAME = 'Имя листа';

type HeardMessage = {
  from: string;
  t: string;
  k: string;
  c: number;
  reason: string;
};

declare global {
  interface Window {
    heardRemote: {
      from: string;
      data: JsonValue;
    }[];
  }
}

// The GM keeps its records in this browser's shared storage, so `storedData` reads them. The player
// has a device of its own and persists nothing.
const GM: ClientParams = { client: 'a', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'p',
};

// A sheet set, a player-editable single sheet and a single sheet players only read.
const PRESET_TEXT = JSON.stringify({
  v: 4,
  templates: [
    {
      id: 'pc',
      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              title: 'Основное',
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Имя' },
                    { kind: 'field', type: 'text', id: 'name' },
                  ],
                },
                {
                  cells: [
                    { kind: 'text', text: 'Сила' },
                    { kind: 'field', type: 'number', id: 'str' },
                  ],
                },
              ],
            },
            {
              title: 'Атаки',
              repeat: { id: 'attack', nameField: 'attack' },
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Атака' },
                    { kind: 'field', type: 'text', id: 'attack' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'inventory',
      title: 'Инвентарь',
      players: 'edit',
      tabs: [
        {
          sections: [
            {
              title: 'Деньги',
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Золото' },
                    { kind: 'field', type: 'number', id: 'gold' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'journal',
      title: 'Журнал',
      tabs: [
        {
          sections: [
            {
              title: 'Записи',
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Запись' },
                    { kind: 'field', type: 'text', id: 'entry' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

// Лиза may edit Брок.
const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  record('acl:brok:lisa', { name: 'Лиза' }),
  record('blk:brok', { str: 14 }),
  record('blk:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
  record('blk:inventory', { gold: 3 }),
  record('blk:journal', { entry: 'Начало' }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test("a player's field edit reaches the GM's records and window after its check", async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openClient(context, PLAYER, null);
  await expect(strength(player.window)).toHaveValue('14');
  // #when
  await strength(player.window).fill('16');
  await strength(player.window).press('Enter');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'str'))
    .toEqual([16, 2, player.connectionId]);
  await expect(strength(gm.window)).toHaveValue('16');
  await expect(strength(player.window)).toHaveValue('16');
});

test('a player adds a repeat row and removes another, and the GM stores both', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openClient(context, PLAYER, null);
  const attacks = player.window.getByRole('tabpanel').getByRole('region', { name: 'Атаки' });
  await expect(attacks.getByRole('textbox', { name: 'Атака', exact: true })).toHaveValue('Меч');
  // #when
  await attacks.getByRole('button', { name: ADD_ATTACK, exact: true }).click();
  await expect(attacks.getByRole('textbox', { name: 'Атака', exact: true })).toHaveCount(2);
  await attacks.getByRole('button', { name: 'Удалить блок 1', exact: true }).click();
  // #then
  await expect.poll(() => storedData(gm.window, 'blk:brok:attack:i1')).toBeNull();
  await expect
    .poll(async () =>
      (await storedRecords(gm.window, 'blk:brok:attack:')).flatMap((row) =>
        row.k === 'blk:brok:attack:i1' ? [] : [row.d],
      ),
    )
    .toEqual([{ order: 1, cells: {} }]);
  await expect(attacks.getByRole('textbox', { name: 'Атака', exact: true })).toHaveCount(1);
  await expect(attacks.getByRole('textbox', { name: 'Атака', exact: true })).toHaveValue('');
});

test('a denied edit puts the value back and says "Нет прав на правку"', async ({ context }) => {
  // #given: the GM client is listed in the party with no background behind it, so the test answers
  // for it.
  const gm = await openGm(context);
  const player = await openClient(context, PLAYER, null);
  await expect(strength(player.window)).toHaveValue('14');
  await gm.background.close();
  await addPartyMember(gm.window, gm.connectionId, 'GM', { name: 'Мастер' });
  // Tab ends the edit, so the field shows the record again and not the typed text.
  await strength(player.window).fill('16');
  await strength(player.window).press('Tab');
  await expect(strength(player.window)).toHaveValue('16');
  // #when: the seeded record has c 1, so the proposal has c 2.
  await postRemote(gm.window, gm.connectionId, {
    v: 4,
    g: { n: 0, a: '' },
    t: 'reject',
    k: 'blk:brok',
    c: 2,
    a: player.connectionId,
    reason: 'denied',
  });
  // #then
  await expect(strength(player.window)).toHaveValue('14');
  await expect
    .poll(() => player.background.evaluate(() => window.mockPlatform.shownNotifications()))
    .toEqual([DENIED]);
});

test('a player edit of a player-editable single sheet is committed by a GM client and reaches the GM window', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openClient(context, PLAYER, null);
  await gm.window.getByRole('tab', { name: 'Инвентарь' }).click();
  await player.window.getByRole('tab', { name: 'Инвентарь' }).click();
  await expect(player.window.getByRole('tabpanel').getByText(CAN_EDIT)).toBeVisible();
  // #when
  await gold(player.window).fill('5');
  await gold(player.window).press('Enter');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:inventory', 'gold'))
    .toEqual([5, 2, player.connectionId]);
  await expect(gold(gm.window)).toHaveValue('5');
  await expect(gold(player.window)).toHaveValue('5');
});

test('a single sheet with no players: edit is read-only for a player, and a forged edit of it is denied', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openClient(context, PLAYER, null);
  const panel = player.window.getByRole('tabpanel');
  await player.window.getByRole('tab', { name: 'Журнал' }).click();
  await expect(panel.getByRole('status', { name: 'Запись' })).toHaveText('Начало');

  const readOnly = {
    status: await panel.getByText(READ_ONLY).count(),
    fields: await panel.getByRole('textbox').count(),
  };

  await listenRemote(player.window);
  // #when: a modified client proposes the record anyway.
  await postRemote(player.window, player.connectionId, {
    v: 4,
    g: { n: 0, a: '' },
    t: 'propose',
    records: [
      {
        k: 'blk:journal',
        d: { order: 0, cells: { entry: ['Подделка', 2, player.connectionId] } },
        c: 2,
        a: player.connectionId,
        l: [1, 'seed'],
      },
    ],
  });
  // #then
  await expect
    .poll(async () => (await heardRemote(player.window)).filter((one) => one.t === 'reject'))
    .toEqual([
      {
        from: gm.connectionId,
        t: 'reject',
        k: 'blk:journal',
        c: 2,
        reason: 'denied',
      },
    ]);
  expect({ readOnly, stored: await storedCell(gm.window, 'blk:journal', 'entry') }).toEqual({
    readOnly: { status: 1, fields: 0 },
    stored: ['Начало', 1, 'seed'],
  });
});

test("a player with write access renames the sheet from its header, and the GM commits the name field's row", async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openClient(context, PLAYER, null);
  const name = player.window.getByRole('textbox', { name: SHEET_NAME });
  await expect(name).toHaveValue('Брок');
  // #when
  await name.fill('Брок Смелый');
  await name.press('Enter');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'name'))
    .toEqual(['Брок Смелый', 2, player.connectionId]);
  await expect(gm.window.getByRole('tab', { name: 'Брок Смелый' })).toBeVisible();
  await expect(player.window.getByRole('tab', { name: 'Брок Смелый' })).toBeVisible();
});

async function openGm(context: BrowserContext): Promise<RoomClient> {
  const gm = await openClient(context, GM, RECORDS);
  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();

  return gm;
}

// Opens one client. `records` seeds its device with the preset first; `null` seeds nothing.
async function openClient(
  context: BrowserContext,
  params: ClientParams,
  records: readonly StoredRecord[] | null,
): Promise<RoomClient> {
  const window = await openClientWindow(context, params);

  if (records !== null) {
    await seedStorage(window, records, PRESET_TEXT, params.device);
  }

  const background = await openClientBackground(context, params);

  return { window, background, connectionId: connectionIdOf(params) };
}

function strength(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'Сила', exact: true });
}

function gold(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'Золото', exact: true });
}

// Collects the room messages this page hears, with the sender and the fields a reject echoes.
async function listenRemote(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.heardRemote = [];
    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      window.heardRemote.push({ from: event.connectionId, data: event.data });
    });
  }, SYNC_CHANNEL);
}

async function heardRemote(page: Page): Promise<HeardMessage[]> {
  const heard = await page.evaluate(() => window.heardRemote);

  return heard.map(({ from, data }) => {
    const message = Object(data);

    return {
      from,
      t: String(message.t),
      k: String(message.k),
      c: Number(message.c),
      reason: String(message.reason),
    };
  });
}
