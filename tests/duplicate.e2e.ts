import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { JsonValue } from '@/core/json';

import { cssValue, renderedColor, tokenColor } from './support/colors';
import {
  ADD,
  afterSettling,
  connectionIdOf,
  npcBlock,
  openBackground,
  openClientBackground,
  openClientWindow,
  openRoom,
  pcSheet,
  record,
  repRecord,
  seedStorage,
  watchCommands,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const ADD_NPC = 'Добавить в «Противники»';
const DUPLICATE = 'Дублировать…';
const CONFIRM = 'Дублировать';
const CANCEL = 'Отменить';
const COUNT = 'Количество копий (1–50)';
const FAILED = 'Не удалось дублировать. Попробуйте ещё раз.';
const CHANNEL = 'app.muster-roll/ui';
const BAD_COUNT = 'Нужно число от 1 до 50';

// TASK-37: a new instance id is 8 characters of the URL-safe nanoid alphabet.
const NANOID_PATTERN = /^[A-Za-z0-9_-]{8}$/;

const D20_PRESET = readFileSync(new URL('fixtures/presets/d20.json', import.meta.url), 'utf8');

// The NPC single sheet of the d20 preset: one repeat section "Противники" of three rows. "Скелет 1"
// has a value in every row and a token link, then "Гоблин".
const SKELETON_CELLS = {
  npc_name: 'Скелет 1',
  ac: 13,
  hp: 7,
  str: 2,
  elite: true,
  attack: 'Меч',
  bonus: 2,
};

const SKELETON: readonly StoredRecord[] = [
  repRecord('npc', 'npc_name', 'skel', 0, SKELETON_CELLS),
  record('link:token1', { s: 'npc', i: 'skel' }),
  npcBlock('gob', 'Гоблин', 1),
];

// What a repeat block of SKELETON shows, its first field aside.
const SKELETON_VALUES = {
  ac: '13',
  hp: '7',
  str: '2',
  elite: true,
  attack: 'Меч',
  bonus: '2',
};

const GM: ClientParams = { client: 'a', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'p',
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('each NPC repeat block offers the GM "Дублировать…", named by its position from 1', async ({
  page,
  context,
}) => {
  // #when
  await openNpcTab(page, context, SKELETON);

  // #then
  await expect(duplicateButton(page, 1)).toHaveText(DUPLICATE);
  expect(
    await page
      .getByRole('tabpanel')
      .getByRole('button', { name: /^Дублировать блок/ })
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? '')),
  ).toEqual(['Дублировать блок 1…', 'Дублировать блок 2…']);
});

test('"Дублировать…" opens a count of 1 in its repeat block, focused, with "Дублировать" and "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);

  // #when
  await askDuplicate(page, 1);

  // #then
  await expect(countField(page)).toBeFocused();
  expect({
    blocks: await page.getByRole('group', { name: COUNT }).count(),
    inSource: await block(page, 'Скелет 1').getByRole('group', { name: COUNT }).count(),
    value: await countField(page).inputValue(),
    controls: await countBlock(page).getByRole('button').allTextContents(),
    error: await countBlock(page).getByText(BAD_COUNT).count(),
  }).toEqual({ blocks: 1, inSource: 1, value: '1', controls: [CONFIRM, CANCEL], error: 0 });
});

test('the count block sits on surface-bar with a line border and rounded-md', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);

  // #when
  await askDuplicate(page, 1);

  // #then
  const shown = countBlock(page);

  expect({
    background: await renderedColor(shown, 'background-color'),
    border: await renderedColor(shown, 'border-top-color'),
    borderStyle: await cssValue(shown, 'border-top-style'),
    radius: await cssValue(shown, 'border-top-left-radius'),
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

    await askDuplicate(page, 1);
    await countField(page).fill(text);

    // #when
    await countBlock(page).getByRole('button', { name: CONFIRM }).click();

    // #then
    await expect(countBlock(page).getByText(BAD_COUNT)).toBeVisible();
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
  await askDuplicate(page, 1);
  await countField(page).fill('0');

  // #when
  await countField(page).press('Enter');

  const shown = await countBlock(page).getByText(BAD_COUNT).count();

  await countField(page).fill('2');

  // #then
  expect({
    shown,
    afterChange: await countBlock(page).getByText(BAD_COUNT).count(),
  }).toEqual({ shown: 1, afterChange: 0 });
});

test('a count of 9 on "Скелет 1" adds "Скелет 2" to "Скелет 10" at the end of the section with the same values, and the focus returns to "Дублировать…"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);

  // #when
  await duplicateBy(page, 1, '9');
  await expect(blocks(page)).toHaveCount(11);

  // #then
  const copies = Array.from({ length: 9 }, (_unused, index) => `Скелет ${index + 2}`);
  const shownValues = [];

  for (const copy of copies) {
    // oxlint-disable-next-line no-await-in-loop
    shownValues.push(await blockValues(page, copy));
  }

  await expect(duplicateButton(page, 1)).toBeFocused();
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

test('the nine copies are new rep records of the same sheet and section at c: 1, under new nanoid ids, with no link', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);
  await duplicateBy(page, 1, '9');
  await expect(blocks(page)).toHaveCount(11);

  // #when
  const { stored } = await afterSettling(page);

  // #then
  const seeded = new Set(SKELETON.map((one) => one.k));
  const added = Object.values(stored).filter((one) => !seeded.has(one.k));
  const prefix = 'rep:npc:npc_name:';

  expect({
    keyForms: added.map(
      (one) => one.k.startsWith(prefix) && NANOID_PATTERN.test(one.k.slice(prefix.length)),
    ),
    versions: [...new Set(added.map((one) => one.c))],
    links: Object.keys(stored).filter((key) => key.startsWith('link:')),
    copies: added
      .map((one) => one.d)
      .sort((first, second) => Number(Object(first).order) - Number(Object(second).order)),
    source: SKELETON.map((one) => stored[one.k]),
  }).toEqual({
    keyForms: Array.from({ length: 9 }, () => true),
    versions: [1],
    links: ['link:token1'],
    copies: Array.from({ length: 9 }, (_unused, index) => ({
      order: index + 2,
      cells: { ...SKELETON_CELLS, npc_name: `Скелет ${index + 2}` },
    })),
    source: [...SKELETON],
  });
});

test('copies of an unnumbered "Скелет" are "Скелет 1" and "Скелет 2", and the source keeps its name', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [npcBlock('skel', 'Скелет', 0)]);

  // #when
  await duplicateBy(page, 1, '2');
  await expect(blocks(page)).toHaveCount(3);

  // #then
  expect(await blockNames(page)).toEqual(['Скелет', 'Скелет 1', 'Скелет 2']);
});

test('copies continue after the highest number in the section and skip another base', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [
    npcBlock('skel', 'Скелет 1', 0),
    npcBlock('high', 'Скелет 7', 1),
    npcBlock('archer', 'Скелет-лучник 30', 2),
  ]);

  // #when
  await duplicateBy(page, 1, '2');
  await expect(blocks(page)).toHaveCount(5);

  // #then
  expect(await blockNames(page)).toEqual([
    'Скелет 1',
    'Скелет 7',
    'Скелет-лучник 30',
    'Скелет 8',
    'Скелет 9',
  ]);
});

test('an empty first field is copied empty, with the other values', async ({ page, context }) => {
  // #given
  await openNpcTab(page, context, [repRecord('npc', 'npc_name', 'anon', 0, { hp: 4 })]);
  await watchCommands(page);

  // #when
  await duplicateBy(page, 1, '1');
  await expect(blocks(page)).toHaveCount(2);

  // #then
  const { stored } = await afterSettling(page);

  expect(
    Object.values(stored)
      .filter((one) => one.k !== 'rep:npc:npc_name:anon')
      .map((one) => one.d),
  ).toEqual([{ order: 1, cells: { hp: 4 } }]);
});

test('an edit of one copy leaves the source and the other copy as they were', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);
  await duplicateBy(page, 1, '2');
  await expect(blocks(page)).toHaveCount(4);

  // #when
  await block(page, 'Скелет 2').getByRole('textbox', { name: 'Хиты', exact: true }).fill('3');
  await block(page, 'Скелет 2')
    .getByRole('textbox', { name: 'Атака', exact: true })
    .first()
    .fill('Топор');
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
    edited: { ...SKELETON_VALUES, hp: '3', attack: 'Топор' },
    other: SKELETON_VALUES,
    source: SKELETON_VALUES,
  });
});

test('Esc closes the count, writes nothing and returns the focus to "Дублировать…"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);

  const before = await afterSettling(page);

  await askDuplicate(page, 1);
  await countField(page).fill('4');

  // #when
  await page.keyboard.press('Escape');

  // #then
  await expect(duplicateButton(page, 1)).toBeFocused();
  expect({
    blocks: await page.getByRole('group', { name: COUNT }).count(),
    after: await afterSettling(page),
  }).toEqual({ blocks: 0, after: before });
});

test('"Отменить" closes the count, writes nothing and returns the focus to "Дублировать…"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await watchCommands(page);

  const before = await afterSettling(page);

  await askDuplicate(page, 1);
  await countField(page).fill('4');

  // #when
  await countBlock(page).getByRole('button', { name: CANCEL }).click();

  // #then
  await expect(duplicateButton(page, 1)).toBeFocused();
  expect({
    blocks: await page.getByRole('group', { name: COUNT }).count(),
    after: await afterSettling(page),
  }).toEqual({ blocks: 0, after: before });
});

test('the keyboard presses "Дублировать…", types the count and confirms with Enter', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await duplicateButton(page, 1).focus();

  // #when
  await page.keyboard.press('Enter');
  await expect(countField(page)).toBeFocused();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');

  // #then
  await expect(blocks(page)).toHaveCount(4);
});

test('pressing "Дублировать…" again while the count is open moves the focus back into it', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, SKELETON);
  await askDuplicate(page, 1);
  await countField(page).fill('4');

  // #when
  await duplicateButton(page, 1).click();

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
  await duplicateBy(page, 1, '3');
  await expect.poll(() => sentDuplicates(page)).toHaveLength(1);

  const waiting = await countBlock(page).count();
  const [sent] = await sentDuplicates(page);

  // #when
  await postToWindow(page, { t: 'command-rejected', id: sent ?? '', reason: 'too-large' });

  // #then
  await expect(countBlock(page).getByText(FAILED)).toBeVisible();
  expect({
    waiting,
    value: await countField(page).inputValue(),
    blocks: await blockNames(page),
  }).toEqual({ waiting: 1, value: '3', blocks: ['Скелет 1', 'Гоблин'] });
});

test('the GM duplicates a repeat block of a sheet of a sheet set into the same sheet and section', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(
    page,
    context,
    [
      ...pcSheet('anya', 'Аня', 0),
      repRecord('anya', 'attack', 'sword', 0, { attack: 'Меч', bonus: 2 }),
      ...pcSheet('brok', 'Брок', 1),
    ],
    D20_PRESET,
  );
  await watchCommands(page);

  const attacks = page.getByRole('tabpanel').getByRole('region', { name: 'Атаки' });

  // #when
  await attacks.getByRole('button', { name: 'Дублировать блок 1…' }).click();
  await countField(page).fill('2');
  await countBlock(page).getByRole('button', { name: CONFIRM }).click();
  await expect(attacks.getByRole('group')).toHaveCount(3);

  // #then
  const { stored } = await afterSettling(page);

  expect(
    Object.values(stored)
      .filter((one) => one.k.startsWith('rep:') && one.k !== 'rep:anya:attack:sword')
      .map((one) => ({ form: one.k.split(':').slice(0, 3).join(':'), d: one.d, c: one.c }))
      .sort((first, second) => Number(Object(first.d).order) - Number(Object(second.d).order)),
  ).toEqual([
    { form: 'rep:anya:attack', d: { order: 1, cells: { attack: 'Меч 1', bonus: 2 } }, c: 1 },
    { form: 'rep:anya:attack', d: { order: 2, cells: { attack: 'Меч 2', bonus: 2 } }, c: 1 },
  ]);
});

test('a player who may edit a sheet gets "Удалить" on its repeat blocks and no "Дублировать…"', async ({
  context,
}) => {
  // #given
  await openGm(context, [
    ...pcSheet('anya', 'Аня', 0),
    repRecord('anya', 'attack', 'sword', 0, { attack: 'Меч' }),
    record('acl:anya:lisa', { name: 'Лиза' }),
  ]);

  // #when
  const player = await openClient(context, PLAYER, null);
  const attacks = player.window.getByRole('tabpanel').getByRole('region', { name: 'Атаки' });

  await expect(attacks.getByRole('button', { name: 'Удалить блок 1' })).toBeVisible();

  // #then
  expect(await attacks.getByRole('button', { name: /^Дублировать/ }).count()).toBe(0);
});

// The `repeat-block-duplicate` commands seen since `watchCommands`.
async function sentDuplicates(page: Page): Promise<string[]> {
  const seen = await page.evaluate(() => window.seenCommands);

  return seen
    .filter((command) => command.type === 'repeat-block-duplicate')
    .map((command) => command.id);
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

async function openGm(context: BrowserContext, records: readonly StoredRecord[]): Promise<void> {
  const gm = await openClient(context, GM, records);

  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();
}

// Opens one client. `records` seeds its device with the preset first; `null` seeds nothing.
async function openClient(
  context: BrowserContext,
  params: ClientParams,
  records: readonly StoredRecord[] | null,
): Promise<RoomClient> {
  const window = await openClientWindow(context, params);

  if (records !== null) {
    await seedStorage(window, records, D20_PRESET, params.device);
  }

  const background = await openClientBackground(context, params);

  return { window, background, connectionId: connectionIdOf(params) };
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
  await expect(page.getByRole('button', { name: ADD })).toBeVisible();
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(page.getByRole('button', { name: ADD_NPC })).toBeVisible();
}

function duplicateButton(page: Page, position: number): Locator {
  return page
    .getByRole('tabpanel')
    .getByRole('button', { name: `Дублировать блок ${position}…`, exact: true });
}

async function askDuplicate(page: Page, position: number): Promise<void> {
  await duplicateButton(page, position).click();
  await expect(countBlock(page)).toBeVisible();
}

async function duplicateBy(page: Page, position: number, count: string): Promise<void> {
  await askDuplicate(page, position);
  await countField(page).fill(count);
  await countBlock(page).getByRole('button', { name: CONFIRM }).click();
}

// Each repeat block is a group named by its first field.
function blocks(page: Page): Locator {
  return page.getByRole('tabpanel').locator('[data-repeat-block]');
}

function block(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('group', { name, exact: true });
}

function countBlock(page: Page): Locator {
  return page.getByRole('group', { name: COUNT });
}

function countField(page: Page): Locator {
  return page.getByRole('textbox', { name: COUNT });
}

async function blockNames(page: Page): Promise<string[]> {
  return blocks(page).evaluateAll((shown) =>
    shown.map((one) => one.getAttribute('aria-label') ?? ''),
  );
}

async function blockValues(page: Page, name: string): Promise<typeof SKELETON_VALUES> {
  const shown = block(page, name);
  const attack = shown.getByRole('textbox', { name: 'Атака', exact: true });

  return {
    ac: await shown.getByRole('textbox', { name: 'КД', exact: true }).inputValue(),
    hp: await shown.getByRole('textbox', { name: 'Хиты', exact: true }).inputValue(),
    str: await shown.getByRole('textbox', { name: 'Сила', exact: true }).inputValue(),
    elite: await shown.getByRole('checkbox', { name: 'Сила' }).isChecked(),
    attack: await attack.nth(0).inputValue(),
    bonus: await attack.nth(1).inputValue(),
  };
}
