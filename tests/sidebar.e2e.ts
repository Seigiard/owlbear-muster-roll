import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import {
  ADD,
  openBackground,
  openClientBackground,
  openClientWindow,
  openRoom,
  pcSheet,
  putOnScene,
  record,
  repRecord,
  seedStorage,
  selectOnMap,
  storedData,
  type ClientParams,
  type StoredRecord,
} from './support/room';

const D20_PRESET = readFileSync('tests/fixtures/presets/d20.json', 'utf8');
const SETTINGS = 'Настройки';
const ADD_TEXT = '+ Добавить';

const GM: ClientParams = { client: 'gm', device: 'gm', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'player',
  device: 'player',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
};

const TABBED_PRESET = JSON.stringify({
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      tabs: [
        {
          title: 'Основное',
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Имя' },
                  { kind: 'field', type: 'text', id: 'name' },
                ],
                [
                  { kind: 'text', text: 'Заметка' },
                  { kind: 'field', type: 'text', id: 'note' },
                ],
              ],
            },
          ],
        },
        {
          title: 'Бой',
          sections: [
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
  ],
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 500 });
});

test('the GM sidebar groups sheets, keeps singles plain and pins Settings at 10 rem', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(
    page,
    context,
    [...pcSheet('kira', 'Кира', 0), ...pcSheet('brok', 'Брок', 1)],
    D20_PRESET,
  );

  const entries = sidebarEntries(page, 'Кира');
  const heading = page.getByRole('heading', { name: 'Персонажи', exact: true });
  const settings = entries.getByRole('tab', { name: SETTINGS, exact: true });

  // #when
  await expect(heading).toBeVisible();
  const settingsElement = await settings.elementHandle();

  expect(settingsElement).not.toBeNull();

  const width = await heading.evaluate((element, settingsTab) => {
    let ancestor = element.parentElement;

    while (ancestor !== null && !ancestor.contains(settingsTab)) {
      ancestor = ancestor.parentElement;
    }

    return Math.round(ancestor?.getBoundingClientRect().width ?? 0);
  }, settingsElement);

  // #then
  await expect(entries.getByRole('tab')).toHaveText([
    'Кира',
    'Брок',
    'NPC',
    'Инвентарь',
    'Журнал',
    'Заметки ГМ',
    SETTINGS,
  ]);
  await expect(page.getByRole('button', { name: ADD })).toHaveText(ADD_TEXT);
  await expect(entries.getByRole('heading')).toHaveCount(0);
  expect(width).toBe(160);
});

test('the player sidebar puts owned sheets first and hides GM-only controls and templates', async ({
  context,
}) => {
  // #given
  const records: StoredRecord[] = [
    ...pcSheet('brok', 'Брок', 0),
    ...pcSheet('kira', 'Кира', 1),
    ...pcSheet('yarl', 'Ярл', 2),
    record('plink:yarl:lisa', { name: 'Лиза' }),
  ];

  const gm = await openClientWindow(context, GM);

  await seedStorage(gm, records, D20_PRESET, GM.device);
  await openClientBackground(context, GM);

  // #when
  const player = await openClientWindow(context, PLAYER);

  await openClientBackground(context, PLAYER);
  const entries = sidebarEntries(player, 'Ярл, вы');

  // #then
  await expect(entries.getByRole('tab')).toHaveText([
    'Ярлвы',
    'Брок',
    'Кира',
    'Инвентарь',
    'Журнал',
  ]);
  await expect(entries.getByRole('tab', { name: 'Ярл, вы', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(player.getByRole('heading', { name: 'Персонажи', exact: true })).toBeVisible();
  await expect(player.getByRole('tab', { name: 'NPC', exact: true })).toHaveCount(0);
  await expect(player.getByRole('tab', { name: 'Заметки ГМ', exact: true })).toHaveCount(0);
  await expect(player.getByRole('tab', { name: SETTINGS, exact: true })).toHaveCount(0);
  await expect(player.getByRole('button', { name: /^Добавить:/ })).toHaveCount(0);
});

test('an empty sheet set stays as a GM heading and add control but is absent for a player', async ({
  context,
}) => {
  // #given
  const gm = await openClientWindow(context, GM);

  await seedStorage(gm, [], D20_PRESET, GM.device);
  await openClientBackground(context, GM);
  const player = await openClientWindow(context, PLAYER);

  // #when
  await openClientBackground(context, PLAYER);

  // #then
  await expect(gm.getByRole('heading', { name: 'Персонажи', exact: true })).toBeVisible();
  await expect(gm.getByRole('button', { name: ADD })).toHaveText(ADD_TEXT);
  await expect(player.getByRole('heading', { name: 'Персонажи', exact: true })).toHaveCount(0);
  await expect(player.getByRole('button', { name: ADD })).toHaveCount(0);
});

test('a long sidebar name has a full tooltip and the entry list scrolls without moving Settings', async ({
  page,
  context,
}) => {
  // #given
  await page.setViewportSize({ width: 600, height: 300 });

  const longName = 'Эльверанха Длинноименная из Дома Бесконечных Имён';

  const sheets = Array.from({ length: 16 }, (_unused, index) =>
    pcSheet(`sheet-${index}`, index === 0 ? longName : `Персонаж ${index + 1}`, index),
  ).flat();

  await openRoom(page, context, sheets, D20_PRESET);

  const entries = sidebarEntries(page, longName);
  const longEntry = entries.getByRole('tab', { name: longName, exact: true });
  const settings = entries.getByRole('tab', { name: SETTINGS, exact: true });
  const add = page.getByRole('button', { name: ADD });
  const lastEntry = entries.getByRole('tab', { name: 'Заметки ГМ', exact: true });
  const settingsBefore = Math.round((await settings.boundingBox())?.y ?? -1);

  // #when
  await longEntry.hover();

  const truncation = await longEntry.getByText(longName, { exact: true }).evaluate((element) => {
    const style = getComputedStyle(element);

    return {
      clipped: element.scrollWidth > element.clientWidth,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    };
  });

  const scroll = await longEntry.evaluate((element) => {
    let scroller = element.parentElement;

    while (scroller !== null) {
      const style = getComputedStyle(scroller);

      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        scroller.scrollHeight > scroller.clientHeight
      ) {
        scroller.scrollTop = scroller.scrollHeight;

        return { overflowY: style.overflowY, moved: scroller.scrollTop > 0 };
      }

      scroller = scroller.parentElement;
    }

    return { overflowY: 'none', moved: false };
  });

  // #then
  await expect(page.getByRole('tooltip')).toHaveText(longName);
  expect({
    scroll,
    settingsY: Math.round((await settings.boundingBox())?.y ?? -1),
    truncation,
  }).toEqual({
    scroll: { overflowY: 'auto', moved: true },
    settingsY: settingsBefore,
    truncation: {
      clipped: true,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  });

  const addBox = await add.boundingBox();
  const lastEntryBox = await lastEntry.boundingBox();
  const settingsBox = await settings.boundingBox();

  const lastEntryCenter = await lastEntry.evaluate((element) => {
    const box = element.getBoundingClientRect();

    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });

  await page.mouse.click(lastEntryCenter.x, lastEntryCenter.y);

  expect({
    addAboveSettings:
      addBox !== null &&
      settingsBox !== null &&
      Math.ceil(addBox.y + addBox.height) <= Math.floor(settingsBox.y),
    lastEntryAboveSettings:
      lastEntryBox !== null &&
      settingsBox !== null &&
      Math.ceil(lastEntryBox.y + lastEntryBox.height) <= Math.floor(settingsBox.y),
    lastEntrySelected: await lastEntry.getAttribute('aria-selected'),
  }).toEqual({
    addAboveSettings: true,
    lastEntryAboveSettings: true,
    lastEntrySelected: 'true',
  });
});

test('a draft stays with its sheet when another sheet is selected in the sidebar', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, draftSheets(), TABBED_PRESET);

  const note = page.getByRole('textbox', { name: 'Заметка' });

  await note.fill('Черновик А');

  // #when
  await page.getByRole('tab', { name: 'Лист Б', exact: true }).click();

  // #then
  await expect
    .poll(async () => ({
      shown: await note.inputValue(),
      sheetA: await storedData(page, 'row:sheet-a:note'),
      sheetB: await storedData(page, 'row:sheet-b:note'),
    }))
    .toEqual({
      shown: 'Сохранено Б',
      sheetA: { note: 'Черновик А' },
      sheetB: { note: 'Сохранено Б' },
    });
});

test('a draft stays with its sheet when a token opens another sheet', async ({ page, context }) => {
  // #given
  const background = await openDraftRoomWithToken(page, context);
  const note = page.getByRole('textbox', { name: 'Заметка' });

  await expect
    .poll(() =>
      background.evaluate(() => window.mockPlatform.contextMenuItems().map(({ id }) => id)),
    )
    .toContain('app.muster-roll/open-sheet');
  await note.fill('Черновик А');

  // #when
  const clicked = await background.evaluate(() =>
    window.mockPlatform.clickContextMenuItem('app.muster-roll/open-sheet', ['token-b']),
  );

  // #then
  await expect
    .poll(async () => ({
      clicked,
      shown: await note.inputValue(),
      sheetA: await storedData(page, 'row:sheet-a:note'),
      sheetB: await storedData(page, 'row:sheet-b:note'),
    }))
    .toEqual({
      clicked: true,
      shown: 'Сохранено Б',
      sheetA: { note: 'Черновик А' },
      sheetB: { note: 'Сохранено Б' },
    });
});

test('Settings is one sidebar entry and opens on the first selection after other navigation', async ({
  page,
  context,
}) => {
  // #given
  const background = await openDraftRoomWithToken(page, context);
  const settings = page.getByRole('tab', { name: SETTINGS, exact: true });

  await expect
    .poll(() =>
      background.evaluate(() => window.mockPlatform.contextMenuItems().map(({ id }) => id)),
    )
    .toContain('app.muster-roll/open-sheet');

  // #when
  await settings.click();
  await background.evaluate(() =>
    window.mockPlatform.clickContextMenuItem('app.muster-roll/open-sheet', ['token-b']),
  );
  await expect(page.getByRole('tab', { name: 'Лист Б', selected: true })).toBeVisible();
  await settings.click();
  const afterTokenOpen = await settings.getAttribute('aria-selected');

  await settings.click();
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: ADD }).click();
  await settings.click();
  const afterNewSheet = await settings.getAttribute('aria-selected');

  await settings.click();
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Лист А', exact: true }).click();
  await settings.click();
  const afterSheetEntry = await settings.getAttribute('aria-selected');

  // #then
  expect({
    afterNewSheet,
    afterSheetEntry,
    afterTokenOpen,
    settingsButtons: await page.getByRole('button', { name: SETTINGS, exact: true }).count(),
  }).toEqual({
    afterNewSheet: 'true',
    afterSheetEntry: 'true',
    afterTokenOpen: 'true',
    settingsButtons: 0,
  });
});

test('the sheet header precedes the tab row and content', async ({ page, context }) => {
  // #given
  await openRoom(page, context, draftSheets(), TABBED_PRESET);

  const name = page.getByRole('textbox', { name: 'Имя листа' });
  const tabs = page.getByRole('tablist', { name: 'Вкладки листа' });
  const content = page.getByRole('textbox', { name: 'Заметка' });

  // #when
  const order = await name.evaluate(
    (field, [tabList, contentField]) => {
      const header = field.closest('header');

      return {
        dom:
          header !== null &&
          tabList !== undefined &&
          contentField !== undefined &&
          (header.compareDocumentPosition(tabList) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
          (tabList.compareDocumentPosition(contentField) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        visual:
          header !== null &&
          tabList !== undefined &&
          contentField !== undefined &&
          header.getBoundingClientRect().bottom <= tabList.getBoundingClientRect().top &&
          tabList.getBoundingClientRect().bottom <= contentField.getBoundingClientRect().top,
      };
    },
    [await tabs.elementHandle(), await content.elementHandle()],
  );

  // #then
  expect(order).toEqual({ dom: true, visual: true });
});

test('Down crosses groups while headings are descriptions and the add control is in the Tab order', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(
    page,
    context,
    [...pcSheet('kira', 'Кира', 0), ...pcSheet('brok', 'Брок', 1)],
    D20_PRESET,
  );

  const entries = sidebarEntries(page, 'Кира');
  const kira = entries.getByRole('tab', { name: 'Кира', exact: true });
  const brok = entries.getByRole('tab', { name: 'Брок', exact: true });
  const npc = entries.getByRole('tab', { name: 'NPC', exact: true });
  const heading = page.getByRole('heading', { name: 'Персонажи', exact: true });

  await kira.focus();

  // #when
  await page.keyboard.press('ArrowDown');
  await expect(brok).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(npc).toBeFocused();

  await kira.focus();

  const tabStops: string[] = [];

  for (let step = 0; step < 8; step += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press('Tab');

    // oxlint-disable-next-line no-await-in-loop
    const focusedName = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? '',
    );

    tabStops.push(focusedName);
  }

  const headingId = await heading.getAttribute('id');

  // #then
  expect(headingId).not.toBeNull();
  await expect(kira).toHaveAttribute('aria-describedby', headingId ?? 'missing-heading-id');
  await expect(brok).toHaveAttribute('aria-describedby', headingId ?? 'missing-heading-id');
  expect(tabStops).toContain(ADD);
});

test('map selection marks the sidebar entry and its tab without switching either selection', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(
    page,
    context,
    [
      ...pcSheet('brok', 'Брок', 0),
      repRecord('brok', 'pet', 'wolf', 0, { pet: 'Волк' }),
      record('link:t-wolf', { s: 'brok', i: 'wolf' }),
    ],
    TABBED_PRESET,
  );
  await putOnScene(page, ['t-wolf']);

  const openTab = sheetTab(page, 'Основное');

  await expect(openTab).toHaveAttribute('aria-selected', 'true');

  // #when
  await selectOnMap(page, ['t-wolf']);

  // #then
  await expect(page.getByRole('tab', { name: 'Брок, токен выделен', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(sheetTab(page, 'Бой, токен выделен')).toBeVisible();
  await expect(openTab).toHaveAttribute('aria-selected', 'true');
});

function sidebarEntries(page: Page, entryName: string): Locator {
  return page
    .getByRole('tablist')
    .filter({ has: page.getByRole('tab', { name: entryName, exact: true }) })
    .first();
}

function sheetTab(page: Page, name: string): Locator {
  return page
    .getByRole('tablist', { name: 'Вкладки листа' })
    .getByRole('tab', { name, exact: true });
}

function draftSheets(): StoredRecord[] {
  return [
    ...pcSheet('sheet-a', 'Лист А', 0),
    record('row:sheet-a:note', { note: 'Сохранено А' }),
    ...pcSheet('sheet-b', 'Лист Б', 1),
    record('row:sheet-b:note', { note: 'Сохранено Б' }),
    record('link:token-b', { s: 'sheet-b' }),
  ];
}

async function openDraftRoomWithToken(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto('/index.html');
  await seedStorage(page, draftSheets(), TABBED_PRESET);
  await putOnScene(page, ['token-b']);

  const background = await openBackground(context);

  await expect(page.getByRole('button', { name: ADD })).toBeVisible();

  return background;
}
