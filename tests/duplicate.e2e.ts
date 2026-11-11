import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { JsonValue } from '@/core/json';

import { cssValue, renderedColor, tokenColor } from './support/colors';
import {
  afterSettling,
  openBackground,
  openRoom,
  record,
  sheetRecord,
  watchCommands,
  type StoredRecord,
} from './support/room';

const ADD_CHARACTER = 'Добавить персонажа';
const ADD_NPC = 'Добавить NPC';
const ACTIONS = 'Действия с листом';
const DUPLICATE = 'Дублировать…';
const CONFIRM = 'Дублировать';
const CANCEL = 'Отменить';
const COUNT = 'Количество копий (1–50)';
const FAILED = 'Не удалось дублировать. Попробуйте ещё раз.';
const CHANNEL = 'app.muster-roll/ui';
const BAD_COUNT = 'Нужно число от 1 до 50';
const NPC_NAME = 'Имя NPC';

const D20_PRESET = readFileSync(new URL('fixtures/presets/d20.json', import.meta.url), 'utf8');

// "Скелет 1" with values in both plain rows, two attack rows and a token link, then "Гоблин".
const SKELETON: readonly StoredRecord[] = [
  npc('skel', 'Скелет 1', 0),
  record('row:skel:ac', { ac: 13, hp: 7 }),
  record('row:skel:str', { str: 2, elite: true }),
  record('rep:skel:attack:i1', { order: 0, cells: { attack: 'Меч', bonus: 2 } }),
  record('rep:skel:attack:i2', { order: 1, cells: { attack: 'Лук', bonus: 1 } }),
  record('link:token1', 'skel'),
  npc('gob', 'Гоблин', 1),
];

// What a block of SKELETON shows.
const SKELETON_VALUES = {
  ac: '13',
  hp: '7',
  str: '2',
  elite: true,
  attacks: ['Меч', 'Лук'],
  bonuses: ['2', '1'],
};

// What every copy of SKELETON stores, by key form, with its ids taken out.
const SKELETON_COPY = [
  { form: 'rep:attack', d: { order: 0, cells: { attack: 'Меч', bonus: 2 } } },
  { form: 'rep:attack', d: { order: 1, cells: { attack: 'Лук', bonus: 1 } } },
  { form: 'row:ac', d: { ac: 13, hp: 7 } },
  { form: 'row:str', d: { str: 2, elite: true } },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('"⋯" of an NPC offers "Дублировать…" before "Удалить", and a character\'s offers only "Удалить"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 }), ...SKELETON]);

  await page.getByRole('button', { name: ACTIONS }).click();

  const character = await page.getByRole('menuitem').allTextContents();

  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'NPC' }).click();

  // #when
  await actionsButton(page, 'Скелет 1').click();

  // #then
  expect({ character, npc: await page.getByRole('menuitem').allTextContents() }).toEqual({
    character: ['Удалить'],
    npc: [DUPLICATE, 'Удалить'],
  });
});

test('"Дублировать…" opens a count of 1 in the NPC block, focused, with "Дублировать" and "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);

  // #when
  await askDuplicate(page, 'Скелет 1');

  // #then
  const block = countBlock(page, 'Скелет 1');

  await expect(countField(page)).toBeFocused();
  expect({
    blocks: await page.getByRole('group', { name: COUNT }).count(),
    value: await countField(page).inputValue(),
    controls: await block.getByRole('button').allTextContents(),
    error: await block.getByText(BAD_COUNT).count(),
  }).toEqual({ blocks: 1, value: '1', controls: [CONFIRM, CANCEL], error: 0 });
});

test('the count block sits on surface-bar with a line border and rounded-md', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);

  // #when
  await askDuplicate(page, 'Скелет 1');

  // #then
  const block = countBlock(page, 'Скелет 1');

  expect({
    background: await renderedColor(block, 'background-color'),
    border: await renderedColor(block, 'border-top-color'),
    borderStyle: await cssValue(block, 'border-top-style'),
    radius: await cssValue(block, 'border-top-left-radius'),
  }).toEqual({
    background: await tokenColor(page, '--color-surface-bar'),
    border: await tokenColor(page, '--color-line'),
    borderStyle: 'solid',
    radius: '6px',
  });
});

for (const [name, text] of [
  ['an empty count', ''],
  ['a count that is not a number', 'девять'],
  ['a fractional count', '1.5'],
  ['a count below 1', '0'],
  ['a count above 50', '51'],
] as const) {
  test(`${name} shows "${BAD_COUNT}", keeps the field open and writes nothing`, async ({
    page,
    context,
  }) => {
    // #given
    await openNpcTab(page, context, SKELETON);
    await watchCommands(page);

    const before = await afterSettling(page);

    await askDuplicate(page, 'Скелет 1');
    await countField(page).fill(text);

    // #when
    await countBlock(page, 'Скелет 1').getByRole('button', { name: CONFIRM }).click();

    // #then
    await expect(countBlock(page, 'Скелет 1').getByText(BAD_COUNT)).toBeVisible();
    expect({
      invalid: await countField(page).getAttribute('aria-invalid'),
      value: await countField(page).inputValue(),
      after: await afterSettling(page),
      blocks: await blockNames(page),
    }).toEqual({
      invalid: 'true',
      value: text,
      after: before,
      blocks: ['Скелет 1', 'Гоблин'],
    });
  });
}

test('Enter on a bad count shows the message too, and a change clears it', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await askDuplicate(page, 'Скелет 1');
  await countField(page).fill('0');

  // #when
  await countField(page).press('Enter');

  const shown = await countBlock(page, 'Скелет 1').getByText(BAD_COUNT).count();

  await countField(page).fill('2');

  // #then
  expect({
    shown,
    afterChange: await countBlock(page, 'Скелет 1').getByText(BAD_COUNT).count(),
  }).toEqual({ shown: 1, afterChange: 0 });
});

test('a count of 9 on "Скелет 1" adds "Скелет 2" to "Скелет 10" at the end with the same values, and focus returns to "⋯"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await askDuplicate(page, 'Скелет 1');
  await countField(page).fill('9');

  // #when
  await countBlock(page, 'Скелет 1').getByRole('button', { name: CONFIRM }).click();
  await expect(npcNames(page)).toHaveCount(11);

  // #then
  const copies = Array.from({ length: 9 }, (_unused, index) => `Скелет ${index + 2}`);
  const shownValues = [];

  for (const copy of copies) {
    // oxlint-disable-next-line no-await-in-loop
    shownValues.push(await blockValues(page, copy));
  }

  await expect(actionsButton(page, 'Скелет 1')).toBeFocused();
  expect({
    blocks: await blockNames(page),
    countBlocks: await page.getByRole('group', { name: COUNT }).count(),
    shownValues,
  }).toEqual({
    blocks: ['Скелет 1', 'Гоблин', ...copies],
    countBlocks: 0,
    shownValues: copies.map(() => SKELETON_VALUES),
  });
});

test('the nine copies are new sheet, row and rep records at c: 1 under new nanoid ids, with no link', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);
  await duplicateBy(page, 'Скелет 1', '9');
  await expect(npcNames(page)).toHaveCount(11);

  // #when
  const { stored } = await afterSettling(page);

  // #then
  const seeded = new Set(SKELETON.map((one) => one.k));
  const added = Object.values(stored).filter((one) => !seeded.has(one.k));
  const sheetIds = [...new Set(added.map((one) => one.k.split(':')[1] ?? ''))];

  expect({
    nanoids: sheetIds.map((id) => /^[A-Za-z0-9_-]{21}$/.test(id)),
    versions: [...new Set(added.map((one) => one.c))],
    links: Object.keys(stored).filter((key) => key.startsWith('link:')),
    copies: sheetIds
      .map((id) => ({
        sheet: stored[`sheet:${id}`]?.d ?? null,
        values: added
          .filter((one) => one.k.split(':')[1] === id && !one.k.startsWith('sheet:'))
          .map((one) => ({ form: formOf(one.k), d: one.d }))
          .sort(byJson),
      }))
      .sort(
        (first, second) => Number(Object(first.sheet).order) - Number(Object(second.sheet).order),
      ),
    source: SKELETON.map((one) => stored[one.k]),
  }).toEqual({
    nanoids: Array.from({ length: 9 }, () => true),
    versions: [1],
    links: ['link:token1'],
    copies: Array.from({ length: 9 }, (_unused, index) => ({
      sheet: { kind: 'npc', name: `Скелет ${index + 2}`, order: index + 2 },
      values: SKELETON_COPY,
    })),
    source: [...SKELETON],
  });
});

test('copies of an unnumbered "Скелет" are "Скелет 1" and "Скелет 2", and the source keeps its name', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [npc('skel', 'Скелет', 0)]);

  // #when
  await duplicateBy(page, 'Скелет', '2');
  await expect(npcNames(page)).toHaveCount(3);

  // #then
  expect(await blockNames(page)).toEqual(['Скелет', 'Скелет 1', 'Скелет 2']);
});

test('copies continue after the highest numbered NPC and skip another base', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [
    npc('skel', 'Скелет 1', 0),
    npc('high', 'Скелет 7', 1),
    npc('archer', 'Скелет-лучник 30', 2),
  ]);

  // #when
  await duplicateBy(page, 'Скелет 1', '2');
  await expect(npcNames(page)).toHaveCount(5);

  // #then
  expect(await blockNames(page)).toEqual([
    'Скелет 1',
    'Скелет 7',
    'Скелет-лучник 30',
    'Скелет 8',
    'Скелет 9',
  ]);
});

test('an edit of one copy leaves the source and the other copy as they were', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);
  await duplicateBy(page, 'Скелет 1', '2');
  await expect(npcNames(page)).toHaveCount(4);

  // #when
  await block(page, 'Скелет 2').getByRole('textbox', { name: 'Хиты', exact: true }).fill('3');
  await rowFields(page, 'Скелет 2', 'attack').first().fill('Топор');
  await page.keyboard.press('Tab');
  // Only the edited copy can hold these values, so the storage has both edits once they show.
  await expect
    .poll(async () => {
      const stored = JSON.stringify((await afterSettling(page)).stored);

      return [stored.includes('"hp":3'), stored.includes('"attack":"Топор"')];
    })
    .toEqual([true, true]);
  await reloadOnNpcTab(page, context);

  // #then: the reload shows what the GM's storage holds.
  expect({
    edited: await blockValues(page, 'Скелет 2'),
    other: await blockValues(page, 'Скелет 3'),
    source: await blockValues(page, 'Скелет 1'),
  }).toEqual({
    edited: { ...SKELETON_VALUES, hp: '3', attacks: ['Топор', 'Лук'] },
    other: SKELETON_VALUES,
    source: SKELETON_VALUES,
  });
});

test('Esc closes the count, writes nothing and returns the focus to "⋯"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);

  const before = await afterSettling(page);

  await askDuplicate(page, 'Скелет 1');
  await countField(page).fill('4');

  // #when
  await page.keyboard.press('Escape');

  // #then
  await expect(actionsButton(page, 'Скелет 1')).toBeFocused();
  expect({
    blocks: await page.getByRole('group', { name: COUNT }).count(),
    after: await afterSettling(page),
  }).toEqual({ blocks: 0, after: before });
});

test('"Отменить" closes the count, writes nothing and returns the focus to "⋯"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);

  const before = await afterSettling(page);

  await askDuplicate(page, 'Скелет 1');
  await countField(page).fill('4');

  // #when
  await countBlock(page, 'Скелет 1').getByRole('button', { name: CANCEL }).click();

  // #then
  await expect(actionsButton(page, 'Скелет 1')).toBeFocused();
  expect({
    blocks: await page.getByRole('group', { name: COUNT }).count(),
    after: await afterSettling(page),
  }).toEqual({ blocks: 0, after: before });
});

test('the keyboard opens the menu, picks "Дублировать…" and lands in the count', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await actionsButton(page, 'Скелет 1').focus();

  // #when
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: DUPLICATE })).toBeFocused();
  await page.keyboard.press('Enter');

  // #then
  await expect(countField(page)).toBeFocused();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(npcNames(page)).toHaveCount(4);
});

test('picking "Дублировать…" again while the count is open moves the focus back into it', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await askDuplicate(page, 'Скелет 1');
  await countField(page).fill('4');
  await actionsButton(page, 'Скелет 1').focus();

  // #when
  await actionsButton(page, 'Скелет 1').click();
  await page.getByRole('menuitem', { name: DUPLICATE }).click();

  // #then
  await expect(countField(page)).toBeFocused();
  expect({
    blocks: await page.getByRole('group', { name: COUNT }).count(),
    value: await countField(page).inputValue(),
  }).toEqual({ blocks: 1, value: '4' });
});

test('a sent count keeps the block open until the copies arrive, and a rejection shows under the field', async ({
  page,
  context,
}) => {
  // #given: with no background, the command gets no answer but the rejection the test sends.
  const background = await openNpcTab(page, context, SKELETON);

  await watchCommands(page);
  await background.close();
  await duplicateBy(page, 'Скелет 1', '3');
  await expect.poll(() => sentDuplicates(page)).toHaveLength(1);

  const waiting = await countBlock(page, 'Скелет 1').count();
  const [sent] = await sentDuplicates(page);

  // #when
  await postToWindow(page, { t: 'command-rejected', id: sent ?? '', reason: 'too-large' });

  // #then
  await expect(countBlock(page, 'Скелет 1').getByText(FAILED)).toBeVisible();
  expect({
    waiting,
    value: await countField(page).inputValue(),
    blocks: await blockNames(page),
  }).toEqual({ waiting: 1, value: '3', blocks: ['Скелет 1', 'Гоблин'] });
});

function npc(id: string, name: string, order: number): StoredRecord {
  return record(`sheet:${id}`, { kind: 'npc', name, order });
}

async function openNpcTab(
  page: Page,
  context: BrowserContext,
  records: readonly StoredRecord[],
): Promise<Page> {
  const background = await openRoom(page, context, records, D20_PRESET);

  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(page.getByRole('button', { name: ADD_NPC })).toBeVisible();

  return background;
}

// The ids of the `sheet-duplicate` commands seen since `watchCommands`.
async function sentDuplicates(page: Page): Promise<string[]> {
  const seen = await page.evaluate(() => window.seenCommands);

  return seen.filter((command) => command.type === 'sheet-duplicate').map((command) => command.id);
}

// Plays the background's part: the window cannot tell this message from one the engine sent.
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

// Closes every background the test opened, reloads the window and opens one background again.
async function reloadOnNpcTab(page: Page, context: BrowserContext): Promise<void> {
  for (const open of context.pages()) {
    if (open !== page) {
      // oxlint-disable-next-line no-await-in-loop
      await open.close();
    }
  }

  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD_CHARACTER })).toBeVisible();
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(page.getByRole('button', { name: ADD_NPC })).toBeVisible();
}

async function askDuplicate(page: Page, name: string): Promise<void> {
  await actionsButton(page, name).click();
  await page.getByRole('menuitem', { name: DUPLICATE }).click();
  await expect(countBlock(page, name)).toBeVisible();
}

async function duplicateBy(page: Page, name: string, count: string): Promise<void> {
  await askDuplicate(page, name);
  await countField(page).fill(count);
  await countBlock(page, name).getByRole('button', { name: CONFIRM }).click();
}

// The NPC blocks are the items of a list, each a region named by its NPC.
function block(page: Page, name: string): Locator {
  return page
    .getByRole('tabpanel')
    .getByRole('listitem')
    .getByRole('region', { name, exact: true });
}

function countBlock(page: Page, name: string): Locator {
  return block(page, name).getByRole('group', { name: COUNT });
}

function countField(page: Page): Locator {
  return page.getByRole('textbox', { name: COUNT });
}

function actionsButton(page: Page, name: string): Locator {
  return block(page, name).getByRole('button', { name: ACTIONS });
}

function npcNames(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: NPC_NAME });
}

function rowFields(page: Page, name: string, field: string): Locator {
  return block(page, name)
    .getByRole('region', { name: 'Атаки' })
    .getByRole('textbox', { name: field, exact: true });
}

// The first region of an item is its block, as the preset's own sections sit inside it.
async function blockNames(page: Page): Promise<string[]> {
  return page
    .getByRole('tabpanel')
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => item.querySelector('section')?.getAttribute('aria-label') ?? ''),
    );
}

async function blockValues(page: Page, name: string): Promise<typeof SKELETON_VALUES> {
  const shown = block(page, name);

  return {
    ac: await shown.getByRole('textbox', { name: 'КД', exact: true }).inputValue(),
    hp: await shown.getByRole('textbox', { name: 'Хиты', exact: true }).inputValue(),
    str: await shown.getByRole('textbox', { name: 'Сила', exact: true }).inputValue(),
    elite: await shown.getByRole('checkbox', { name: 'Сила' }).isChecked(),
    attacks: await valuesOf(rowFields(page, name, 'attack')),
    bonuses: await valuesOf(rowFields(page, name, 'bonus')),
  };
}

function valuesOf(fields: Locator): Promise<string[]> {
  return fields.evaluateAll((elements) =>
    elements.map((element) =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : '',
    ),
  );
}

// `row:{rowId}` or `rep:{sectionId}`: a value key with its sheet and instance ids taken out.
function formOf(key: string): string {
  const [form = '', , part = ''] = key.split(':');

  return `${form}:${part}`;
}

function byJson(first: JsonValue, second: JsonValue): number {
  return JSON.stringify(first) < JSON.stringify(second) ? -1 : 1;
}
