import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { deflateSync, strToU8 } from 'fflate';
import type { JsonValue } from '@/core/json';
import { assembleRecords } from '@/core/merge';
import { SYNC_CHANNEL } from '@/core/room-messages';
import { UI_CHANNEL } from '@/core/ui-messages';
import {
  addPartyMember,
  connectionIdOf,
  materializedRecords,
  npcBlock,
  openClientBackground,
  openClientWindow,
  pcSheet,
  postRemote,
  record,
  seedStorage,
  watchCommands,
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
const NO_SHEETS = 'ГМ ещё не создал листы.';
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

// A GM listed in the party with no page behind it: the test speaks for it.
const SILENT_GM = 'mock-connection-silent';

// Watches the room and sends nothing.
const OBSERVER: ClientParams = { client: 'o', role: 'PLAYER', player: 'olga', device: 'o' };

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
      tabs: [
        {
          sections: [
            {
              repeat: { id: 'npc_name', nameField: 'npc_name' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'npc_name' },
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

// The `preset` record as the room copy holds it: the preset JSON, deflated, in base64.
const PRESET_RECORD = record(
  'preset',
  Buffer.from(deflateSync(strToU8(PRESET_TEXT))).toString('base64'),
);

const BROK = pcSheet('brok', 'Брок', 0);
const MIRA = pcSheet('mira', 'Мира', 1);
const BROK_STR = record('blk:brok', { str: 14 });

// An NPC: a repeat block of the hidden single sheet NPC.
const GOBLIN = npcBlock('gob', 'Гоблин', 0, { hp: 7 });

declare global {
  interface Window {
    roomTypes: {
      from: string;
      t: string;
    }[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a player alone reads every visible sheet from the room copy, read-only, with no NPC and the no-GM banner', async ({
  context,
}) => {
  // #given
  const copy = copyValue([PRESET_RECORD, ...BROK, ...MIRA, GOBLIN, BROK_STR]);
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

test('a player alone with a room copy that holds a preset and only a hidden sheet sees that the GM has not made any', async ({
  context,
}) => {
  // #when
  const player = await openPlayerAlone(context, copyValue([PRESET_RECORD, GOBLIN]));
  // #then
  await expect(player.window.getByRole('main').getByText(NO_SHEETS, { exact: true })).toBeVisible();
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
});

test('a player alone with a room copy that holds no preset sees that the GM has not set up sheets', async ({
  context,
}) => {
  // #when
  const player = await openPlayerAlone(context, copyValue([...BROK]));
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
  const player = await openPlayerAlone(context, copyValue([PRESET_RECORD, ...BROK], 5));
  // #then
  await expect(player.window.getByRole('status')).toHaveText(NEW_VERSION);
  await expect(player.window.getByRole('main').getByText(LOADING, { exact: true })).toBeVisible();
  await expect(player.window.getByRole('tab')).toHaveCount(0);
});

test('a room copy that does not decode says so, with the no-GM banner', async ({ context }) => {
  // #when
  const player = await openPlayerAlone(context, { v: 4, data: 'bm90IGRlZmxhdGU=' });
  // #then
  await expect(
    player.window.getByRole('main').getByText(UNREADABLE, { exact: true }),
  ).toBeVisible();
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
});

test('a player alone sends no commit and no edit to the room', async ({ context }) => {
  // #given: pings every 500 to 750 ms.
  const params: ClientParams = { ...PLAYER, gmLinkTimeoutMs: 1000 };
  const observer = await openClientWindow(context, OBSERVER);
  await watchRoom(observer);

  const player = await openPlayerAlone(
    context,
    copyValue([PRESET_RECORD, ...BROK, BROK_STR]),
    params,
  );

  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');
  await watchCommands(player.window);
  // #when: a field edit goes the way a window sends one, and is refused.
  await player.window.evaluate((channel) => {
    void window.mockPlatform.broadcast.sendMessage(
      channel,
      {
        t: 'command',
        id: 'player-edit',
        command: {
          type: 'field-patch',
          sheetId: 'brok',
          target: { kind: 'row', rowId: 'str' },
          fieldId: 'str',
          value: 20,
        },
      },
      { destination: 'LOCAL' },
    );
  }, UI_CHANNEL);
  await expect
    .poll(() => player.window.evaluate(() => window.rejectedCommandIds))
    .toContain('player-edit');
  // A ping heard after the refusal shows the room has had time to hear anything else.
  const pingsBefore = await heardCount(observer, connectionIdOf(PLAYER), 'ping');
  await expect
    .poll(() => heardCount(observer, connectionIdOf(PLAYER), 'ping'), { timeout: 3000 })
    .toBeGreaterThan(pingsBefore);
  // #then
  const types = await observer.evaluate(() => window.roomTypes);

  const fromPlayer = new Set(
    types.filter((one) => one.from === connectionIdOf(PLAYER)).map((one) => one.t),
  );

  expect([...fromPlayer].sort()).toEqual(['ping', 'state-request']);
  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');
});

test('a player alone with no copy keeps loading once a GM speaks without answering', async ({
  context,
}) => {
  // #given
  const player = await openPlayerAlone(context, null);
  await expect(
    player.window.getByRole('main').getByText(NO_GM_NO_DATA, { exact: true }),
  ).toBeVisible();
  await addPartyMember(player.window, SILENT_GM, 'GM');
  // #when: a GM-origin message, and no complete state.
  await postRemote(player.window, SILENT_GM, { v: 4, g: { n: 0, a: '' }, t: 'ping' });
  // #then: a GM is online but has not said what the room holds.
  await expect(player.window.getByRole('status')).toBeEmpty();
  await expect(player.window.getByRole('main').getByText(LOADING, { exact: true })).toBeVisible();
  await expect(player.window.getByText(NO_GM_NO_DATA)).toHaveCount(0);
});

test('when a GM joins and answers, the no-GM banner goes and the sheets show current data', async ({
  context,
}) => {
  // #given: the copy is older than what the GM's own device holds.
  const player = await openPlayerAlone(context, copyValue([PRESET_RECORD, ...BROK, BROK_STR]));
  await expect(panel(player.window).getByRole('group', { name: 'Сила' })).toHaveText('14');
  // #when
  const gmWindow = await openClientWindow(context, GM);
  await seedStorage(
    gmWindow,
    [...BROK, ...MIRA, record('blk:brok', { str: 18 }, 2)],
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
  await seedStorage(gmWindow, [...BROK, BROK_STR], PRESET_TEXT, GM.device);
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
  params: ClientParams = PLAYER,
): Promise<RoomClient> {
  const page = await openClientWindow(context, params);

  if (copy !== null) {
    await page.evaluate(
      async ([key, value]) => {
        await window.mockPlatform.metadata.setMetadata({ [key]: JSON.parse(value) });
      },
      [KEY, JSON.stringify(copy)] as const,
    );
  }

  const background = await openClientBackground(context, params);
  await expect(page.getByRole('status')).not.toBeEmpty();

  return { window: page, background, connectionId: connectionIdOf(params) };
}

// The stored room copy as the 2.5 spec describes it, built by hand with fflate.
function copyValue(records: readonly StoredRecord[], v = 4): JsonValue {
  const assembled = records.some((record) => record.k === 'preset')
    ? materializedRecords(records, PRESET_TEXT)
    : [...assembleRecords(records).values()];

  const content = JSON.stringify({ g: { n: 0, a: '' }, records: sortedByKey(assembled) });

  return { v, data: Buffer.from(deflateSync(strToU8(content))).toString('base64') };
}

function sortedByKey(records: readonly StoredRecord[]): StoredRecord[] {
  return [...records].sort((first, second) => (first.k < second.k ? -1 : 1));
}

function panel(page: Page): Locator {
  return page.getByRole('tabpanel');
}

// How many room messages of type `t` this page has heard from `from`.
async function heardCount(page: Page, from: string, t: string): Promise<number> {
  const types = await page.evaluate(() => window.roomTypes);

  return types.filter((one) => one.from === from && one.t === t).length;
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
