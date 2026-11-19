import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import { UI_CHANNEL } from '@/core/ui-messages';
import {
  ADD,
  openClientBackground,
  openClientWindow,
  seedStorage,
  STORAGE_PREFIX,
} from './support/room';

const LOCAL_SAVE_FAILED = 'Не удалось сохранить в браузере. Скачайте снимок.';

test('a GM sees the failure in a collapsed diagnostics block in Settings', async ({ context }) => {
  // #given
  const { window } = await openClient(context, true);
  await expect(window.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);

  // #when
  await window.getByRole('tab', { name: 'Настройки' }).click();
  const details = window.locator('details').filter({ hasText: 'Диагностика' });

  // #then
  await expect(details.locator('summary')).toHaveText(/Диагностика\s*Сбоев: 1/);
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').click();
  await expect(details.getByRole('listitem')).toContainText('message-rejected');
});

test('a GM sees the empty diagnostics message after opening the block', async ({ context }) => {
  // #given
  const { window } = await openClient(context, false);
  await expect(window.getByRole('button', { name: ADD })).toBeVisible();

  // #when
  await window.getByRole('tab', { name: 'Настройки' }).click();
  const details = window.locator('details').filter({ hasText: 'Диагностика' });
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').click();

  // #then
  await expect(details).toContainText('Сбоев нет');
});

test('a player sees no diagnostics block or new banner while diagnostics exist', async ({
  context,
}) => {
  // #given
  const { window, background } = await openClient(context, true);
  await expect(window.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);

  // #when
  await background.evaluate(() => globalThis.window.mockPlatform.setRole('PLAYER'));
  await expect
    .poll(() => projection(window))
    .toEqual({
      role: 'PLAYER',
      tags: ['message-rejected'],
    });

  // #then
  await expect(window.getByText('Диагностика')).toHaveCount(0);
  await expect(window.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);
});

async function openClient(
  context: BrowserContext,
  corrupt: boolean,
): Promise<{ window: Page; background: Page }> {
  const window = await openClientWindow(context, { catchUpTimeoutMs: 300 });
  await seedStorage(window, []);

  if (corrupt) {
    await window.evaluate(
      (key) => localStorage.setItem(key, '{not json'),
      `${STORAGE_PREFIX}blk:bad`,
    );
  }

  const background = await openClientBackground(context, { catchUpTimeoutMs: 300 });

  return { window, background };
}

async function projection(page: Page): Promise<{ role: string; tags: string[] }> {
  return page.evaluate(
    (channel) =>
      new Promise((resolve) => {
        const nonce = crypto.randomUUID();

        const stop = window.mockPlatform.broadcast.onMessage(channel, (event) => {
          const message = Object(event.data);

          if (message.t !== 'projection' || message.nonce !== nonce || message.i !== message.n) {
            return;
          }

          stop();
          resolve({
            role: String(Object(message.sync).role),
            tags: Array.isArray(message.diagnostics)
              ? message.diagnostics.map((entry: { tag: string }) => entry.tag)
              : [],
          });
        });

        void window.mockPlatform.broadcast.sendMessage(
          channel,
          { t: 'projection-request', nonce },
          { destination: 'LOCAL' },
        );
      }),
    UI_CHANNEL,
  );
}
