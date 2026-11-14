import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  contrastRatio,
  cssValue,
  layeredColor,
  LIGHT_THEME,
  renderedColor,
  setTheme,
  tokenColor,
} from './support/colors';
import type { Rgb } from './support/colors';
import { openRoom } from './support/room';

// Each mapped token over the window surface, with the live Owlbear themes.
const DARK_TOKENS: ReadonlyMap<string, Rgb> = new Map<string, Rgb>([
  ['--color-surface', [34, 38, 57]],
  ['--color-surface-bar', [30, 34, 49]],
  ['--color-surface-raised', [47, 51, 69]],
  ['--color-surface-tab', [56, 60, 77]],
  ['--color-surface-stripe', [56, 59, 76]],
  ['--color-line', [78, 81, 97]],
  ['--color-line-strong', [145, 147, 156]],
  ['--color-focus', [187, 153, 255]],
  ['--color-text', [255, 255, 255]],
  ['--color-text-muted', [189, 190, 196]],
  ['--color-accent', [187, 153, 255]],
  ['--color-accent-ink', [211, 189, 255]],
  ['--color-accent-contrast', [4, 5, 7]],
]);

const LIGHT_TOKENS: ReadonlyMap<string, Rgb> = new Map<string, Rgb>([
  ['--color-surface', [241, 243, 249]],
  ['--color-surface-bar', [221, 225, 238]],
  ['--color-surface-raised', [250, 251, 253]],
  ['--color-surface-tab', [220, 222, 227]],
  ['--color-surface-stripe', [241, 242, 244]],
  ['--color-line', [200, 202, 205]],
  ['--color-line-strong', [136, 138, 141]],
  ['--color-focus', [111, 78, 178]],
  ['--color-text', [32, 32, 33]],
  ['--color-text-muted', [96, 97, 100]],
  ['--color-accent', [111, 78, 178]],
  ['--color-accent-contrast', [255, 255, 255]],
]);

// EXPERIENCE.md Accessibility Floor: text reaches 4.5:1 in both Owlbear themes. A focus outline is
// not text, so WCAG 1.4.11 asks 3:1 of it.
const MIN_TEXT_CONTRAST = 4.5;
const MIN_FOCUS_CONTRAST = 3;

// The surfaces the window paints, each as its layers from the bottom up. Fills and the tonal
// accent are translucent, so they are checked over every layer they sit on.
const NEUTRAL_SURFACES: readonly (readonly string[])[] = [
  ['--color-surface'],
  ['--color-surface-bar'],
  ['--color-surface-tab'],
  ['--color-surface-raised'],
  ['--color-surface-raised', '--color-surface-stripe'],
  ['--color-surface-bar', '--color-fill'],
  // A selected sidebar entry, a hovered row, a value being edited.
  ['--color-surface-bar', '--color-fill-strong'],
  ['--color-surface', '--color-fill'],
  ['--color-surface', '--color-fill-strong'],
  ['--color-surface-raised', '--color-fill'],
  ['--color-surface-raised', '--color-surface-stripe', '--color-fill-strong'],
];

const ACCENT_SOFT_SURFACES: readonly (readonly string[])[] = [
  ['--color-surface-bar', '--color-accent-soft'],
  ['--color-surface', '--color-accent-soft'],
  ['--color-surface-raised', '--color-accent-soft'],
  ['--color-surface-raised', '--color-surface-stripe', '--color-accent-soft'],
];

// Each text token and the surfaces the window puts it on.
const TEXT_PAIRS: ReadonlyArray<readonly [string, readonly (readonly string[])[]]> = [
  ['--color-text', NEUTRAL_SURFACES],
  ['--color-text-muted', NEUTRAL_SURFACES],
  // The preset builder writes in the accent; the window writes in the ink.
  [
    '--color-accent',
    [
      ['--color-surface'],
      ['--color-surface-bar'],
      ['--color-surface-tab'],
      ['--color-surface-stripe'],
    ],
  ],
  // The ink is the text of selected and roll controls, which never sit on a neutral fill.
  [
    '--color-accent-ink',
    [
      ['--color-surface'],
      ['--color-surface-bar'],
      ['--color-surface-raised'],
      ['--color-surface-raised', '--color-surface-stripe'],
      ...ACCENT_SOFT_SURFACES,
    ],
  ],
  ['--color-accent-contrast', [['--color-accent']]],
];

const FOCUS_SURFACES = [...NEUTRAL_SURFACES, ...ACCENT_SOFT_SURFACES];

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

for (const mode of ['dark', 'light'] as const) {
  test(`the ${mode} theme gives text 4.5:1 and the focus outline 3:1 on every surface`, async ({
    page,
  }) => {
    // #given
    await openWindow(page);

    if (mode === 'light') {
      await setTheme(page, LIGHT_THEME);
    }

    // #when
    const pairs = [
      ...TEXT_PAIRS.flatMap(([text, surfaces]) =>
        surfaces.map((surface) => ({ text, surface, minimum: MIN_TEXT_CONTRAST })),
      ),
      ...FOCUS_SURFACES.map((surface) => ({
        text: '--color-focus',
        surface,
        minimum: MIN_FOCUS_CONTRAST,
      })),
    ];

    const failing: string[] = [];

    for (const { text, surface, minimum } of pairs) {
      // Every surface sits on the window surface, so a translucent one shows it through.
      const back = await layeredColor(page, ['--color-surface', ...surface]);
      const front = await layeredColor(page, ['--color-surface', ...surface, text]);
      const ratio = contrastRatio(front, back);

      if (ratio < minimum) {
        failing.push(`${text} on ${surface.join(' + ')}: ${ratio.toFixed(2)}`);
      }
    }

    // #then
    expect(failing).toEqual([]);
  });
}

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

test('before any data the shell shows only Settings and the loading text', async ({ page }) => {
  // #when
  await openWindow(page);

  // #then: no sheet is fixed in code, so with no preset known only Settings shows.
  await expect(page.getByRole('tab')).toHaveCount(1);
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

test('the frame uses the DESIGN.md radii and content padding', async ({ page, context }) => {
  // #given
  await openRoom(page, context);

  // #when
  const layout = await Promise.all([
    cssValue(page.locator('#root > main'), 'border-top-left-radius'),
    cssValue(page.getByRole('tab', { name: 'NPC' }), 'border-top-left-radius'),
    cssValue(page.getByRole('tab', { name: 'NPC' }), 'border-bottom-left-radius'),
    cssValue(page.getByRole('tabpanel'), 'padding-top'),
  ]);

  // #then
  expect(layout).toEqual(['16px', '6px', '6px', '12px']);
});

test('the window uses the system font', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  const fontFamily = await cssValue(page.locator('#root > main'), 'font-family');

  // #then
  expect(fontFamily).toBe('system-ui, sans-serif');
});

test('the content area scrolls without scrolling the page', async ({ page }) => {
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

test('the selected sidebar entry takes the active colors', async ({ page, context }) => {
  // #given: NPC is the first tab of the example preset with no sheet.
  await openRoom(page, context);

  const tab = page.getByRole('tab', { name: 'NPC' });

  // #when
  const active = [await renderedColor(tab, 'background-color'), await renderedColor(tab, 'color')];

  // #then
  expect(active).toEqual([
    await tokenColor(page, '--color-fill-strong'),
    await tokenColor(page, '--color-text'),
  ]);
});

test('an unselected sidebar entry has no fill and the muted text color', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context);

  const gear = page.getByRole('tab', { name: 'Настройки' });

  // #when
  const inactive = [await cssValue(gear, 'background-color'), await renderedColor(gear, 'color')];

  // #then
  expect(inactive).toEqual(['rgba(0, 0, 0, 0)', await tokenColor(page, '--color-text-muted')]);
});

test('Down moves the selection between sidebar entries', async ({ page, context }) => {
  // #given
  await openRoom(page, context);
  await page.getByRole('tab', { name: 'NPC' }).click();

  // #when
  await page.keyboard.press('ArrowDown');

  // #then
  await expect(page.getByRole('tab', { name: 'Инвентарь' })).toHaveAttribute(
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

test('a failed theme read keeps the outline on a focused sidebar entry and an opaque window', async ({
  page,
}) => {
  // #given
  await page.goto('/index.html?mock-theme-read-fails');
  await expect(page.getByRole('tabpanel')).toBeVisible();

  const tab = page.getByRole('tab', { name: 'Настройки' });

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

test('a focused sidebar entry shows a 2 px solid outline in the focus color', async ({
  page,
  context,
}) => {
  // #given: the first tab is selected only once the preset arrives, and Tab still enters there.
  await openRoom(page, context);

  const tab = page.getByRole('tab', { name: 'NPC' });

  // #when
  await page.keyboard.press('Tab');

  // #then
  expect({
    focused: await tab.evaluate((element) => element === document.activeElement),
    style: await cssValue(tab, 'outline-style'),
    width: await cssValue(tab, 'outline-width'),
    color: await renderedColor(tab, 'outline-color'),
  }).toEqual({ focused: true, style: 'solid', width: '2px', color: [187, 153, 255] });
});

test('a sidebar entry is at least 32 px high', async ({ page, context }) => {
  // #given
  await openRoom(page, context);

  // #when
  const box = await page.getByRole('tab', { name: 'NPC' }).boundingBox();

  // #then
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
});

test('the window text is 13 px', async ({ page }) => {
  // #given
  await openWindow(page);

  // #when
  const fontSize = await cssValue(page.locator('#root > main'), 'font-size');

  // #then
  expect(fontSize).toBe('13px');
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

async function openWindow(page: Page): Promise<void> {
  await page.goto('/index.html');
  await expect(page.getByRole('tabpanel')).toBeVisible();
}

async function tokenColors(page: Page, tokens: string[]): Promise<Map<string, Rgb>> {
  const colors = await Promise.all(tokens.map((token) => tokenColor(page, token)));

  return new Map(tokens.map((token, index) => [token, colors[index] ?? [0, 0, 0]]));
}
