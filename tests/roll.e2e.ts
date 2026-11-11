import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { JsonValue } from '@/core/json';

import {
  ADD,
  connectionIdOf,
  npcBlock,
  openClientBackground,
  openClientWindow,
  pcSheet,
  postRemote,
  record,
  seedStorage,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const BAD_NUMBER = 'Нужно число';

const BAD_FORMULA_RESULT = 'Нельзя бросить: формула не дала числа';

const GM: ClientParams = { client: 'a', device: 'a', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  name: 'Лиза',
};

// Every `1d1` shows 1, so each roll has one known result. "Персонажи" and "Журнал" are visible,
// "NPC" is hidden, and its NPCs are repeat blocks.
const PRESET = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      sections: [
        {
          title: 'Основное',
          rows: [
            [
              { kind: 'text', text: 'Имя' },
              { kind: 'field', type: 'text', id: 'name' },
            ],
            [
              { kind: 'text', text: 'Сила' },
              { kind: 'field', type: 'number', id: 'str' },
              { kind: 'field', type: 'check', id: 'tired' },
              { kind: 'dice', formula: '1d1 + str - 2*tired' },
            ],
            [
              { kind: 'text', text: 'Ловкость' },
              { kind: 'field', type: 'number', id: 'dex' },
              { kind: 'dice', formula: '1d1 + dex' },
            ],
            [
              { kind: 'text', text: 'Деление' },
              { kind: 'dice', formula: 'str / (str - str)' },
            ],
            [
              { kind: 'text', text: 'Удача' },
              { kind: 'dice', formula: '1d1 > str' },
            ],
            [
              { kind: 'text', text: 'Монета' },
              { kind: 'dice', formula: '1d1' },
            ],
          ],
        },
        {
          title: 'Атаки',
          repeat: true,
          rows: [
            [
              { kind: 'text', text: 'Атака' },
              { kind: 'field', type: 'number', id: 'bonus' },
              { kind: 'dice', formula: '1d1 + bonus' },
            ],
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [
        {
          title: 'Противники',
          repeat: true,
          rows: [
            [{ kind: 'field', type: 'text', id: 'npc_name' }],
            [
              { kind: 'text', text: 'Хиты' },
              { kind: 'field', type: 'number', id: 'hp' },
              { kind: 'dice', formula: '1d1 + hp' },
            ],
          ],
        },
      ],
    },
    {
      id: 'journal',
      kind: 'single',
      title: 'Журнал',
      sections: [
        {
          rows: [
            [
              { kind: 'text', text: 'Погода' },
              { kind: 'dice', formula: '1d1 + 1' },
            ],
          ],
        },
      ],
    },
  ],
};

const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  record('row:brok:str', { str: 14, tired: true }),
  record('rep:brok:bonus:i1', { order: 0, cells: { bonus: 3 } }),
  npcBlock('skel', 'Скелет', 0, { hp: 7 }),
];

// 1 + 14 - 2 for "Сила", and 1 > 14 fails for "Удача".
const GM_STRENGTH = 'Мастер: Брок, Сила — 13';

const GM_LUCK = 'Мастер: Брок, Удача — 1, провал';

const GM_COIN = 'Мастер: Брок, Монета — 1';

const DEX_ERROR = 'Нельзя бросить: поле «Ловкость» пустое или не число';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a GM roll shows once on the roller and on a player whose window is closed', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  await expect(player.window.getByRole('button', { name: 'Сила' })).toBeVisible();
  await player.window.close();

  // #when
  await diceButton(gm.window, 'Сила').click();

  // #then
  await expect.poll(() => shownNotifications(player)).toEqual([GM_STRENGTH]);
  expect(await shownNotifications(gm)).toEqual([GM_STRENGTH]);
});

test('a player rolls a character it cannot edit, and the GM sees the roll', async ({ context }) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  // #when
  await diceButton(player.window, 'Сила').click();

  // #then
  await expect.poll(() => shownNotifications(gm)).toEqual(['Лиза: Брок, Сила — 13']);
  expect(await shownNotifications(player)).toEqual(['Лиза: Брок, Сила — 13']);
});

test('a roll from the hidden NPC sheet shows on the GM and not on a player', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  await expect(player.window.getByRole('button', { name: 'Сила' })).toBeVisible();
  await gm.window.getByRole('tab', { name: 'NPC' }).click();

  // #when: the character roll after it reaches the player after it.
  await diceButton(gm.window, 'Хиты').click();
  await gm.window.getByRole('tab', { name: 'Брок' }).click();
  await diceButton(gm.window, 'Сила').click();

  // #then
  await expect.poll(() => shownNotifications(player)).toEqual([GM_STRENGTH]);
  expect(await shownNotifications(gm)).toEqual(['Мастер: NPC, Хиты — 8', GM_STRENGTH]);
});

test('a player rolls the visible single sheet "Журнал", and the GM sees the roll', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  await player.window.getByRole('tab', { name: 'Журнал' }).click();

  // #when
  await diceButton(player.window, 'Погода').click();

  // #then
  await expect.poll(() => shownNotifications(gm)).toEqual(['Лиза: Журнал, Погода — 2']);
  expect(await shownNotifications(player)).toEqual(['Лиза: Журнал, Погода — 2']);
});

test("a GM client drops a player's roll marked hidden as forged", async ({ context }) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  await expect(player.window.getByRole('button', { name: 'Сила' })).toBeVisible();

  // #when: the forged roll goes first, so a real one after it proves it had its turn.
  await postRemote(gm.window, player.connectionId, forgedRoll('forged', true));
  await diceButton(player.window, 'Монета').click();

  // #then
  await expect.poll(() => shownNotifications(gm)).toEqual(['Лиза: Брок, Монета — 1']);
});

test('an empty referenced field shows the field error under the button and sends nothing', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  // #when: the good roll after it reaches the player after it.
  await diceButton(gm.window, 'Ловкость').click();
  await expect(messageUnder(gm.window, 'Ловкость')).toHaveText(
    'Нельзя бросить: поле «Ловкость» пустое или не число',
  );
  await diceButton(gm.window, 'Удача').click();

  // #then
  await expect.poll(() => shownNotifications(player)).toEqual([GM_LUCK]);
  expect(await shownNotifications(gm)).toEqual([GM_LUCK]);
});

test('a formula with no number shows its error under the button and sends nothing', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  // #when: the good roll after it reaches the player after it.
  await diceButton(gm.window, 'Деление').click();
  await expect(messageUnder(gm.window, 'Деление')).toHaveText(BAD_FORMULA_RESULT);
  await diceButton(gm.window, 'Удача').click();

  // #then
  await expect.poll(() => shownNotifications(player)).toEqual([GM_LUCK]);
  expect(await shownNotifications(gm)).toEqual([GM_LUCK]);
});

test('an error under a button clears when a value of the sheet changes', async ({ context }) => {
  // #given
  const gm = await openGm(context);

  await diceButton(gm.window, 'Деление').click();
  await expect(messageUnder(gm.window, 'Деление')).toHaveText(BAD_FORMULA_RESULT);

  // #when: "Деление" does not read "Ловкость".
  await valueField(gm.window, 'Ловкость').fill('5');
  await valueField(gm.window, 'Ловкость').press('Enter');

  // #then
  await expect(messageUnder(gm.window, 'Деление')).toHaveText('');
});

test('a press on a dice button saves the field typed into first, and the roll uses its value', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);

  await diceButton(gm.window, 'Ловкость').click();
  await expect(messageUnder(gm.window, 'Ловкость')).not.toHaveText('');

  // #when
  await valueField(gm.window, 'Ловкость').fill('5');
  await diceButton(gm.window, 'Ловкость').click();

  // #then
  await expect.poll(() => shownNotifications(gm)).toEqual(['Мастер: Брок, Ловкость — 6']);
  await expect(messageUnder(gm.window, 'Ловкость')).toHaveText('');
});

test("a dice cell of a repeat row in the second section rolls with the row's own field", async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);

  // #when
  await diceButton(gm.window, 'Атака').click();

  // #then: 1 + the row's bonus 3.
  await expect.poll(() => shownNotifications(gm)).toEqual(['Мастер: Брок, Атака — 4']);
});

test('a field error stays when the press saves another field', async ({ context }) => {
  // #given
  const gm = await openGm(context);

  await valueField(gm.window, 'Сила').fill('16');

  // #when: the press saves "Сила", and the save comes back from the replica.
  await diceButton(gm.window, 'Ловкость').click();
  await expect(messageUnder(gm.window, 'Ловкость')).toHaveText(DEX_ERROR);
  await diceButton(gm.window, 'Сила').click();
  await expect.poll(() => shownNotifications(gm)).toEqual(['Мастер: Брок, Сила — 15']);

  // #then
  await expect(messageUnder(gm.window, 'Ловкость')).toHaveText(DEX_ERROR);
});

test('a referenced field in an input error gives the field error and sends nothing', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  await valueField(gm.window, 'Сила').fill('abc');
  await valueField(gm.window, 'Сила').press('Enter');
  await expect(gm.window.getByText(BAD_NUMBER, { exact: true })).toBeVisible();

  // #when: the roll after it, which reads no field, reaches the player after it.
  await diceButton(gm.window, 'Сила').click();
  await expect(messageUnder(gm.window, 'Сила')).toHaveText(
    'Нельзя бросить: поле «Сила» пустое или не число',
  );
  await diceButton(gm.window, 'Монета').click();

  // #then
  await expect.poll(() => shownNotifications(player)).toEqual([GM_COIN]);
  expect(await shownNotifications(gm)).toEqual([GM_COIN]);
});

async function openGm(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);

  await seedStorage(window, RECORDS, JSON.stringify(PRESET), GM.device);

  const background = await openClientBackground(context, GM);

  await expect(window.getByRole('button', { name: ADD })).toBeVisible();
  await expect(diceButton(window, 'Сила')).toBeVisible();

  return { window, background, connectionId: connectionIdOf(GM) };
}

// A roll as a player's client would send it, with `hidden` as given.
function forgedRoll(id: string, hidden: boolean): JsonValue {
  return {
    v: 2,
    g: { n: 0, a: '' },
    t: 'roll',
    id,
    sheetId: 'npc',
    hidden,
    roller: 'Лиза',
    sheetName: 'NPC',
    cell: 'Хиты',
    result: { roll: 8, faces: [1], target: null, targetFaces: [], outcome: null },
  };
}

async function openPlayer(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);

  return { window, background, connectionId: connectionIdOf(PLAYER) };
}

// The background shows every roll, so its notifications are the client's.
async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

function diceButton(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('button', { name, exact: true });
}

function valueField(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name, exact: true });
}

// The live line that follows a dice button.
function messageUnder(page: Page, name: string): Locator {
  return diceButton(page, name).locator('xpath=following-sibling::span[@aria-live]');
}
