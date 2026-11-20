import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { inflateSync, strFromU8 } from 'fflate';
import { z } from 'zod';
import type { JsonValue } from '@/core/json';
import {
  ABSENT,
  ADD,
  addPartyMember,
  connectionIdOf,
  isStorageKeyInGeneration,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  roomKeys,
  repRecord,
  seedStorage,
  storedCell,
  storedData,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const UPLOAD = 'Загрузить пресет';
const CANCEL = 'Отменить';
const SETTINGS = 'Настройки';
const CHANGED = 'Формат листов изменён.';
const SILENT_GM = 'silent-gm';
const GM: ClientParams = { client: 'a', name: 'Мастер', catchUpTimeoutMs: 8000 };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  name: 'Лиза',
};

function labelled(label: string, ...cells: JsonValue[]): JsonValue {
  return { cells: [{ kind: 'text', text: label }, ...cells] };
}

function number(id: string): JsonValue {
  return { kind: 'field', type: 'number', id };
}

const ATTACKS = {
  title: 'Атаки',
  repeat: { id: 'bonus', nameField: 'attack' },
  rows: [labelled('Атака', { kind: 'field', type: 'text', id: 'attack' }, number('bonus'))],
};

const NAME = { rows: [labelled('Имя', { kind: 'field', type: 'text', id: 'name' })] };

const NPC = {
  id: 'npc',
  title: 'NPC',
  tabs: [{ sections: [{ rows: [labelled('Хиты', number('hp'))] }] }],
};

function presetText(rows: readonly JsonValue[], more: readonly JsonValue[] = []): string {
  return JSON.stringify({
    v: 4,
    templates: [
      {
        id: 'pc',
        title: 'Персонажи',
        repeat: { nameField: 'name' },
        tabs: [{ sections: [NAME, { title: 'Основное', rows }, ATTACKS] }],
      },
      NPC,
      ...more,
    ],
  });
}

// A second sheet set, "Экипаж", which an upload of BEFORE drops.
const CREW = {
  id: 'crew',
  title: 'Экипаж',
  repeat: { nameField: 'name' },
  tabs: [{ sections: [NAME] }],
};

const BEFORE = presetText([
  labelled('Сила', number('str'), { kind: 'dice', formula: '1d1 + str' }),
  labelled('Ловкость', number('dex')),
  labelled('Усталость', { kind: 'field', type: 'check', id: 'tired' }),
]);

// "Сила" is "Мощь" now with the same id, "Мудрость" is new, and "Ловкость" and "Усталость" go. The
// formula reads the new field, which has no stored value.
const REMOVES_TWO = presetText([
  labelled('Мощь', number('str'), { kind: 'dice', formula: '1d1 + wis' }),
  labelled('Мудрость', number('wis')),
]);

// Only "Ловкость" goes.
const REMOVES_DEX = presetText([
  labelled('Сила', number('str'), { kind: 'dice', formula: '1d1 + str' }),
  labelled('Усталость', { kind: 'field', type: 'check', id: 'tired' }),
]);

// Only a label changes.
const RELABELLED = presetText([
  labelled('Мощь', number('str'), { kind: 'dice', formula: '1d1 + str' }),
  labelled('Ловкость', number('dex')),
  labelled('Усталость', { kind: 'field', type: 'check', id: 'tired' }),
]);

// `false` holds a value, so the two removed fields hold two values. The player may edit "Брок", so
// its window shows the values in fields too.
const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  record('acl:brok:lisa', { name: 'Лиза' }),
  record('blk:brok', { str: 14 }),
  record('blk:brok', { dex: 3 }),
  record('blk:brok', { tired: false }),
  record('blk:brok:bonus:i1', { order: 0, cells: { bonus: 2 } }),
];

const WITH_CREW = presetText(
  [
    labelled('Сила', number('str'), { kind: 'dice', formula: '1d1 + str' }),
    labelled('Ловкость', number('dex')),
    labelled('Усталость', { kind: 'field', type: 'check', id: 'tired' }),
  ],
  [CREW],
);

// Three sheets of "Экипаж", each holding only its name.
const CREW_SHEETS: StoredRecord[] = [
  record('blk:ivan', { set: 'crew', order: 0 }),
  record('blk:ivan', { name: 'Иван' }),
  record('blk:petr', { set: 'crew', order: 1 }),
  record('blk:petr', { name: 'Пётр' }),
  record('blk:yana', { set: 'crew', order: 2 }),
  record('blk:yana', { name: 'Яна' }),
];

const LOOT_ITEMS = {
  title: 'Вещи',
  repeat: { id: 'loot_item', nameField: 'loot_item' },
  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'loot_item' }] }],
};

// A linkable single sheet "Добыча" whose repeat section is linkable too, or no longer.
function lootPreset(sectionTokens: boolean): string {
  const items: JsonValue = sectionTokens
    ? {
        ...LOOT_ITEMS,
        rows: [
          {
            cells: [
              { kind: 'field' as const, type: 'text' as const, id: 'loot_item' },
              { kind: 'token' as const, id: 'token' },
            ],
          },
        ],
      }
    : LOOT_ITEMS;

  const loot: JsonValue = {
    id: 'loot',
    title: 'Добыча',
    tabs: [
      {
        sections: [{ rows: [{ cells: [{ kind: 'token', id: 'token' }] }] }, items],
      },
    ],
  };

  return presetText([labelled('Сила', number('str'))], [loot]);
}

const WITH_TOKENS = lootPreset(true);
const WITHOUT_TOKENS = lootPreset(false);

// t-gob links a repeat block of "Добыча", t-chest the whole sheet.
const TOKEN_RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  record('blk:brok', { str: 14 }),
  repRecord('loot', 'loot_item', 'i1', 0, { loot_item: 'Меч' }),
  record('link:t-gob', { s: 'loot', path: ['loot_item', 'i1'], c: 'token' }),
  record('link:t-chest', { s: 'loot', c: 'token' }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('an upload that erases values asks once with focus on "Отменить", which changes nothing', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  await openSettings(gm.window);
  // #when
  await uploadFile(gm.window, REMOVES_TWO);
  // #then
  await expect(block(gm.window)).toHaveAccessibleName(
    'Значения удалённых полей будут стёрты: 2. Загрузить пресет?',
  );
  await expect(block(gm.window).getByRole('button', { name: CANCEL })).toBeFocused();
  // #when
  await block(gm.window).getByRole('button', { name: CANCEL }).click();
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  await expect(uploadButton(gm.window)).toBeFocused();
  expect({
    preset: await storedPreset(gm.window),
    dex: await storedCell(gm.window, 'blk:brok', 'dex'),
  }).toEqual({ preset: JSON.parse(BEFORE), dex: [3, 1, 'seed'] });
});

test('Escape closes the confirmation and changes nothing', async ({ context }) => {
  // #given
  const gm = await openGm(context);
  await openSettings(gm.window);
  await uploadFile(gm.window, REMOVES_TWO);
  await expect(block(gm.window).getByRole('button', { name: CANCEL })).toBeFocused();
  // #when
  await gm.window.keyboard.press('Escape');
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  expect(await storedPreset(gm.window)).toEqual(JSON.parse(BEFORE));
});

test('a confirmed upload erases the removed values on every client, keeps renamed ones and leaves new fields empty', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);
  await expect(valueField(player.window, 'Сила')).toHaveValue('14');
  await openSettings(gm.window);
  await uploadFile(gm.window, REMOVES_TWO);
  // #when
  await block(gm.window).getByRole('button', { name: UPLOAD }).click();
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  await expect(underUpload(gm.window)).toHaveText(CHANGED);
  await expect(uploadButton(gm.window)).toBeFocused();
  await gm.window.getByRole('tab', { name: 'Брок' }).click();

  for (const page of [gm.window, player.window]) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(valueField(page, 'Мощь')).toHaveValue('14');
    // oxlint-disable-next-line no-await-in-loop
    await expect(valueField(page, 'Мудрость')).toHaveValue('');
    // oxlint-disable-next-line no-await-in-loop
    await expect(valueField(page, 'Ловкость')).toHaveCount(0);
  }

  // AD-14: the generation does not change, so every record stays under the same storage keys.
  expect({
    preset: await storedPreset(gm.window),
    dex: await storedCell(gm.window, 'blk:brok', 'dex'),
    tired: await storedCell(gm.window, 'blk:brok', 'tired'),
    str: await storedCell(gm.window, 'blk:brok', 'str'),
    bonus: await storedCell(gm.window, 'blk:brok:bonus:i1', 'bonus'),
    otherGenerations: (await roomKeys(gm.window)).filter(
      (key) => !isStorageKeyInGeneration(key, { n: 0, a: '' }),
    ),
  }).toEqual({
    preset: JSON.parse(REMOVES_TWO),
    dex: [null, 2, gm.connectionId],
    tired: [null, 2, gm.connectionId],
    str: [14, 1, 'seed'],
    bonus: [2, 1, 'seed'],
    otherGenerations: [],
  });
});

test('a roll that reads a new empty field shows its label in the error and sends nothing', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  await openSettings(gm.window);
  await uploadFile(gm.window, REMOVES_TWO);
  await block(gm.window).getByRole('button', { name: UPLOAD }).click();
  await expect(block(gm.window)).toHaveCount(0);
  await gm.window.getByRole('tab', { name: 'Брок' }).click();
  // #when
  await diceButton(gm.window, 'Мощь').click();
  // #then
  await expect(messageUnder(gm.window, 'Мощь')).toHaveText(
    'Нельзя бросить: поле «Мудрость» пустое или не число',
  );
  expect(await shownNotifications(gm)).toEqual([]);
});

test('an upload that erases nothing applies at once and says so under the button', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  await openSettings(gm.window);
  // #when
  await uploadFile(gm.window, RELABELLED);
  // #then
  await expect(underUpload(gm.window)).toHaveText(CHANGED);
  await expect(block(gm.window)).toHaveCount(0);
  expect(await storedPreset(gm.window)).toEqual(JSON.parse(RELABELLED));
});

test('a confirm after the replica changed asks again with the new count', async ({ context }) => {
  // #given
  const gm = await openGm(context);
  const other = await openClientWindow(context, GM);
  await openSettings(gm.window);
  await uploadFile(gm.window, REMOVES_TWO);
  await expect(block(gm.window)).toHaveAccessibleName(/стёрты: 2\./);
  // #when: another window of the GM clears "Ловкость", so only "Усталость" holds a value.
  await clearField(other, 'Ловкость');
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'dex'))
    .toEqual([null, 2, gm.connectionId]);
  await block(gm.window).getByRole('button', { name: UPLOAD }).click();
  // #then
  await expect(block(gm.window)).toHaveAccessibleName(
    'Значения удалённых полей будут стёрты: 1. Загрузить пресет?',
  );
  await expect(block(gm.window).getByRole('button', { name: CANCEL })).toBeFocused();
  expect(await storedPreset(gm.window)).toEqual(JSON.parse(BEFORE));
  // #when
  await block(gm.window).getByRole('button', { name: UPLOAD }).click();
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  await expect.poll(() => storedPreset(gm.window)).toEqual(JSON.parse(REMOVES_TWO));
});

test('a confirm after the count fell to 0 closes the block and takes the path that erases nothing', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const other = await openClientWindow(context, GM);
  await openSettings(gm.window);
  await uploadFile(gm.window, REMOVES_DEX);
  await expect(block(gm.window)).toHaveAccessibleName(/стёрты: 1\./);
  // #when
  await clearField(other, 'Ловкость');
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'dex'))
    .toEqual([null, 2, gm.connectionId]);
  await block(gm.window).getByRole('button', { name: UPLOAD }).click();
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  await expect(underUpload(gm.window)).toHaveText(CHANGED);
  expect(await storedPreset(gm.window)).toEqual(JSON.parse(REMOVES_DEX));
});

test('a catch-up closes an open confirmation and writes nothing', async ({ context }) => {
  // #given
  const gm = await openGm(context);
  await openSettings(gm.window);
  await uploadFile(gm.window, REMOVES_TWO);
  await expect(block(gm.window)).toBeVisible();
  // #when: a GM that never answers joins, and the page comes back online.
  await addPartyMember(gm.window, SILENT_GM, 'GM');
  await gm.background.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  await expect(uploadButton(gm.window)).toHaveAccessibleDescription('Загрузка…');
  expect({
    preset: await storedPreset(gm.window),
    tired: await storedCell(gm.window, 'blk:brok', 'tired'),
  }).toEqual({ preset: JSON.parse(BEFORE), tired: [false, 1, 'seed'] });
});

test('an upload that drops a sheet set with three sheets names the deleted sheets, and "Отменить" keeps them', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, [...RECORDS, ...CREW_SHEETS], WITH_CREW);
  await openSettings(gm.window);
  // #when
  await uploadFile(gm.window, BEFORE);
  // #then: each sheet's name is a value of its name field, so the three names are erased too.
  await expect(block(gm.window)).toHaveAccessibleName(
    'Значения удалённых полей будут стёрты: 3. Листы будут удалены: 3. Загрузить пресет?',
  );
  await expect(block(gm.window).getByRole('button', { name: CANCEL })).toBeFocused();
  // #when
  await block(gm.window).getByRole('button', { name: CANCEL }).click();
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  expect({
    preset: await storedPreset(gm.window),
    tabs: await gm.window.getByRole('tab').allTextContents(),
    sheet: await storedData(gm.window, 'blk:ivan'),
  }).toEqual({
    preset: JSON.parse(WITH_CREW),
    tabs: ['Брок', 'NPC', 'Иван', 'Пётр', 'Яна', SETTINGS],
    sheet: { set: 'crew', order: 0, cells: { name: ['Иван', 1, 'seed'] } },
  });
});

test('a confirmed upload that drops a sheet set deletes its sheets on every client', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, [...RECORDS, ...CREW_SHEETS], WITH_CREW);
  const player = await openPlayer(context);
  await expect(player.window.getByRole('tab', { name: 'Яна' })).toBeVisible();
  await openSettings(gm.window);
  await uploadFile(gm.window, BEFORE);
  // #when
  await block(gm.window).getByRole('button', { name: UPLOAD }).click();
  // #then
  await expect(block(gm.window)).toHaveCount(0);
  await expect(gm.window.getByRole('tab')).toHaveText(['Брок', 'NPC', SETTINGS]);
  await expect(player.window.getByRole('tab')).toHaveText(['Брок', 'NPC']);
  expect(
    await Promise.all(
      ['blk:ivan', 'blk:petr', 'blk:yana'].map((key) => storedData(gm.window, key)),
    ),
  ).toEqual([null, null, null]);
});

test("an upload that drops a section's tokens removes the links to its repeat blocks without counting them", async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, TOKEN_RECORDS, WITH_TOKENS);
  await openSettings(gm.window);
  // #when
  await uploadFile(gm.window, WITHOUT_TOKENS);
  // #then
  await expect(underUpload(gm.window)).toHaveText(CHANGED);
  await expect(block(gm.window)).toHaveCount(0);
  await expect.poll(() => storedData(gm.window, 'link:t-gob')).toBeNull();
  expect({
    preset: await storedPreset(gm.window),
    block: await storedCell(gm.window, 'blk:loot:loot_item:i1', 'loot_item'),
    sheetLink: await storedData(gm.window, 'link:t-chest'),
  }).toEqual({
    preset: JSON.parse(WITHOUT_TOKENS),
    block: ['Меч', 1, 'seed'],
    sheetLink: { s: 'loot', c: 'token' },
  });
});

async function openGm(
  context: BrowserContext,
  records: readonly StoredRecord[] = RECORDS,
  preset = BEFORE,
): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);
  await seedStorage(window, records, preset);
  const background = await openClientBackground(context, GM);
  await expect(window.getByRole('button', { name: ADD })).toBeVisible();
  await expect(valueField(window, 'Сила')).toHaveValue('14');

  return { window, background, connectionId: connectionIdOf(GM) };
}

async function openPlayer(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);

  return { window, background, connectionId: connectionIdOf(PLAYER) };
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('tab', { name: SETTINGS }).click();
  await expect(uploadButton(page)).toBeEnabled();
}

// A field cleared in place and saved on Enter.
async function clearField(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Брок' }).click();
  await valueField(page, name).fill('');
  await valueField(page, name).press('Enter');
}

async function uploadFile(page: Page, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');
  await uploadButton(page).click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: 'preset.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

// The upload of the "Пресет" section, not the confirm button of the block.
function uploadButton(page: Page): Locator {
  return page.getByRole('region', { name: 'Пресет' }).getByRole('button', { name: UPLOAD });
}

function underUpload(page: Page): Locator {
  return uploadButton(page).locator('xpath=ancestor::div[1]/div[@aria-live]');
}

function block(page: Page): Locator {
  return page.getByRole('group', { name: /Загрузить пресет\?$/ });
}

function valueField(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name, exact: true });
}

function diceButton(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('button', { name, exact: true });
}

// The live line that follows a dice button.
function messageUnder(page: Page, name: string): Locator {
  return diceButton(page, name).locator('xpath=following-sibling::span[@aria-live]');
}

// The background shows every roll, so its notifications are the client's.
async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

async function storedPreset(page: Page): Promise<JsonValue> {
  const data = await storedData(page, 'preset');

  if (data === ABSENT) {
    return ABSENT;
  }

  const text = strFromU8(inflateSync(Buffer.from(z.string().parse(data), 'base64')));

  return z.json().parse(JSON.parse(text));
}
