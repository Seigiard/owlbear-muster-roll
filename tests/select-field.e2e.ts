import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  ADD,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  seedStorage,
  storedCell,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const GM: ClientParams = { client: 'gm', name: 'Мастер' };
const SECOND_GM: ClientParams = { client: 'gm-2', name: 'Второй мастер' };

const PLAYER: ClientParams = {
  client: 'player',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'player',
};

const BASE_PRESET_TEXT = JSON.stringify({
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
              ],
            },
          ],
        },
      ],
    },
  ],
});

const SELECT_PRESET_TEXT = selectPresetText(['Лёгкая', 'Тяжёлая']);
const SHEET = pcSheet('brok', 'Брок', 0);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a GM picker lists the preset options in order, saves for every client, and clears the key', async ({
  context,
}) => {
  // #given
  const gm = await openSeededGm(context, SHEET);
  await expect(armor(gm.window)).toBeVisible();
  const second = await openClient(context, SECOND_GM);
  await expect(armor(second.window)).toBeVisible();

  // #when
  const options = await armor(gm.window)
    .locator('option')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent,
        value: node.getAttribute('value') ?? '',
        disabled: node.hasAttribute('disabled'),
      })),
    );

  // #then
  expect(options).toEqual([
    { text: '—', value: '', disabled: false },
    { text: 'Лёгкая', value: 'Лёгкая', disabled: false },
    { text: 'Тяжёлая', value: 'Тяжёлая', disabled: false },
  ]);
  // #when
  await armor(gm.window).selectOption('Тяжёлая');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'armor'))
    .toEqual(['Тяжёлая', 2, gm.connectionId]);
  await expect(armor(second.window)).toHaveValue('Тяжёлая');
  // #when
  await armor(gm.window).selectOption('');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'armor'))
    .toEqual([null, 3, gm.connectionId]);
  await expect(armor(second.window)).toHaveValue('');
});

test('a stale stored value is selected as a disabled extra option and a pick replaces it', async ({
  context,
}) => {
  // #given
  const gm = await openSeededGm(context, [...SHEET, record('blk:brok', { armor: 'Латы' })]);
  // #when
  const picker = armor(gm.window);
  // #then
  await expect(picker).toHaveValue('Латы');
  await expect(picker.locator('option[value="Латы"]')).toBeDisabled();
  await expect(picker.locator('option[value="Латы"]')).toHaveText('Латы');
  // #when
  await picker.selectOption('Лёгкая');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'armor'))
    .toEqual(['Лёгкая', 2, gm.connectionId]);
});

test("a player's pick uses the pending-edit path and reaches the GM", async ({ context }) => {
  // #given
  const gm = await openSeededGm(context, [
    ...SHEET,
    record('acl:brok:lisa', { name: 'Лиза' }),
    record('blk:brok', { armor: 'Лёгкая' }),
  ]);

  const player = await openClient(context, PLAYER);
  await expect(armor(player.window)).toHaveValue('Лёгкая');
  // #when
  await armor(player.window).selectOption('Тяжёлая');
  // #then
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'armor'))
    .toEqual(['Тяжёлая', 2, player.connectionId]);
  await expect(armor(gm.window)).toHaveValue('Тяжёлая');
});

test('a player without write access sees the labelled value as read-only text', async ({
  context,
}) => {
  // #given
  await openSeededGm(context, [...SHEET, record('blk:brok', { armor: 'Тяжёлая' })]);
  const player = await openClient(context, PLAYER);

  // #when
  const value = player.window.getByRole('tabpanel').getByRole('group', {
    name: 'Броня',
    exact: true,
  });

  // #then
  await expect(value).toHaveText('Тяжёлая');
  await expect(armor(player.window)).toHaveCount(0);
});

test('Tab reaches the labelled 32 px picker and a focused selection saves', async ({ context }) => {
  // #given
  const gm = await openSeededGm(context, SHEET);
  const name = gm.window.getByRole('tabpanel').getByRole('textbox', { name: 'Имя', exact: true });
  await expect(armor(gm.window)).toBeVisible();
  await name.focus();
  // #when
  await gm.window.keyboard.press('Tab');
  // #then
  await expect(armor(gm.window)).toBeFocused();
  const box = await armor(gm.window).boundingBox();
  expect((box?.height ?? 0) >= 32).toBe(true);
  // #when
  await gm.window.keyboard.press('ArrowDown');
  // #then
  await expect(armor(gm.window)).toHaveValue('Лёгкая');
  await expect
    .poll(() => storedCell(gm.window, 'blk:brok', 'armor'))
    .toEqual(['Лёгкая', 2, gm.connectionId]);
});

for (const [name, options, reason] of [
  ['no options', [], 'Файл не подошёл: у поля «armor» нет вариантов. Ничего не изменено.'],
  [
    'a blank option',
    ['Кожаная', '  '],
    'Файл не подошёл: пустой вариант в поле «armor». Ничего не изменено.',
  ],
  [
    'a repeated option',
    ['Кожаная', 'Кольчуга', 'Кожаная'],
    'Файл не подошёл: вариант «Кожаная» повторяется в поле «armor». Ничего не изменено.',
  ],
] as const) {
  test(`an upload refuses a select with ${name} at its field`, async ({ context }) => {
    // #given
    const gm = await openSeededGm(context, SHEET, BASE_PRESET_TEXT);
    await gm.window.getByRole('tab', { name: 'Настройки' }).click();
    // #when
    await upload(gm.window, selectPresetText(options));
    // #then
    await expect(gm.window.getByText(reason, { exact: true })).toBeVisible();
  });
}

function selectPresetText(options: readonly string[]): string {
  return JSON.stringify({
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
                      { kind: 'text', text: 'Броня' },
                      { kind: 'field', type: 'select', id: 'armor', options },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

async function openSeededGm(
  context: BrowserContext,
  records: readonly StoredRecord[],
  presetText = SELECT_PRESET_TEXT,
): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);
  await seedStorage(window, records, presetText);
  const background = await openClientBackground(context, GM);
  await expect(window.getByRole('button', { name: ADD })).toBeVisible();

  return { window, background, connectionId: connectionIdOf(GM) };
}

async function openClient(context: BrowserContext, params: ClientParams): Promise<RoomClient> {
  const window = await openClientWindow(context, params);
  const background = await openClientBackground(context, params);

  return { window, background, connectionId: connectionIdOf(params) };
}

async function upload(page: Page, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');
  await page
    .getByRole('region', { name: 'Пресет' })
    .getByRole('button', { name: 'Загрузить пресет' })
    .click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: 'preset.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

function armor(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('combobox', { name: 'Броня', exact: true });
}
