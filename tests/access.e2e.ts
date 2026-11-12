import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { cssValue, renderedColor, tokenColor } from './support/colors';
import {
  ADD,
  addPartyMember,
  connectionIdOf,
  openClientBackground,
  npcBlock,
  openClientWindow,
  pcSheet,
  record,
  seedStorage,
  storedData,
  watchCommands,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

const ACCESS = 'Доступ';
const MAY_EDIT = 'Может править';
const CAN_EDIT = 'Можно править';
const READ_ONLY = 'Только чтение';
const NO_PLAYERS = 'Пока никого нет';

const GUEST_NOTE =
  'Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова.';

const ACL_FAILED = 'Не удалось изменить доступ. Попробуйте ещё раз.';

const UI_CHANNEL = 'app.muster-roll/ui';

const SHEET_NAME = 'Имя листа';

// The GM keeps its records in this browser's shared storage, so `storedData` reads them. The player
// has a device of its own and persists nothing.
const GM: ClientParams = { client: 'a', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'p',
};

// A visible sheet set, the hidden single sheet NPC, a visible single sheet, and a hidden sheet set.
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
      tabs: [
        {
          sections: [
            {
              title: 'Противники',
              repeat: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'npc_name' },
                  { kind: 'text', text: 'Хиты' },
                  { kind: 'field', type: 'number', id: 'hp' },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'inventory',
      kind: 'single',
      title: 'Инвентарь',
      players: 'edit',
      tabs: [
        {
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Золото' },
                  { kind: 'field', type: 'number', id: 'gold' },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'agents',
      kind: 'set',
      title: 'Агенты',
      nameField: 'agent',
      visibility: 'gm',
      tabs: [
        {
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Агент' },
                  { kind: 'field', type: 'text', id: 'agent' },
                ],
              ],
            },
          ],
        },
      ],
    },
  ],
});

const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  npcBlock('skel', 'Скелет', 0),
  record('sheet:spy', { set: 'agents', order: 0 }),
  record('row:spy:agent', { agent: 'Шпион' }),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('"Доступ" opens the panel inline under the header on surface-bar, with a line border and rounded-md', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);

  // #when
  await accessChip(gm.window).click();

  // #then
  const panel = accessPanel(gm.window);

  await expect(panel).toBeVisible();
  await expect(accessChip(gm.window)).toHaveAttribute('aria-expanded', 'true');
  await expect(accessChip(gm.window)).toHaveAttribute(
    'aria-controls',
    (await panel.getAttribute('id')) ?? '',
  );

  expect({
    afterHeader: await panel.evaluate((element) => element.previousElementSibling?.tagName ?? null),
    background: await renderedColor(panel, 'background-color'),
    border: await renderedColor(panel, 'border-top-color'),
    borderStyle: await cssValue(panel, 'border-top-style'),
    radius: await cssValue(panel, 'border-top-left-radius'),
  }).toEqual({
    afterHeader: 'HEADER',
    background: await tokenColor(gm.window, '--color-surface-bar'),
    border: await tokenColor(gm.window, '--color-line'),
    borderStyle: 'solid',
    radius: '6px',
  });
});

test('the open chip shows its pressed state, and a second press closes the panel', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const chip = accessChip(gm.window);
  const closedBackground = await renderedColor(chip, 'background-color');

  // #when
  await chip.click();
  const openBackground = await renderedColor(chip, 'background-color');

  await chip.click();

  // #then
  expect(openBackground).toEqual(await tokenColor(gm.window, '--color-surface-tab'));
  expect(openBackground).not.toEqual(closedBackground);
  await expect(accessPanel(gm.window)).toHaveCount(0);
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
});

test('"Esc" in the panel closes it and gives the focus back to "Доступ"', async ({ context }) => {
  // #given
  const gm = await openGm(context, RECORDS);
  await openClient(context, PLAYER, null);
  await accessChip(gm.window).click();
  await mayEdit(gm.window, 'Лиза').focus();

  // #when
  await gm.window.keyboard.press('Escape');

  // #then
  await expect(accessPanel(gm.window)).toHaveCount(0);
  await expect(accessChip(gm.window)).toBeFocused();
});

test('with no players the panel says "Пока никого нет" and shows the guest note', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);

  // #when
  await accessChip(gm.window).click();

  // #then
  await expect(accessPanel(gm.window)).toHaveText(`${NO_PLAYERS}${GUEST_NOTE}`);
  await expect(accessPanel(gm.window).getByRole('checkbox')).toHaveCount(0);
});

test('the panel lists each player id once by name, from the room and from the records, with no GM', async ({
  context,
}) => {
  // #given: Лиза is in the room on two connections, and her record holds an older name. Вова holds
  // access and Гена is linked as owner, and neither is in the room. Another GM is in the room.
  const records = [
    ...RECORDS,
    record('acl:brok:lisa', { name: 'Лиза старое имя' }),
    record('acl:brok:vova', { name: 'Вова' }),
    record('plink:brok:gena', { name: 'Гена' }),
    record('acl:brok:zoya', null),
  ];

  const gm = await openGm(context, records);

  await openClient(context, PLAYER, null);
  await addPartyMember(gm.window, 'mock-connection-lisa-2', 'PLAYER', { id: 'lisa', name: 'Лиза' });
  await addPartyMember(gm.window, 'mock-connection-gm-2', 'GM', { id: 'gm-2', name: 'Ассистент' });

  // #when
  await accessChip(gm.window).click();

  // #then
  const panel = accessPanel(gm.window);

  await expect(panel.getByRole('group')).toHaveText([
    `Вова${MAY_EDIT}`,
    `Гена${MAY_EDIT}`,
    `Лиза${MAY_EDIT}`,
  ]);
  await expect(mayEdit(gm.window, 'Вова')).toBeChecked();
  await expect(mayEdit(gm.window, 'Гена')).not.toBeChecked();
  await expect(mayEdit(gm.window, 'Лиза')).toBeChecked();
  await expect(panel.getByText(GUEST_NOTE, { exact: true })).toBeVisible();
});

test('a player who joins while the panel is open gets a row', async ({ context }) => {
  // #given
  const gm = await openGm(context, RECORDS);
  await accessChip(gm.window).click();
  await expect(accessPanel(gm.window).getByText(NO_PLAYERS, { exact: true })).toBeVisible();

  // #when
  await openClient(context, PLAYER, null);

  // #then
  await expect(accessPanel(gm.window).getByRole('group')).toHaveText([`Лиза${MAY_EDIT}`]);
});

test('"Может править" writes acl: at once and the player header turns to "Можно править", and back', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  await expect(playerHeader(player.window).getByText(READ_ONLY, { exact: true })).toBeVisible();
  await accessChip(gm.window).click();

  // #when
  await mayEdit(gm.window, 'Лиза').check();

  // #then
  await expect(playerHeader(player.window).getByText(CAN_EDIT, { exact: true })).toBeVisible();
  await expect(mayEdit(gm.window, 'Лиза')).toBeChecked();
  expect(await storedData(gm.window, 'acl:brok:lisa')).toEqual({ name: 'Лиза' });

  // #when
  await mayEdit(gm.window, 'Лиза').uncheck();

  // #then
  await expect(playerHeader(player.window).getByText(READ_ONLY, { exact: true })).toBeVisible();
  await expect(mayEdit(gm.window, 'Лиза')).not.toBeChecked();
  await expect.poll(() => storedData(gm.window, 'acl:brok:lisa')).toBeNull();
});

test('a player sees no "Доступ" chip and no panel', async ({ context }) => {
  // #given
  await openGm(context, RECORDS);

  // #when
  const player = await openClient(context, PLAYER, null);

  // #then
  await expect(playerHeader(player.window).getByText(READ_ONLY, { exact: true })).toBeVisible();
  await expect(accessChip(player.window)).toHaveCount(0);
  await expect(accessPanel(player.window)).toHaveCount(0);
});

for (const tab of ['NPC', 'Инвентарь', 'Шпион']) {
  test(`the GM gets no "Доступ" chip on ${tab}, as only a visible sheet set has one`, async ({
    context,
  }) => {
    // #given
    const gm = await openGm(context, RECORDS);

    await expect(accessChip(gm.window)).toHaveCount(1);

    // #when
    await gm.window.getByRole('tab', { name: tab }).click();

    // #then
    await expect(gm.window.getByRole('tab', { name: tab, selected: true })).toBeVisible();
    await expect(gm.window.getByRole('tabpanel').locator('header')).toBeVisible();
    await expect(accessChip(gm.window)).toHaveCount(0);
  });
}

test('a sheet delete tombstones its acl: records', async ({ context }) => {
  // #given
  const gm = await openGm(context, [...RECORDS, record('acl:brok:vova', { name: 'Вова' })]);

  // #when
  await gm.window.getByRole('button', { name: 'Действия с листом' }).click();
  await gm.window.getByRole('menuitem', { name: 'Удалить' }).click();
  await gm.window.getByRole('button', { name: 'Удалить', exact: true }).click();

  // #then
  await expect(gm.window.getByRole('textbox', { name: SHEET_NAME })).toHaveCount(0);
  await expect.poll(() => storedData(gm.window, 'acl:brok:vova')).toBeNull();
});

test('a refused change puts the box back and says so in the panel', async ({ context }) => {
  // #given: Вова is linked as owner and cannot edit. With the background closed, nothing answers.
  const gm = await openGm(context, [...RECORDS, record('plink:brok:vova', { name: 'Вова' })]);

  await accessChip(gm.window).click();
  await expect(mayEdit(gm.window, 'Вова')).not.toBeChecked();
  await watchCommands(gm.window);
  await gm.background.close();
  await mayEdit(gm.window, 'Вова').check();
  await expect(mayEdit(gm.window, 'Вова')).toBeChecked();

  // #when
  await postRejection(gm.window, await lastAclSet(gm.window));

  // #then: well before the timeout, so only the rejection can explain it.
  await expect(mayEdit(gm.window, 'Вова')).not.toBeChecked({ timeout: 2000 });
  await expect(accessPanel(gm.window).getByRole('status')).toHaveText(ACL_FAILED, {
    timeout: 2000,
  });
});

test('a change with no answer is dropped after 5 s and says so in the panel', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, [...RECORDS, record('plink:brok:vova', { name: 'Вова' })]);

  await accessChip(gm.window).click();
  await gm.background.close();

  // #when
  await mayEdit(gm.window, 'Вова').check();

  // #then
  await expect(mayEdit(gm.window, 'Вова')).toBeChecked();
  await expect(mayEdit(gm.window, 'Вова')).not.toBeChecked({ timeout: 8000 });
  await expect(accessPanel(gm.window).getByRole('status')).toHaveText(ACL_FAILED);
});

async function openGm(
  context: BrowserContext,
  records: readonly StoredRecord[],
): Promise<RoomClient> {
  const gm = await openClient(context, GM, records);

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

function accessChip(page: Page): Locator {
  return page.getByRole('button', { name: ACCESS, exact: true });
}

function accessPanel(page: Page): Locator {
  return page.getByRole('region', { name: ACCESS, exact: true });
}

function mayEdit(page: Page, player: string): Locator {
  return accessPanel(page)
    .getByRole('group', { name: player, exact: true })
    .getByRole('checkbox', { name: `${player}: может править`, exact: true });
}

// The id of the last `acl-set` this window sent. Needs `watchCommands` first.
async function lastAclSet(page: Page): Promise<string> {
  await expect
    .poll(() => page.evaluate(() => window.seenCommands.filter((seen) => seen.type === 'acl-set')))
    .toHaveLength(1);

  return page.evaluate(() => window.seenCommands.find((seen) => seen.type === 'acl-set')?.id ?? '');
}

async function postRejection(page: Page, id: string): Promise<void> {
  await page.evaluate(
    ([channel, commandId]) => {
      void window.mockPlatform.broadcast.sendMessage(
        channel,
        { t: 'command-rejected', id: commandId, reason: 'deleted-sheet' },
        { destination: 'LOCAL' },
      );
    },
    [UI_CHANNEL, id] as const,
  );
}

function playerHeader(page: Page): Locator {
  return page.getByRole('tabpanel').locator('header');
}
