import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import {
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  record,
  seedStorage,
  type ClientParams,
  type RoomClient,
} from './support/room';

// The GM's background runs a fake dice extension whose every die shows 17.
const GM: ClientParams = { client: 'a', device: 'a', name: 'Мастер', diceFaces: [17] };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  name: 'Лиза',
};

const PRESET = {
  v: 1,
  character: {
    sections: [
      {
        rows: [
          [
            { kind: 'text', text: 'Удар' },
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'dice', formula: '1d20 + str' },
          ],
        ],
      },
    ],
  },
  npc: {
    sections: [
      {
        rows: [
          [
            { kind: 'text', text: 'Хиты' },
            { kind: 'field', type: 'number', id: 'hp' },
          ],
        ],
      },
    ],
  },
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test("a roll with a dice extension shows the extension's face on every client", async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openPlayer(context);

  await expect(player.window.getByRole('button', { name: 'Удар' })).toBeVisible();

  // #when
  await diceButton(gm.window).click();

  // #then: 17 + str 14, from the one request the extension took.
  await expect.poll(() => shownNotifications(player)).toEqual(['Мастер: Брок, Удар — 31']);
  expect({
    shown: await shownNotifications(gm),
    notations: await gm.background.evaluate(() =>
      (window.mockDiceExtension?.requests() ?? []).map((request) => request.diceNotation),
    ),
  }).toEqual({ shown: ['Мастер: Брок, Удар — 31'], notations: ['1d20'] });
});

test('a dice button says it is rolling while it waits for the dice', async ({ context }) => {
  // #given: the extension takes the request and never answers.
  const gm = await openGm(context);

  await gm.background.evaluate(() => {
    window.mockDiceExtension?.answerWith({ kind: 'silent' });
  });

  // #when
  await diceButton(gm.window).click();

  // #then
  await expect(
    diceButton(gm.window).locator('xpath=following-sibling::span[@aria-live]'),
  ).toHaveText('Бросаем…');
});

test("a dice button says it waits for the GM's answer, and rolls with the extension once the GM allows", async ({
  context,
}) => {
  // #given: the GM has not answered the extension's prompt for Muster Roll, which the GM's client
  // asked for at start.
  const gm = await openGm(context, { ...GM, diceAccess: 'unknown' });
  const status = diceButton(gm.window).locator('xpath=following-sibling::span[@aria-live]');

  await expect
    .poll(() => gm.background.evaluate(() => window.mockDiceExtension?.accessRequests().length))
    .toBe(1);

  // #when
  await diceButton(gm.window).click();

  await expect(status).toHaveText('Ждём разрешения ГМ…');
  await gm.background.evaluate(() => {
    window.mockDiceExtension?.answerPrompt('allowed');
  });

  // #then: 17 + str 14, from the extension, and the line under the button clears.
  await expect.poll(() => shownNotifications(gm)).toEqual(['Мастер: Брок, Удар — 31']);
  await expect(status).toHaveText('');
});

async function openGm(context: BrowserContext, params: ClientParams = GM): Promise<RoomClient> {
  const window = await openClientWindow(context, params);

  await seedStorage(
    window,
    [
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
      record('row:brok:str', { str: 14 }),
    ],
    JSON.stringify(PRESET),
    params.device,
  );

  const background = await openClientBackground(context, params);

  await expect(window.getByRole('tabpanel').getByRole('button', { name: 'Удар' })).toBeVisible();

  return { window, background, connectionId: connectionIdOf(params) };
}

async function openPlayer(context: BrowserContext): Promise<RoomClient> {
  const window = await openClientWindow(context, PLAYER);
  const background = await openClientBackground(context, PLAYER);

  return { window, background, connectionId: connectionIdOf(PLAYER) };
}

async function shownNotifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

function diceButton(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('button', { name: 'Удар', exact: true });
}
