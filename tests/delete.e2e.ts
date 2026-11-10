import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import { cssValue, renderedColor, tokenColor } from './support/colors';
import {
  EXAMPLE_PRESET_TEXT,
  openBackground,
  openRoom,
  presetRecord,
  record,
  sheetRecord,
  STORAGE_PREFIX,
} from './support/room';

const CHANNEL = 'app.muster-roll/ui';
const ADD = 'Добавить персонажа';
const ACTIONS = 'Действия с листом';
const DELETE = 'Удалить';
const CANCEL = 'Отменить';
const NAME_FIELD = 'Имя персонажа';
const GEAR = '⚙︎';

const storedRecordSchema = z.object({
  k: z.string(),
  d: z.json(),
  c: z.number(),
  a: z.string(),
});

type StoredRecord = z.infer<typeof storedRecordSchema>;

type Keyed = Record<string, StoredRecord>;

type SeenCommand = { id: string; type: string };

declare global {
  interface Window {
    seenCommands: SeenCommand[];
    rejectedCommandIds: string[];
  }
}

let probes = 0;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('"Удалить" in "⋯" opens one block at the top of the content area, focus on "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })]);

  // #when
  await askDelete(page);

  // #then
  await expect(page.getByRole('group')).toHaveCount(1);
  await expect(confirmation(page)).toHaveText(
    'Удалить «Брок»? Это нельзя отменить.УдалитьОтменить',
  );
  await expect(cancelButton(page)).toBeFocused();
  expect(
    await page
      .getByRole('tabpanel')
      .evaluate((panel) => panel.firstElementChild?.getAttribute('role') ?? ''),
  ).toBe('group');
});

test('the block names the sheet by its current name', async ({ page, context }) => {
  // #given
  await openRoom(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })]);
  await nameField(page).fill('Лиза');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tab', { name: 'Лиза' })).toBeVisible();

  // #when
  await askDelete(page);

  // #then
  await expect(confirmation(page)).toHaveAccessibleName('Удалить «Лиза»? Это нельзя отменить.');
});

test('the block sits on surface-bar with a line border and rounded-md', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })]);

  // #when
  await askDelete(page);

  // #then
  const block = confirmation(page);

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

test('the keyboard opens the menu, picks "Удалить" and lands on "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })]);
  await actionsButton(page).focus();

  // #when
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: DELETE })).toBeFocused();
  await page.keyboard.press('Enter');

  // #then
  await expect(cancelButton(page)).toBeFocused();
});

for (const [label, cancel] of [
  ['"Отменить"', (page: Page) => cancelButton(page).click()],
  ['Escape in the block', (page: Page) => page.keyboard.press('Escape')],
] as const) {
  test(`${label} closes the block, sends nothing and returns the focus to "⋯"`, async ({
    page,
    context,
  }) => {
    // #given
    const seeded = [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })];

    await openRoom(page, context, seeded);
    await watchCommands(page);
    await askDelete(page);
    await expect(cancelButton(page)).toBeFocused();

    // #when
    await cancel(page);

    // #then
    await expect(page.getByRole('group')).toHaveCount(0);
    await expect(actionsButton(page)).toBeFocused();
    expect(await afterSettling(page)).toEqual({ commands: [], stored: keyed(seeded) });
  });
}

test('another tab closes the block, deletes nothing, and the block is gone on return', async ({
  page,
  context,
}) => {
  // #given
  const seeded = [
    sheetRecord({ id: 'brok', name: 'Брок', order: 0 }),
    sheetRecord({ id: 'liza', name: 'Лиза', order: 1 }),
  ];

  await openRoom(page, context, seeded);
  await watchCommands(page);
  await askDelete(page);

  // #when
  await page.getByRole('tab', { name: 'Лиза' }).click();
  await expect(page.getByRole('group')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Брок' }).click();

  // #then
  await expect(nameField(page)).toHaveValue('Брок');
  await expect(page.getByRole('group')).toHaveCount(0);
  expect(await afterSettling(page)).toEqual({ commands: [], stored: keyed(seeded) });
});

test('a sheet deleted in another window closes the block there with no second command', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [
    sheetRecord({ id: 'brok', name: 'Брок', order: 0 }),
    sheetRecord({ id: 'liza', name: 'Лиза', order: 1 }),
  ]);
  await watchCommands(page);
  await askDelete(page);

  const other = await context.newPage();

  await other.setViewportSize({ width: 600, height: 600 });
  await other.goto('/index.html');

  // #when
  await askDelete(other);
  await other.getByRole('button', { name: DELETE }).click();

  // #then
  await expect(page.getByRole('tab', { name: 'Брок' })).toHaveCount(0);
  await expect(page.getByRole('group')).toHaveCount(0);
  expect(await afterSettling(page)).toEqual({
    commands: ['sheet-delete'],
    stored: keyed([
      record('sheet:brok', null, 2),
      sheetRecord({ id: 'liza', name: 'Лиза', order: 1 }),
    ]),
  });
});

test('confirming with the keyboard leaves the focus on the newly selected tab', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [
    sheetRecord({ id: 'brok', name: 'Брок', order: 0 }),
    sheetRecord({ id: 'liza', name: 'Лиза', order: 1 }),
  ]);
  await askDelete(page);
  await expect(cancelButton(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: DELETE })).toBeFocused();

  // #when
  await page.keyboard.press('Enter');

  // #then
  await expect(page.getByRole('tab', { name: 'Брок' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Лиза' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Лиза' })).toBeFocused();
});

test('picking "Удалить" again while the block is open moves the focus back to "Отменить"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })]);
  await askDelete(page);

  // #when
  await askDelete(page);

  // #then
  await expect(page.getByRole('group')).toHaveCount(1);
  await expect(cancelButton(page)).toBeFocused();
});

test('a double click on "Удалить" in the block sends one command', async ({ page, context }) => {
  // #given
  await openRoom(page, context, [
    sheetRecord({ id: 'brok', name: 'Брок', order: 0 }),
    sheetRecord({ id: 'liza', name: 'Лиза', order: 1 }),
  ]);
  await watchCommands(page);
  await askDelete(page);

  // #when
  await page.getByRole('button', { name: DELETE }).dblclick();

  // #then
  await expect(page.getByRole('tab', { name: 'Брок' })).toHaveCount(0);
  expect((await afterSettling(page)).commands).toEqual(['sheet-delete']);
});

test('a window closed with the block open shows no block and has deleted nothing', async ({
  page,
  context,
}) => {
  // #given
  const seeded = [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })];

  await openRoom(page, context, seeded);
  await askDelete(page);

  // #when
  await page.reload();

  // #then
  await expect(nameField(page)).toHaveValue('Брок');
  await expect(page.getByRole('group')).toHaveCount(0);
  expect(await storedRecords(page)).toEqual(keyed(seeded));
});

test('"Удалить" in the block sends one command, tombstones the sheet and its records only', async ({
  page,
  context,
}) => {
  // #given: "brok" with one record of every dependent form, "liza" with its own, and the preset.
  const kept = [
    sheetRecord({ id: 'liza', name: 'Лиза', order: 1 }),
    record('row:liza:str', { str: 9 }, 1),
    record('rep:liza:items:i2', { order: 0, cells: { item: 'Лук' } }, 1),
    record('acl:liza:p1', { name: 'Оля' }, 1),
    record('plink:liza:p1', { name: 'Оля' }, 1),
    record('link:token2', 'liza', 1),
  ];

  await openRoom(page, context, [
    sheetRecord({ id: 'brok', name: 'Брок', order: 0 }),
    record('row:brok:str', { str: 3 }, 2),
    record('rep:brok:items:i1', { order: 0, cells: { item: 'Меч' } }, 1),
    record('acl:brok:p1', { name: 'Оля' }, 4),
    record('plink:brok:p1', { name: 'Оля' }, 1),
    record('link:token1', 'brok', 5),
    ...kept,
  ]);
  await watchCommands(page);
  await askDelete(page);

  // #when
  await page.getByRole('button', { name: DELETE }).click();

  // #then
  await expect(page.getByRole('tab', { name: 'Брок' })).toHaveCount(0);
  expect({
    ...(await afterSettling(page)),
    preset: await page.evaluate((key) => localStorage.getItem(key), `${STORAGE_PREFIX}preset`),
  }).toEqual({
    preset: presetRecord(EXAMPLE_PRESET_TEXT),
    commands: ['sheet-delete'],
    stored: keyed([
      record('sheet:brok', null, 2),
      record('row:brok:str', null, 3),
      record('rep:brok:items:i1', null, 2),
      record('acl:brok:p1', null, 5),
      record('plink:brok:p1', null, 2),
      record('link:token1', null, 6),
      ...kept,
    ]),
  });
});

test('a deleted sheet does not return after a reload', async ({ page, context }) => {
  // #given
  const background = await openRoom(page, context, [
    sheetRecord({ id: 'brok', name: 'Брок', order: 0 }),
    sheetRecord({ id: 'liza', name: 'Лиза', order: 1 }),
  ]);

  await askDelete(page);
  await page.getByRole('button', { name: DELETE }).click();
  await expect(page.getByRole('tab', { name: 'Брок' })).toHaveCount(0);

  // #when
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD })).toBeVisible();

  // #then
  await expect(page.getByRole('tab')).toHaveText(['Лиза', 'NPC', GEAR]);
});

test('deleting the selected sheet selects the first tab, not its neighbour', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [
    sheetRecord({ id: 'a', name: 'Брок', order: 0 }),
    sheetRecord({ id: 'b', name: 'Лиза', order: 1 }),
    sheetRecord({ id: 'c', name: 'Тиша', order: 2 }),
  ]);
  await page.getByRole('tab', { name: 'Тиша' }).click();
  await askDelete(page);

  // #when
  await page.getByRole('button', { name: DELETE }).click();

  // #then
  await expect(page.getByRole('tab', { name: 'Тиша' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Брок' })).toHaveAttribute('aria-selected', 'true');
});

test('deleting the last character selects NPC', async ({ page, context }) => {
  // #given
  await openRoom(page, context, [sheetRecord({ id: 'brok', name: 'Брок', order: 0 })]);
  await askDelete(page);

  // #when
  await page.getByRole('button', { name: DELETE }).click();

  // #then
  await expect(page.getByRole('tab')).toHaveText(['NPC', GEAR]);
  await expect(page.getByRole('tab', { name: 'NPC' })).toHaveAttribute('aria-selected', 'true');
});

function actionsButton(page: Page): Locator {
  return page.getByRole('button', { name: ACTIONS });
}

function cancelButton(page: Page): Locator {
  return page.getByRole('button', { name: CANCEL });
}

function confirmation(page: Page): Locator {
  return page.getByRole('group', { name: /^Удалить «/ });
}

function nameField(page: Page): Locator {
  return page.getByRole('textbox', { name: NAME_FIELD });
}

async function askDelete(page: Page): Promise<void> {
  await actionsButton(page).click();
  await page.getByRole('menuitem', { name: DELETE }).click();
  await expect(confirmation(page)).toBeVisible();
}

// Every stored record but the preset.
async function storedRecords(page: Page): Promise<Keyed> {
  const texts = await page.evaluate(
    (prefix) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix) && key !== `${prefix}preset`)
        .map((key) => localStorage.getItem(key) ?? 'null'),
    STORAGE_PREFIX,
  );

  return keyed(texts.map((text) => storedRecordSchema.parse(JSON.parse(text))));
}

// Compared as an object, so the order the storage lists its keys in does not matter.
function keyed(records: readonly StoredRecord[]): Keyed {
  return Object.fromEntries(records.map((one) => [one.k, one]));
}

// Commands from every window reach this one too, as all windows share the LOCAL bus.
async function watchCommands(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.seenCommands = [];
    window.rejectedCommandIds = [];

    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      const message = Object(event.data);

      if (message.t === 'command') {
        window.seenCommands.push({
          id: String(message.id),
          type: String(Object(message.command).type),
        });
      } else if (message.t === 'command-rejected') {
        window.rejectedCommandIds.push(String(message.id));
      }
    });
  }, CHANNEL);
}

// The background answers in order, so once it rejects a probe sent now, every command that reached
// it before the probe has been handled and its records saved.
async function afterSettling(page: Page): Promise<{ commands: string[]; stored: Keyed }> {
  probes += 1;

  const probe = `probe-${probes}`;

  await page.evaluate(
    ([channel, id]) => {
      void window.mockPlatform.broadcast.sendMessage(
        channel,
        { t: 'command', id, command: { type: 'sheet-delete', sheetId: 'probe' } },
        { destination: 'LOCAL' },
      );
    },
    [CHANNEL, probe] as const,
  );
  await expect
    .poll(() => page.evaluate((id) => window.rejectedCommandIds.includes(id), probe))
    .toBe(true);

  const seen = await page.evaluate(() => window.seenCommands);

  return {
    commands: seen.filter((command) => command.id !== probe).map((command) => command.type),
    stored: await storedRecords(page),
  };
}
