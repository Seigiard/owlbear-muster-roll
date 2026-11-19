import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { Preset } from '@/core/preset';
import {
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  seedStorage,
  storedCell,
  type ClientParams,
  type RoomClient,
} from './support/room';

const GM: ClientParams = { client: 'gm', device: 'gm', name: 'Мастер' };

const PRESET: Preset = {
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
                    { kind: 'text', text: 'Урон' },
                    {
                      kind: 'field',
                      type: 'dice-choice',
                      id: 'weapon_die',
                      options: ['d4', 'd6', 'd8', 'd10', 'd12'],
                    },
                    { kind: 'dice', formula: '1d(weapon_die)' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const PRESET_TEXT = JSON.stringify(PRESET);
const SHEET = pcSheet('brok', 'Брок', 0);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a GM picks d8, saves it, and the damage roll notification names 1d8', async ({ context }) => {
  // #given
  const gm = await openGm(context);
  await expect(diePicker(gm.window)).toBeVisible();
  // #when
  await diePicker(gm.window).selectOption('d8');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'weapon_die'))
    .toEqual(['d8', 2, gm.connectionId]);
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

test(
  'a saved d1 survives option removal and both pages restarting, and still rolls one',
  { tag: '@verify-quick' },
  async ({ context }) => {
    // #given
    const gmWindow = await openClientWindow(context, GM);
    const initialPreset = PRESET_TEXT.replace('["d4","d6","d8","d10","d12"]', '["d1","d6"]');
    await seedStorage(gmWindow, SHEET, initialPreset, GM.device);
    const background = await openClientBackground(context, GM);
    await diePicker(gmWindow).selectOption('d1');
    await expect(diePicker(gmWindow)).toHaveValue('d1');

    // #when
    await gmWindow.getByRole('tab', { name: 'Настройки', exact: true }).click();
    const choosing = gmWindow.waitForEvent('filechooser');
    await gmWindow
      .getByRole('region', { name: 'Пресет', exact: true })
      .getByRole('button', { name: 'Загрузить пресет', exact: true })
      .click();
    await (
      await choosing
    ).setFiles({
      name: 'only-d6.json',
      mimeType: 'application/json',
      buffer: Buffer.from(initialPreset.replace('["d1","d6"]', '["d6"]')),
    });
    await expect(gmWindow.getByText('Формат листов изменён.', { exact: true })).toBeVisible();
    await background.close();
    await gmWindow.close();
    const restartedWindow = await openClientWindow(context, GM);
    const restartedBackground = await openClientBackground(context, GM);

    // #then
    await expect(diePicker(restartedWindow)).toHaveValue('d1');
    await expect(diePicker(restartedWindow).locator('option:checked')).toHaveText('d1');
    await expect(diePicker(restartedWindow).locator('option[value="d1"]')).toBeDisabled();
    await expect(diePicker(restartedWindow).locator('option[value="d6"]')).toBeEnabled();
    await damageButton(restartedWindow).click();
    await expect
      .poll(() => restartedBackground.evaluate(() => window.mockPlatform.shownNotifications()))
      .toEqual(['Мастер: Брок, Урон (1d1) — 1']);
  },
);

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
