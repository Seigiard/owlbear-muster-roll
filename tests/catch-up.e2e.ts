import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { blockDataSchema } from '@/core/records';
import {
  ADD,
  addPartyMember,
  connectionIdOf,
  deviceKeys,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  seedStorage,
  STORAGE_PREFIX,
  storedCell,
  storedRecords,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const LOADING = 'Загрузка…';
const READ_ONLY = 'Только чтение';
const SETTINGS = 'Настройки';
const LOAD_PRESET = 'Загрузить пресет';
const DOWNLOAD_PRESET = 'Скачать пресет';
const DOWNLOAD_SNAPSHOT = 'Скачать снимок';
const LOAD_SNAPSHOT = 'Загрузить снимок';

// The tab of a new sheet, whose name field is still empty.
const UNNAMED = 'Без имени';

type Return = 'online' | 'resume' | 'visibilitychange';

// A GM listed in the party with no page behind it: it never answers a request.
const SILENT_GM = 'mock-connection-silent';

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
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Имя' },
                    { kind: 'field', type: 'text', id: 'name' },
                  ],
                },
              ],
            },
            {
              rows: [
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
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] }],
    },
  ],
};

const PRESET_TEXT = JSON.stringify(PRESET);
const RECORDS: StoredRecord[] = [...pcSheet('brok', 'Брок', 0), record('blk:brok', { str: 14 })];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a GM on a new device gets the sheets a live GM holds and saves them', async ({ context }) => {
  // #given
  const a = await openClient(context, { client: 'a', device: 'a' }, RECORDS);
  await expect(a.window.getByRole('button', { name: ADD })).toBeVisible();
  // #when
  const b = await openClient(context, { client: 'b', device: 'b' }, null);
  // #then
  await expect(b.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(strength(b.window)).toHaveValue('14');
  expect((await deviceKeys(b.window, 'b')).sort()).toEqual(
    [`${STORAGE_PREFIX}preset`, `${STORAGE_PREFIX}blk:brok`, `${STORAGE_PREFIX}blk:npc`].sort(),
  );
});

test('until its first catch-up ends, a window shows the known sidebar entries and the loading text, then the sheets', async ({
  context,
}) => {
  // #given: another GM is listed and never answers, so catch-up ends on its timeout.
  const params: ClientParams = { client: 'b', catchUpTimeoutMs: 2500 };
  const window = await openClientWindow(context, params);
  await seedStorage(window, RECORDS, PRESET_TEXT);
  await addPartyMember(window, SILENT_GM, 'GM');
  // #when
  await openClientBackground(context, params);
  // #then
  await expect(window.getByRole('tab')).toHaveText(['Брок', 'NPC', SETTINGS]);
  await expect(window.getByRole('tabpanel')).toHaveText(LOADING);
  await expect(window.getByRole('button', { name: ADD })).toHaveCount(0);
  await expect(window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible({
    timeout: 6000,
  });
  await expect(strength(window)).toHaveValue('14');
});

test('the no-preset state shows only after the first catch-up ends', async ({ context }) => {
  // #given
  const params: ClientParams = { client: 'b', catchUpTimeoutMs: 2500 };
  const window = await openClientWindow(context, params);
  await addPartyMember(window, SILENT_GM, 'GM');
  // #when
  await openClientBackground(context, params);
  // #then
  await expect(window.getByText(LOADING)).toBeVisible();
  await expect(window.getByRole('button', { name: LOAD_PRESET })).toHaveCount(0);
  await expect(window.getByRole('button', { name: LOAD_PRESET })).toBeEnabled({ timeout: 6000 });
});

test('a GM edit and a new sheet made during catch-up show at once and are saved on exit', async ({
  context,
}) => {
  // #given
  const client = await openClient(context, { catchUpTimeoutMs: 8000 }, RECORDS);
  await expect(client.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await returnWithSilentGm(client, 'online');
  // The download locks only during catch-up, so this proves the edit below is made in it. The
  // upload is no proof here, as a sheet locks it too.
  await client.window.getByRole('tab', { name: SETTINGS }).click();
  await expect(client.window.getByRole('button', { name: DOWNLOAD_PRESET })).toBeDisabled();
  await client.window.getByRole('tab', { name: 'Брок' }).click();
  // #when
  await strength(client.window).fill('16');
  await strength(client.window).press('Enter');
  await expect(strength(client.window)).toHaveValue('16');
  // A live client saves within a few send spacings, so a value still unsaved after this pause
  // waits in the pending queue.
  await client.window.waitForTimeout(500);
  const savedDuringCatchUp = await storedCell(client.window, 'blk:brok', 'str');
  await client.window.getByRole('button', { name: ADD }).click();
  // #then
  await expect(client.window.getByRole('tab', { name: UNNAMED, selected: true })).toBeVisible();
  await expect(client.window.getByRole('textbox', { name: 'Имя листа' })).toBeFocused();
  expect(savedDuringCatchUp).toEqual([14, 1, 'seed']);
  await expect
    .poll(() => storedCell(client.window, 'blk:brok', 'str'), { timeout: 12000 })
    .toEqual([16, 2, 'mock-connection']);
  await expect.poll(() => newSheetsStored(client.window)).toBe(1);
});

test('during catch-up Settings disables the preset upload and download with the loading text', async ({
  context,
}) => {
  // #given: no sheets, so only catch-up can lock the upload.
  const client = await openClient(context, { catchUpTimeoutMs: 2500 }, []);
  await client.window.getByRole('tab', { name: SETTINGS }).click();
  await expect(uploadButton(client.window)).toBeEnabled();
  // #when
  await returnWithSilentGm(client, 'resume');
  // #then
  const presetSection = client.window.getByRole('region', { name: 'Пресет' });
  await expect(uploadButton(client.window)).toBeDisabled();
  await expect(client.window.getByRole('button', { name: DOWNLOAD_PRESET })).toBeDisabled();
  await expect(presetSection.getByText(LOADING)).toHaveCount(2);
  await expect(uploadButton(client.window)).toBeEnabled({ timeout: 6000 });
  await expect(client.window.getByRole('button', { name: DOWNLOAD_PRESET })).toBeEnabled();
});

test('during catch-up Settings disables the snapshot download and upload with the loading text', async ({
  context,
}) => {
  // #given: a preset, so only catch-up can lock the download.
  const client = await openClient(context, { catchUpTimeoutMs: 2500 }, []);
  await client.window.getByRole('tab', { name: SETTINGS }).click();
  await expect(snapshotButton(client.window, DOWNLOAD_SNAPSHOT)).toBeEnabled();
  // #when
  await returnWithSilentGm(client, 'resume');
  // #then
  await expect(snapshotButton(client.window, DOWNLOAD_SNAPSHOT)).toBeDisabled();
  await expect(snapshotButton(client.window, DOWNLOAD_SNAPSHOT)).toHaveAccessibleDescription(
    LOADING,
  );
  await expect(snapshotButton(client.window, LOAD_SNAPSHOT)).toBeDisabled();
  await expect(snapshotButton(client.window, LOAD_SNAPSHOT)).toHaveAccessibleDescription(LOADING);
  await expect(snapshotButton(client.window, DOWNLOAD_SNAPSHOT)).toBeEnabled({ timeout: 6000 });
  await expect(snapshotButton(client.window, DOWNLOAD_SNAPSHOT)).toHaveAccessibleDescription('');
  await expect(snapshotButton(client.window, LOAD_SNAPSHOT)).toBeEnabled();
  await expect(snapshotButton(client.window, LOAD_SNAPSHOT)).toHaveAccessibleDescription('');
});

test('a page that becomes visible again catches up, and the upload waits for it', async ({
  context,
}) => {
  // #given
  const client = await openClient(context, { catchUpTimeoutMs: 2500 }, []);
  await client.window.getByRole('tab', { name: SETTINGS }).click();
  await expect(uploadButton(client.window)).toBeEnabled();
  // #when
  await returnWithSilentGm(client, 'visibilitychange');
  // #then
  await expect(uploadButton(client.window)).toBeDisabled();
  await expect(uploadButton(client.window)).toBeEnabled({ timeout: 6000 });
});

test('a player made GM gets the GM view without reopening the window', async ({ context }) => {
  // #given
  const gm = await openClient(context, { client: 'a', device: 'a' }, RECORDS);
  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();

  const player = await openClient(
    context,
    { client: 'p', role: 'PLAYER', player: 'lisa', device: 'p' },
    null,
  );

  await expect(player.window.getByText(READ_ONLY)).toBeVisible();
  // #when: the role belongs to the background, which owns the replica.
  await player.background.evaluate(() => {
    window.mockPlatform.setRole('GM');
  });
  // #then
  await expect(player.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(player.window.getByRole('button', { name: ADD })).toBeVisible();
});

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

  if (records !== null) {
    await expect(window.getByRole('button', { name: ADD })).toBeVisible();
  }

  return { window, background, connectionId: connectionIdOf(params) };
}

// A GM that never answers joins, and the page comes back, so the client waits for the timeout.
async function returnWithSilentGm(client: RoomClient, event: Return): Promise<void> {
  // The mock party read goes to the shared storage, so the background sees the GM at once.
  await addPartyMember(client.window, SILENT_GM, 'GM');
  await client.background.evaluate((name) => {
    if (name === 'online') {
      window.dispatchEvent(new Event('online'));
    } else if (name === 'resume') {
      document.dispatchEvent(new Event('resume'));
    } else {
      // A background page is never shown, so the test says it is visible.
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  }, event);
}

function strength(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'Сила', exact: true });
}

function uploadButton(page: Page): Locator {
  return page.getByRole('button', { name: LOAD_PRESET });
}

function snapshotButton(page: Page, name: string): Locator {
  return page.getByRole('region', { name: 'Снимок' }).getByRole('button', { name });
}

async function newSheetsStored(page: Page): Promise<number> {
  return (await storedRecords(page, 'blk:')).filter(
    (record) => record.k !== 'blk:brok' && blockDataSchema.safeParse(record.d).data?.set === 'pc',
  ).length;
}
