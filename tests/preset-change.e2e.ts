import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { inflateSync, strFromU8 } from 'fflate';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';

import {
  ABSENT,
  addPartyMember,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  record,
  seedStorage,
  storedData,
  STORAGE_PREFIX,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const ADD = 'Добавить персонажа';
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

function labelled(label: string, ...cells: JsonValue[]): JsonValue[] {
  return [{ kind: 'text', text: label }, ...cells];
}

function number(id: string): JsonValue {
  return { kind: 'field', type: 'number', id };
}

const ATTACKS = {
  title: 'Атаки',
  repeat: true,
  rows: [labelled('Атака', number('bonus'))],
};

const NPC = { sections: [{ rows: [labelled('Хиты', number('hp'))] }] };

function presetText(rows: JsonValue[][]): string {
  return JSON.stringify({
    v: 1,
    character: { sections: [{ title: 'Основное', rows }, ATTACKS] },
    npc: NPC,
  });
}

const BEFORE = presetText([
  labelled('Сила', number('str'), { kind: 'dice', formula: '1d1 + str' }),
  labelled('Ловкость', number('dex')),
  labelled('Усталость', { kind: 'field', type: 'check', id: 'tired' }),
]);

// "Сила" is "Мощь" now with the same id, "Мудрость" is new, and "Ловкость" and "Усталость" go. The
// dice still names `dex`.
const REMOVES_TWO = presetText([
  labelled('Мощь', number('str'), { kind: 'dice', formula: '1d1 + dex' }),
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
  record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
  record('acl:brok:lisa', { name: 'Лиза' }),
  record('row:brok:str', { str: 14 }),
  record('row:brok:dex', { dex: 3 }),
  record('row:brok:tired', { tired: false }),
  record('rep:brok:bonus:i1', { order: 0, cells: { bonus: 2 } }),
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
    dex: await storedData(gm.window, 'row:brok:dex'),
  }).toEqual({ preset: JSON.parse(BEFORE), dex: { dex: 3 } });
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
    dex: await storedData(gm.window, 'row:brok:dex'),
    tired: await storedData(gm.window, 'row:brok:tired'),
    str: await storedData(gm.window, 'row:brok:str'),
    bonus: await storedData(gm.window, 'rep:brok:bonus:i1'),
    otherGenerations: await keysOutside(gm.window, STORAGE_PREFIX),
  }).toEqual({
    preset: JSON.parse(REMOVES_TWO),
    dex: null,
    tired: null,
    str: { str: 14 },
    bonus: { order: 0, cells: { bonus: 2 } },
    otherGenerations: [],
  });
});

test('a roll whose formula names a removed field shows the bad formula message and sends nothing', async ({
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
    'Нельзя бросить: поле «dex» пустое или не число',
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
  await expect.poll(() => storedData(gm.window, 'row:brok:dex')).toEqual({});
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
  await expect.poll(() => storedData(gm.window, 'row:brok:dex')).toEqual({});
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
    tired: await storedData(gm.window, 'row:brok:tired'),
  }).toEqual({ preset: JSON.parse(BEFORE), tired: { tired: false } });
});

async function openGm(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);

  await seedStorage(window, RECORDS, BEFORE);

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

// Record keys of this room stored under any other generation.
async function keysOutside(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(
    (kept) =>
      Object.keys(localStorage).filter((key) => key.startsWith('mr1:') && !key.startsWith(kept)),
    prefix,
  );
}
