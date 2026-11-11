import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import type { JsonValue } from '@/core/json';
import { SYNC_CHANNEL } from '@/core/room-messages';

import {
  ADD,
  addPartyMember,
  connectionIdOf,
  openClientBackground,
  openClientWindow,
  pcSheet,
  postRemote,
  record,
  seedStorage,
  storedData,
  type ClientParams,
  type RoomClient,
  type StoredRecord,
} from './support/room';

// The strings of the 3.4 spec and the copy catalog, written out by hand.
const PENDING = 'Ожидает';
const DENIED = 'Нет прав на правку';
const NO_GM = 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.';
const READ_ONLY = 'Только чтение';
const ADD_ROW = 'Добавить в «Атаки»';
const DELETE_FIRST_ROW = 'Удалить блок 1';
const GENERATION = { n: 0, a: '' };

// The 3.4 spec's delay before "Ожидает" shows for an unanswered edit.
const MARK_DELAY_MS = 1000;

// A point well inside the delay, after the edit's delta has reached the window.
const INSIDE_DELAY_MS = 700;

// How soon a mark that shows "at once" must show: the round trip to the background, well inside
// the delay.
const AT_ONCE_MS = 600;

// The background's first resend of an unanswered proposal comes 2 s after it, so this sees one.
const RESEND_WAIT_MS = 6000;

const GM: ClientParams = { client: 'a', name: 'Мастер' };

const PLAYER: ClientParams = {
  client: 'p',
  role: 'PLAYER',
  player: 'lisa',
  name: 'Лиза',
  device: 'p',
};

const PRESET_TEXT = JSON.stringify({
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
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
          title: 'Основное',
          rows: [
            [
              { kind: 'text', text: 'Сила' },
              { kind: 'field', type: 'number', id: 'str' },
              { kind: 'text', text: 'Ловкость' },
              { kind: 'field', type: 'number', id: 'dex' },
            ],
          ],
        },
        {
          title: 'Атаки',
          repeat: true,
          rows: [
            [
              { kind: 'text', text: 'Атака' },
              { kind: 'field', type: 'text', id: 'attack' },
              { kind: 'text', text: 'Маг' },
              { kind: 'field', type: 'check', id: 'magic' },
            ],
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }],
    },
  ],
});

// Лиза may edit Брок.
const RECORDS: StoredRecord[] = [
  ...pcSheet('brok', 'Брок', 0),
  record('acl:brok:lisa', { name: 'Лиза' }),
  record('row:brok:str', { str: 14, dex: 12 }),
  record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
];

type Proposed = { k: string; d: JsonValue; c: number; a: string };

declare global {
  interface Window {
    proposed: Proposed[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 600 });
});

test('a player\'s edit shows at once, and "Ожидает" only after the delay with no answer', async ({
  context,
}) => {
  // #given
  const { gm, player } = await openWithSilentGm(context);

  // #when
  await strength(player.window).fill('16');
  await strength(player.window).press('Enter');
  const edited = Date.now();

  // #then: at a point well inside the delay the edit has gone out and shows, with no mark yet.
  await expect.poll(() => proposedKeys(gm.window)).toEqual(['row:brok:str']);
  await player.window.waitForTimeout(Math.max(0, edited + INSIDE_DELAY_MS - Date.now()));
  await expect(strength(player.window)).toHaveValue('16');
  await expect(mark(player.window)).toHaveCount(0);
  await expect(mark(player.window)).toBeVisible({ timeout: MARK_DELAY_MS * 3 });
  await expect(strength(player.window)).toHaveAccessibleDescription(PENDING);
});

test('an edit of one field of a row marks that field only', async ({ context }) => {
  // #given
  const { player } = await openWithSilentGm(context);

  // #when
  await dexterity(player.window).fill('13');
  await dexterity(player.window).press('Enter');

  // #then
  await expect(mark(player.window)).toBeVisible();
  await expect(dexterity(player.window)).toHaveAccessibleDescription(PENDING);
  await expect(strength(player.window)).toHaveAccessibleDescription('');
});

test('an edit back to the applied value still waits, and every field of its row says so', async ({
  context,
}) => {
  // #given: the first version has gone out, so the edit back must go out too.
  const { gm, player } = await openWithSilentGm(context);

  await strength(player.window).fill('16');
  await strength(player.window).press('Enter');
  await expect.poll(() => proposalCount(gm.window, 'row:brok:str')).toBe(1);

  // #when
  await strength(player.window).fill('14');
  await strength(player.window).press('Enter');

  // #then
  await expect.poll(() => proposalCount(gm.window, 'row:brok:str')).toBe(2);
  await expect(mark(player.window)).toHaveCount(2);
  await expect(strength(player.window)).toHaveValue('14');
  await expect(strength(player.window)).toHaveAccessibleDescription(PENDING);
  await expect(dexterity(player.window)).toHaveAccessibleDescription(PENDING);
});

test('a toggled check shows the mark and keeps its focus', async ({ context }) => {
  // #given
  const { player } = await openWithSilentGm(context);

  // #when
  await magic(player.window).click();

  // #then
  await expect(mark(player.window)).toBeVisible();
  await expect(magic(player.window)).toBeChecked();
  await expect(magic(player.window)).toHaveAccessibleDescription(PENDING);
  await expect(magic(player.window)).toBeFocused();
});

test("a GM's commit takes the mark away with no message", async ({ context }) => {
  // #given
  const { gm, player } = await openWithSilentGm(context);

  await strength(player.window).fill('16');
  await strength(player.window).press('Enter');
  await expect(mark(player.window)).toBeVisible();

  // #when
  await commitProposal(gm, 'row:brok:str');

  // #then
  await expect(mark(player.window)).toHaveCount(0);
  await expect(strength(player.window)).toHaveValue('16');
  await expect(strength(player.window)).toHaveAccessibleDescription('');
  expect(await notifications(player)).toEqual([]);
});

test('with no GM answering, the mark shows at once over a readable sheet, and a returning GM clears it', async ({
  context,
}) => {
  // #given: the player hears no GM for 1 s, then shows the no-GM banner.
  const { gm, player } = await openWithSilentGm(context, { gmLinkTimeoutMs: 1000 });

  await expect(player.window.getByRole('status')).toHaveText(NO_GM);

  // #when
  await strength(player.window).fill('16');
  await strength(player.window).press('Enter');

  // #then: it applies nowhere, and goes out again with no answer.
  await expect(mark(player.window)).toBeVisible({ timeout: AT_ONCE_MS });
  await expect(strength(player.window)).toHaveValue('16');
  await expect(player.window.getByRole('status')).toHaveText(NO_GM);
  await expect(attack(player.window)).toHaveValue('Меч');
  await expect
    .poll(() => proposalCount(gm.window, 'row:brok:str'), { timeout: RESEND_WAIT_MS })
    .toBeGreaterThanOrEqual(2);
  expect(await storedData(gm.window, 'row:brok:str')).toEqual({ str: 14, dex: 12 });

  // #when: the GM answers.
  await commitProposal(gm, 'row:brok:str');

  // #then
  await expect(mark(player.window)).toHaveCount(0);
  await expect(player.window.getByRole('status')).toBeEmpty();
  await expect(strength(player.window)).toHaveValue('16');
});

test('a focused field keeps its focus and caret when the mark appears', async ({ context }) => {
  // #given: the typing pause saves the field while it keeps the focus.
  const { player } = await openWithSilentGm(context);

  await strength(player.window).fill('16');
  await strength(player.window).press('ArrowLeft');

  // #when
  await expect(mark(player.window)).toBeVisible();

  // #then
  expect(
    await strength(player.window).evaluate((element) => [
      document.activeElement === element,
      element instanceof HTMLInputElement ? element.selectionStart : null,
      element instanceof HTMLInputElement ? element.value : null,
    ]),
  ).toEqual([true, 1, '16']);
});

test('a new repeat row carries the mark until the GM commits it', async ({ context }) => {
  // #given
  const { gm, player } = await openWithSilentGm(context);

  // #when
  await attacks(player.window).getByRole('button', { name: ADD_ROW, exact: true }).click();

  // #then
  await expect(attackFields(player.window)).toHaveCount(2);
  await expect(mark(player.window)).toBeVisible();
  await expect(attackFields(player.window).nth(1)).toHaveAccessibleDescription(PENDING);
  await expect(attackFields(player.window).nth(0)).toHaveAccessibleDescription('');

  // #when
  await commitProposal(gm, 'rep:brok:attack:');

  // #then
  await expect(mark(player.window)).toHaveCount(0);
  await expect(attackFields(player.window)).toHaveCount(2);
});

test('a removed repeat row stays dimmed with the mark at once, inputs disabled and no "Удалить", and goes on commit', async ({
  context,
}) => {
  // #given
  const { gm, player } = await openWithSilentGm(context);

  // #when
  await deleteFirstRow(player.window).click();

  // #then: the focus moves on from the "Удалить" that left.
  await expect(mark(player.window)).toBeVisible({ timeout: AT_ONCE_MS });
  await expect(addRow(player.window)).toBeFocused();
  await expect(attack(player.window)).toHaveValue('Меч');
  await expect(attack(player.window)).toBeDisabled();
  await expect(magic(player.window)).toBeDisabled();
  await expect(attack(player.window).locator('..')).toHaveCSS('opacity', '0.5');
  await expect(mark(player.window)).toHaveCSS('opacity', '1');
  await expect(deleteFirstRow(player.window)).toHaveCount(0);
  await expect(attack(player.window)).toHaveAccessibleDescription(PENDING);

  // #when
  await commitProposal(gm, 'rep:brok:attack:i1');

  // #then
  await expect(attackFields(player.window)).toHaveCount(0);
  await expect(mark(player.window)).toHaveCount(0);
});

test('a denied removal brings the row back to normal with "Нет прав на правку"', async ({
  context,
}) => {
  // #given
  const { gm, player } = await openWithSilentGm(context);

  await deleteFirstRow(player.window).click();
  await expect(attack(player.window)).toBeDisabled();
  await expect.poll(() => proposedKeys(gm.window)).toEqual(['rep:brok:attack:i1']);

  // #when
  await rejectProposal(gm, 'rep:brok:attack:i1');

  // #then
  await expect(attack(player.window)).toBeEnabled();
  await expect(attack(player.window).locator('..')).toHaveCSS('opacity', '1');
  await expect(deleteFirstRow(player.window)).toBeVisible();
  await expect(mark(player.window)).toHaveCount(0);
  await expect.poll(() => notifications(player)).toEqual([DENIED]);
});

test('a revoke while an edit waits makes the sheet read-only at once, returns the value and says so once', async ({
  context,
}) => {
  // #given
  const { gm, player } = await openWithSilentGm(context);

  await strength(player.window).fill('16');
  await strength(player.window).press('Enter');
  await deleteFirstRow(player.window).click();
  await expect.poll(() => proposedKeys(gm.window)).toEqual(['rep:brok:attack:i1', 'row:brok:str']);

  // #when
  await postRemote(gm.window, gm.connectionId, {
    v: 2,
    g: GENERATION,
    t: 'commit',
    records: [{ k: 'acl:brok:lisa', d: null, c: 2, a: gm.connectionId }],
  });

  // #then
  const sheet = player.window.getByRole('tabpanel');

  await expect(sheet.getByText(READ_ONLY, { exact: true })).toBeVisible();
  await expect(sheet.getByRole('textbox')).toHaveCount(0);
  await expect(sheet.getByRole('group', { name: 'Сила', exact: true })).toHaveText('14');
  await expect(sheet.getByRole('group', { name: 'Атака', exact: true })).toHaveText('Меч');
  await expect(mark(player.window)).toHaveCount(0);
  await expect.poll(() => notifications(player)).toEqual([DENIED]);
});

test('an edit a live GM answers within the delay never shows the mark, and the GM window shows none', async ({
  context,
}) => {
  // #given
  const gm = await openClient(context, GM, RECORDS);

  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();

  const player = await openClient(context, PLAYER, null);

  await expect(strength(player.window)).toHaveValue('14');

  // #when
  await strength(player.window).fill('16');
  await strength(player.window).press('Enter');
  await expect.poll(() => storedData(gm.window, 'row:brok:str')).toEqual({ str: 16, dex: 12 });
  await player.window.waitForTimeout(MARK_DELAY_MS * 1.5);

  // #then
  await expect(mark(player.window)).toHaveCount(0);
  await expect(mark(gm.window)).toHaveCount(0);
  await expect(strength(gm.window)).toHaveValue('16');
});

// The GM hands the room to the player, then its background closes. It stays in the party, so the
// player's proposals wait, and the test answers for it from its window, which hears them.
async function openWithSilentGm(
  context: BrowserContext,
  player: Partial<ClientParams> = {},
): Promise<{ gm: RoomClient; player: RoomClient }> {
  const gm = await openClient(context, GM, RECORDS);

  await expect(gm.window.getByRole('button', { name: ADD })).toBeVisible();

  const opened = await openClient(context, { ...PLAYER, ...player }, null);

  await expect(strength(opened.window)).toHaveValue('14');
  await gm.background.close();
  await addPartyMember(gm.window, gm.connectionId, 'GM', { name: 'Мастер' });
  await watchProposals(gm.window);

  return { gm, player: opened };
}

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

// Collects the record of every `propose` this page hears.
async function watchProposals(page: Page): Promise<void> {
  await page.evaluate((channel) => {
    window.proposed = [];
    window.mockPlatform.broadcast.onMessage(channel, (event) => {
      const data = Object(event.data);

      if (data.t === 'propose' && Array.isArray(data.records)) {
        window.proposed.push(...data.records);
      }
    });
  }, SYNC_CHANNEL);
}

async function proposalCount(page: Page, key: string): Promise<number> {
  const proposed = await page.evaluate(() => window.proposed);

  return proposed.filter((one) => one.k === key).length;
}

async function proposedKeys(page: Page): Promise<string[]> {
  const proposed = await page.evaluate(() => window.proposed);

  return [...new Set(proposed.map((one) => one.k))].sort();
}

// The newest proposal of a key that starts with `prefix`.
async function newestProposal(page: Page, prefix: string): Promise<Proposed> {
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.proposed)).some((one) => one.k.startsWith(prefix)),
    )
    .toBe(true);

  const proposed = await page.evaluate(() => window.proposed);
  const newest = proposed.filter((one) => one.k.startsWith(prefix)).at(-1);

  if (newest === undefined) {
    throw new Error(`no proposal of ${prefix}`);
  }

  return newest;
}

// The GM's answer: the proposed record merged unchanged, with the echo of its (k, c, a).
async function commitProposal(gm: RoomClient, prefix: string): Promise<void> {
  const proposal = await newestProposal(gm.window, prefix);

  await postRemote(gm.window, gm.connectionId, {
    v: 2,
    g: GENERATION,
    t: 'commit',
    records: [proposal],
    acks: [{ k: proposal.k, c: proposal.c, a: proposal.a }],
  });
}

async function rejectProposal(gm: RoomClient, prefix: string): Promise<void> {
  const proposal = await newestProposal(gm.window, prefix);

  await postRemote(gm.window, gm.connectionId, {
    v: 2,
    g: GENERATION,
    t: 'reject',
    k: proposal.k,
    c: proposal.c,
    a: proposal.a,
    reason: 'denied',
  });
}

async function notifications(client: RoomClient): Promise<string[]> {
  return client.background.evaluate(() => window.mockPlatform.shownNotifications());
}

function mark(page: Page): Locator {
  return page.getByRole('tabpanel').getByText(PENDING, { exact: true });
}

function strength(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'Сила', exact: true });
}

function dexterity(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('textbox', { name: 'Ловкость', exact: true });
}

function magic(page: Page): Locator {
  return attacks(page).getByRole('checkbox', { name: 'Маг', exact: true }).first();
}

function addRow(page: Page): Locator {
  return attacks(page).getByRole('button', { name: ADD_ROW, exact: true });
}

function attacks(page: Page): Locator {
  return page.getByRole('tabpanel').getByRole('region', { name: 'Атаки' });
}

function attackFields(page: Page): Locator {
  return attacks(page).getByRole('textbox', { name: 'Атака', exact: true });
}

function attack(page: Page): Locator {
  return attackFields(page).first();
}

function deleteFirstRow(page: Page): Locator {
  return attacks(page).getByRole('button', { name: DELETE_FIRST_ROW, exact: true });
}
