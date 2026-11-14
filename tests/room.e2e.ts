import { expect, test } from '@playwright/test';
import type { FrameLocator, Locator, Page } from '@playwright/test';

import { ADD } from './support/room';

const PAGE = '/room.html';
const EXAMPLE_PAGE = `${PAGE}?preset=docs/example-preset.json`;
const SHEET_NAME = 'Имя';
const SHEET_NAME_FIELD = 'Имя листа';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test('a first open shows the seeded example sheet in both room windows', async ({ page }) => {
  // #given
  await page.goto(EXAMPLE_PAGE);

  // #when
  // #then
  await expect
    .poll(() => roomVisibility(page))
    .toEqual({ gmAdd: true, gmSheet: true, playerSheet: true });
});

test('a GM edit survives a reload of the room page', async ({ page }) => {
  // #given
  await page.goto(EXAMPLE_PAGE);
  await renameGmSheet(page, 'Reload survivor');
  await expect.poll(() => storedValueExists(page, 'Reload survivor')).toBe(true);

  // #when
  await page.reload();

  // #then
  await expect(gmWindow(page).getByRole('textbox', { name: SHEET_NAME_FIELD })).toHaveValue(
    'Reload survivor',
  );
});

test('Reset removes origin storage and restores the seeded room', async ({ page }) => {
  // #given
  await page.goto(EXAMPLE_PAGE);
  await renameGmSheet(page, 'Remove on reset');
  await page.evaluate(() => localStorage.setItem('room-test-extra', 'remove me'));

  // #when
  await page.getByRole('button', { name: 'Reset' }).click();

  // #then
  await expect
    .poll(async () => ({
      extra: await page.evaluate(() => localStorage.getItem('room-test-extra')),
      gmAdd: await gmWindow(page).getByRole('button', { name: ADD }).isVisible(),
      sheetName: await locatorValue(
        gmWindow(page).getByRole('textbox', { name: SHEET_NAME_FIELD }),
      ),
    }))
    .toEqual({ extra: null, gmAdd: true, sheetName: SHEET_NAME });
});

test('both room windows use the dark theme by default', async ({ page }) => {
  // #given
  await page.goto(EXAMPLE_PAGE);

  // #when
  // #then
  await expect.poll(() => roomThemeModes(page)).toEqual(['DARK', 'DARK']);
});

test('both room windows keep the light theme after Reset', async ({ page }) => {
  // #given
  await page.goto(`${EXAMPLE_PAGE}&theme=light`);
  await expect.poll(() => roomThemeModes(page)).toEqual(['LIGHT', 'LIGHT']);

  // #when
  await page.getByRole('button', { name: 'Reset' }).click();

  // #then
  await expect.poll(() => roomThemeModes(page)).toEqual(['LIGHT', 'LIGHT']);
});

test('an unknown preset key falls back to the first listed preset', async ({ page }) => {
  // #given
  await page.goto(`${PAGE}?preset=nope`);

  // #when
  const preset = page.getByLabel('Preset');

  const firstOptionValue = await preset
    .locator('option')
    .first()
    .evaluate((option) => option.getAttribute('value') ?? '');

  // #then
  await expect(preset).toHaveValue(firstOptionValue);
});

test('a GM edit reaches the player window', async ({ page }) => {
  // #given
  await page.goto(EXAMPLE_PAGE);
  await expect(
    playerWindow(page).getByRole('tab', { name: SHEET_NAME, exact: true }),
  ).toBeVisible();

  // #when
  await renameGmSheet(page, 'Shared with player');

  // #then
  await expect(
    playerWindow(page).getByRole('tab', { name: 'Shared with player', exact: true }),
  ).toBeVisible();
});

function gmWindow(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="GM window"]');
}

function playerWindow(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Player window"]');
}

async function renameGmSheet(page: Page, name: string): Promise<void> {
  const input = gmWindow(page).getByRole('textbox', { name: SHEET_NAME_FIELD });

  await expect(input).toHaveValue(SHEET_NAME);
  await input.fill(name);
  await input.press('Enter');
  await expect(input).toHaveValue(name);
}

async function roomVisibility(page: Page): Promise<{
  gmAdd: boolean;
  gmSheet: boolean;
  playerSheet: boolean;
}> {
  return {
    gmAdd: await gmWindow(page).getByRole('button', { name: ADD }).isVisible(),
    gmSheet: await gmWindow(page).getByRole('tab', { name: SHEET_NAME, exact: true }).isVisible(),
    playerSheet: await playerWindow(page)
      .getByRole('tab', { name: SHEET_NAME, exact: true })
      .isVisible(),
  };
}

async function roomThemeModes(page: Page): Promise<[string | null, string | null]> {
  return Promise.all([frameThemeMode(gmWindow(page)), frameThemeMode(playerWindow(page))]);
}

async function frameThemeMode(frame: FrameLocator): Promise<string | null> {
  const root = frame.locator('html');

  return (await root.count()) === 0 ? null : root.getAttribute('data-theme-mode');
}

async function locatorValue(locator: Locator): Promise<string | null> {
  return (await locator.count()) === 0 ? null : locator.inputValue();
}

async function storedValueExists(page: Page, value: string): Promise<boolean> {
  return page.evaluate(
    (expected) => Object.values(localStorage).some((stored) => stored?.includes(expected) === true),
    value,
  );
}
