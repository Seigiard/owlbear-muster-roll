import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';

import { cssValue, renderedColor } from './support/colors';
import {
  openBackground,
  openRoom,
  sheetRecord,
  STORAGE_PREFIX,
  type SeededSheet,
} from './support/room';

const CHANNEL = 'app.muster-roll/ui';
const ADD = 'Добавить персонажа';
const NAME_FIELD = 'Имя персонажа';
const NEW_CHARACTER = 'Новый персонаж';
const TOO_LONG = 'Слишком длинно';
const SETTINGS = 'Настройки';
const GEAR = '⚙︎';
const LINE: readonly [number, number, number] = [85, 85, 85];
const LINE_STRONG: readonly [number, number, number] = [136, 136, 136];

const storedSheetSchema = z.object({
  k: z.string(),
  d: z.object({ kind: z.string(), name: z.string(), order: z.number() }),
});

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

type PinnedBoxes = { npcX: number; gearX: number; gearRight: number; gap: number };

declare global {
  interface Window {
    wireTypes: string[];
    wireTexts: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('with a preset and no sheet the bar shows "+", NPC and the gear', async ({
  page,
  context,
}) => {
  // #when
  await openWithSheets(page, context);

  // #then
  await expect(page.getByRole('tab')).toHaveText(['NPC', GEAR]);
  await expect(page.getByRole('button', { name: ADD })).toHaveText('+');
});

test('"+" creates a character, selects its tab and focuses its name', async ({ page, context }) => {
  // #given
  await openWithSheets(page, context);

  // #when
  await page.getByRole('button', { name: ADD }).click();

  // #then
  await expect(page.getByRole('tab', { name: NEW_CHARACTER })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(nameField(page)).toBeFocused();
  await expect(nameField(page)).toHaveValue(NEW_CHARACTER);

  const [stored] = await storedSheets(page);

  expect({
    key: /^sheet:[A-Za-z0-9_-]{21}$/.test(stored?.k ?? ''),
    data: stored?.d,
  }).toEqual({ key: true, data: { kind: 'pc', name: NEW_CHARACTER, order: 0 } });
});

test('a new character gets the next order and its tab goes after the others', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 3 }]);

  // #when
  await page.getByRole('button', { name: ADD }).click();
  await expect(page.getByRole('tab', { name: NEW_CHARACTER })).toBeVisible();

  // #then
  await expect(page.getByRole('tab')).toHaveText(['Брок', NEW_CHARACTER, 'NPC', GEAR]);
  const created = (await storedSheets(page)).find((sheet) => sheet.k !== 'sheet:brok');

  expect(created?.d.order).toBe(4);
});

test('a name changed and left shows in the tab and the header and stays after a reload', async ({
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
  expect(await storedNames(page)).toEqual(['Лиза']);
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

for (const [label, typed] of [
  ['an empty name', ''],
  ['a name of spaces only', '   '],
] as const) {
  test(`${label} returns the old name and saves nothing`, async ({ page, context }) => {
    // #given
    await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
    await watchWire(page);

    // #when
    await nameField(page).fill(typed);
    await page.keyboard.press('Tab');

    // #then
    await expect(nameField(page)).toHaveValue('Брок');
    expect(await savedAfterSettling(page)).toEqual({ commands: 0, names: ['Брок'] });
  });
}

test('the spaces around a name are not saved', async ({ page, context }) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Лиза', order: 0 }]);

  // #when
  await nameField(page).fill('  Брок ');
  await page.keyboard.press('Tab');

  // #then
  await expect.poll(() => storedNames(page)).toEqual(['Брок']);
  await expect(nameField(page)).toHaveValue('Брок');
});

test('a name over 100 characters shows the message, stays in the field and is not saved', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
  await watchWire(page);

  const tooLong = 'ы'.repeat(101);

  // #when
  await nameField(page).fill(` ${tooLong} `);
  await page.keyboard.press('Tab');

  // #then
  await expect(nameField(page)).toHaveAccessibleDescription(TOO_LONG);
  await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(nameField(page)).toHaveValue(` ${tooLong} `);
  expect(await savedAfterSettling(page)).toEqual({ commands: 0, names: ['Брок'] });
});

test('the too long message sits under the field and goes with the next valid save', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
  await nameField(page).fill('ы'.repeat(101));
  await page.keyboard.press('Tab');

  const field = await nameField(page).boundingBox();
  const message = await page.getByText(TOO_LONG).boundingBox();

  // #when
  await nameField(page).fill('ы'.repeat(100));
  await page.keyboard.press('Tab');

  // #then
  await expect(page.getByText(TOO_LONG)).toHaveCount(0);
  await expect(nameField(page)).not.toHaveAttribute('aria-invalid', 'true');
  expect({
    below: (message?.y ?? 0) >= (field?.y ?? 0) + (field?.height ?? 0),
    saved: await storedNames(page),
  }).toEqual({ below: true, saved: ['ы'.repeat(100)] });
});

test('leaving the field with the same name sends no command', async ({ page, context }) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 0 }]);
  await watchWire(page);

  // #when
  await nameField(page).fill(' Брок');
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

  // #then
  await expect
    .poll(async () => (await sentCommands(page)).map((sent) => sent.command.type))
    .toEqual(['sheet-rename', 'sheet-rename']);
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
        d: { kind: 'pc', name: NEW_CHARACTER, order: 1 },
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
    roomCopy: { state: 'none', usedBytes: 0, freeBytes: 15500 },
  });

  // #then
  await expect(page.getByRole('tab', { name: NEW_CHARACTER })).toBeVisible();
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
    before: ['Зет', 'А', 'Бэ', 'NPC', GEAR],
    after: ['Зет', 'А', 'Бэ', 'NPC', GEAR],
  });
});

test('after the projection the first character tab is selected', async ({ page, context }) => {
  // #when
  await openWithSheets(page, context, [
    { id: 'b', name: 'Бэ', order: 1 },
    { id: 'z', name: 'Зет', order: 0 },
  ]);

  // #then
  await expect(page.getByRole('tab', { name: 'Зет' })).toHaveAttribute('aria-selected', 'true');
});

test('a window opened while the background runs selects the first character tab', async ({
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
      - tab "${SETTINGS}"
  `);
  expect({
    children: await page
      .getByRole('tablist')
      .evaluate((list) => [...list.children].map((child) => child.getAttribute('role'))),
    addInList: await page.getByRole('tablist').getByRole('button').count(),
    add: await page.getByRole('button', { name: ADD }).count(),
  }).toEqual({ children: ['tab', 'tab', 'tab'], addInList: 0, add: 1 });
});

test('arrow keys move focus through every tab, NPC and the gear included', async ({
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
  for (let step = 0; step < 4; step += 1) {
    // Each step reads the focus the previous key left.
    // oxlint-disable-next-line no-await-in-loop
    focused.push(await focusedText(page));
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press('ArrowRight');
  }

  // #then
  expect(focused).toEqual(['Брок', 'Лиза', 'NPC', GEAR]);
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

test.describe('with more characters than fit', () => {
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

  test('NPC and the gear stay at the right while the tabs scroll under them', async ({
    page,
    context,
  }) => {
    // #given
    await openWithSheets(page, context, many);

    const before = await pinnedBoxes(page);

    // #when
    await scrollBarTo(page, 150);

    // #then
    expect({
      after: await pinnedBoxes(page),
      gearRight: before.gearRight,
      gap: before.gap,
    }).toEqual({
      after: before,
      // The bar has 8 px of padding inside the 600 px window.
      gearRight: 592,
      gap: 8,
    });
  });

  test('"+" follows the last character and scrolls with the tabs', async ({ page, context }) => {
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

  test('at the end of the scroll "+" is clear of NPC', async ({ page, context }) => {
    // #given
    await openWithSheets(page, context, many);

    // #when
    await scrollBarTo(page, 100_000);

    // #then
    const add = await page.getByRole('button', { name: ADD }).boundingBox();
    const npc = await page.getByRole('tab', { name: 'NPC' }).boundingBox();

    expect((npc?.x ?? 0) - ((add?.x ?? 0) + (add?.width ?? 0))).toBe(8);
  });

  test('"+" opens the new tab at the end and scrolls it into view', async ({ page, context }) => {
    // #given
    await openWithSheets(page, context, many);

    // #when
    await scrollBarTo(page, 100_000);
    await page.getByRole('button', { name: ADD }).click();

    // #then
    await expect(page.getByRole('tab', { name: NEW_CHARACTER })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(nameField(page)).toBeFocused();

    const created = await page.getByRole('tab', { name: NEW_CHARACTER }).boundingBox();
    const npc = await page.getByRole('tab', { name: 'NPC' }).boundingBox();

    expect((created?.x ?? 0) + (created?.width ?? 0)).toBeLessThanOrEqual(npc?.x ?? 0);
  });
});

function nameField(page: Page): Locator {
  return page.getByRole('textbox', { name: NAME_FIELD });
}

function openWithSheets(
  page: Page,
  context: BrowserContext,
  sheets: readonly SeededSheet[] = [],
): Promise<Page> {
  return openRoom(page, context, sheets.map(sheetRecord));
}

async function reloadRoom(page: Page, context: BrowserContext, background: Page): Promise<void> {
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD })).toBeVisible();
}

async function storedSheets(page: Page): Promise<StoredSheet[]> {
  const texts = await page.evaluate(
    (prefix) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(`${prefix}sheet:`))
        .map((key) => localStorage.getItem(key) ?? 'null'),
    STORAGE_PREFIX,
  );

  return texts.map((text) => storedSheetSchema.parse(JSON.parse(text)));
}

async function storedNames(page: Page): Promise<string[]> {
  return (await storedSheets(page)).map((sheet) => sheet.d.name);
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
  return page.getByRole('tablist').locator('..');
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
    npcX: npc?.x ?? 0,
    gearX: gear?.x ?? 0,
    gearRight: (gear?.x ?? 0) + (gear?.width ?? 0),
    gap: (gear?.x ?? 0) - ((npc?.x ?? 0) + (npc?.width ?? 0)),
  };
}
