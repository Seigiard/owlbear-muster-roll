import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  addPartyMember,
  connectionIdOf,
  deviceKeys,
  npcBlock,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  seedStorage,
  syncRead,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const NO_GM = 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.';
const READ_ONLY = 'Только чтение';
const NO_PRESET = 'ГМ ещё не настроил листы.';
const NO_SHEETS = 'ГМ ещё не создал листы.';
const NO_GM_NO_DATA = 'ГМ ещё не заходил. Листов пока нет.';
const ADD = 'Добавить: Персонажи';
const ADD_NPC = 'Добавить в «Противники»';
const SETTINGS = 'Настройки';
const ACTIONS = 'Удалить лист';
const LOAD_PRESET = 'Загрузить пресет';

// A GM listed in the party with no page behind it: it never answers a request.
const SILENT_GM = 'mock-connection-silent';
const GM: ClientParams = { client: 'a', device: 'a' };
const PLAYER: ClientParams = { client: 'p', role: 'PLAYER', player: 'lisa', device: 'p' };

// A sheet set "Персонажи" and a hidden single sheet "NPC", whose NPCs are repeat blocks.
const PRESET = {
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
                {
                  cells: [
                    { kind: 'text', text: 'Устал' },
                    { kind: 'field', type: 'check', id: 'tired' },
                  ],
                },
                {
                  cells: [
                    { kind: 'text', text: 'Отдохнул' },
                    { kind: 'field', type: 'check', id: 'rested' },
                  ],
                },
                {
                  cells: [
                    { kind: 'text', text: 'Заметки' },
                    { kind: 'field', type: 'text', id: 'notes' },
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
      id: 'npc',
      title: 'NPC',
      visibility: 'gm',
      tabs: [
        {
          sections: [
            {
              title: 'Противники',
              repeat: { id: 'npc_name', nameField: 'npc_name' },
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'npc_name' }] },
                {
                  cells: [
                    { kind: 'text', text: 'Хиты' },
                    { kind: 'field', type: 'number', id: 'hp' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const PRESET_TEXT = JSON.stringify(PRESET);

// Анна sorts last by its order. Брок and Лиза share an order, so the sheet id decides.
const RECORDS: StoredRecord[] = [
  ...pcSheet('liza', 'Лиза', 0),
  ...pcSheet('anna', 'Анна', 1),
  ...pcSheet('brok', 'Брок', 0),
  record('blk:brok', { str: 14 }),
  record('blk:brok', { tired: true }),
  record('blk:brok', { notes: 'Храбрый' }),
  record('blk:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
  record('blk:brok:attack:i2', { order: 1, cells: { attack: 'Лук' } }),
  npcBlock('skel', 'Скелет', 0, { hp: 7 }),
];

const CHARACTER_TABS = ['Брок', 'Лиза', 'Анна'];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a player sees a tab for every character in order, each with its full sheet, and no hidden NPC tab, gear or "+"', async ({
  context,
}) => {
  // #given
  await openGm(context, RECORDS);
  // #when
  const player = await openClient(context, PLAYER, null);
  // #then
  await expect(player.window.getByRole('tab')).toHaveText(CHARACTER_TABS);
  await expect(player.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  const panel = player.window.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: 'Основное' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Атаки' })).toBeVisible();
  await expect(panel.getByText('14', { exact: true })).toBeVisible();
  await expect(panel.getByText('Храбрый', { exact: true })).toBeVisible();
  await expect(player.window.getByText('Скелет')).toHaveCount(0);
  await expect(player.window.getByRole('button', { name: ADD })).toHaveCount(0);
  await expect(player.window.getByRole('button', { name: ADD_NPC })).toHaveCount(0);
  await expect(player.window.getByRole('tab', { name: SETTINGS })).toHaveCount(0);

  for (const name of CHARACTER_TABS) {
    // oxlint-disable-next-line no-await-in-loop
    await player.window.getByRole('tab', { name }).click();
    // oxlint-disable-next-line no-await-in-loop
    await expect(panel.getByRole('heading', { name, level: 1 })).toBeVisible();
  }

  expect(await deviceKeys(player.window, 'p')).toEqual([]);
});

test('a player header shows the name as text and "Только чтение", with no "⋯"', async ({
  context,
}) => {
  // #given
  await openGm(context, RECORDS);
  // #when
  const player = await openClient(context, PLAYER, null);
  // #then
  const header = player.window.getByRole('tabpanel').locator('header');
  await expect(header.getByRole('heading', { name: 'Брок', level: 1 })).toBeVisible();
  await expect(header.getByText(READ_ONLY, { exact: true })).toBeVisible();
  await expect(player.window.getByRole('textbox')).toHaveCount(0);
  await expect(player.window.getByRole('button', { name: ACTIONS })).toHaveCount(0);
});

test('player values are text that takes no focus, and a check shows its state with no control', async ({
  context,
}) => {
  // #given
  await openGm(context, RECORDS);
  // #when
  const player = await openClient(context, PLAYER, null);
  const panel = player.window.getByRole('tabpanel');
  await expect(panel.getByText('14', { exact: true })).toBeVisible();
  // #then
  await expect(panel.getByRole('group', { name: 'Сила', exact: true })).toHaveText('14');
  await expect(panel.getByRole('group', { name: 'Заметки', exact: true })).toHaveText('Храбрый');
  await expect(panel.getByRole('img', { name: 'Устал: отмечено', exact: true })).toBeVisible();
  await expect(
    panel.getByRole('img', { name: 'Отдохнул: не отмечено', exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('checkbox')).toHaveCount(0);
  expect(await focusableInside(panel)).toEqual([]);
});

test('player repeat blocks show with no "Добавить" and no "Удалить"', async ({ context }) => {
  // #given
  await openGm(context, RECORDS);
  // #when
  const player = await openClient(context, PLAYER, null);
  const attacks = player.window.getByRole('region', { name: 'Атаки' });
  // #then
  // A row's text joins its cells with no separator.
  await expect(attacks.locator('[data-row]')).toHaveText(['АтакаМеч', 'АтакаЛук']);
  await expect(player.window.getByRole('button', { name: /Добавить/ })).toHaveCount(0);
  await expect(player.window.getByRole('button', { name: /Удалить/ })).toHaveCount(0);
});

test('a player whose GM answered with no preset sees that the GM has not set up sheets', async ({
  context,
}) => {
  // #given
  const gm = await openClient(context, GM, null);
  await expect(gm.window.getByRole('button', { name: LOAD_PRESET })).toBeEnabled();
  // #when
  const player = await openClient(context, PLAYER, null);
  // #then
  await expect(player.window.getByRole('main')).toHaveText(NO_PRESET);
});

test('a player with no answer and no room copy sees that no GM has been in the room after its catch-up ends', async ({
  context,
}) => {
  // #given
  const params: ClientParams = { ...PLAYER, catchUpTimeoutMs: 500 };
  const window = await openClientWindow(context, params);
  await addPartyMember(window, SILENT_GM, 'GM');
  // #when
  await openClientBackground(context, params);
  await expect.poll(() => syncRead(window)).toEqual({ state: 'live', answered: false });
  // #then: Story 2.6 names the case, and the banner says that no GM answers (Story 2.4).
  await expect(window.getByRole('status')).toHaveText(NO_GM);
  await expect(window.getByRole('main').getByText(NO_GM_NO_DATA, { exact: true })).toBeVisible();
  await expect(window.getByText(NO_PRESET)).toHaveCount(0);
  await expect(window.getByText(NO_SHEETS)).toHaveCount(0);
});

test('a player in a room with a preset and no visible sheet sees that the GM has not made any', async ({
  context,
}) => {
  // #given
  await openGm(context, []);
  // #when
  const player = await openClient(context, PLAYER, null);
  // #then
  await expect(player.window.getByRole('main')).toHaveText(NO_SHEETS);
});

test('a GM edit of a character updates the player view in place', async ({ context }) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  const playerPanel = player.window.getByRole('tabpanel');
  await expect(playerPanel.getByText('14', { exact: true })).toBeVisible();
  // #when
  await strength(gm.window).fill('16');
  await strength(gm.window).press('Enter');
  // #then
  await expect(playerPanel.getByText('16', { exact: true })).toBeVisible();
  await expect(playerPanel.getByText('14', { exact: true })).toHaveCount(0);
});

test('an NPC the GM adds to the hidden NPC sheet changes nothing in the player window', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  await expect(player.window.getByRole('tab')).toHaveText(CHARACTER_TABS);
  // #when
  await gm.window.getByRole('tab', { name: 'NPC' }).click();
  await gm.window.getByRole('button', { name: ADD_NPC }).click();
  await expect(npcNames(gm.window)).toHaveCount(2);
  await npcNames(gm.window).last().fill('Орк');
  await npcNames(gm.window).last().press('Enter');
  // An edit made after the NPC reaches the player only after the NPC's records did.
  await gm.window.getByRole('tab', { name: 'Брок' }).click();
  await strength(gm.window).fill('16');
  await strength(gm.window).press('Enter');
  await expect(player.window.getByRole('tabpanel').getByText('16', { exact: true })).toBeVisible();
  // #then
  await expect(player.window.getByRole('tab')).toHaveText(CHARACTER_TABS);
  await expect(player.window.getByText('Орк')).toHaveCount(0);
});

test('a GM rename and then deletion of the character a player has open reach the player', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  await player.window.getByRole('tab', { name: 'Лиза' }).click();
  await expect(player.window.getByRole('tab', { name: 'Лиза', selected: true })).toBeVisible();
  await gm.window.getByRole('tab', { name: 'Лиза' }).click();
  // #when
  const name = gm.window.getByRole('textbox', { name: 'Имя листа' });
  await name.fill('Лиза Смелая');
  await name.press('Enter');
  // #then
  await expect(
    player.window.getByRole('tab', { name: 'Лиза Смелая', selected: true }),
  ).toBeVisible();
  // #when
  await gm.window.getByRole('button', { name: ACTIONS }).click();
  await gm.window.getByRole('group').getByRole('button', { name: 'Удалить' }).click();
  // #then
  await expect(player.window.getByRole('tab')).toHaveText(['Брок', 'Анна']);
  await expect(player.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
});

test('a GM in Settings with no preset made a player and back keeps Settings selected', async ({
  context,
}) => {
  // #given
  const gm = await openClient(context, GM, null);
  const settings = gm.window.getByRole('tab', { name: SETTINGS });
  await settings.click();
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  // #when
  await setRole(gm, 'PLAYER');
  await expect(settings).toHaveCount(0);
  await setRole(gm, 'GM');
  // #then
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  await expect(gm.window.getByRole('button', { name: LOAD_PRESET })).toBeVisible();
});

test('a GM on the NPC tab made a player lands on the first character tab', async ({ context }) => {
  // #given
  const gm = await openGm(context, RECORDS);
  await gm.window.getByRole('tab', { name: 'NPC' }).click();
  await expect(gm.window.getByRole('tab', { name: 'NPC', selected: true })).toBeVisible();
  // #when
  await setRole(gm, 'PLAYER');
  // #then
  await expect(gm.window.getByRole('tab')).toHaveText(CHARACTER_TABS);
  await expect(gm.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(gm.window.getByRole('tabpanel').getByText(READ_ONLY)).toBeVisible();
});

test('a GM in Settings made a player lands on the first character tab', async ({ context }) => {
  // #given
  const gm = await openGm(context, RECORDS);
  await gm.window.getByRole('tab', { name: 'Лиза' }).click();
  await gm.window.getByRole('tab', { name: SETTINGS }).click();
  await expect(gm.window.getByRole('tab', { name: SETTINGS, selected: true })).toBeVisible();
  // #when
  await setRole(gm, 'PLAYER');
  // #then
  await expect(gm.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(gm.window.getByRole('tab', { name: SETTINGS })).toHaveCount(0);
});

test('a GM with a delete confirmation open made a player sees it close on the same tab', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  await gm.window.getByRole('button', { name: ACTIONS }).click();
  await expect(confirmation(gm.window, 'Брок')).toBeVisible();
  // #when
  await setRole(gm, 'PLAYER');
  await expect(gm.window.getByRole('tabpanel').getByText(READ_ONLY)).toBeVisible();
  // #then: closed for good, so a promotion back does not bring it back.
  await expect(gm.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(confirmation(gm.window, 'Брок')).toHaveCount(0);
  await setRole(gm, 'GM');
  await expect(gm.window.getByRole('button', { name: ACTIONS })).toBeVisible();
  await expect(confirmation(gm.window, 'Брок')).toHaveCount(0);
});

test('a player made GM gets the NPC entry, Settings and the add control', async ({ context }) => {
  // #given
  await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  await expect(player.window.getByRole('tab')).toHaveText(CHARACTER_TABS);
  // #when
  await setRole(player, 'GM');
  // #then
  await expect(player.window.getByRole('tab')).toHaveText([...CHARACTER_TABS, 'NPC', SETTINGS]);
  await expect(player.window.getByRole('button', { name: ADD })).toBeVisible();
  await player.window.getByRole('tab', { name: 'NPC' }).click();
  await expect(npcNames(player.window)).toHaveValue('Скелет');
});

// A live GM whose device holds the preset and `records`.
async function openGm(
  context: BrowserContext,
  records: readonly StoredRecord[],
): Promise<RoomClient> {
  const gm = await openClient(context, GM, records);
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

// The role belongs to the background, which owns the replica.
async function setRole(client: RoomClient, role: 'GM' | 'PLAYER'): Promise<void> {
  await client.background.evaluate((next) => {
    window.mockPlatform.setRole(next);
  }, role);
}

// The first field of an NPC repeat block has no label before it, so its id names it.
function npcNames(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'npc_name' });
}

function strength(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'Сила', exact: true });
}

function confirmation(page: Page, name: string): Locator {
  return page.getByText(`Удалить «${name}»? Это нельзя отменить.`);
}

// Every element inside the panel that the keyboard can reach, by tag name.
async function focusableInside(panel: Locator): Promise<string[]> {
  return panel.evaluate((element) =>
    [
      ...element.querySelectorAll(
        'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      ),
    ].map((found) => found.tagName),
  );
}
