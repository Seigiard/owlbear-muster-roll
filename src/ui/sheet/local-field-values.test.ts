import { describe, expect, test } from 'bun:test';
import { blockAddress, type BlockAddress } from '@/core/block-address';
import { dicePlaceOf, rollDiceCell, type ShownValue } from '@/core/dice-roll';
import type { FieldPatchTarget } from '@/core/field-patch';
import type { TemplateLayout } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import {
  createLocalFieldValues,
  shownForRoll,
  type LocalFieldValue,
  type RolledRow,
} from './local-field-values';

// Plain rows `str`, `bonus` and a row with no field; a repeat `attack`; a repeat tab `npc` whose
// `claw` blocks nest in each NPC. `armor` is both an NPC and a claw field.
const LAYOUT: TemplateLayout = {
  tabs: [
    {
      sections: [
        {
          rows: [
            { cells: [{ kind: 'field', type: 'number', id: 'str' }] },
            { cells: [{ kind: 'field', type: 'number', id: 'bonus' }] },
            { cells: [{ kind: 'dice', formula: '1d20 + str' }] },
          ],
        },
        {
          repeat: { id: 'attack', nameField: 'attack' },
          rows: [
            {
              cells: [
                { kind: 'field', type: 'text', id: 'attack' },
                { kind: 'field', type: 'number', id: 'bonus' },
                { kind: 'dice', formula: '1d20 + bonus + str' },
              ],
            },
          ],
        },
      ],
    },
    {
      repeat: { id: 'npc', nameField: 'npc_name' },
      sections: [
        {
          rows: [
            {
              cells: [
                { kind: 'field', type: 'text', id: 'npc_name' },
                { kind: 'field', type: 'number', id: 'hp' },
                { kind: 'field', type: 'number', id: 'armor' },
                { kind: 'dice', formula: '1d20 + hp' },
              ],
            },
          ],
        },
        {
          repeat: { id: 'claw', nameField: 'damage' },
          rows: [
            {
              cells: [
                { kind: 'field', type: 'number', id: 'damage' },
                { kind: 'field', type: 'number', id: 'armor' },
                { kind: 'dice', formula: '1d20 + damage + hp + armor + str' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function address(...path: string[]): BlockAddress {
  const block = blockAddress('brok', path);

  if (block === null) throw new Error('fixture must be a block address');

  return block;
}

const STR_ROW: FieldPatchTarget = { kind: 'row', rowId: 'str' };
const BONUS_ROW: FieldPatchTarget = { kind: 'row', rowId: 'bonus' };
const ATTACK_ONE: FieldPatchTarget = { kind: 'rep', block: address('attack', 'i1') };
const ATTACK_TWO: FieldPatchTarget = { kind: 'rep', block: address('attack', 'i2') };
const NPC_ONE: FieldPatchTarget = { kind: 'rep', block: address('npc', 'n1') };
const NPC_TWO: FieldPatchTarget = { kind: 'rep', block: address('npc', 'n2') };
const CLAW_ONE: FieldPatchTarget = { kind: 'rep', block: address('npc', 'n1', 'claw', 'c1') };

const STR_ROLL: RolledRow = { tabIndex: 0, sectionIndex: 0, rowIndex: 0, block: null };
const BARE_ROLL: RolledRow = { tabIndex: 0, sectionIndex: 0, rowIndex: 2, block: null };

const ATTACK_ROLL: RolledRow = {
  tabIndex: 0,
  sectionIndex: 1,
  rowIndex: 0,
  block: address('attack', 'i1'),
};

const NPC_ROLL: RolledRow = {
  tabIndex: 1,
  sectionIndex: 0,
  rowIndex: 0,
  block: address('npc', 'n1'),
};

const CLAW_ROLL: RolledRow = {
  tabIndex: 1,
  sectionIndex: 1,
  rowIndex: 0,
  block: address('npc', 'n1', 'claw', 'c1'),
};

function local(target: FieldPatchTarget, fieldId: string, text: string): LocalFieldValue {
  return { sheetId: 'brok', target, fieldId, shown: { kind: 'text', text } };
}

function record(key: string, cells: Record<string, number>): [string, VersionedRecord] {
  const stamped = Object.fromEntries(
    Object.entries(cells).map(([id, value]): [string, [number, number, string]] => [
      id,
      [value, 1, 'gm'],
    ]),
  );

  return [key, { k: key, d: { order: 0, cells: stamped }, c: 1, a: 'gm', l: [1, 'gm'] }];
}

describe('shownForRoll', () => {
  test('a plain row reaches every plain-row field and no repeat row', () => {
    // #given
    const values = [local(STR_ROW, 'str', '16'), local(ATTACK_ONE, 'bonus', '5')];
    // #when
    const shown = shownForRoll(values, LAYOUT, STR_ROLL);
    // #then
    expect([...shown]).toEqual([['str', { kind: 'text', text: '16' }]]);
  });
  test('a repeat row reaches its own instance and the plain rows, not another instance', () => {
    // #given
    const values = [
      local(ATTACK_TWO, 'bonus', '9'),
      local(ATTACK_ONE, 'bonus', '5'),
      local(STR_ROW, 'str', '16'),
    ];

    // #when
    const shown = shownForRoll(values, LAYOUT, ATTACK_ROLL);
    // #then
    expect(new Map(shown)).toEqual(
      new Map<string, ShownValue>([
        ['bonus', { kind: 'text', text: '5' }],
        ['str', { kind: 'text', text: '16' }],
      ]),
    );
  });
  test('a field of the rolled row hides a plain-row field of the same id', () => {
    // #given: only the plain-row `bonus` holds a local value.
    const values = [local(BONUS_ROW, 'bonus', '9')];
    // #when
    const shown = shownForRoll(values, LAYOUT, ATTACK_ROLL);
    // #then
    expect(shown.size).toBe(0);
  });
  test('a row with no field reaches the plain rows', () => {
    // #given
    const values = [local(STR_ROW, 'str', '16'), local(ATTACK_ONE, 'bonus', '5')];
    // #when
    const shown = shownForRoll(values, LAYOUT, BARE_ROLL);
    // #then
    expect([...shown]).toEqual([['str', { kind: 'text', text: '16' }]]);
  });
  test('a nested row reaches its own block, its enclosing block and the plain rows', () => {
    // #given
    const values = [
      local(NPC_TWO, 'hp', '30'),
      local(NPC_ONE, 'hp', '12'),
      local(CLAW_ONE, 'damage', '4'),
      local(STR_ROW, 'str', '16'),
    ];

    // #when
    const shown = shownForRoll(values, LAYOUT, CLAW_ROLL);
    // #then
    expect(new Map(shown)).toEqual(
      new Map<string, ShownValue>([
        ['hp', { kind: 'text', text: '12' }],
        ['damage', { kind: 'text', text: '4' }],
        ['str', { kind: 'text', text: '16' }],
      ]),
    );
  });
  test('a nested row does not reach a block of the same id under another parent or beside it', () => {
    // #given: `c1` under `n2` and the sibling `c2` share the rolled block's field ids.
    const values = [
      local({ kind: 'rep', block: address('npc', 'n2', 'claw', 'c1') }, 'damage', '9'),
      local({ kind: 'rep', block: address('npc', 'n1', 'claw', 'c2') }, 'armor', '8'),
    ];

    // #when
    const shown = shownForRoll(values, LAYOUT, CLAW_ROLL);
    // #then
    expect(shown.size).toBe(0);
  });
  test('a plain row of a repeat tab reaches the fields of its tab block', () => {
    // #given
    const values = [local(NPC_TWO, 'hp', '30'), local(NPC_ONE, 'hp', '12')];
    // #when
    const shown = shownForRoll(values, LAYOUT, NPC_ROLL);
    // #then
    expect([...shown]).toEqual([['hp', { kind: 'text', text: '12' }]]);
  });
  test('a field of the nested row hides an enclosing-block field of the same id', () => {
    // #given: only the NPC's `armor` holds a local value.
    const values = [local(NPC_ONE, 'armor', '9')];
    // #when
    const shown = shownForRoll(values, LAYOUT, CLAW_ROLL);
    // #then
    expect(shown.size).toBe(0);
  });
  test('an input error in an enclosing-block field stops the nested roll with a field error', () => {
    // #given: the NPC's stored `hp` is 7, its field shows an input error.
    const records = new Map([
      record('blk:brok', { str: 1 }),
      record('blk:brok:npc:n1', { hp: 7, armor: 2 }),
      record('blk:brok:npc:n1:claw:c1', { damage: 3, armor: 1 }),
    ]);

    const values: LocalFieldValue[] = [
      { sheetId: 'brok', target: NPC_ONE, fieldId: 'hp', shown: { kind: 'error' } },
    ];

    const place = dicePlaceOf(
      { tabIndex: 1, sectionIndex: 1, rowIndex: 0, cellIndex: 2 },
      address('npc', 'n1', 'claw', 'c1'),
    );

    // #when
    const rolled = rollDiceCell(
      LAYOUT,
      records,
      'brok',
      place,
      shownForRoll(values, LAYOUT, CLAW_ROLL),
      () => 7,
    );

    // #then
    expect(rolled.isOk()).toBe(false);
    expect(rolled.isOk() ? null : rolled.error).toEqual({ code: 'field', field: 'hp' });
  });
});

describe('createLocalFieldValues', () => {
  test('reads the registered fields of one sheet that hold a local value, until unregistered', () => {
    // #given
    const values = createLocalFieldValues();
    const brok = local(STR_ROW, 'str', '16');
    values.register(() => brok);
    values.register(() => null);
    values.register(() => ({ ...brok, sheetId: 'liza' }));
    const unregister = values.register(() => local(STR_ROW, 'str_tired', 'x'));
    // #when
    unregister();
    // #then
    expect(values.read('brok')).toEqual([brok]);
  });
  test('counts the local changes of each sheet apart', () => {
    // #given
    const values = createLocalFieldValues();
    // #when
    values.changed('brok');
    values.changed('brok');
    values.changed('liza');
    // #then
    expect([...values.$changes.get()]).toEqual([
      ['brok', 2],
      ['liza', 1],
    ]);
  });
});
