import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { copy } from '@/copy';

import { fixtureSnapshotBlocks, fixtureSnapshotCells } from './support/block-fixtures';
import { installBrowserFileAccessFake, queueBrowserFile } from './support/file-access';
import {
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  record,
  seedStorage,
  type ClientParams,
  type RoomClient,
} from './support/room';

const GM: ClientParams = {
  client: 'repeat-tab-dice',
  device: 'repeat-tab-dice',
  name: 'Мастер',
};

const SECOND_GM: ClientParams = {
  client: 'repeat-tab-dice-2',
  device: 'repeat-tab-dice-2',
  name: 'Второй мастер',
};

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
                    { kind: 'text', text: 'Хиты' },
                    { kind: 'field', type: 'number', id: 'hp' },
                    { kind: 'dice', formula: '1d1 + hp' },
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

const ROOM_RECORDS = [
  record('blk:npc', { hp: 41 }),
  record('blk:npc:npc:a', { order: 0, cells: { name: 'Alpha', hp: 7 } }),
  record('blk:npc:npc:b', { order: 1, cells: { name: 'Beta' } }),
];

const PREVIEW_SNAPSHOT = {
  v: 4,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'npc',
      cells: fixtureSnapshotCells({ root: { hp: 'root' } }),
      blocks: fixtureSnapshotBlocks({
        npc: [
          { instanceId: 'a', order: 0, cells: { name: 'Alpha', hp: 7 } },
          { instanceId: 'b', order: 1, cells: { name: 'Beta', hp: 'sibling' } },
        ],
      }),
    },
  ],
  links: [],
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
});

test('a room roll uses hp from the selected repeat-tab block', async ({ context }) => {
  // #given
  const gm = await openRoom(context);
  await sheetTab(gm.window, 'Alpha').click();

  // #when
  await diceButton(gm.window).click();

  // #then
  await expect
    .poll(async () => ({
      notifications: await shownNotifications(gm),
      message: await messageUnder(diceButton(gm.window)).textContent(),
    }))
    .toEqual({ notifications: ['Мастер: NPC, Хиты — 8'], message: '' });
});

test('a remote repeat-tab edit clears the stale dice field error', async ({ context }) => {
  // #given
  const first = await openRoom(context);
  const second = await openRoom(context, SECOND_GM);
  await sheetTab(first.window, 'Beta').click();
  await sheetTab(second.window, 'Beta').click();
  const dice = diceButton(first.window);
  await dice.click();
  await expect(messageUnder(dice)).toHaveText('Нельзя бросить: поле «Хиты» пустое или не число');

  // #when
  await second.window.getByRole('textbox', { name: 'Хиты', exact: true }).fill('10');

  // #then
  await expect
    .poll(async () => ({
      field: await first.window.getByRole('textbox', { name: 'Хиты', exact: true }).inputValue(),
      message: await messageUnder(dice).textContent(),
    }))
    .toEqual({ field: '10', message: '' });
});

test('Builder Preview rolls from the selected repeat-tab block', async ({ page }) => {
  // #given
  const frame = await openBuilderPreview(page);
  const source = page.getByRole('row', { name: 'NPC', exact: true });
  await source.click();
  await expect(source).toHaveAttribute('aria-selected', 'true');
  const beta = sheetTab(frame, 'Beta');
  await beta.click();
  await expect(beta).toHaveAttribute('aria-selected', 'true');
  const dice = diceButton(frame);

  // #when
  await dice.click();
  await dice.click();
  await expect(messageUnder(dice)).toHaveText('Нельзя бросить: поле «Хиты» пустое или не число');
  const alpha = sheetTab(frame, 'Alpha');
  await alpha.click();
  await expect(alpha).toHaveAttribute('aria-selected', 'true');
  await dice.click();
  await dice.click();

  // #then
  await expect(messageUnder(dice)).toHaveText('');
});

async function openRoom(context: BrowserContext, params = GM): Promise<RoomClient> {
  const window = await openClientWindow(context, params);
  await seedStorage(window, ROOM_RECORDS, JSON.stringify(PRESET), params.device);
  const background = await openClientBackground(context, params);
  await expect(sheetTab(window, 'Alpha')).toBeVisible();

  return { window, background, connectionId: connectionIdOf(params) };
}

async function openBuilderPreview(page: Page): Promise<Locator> {
  await installBrowserFileAccessFake(page);
  await page.goto('/builder.html');
  await queueBrowserFile(page, 'repeat-tab-dice.json', JSON.stringify(PRESET));
  await page.getByRole('button', { name: /^Пресет/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();
  await queueBrowserFile(page, 'repeat-tab-dice-snapshot.json', JSON.stringify(PREVIEW_SNAPSHOT));
  await page.getByRole('button', { name: /^Снимок/ }).click();
  await page.getByRole('menuitem', { name: /Открыть/ }).click();
  const frame = page.locator('[data-preview-frame]');
  await expect(sheetTab(frame, 'Alpha')).toBeVisible();

  return frame;
}

function sheetTab(root: Page | Locator, name: string): Locator {
  return root
    .getByRole('tablist', { name: copy.label.sheetTabs })
    .getByRole('tab', { name, exact: true });
}

function diceButton(root: Page | Locator): Locator {
  return root.getByRole('button', { name: 'Хиты', exact: true });
}

function messageUnder(dice: Locator): Locator {
  return dice.locator('xpath=following-sibling::span[@aria-live]');
}

async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}
