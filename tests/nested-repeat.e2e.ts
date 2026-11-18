import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import {
  openBackground,
  openClientBackground,
  openClientWindow,
  putOnScene,
  record,
  seedStorage,
  storedData,
  type ClientParams,
} from './support/room';

const PRESET = {
  v: 4,
  templates: [
    {
      id: 'encounter',
      title: 'Encounter',
      players: 'edit',
      tabs: [
        {
          title: 'NPC',
          repeat: { id: 'npc', nameField: 'npc_name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'npc_name' },
                    { kind: 'field', type: 'number', id: 'hp' },
                  ],
                },
              ],
            },
            {
              title: 'Attacks',
              repeat: { id: 'attack', nameField: 'attack_name' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'attack_name' },
                    { kind: 'field', type: 'number', id: 'damage' },
                    { kind: 'dice', name: 'Strike', formula: 'damage + hp' },
                    { kind: 'token', id: 'attack_token' },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: 'Conditions',
          sections: [
            {
              title: 'Status',
              rows: [
                {
                  repeat: { id: 'condition', nameField: 'cond_name' },
                  cells: [
                    { kind: 'field', type: 'text', id: 'cond_name' },
                    { kind: 'field', type: 'number', id: 'lvl' },
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

const PLAIN_SECTION_ROW_PRESET = {
  v: 4,
  templates: [
    {
      id: 'plain',
      title: 'Plain row',
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [{ kind: 'field', type: 'number', id: 'sheet_bonus' }],
                },
              ],
            },
            {
              title: 'Groups',
              repeat: { id: 'group', nameField: 'group_name' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'group_name' },
                    { kind: 'field', type: 'number', id: 'bonus' },
                  ],
                },
                {
                  repeat: { id: 'move', nameField: 'move_name' },
                  cells: [
                    { kind: 'field', type: 'text', id: 'move_name' },
                    { kind: 'field', type: 'number', id: 'damage' },
                    {
                      kind: 'dice',
                      name: 'Move',
                      formula: 'damage + bonus + sheet_bonus',
                    },
                    { kind: 'token', id: 'move_token' },
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

const PLAIN_SECTION_ROW_RECORDS = [
  record('blk:plain', { order: 0, cells: { sheet_bonus: 5 } }),
  record('blk:plain:group:g1', {
    order: 0,
    cells: { group_name: 'Training', bonus: 2 },
  }),
  record('blk:plain:group:g1:move:m1', {
    order: 0,
    cells: { move_name: 'Jab', damage: 3 },
  }),
] as const;

const COPIED_PLAIN_SECTION_ROW_RECORDS = [
  ...PLAIN_SECTION_ROW_RECORDS,
  record('blk:plain:group:g2', {
    order: 1,
    cells: { group_name: 'Training 1', bonus: 2 },
  }),
  record('blk:plain:group:g2:move:m1', {
    order: 0,
    cells: { move_name: 'Jab', damage: 3 },
  }),
  record('link:t-copied-move', {
    s: 'plain',
    path: ['group', 'g2', 'move', 'm1'],
    c: 'move_token',
  }),
] as const;

const TAB_SECTION_ROW_PRESET = {
  v: 4,
  templates: [
    {
      id: 'nested',
      title: 'Nested row',
      tabs: [
        {
          title: 'NPC',
          repeat: { id: 'npc', nameField: 'npc_name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'npc_name' },
                    { kind: 'field', type: 'number', id: 'hp' },
                  ],
                },
              ],
            },
            {
              title: 'Loadouts',
              repeat: { id: 'loadout', nameField: 'loadout_name' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'loadout_name' },
                    { kind: 'field', type: 'number', id: 'bonus' },
                  ],
                },
                {
                  repeat: { id: 'attack', nameField: 'attack_name' },
                  cells: [
                    { kind: 'field', type: 'text', id: 'attack_name' },
                    { kind: 'field', type: 'number', id: 'damage' },
                    {
                      kind: 'dice',
                      name: 'Nested strike',
                      formula: 'damage + bonus + hp + sheet_bonus',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: 'Sheet',
          sections: [
            {
              rows: [
                {
                  cells: [{ kind: 'field', type: 'number', id: 'sheet_bonus' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
} as const;

const TAB_SECTION_ROW_RECORDS = [
  record('blk:nested', { order: 0, cells: { sheet_bonus: 1 } }),
  record('blk:nested:npc:goblin', {
    order: 0,
    cells: { npc_name: 'Goblin', hp: 7 },
  }),
  record('blk:nested:npc:goblin:loadout:primary', {
    order: 0,
    cells: { loadout_name: 'Primary', bonus: 2 },
  }),
  record('blk:nested:npc:goblin:loadout:primary:attack:claw', {
    order: 0,
    cells: { attack_name: 'Claw', damage: 3 },
  }),
] as const;

const RECORDS = [
  record('blk:encounter:npc:goblin', {
    order: 0,
    cells: { npc_name: 'Goblin', hp: 7 },
  }),
  record('blk:encounter:npc:goblin:attack:claw', {
    order: 0,
    cells: { attack_name: 'Claw', damage: 3 },
  }),
  record('blk:encounter:npc:orc', {
    order: 1,
    cells: { npc_name: 'Orc', hp: 12 },
  }),
  record('blk:encounter:npc:orc:attack:bow', {
    order: 0,
    cells: { attack_name: 'Bow', damage: 4 },
  }),
  record('link:t-bow', {
    s: 'encounter',
    path: ['npc', 'orc', 'attack', 'bow'],
    c: 'attack_token',
  }),
  record('blk:encounter:condition:poisoned', {
    order: 0,
    cells: { cond_name: 'Poisoned', lvl: 1 },
  }),
] as const;

const PLAYER: ClientParams = {
  catchUpTimeoutMs: 20,
  client: 'player',
  device: 'player',
  name: 'Lisa',
  player: 'lisa',
  role: 'PLAYER',
};

const GM: ClientParams = { client: 'gm', device: 'gm', name: 'Master' };

test('editing one NPC attack through its nested tab leaves the sibling NPC attack unchanged', async ({
  page,
  context,
}) => {
  // #given
  await openEncounter(page, context);
  await page.getByRole('tab', { name: 'Goblin', exact: true }).click();
  await expect(attackName(page)).toHaveValue('Claw');

  // #when
  await attackName(page).fill('Bite');
  await attackName(page).press('Enter');
  await page.getByRole('tab', { name: 'Orc', exact: true }).click();

  // #then
  await expect(attackName(page)).toHaveValue('Bow');
  await page.getByRole('tab', { name: 'Goblin', exact: true }).click();
  await expect(attackName(page)).toHaveValue('Bite');
  expect({
    goblin: await storedData(page, 'blk:encounter:npc:goblin:attack:claw'),
    orc: await storedData(page, 'blk:encounter:npc:orc:attack:bow'),
  }).toEqual({
    goblin: {
      order: 0,
      cells: {
        attack_name: ['Bite', 2, 'mock-connection'],
        damage: [3, 1, 'seed'],
      },
    },
    orc: {
      order: 0,
      cells: {
        attack_name: ['Bow', 1, 'seed'],
        damage: [4, 1, 'seed'],
      },
    },
  });
});

test('a nested repeat row rolls from its block and parent values', async ({ page, context }) => {
  // #given
  const background = await openEncounter(page, context);
  await page.getByRole('tab', { name: 'Goblin', exact: true }).click();

  // #when
  await page.getByRole('button', { name: 'Strike', exact: true }).click();

  // #then
  await expect
    .poll(() => background.evaluate(() => window.mockPlatform.shownNotifications()))
    .toEqual(['Mock GM: Encounter, Strike — 10']);
});

for (const scenario of [
  {
    occurrence: 'on a plain tab',
    preset: PLAIN_SECTION_ROW_PRESET,
    records: PLAIN_SECTION_ROW_RECORDS,
    tab: null,
    fieldId: 'move_name',
    initial: 'Jab',
    changed: 'Hook',
    dice: 'Move',
    key: 'blk:plain:group:g1:move:m1',
    stored: {
      order: 0,
      cells: {
        move_name: ['Hook', 2, 'mock-connection'],
        damage: [3, 1, 'seed'],
      },
    },
    notification: 'Mock GM: Plain row, Move — 10',
  },
  {
    occurrence: 'under a repeat tab',
    preset: TAB_SECTION_ROW_PRESET,
    records: TAB_SECTION_ROW_RECORDS,
    tab: 'Goblin',
    fieldId: 'attack_name',
    initial: 'Claw',
    changed: 'Bite',
    dice: 'Nested strike',
    key: 'blk:nested:npc:goblin:loadout:primary:attack:claw',
    stored: {
      order: 0,
      cells: {
        attack_name: ['Bite', 2, 'mock-connection'],
        damage: [3, 1, 'seed'],
      },
    },
    notification: 'Mock GM: Nested row, Nested strike — 13',
  },
] as const) {
  test(`a repeat row inside a repeat section renders, edits and resolves ancestors ${scenario.occurrence}`, async ({
    page,
    context,
  }) => {
    // #given
    await page.goto('/index.html');
    await seedStorage(page, scenario.records, JSON.stringify(scenario.preset));
    const background = await openBackground(context);

    if (scenario.tab !== null) {
      await page.getByRole('tab', { name: scenario.tab, exact: true }).click();
    }

    const child = page.getByRole('textbox', { name: scenario.fieldId, exact: true });
    await expect(child).toHaveValue(scenario.initial);

    // #when
    await child.fill(scenario.changed);
    await child.press('Enter');
    await page.getByRole('button', { name: scenario.dice, exact: true }).click();

    // #then
    expect(await storedData(page, scenario.key)).toEqual(scenario.stored);
    await expect
      .poll(() => background.evaluate(() => window.mockPlatform.shownNotifications()))
      .toEqual([scenario.notification]);
  });
}

test('a nested token selects its parent and focuses the child token cell', async ({
  page,
  context,
}) => {
  // #given
  const background = await openEncounter(page, context);
  await page.getByRole('tab', { name: 'Goblin', exact: true }).click();
  await putOnScene(page, ['t-bow']);
  const target = page.locator('[data-cell-id="attack_token"][data-cell-scope="bow"]');

  // #when
  const clicked = await background.evaluate(() =>
    window.mockPlatform.clickContextMenuItem('app.muster-roll/open-sheet', ['t-bow']),
  );

  // #then
  expect(clicked).toBe(true);
  await expect(page.getByRole('tab', { name: 'Orc', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(attackName(page)).toHaveValue('Bow');
  await expect(target).toBeVisible();
  await expect(target).toBeFocused();
});

test('a copied nested child opens and focuses from its complete token path', async ({
  page,
  context,
}) => {
  // #given
  await page.goto('/index.html');
  await seedStorage(
    page,
    COPIED_PLAIN_SECTION_ROW_RECORDS,
    JSON.stringify(PLAIN_SECTION_ROW_PRESET),
  );
  const background = await openBackground(context);
  await putOnScene(page, ['t-copied-move']);

  const sourceTarget = page
    .getByRole('group', { name: 'Training', exact: true })
    .getByRole('group', { name: 'Jab', exact: true })
    .locator('[data-cell-id="move_token"]');

  const copiedTarget = page
    .getByRole('group', { name: 'Training 1', exact: true })
    .getByRole('group', { name: 'Jab', exact: true })
    .locator('[data-cell-id="move_token"]');

  await expect(sourceTarget).toBeVisible();
  await expect(copiedTarget).toBeVisible();
  await sourceTarget.click();
  await expect(sourceTarget).toBeFocused();

  // #when
  const clicked = await background.evaluate(() =>
    window.mockPlatform.clickContextMenuItem('app.muster-roll/open-sheet', ['t-copied-move']),
  );

  // #then
  expect(clicked).toBe(true);
  await expect(copiedTarget).toBeFocused();
});

test('an ordinary repeat block keeps its name and numbers its duplicate', async ({
  page,
  context,
}) => {
  // #given
  await openEncounter(page, context);
  await page.getByRole('tab', { name: 'Conditions', exact: true }).click();
  const section = page.getByRole('region', { name: 'Status', exact: true });
  const source = section.locator('[data-repeat-block="poisoned"]');
  await expect(source).toBeVisible();

  // #when
  await source.getByRole('button', { name: 'Дублировать блок 1…', exact: true }).click();
  const count = page.getByRole('group', { name: 'Количество копий (1–50)' });
  await count.getByRole('textbox').fill('1');
  await count.getByRole('button', { name: 'Дублировать', exact: true }).click();

  // #then
  expect(
    await section
      .locator('[data-repeat-block]')
      .evaluateAll((blocks) => blocks.map((block) => block.getAttribute('aria-label'))),
  ).toEqual(['Poisoned', 'Poisoned 1']);
});

test('a real player edit marks the field of a visible named ordinary repeat block pending', async ({
  context,
}) => {
  // #given
  const gmWindow = await openClientWindow(context, GM);
  await seedStorage(gmWindow, RECORDS, JSON.stringify(PRESET), GM.device);
  const gmBackground = await openClientBackground(context, GM);
  const window = await openClientWindow(context, PLAYER);
  await openClientBackground(context, PLAYER);
  await expect(window.getByRole('tab', { name: 'Conditions', exact: true })).toBeVisible();
  await window.getByRole('tab', { name: 'Conditions', exact: true }).click();
  const block = window.locator('[data-repeat-block="poisoned"]');
  const level = block.getByRole('textbox', { name: 'lvl', exact: true });
  await expect(block).toBeVisible();
  await gmBackground.close();

  // #when
  await level.fill('2');
  await level.press('Enter');

  // #then
  await expect(block).toBeVisible();
  await expect(level).toHaveValue('2');
  await expect(level).toHaveAccessibleDescription('Ожидает', { timeout: 3000 });
});

async function openEncounter(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto('/index.html');
  await seedStorage(page, RECORDS, JSON.stringify(PRESET));
  const background = await openBackground(context);
  await expect(page.getByRole('tab', { name: 'Goblin', exact: true })).toBeVisible();

  return background;
}

function attackName(page: Page): Locator {
  return page.getByRole('region', { name: 'Attacks' }).getByRole('textbox', {
    name: 'attack_name',
    exact: true,
  });
}
