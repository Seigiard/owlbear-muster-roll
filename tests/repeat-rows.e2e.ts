import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';

import {
  openBackground,
  openRoom,
  record,
  storedData,
  storedRecords,
  type StoredRecord,
} from './support/room';

const ADD_CHARACTER = 'Добавить персонажа';
const ADD_ROW = 'Добавить строку';
const CHANNEL = 'app.muster-roll/ui';
const BAD_NUMBER = 'Нужно число';

// The nanoid default: 21 characters of its URL-safe alphabet.
const NANOID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

// One repeat section on a grid wider than its row, and one that flows inline and opens with a label.
const PRESET = {
  v: 1,
  character: {
    sections: [
      {
        title: 'Сетка',
        columns: 2,
        rows: [
          [
            { kind: 'text', text: 'Сила' },
            { kind: 'field', type: 'number', id: 'str' },
          ],
        ],
      },
      {
        title: 'Атаки',
        columns: 3,
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'attack' },
            { kind: 'field', type: 'number', id: 'bonus' },
          ],
        ],
      },
      {
        title: 'Вещи',
        repeat: true,
        rows: [
          [
            { kind: 'text', text: 'Вещь' },
            { kind: 'field', type: 'text', id: 'item' },
          ],
        ],
      },
    ],
  },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
} as const;

const ATTACK_COLUMNS = PRESET.character.sections[1].columns;

const RECORDS = [
  record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
  record('sheet:liza', { kind: 'pc', name: 'Лиза', order: 1 }),
  record('rep:brok:attack:i1', { order: 1, cells: { attack: 'Меч', bonus: 3 } }),
  record('rep:brok:attack:i2', { order: 2, cells: { attack: 'Лук' } }),
  record('rep:liza:attack:x', { order: 0, cells: { attack: 'Чужой' } }),
] as const;

const deltaSchema = z.object({ t: z.literal('delta'), engine: z.string(), seq: z.number() });

const rowAddSchema = z.object({
  t: z.literal('command'),
  command: z.object({ type: z.literal('repeat-row-add'), instanceId: z.string() }),
});

declare global {
  interface Window {
    wireTexts: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('"Добавить строку" adds a last row with a nanoid id, an order above the highest and no values, and focuses its first field', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #when
  await addButton(page, 'Атаки').click();
  await expect(attackFields(page)).toHaveCount(3);

  // #then
  const added = await addedRows(page, 'rep:brok:attack:');

  expect({
    ids: added.map((one) => NANOID_PATTERN.test(one.id)),
    data: added.map((one) => one.d),
    shown: await valuesOf(attackFields(page)),
    focused: await isFocused(attackFields(page).nth(2)),
  }).toEqual({
    ids: [true],
    data: [{ order: 3, cells: {} }],
    shown: ['Меч', 'Лук', ''],
    focused: true,
  });
});

test('a new row focuses its first field when the row opens with a label', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #when
  await addButton(page, 'Вещи').click();

  // #then
  await expect(region(page, 'Вещи').getByRole('textbox', { name: 'Вещь' })).toBeFocused();
});

test('rows added to one character leave the other with its own rows', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  await addButton(page, 'Атаки').click();
  await addButton(page, 'Атаки').click();
  await expect(attackFields(page)).toHaveCount(4);

  // #when
  await page.getByRole('tab', { name: 'Лиза' }).click();

  // #then
  expect({
    shown: await valuesOf(attackFields(page)),
    stored: (await storedRecords(page, 'rep:liza:')).map((one) => one.k),
  }).toEqual({ shown: ['Чужой'], stored: ['rep:liza:attack:x'] });
});

test('a row that arrives after the GM moved to another field leaves the focus in that field', async ({
  page,
  context,
}) => {
  // #given: with no background, the add gets no answer but the delta the test sends.
  const { engine, seq } = await answerOnlyFromTest(page, context);

  await addButton(page, 'Атаки').click();
  await expect.poll(async () => (await sentRowAdds(page)).length).toBe(1);

  const [instanceId] = await sentRowAdds(page);

  await strField(page).click();

  // #when
  await postToWindow(page, {
    t: 'delta',
    engine,
    seq: seq + 1,
    records: [
      {
        k: `rep:brok:attack:${instanceId ?? ''}`,
        d: { order: 3, cells: {} },
        c: 1,
        a: 'mock-connection',
      },
    ],
    notices: [],
  });
  await expect(attackFields(page)).toHaveCount(3);

  // #then
  await expect(strField(page)).toBeFocused();
});

test('a delete that lands after the GM moved to another field leaves the focus in that field', async ({
  page,
  context,
}) => {
  // #given: with no background, the delete gets no answer but the delta the test sends.
  const { engine, seq } = await answerOnlyFromTest(page, context);

  await deleteButton(page, 1).click();
  await strField(page).click();

  // #when
  await postToWindow(page, {
    t: 'delta',
    engine,
    seq: seq + 1,
    records: [{ k: 'rep:brok:attack:i1', d: null, c: 2, a: 'mock-connection' }],
    notices: [],
  });
  await expect(attackFields(page)).toHaveCount(1);

  // #then
  await expect(strField(page)).toBeFocused();
});

test('"Удалить" tombstones the row, removes it and moves the focus to the next row\'s "Удалить"', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #when
  await deleteButton(page, 1).click();

  // #then
  await expect.poll(() => storedData(page, 'rep:brok:attack:i1')).toBeNull();
  await expect(attackFields(page)).toHaveCount(1);
  expect({
    shown: await valuesOf(attackFields(page)),
    focusedRow: await focusedRowValue(page),
  }).toEqual({ shown: ['Лук'], focusedRow: 'Лук' });
  await expect(deleteButton(page, 1)).toBeFocused();
});

test('deleting the last row moves the focus to "Добавить строку"', async ({ page, context }) => {
  // #given
  await openSheet(page, context);

  // #when
  await deleteButton(page, 2).click();

  // #then
  await expect(attackFields(page)).toHaveCount(1);
  await expect(addButton(page, 'Атаки')).toBeFocused();
});

test('each "Удалить" shows the command and is named by its row position from 1', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #then
  await expect(deleteButton(page, 1)).toHaveText('Удалить');
  await expect(deleteButton(page, 2)).toHaveText('Удалить');
  expect(await deleteButtonNames(region(page, 'Атаки'))).toEqual([
    'Удалить строку 1',
    'Удалить строку 2',
  ]);
});

test('a field of an added row saves into its cells, keeps the order, and a cleared field has no key', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  await addButton(page, 'Атаки').click();
  await expect(attackFields(page)).toHaveCount(3);

  const [added] = await addedRows(page, 'rep:brok:attack:');
  const key = `rep:brok:attack:${added?.id ?? ''}`;
  const bonus = region(page, 'Атаки').getByRole('textbox', { name: 'bonus' }).nth(2);

  // #when
  await attackFields(page).nth(2).fill('Топор');
  await bonus.fill('2');
  await page.keyboard.press('Tab');
  await expect
    .poll(() => storedData(page, key))
    .toEqual({ order: 3, cells: { attack: 'Топор', bonus: 2 } });
  await bonus.fill('');
  await page.keyboard.press('Tab');

  // #then
  await expect.poll(() => storedData(page, key)).toEqual({ order: 3, cells: { attack: 'Топор' } });
});

test('a bad number in a repeat row shows the message and is not saved', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const bonus = region(page, 'Атаки').getByRole('textbox', { name: 'bonus' }).nth(1);

  // #when
  await bonus.fill('abc');
  await page.keyboard.press('Tab');

  // #then
  await expect(bonus).toHaveAccessibleDescription(BAD_NUMBER);
  expect(await storedData(page, 'rep:brok:attack:i2')).toEqual({
    order: 2,
    cells: { attack: 'Лук' },
  });
});

test('two rows with one order show by id, the same after a reload', async ({ page, context }) => {
  // #given
  const background = await openSheet(page, context, [
    record('rep:brok:attack:b', { order: 5, cells: { attack: 'Б' } }),
    record('rep:brok:attack:a', { order: 5, cells: { attack: 'А' } }),
  ]);

  const before = await valuesOf(attackFields(page));

  // #when
  await reload(page, context, background);

  // #then
  expect({ before, after: await valuesOf(attackFields(page)) }).toEqual({
    before: ['Меч', 'Лук', 'А', 'Б'],
    after: ['Меч', 'Лук', 'А', 'Б'],
  });
});

test('after adds and deletes a reload shows the same rows', async ({ page, context }) => {
  // #given
  const background = await openSheet(page, context);

  await addButton(page, 'Атаки').click();
  await expect(attackFields(page)).toHaveCount(3);
  await attackFields(page).nth(2).fill('Топор');
  await page.keyboard.press('Tab');
  await deleteButton(page, 1).click();
  await expect(attackFields(page)).toHaveCount(2);
  await expect.poll(() => storedData(page, 'rep:brok:attack:i1')).toBeNull();
  await expect
    .poll(async () => (await addedRows(page, 'rep:brok:attack:')).map((one) => one.d))
    .toEqual([{ order: 3, cells: { attack: 'Топор' } }]);

  // #when
  await reload(page, context, background);

  // #then
  expect(await valuesOf(attackFields(page))).toEqual(['Лук', 'Топор']);
});

test('in a section with columns every "Удалить" sits in one track after the grid, and "Добавить строку" sits under the rows', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  const section = region(page, 'Атаки');

  // #when
  const placement = await section
    .locator('[data-row]')
    .first()
    .evaluate((row, columns) => {
      const grid = row.parentElement;

      if (grid === null) {
        return { tracks: 0, offsets: [] };
      }

      const style = getComputedStyle(grid);
      const tracks = style.gridTemplateColumns.split(' ').map((track) => Number.parseFloat(track));
      const gap = Number.parseFloat(style.columnGap);
      const presetColumns = tracks.slice(0, columns).reduce((sum, track) => sum + track + gap, 0);
      const extraTrackStart = grid.getBoundingClientRect().left + presetColumns;

      return {
        tracks: tracks.length,
        offsets: [...grid.querySelectorAll('button')].map((button) =>
          Math.round(button.getBoundingClientRect().left - extraTrackStart),
        ),
      };
    }, ATTACK_COLUMNS);

  const lastRow = await box(section.locator('[data-row]').nth(1));
  const add = await box(addButton(page, 'Атаки'));

  // #then
  expect({ ...placement, addBelow: add.y >= lastRow.y + lastRow.height }).toEqual({
    tracks: ATTACK_COLUMNS + 1,
    offsets: [0, 0],
    addBelow: true,
  });
});

test('in a section with no columns "Удалить" ends its row', async ({ page, context }) => {
  // #given
  await openSheet(page, context, [
    record('rep:brok:item:v1', { order: 0, cells: { item: 'Верёвка' } }),
  ]);
  const row = region(page, 'Вещи').locator('[data-row]').first();

  // #when
  const order = await row.evaluate((element) =>
    [...element.querySelectorAll('input, textarea, button')].map(
      (control) => control.getAttribute('aria-label') ?? '',
    ),
  );

  // #then
  expect(order).toEqual(['Вещь', 'Удалить строку 1']);
});

function strField(page: Page): Locator {
  return region(page, 'Сетка').getByRole('textbox', { name: 'Сила', exact: true });
}

function region(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('region', { name });
}

function attackFields(page: Page): Locator {
  return region(page, 'Атаки').getByRole('textbox', { name: 'attack', exact: true });
}

function addButton(page: Page, section: string): Locator {
  return region(page, section).getByRole('button', { name: ADD_ROW, exact: true });
}

function deleteButton(page: Page, position: number): Locator {
  return region(page, 'Атаки').getByRole('button', {
    name: `Удалить строку ${position}`,
    exact: true,
  });
}

function deleteButtonNames(section: Locator): Promise<string[]> {
  return section
    .getByRole('button', { name: /^Удалить строку/ })
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''));
}

// The attack value of the row that holds the focused control.
function focusedRowValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const row = document.activeElement?.closest('[data-row]');
    const value = row?.querySelector('textarea');

    return value?.value ?? '';
  });
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

async function isFocused(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element === document.activeElement);
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();

  if (found === null) {
    throw new Error('the element is not rendered');
  }

  return found;
}

// The stored rows under `prefix` that were not seeded, with the id the window gave each.
async function addedRows(page: Page, prefix: string): Promise<{ id: string; d: JsonValue }[]> {
  const seeded = new Set<string>(RECORDS.map((one) => one.k));

  return (await storedRecords(page, prefix))
    .filter((one) => !seeded.has(one.k))
    .map((one) => ({ id: one.k.slice(prefix.length), d: one.d }));
}

// Saves one field, so the background's delta names its engine and sequence, then closes the
// background. A delta the test then posts with the next sequence is one the window applies.
async function answerOnlyFromTest(
  page: Page,
  context: BrowserContext,
): Promise<{ engine: string; seq: number }> {
  const background = await openSheet(page, context);

  await watchWire(page);
  await strField(page).fill('15');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await deltas(page)).length).toBe(1);
  await background.close();

  const [delta] = await deltas(page);

  return { engine: delta?.engine ?? '', seq: delta?.seq ?? 0 };
}

async function watchWire(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.wireTexts = [];

    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      window.wireTexts.push(JSON.stringify(event.data));
    });
  }, CHANNEL);
}

async function wireMessages<Schema extends z.ZodType>(
  page: Page,
  schema: Schema,
): Promise<z.infer<Schema>[]> {
  const texts = await page.evaluate(() => window.wireTexts);

  return texts.flatMap((text) => {
    const parsed = schema.safeParse(JSON.parse(text));

    return parsed.success ? [parsed.data] : [];
  });
}

function deltas(page: Page): Promise<z.infer<typeof deltaSchema>[]> {
  return wireMessages(page, deltaSchema);
}

// The instance ids of the row adds this window sent.
async function sentRowAdds(page: Page): Promise<string[]> {
  return (await wireMessages(page, rowAddSchema)).map((sent) => sent.command.instanceId);
}

async function postToWindow(page: Page, message: JsonValue): Promise<void> {
  await page.evaluate(
    ([channel, text]) => {
      void window.mockPlatform.broadcast.sendMessage(channel, JSON.parse(text), {
        destination: 'LOCAL',
      });
    },
    [CHANNEL, JSON.stringify(message)] as const,
  );
}

async function reload(page: Page, context: BrowserContext, background: Page): Promise<void> {
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD_CHARACTER })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();
}

// The first character's tab, open on its seeded sheet. `records` add to the seeded ones.
async function openSheet(
  page: Page,
  context: BrowserContext,
  records: readonly StoredRecord[] = [],
): Promise<Page> {
  const background = await openRoom(
    page,
    context,
    [...RECORDS, ...records],
    JSON.stringify(PRESET),
  );

  await expect(page.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();

  return background;
}
