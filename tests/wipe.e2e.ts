import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';
import type { JsonValue } from '@/core/json';
import {
  ADD,
  connectionIdOf,
  EXAMPLE_PRESET_TEXT,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  seedStorage,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

// CAP-31, AD-9, AD-12: the copy of EXPERIENCE.md and the room copy key, written out by hand.
const KEY = 'app.muster-roll/snapshot';
const METADATA_STORAGE_KEY = 'mock-metadata:mock-room';
const SETTINGS = 'Настройки';
const WIPE = 'Очистить всё';
const CANCEL = 'Отменить';
const UPLOAD = 'Загрузить пресет';
const OLDER_FORMAT = 'Копия в комнате из старой версии. Очистите всё в настройках.';
const UNREADABLE = 'Копия в комнате не читается. Дождитесь ГМ.';
const NO_GM = 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.';
const NO_PRESET = 'ГМ ещё не настроил листы.';
const DATA_REPLACED = 'Данные комнаты заменены';
const WIPE_FAILED = 'Не удалось очистить. Попробуйте ещё раз.';

const ASK =
  'Будут удалены пресет, все листы, копия в комнате и копия в этом браузере. Игроки потеряют привязки и права. Очистить всё?';

// A room copy as a version 1 build wrote it: a character with `kind` and `name` in its record.
const V1_COPY = copyValue(1, { n: 0, a: '' }, [
  record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
  record('row:brok:str', { str: 14 }),
]);

// What a version 1 build kept in this browser for this room, and what other rooms keep in both
// formats.
const OLD_KEYS: readonly (readonly [string, string])[] = [
  ['mr1:mock-room:0::sheet:brok', '{"k":"sheet:brok","d":{"kind":"pc","name":"Брок","order":0}}'],
  ['mr1:mock-room:0::row:brok:str', '{"k":"row:brok:str","d":{"str":14}}'],
  ['mr1:other-room:0::sheet:anya', '{"k":"sheet:anya","d":{"kind":"pc","name":"Аня","order":0}}'],
  [
    'mr4:other-room:0::blk:anya',
    '{"k":"blk:anya","d":{"set":"pc","order":0,"cells":{}},"c":1,"a":"seed","l":[1,"seed"]}',
  ],
];

const OTHER_ROOM_KEYS = ['mr1:other-room:0::sheet:anya', 'mr4:other-room:0::blk:anya'];

// A sheet in this format, for the GM devices that have used this build in the room since.
const RECORDS: readonly StoredRecord[] = [...pcSheet('brok', 'Брок', 0)];
const GM: ClientParams = { client: 'a', name: 'Мастер' };
const OTHER_GM: ClientParams = { client: 'b', name: 'Второй', device: 'b' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  name: 'Лиза',
};

// Short, so a player alone in the room stops waiting for a GM's answer soon.
const ALONE_PLAYER: ClientParams = { ...PLAYER, catchUpTimeoutMs: 500 };

// Short pauses, so a routine room copy write comes at once.
const QUICK: Partial<ClientParams> = { snapshotPauseMs: 100, snapshotJitterMs: 0 };
const copySchema = z.object({ v: z.number(), data: z.string() });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a GM in a room whose copy is of version 1 sees the older-format banner, and no write replaces the copy', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, { ...GM, ...QUICK }, RECORDS);
  await expect(gm.window.getByRole('status')).toHaveText(OLDER_FORMAT);
  // #when: an edit and a hidden page are the two routine triggers of a room copy write.
  await gm.window.getByRole('textbox', { name: 'Класс' }).fill('Воин');
  await gm.window.getByRole('textbox', { name: 'Класс' }).press('Enter');
  await gm.background.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Several write pauses pass with no write, as nothing signals a write that does not happen.
  await gm.window.waitForTimeout(1000);
  // #then
  await expect(gm.window.getByRole('status')).toHaveText(OLDER_FORMAT);
  expect(await roomCopy(gm.window)).toEqual(V1_COPY);
});

test('a player alone with a room copy of version 1 sees that it does not read', async ({
  context,
}) => {
  // #given
  const window = await openClientWindow(context, ALONE_PLAYER);
  await seedOldRoom(window);
  // #when
  await openClientBackground(context, ALONE_PLAYER);
  // #then
  await expect(window.getByRole('main').getByText(UNREADABLE, { exact: true })).toBeVisible();
  await expect(window.getByRole('status')).toHaveText(NO_GM);
});

test('with no preset, "Очистить всё" in Settings asks once, focused on "Отменить", which changes nothing', async ({
  context,
}) => {
  // #given: the room of AC4, with only the data of a version 1 build.
  const gm = await openGm(context, GM, null);
  const keysBefore = await allKeys(gm.window);
  await gm.window.getByRole('tab', { name: SETTINGS }).click();
  // #when
  await wipeButton(gm.window).click();
  // #then
  await expect(confirmation(gm.window)).toHaveAccessibleName(ASK);
  await expect(confirmation(gm.window).getByRole('button')).toHaveText([WIPE, CANCEL]);
  await expect(confirmation(gm.window).getByRole('button', { name: CANCEL })).toBeFocused();
  // #when
  await confirmation(gm.window).getByRole('button', { name: CANCEL }).click();
  // #then
  await expect(confirmation(gm.window)).toHaveCount(0);
  await expect(wipeButton(gm.window)).toBeFocused();
  expect({ copy: await roomCopy(gm.window), keys: await allKeys(gm.window) }).toEqual({
    copy: V1_COPY,
    keys: keysBefore,
  });
});

test('with no preset and Settings open, a confirmed wipe ends with "Очистить всё" enabled and focused, and no failure', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, GM, null);
  await gm.window.getByRole('tab', { name: SETTINGS }).click();
  await wipeButton(gm.window).click();
  // #when
  await confirmation(gm.window).getByRole('button', { name: WIPE }).click();
  // #then
  await expect
    .poll(() => roomCopyContent(gm.window))
    .toEqual({ v: 4, content: { g: { n: 1, a: gm.connectionId }, records: [] } });
  await expect(confirmation(gm.window)).toHaveCount(0);
  await expect(wipeButton(gm.window)).toBeEnabled();
  await expect(wipeButton(gm.window)).toBeFocused();
  await expect(wipeSection(gm.window).getByText(WIPE_FAILED)).toHaveCount(0);
  await expect(wipeSection(gm.window).locator('[aria-live]')).toHaveText('');
});

test('Escape closes the wipe confirmation and changes nothing', async ({ context }) => {
  // #given
  const gm = await openGm(context, GM, RECORDS);
  const keysBefore = await allKeys(gm.window);
  await gm.window.getByRole('tab', { name: SETTINGS }).click();
  await wipeButton(gm.window).click();
  await expect(confirmation(gm.window).getByRole('button', { name: CANCEL })).toBeFocused();
  // #when
  await gm.window.keyboard.press('Escape');
  // #then
  await expect(confirmation(gm.window)).toHaveCount(0);
  await expect(gm.window.getByRole('tab', { name: 'Брок' })).toBeVisible();
  expect({ copy: await roomCopy(gm.window), keys: await allKeys(gm.window) }).toEqual({
    copy: V1_COPY,
    keys: keysBefore,
  });
});

test('a confirmed wipe of a room with a version 1 copy empties it on every client, and the GM uploads a new preset', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, GM, RECORDS);
  const other = await openGm(context, OTHER_GM, RECORDS);
  const player = await openPlayer(context);
  await expect(player.window.getByRole('tab', { name: 'Брок' })).toBeVisible();
  await expect(other.window.getByRole('status')).toHaveText(OLDER_FORMAT);
  await gm.window.getByRole('tab', { name: SETTINGS }).click();
  await wipeButton(gm.window).click();
  // #when
  await confirmation(gm.window).getByRole('button', { name: WIPE }).click();

  // #then: no preset and no sheet on any client, and no banner.
  for (const client of [gm, other]) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(client.window.getByRole('button', { name: UPLOAD })).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop
    await expect(client.window.getByRole('tab')).toHaveText([SETTINGS]);
    // oxlint-disable-next-line no-await-in-loop
    await expect(client.window.getByRole('status')).toHaveText('');
  }

  await expect(player.window.getByRole('main').getByText(NO_PRESET, { exact: true })).toBeVisible();
  await expect(player.window.getByRole('tab')).toHaveCount(0);
  await expect.poll(() => shownNotifications(other)).toEqual([DATA_REPLACED]);
  await expect.poll(() => shownNotifications(player)).toEqual([DATA_REPLACED]);
  expect(await shownNotifications(gm)).toEqual([]);
  // AD-9: the room copy is written over with the new generation and no record.
  expect(await roomCopyContent(gm.window)).toEqual({
    v: 4,
    content: { g: { n: 1, a: gm.connectionId }, records: [] },
  });
  // AD-9, AD-11: this room's records of every format are gone in the wiping GM's browser and on
  // the device of the GM that adopted the wipe. Other rooms keep theirs.
  await expect
    .poll(async () => ({
      wiping: recordKeysOfRoom(await keysUnder(gm.window, '')),
      adopting: recordKeysOfRoom(await keysUnder(gm.window, 'mock-device:b:')),
    }))
    .toEqual({ wiping: [], adopting: [] });
  expect({
    wiping: otherRoomKeys(await keysUnder(gm.window, '')),
    adopting: otherRoomKeys(await keysUnder(gm.window, 'mock-device:b:')),
  }).toEqual({ wiping: OTHER_ROOM_KEYS, adopting: OTHER_ROOM_KEYS });
  // #when
  await uploadPreset(gm.window, EXAMPLE_PRESET_TEXT);

  // #then
  for (const client of [gm, other]) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(client.window.getByRole('button', { name: ADD })).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop
    await expect(client.window.getByRole('status')).toHaveText('');
  }

  await expect(player.window.getByRole('tab')).toHaveText(['Инвентарь']);
});

// Opens a GM client over the room of a version 1 build. `records` are this format's records of its
// device, or `null` for a device that has none and no preset either.
async function openGm(
  context: BrowserContext,
  params: ClientParams,
  records: readonly StoredRecord[] | null,
): Promise<RoomClient> {
  const window = await openClientWindow(context, params);
  const device = params.device ?? '';
  await seedOldRoom(window, device);

  if (records !== null) {
    await seedStorage(window, records, EXAMPLE_PRESET_TEXT, device);
  }

  const background = await openClientBackground(context, params);
  await expect(
    window.getByRole('button', { name: records === null ? UPLOAD : ADD }).first(),
  ).toBeVisible();

  return { window, background, connectionId: connectionIdOf(params) };
}

async function openPlayer(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);

  return { window, background, connectionId: connectionIdOf(PLAYER) };
}

// The version 1 room copy in the room metadata, and the old and other-room keys on one device.
async function seedOldRoom(page: Page, device = ''): Promise<void> {
  const prefix = device === '' ? '' : `mock-device:${device}:`;
  await page.evaluate(
    ([metadataKey, copyKey, copy, keys]) => {
      const metadata: unknown = JSON.parse(localStorage.getItem(metadataKey) ?? '{}');
      localStorage.setItem(
        metadataKey,
        JSON.stringify({ ...Object(metadata), [copyKey]: JSON.parse(copy) }),
      );

      for (const [key, value] of JSON.parse(keys)) {
        localStorage.setItem(key, value);
      }
    },
    [
      METADATA_STORAGE_KEY,
      KEY,
      JSON.stringify(V1_COPY),
      JSON.stringify(OLD_KEYS.map(([key, value]) => [`${prefix}${key}`, value])),
    ] as const,
  );
}

function copyValue(
  v: number,
  g: {
    n: number;
    a: string;
  },
  records: readonly StoredRecord[],
): JsonValue {
  const content = JSON.stringify({ g, records });

  return { v, data: Buffer.from(deflateSync(strToU8(content))).toString('base64') };
}

async function roomCopy(page: Page): Promise<JsonValue> {
  const text = await page.evaluate(
    (key) => localStorage.getItem(key) ?? '{}',
    METADATA_STORAGE_KEY,
  );

  const metadata = z.record(z.string(), z.json()).parse(JSON.parse(text));

  return metadata[KEY] ?? null;
}

// The room copy's version and its content, decoded by hand with fflate.
async function roomCopyContent(page: Page): Promise<{
  v: number;
  content: JsonValue;
}> {
  const copy = copySchema.parse(await roomCopy(page));
  const text = strFromU8(inflateSync(new Uint8Array(Buffer.from(copy.data, 'base64'))));

  return { v: copy.v, content: z.json().parse(JSON.parse(text)) };
}

async function allKeys(page: Page): Promise<string[]> {
  return (await page.evaluate(() => Object.keys(localStorage))).sort();
}

// The keys of one device, with its prefix taken off. The default device holds no `mock-` key.
async function keysUnder(page: Page, prefix: string): Promise<string[]> {
  const keys = await allKeys(page);

  return keys
    .filter((key) => (prefix === '' ? !key.startsWith('mock-') : key.startsWith(prefix)))
    .map((key) => key.slice(prefix.length));
}

// This room's record keys of any format. A generation marker names no record.
function recordKeysOfRoom(keys: readonly string[]): string[] {
  return keys.filter((key) => /^mr\d+:mock-room:/.test(key) && !key.includes(':#'));
}

function otherRoomKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => key.includes(':other-room:')).sort();
}

function wipeSection(page: Page): Locator {
  return page.getByRole('region', { name: 'Очистка' });
}

function wipeButton(page: Page): Locator {
  return wipeSection(page).getByRole('button', { name: WIPE });
}

function confirmation(page: Page): Locator {
  return page.getByRole('group', { name: /Очистить всё\?$/ });
}

async function uploadPreset(page: Page, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: UPLOAD }).first().click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: 'preset.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

// The background shows the notifications of its client.
async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}
