import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  ADD,
  connectionIdOf,
  npcBlock,
  openBackground,
  openClientBackground,
  openClientWindow,
  openRoom,
  pcSheet,
  record,
  repRecord,
  seedStorage,
  storedData,
  storedRecords,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const ADD_NPC = 'Добавить в «Противники»';
const UNNAMED = 'Без имени';
const SHEET_NAME = 'Имя листа';
const ACTIONS = 'Удалить лист';
const ACCESS = 'Доступ';
const NO_TOKEN = 'Нет токена';
const UPLOAD = 'Загрузить пресет';

// TASK-37: a new instance id is 8 characters of the URL-safe nanoid alphabet.
const NANOID_PATTERN = /^[A-Za-z0-9_-]{8}$/;
const D20_PRESET = fixture('d20');
const D6_POOL_PRESET = fixture('d6-pool');

// A sheet set whose repeat section "Атаки" is linkable, so a player with write access can remove a
// repeat block that tokens link to.
const LINKABLE_ATTACKS_PRESET = JSON.stringify({
  v: 4,
  templates: [
    {
      id: 'pc',
      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Имя' },
                    { kind: 'field', type: 'text', id: 'name' },
                  ],
                },
              ],
            },
            {
              title: 'Атаки',
              repeat: { id: 'attack', nameField: 'attack' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'attack' },
                    { kind: 'token', id: 'token' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

const GM: ClientParams = { client: 'a', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'p',
};

// One game system's NPC controls, by the names its preset gives them. `field` is a number field of
// the repeat section, `check` a check field of it, and `dice` a dice cell, named by the label before
// it.
type BlockControls = {
  tab: string;
  section: string;
  name: string;
  nameId: string;
  field: string;
  fieldId: string;
  check: string;
  checkId: string;
  dice: string;
};

type GameSystem = {
  label: string;
  preset: string;
  npc: BlockControls;
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('a single sheet\'s header shows its title, not editable, with no "Доступ" and no "⋯"', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [...pcSheet('anya', 'Аня', 0)], D20_PRESET);
  // #when
  await page.getByRole('tab', { name: 'Журнал' }).click();
  // #then
  const panel = page.getByRole('tabpanel', { name: 'Журнал' });
  await expect(panel.getByRole('heading', { level: 1 })).toHaveText('Журнал');
  expect({
    nameFields: await panel.getByRole('textbox', { name: SHEET_NAME }).count(),
    access: await panel.getByRole('button', { name: ACCESS }).count(),
    actions: await panel.getByRole('button', { name: ACTIONS }).count(),
    tokenStatus: await panel.getByRole('img', { name: NO_TOKEN }).count(),
  }).toEqual({ nameFields: 0, access: 0, actions: 0, tokenStatus: 0 });
});

test('a linkable single sheet shows the GM its token status in its token cell', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [], D20_PRESET);
  // #when
  await page.getByRole('tab', { name: 'Инвентарь' }).click();
  // #then
  await expect(
    page
      .getByRole('tabpanel', { name: 'Инвентарь' })
      .locator('[data-cell-id="token"][data-cell-scope="root"]')
      .getByRole('img', { name: NO_TOKEN }),
  ).toBeVisible();
});

test('a value of a single sheet is stored in its materialized root and stays after a reload', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, [], D20_PRESET);
  await page.getByRole('tab', { name: 'Инвентарь' }).click();
  // #when
  await page.getByRole('textbox', { name: 'Золото', exact: true }).fill('12');
  await page.keyboard.press('Tab');
  await expect
    .poll(() => storedData(page, 'blk:inventory'))
    .toEqual({
      order: 0,
      cells: { gold: [12, 2, 'mock-connection'] },
    });
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('tab', { name: 'Инвентарь' })).toBeVisible();
  await page.getByRole('tab', { name: 'Инвентарь' }).click();
  // #then
  await expect(page.getByRole('textbox', { name: 'Золото', exact: true })).toHaveValue('12');
  expect({
    sheet: await storedData(page, 'blk:inventory'),
    roots: (await storedRecords(page, 'blk:')).map((record) => record.k).sort(),
  }).toEqual({
    sheet: { order: 0, cells: { gold: [12, 2, 'mock-connection'] } },
    roots: ['blk:gm_notes', 'blk:inventory', 'blk:journal', 'blk:npc'],
  });
});

test('the NPC tab with no NPCs shows the section and its "Добавить" only', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, [], D20_PRESET);
  // #when
  await page.getByRole('tab', { name: 'NPC' }).click();
  // #then
  const section = page.getByRole('tabpanel').getByRole('region', { name: 'Противники' });
  await expect(section.getByRole('button', { name: ADD_NPC })).toHaveText('Добавить');
  expect({
    blocks: await blocks(page).count(),
    buttons: await section.getByRole('button').count(),
  }).toEqual({ blocks: 0, buttons: 1 });
});

test('"Добавить" on NPC adds an empty repeat block last, named "Без имени", with its first field focused', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [...pcSheet('brok', 'Брок', 9), npcBlock('gob', 'Гоблин', 4)]);
  // #when
  await page.getByRole('button', { name: ADD_NPC }).click();
  await expect(blocks(page)).toHaveCount(2);
  // #then
  const prefix = 'blk:npc:npc_name:';
  const created = (await storedRecords(page, prefix)).filter((one) => one.k !== `${prefix}gob`);
  await expect(nameFields(page).nth(1)).toBeFocused();
  expect({
    blocks: await blockNames(page),
    keys: created.map((one) => NANOID_PATTERN.test(one.k.slice(prefix.length))),
    data: created.map((one) => one.d),
    selected: await page.getByRole('tab', { selected: true }).textContent(),
  }).toEqual({
    blocks: ['Гоблин', UNNAMED],
    keys: [true],
    data: [{ order: 5, cells: {} }],
    selected: 'NPC',
  });
});

test('a new NPC under many others is scrolled into view', async ({ page, context }) => {
  // #given
  const many = Array.from({ length: 10 }, (_unused, index) =>
    npcBlock(`n${String(index).padStart(2, '0')}`, `Скелет ${index + 1}`, index),
  );

  await openNpcTab(page, context, many);
  // A new repeat block goes after the last one, so it starts out of view as well.
  await expect(nameFields(page).nth(9)).not.toBeInViewport();
  // #when
  await page.getByRole('button', { name: ADD_NPC }).click();
  // #then
  const name = nameFields(page).nth(10);
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport();
});

test('the first field names its repeat block, and the name stays after a reload', async ({
  page,
  context,
}) => {
  // #given
  const background = await openNpcTab(page, context, [npcBlock('gob', 'Гоблин', 0)]);
  // #when
  await nameFields(page).first().fill('Гоблин-вождь');
  await page.keyboard.press('Tab');
  await expect
    .poll(() => storedData(page, 'blk:npc:npc_name:gob'))
    .toEqual({
      order: 0,
      cells: { npc_name: ['Гоблин-вождь', 2, 'mock-connection'] },
    });
  await reloadOnNpcTab(page, context, background);
  // #then
  expect(await blockNames(page)).toEqual(['Гоблин-вождь']);
});

test('every field of an NPC repeat block saves into its one rep record', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [npcBlock('gob', 'Гоблин', 0), npcBlock('orc', 'Орк', 1)]);
  const orc = block(page, 'Орк');
  // #when: one field in each of the three rows of the repeat block.
  await orc.getByRole('textbox', { name: 'Хиты', exact: true }).fill('22');
  await orc.getByRole('checkbox', { name: 'Сила' }).click();
  await orc.getByRole('textbox', { name: 'Атака', exact: true }).first().fill('Топор');
  await page.keyboard.press('Tab');
  // #then
  await expect
    .poll(() => storedData(page, 'blk:npc:npc_name:orc'))
    .toEqual({
      order: 1,
      cells: {
        npc_name: ['Орк', 1, 'seed'],
        hp: [22, 2, 'mock-connection'],
        elite: [true, 3, 'mock-connection'],
        attack: ['Топор', 4, 'mock-connection'],
      },
    });
  expect(await storedData(page, 'blk:npc:npc_name:gob')).toEqual({
    order: 0,
    cells: { npc_name: ['Гоблин', 1, 'seed'] },
  });
});

test('removing a repeat block with two token links tombstones both links and leaves the others', async ({
  page,
  context,
}) => {
  // #given
  await openNpcTab(page, context, [
    npcBlock('skel', 'Скелет', 0),
    npcBlock('gob', 'Гоблин', 1),
    record('link:t1', { s: 'npc', path: ['npc_name', 'skel'], c: 'token' }),
    record('link:t2', { s: 'npc', path: ['npc_name', 'skel'], c: 'token' }),
    record('link:t3', { s: 'npc', path: ['npc_name', 'gob'], c: 'token' }),
  ]);
  // #when
  await page.getByRole('button', { name: 'Удалить блок 1', exact: true }).click();
  await expect(blocks(page)).toHaveCount(1);
  // #then
  await expect
    .poll(async () => ({
      block: await storedData(page, 'blk:npc:npc_name:skel'),
      t1: await storedData(page, 'link:t1'),
      t2: await storedData(page, 'link:t2'),
      t3: await storedData(page, 'link:t3'),
    }))
    .toEqual({
      block: null,
      t1: null,
      t2: null,
      t3: { s: 'npc', path: ['npc_name', 'gob'], c: 'token' },
    });
});

test("a player's removal of a linked repeat block is committed by the GM client with its links tombstoned", async ({
  context,
}) => {
  // #given
  const gm = await openClient(context, GM, [
    ...pcSheet('anya', 'Аня', 0),
    repRecord('anya', 'attack', 'sword', 0, { attack: 'Меч' }),
    repRecord('anya', 'attack', 'bow', 1, { attack: 'Лук' }),
    record('acl:anya:lisa', { name: 'Лиза' }),
    record('link:t1', { s: 'anya', path: ['attack', 'sword'], c: 'token' }),
    record('link:t2', { s: 'anya', path: ['attack', 'sword'], c: 'token' }),
    record('link:t3', { s: 'anya', c: 'token' }),
  ]);

  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();
  const player = await openClient(context, PLAYER, null);
  const attacks = player.window.getByRole('tabpanel').getByRole('region', { name: 'Атаки' });
  // #when
  await attacks.getByRole('button', { name: 'Удалить блок 1', exact: true }).click();
  // #then
  await expect
    .poll(async () => ({
      block: await storedData(gm.window, 'blk:anya:attack:sword'),
      t1: await storedData(gm.window, 'link:t1'),
      t2: await storedData(gm.window, 'link:t2'),
      t3: await storedData(gm.window, 'link:t3'),
    }))
    .toEqual({ block: null, t1: null, t2: null, t3: { s: 'anya', c: 'token' } });
  await expect(attacks.getByRole('group')).toHaveCount(1);
});

test.describe('two game systems with no code change', () => {
  const systems: readonly GameSystem[] = [
    {
      label: 'the d20 preset',
      preset: D20_PRESET,
      npc: {
        tab: 'NPC',
        section: 'Противники',
        name: 'npc_name',
        nameId: 'npc_name',
        field: 'КД',
        fieldId: 'ac',
        check: 'Сила',
        checkId: 'elite',
        dice: 'Сила',
      },
    },
    {
      label: 'the d6 pool preset',
      preset: D6_POOL_PRESET,
      npc: {
        tab: 'NPC',
        section: 'Противники',
        name: 'Имя',
        nameId: 'npc_name',
        field: 'Навык',
        fieldId: 'skill',
        check: 'Ранен',
        checkId: 'wounded',
        dice: 'Ранен',
      },
    },
  ];

  for (const system of systems) {
    test(`${system.label} uploaded in a fresh room gives a working sheet and NPC repeat block`, async ({
      page,
      context,
    }) => {
      // #given
      await page.goto('/index.html');
      const background = await openBackground(context);
      await uploadPreset(page, system.preset);
      const add = page.getByRole('button', { name: /^Добавить: / });
      await expect(add).toBeVisible();
      // #when
      await add.click();
      await expect(page.getByRole('textbox', { name: SHEET_NAME })).toBeFocused();
      await page.getByRole('tab', { name: system.npc.tab }).click();
      await page.getByRole('button', { name: `Добавить в «${system.npc.section}»` }).click();
      const shown = blocks(page).first();
      const name = shown.getByRole('textbox', { name: system.npc.name, exact: true });
      await expect(name).toBeFocused();
      await name.fill('Страж');
      await shown.getByRole('textbox', { name: system.npc.field, exact: true }).fill('7');
      await shown.getByRole('checkbox', { name: system.npc.check, exact: true }).click();
      await expect
        .poll(async () => (await storedRecords(page, 'blk:npc:')).map((one) => one.d))
        .toEqual([
          {
            order: 0,
            cells: {
              [system.npc.nameId]: ['Страж', 2, 'mock-connection'],
              [system.npc.fieldId]: [7, 3, 'mock-connection'],
              [system.npc.checkId]: [true, 4, 'mock-connection'],
            },
          },
        ]);
      await background.close();
      await page.reload();
      await openBackground(context);
      await expect(page.getByRole('tab', { name: system.npc.tab })).toBeVisible();
      // #then
      await page.getByRole('tab', { name: system.npc.tab }).click();
      const after = block(page, 'Страж');
      expect({
        field: await after
          .getByRole('textbox', { name: system.npc.field, exact: true })
          .inputValue(),
        checked: await after
          .getByRole('checkbox', { name: system.npc.check, exact: true })
          .isChecked(),
        dice: await after.getByRole('button', { name: system.npc.dice, exact: true }).count(),
      }).toEqual({ field: '7', checked: true, dice: 1 });
    });
  }
});

function fixture(name: string): string {
  return readFileSync(new URL(`fixtures/presets/${name}.json`, import.meta.url), 'utf8');
}

async function openNpcTab(
  page: Page,
  context: BrowserContext,
  records: readonly StoredRecord[],
): Promise<Page> {
  const background = await openRoom(page, context, records, D20_PRESET);
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(page.getByRole('button', { name: ADD_NPC })).toBeVisible();

  return background;
}

async function reloadOnNpcTab(
  page: Page,
  context: BrowserContext,
  background: Page,
): Promise<void> {
  await background.close();
  await page.reload();
  await openBackground(context);
  await expect(page.getByRole('button', { name: ADD })).toBeVisible();
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(page.getByRole('button', { name: ADD_NPC })).toBeVisible();
}

// Opens one client on LINKABLE_ATTACKS_PRESET. `records` seeds its device with the preset first;
// `null` seeds nothing.
async function openClient(
  context: BrowserContext,
  params: ClientParams,
  records: readonly StoredRecord[] | null,
): Promise<RoomClient> {
  const window = await openClientWindow(context, params);

  if (records !== null) {
    await seedStorage(window, records, LINKABLE_ATTACKS_PRESET, params.device);
  }

  const background = await openClientBackground(context, params);

  return { window, background, connectionId: connectionIdOf(params) };
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

// Each repeat block is a group named by its first field.
function blocks(page: Page): Locator {
  return page.getByRole('tabpanel').locator('[data-repeat-block]');
}

function block(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('group', { name, exact: true });
}

// The first field of every NPC repeat block, which names it.
function nameFields(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'npc_name', exact: true });
}

async function blockNames(page: Page): Promise<string[]> {
  return blocks(page).evaluateAll((shown) =>
    shown.map((one) => one.getAttribute('aria-label') ?? ''),
  );
}
