import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { contrastRatio, cssValue, LIGHT_THEME, renderedColor, setTheme } from './support/colors';
import type { Rgb } from './support/colors';

const MIN_CONTRAST = 4.5;
const MIN_TOUCH_TARGET_PX = 32;
const MAX_TAB_PRESSES = 20;
const DARK_FOCUS: Rgb = [187, 153, 255];

type BannerCase = {
  name: string;
  mode: 'dark' | 'light';
  text: string;
  surface: Rgb;
  foreground: Rgb;
};

const BANNER_CASES: readonly BannerCase[] = [
  {
    name: 'dark warning',
    mode: 'dark',
    text: 'Warning banner',
    surface: [74, 58, 30],
    foreground: [255, 216, 148],
  },
  {
    name: 'dark danger',
    mode: 'dark',
    text: 'Danger banner',
    surface: [79, 43, 38],
    foreground: [255, 180, 168],
  },
  {
    name: 'light warning',
    mode: 'light',
    text: 'Warning banner',
    surface: [255, 241, 214],
    foreground: [107, 71, 0],
  },
  {
    name: 'light danger',
    mode: 'light',
    text: 'Danger banner',
    surface: [253, 227, 223],
    foreground: [138, 35, 24],
  },
];

for (const { name, locate } of [
  { name: 'Button', locate: (page: Page) => page.getByRole('button', { name: 'Primary' }) },
  {
    name: 'Chip',
    locate: (page: Page) => page.getByRole('button', { name: 'Pressable chip' }),
  },
  { name: 'Field', locate: (page: Page) => page.getByRole('textbox', { name: 'Enabled field' }) },
]) {
  test(`keyboard focus on a ${name} shows a 2 px outline in the focus color`, async ({ page }) => {
    // #given
    await openFixture(page);

    const control = locate(page);

    // #when
    await tabTo(page, control);

    // #then
    expect({
      style: await cssValue(control, 'outline-style'),
      width: await cssValue(control, 'outline-width'),
      color: await renderedColor(control, 'outline-color'),
    }).toEqual({ style: 'solid', width: '2px', color: DARK_FOCUS });
  });

  test(`a ${name} is at least 32 px high`, async ({ page }) => {
    // #given
    await openFixture(page);

    // #when
    const box = await locate(page).boundingBox();

    // #then
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });
}

for (const { name, label, reason } of [
  { name: 'Button', label: 'Disabled button', reason: 'Button reason' },
  { name: 'Chip', label: 'Disabled chip', reason: 'Chip reason' },
]) {
  test(`a disabled ${name} is dimmed, explains itself and ignores a press`, async ({ page }) => {
    // #given
    await openFixture(page);

    const control = page.getByRole('button', { name: label });

    // #when
    await control.click({ force: true });

    // #then
    await expect(control).toHaveCSS('opacity', '0.5');
    await expect(control).toHaveAccessibleDescription(reason);
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByTestId('presses')).toHaveText('0');
  });
}

test('a disabled Field is dimmed, explains itself and takes no input', async ({ page }) => {
  // #given
  await openFixture(page);

  // #when
  const field = page.getByRole('textbox', { name: 'Disabled field' });

  // #then
  await expect(field).toBeDisabled();
  await expect(field).toHaveCSS('opacity', '0.5');
  await expect(field).toHaveAccessibleDescription('Field reason');
  await expect(page.getByText('Field reason')).toBeVisible();
});

test('the radii follow DESIGN.md for buttons and chips', async ({ page }) => {
  // #given
  await openFixture(page);

  // #when
  const radii = await Promise.all([
    cssValue(page.getByRole('button', { name: 'Primary' }), 'border-top-left-radius'),
    cssValue(page.getByRole('button', { name: 'Pressable chip' }), 'border-top-left-radius'),
  ]);

  // #then
  expect(radii).toEqual(['4px', '9999px']);
});

test('a status chip is not a button and renders muted at 12 px', async ({ page }) => {
  // #given
  await openFixture(page);

  const chip = page.getByText('Status chip');

  // #when
  const rendered = {
    buttons: await page.getByRole('button', { name: 'Status chip' }).count(),
    color: await renderedColor(chip, 'color'),
    fontSize: await cssValue(chip, 'font-size'),
  };

  // #then
  expect(rendered).toEqual({ buttons: 0, color: [189, 190, 196], fontSize: '12px' });
});

test('typing in a Field reaches onChange and leaving it fires onBlur', async ({ page }) => {
  // #given
  await openFixture(page);

  const field = page.getByRole('textbox', { name: 'Echo field' });
  const echo = page.getByTestId('field-echo');

  // #when
  await field.pressSequentially('ab');
  const afterTyping = await echo.textContent();

  await page.keyboard.press('Tab');
  const afterLeaving = await echo.textContent();

  // #then
  expect([afterTyping, afterLeaving]).toEqual(['ab:0', 'ab:1']);
});

test('a primary Button renders the accent background and contrast text', async ({ page }) => {
  // #given
  await openFixture(page);

  const button = page.getByRole('button', { name: 'Primary' });

  // #when
  const colors = [
    await renderedColor(button, 'background-color'),
    await renderedColor(button, 'color'),
  ];

  // #then
  expect(colors).toEqual([
    [187, 153, 255],
    [4, 5, 7],
  ]);
});

for (const name of ['Secondary', 'Default']) {
  test(`a ${name} Button renders the text color and a line border`, async ({ page }) => {
    // #given
    await openFixture(page);

    const button = page.getByRole('button', { name, exact: true });

    // #when
    const rendered = {
      color: await renderedColor(button, 'color'),
      border: await renderedColor(button, 'border-top-color'),
      borderWidth: await cssValue(button, 'border-top-width'),
    };

    // #then
    expect(rendered).toEqual({
      color: [255, 255, 255],
      border: [78, 81, 97],
      borderWidth: '1px',
    });
  });
}

test('a Field has a dotted underline in the strong line color', async ({ page }) => {
  // #given
  await openFixture(page);

  const field = page.getByRole('textbox', { name: 'Enabled field' });

  // #when
  const underline = {
    style: await cssValue(field, 'border-bottom-style'),
    width: await cssValue(field, 'border-bottom-width'),
    color: await renderedColor(field, 'border-bottom-color'),
  };

  // #then
  expect(underline).toEqual({ style: 'dotted', width: '1px', color: [145, 147, 156] });
});

test('the shell banner slot renders the banner as a live region', async ({ page }) => {
  // #when
  await openFixture(page);

  // #then
  await expect(page.getByRole('status').filter({ hasText: 'Warning banner' })).toBeVisible();
});

test.describe('touch and mouse', () => {
  test.use({ hasTouch: true });

  test('a tap and a click each act once', async ({ page }) => {
    // #given
    await openFixture(page);

    const button = page.getByRole('button', { name: 'Primary' });
    const presses = page.getByTestId('presses');

    // #when
    await button.tap();
    const afterTap = await presses.textContent();

    await button.click();
    const afterClick = await presses.textContent();

    // #then
    expect([afterTap, afterClick]).toEqual(['1', '2']);
  });
});

for (const { name, mode, text, surface, foreground } of BANNER_CASES) {
  test(`the ${name} banner uses its pair`, async ({ page }) => {
    // #given
    await openFixture(page);

    if (mode === 'light') {
      await setTheme(page, LIGHT_THEME);
    }

    const banner = page.getByRole('status').filter({ hasText: text });

    // #when
    const colors = [
      await renderedColor(banner, 'background-color'),
      await renderedColor(banner, 'color'),
    ];

    // #then
    expect(colors).toEqual([surface, foreground]);
  });

  test(`the ${name} banner has at least 4.5:1 contrast`, async ({ page }) => {
    // #given
    await openFixture(page);

    if (mode === 'light') {
      await setTheme(page, LIGHT_THEME);
    }

    const banner = page.getByRole('status').filter({ hasText: text });

    // #when
    const ratio = contrastRatio(
      await renderedColor(banner, 'background-color'),
      await renderedColor(banner, 'color'),
    );

    // #then
    expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
}

async function openFixture(page: Page): Promise<void> {
  await page.goto('/tests/fixtures/primitives.html');
  await expect(page.getByRole('button', { name: 'Primary' })).toBeVisible();
}

async function tabTo(page: Page, control: Locator): Promise<void> {
  for (let presses = 0; presses < MAX_TAB_PRESSES; presses += 1) {
    await page.keyboard.press('Tab');

    if (await control.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  throw new Error('Tab never reached the control');
}
