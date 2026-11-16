import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { ContextMenuIconFilter } from '@/platform/ports';
import {
  ADD,
  npcBlock,
  openBackground,
  openClientBackground,
  openClientWindow,
  openRoom,
  pcSheet,
  record,
  seedStorage,
  syncRead,
  type ClientParams,
  type StoredRecord,
} from './support/room';

const LINK_ITEM = 'app.muster-roll/link-sheet';
const UNLINK_ITEM = 'app.muster-roll/unlink-sheet';
const OPEN_ITEM = 'app.muster-roll/open-sheet';
const OPEN_SHEET = 'Открыть лист';
const SHEET_NAME = 'Имя листа';
const UI_CHANNEL = 'app.muster-roll/ui';

const CHARACTERS = [
  'Аня',
  'Брок',
  'Вера',
  'Глеб',
  'Дарья',
  'Евгений',
  'Жанна',
  'Захар',
  'Ирина',
  'Ярослава',
];

const NPCS = ['Гоблин 1', 'Гоблин 2', 'Гоблин 3', 'Гоблин 4', 'Гоблин 5', 'Гоблин 6', 'Дракон'];

// Ten characters, so the last sidebar entry starts out of a short window's view, and seven NPC
// repeat blocks of the hidden single sheet "NPC", so the last one starts below the panel's fold.
// t-first links the first
// character, t-last the last one, t-npc the last NPC's repeat block, t-chest the visible single
// sheet "Инвентарь"; t-gone points to a deleted sheet.
const ROOM: readonly StoredRecord[] = [
  ...CHARACTERS.flatMap((name, order) => pcSheet(`pc${order}`, name, order)),
  ...NPCS.map((name, order) => npcBlock(`npc${order}`, name, order)),
  record('blk:gone', null, 2),
  record('link:t-first', { s: 'pc0', c: 'token' }),
  record('link:t-last', { s: `pc${CHARACTERS.length - 1}`, c: 'token' }),
  record('link:t-npc', {
    s: 'npc',
    path: ['npc_name', `npc${NPCS.length - 1}`],
    c: 'token',
  }),
  record('link:t-chest', { s: 'inventory', c: 'token' }),
  record('link:t-gone', { s: 'gone', c: 'token' }),
];

const LAYER = { key: 'layer', value: 'CHARACTER' };
const GM: ClientParams = { client: 'a', device: 'a' };
const PLAYER: ClientParams = { client: 'p', role: 'PLAYER', player: 'lisa', device: 'p' };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 400 });
});

test('a GM menu on a linked token has "Открыть лист" and "Отвязать лист", and no dangling link opens', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  // #when
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  // #then: one item, a GM icon on every live-linked token and a player icon on the tokens of
  // visible templates only.
  expect(await openIcons(background)).toEqual([
    {
      label: OPEN_SHEET,
      filter: {
        max: 1,
        roles: ['GM'],
        every: [LAYER],
        some: [
          { key: 'id', value: 't-chest', coordinator: '||' },
          { key: 'id', value: 't-first', coordinator: '||' },
          { key: 'id', value: 't-last', coordinator: '||' },
          { key: 'id', value: 't-npc' },
        ],
      },
    },
    {
      label: OPEN_SHEET,
      filter: {
        max: 1,
        roles: ['PLAYER'],
        every: [LAYER],
        some: [
          { key: 'id', value: 't-chest', coordinator: '||' },
          { key: 'id', value: 't-first', coordinator: '||' },
          { key: 'id', value: 't-last' },
        ],
      },
    },
  ]);
});

test('a GM opens a character from its token: the window selects its tab and scrolls it into view', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  const target = page.getByRole('tab', { name: 'Ярослава' });
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await page.setViewportSize({ width: 600, height: 300 });
  await expect(target).not.toBeInViewport();
  // #when
  await clickOpen(background, 't-last');
  // #then
  await expect(target).toHaveAttribute('aria-selected', 'true');
  await expect(target).toBeInViewport();
  await expect(page.getByRole('tabpanel').getByRole('textbox', { name: SHEET_NAME })).toHaveValue(
    'Ярослава',
  );
});

test('a GM opens a single sheet from its token: the window selects its tab', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  // #when
  await clickOpen(background, 't-chest');
  // #then
  await expect(page.getByRole('tab', { name: 'Инвентарь' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel').getByRole('heading', { level: 1 })).toHaveText(
    'Инвентарь',
  );
});

test('a GM opens an NPC repeat block from its token: the NPC tab opens and the block scrolls into view', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  // #when
  await clickOpen(background, 't-npc');
  // #then
  await expect(page.getByRole('tab', { name: 'NPC' })).toHaveAttribute('aria-selected', 'true');
  await expect(repeatBlock(page, 'Дракон')).toBeInViewport();
});

test('with reduced motion the open scrolls too', async ({ page, context }) => {
  // #given
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const background = await openRoom(page, context, ROOM);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  // #when
  await clickOpen(background, 't-npc');
  // #then
  await expect(repeatBlock(page, 'Дракон')).toBeInViewport();
});

test('with the window closed, the action window opens on the sheet once, and a reload does not open it again', async ({
  page,
  context,
}) => {
  // #given: the storage is seeded from a window that then closes.
  await page.goto('/index.html');
  await seedStorage(page, ROOM);
  await page.close();
  const background = await openBackground(context);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  // #when
  await clickOpen(background, 't-last');
  const sheets = await context.newPage();
  await sheets.setViewportSize({ width: 600, height: 400 });
  await sheets.goto('/index.html');
  // #then
  const target = sheets.getByRole('tab', { name: 'Ярослава' });
  await expect(target).toHaveAttribute('aria-selected', 'true');
  await expect(target).toBeInViewport();
  expect(await background.evaluate(() => window.mockPlatform.actionOpens())).toBe(1);
  await sheets.reload();
  await expect(sheets.getByRole('button', { name: ADD })).toBeVisible();
  // One more projection: an open request the engine still held would reach the window before it.
  await syncRead(sheets);
  await sheets.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(sheets.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
  await expect(target).toHaveAttribute('aria-selected', 'false');
});

test('a player opens a character from its token, and gets no item on a hidden NPC or an unlinked token', async ({
  context,
}) => {
  // #given
  const gmWindow = await openClientWindow(context, GM);
  await seedStorage(gmWindow, ROOM, undefined, GM.device);
  await openClientBackground(context, GM);
  await expect(gmWindow.getByRole('button', { name: ADD })).toBeVisible();
  const sheets = await openClientWindow(context, PLAYER);
  await sheets.setViewportSize({ width: 600, height: 400 });
  const background = await openClientBackground(context, PLAYER);
  await waitForMenu(background, [OPEN_ITEM]);
  const target = sheets.getByRole('tab', { name: 'Ярослава' });
  await expect(sheets.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
  // #when
  await clickOpen(background, 't-last');
  // #then: the player icon names the tokens of visible templates only, and the GM icon is
  // Owlbear's to hide.
  await expect(target).toHaveAttribute('aria-selected', 'true');
  await expect(target).toBeInViewport();
  expect(
    (await openIcons(background)).map((icon) => ({
      roles: icon.filter?.roles,
      ids: icon.filter?.some?.map((filter) => filter.value),
    })),
  ).toEqual([
    { roles: ['GM'], ids: ['t-chest', 't-first', 't-last', 't-npc'] },
    { roles: ['PLAYER'], ids: ['t-chest', 't-first', 't-last'] },
  ]);
});

test('a player opens the visible single sheet "Инвентарь" from its token', async ({ context }) => {
  // #given
  const gmWindow = await openClientWindow(context, GM);
  await seedStorage(gmWindow, ROOM, undefined, GM.device);
  await openClientBackground(context, GM);
  await expect(gmWindow.getByRole('button', { name: ADD })).toBeVisible();
  const sheets = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);
  await waitForMenu(background, [OPEN_ITEM]);
  await expect(sheets.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
  // #when
  await clickOpen(background, 't-chest');
  // #then
  await expect(sheets.getByRole('tab', { name: 'Инвентарь' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a GM on the NPC tab who opens another repeat block from its token scrolls to it', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(repeatBlock(page, 'Гоблин 1')).toBeInViewport();
  await expect(repeatBlock(page, 'Дракон')).not.toBeInViewport();
  // #when
  await clickOpen(background, 't-npc');
  // #then
  await expect(repeatBlock(page, 'Дракон')).toBeInViewport();
  await expect(tokenCell(page, `npc${NPCS.length - 1}`)).toBeFocused();
});

test('a player press that races onto an NPC token opens nothing', async ({ context }) => {
  // #given
  const gmWindow = await openClientWindow(context, GM);
  await seedStorage(gmWindow, ROOM, undefined, GM.device);
  await openClientBackground(context, GM);
  await expect(gmWindow.getByRole('button', { name: ADD })).toBeVisible();
  const sheets = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);
  await waitForMenu(background, [OPEN_ITEM]);
  await expect(sheets.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
  // #when
  await clickOpen(background, 't-npc');
  await clickOpen(background, 't-last');
  // #then: only the second press reaches the window, and the NPC never shows.
  await expect(sheets.getByRole('tab', { name: 'Ярослава' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await background.evaluate(() => window.mockPlatform.actionOpens())).toBe(1);
  await expect(sheets.getByText('Дракон')).toHaveCount(0);
});

test('with the focus in the window, the opened tab takes it', async ({ page, context }) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await page.getByRole('textbox', { name: SHEET_NAME }).focus();
  // #when
  await clickOpen(background, 't-last');
  // #then
  await expect(tokenCell(page, 'root')).toBeFocused();
});

test('with the focus in the window, an opened NPC repeat block takes it', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await page.getByRole('textbox', { name: SHEET_NAME }).focus();
  // #when
  await clickOpen(background, 't-npc');
  // #then
  await expect(tokenCell(page, `npc${NPCS.length - 1}`)).toBeFocused();
});

test('with the focus outside the window, an open leaves it alone', async ({ page, context }) => {
  // #given
  const background = await openRoom(page, context, ROOM);
  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  // #when
  await clickOpen(background, 't-last');
  await expect(page.getByRole('tab', { name: 'Ярослава' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // #then
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('a request for a sheet the window does not list is acknowledged and selects nothing', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);

  const acknowledged = page.evaluate(
    (channel) =>
      new Promise<boolean>((resolve) => {
        window.mockPlatform.broadcast.onMessage(channel, (event) => {
          const message = Object(event.data);

          if (message.t === 'open-sheet-ack' && message.id === 'stray') {
            resolve(true);
          }
        });
      }),
    UI_CHANNEL,
  );

  // #when: as an engine would send it, for a sheet deleted on the way.
  await page.evaluate((channel) => {
    void window.mockPlatform.broadcast.sendMessage(
      channel,
      { t: 'open-sheet', id: 'stray', sheetId: 'nobody', cellId: 'token' },
      { destination: 'LOCAL' },
    );
  }, UI_CHANNEL);
  // #then
  expect(await acknowledged).toBe(true);
  await expect(page.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
});

async function waitForMenu(background: Page, ids: readonly string[]): Promise<void> {
  await expect
    .poll(() =>
      background.evaluate(() => window.mockPlatform.contextMenuItems().map((item) => item.id)),
    )
    .toEqual(ids);
}

async function clickOpen(background: Page, tokenId: string): Promise<void> {
  const clicked = await background.evaluate(
    ([item, token]) => window.mockPlatform.clickContextMenuItem(item, [token]),
    [OPEN_ITEM, tokenId] as const,
  );

  expect(clicked).toBe(true);
}

// The icons of "Открыть лист" as Owlbear gets them. The mock does not apply filters, so a test
// reads them as data.
function openIcons(background: Page): Promise<
  {
    label: string;
    filter: ContextMenuIconFilter | undefined;
  }[]
> {
  return background.evaluate(
    (id) =>
      window.mockPlatform
        .contextMenuItems()
        .find((item) => item.id === id)
        ?.icons.map((icon) => ({ label: icon.label, filter: icon.filter })) ?? [],
    OPEN_ITEM,
  );
}

// A repeat block is a group named by its first field.
function repeatBlock(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('group', { name, exact: true });
}

function tokenCell(page: Page, scope: string): Locator {
  return page.getByRole('tabpanel').locator(`[data-cell-id="token"][data-cell-scope="${scope}"]`);
}
