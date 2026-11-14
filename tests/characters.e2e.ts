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

declare global {
  interface Window {
    wireTypes: string[];
    wireTexts: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('with a preset and no sheet the sheet set add control reads "+ Добавить"', async ({
  page,
  context,
}) => {
  // #when
  await openWithSheets(page, context);

  // #then
  await expect(page.getByRole('button', { name: ADD })).toHaveText('+ Добавить');
});

test('"+" creates a sheet with an empty name, selects its sidebar entry "Без имени" and focuses its name', async ({
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

test('a new sheet gets the next order and its sidebar entry goes after the others of its sheet set', async ({
  page,
  context,
}) => {
  // #given
  await openWithSheets(page, context, [{ id: 'brok', name: 'Брок', order: 3 }]);

  // #when
  await page.getByRole('button', { name: ADD }).click();
  await expect(page.getByRole('tab', { name: UNNAMED })).toBeVisible();

  // #then
  await expectSidebarEntryNames(page, ['Брок', UNNAMED, 'NPC', 'Инвентарь', SETTINGS]);
  const created = (await storedSheets(page)).find((sheet) => sheet.k !== 'sheet:brok');

  expect(created?.d.order).toBe(4);
});

test('a name changed and left shows in the sidebar entry, the header and the name field, and stays after a reload', async ({
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

test('the name field in the sheet renames the sidebar entry and the header', async ({
  page,
  context,
}) => {
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

test('an emptied name is cleared, and the sidebar entry and the header show "Без имени"', async ({
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

test('sidebar entries sort by order, then by sheetId in code unit order, the same after a reload', async ({
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

  await expectSidebarEntryNames(page, ['Зет', 'А', 'Бэ', 'NPC', 'Инвентарь', SETTINGS]);

  // #when
  await reloadRoom(page, context, background);

  // #then
  await expectSidebarEntryNames(page, ['Зет', 'А', 'Бэ', 'NPC', 'Инвентарь', SETTINGS]);
});

test('after the projection the first sidebar entry is selected', async ({ page, context }) => {
  // #when
  await openWithSheets(page, context, [
    { id: 'b', name: 'Бэ', order: 1 },
    { id: 'z', name: 'Зет', order: 0 },
  ]);

  // #then
  await expect(page.getByRole('tab', { name: 'Зет' })).toHaveAttribute('aria-selected', 'true');
});

test('a window opened while the background runs selects the first sidebar entry', async ({
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
    fontSize: '18px',
    fontWeight: '600',
    lineHeight: '23.4px',
    rule: 'solid',
    ruleWidth: '1px',
    ruleColor: LINE,
    underline: 'solid',
    underlineColor: LINE_STRONG,
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

async function expectSidebarEntryNames(page: Page, names: readonly string[]): Promise<void> {
  const entries = page.getByRole('tab');

  await expect(entries).toHaveCount(names.length);
  await Promise.all(
    names.map((name, index) => expect(entries.nth(index)).toHaveAccessibleName(name)),
  );
}
