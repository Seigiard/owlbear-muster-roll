import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  openBackground,
  openRoom,
  record,
  sheetRecord,
  sheetRecords,
  storedData,
  storedRecords,
  type StoredRecord,
} from './support/room';

const UPLOAD = 'Загрузить пресет';
const NAME_FIELD = 'Имя листа';
const UNNAMED = 'Без имени';
const SETTINGS = 'Настройки';
const GEAR = '⚙︎';
const ADD_CREW = 'Добавить: Экипаж';
const ADD_CHARACTER = 'Добавить: Персонажи';
const ADD_SHIP = 'Добавить: Корабли';

const D6_POOL = readFileSync(new URL('fixtures/presets/d6-pool.json', import.meta.url), 'utf8');

// Two sheet sets between two single sheets, so each "+" has a neighbour on both sides.
const TWO_SETS = JSON.stringify({
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] }],
    },
    {
      id: 'inv',
      kind: 'single',
      title: 'Инвентарь',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'gold' }]] }] }],
    },
    {
      id: 'ship',
      kind: 'set',
      title: 'Корабли',
      nameField: 'ship_name',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'ship_name' }]] }] }],
    },
    {
      id: 'log',
      kind: 'single',
      title: 'Журнал',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'entry' }]] }] }],
    },
  ],
});

const PARTY = [
  ...sheetRecords({ id: 'anya', name: 'Аня', order: 0 }),
  ...sheetRecords({ id: 'brok', name: 'Брок', order: 1 }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 });
});

test.describe('a second system with no code change (CAP-4)', () => {
  test('an uploaded d6 pool preset gives one tab per single sheet and "+" for its sheet set', async ({
    page,
    context,
  }) => {
    // #given
    await openEmptyRoom(page, context);

    // #when
    await uploadPreset(page, D6_POOL);

    // #then
    await expect(page.getByRole('button', { name: ADD_CREW })).toHaveText('+');
    await expect(page.getByRole('tab')).toHaveText(['NPC', 'Инвентарь', 'Список заклинаний', GEAR]);
    expect(await barOrder(page)).toEqual([
      ADD_CREW,
      'NPC',
      'Инвентарь',
      'Список заклинаний',
      SETTINGS,
    ]);
  });

  test('a sheet of the crew and the spell list both take values and keep them after a reload', async ({
    page,
    context,
  }) => {
    // #given
    const background = await openEmptyRoom(page, context);

    await uploadPreset(page, D6_POOL);
    await expect(page.getByRole('button', { name: ADD_CREW })).toBeVisible();

    // #when: a crew sheet, named and with one value.
    await page.getByRole('button', { name: ADD_CREW }).click();
    await expect(page.getByRole('textbox', { name: NAME_FIELD })).toBeFocused();
    await page.getByRole('textbox', { name: NAME_FIELD }).fill('Лиза');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: 'Лиза' })).toBeVisible();
    await panelField(page, 'СИЛ').fill('7');
    await page.keyboard.press('Tab');

    // A spell: one repeat block of two rows.
    await page.getByRole('tab', { name: 'Список заклинаний' }).click();
    await page.getByRole('button', { name: 'Добавить в «Заклинания»' }).click();
    await panelField(page, 'spell').fill('Огонь');
    await panelField(page, 'Сложность').fill('8');
    await panelField(page, 'effect').fill('Жжёт');
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await storedRecords(page, 'rep:spells:')).length).toBe(1);
    await expect
      .poll(async () => (await storedRecords(page, 'rep:spells:'))[0]?.d)
      .toEqual({ order: 0, cells: { spell: 'Огонь', difficulty: 8, effect: 'Жжёт' } });

    await background.close();
    await page.reload();
    await openBackground(context);
    await expect(page.getByRole('button', { name: ADD_CREW })).toBeVisible();

    // #then
    const [crew] = await storedRecords(page, 'sheet:');
    const crewId = crew?.k.slice('sheet:'.length) ?? '';

    await expect(panelField(page, 'СИЛ')).toHaveValue('7');
    await page.getByRole('tab', { name: 'Список заклинаний' }).click();
    expect({
      tabs: await page.getByRole('tab').allTextContents(),
      sheet: crew?.d,
      name: await storedData(page, `row:${crewId}:name`),
      spell: [
        await panelField(page, 'spell').inputValue(),
        await panelField(page, 'Сложность').inputValue(),
        await panelField(page, 'effect').inputValue(),
      ],
    }).toEqual({
      tabs: ['Лиза', 'NPC', 'Инвентарь', 'Список заклинаний', GEAR],
      sheet: { set: 'pc', order: 0 },
      name: { name: 'Лиза' },
      spell: ['Огонь', '8', 'Жжёт'],
    });
  });
});

test('the bar lists templates in preset order, each sheet set\'s "+" after its last sheet, the gear last', async ({
  page,
  context,
}) => {
  // #when
  await openRoom(page, context, [...PARTY, ...ship(0)], TWO_SETS);

  // #then
  await expect(page.getByRole('button', { name: ADD_SHIP })).toBeVisible();
  expect(await barOrder(page)).toEqual([
    'Аня',
    'Брок',
    ADD_CHARACTER,
    'Инвентарь',
    'Ладья',
    ADD_SHIP,
    'Журнал',
    SETTINGS,
  ]);
});

test('a sheet set with no sheets keeps its "+" in its place', async ({ page, context }) => {
  // #when
  await openRoom(page, context, PARTY, TWO_SETS);

  // #then
  await expect(page.getByRole('button', { name: ADD_SHIP })).toBeVisible();
  expect(await barOrder(page)).toEqual([
    'Аня',
    'Брок',
    ADD_CHARACTER,
    'Инвентарь',
    ADD_SHIP,
    'Журнал',
    SETTINGS,
  ]);
});

test('the "+" of a second sheet set adds a sheet of that set at its end, named "Без имени"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [...PARTY, ...ship(2)], TWO_SETS);

  // #when
  await page.getByRole('button', { name: ADD_SHIP }).click();

  // #then
  await expect(page.getByRole('tab', { name: UNNAMED })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: NAME_FIELD })).toBeFocused();

  const created = (await storedRecords(page, 'sheet:')).find(
    (one) => !['sheet:anya', 'sheet:brok', 'sheet:ladya'].includes(one.k),
  );

  expect({ bar: await barOrder(page), created: created?.d }).toEqual({
    bar: [
      'Аня',
      'Брок',
      ADD_CHARACTER,
      'Инвентарь',
      'Ладья',
      UNNAMED,
      ADD_SHIP,
      'Журнал',
      SETTINGS,
    ],
    created: { set: 'ship', order: 3 },
  });
});

test('a single sheet tab shows its title, read-only, with no delete', async ({ page, context }) => {
  // #given
  await openRoom(page, context, [...PARTY, record('row:inv:gold', { gold: 12 })], TWO_SETS);

  // #when
  await page.getByRole('tab', { name: 'Инвентарь' }).click();

  // #then
  const panel = page.getByRole('tabpanel');

  expect({
    title: await panel.getByRole('heading', { level: 1 }).textContent(),
    nameFields: await panel.getByRole('textbox', { name: NAME_FIELD }).count(),
    actions: await panel.getByRole('button', { name: 'Действия с листом' }).count(),
    gold: await panel.getByRole('textbox', { name: 'gold' }).inputValue(),
  }).toEqual({ title: 'Инвентарь', nameFields: 0, actions: 0, gold: '12' });
});

// The ship "Ладья", named by its sheet set's name field `ship_name`.
function ship(order: number): StoredRecord[] {
  return [
    sheetRecord({ id: 'ladya', name: 'Ладья', order, set: 'ship' }),
    record('row:ladya:ship_name', { ship_name: 'Ладья' }),
  ];
}

// A window and its background with no preset and no data, as a room the GM opens first.
async function openEmptyRoom(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto('/index.html');

  const background = await openBackground(context);

  await expect(page.getByRole('button', { name: UPLOAD })).toBeVisible();

  return background;
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

function panelField(page: Page, name: string): ReturnType<Page['getByRole']> {
  return page.getByRole('tabpanel').getByRole('textbox', { name, exact: true });
}

// Every tab and button of the bar, by its accessible name, in the order they show from left to
// right. The "+" buttons sit outside the tab list in the DOM, so only their position tells.
async function barOrder(page: Page): Promise<string[]> {
  return page.locator('[data-tab-scroller]').evaluate((scroller) =>
    [...scroller.querySelectorAll<HTMLElement>('[role="tab"], button')]
      .map((element) => ({
        x: element.getBoundingClientRect().x,
        name: element.getAttribute('aria-label') ?? element.textContent ?? '',
      }))
      // A fresh array from `map`, so sorting it in place changes nothing else.
      // oxlint-disable-next-line no-array-sort
      .sort((first, second) => first.x - second.x)
      .map((element) => element.name),
  );
}
