import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { syncRead } from './support/room';

test('the window renders the shell root as the child of #root', async ({ page }) => {
  // #given
  const errors = collectPageErrors(page);
  // #when
  await page.goto('/index.html');
  // #then
  await expect(page.locator('#root > main')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the background page loads with no console error', async ({ page, context }) => {
  // #given
  const errors = collectPageErrors(page);
  // #when
  await page.goto('/background.html');
  // #then
  await expect(page).toHaveTitle('Muster Roll background');
  const window = await openWindowForBackground(context);
  await syncRead(window);
  expect(errors).toEqual([]);
});

for (const path of ['/index.html', '/background.html']) {
  test(`the mock build does not load the Owlbear SDK on ${path}`, async ({ page }) => {
    // #given
    const sdkRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('owlbear-rodeo')) {
        sdkRequests.push(request.url());
      }
    });
    // #when
    await page.goto(path);
    // #then
    expect(sdkRequests).toEqual([]);
  });
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  return errors;
}

async function openWindowForBackground(context: BrowserContext): Promise<Page> {
  const window = await context.newPage();
  await window.goto('/index.html');

  return window;
}
