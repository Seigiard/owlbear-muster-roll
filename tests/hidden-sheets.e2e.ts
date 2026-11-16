import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { ContextMenuIconFilter } from '@/platform/ports';
import {
  ADD,
  clientQuery,
  connectionIdOf,
  EXAMPLE_PRESET_TEXT,
  npcBlock,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  seedStorage,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const OPEN_ITEM = 'app.muster-roll/open-sheet';
const SHEET_NAME = 'Имя листа';
const UNNAMED = 'Без имени';

// The GM's background runs a fake dice extension whose every die shows 5, so each roll has one
// known result.
const GM: ClientParams = { client: 'a', device: 'a', name: 'Мастер', diceFaces: [5] };
const SECOND_GM: ClientParams = { client: 'b', device: 'b', name: 'Второй' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  name: 'Лиза',
};

// The example preset: the sheet set "Персонажи", the hidden single sheet "NPC" whose NPCs are
// repeat blocks of "Противники", and the visible single sheet "Инвентарь". Лиза may edit "Аня".
// t-anya links Аня's sheet, t-gob the NPC "Гоблин".
const ROOM: readonly StoredRecord[] = [
  ...pcSheet('anya', 'Аня', 0),
  record('acl:anya:lisa', { name: 'Лиза' }),
  npcBlock('gob', 'Гоблин', 0, { str: 3 }),
  record('link:t-anya', { s: 'anya' }),
  record('link:t-gob', { s: 'npc', i: 'gob' }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a player has no tab of the hidden NPC sheet and sees none of its NPCs', async ({
  context,
}) => {
  // #given
  await openGm(context, ROOM);
  // #when
  const player = await openPlayer(context);
  // #then
  await expect(player.window.getByRole('tab')).toHaveText(['Аня', 'Инвентарь']);
  await expect(player.window.getByText('Гоблин')).toHaveCount(0);
});

test('a player gets "Открыть лист" on a character token and none on an NPC token', async ({
  context,
}) => {
  // #given
  await openGm(context, ROOM);
  // #when
  const player = await openPlayer(context);
  // #then: the player icon names Аня's token only, and the GM icon is Owlbear's to hide.
  await expect
    .poll(() => openIconTokens(player.background))
    .toEqual([
      { roles: ['GM'], ids: ['t-anya', 't-gob'] },
      { roles: ['PLAYER'], ids: ['t-anya'] },
    ]);
});

test('a GM roll on the hidden NPC sheet shows on GM clients only', async ({ context }) => {
  // #given
  const gm = await openGm(context, ROOM);
  const player = await openPlayer(context);
  await expect(player.window.getByRole('tab', { name: 'Аня' })).toBeVisible();
  await gm.window.getByRole('tab', { name: 'NPC' }).click();
  // #when: the hidden roll goes first, so the visible one after it proves it had its turn.
  await npcRow(gm.window, 'Гоблин').getByRole('button', { name: 'Сила', exact: true }).click();
  await expect.poll(() => shownNotifications(gm)).toEqual(['Мастер: NPC, Сила — 5, провал']);
  await gm.window.getByRole('tab', { name: 'Аня' }).click();
  await diceButton(gm.window, 'Удача').click();
  // #then: 5 + 5 + 1 for "Удача".
  await expect.poll(() => shownNotifications(player)).toEqual(['Мастер: Аня, Удача — 11']);
  expect(await shownNotifications(gm)).toEqual([
    'Мастер: NPC, Сила — 5, провал',
    'Мастер: Аня, Удача — 11',
  ]);
});

test('a GM rename in the header shows in the tab, header and link picker of every client', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, ROOM);
  const second = await openSecondGm(context);
  const player = await openPlayer(context);
  await expect(player.window.getByRole('tab', { name: 'Аня' })).toBeVisible();
  // #when
  await nameInput(gm.window).fill('Аня Смелая');
  await nameInput(gm.window).press('Enter');
  // #then
  await expectNamed(second, player, 'Аня Смелая');
});

test('a player with write access renames the sheet in its header, and every client shows it', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, ROOM);
  const second = await openSecondGm(context);
  const player = await openPlayer(context);
  await expect(nameInput(player.window)).toHaveValue('Аня');
  // #when
  await nameInput(player.window).fill('Аня Храбрая');
  await nameInput(player.window).press('Enter');
  // #then
  await expect(gm.window.getByRole('tab', { name: 'Аня Храбрая' })).toBeVisible();
  await expect(nameInput(gm.window)).toHaveValue('Аня Храбрая');
  await expectNamed(second, null, 'Аня Храбрая');
});

test('an edit of the name field in the sheet renames the tab and header too', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, ROOM);
  const player = await openPlayer(context);
  await expect(player.window.getByRole('tab', { name: 'Аня' })).toBeVisible();
  // #when: "Имя" is the name field in the preset's "Персонаж" section.
  const field = gm.window.getByRole('tabpanel').getByRole('textbox', { name: 'Имя', exact: true });
  await field.fill('Аня Тихая');
  await field.press('Enter');
  // #then
  await expect(nameInput(gm.window)).toHaveValue('Аня Тихая');
  await expect(player.window.getByRole('tab', { name: 'Аня Тихая' })).toBeVisible();
  await expect(nameInput(player.window)).toHaveValue('Аня Тихая');
});

test(`a sheet with an empty name shows "${UNNAMED}" in its tab, header, picker and roll`, async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, [...pcSheet('blank', '', 0)]);
  const player = await openPlayer(context);
  // #when
  const picker = await openPicker(context, 'tok-new', GM);
  // #then
  await diceButton(gm.window, 'Удача').click();
  await expect.poll(() => shownNotifications(player)).toEqual([`Мастер: ${UNNAMED}, Удача — 11`]);
  expect({
    gmTab: await gm.window.getByRole('tab', { selected: true }).innerText(),
    gmName: await nameInput(gm.window).getAttribute('placeholder'),
    playerTab: await player.window.getByRole('tab', { selected: true }).innerText(),
    playerHeader: await player.window
      .getByRole('tabpanel')
      .getByRole('heading', { level: 1 })
      .innerText(),
    picker: await picker.getByRole('region', { name: 'Персонажи' }).getByRole('button').innerText(),
  }).toEqual({
    gmTab: UNNAMED,
    gmName: UNNAMED,
    playerTab: UNNAMED,
    playerHeader: UNNAMED,
    picker: UNNAMED,
  });
});

// A live GM whose device holds the example preset and `records`.
async function openGm(
  context: BrowserContext,
  records: readonly StoredRecord[],
): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);
  await seedStorage(window, records, EXAMPLE_PRESET_TEXT, GM.device);
  const background = await openClientBackground(context, GM);
  await expect(window.getByRole('button', { name: ADD })).toBeVisible();

  return { window, background, connectionId: connectionIdOf(GM) };
}

// A second GM on its own device, which gets the room from the first one.
async function openSecondGm(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, SECOND_GM);
  const background = await openClientBackground(context, SECOND_GM);
  await expect(window.getByRole('tab', { name: 'Аня' })).toBeVisible();

  return { window, background, connectionId: connectionIdOf(SECOND_GM) };
}

async function openPlayer(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);

  return { window, background, connectionId: connectionIdOf(PLAYER) };
}

// The second GM shows the name in its tab, its header and its link picker, and the player, when
// given, in its tab and its header.
async function expectNamed(
  second: RoomClient,
  player: RoomClient | null,
  name: string,
): Promise<void> {
  await expect(second.window.getByRole('tab', { name })).toBeVisible();
  await expect(nameInput(second.window)).toHaveValue(name);
  const picker = await openPicker(second.window.context(), 'tok-new', SECOND_GM);
  await expect(
    picker.getByRole('region', { name: 'Персонажи' }).getByRole('button', { name }),
  ).toBeVisible();

  if (player !== null) {
    await expect(player.window.getByRole('tab', { name })).toBeVisible();
    await expect(nameInput(player.window)).toHaveValue(name);
  }
}

// The picker as Owlbear would load it in the popover a client's background opened.
async function openPicker(
  context: BrowserContext,
  tokenId: string,
  client: ClientParams,
): Promise<Page> {
  const picker = await context.newPage();
  const query = new URLSearchParams(clientQuery(client));
  query.set('token', tokenId);
  await picker.goto(`/picker.html?${query.toString()}`);
  await expect(picker.locator('main')).toBeVisible();
  await expect(picker.getByText('Загрузка…')).toHaveCount(0);

  return picker;
}

// The header's name: an input for anyone who may edit the sheet.
function nameInput(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: SHEET_NAME });
}

function diceButton(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('button', { name, exact: true });
}

// An NPC repeat block is a group named by its first field.
function npcRow(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('group', { name, exact: true });
}

// The background shows every roll, so its notifications are the client's.
async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

// The roles and token ids of each icon of "Открыть лист". The mock does not apply filters, so a
// test reads them as data.
function openIconTokens(background: Page): Promise<
  {
    roles: ContextMenuIconFilter['roles'];
    ids: unknown[] | undefined;
  }[]
> {
  return background.evaluate(
    (id) =>
      window.mockPlatform
        .contextMenuItems()
        .find((item) => item.id === id)
        ?.icons.map((icon) => ({
          roles: icon.filter?.roles,
          ids: icon.filter?.some?.map((filter) => filter.value),
        })) ?? [],
    OPEN_ITEM,
  );
}
