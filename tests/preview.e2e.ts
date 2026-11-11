import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { presetFailureMessage } from '@/ui/preset-errors';
import { copy } from '@/ui/copy';

import { listPresetFiles } from '../scripts/preview-plugin';

import { PREVIEW_LAUNCH_FILE } from './support/preview';

// TASK-40: the dev-only preset preview. The e2e dev server lists `PREVIEW_LAUNCH_FILE` first, as
// `bun run preview <path>` would. Every test here rewrites that one file, so they run in order.
test.describe.configure({ mode: 'default' });

const PAGE = '/preview.html';

const D20 = 'tests/fixtures/presets/d20.json';

const D20_TEXT = readFileSync(D20, 'utf8');

// Long enough for a save to reach the page, short of a stuck redraw.
const REDRAW_TIMEOUT_MS = 5_000;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
});

// The d20 fixture with the first section of its sheet set renamed, and with `window` when one is
// given.
function launchText(title: string, window?: { width: number; height: number }): string {
  const preset = JSON.parse(D20_TEXT);

  preset.templates[0].sections[0].title = title;

  const file = window === undefined ? preset : { v: preset.v, window, ...preset };

  return JSON.stringify(file, null, 2);
}

function writeLaunchFile(text: string): void {
  writeFileSync(PREVIEW_LAUNCH_FILE, text);
}

function presetSelect(page: Page): Locator {
  return page.getByLabel('Preset');
}

function frame(page: Page, title: string): Locator {
  return page
    .getByRole('figure', { name: new RegExp(`^${title},`) })
    .locator('[data-preview-frame]');
}

// The frame of the d20 sheet set "Персонажи".
function characterFrame(page: Page): Locator {
  return frame(page, 'Персонажи');
}

// The frame of the d20 single sheet "NPC", which is hidden from players.
function npcFrame(page: Page): Locator {
  return frame(page, 'NPC');
}

function inventoryFrame(page: Page): Locator {
  return frame(page, 'Инвентарь');
}

async function frameSize(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('The frame is not shown');
  }

  return { width: Math.round(box.width), height: Math.round(box.height) };
}

test('lists the launch file first, marked, then the repository presets, and shows the first', async ({
  page,
}) => {
  // #given
  writeLaunchFile(launchText('Launch section'));

  // #when
  await page.goto(PAGE);

  // #then
  const options = presetSelect(page).locator('option');

  // The owner's own `presets/*.json` join the list too, so it is built from the files there.
  const repository = listPresetFiles(process.cwd(), null).map((file) => file.label);

  expect(repository).toContain(D20);

  await expect(options).toHaveText([`${PREVIEW_LAUNCH_FILE} (launch file)`, ...repository]);

  await expect(presetSelect(page)).toHaveValue(PREVIEW_LAUNCH_FILE);
  await expect(characterFrame(page).getByText('Launch section')).toBeVisible();
  // One frame per template in preset order, the hidden "NPC" and "Заметки ГМ" included.
  await expect(page.locator('figcaption')).toHaveText([
    'Персонажи, 600 × 600 px',
    'NPC, 600 × 600 px',
    'Инвентарь, 600 × 600 px',
    'Журнал, 600 × 600 px',
    'Заметки ГМ, 600 × 600 px',
  ]);
  // A sample sheet of a sheet set is named by its name field, which shows its label "Имя". A single
  // sheet is named by its title.
  await expect(characterFrame(page).getByRole('tab', { name: 'Имя' })).toBeVisible();
  await expect(npcFrame(page).getByRole('tab', { name: 'NPC' })).toBeVisible();
  await expect(npcFrame(page).getByRole('heading', { name: 'NPC', level: 1 })).toBeVisible();
  await expect(characterFrame(page).getByText(copy.status.readOnly)).toBeVisible();
  await expect(inventoryFrame(page).getByText(copy.status.canEdit)).toBeVisible();
  await expect(npcFrame(page).getByText(copy.status.readOnly)).toHaveCount(0);
});

test('keeps the chosen file and the switches in the address', async ({ page }) => {
  // #given
  writeLaunchFile(launchText('Launch section'));
  await page.goto(PAGE);

  // #when
  await presetSelect(page).selectOption(D20);
  await page.getByRole('switch', { name: 'Sample values' }).uncheck();
  await page.getByRole('switch', { name: 'Light theme' }).check();
  await page.reload();

  // #then
  const address = new URL(page.url());

  expect(address.searchParams.get('preset')).toBe(D20);
  await expect(presetSelect(page)).toHaveValue(D20);
  await expect(characterFrame(page).getByText('Персонаж')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Sample values' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Light theme' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'LIGHT');
});

test('shows the first file for a key that is not in the list', async ({ page }) => {
  // #given
  writeLaunchFile(launchText('Launch section'));

  // #when
  await page.goto(`${PAGE}?preset=nope`);

  // #then
  await expect(presetSelect(page)).toHaveValue(PREVIEW_LAUNCH_FILE);
  await expect(characterFrame(page).getByText('Launch section')).toBeVisible();
});

test('draws again on each save, shows the upload message for a bad file and recovers', async ({
  page,
}) => {
  // #given
  writeLaunchFile(launchText('Before save'));
  await page.goto(`${PAGE}?theme=light&content=empty`);
  await expect(characterFrame(page).getByText('Before save')).toBeVisible();

  // A reload would drop this mark.
  await page.evaluate(() => {
    document.documentElement.dataset['previewMark'] = 'kept';
  });

  // #when
  writeLaunchFile(launchText('After save'));

  // #then
  await expect(characterFrame(page).getByText('After save')).toBeVisible({
    timeout: REDRAW_TIMEOUT_MS,
  });

  await expect(page.locator('html')).toHaveAttribute('data-preview-mark', 'kept');
  await expect(presetSelect(page)).toHaveValue(PREVIEW_LAUNCH_FILE);
  await expect(page.getByRole('switch', { name: 'Light theme' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Sample values' })).not.toBeChecked();

  // #when
  writeLaunchFile('{ not json');

  // #then
  await expect(page.getByRole('alert')).toHaveText(presetFailureMessage({ code: 'not-json' }), {
    timeout: REDRAW_TIMEOUT_MS,
  });

  await expect(page.locator('[data-preview-frame]')).toHaveCount(0);

  // #when
  writeLaunchFile(launchText('Fixed'));

  // #then
  await expect(characterFrame(page).getByText('Fixed')).toBeVisible({
    timeout: REDRAW_TIMEOUT_MS,
  });

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-preview-mark', 'kept');
});

test('frames every template at the window size of the preset, and at 600 by 600 without one', async ({
  page,
}) => {
  // #given
  writeLaunchFile(launchText('Wide window', { width: 900, height: 700 }));

  // #when
  await page.goto(PAGE);

  // #then
  await expect(characterFrame(page).getByText('Wide window')).toBeVisible();
  expect(await frameSize(characterFrame(page))).toEqual({ width: 900, height: 700 });
  expect(await frameSize(npcFrame(page))).toEqual({ width: 900, height: 700 });
  await expect(page.getByText('Персонажи, 900 × 700 px')).toBeVisible();

  // #when
  await presetSelect(page).selectOption(D20);

  // #then
  await expect(characterFrame(page).getByText('Персонаж')).toBeVisible();
  expect(await frameSize(characterFrame(page))).toEqual({ width: 600, height: 600 });
  expect(await frameSize(npcFrame(page))).toEqual({ width: 600, height: 600 });
});

test('shows two rows per repeat section with sample values, and none when empty', async ({
  page,
}) => {
  // #given
  await page.goto(`${PAGE}?preset=${encodeURIComponent(D20)}`);

  const attackRolls = characterFrame(page).getByRole('button', { name: '1d20+bonus' });

  // #then
  await expect(attackRolls).toHaveCount(2);

  // #when
  await page.getByRole('switch', { name: 'Sample values' }).uncheck();

  // #then
  await expect(attackRolls).toHaveCount(0);
  await expect(characterFrame(page).getByRole('tab', { name: 'Без имени' })).toBeVisible();
});

test('a dice press settles at once and shows no message', async ({ page }) => {
  // #given
  await page.goto(`${PAGE}?preset=${encodeURIComponent(D20)}`);

  const dice = characterFrame(page).getByRole('button', { name: 'Сила' });

  // #when
  await dice.click();

  // #then
  await expect(characterFrame(page).getByText(copy.rolling)).toHaveCount(0);
  await expect(characterFrame(page).getByText(copy.rollFailed)).toHaveCount(0);
  await expect(dice).toBeEnabled();
});
