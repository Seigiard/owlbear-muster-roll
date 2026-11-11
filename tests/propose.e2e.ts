import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import {
  addPartyMember,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  postRemote,
  record,
  seedStorage,
  storedData,
  storedRecords,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const ADD = 'Добавить персонажа';
const ADD_ROW = 'Добавить строку';
const DENIED = 'Нет прав на правку';

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

const PRESET_TEXT = JSON.stringify({
  v: 1,
  character: {
    sections: [
      {
        title: 'Основное',
        rows: [
          [
            { kind: 'text', text: 'Сила' },
            { kind: 'field', type: 'number', id: 'str' },
          ],
        ],
      },
      {
        title: 'Атаки',
        repeat: true,
        rows: [
          [
            { kind: 'text', text: 'Атака' },
            { kind: 'field', type: 'text', id: 'attack' },
          ],
        ],
      },
    ],
  },
  npc: {
    sections: [
      {
        rows: [
          [
            { kind: 'text', text: 'Хиты' },
            { kind: 'field', type: 'number', id: 'hp' },
          ],
        ],
      },
    ],
  },
});

// Лиза may edit Брок.
const RECORDS: StoredRecord[] = [
  record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
  record('acl:brok:lisa', { name: 'Лиза' }),
  record('row:brok:str', { str: 14 }),
  record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
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
  await expect.poll(() => storedData(gm.window, 'row:brok:str')).toEqual({ str: 16 });
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
  await attacks.getByRole('button', { name: ADD_ROW, exact: true }).click();
  await expect(attacks.getByRole('textbox', { name: 'Атака', exact: true })).toHaveCount(2);
  await attacks.getByRole('button', { name: 'Удалить строку 1', exact: true }).click();

  // #then
  await expect.poll(() => storedData(gm.window, 'rep:brok:attack:i1')).toBeNull();
  await expect
    .poll(async () =>
      (await storedRecords(gm.window, 'rep:brok:attack:')).flatMap((row) =>
        row.k === 'rep:brok:attack:i1' ? [] : [row.d],
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
    v: 1,
    g: { n: 0, a: '' },
    t: 'reject',
    k: 'row:brok:str',
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
