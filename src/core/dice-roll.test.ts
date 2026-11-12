import { describe, expect, test } from 'bun:test';

import { randomFaces } from '@/core/formula-evaluate';
import type { PresetCell, TemplateLayout } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';

import { prepareDiceRoll, rollDiceCell, type DicePlace, type ShownValue } from './dice-roll';

// Every 1d20 shows 7: floor(0.3 * 20) + 1.
const SEVEN = (): number => 0.3;

const TEMPLATE: TemplateLayout = {
  sections: [
    {
      rows: [
        [
          { kind: 'text', text: 'Сила' },
          { kind: 'field', type: 'number', id: 'str' },
          { kind: 'field', type: 'check', id: 'str_tired' },
          { kind: 'dice', formula: '1d20 <= str - 2*str_tired' },
        ],
        [
          { kind: 'field', type: 'number', id: 'dex' },
          { kind: 'dice', formula: '1d20 + dex' },
        ],
        [
          { kind: 'text', text: 'Деление' },
          { kind: 'dice', formula: 'str / (str - str)' },
        ],
        [
          { kind: 'text', text: 'Чужое' },
          { kind: 'dice', formula: '1d20 + bonus' },
        ],
      ],
    },
    {
      repeat: true,
      rows: [
        [
          { kind: 'text', text: 'Атака' },
          { kind: 'field', type: 'text', id: 'attack' },
          { kind: 'field', type: 'number', id: 'bonus' },
          { kind: 'dice', formula: '1d20 + bonus + str' },
        ],
      ],
    },
    {
      repeat: true,
      rows: [
        [
          { kind: 'text', text: 'Заклинание' },
          { kind: 'field', type: 'text', id: 'spell' },
          { kind: 'field', type: 'number', id: 'power' },
        ],
        [
          { kind: 'text', text: 'Дальность' },
          { kind: 'field', type: 'number', id: 'range' },
          { kind: 'dice', formula: '1d20 + power + range' },
        ],
      ],
    },
  ],
};

const ROWS: VersionedRecord[] = [
  { k: 'row:brok:str', d: { str: 14, str_tired: true }, c: 1, a: 'gm' },
  { k: 'rep:brok:attack:i1', d: { order: 0, cells: { attack: 'Меч', bonus: 3 } }, c: 1, a: 'gm' },
  {
    k: 'rep:brok:spell:s1',
    d: { order: 0, cells: { spell: 'Искра', power: 2, range: 4 } },
    c: 1,
    a: 'gm',
  },
];

const RECORDS: ReadonlyMap<string, VersionedRecord> = new Map(
  ROWS.map((record) => [record.k, record]),
);

const STRENGTH: DicePlace = { sectionIndex: 0, rowIndex: 0, cellIndex: 3, instanceId: null };

const ATTACK: DicePlace = { sectionIndex: 1, rowIndex: 0, cellIndex: 3, instanceId: 'i1' };

const SPELL_RANGE: DicePlace = { sectionIndex: 2, rowIndex: 1, cellIndex: 2, instanceId: 's1' };

function roll(place: DicePlace, shown: [string, ShownValue][] = []) {
  return rollDiceCell(TEMPLATE, RECORDS, 'brok', place, new Map(shown), randomFaces(SEVEN));
}

function diceChoiceRoll(
  formula: string,
  value: string | undefined,
  label: string | null = 'Урон',
  repeat = false,
) {
  const cells: PresetCell[] = [
    { kind: 'field', type: 'dice-choice', id: 'weapon_die', options: ['d4', 'd6', 'd8'] },
    { kind: 'field', type: 'number', id: 'bonus' },
    { kind: 'dice', formula },
  ];

  if (label !== null) {
    cells.unshift({ kind: 'text', text: label });
  }

  const section: TemplateLayout['sections'][number] = { rows: [cells] };

  if (repeat) {
    section.repeat = true;
  }

  const layout: TemplateLayout = { sections: [section] };

  const key = repeat ? 'rep:brok:weapon_die:i1' : 'row:brok:weapon_die';

  const records = new Map<string, VersionedRecord>([
    [
      key,
      value === undefined
        ? repeat
          ? { k: key, d: { order: 0, cells: { bonus: 2 } }, c: 1, a: 'gm' }
          : { k: key, d: { bonus: 2 }, c: 1, a: 'gm' }
        : repeat
          ? { k: key, d: { order: 0, cells: { weapon_die: value, bonus: 2 } }, c: 1, a: 'gm' }
          : { k: key, d: { weapon_die: value, bonus: 2 }, c: 1, a: 'gm' },
    ],
  ]);

  const place: DicePlace = {
    sectionIndex: 0,
    rowIndex: 0,
    cellIndex: label === null ? 2 : 3,
    instanceId: repeat ? 'i1' : null,
  };

  return prepareDiceRoll(layout, records, 'brok', place, new Map());
}

describe('rollDiceCell', () => {
  test.each([
    [
      'writes out a formula label and rolls one chosen d8 with the bonus',
      '1d(weapon_die) + bonus',
      'd8',
      null,
      {
        cell: '1d8 + bonus',
        terms: [{ count: 1, sides: 8 }],
        result: { roll: 5, faces: [3], target: null, targetFaces: [], outcome: null },
      },
    ],
    [
      'writes out a formula label and rolls the chosen count',
      '2d(weapon_die)',
      'd6',
      null,
      {
        cell: '2d6',
        terms: [{ count: 2, sides: 6 }],
        result: { roll: 4, faces: [2, 2], target: null, targetFaces: [], outcome: null },
      },
    ],
    [
      'uses the preceding text to label a chosen die',
      '1d(weapon_die)',
      'd8',
      'Урон',
      {
        cell: 'Урон (1d8)',
        terms: [{ count: 1, sides: 8 }],
        result: { roll: 3, faces: [3], target: null, targetFaces: [], outcome: null },
      },
    ],
  ])('%s', (_name, formula, value, label, expected) => {
    // #when
    const prepared = diceChoiceRoll(formula, value, label);
    const rolled = prepared.ok ? prepared.value.roll(randomFaces(SEVEN)) : null;

    const actual = prepared.ok
      ? {
          cell: prepared.value.cell,
          terms: prepared.value.terms,
          result: rolled?.ok === true ? rolled.value : rolled,
        }
      : prepared;

    // #then
    expect(actual).toEqual(expected);
  });

  test('reads a chosen die from its own repeat block and writes it into the label', () => {
    // #given
    const prepared = diceChoiceRoll('1d(weapon_die)', 'd8', 'Урон', true);

    if (!prepared.ok) {
      throw new Error(`the repeat-block dice roll must prepare: ${prepared.error.code}`);
    }

    // #when
    const actual = {
      cell: prepared.value.cell,
      terms: prepared.value.terms,
      result: prepared.value.roll(randomFaces(SEVEN)),
    };

    // #then
    expect(actual).toEqual({
      cell: 'Урон (1d8)',
      terms: [{ count: 1, sides: 8 }],
      result: {
        ok: true,
        value: { roll: 3, faces: [3], target: null, targetFaces: [], outcome: null },
      },
    });
  });

  test.each([
    ['an empty dice-choice field', undefined],
    ['a stale non-die value', 'Меч'],
  ] as const)('gives the field error for %s', (_name, value) => {
    // #when
    const prepared = diceChoiceRoll('1d(weapon_die)', value);

    // #then
    expect(prepared).toEqual({ ok: false, error: { code: 'field', field: 'Урон' } });
  });

  test('gives the field error when no field resolves from a dice-choice slot', () => {
    // #given
    const formula = '1d(nothing)';

    // #when
    const prepared = diceChoiceRoll(formula, undefined);

    // #then
    expect(prepared).toEqual({ ok: false, error: { code: 'field', field: 'nothing' } });
  });

  test('rolls from the records and labels the roll by the cell', () => {
    // #when
    const rolled = roll(STRENGTH);

    // #then
    expect(rolled).toEqual({
      ok: true,
      value: {
        cell: 'Сила',
        result: { roll: 7, faces: [7], target: 12, targetFaces: [], outcome: 'success' },
      },
    });
  });

  test('names a roll by the dice cell name while keeping the formula as the roll expression', () => {
    // #given
    const layout: TemplateLayout = {
      sections: [
        {
          rows: [
            [
              {
                kind: 'dice',
                formula: '1d20 <= 10',
                name: 'Спасбросок STR',
              },
            ],
          ],
        },
      ],
    };

    // #when
    const prepared = prepareDiceRoll(
      layout,
      new Map(),
      'brok',
      { sectionIndex: 0, rowIndex: 0, cellIndex: 0, instanceId: null },
      new Map(),
    );

    // #then
    expect(prepared.ok ? prepared.value.cell : prepared).toEqual('Спасбросок STR');
  });

  test('adds the written chosen die to a named Nd field roll', () => {
    // #given
    const layout: TemplateLayout = {
      sections: [
        {
          rows: [
            [
              {
                kind: 'field',
                type: 'dice-choice',
                id: 'attack_1_die',
                options: ['d6', 'd8'],
              },
              {
                kind: 'dice',
                formula: '1d(attack_1_die)',
                name: 'Урон атаки 1',
              },
            ],
          ],
        },
      ],
    };

    const records = new Map<string, VersionedRecord>([
      [
        'row:brok:attack_1_die',
        {
          k: 'row:brok:attack_1_die',
          d: { attack_1_die: 'd8' },
          c: 1,
          a: 'gm',
        },
      ],
    ]);

    // #when
    const prepared = prepareDiceRoll(
      layout,
      records,
      'brok',
      { sectionIndex: 0, rowIndex: 0, cellIndex: 1, instanceId: null },
      new Map(),
    );

    // #then
    expect(prepared.ok ? prepared.value.cell : prepared).toEqual('Урон атаки 1 (1d8)');
  });

  test('keeps a named Nd field roll label when the name equals the unresolved formula', () => {
    // #given
    const layout: TemplateLayout = {
      sections: [
        {
          rows: [
            [
              {
                kind: 'field',
                type: 'dice-choice',
                id: 'damage',
                options: ['d6', 'd8'],
              },
              {
                kind: 'dice',
                formula: '1d(damage)',
                name: '1d(damage)',
              },
            ],
          ],
        },
      ],
    };

    const records = new Map<string, VersionedRecord>([
      [
        'row:brok:damage',
        {
          k: 'row:brok:damage',
          d: { damage: 'd8' },
          c: 1,
          a: 'gm',
        },
      ],
    ]);

    // #when
    const prepared = prepareDiceRoll(
      layout,
      records,
      'brok',
      { sectionIndex: 0, rowIndex: 0, cellIndex: 1, instanceId: null },
      new Map(),
    );

    // #then
    expect(prepared.ok ? prepared.value.cell : prepared).toEqual('1d(damage) (1d8)');
  });

  test('names an empty formula field by its cell name', () => {
    // #given
    const layout: TemplateLayout = {
      sections: [
        {
          rows: [
            [
              { kind: 'field', type: 'number', id: 'hp_max', name: 'HP, максимум' },
              { kind: 'dice', formula: '1d20 <= hp_max' },
            ],
          ],
        },
      ],
    };

    // #when
    const prepared = prepareDiceRoll(
      layout,
      new Map([['row:brok:hp_max', { k: 'row:brok:hp_max', d: { hp_max: 10 }, c: 1, a: 'gm' }]]),
      'brok',
      { sectionIndex: 0, rowIndex: 0, cellIndex: 1, instanceId: null },
      new Map([['hp_max', { kind: 'text', text: '' }]]),
    );

    const result = prepared.ok ? prepared.value.roll(randomFaces(SEVEN)) : prepared;

    // #then
    expect(result).toEqual({ ok: false, error: { code: 'field', field: 'HP, максимум' } });
  });

  test('uses the text a field shows over its record', () => {
    // #when
    const rolled = roll(STRENGTH, [['str', { kind: 'text', text: '16' }]]);

    // #then
    expect(rolled.ok && rolled.value.result.target).toBe(14);
  });

  test('uses the text a repeat row shows over its own instance', () => {
    // #when
    const rolled = roll(ATTACK, [['bonus', { kind: 'text', text: '5' }]]);

    // #then
    expect(rolled).toEqual({
      ok: true,
      value: {
        cell: 'Атака',
        result: { roll: 26, faces: [7], target: null, targetFaces: [], outcome: null },
      },
    });
  });

  test('rolls a dice cell in the second row of a repeat block from the fields of its whole block', () => {
    // #when
    const rolled = roll(SPELL_RANGE);

    // #then
    expect(rolled).toEqual({
      ok: true,
      value: {
        cell: 'Дальность',
        result: { roll: 13, faces: [7], target: null, targetFaces: [], outcome: null },
      },
    });
  });

  test.each<[string, DicePlace, [string, ShownValue][], string]>([
    ['a field shown in an input error', STRENGTH, [['str', { kind: 'error' }]], 'Сила'],
    ['a field shown empty', STRENGTH, [['str', { kind: 'text', text: '' }]], 'Сила'],
    [
      'a field shown as text that is no number',
      STRENGTH,
      [['str', { kind: 'text', text: '1x' }]],
      'Сила',
    ],
    [
      'an empty field with no text before it, by its id',
      { ...STRENGTH, rowIndex: 1, cellIndex: 1 },
      [],
      'dex',
    ],
    [
      'a plain field a repeat row reads, by its label in the plain section',
      ATTACK,
      [['str', { kind: 'error' }]],
      'Сила',
    ],
    [
      'a field of the first row of the block, by its label in that row',
      SPELL_RANGE,
      [['power', { kind: 'error' }]],
      'Заклинание',
    ],
    [
      'an id that only a repeat row holds, by the id',
      { ...STRENGTH, rowIndex: 3, cellIndex: 1 },
      [],
      'bonus',
    ],
  ])('names %s in the field error', (_name, place, shown, field) => {
    // #when
    const rolled = roll(place, shown);

    // #then
    expect(rolled).toEqual({ ok: false, error: { code: 'field', field } });
  });

  test('gives the arithmetic error with no field for a division by zero', () => {
    // #when
    const rolled = roll({ ...STRENGTH, rowIndex: 2, cellIndex: 1 });

    // #then
    expect(rolled).toEqual({ ok: false, error: { code: 'arithmetic' } });
  });

  test.each<[string, DicePlace]>([
    ['a cell that is a field', { ...STRENGTH, cellIndex: 1 }],
    ['a row past the section', { ...STRENGTH, rowIndex: 9 }],
    ['a repeat row that is gone', { ...ATTACK, instanceId: 'gone' }],
    ['a repeat row named with no instance', { ...ATTACK, instanceId: null }],
    ['a plain row named with an instance', { ...STRENGTH, instanceId: 'i1' }],
  ])('refuses %s', (_name, place) => {
    // #when
    const rolled = roll(place);

    // #then
    expect(rolled).toEqual({ ok: false, error: { code: 'not-dice' } });
  });
});
