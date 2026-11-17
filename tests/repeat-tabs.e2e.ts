import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { copy } from '@/copy';
import type { JsonValue } from '@/core/json';
import { snapshotFileSchema, type SnapshotFile } from '@/core/snapshot-file';
import { fixtureSnapshotBlocks, fixtureSnapshotCells } from './support/block-fixtures';
import { installBrowserFileAccessFake, queueBrowserFile } from './support/file-access';
import {
  openClientBackground,
  openClientWindow,
  record,
  seedStorage,
  storedData,
  storedRecords,
  watchCommands,
  putOnScene,
  type ClientParams,
  type StoredRecord,
} from './support/room';

const UI_CHANNEL = 'app.muster-roll/ui';
const COMMAND_TIMEOUT_MS = 16_000;

const PRESET = {
  v: 4,
  templates: [
    {
      id: 'npc',
      title: 'NPC',
      players: 'edit',
      tabs: [
        {
          title: 'Overview',
          sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'count' }] }] }],
        },
        {
          title: 'NPC',
          repeat: { id: 'npc', nameField: 'name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'field', type: 'number', id: 'hp' },
                    { kind: 'token', id: 'portrait' },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: 'Notes',
          sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'notes' }] }] }],
        },
      ],
    },
  ],
} as const;

const ADD_ONLY_PRESET = {
  ...PRESET,
  templates: [
    {
      ...PRESET.templates[0],
      tabs: [PRESET.templates[0].tabs[1]],
    },
  ],
} as const;

const RECORDS = [
  record('blk:npc:npc:a', { order: 0, cells: { name: 'Alpha', hp: 7 } }),
  record('blk:npc:npc:b', { order: 1, cells: { hp: 9 } }),
  record('link:alpha', { s: 'npc', path: ['npc', 'a'], c: 'portrait' }),
  record('link:beta', { s: 'npc', path: ['npc', 'b'], c: 'portrait' }),
] as const;

const SNAPSHOT = {
  v: 4,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'npc',
      cells: fixtureSnapshotCells({}),
      blocks: fixtureSnapshotBlocks({
        npc: [
          { instanceId: 'a', order: 0, cells: { name: 'Alpha', hp: 7 } },
          { instanceId: 'b', order: 1, cells: { hp: 9 } },
        ],
      }),
    },
  ],
  links: [{ tokenId: 'beta', sheetId: 'npc', path: ['npc', 'b'], cellId: 'portrait' }],
};

const EMPTY_SNAPSHOT = {
  v: 4,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'npc',
      cells: fixtureSnapshotCells({}),
      blocks: fixtureSnapshotBlocks({}),
    },
  ],
  links: [],
};

const SINGLE_BLOCK_SNAPSHOT = {
  v: 4,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'npc',
      cells: fixtureSnapshotCells({}),
      blocks: fixtureSnapshotBlocks({
        npc: [{ instanceId: 'a', order: 0, cells: { name: 'Alpha', hp: 7 } }],
      }),
    },
  ],
  links: [],
};

const TAB_NAMES = ['Overview', 'Alpha', 'Блок 2', 'Notes'];
const GM_TAB_NAMES = [...TAB_NAMES, '+'];
const EMPTY_GM_TAB_NAMES = ['Overview', 'Notes', '+'];
const FIRST_BLOCK_TAB_NAMES = ['Overview', 'Блок 1', 'Notes', '+'];
const ADD_ONLY_EMPTY_GM_TAB_NAMES = ['+'];
const ADD_ONLY_FIRST_BLOCK_TAB_NAMES = ['Блок 1', '+'];
const GENERATED_BLOCK_ID = /^[A-Za-z0-9_-]{8}$/;
const GM: ClientParams = { client: 'gm', device: 'repeat-tabs', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'player',
  device: 'repeat-tabs-player',
  name: 'Игрок',
  player: 'p1',
  role: 'PLAYER',
};

type RepeatTabsPreset = typeof PRESET | typeof ADD_ONLY_PRESET;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
});

test('the extension expands one tab per block in source position and keeps selection client-local', async ({
  context,
}) => {
  // #given
  const first = await openSeededClient(context, GM);
  const second = await openSeededClient(context, { ...GM, client: 'gm-2' });

  // #then
  expect(await tabNames(first.window)).toEqual(GM_TAB_NAMES);

  // #when
  await sheetTab(first.window, 'Alpha').click();

  // #then
  await expect(sheetTab(first.window, 'Alpha')).toHaveAttribute('aria-selected', 'true');
  await expect(sheetTab(second.window, 'Overview')).toHaveAttribute('aria-selected', 'true');
  await expect(first.window.getByRole('textbox', { name: 'hp' })).toHaveValue('7');
});

test('the GM final plus adds and opens an empty block', async ({ context }) => {
  // #given
  const gm = await openSeededClient(context, GM);

  // #then
  await expect(sheetTabs(gm.window).getByRole('tab', { name: '+', exact: true })).toBeVisible();

  // #when
  await sheetTabs(gm.window).getByRole('tab', { name: '+', exact: true }).click();

  // #then
  await expect(sheetTabs(gm.window).getByRole('tab')).toHaveCount(6);
  await expect(sheetTabs(gm.window).getByRole('tab').nth(3)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(gm.window.getByRole('textbox', { name: 'name' })).toHaveValue('');
});

test('the GM can add and open the first extension block from zero', async ({ context }) => {
  // #given
  const gm = await openSeededClient(context, GM, []);

  // #then
  expect(await tabNames(gm.window)).toEqual(EMPTY_GM_TAB_NAMES);

  // #when
  await sheetTab(gm.window, '+').click();

  // #then
  await expectFirstBlockOpen(gm.window);
});

test('the add-only extension waits for the GM before creating its first block', async ({
  context,
}) => {
  // #given
  const gm = await openSeededClient(context, GM, [], ADD_ONLY_PRESET);
  const beforePress = await tabNames(gm.window);

  // #when
  await sheetTab(gm.window, '+').click();

  // #then
  await expect
    .poll(async () => ({
      beforePress,
      afterPress: await tabNames(gm.window),
    }))
    .toEqual({
      beforePress: ADD_ONLY_EMPTY_GM_TAB_NAMES,
      afterPress: ADD_ONLY_FIRST_BLOCK_TAB_NAMES,
    });
  await expect(sheetTab(gm.window, 'Блок 1')).toHaveAttribute('aria-selected', 'true');
  await expect(gm.window.getByRole('textbox', { name: 'name' })).toHaveValue('');
});

test('deleting the final extension block retains add and opens its replacement', async ({
  context,
}) => {
  // #given
  const records = [record('blk:npc:npc:a', { order: 0, cells: { name: 'Alpha', hp: 7 } })];
  const gm = await openSeededClient(context, GM, records);
  await sheetTab(gm.window, 'Alpha').click();

  // #when
  await gm.window.getByRole('button', { name: copy.command.delete }).click();
  await gm.window.getByRole('button', { name: copy.command.delete, exact: true }).click();

  // #then
  await expect.poll(() => tabNames(gm.window)).toEqual(EMPTY_GM_TAB_NAMES);

  // #when
  await sheetTab(gm.window, '+').click();

  // #then
  await expectFirstBlockOpen(gm.window);
});

test('a refused add leaves the GM tab list and selection unchanged', async ({ context }) => {
  // #given
  const gm = await openSeededClient(context, GM);
  await watchCommands(gm.window);
  await gm.background.close();

  // #when
  await sheetTab(gm.window, '+').click();
  const commandId = await sentCommandId(gm.window, 'repeat-block-add');
  await postUiMessage(gm.window, {
    t: 'command-rejected',
    id: commandId,
    reason: 'unknown-section',
  });

  // #then
  await expect.poll(() => tabNames(gm.window)).toEqual(GM_TAB_NAMES);
  await expect(sheetTab(gm.window, 'Overview')).toHaveAttribute('aria-selected', 'true');
});

test('a timed-out add leaves the GM tab list and selection unchanged', async ({ context }) => {
  // #given
  const gm = await openSeededClient(context, GM);
  await watchCommands(gm.window);
  await gm.background.close();

  // #when
  await sheetTab(gm.window, '+').click();
  await sentCommandId(gm.window, 'repeat-block-add');
  await gm.window.waitForTimeout(COMMAND_TIMEOUT_MS);

  // #then
  expect(await tabNames(gm.window)).toEqual(GM_TAB_NAMES);
  await expect(sheetTab(gm.window, 'Overview')).toHaveAttribute('aria-selected', 'true');
});

test('a player sees visible block tabs and content but no lifecycle controls', async ({
  context,
}) => {
  // #given
  await openSeededClient(context, GM);
  const player = await openUnseededClient(context, PLAYER);

  // #then
  expect(await tabNames(player.window)).toEqual(TAB_NAMES);

  // #when
  await sheetTab(player.window, 'Alpha').click();

  // #then
  await expect(player.window.getByRole('textbox', { name: 'hp' })).toHaveValue('7');
  await expect(sheetTabs(player.window).getByRole('tab', { name: '+', exact: true })).toHaveCount(
    0,
  );
  await expect(player.window.getByRole('button', { name: copy.command.delete })).toHaveCount(0);
});

test('the engine refuses forged player tab-block add and delete commands', async ({ context }) => {
  // #given
  await openSeededClient(context, GM);
  const player = await openUnseededClient(context, PLAYER);
  await watchCommands(player.window);
  const before = await storedRecords(player.window, 'blk:npc:npc:');

  // #when
  await postUiMessage(player.window, {
    t: 'command',
    id: 'forged-tab-add',
    command: {
      type: 'repeat-block-add',
      sheetId: 'npc',
      sectionId: 'npc',
      instanceId: 'forged',
    },
  });
  await postUiMessage(player.window, {
    t: 'command',
    id: 'forged-tab-delete',
    command: {
      type: 'repeat-block-delete',
      sheetId: 'npc',
      sectionId: 'npc',
      instanceId: 'a',
    },
  });

  // #then
  await expect
    .poll(() => player.window.evaluate(() => window.rejectedCommands))
    .toEqual([
      { id: 'forged-tab-add', reason: 'not-allowed' },
      { id: 'forged-tab-delete', reason: 'not-allowed' },
    ]);
  expect(await storedRecords(player.window, 'blk:npc:npc:')).toEqual(before);
});

test('cancel preserves a tab block and confirm removes its values and token link', async ({
  context,
}) => {
  // #given
  const gm = await openSeededClient(context, GM);
  await sheetTab(gm.window, 'Alpha').click();
  await expect(gm.window.getByRole('button', { name: copy.command.delete })).toBeVisible();
  await gm.window.getByRole('button', { name: copy.command.delete }).click();

  // #when
  await gm.window.getByRole('button', { name: copy.command.cancel }).click();

  // #then
  await expect(sheetTab(gm.window, 'Alpha')).toBeVisible();
  expect(await storedData(gm.window, 'blk:npc:npc:a')).toEqual({
    order: 0,
    cells: { name: ['Alpha', 1, 'seed'], hp: [7, 1, 'seed'] },
  });

  // #when
  await gm.window.getByRole('button', { name: copy.command.delete }).click();
  await gm.window.getByRole('button', { name: copy.command.delete, exact: true }).click();

  // #then
  await expect(sheetTab(gm.window, 'Alpha')).toHaveCount(0);
  await expect.poll(() => storedData(gm.window, 'blk:npc:npc:a')).toBeNull();
  await expect.poll(() => storedData(gm.window, 'link:alpha')).toBeNull();
});

test('a linked token opens and marks only its exact block tab', async ({ context }) => {
  // #given
  const gm = await openSeededClient(context, GM);
  await sheetTab(gm.window, 'Overview').click();
  await putOnScene(gm.window, ['beta']);

  // #when
  await gm.background.evaluate(() =>
    window.mockPlatform.clickContextMenuItem('app.muster-roll/open-sheet', ['beta']),
  );

  // #then
  await expect(sheetTab(gm.window, 'Блок 2')).toHaveAttribute('aria-selected', 'true');
  await expect(gm.window.getByRole('textbox', { name: 'hp' })).toHaveValue('9');

  // #when
  await gm.window.getByRole('button', { name: copy.command.selectOnMap }).click();

  // #then
  await expect(sheetTab(gm.window, copy.label.selectedOnMap('Блок 2'))).toHaveCount(1);
});

test('a token link to a removed tab block leaves the current tab selected', async ({ context }) => {
  // #given
  const records = [
    record('blk:npc:npc:a', { order: 0, cells: { name: 'Alpha', hp: 7 } }),
    record('blk:npc:npc:b', null, 2),
    record('link:beta', { s: 'npc', path: ['npc', 'b'], c: 'portrait' }),
  ];

  const gm = await openSeededClient(context, GM, records);
  await sheetTab(gm.window, 'Overview').click();

  // #when
  await gm.background.evaluate(() =>
    window.mockPlatform.clickContextMenuItem('app.muster-roll/open-sheet', ['beta']),
  );

  // #then
  await expect(sheetTab(gm.window, 'Overview')).toHaveAttribute('aria-selected', 'true');
  await expect(sheetTab(gm.window, 'Блок 2')).toHaveCount(0);
});

test('Builder preview add and delete change only its snapshot', async ({ page, context }) => {
  // #given
  const extension = await openSeededClient(context, GM);
  const extensionBefore = await storedRecords(extension.window, 'blk:npc:npc:');
  await installBrowserFileAccessFake(page);
  await page.goto('/builder.html');
  await queueBrowserFile(page, 'repeat-tabs.json', JSON.stringify(PRESET));
  await page.getByRole('button', { name: /^Пресет/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();
  await queueBrowserFile(page, 'repeat-tabs-snapshot.json', JSON.stringify(SNAPSHOT));
  await page.getByRole('button', { name: /^Снимок/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();

  // #when
  const frame = page.locator('[data-preview-frame]');

  // #then
  expect(await tabNames(frame)).toEqual(GM_TAB_NAMES);
  await expect(sheetTabs(frame).getByRole('tab', { name: '+', exact: true })).toBeVisible();

  // #when
  await sheetTab(frame, '+').click();

  // #then
  await expect(sheetTabs(frame).getByRole('tab')).toHaveCount(6);
  await expect(sheetTabs(frame).getByRole('tab').nth(3)).toHaveAttribute('aria-selected', 'true');
  expect(await storedRecords(extension.window, 'blk:npc:npc:')).toEqual(extensionBefore);

  // #when
  await frame.getByRole('button', { name: copy.command.delete }).click();
  await frame.getByRole('button', { name: copy.command.delete, exact: true }).click();

  // #then
  await expect.poll(() => tabNames(frame)).toEqual(GM_TAB_NAMES);
  expect(await storedRecords(extension.window, 'blk:npc:npc:')).toEqual(extensionBefore);
});

test('the GM can add and open the first Builder preview block from zero', async ({ page }) => {
  // #given
  const frame = await openBuilderPreview(page, EMPTY_SNAPSHOT);

  // #then
  expect(await tabNames(frame)).toEqual(EMPTY_GM_TAB_NAMES);

  // #when
  await sheetTab(frame, '+').click();

  // #then
  await expectFirstBuilderBlockOpen(page, frame);
});

test('the add-only Builder preview waits for the GM before creating its first block', async ({
  page,
}) => {
  // #given
  const frame = await openBuilderPreview(page, EMPTY_SNAPSHOT, ADD_ONLY_PRESET);
  const beforePress = await tabNames(frame);

  // #when
  await sheetTab(frame, '+').click();

  // #then
  await expect
    .poll(async () => ({
      beforePress,
      afterPress: await tabNames(frame),
    }))
    .toEqual({
      beforePress: ADD_ONLY_EMPTY_GM_TAB_NAMES,
      afterPress: ADD_ONLY_FIRST_BLOCK_TAB_NAMES,
    });
  await expectFirstBuilderBlockOpen(page, frame, ADD_ONLY_FIRST_BLOCK_TAB_NAMES);
});

test('deleting the final Builder preview block retains add and opens its replacement', async ({
  page,
}) => {
  // #given
  const frame = await openBuilderPreview(page, SINGLE_BLOCK_SNAPSHOT);
  await sheetTab(frame, 'Alpha').click();

  // #when
  await frame.getByRole('button', { name: copy.command.delete }).click();
  await frame.getByRole('button', { name: copy.command.delete, exact: true }).click();

  // #then
  await expect.poll(() => tabNames(frame)).toEqual(EMPTY_GM_TAB_NAMES);

  // #when
  await sheetTab(frame, '+').click();

  // #then
  await expectFirstBuilderBlockOpen(page, frame);
});

async function openSeededClient(
  context: BrowserContext,
  params: ClientParams,
  records: readonly StoredRecord[] = RECORDS,
  preset: RepeatTabsPreset = PRESET,
): Promise<{ window: Page; background: Page }> {
  const window = await openClientWindow(context, params);
  await seedStorage(window, records, JSON.stringify(preset), params.device);
  const background = await openClientBackground(context, params);
  await expect(sheetTabs(window)).toBeVisible();

  return { window, background };
}

async function openBuilderPreview(
  page: Page,
  snapshot: JsonValue,
  preset: RepeatTabsPreset = PRESET,
): Promise<Locator> {
  await installBrowserFileAccessFake(page);
  await page.goto('/builder.html');
  await queueBrowserFile(page, 'repeat-tabs.json', JSON.stringify(preset));
  await page.getByRole('button', { name: /^Пресет/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();
  await queueBrowserFile(page, 'repeat-tabs-snapshot.json', JSON.stringify(snapshot));
  await page.getByRole('button', { name: /^Снимок/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();

  return page.locator('[data-preview-frame]');
}

async function openUnseededClient(
  context: BrowserContext,
  params: ClientParams,
): Promise<{ window: Page; background: Page }> {
  const window = await openClientWindow(context, params);
  const background = await openClientBackground(context, params);
  await expect(sheetTabs(window)).toBeVisible();

  return { window, background };
}

function sheetTabs(root: Page | Locator): Locator {
  return root.getByRole('tablist', { name: copy.label.sheetTabs });
}

function sheetTab(root: Page | Locator, name: string): Locator {
  return sheetTabs(root).getByRole('tab', { name, exact: true });
}

async function tabNames(root: Page | Locator): Promise<string[]> {
  return sheetTabs(root)
    .getByRole('tab')
    .evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute('aria-label') ?? tab.textContent ?? ''),
    );
}

async function expectFirstBlockOpen(root: Page | Locator): Promise<void> {
  await expect.poll(() => tabNames(root)).toEqual(FIRST_BLOCK_TAB_NAMES);
  await expect(sheetTab(root, 'Блок 1')).toHaveAttribute('aria-selected', 'true');
  await expect(root.getByRole('textbox', { name: 'name' })).toHaveValue('');
}

async function expectFirstBuilderBlockOpen(
  page: Page,
  root: Locator,
  expectedTabNames: string[] = FIRST_BLOCK_TAB_NAMES,
): Promise<void> {
  await expect.poll(() => tabNames(root)).toEqual(expectedTabNames);
  await expect(sheetTab(root, 'Блок 1')).toHaveAttribute('aria-selected', 'true');

  const downloaded = await downloadBuilderSnapshot(page);
  const firstBlock = downloaded.sheets[0]?.blocks[0];

  const normalized = {
    ...downloaded,
    sheets: downloaded.sheets.map((sheet) => ({
      ...sheet,
      blocks: sheet.blocks.map((block) => ({
        ...block,
        path: [...block.path.slice(0, -1), '<generated>'],
      })),
    })),
  };

  expect({
    generatedId: GENERATED_BLOCK_ID.test(firstBlock?.path.at(-1) ?? ''),
    snapshot: normalized,
  }).toEqual({
    generatedId: true,
    snapshot: {
      v: 4,
      type: 'muster-roll/snapshot',
      sheets: [
        {
          id: 'npc',
          cells: {},
          blocks: [{ path: ['npc', '<generated>'], order: 0, cells: {} }],
        },
      ],
      links: [],
    },
  });
}

async function downloadBuilderSnapshot(page: Page): Promise<SnapshotFile> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Снимок/ }).click();
  await page.getByRole('menuitem', { name: 'Скачать копию' }).click();
  const download = await downloading;

  return snapshotFileSchema.parse(JSON.parse(readFileSync(await download.path(), 'utf8')));
}

async function sentCommandId(page: Page, type: string): Promise<string> {
  await expect
    .poll(() =>
      page.evaluate(
        (commandType) => window.seenCommands.some((one) => one.type === commandType),
        type,
      ),
    )
    .toBe(true);

  return page.evaluate(
    (commandType) => window.seenCommands.find((one) => one.type === commandType)?.id ?? '',
    type,
  );
}

async function postUiMessage(page: Page, message: JsonValue): Promise<void> {
  await page.evaluate(
    ([channel, text]) =>
      window.mockPlatform.broadcast.sendMessage(channel, JSON.parse(text), {
        destination: 'LOCAL',
      }),
    [UI_CHANNEL, JSON.stringify(message)] as const,
  );
}
