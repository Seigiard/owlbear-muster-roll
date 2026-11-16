import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  ABSENT,
  ADD,
  addPartyMember,
  connectionIdOf,
  openClientBackground,
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
const OWNER = 'Его лист';
const NOBODY = 'Никто';
const CAN_EDIT = 'Можно править';
const READ_ONLY = 'Только чтение';
const ACL_FAILED = 'Не удалось изменить доступ. Попробуйте ещё раз.';
const GM: ClientParams = { client: 'a', name: 'Мастер' };

// A GM whose own player id the test names in a record.
const GM_WITH_ID: ClientParams = { client: 'a', name: 'Мастер', player: 'master' };
const UI_CHANNEL = 'app.muster-roll/ui';

// `ACCESS_CHANGE_TIMEOUT_MS` in `src/core/timing.ts`.
const ACCESS_CHANGE_TIMEOUT_MS = 5000;

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'p',
};

const OTHER_PLAYER: ClientParams = {
  client: 'q',
  role: 'PLAYER',
  player: 'vova',
  name: 'Вова',
  device: 'q',
};

// A sheet set, the hidden single sheet NPC and a visible single sheet, so a player's tab bar holds
// both sheets of a sheet set and a single sheet.
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
              rows: [
                [
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
  ],
});

const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  ...pcSheet('kira', 'Кира', 1),
  ...pcSheet('yarl', 'Ярл', 2),
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('the panel has one radio group "Его лист" with "Никто" and one option per row', async ({
  context,
}) => {
  // #given: Гена holds an owner link and is not in the room.
  const gm = await openGm(context, [...RECORDS, record('plink:brok:gena', { name: 'Гена' })]);
  await openClient(context, PLAYER, null);
  // #when
  await accessChip(gm.window).click();
  // #then
  const group = ownerGroup(gm.window);
  await expect(accessPanel(gm.window).getByRole('radiogroup')).toHaveCount(1);
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.getByRole('radio', { name: NOBODY, exact: true })).not.toBeChecked();
  await expect(ownerRadio(gm.window, 'Гена')).toBeChecked();
  await expect(ownerRadio(gm.window, 'Лиза')).not.toBeChecked();
});

test('picking a player writes plink: and acl: at once, and the player can edit', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  await expect(playerHeader(player.window).getByText(READ_ONLY, { exact: true })).toBeVisible();
  await accessChip(gm.window).click();
  await expect(ownerRadio(gm.window, NOBODY)).toBeChecked();
  // #when
  await ownerRadio(gm.window, 'Лиза').check();
  // #then
  await expect(ownerRadio(gm.window, 'Лиза')).toBeChecked();
  await expect(mayEdit(gm.window, 'Лиза')).toBeChecked();
  await expect.poll(() => storedData(gm.window, 'plink:brok:lisa')).toEqual({ name: 'Лиза' });
  expect(await storedData(gm.window, 'acl:brok:lisa')).toEqual({ name: 'Лиза' });
  await expect(playerHeader(player.window).getByText(CAN_EDIT, { exact: true })).toBeVisible();
});

test("picking another player moves the owner and leaves the previous owner's editing on", async ({
  context,
}) => {
  // #given: Лиза owns Брок and can edit it.
  const gm = await openGm(context, [
    ...RECORDS,
    record('plink:brok:lisa', { name: 'Лиза' }),
    record('acl:brok:lisa', { name: 'Лиза' }),
  ]);

  await openClient(context, PLAYER, null);
  await openClient(context, OTHER_PLAYER, null);
  await accessChip(gm.window).click();
  await expect(ownerRadio(gm.window, 'Лиза')).toBeChecked();
  // #when
  await ownerRadio(gm.window, 'Вова').check();
  // #then
  await expect(ownerRadio(gm.window, 'Вова')).toBeChecked();
  await expect(ownerRadio(gm.window, 'Лиза')).not.toBeChecked();
  await expect.poll(() => storedData(gm.window, 'plink:brok:lisa')).toBeNull();
  expect(await storedData(gm.window, 'plink:brok:vova')).toEqual({ name: 'Вова' });
  expect(await storedData(gm.window, 'acl:brok:lisa')).toEqual({ name: 'Лиза' });
  await expect(mayEdit(gm.window, 'Лиза')).toBeChecked();
  await expect(mayEdit(gm.window, 'Вова')).toBeChecked();
});

test('"Никто" removes the owner link and leaves editing as it was', async ({ context }) => {
  // #given
  const gm = await openGm(context, [
    ...RECORDS,
    record('plink:brok:lisa', { name: 'Лиза' }),
    record('acl:brok:lisa', { name: 'Лиза' }),
  ]);

  const player = await openClient(context, PLAYER, null);
  await expect(ownTab(player.window, 'Брок')).toBeVisible();
  await accessChip(gm.window).click();
  // #when
  await ownerRadio(gm.window, NOBODY).check();
  // #then
  await expect(ownerRadio(gm.window, NOBODY)).toBeChecked();
  await expect(ownerRadio(gm.window, 'Лиза')).not.toBeChecked();
  await expect.poll(() => storedData(gm.window, 'plink:brok:lisa')).toBeNull();
  expect(await storedData(gm.window, 'acl:brok:lisa')).toEqual({ name: 'Лиза' });
  await expect(mayEdit(gm.window, 'Лиза')).toBeChecked();
  await expect(ownTab(player.window, 'Брок')).toHaveCount(0);
  await expect(player.window.getByRole('tab', { name: 'Брок', exact: true })).toBeVisible();
});

test('clearing "Может править" for the owner turns editing off and keeps the owner', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  await accessChip(gm.window).click();
  await ownerRadio(gm.window, 'Лиза').check();
  await expect(playerHeader(player.window).getByText(CAN_EDIT, { exact: true })).toBeVisible();
  // #when
  await mayEdit(gm.window, 'Лиза').uncheck();
  // #then
  await expect(playerHeader(player.window).getByText(READ_ONLY, { exact: true })).toBeVisible();
  await expect.poll(() => storedData(gm.window, 'acl:brok:lisa')).toBeNull();
  expect(await storedData(gm.window, 'plink:brok:lisa')).toEqual({ name: 'Лиза' });
  await expect(ownerRadio(gm.window, 'Лиза')).toBeChecked();
  await expect(mayEdit(gm.window, 'Лиза')).not.toBeChecked();
  await expect(ownTab(player.window, 'Брок')).toBeVisible();
});

test('an owner who is not in the room keeps a row under the last known name', async ({
  context,
}) => {
  // #given: Вова owns Брок, Гена can edit it, and neither is in the room.
  const gm = await openGm(context, [
    ...RECORDS,
    record('plink:brok:vova', { name: 'Вова' }),
    record('acl:brok:gena', { name: 'Гена' }),
  ]);

  // #when
  await accessChip(gm.window).click();
  // #then
  await expect(accessPanel(gm.window).getByRole('group')).toHaveText([
    'ВоваМожет править',
    'ГенаМожет править',
  ]);
  await expect(ownerRadio(gm.window, 'Вова')).toBeChecked();
  await expect(mayEdit(gm.window, 'Гена')).toBeChecked();
});

test('of two live plink: records every client shows the one with the highest (c, a)', async ({
  context,
}) => {
  // #given: two GM clients picked at once. Лиза's record is newer.
  const gm = await openGm(context, [
    ...RECORDS,
    { k: 'plink:brok:vova', d: { name: 'Вова' }, c: 2, a: 'gm-z' },
    { k: 'plink:brok:lisa', d: { name: 'Лиза' }, c: 3, a: 'gm-a' },
  ]);

  const lisa = await openClient(context, PLAYER, null);
  const vova = await openClient(context, OTHER_PLAYER, null);
  // #when
  await accessChip(gm.window).click();
  // #then
  await expect(ownerRadio(gm.window, 'Лиза')).toBeChecked();
  await expect(ownerRadio(gm.window, 'Вова')).not.toBeChecked();
  await expect(ownTab(lisa.window, 'Брок')).toBeVisible();
  await expect(vova.window.getByRole('tab', { name: 'Брок', exact: true })).toBeVisible();
  await expect(vova.window.getByRole('tab', { name: /, вы$/u })).toHaveCount(0);
});

test('the next pick after two live plink: records tombstones both', async ({ context }) => {
  // #given
  const gm = await openGm(context, [
    ...RECORDS,
    { k: 'plink:brok:vova', d: { name: 'Вова' }, c: 2, a: 'gm-z' },
    { k: 'plink:brok:lisa', d: { name: 'Лиза' }, c: 3, a: 'gm-a' },
  ]);

  await addPartyMember(gm.window, 'mock-connection-gena', 'PLAYER', { id: 'gena', name: 'Гена' });
  await accessChip(gm.window).click();
  // #when
  await ownerRadio(gm.window, 'Гена').check();
  // #then
  await expect.poll(() => storedData(gm.window, 'plink:brok:gena')).toEqual({ name: 'Гена' });
  expect([
    await storedData(gm.window, 'plink:brok:vova'),
    await storedData(gm.window, 'plink:brok:lisa'),
  ]).toEqual([null, null]);
  await expect(ownerRadio(gm.window, 'Гена')).toBeChecked();
});

test('a sheet delete tombstones its plink: records', async ({ context }) => {
  // #given
  const gm = await openGm(context, [...RECORDS, record('plink:brok:vova', { name: 'Вова' })]);
  // #when
  await gm.window.getByRole('button', { name: 'Удалить лист' }).click();
  await gm.window.getByRole('button', { name: 'Удалить', exact: true }).click();
  // #then
  await expect(gm.window.getByRole('tab', { name: 'Брок' })).toHaveCount(0);
  await expect.poll(() => storedData(gm.window, 'plink:brok:vova')).toBeNull();
});

test('the owner sees the owned sheet first, before the other sheets and the single sheets, marked "вы", and selected', async ({
  context,
}) => {
  // #given
  await openGm(context, [...RECORDS, record('plink:yarl:lisa', { name: 'Лиза' })]);
  // #when
  const player = await openClient(context, PLAYER, null);
  // #then
  await expectTabNames(player.window, ['Ярл, вы', 'Брок', 'Кира', 'Инвентарь']);
  await expect(ownTab(player.window, 'Ярл')).toHaveAttribute('aria-selected', 'true');
});

test('a player who owns several sheets sees them first by (order, sheetId)', async ({
  context,
}) => {
  // #given: Кира and Ярл are Лиза's; Ярл and Аня share an order and break the tie by id.
  await openGm(context, [
    ...RECORDS,
    ...pcSheet('anya', 'Аня', 2),
    record('plink:yarl:lisa', { name: 'Лиза' }),
    record('plink:anya:lisa', { name: 'Лиза' }),
  ]);
  // #when
  const player = await openClient(context, PLAYER, null);
  // #then
  await expectTabNames(player.window, ['Аня, вы', 'Ярл, вы', 'Брок', 'Кира', 'Инвентарь']);
  await expect(ownTab(player.window, 'Аня')).toBeVisible();
  await expect(ownTab(player.window, 'Ярл')).toBeVisible();
});

test("a pick in the GM's panel moves the sheet to the front of the player's tab bar", async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, RECORDS);
  const player = await openClient(context, PLAYER, null);
  await expectTabNames(player.window, ['Брок', 'Кира', 'Ярл', 'Инвентарь']);
  await gm.window.getByRole('tab', { name: 'Кира' }).click();
  await accessChip(gm.window).click();
  // #when
  await ownerRadio(gm.window, 'Лиза').check();
  // #then
  await expectTabNames(player.window, ['Кира, вы', 'Брок', 'Ярл', 'Инвентарь']);
  await expect(ownTab(player.window, 'Кира')).toBeVisible();
});

test('a pick with no answer goes back after 5 s and says so in the panel', async ({ context }) => {
  // #given: Вова holds access and is not in the room. With the background closed, nothing answers.
  const gm = await openGm(context, [...RECORDS, record('acl:brok:vova', { name: 'Вова' })]);
  await accessChip(gm.window).click();
  await gm.background.close();
  // #when
  await ownerRadio(gm.window, 'Вова').check();
  // #then
  await expect(ownerRadio(gm.window, 'Вова')).toBeChecked();
  await expect(ownerRadio(gm.window, NOBODY)).toBeChecked({ timeout: 8000 });
  await expect(accessPanel(gm.window).getByRole('status')).toHaveText(ACL_FAILED);
});

test('arrow keys move the focus over the options and pick nothing; Space picks the focused one', async ({
  context,
}) => {
  // #given: Вова, Гена and Лиза are in the room, in that order by name. None holds a record.
  const gm = await openGm(context, RECORDS);
  await openClient(context, PLAYER, null);
  await openClient(context, OTHER_PLAYER, null);
  await addPartyMember(gm.window, 'mock-connection-gena', 'PLAYER', { id: 'gena', name: 'Гена' });
  await accessChip(gm.window).click();
  await expect(ownerGroup(gm.window).getByRole('radio')).toHaveCount(4);
  await ownerRadio(gm.window, NOBODY).focus();
  // #when
  await gm.window.keyboard.press('ArrowDown');
  await gm.window.keyboard.press('ArrowDown');
  await gm.window.keyboard.press('ArrowDown');
  // #then
  await expect(ownerRadio(gm.window, 'Лиза')).toBeFocused();
  await expect(ownerRadio(gm.window, NOBODY)).toBeChecked();
  // #when
  await gm.window.keyboard.press('Space');
  // #then: the commands go in order, so any sent while passing would have landed first.
  await expect.poll(() => storedData(gm.window, 'plink:brok:lisa')).toEqual({ name: 'Лиза' });
  expect({
    acl: await storedData(gm.window, 'acl:brok:lisa'),
    passed: await Promise.all(
      ['plink:brok:vova', 'acl:brok:vova', 'plink:brok:gena', 'acl:brok:gena'].map((key) =>
        storedData(gm.window, key),
      ),
    ),
  }).toEqual({ acl: { name: 'Лиза' }, passed: [ABSENT, ABSENT, ABSENT, ABSENT] });
  await expect(ownerRadio(gm.window, 'Лиза')).toBeChecked();
});

test('the radio group is apart from the rows, and only the checked option takes the Tab key', async ({
  context,
}) => {
  // #given
  const gm = await openGm(context, [...RECORDS, record('plink:brok:lisa', { name: 'Лиза' })]);
  await openClient(context, PLAYER, null);
  // #when
  await accessChip(gm.window).click();
  // #then
  await expect(ownerGroup(gm.window).getByRole('checkbox')).toHaveCount(0);
  await expect(ownerGroup(gm.window).getByRole('group')).toHaveCount(0);
  await expect(
    accessPanel(gm.window).getByRole('group', { name: 'Лиза' }).getByRole('radio'),
  ).toHaveCount(0);
  await expect(ownerRadio(gm.window, 'Лиза')).toHaveAttribute('tabindex', '0');
  await expect(ownerRadio(gm.window, NOBODY)).toHaveAttribute('tabindex', '-1');
});

test('a refused pick puts the radio back and says so in the panel', async ({ context }) => {
  // #given: with the background closed, nothing answers but the rejection.
  const gm = await openGm(context, [...RECORDS, record('acl:brok:vova', { name: 'Вова' })]);
  await accessChip(gm.window).click();
  await watchCommands(gm.window);
  await gm.background.close();
  await ownerRadio(gm.window, 'Вова').click();
  await expect(ownerRadio(gm.window, 'Вова')).toBeChecked();
  // #when
  await postRejection(gm.window, await lastCommand(gm.window, 'owner-set'));
  // #then: well before the timeout, so only the rejection can explain it.
  await expect(ownerRadio(gm.window, NOBODY)).toBeChecked({ timeout: 2000 });
  await expect(accessPanel(gm.window).getByRole('status')).toHaveText(ACL_FAILED, {
    timeout: 2000,
  });
});

test('an answered pick shows no failure, also after the timeout', async ({ context }) => {
  // #given
  const gm = await openGm(context, RECORDS);
  await openClient(context, PLAYER, null);
  await accessChip(gm.window).click();
  // #when
  await ownerRadio(gm.window, 'Лиза').click();
  await expect.poll(() => storedData(gm.window, 'plink:brok:lisa')).toEqual({ name: 'Лиза' });
  await gm.window.waitForTimeout(ACCESS_CHANGE_TIMEOUT_MS + 1000);
  // #then
  await expect(accessPanel(gm.window).getByRole('status')).toHaveText('');
  await expect(ownerRadio(gm.window, 'Лиза')).toBeChecked();
});

test('picking a player whose acl: is not live checks their "Может править" at once', async ({
  context,
}) => {
  // #given: Вова holds an old owner link and no access. Nothing answers.
  const gm = await openGm(context, [...RECORDS, record('acl:brok:vova', null)]);
  await addPartyMember(gm.window, 'mock-connection-vova', 'PLAYER', { id: 'vova', name: 'Вова' });
  await accessChip(gm.window).click();
  await expect(mayEdit(gm.window, 'Вова')).not.toBeChecked();
  await gm.background.close();
  // #when
  await ownerRadio(gm.window, 'Вова').click();
  // #then
  await expect(ownerRadio(gm.window, 'Вова')).toBeChecked();
  await expect(mayEdit(gm.window, 'Вова')).toBeChecked();
});

test('a GM window keeps its order and shows no "вы" for a plink: of the GM\'s own id', async ({
  context,
}) => {
  // #when
  const gm = await openClient(context, GM_WITH_ID, [
    ...RECORDS,
    record('plink:kira:master', { name: 'Мастер' }),
  ]);

  // #then
  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();
  await expectTabNames(gm.window, ['Брок', 'Кира', 'Ярл', 'NPC', 'Инвентарь', 'Настройки']);
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
  return page.getByRole('tabpanel').getByRole('button', { name: ACCESS, exact: true });
}

function accessPanel(page: Page): Locator {
  return page.getByRole('region', { name: ACCESS, exact: true });
}

function ownerGroup(page: Page): Locator {
  return accessPanel(page).getByRole('radiogroup', { name: OWNER, exact: true });
}

function ownerRadio(page: Page, name: string): Locator {
  return ownerGroup(page).getByRole('radio', { name, exact: true });
}

function mayEdit(page: Page, player: string): Locator {
  return accessPanel(page)
    .getByRole('group', { name: player, exact: true })
    .getByRole('checkbox', { name: `${player}: может править`, exact: true });
}

function ownTab(page: Page, name: string): Locator {
  return page.getByRole('tab', { name: `${name}, вы`, exact: true });
}

// The accessible names of the tabs, in order.
async function expectTabNames(page: Page, names: readonly string[]): Promise<void> {
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(names.length);

  for (const [index, name] of names.entries()) {
    // One tab after another, as each assertion waits on its own.
    // oxlint-disable-next-line no-await-in-loop
    await expect(tabs.nth(index)).toHaveAccessibleName(name);
  }
}

// The id of the last command of `type` this window sent. Needs `watchCommands` first.
async function lastCommand(page: Page, type: string): Promise<string> {
  await expect
    .poll(() =>
      page.evaluate((wanted) => window.seenCommands.filter((seen) => seen.type === wanted), type),
    )
    .toHaveLength(1);

  return page.evaluate(
    (wanted) => window.seenCommands.find((seen) => seen.type === wanted)?.id ?? '',
    type,
  );
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
