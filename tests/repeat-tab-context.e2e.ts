import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { snapshotFileSchema, type SnapshotFile } from '@/core/snapshot-file';
import { copy } from '@/copy';
import { fixtureSnapshotBlocks, fixtureSnapshotCells } from './support/block-fixtures';
import { installBrowserFileAccessFake, queueBrowserFile } from './support/file-access';
import {
  openClientBackground,
  openClientWindow,
  putOnScene,
  record,
  seedStorage,
  type ClientParams,
} from './support/room';

const PRESET = {
  v: 4,
  templates: [
    {
      id: 'npc',
      title: 'NPC',
      players: 'edit',
      tabs: [
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
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
} as const;

const LONG_PRESET = {
  ...PRESET,
  templates: [
    {
      ...PRESET.templates[0],
      tabs: [
        {
          ...PRESET.templates[0].tabs[0],
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field' as const, type: 'text' as const, id: 'name' },
                    { kind: 'field' as const, type: 'number' as const, id: 'hp' },
                  ],
                },
                ...Array.from({ length: 18 }, (_, index) => ({
                  cells: [{ kind: 'field' as const, type: 'text' as const, id: `line${index}` }],
                })),
                { cells: [{ kind: 'token' as const, id: 'portrait' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
} as const;

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
          { instanceId: 'b', order: 1, cells: { name: 'Beta', hp: 9 } },
        ],
      }),
    },
  ],
  links: [],
};

const GM: ClientParams = { client: 'gm', device: 'repeat-tab-context', name: 'Мастер' };

test('Enter starts editing the field from the second selected repeat-tab block', async ({
  page,
}) => {
  // #given
  const frame = await openBuilderPreview(page);
  await sheetTab(frame, 'Beta').click();
  await frame.getByRole('status', { name: 'hp', exact: true }).click();

  // #when
  await page.keyboard.press('Enter');

  // #then
  const editor = frame.getByRole('textbox', { name: 'hp', exact: true });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('9');
});

test('editing a selected repeat-tab block changes only that snapshot block', async ({ page }) => {
  // #given
  const frame = await openBuilderPreview(page);
  await sheetTab(frame, 'Beta').click();
  await frame.getByRole('status', { name: 'hp', exact: true }).click();
  await page.keyboard.press('Enter');

  // #when
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('42');
  await page.keyboard.press('Enter');
  const downloaded = await downloadBuilderSnapshot(page);

  // #then
  expect(downloaded.sheets[0]?.blocks).toEqual([
    { path: ['npc', 'a'], order: 0, cells: { name: 'Alpha', hp: 7 } },
    { path: ['npc', 'b'], order: 1, cells: { name: 'Beta', hp: 42 } },
  ]);
});

test('opening a linked repeat-tab token below the fold reveals and focuses its exact cell', async ({
  context,
}) => {
  // #given
  const { window, background } = await openLongTabClient(context);
  await sheetTab(window, 'Beta').click();
  const target = window.locator('[data-cell-id="portrait"][data-cell-scope="b"]');
  await expect(target).not.toBeInViewport();
  await window.getByRole('textbox', { name: 'line0', exact: true }).focus();
  await putOnScene(window, ['beta']);

  // #when
  await clickOpen(background, 'beta');

  // #then
  await expect(target).toBeInViewport();
  await expect(target).toBeFocused();
});

async function openBuilderPreview(page: Page): Promise<Locator> {
  await installBrowserFileAccessFake(page);
  await page.goto('/builder.html');
  await queueBrowserFile(page, 'repeat-tab-context.json', JSON.stringify(PRESET));
  await page.getByRole('button', { name: /^Пресет/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();
  await queueBrowserFile(page, 'repeat-tab-context-snapshot.json', JSON.stringify(SNAPSHOT));
  await page.getByRole('button', { name: /^Снимок/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();

  return page.locator('[data-preview-frame]');
}

async function downloadBuilderSnapshot(page: Page): Promise<SnapshotFile> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Снимок/ }).click();
  await page.getByRole('menuitem', { name: 'Скачать копию' }).click();
  const download = await downloading;

  return snapshotFileSchema.parse(JSON.parse(readFileSync(await download.path(), 'utf8')));
}

async function openLongTabClient(
  context: BrowserContext,
): Promise<{ window: Page; background: Page }> {
  const window = await openClientWindow(context, GM);
  await window.setViewportSize({ width: 600, height: 300 });
  await seedStorage(
    window,
    [
      record('blk:npc:npc:a', {
        order: 0,
        cells: {
          name: 'Alpha',
          hp: 7,
          ...Object.fromEntries(
            Array.from({ length: 18 }, (_, index) => [`line${index}`, `Alpha ${index}`]),
          ),
        },
      }),
      record('blk:npc:npc:b', {
        order: 1,
        cells: {
          name: 'Beta',
          hp: 9,
          ...Object.fromEntries(
            Array.from({ length: 18 }, (_, index) => [`line${index}`, `Beta ${index}`]),
          ),
        },
      }),
      record('link:beta', { s: 'npc', path: ['npc', 'b'], c: 'portrait' }),
    ],
    JSON.stringify(LONG_PRESET),
    GM.device,
  );
  const background = await openClientBackground(context, GM);
  await expect(sheetTabs(window)).toBeVisible();

  return { window, background };
}

function sheetTabs(root: Page | Locator): Locator {
  return root.getByRole('tablist', { name: copy.label.sheetTabs });
}

function sheetTab(root: Page | Locator, name: string): Locator {
  return sheetTabs(root).getByRole('tab', { name, exact: true });
}

async function clickOpen(background: Page, tokenId: string): Promise<void> {
  const clicked = await background.evaluate(
    ([item, token]) => window.mockPlatform.clickContextMenuItem(item, [token]),
    ['app.muster-roll/open-sheet', tokenId] as const,
  );

  expect(clicked).toBe(true);
}
