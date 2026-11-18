import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  openBackground,
  putOnScene,
  record,
  seedStorage,
  selectOnMap,
  type StoredRecord,
} from './support/room';

const OPEN_ITEM = 'app.muster-roll/open-sheet';

const PRESET = JSON.stringify({
  v: 4,
  templates: [
    {
      id: 'atlas',
      title: 'Атлас',
      tabs: [
        {
          title: 'Главная',
          sections: [
            {
              rows: [
                ...Array.from({ length: 30 }, (_, index) => ({
                  cells: [{ kind: 'text', text: `Строка ${index + 1}` }],
                })),
                { cells: [{ kind: 'token', id: 'portrait' }] },
              ],
            },
          ],
        },
        {
          title: 'Атаки',
          sections: [
            {
              repeat: { id: 'attacks', nameField: 'name' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'portrait' },
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

const ROOM: StoredRecord[] = [
  record('blk:atlas', { order: 0, cells: {} }),
  ...Array.from({ length: 20 }, (_, index) =>
    record(`blk:atlas:attacks:a${index}`, {
      order: index,
      cells: { name: [`Атака ${index + 1}`, 1, 'seed'] },
    }),
  ),
  record('link:t-root', { s: 'atlas', c: 'portrait' }),
  record('link:t-block', { s: 'atlas', path: ['attacks', 'a19'], c: 'portrait' }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 360 });
});

test('cell opens use real tab and scroll geometry when root and block reuse the cell id', async ({
  page,
  context,
}) => {
  // #given
  const background = await openV4Room(page, context);

  // #when
  await clickOpen(background, 't-block');

  // #then
  await expect(page.getByRole('tab', { name: 'Атаки' })).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, 'a19')).toBeInViewport();

  // #when
  await clickOpen(background, 't-root');

  // #then
  await expect(page.getByRole('tab', { name: 'Главная' })).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, 'root')).toBeInViewport();
});

test('external selection marks another tab without changing the open tab or scroll', async ({
  page,
  context,
}) => {
  // #given
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const background = await openV4Room(page, context);
  await putOnScene(page, ['t-root', 't-block']);
  await clickOpen(background, 't-root');
  await expect(cell(page, 'root')).toBeInViewport();
  const panel = page.getByRole('tabpanel');
  const before = await panel.evaluate((node) => node.scrollTop);

  // #when
  await selectOnMap(page, ['t-block']);

  // #then
  await expect(page.getByRole('tab', { name: 'Атаки, токен выделен' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Главная' })).toHaveAttribute('aria-selected', 'true');
  expect(await panel.evaluate((node) => node.scrollTop)).toBe(before);
  await expect(cell(page, 'root')).toBeInViewport();
});

async function openV4Room(
  page: Page,
  context: Parameters<typeof openBackground>[0],
): Promise<Page> {
  await page.goto('/index.html');
  await seedStorage(page, ROOM, PRESET);
  const background = await openBackground(context);
  await expect(page.getByRole('tab', { name: 'Атлас' })).toBeVisible();
  await expect
    .poll(() =>
      background.evaluate(() => window.mockPlatform.contextMenuItems().map((item) => item.id)),
    )
    .toContain(OPEN_ITEM);

  return background;
}

async function clickOpen(background: Page, tokenId: string): Promise<void> {
  const clicked = await background.evaluate(
    ([item, token]) => window.mockPlatform.clickContextMenuItem(item, [token]),
    [OPEN_ITEM, tokenId] as const,
  );

  expect(clicked).toBe(true);
}

function cell(page: Page, scope: string) {
  return page.locator(`[data-cell-id="portrait"][data-cell-scope="${scope}"]`);
}
