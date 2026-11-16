import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';
import type { JsonValue } from '@/core/json';
import { MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import { renderedColor, tokenColor } from './support/colors';
import {
  ABSENT,
  EXAMPLE_PRESET_TEXT,
  openBackground,
  roomKeys,
  seedRecords,
  seedStorage,
  storedData,
  type StoredRecord,
} from './support/room';

const CHANNEL = 'app.muster-roll/ui';
const UPLOAD = 'Загрузить пресет';
const DOWNLOAD = 'Скачать пресет';
const SETTINGS = 'Настройки';
const ACCENT: readonly [number, number, number] = [187, 153, 255];
const TOO_LARGE = 'Файл не подошёл: файл слишком большой. Ничего не изменено.';

// The preset data that lands here still fits one command message, with its envelope of about
// 85 bytes, while its record, with the largest counter and the 512-byte reserve, does not.
const RECORD_REFUSAL_MIN_DATA_BYTES = MESSAGE_BYTE_LIMIT - 400;
const RECORD_REFUSAL_MAX_DATA_BYTES = MESSAGE_BYTE_LIMIT - 200;
const EXAMPLE: JsonValue = z.json().parse(JSON.parse(EXAMPLE_PRESET_TEXT));

const SAVED_SHEET: StoredRecord = {
  k: 'blk:saved',
  d: { set: 'pc', order: 0, cells: {} },
  c: 1,
  a: 'mock-connection',
  l: [1, 'seed'],
};

const BAD_FILES: readonly (readonly [string, string, string])[] = [
  ['a file that is not JSON', '{"v": 1,', 'это не JSON'],
  ['an unknown key', fileText({ title: 'x' }), 'неверная структура'],
  [
    'an unknown cell kind',
    fileText({ rows: [{ cells: [{ kind: 'image' }] }] }),
    'неверная структура',
  ],
  ['an unknown width', fileText({ width: '1/4', rows: [] }), 'неверная структура'],
  [
    'a duplicate id',
    fileText({ rows: [{ cells: [field('str'), field('str')] }] }),
    'поле «str» повторяется',
  ],
  [
    'a bad field id',
    fileText({ rows: [{ cells: [field('__proto__')] }] }),
    'недопустимый id поля «__proto__»',
  ],
  [
    'a repeat section whose rows hold no field',
    fileText({
      repeat: { id: 'item', nameField: 'item' },
      rows: [{ cells: [{ kind: 'text', text: 'Вещь' }] }, { cells: [] }],
    }),
    'в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем',
  ],
  [
    'two repeat sections that start with one id',
    templatesText([
      setTemplate('pc', [
        {
          repeat: { id: 'a', nameField: 'a' },
          rows: [{ cells: [{ kind: 'field', type: 'text', id: 'a' }] }],
        },
        {
          repeat: { id: 'a', nameField: 'a' },
          rows: [{ cells: [{ kind: 'field', type: 'text', id: 'a' }] }],
        },
      ]),
    ]),
    'две повторяемые секции с id «a»',
  ],
  [
    'a nameField that names a number field',
    templatesText([
      {
        ...setTemplate('pc', [{ rows: [{ cells: [field('level')] }] }]),
        repeat: { nameField: 'level' },
      },
    ]),
    'в наборе «pc» нет текстового поля «level» вне повторяемых секций',
  ],
  [
    'a nameField that names a field of a repeat section',
    templatesText([
      {
        id: 'pc',
        title: 'Персонажи',
        repeat: { nameField: 'attack' },
        tabs: [
          {
            sections: [
              {
                repeat: { id: 'attack', nameField: 'attack' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'attack' }] }],
              },
            ],
          },
        ],
      },
    ]),
    'в наборе «pc» нет текстового поля «attack» вне повторяемых секций',
  ],
  [
    'a template id that breaks the id rules',
    templatesText([singleTemplate('d20')]),
    'недопустимый id листа «d20»',
  ],
  [
    'two templates with one id',
    templatesText([singleTemplate('notes'), singleTemplate('notes')]),
    'лист «notes» повторяется',
  ],
  [
    'nameField on a single sheet',
    templatesText([{ ...singleTemplate('notes'), nameField: 'name' }]),
    'неверная структура',
  ],
  [
    'tokens on a section that is not a repeat section',
    fileText({ tokens: true, rows: [{ cells: [field('a')] }] }),
    'неверная структура',
  ],
  ['an empty template list', templatesText([]), 'неверная структура'],
  [
    'a row wider than its columns',
    fileText({ columns: 1, rows: [{ cells: [field('a'), field('b')] }] }),
    'в строке больше ячеек, чем колонок',
  ],
  [
    'a bad formula',
    fileText({ rows: [{ cells: [{ kind: 'dice', formula: '1d0' }] }] }),
    'ошибка в формуле «1d0»',
  ],
  [
    'an absent v',
    JSON.stringify({ templates: [singleTemplate('notes')] }),
    'неподдерживаемая версия формата',
  ],
  [
    'a version 1 preset with character and npc',
    JSON.stringify({
      v: 1,
      character: { tabs: [{ sections: [] }] },
      npc: { tabs: [{ sections: [] }] },
    }),
    'неподдерживаемая версия формата',
  ],
  ['a file over 1 MiB', ' '.repeat(1024 * 1024 + 1), 'файл слишком большой'],
];

declare global {
  interface Window {
    wireTypes: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('before the first projection the GM sees the loading text and no upload', async ({ page }) => {
  // #given
  await page.goto('/index.html');
  await expect(page.getByRole('tabpanel')).toHaveText('Загрузка…');
  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();
  // #then
  await expect(page.getByRole('tabpanel')).toHaveText('Загрузка…');
  await expect(page.getByRole('button', { name: UPLOAD })).toHaveCount(0);
});

test('a GM in a room with no preset sees the upload and Settings, and no sheet entry', async ({
  page,
  context,
}) => {
  // #when
  await openWindowAndBackground(page, context);
  // #then
  await expect(page.getByRole('button', { name: UPLOAD })).toBeVisible();
  await expect(page.getByRole('tab', { name: SETTINGS })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab')).toHaveText([SETTINGS]);
});

test('the Settings sidebar entry keeps Settings open when selected again', async ({
  page,
  context,
}) => {
  // #given
  await openWindowAndBackground(page, context);
  const settings = page.getByRole('tab', { name: SETTINGS });
  await settings.click();
  await expect(page.getByRole('heading', { name: 'Пресет' })).toBeVisible();
  // #when
  await settings.click();
  // #then
  await expect(page.getByRole('heading', { name: 'Пресет' })).toBeVisible();
  await expect(settings).toHaveAttribute('aria-selected', 'true');
});

test('Settings with no preset puts the primary upload first and disables the download', async ({
  page,
  context,
}) => {
  // #given
  await openWindowAndBackground(page, context);
  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();
  // #then
  const section = page.getByRole('region', { name: 'Пресет' });
  await expect(section.getByRole('button')).toHaveText([UPLOAD, DOWNLOAD]);
  await expect(section.getByRole('button', { name: DOWNLOAD })).toBeDisabled();
  await expect(section.getByRole('button', { name: DOWNLOAD })).toHaveAccessibleDescription(
    'Сначала загрузите пресет.',
  );
  expect({
    upload: await renderedColor(section.getByRole('button', { name: UPLOAD }), 'background-color'),
    download: await renderedColor(
      section.getByRole('button', { name: DOWNLOAD }),
      'background-color',
    ),
  }).toEqual({ upload: ACCENT, download: await tokenColor(page, '--color-fill') });
});

test('a player sees only the loading text after the projection arrives', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html?mock-role=PLAYER');
  await watchWire(page);
  // #when
  await openBackground(context, '/background.html?mock-role=PLAYER');
  await expect.poll(() => wireCount(page, 'projection')).toBeGreaterThan(0);
  // #then
  await expect(page.getByRole('main')).toHaveText('Загрузка…');
  await expect(page.getByRole('button')).toHaveCount(0);
});

test('a valid file is stored deflated and base64-encoded and stays after a reload', async ({
  page,
  context,
}) => {
  // #given
  const background = await openWindowAndBackground(page, context);
  await uploadFile(page, EXAMPLE_PRESET_TEXT);
  await expect(page.getByRole('tab', { name: SETTINGS })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => storedPreset(page)).toEqual(EXAMPLE);
  // #when: the window reloads first, so it sees the projection that the new background sends.
  await background.close();
  await page.reload();
  await watchWire(page);
  await openBackground(context);
  await expect.poll(() => wireCount(page, 'projection')).toBeGreaterThan(0);
  await renderedFrames(page);
  // #then: a preset already in the room is not an arrival, so the NPC tab stays selected.
  await expect(page.getByRole('tab', { name: 'NPC' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: SETTINGS }).click();
  await expect(page.getByRole('button', { name: DOWNLOAD })).toBeEnabled();
  expect(await storedPreset(page)).toEqual(EXAMPLE);
});

for (const [name, text, reason] of BAD_FILES) {
  test(`${name} shows the bad file message under the button and changes nothing`, async ({
    page,
    context,
  }) => {
    // #given
    await openWindowAndBackground(page, context);
    await watchWire(page);
    // #when
    await uploadFile(page, text);
    // #then
    await expect(page.getByText(`Файл не подошёл: ${reason}. Ничего не изменено.`)).toBeVisible();
    expect(await windowSideRefusal(page)).toEqual({ commands: 0, stored: [] });
  });
}

test('the bad file message sits under the upload button', async ({ page, context }) => {
  // #given
  await openWindowAndBackground(page, context);
  // #when
  await uploadFile(page, '{');
  // #then
  const button = await page.getByRole('button', { name: UPLOAD }).boundingBox();

  const message = await page
    .getByText('Файл не подошёл: это не JSON. Ничего не изменено.')
    .boundingBox();

  expect({
    below: (message?.y ?? 0) >= (button?.y ?? 0) + (button?.height ?? 0),
    sameLeft: message?.x === button?.x,
  }).toEqual({ below: true, sameLeft: true });
});

test('a file from a newer version asks for a reload and changes nothing', async ({
  page,
  context,
}) => {
  // #given
  await openWindowAndBackground(page, context);
  await watchWire(page);
  // #when
  await uploadFile(page, JSON.stringify({ v: 4, anything: [] }));
  // #then
  await expect(page.getByText('Файл из более новой версии. Перезагрузите страницу.')).toBeVisible();
  expect(await windowSideRefusal(page)).toEqual({ commands: 0, stored: [] });
});

test('a preset whose record cannot fit one message is refused by the replica', async ({
  page,
  context,
}) => {
  // #given
  await openWindowAndBackground(page, context);
  // #when
  await uploadFile(page, fileJustOverTheRecordLimit());
  // #then: the message comes from the rejection, which the replica sends instead of a write.
  await expect(page.getByText(TOO_LARGE)).toBeVisible();
  expect(await roomKeys(page)).toEqual([]);
});

test('a preset too large for one command is refused in the window', async ({ page, context }) => {
  // #given
  await openWindowAndBackground(page, context);
  await watchWire(page);
  // #when
  await uploadFile(
    page,
    fileText({ rows: [{ cells: [{ kind: 'text', text: randomLabel(30000) }] }] }),
  );
  // #then
  await expect(page.getByText(TOO_LARGE)).toBeVisible();
  expect(await windowSideRefusal(page)).toEqual({ commands: 0, stored: [] });
});

test('a file the browser cannot read shows the not-JSON message and sends nothing', async ({
  page,
  context,
}) => {
  // #given
  await openWindowAndBackground(page, context);
  await watchWire(page);
  await page.evaluate(() => {
    File.prototype.text = () => Promise.reject(new Error('the file cannot be read'));
  });
  // #when
  await uploadFile(page, EXAMPLE_PRESET_TEXT);
  // #then
  await expect(page.getByText('Файл не подошёл: это не JSON. Ничего не изменено.')).toBeVisible();
  expect(await windowSideRefusal(page)).toEqual({ commands: 0, stored: [] });
});

test('a rejection of an earlier upload goes once the next upload starts', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');
  await seedStorage(page, [], fileText({ rows: [] }));
  await openBackground(context);
  await page.getByRole('tab', { name: SETTINGS }).click();
  await uploadFile(page, fileJustOverTheRecordLimit());
  await expect(page.getByText(TOO_LARGE)).toBeVisible();
  // #when
  await uploadFile(page, EXAMPLE_PRESET_TEXT);
  await expect.poll(() => storedPreset(page)).toEqual(EXAMPLE);
  await renderedFrames(page);
  // #then: the old rejection stays in the store, but it belongs to the earlier attempt.
  await expect(page.getByText(TOO_LARGE)).toHaveCount(0);
});

test('a file error stays until the next upload attempt', async ({ page, context }) => {
  // #given
  await openWindowAndBackground(page, context);
  await uploadFile(page, '{');
  await expect(page.getByText('Файл не подошёл: это не JSON. Ничего не изменено.')).toBeVisible();
  // #when
  await uploadFile(page, EXAMPLE_PRESET_TEXT);
  // #then
  await expect(page.getByRole('tab', { name: SETTINGS })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Файл не подошёл/)).toHaveCount(0);
});

test('the downloaded preset holds the structure at the current v and loads in another room', async ({
  page,
  context,
  browser,
}) => {
  // #given
  await openWindowAndBackground(page, context);
  await uploadFile(page, EXAMPLE_PRESET_TEXT);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: DOWNLOAD }).click();
  const download = await downloading;
  const downloadedText = readFileSync(await download.path(), 'utf8');
  const otherRoom = await browser.newContext();
  const otherPage = await otherRoom.newPage();
  await openWindowAndBackground(otherPage, otherRoom);
  // #when
  await uploadFile(otherPage, downloadedText);
  await expect(otherPage.getByRole('tab', { name: SETTINGS })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect.poll(() => storedPreset(otherPage)).toEqual(EXAMPLE);
  // #then
  expect({
    name: download.suggestedFilename(),
    file: z.json().parse(JSON.parse(downloadedText)),
    otherRoom: await storedPreset(otherPage),
  }).toEqual({ name: 'muster-roll-preset.json', file: EXAMPLE, otherRoom: EXAMPLE });
  await otherRoom.close();
});

test('while a sheet exists the upload stays enabled in both places', async ({ page, context }) => {
  // #given
  await page.goto('/index.html');
  await seedRecords(page, [SAVED_SHEET]);
  await openBackground(context);
  // #when
  const main = page.getByRole('button', { name: UPLOAD });
  await expect(main).toBeEnabled();
  await page.getByRole('tab', { name: SETTINGS }).click();

  // #then
  const inSettings = page.getByRole('region', { name: 'Пресет' }).getByRole('button', {
    name: UPLOAD,
  });

  await expect(inSettings).toBeEnabled();
  await expect(inSettings).toHaveAccessibleDescription('');
});

test('with a preset and a sheet, Settings enables the upload and the download', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');
  await seedStorage(page, [SAVED_SHEET], EXAMPLE_PRESET_TEXT);
  await openBackground(context);
  // #when
  await page.getByRole('tab', { name: SETTINGS }).click();
  // #then
  await expect(page.getByRole('button', { name: UPLOAD })).toBeEnabled();
  await expect(page.getByRole('button', { name: UPLOAD })).toHaveAccessibleDescription('');
  await expect(page.getByRole('button', { name: DOWNLOAD })).toBeEnabled();
});

function field(id: string): JsonValue {
  return { kind: 'field', type: 'number', id };
}

// A sheet set "pc" named by a text field "name", with `section` after the name's section.
function fileText(section: JsonValue): string {
  return templatesText([setTemplate('pc', [section])]);
}

function templatesText(templates: readonly JsonValue[]): string {
  return JSON.stringify({ v: 4, templates });
}

function setTemplate(id: string, sections: readonly JsonValue[]) {
  return {
    id,
    title: 'Персонажи',
    repeat: { nameField: 'name' },
    tabs: [
      {
        sections: [
          { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] },
          ...sections,
        ],
      },
    ],
  };
}

function singleTemplate(id: string) {
  return { id, title: 'Заметки', tabs: [{ sections: [] }] };
}

function randomLabel(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let state = 11;

  return Array.from({ length }, () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;

    return alphabet[(state >>> 16) % 64] ?? 'x';
  }).join('');
}

// Random labels barely deflate, so the data grows with the label until it lands in the window.
function fileJustOverTheRecordLimit(): string {
  for (let length = 10000; length < 20000; length += 50) {
    const text = fileText({ rows: [{ cells: [{ kind: 'text', text: randomLabel(length) }] }] });
    const dataLength = Buffer.from(deflateSync(strToU8(text))).toString('base64').length;

    if (
      dataLength >= RECORD_REFUSAL_MIN_DATA_BYTES &&
      dataLength <= RECORD_REFUSAL_MAX_DATA_BYTES
    ) {
      return text;
    }
  }

  throw new Error('no label length lands in the window');
}

async function openWindowAndBackground(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto('/index.html');
  const background = await openBackground(context);
  await expect(page.getByRole('button', { name: UPLOAD })).toBeVisible();

  return background;
}

async function uploadFile(page: Page, text: string): Promise<void> {
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: UPLOAD }).click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: 'preset.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

async function storedPreset(page: Page): Promise<JsonValue> {
  const data = await storedData(page, 'preset');

  if (data === ABSENT) {
    return ABSENT;
  }

  return z
    .json()
    .parse(JSON.parse(strFromU8(inflateSync(Buffer.from(z.string().parse(data), 'base64')))));
}

async function watchWire(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.wireTypes = [];
    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      window.wireTypes.push(String(Object(event.data).t));
    });
  }, CHANNEL);
}

async function wireCount(page: Page, type: string): Promise<number> {
  const types = await page.evaluate(() => window.wireTypes);

  return types.filter((recorded) => recorded === type).length;
}

// A refusal in the window means no command went out, so nothing can reach storage later.
async function windowSideRefusal(page: Page): Promise<{
  commands: number;
  stored: string[];
}> {
  return { commands: await wireCount(page, 'command'), stored: await roomKeys(page) };
}

// Lets React commit what the last message changed.
async function renderedFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}
