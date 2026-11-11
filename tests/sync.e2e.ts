import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import { SYNC_CHANNEL } from '@/core/room-messages';
import { UI_CHANNEL } from '@/core/ui-messages';

import {
  afterSettling,
  connectionIdOf,
  deviceKeys,
  openClientBackground,
  openClientWindow,
  openGmClients,
  postRemote,
  record,
  STORAGE_PREFIX,
  storedRecordSchema,
  syncRead,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
  watchCommands,
} from './support/room';

const NEW_VERSION = 'Вышла новая версия. Перезагрузите страницу.';
const ACTIONS = 'Действия с листом';
const DELETE = 'Удалить';
const GM_A: ClientParams = { client: 'a' };
const GM_B: ClientParams = { client: 'b' };
const PLAYER: ClientParams = { client: 'p', role: 'PLAYER', player: 'lisa', device: 'p' };
const INITIAL = { n: 0, a: '' };

const PRESET = {
  v: 1,
  character: {
    sections: [
      {
        title: 'Сетка',
        columns: 3,
        rows: [
          [
            { kind: 'text', text: 'Сила' },
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'field', type: 'check', id: 'str_tired' },
          ],
          [
            { kind: 'text', text: 'Ловкость' },
            { kind: 'field', type: 'number', id: 'dex' },
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
};

const RECORDS: StoredRecord[] = [
  record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
  record('sheet:liza', { kind: 'pc', name: 'Лиза', order: 1 }),
  record('row:brok:str', { str: 14 }),
];

const heardSchema = z.array(z.object({ from: z.string(), data: z.json() }));

declare global {
  interface Window {
    heardRemote: { from: string; data: JsonValue }[];
    heardKeys: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a GM edit goes out as one commit and updates a field in place on the other GM client', async ({
  context,
}) => {
  // #given
  const [a, b] = await twoGms(context);

  await listenRemote(b.window);

  // #when
  await field(a.window, 'Ловкость').fill('12');
  await field(a.window, 'Ловкость').press('Enter');

  // #then
  const written = { k: 'row:brok:dex', d: { dex: 12 }, c: 1, a: a.connectionId };

  await expect(field(b.window, 'Ловкость')).toHaveValue('12');
  expect({ heard: await heardRemote(b.window), stored: await stored(a.window, written.k) }).toEqual(
    {
      heard: [
        { from: a.connectionId, data: { v: 1, g: INITIAL, t: 'commit', records: [written] } },
      ],
      stored: written,
    },
  );
});

test('edits to different rows made at once stay on both GM clients and in storage', async ({
  context,
}) => {
  // #given
  const [a, b] = await twoGms(context);

  // #when
  await field(a.window, 'Сила').fill('16');
  await field(b.window, 'Ловкость').fill('9');
  await Promise.all([
    field(a.window, 'Сила').press('Enter'),
    field(b.window, 'Ловкость').press('Enter'),
  ]);

  // #then
  for (const client of [a, b]) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(field(client.window, 'Сила')).toHaveValue('16');
    // oxlint-disable-next-line no-await-in-loop
    await expect(field(client.window, 'Ловкость')).toHaveValue('9');
  }

  expect([
    (await stored(a.window, 'row:brok:str'))?.d,
    (await stored(a.window, 'row:brok:dex'))?.d,
  ]).toEqual([{ str: 16 }, { dex: 9 }]);
});

test('edits to one row made at once settle on the same record on both GM clients', async ({
  context,
}) => {
  // #given: a heard b open as a GM return and catches up until its own request times out, so
  // both are live before they edit at once (Story 2.6).
  const [a, b] = await twoGms(context);

  await expect.poll(() => syncRead(a.window), { timeout: 10_000 }).toMatchObject({ state: 'live' });
  await watchCommands(a.window);
  await watchCommands(b.window);

  // #when: Tab saves and leaves the field, so it shows the record, not the text typed.
  await field(a.window, 'Сила').fill('16');
  await Promise.all([
    field(a.window, 'Сила').press('Tab'),
    b.window.getByRole('checkbox', { name: 'Сила' }).click(),
  ]);

  // Both backgrounds have saved their own edit, so the shared storage holds the winner of the two.
  await afterSettling(a.window);
  await afterSettling(b.window);

  // #then: whichever record won, both show it.
  const winner = await expectedRow(a.window);

  await expect.poll(() => rowShown(a.window)).toEqual(winner);
  await expect.poll(() => rowShown(b.window)).toEqual(winner);
});

test('a sheet created, renamed and deleted on one GM client shows on the other', async ({
  context,
}) => {
  // #given
  const [a, b] = await twoGms(context);

  // #when: a character is created and named.
  await a.window.getByRole('button', { name: 'Добавить персонажа' }).click();
  await expect(b.window.getByRole('tab', { name: 'Новый персонаж' })).toBeVisible();
  await a.window.getByRole('textbox', { name: 'Имя персонажа' }).fill('Гимли');
  await a.window.getByRole('textbox', { name: 'Имя персонажа' }).press('Enter');

  // #then
  await expect(b.window.getByRole('tab')).toHaveText(['Брок', 'Лиза', 'Гимли', 'NPC', '⚙︎']);

  // #when: an NPC is created.
  await a.window.getByRole('tab', { name: 'NPC' }).click();
  await a.window.getByRole('button', { name: 'Добавить NPC' }).click();
  await b.window.getByRole('tab', { name: 'NPC' }).click();

  // #then
  await expect(b.window.getByRole('textbox', { name: 'Имя NPC' })).toHaveValue('Новый NPC');

  // #when: the character is deleted.
  await a.window.getByRole('tab', { name: 'Гимли' }).click();
  await deleteShownSheet(a.window);

  // #then
  await expect(b.window.getByRole('tab')).toHaveText(['Брок', 'Лиза', 'NPC', '⚙︎']);
});

test('a remote delete of the active sheet opens the first tab and closes its confirmation', async ({
  context,
}) => {
  // #given: B shows Лиза with the delete confirmation open.
  const [a, b] = await twoGms(context);

  await b.window.getByRole('tab', { name: 'Лиза' }).click();
  await b.window.getByRole('button', { name: ACTIONS }).click();
  await b.window.getByRole('menuitem', { name: DELETE }).click();
  await expect(confirmation(b.window)).toBeVisible();

  // #when
  await a.window.getByRole('tab', { name: 'Лиза' }).click();
  await deleteShownSheet(a.window);

  // #then
  await expect(b.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(b.window.getByRole('tab', { name: 'Лиза' })).toHaveCount(0);
  await expect(confirmation(b.window)).toHaveCount(0);
});

test('a focused field keeps its text through a remote change, and Esc shows the new value', async ({
  context,
}) => {
  // #given
  const [a, b] = await twoGms(context);

  await field(b.window, 'Сила').focus();

  // #when: the box in the same row proves the record arrived.
  await field(a.window, 'Сила').fill('20');
  await field(a.window, 'Сила').press('Enter');
  await a.window.getByRole('checkbox', { name: 'Сила' }).click();
  await expect(b.window.getByRole('checkbox', { name: 'Сила' })).toBeChecked();

  const whileFocused = await field(b.window, 'Сила').inputValue();

  await field(b.window, 'Сила').press('Escape');

  // #then
  await expect(field(b.window, 'Сила')).toHaveValue('20');
  expect(whileFocused).toBe('14');
});

test('a commit from a connection the party does not know is dropped', async ({ context }) => {
  // #given
  const [a, b] = await twoGms(context);

  // #when
  await postRemote(a.window, 'stranger', commit([sheet('stranger', 'Чужой')]));
  await afterMarker(a, b);

  // #then
  await expect(b.window.getByRole('tab', { name: 'Чужой' })).toHaveCount(0);
});

test('a commit from a known player is dropped', async ({ context }) => {
  // #given
  const [a, b] = await twoGms(context);

  await openClientWindow(context, PLAYER);
  await openClientBackground(context, PLAYER);

  // #when
  await postRemote(a.window, connectionIdOf(PLAYER), commit([sheet('player', 'От игрока')]));
  await afterMarker(a, b);

  // #then
  await expect(b.window.getByRole('tab', { name: 'От игрока' })).toHaveCount(0);
});

test('a commit of another generation is dropped', async ({ context }) => {
  // #given
  const [a, b] = await twoGms(context);

  // #when
  await postRemote(a.window, a.connectionId, commit([sheet('later', 'Позже')], { n: 1, a: 'x' }));
  await afterMarker(a, b);

  // #then
  await expect(b.window.getByRole('tab', { name: 'Позже' })).toHaveCount(0);
});

test('a message with a lower v is dropped and shows no banner', async ({ context }) => {
  // #given
  const [a, b] = await twoGms(context);

  // #when
  await postRemote(a.window, a.connectionId, { ...commit([sheet('old', 'Старый')]), v: 0 });
  await afterMarker(a, b);

  // #then
  await expect(b.window.getByRole('tab', { name: 'Старый' })).toHaveCount(0);
  await expect(b.window.getByRole('status')).toHaveText('');
});

test('a message with a higher v is dropped and shows the new-version banner', async ({
  context,
}) => {
  // #given
  const [a, b] = await twoGms(context);

  // #when
  await postRemote(a.window, a.connectionId, { v: 2, t: 'commit', unread: 'a newer field' });

  // #then
  await expect(b.window.getByRole('status')).toHaveText(NEW_VERSION);
  await afterMarker(a, b);
  await expect(b.window.getByRole('status')).toHaveText(NEW_VERSION);
});

test('a player client merges a GM commit and persists nothing', async ({ context }) => {
  // #given
  const [a] = await openGmClients(context, RECORDS, JSON.stringify(PRESET), GM_A);
  const playerWindow = await openClientWindow(context, PLAYER);

  await listenDeltaKeys(playerWindow);
  await openClientBackground(context, PLAYER);

  if (a === undefined) {
    throw new Error('the GM client did not open');
  }

  // #when
  await a.window.getByRole('button', { name: 'Добавить персонажа' }).click();

  // #then
  await expect.poll(() => heardKeys(playerWindow)).toContainEqual(expect.stringMatching(/^sheet:/));
  expect(await deviceKeys(playerWindow, 'p')).toEqual([]);
});

async function twoGms(context: BrowserContext): Promise<[RoomClient, RoomClient]> {
  const [a, b] = await openGmClients(context, RECORDS, JSON.stringify(PRESET), GM_A, GM_B);

  if (a === undefined || b === undefined) {
    throw new Error('the GM clients did not open');
  }

  await expect(a.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(b.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();

  return [a, b];
}

function field(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name, exact: true });
}

function confirmation(page: Page): Locator {
  return page.getByRole('group', { name: /^Удалить «/ });
}

async function deleteShownSheet(page: Page): Promise<void> {
  await page.getByRole('tabpanel').getByRole('button', { name: ACTIONS }).click();
  await page.getByRole('menuitem', { name: DELETE }).click();
  await confirmation(page).getByRole('button', { name: DELETE }).click();
}

function sheet(id: string, name: string): StoredRecord {
  return record(`sheet:${id}`, { kind: 'pc', name, order: 5 });
}

type RawCommit = { v: number; g: { n: number; a: string }; t: string; records: StoredRecord[] };

function commit(records: StoredRecord[], g = INITIAL): RawCommit {
  return { v: 1, g, t: 'commit', records };
}

// A valid commit from a known GM, after the message under test. Room messages are handled in
// arrival order, so once the marker shows, the message before it has been handled too.
async function afterMarker(from: RoomClient, to: RoomClient): Promise<void> {
  await postRemote(from.window, from.connectionId, commit([sheet('marker', 'Метка')]));
  await expect(to.window.getByRole('tab', { name: 'Метка' })).toBeVisible();
}

async function stored(page: Page, key: string): Promise<StoredRecord | null> {
  const text = await page.evaluate(
    (storageKey) => localStorage.getItem(storageKey),
    `${STORAGE_PREFIX}${key}`,
  );

  return text === null ? null : storedRecordSchema.parse(JSON.parse(text));
}

async function rowShown(page: Page): Promise<{ str: string; tired: boolean }> {
  return {
    str: await field(page, 'Сила').inputValue(),
    tired: await page.getByRole('checkbox', { name: 'Сила' }).isChecked(),
  };
}

async function expectedRow(page: Page): Promise<{ str: string; tired: boolean }> {
  const row = z
    .object({ str: z.number().optional(), str_tired: z.boolean().optional() })
    .parse((await stored(page, 'row:brok:str'))?.d);

  return { str: row.str === undefined ? '' : String(row.str), tired: row.str_tired === true };
}

async function listenRemote(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.heardRemote = [];

    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      window.heardRemote.push({ from: event.connectionId, data: event.data });
    });
  }, SYNC_CHANNEL);
}

async function heardRemote(page: Page): Promise<{ from: string; data: JsonValue }[]> {
  return heardSchema.parse(await page.evaluate(() => window.heardRemote));
}

async function listenDeltaKeys(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.heardKeys = [];

    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      const message = Object(event.data);

      if (message.t === 'delta' && Array.isArray(message.records)) {
        for (const one of message.records) {
          window.heardKeys.push(String(Object(one).k));
        }
      }
    });
  }, UI_CHANNEL);
}

async function heardKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => window.heardKeys);
}
