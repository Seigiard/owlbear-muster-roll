import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
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

const GM: ClientParams = { client: 'gm', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'player',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'player',
};

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
                    { kind: 'text', text: 'STR' },
                    { kind: 'field', type: 'number', id: 'str', name: 'STR, максимум' },
                  ],
                },
                {
                  cells: [
                    { kind: 'text', text: 'DEX' },
                    { kind: 'field', type: 'number', id: 'dex' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'check', id: 'ready', name: 'Готовность' }] },
                {
                  cells: [
                    { kind: 'dice', formula: '1d20 <= str', name: 'Спасбросок STR' },
                    { kind: 'dice', formula: '1d20 <= dex' },
                  ],
                },
                { cells: [{ kind: 'dice', formula: '1d1', name: 'Монета' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
});

const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  record('blk:brok', { str: 12 }),
  record('blk:brok', { dex: 10 }),
];

const CAIRN_TEXT = readFileSync('presets/cairn-2e.json', 'utf8');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a named writer field shows one non-overlapping tooltip on Tab, hover and pointer focus', async ({
  context,
}) => {
  // #given
  const gm = await openSeededGm(context, cairnRecords(), CAIRN_TEXT);
  const panel = gm.window.getByRole('tabpanel');
  const current = panel.getByRole('textbox', { name: 'STR', exact: true }).first();
  const field = panel.getByRole('textbox', { name: 'STR, максимум', exact: true });
  await expect(field).toBeVisible();
  await current.focus();
  // #when
  await gm.window.keyboard.press('Tab');
  // #then
  await expect(field).toBeFocused();
  await expect(tooltip(gm.window, 'STR, максимум')).toBeVisible();
  expect(await boxesOverlap(field, tooltip(gm.window, 'STR, максимум'))).toBe(false);
  await expect(field).not.toHaveAttribute('aria-describedby', /.+/);
  // #when
  await gm.window.keyboard.press('Escape');
  // #then
  await expect(tooltip(gm.window, 'STR, максимум')).toHaveCount(0);
  // #when
  await current.focus();
  await field.hover();
  // #then
  await expect(tooltip(gm.window, 'STR, максимум')).toBeVisible();
  expect(await boxesOverlap(field, tooltip(gm.window, 'STR, максимум'))).toBe(false);
  // #when
  await gm.window.mouse.move(0, 0);
  await current.focus();
  await field.click();
  // #then
  await expect(field).toBeFocused();
  await expect(tooltip(gm.window, 'STR, максимум')).toBeVisible();
});

test('a focused named writer keeps its tooltip when the mouse pointer leaves', async ({
  context,
}) => {
  // #given
  const gm = await openSeededGm(context, cairnRecords(), CAIRN_TEXT);

  const field = gm.window
    .getByRole('tabpanel')
    .getByRole('textbox', { name: 'STR, максимум', exact: true });

  await field.click();
  await expect(field).toBeFocused();
  await expect(tooltip(gm.window, 'STR, максимум')).toBeVisible();
  // #when
  await gm.window.mouse.move(0, 0);
  // #then
  await expect(field).toBeFocused();
  await expect(tooltip(gm.window, 'STR, максимум')).toBeVisible();
});

test('Escape closes a named writer tooltip opened by hover', async ({ context }) => {
  // #given
  const gm = await openSeededGm(context, cairnRecords(), CAIRN_TEXT);
  const panel = gm.window.getByRole('tabpanel');
  const current = panel.getByRole('textbox', { name: 'STR', exact: true }).first();
  const field = panel.getByRole('textbox', { name: 'STR, максимум', exact: true });
  await current.focus();
  await field.hover();
  await expect(tooltip(gm.window, 'STR, максимум')).toBeVisible();
  // #when
  await gm.window.keyboard.press('Escape');
  // #then
  await expect(tooltip(gm.window, 'STR, максимум')).toHaveCount(0);
});

test('an unnamed writer field and dice cell keep their labels and show no tooltip', async ({
  context,
}) => {
  // #given
  const gm = await openSeededGm(context, cairnRecords(), CAIRN_TEXT);
  const panel = gm.window.getByRole('tabpanel');
  const field = panel.getByRole('textbox', { name: 'Имя', exact: true });
  const dice = panel.getByRole('button', { name: 'STR', exact: true });
  // #when
  await field.focus();
  await field.hover();
  await gm.window.waitForTimeout(600);
  // #then
  await expect(gm.window.getByRole('tooltip')).toHaveCount(0);
  await expect(dice).toHaveText('STR');
});

test('a named dice cell keeps its formula visible but uses its name for the button', async ({
  context,
}) => {
  // #given
  const gm = await openSeededGm(context, RECORDS, PRESET_TEXT);

  // #when
  const button = gm.window
    .getByRole('tabpanel')
    .getByRole('button', { name: 'Спасбросок STR', exact: true });

  // #then
  await expect(button).toHaveText('1d20 <= str');
});

test('a named read-only value is a tab stop with one tooltip, while an unnamed value is not', async ({
  context,
}) => {
  // #given
  await openSeededGm(context, cairnRecords(), CAIRN_TEXT);
  const player = await openClient(context, PLAYER);
  const panel = player.window.getByRole('tabpanel');
  const named = panel.getByRole('status', { name: 'STR, максимум', exact: true });
  const unnamed = panel.getByRole('status', { name: 'Имя', exact: true });
  await expect(named).toBeVisible();
  // #when
  await named.focus();
  // #then
  await expect(named).toHaveAttribute('tabindex', '0');
  await expect(named).toBeFocused();
  await expect(tooltip(player.window, 'STR, максимум')).toBeVisible();
  expect(await boxesOverlap(named, tooltip(player.window, 'STR, максимум'))).toBe(false);
  await expect(named).not.toHaveAttribute('aria-describedby', /.+/);
  await expect(unnamed).not.toHaveAttribute('tabindex', /.+/);
  // #when
  await player.window.keyboard.press('Escape');
  await unnamed.hover();
  await player.window.waitForTimeout(600);
  // #then
  await expect(player.window.getByRole('tooltip')).toHaveCount(0);
});

test('the tooltip geometry assertion distinguishes overlap, separation and a missing box', async ({
  page,
}) => {
  // #given
  await page.setContent(`
    <div id="first" style="position: fixed; left: 0; top: 0; width: 20px; height: 20px"></div>
    <div id="overlap" style="position: fixed; left: 10px; top: 10px; width: 20px; height: 20px"></div>
    <div id="apart" style="position: fixed; left: 30px; top: 30px; width: 20px; height: 20px"></div>
    <div id="hidden" style="display: none"></div>
  `);

  // #when
  const control = {
    overlapping: await boxesOverlap(page.locator('#first'), page.locator('#overlap')),
    apart: await boxesOverlap(page.locator('#first'), page.locator('#apart')),
  };

  let missing = '';

  try {
    await boxesOverlap(page.locator('#first'), page.locator('#hidden'));
  } catch (error) {
    missing = error instanceof Error ? error.message : String(error);
  }

  // #then
  expect({ ...control, missing }).toEqual({
    overlapping: true,
    apart: false,
    missing: 'both elements need boxes',
  });
});

test.describe('touch tooltip', () => {
  test.use({ hasTouch: true });
  test('a tap leaves a named writer tooltip open after the tap ends', async ({ context }) => {
    // #given
    const gm = await openSeededGm(context, cairnRecords(), CAIRN_TEXT);

    const field = gm.window
      .getByRole('tabpanel')
      .getByRole('textbox', { name: 'STR, максимум', exact: true });

    // #when
    await field.tap();
    // #then
    await expect(field).toBeFocused();
    expect(await tooltip(gm.window, 'STR, максимум').isVisible()).toBe(true);
  });
  test('a no-focus touch tap keeps a named checkbox tooltip open after the pointer leaves', async ({
    context,
  }) => {
    // #given
    const gm = await openSeededGm(context, RECORDS, PRESET_TEXT);

    const checkbox = gm.window
      .getByRole('tabpanel')
      .getByRole('checkbox', { name: 'Готовность', exact: true });

    const touchPointer = { pointerId: 1, pointerType: 'touch', isPrimary: true };
    // #when
    await checkbox.dispatchEvent('pointerover', touchPointer);
    await checkbox.dispatchEvent('pointerdown', { ...touchPointer, button: 0, buttons: 1 });
    await gm.window.waitForTimeout(50);
    const openOnPointerDown = await tooltip(gm.window, 'Готовность').isVisible();
    await checkbox.dispatchEvent('pointerup', { ...touchPointer, button: 0, buttons: 0 });
    await checkbox.dispatchEvent('pointerout', touchPointer);
    await gm.window.waitForTimeout(300);
    // #then
    expect({
      focused: await checkbox.evaluate((element) => element === document.activeElement),
      openOnPointerDown,
      openAfterPointerLeave: await tooltip(gm.window, 'Готовность').isVisible(),
    }).toEqual({
      focused: false,
      openOnPointerDown: true,
      openAfterPointerLeave: true,
    });
  });
  test('a no-focus touch tap opens a named dice tooltip and still rolls', async ({ context }) => {
    // #given
    const gm = await openSeededGm(context, RECORDS, PRESET_TEXT);

    const button = gm.window
      .getByRole('tabpanel')
      .getByRole('button', { name: 'Монета', exact: true });

    const touchPointer = { pointerId: 1, pointerType: 'touch', isPrimary: true };
    // #when
    await button.dispatchEvent('pointerover', touchPointer);
    await button.dispatchEvent('pointerdown', { ...touchPointer, button: 0, buttons: 1 });
    const openOnPointerDown = await tooltip(gm.window, 'Монета').isVisible();
    await button.dispatchEvent('pointerup', { ...touchPointer, button: 0, buttons: 0 });
    await button.dispatchEvent('pointerout', touchPointer);
    await button.dispatchEvent('click', { button: 0 });
    // #then
    await expect
      .poll(async () => ({
        focused: await button.evaluate((element) => element === document.activeElement),
        notifications: await shownNotifications(gm),
        openOnPointerDown,
        openAfterPointerLeave: await tooltip(gm.window, 'Монета').isVisible(),
      }))
      .toEqual({
        focused: false,
        notifications: ['Мастер: Брок, Монета — 1'],
        openOnPointerDown: true,
        openAfterPointerLeave: true,
      });
  });
  test('a named checkbox tooltip closes on Escape, blur and an outside pointerdown', async ({
    context,
  }) => {
    // #given
    const gm = await openSeededGm(context, RECORDS, PRESET_TEXT);
    const panel = gm.window.getByRole('tabpanel');
    const checkbox = panel.getByRole('checkbox', { name: 'Готовность', exact: true });
    const outside = panel.getByRole('textbox', { name: 'Имя', exact: true });
    // #when
    await checkbox.focus();
    await gm.window.keyboard.press('Escape');
    const closedOnEscape = (await tooltip(gm.window, 'Готовность').count()) === 0;
    await checkbox.focus();
    await outside.focus();
    const closedOnBlur = (await tooltip(gm.window, 'Готовность').count()) === 0;
    await checkbox.focus();
    await outside.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
    const closedOnOutsidePointerDown = (await tooltip(gm.window, 'Готовность').count()) === 0;
    // #then
    expect({ closedOnEscape, closedOnBlur, closedOnOutsidePointerDown }).toEqual({
      closedOnEscape: true,
      closedOnBlur: true,
      closedOnOutsidePointerDown: true,
    });
  });
});

async function openSeededGm(
  context: BrowserContext,
  records: readonly StoredRecord[],
  presetText: string,
): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);
  await seedStorage(window, records, presetText);
  const background = await openClientBackground(context, GM);

  return { window, background, connectionId: connectionIdOf(GM) };
}

function cairnRecords(): StoredRecord[] {
  return [...pcSheet('brok', 'Брок', 0), record('blk:brok', { str: 12, str_max: 18 })];
}

async function openClient(context: BrowserContext, params: ClientParams): Promise<RoomClient> {
  const window = await openClientWindow(context, params);
  const background = await openClientBackground(context, params);

  return { window, background, connectionId: connectionIdOf(params) };
}

function tooltip(page: Page, text: string): Locator {
  return page.getByRole('tooltip').filter({ hasText: text });
}

async function boxesOverlap(first: Locator, second: Locator): Promise<boolean> {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();

  if (firstBox === null || secondBox === null) {
    throw new Error('both elements need boxes');
  }

  return !(
    firstBox.x + firstBox.width <= secondBox.x ||
    secondBox.x + secondBox.width <= firstBox.x ||
    firstBox.y + firstBox.height <= secondBox.y ||
    secondBox.y + secondBox.height <= firstBox.y
  );
}

async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}
