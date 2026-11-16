import { assembleRecords } from '@/core/merge';
import { fixtureSnapshotCells, fixtureSnapshotBlocks } from './support/block-fixtures';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { Preset, PresetCell, PresetSection } from '@/core/preset';
import { recordSchema } from '@/core/records';
import { encodeSnapshotFile, snapshotFileSchema, type SnapshotFile } from '@/core/snapshot-file';
import { renderedColor, tokenColor } from './support/colors';
import { installBrowserFileAccessFake, queueBrowserFile } from './support/file-access';

const PAGE = '/builder.html';
const DRAFT_STORAGE_KEY = 'muster-roll-builder-draft';
const GENERATED_SHEET_ID = /^[A-Za-z0-9_-]{8}$/;

function createPreset({
  strengthExtraCells = [],
  additionalSections = [],
}: {
  strengthExtraCells?: readonly PresetCell[];
  additionalSections?: readonly PresetSection[];
} = {}): Preset {
  return {
    v: 4,
    templates: [
      {
        id: 'pc',

        title: 'Экипаж',
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
                      { kind: 'token', id: 'token' },
                    ],
                  },
                  {
                    cells: [
                      { kind: 'text', text: 'Сила' },
                      { kind: 'field', type: 'number', id: 'str' },
                      ...strengthExtraCells,
                    ],
                  },
                ],
              },
              ...additionalSections,
            ],
          },
        ],
      },
      {
        id: 'inventory',

        title: 'Инвентарь',
        tabs: [
          {
            sections: [
              {
                rows: [
                  {
                    cells: [
                      { kind: 'text', text: 'Золото' },
                      { kind: 'field', type: 'number', id: 'gold' },
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
}

const PRESET = createPreset();

const PRESET_WITH_STRENGTH_DICE = createPreset({
  strengthExtraCells: [{ kind: 'dice', formula: '1d20 <= str' }],
});

const EDITING_PRESET = createPreset({
  additionalSections: [
    {
      rows: [
        {
          cells: [
            { kind: 'text', text: 'Готов' },
            { kind: 'field', type: 'check', id: 'ready' },
          ],
        },
        {
          cells: [
            { kind: 'text', text: 'Броня' },
            { kind: 'field', type: 'select', id: 'armor', options: ['Кожа', 'Латы'] },
          ],
        },
        {
          cells: [
            { kind: 'text', text: 'Куб' },
            { kind: 'field', type: 'dice-choice', id: 'die', options: ['d6', 'd8'] },
          ],
        },
      ],
    },
    {
      repeat: { id: 'item', nameField: 'item' },
      rows: [
        {
          cells: [
            { kind: 'text', text: 'Вещь' },
            { kind: 'field', type: 'text', id: 'item' },
          ],
        },
      ],
    },
  ],
});

const SNAPSHOT = {
  v: 4,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'anya',
      set: 'pc',
      order: 0,
      cells: fixtureSnapshotCells({ name: { name: 'Аня' }, str: { str: 12 } }),
      blocks: fixtureSnapshotBlocks({}),
    },
    {
      id: 'brok',
      set: 'pc',
      order: 1,
      cells: fixtureSnapshotCells({ name: { name: 'Брок' }, str: { str: 18 } }),
      blocks: fixtureSnapshotBlocks({}),
    },
    {
      id: 'inventory',
      cells: fixtureSnapshotCells({ gold: { gold: 7 } }),
      blocks: fixtureSnapshotBlocks({}),
    },
  ],
  links: [{ tokenId: 'token-a', sheetId: 'anya', cellId: 'token' }],
};

const SNAPSHOT_WITHOUT_STRENGTH = {
  ...SNAPSHOT,
  sheets: [
    {
      id: 'anya',
      set: 'pc',
      order: 0,
      cells: fixtureSnapshotCells({ name: { name: 'Аня' } }),
      blocks: fixtureSnapshotBlocks({}),
    },
    {
      id: 'brok',
      set: 'pc',
      order: 1,
      cells: fixtureSnapshotCells({ name: { name: 'Брок' } }),
      blocks: fixtureSnapshotBlocks({}),
    },
    SNAPSHOT.sheets[2],
  ],
};

const EDITING_SNAPSHOT = {
  ...SNAPSHOT,
  sheets: SNAPSHOT.sheets.map((sheet) =>
    sheet.id === 'anya'
      ? {
          ...sheet,
          cells: {
            ...sheet.cells,
            ready: false,
            armor: 'Кожа',
            die: 'd6',
          },
          blocks: [
            { path: ['item', 'gear-1'], order: 0, cells: { item: 'Верёвка' } },
            { path: ['item', 'gear-2'], order: 1, cells: { item: 'Фляга' } },
          ],
        }
      : sheet,
  ),
};

const EDITING_SNAPSHOT_WITHOUT_FIRST_REPEAT = {
  ...EDITING_SNAPSHOT,
  sheets: EDITING_SNAPSHOT.sheets.map((sheet) =>
    sheet.id === 'anya'
      ? {
          ...sheet,
          blocks: [{ path: ['item', 'gear-2'], order: 0, cells: { item: 'Фляга' } }],
        }
      : sheet,
  ),
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await installBrowserFileAccessFake(page);
});

test('opens and downloads the snapshot with both set sheets, the single sheet, values and links', async ({
  page,
}) => {
  // #given
  await page.clock.setFixedTime(new Date(2026, 0, 5, 12, 0));
  await openPreset(page);
  // #when
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  // #then
  expect(await sidebar(page).getByRole('tab').allTextContents()).toEqual([
    'Аня',
    'Брок',
    'Инвентарь',
  ]);
  await expect(preview(page).getByRole('button', { name: 'Добавить: Экипаж' })).toHaveText(
    '+ Добавить',
  );
  await expect(preview(page).getByRole('heading', { name: 'Аня', level: 1 })).toBeVisible();
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('12');
  // #when
  await sidebar(page).getByRole('tab', { name: 'Брок', exact: true }).click();
  // #then
  await expect(preview(page).getByRole('heading', { name: 'Брок', level: 1 })).toBeVisible();
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('18');
  // #when
  await sidebar(page).getByRole('tab', { name: 'Инвентарь', exact: true }).click();
  // #then
  await expect(preview(page).getByRole('heading', { name: 'Инвентарь', level: 1 })).toBeVisible();
  await expect(preview(page).getByRole('group', { name: 'Золото' })).toHaveText('7');
  // #when
  const downloaded = await downloadSnapshot(page);
  // #then
  expect(downloaded).toEqual({
    name: 'muster-roll-snapshot-2026-01-05.json',
    file: SNAPSHOT,
  });
});

test('the first click on a snapshot field selects its tree item and shows its form', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  const strength = preview(page).getByRole('group', { name: 'Сила', exact: true });
  const treeField = page.getByRole('row', { name: 'str · Число', exact: true });
  // #when
  await strength.click();
  // #then
  await expect(treeField).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Id — имя для формул', exact: true })).toHaveValue(
    'str',
  );
});

test('the second click types a snapshot value, and Escape leaves typing with the field selected', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  const strength = preview(page).getByRole('group', { name: 'Сила', exact: true });
  const treeField = page.getByRole('row', { name: 'str · Число', exact: true });
  await strength.click();
  // #when
  await strength.click();
  const input = preview(page).getByRole('textbox', { name: 'Сила', exact: true });
  await expect(input).toBeFocused();
  await input.fill('13');
  await input.press('Escape');
  const downloaded = await downloadSnapshot(page);
  const anya = downloaded.file.sheets.find((sheet) => sheet.id === 'anya');
  // #then
  await expect(input).toHaveCount(0);
  await expect(treeField).toHaveAttribute('aria-selected', 'true');
  expect(anya?.cells.str).toBe(13);
});

test('a preview checkbox writes its exact snapshot patch', async ({ page }) => {
  // #given
  await openEditingPreview(page);
  const ready = preview(page).getByRole('img', { name: 'Готов: не отмечено', exact: true });
  await ready.click();
  await ready.click();
  // #when
  await preview(page).getByRole('checkbox', { name: 'Готов', exact: true }).click();
  const downloaded = await downloadSnapshot(page);
  const anya = downloaded.file.sheets.find((sheet) => sheet.id === 'anya');
  // #then
  expect(anya?.cells.ready).toBe(true);
});

test('editing a repeat field changes only the clicked instance', async ({ page }) => {
  // #given
  await openEditingPreview(page);
  const items = preview(page).getByRole('group', { name: 'Вещь', exact: true });
  await items.first().click();
  await expect(page.getByRole('row', { name: 'item · Текст', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await items.first().click();
  // #when
  const controls = preview(page).getByRole('textbox', { name: 'Вещь', exact: true });
  const editingControls = await controls.count();
  const focused = page.locator('textarea:focus');
  await expect(focused).toHaveCount(1);
  await focused.fill('Факел');
  await focused.press('Enter');
  const downloaded = await downloadSnapshot(page);
  const anya = downloaded.file.sheets.find((sheet) => sheet.id === 'anya');
  // #then
  expect({ editingControls, blocks: anya?.blocks }).toEqual({
    editingControls: 1,
    blocks: [
      { path: ['item', 'gear-1'], order: 0, cells: { item: 'Факел' } },
      { path: ['item', 'gear-2'], order: 1, cells: { item: 'Фляга' } },
    ],
  });
});

test('Enter edits the specifically selected repeat instance and leaves the other unchanged', async ({
  page,
}) => {
  // #given
  await openEditingPreview(page);
  const items = preview(page).getByRole('group', { name: 'Вещь', exact: true });
  await items.nth(1).click();
  await expect(page.getByRole('row', { name: 'item · Текст', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // #when
  await page.keyboard.press('Enter');
  const controls = preview(page).getByRole('textbox', { name: 'Вещь', exact: true });
  const focused = page.locator('textarea:focus');
  await expect(controls).toHaveCount(1);
  await expect(focused).toHaveCount(1);
  await expect(focused).toHaveValue('Фляга');
  await focused.fill('Компас');
  await focused.press('Enter');
  const downloaded = await downloadSnapshot(page);
  const anya = downloaded.file.sheets.find((sheet) => sheet.id === 'anya');
  // #then
  expect(anya?.blocks).toEqual([
    { path: ['item', 'gear-1'], order: 0, cells: { item: 'Верёвка' } },
    { path: ['item', 'gear-2'], order: 1, cells: { item: 'Компас' } },
  ]);
});

test('Enter on a selected repeat field with its instance missing does not trap later editing', async ({
  page,
}) => {
  // #given
  await openEditingPreview(page);
  const items = preview(page).getByRole('group', { name: 'Вещь', exact: true });
  await items.first().click();
  await expect(page.getByRole('row', { name: 'item · Текст', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await openSnapshot(page, JSON.stringify(EDITING_SNAPSHOT_WITHOUT_FIRST_REPEAT));
  const remaining = preview(page).getByRole('group', { name: 'Вещь', exact: true });
  await expect(remaining).toHaveCount(1);
  await expect(remaining).toHaveText('Фляга');
  // #when
  await page.keyboard.press('Enter');

  const controlsAfterEnter = preview(page).getByRole('textbox', {
    name: 'Вещь',
    exact: true,
  });

  await expect(controlsAfterEnter).toHaveCount(0);
  await remaining.click();
  // #then
  const focused = page.locator('textarea:focus');
  await expect(focused).toHaveCount(1);
  await expect(focused).toHaveValue('Фляга');
});

for (const field of [
  {
    name: 'check',
    label: 'Готов',
    readOnlyRole: 'img' as const,
    readOnlyName: 'Готов: не отмечено',
    controlRole: 'checkbox' as const,
    treeName: 'ready · Флажок',
  },
  {
    name: 'select',
    label: 'Броня',
    readOnlyRole: 'group' as const,
    readOnlyName: 'Броня',
    controlRole: 'combobox' as const,
    treeName: 'armor · Список',
  },
  {
    name: 'dice choice',
    label: 'Куб',
    readOnlyRole: 'group' as const,
    readOnlyName: 'Куб',
    controlRole: 'combobox' as const,
    treeName: 'die · Выбор кубика',
  },
] as const) {
  test(`Escape exits ${field.name} editing while keeping its field selected`, async ({ page }) => {
    // #given
    await openEditingPreview(page);

    const value = preview(page).getByRole(field.readOnlyRole, {
      name: field.readOnlyName,
      exact: true,
    });

    await value.click();
    await value.click();

    const control = preview(page).getByRole(field.controlRole, {
      name: field.label,
      exact: true,
    });

    await expect(control).toBeFocused();
    // #when
    await control.press('Escape');
    // #then
    await expect(control).toHaveCount(0);
    await expect(page.getByRole('row', { name: field.treeName, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
}

test('pagehide flushes a pending preview value into the Builder draft', async ({ page }) => {
  // #given
  await openEditingPreview(page);
  const strength = preview(page).getByRole('group', { name: 'Сила', exact: true });
  await strength.click();
  await strength.click();
  const input = preview(page).getByRole('textbox', { name: 'Сила', exact: true });
  await input.fill('13');

  // #when
  const rawDraft = await page.evaluate((key) => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));

    return window.localStorage.getItem(key);
  }, DRAFT_STORAGE_KEY);

  if (rawDraft === null) {
    throw new Error('The Builder draft was not stored');
  }

  const draft = JSON.parse(rawDraft);
  const records = recordSchema.array().parse(draft.records);
  const snapshot = encodeSnapshotFile(assembleRecords(records), EDITING_PRESET);
  const anya = snapshot.sheets.find((sheet) => sheet.id === 'anya');
  // #then
  expect(anya?.cells.str).toBe(13);
});

test('Enter on a selected snapshot field starts typing its current value', async ({ page }) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  const strength = preview(page).getByRole('group', { name: 'Сила', exact: true });
  await strength.click();
  // #when
  await page.keyboard.press('Enter');
  // #then
  const input = preview(page).getByRole('textbox', { name: 'Сила', exact: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('12');
});

test('a selected dice cell rolls only on the second click through its formula', async ({
  page,
}) => {
  // #given
  await openPreset(page, PRESET_WITH_STRENGTH_DICE);
  await openSnapshot(page, JSON.stringify(SNAPSHOT_WITHOUT_STRENGTH));
  const dice = preview(page).getByRole('button', { name: 'Сила', exact: true });
  const treeDice = page.getByRole('row', { name: '1d20 <= str', exact: true });

  const fieldError = page.getByText('Нельзя бросить: поле «Сила» пустое или не число', {
    exact: true,
  });

  // #when
  await dice.click();
  // #then
  await expect(treeDice).toHaveAttribute('aria-selected', 'true');
  await expect(fieldError).toHaveCount(0);
  // #when
  await dice.click();
  // #then
  await expect(fieldError).toBeVisible();
});

test('one template structure edit reaches both sheets and undo restores both', async ({ page }) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  await page.getByRole('row', { name: 'Сила', exact: true }).click();
  // #when
  await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Мощь');
  // #then
  await expect(preview(page).getByRole('group', { name: 'Мощь', exact: true })).toHaveText('12');
  // #when
  await sidebar(page).getByRole('tab', { name: 'Брок', exact: true }).click();
  // #then
  await expect(preview(page).getByRole('group', { name: 'Мощь', exact: true })).toHaveText('18');
  // #when
  await page.getByRole('button', { name: 'Отменить правку', exact: true }).click();
  // #then
  await expect(preview(page).getByRole('group', { name: 'Сила', exact: true })).toHaveText('18');
  // #when
  await sidebar(page).getByRole('tab', { name: 'Аня', exact: true }).click();
  // #then
  await expect(preview(page).getByRole('group', { name: 'Сила', exact: true })).toHaveText('12');
});

test('an empty set has a pale selectable sample outside the file, and add creates a real sheet', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  const sample = sidebar(page).getByRole('tab', { name: 'Образец', exact: true });
  // #then
  await expect(sample).toHaveAttribute('aria-selected', 'true');
  expect(await renderedColor(sample, 'color')).toEqual(
    await tokenColor(page, '--color-text-muted'),
  );
  await expect(preview(page).getByRole('button', { name: 'Добавить: Экипаж' })).toHaveText(
    '+ Добавить',
  );
  expect((await downloadSnapshot(page)).file).toEqual({
    v: 4,
    type: 'muster-roll/snapshot',
    sheets: [
      { id: 'inventory', cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) },
    ],
    links: [],
  });
  // #when
  await preview(page).getByRole('button', { name: 'Добавить: Экипаж' }).click();
  // #then
  await expect(sample).toHaveCount(0);
  await expect(sidebar(page).getByRole('tab', { name: 'Без имени', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const added = (await downloadSnapshot(page)).file;

  const normalizedSheets = added.sheets.map((sheet) => {
    return sheet.set === 'pc' ? { ...sheet, id: '<generated>' } : sheet;
  });

  const generated = added.sheets.find((sheet: { set?: string }) => sheet.set === 'pc');
  expect({
    generatedId: GENERATED_SHEET_ID.test(generated?.id ?? ''),
    sheets: normalizedSheets,
  }).toEqual({
    generatedId: true,
    sheets: [
      {
        id: '<generated>',
        set: 'pc',
        order: 0,
        cells: fixtureSnapshotCells({}),
        blocks: fixtureSnapshotBlocks({}),
      },
      { id: 'inventory', cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) },
    ],
  });
});

test('reload restores the preset and snapshot without a replacement prompt', async ({ page }) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  await sidebar(page).getByRole('tab', { name: 'Брок', exact: true }).click();
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('18');
  // #when
  await page.reload();
  // #then
  await expect(page.getByRole('row', { name: 'Экипаж · Набор', exact: true })).toBeVisible();
  expect(await sidebar(page).getByRole('tab').allTextContents()).toEqual([
    'Аня',
    'Брок',
    'Инвентарь',
  ]);
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('12');
  await expect(page.getByRole('group', { name: /Черновик будет заменён/ })).toHaveCount(0);
});

test('an old preset-only draft reopens with its preset and an empty snapshot', async ({ page }) => {
  // #given
  await page.goto(PAGE);
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [DRAFT_STORAGE_KEY, JSON.stringify({ preset: PRESET, origin: PRESET, name: 'crew' })] as const,
  );
  // #when
  await page.reload();
  // #then
  await expect(page.getByRole('row', { name: 'Экипаж · Набор', exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole('tab', { name: 'Образец', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(sidebar(page).getByRole('tab', { name: 'Инвентарь', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: /Черновик будет заменён/ })).toHaveCount(0);
});

test('a preset edit drops values silently, and undo and redo restore the complete step', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  await page.getByRole('row', { name: 'str · Число', exact: true }).click();
  const fieldId = page.getByRole('textbox', { name: 'Id — имя для формул' });
  // #when
  await fieldId.fill('power');
  await fieldId.blur();
  // #then
  await expect(page.locator('[data-builder-rename]')).toHaveText('Формулы изменены: 0.');
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('power');
  expect((await downloadSnapshot(page)).file).toEqual(SNAPSHOT_WITHOUT_STRENGTH);
  // #when
  await page.getByRole('button', { name: 'Отменить правку' }).click();
  // #then
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('12');
  expect((await downloadSnapshot(page)).file).toEqual(SNAPSHOT);
  // #when
  await page.getByRole('button', { name: 'Повторить правку' }).click();
  // #then
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('power');
});

test('an invalid template id keeps its structure selection and preview problem mark', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  const template = page.getByRole('row', { name: 'Экипаж · Набор', exact: true });
  await template.click();

  // #when
  const templateId = page
    .locator('[data-builder-form]')
    .getByRole('textbox', { name: 'Id', exact: true });

  await templateId.fill('bad id');
  await templateId.blur();
  // #then
  await expect(template).toHaveAttribute('aria-selected', 'true');
  await expect(template).toHaveAttribute('data-problem', 'true');
  const sample = sidebar(page).getByRole('tab', { name: 'Образец', exact: true });
  await expect(sample).toHaveAttribute('aria-selected', 'true');
  await expect(sample).toHaveCSS('box-shadow', /2px/);
});

test('duplicate template ids keep each sidebar entry mapped to its document template', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  await page.getByRole('row', { name: 'Экипаж · Набор', exact: true }).click();

  // #when
  const templateId = page
    .locator('[data-builder-form]')
    .getByRole('textbox', { name: 'Id', exact: true });

  await templateId.fill('inventory');
  await templateId.blur();
  // #then
  expect(await sidebar(page).getByRole('tab').allTextContents()).toEqual(['Образец', 'Инвентарь']);
  // #when
  await sidebar(page).getByRole('tab', { name: 'Инвентарь', exact: true }).click();
  // #then
  await expect(
    page.getByRole('row', { name: 'Инвентарь · Одиночный лист', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('add on an invalid set id refuses without throwing or changing snapshot records', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  await page.getByRole('row', { name: 'Экипаж · Набор', exact: true }).click();

  const templateId = page
    .locator('[data-builder-form]')
    .getByRole('textbox', { name: 'Id', exact: true });

  await templateId.fill('bad id');
  await templateId.blur();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  const add = preview(page).getByRole('button', { name: 'Добавить: Экипаж' });
  await expect(add).toBeEnabled();

  const draftBefore = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    DRAFT_STORAGE_KEY,
  );

  // #when
  await add.click();

  const draftAfter = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    DRAFT_STORAGE_KEY,
  );

  // #then
  expect({
    draftPresent: draftBefore !== null,
    draftUnchanged: draftAfter === draftBefore,
    pageErrors,
  }).toEqual({
    draftPresent: true,
    draftUnchanged: true,
    pageErrors: [],
  });
});

test('a bad snapshot is refused and preserves the current preset and snapshot', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  await sidebar(page).getByRole('tab', { name: 'Брок', exact: true }).click();
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('18');
  // #when
  await openSnapshot(page, '{');
  // #then
  await expect(page.getByText('Файл не подошёл: это не JSON. Ничего не изменено.')).toBeVisible();
  await expect(sidebar(page).getByRole('tab', { name: 'Брок', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('18');
});

test('a schema-valid snapshot with an oversized record is refused and preserves current data', async ({
  page,
}) => {
  // #given
  await openPreset(page);
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  await sidebar(page).getByRole('tab', { name: 'Брок', exact: true }).click();

  const oversized = {
    ...SNAPSHOT,
    sheets: SNAPSHOT.sheets.map((sheet) =>
      sheet.id === 'anya'
        ? {
            ...sheet,
            cells: { ...sheet.cells, name: 'я'.repeat(9000) },
          }
        : sheet,
    ),
  };

  const oversizedText = JSON.stringify(snapshotFileSchema.parse(oversized));
  // #when
  await openSnapshot(page, oversizedText);
  // #then
  await expect(
    page.getByText('Файл не подошёл: файл слишком большой. Ничего не изменено.'),
  ).toBeVisible();
  await expect(sidebar(page).getByRole('tab', { name: 'Брок', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(preview(page).getByRole('group', { name: 'Сила' })).toHaveText('18');
  expect((await downloadSnapshot(page)).file).toEqual(SNAPSHOT);
});

test('a failed snapshot draft write uses the existing failed status', async ({ page }) => {
  // #given
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await openPreset(page);
  // #when
  await openSnapshot(page, JSON.stringify(SNAPSHOT));
  // #then
  await expect(page.locator('header').getByRole('status')).toHaveText(
    'Черновик не сохраняется в этом браузере',
  );
  await expect(sidebar(page).getByRole('tab', { name: 'Аня', exact: true })).toBeVisible();
});

function preview(page: Page): Locator {
  return page.locator('[data-preview-frame]');
}

function sidebar(page: Page): Locator {
  return preview(page).getByRole('tablist', { name: 'Листы' });
}

async function openPreset(
  page: Page,
  preset: ReturnType<typeof createPreset> = PRESET,
): Promise<void> {
  await page.goto(PAGE);
  await queueBrowserFile(page, 'crew-preset.json', JSON.stringify(preset));
  await page
    .locator('header')
    .getByRole('button')
    .filter({ hasText: /^Пресет/ })
    .click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Открыть файл…' }).click();
  await expect(page.getByRole('row', { name: 'Экипаж · Набор', exact: true })).toBeVisible();
}

async function openSnapshot(page: Page, text: string): Promise<void> {
  await queueBrowserFile(page, 'crew-snapshot.json', text);

  const block = page
    .locator('header')
    .getByRole('button')
    .filter({ hasText: /^Снимок/ });

  await expect(block).toBeVisible();
  await block.click();
  const menu = page.getByRole('menu');
  const openAnother = menu.getByRole('menuitem', { name: 'Открыть другой файл…' });
  await (
    (await openAnother.count()) === 1
      ? openAnother
      : menu.getByRole('menuitem', { name: 'Открыть файл…' })
  ).click();
}

async function openEditingPreview(page: Page): Promise<void> {
  await openPreset(page, EDITING_PRESET);
  await openSnapshot(page, JSON.stringify(EDITING_SNAPSHOT));
}

async function downloadSnapshot(page: Page): Promise<{
  name: string;
  file: SnapshotFile;
}> {
  const block = page
    .locator('header')
    .getByRole('button')
    .filter({ hasText: /^Снимок/ });

  await expect(block).toBeVisible();
  const downloading = page.waitForEvent('download');
  await block.click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Скачать копию' }).click();
  const download = await downloading;

  return {
    name: download.suggestedFilename(),
    file: snapshotFileSchema.parse(JSON.parse(readFileSync(await download.path(), 'utf8'))),
  };
}
