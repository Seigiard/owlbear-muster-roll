import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { cssValue, LIGHT_THEME, renderedColor, setTheme, tokenColor } from './support/colors';
import type { Rgb } from './support/colors';

const DARK_TOKENS: ReadonlyMap<string, Rgb> = new Map<string, Rgb>([
  ['--color-surface', [51, 51, 51]],
  ['--color-surface-bar', [42, 42, 42]],
  ['--color-surface-tab', [68, 68, 68]],
  ['--color-surface-stripe', [50, 50, 50]],
  ['--color-line', [85, 85, 85]],
  ['--color-line-strong', [136, 136, 136]],
  ['--color-focus', [217, 179, 108]],
  ['--color-text', [221, 221, 221]],
  ['--color-text-muted', [170, 170, 170]],
  ['--color-accent', [217, 179, 108]],
  ['--color-accent-contrast', [34, 34, 34]],
]);

const LIGHT_TOKENS: ReadonlyMap<string, Rgb> = new Map<string, Rgb>([
  ['--color-surface', [250, 250, 250]],
  ['--color-surface-bar', [200, 200, 200]],
  ['--color-surface-tab', [226, 226, 226]],
  ['--color-surface-stripe', [246, 246, 246]],
  ['--color-line', [202, 202, 202]],
  ['--color-line-strong', [130, 130, 130]],
  ['--color-focus', [0, 85, 170]],
  ['--color-text', [10, 10, 10]],
  ['--color-text-muted', [85, 85, 85]],
  ['--color-accent', [0, 85, 170]],
  ['--color-accent-contrast', [255, 255, 255]],
]);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('the dark theme gives every mapped token its DESIGN.md color', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  const colors = await tokenColors(page, [...DARK_TOKENS.keys()]);

  // #then
  expect(colors).toEqual(new Map(DARK_TOKENS));
});

test('a theme change updates every mapped token', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  await setTheme(page, LIGHT_THEME);

  // #then
  expect(await tokenColors(page, [...LIGHT_TOKENS.keys()])).toEqual(new Map(LIGHT_TOKENS));
});

test('a theme change does not reload the window', async ({ page }) => {
  // #given
  await openWindow(page);
  await page.getByRole('tab', { name: 'Настройки' }).click();

  // #when
  await setTheme(page, LIGHT_THEME);

  // #then
  await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('the shell shows the NPC tab, the gear and the loading text', async ({ page }) => {
  // #when
  await openWindow(page);

  // #then
  await expect(page.getByRole('tab')).toHaveText(['NPC', '⚙︎']);
  await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveCount(1);
  await expect(page.getByRole('tabpanel')).toHaveText('Загрузка…');
});

test('the window has no visible banner while nothing is wrong', async ({ page }) => {
  // #when
  await openWindow(page);

  // #then
  await expect(page.getByRole('status')).toBeEmpty();
  await expect(page.getByRole('status')).toHaveJSProperty('offsetHeight', 0);
});

test('the shell uses the DESIGN.md radii and content padding', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  const layout = await Promise.all([
    cssValue(page.locator('#root > main'), 'border-top-left-radius'),
    cssValue(page.getByRole('tab', { name: 'NPC' }), 'border-top-left-radius'),
    cssValue(page.getByRole('tab', { name: 'NPC' }), 'border-bottom-left-radius'),
    cssValue(page.getByRole('tabpanel'), 'padding-top'),
    gapBetween(
      page.getByRole('tab', { name: 'NPC' }),
      page.getByRole('tab', { name: 'Настройки' }),
    ),
  ]);

  // #then
  expect(layout).toEqual(['8px', '6px', '0px', '12px', '8px']);
});

test('the window uses the system font', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  const fontFamily = await cssValue(page.locator('#root > main'), 'font-family');

  // #then
  expect(fontFamily).toBe('system-ui, sans-serif');
});

test('the content area is the only part of the window that scrolls', async ({ page }) => {
  // #given
  await openWindow(page);

  const panel = page.getByRole('tabpanel');

  // #when
  await panel.evaluate((element) => {
    const tall = document.createElement('div');

    tall.style.height = '2000px';
    element.append(tall);
  });

  // #then
  expect(
    await panel.evaluate((element) => ({
      contentScrolls: element.scrollHeight > element.clientHeight,
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
    })),
  ).toEqual({ contentScrolls: true, pageScrolls: false });
});

test('the selected tab takes the active colors and joins the content area', async ({ page }) => {
  // #given
  await openWindow(page);

  const tab = page.getByRole('tab', { name: 'NPC' });

  // #when
  const active = [await renderedColor(tab, 'background-color'), await renderedColor(tab, 'color')];

  // #then
  expect(active).toEqual([
    [51, 51, 51],
    [217, 179, 108],
  ]);
});

test('an unselected tab takes the tab colors', async ({ page }) => {
  // #given
  await openWindow(page);

  const gear = page.getByRole('tab', { name: 'Настройки' });

  // #when
  const inactive = [
    await renderedColor(gear, 'background-color'),
    await renderedColor(gear, 'color'),
  ];

  // #then
  expect(inactive).toEqual([
    [68, 68, 68],
    [221, 221, 221],
  ]);
});

test('arrow keys move the selection between tabs', async ({ page }) => {
  // #given
  await openWindow(page);
  await page.getByRole('tab', { name: 'NPC' }).click();

  // #when
  await page.keyboard.press('ArrowRight');

  // #then
  await expect(page.getByRole('tab', { name: 'Настройки' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a failed theme read still renders the window and logs the error', async ({ page }) => {
  // #given
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      // Chromium appends the stack, which differs per build, to the logged Error.
      errors.push(message.text().split('\n')[0] ?? '');
    }
  });

  // #when
  await page.goto('/index.html?mock-theme-read-fails');

  // #then
  await expect(page.getByRole('tabpanel')).toHaveText('Загрузка…');
  expect(errors).toEqual([
    'Muster Roll could not read the Owlbear theme Error: mock theme read failed',
  ]);
});

test('a failed theme read keeps the outline on a focused tab and an opaque window', async ({
  page,
}) => {
  // #given
  await page.goto('/index.html?mock-theme-read-fails');
  await expect(page.getByRole('tabpanel')).toBeVisible();

  const tab = page.getByRole('tab', { name: 'NPC' });

  // #when
  await page.keyboard.press('Tab');

  // #then
  expect({
    focused: await tab.evaluate((element) => element === document.activeElement),
    style: await cssValue(tab, 'outline-style'),
    width: await cssValue(tab, 'outline-width'),
    background: await cssValue(page.locator('#root > main'), 'background-color'),
  }).toEqual({
    focused: true,
    style: 'solid',
    width: '2px',
    background: 'rgb(255, 255, 255)',
  });
});

test('color-scheme follows the theme on main and leaves the iframe root alone', async ({
  page,
}) => {
  // #given
  await openWindow(page);

  const main = page.locator('#root > main');
  const dark = await cssValue(main, 'color-scheme');

  // #when
  await setTheme(page, LIGHT_THEME);

  // #then
  expect([
    dark,
    await cssValue(main, 'color-scheme'),
    await cssValue(page.locator('html'), 'color-scheme'),
  ]).toEqual(['dark', 'light', 'normal']);
});

test('a focused tab shows a 2 px solid outline in the focus color', async ({ page }) => {
  // #given
  await openWindow(page);

  const tab = page.getByRole('tab', { name: 'NPC' });

  // #when
  await page.keyboard.press('Tab');

  // #then
  expect({
    focused: await tab.evaluate((element) => element === document.activeElement),
    style: await cssValue(tab, 'outline-style'),
    width: await cssValue(tab, 'outline-width'),
    color: await renderedColor(tab, 'outline-color'),
  }).toEqual({ focused: true, style: 'solid', width: '2px', color: [217, 179, 108] });
});

test('a tab is at least 32 px high', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  const box = await page.getByRole('tab', { name: 'NPC' }).boundingBox();

  // #then
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
});

test('the window text is 14 px', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  const fontSize = await cssValue(page.locator('#root > main'), 'font-size');

  // #then
  expect(fontSize).toBe('14px');
});

test('the theme mode is on the root element when main is first inserted', async ({ page }) => {
  // #given
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('#root > main') === null) {
        return;
      }

      const root = document.documentElement;

      root.setAttribute('data-mode-at-first-main', root.dataset['themeMode'] ?? 'unset');
      observer.disconnect();
    });

    observer.observe(document, { childList: true, subtree: true });
  });

  // #when
  await page.goto('/index.html?mock-theme-read-slow');
  await expect(page.getByRole('tabpanel')).toBeVisible();

  // #then
  await expect(page.locator('html')).toHaveAttribute('data-mode-at-first-main', 'DARK');
});

async function gapBetween(left: Locator, right: Locator): Promise<string> {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);

  return `${(rightBox?.x ?? 0) - ((leftBox?.x ?? 0) + (leftBox?.width ?? 0))}px`;
}

async function openWindow(page: Page): Promise<void> {
  await page.goto('/index.html');
  await expect(page.getByRole('tabpanel')).toBeVisible();
}

async function tokenColors(page: Page, tokens: string[]): Promise<Map<string, Rgb>> {
  const colors = await Promise.all(tokens.map((token) => tokenColor(page, token)));

  return new Map(tokens.map((token, index) => [token, colors[index] ?? [0, 0, 0]]));
}
