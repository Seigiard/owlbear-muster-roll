import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { UI_CHANNEL } from '@/core/ui-messages';
import {
  ADD,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  postRemote,
  seedStorage,
  STORAGE_PREFIX,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const NO_GM = 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.';
const LOCAL_SAVE_FAILED = 'Не удалось сохранить в браузере. Скачайте снимок.';
const NEW_VERSION = 'Вышла новая версия. Перезагрузите страницу.';

// Short enough to watch the link go offline and come back within one test.
const GM_LINK_TIMEOUT_MS = 1000;
const GM: ClientParams = { client: 'a', device: 'a', gmLinkTimeoutMs: GM_LINK_TIMEOUT_MS };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  device: 'p',
  gmLinkTimeoutMs: GM_LINK_TIMEOUT_MS,
};

const PRESET_TEXT = JSON.stringify({
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Имя' },
                  { kind: 'field', type: 'text', id: 'name' },
                ],
              ],
            },
            {
              rows: [
                [
                  { kind: 'text', text: 'Сила' },
                  { kind: 'field', type: 'number', id: 'str' },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] }],
    },
  ],
});

const RECORDS: StoredRecord[] = [...pcSheet('brok', 'Брок', 0)];

type SyncRead = {
  state: string;
  firstCatchUpDone: boolean;
  gmLink: string;
  role: string;
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a player sees the no-GM banner once the GM pages close, and loses it when a GM returns', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  const player = await openClient(context, PLAYER, null);
  const banner = player.window.getByRole('status');
  await expect(player.window.getByRole('tab', { name: 'Брок' })).toBeVisible();
  // Two timeouts with only pings and their answers from the GM.
  await player.window.waitForTimeout(2 * GM_LINK_TIMEOUT_MS);
  await expect(banner).toHaveText('');
  // #when
  await gm.background.close({ runBeforeUnload: true });
  await gm.window.close();
  // #then
  await expect(banner).toHaveText(NO_GM);
  // #when
  await openGm(context);
  // #then
  await expect(banner).toHaveText('');
});

test('a GM alone in the room never shows the no-GM banner, though its link is offline', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context);
  // #when
  await gm.window.waitForTimeout(2 * GM_LINK_TIMEOUT_MS);
  // #then
  expect({
    banner: await gm.window.getByRole('status').textContent(),
    sync: await syncRead(gm.window),
  }).toEqual({
    banner: '',
    sync: { state: 'live', firstCatchUpDone: true, gmLink: 'offline', role: 'GM' },
  });
});

test('a failed local save shows over the no-GM banner', async ({ context }) => {
  // #given: a GM whose storage holds an unreadable record, so its save notice is up.
  const params: ClientParams = {
    client: 'a',
    catchUpTimeoutMs: 300,
    gmLinkTimeoutMs: GM_LINK_TIMEOUT_MS,
  };

  const gmWindow = await openClientWindow(context, params);
  await seedStorage(gmWindow, RECORDS, PRESET_TEXT);
  await gmWindow.evaluate((key) => {
    localStorage.setItem(key, '{not json');
  }, `${STORAGE_PREFIX}blk:bad`);
  const background = await openClientBackground(context, params);
  await expect(gmWindow.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);
  // #when: it becomes a player with no GM in the room.
  await background.evaluate(() => {
    window.mockPlatform.setRole('PLAYER');
  });
  await expect
    .poll(() => syncRead(gmWindow))
    .toEqual({ state: 'live', firstCatchUpDone: true, gmLink: 'offline', role: 'PLAYER' });
  // #then
  await expect(gmWindow.getByRole('status')).toHaveText(LOCAL_SAVE_FAILED);
});

test('a new version shows over the no-GM banner', async ({ context }) => {
  // #given
  const player = await openClient(context, { ...PLAYER, catchUpTimeoutMs: 300 }, null);
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
  // #when
  await postRemote(player.window, 'mock-connection-newer', { v: 5, t: 'ping' });
  // #then
  await expect(player.window.getByRole('status')).toHaveText(NEW_VERSION);
});

// A live GM whose device holds the preset and the records.
async function openGm(context: BrowserContext): Promise<RoomClient> {
  const gm = await openClient(context, GM, RECORDS);
  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();

  return gm;
}

// Opens one client. `records` seeds its device with the preset first; `null` seeds nothing.
async function openClient(
  context: BrowserContext,
  params: ClientParams,
  records: readonly StoredRecord[] | null,
): Promise<RoomClient> {
  const window = await openClientWindow(context, params);

  if (records !== null) {
    await seedStorage(window, records, PRESET_TEXT, params.device);
  }

  const background = await openClientBackground(context, params);

  return { window, background, connectionId: connectionIdOf(params) };
}

// The engine's own answer to a projection request: its sync state.
async function syncRead(page: Page): Promise<SyncRead> {
  return page.evaluate(
    (channel) =>
      new Promise<SyncRead>((resolve) => {
        const nonce = `read-${Date.now()}`;

        const stop = window.mockPlatform.broadcast.onMessage(channel, (event) => {
          const message = Object(event.data);

          if (message.t !== 'projection' || message.nonce !== nonce || message.i !== message.n) {
            return;
          }

          stop();
          resolve({
            state: String(message.sync.state),
            firstCatchUpDone: Boolean(message.sync.firstCatchUpDone),
            gmLink: String(message.sync.gmLink),
            role: String(message.sync.role),
          });
        });

        void window.mockPlatform.broadcast.sendMessage(
          channel,
          { t: 'projection-request', nonce },
          { destination: 'LOCAL' },
        );
      }),
    UI_CHANNEL,
  );
}
