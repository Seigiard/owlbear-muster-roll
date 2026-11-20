import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { inflateSync, strFromU8 } from 'fflate';
import { z } from 'zod';
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

const copyRecordsSchema = z.object({
  records: z.array(z.object({ k: z.string(), d: z.json() })),
});

const strengthRecordSchema = z.object({
  cells: z.object({ str: z.tuple([z.number(), z.number(), z.string()]) }),
});

// A short pause, so a test sees the write; a long one, so only the hidden page writes.
const QUICK: Partial<ClientParams> = { snapshotPauseMs: 100, snapshotJitterMs: 0 };
const NEVER: Partial<ClientParams> = { snapshotPauseMs: 600000, snapshotJitterMs: 0 };

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
          ],
        },
      ],
    },
    {
      id: 'npc',
      title: 'NPC',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] }],
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
  await expect.poll(() => roomCopyStrength(a.window)).toBe(14);
  await strength(a.window).fill('17');
  await strength(a.window).press('Tab');
  await expect.poll(() => roomCopyStrength(a.window)).toBe(17);
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
  await hidePage(a.background);
  // #then
  await expect.poll(() => roomCopyRecordKeys(a.window)).toEqual(['blk:brok', 'blk:npc', 'preset']);
});

test('Settings shows "Не сохранена" with the free size before any copy, and "Сохранена" with sizes after one', async ({
  context,
}) => {
  // #given: the write the GM owes at catch-up waits for the long pause, so no copy exists yet.
  const a = await openClient(context, { client: 'a', device: 'a', ...NEVER }, RECORDS);
  await expect(strength(a.window)).toHaveValue('14');
  await a.window.getByRole('tab', { name: SETTINGS }).click();
  // The room metadata is `{}`: 2 bytes.
  await expect(roomCopyText(a.window)).toHaveText('Не сохранена. Свободно 15,5 кБ.');
  // #when
  await hidePage(a.background);
  await expect.poll(() => roomCopyRecordKeys(a.window)).toContain('blk:brok');
  await a.window.getByRole('tab', { name: SETTINGS }).click();
  // #then
  const total = await metadataBytes(a.window);
  await expect(roomCopyText(a.window)).toHaveText(
    `Сохранена. Занято ${kilobytes(total - 2)} кБ, свободно ${kilobytes(LIMIT - total)} кБ.`,
  );
});

test('a copy that does not fit next to the other metadata is not written, and the banner and Settings say so', async ({
  context,
}) => {
  // #given: the write the GM owes at catch-up waits for the long pause, so no copy exists yet.
  const a = await openClient(context, { client: 'a', device: 'a', ...NEVER }, RECORDS);
  await a.window.evaluate(async (key) => {
    await window.mockPlatform.metadata.setMetadata({ [key]: 'x'.repeat(15400) });
  }, 'other.extension/data');
  await strength(a.window).fill('19');
  await strength(a.window).press('Tab');
  // #when
  await hidePage(a.background);
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

async function hidePage(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
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

async function roomCopyRecordKeys(page: Page): Promise<string[]> {
  return (await roomCopyRecords(page)).map(({ k }) => k);
}

async function roomCopyStrength(page: Page): Promise<number | undefined> {
  const block = (await roomCopyRecords(page)).find(({ k }) => k === 'blk:brok');

  return strengthRecordSchema.safeParse(block?.d).data?.cells.str[0];
}

// Decode the metadata independently of the app's room-copy reader.
async function roomCopyRecords(page: Page): Promise<z.infer<typeof copyRecordsSchema>['records']> {
  const value = (await readMetadata(page))[KEY];

  if (value === undefined) {
    return [];
  }

  const data = Buffer.from(String(Object(value).data), 'base64');

  return copyRecordsSchema.parse(JSON.parse(strFromU8(inflateSync(new Uint8Array(data))))).records;
}

function kilobytes(bytes: number): string {
  return (bytes / 1000).toFixed(1).replace('.', ',');
}
