import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { copy } from '@/copy';
import {
  ADD,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  record,
  repRecord,
  seedStorage,
  selectOnMap,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const OPEN_ITEM = 'app.muster-roll/open-sheet';
const SHEET_NAME = 'Имя листа';
const GM: ClientParams = { client: 'a', device: 'a', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  name: 'Лиза',
};

// The name field, a numeric field and a linkable repeat section are on the hidden tab. The visible
// tab rolls with the hidden numeric field. "Хранилище" has no tab visible to a player.
const PRESET = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      tabs: [
        {
          title: 'Основное',
          sections: [
            {
              title: 'Открытое',
              rows: [
                [
                  { kind: 'text', text: 'Проверка' },
                  { kind: 'dice', formula: '1d1 + secret' },
                ],
              ],
            },
          ],
        },
        {
          title: 'Заметки мастера',
          visibility: 'gm',
          sections: [
            {
              title: 'Секреты',
              rows: [
                [
                  { kind: 'text', text: 'Имя' },
                  { kind: 'field', type: 'text', id: 'name' },
                ],
                [
                  { kind: 'text', text: 'Секрет' },
                  { kind: 'field', type: 'number', id: 'secret' },
                ],
              ],
            },
            {
              title: 'Связи',
              repeat: true,
              tokens: true,
              rows: [[{ kind: 'field', type: 'text', id: 'contact' }]],
            },
          ],
        },
      ],
    },
    {
      id: 'vault',
      kind: 'single',
      title: 'Хранилище',
      tabs: [
        {
          visibility: 'gm',
          sections: [
            {
              title: 'Тайники',
              rows: [[{ kind: 'field', type: 'text', id: 'stash' }]],
            },
          ],
        },
      ],
    },
  ],
};

const RECORDS: readonly StoredRecord[] = [
  record('blk:brok', { set: 'pc', order: 0 }),
  record('blk:brok', { name: 'Брок' }),
  record('blk:brok', { secret: 4 }),
  record('acl:brok:lisa', { name: 'Лиза' }),
  repRecord('brok', 'contact', 'spy', 0, { contact: 'Осведомитель' }),
  record('link:t-sheet', { s: 'brok' }),
  record('link:t-secret', { s: 'brok', i: 'spy' }),
  record('blk:vault', { stash: 'Ключ' }),
];

const HIDDEN_LINK_RECORDS = RECORDS.filter((one) => one.k !== 'link:t-sheet');
const NO_LINK_RECORDS = RECORDS.filter((one) => !one.k.startsWith('link:'));
const READ_ONLY_RECORDS = RECORDS.filter((one) => one.k !== 'acl:brok:lisa');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 500 });
});

test('a GM sees a hidden tab and a player sees only the visible tab and its sections', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  // #when
  const player = await openPlayer(context);
  // #then
  await expect(gm.window.getByRole('tablist', { name: copy.label.sheetTabs })).toBeVisible();
  await expect(sheetTab(gm.window, 'Основное')).toBeVisible();
  await expect(sheetTab(gm.window, 'Заметки мастера')).toBeVisible();
  await sheetTab(gm.window, 'Заметки мастера').click();
  await expect(gm.window.getByRole('heading', { name: 'Секреты' })).toBeVisible();
  await expect(player.window.getByRole('heading', { name: 'Открытое' })).toBeVisible();
  await expect(player.window.getByRole('heading', { name: 'Секреты' })).toHaveCount(0);
  await expect(player.window.getByRole('tablist', { name: copy.label.sheetTabs })).toHaveCount(0);
});

test('a player sees the header but no tab row or content when every tab is hidden', async ({
  context,
}) => {
  // #given
  await openGm(context);
  const player = await openPlayer(context);
  // #when
  await player.window.getByRole('tab', { name: 'Хранилище' }).click();
  // #then
  await expect(player.window.getByRole('heading', { level: 1, name: 'Хранилище' })).toBeVisible();
  await expect(player.window.getByRole('tablist', { name: copy.label.sheetTabs })).toHaveCount(0);
  await expect(player.window.getByRole('heading', { name: 'Тайники' })).toHaveCount(0);
  await expect(player.window.getByRole('textbox', { name: 'stash' })).toHaveCount(0);
});

test('a hidden-tab name stays read-only while the player header says they can edit', async ({
  context,
}) => {
  // #given
  await openGm(context);
  // #when
  const player = await openPlayer(context);
  // #then
  await expect(player.window.getByRole('heading', { level: 1, name: 'Брок' })).toBeVisible();
  await expect(player.window.getByRole('textbox', { name: SHEET_NAME })).toHaveCount(0);
  await expect(player.window.getByText('Можно править', { exact: true })).toBeVisible();
});

test('a hidden-tab name stays read-only while the player header says read-only', async ({
  context,
}) => {
  // #given
  await openGm(context, READ_ONLY_RECORDS);
  // #when
  const player = await openPlayer(context);
  // #then
  await expect(player.window.getByRole('heading', { level: 1, name: 'Брок' })).toBeVisible();
  await expect(player.window.getByRole('textbox', { name: SHEET_NAME })).toHaveCount(0);
  await expect(player.window.getByText('Только чтение', { exact: true })).toBeVisible();
});

test('a player roll on a visible tab reads a field kept on a hidden tab', async ({ context }) => {
  // #given
  await openGm(context);
  const player = await openPlayer(context);
  // #when
  await player.window.getByRole('button', { name: 'Проверка', exact: true }).click();
  // #then: 1 on d1 plus the hidden field value 4.
  await expect.poll(() => shownNotifications(player)).toEqual(['Лиза: Брок, Проверка — 5']);
});

test('a hidden-tab repeat link gives a player no token menu entry', async ({ context }) => {
  // #given
  await openGm(context);
  const player = await openPlayer(context);
  // #when
  const tokens = await playerOpenTokens(player.background);
  // #then
  expect(tokens).toEqual(['t-sheet']);
});

test('a player token menu is empty when its only link targets a hidden tab', async ({
  context,
}) => {
  // #given
  await openGm(context, HIDDEN_LINK_RECORDS);
  const player = await openPlayer(context);
  // #when
  const tokens = await playerOpenTokens(player.background);
  // #then
  expect(tokens).toEqual([]);
});

test('a player token menu is empty when the room has no links', async ({ context }) => {
  // #given
  await openGm(context, NO_LINK_RECORDS);
  const player = await openPlayer(context);
  // #when
  const tokens = await playerOpenTokens(player.background);
  // #then
  expect(tokens).toEqual([]);
});

test('a selected token linked to a hidden-tab repeat block gives a player no selection mark', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);
  // #when
  await selectOnMap(gm.window, ['t-secret']);
  await selectOnMap(player.window, ['t-secret']);
  // #then
  await expect(gm.window.getByRole('tab', { name: 'Брок, токен выделен' })).toBeVisible();
  await expect(player.window.getByRole('tab', { name: /токен выделен/ })).toHaveCount(0);
  await expect(sheetTab(player.window, /токен выделен/)).toHaveCount(0);
});

async function openGm(
  context: BrowserContext,
  records: readonly StoredRecord[] = RECORDS,
): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);
  await seedStorage(window, records, JSON.stringify(PRESET), GM.device);
  const background = await openClientBackground(context, GM);
  await expect(window.getByRole('button', { name: ADD })).toBeVisible();

  return { window, background, connectionId: connectionIdOf(GM) };
}

async function openPlayer(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);
  await expect(window.getByRole('tab', { name: 'Брок' })).toBeVisible();

  return { window, background, connectionId: connectionIdOf(PLAYER) };
}

function sheetTab(page: Page, name: string | RegExp): Locator {
  return page.getByRole('tablist', { name: copy.label.sheetTabs }).getByRole('tab', { name });
}

async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

async function playerOpenTokens(background: Page): Promise<unknown[]> {
  return background.evaluate(
    (id) =>
      window.mockPlatform
        .contextMenuItems()
        .find((item) => item.id === id)
        ?.icons.flatMap((icon) =>
          icon.filter?.roles?.includes('PLAYER')
            ? (icon.filter.some?.map((filter) => filter.value) ?? [])
            : [],
        ) ?? [],
    OPEN_ITEM,
  );
}
