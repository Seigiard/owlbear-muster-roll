import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { copy } from '@/copy';

import {
  ADD,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  record,
  repRecord,
  seedStorage,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

// TASK-58, CAP-34: a sheet shows one tab of its template at a time.

const OPEN_ITEM = 'app.muster-roll/open-sheet';

const GM: ClientParams = { client: 'a', device: 'a', name: 'Мастер' };

// "Персонажи" has two tabs: the dice cell on "Бой" reads `str` from "Основное", and the linkable
// repeat section "Питомцы" sits on "Бой" below a tall section. "Журнал" has one tab.
const PRESET = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tabs: [
        {
          title: 'Основное',
          sections: [
            {
              title: 'Характеристики',
              rows: [
                [
                  { kind: 'text', text: 'Имя' },
                  { kind: 'field', type: 'text', id: 'name' },
                ],
                [
                  { kind: 'text', text: 'Сила' },
                  { kind: 'field', type: 'number', id: 'str' },
                ],
              ],
            },
          ],
        },
        {
          title: 'Бой',
          sections: [
            {
              title: 'Удары',
              rows: [
                [
                  { kind: 'text', text: 'Удар' },
                  { kind: 'dice', formula: '1d1 + str' },
                ],
                ...Array.from({ length: 12 }, (_, index) => [
                  { kind: 'text', text: `Приём ${index + 1}` },
                  { kind: 'field', type: 'text', id: `move_${index + 1}` },
                ]),
              ],
            },
            {
              title: 'Питомцы',
              repeat: true,
              tokens: true,
              rows: [[{ kind: 'field', type: 'text', id: 'pet' }]],
            },
          ],
        },
      ],
    },
    {
      id: 'journal',
      kind: 'single',
      title: 'Журнал',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'weather' }]] }] }],
    },
  ],
};

const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  record('row:brok:str', { str: 14 }),
  repRecord('brok', 'pet', 'p1', 0, { pet: 'Волк' }),
  repRecord('brok', 'pet', 'p2', 1, { pet: 'Сокол' }),
  record('link:t-pet', { s: 'brok', i: 'p2' }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 500 });
});

test('a click on the second tab shows only its sections, and the sheet keeps it across sheets', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);

  await expect(sheetTab(gm.window, 'Основное')).toHaveAttribute('aria-selected', 'true');
  await expect(sectionHeading(gm.window, 'Характеристики')).toBeVisible();

  // #when
  await sheetTab(gm.window, 'Бой').click();

  // #then
  await expect(sheetTab(gm.window, 'Бой')).toHaveAttribute('aria-selected', 'true');
  await expect(sectionHeading(gm.window, 'Удары')).toBeVisible();
  await expect(sectionHeading(gm.window, 'Характеристики')).toHaveCount(0);

  // #when: another sheet, then back.
  await gm.window.getByRole('tab', { name: 'Журнал' }).click();
  await expect(gm.window.getByRole('textbox', { name: 'weather' })).toBeVisible();
  await gm.window.getByRole('tab', { name: 'Брок' }).click();

  // #then
  await expect(sheetTab(gm.window, 'Бой')).toHaveAttribute('aria-selected', 'true');
  await expect(sectionHeading(gm.window, 'Удары')).toBeVisible();
});

test('a sheet of a template with one tab draws no tab row', async ({ context }) => {
  // #given
  const gm = await openGm(context);

  // #when
  await gm.window.getByRole('tab', { name: 'Журнал' }).click();

  // #then
  await expect(gm.window.getByRole('textbox', { name: 'weather' })).toBeVisible();
  await expect(gm.window.getByRole('tablist', { name: copy.label.sheetTabs })).toHaveCount(0);
});

test('the arrow keys move between the tabs of a sheet', async ({ context }) => {
  // #given
  const gm = await openGm(context);

  await sheetTab(gm.window, 'Основное').focus();

  // #when
  await gm.window.keyboard.press('ArrowRight');

  // #then
  await expect(sheetTab(gm.window, 'Бой')).toBeFocused();
  await expect(sheetTab(gm.window, 'Бой')).toHaveAttribute('aria-selected', 'true');
});

test('a dice cell on one tab rolls with a field on another tab', async ({ context }) => {
  // #given
  const gm = await openGm(context);

  await sheetTab(gm.window, 'Бой').click();

  // #when
  await gm.window.getByRole('button', { name: 'Удар', exact: true }).click();

  // #then: 1 + "Сила" 14 from "Основное".
  await expect.poll(() => shownNotifications(gm)).toEqual(['Мастер: Брок, Удар — 15']);
});

test('a token linked to a repeat block on the second tab opens that tab, scrolled to the block', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);

  await expect
    .poll(() =>
      gm.background.evaluate(() => window.mockPlatform.contextMenuItems().map((item) => item.id)),
    )
    .toContain(OPEN_ITEM);
  await gm.window.getByRole('tab', { name: 'Журнал' }).click();

  // #when
  const clicked = await gm.background.evaluate(
    ([item, token]) => window.mockPlatform.clickContextMenuItem(item, [token]),
    [OPEN_ITEM, 't-pet'] as const,
  );

  // #then
  expect(clicked).toBe(true);
  await expect(gm.window.getByRole('tab', { name: 'Брок' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(sheetTab(gm.window, 'Бой')).toHaveAttribute('aria-selected', 'true');
  await expect(repeatBlock(gm.window, 'Сокол')).toBeInViewport();
});

async function openGm(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, GM);

  await seedStorage(window, RECORDS, JSON.stringify(PRESET), GM.device);

  const background = await openClientBackground(context, GM);

  await expect(window.getByRole('button', { name: ADD })).toBeVisible();
  await expect(sheetTab(window, 'Основное')).toBeVisible();

  return { window, background, connectionId: connectionIdOf(GM) };
}

// A tab of the open sheet's tab row, apart from the sheet tabs of the bar.
function sheetTab(page: Page, name: string): Locator {
  return page
    .getByRole('tablist', { name: copy.label.sheetTabs })
    .getByRole('tab', { name, exact: true });
}

function sectionHeading(page: Page, name: string): Locator {
  return page.getByRole('heading', { name, exact: true });
}

// A repeat block is a group named by its first field.
function repeatBlock(page: Page, name: string): Locator {
  return page.locator('[data-sheet-body]').getByRole('group', { name, exact: true });
}

async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}
