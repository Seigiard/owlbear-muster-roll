import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  ADD,
  mapSelection,
  npcBlock,
  openClientBackground,
  openClientWindow,
  openRoom,
  pcSheet,
  putOnScene,
  record,
  seedStorage,
  selectOnMap,
  type ClientParams,
  type StoredRecord,
} from './support/room';

const SELECT_ON_MAP = 'Выделить на карте';

// t-anya and t-anya-far link Аня, and t-anya-far is on another scene. t-brok links Брок, t-vera-far
// links Вера from another scene only. t-s1 and t-s2 link the repeat blocks of the hidden single sheet
// "NPC". "tree" is a scene item with no link.
const ROOM: readonly StoredRecord[] = [
  ...pcSheet('pc0', 'Аня', 0),
  ...pcSheet('pc1', 'Брок', 1),
  ...pcSheet('pc2', 'Вера', 2),
  npcBlock('n1', 'Скелет 1', 0),
  npcBlock('n2', 'Скелет 2', 1),
  record('link:t-anya', { s: 'pc0', c: 'token' }),
  record('link:t-anya-far', { s: 'pc0', c: 'token' }),
  record('link:t-brok', { s: 'pc1', c: 'token' }),
  record('link:t-vera-far', { s: 'pc2', c: 'token' }),
  record('link:t-s1', { s: 'npc', path: ['npc_name', 'n1'], c: 'token' }),
  record('link:t-s2', { s: 'npc', path: ['npc_name', 'n2'], c: 'token' }),
];

const SCENE = ['t-anya', 't-brok', 't-s1', 't-s2', 'tree'];
const GM: ClientParams = { client: 'a', device: 'a' };
const PLAYER: ClientParams = { client: 'p', role: 'PLAYER', player: 'lisa', device: 'p' };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 500 });
});

test('a GM who selects an NPC token on the map sees its tab and repeat block marked, with the open tab kept', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);
  await putOnScene(page, SCENE);
  await expect(page.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
  // #when
  await selectOnMap(page, ['t-s1']);
  // #then
  await expect(page.getByRole('tab', { name: 'NPC, токен выделен' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'NPC, токен выделен' }).click();
  await expect(page.getByRole('group', { name: 'Скелет 1, токен выделен' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Скелет 2' })).toBeVisible();
});

test('several selected tokens mark every target, and a cleared selection clears the marks', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);
  await putOnScene(page, SCENE);
  await selectOnMap(page, ['t-brok', 't-s2', 'tree']);
  await expect(page.getByRole('tab', { name: 'Брок, токен выделен' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'NPC, токен выделен' })).toBeVisible();
  // #when
  await selectOnMap(page, []);
  // #then
  await expect(page.getByRole('tab', { name: 'Брок', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'NPC', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /токен выделен/ })).toHaveCount(0);
});

test('a GM selects the tokens of a sheet on the open scene with one press and deselects them with the next', async ({
  page,
  context,
}) => {
  // #given: "tree" is selected already and stays, and t-anya-far is on another scene.
  await openRoom(page, context, ROOM);
  await putOnScene(page, SCENE);
  await selectOnMap(page, ['tree']);
  const toggle = page.getByRole('button', { name: SELECT_ON_MAP });
  // #when
  await toggle.click();
  // #then
  await expect.poll(() => mapSelection(page)).toEqual(['t-anya', 'tree']);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('tab', { name: 'Аня, токен выделен' })).toBeVisible();
  // #when
  await toggle.click();
  // #then
  await expect.poll(() => mapSelection(page)).toEqual(['tree']);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('a refused selection change leaves the map selection and the toggle as they were', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);
  await putOnScene(page, SCENE);
  await page.evaluate(() => {
    window.mockPlatform.failNextSelectionWrite();
  });
  const toggle = page.getByRole('button', { name: SELECT_ON_MAP });

  const refused = page.waitForEvent('console', (message) =>
    message.text().includes('could not change the map selection'),
  );

  // #when
  await toggle.click();
  await refused;
  // #then: the next press works again.
  expect({
    selection: await mapSelection(page),
    pressed: await toggle.getAttribute('aria-pressed'),
  }).toEqual({
    selection: [],
    pressed: 'false',
  });
  await toggle.click();
  await expect.poll(() => mapSelection(page)).toEqual(['t-anya']);
});

test('a GM selects the token of one repeat block from the keyboard', async ({ page, context }) => {
  // #given
  await openRoom(page, context, ROOM);
  await putOnScene(page, SCENE);
  await selectOnMap(page, ['t-s1']);
  await page.getByRole('tab', { name: 'NPC, токен выделен' }).click();
  // #when
  await page.getByRole('button', { name: 'Выделить блок 2 на карте' }).focus();
  await page.keyboard.press('Enter');
  // #then
  await expect.poll(() => mapSelection(page)).toEqual(['t-s1', 't-s2']);
  await expect(page.getByRole('group', { name: 'Скелет 2, токен выделен' })).toBeVisible();
});

test('a sheet whose linked tokens are all on another scene offers no selection', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);
  await putOnScene(page, SCENE);
  await page.getByRole('tab', { name: 'Брок' }).click();
  await expect(page.getByRole('button', { name: SELECT_ON_MAP })).toBeVisible();
  // #when
  await page.getByRole('tab', { name: 'Вера' }).click();
  // #then: the token status still says it is linked.
  await expect(page.getByRole('img', { name: 'Токен привязан' })).toBeVisible();
  await expect(page.getByRole('button', { name: SELECT_ON_MAP })).toHaveCount(0);
});

test('a player sees marks for their own selection on visible sheets only, and no selection command', async ({
  context,
}) => {
  // #given
  const gmWindow = await openClientWindow(context, GM);
  await seedStorage(gmWindow, ROOM, undefined, GM.device);
  await openClientBackground(context, GM);
  await expect(gmWindow.getByRole('button', { name: ADD })).toBeVisible();
  await putOnScene(gmWindow, SCENE);
  const sheets = await openClientWindow(context, PLAYER);
  await openClientBackground(context, PLAYER);
  await expect(sheets.getByRole('tab', { name: 'Аня' })).toHaveAttribute('aria-selected', 'true');
  // #when
  await selectOnMap(sheets, ['t-brok', 't-s1']);
  // #then: the GM's own selection stays empty, and the hidden NPC tab never shows.
  await expect(sheets.getByRole('tab', { name: 'Брок, токен выделен' })).toBeVisible();
  await expect(sheets.getByRole('tab', { name: /токен выделен/ })).toHaveCount(1);
  await expect(gmWindow.getByRole('tab', { name: /токен выделен/ })).toHaveCount(0);
  await expectNoSelectCommand(sheets);
});

test("a player's own sheet keeps «вы» in its name when its token is selected", async ({
  context,
}) => {
  // #given: lisa owns Аня.
  const gmWindow = await openClientWindow(context, GM);
  await seedStorage(
    gmWindow,
    [...ROOM, record('plink:pc0:lisa', { name: 'Лиза' })],
    undefined,
    GM.device,
  );
  await openClientBackground(context, GM);
  await expect(gmWindow.getByRole('button', { name: ADD })).toBeVisible();
  await putOnScene(gmWindow, SCENE);
  const sheets = await openClientWindow(context, PLAYER);
  await openClientBackground(context, PLAYER);
  await expect(sheets.getByRole('tab', { name: 'Аня, вы' })).toBeVisible();
  // #when
  await selectOnMap(sheets, ['t-anya']);
  // #then
  await expect(sheets.getByRole('tab', { name: 'Аня, вы, токен выделен' })).toBeVisible();
});

async function expectNoSelectCommand(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Брок, токен выделен' }).click();
  await expect(page.getByRole('button', { name: /Выделить/ })).toHaveCount(0);
}
