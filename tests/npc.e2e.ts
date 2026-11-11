import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { JsonValue } from '@/core/json';

import { cssValue, renderedColor, tokenColor } from './support/colors';
import {
  ABSENT,
  afterSettling,
  keyed,
  openBackground,
  openRoom,
  record,
  sheetRecord,
  storedData,
  storedRecords,
  watchCommands,
  type StoredRecord,
} from './support/room';

const CHANNEL = 'app.muster-roll/ui';
const ADD_CHARACTER = 'Добавить персонажа';
const ADD_NPC = 'Добавить NPC';
const ADD_ROW = 'Добавить строку';
const NEW_NPC = 'Новый NPC';
const NPC_NAME = 'Имя NPC';
const CHARACTER_NAME = 'Имя персонажа';
const ACTIONS = 'Действия с листом';
const DELETE = 'Удалить';
const CANCEL = 'Отменить';
const UPLOAD = 'Загрузить пресет';
const GEAR = '⚙︎';
const SETTINGS = 'Настройки';

const D20_PRESET = fixture('d20');
const D6_POOL_PRESET = fixture('d6-pool');

// One game system's controls, by the names its preset gives them.
type GameSystem = {
  label: string;
  preset: string;
  character: SheetControls;
  npc: SheetControls;
};

// `field` is a number field of a plain row and `check` a check field. `rowField` is the first text
// field of a repeat row, and `rowFieldId` the id it is stored under. `dice` is the text of a dice
// cell with no label before it, which shows its formula.
type SheetControls = {
  field: string;
  check: string;
  repeatSection: string;
  rowField: string;
  rowFieldId: string;
  dice: string;
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('with no characters the bar shows "+", NPC and the gear, and NPCs get no tab', async ({
  page,
  context,
}) => {
  // #when
  await openRoom(page, context, [npc('gob', 'Гоблин', 0), npc('orc', 'Орк', 1)], D20_PRESET);

  // #then
  await expect(page.getByRole('tab')).toHaveText(['NPC', GEAR]);
  await expect(page.getByRole('button', { name: ADD_CHARACTER })).toHaveText('+');

  const add = await box(page.getByRole('button', { name: ADD_CHARACTER }));
  const npcTab = await box(page.getByRole('tab', { name: 'NPC' }));
  const gear = await box(page.getByRole('tab', { name: SETTINGS }));

  expect({ addBeforeNpc: add.x < npcTab.x, npcBeforeGear: npcTab.x < gear.x }).toEqual({
    addBeforeNpc: true,
    npcBeforeGear: true,
  });
});

test('characters take the tabs and NPCs only the NPC tab, never one list', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(
    page,
    context,
    [sheetRecord({ id: 'brok', name: 'Брок', order: 0 }), npc('gob', 'Гоблин', 0)],
    D20_PRESET,
  );

  const characterPanel = await panelText(page);

  // #when
  await page.getByRole('tab', { name: 'NPC' }).click();

  // #then
  expect({
    tabs: await page.getByRole('tab').allTextContents(),
    characterPanelNamesNpc: characterPanel.includes('Гоблин'),
    npcBlocks: await blockNames(page),
  }).toEqual({ tabs: ['Брок', 'NPC', GEAR], characterPanelNamesNpc: false, npcBlocks: ['Гоблин'] });
});

test('the NPC tab with no NPCs shows "Добавить NPC" only', async ({ page, context }) => {
  // #when
  await openNpcTab(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })]);

  // #then
  const panel = page.getByRole('tabpanel');

  expect({
    text: await panel.innerText(),
    controls: await panel
      .locator('button, input, textarea')
      .evaluateAll((controls) => controls.map((control) => control.textContent)),
  }).toEqual({ text: ADD_NPC, controls: [ADD_NPC] });
});

test('"Добавить NPC" creates "Новый NPC" with kind npc and the next NPC order, last, its name focused', async ({
  page,
  context,
}) => {
  // #given: a character with a higher order, which the NPC order must not follow.
  await openNpcTab(page, context, [
    sheetRecord({ id: 'brok', name: 'Брок', order: 9 }),
    npc('gob', 'Гоблин', 4),
  ]);

  // #when
  await page.getByRole('button', { name: ADD_NPC }).click();
  await expect(npcNames(page)).toHaveCount(2);

  // #then
  const created = (await storedSheets(page)).filter(
    (one) => one.k !== 'sheet:gob' && one.k !== 'sheet:brok',
  );

  await expect(npcNames(page).nth(1)).toBeFocused();
  expect({
    blocks: await blockNames(page),
    shownName: await npcNames(page).nth(1).inputValue(),
    // TASK-37: a new sheet id is 12 characters of the URL-safe nanoid alphabet.
    key: created.map((one) => /^sheet:[A-Za-z0-9_-]{12}$/.test(one.k)),
    data: created.map((one) => one.d),
    tabs: await page.getByRole('tab').allTextContents(),
    selected: await page.getByRole('tab', { selected: true }).textContent(),
  }).toEqual({
    blocks: ['Гоблин', NEW_NPC],
    shownName: NEW_NPC,
    key: [true],
    data: [{ kind: 'npc', name: NEW_NPC, order: 5 }],
    tabs: ['Брок', 'NPC', GEAR],
    selected: 'NPC',
  });
});

test('a new NPC under many others is scrolled into view', async ({ page, context }) => {
  // #given
  const many = Array.from({ length: 10 }, (_unused, index) =>
    npc(`n${String(index).padStart(2, '0')}`, `Скелет ${index + 1}`, index),
  );

  await openNpcTab(page, context, many);
  // A new block goes after the last one, so it starts out of view as well.
  await expect(npcNames(page).nth(9)).not.toBeInViewport();

  // #when
  await page.getByRole('button', { name: ADD_NPC }).click();

  // #then
  const name = npcNames(page).nth(10);

  await expect(name).toBeFocused();
  await expect(name).toBeInViewport();
});

test('the block shows its name in section-heading with a left rule in line', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [npc('gob', 'Гоблин', 0)]);

  const header = block(page, 'Гоблин').locator('header');
  const name = npcNames(page).first();

  // #when
  const style = {
    fontSize: await cssValue(name, 'font-size'),
    fontWeight: await cssValue(name, 'font-weight'),
    lineHeight: await cssValue(name, 'line-height'),
    rule: await cssValue(header, 'border-left-style'),
    ruleWidth: await cssValue(header, 'border-left-width'),
    ruleColor: await renderedColor(header, 'border-left-color'),
    bottomRuleWidth: await cssValue(header, 'border-bottom-width'),
  };

  // #then
  expect(style).toEqual({
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '19.6px',
    rule: 'solid',
    ruleWidth: '2px',
    ruleColor: await tokenColor(page, '--color-line'),
    bottomRuleWidth: '0px',
  });
});

test('a renamed NPC names its block and keeps the name after a reload', async ({
  page,
  context,
}) => {
  // #given
  const background = await openNpcTab(page, context, [
    npc('gob', 'Гоблин', 0),
    npc('orc', 'Орк', 1),
  ]);

  // #when
  await npcNames(page).nth(1).fill('Орк-вожак');
  await npcNames(page).nth(1).press('Enter');
  await expect(block(page, 'Орк-вожак')).toBeVisible();
  await reloadOnNpcTab(page, context, background);

  // #then
  expect({
    blocks: await blockNames(page),
    stored: (await storedSheets(page)).find((one) => one.k === 'sheet:orc')?.d,
  }).toEqual({
    blocks: ['Гоблин', 'Орк-вожак'],
    stored: { kind: 'npc', name: 'Орк-вожак', order: 1 },
  });
});

test('a blank NPC name returns the old one and saves nothing', async ({ page, context }) => {
  // #given
  const seeded = [npc('gob', 'Гоблин', 0)];

  await openNpcTab(page, context, seeded);
  await watchCommands(page);

  // #when
  await npcNames(page).first().fill('  ');
  await page.keyboard.press('Tab');

  // #then
  await expect(npcNames(page).first()).toHaveValue('Гоблин');
  expect(await afterSettling(page)).toEqual({ commands: [], stored: keyed(seeded) });
});

test("a field of an NPC block saves into that NPC's row record", async ({ page, context }) => {
  // #given
  await openNpcTab(page, context, [npc('gob', 'Гоблин', 0), npc('orc', 'Орк', 1)]);

  // #when
  await block(page, 'Орк').getByRole('textbox', { name: 'КД', exact: true }).fill('13');
  await page.keyboard.press('Tab');
  await block(page, 'Орк').getByRole('checkbox', { name: 'Сила' }).click();

  // #then
  await expect.poll(() => storedData(page, 'row:orc:ac')).toEqual({ ac: 13 });
  await expect.poll(() => storedData(page, 'row:orc:str')).toEqual({ elite: true });
  expect({
    gobAc: await storedData(page, 'row:gob:ac'),
    gobStr: await storedData(page, 'row:gob:str'),
  }).toEqual({ gobAc: ABSENT, gobStr: ABSENT });
});

test('"⋯" offers "Удалить", which opens the confirmation at the top of the NPC tab, focus on "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [npc('gob', 'Гоблин', 0), npc('orc', 'Орк', 1)]);

  // #when
  await askDelete(page, 'Орк');

  // #then
  await expect(page.getByRole('button', { name: CANCEL })).toBeFocused();
  expect({
    groups: await page.getByRole('group').count(),
    text: await confirmation(page).textContent(),
    first: await page
      .getByRole('tabpanel')
      .evaluate((panel) => panel.firstElementChild?.getAttribute('role') ?? ''),
  }).toEqual({
    groups: 1,
    text: 'Удалить «Орк»? Это нельзя отменить.УдалитьОтменить',
    first: 'group',
  });
});

test('confirming tombstones the NPC and its records, and leaves the other NPC whole', async ({
  page,
  context,
}) => {
  // #given
  const kept = [
    npc('orc', 'Орк', 1),
    record('row:orc:ac', { ac: 12 }),
    record('rep:orc:attack:o1', { order: 0, cells: { attack: 'Топор' } }),
  ];

  await openNpcTab(page, context, [
    npc('gob', 'Гоблин', 0),
    record('row:gob:ac', { ac: 15 }, 2),
    record('rep:gob:attack:g1', { order: 0, cells: { attack: 'Нож' } }),
    ...kept,
  ]);
  await watchCommands(page);
  await askDelete(page, 'Гоблин');

  // #when
  await confirmation(page).getByRole('button', { name: DELETE }).click();

  // #then
  await expect(block(page, 'Гоблин')).toHaveCount(0);
  expect(await afterSettling(page)).toEqual({
    commands: ['sheet-delete'],
    stored: keyed([
      record('sheet:gob', null, 2),
      record('row:gob:ac', null, 3),
      record('rep:gob:attack:g1', null, 2),
      ...kept,
    ]),
  });
});

for (const [label, cancel] of [
  ['"Отменить"', (page: Page) => page.getByRole('button', { name: CANCEL }).click()],
  ['Escape', (page: Page) => page.keyboard.press('Escape')],
] as const) {
  test(`${label} closes the confirmation, deletes nothing and returns the focus to that NPC's "⋯"`, async ({
    page,
    context,
  }) => {
    // #given
    const seeded = [npc('gob', 'Гоблин', 0), npc('orc', 'Орк', 1)];

    await openNpcTab(page, context, seeded);
    await watchCommands(page);
    await askDelete(page, 'Орк');
    await expect(page.getByRole('button', { name: CANCEL })).toBeFocused();

    // #when
    await cancel(page);

    // #then
    await expect(page.getByRole('group')).toHaveCount(0);
    await expect(actionsButton(page, 'Орк')).toBeFocused();
    expect(await afterSettling(page)).toEqual({ commands: [], stored: keyed(seeded) });
  });
}

test('another tab closes the confirmation, and it is gone on return', async ({ page, context }) => {
  // #given
  const seeded = [sheetRecord({ id: 'brok', name: 'Брок', order: 0 }), npc('gob', 'Гоблин', 0)];

  await openNpcTab(page, context, seeded);
  await watchCommands(page);
  await askDelete(page, 'Гоблин');

  // #when
  await page.getByRole('tab', { name: 'Брок' }).click();
  await expect(page.getByRole('textbox', { name: CHARACTER_NAME })).toBeVisible();
  await page.getByRole('tab', { name: 'NPC' }).click();

  // #then
  await expect(block(page, 'Гоблин')).toBeVisible();
  await expect(page.getByRole('group')).toHaveCount(0);
  expect(await afterSettling(page)).toEqual({ commands: [], stored: keyed(seeded) });
});

test('an NPC deleted in another window closes its confirmation here and moves the focus to the next NPC\'s "⋯"', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [npc('gob', 'Гоблин', 0), npc('orc', 'Орк', 1)]);
  await askDelete(page, 'Гоблин');

  const other = await context.newPage();

  await other.setViewportSize({ width: 600, height: 800 });
  await other.goto('/index.html');
  await other.getByRole('tab', { name: 'NPC' }).click();

  // #when
  await askDelete(other, 'Гоблин');
  await confirmation(other).getByRole('button', { name: DELETE }).click();

  // #then
  await expect(block(page, 'Гоблин')).toHaveCount(0);
  await expect(page.getByRole('group')).toHaveCount(0);
  await expect(actionsButton(page, 'Орк')).toBeFocused();
  expect(await blockNames(page)).toEqual(['Орк']);
});

test('a refused deletion keeps the NPC and returns the focus to its "⋯"', async ({
  page,
  context,
}) => {
  // #given: with no background, the deletion gets no answer but the rejection the test sends.
  const background = await openNpcTab(page, context, [
    npc('gob', 'Гоблин', 0),
    npc('orc', 'Орк', 1),
  ]);

  await watchCommands(page);
  await background.close();
  await askDelete(page, 'Гоблин');
  await confirmation(page).getByRole('button', { name: DELETE }).click();
  await expect.poll(() => sentDeletes(page)).toHaveLength(1);

  const [deletion] = await sentDeletes(page);

  // #when
  await postToWindow(page, {
    t: 'command-rejected',
    id: deletion ?? '',
    reason: 'unknown-sheet',
  });

  // #then
  await expect(actionsButton(page, 'Гоблин')).toBeFocused();
  expect(await blockNames(page)).toEqual(['Гоблин', 'Орк']);
});

test('"Добавить NPC" closes an open confirmation', async ({ page, context }) => {
  // #given
  await openNpcTab(page, context, [npc('gob', 'Гоблин', 0)]);
  await askDelete(page, 'Гоблин');

  // #when
  await page.getByRole('button', { name: ADD_NPC }).click();

  // #then
  await expect(npcNames(page).nth(1)).toBeFocused();
  await expect(page.getByRole('group')).toHaveCount(0);
  expect(await blockNames(page)).toEqual(['Гоблин', NEW_NPC]);
});

for (const [label, deleted, focused] of [
  ['the next NPC\'s "⋯"', 'Бета', 'Гамма'],
  ['the previous NPC\'s "⋯" when the last NPC goes', 'Гамма', 'Бета'],
] as const) {
  test(`deleting an NPC moves the focus to ${label}`, async ({ page, context }) => {
    // #given
    await openNpcTab(page, context, [
      npc('a', 'Альфа', 0),
      npc('b', 'Бета', 1),
      npc('c', 'Гамма', 2),
    ]);
    await askDelete(page, deleted);

    // #when
    await confirmation(page).getByRole('button', { name: DELETE }).click();

    // #then
    await expect(block(page, deleted)).toHaveCount(0);
    await expect(actionsButton(page, focused)).toBeFocused();
  });
}

test('deleting the only NPC moves the focus to "Добавить NPC"', async ({ page, context }) => {
  // #given
  await openNpcTab(page, context, [npc('gob', 'Гоблин', 0)]);
  await askDelete(page, 'Гоблин');

  // #when
  await confirmation(page).getByRole('button', { name: DELETE }).click();

  // #then
  await expect(block(page, 'Гоблин')).toHaveCount(0);
  await expect(page.getByRole('button', { name: ADD_NPC })).toBeFocused();
});

test('NPCs with one order show by sheetId in code unit order, the same after a reload', async ({
  page,
  context,
}) => {
  // #given: locale order would put "a" first. Code unit order puts "B" first.
  const background = await openNpcTab(page, context, [
    npc('a', 'Бэ', 1),
    npc('B', 'А', 1),
    npc('z', 'Зет', 0),
  ]);

  const before = await blockNames(page);

  // #when
  await reloadOnNpcTab(page, context, background);

  // #then
  expect({ before, after: await blockNames(page) }).toEqual({
    before: ['Зет', 'А', 'Бэ'],
    after: ['Зет', 'А', 'Бэ'],
  });
});

test('rows added to one NPC leave the other NPC with its own rows', async ({ page, context }) => {
  // #given
  await openNpcTab(page, context, [
    npc('gob', 'Гоблин', 0),
    npc('orc', 'Орк', 1),
    record('rep:gob:attack:g1', { order: 0, cells: { attack: 'Нож' } }),
    record('rep:orc:attack:o1', { order: 0, cells: { attack: 'Топор' } }),
  ]);

  const gobAttacks = rowFields(page, 'Гоблин', 'Атаки', 'attack');

  // #when
  await addRow(page, 'Гоблин', 'Атаки').click();
  await expect(gobAttacks).toHaveCount(2);
  await gobAttacks.nth(1).fill('Лук');
  await page.keyboard.press('Tab');
  await addRow(page, 'Гоблин', 'Атаки').click();
  await expect(gobAttacks).toHaveCount(3);

  // #then
  expect({
    gob: await valuesOf(gobAttacks),
    orc: await valuesOf(rowFields(page, 'Орк', 'Атаки', 'attack')),
    orcStored: (await storedRecords(page, 'rep:orc:')).map((one) => one.k),
  }).toEqual({ gob: ['Нож', 'Лук', ''], orc: ['Топор'], orcStored: ['rep:orc:attack:o1'] });
});

test('a row removed from one NPC leaves the other NPC with its own rows', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [
    npc('gob', 'Гоблин', 0),
    npc('orc', 'Орк', 1),
    record('rep:gob:attack:g1', { order: 0, cells: { attack: 'Нож' } }),
    record('rep:gob:attack:g2', { order: 1, cells: { attack: 'Лук' } }),
    record('rep:orc:attack:o1', { order: 0, cells: { attack: 'Топор' } }),
  ]);

  // #when
  await block(page, 'Гоблин').getByRole('button', { name: 'Удалить строку 1' }).click();
  await expect(rowFields(page, 'Гоблин', 'Атаки', 'attack')).toHaveCount(1);
  await expect.poll(() => storedData(page, 'rep:gob:attack:g1')).toBeNull();

  // #then
  expect({
    gob: await valuesOf(rowFields(page, 'Гоблин', 'Атаки', 'attack')),
    orc: await valuesOf(rowFields(page, 'Орк', 'Атаки', 'attack')),
    orcStored: (await storedRecords(page, 'rep:orc:')).map((one) => ({ k: one.k, d: one.d })),
  }).toEqual({
    gob: ['Лук'],
    orc: ['Топор'],
    orcStored: [{ k: 'rep:orc:attack:o1', d: { order: 0, cells: { attack: 'Топор' } } }],
  });
});

test('after NPC changes a reload shows the same NPCs, names, values and rows', async ({
  page,
  context,
}) => {
  // #given
  const background = await openNpcTab(page, context, [npc('gob', 'Гоблин', 0)]);

  await page.getByRole('button', { name: ADD_NPC }).click();
  await expect(npcNames(page).nth(1)).toBeFocused();
  await npcNames(page).nth(1).fill('Орк');
  await page.keyboard.press('Tab');
  await block(page, 'Орк').getByRole('textbox', { name: 'Хиты', exact: true }).fill('22');
  await page.keyboard.press('Tab');
  await addRow(page, 'Орк', 'Атаки').click();
  await rowFields(page, 'Орк', 'Атаки', 'attack').first().fill('Топор');
  await page.keyboard.press('Tab');
  await block(page, 'Гоблин').getByRole('checkbox', { name: 'Сила' }).click();
  await expect
    .poll(async () => (await storedRecords(page, 'rep:')).map((one) => one.d))
    .toEqual([{ order: 0, cells: { attack: 'Топор' } }]);
  // The check is the last command sent, so once it is stored every change before it is too.
  await expect.poll(() => storedData(page, 'row:gob:str')).toEqual({ elite: true });

  const before = await npcTabState(page);

  // #when
  await reloadOnNpcTab(page, context, background);

  // #then
  expect({ before, after: await npcTabState(page) }).toEqual({
    before: {
      blocks: ['Гоблин', 'Орк'],
      orcHp: '22',
      orcAttacks: ['Топор'],
      gobElite: true,
    },
    after: {
      blocks: ['Гоблин', 'Орк'],
      orcHp: '22',
      orcAttacks: ['Топор'],
      gobElite: true,
    },
  });
});

test.describe('two game systems with no code change', () => {
  const systems: readonly GameSystem[] = [
    {
      label: 'a d20 preset',
      preset: D20_PRESET,
      character: {
        field: 'Сила',
        check: 'Сила',
        repeatSection: 'Атаки',
        rowField: 'attack',
        rowFieldId: 'attack',
        dice: '1d20+bonus',
      },
      npc: {
        field: 'КД',
        check: 'Сила',
        repeatSection: 'Атаки',
        rowField: 'attack',
        rowFieldId: 'attack',
        dice: '1d20+bonus',
      },
    },
    {
      label: 'a d6 pool preset',
      preset: D6_POOL_PRESET,
      character: {
        field: 'СИЛ',
        check: 'Ранен',
        repeatSection: 'Снаряжение',
        rowField: 'Вещь',
        rowFieldId: 'item',
        dice: '2D6',
      },
      npc: {
        field: 'Навык',
        check: 'Ранен',
        repeatSection: 'Снаряжение',
        rowField: 'Вещь',
        rowFieldId: 'gear',
        dice: '2D6 >= skill',
      },
    },
  ];

  for (const system of systems) {
    test(`${system.label} loaded in a fresh room gives a working character and NPC`, async ({
      page,
      context,
    }) => {
      // #given
      await page.goto('/index.html');

      const background = await openBackground(context);

      await uploadPreset(page, system.preset);
      await expect(page.getByRole('button', { name: ADD_CHARACTER })).toBeVisible();

      // #when
      await page.getByRole('button', { name: ADD_CHARACTER }).click();
      await fillSheet(page, page.getByRole('tabpanel'), CHARACTER_NAME, 'Лиза', system.character);
      await page.getByRole('tab', { name: 'NPC' }).click();
      await page.getByRole('button', { name: ADD_NPC }).click();
      await fillSheet(page, page.getByRole('tabpanel'), NPC_NAME, 'Страж', system.npc);
      await expect
        .poll(async () => byText((await storedRecords(page, 'rep:')).map((one) => one.d)))
        .toEqual(
          byText([
            { order: 0, cells: { [system.character.rowFieldId]: 'Лиза-вещь' } },
            { order: 0, cells: { [system.npc.rowFieldId]: 'Страж-вещь' } },
          ]),
        );

      await background.close();
      await page.reload();
      await openBackground(context);
      await expect(page.getByRole('button', { name: ADD_CHARACTER })).toBeVisible();

      // #then
      const character = await sheetState(page.getByRole('tabpanel'), system.character);

      await page.getByRole('tab', { name: 'NPC' }).click();

      expect({
        tabs: await page.getByRole('tab').allTextContents(),
        character,
        npc: await sheetState(block(page, 'Страж'), system.npc),
      }).toEqual({
        tabs: ['Лиза', 'NPC', GEAR],
        character: { field: '7', checked: true, rows: ['Лиза-вещь'], dice: 1 },
        npc: { field: '7', checked: true, rows: ['Страж-вещь'], dice: 1 },
      });
    });
  }
});

function fixture(name: string): string {
  return readFileSync(new URL(`fixtures/presets/${name}.json`, import.meta.url), 'utf8');
}

function npc(id: string, name: string, order: number): StoredRecord {
  return record(`sheet:${id}`, { kind: 'npc', name, order });
}

// In the order of their JSON text, so two lists compare with no regard to storage order.
function byText(values: readonly JsonValue[]): JsonValue[] {
  return [...values].sort((first, second) =>
    JSON.stringify(first).localeCompare(JSON.stringify(second)),
  );
}

async function openNpcTab(
  page: Page,
  context: BrowserContext,
  records: readonly StoredRecord[],
): Promise<Page> {
  const background = await openRoom(page, context, records, D20_PRESET);

  await page.getByRole('tab', { name: 'NPC' }).click();

  return background;
}

async function reloadOnNpcTab(
  page: Page,
  context: BrowserContext,
  background: Page,
): Promise<void> {
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD_CHARACTER })).toBeVisible();
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(page.getByRole('button', { name: ADD_NPC })).toBeVisible();
}

async function uploadPreset(page: Page, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');

  await page.getByRole('button', { name: UPLOAD }).click();

  const chooser = await choosing;

  await chooser.setFiles({
    name: 'preset.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

// Names the sheet just created, sets its number field to 7, checks its check field and adds one row
// with a value.
async function fillSheet(
  page: Page,
  panel: Locator,
  nameLabel: string,
  name: string,
  controls: SheetControls,
): Promise<void> {
  const nameField = panel.getByRole('textbox', { name: nameLabel }).last();

  await expect(nameField).toBeFocused();
  await nameField.fill(name);
  await page.keyboard.press('Tab');

  const sheet = nameLabel === NPC_NAME ? block(page, name) : panel;

  await expect(sheet.getByRole('textbox', { name: nameLabel })).toHaveValue(name);
  await sheet.getByRole('textbox', { name: controls.field, exact: true }).fill('7');
  await page.keyboard.press('Tab');
  await sheet.getByRole('checkbox', { name: controls.check, exact: true }).click();
  await sheet
    .getByRole('region', { name: controls.repeatSection })
    .getByRole('button', { name: ADD_ROW })
    .click();

  const row = sheet
    .getByRole('region', { name: controls.repeatSection })
    .getByRole('textbox', { name: controls.rowField, exact: true });

  await expect(row).toBeFocused();
  await row.fill(`${name}-вещь`);
  await page.keyboard.press('Tab');
}

async function sheetState(
  sheet: Locator,
  controls: SheetControls,
): Promise<{ field: string; checked: boolean; rows: string[]; dice: number }> {
  await expect(sheet.getByRole('textbox', { name: controls.field, exact: true })).toBeVisible();

  return {
    field: await sheet.getByRole('textbox', { name: controls.field, exact: true }).inputValue(),
    checked: await sheet.getByRole('checkbox', { name: controls.check, exact: true }).isChecked(),
    rows: await valuesOf(
      sheet
        .getByRole('region', { name: controls.repeatSection })
        .getByRole('textbox', { name: controls.rowField, exact: true }),
    ),
    dice: await sheet.getByText(controls.dice, { exact: true }).count(),
  };
}

async function npcTabState(page: Page): Promise<{
  blocks: string[];
  orcHp: string;
  orcAttacks: string[];
  gobElite: boolean;
}> {
  return {
    blocks: await blockNames(page),
    orcHp: await block(page, 'Орк')
      .getByRole('textbox', { name: 'Хиты', exact: true })
      .inputValue(),
    orcAttacks: await valuesOf(rowFields(page, 'Орк', 'Атаки', 'attack')),
    gobElite: await block(page, 'Гоблин').getByRole('checkbox', { name: 'Сила' }).isChecked(),
  };
}

// The NPC blocks are the items of a list, each a region named by its NPC.
function blocks(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('listitem');
}

function block(page: Page, name: string): Locator {
  return blocks(page).getByRole('region', { name, exact: true });
}

function npcNames(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: NPC_NAME });
}

// The first region of an item is its block, as the preset's own sections sit inside it.
async function blockNames(page: Page): Promise<string[]> {
  return blocks(page).evaluateAll((items) =>
    items.map((item) => item.querySelector('section')?.getAttribute('aria-label') ?? ''),
  );
}

function actionsButton(page: Page, name: string): Locator {
  return block(page, name).getByRole('button', { name: ACTIONS });
}

function addRow(page: Page, name: string, section: string): Locator {
  return block(page, name)
    .getByRole('region', { name: section })
    .getByRole('button', { name: ADD_ROW });
}

function rowFields(page: Page, name: string, section: string, field: string): Locator {
  return block(page, name)
    .getByRole('region', { name: section })
    .getByRole('textbox', { name: field, exact: true });
}

function confirmation(page: Page): Locator {
  return page.getByRole('group', { name: /^Удалить «/ });
}

async function askDelete(page: Page, name: string): Promise<void> {
  await actionsButton(page, name).click();
  await page.getByRole('menuitem', { name: DELETE }).click();
  await expect(confirmation(page)).toBeVisible();
}

async function panelText(page: Page): Promise<string> {
  await expect(page.getByRole('textbox', { name: CHARACTER_NAME })).toBeVisible();

  return page.getByRole('tabpanel').innerText();
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

async function box(locator: Locator): Promise<{ x: number }> {
  const found = await locator.boundingBox();

  if (found === null) {
    throw new Error('the element is not rendered');
  }

  return found;
}

async function storedSheets(page: Page): Promise<StoredRecord[]> {
  return storedRecords(page, 'sheet:');
}

// The ids of the `sheet-delete` commands seen since `watchCommands`.
async function sentDeletes(page: Page): Promise<string[]> {
  const seen = await page.evaluate(() => window.seenCommands);

  return seen.filter((command) => command.type === 'sheet-delete').map((command) => command.id);
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
