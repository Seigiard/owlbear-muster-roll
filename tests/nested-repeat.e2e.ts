import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

import { openBackground, record, seedStorage, storedCell } from './support/room';

const PRESET = {
  v: 4,
  templates: [
    {
      id: 'encounter',
      title: 'Encounter',
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
] as const;

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
  expect({
    goblin: await storedCell(page, 'blk:encounter:npc:goblin:attack:claw', 'attack_name'),
    orc: await storedCell(page, 'blk:encounter:npc:orc:attack:bow', 'attack_name'),
  }).toEqual({
    goblin: ['Bite', 2, 'mock-connection'],
    orc: ['Bow', 1, 'seed'],
  });
});

async function openEncounter(page: Page, context: BrowserContext): Promise<void> {
  await page.goto('/index.html');
  await seedStorage(page, RECORDS, JSON.stringify(PRESET));
  await openBackground(context);
  await expect(page.getByRole('tab', { name: 'Goblin', exact: true })).toBeVisible();
}

function attackName(page: Page): Locator {
  return page.getByRole('region', { name: 'Attacks' }).getByRole('textbox', {
    name: 'attack_name',
    exact: true,
  });
}
