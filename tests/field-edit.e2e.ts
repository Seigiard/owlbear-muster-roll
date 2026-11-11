import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';

import {
  ABSENT,
  ADD,
  openBackground,
  openRoom,
  pcSheet,
  record,
  STORAGE_PREFIX,
  storedData,
  type StoredRecord,
} from './support/room';

const CHANNEL = 'app.muster-roll/ui';
const BAD_NUMBER = 'Нужно число';
const TOO_LONG = 'Слишком длинно';

// Past the 800 ms save pause, with room for the command to reach storage.
const PAST_PAUSE_MS = 1300;

// Well inside the pause.
const WITHIN_PAUSE_MS = 300;

const PRESET = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      sections: [
        {
          title: 'Сетка',
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
          rows: [
            [
              { kind: 'text', text: 'Имя' },
              { kind: 'field', type: 'text', id: 'name' },
            ],
            [
              { kind: 'text', text: 'Заметки' },
              { kind: 'field', type: 'text', id: 'notes' },
            ],
            [
              { kind: 'text', text: 'Девиз' },
              { kind: 'field', type: 'text', id: 'motto' },
            ],
          ],
        },
        {
          title: 'Атаки',
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
          title: 'Отметки',
          rows: [
            [
              { kind: 'text', text: 'Отдых' },
              { kind: 'field', type: 'check', id: 'rested' },
            ],
          ],
        },
      ],
    },
  ],
} as const;

const RECORDS = [
  ...pcSheet('brok', 'Брок', 0),
  ...pcSheet('liza', 'Лиза', 1),
  record('row:brok:str', { str: 14, str_tired: true }),
  record('row:brok:notes', { notes: 'Первая' }),
  record('rep:brok:attack:i1', { order: 1, cells: { attack: 'Меч', bonus: 3 } }),
] as const;

const fieldPatchSchema = z.object({
  t: z.literal('command'),
  id: z.string(),
  command: z.object({ type: z.literal('field-patch'), fieldId: z.string(), value: z.json() }),
});

const axNodeSchema = z.object({
  name: z.object({ value: z.string() }).optional(),
  role: z.object({ value: z.string() }).optional(),
  properties: z
    .array(z.object({ name: z.string(), value: z.object({ value: z.json().optional() }) }))
    .optional(),
});

type FieldPatch = z.infer<typeof fieldPatchSchema>;

declare global {
  interface Window {
    wireTexts: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('a click on a check saves at once, and unchecking stores false', async ({ page, context }) => {
  // #given
  await openSheet(page, context);

  // #when
  await page.getByRole('checkbox', { name: 'Сила' }).click();
  await page.getByRole('checkbox', { name: 'Отдых' }).click();

  // #then
  await expect.poll(() => storedData(page, 'row:brok:str')).toEqual({ str: 14, str_tired: false });
  await expect.poll(() => storedData(page, 'row:brok:rested')).toEqual({ rested: true });
  await expect(page.getByRole('checkbox', { name: 'Сила' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Отдых' })).toBeChecked();
});

test('typing sends nothing per keystroke and one save after the pause', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  await watchWire(page);

  // #when
  await field(page, 'Ловкость').pressSequentially('123', { delay: 100 });
  await page.waitForTimeout(WITHIN_PAUSE_MS);

  const duringTyping = (await fieldPatches(page)).length;

  await page.waitForTimeout(PAST_PAUSE_MS);

  // #then
  expect({
    duringTyping,
    sent: (await fieldPatches(page)).map((sent) => sent.command.value),
    stored: await storedData(page, 'row:brok:dex'),
    focused: await isFocused(field(page, 'Ловкость')),
  }).toEqual({ duringTyping: 0, sent: [123], stored: { dex: 123 }, focused: true });
});

test('leaving a changed field saves it before the pause', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  await field(page, 'Ловкость').fill('7');

  // #when
  await page.keyboard.press('Tab');

  // #then
  await expect.poll(() => storedData(page, 'row:brok:dex'), { timeout: 700 }).toEqual({ dex: 7 });
});

test('a blur with no change since focus sends nothing', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  await watchWire(page);

  // #when
  await field(page, 'Сила').focus();
  await field(page, 'Сила').fill('14,0');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(PAST_PAUSE_MS);

  // #then
  expect({
    sent: (await fieldPatches(page)).length,
    shown: await field(page, 'Сила').inputValue(),
  }).toEqual({ sent: 0, shown: '14' });
});

test('a blur after a pause save with no further change sends nothing more', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  await watchWire(page);
  await field(page, 'Сила').fill('15');
  await page.waitForTimeout(PAST_PAUSE_MS);

  // #when
  await page.keyboard.press('Tab');
  await page.waitForTimeout(WITHIN_PAUSE_MS);

  // #then
  expect((await fieldPatches(page)).map((sent) => sent.command.value)).toEqual([15]);
});

test('a focused field keeps its text through a change from elsewhere, and a blur with no change shows the record', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  await watchWire(page);
  await field(page, 'Сила').focus();

  // #when
  await commandFromElsewhere(page, { kind: 'row', rowId: 'str' }, 'str', 20);
  await expect.poll(() => storedData(page, 'row:brok:str')).toEqual({ str: 20, str_tired: true });

  const whileFocused = await field(page, 'Сила').inputValue();

  await page.keyboard.press('Tab');

  // #then
  await expect(field(page, 'Сила')).toHaveValue('20');
  expect({ whileFocused, ownPatches: await ownFieldPatches(page) }).toEqual({
    whileFocused: '14',
    ownPatches: 0,
  });
});

test('a field not being edited shows a change from elsewhere', async ({ page, context }) => {
  // #given
  await openSheet(page, context);

  // #when
  await commandFromElsewhere(page, { kind: 'row', rowId: 'notes' }, 'notes', 'Новая');

  // #then
  await expect(field(page, 'Заметки')).toHaveValue('Новая');
});

test('a changed field is saved when its tab goes away before the pause or a blur', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  await field(page, 'Ловкость').fill('8');

  // #when: a script click changes the tab and leaves the focus where it is, so no blur comes.
  await page.getByRole('tab', { name: 'Лиза' }).evaluate((tab) => {
    if (tab instanceof HTMLElement) {
      tab.click();
    }
  });

  // #then
  await expect(page.getByRole('tab', { name: 'Лиза', selected: true })).toBeVisible();
  await expect.poll(() => storedData(page, 'row:brok:dex'), { timeout: 700 }).toEqual({ dex: 8 });
});

test('an invalid value is not saved when its tab goes away', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  await watchWire(page);
  await field(page, 'Ловкость').fill('abc');

  // #when
  await page.getByRole('tab', { name: 'Лиза' }).evaluate((tab) => {
    if (tab instanceof HTMLElement) {
      tab.click();
    }
  });
  await page.waitForTimeout(PAST_PAUSE_MS);

  // #then
  expect({
    sent: (await fieldPatches(page)).length,
    stored: await storedData(page, 'row:brok:dex'),
  }).toEqual({ sent: 0, stored: ABSENT });
});

test('a changed field is saved when the window closes before the pause', async ({
  page,
  context,
}) => {
  // #given
  const background = await openSheet(page, context);

  await field(page, 'Ловкость').fill('9');

  // #when
  await page.close();

  // #then
  await expect
    .poll(() => storedData(background, 'row:brok:dex'), { timeout: 700 })
    .toEqual({ dex: 9 });
});

test('on close the queue held by a rate limit goes out, then the newer typed value', async ({
  page,
  context,
}) => {
  // #given: the first save meets a rate limit, so the queue waits out its backoff, a second save
  // of the same field waits behind it, and a newer value of that field is typed and not left.
  const background = await openSheet(page, context);

  await page.evaluate(() => {
    window.mockPlatform.failNextSends([{ kind: 'rate-limited' }]);
  });
  await field(page, 'Сила').fill('20');
  await page.keyboard.press('Tab');
  await field(page, 'Ловкость').fill('8');
  await page.keyboard.press('Tab');
  await field(page, 'Ловкость').fill('9');

  // #when
  await page.close();

  // #then
  await expect
    .poll(
      async () => ({
        str: await storedData(background, 'row:brok:str'),
        dex: await storedData(background, 'row:brok:dex'),
      }),
      { timeout: 700 },
    )
    .toEqual({ str: { str: 20, str_tired: true }, dex: { dex: 9 } });
});

test('an invalid value is not saved when the window closes', async ({ page, context }) => {
  // #given
  const background = await openSheet(page, context);

  await field(page, 'Ловкость').fill('abc');

  // #when
  await page.close();
  await background.waitForTimeout(PAST_PAUSE_MS);

  // #then
  expect(await storedData(background, 'row:brok:dex')).toBe(ABSENT);
});

test('a number is stored as a JSON number, text as typed, and a cleared field has no key', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #when
  await field(page, 'Ловкость').fill('12');
  await field(page, 'Девиз').fill('abc');
  await field(page, 'Заметки').fill('');
  await page.keyboard.press('Tab');

  // #then
  await expect
    .poll(async () => ({
      dex: await storedText(page, 'row:brok:dex'),
      motto: await storedData(page, 'row:brok:motto'),
      notes: await storedData(page, 'row:brok:notes'),
    }))
    .toEqual({
      dex: '{"k":"row:brok:dex","d":{"dex":12},"c":1,"a":"mock-connection"}',
      motto: { motto: 'abc' },
      notes: {},
    });
});

test('a saved value stays after a reload', async ({ page, context }) => {
  // #given
  const background = await openSheet(page, context);

  await field(page, 'Ловкость').fill('1,5');
  await page.keyboard.press('Tab');
  await expect.poll(() => storedData(page, 'row:brok:dex')).toEqual({ dex: 1.5 });

  // #when
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD })).toBeVisible();

  // #then
  await expect(field(page, 'Ловкость')).toHaveValue('1.5');
});

test('a field of a repeat block saves into that repeat block', async ({ page, context }) => {
  // #given
  await openSheet(page, context);

  // #when
  await field(page, 'bonus').fill('-2');
  await page.keyboard.press('Tab');

  // #then
  await expect
    .poll(() => storedData(page, 'rep:brok:attack:i1'))
    .toEqual({ order: 1, cells: { attack: 'Меч', bonus: -2 } });
});

for (const [label, typed] of [
  ['letters', 'abc'],
  ['an exponent', '1e999'],
  ['spaces only', '   '],
] as const) {
  test(`${label} in a number field shows the message under it, stay and are not saved`, async ({
    page,
    context,
  }) => {
    // #given
    await openSheet(page, context);
    await watchWire(page);

    // #when
    await field(page, 'Сила').fill(typed);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(PAST_PAUSE_MS);

    // #then
    await expect(field(page, 'Сила')).toHaveAccessibleDescription(BAD_NUMBER);
    expect({
      invalid: await field(page, 'Сила').getAttribute('aria-invalid'),
      shown: await field(page, 'Сила').inputValue(),
      below: await messageBelow(page, field(page, 'Сила'), BAD_NUMBER),
      sent: (await fieldPatches(page)).length,
      stored: await storedData(page, 'row:brok:str'),
    }).toEqual({
      invalid: 'true',
      shown: typed,
      below: true,
      sent: 0,
      stored: { str: 14, str_tired: true },
    });
  });
}

test('the bad number message goes with the next valid save', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  await field(page, 'Сила').fill('abc');
  await page.keyboard.press('Tab');
  await expect(page.getByText(BAD_NUMBER)).toBeVisible();

  // #when
  await field(page, 'Сила').fill('16');
  await page.keyboard.press('Tab');

  // #then
  await expect(page.getByText(BAD_NUMBER)).toHaveCount(0);
  await expect.poll(() => storedData(page, 'row:brok:str')).toEqual({ str: 16, str_tired: true });
});

test('a value too long for its record shows the message under it, stays and is not saved', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  await watchWire(page);

  const long = 'ы'.repeat(7400);

  // #when
  await field(page, 'Заметки').fill(long);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(PAST_PAUSE_MS);

  // #then
  await expect(field(page, 'Заметки')).toHaveAccessibleDescription(TOO_LONG);
  expect({
    invalid: await field(page, 'Заметки').getAttribute('aria-invalid'),
    kept: (await field(page, 'Заметки').inputValue()) === long,
    below: await messageBelow(page, field(page, 'Заметки'), TOO_LONG),
    sent: (await fieldPatches(page)).length,
    stored: await storedData(page, 'row:brok:notes'),
  }).toEqual({ invalid: 'true', kept: true, below: true, sent: 0, stored: { notes: 'Первая' } });
});

for (const name of ['Ловкость', 'Девиз'] as const) {
  test(`Enter commits the ${name} field and keeps the focus`, async ({ page, context }) => {
    // #given
    await openSheet(page, context);
    await field(page, name).fill('5');

    // #when
    await field(page, name).press('Enter');

    // #then
    await expect
      .poll(async () => storedText(page, `row:brok:${name === 'Ловкость' ? 'dex' : 'motto'}`), {
        timeout: 700,
      })
      .toContain(name === 'Ловкость' ? '"dex":5' : '"motto":"5"');
    expect(await isFocused(field(page, name))).toBe(true);
  });
}

test('Shift+Enter adds a line in a text field', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  await field(page, 'Девиз').fill('Раз');

  // #when
  await field(page, 'Девиз').press('Shift+Enter');
  await field(page, 'Девиз').pressSequentially('Два');
  await page.keyboard.press('Tab');

  // #then
  await expect.poll(() => storedData(page, 'row:brok:motto')).toEqual({ motto: 'Раз\nДва' });
});

test('Escape cancels the unsaved edit and shows the record value', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  await watchWire(page);
  await field(page, 'Сила').fill('99');

  // #when
  await field(page, 'Сила').press('Escape');
  await page.waitForTimeout(PAST_PAUSE_MS);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(WITHIN_PAUSE_MS);

  // #then
  expect({
    shown: await field(page, 'Сила').inputValue(),
    sent: (await fieldPatches(page)).length,
  }).toEqual({ shown: '14', sent: 0 });
});

test('a refused save returns the record value to the field', async ({ page, context }) => {
  // #given: with no background, the save gets no answer but the one the test sends.
  const background = await openSheet(page, context);

  await watchWire(page);
  await background.close();
  await field(page, 'Сила').fill('30');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await fieldPatches(page)).length).toBe(1);
  await expect(field(page, 'Сила')).toHaveValue('30');

  const [sent] = await fieldPatches(page);

  // #when
  await postToWindow(page, { t: 'command-rejected', id: sent?.id ?? '', reason: 'unknown-field' });

  // #then
  await expect(field(page, 'Сила')).toHaveValue('14');
});

test('a save the background finds too long returns the typed text with the message', async ({
  page,
  context,
}) => {
  // #given: with no background, the save gets no answer but the one the test sends.
  const background = await openSheet(page, context);

  await watchWire(page);
  await background.close();
  await field(page, 'Заметки').fill('Длинный текст');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await fieldPatches(page)).length).toBe(1);

  const [sent] = await fieldPatches(page);

  // #when
  await postToWindow(page, { t: 'command-rejected', id: sent?.id ?? '', reason: 'too-large' });

  // #then
  await expect(field(page, 'Заметки')).toHaveAccessibleDescription(TOO_LONG);
  await expect(field(page, 'Заметки')).toHaveValue('Длинный текст');
});

test('passing through a number field that holds a string or an exponent form changes nothing', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context, [
    record('row:brok:str', { str: 'много', str_tired: true }),
    record('row:brok:dex', { dex: 1e21 }),
  ]);
  await watchWire(page);

  // #when
  await field(page, 'Сила').focus();
  await page.keyboard.press('Tab');
  await field(page, 'Ловкость').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(PAST_PAUSE_MS);

  // #then
  expect({
    messages: await page.getByText(BAD_NUMBER).count(),
    str: await field(page, 'Сила').inputValue(),
    dex: await field(page, 'Ловкость').inputValue(),
    sent: (await fieldPatches(page)).length,
  }).toEqual({ messages: 0, str: 'много', dex: '1e+21', sent: 0 });
});

test('Tab goes through the tab bar, the header, then every field and repeat block control in preset order', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);
  await page.getByRole('tab', { name: 'Брок' }).focus();

  const reached: string[] = [];

  // #when
  for (let press = 0; press < 17; press += 1) {
    // Each step reads the focus the previous key left.
    // oxlint-disable-next-line no-await-in-loop
    reached.push(await focusedControl(page));
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press('Tab');
  }

  // #then
  expect(reached).toEqual([
    'tab Брок',
    'button Добавить: Персонажи',
    'textbox Имя листа',
    'button Доступ',
    'button Действия с листом',
    'textbox Сила',
    'checkbox Сила',
    'textbox Ловкость',
    'textbox Имя',
    'textbox Заметки',
    'textbox Девиз',
    'textbox attack',
    'textbox bonus',
    'button Дублировать блок 1…',
    'button Удалить блок 1',
    'button Добавить в «Атаки»',
    'checkbox Отдых',
  ]);
});

test('an empty field is an editable area at least 32 px high', async ({ page, context }) => {
  // #given
  await openSheet(page, context);
  const empty = field(page, 'Ловкость');

  // #when
  await empty.click();
  await page.keyboard.type('4');

  // #then
  expect({
    height: ((await empty.boundingBox())?.height ?? 0) >= 32,
    typed: await empty.inputValue(),
  }).toEqual({ height: true, typed: '4' });
});

test('a text field is multi-line to assistive tech and a number field is not', async ({
  page,
  context,
}) => {
  // #given
  await openSheet(page, context);

  // #when
  const multiline = await multilineByName(page);

  // #then
  expect({ notes: multiline.get('Заметки'), dex: multiline.get('Ловкость') ?? false }).toEqual({
    notes: true,
    dex: false,
  });
});

// The value control of a field, by its accessible name.
function field(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name, exact: true });
}

// `records` replace the seeded records of the same key.
async function openSheet(
  page: Page,
  context: BrowserContext,
  records: readonly StoredRecord[] = [],
): Promise<Page> {
  const keys = new Set(records.map((one) => one.k));

  const background = await openRoom(
    page,
    context,
    [...RECORDS.filter((one) => !keys.has(one.k)), ...records],
    JSON.stringify(PRESET),
  );

  await expect(page.getByRole('tab', { name: 'Брок', selected: true })).toBeVisible();

  return background;
}

async function storedText(page: Page, key: string): Promise<string | null> {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), `${STORAGE_PREFIX}${key}`);
}

async function isFocused(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element === document.activeElement);
}

async function watchWire(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.wireTexts = [];

    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      window.wireTexts.push(JSON.stringify(event.data));
    });
  }, CHANNEL);
}

async function fieldPatches(page: Page): Promise<FieldPatch[]> {
  const texts = await page.evaluate(() => window.wireTexts);

  return texts.flatMap((text) => {
    const parsed = fieldPatchSchema.safeParse(JSON.parse(text));

    return parsed.success ? [parsed.data] : [];
  });
}

async function ownFieldPatches(page: Page): Promise<number> {
  return (await fieldPatches(page)).filter((sent) => !sent.id.startsWith('elsewhere-')).length;
}

// Another GM window's save: the background cannot tell it from one this window sent.
async function commandFromElsewhere(
  page: Page,
  target: JsonValue,
  fieldId: string,
  value: JsonValue,
): Promise<void> {
  await postToWindow(page, {
    t: 'command',
    id: `elsewhere-${fieldId}`,
    command: { type: 'field-patch', sheetId: 'brok', target, fieldId, value },
  });
}

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

async function messageBelow(page: Page, control: Locator, text: string): Promise<boolean> {
  const value = await control.boundingBox();
  const message = await page.getByText(text).boundingBox();

  return (message?.y ?? 0) >= (value?.y ?? 0) + (value?.height ?? 0);
}

async function focusedControl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const focused = document.activeElement;

    if (!(focused instanceof HTMLElement)) {
      return '';
    }

    const role =
      focused.getAttribute('role') ??
      (focused instanceof HTMLInputElement && focused.type === 'checkbox'
        ? 'checkbox'
        : focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
          ? 'textbox'
          : focused.tagName.toLowerCase());

    return `${role} ${focused.getAttribute('aria-label') ?? focused.textContent ?? ''}`;
  });
}

// The `multiline` property Chrome's accessibility tree gives each textbox, by its name.
async function multilineByName(page: Page): Promise<Map<string, JsonValue>> {
  const session = await page.context().newCDPSession(page);

  const tree = z
    .object({ nodes: z.array(axNodeSchema) })
    .parse(await session.send('Accessibility.getFullAXTree'));

  const multiline = new Map<string, JsonValue>();

  for (const node of tree.nodes) {
    if (node.role?.value === 'textbox' && node.name !== undefined) {
      const property = node.properties?.find((one) => one.name === 'multiline');

      multiline.set(node.name.value, property?.value.value ?? false);
    }
  }

  return multiline;
}
