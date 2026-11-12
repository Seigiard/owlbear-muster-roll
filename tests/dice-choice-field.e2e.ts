import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { Preset } from '@/core/preset';
import { previewSheets } from '@/preview/sample-records';

import {
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  seedStorage,
  storedData,
  type ClientParams,
  type RoomClient,
} from './support/room';

const GM: ClientParams = { client: 'gm', device: 'gm', name: 'Мастер' };

const PRESET_TEXT = JSON.stringify({
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      sections: [
        {
          rows: [
            [
              { kind: 'text', text: 'Имя' },
              { kind: 'field', type: 'text', id: 'name' },
            ],
            [
              { kind: 'text', text: 'Урон' },
              {
                kind: 'field',
                type: 'dice-choice',
                id: 'weapon_die',
                options: ['d4', 'd6', 'd8', 'd10', 'd12'],
              },
              { kind: 'dice', formula: '1d(weapon_die)' },
            ],
          ],
        },
      ],
    },
  ],
});

const SHEET = pcSheet('brok', 'Брок', 0);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('the preview sample value is the first dice option', () => {
  // #given
  // SAFETY: PRESET_TEXT is the approved preset shape exercised by this test.
  const preset = JSON.parse(PRESET_TEXT) as Preset;

  // #when
  const preview = previewSheets(preset, 'sample');

  // #then
  expect(preview.records.get('row:preview-1:weapon_die')?.d).toEqual({ weapon_die: 'd4' });
});

test('a GM picks d8, saves it, and the damage roll notification names 1d8', async ({ context }) => {
  // #given
  const gm = await openGm(context);

  await expect(diePicker(gm.window)).toBeVisible();

  // #when
  await diePicker(gm.window).selectOption('d8');

  // #then
  await expect
    .poll(() => storedData(gm.window, 'row:brok:weapon_die'))
    .toEqual({
      weapon_die: 'd8',
    });

  // #when
  await damageButton(gm.window).click();

  // #then
  await expect.poll(() => shownNotifications(gm)).toHaveLength(1);

  const [notification] = await shownNotifications(gm);

  expect(notification).toMatch(/^Мастер: Брок, Урон \(1d8\) — [1-8]$/);
});

test('an empty dice-choice field shows its labelled field error and sends no roll', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);

  await expect(diePicker(gm.window)).toBeVisible();

  // #when
  await damageButton(gm.window).click();

  // #then
  await expect(messageUnderDamage(gm.window)).toHaveText(
    'Нельзя бросить: поле «Урон» пустое или не число',
  );
  expect(await shownNotifications(gm)).toEqual([]);
});

async function openGm(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);

  await seedStorage(window, SHEET, PRESET_TEXT, GM.device);

  const background = await openClientBackground(context, GM);

  return { window, background, connectionId: connectionIdOf(GM) };
}

async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

function diePicker(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('combobox', { name: 'Урон', exact: true });
}

function damageButton(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('button', { name: 'Урон', exact: true });
}

function messageUnderDamage(page: Page): Locator {
  return damageButton(page).locator('xpath=following-sibling::span[@aria-live]');
}
