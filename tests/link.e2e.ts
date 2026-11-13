import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { Popover } from '@/platform/ports';

import {
  ABSENT,
  ADD,
  clientQuery,
  npcBlock,
  openClientBackground,
  openClientWindow,
  openRoom,
  pcSheet,
  record,
  seedStorage,
  storedData,
  type ClientParams,
  type StoredRecord,
} from './support/room';

const LINK_ITEM = 'app.muster-roll/link-sheet';
const UNLINK_ITEM = 'app.muster-roll/unlink-sheet';
const OPEN_ITEM = 'app.muster-roll/open-sheet';
const PICKER_POPOVER = 'app.muster-roll/link-picker';
const TOKEN_LINKED = 'Токен привязан';
const NO_TOKEN = 'Нет токена';
const NO_SHEETS = 'Сначала создайте лист';
const LINK_FAILED = 'Не удалось привязать. Попробуйте ещё раз.';
const UI_CHANNEL = 'app.muster-roll/ui';
const LABEL_OFFER = 'Подписать токен именем листа';
const NO_LABEL = 'Сейчас подписи нет';
const LABEL_FAILED = 'Не удалось подписать токен';

// Two characters and two NPC repeat blocks of the example preset. "Аня" and "Гоблин" each have a
// token; t-gone points to a deleted sheet, so it counts as no link.
const ROOM: readonly StoredRecord[] = [
  ...pcSheet('anya', 'Аня', 0),
  ...pcSheet('brok', 'Брок', 1),
  npcBlock('gob', 'Гоблин', 0),
  npcBlock('skel', 'Скелет', 1),
  record('sheet:gone', null, 2),
  record('link:t-anya', { s: 'anya' }),
  record('link:t-gob', { s: 'npc', i: 'gob' }),
  record('link:t-gone', { s: 'gone' }),
];

// A preset whose one linkable template has no sheet yet.
const NO_TARGET_PRESET = JSON.stringify({
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] }],
    },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
});

test('"Привязать лист…" opens the picker in a small popover for the pressed token', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);

  // #when
  await clickMenuItem(background, LINK_ITEM, 'tok-new');

  // #then
  expect(await openedPopovers(background)).toEqual([
    {
      id: PICKER_POPOVER,
      url: '/picker.html?token=tok-new',
      width: 280,
      height: 360,
      anchorElementId: 'mock-context-menu-element',
    },
  ]);
});

test('the picker lists groups in preset order, each with the targets with no token first', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);

  // #when
  const picker = await openPicker(context, 'tok-new');

  // #then: a sheet set lists its sheets, a linkable repeat section its repeat blocks by first field
  // and sheet name, and a linkable single sheet itself.
  expect(await pickerGroups(picker)).toEqual([
    { group: 'Персонажи', targets: ['Брок', `Аня, ${TOKEN_LINKED}`] },
    { group: 'Противники', targets: ['Скелет, NPC', `Гоблин, NPC, ${TOKEN_LINKED}`] },
    { group: 'Инвентарь', targets: ['Инвентарь'] },
  ]);
});

test(`the picker with no target shows "${NO_SHEETS}"`, async ({ page, context }) => {
  // #given
  await openRoom(page, context, [record('sheet:gone', null, 2)], NO_TARGET_PRESET);

  // #when
  const picker = await openPicker(context, 'tok-new');

  // #then
  await expect(picker.getByText(NO_SHEETS)).toBeVisible();
  expect(await picker.getByRole('button').count()).toBe(0);
});

test('a pick writes the link, closes the popover, and both headers show the status', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);

  const picker = await openPicker(context, 'tok-new');
  const before = await headerStatus(page);

  // #when
  await picker.getByRole('button', { name: 'Брок' }).click();
  await expect.poll(() => closedPopovers(picker)).toEqual([PICKER_POPOVER]);

  // #then
  await page.getByRole('tab', { name: 'Брок' }).click();
  await expect(headerOf(page).getByText(TOKEN_LINKED)).toBeVisible();
  expect({ before, link: await storedData(page, 'link:tok-new') }).toEqual({
    before: NO_TOKEN,
    link: { s: 'brok' },
  });
});

test('each NPC repeat block shows its token status, read-only', async ({ page, context }) => {
  // #given
  await openRoom(page, context, ROOM);

  // #when
  await page.getByRole('tab', { name: 'NPC' }).click();

  // #then
  expect({
    goblin: await repeatBlock(page, 'Гоблин').getByText(TOKEN_LINKED).count(),
    skeleton: await repeatBlock(page, 'Скелет').getByText(NO_TOKEN).count(),
    controls: await repeatBlock(page, 'Гоблин').getByRole('button', { name: TOKEN_LINKED }).count(),
  }).toEqual({ goblin: 1, skeleton: 1, controls: 0 });
});

test('a pick of a repeat block links the token to it and its status shows on the NPC tab', async ({
  page,
  context,
}) => {
  // #given
  await openRoom(page, context, ROOM);

  const picker = await openPicker(context, 'tok-new');

  // #when
  await targetButton(picker, 'Скелет, NPC').click();
  await expect.poll(() => closedPopovers(picker)).toEqual([PICKER_POPOVER]);

  // #then
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(repeatBlock(page, 'Скелет').getByText(TOKEN_LINKED)).toBeVisible();
  expect(await storedData(page, 'link:tok-new')).toEqual({ s: 'npc', i: 'skel' });
});

test('"Отвязать лист" tombstones the link and the header shows "Нет токена"', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await expect(headerOf(page).getByText(TOKEN_LINKED)).toBeVisible();

  // #when
  await clickMenuItem(background, UNLINK_ITEM, 't-anya');

  // #then
  await expect(headerOf(page).getByText(NO_TOKEN)).toBeVisible();
  expect({
    link: await storedData(page, 'link:t-anya'),
    sheet: await storedData(page, 'sheet:anya'),
  }).toEqual({ link: null, sheet: { set: 'pc', order: 0 } });
});

test('a token id no link can hold shows the failure at once and no sheet to pick', async ({
  page,
  context,
}) => {
  // #given: no `link:` key can hold a token id with ":".
  await openRoom(page, context, ROOM);

  // #when
  const picker = await openPicker(context, 'bad:token');

  // #then
  await expect(picker.getByText(LINK_FAILED)).toBeVisible();
  expect(await picker.getByRole('button').count()).toBe(0);
});

test('a pick of a sheet deleted while the picker was open shows the failure and writes nothing', async ({
  page,
  context,
}) => {
  // #given: the picker misses the delta of the deletion, as one still on its way.
  await openRoom(page, context, ROOM);

  const picker = await openPicker(context, 'tok-new', { dropDeltas: true });

  await picker.evaluate(() => {
    Object.assign(window, { dropDeltas: true });
  });
  await page.evaluate((channel) => {
    void window.mockPlatform.broadcast.sendMessage(
      channel,
      { t: 'command', id: 'delete-brok', command: { type: 'sheet-delete', sheetId: 'brok' } },
      { destination: 'LOCAL' },
    );
  }, UI_CHANNEL);
  await expect.poll(() => storedData(page, 'sheet:brok')).toBeNull();

  // #when
  await picker.getByRole('button', { name: 'Брок' }).click();

  // #then
  await expect(picker.getByText(LINK_FAILED)).toBeVisible();
  expect({
    closed: await closedPopovers(picker),
    link: await storedData(page, 'link:tok-new'),
  }).toEqual({ closed: [], link: ABSENT });
});

test(`a token deleted from the scene clears its link, and the header shows "${NO_TOKEN}"`, async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await changeScene(background, [{ add: ['t-anya', 't-gob', 'map'] }]);
  await expect(headerOf(page).getByText(TOKEN_LINKED)).toBeVisible();

  // #when
  await changeScene(background, [{ remove: ['t-anya'] }]);

  // #then
  await expect(headerOf(page).getByText(NO_TOKEN)).toBeVisible();
  expect({
    link: await storedData(page, 'link:t-anya'),
    other: await storedData(page, 'link:t-gob'),
    sheet: await storedData(page, 'sheet:anya'),
  }).toEqual({
    link: null,
    other: { s: 'npc', i: 'gob' },
    sheet: { set: 'pc', order: 0 },
  });
});

test('a scene change keeps the links of the scene left behind', async ({ page, context }) => {
  // #given: "Аня" has her token on the first scene, "Гоблин" his on the second.
  const background = await openRoom(page, context, ROOM);

  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await changeScene(background, [{ add: ['t-anya'] }]);

  // #when: the GM opens the second scene and deletes the goblin's token there.
  await changeScene(background, [{ ready: false }, { items: ['t-gob'] }, { ready: true }]);
  await page.getByRole('tab', { name: 'NPC' }).click();
  await expect(repeatBlock(page, 'Гоблин').getByText(TOKEN_LINKED)).toBeVisible();
  await changeScene(background, [{ remove: ['t-gob'] }]);
  await expect(repeatBlock(page, 'Гоблин').getByText(NO_TOKEN)).toBeVisible();

  // #then
  await page.getByRole('tab', { name: 'Аня' }).click();
  await expect(headerOf(page).getByText(TOKEN_LINKED)).toBeVisible();
  expect({
    anya: await storedData(page, 'link:t-anya'),
    goblin: await storedData(page, 'link:t-gob'),
  }).toEqual({ anya: { s: 'anya' }, goblin: null });
});

test('a pick on a token with no label, the offer checked, labels the token with the sheet name', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await changeScene(background, [{ add: ['tok-new', 'map'] }]);

  const picker = await openPicker(context, 'tok-new');
  const offer = picker.getByRole('checkbox', { name: LABEL_OFFER });

  await expect(offer).toBeChecked();
  await expect(offer).toHaveAccessibleDescription(NO_LABEL);

  // #when
  await picker.getByRole('button', { name: 'Брок' }).click();
  await expect.poll(() => closedPopovers(picker)).toEqual([PICKER_POPOVER]);

  // #then
  expect({
    link: await storedData(page, 'link:tok-new'),
    label: await sceneLabel(background, 'tok-new'),
    other: await sceneLabel(background, 'map'),
  }).toEqual({ link: { s: 'brok' }, label: 'Брок', other: '' });
});

test("a pick of a repeat block on a token with no label labels it with the block's first field", async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await changeScene(background, [{ add: ['tok-new'] }]);

  const picker = await openPicker(context, 'tok-new');

  await expect(picker.getByRole('checkbox', { name: LABEL_OFFER })).toBeChecked();

  // #when
  await targetButton(picker, 'Скелет, NPC').click();
  await expect.poll(() => closedPopovers(picker)).toEqual([PICKER_POPOVER]);

  // #then
  expect({
    link: await storedData(page, 'link:tok-new'),
    label: await sceneLabel(background, 'tok-new'),
  }).toEqual({ link: { s: 'npc', i: 'skel' }, label: 'Скелет' });
});

test('a token with a label shows it in the offer, unchecked, and a pick keeps it', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await changeScene(background, [{ add: ['tok-new'] }]);
  await background.evaluate(() => {
    window.mockPlatform.setSceneItemLabel('tok-new', 'Гоблин 2');
  });

  const picker = await openPicker(context, 'tok-new');
  const offer = picker.getByRole('checkbox', { name: LABEL_OFFER });

  await expect(offer).not.toBeChecked();
  await expect(offer).toHaveAccessibleDescription('Сейчас: «Гоблин 2»');

  // #when
  await picker.getByRole('button', { name: 'Брок' }).click();
  await expect.poll(() => closedPopovers(picker)).toEqual([PICKER_POPOVER]);

  // #then
  expect({
    link: await storedData(page, 'link:tok-new'),
    label: await sceneLabel(background, 'tok-new'),
  }).toEqual({ link: { s: 'brok' }, label: 'Гоблин 2' });
});

test('a failed label write keeps the link, shows an Owlbear notification, and closes the picker', async ({
  page,
  context,
}) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await changeScene(background, [{ add: ['tok-new'] }]);

  const picker = await openPicker(context, 'tok-new');

  await expect(picker.getByRole('checkbox', { name: LABEL_OFFER })).toBeChecked();
  await picker.evaluate(() => {
    window.mockPlatform.failNextSceneLabelCalls(['write']);
  });

  // #when
  await picker.getByRole('button', { name: 'Брок' }).click();
  await expect.poll(() => closedPopovers(picker)).toEqual([PICKER_POPOVER]);

  // #then
  expect({
    link: await storedData(page, 'link:tok-new'),
    label: await sceneLabel(background, 'tok-new'),
    notifications: await picker.evaluate(() => window.mockPlatform.shownNotifications()),
  }).toEqual({ link: { s: 'brok' }, label: '', notifications: [LABEL_FAILED] });
});

test('"Отвязать лист" leaves the token label as it is', async ({ page, context }) => {
  // #given
  const background = await openRoom(page, context, ROOM);

  await waitForMenu(background, [LINK_ITEM, OPEN_ITEM, UNLINK_ITEM]);
  await changeScene(background, [{ add: ['t-anya'] }]);
  await background.evaluate(() => {
    window.mockPlatform.setSceneItemLabel('t-anya', 'Аня');
  });

  // #when
  await clickMenuItem(background, UNLINK_ITEM, 't-anya');
  await expect(headerOf(page).getByText(NO_TOKEN)).toBeVisible();

  // #then
  expect({
    link: await storedData(page, 'link:t-anya'),
    label: await sceneLabel(background, 't-anya'),
    calls: await background.evaluate(() => window.mockPlatform.sceneLabelCalls()),
  }).toEqual({ link: null, label: 'Аня', calls: [] });
});

test('a player picker reads and writes no label and shows no offer', async ({ context }) => {
  // #given
  const gm: ClientParams = { client: 'a', device: 'a' };
  const player: ClientParams = { client: 'p', role: 'PLAYER', player: 'lisa', device: 'p' };
  const gmWindow = await openClientWindow(context, gm);

  await seedStorage(gmWindow, ROOM, undefined, gm.device);

  const gmBackground = await openClientBackground(context, gm);

  await expect(gmWindow.getByRole('button', { name: ADD })).toBeVisible();
  await changeScene(gmBackground, [{ add: ['tok-new'] }]);

  const playerBackground = await openClientBackground(context, player);

  await waitForMenu(playerBackground, [OPEN_ITEM]);

  // #when
  const picker = await openPicker(context, 'tok-new', { client: player });

  // #then
  expect({
    offers: await picker.getByRole('checkbox').count(),
    sheets: await picker.getByRole('button').count(),
    calls: await picker.evaluate(() => window.mockPlatform.sceneLabelCalls()),
    label: await sceneLabel(gmBackground, 'tok-new'),
  }).toEqual({ offers: 0, sheets: 0, calls: [], label: '' });
});

// Drops each LOCAL delta while `window.dropDeltas` is true, so the picker misses one.
const DROP_DELTAS = `
  const Native = window.BroadcastChannel;
  window.BroadcastChannel = class extends Native {
    addEventListener(type, listener, options) {
      const filtered = (event) => {
        const dropped = window.dropDeltas === true && event.data?.data?.t === 'delta';

        if (!dropped) {
          listener.call(this, event);
        }
      };

      super.addEventListener(type, type === 'message' ? filtered : listener, options);
    }
  };
`;

// The picker as Owlbear would load it in the popover the background opened.
// A client's picker carries its mock params, so it talks to that client's background.
async function openPicker(
  context: BrowserContext,
  tokenId: string,
  options: { dropDeltas?: boolean; client?: ClientParams } = {},
): Promise<Page> {
  const picker = await context.newPage();

  if (options.dropDeltas === true) {
    await picker.addInitScript({ content: DROP_DELTAS });
  }

  const query = new URLSearchParams(clientQuery(options.client ?? {}));

  query.set('token', tokenId);
  await picker.goto(`/picker.html?${query.toString()}`);
  await expect(picker.locator('main')).toBeVisible();
  await expect(picker.getByText('Загрузка…')).toHaveCount(0);

  return picker;
}

async function waitForMenu(background: Page, ids: readonly string[]): Promise<void> {
  await expect
    .poll(() =>
      background.evaluate(() => window.mockPlatform.contextMenuItems().map((item) => item.id)),
    )
    .toEqual(ids);
}

// One change of the room's scene, as Owlbear reports it.
type SceneStep =
  | { add: string[] }
  | { remove: string[] }
  | { items: string[] }
  | { ready: boolean };

// Changes the room's scene through the background's mock, one step after another, as the GM would
// in Owlbear.
async function changeScene(background: Page, steps: readonly SceneStep[]): Promise<void> {
  await background.evaluate((all) => {
    for (const step of all) {
      if ('add' in step) {
        window.mockPlatform.addSceneItems(step.add);
      } else if ('remove' in step) {
        window.mockPlatform.removeSceneItems(step.remove);
      } else if ('items' in step) {
        window.mockPlatform.setSceneItems(step.items);
      } else {
        window.mockPlatform.setSceneReady(step.ready);
      }
    }
  }, steps);
}

async function clickMenuItem(background: Page, id: string, tokenId: string): Promise<void> {
  const clicked = await background.evaluate(
    ([item, token]) => window.mockPlatform.clickContextMenuItem(item, [token]),
    [id, tokenId] as const,
  );

  expect(clicked).toBe(true);
}

// The label the room's scene shows under an item, `null` for an item not in the scene.
function sceneLabel(page: Page, itemId: string): Promise<string | null> {
  return page.evaluate((id) => window.mockPlatform.sceneItemLabel(id), itemId);
}

function openedPopovers(page: Page): Promise<Popover[]> {
  return page.evaluate(() => window.mockPlatform.openedPopovers());
}

function closedPopovers(page: Page): Promise<string[]> {
  return page.evaluate(() => window.mockPlatform.closedPopovers());
}

function headerOf(page: Page): Locator {
  return page.getByRole('tabpanel').locator('header');
}

async function headerStatus(page: Page): Promise<string> {
  await page.getByRole('tab', { name: 'Брок' }).click();

  const status = headerOf(page).getByText(new RegExp(`^(${TOKEN_LINKED}|${NO_TOKEN})$`));

  await expect(status).toBeVisible();

  return status.innerText();
}

// A target by its shown text, as the text keeps the two names apart with a comma.
function targetButton(picker: Page, text: string): Locator {
  return picker.getByRole('button', { name: text, exact: true });
}

// A repeat block is a group named by its first field.
function repeatBlock(page: Page, name: string): Locator {
  return page.getByRole('tabpanel').getByRole('group', { name, exact: true });
}

// Each group's heading and its buttons' text: the target's name, and the status when it has a
// token.
async function pickerGroups(picker: Page): Promise<{ group: string; targets: string[] }[]> {
  return picker.locator('main section').evaluateAll((sections) =>
    sections.map((section) => ({
      group: section.getAttribute('aria-label') ?? '',
      // A target's accessible name joins its names and status: «Скелет, NPC».
      targets: [...section.querySelectorAll('button')].map(
        (button) => button.getAttribute('aria-label') ?? button.textContent,
      ),
    })),
  );
}
