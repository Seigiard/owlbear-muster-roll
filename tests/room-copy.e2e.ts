import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { inflateSync, strFromU8 } from 'fflate';
import type { JsonValue } from '@/core/json';
import {
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  seedStorage,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

// The strings, key and limit of the 2.5 spec, written out by hand.
const KEY = 'app.muster-roll/snapshot';
const LIMIT = 15500;
const METADATA_STORAGE_KEY = 'mock-metadata:mock-room';
const NOT_SAVED = 'Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок.';
const SETTINGS = 'Настройки';
const ROOM_COPY = 'Копия в комнате';

// A short pause, so a test sees the write; a long one, so only the hidden page writes.
const QUICK: Partial<ClientParams> = { snapshotPauseMs: 100, snapshotJitterMs: 0 };
const NEVER: Partial<ClientParams> = { snapshotPauseMs: 600000, snapshotJitterMs: 0 };

const PRESET_TEXT = JSON.stringify({
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Имя' },
                  { kind: 'field', type: 'text', id: 'name' },
                ],
                [
                  { kind: 'text', text: 'Сила' },
                  { kind: 'field', type: 'number', id: 'str' },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] }],
    },
  ],
});

const RECORDS: StoredRecord[] = [...pcSheet('brok', 'Брок', 0), record('blk:brok', { str: 14 })];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a GM writes the room copy after an edit, and a GM on a new device with no other GM loads from it', async ({
  context,
}) => {
  // #given
  const a = await openClient(context, { client: 'a', device: 'a', ...QUICK }, RECORDS);
  await strength(a.window).fill('17');
  await strength(a.window).press('Tab');
  await expect.poll(() => roomCopyRecordKeys(a.window)).toContain('blk:brok');
  await a.background.close({ runBeforeUnload: true });
  await a.window.close();
  // #when
  const b = await openClient(context, { client: 'b', device: 'b' }, null);
  // #then
  await expect(b.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(strength(b.window)).toHaveValue('17');
});

test('a GM writes the room copy at once when its page becomes hidden', async ({ context }) => {
  // #given
  const a = await openClient(context, { client: 'a', device: 'a', ...NEVER }, RECORDS);
  await expect(strength(a.window)).toHaveValue('14');
  // #when
  await a.background.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // #then
  await expect.poll(() => roomCopyRecordKeys(a.window)).toEqual(['blk:brok', 'blk:npc', 'preset']);
});

test('Settings shows "Не сохранена" with the free size before any copy, and "Сохранена" with sizes after one', async ({
  context,
}) => {
  // #given
  const a = await openClient(context, { client: 'a', device: 'a', ...QUICK }, RECORDS);
  await a.window.getByRole('tab', { name: SETTINGS }).click();
  // The room metadata is `{}`: 2 bytes.
  const before = await roomCopyText(a.window).textContent();
  await a.window.getByRole('tab', { name: 'Брок' }).click();
  // #when
  await strength(a.window).fill('18');
  await strength(a.window).press('Tab');
  await expect.poll(() => roomCopyRecordKeys(a.window)).toContain('blk:brok');
  await a.window.getByRole('tab', { name: SETTINGS }).click();
  // #then
  const total = await metadataBytes(a.window);
  await expect(roomCopyText(a.window)).toHaveText(
    `Сохранена. Занято ${kilobytes(total - 2)} кБ, свободно ${kilobytes(LIMIT - total)} кБ.`,
  );
  expect(before).toBe('Не сохранена. Свободно 15,5 кБ.');
});

test('a copy that does not fit next to the other metadata is not written, and the banner and Settings say so', async ({
  context,
}) => {
  // #given
  const a = await openClient(context, { client: 'a', device: 'a', ...QUICK }, RECORDS);
  await a.window.evaluate(async (key) => {
    await window.mockPlatform.metadata.setMetadata({ [key]: 'x'.repeat(15400) });
  }, 'other.extension/data');
  // #when
  await strength(a.window).fill('19');
  await strength(a.window).press('Tab');
  // #then
  await expect(a.window.getByRole('status')).toHaveText(NOT_SAVED);
  await a.window.getByRole('tab', { name: SETTINGS }).click();
  await expect(roomCopyText(a.window)).toHaveText(NOT_SAVED);
  expect(await roomCopyRecordKeys(a.window)).toEqual([]);
});

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

function roomCopyText(page: Page): Locator {
  return page.getByRole('region', { name: ROOM_COPY }).getByRole('paragraph');
}

async function readMetadata(page: Page): Promise<Record<string, JsonValue>> {
  const text = await page.evaluate(
    (key) => localStorage.getItem(key) ?? '{}',
    METADATA_STORAGE_KEY,
  );

  return JSON.parse(text);
}

async function metadataBytes(page: Page): Promise<number> {
  return new TextEncoder().encode(JSON.stringify(await readMetadata(page))).length;
}

// The record keys of the room copy, decoded by hand with fflate.
async function roomCopyRecordKeys(page: Page): Promise<string[]> {
  const value = (await readMetadata(page))[KEY];

  if (value === undefined) {
    return [];
  }

  const data = Buffer.from(String(Object(value).data), 'base64');
  const content = JSON.parse(strFromU8(inflateSync(new Uint8Array(data))));

  return Array.from(content.records, (one) => String(Object(one).k));
}

function kilobytes(bytes: number): string {
  return (bytes / 1000).toFixed(1).replace('.', ',');
}
