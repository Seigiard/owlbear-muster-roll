import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import { cssValue, renderedColor } from './support/colors';
import {
  afterSettling,
  openBackground,
  openRoom,
  record,
  watchCommands,
  type StoredRecord,
} from './support/room';

// The strings of TASK-30 and the file format of the 5.2 spec, written out by hand.
const SETTINGS = 'Настройки';
const SNAPSHOT = 'Снимок';
const DOWNLOAD = 'Скачать снимок';
const UPLOAD = 'Загрузить снимок';
const LOAD_PRESET = 'Загрузить пресет';
const PRESET_REQUIRED = 'Сначала загрузите пресет.';
const ACCENT: readonly [number, number, number] = [217, 179, 108];

// Midday, so no time zone of the test machine moves it to another date.
const FIXED_NOW = new Date(2026, 0, 5, 12, 0).getTime();

const RECORDS: StoredRecord[] = [
  record('sheet:brok', { kind: 'pc', name: 'Брок', order: 1 }),
  record('sheet:anya', { kind: 'pc', name: 'Аня', order: 0 }),
  record('sheet:skel', { kind: 'npc', name: 'Скелет', order: 0 }),
  record('row:brok:class', { class: 'Воин', level: 3 }),
  record('rep:brok:attack:i2', { order: 1, cells: { attack: 'Топор', bonus: 2 } }),
  record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
  record('row:skel:hp', { hp: 7 }),
  record('acl:brok:lisa', { name: 'Лиза' }),
  record('plink:brok:lisa', { name: 'Лиза' }),
  record('link:t1', 'brok'),
  // A deleted sheet with a live row left behind, and a link to it.
  record('sheet:gone', null, 2),
  record('row:gone:class', { class: 'Лучник' }),
  record('link:t2', 'gone'),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('Settings lists Пресет, Снимок, Копия в комнате, with the primary download first under Снимок', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);

  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();

  // #then
  const section = snapshotSection(page);

  await expect(page.getByRole('tabpanel').getByRole('heading')).toHaveText([
    'Пресет',
    SNAPSHOT,
    'Копия в комнате',
  ]);
  await expect(section.getByRole('button')).toHaveText([DOWNLOAD]);
  expect(
    await renderedColor(section.getByRole('button', { name: DOWNLOAD }), 'background-color'),
  ).toEqual(ACCENT);
});

test('with a preset, "Скачать снимок" is enabled and "Загрузить снимок" is not shown until Story 5.3', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);

  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();

  // #then
  await expect(snapshotSection(page).getByRole('button', { name: DOWNLOAD })).toBeEnabled();
  await expect(snapshotSection(page).getByRole('button', { name: UPLOAD })).toHaveCount(0);
});

test('the downloaded snapshot holds the live sheets, their values and links, and nothing else', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, RECORDS);
  await page.clock.setFixedTime(FIXED_NOW);
  await page.getByRole('tab', { name: SETTINGS }).click();
  await watchCommands(page);

  // #when
  const downloading = page.waitForEvent('download');

  await snapshotSection(page).getByRole('button', { name: DOWNLOAD }).click();

  const download = await downloading;
  const text = readFileSync(await download.path(), 'utf8');

  // #then
  expect({
    name: download.suggestedFilename(),
    file: z.json().parse(JSON.parse(text)),
    commands: (await afterSettling(page)).commands,
  }).toEqual({
    name: 'muster-roll-snapshot-2026-01-05.json',
    file: {
      v: 1,
      type: 'muster-roll/snapshot',
      sheets: [
        { id: 'anya', kind: 'pc', name: 'Аня', order: 0, rows: {}, repeats: {} },
        {
          id: 'skel',
          kind: 'npc',
          name: 'Скелет',
          order: 0,
          rows: { hp: { hp: 7 } },
          repeats: {},
        },
        {
          id: 'brok',
          kind: 'pc',
          name: 'Брок',
          order: 1,
          rows: { class: { class: 'Воин', level: 3 } },
          repeats: {
            attack: [
              { instanceId: 'i1', order: 0, cells: { attack: 'Меч' } },
              { instanceId: 'i2', order: 1, cells: { attack: 'Топор', bonus: 2 } },
            ],
          },
        },
      ],
      links: [{ tokenId: 't1', sheetId: 'brok' }],
    },
    commands: [],
  });
});

test('with no preset, both snapshot buttons are disabled with the preset-first reason', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');
  await openBackground(context);
  await expect(page.getByRole('button', { name: LOAD_PRESET })).toBeVisible();

  // #when
  await page.getByRole('button', { name: SETTINGS }).click();

  // #then
  const download = snapshotSection(page).getByRole('button', { name: DOWNLOAD });
  const upload = snapshotSection(page).getByRole('button', { name: UPLOAD });

  await expect(download).toBeDisabled();
  await expect(download).toHaveAccessibleDescription(PRESET_REQUIRED);
  await expect(upload).toBeDisabled();
  await expect(upload).toHaveAccessibleDescription(PRESET_REQUIRED);
  await expect(snapshotSection(page).getByRole('button')).toHaveText([DOWNLOAD, UPLOAD]);
  expect(await cssValue(upload, 'border-top-width')).toBe('1px');
});

function snapshotSection(page: Page): Locator {
  return page.getByRole('region', { name: SNAPSHOT });
}
