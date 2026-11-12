import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { cssValue, renderedColor, tokenColor } from './support/colors';
import { openRoom, record } from './support/room';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const SECTION_GAP = 16;
const LONG_VALUE = 'Ш'.repeat(120);

// Every cell kind and layout the matrix of the 1.8 spec names, in the width order it lists. The
// sheet set names each sheet by `motto`, so the layout needs no field of its own for the name.
const PRESET = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'motto',
      tabs: [
        {
          sections: [
            {
              title: 'Сетка',
              width: '1/3',
              columns: 3,
              rows: [
                [
                  { kind: 'text', text: 'Сила' },
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'field', type: 'check', id: 'str_tired' },
                ],
                [
                  { kind: 'text', text: 'Ловкость' },
                  { kind: 'field', type: 'number', id: 'dex' },
                ],
              ],
            },
            {
              title: 'Строки',
              width: '1/3',
              rows: [
                [
                  { kind: 'text', text: 'Хиты сейчас' },
                  { kind: 'field', type: 'number', id: 'hp' },
                  { kind: 'text', text: 'из максимума' },
                  { kind: 'field', type: 'number', id: 'hp_max' },
                ],
                [{ kind: 'field', type: 'text', id: 'motto' }],
                [
                  { kind: 'text', text: 'Удача' },
                  { kind: 'dice', formula: '2d6' },
                ],
                [{ kind: 'dice', formula: '1d20+str' }],
              ],
            },
            {
              title: 'Широкая',
              width: '1/3',
              columns: 2,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'wide_a' },
                  { kind: 'field', type: 'text', id: 'wide_b' },
                ],
              ],
            },
            {
              title: 'Атаки',
              width: '1/2',
              columns: 2,
              repeat: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'attack' },
                  { kind: 'field', type: 'number', id: 'bonus' },
                ],
              ],
            },
            {
              width: 'full',
              rows: [
                [
                  { kind: 'text', text: 'Заметки' },
                  { kind: 'field', type: 'text', id: 'notes' },
                ],
              ],
            },
            {
              title: 'Отметки',
              rows: [
                [
                  { kind: 'text', text: 'Отдых' },
                  { kind: 'field', type: 'check', id: 'rested' },
                ],
              ],
            },
            {
              title: 'Пусто',
              repeat: true,
              rows: [[{ kind: 'field', type: 'text', id: 'item' }]],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] }],
    },
  ],
} as const;

type Box = { x: number; y: number; width: number; height: number };

const RECORDS = [
  record('sheet:brok', { set: 'pc', order: 0 }),
  record('sheet:liza', { set: 'pc', order: 1 }),
  record('row:brok:str', { str: 14, str_tired: true }),
  record('row:brok:hp', { hp: 7, hp_max: 12 }),
  record('row:brok:motto', { motto: 'Брок' }),
  record('row:liza:motto', { motto: 'Лиза' }),
  record('row:brok:wide_a', { wide_a: LONG_VALUE, wide_b: LONG_VALUE }),
  record('row:brok:notes', { notes: 'Первая\nВторая' }),
  record('rep:brok:attack:i2', { order: 2, cells: { attack: 'Лук' } }),
  record('rep:brok:attack:i1', { order: 1, cells: { attack: 'Меч', bonus: 3 } }),
  record('rep:brok:attack:i0', { order: 2, cells: { attack: 'Нож' } }),
  record('rep:liza:attack:x', { order: 0, cells: { attack: 'Чужой' } }),
  record('row:liza:str', { str: 9 }),
] as const;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('a section with columns puts its rows on one grid, and the short row leaves its last cell empty', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const section = region(page, 'Сетка');

  // #when
  const [first, second] = await Promise.all([
    boxes(rowsOf(section).nth(0)),
    boxes(rowsOf(section).nth(1)),
  ]);

  // #then
  expect({
    secondRowCells: second.cells.length,
    labelX: second.cells[0]?.x,
    valueX: second.cells[1]?.x,
    valueWidth: second.cells[1]?.width,
    rowWidth: second.row.width,
  }).toEqual({
    secondRowCells: 2,
    labelX: first.cells[0]?.x,
    valueX: first.cells[1]?.x,
    valueWidth: first.cells[1]?.width,
    rowWidth: first.row.width,
  });
});

test('a grid wider than its section scrolls inside the section, not the page', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const scroller = region(page, 'Широкая').locator('[data-section-body]');

  // #then
  expect({
    section: await overflows(scroller),
    content: await overflows(page.getByRole('tabpanel')),
    page: await overflows(page.locator('html')),
  }).toEqual({ section: true, content: false, page: false });
});

test('a section with no columns flows each row inline and wraps it', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  const section = region(page, 'Строки');
  const label = await box(section.getByText('Хиты сейчас'));
  const value = await box(section.getByRole('textbox', { name: 'Хиты сейчас' }));
  const last = await box(section.getByRole('textbox', { name: 'из максимума' }));

  // #then
  expect({
    valueBesideLabel: value.x > label.x + label.width && value.y < label.y + label.height,
    lastOnNextLine: last.y >= label.y + label.height,
  }).toEqual({ valueBesideLabel: true, lastOnNextLine: true });
});

test('sections 1/3, 1/3, 1/3, 1/2, full, none and none sit three in a line, then one per line', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #when
  const { line, sections } = await sectionBoxes(page);

  // #then
  const third = (line.width - 2 * SECTION_GAP) / 3;
  const half = (line.width - SECTION_GAP) / 2;

  expect(sections.map((one) => Math.round(one.width))).toEqual(
    [third, third, third, half, line.width, line.width, line.width].map(Math.round),
  );
  expect(new Set(sections.slice(0, 3).map((one) => one.y)).size).toBe(1);
  expect(lineStarts(sections)).toEqual([0, 3, 4, 5, 6]);
});

test('below 480 px of content area every section takes the whole line', async ({
  page,
  context,
}) => {
  // #given
  await page.setViewportSize({ width: 470, height: 800 });
  await openSheet(page, context);

  // #when
  const { line, sections } = await sectionBoxes(page);

  // #then
  expect(sections.map((one) => Math.round(one.width))).toEqual(
    Array.from({ length: 7 }, () => Math.round(line.width)),
  );
});

test('a text cell shows its label', async ({ page, context }) => {
  // #given
  await openSheet(page, context);

  // #then
  await expect(region(page, 'Сетка').getByText('Ловкость', { exact: true })).toBeVisible();
});

test('stored text, number and check values show in their fields', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  const grid = region(page, 'Сетка');

  // #then
  await expect(grid.getByRole('textbox', { name: 'Сила' })).toHaveValue('14');
  await expect(grid.getByRole('checkbox', { name: 'Сила' })).toBeChecked();
  await expect(region(page, 'Строки').getByRole('textbox', { name: 'motto' })).toHaveValue('Брок');
});

test('a text value keeps its line breaks', async ({ page, context }) => {
  // #given
  await openSheet(page, context);

  // #then
  await expect(page.getByRole('textbox', { name: 'Заметки' })).toHaveValue('Первая\nВторая');
});

test('a field with no value shows an empty value area', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  const empty = region(page, 'Сетка').getByRole('textbox', { name: 'Ловкость' });

  // #then
  await expect(empty).toHaveValue('');
  await expect(empty).toBeVisible();
  await expect(region(page, 'Отметки').getByRole('checkbox', { name: 'Отдых' })).not.toBeChecked();
});

test('a dice cell is a button labelled by the preceding text cell, otherwise by its formula', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const rows = rowsOf(region(page, 'Строки'));

  // #then
  await expect(rows.nth(0)).toHaveText('Хиты сейчасиз максимума');
  expect(await valuesOf(rows.nth(0).getByRole('textbox'))).toEqual(['7', '12']);
  expect(await valuesOf(rows.nth(1).getByRole('textbox'))).toEqual(['Брок']);
  await expect(rows.nth(2)).toHaveText('УдачаУдача');
  await expect(rows.nth(2).getByRole('button')).toHaveText(['Удача']);
  await expect(rows.nth(3).getByRole('button')).toHaveText(['1d20+str']);
});

test('a field is named by the preceding text cell, otherwise by its id', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const section = region(page, 'Строки');

  // #then
  const names = await section
    .getByRole('textbox')
    .evaluateAll((values) => values.map((value) => value.getAttribute('aria-label')));

  expect(names).toEqual(['Хиты сейчас', 'из максимума', 'motto']);
  await expect(section.getByRole('textbox', { name: 'motto' })).toHaveAccessibleName('motto');
});

test("a repeat section shows this sheet's instances by order, then id, and no other sheet's", async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #then
  expect(await valuesOf(region(page, 'Атаки').getByRole('textbox', { name: 'attack' }))).toEqual([
    'Меч',
    'Нож',
    'Лук',
  ]);
});

test("the other character's tab shows its own instances and values only", async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #when
  await page.getByRole('tab', { name: 'Лиза' }).click();

  // #then
  await expect(region(page, 'Сетка').getByRole('textbox', { name: 'Сила' })).toHaveValue('9');
  expect(await valuesOf(region(page, 'Атаки').getByRole('textbox', { name: 'attack' }))).toEqual([
    'Чужой',
  ]);
});

test('rows 2 and 4 of a section use surface-stripe, rows 1 and 3 do not', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const rows = rowsOf(region(page, 'Строки'));
  const stripe = await tokenColor(page, '--color-surface-stripe');

  // #then
  expect({
    first: await cssValue(rows.nth(0), 'background-color'),
    second: await renderedColor(rows.nth(1), 'background-color'),
    third: await cssValue(rows.nth(2), 'background-color'),
    fourth: await renderedColor(rows.nth(3), 'background-color'),
  }).toEqual({ first: TRANSPARENT, second: stripe, third: TRANSPARENT, fourth: stripe });
});

test('repeat blocks stripe the same way, each block as one', async ({ page, context }) => {
  // #given: all rows of a repeat section form one repeat block (CAP-5), so the block stripes.
  await openSheet(page, context);
  const rows = region(page, 'Атаки').locator('[data-repeat-block]');

  // #then
  expect({
    first: await cssValue(rows.nth(0), 'background-color'),
    second: await renderedColor(rows.nth(1), 'background-color'),
  }).toEqual({ first: TRANSPARENT, second: await tokenColor(page, '--color-surface-stripe') });
});

test('a titled section has a section-heading in accent and a left rule in line', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const section = region(page, 'Сетка');
  const heading = section.getByRole('heading', { level: 2, name: 'Сетка' });

  // #then
  expect({
    size: await cssValue(heading, 'font-size'),
    weight: await cssValue(heading, 'font-weight'),
    color: await renderedColor(heading, 'color'),
    rule: await cssValue(section, 'border-left-style'),
    ruleColor: await renderedColor(section, 'border-left-color'),
  }).toEqual({
    size: '14px',
    weight: '600',
    color: await tokenColor(page, '--color-accent'),
    rule: 'solid',
    ruleColor: await tokenColor(page, '--color-line'),
  });
});

test('a section with no title has no heading and keeps the left rule', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  const section = page
    .locator('[data-section]')
    .filter({ has: page.getByRole('textbox', { name: 'Заметки' }) });

  // #then
  expect({
    headings: await section.getByRole('heading').count(),
    rule: await cssValue(section, 'border-left-style'),
    ruleColor: await renderedColor(section, 'border-left-color'),
  }).toEqual({ headings: 0, rule: 'solid', ruleColor: await tokenColor(page, '--color-line') });
});

test('a value has a dotted underline in line-strong, and every row is at least 32 px high', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const value = region(page, 'Сетка').getByRole('textbox', { name: 'Сила' });

  const heights = await Promise.all(
    ['Сетка', 'Строки', 'Широкая', 'Атаки', 'Отметки'].map((name) =>
      rowsOf(region(page, name)).evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().height),
      ),
    ),
  );

  // #then
  expect({
    style: await cssValue(value, 'border-bottom-style'),
    color: await renderedColor(value, 'border-bottom-color'),
    rows: heights.flat().length,
    shortRows: heights.flat().filter((height) => height < 32),
  }).toEqual({
    style: 'dotted',
    color: await tokenColor(page, '--color-line-strong'),
    rows: 11,
    shortRows: [],
  });
});

test('a repeat section with no instances shows its heading and no row', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const section = region(page, 'Пусто');

  // #then
  await expect(section.getByRole('heading', { name: 'Пусто' })).toBeVisible();
  await expect(rowsOf(section)).toHaveCount(0);
});

function region(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('region', { name });
}

// The values of the matched fields, in page order.
function valuesOf(fields: Locator): Promise<string[]> {
  return fields.evaluateAll((elements) =>
    elements.map((element) =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : '',
    ),
  );
}

function rowsOf(section: Locator): Locator {
  return section.locator('[data-row]');
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();

  if (found === null) {
    throw new Error('the element is not rendered');
  }

  return found;
}

async function boxes(row: Locator): Promise<{ row: Box; cells: Box[] }> {
  return row.evaluate((element) => ({
    row: element.getBoundingClientRect().toJSON(),
    cells: [...element.children].map((child) => child.getBoundingClientRect().toJSON()),
  }));
}

function overflows(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element.scrollWidth > element.clientWidth);
}

// The sections of the open tab, in preset order, and the line they wrap in.
async function sectionBoxes(page: Page): Promise<{ line: Box; sections: Box[] }> {
  const line = page.getByRole('tabpanel').locator('[data-sheet-body]');

  return {
    line: await box(line),
    sections: await line
      .locator('[data-section]')
      .evaluateAll((sections) =>
        sections.map((section) => section.getBoundingClientRect().toJSON()),
      ),
  };
}

// The index of each section that starts a new line.
function lineStarts(sections: readonly Box[]): number[] {
  return sections.flatMap((one, index) =>
    index === 0 || one.y > (sections[index - 1]?.y ?? 0) ? [index] : [],
  );
}

// The first character's tab, open on its seeded sheet.
async function openSheet(page: Page, context: BrowserContext): Promise<void> {
  await openRoom(page, context, RECORDS, JSON.stringify(PRESET));
  await expect(page.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
}
