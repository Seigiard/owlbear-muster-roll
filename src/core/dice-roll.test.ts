import { Result } from 'better-result';
import { assembleRecords } from '@/core/merge';
import { blockAddress } from '@/core/block-address';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import { randomFaces } from '@/core/formula-evaluate';
import {
  parsePresetFile,
  parsePresetStructure,
  presetProblems,
  type PresetCell,
  type TemplateLayout,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import {
  diceBlockOf,
  dicePlaceOf,
  prepareDiceRoll,
  rollDiceCell,
  type DicePlace,
  type ShownValue,
} from './dice-roll';

// Every 1d20 shows 7: floor(0.3 * 20) + 1.
const SEVEN = (): number => 0.3;

const TEMPLATE: TemplateLayout = {
  tabs: [
    {
      sections: [
        {
          rows: [
            {
              cells: [
                { kind: 'text', text: 'Сила' },
                { kind: 'field', type: 'number', id: 'str' },
                { kind: 'field', type: 'check', id: 'str_tired' },
                { kind: 'dice', formula: '1d20 <= str - 2*str_tired' },
              ],
            },
            {
              cells: [
                { kind: 'field', type: 'number', id: 'dex' },
                { kind: 'dice', formula: '1d20 + dex' },
              ],
            },
            {
              cells: [
                { kind: 'text', text: 'Деление' },
                { kind: 'dice', formula: 'str / (str - str)' },
              ],
            },
            {
              cells: [
                { kind: 'text', text: 'Чужое' },
                { kind: 'dice', formula: '1d20 + bonus' },
              ],
            },
          ],
        },
        {
          repeat: { id: 'attack', nameField: 'attack' },
          rows: [
            {
              cells: [
                { kind: 'text', text: 'Атака' },
                { kind: 'field', type: 'text', id: 'attack' },
                { kind: 'field', type: 'number', id: 'bonus' },
                { kind: 'dice', formula: '1d20 + bonus + str' },
              ],
            },
          ],
        },
        {
          repeat: { id: 'spell', nameField: 'spell' },
          rows: [
            {
              cells: [
                { kind: 'text', text: 'Заклинание' },
                { kind: 'field', type: 'text', id: 'spell' },
                { kind: 'field', type: 'number', id: 'power' },
              ],
            },
            {
              cells: [
                { kind: 'text', text: 'Дальность' },
                { kind: 'field', type: 'number', id: 'range' },
                { kind: 'dice', formula: '1d20 + power + range' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const ROWS: VersionedRecord[] = [
  {
    k: 'blk:brok',
    d: { order: 0, cells: { str: [14, 1, 'gm'], str_tired: [true, 1, 'gm'] } },
    c: 1,
    a: 'gm',
    l: [1, 'seed'],
  },
  {
    k: 'blk:brok:attack:i1',
    d: { order: 0, cells: { attack: ['Меч', 1, 'gm'], bonus: [3, 1, 'gm'] } },
    c: 1,
    a: 'gm',
    l: [1, 'seed'],
  },
  {
    k: 'blk:brok:spell:s1',
    d: { order: 0, cells: { spell: ['Искра', 1, 'gm'], power: [2, 1, 'gm'], range: [4, 1, 'gm'] } },
    c: 1,
    a: 'gm',
    l: [1, 'seed'],
  },
];

const RECORDS: ReadonlyMap<string, VersionedRecord> = assembleRecords(ROWS);

const STRENGTH: DicePlace = {
  tabIndex: 0,
  sectionIndex: 0,
  rowIndex: 0,
  cellIndex: 3,
  instanceId: null,
};

const ATTACK: DicePlace = {
  tabIndex: 0,
  sectionIndex: 1,
  rowIndex: 0,
  cellIndex: 3,
  instanceId: 'i1',
};

const SPELL_RANGE: DicePlace = {
  tabIndex: 0,
  sectionIndex: 2,
  rowIndex: 1,
  cellIndex: 2,
  instanceId: 's1',
};

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

  const section: TemplateLayout['tabs'][number]['sections'][number] = { rows: [{ cells }] };

  if (repeat) {
    section.repeat = { id: 'weapon_die', nameField: 'weapon_die' };
  }

  const layout: TemplateLayout = { tabs: [{ sections: [section] }] };
  const key = repeat ? 'blk:brok:weapon_die:i1' : 'blk:brok';

  const records = new Map<string, VersionedRecord>([
    [
      key,
      value === undefined
        ? repeat
          ? fixtureRecord(key, { order: 0, cells: { bonus: 2 } }, 1, 'gm')
          : fixtureRecord(key, { bonus: 2 }, 1, 'gm')
        : repeat
          ? fixtureRecord(key, { order: 0, cells: { weapon_die: value, bonus: 2 } }, 1, 'gm')
          : fixtureRecord(key, { weapon_die: value, bonus: 2 }, 1, 'gm'),
    ],
  ]);

  const place: DicePlace = {
    tabIndex: 0,
    sectionIndex: 0,
    rowIndex: 0,
    cellIndex: label === null ? 2 : 3,
    instanceId: repeat ? 'i1' : null,
  };

  return prepareDiceRoll(layout, records, 'brok', place, new Map());
}

describe('diceBlockOf', () => {
  test('names the repeat block selected by a dice place', () => {
    // #then
    expect(diceBlockOf(TEMPLATE, 'brok', ATTACK)).toEqual({
      sheetId: 'brok',
      path: ['attack', 'i1'],
    });
  });

  test('refuses a nested path whose block id differs from the place', () => {
    // #given
    const place: DicePlace = {
      ...ATTACK,
      instanceId: 'other',
      path: ['attack', 'i1', 'spell', 's1'],
    };

    // #then
    expect(diceBlockOf(TEMPLATE, 'brok', place)).toBeNull();
  });
});

describe('dicePlaceOf', () => {
  test('serialises a plain row in a one-pair tab block with its full path', () => {
    // #given
    const block = blockAddress('npc', ['npc', 'a']);

    if (block === null) throw new Error('fixture must be a block address');

    const place = {
      tabIndex: 1,
      sectionIndex: 0,
      rowIndex: 2,
      cellIndex: 3,
      instanceId: null,
    };

    // #when
    const wire = dicePlaceOf(place, block);

    // #then
    expect(wire).toEqual({
      tabIndex: 1,
      sectionIndex: 0,
      rowIndex: 2,
      cellIndex: 3,
      instanceId: 'a',
      path: ['npc', 'a'],
    });
  });

  test('serialises a nested block with its leaf id and unchanged full path', () => {
    // #given
    const block = blockAddress('npc', ['npc', 'a', 'attack', 'x']);

    if (block === null) throw new Error('fixture must be a block address');

    const place = {
      tabIndex: 1,
      sectionIndex: 1,
      rowIndex: 0,
      cellIndex: 2,
      instanceId: null,
    };

    // #when
    const wire = dicePlaceOf(place, block);

    // #then
    expect(wire).toEqual({
      tabIndex: 1,
      sectionIndex: 1,
      rowIndex: 0,
      cellIndex: 2,
      instanceId: 'x',
      path: ['npc', 'a', 'attack', 'x'],
    });
  });

  test('serialises a root row without a path', () => {
    // #given
    const place = {
      tabIndex: 0,
      sectionIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      instanceId: 'stale',
      path: ['stale', 'stale'],
    };

    // #when
    const wire = dicePlaceOf(place, null);

    // #then
    expect(wire).toEqual({
      tabIndex: 0,
      sectionIndex: 0,
      rowIndex: 0,
      cellIndex: 1,
      instanceId: null,
    });
  });
});

test('gives each repeat row its own field scope while repeat ids remain unique in the sheet scope', () => {
  // #given
  const candidate = {
    v: 4,
    templates: [
      {
        id: 'journal',
        title: 'Журнал',
        tabs: [
          {
            title: 'Первое',
            sections: [
              {
                rows: [
                  {
                    repeat: { id: 'conditions', nameField: 'name' },
                    cells: [{ kind: 'field', type: 'text', id: 'name' }],
                  },
                  {
                    repeat: { id: 'contacts', nameField: 'name' },
                    cells: [{ kind: 'field', type: 'text', id: 'name' }],
                  },
                ],
              },
            ],
          },
          {
            title: 'Второе',
            sections: [
              {
                repeat: { id: 'conditions', nameField: 'title' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'title' }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  // #when
  const structure = parsePresetStructure(candidate);

  // #then
  expect(structure === null ? null : presetProblems(structure)).toEqual([
    {
      failure: { code: 'duplicate-section', detail: 'conditions' },
      path: [0, 1, 0],
    },
  ]);
});

test('rolls a repeat-row dice cell from the scoped descendant block', () => {
  // #given
  const layout: TemplateLayout = {
    tabs: [
      {
        sections: [
          {
            rows: [
              {
                repeat: { id: 'conditions', nameField: 'name' },
                cells: [
                  { kind: 'field', type: 'text', id: 'name' },
                  { kind: 'field', type: 'number', id: 'severity' },
                  { kind: 'dice', formula: '1d20 + severity', name: 'Проверка' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const records = new Map<string, VersionedRecord>([
    [
      'blk:journal:conditions:c1',
      {
        k: 'blk:journal:conditions:c1',
        d: {
          order: 0,
          cells: { name: ['Отравлен', 1, 'seed'], severity: [2, 1, 'seed'] },
        },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);

  // #when
  const rolled = rollDiceCell(
    layout,
    records,
    'journal',
    { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: 'c1' },
    new Map(),
    randomFaces(SEVEN),
  );

  // #then
  expect(rolled).toEqual(
    Result.ok({
      cell: 'Проверка',
      result: { roll: 9, faces: [7], target: null, targetFaces: [], outcome: null },
    }),
  );
});

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
    const rolled = prepared.isOk() ? prepared.value.roll(randomFaces(SEVEN)) : null;

    const actual = prepared.isOk()
      ? {
          cell: prepared.value.cell,
          terms: prepared.value.terms,
          result: rolled?.isOk() === true ? rolled.value : rolled,
        }
      : prepared;

    // #then
    expect(actual).toEqual(expected);
  });
  test('reads a chosen die from its own repeat block and writes it into the label', () => {
    // #given
    const prepared = diceChoiceRoll('1d(weapon_die)', 'd8', 'Урон', true);

    if (!prepared.isOk()) {
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
      result: Result.ok({ roll: 3, faces: [3], target: null, targetFaces: [], outcome: null }),
    });
  });
  test.each([
    ['an empty dice-choice field', undefined],
    ['a stale non-die value', 'Меч'],
  ] as const)('gives the field error for %s', (_name, value) => {
    // #when
    const prepared = diceChoiceRoll('1d(weapon_die)', value);
    // #then
    expect(prepared).toEqual(Result.err({ code: 'field', field: 'Урон' }));
  });
  test('gives the field error when no field resolves from a dice-choice slot', () => {
    // #given
    const formula = '1d(nothing)';
    // #when
    const prepared = diceChoiceRoll(formula, undefined);
    // #then
    expect(prepared).toEqual(Result.err({ code: 'field', field: 'nothing' }));
  });
  test('rolls from the records and labels the roll by the cell', () => {
    // #when
    const rolled = roll(STRENGTH);
    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell: 'Сила',
        result: { roll: 7, faces: [7], target: 12, targetFaces: [], outcome: 'success' },
      }),
    );
  });
  test('a nested attack reads its own value, its NPC value and the sheet value', () => {
    // #given
    const layout: TemplateLayout = {
      tabs: [
        {
          sections: [
            {
              rows: [{ cells: [{ kind: 'field', type: 'number', id: 'sheet_bonus' }] }],
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
                  ],
                },
              ],
            },
            {
              repeat: { id: 'attack', nameField: 'attack_name' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'damage' },
                    { kind: 'dice', formula: 'damage + hp + sheet_bonus' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const records = new Map<string, VersionedRecord>([
      [
        'blk:encounter',
        {
          k: 'blk:encounter',
          d: { order: 0, cells: { sheet_bonus: [2, 1, 'gm'] } },
          c: 1,
          a: 'gm',
          l: [1, 'gm'],
        },
      ],
      [
        'blk:encounter:npc:n1',
        {
          k: 'blk:encounter:npc:n1',
          d: { order: 0, cells: { npc_name: ['Goblin', 1, 'gm'], hp: [7, 1, 'gm'] } },
          c: 1,
          a: 'gm',
          l: [1, 'gm'],
        },
      ],
      [
        'blk:encounter:npc:n1:attack:a1',
        {
          k: 'blk:encounter:npc:n1:attack:a1',
          d: { order: 0, cells: { damage: [3, 1, 'gm'] } },
          c: 1,
          a: 'gm',
          l: [1, 'gm'],
        },
      ],
    ]);

    const place = {
      tabIndex: 1,
      sectionIndex: 1,
      rowIndex: 0,
      cellIndex: 1,
      instanceId: 'a1',
      path: ['npc', 'n1', 'attack', 'a1'],
    };

    // #when
    const rolled = rollDiceCell(layout, records, 'encounter', place, new Map(), randomFaces(SEVEN));

    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell: 'damage + hp + sheet_bonus',
        result: { roll: 12, faces: [], target: null, targetFaces: [], outcome: null },
      }),
    );
  });
  test.each([
    ['the enclosing number field', 2, '1d6+bonus', 7],
    ['the nearest field with the same field id', 3, '1d6+power', 9],
    ['the enclosing dice-choice field', 4, '1d8', 4],
  ])('reads %s when the tab and section repeat ids match', (_name, cellIndex, cell, total) => {
    // #given
    const preset = parsePresetFile(
      JSON.stringify({
        v: 4,
        templates: [
          {
            id: 'encounter',
            title: 'Encounter',
            tabs: [
              {
                title: 'NPCs',
                repeat: { id: 'npc', nameField: 'npc_name' },
                sections: [
                  {
                    rows: [
                      {
                        cells: [
                          { kind: 'field', type: 'text', id: 'npc_name' },
                          { kind: 'field', type: 'number', id: 'bonus' },
                          { kind: 'field', type: 'number', id: 'power' },
                          { kind: 'field', type: 'dice-choice', id: 'weapon_die', options: ['d8'] },
                        ],
                      },
                    ],
                  },
                  {
                    repeat: { id: 'npc', nameField: 'attack_name' },
                    rows: [
                      {
                        cells: [
                          { kind: 'field', type: 'text', id: 'attack_name' },
                          { kind: 'field', type: 'number', id: 'power' },
                          { kind: 'dice', formula: '1d6+bonus' },
                          { kind: 'dice', formula: '1d6+power' },
                          { kind: 'dice', formula: '1d(weapon_die)' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const layout = preset.isOk() ? preset.value.templates[0] : undefined;

    if (layout === undefined)
      throw new Error(`Expected a valid v4 preset: ${JSON.stringify(preset)}`);

    const records = assembleRecords([
      fixtureRecord('blk:encounter:npc:n0', { npc_name: 'Orc', bonus: 8, weapon_die: 'd6' }),
      fixtureRecord('blk:encounter:npc:n0:npc:a1', { attack_name: 'Bash', power: 1 }),
      fixtureRecord('blk:encounter:npc:n1', {
        npc_name: 'Goblin',
        bonus: 3,
        power: 1,
        weapon_die: 'd8',
      }),
      fixtureRecord('blk:encounter:npc:n1:npc:a1', { attack_name: 'Slash', power: 5 }),
    ]);

    const place: DicePlace = {
      tabIndex: 0,
      sectionIndex: 1,
      rowIndex: 0,
      cellIndex,
      instanceId: 'a1',
      path: ['npc', 'n1', 'npc', 'a1'],
    };

    // #when
    const rolled = rollDiceCell(layout, records, 'encounter', place, new Map(), () => 4);

    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell,
        result: { roll: total, faces: [4], target: null, targetFaces: [], outcome: null },
      }),
    );
  });
  test('names a roll by the dice cell name while keeping the formula as the roll expression', () => {
    // #given
    const layout: TemplateLayout = {
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    {
                      kind: 'dice',
                      formula: '1d20 <= 10',
                      name: 'Спасбросок STR',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // #when
    const prepared = prepareDiceRoll(
      layout,
      new Map(),
      'brok',
      { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 0, instanceId: null },
      new Map(),
    );

    // #then
    expect(prepared.isOk() ? prepared.value.cell : prepared).toEqual('Спасбросок STR');
  });
  test('adds the written chosen die to a named Nd field roll', () => {
    // #given
    const layout: TemplateLayout = {
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
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
                },
              ],
            },
          ],
        },
      ],
    };

    const records = new Map<string, VersionedRecord>([
      [
        'blk:brok',
        {
          k: 'blk:brok',
          d: { order: 0, cells: { attack_1_die: ['d8', 1, 'gm'] } },
          c: 1,
          a: 'gm',
          l: [1, 'seed'],
        },
      ],
    ]);

    // #when
    const prepared = prepareDiceRoll(
      layout,
      records,
      'brok',
      { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 1, instanceId: null },
      new Map(),
    );

    // #then
    expect(prepared.isOk() ? prepared.value.cell : prepared).toEqual('Урон атаки 1 (1d8)');
  });
  test('keeps a named Nd field roll label when the name equals the unresolved formula', () => {
    // #given
    const layout: TemplateLayout = {
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
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
                },
              ],
            },
          ],
        },
      ],
    };

    const records = new Map<string, VersionedRecord>([
      [
        'blk:brok',
        {
          k: 'blk:brok',
          d: { order: 0, cells: { damage: ['d8', 1, 'gm'] } },
          c: 1,
          a: 'gm',
          l: [1, 'seed'],
        },
      ],
    ]);

    // #when
    const prepared = prepareDiceRoll(
      layout,
      records,
      'brok',
      { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 1, instanceId: null },
      new Map(),
    );

    // #then
    expect(prepared.isOk() ? prepared.value.cell : prepared).toEqual('1d(damage) (1d8)');
  });
  test('names an empty formula field by its cell name', () => {
    // #given
    const layout: TemplateLayout = {
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'hp_max', name: 'HP, максимум' },
                    { kind: 'dice', formula: '1d20 <= hp_max' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // #when
    const prepared = prepareDiceRoll(
      layout,
      new Map([
        [
          'blk:brok',
          {
            k: 'blk:brok',
            d: { order: 0, cells: { hp_max: [10, 1, 'gm'] } },
            c: 1,
            a: 'gm',
            l: [1, 'seed'],
          },
        ],
      ]),
      'brok',
      { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 1, instanceId: null },
      new Map([['hp_max', { kind: 'text', text: '' }]]),
    );

    const result = prepared.isOk() ? prepared.value.roll(randomFaces(SEVEN)) : prepared;
    // #then
    expect(result).toEqual(Result.err({ code: 'field', field: 'HP, максимум' }));
  });
  test('uses the text a field shows over its record', () => {
    // #when
    const rolled = roll(STRENGTH, [['str', { kind: 'text', text: '16' }]]);
    // #then
    expect(rolled.isOk() && rolled.value.result.target).toBe(14);
  });
  test('uses the text a repeat row shows over its own instance', () => {
    // #when
    const rolled = roll(ATTACK, [['bonus', { kind: 'text', text: '5' }]]);
    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell: 'Атака',
        result: { roll: 26, faces: [7], target: null, targetFaces: [], outcome: null },
      }),
    );
  });
  test('rolls a dice cell in the second row of a repeat block from the fields of its whole block', () => {
    // #when
    const rolled = roll(SPELL_RANGE);
    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell: 'Дальность',
        result: { roll: 13, faces: [7], target: null, targetFaces: [], outcome: null },
      }),
    );
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
    expect(rolled).toEqual(Result.err({ code: 'field', field }));
  });
  test('gives the arithmetic error with no field for a division by zero', () => {
    // #when
    const rolled = roll({ ...STRENGTH, rowIndex: 2, cellIndex: 1 });
    // #then
    expect(rolled).toEqual(Result.err({ code: 'arithmetic' }));
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
    expect(rolled).toEqual(Result.err({ code: 'not-dice' }));
  });
});

describe('rollDiceCell across tabs', () => {
  // CAP-34: the dice cell sits on the second tab, the field it names on the first.
  const TABBED: TemplateLayout = {
    tabs: [
      {
        title: 'Основное',
        sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'str' }] }] }],
      },
      {
        title: 'Бой',
        sections: [
          { rows: [{ cells: [{ kind: 'text', text: 'Удар' }] }] },
          {
            rows: [
              {
                cells: [
                  { kind: 'text', text: 'Сила' },
                  { kind: 'dice', formula: '1d20 + str' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  test('reads a field of another tab of the same sheet', () => {
    // #given
    const place: DicePlace = {
      tabIndex: 1,
      sectionIndex: 1,
      rowIndex: 0,
      cellIndex: 1,
      instanceId: null,
    };

    // #when
    const rolled = rollDiceCell(TABBED, RECORDS, 'brok', place, new Map(), randomFaces(SEVEN));
    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell: 'Сила',
        result: { roll: 21, faces: [7], target: null, targetFaces: [], outcome: null },
      }),
    );
  });
  test('finds no dice cell at a section index counted across the whole sheet', () => {
    // #given: section 2 of the sheet is section 1 of the second tab.
    const place: DicePlace = {
      tabIndex: 0,
      sectionIndex: 2,
      rowIndex: 0,
      cellIndex: 1,
      instanceId: null,
    };

    // #when
    const rolled = rollDiceCell(TABBED, RECORDS, 'brok', place, new Map(), randomFaces(SEVEN));
    // #then
    expect(rolled).toEqual(Result.err({ code: 'not-dice' }));
  });
  test('rolls with the selected repeat-tab block instead of the root or a sibling', () => {
    // #given
    const layout: TemplateLayout = {
      tabs: [
        {
          repeat: { id: 'npc', nameField: 'name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Хиты' },
                    { kind: 'field', type: 'number', id: 'hp' },
                    { kind: 'dice', formula: '1d1 + hp' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const records = new Map<string, VersionedRecord>([
      ['blk:npc', fixtureRecord('blk:npc', { hp: 41 })],
      [
        'blk:npc:npc:a',
        fixtureRecord('blk:npc:npc:a', { order: 0, cells: { name: 'Alpha', hp: 7 } }),
      ],
      [
        'blk:npc:npc:b',
        fixtureRecord('blk:npc:npc:b', { order: 1, cells: { name: 'Beta', hp: 9 } }),
      ],
    ]);

    // #when
    const rolled = rollDiceCell(
      layout,
      records,
      'npc',
      { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: 'a' },
      new Map(),
      randomFaces(SEVEN),
    );

    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell: 'Хиты',
        result: { roll: 8, faces: [1], target: null, targetFaces: [], outcome: null },
      }),
    );
  });
  test('reads a field in another plain section of the selected repeat-tab block', () => {
    // #given
    const layout: TemplateLayout = {
      tabs: [
        {
          repeat: { id: 'npc', nameField: 'name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Хиты' },
                    { kind: 'field', type: 'number', id: 'hp' },
                  ],
                },
              ],
            },
            {
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Проверка хитов' },
                    { kind: 'dice', formula: '1d1 + hp' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const records = new Map<string, VersionedRecord>([
      ['blk:npc', fixtureRecord('blk:npc', { hp: 41 })],
      [
        'blk:npc:npc:a',
        fixtureRecord('blk:npc:npc:a', { order: 0, cells: { name: 'Alpha', hp: 7 } }),
      ],
      [
        'blk:npc:npc:b',
        fixtureRecord('blk:npc:npc:b', { order: 1, cells: { name: 'Beta', hp: 9 } }),
      ],
    ]);

    // #when
    const rolled = rollDiceCell(
      layout,
      records,
      'npc',
      { tabIndex: 0, sectionIndex: 1, rowIndex: 0, cellIndex: 1, instanceId: 'a' },
      new Map(),
      randomFaces(SEVEN),
    );

    // #then
    expect(rolled).toEqual(
      Result.ok({
        cell: 'Проверка хитов',
        result: { roll: 8, faces: [1], target: null, targetFaces: [], outcome: null },
      }),
    );
  });
});
