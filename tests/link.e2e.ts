import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { Popover } from '@/platform/ports';

import { ABSENT, openRoom, record, storedData, type StoredRecord } from './support/room';

const LINK_ITEM = 'app.muster-roll/link-sheet';
const UNLINK_ITEM = 'app.muster-roll/unlink-sheet';
const PICKER_POPOVER = 'app.muster-roll/link-picker';
const TOKEN_LINKED = 'Токен привязан';
const NO_TOKEN = 'Нет токена';
const NO_SHEETS = 'Сначала создайте лист';
const LINK_FAILED = 'Не удалось привязать. Попробуйте ещё раз.';
const UI_CHANNEL = 'app.muster-roll/ui';

// Two characters and two NPCs. "Аня" and "Гоблин" each have a token; t-gone points to a deleted
// sheet, so it counts as no link.
const ROOM: readonly StoredRecord[] = [
  pc('anya', 'Аня', 0),
  pc('brok', 'Брок', 1),
  npc('gob', 'Гоблин', 0),
  npc('skel', 'Скелет', 1),
  record('sheet:gone', null, 2),
  record('link:t-anya', 'anya'),
  record('link:t-gob', 'gob'),
  record('link:t-gone', 'gone'),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('"Привязать лист…" opens the picker in a small popover for the pressed token', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await waitForMenu(background, [LINK_ITEM, UNLINK_ITEM]);

  // #when
  await clickMenuItem(background, LINK_ITEM, 'tok-new');

  // #then
  expect(await openedPopovers(background)).toEqual([
    {
      id: PICKER_POPOVER,
      url: '/picker.html?token=tok-new',
      width: 280,
      height: 360,
      anchorElementId: 'mock-context-menu-element',
    },
  ]);
});

test('the picker lists characters, then NPCs, each with the sheets with no token first', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);

  // #when
  const picker = await openPicker(context, 'tok-new');

  // #then
  expect({
    characters: await sheetButtons(picker.getByRole('list').first()),
    npcs: await sheetButtons(picker.getByRole('region', { name: 'NPC' })),
  }).toEqual({
    characters: ['Брок', `Аня, ${TOKEN_LINKED}`],
    npcs: ['Скелет', `Гоблин, ${TOKEN_LINKED}`],
  });
});

test(`the picker with no sheet shows "${NO_SHEETS}"`, async ({ page, context }) => {
  // #given
  await openRoom(page, context, [record('sheet:gone', null, 2)]);

  // #when
  const picker = await openPicker(context, 'tok-new');

  // #then
  await expect(picker.getByText(NO_SHEETS)).toBeVisible();
  expect(await picker.getByRole('button').count()).toBe(0);
});

test('a pick writes the link, closes the popover, and both headers show the status', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);

  const picker = await openPicker(context, 'tok-new');
  const before = await headerStatus(page);

  // #when
  await picker.getByRole('button', { name: 'Брок' }).click();
  await expect.poll(() => closedPopovers(picker)).toEqual([PICKER_POPOVER]);

  // #then
  await page.getByRole('tab', { name: 'Брок' }).click();
  await expect(headerOf(page).getByText(TOKEN_LINKED)).toBeVisible();
  expect({ before, link: await storedData(page, 'link:tok-new') }).toEqual({
    before: NO_TOKEN,
    link: 'brok',
  });
});

test('the NPC block shows its token status, read-only', async ({ page, context }) => {
  // #given
  await openRoom(page, context, ROOM);

  // #when
  await page.getByRole('tab', { name: 'NPC' }).click();

  // #then
  expect({
    goblin: await npcBlock(page, 'Гоблин').getByText(TOKEN_LINKED).count(),
    skeleton: await npcBlock(page, 'Скелет').getByText(NO_TOKEN).count(),
    controls: await npcBlock(page, 'Гоблин').getByRole('button', { name: TOKEN_LINKED }).count(),
  }).toEqual({ goblin: 1, skeleton: 1, controls: 0 });
});

test('"Отвязать лист" tombstones the link and the header shows "Нет токена"', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await waitForMenu(background, [LINK_ITEM, UNLINK_ITEM]);
  await expect(headerOf(page).getByText(TOKEN_LINKED)).toBeVisible();

  // #when
  await clickMenuItem(background, UNLINK_ITEM, 't-anya');

  // #then
  await expect(headerOf(page).getByText(NO_TOKEN)).toBeVisible();
  expect({
    link: await storedData(page, 'link:t-anya'),
    sheet: await storedData(page, 'sheet:anya'),
  }).toEqual({ link: null, sheet: { kind: 'pc', name: 'Аня', order: 0 } });
});

test('a token id no link can hold shows the failure at once and no sheet to pick', async ({
  page,
  context,
}) => {
  // #given: no `link:` key can hold a token id with ":".
  await openRoom(page, context, ROOM);

  // #when
  const picker = await openPicker(context, 'bad:token');

  // #then
  await expect(picker.getByText(LINK_FAILED)).toBeVisible();
  expect(await picker.getByRole('button').count()).toBe(0);
});

test('a pick of a sheet deleted while the picker was open shows the failure and writes nothing', async ({
  page,
  context,
}) => {
  // #given: the picker misses the delta of the deletion, as one still on its way.
  await openRoom(page, context, ROOM);

  const picker = await openPicker(context, 'tok-new', { dropDeltas: true });

  await picker.evaluate(() => {
    Object.assign(window, { dropDeltas: true });
  });
  await page.evaluate((channel) => {
    void window.mockPlatform.broadcast.sendMessage(
      channel,
      { t: 'command', id: 'delete-brok', command: { type: 'sheet-delete', sheetId: 'brok' } },
      { destination: 'LOCAL' },
    );
  }, UI_CHANNEL);
  await expect.poll(() => storedData(page, 'sheet:brok')).toBeNull();

  // #when
  await picker.getByRole('button', { name: 'Брок' }).click();

  // #then
  await expect(picker.getByText(LINK_FAILED)).toBeVisible();
  expect({
    closed: await closedPopovers(picker),
    link: await storedData(page, 'link:tok-new'),
  }).toEqual({ closed: [], link: ABSENT });
});

function pc(id: string, name: string, order: number): StoredRecord {
  return record(`sheet:${id}`, { kind: 'pc', name, order });
}

function npc(id: string, name: string, order: number): StoredRecord {
  return record(`sheet:${id}`, { kind: 'npc', name, order });
}

// Drops each LOCAL delta while `window.dropDeltas` is true, so the picker misses one.
const DROP_DELTAS = `
  const Native = window.BroadcastChannel;
  window.BroadcastChannel = class extends Native {
    addEventListener(type, listener, options) {
      const filtered = (event) => {
        const dropped = window.dropDeltas === true && event.data?.data?.t === 'delta';

        if (!dropped) {
          listener.call(this, event);
        }
      };

      super.addEventListener(type, type === 'message' ? filtered : listener, options);
    }
  };
`;

// The picker as Owlbear would load it in the popover the background opened.
async function openPicker(
  context: BrowserContext,
  tokenId: string,
  options: { dropDeltas?: boolean } = {},
): Promise<Page> {
  const picker = await context.newPage();

  if (options.dropDeltas === true) {
    await picker.addInitScript({ content: DROP_DELTAS });
  }

  await picker.goto(`/picker.html?token=${encodeURIComponent(tokenId)}`);
  await expect(picker.locator('main')).toBeVisible();
  await expect(picker.getByText('Загрузка…')).toHaveCount(0);

  return picker;
}

async function waitForMenu(background: Page, ids: readonly string[]): Promise<void> {
  await expect
    .poll(() =>
      background.evaluate(() => window.mockPlatform.contextMenuItems().map((item) => item.id)),
    )
    .toEqual(ids);
}

async function clickMenuItem(background: Page, id: string, tokenId: string): Promise<void> {
  const clicked = await background.evaluate(
    ([item, token]) => window.mockPlatform.clickContextMenuItem(item, [token]),
    [id, tokenId] as const,
  );

  expect(clicked).toBe(true);
}

function openedPopovers(page: Page): Promise<Popover[]> {
  return page.evaluate(() => window.mockPlatform.openedPopovers());
}

function closedPopovers(page: Page): Promise<string[]> {
  return page.evaluate(() => window.mockPlatform.closedPopovers());
}

function headerOf(page: Page): Locator {
  return page.getByRole('tabpanel').locator('header');
}

async function headerStatus(page: Page): Promise<string> {
  await page.getByRole('tab', { name: 'Брок' }).click();

  const status = headerOf(page).getByText(new RegExp(`^(${TOKEN_LINKED}|${NO_TOKEN})$`));

  await expect(status).toBeVisible();

  return status.innerText();
}

function npcBlock(page: Page, name: string): Locator {
  return page
    .getByRole('tabpanel')
    .getByRole('listitem')
    .getByRole('region', { name, exact: true });
}

// Each button's text: the sheet name, and the status when the sheet has a token.
function sheetButtons(scope: Locator): Promise<string[]> {
  return scope.getByRole('button').allTextContents();
}
