import type { Locator, Page } from '@playwright/test';

import type { Theme } from '@/platform/ports';

export type Rgb = readonly [number, number, number];

export const LIGHT_THEME: Theme = {
  mode: 'LIGHT',
  primary: { main: '#0055AA', contrastText: '#FFFFFF' },
  background: { default: '#C8C8C8', paper: '#FAFAFA' },
  text: { primary: '#0A0A0A', secondary: '#555555' },
};

export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((next) => {
    window.setMockTheme(next);
  }, theme);
}

export async function renderedColor(locator: Locator, property: string): Promise<Rgb> {
  const color = await locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );

  return paintedColor(locator.page(), color);
}

export async function tokenColor(page: Page, token: string): Promise<Rgb> {
  const color = await page.evaluate((name) => {
    const probe = document.createElement('div');

    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);

    const resolved = getComputedStyle(probe).backgroundColor;

    probe.remove();

    return resolved;
  }, token);

  return paintedColor(page, color);
}

export function cssValue(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

export function contrastRatio(first: Rgb, second: Rgb): number {
  const luminances = [luminance(first), luminance(second)];

  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

// Chromium reports color-mix results as color(srgb ...), so a canvas turns any color into bytes.
function paintedColor(page: Page, color: string): Promise<Rgb> {
  return page.evaluate((fill): Rgb => {
    const context = document.createElement('canvas').getContext('2d');

    if (context === null) {
      throw new Error('the page has no 2d canvas');
    }

    context.fillStyle = fill;
    context.fillRect(0, 0, 1, 1);

    const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

    return [red, green, blue];
  }, color);
}

function luminance([red, green, blue]: Rgb): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function linear(channel: number): number {
  const value = channel / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
