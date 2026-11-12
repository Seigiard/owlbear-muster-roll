import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';

import { cssValue, renderedColor } from './support/colors';
import {
  ABSENT,
  ADD,
  openBackground,
  openRoom,
  sheetRecords,
  STORAGE_PREFIX,
  storedData,
  type SeededSheet,
} from './support/room';

const CHANNEL = 'app.muster-roll/ui';
const NAME_FIELD = 'Имя листа';
const UNNAMED = 'Без имени';
const TOO_LONG = 'Слишком длинно';
const SETTINGS = 'Настройки';
const GEAR = '⚙︎';
const LINE: readonly [number, number, number] = [78, 81, 97];
const LINE_STRONG: readonly [number, number, number] = [145, 147, 156];

// A value whose `row:` record cannot fit one message, as `field-edit.e2e.ts` measures it.
const TOO_LONG_NAME = 'ы'.repeat(7400);

const storedSheetSchema = z.object({
  k: z.string(),
  d: z.object({ set: z.string(), order: z.number() }),
});

const storedNameSchema = z.object({ d: z.object({ name: z.string().optional() }) });

const sentCommandSchema = z.object({
  t: z.literal('command'),
  id: z.string(),
  command: z.object({ type: z.string(), sheetId: z.string().optional() }),
});

const deltaSchema = z.object({ t: z.literal('delta'), engine: z.string(), seq: z.number() });

type StoredSheet = z.infer<typeof storedSheetSchema>;

type SentCommand = z.infer<typeof sentCommandSchema>;

type Delta = z.infer<typeof deltaSchema>;

type Saved = { commands: number; names: string[] };

type PinnedBoxes = { gearX: number; gearRight: number; npcX: number };

declare global {
  interface Window {
    wireTypes: string[];
    wireTexts: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('with a preset and no sheet the bar shows the single sheets, the gear and "+" of the sheet set', async ({
  page,
  context,
}) => {
  // #when
  await openWithSheets(page, context);

  // #then
  await expect(page.getByRole('tab')).toHaveText(['NPC', 'Инвентарь', GEAR]);
  await expect(page.getByRole('button', { name: ADD })).toHaveText('+');
});

test('"+" creates a sheet with an empty name, selects its tab "Без имени" and focuses its name', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context);

  // #when
  await page.getByRole('button', { name: ADD }).click();

  // #then
  await expect(page.getByRole('tab', { name: UNNAMED })).toHaveAttribute('aria-selected', 'true');
  await expect(nameField(page)).toBeFocused();
  await expect(nameField(page)).toHaveValue('');
  await expect(nameField(page)).toHaveAttribute('placeholder', UNNAMED);

  const [stored] = await storedSheets(page);
  const sheetId = stored?.k.slice('sheet:'.length) ?? '';

  expect({
    // TASK-37: a new sheet id is 12 characters of the URL-safe nanoid alphabet.
    key: /^sheet:[A-Za-z0-9_-]{12}$/.test(stored?.k ?? ''),
    data: stored?.d,
    // AD-2: the name lives in the name field's row, and an empty name has no value.
    name: await storedData(page, `row:${sheetId}:name`),
  }).toEqual({ key: true, data: { set: 'pc', order: 0 }, name: ABSENT });
});

test('a new sheet gets the next order and its tab goes after the others of its sheet set', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 3 }]);

  // #when
  await page.getByRole('button', { name: ADD }).click();
  await expect(page.getByRole('tab', { name: UNNAMED })).toBeVisible();

  // #then
  await expect(page.getByRole('tab')).toHaveText(['Брок', UNNAMED, 'NPC', 'Инвентарь', GEAR]);
  const created = (await storedSheets(page)).find((sheet) => sheet.k !== 'sheet:brok');

  expect(created?.d.order).toBe(4);
});

test('a name changed and left shows in the tab, the header and the name field, and stays after a reload', async ({
  page,
  context,
}) => {
  // #given
  const background = await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  // #when
  await nameField(page).fill('Лиза');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tab', { name: 'Лиза' })).toBeVisible();
  await reloadRoom(page, context, background);

  // #then
  await expect(page.getByRole('tab', { name: 'Лиза' })).toHaveAttribute('aria-selected', 'true');
  await expect(nameField(page)).toHaveValue('Лиза');
  await expect(sheetNameField(page)).toHaveValue('Лиза');
  expect(await storedData(page, 'row:brok:name')).toEqual({ name: 'Лиза' });
});

test('the name field in the sheet renames the tab and the header', async ({ page, context }) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  // #when
  await sheetNameField(page).fill('Лиза');
  await page.keyboard.press('Tab');

  // #then
  await expect(page.getByRole('tab', { name: 'Лиза' })).toHaveAttribute('aria-selected', 'true');
  await expect(nameField(page)).toHaveValue('Лиза');
  await expect.poll(() => storedNames(page)).toEqual(['Лиза']);
});

test('Enter saves the name as leaving the field does', async ({ page, context }) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  // #when
  await nameField(page).fill('Лиза');
  await nameField(page).press('Enter');

  // #then
  await expect.poll(() => storedNames(page)).toEqual(['Лиза']);
  await expect(page.getByRole('tab', { name: 'Лиза' })).toBeVisible();
});

test('Escape returns the old name and saves nothing', async ({ page, context }) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
  await watchWire(page);
  await nameField(page).fill('Лиза');

  // #when
  await nameField(page).press('Escape');
  await page.keyboard.press('Tab');

  // #then
  await expect(nameField(page)).toHaveValue('Брок');
  expect(await savedAfterSettling(page)).toEqual({ commands: 0, names: ['Брок'] });
});

test('an emptied name is cleared, and the tab and the header show "Без имени"', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  // #when
  await nameField(page).fill('');
  await page.keyboard.press('Tab');

  // #then
  await expect(page.getByRole('tab', { name: UNNAMED })).toHaveAttribute('aria-selected', 'true');
  await expect(nameField(page)).toHaveValue('');
  await expect(nameField(page)).toHaveAttribute('placeholder', UNNAMED);
  // AD-2: an emptied record keeps a non-null `d`.
  await expect.poll(() => storedData(page, 'row:brok:name')).toEqual({});
});

test('a name too long for its record shows the message under the field, stays and is not saved', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
  await watchWire(page);

  // #when
  await nameField(page).fill(TOO_LONG_NAME);
  await page.keyboard.press('Tab');

  // #then
  await expect(nameField(page)).toHaveAccessibleDescription(TOO_LONG);
  await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true');
  expect({
    kept: (await nameField(page).inputValue()) === TOO_LONG_NAME,
    saved: await savedAfterSettling(page),
  }).toEqual({ kept: true, saved: { commands: 0, names: ['Брок'] } });
});

test('the too long message sits under the field and goes with the next valid save', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
  await nameField(page).fill(TOO_LONG_NAME);
  await page.keyboard.press('Tab');

  const field = await nameField(page).boundingBox();
  const message = await page.getByText(TOO_LONG).boundingBox();

  // #when
  await nameField(page).fill('ы'.repeat(100));
  await page.keyboard.press('Tab');

  // #then
  await expect(page.getByText(TOO_LONG)).toHaveCount(0);
  await expect(nameField(page)).not.toHaveAttribute('aria-invalid', 'true');
  await expect.poll(() => storedNames(page)).toEqual(['ы'.repeat(100)]);
  expect((message?.y ?? 0) >= (field?.y ?? 0) + (field?.height ?? 0)).toBe(true);
});

test('leaving the field with the same name sends no command', async ({ page, context }) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
  await watchWire(page);

  // #when
  await nameField(page).fill('Брок');
  await page.keyboard.press('Tab');

  // #then
  await expect(nameField(page)).toHaveValue('Брок');
  expect(await savedAfterSettling(page)).toEqual({ commands: 0, names: ['Брок'] });
});

test('a refused rename returns the old name to the field', async ({ page, context }) => {
  // #given: with no background, the rename gets no answer but the one the test sends.
  const background = await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  await watchWire(page);
  await background.close();
  await nameField(page).fill('Лиза');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await sentCommands(page)).length).toBe(1);

  const [rename] = await sentCommands(page);

  // #when
  await postToWindow(page, {
    t: 'command-rejected',
    id: rename?.id ?? '',
    reason: 'deleted-sheet',
  });

  // #then
  await expect(nameField(page)).toHaveValue('Брок');
});

test('a rename back to the shown name while the first is on its way still goes out', async ({
  page,
  context,
}) => {
  // #given: with no background, the first rename stays on its way.
  const background = await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  await watchWire(page);
  await background.close();
  await nameField(page).fill('Лиза');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await expect(nameField(page)).toHaveValue('Лиза');

  // #when
  await nameField(page).fill('Брок');
  await page.keyboard.press('Tab');

  // #then: a rename is a field patch of the name field (AD-10).
  await expect
    .poll(async () => (await sentCommands(page)).map((sent) => sent.command.type))
    .toEqual(['field-patch', 'field-patch']);
});

test('a refused creation does not take the selection when its record shows up later', async ({
  page,
  context,
}) => {
  // #given: a rename gives the test the engine id and the sequence of a real delta.
  const background = await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  await watchWire(page);
  await nameField(page).fill('Лиза');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tab', { name: 'Лиза' })).toBeVisible();
  await background.close();
  await page.getByRole('button', { name: ADD }).click();
  await expect.poll(async () => (await sentCommands(page)).length).toBe(2);

  const create = (await sentCommands(page)).find((sent) => sent.command.type === 'sheet-create');
  const delta = await lastDelta(page);

  await postToWindow(page, { t: 'command-rejected', id: create?.id ?? '', reason: 'sheet-exists' });

  // #when
  await postToWindow(page, {
    t: 'delta',
    engine: delta?.engine ?? '',
    seq: (delta?.seq ?? 0) + 1,
    records: [
      {
        k: `sheet:${create?.command.sheetId ?? ''}`,
        d: { set: 'pc', order: 1 },
        c: 1,
        a: 'other-connection',
      },
    ],
    notices: [],
    pending: [],
    withdrawn: [],
    sync: {
      state: 'live',
      firstCatchUpDone: true,
      gmAnswered: false,
      gmLink: 'offline',
      role: 'GM',
    },
    roomCopy: { state: 'none', usedBytes: 0, freeBytes: 15500, outcome: null },
  });

  // #then
  await expect(page.getByRole('tab', { name: UNNAMED })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Лиза' })).toHaveAttribute('aria-selected', 'true');
});

test('tabs sort by order, then by sheetId in code unit order, the same after a reload', async ({
  page,
  context,
}) => {
  // #given
  const background = await openWithSheets(page, context, [
    // Locale order would put "a" first. Code unit order puts "B" first.
    { id: 'a', name: 'Бэ', order: 1 },
    { id: 'B', name: 'А', order: 1 },
    { id: 'z', name: 'Зет', order: 0 },
  ]);

  const before = await page.getByRole('tab').allTextContents();

  // #when
  await reloadRoom(page, context, background);

  // #then
  expect({ before, after: await page.getByRole('tab').allTextContents() }).toEqual({
    before: ['Зет', 'А', 'Бэ', 'NPC', 'Инвентарь', GEAR],
    after: ['Зет', 'А', 'Бэ', 'NPC', 'Инвентарь', GEAR],
  });
});

test('after the projection the first tab is selected', async ({ page, context }) => {
  // #when
  await openWithSheets(page, context, [
    { id: 'b', name: 'Бэ', order: 1 },
    { id: 'z', name: 'Зет', order: 0 },
  ]);

  // #then
  await expect(page.getByRole('tab', { name: 'Зет' })).toHaveAttribute('aria-selected', 'true');
});

test('a window opened while the background runs selects the first tab', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [
    { id: 'b', name: 'Бэ', order: 1 },
    { id: 'z', name: 'Зет', order: 0 },
  ]);

  const second = await context.newPage();

  // #when
  await second.goto('/index.html');

  // #then
  await expect(second.getByRole('tab', { name: 'Зет' })).toHaveAttribute('aria-selected', 'true');
});

test('the tab list holds only tabs and "+" is a named button outside it', async ({
  page,
  context,
}) => {
  // #when
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  // #then
  await expect(page.getByRole('tablist')).toMatchAriaSnapshot(`
    - tablist:
      - tab "Брок" [selected]
      - tab "NPC"
      - tab "Инвентарь"
      - tab "${SETTINGS}"
  `);
  expect({
    children: await page
      .getByRole('tablist')
      .evaluate((list) => [...list.children].map((child) => child.getAttribute('role'))),
    addInList: await page.getByRole('tablist').getByRole('button').count(),
    add: await page.getByRole('button', { name: ADD }).count(),
  }).toEqual({ children: ['tab', 'tab', 'tab', 'tab'], addInList: 0, add: 1 });
});

test('arrow keys move focus through every tab, the single sheets and the gear included', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [
    { id: 'a', name: 'Брок', order: 0 },
    { id: 'b', name: 'Лиза', order: 1 },
  ]);
  await page.getByRole('tab', { name: 'Брок' }).focus();

  const focused: string[] = [];

  // #when
  for (let step = 0; step < 5; step += 1) {
    // Each step reads the focus the previous key left.
    // oxlint-disable-next-line no-await-in-loop
    focused.push(await focusedText(page));
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press('ArrowRight');
  }

  // #then
  expect(focused).toEqual(['Брок', 'Лиза', 'NPC', 'Инвентарь', GEAR]);
});

test('the header shows the name in sheet-title over a bottom rule in line', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);

  const header = page.getByRole('tabpanel').locator('header');

  // #when
  const style = {
    fontSize: await cssValue(nameField(page), 'font-size'),
    fontWeight: await cssValue(nameField(page), 'font-weight'),
    lineHeight: await cssValue(nameField(page), 'line-height'),
    rule: await cssValue(header, 'border-bottom-style'),
    ruleWidth: await cssValue(header, 'border-bottom-width'),
    ruleColor: await renderedColor(header, 'border-bottom-color'),
    underline: await cssValue(nameField(page), 'border-bottom-style'),
    underlineColor: await renderedColor(nameField(page), 'border-bottom-color'),
  };

  // #then
  expect(style).toEqual({
    fontSize: '16px',
    fontWeight: '600',
    lineHeight: '20.8px',
    rule: 'solid',
    ruleWidth: '1px',
    ruleColor: LINE,
    underline: 'dotted',
    underlineColor: LINE_STRONG,
  });
});

test('a long name is cut with an ellipsis and stays whole as the accessible name', async ({
  page,
  context,
}) => {
  // #given
  const longName = 'Эльверанха Длинноименная из Дома Бесконечных Имён';

  // #when
  await openWithSheets(page, context, [{ id: 'long', name: longName, order: 0 }]);

  // #then
  const tab = page.getByRole('tab', { name: longName });
  const label = tab.locator('span');

  expect({
    width: (await tab.boundingBox())?.width,
    overflow: await cssValue(label, 'text-overflow'),
    cut: await label.evaluate((element) => element.scrollWidth > element.clientWidth),
  }).toEqual({ width: 160, overflow: 'ellipsis', cut: true });
});

test.describe('with more sheets than fit', () => {
  const many: SeededSheet[] = Array.from({ length: 12 }, (_unused, index) => ({
    id: `s${String(index).padStart(2, '0')}`,
    name: `Персонаж ${index + 1}`,
    order: index,
  }));

  test('a vertical wheel over the bar scrolls the tabs sideways', async ({ page, context }) => {
    // #given
    await openWithSheets(page, context, many);
    await page.getByRole('tab', { name: 'Персонаж 1', exact: true }).hover();

    // #when
    await page.mouse.wheel(0, 120);

    // #then
    await expect.poll(() => scrollLeftOf(page)).toBe(120);
  });

  test('a wheel that counts lines scrolls 20 px per line', async ({ page, context }) => {
    // #given
    await openWithSheets(page, context, many);

    // #when
    await page
      .getByRole('tab', { name: 'Персонаж 1', exact: true })
      .evaluate((tab) =>
        tab.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true })),
      );

    // #then
    await expect.poll(() => scrollLeftOf(page)).toBe(60);
  });

  test('a horizontal gesture scrolls the tabs', async ({ page, context }) => {
    // #given
    await openWithSheets(page, context, many);
    await page.getByRole('tab', { name: 'Персонаж 1', exact: true }).hover();

    // #when
    await page.mouse.wheel(90, 0);

    // #then
    await expect.poll(() => scrollLeftOf(page)).toBe(90);
  });

  test('only the gear stays at the right, and the single sheet tabs scroll with the rest', async ({
    page,
    context,
  }) => {
    // #given
    await openWithSheets(page, context, many);

    const before = await pinnedBoxes(page);

    // #when
    await scrollBarTo(page, 150);

    // #then
    const after = await pinnedBoxes(page);

    expect({
      gearX: after.gearX,
      gearRight: after.gearRight,
      npcMoved: before.npcX - after.npcX,
    }).toEqual({
      gearX: before.gearX,
      // The bar has 8 px of padding inside the 600 px window.
      gearRight: 592,
      npcMoved: 150,
    });
  });

  test('"+" follows the last sheet of its set and scrolls with the tabs', async ({
    page,
    context,
  }) => {
    // #given
    await openWithSheets(page, context, many);

    const add = page.getByRole('button', { name: ADD });
    const startX = (await add.boundingBox())?.x ?? 0;

    // #when
    await scrollBarTo(page, 100);

    // #then
    const last = await page.getByRole('tab', { name: 'Персонаж 12' }).boundingBox();
    const scrolled = await add.boundingBox();

    expect({
      moved: startX - (scrolled?.x ?? 0),
      gap: (scrolled?.x ?? 0) - ((last?.x ?? 0) + (last?.width ?? 0)),
    }).toEqual({ moved: 100, gap: 8 });
  });

  test('at the end of the scroll the last tab is clear of the gear', async ({ page, context }) => {
    // #given
    await openWithSheets(page, context, many);

    // #when
    await scrollBarTo(page, 100_000);

    // #then
    const last = await page.getByRole('tab', { name: 'Инвентарь' }).boundingBox();
    const gear = await page.getByRole('tab', { name: SETTINGS }).boundingBox();

    // A fractional scroll offset leaves a fraction of a pixel.
    expect(Math.round((gear?.x ?? 0) - ((last?.x ?? 0) + (last?.width ?? 0)))).toBe(8);
  });

  test('"+" opens the new tab after the last sheet and scrolls it into view', async ({
    page,
    context,
  }) => {
    // #given
    await openWithSheets(page, context, many);

    // #when
    await scrollBarTo(page, 100_000);
    await page.getByRole('button', { name: ADD }).click();

    // #then
    await expect(page.getByRole('tab', { name: UNNAMED })).toHaveAttribute('aria-selected', 'true');
    await expect(nameField(page)).toBeFocused();

    const created = await page.getByRole('tab', { name: UNNAMED }).boundingBox();
    const gear = await page.getByRole('tab', { name: SETTINGS }).boundingBox();

    expect({
      tabs: (await page.getByRole('tab').allTextContents()).slice(-4),
      clearOfGear: (created?.x ?? 0) + (created?.width ?? 0) <= (gear?.x ?? 0),
      inView: (created?.x ?? -1) >= 0,
    }).toEqual({
      tabs: [UNNAMED, 'NPC', 'Инвентарь', GEAR],
      clearOfGear: true,
      inView: true,
    });
  });
});

function nameField(page: Page): Locator {
  return page.getByRole('textbox', { name: NAME_FIELD });
}

// The name field `name` of the example preset, in the sheet's own section "Персонаж".
function sheetNameField(page: Page): Locator {
  return page
    .getByRole('tabpanel')
    .getByRole('region', { name: 'Персонаж' })
    .getByRole('textbox', { name: 'Имя', exact: true });
}

function openWithSheets(
  page: Page,
  context: BrowserContext,
  sheets: readonly SeededSheet[] = [],
): Promise<Page> {
  return openRoom(page, context, sheets.flatMap(sheetRecords));
}

async function reloadRoom(page: Page, context: BrowserContext, background: Page): Promise<void> {
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD })).toBeVisible();
}

async function storedTexts(page: Page, form: string): Promise<string[]> {
  return page.evaluate(
    ([prefix, start]) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(`${prefix}${start}`))
        .map((key) => localStorage.getItem(key) ?? 'null'),
    [STORAGE_PREFIX, form] as const,
  );
}

async function storedSheets(page: Page): Promise<StoredSheet[]> {
  return (await storedTexts(page, 'sheet:')).map((text) =>
    storedSheetSchema.parse(JSON.parse(text)),
  );
}

// The stored values of every name field `name`, which the example preset keeps in `row:{id}:name`.
async function storedNames(page: Page): Promise<string[]> {
  const texts = await storedTexts(page, 'row:');

  return texts
    .map((text) => storedNameSchema.parse(JSON.parse(text)).d.name)
    .filter((name) => name !== undefined);
}

async function watchWire(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.wireTypes = [];
    window.wireTexts = [];

    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      window.wireTypes.push(String(Object(event.data).t));
      window.wireTexts.push(JSON.stringify(event.data));
    });
  }, CHANNEL);
}

async function wireMessages(page: Page): Promise<JsonValue[]> {
  const texts = await page.evaluate(() => window.wireTexts);

  return texts.map((text) => z.json().parse(JSON.parse(text)));
}

async function sentCommands(page: Page): Promise<SentCommand[]> {
  return (await wireMessages(page)).flatMap((message) => {
    const parsed = sentCommandSchema.safeParse(message);

    return parsed.success ? [parsed.data] : [];
  });
}

async function lastDelta(page: Page): Promise<Delta | undefined> {
  const deltas = (await wireMessages(page)).flatMap((message) => {
    const parsed = deltaSchema.safeParse(message);

    return parsed.success ? [parsed.data] : [];
  });

  return deltas.at(-1);
}

// Plays the background's part: the window cannot tell this message from one the engine sent.
async function postToWindow(page: Page, message: JsonValue): Promise<void> {
  await page.evaluate(
    ([channel, text]) => {
      // SAFETY: the text is the JSON.stringify of a JsonValue, one line below.
      const data = JSON.parse(text) as JsonValue;

      void window.mockPlatform.broadcast.sendMessage(channel, data, { destination: 'LOCAL' });
    },
    [CHANNEL, JSON.stringify(message)] as const,
  );
}

// Long enough for a command to reach the background and its record to reach storage.
async function savedAfterSettling(page: Page): Promise<Saved> {
  await page.waitForTimeout(300);

  const types = await page.evaluate(() => window.wireTypes);

  return {
    commands: types.filter((type) => type === 'command').length,
    names: await storedNames(page),
  };
}

async function focusedText(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.textContent ?? '');
}

function barScroller(page: Page): Locator {
  return page.locator('[data-tab-scroller]');
}

async function scrollLeftOf(page: Page): Promise<number> {
  return barScroller(page).evaluate((element) => element.scrollLeft);
}

async function scrollBarTo(page: Page, left: number): Promise<void> {
  await barScroller(page).evaluate((element, target) => {
    element.scrollLeft = target;
  }, left);
}

async function pinnedBoxes(page: Page): Promise<PinnedBoxes> {
  const npc = await page.getByRole('tab', { name: 'NPC' }).boundingBox();
  const gear = await page.getByRole('tab', { name: SETTINGS }).boundingBox();

  return {
    gearX: gear?.x ?? 0,
    gearRight: (gear?.x ?? 0) + (gear?.width ?? 0),
    npcX: npc?.x ?? 0,
  };
}
