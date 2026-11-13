import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';

import { cssValue, renderedColor } from './support/colors';
import {
  ADD,
  addPartyMember,
  afterSettling,
  connectionIdOf,
  EXAMPLE_PRESET_TEXT,
  isStorageKeyInGeneration,
  openBackground,
  openClientBackground,
  openClientWindow,
  npcBlock,
  openRoom,
  pcSheet,
  record,
  roomKeys,
  seedStorage,
  storageKey,
  storageKeyParts,
  storedRecords,
  watchCommands,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

// The strings of TASK-30 and the file format of the 5.2 spec, written out by hand.
const SETTINGS = 'Настройки';
const SNAPSHOT = 'Снимок';
const DOWNLOAD = 'Скачать снимок';
const UPLOAD = 'Загрузить снимок';
const LOAD_PRESET = 'Загрузить пресет';
const PRESET_REQUIRED = 'Сначала загрузите пресет.';
const CANCEL = 'Отменить';
const DATA_REPLACED = 'Данные комнаты заменены';

const ASK =
  'Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?';

const ASK_DROPS_ONE = `${ASK} Не войдут значения удалённых полей: 1.`;
const NOT_SNAPSHOT = 'Файл не подошёл: это не снимок. Ничего не изменено.';
const NOT_JSON = 'Файл не подошёл: это не JSON. Ничего не изменено.';
const NEWER = 'Файл из более новой версии. Перезагрузите страницу.';
const ASK_DROPS_SHEETS = `${ASK} Не войдут значения удалённых полей: 1. Не войдут листы: 2.`;
const UNSUPPORTED = 'Файл не подошёл: неподдерживаемая версия формата. Ничего не изменено.';
const SILENT_GM = 'silent-gm';
const OPEN_ITEM = 'app.muster-roll/open-sheet';
const ACCENT: readonly [number, number, number] = [187, 153, 255];

// Midday, so no time zone of the test machine moves it to another date.
const FIXED_NOW = new Date(2026, 0, 5, 12, 0).getTime();

// Two sheets of "Персонажи" and one NPC, a repeat block of the single sheet "NPC". t1 links a sheet
// and t3 the NPC's repeat block.
const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 1),
  ...pcSheet('anya', 'Аня', 0),
  npcBlock('skel', 'Скелет', 0, { hp: 7 }),
  record('row:brok:class', { class: 'Воин', level: 3 }),
  record('rep:brok:attack:i2', { order: 1, cells: { attack: 'Топор', bonus: 2 } }),
  record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
  record('acl:brok:lisa', { name: 'Лиза' }),
  record('plink:brok:lisa', { name: 'Лиза' }),
  record('link:t1', { s: 'brok' }),
  record('link:t3', { s: 'npc', i: 'skel' }),
  // A deleted sheet with a live row left behind, and a link to it.
  record('sheet:gone', null, 2),
  record('row:gone:class', { class: 'Лучник' }),
  record('link:t2', { s: 'gone' }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('Settings lists Пресет, Снимок, Копия в комнате, Очистка, with the primary download first under Снимок', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);

  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();

  // #then
  const section = snapshotSection(page);

  await expect(page.getByRole('tabpanel').getByRole('heading')).toHaveText([
    'Пресет',
    SNAPSHOT,
    'Копия в комнате',
    'Очистка',
  ]);
  await expect(section.getByRole('button')).toHaveText([DOWNLOAD, UPLOAD]);
  expect(
    await renderedColor(section.getByRole('button', { name: DOWNLOAD }), 'background-color'),
  ).toEqual(ACCENT);
});

test('with a preset, "Скачать снимок" and "Загрузить снимок" are both enabled', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);

  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();

  // #then
  await expect(snapshotSection(page).getByRole('button', { name: DOWNLOAD })).toBeEnabled();
  await expect(snapshotSection(page).getByRole('button', { name: UPLOAD })).toBeEnabled();
});

test('the downloaded snapshot holds the live sheets, their values and links, and nothing else', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);
  await page.clock.setFixedTime(FIXED_NOW);
  await page.getByRole('tab', { name: SETTINGS }).click();
  await watchCommands(page);

  // #when
  const downloading = page.waitForEvent('download');

  await snapshotSection(page).getByRole('button', { name: DOWNLOAD }).click();

  const download = await downloading;
  const text = readFileSync(await download.path(), 'utf8');

  // #then
  expect({
    name: download.suggestedFilename(),
    file: z.json().parse(JSON.parse(text)),
    commands: (await afterSettling(page)).commands,
  }).toEqual({
    name: 'muster-roll-snapshot-2026-01-05.json',
    // The templates in preset order: the sheets of "Персонажи" by order, then each single sheet
    // once, with values or none.
    file: {
      v: 3,
      type: 'muster-roll/snapshot',
      sheets: [
        { id: 'anya', set: 'pc', order: 0, rows: { name: { name: 'Аня' } }, repeats: {} },
        {
          id: 'brok',
          set: 'pc',
          order: 1,
          rows: { class: { class: 'Воин', level: 3 }, name: { name: 'Брок' } },
          repeats: {
            attack: [
              { instanceId: 'i1', order: 0, cells: { attack: 'Меч' } },
              { instanceId: 'i2', order: 1, cells: { attack: 'Топор', bonus: 2 } },
            ],
          },
        },
        {
          id: 'npc',
          rows: {},
          repeats: {
            npc_name: [{ instanceId: 'skel', order: 0, cells: { hp: 7, npc_name: 'Скелет' } }],
          },
        },
        { id: 'inventory', rows: {}, repeats: {} },
      ],
      links: [
        { tokenId: 't1', sheetId: 'brok' },
        { tokenId: 't3', sheetId: 'npc', instanceId: 'skel' },
      ],
    },
    commands: [],
  });
});

test('with no preset, both snapshot buttons are disabled with the preset-first reason', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');
  await openBackground(context);
  await expect(page.getByRole('button', { name: LOAD_PRESET })).toBeVisible();

  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();

  // #then
  const download = snapshotSection(page).getByRole('button', { name: DOWNLOAD });
  const upload = snapshotSection(page).getByRole('button', { name: UPLOAD });

  await expect(download).toBeDisabled();
  await expect(download).toHaveAccessibleDescription(PRESET_REQUIRED);
  await expect(upload).toBeDisabled();
  await expect(upload).toHaveAccessibleDescription(PRESET_REQUIRED);
  await expect(snapshotSection(page).getByRole('button')).toHaveText([DOWNLOAD, UPLOAD]);
  expect(await cssValue(upload, 'border-top-width')).toBe('1px');
});

// The file of the 5.3 tests: one character the example preset places, and one value it has no
// field for.
const MIRA_FILE = {
  v: 3,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'mira',
      set: 'pc',
      order: 0,
      rows: { name: { name: 'Мира' }, class: { class: 'Маг', level: 2, gone: 'x' } },
      repeats: {},
    },
  ],
  links: [{ tokenId: 't9', sheetId: 'mira' }],
};

// MIRA_FILE with two sheets the example preset has no template for: a sheet of a sheet set
// "ships" and a single sheet "journal", each with a link.
const UNKNOWN_TEMPLATES_FILE = {
  ...MIRA_FILE,
  sheets: [
    ...MIRA_FILE.sheets,
    { id: 'ship', set: 'ships', order: 0, rows: {}, repeats: {} },
    { id: 'journal', rows: {}, repeats: {} },
  ],
  links: [
    { tokenId: 't9', sheetId: 'mira' },
    { tokenId: 't-ship', sheetId: 'ship' },
    { tokenId: 't-journal', sheetId: 'journal' },
  ],
};

// Аня comes first, so opening Мира from its token changes the tab. `t-absent` is no token on the
// scene.
const LINKED_FILE = {
  ...MIRA_FILE,
  sheets: [
    { id: 'anya', set: 'pc', order: 0, rows: { name: { name: 'Аня' } }, repeats: {} },
    { ...MIRA_FILE.sheets[0], order: 1 },
  ],
  links: [
    { tokenId: 't9', sheetId: 'mira' },
    { tokenId: 't-absent', sheetId: 'anya' },
  ],
};

const GM: ClientParams = { client: 'a', name: 'Мастер' };
const OTHER_GM: ClientParams = { client: 'b', name: 'Второй', device: 'b' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  name: 'Лиза',
};

test('a file that is no snapshot, or not JSON, or newer, is refused under the button and asks nothing', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);
  await page.getByRole('tab', { name: SETTINGS }).click();

  const cases: [string, string][] = [
    [EXAMPLE_PRESET_TEXT, NOT_SNAPSHOT],
    ['{', NOT_JSON],
    [JSON.stringify({ v: 4, type: 'muster-roll/snapshot' }), NEWER],
    // AD-12: no migration from a version 1 file.
    [JSON.stringify({ ...MIRA_FILE, v: 1 }), UNSUPPORTED],
  ];

  for (const [text, message] of cases) {
    // #when
    // oxlint-disable-next-line no-await-in-loop
    await chooseSnapshot(page, text);

    // #then
    // oxlint-disable-next-line no-await-in-loop
    await expect(underImport(page)).toHaveText(message);
    // oxlint-disable-next-line no-await-in-loop
    await expect(confirmation(page)).toHaveCount(0);
  }

  expect(await storedRecords(page, 'sheet:brok')).toHaveLength(1);
});

test('a snapshot asks once, with the dropped count, and its focus starts on "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);
  await page.getByRole('tab', { name: SETTINGS }).click();

  // #when
  await chooseSnapshot(page, JSON.stringify(MIRA_FILE));

  // #then
  await expect(confirmation(page)).toHaveAccessibleName(ASK_DROPS_ONE);
  await expect(confirmation(page).getByRole('button')).toHaveText([UPLOAD, CANCEL]);
  await expect(confirmation(page).getByRole('button', { name: CANCEL })).toBeFocused();
});

test('a file sheet of a template the preset lacks is dropped, counted, and stays out with its links', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);
  await page.getByRole('tab', { name: SETTINGS }).click();
  await chooseSnapshot(page, JSON.stringify(UNKNOWN_TEMPLATES_FILE));
  await expect(confirmation(page)).toHaveAccessibleName(ASK_DROPS_SHEETS);

  // #when
  await confirmation(page).getByRole('button', { name: UPLOAD }).click();

  // #then
  await expect(page.getByRole('tab', { name: 'Мира' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveText(['Мира', 'NPC', 'Инвентарь', SETTINGS]);

  // The old generation goes once the new one is complete, so only the import's keys stay.
  await expect
    .poll(async () =>
      (await roomKeys(page))
        .map((key) => storageKeyParts(key).recordKey)
        .filter((key) => key.startsWith('link:') || key.startsWith('sheet:'))
        .sort(),
    )
    .toEqual(['link:t9', 'sheet:mira']);
});

test('"Отменить" and Escape close the block and write nothing', async ({ page, context }) => {
  // #given
  await openRoom(page, context, RECORDS);
  await page.getByRole('tab', { name: SETTINGS }).click();
  await watchCommands(page);

  const keysBefore = await roomKeys(page);

  await chooseSnapshot(page, JSON.stringify(MIRA_FILE));

  // #when
  await confirmation(page).getByRole('button', { name: CANCEL }).click();

  // #then
  await expect(confirmation(page)).toHaveCount(0);
  await expect(importButton(page)).toBeFocused();

  // #when
  await chooseSnapshot(page, JSON.stringify(MIRA_FILE));
  await expect(confirmation(page).getByRole('button', { name: CANCEL })).toBeFocused();
  await page.keyboard.press('Escape');

  // #then
  await expect(confirmation(page)).toHaveCount(0);
  const commands = (await afterSettling(page)).commands;
  const keys = await roomKeys(page);

  expect({
    commands,
    keys,
    onlyFirstGeneration: keys.every((key) => isStorageKeyInGeneration(key, { n: 0, a: '' })),
  }).toEqual({ commands: [], keys: keysBefore, onlyFirstGeneration: true });
});

test('a confirm after the preset changed asks again with the new count, focused on "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);
  await page.getByRole('tab', { name: SETTINGS }).click();
  await chooseSnapshot(page, JSON.stringify(MIRA_FILE));
  await expect(confirmation(page)).toHaveAccessibleName(ASK_DROPS_ONE);

  // #when: another window of the GM renames "level", so the file's level has no field either.
  const other = await openClientWindow(context, {});

  await other.getByRole('tab', { name: SETTINGS }).click();
  await uploadPreset(other, EXAMPLE_PRESET_TEXT.replaceAll('level', 'rank'));
  await other
    .getByRole('group', { name: /Загрузить пресет\?$/ })
    .getByRole('button', { name: LOAD_PRESET })
    .click();
  await expect(other.getByRole('group', { name: /Загрузить пресет\?$/ })).toHaveCount(0);
  await confirmation(page).getByRole('button', { name: UPLOAD }).click();

  // #then
  await expect(confirmation(page)).toHaveAccessibleName(
    `${ASK} Не войдут значения удалённых полей: 2.`,
  );
  await expect(confirmation(page).getByRole('button', { name: CANCEL })).toBeFocused();
  expect(
    (await roomKeys(page)).every((key) => isStorageKeyInGeneration(key, { n: 0, a: '' })),
  ).toBe(true);

  // #when
  await confirmation(page).getByRole('button', { name: UPLOAD }).click();

  // #then
  await expect(confirmation(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Мира' })).toBeVisible();
});

test('a catch-up closes an open confirmation, writes nothing, and the focus comes back to the button', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, RECORDS);

  await page.getByRole('tab', { name: SETTINGS }).click();

  const keysBefore = await roomKeys(page);

  await chooseSnapshot(page, JSON.stringify(MIRA_FILE));
  await expect(confirmation(page)).toBeVisible();

  // #when: a GM that never answers joins, and the page comes back online.
  await addPartyMember(page, SILENT_GM, 'GM');
  await background.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });

  // #then
  await expect(confirmation(page)).toHaveCount(0);
  await expect(importButton(page)).toHaveAccessibleDescription('Загрузка…');
  expect(await roomKeys(page)).toEqual(keysBefore);
  // The button takes the focus again once catch-up gives up on the silent GM.
  await expect(importButton(page)).toBeFocused({ timeout: 10000 });
  expect(await roomKeys(page)).toEqual(keysBefore);
});

test('after an import a link to a token in the room opens its sheet, and one to an absent token stays inert', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, RECORDS);

  await page.getByRole('tab', { name: SETTINGS }).click();
  await chooseSnapshot(page, JSON.stringify(LINKED_FILE));
  await confirmation(page).getByRole('button', { name: UPLOAD }).click();
  await expect(page.getByRole('tab', { name: 'Мира' })).toBeVisible();
  await expect
    .poll(() =>
      background.evaluate(() => window.mockPlatform.contextMenuItems().map((item) => item.id)),
    )
    .toContain(OPEN_ITEM);

  // #when: only t9 is a token on the scene.
  const clicked = await background.evaluate(
    ([item, token]) => window.mockPlatform.clickContextMenuItem(item, [token]),
    [OPEN_ITEM, 't9'] as const,
  );

  // #then
  expect(clicked).toBe(true);
  await expect(page.getByRole('tab', { name: 'Мира' })).toHaveAttribute('aria-selected', 'true');
  expect(await background.evaluate(() => window.mockPlatform.shownNotifications())).toEqual([]);
});

test('a confirmed import replaces the room on every client: another GM and a player are told and see it', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, GM);
  const other = await openGm(context, OTHER_GM);
  const player = await openPlayer(context);

  await expect(player.window.getByRole('tab', { name: 'Брок' })).toBeVisible();
  await gm.window.getByRole('tab', { name: SETTINGS }).click();
  await chooseSnapshot(gm.window, JSON.stringify(MIRA_FILE));

  // #when
  await confirmation(gm.window).getByRole('button', { name: UPLOAD }).click();

  // #then
  await expect(confirmation(gm.window)).toHaveCount(0);

  for (const client of [gm, other, player]) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(client.window.getByRole('tab', { name: 'Мира' })).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop
    await expect(client.window.getByRole('tab', { name: 'Брок' })).toHaveCount(0);
  }

  await expect.poll(() => shownNotifications(other)).toEqual([DATA_REPLACED]);
  await expect.poll(() => shownNotifications(player)).toEqual([DATA_REPLACED]);
  expect(await shownNotifications(gm)).toEqual([]);
  // The old generation goes once the new one is complete.
  const imported = { n: 1, a: gm.connectionId };

  await expect
    .poll(async () =>
      (await roomKeys(gm.window)).every((key) => isStorageKeyInGeneration(key, imported)),
    )
    .toBe(true);
  expect(await roomKeys(gm.window)).toContain(storageKey('sheet:mira', imported));
});

async function openGm(context: BrowserContext, params: ClientParams): Promise<RoomClient> {
  const window = await openClientWindow(context, params);

  await seedStorage(window, RECORDS, undefined, params.device ?? '');

  const background = await openClientBackground(context, params);

  await expect(window.getByRole('button', { name: ADD })).toBeVisible();

  return { window, background, connectionId: connectionIdOf(params) };
}

async function openPlayer(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);

  return { window, background, connectionId: connectionIdOf(PLAYER) };
}

async function uploadPreset(page: Page, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');

  await page
    .getByRole('region', { name: 'Пресет' })
    .getByRole('button', { name: LOAD_PRESET })
    .click();

  const chooser = await choosing;

  await chooser.setFiles({
    name: 'preset.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

async function chooseSnapshot(page: Page, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');

  await importButton(page).click();

  const chooser = await choosing;

  await chooser.setFiles({
    name: 'snapshot.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

// The background shows the notifications of its client.
async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

function snapshotSection(page: Page): Locator {
  return page.getByRole('region', { name: SNAPSHOT });
}

function importButton(page: Page): Locator {
  return snapshotSection(page).getByRole('button', { name: UPLOAD });
}

function underImport(page: Page): Locator {
  return importButton(page).locator('xpath=ancestor::div[1]/div[@aria-live]');
}

function confirmation(page: Page): Locator {
  return page.getByRole('group', { name: /Загрузить снимок\?/ });
}
