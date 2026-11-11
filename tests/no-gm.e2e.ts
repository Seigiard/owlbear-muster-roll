import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { deflateSync, strToU8 } from 'fflate';

import type { JsonValue } from '@/core/json';
import { SYNC_CHANNEL } from '@/core/room-messages';

import {
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  record,
  seedStorage,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

// The strings and the key of the 2.4, 2.5 and 2.6 specs, written out by hand.
const KEY = 'app.muster-roll/snapshot';
const LOADING = 'Загрузка…';
const NO_GM = 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.';
const NEW_VERSION = 'Вышла новая версия. Перезагрузите страницу.';
const NO_GM_NO_DATA = 'ГМ ещё не заходил. Листов пока нет.';
const UNREADABLE = 'Копия в комнате не читается. Дождитесь ГМ.';
const NO_PRESET = 'ГМ ещё не настроил листы.';
const NO_CHARACTERS = 'ГМ ещё не создал персонажей.';
const READ_ONLY = 'Только чтение';

const GM: ClientParams = { client: 'a', device: 'a' };

// Short, so a player alone in the room stops waiting for an answer soon.
const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  catchUpTimeoutMs: 500,
};

// Watches the room and sends nothing.
const OBSERVER: ClientParams = { client: 'o', role: 'PLAYER', player: 'olga', device: 'o' };

const PRESET = {
  v: 1,
  character: {
    sections: [
      {
        rows: [
          [
            { kind: 'text', text: 'Сила' },
            { kind: 'field', type: 'number', id: 'str' },
          ],
        ],
      },
    ],
  },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
};

const PRESET_TEXT = JSON.stringify(PRESET);

// The `preset` record as the room copy holds it: the preset JSON, deflated, in base64.
const PRESET_RECORD = record(
  'preset',
  Buffer.from(deflateSync(strToU8(PRESET_TEXT))).toString('base64'),
);

const BROK = record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 });
const MIRA = record('sheet:mira', { kind: 'pc', name: 'Мира', order: 1 });
const GOBLIN = record('sheet:gob', { kind: 'npc', name: 'Гоблин', order: 2 });
const BROK_STR = record('row:brok:str', { str: 14 });
const GOBLIN_HP = record('row:gob:hp', { hp: 7 });

declare global {
  interface Window {
    roomTypes: { from: string; t: string }[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a player alone reads every character from the room copy, read-only, with no NPC and the no-GM banner', async ({
  context,
}) => {
  // #given
  const copy = copyValue([PRESET_RECORD, BROK, MIRA, GOBLIN, BROK_STR, GOBLIN_HP]);

  // #when
  const player = await openPlayerAlone(context, copy);

  // #then
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
  await expect(player.window.getByRole('tab')).toHaveText(['Брок', 'Мира']);
  await expect(player.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(panel(player.window).getByText(READ_ONLY)).toBeVisible();
  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');
  await expect(panel(player.window).getByRole('textbox')).toHaveCount(0);
  await expect(player.window.getByText('Гоблин')).toHaveCount(0);
});

test('a player alone with a room copy that holds a preset and no character sees that the GM has not made any', async ({
  context,
}) => {
  // #when
  const player = await openPlayerAlone(context, copyValue([PRESET_RECORD, GOBLIN]));

  // #then
  await expect(
    player.window.getByRole('main').getByText(NO_CHARACTERS, { exact: true }),
  ).toBeVisible();
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
});

test('a player alone with a room copy that holds no preset sees that the GM has not set up sheets', async ({
  context,
}) => {
  // #when
  const player = await openPlayerAlone(context, copyValue([BROK]));

  // #then
  await expect(player.window.getByRole('main').getByText(NO_PRESET, { exact: true })).toBeVisible();
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
});

test('a player alone with no room copy sees that no GM has been in the room', async ({
  context,
}) => {
  // #when
  const player = await openPlayerAlone(context, null);

  // #then
  await expect(
    player.window.getByRole('main').getByText(NO_GM_NO_DATA, { exact: true }),
  ).toBeVisible();
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
});

test('a room copy of a newer build is not read: the new-version banner shows and the panel keeps loading', async ({
  context,
}) => {
  // #when
  const player = await openPlayerAlone(context, copyValue([PRESET_RECORD, BROK], 2));

  // #then
  await expect(player.window.getByRole('status')).toHaveText(NEW_VERSION);
  await expect(player.window.getByRole('main').getByText(LOADING, { exact: true })).toBeVisible();
  await expect(player.window.getByRole('tab')).toHaveCount(0);
});

test('a room copy that does not decode says so, with the no-GM banner', async ({ context }) => {
  // #when
  const player = await openPlayerAlone(context, { v: 1, data: 'bm90IGRlZmxhdGU=' });

  // #then
  await expect(
    player.window.getByRole('main').getByText(UNREADABLE, { exact: true }),
  ).toBeVisible();
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
});

test('a player alone sends no commit and no edit to the room', async ({ context }) => {
  // #given
  const observer = await openClientWindow(context, OBSERVER);

  await watchRoom(observer);

  // #when
  const player = await openPlayerAlone(context, copyValue([PRESET_RECORD, BROK, BROK_STR]));

  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');
  await player.window.keyboard.press('Tab');
  await player.window.keyboard.type('20');

  // #then
  const types = await observer.evaluate(() => window.roomTypes);

  const fromPlayer = new Set(
    types.filter((one) => one.from === connectionIdOf(PLAYER)).map((one) => one.t),
  );

  // Nothing but the catch-up request and pings, and the value stays the copy's.
  expect([...fromPlayer].every((t) => t === 'state-request' || t === 'ping')).toBe(true);
  expect(fromPlayer.has('state-request')).toBe(true);
  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');
});

test('when a GM joins and answers, the no-GM banner goes and the sheets show current data', async ({
  context,
}) => {
  // #given: the copy is older than what the GM's own device holds.
  const player = await openPlayerAlone(context, copyValue([PRESET_RECORD, BROK, BROK_STR]));

  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');

  // #when
  const gmWindow = await openClientWindow(context, GM);

  await seedStorage(
    gmWindow,
    [BROK, MIRA, record('row:brok:str', { str: 18 }, 2)],
    PRESET_TEXT,
    GM.device,
  );
  await openClientBackground(context, GM);

  // #then
  await expect(player.window.getByRole('status')).toBeEmpty();
  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('18');
  await expect(player.window.getByRole('tab')).toHaveText(['Брок', 'Мира']);
});

test('a player alone with no copy reads the GM sheets once a GM joins', async ({ context }) => {
  // #given
  const player = await openPlayerAlone(context, null);

  await expect(
    player.window.getByRole('main').getByText(NO_GM_NO_DATA, { exact: true }),
  ).toBeVisible();

  // #when
  const gmWindow = await openClientWindow(context, GM);

  await seedStorage(gmWindow, [BROK, BROK_STR], PRESET_TEXT, GM.device);
  await openClientBackground(context, GM);

  // #then
  await expect(player.window.getByRole('status')).toBeEmpty();
  await expect(player.window.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');
});

// A player alone in the room. `copy` is the room copy seeded before its background starts, or
// `null` for none. Resolves once the start catch-up has timed out and the banner shows a notice.
async function openPlayerAlone(
  context: BrowserContext,
  copy: JsonValue | null,
): Promise<RoomClient> {
  const page = await openClientWindow(context, PLAYER);

  if (copy !== null) {
    await page.evaluate(
      async ([key, value]) => {
        await window.mockPlatform.metadata.setMetadata({ [key]: JSON.parse(value) });
      },
      [KEY, JSON.stringify(copy)] as const,
    );
  }

  const background = await openClientBackground(context, PLAYER);

  await expect(page.getByRole('status')).not.toBeEmpty();

  return { window: page, background, connectionId: connectionIdOf(PLAYER) };
}

// The stored room copy as the 2.5 spec describes it, built by hand with fflate.
function copyValue(records: readonly StoredRecord[], v = 1): JsonValue {
  const content = JSON.stringify({ g: { n: 0, a: '' }, records: sortedByKey(records) });

  return { v, data: Buffer.from(deflateSync(strToU8(content))).toString('base64') };
}

function sortedByKey(records: readonly StoredRecord[]): StoredRecord[] {
  return [...records].sort((first, second) => (first.k < second.k ? -1 : 1));
}

function panel(page: Page): Locator {
  return page.getByRole('tabpanel');
}

// Collects the sender and type of every room message this page hears.
async function watchRoom(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.roomTypes = [];
    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      window.roomTypes.push({ from: event.connectionId, t: String(Object(event.data).t) });
    });
  }, SYNC_CHANNEL);
}
