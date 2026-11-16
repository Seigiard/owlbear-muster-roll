import { describe, expect, test } from 'bun:test';
import { parseFormula, type FormulaTree } from '@/core/formula';
import {
  evaluateFormula,
  formulaDiceTerms,
  formulaFieldLookup,
  listedFaces,
  randomFaces,
  type DieFace,
  type EvaluationFailure,
  type FieldLookup,
  type RandomSource,
  type RollResult,
} from '@/core/formula-evaluate';
import type { TemplateLayout, TemplateRowPlace } from '@/core/preset';
import type { Result } from '@/core/result';
import type { FieldValues } from '@/core/sheet-values';

// Sections: 0 the sheet grid, 1 attacks (repeat), 2 inventory (repeat), 3 a dice row with no field.
// `bonus` sits in the attack row and in the grid row named `level`. `weight` only in inventory.
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
              ],
            },
            { cells: [{ kind: 'field', type: 'number', id: 'str_tired' }] },
            { cells: [{ kind: 'field', type: 'number', id: 'dex' }] },
            { cells: [{ kind: 'field', type: 'number', id: 'big' }] },
            { cells: [{ kind: 'field', type: 'check', id: 'bless' }] },
            { cells: [{ kind: 'field', type: 'text', id: 'note' }] },
            {
              cells: [
                { kind: 'field', type: 'number', id: 'level' },
                { kind: 'field', type: 'number', id: 'bonus' },
              ],
            },
          ],
        },
        {
          repeat: { id: 'attack', nameField: 'attack' },
          rows: [
            {
              cells: [
                { kind: 'field', type: 'text', id: 'attack' },
                { kind: 'field', type: 'number', id: 'bonus' },
                { kind: 'dice', formula: '1d20+bonus' },
              ],
            },
          ],
        },
        {
          repeat: { id: 'item', nameField: 'item' },
          rows: [
            {
              cells: [
                { kind: 'field', type: 'text', id: 'item' },
                { kind: 'field', type: 'number', id: 'weight' },
              ],
            },
          ],
        },
        { rows: [{ cells: [{ kind: 'dice', formula: '1d20 <= str - 2*str_tired' }] }] },
      ],
    },
  ],
};

const DICE_ROW: TemplateRowPlace = { tabIndex: 0, sectionIndex: 3, rowIndex: 0 };
const ATTACK_ROW: TemplateRowPlace = { tabIndex: 0, sectionIndex: 1, rowIndex: 0 };
const LEVEL_ROW: TemplateRowPlace = { tabIndex: 0, sectionIndex: 0, rowIndex: 6 };
const NO_VALUES: FieldValues = new Map();

// plain rows of the sheet by row id. `weight` here belongs to no sheet row, so it must never be
// read. `old` is a row a preset change removed from the template.
const SHEET: ReadonlyMap<string, FieldValues> = new Map<string, FieldValues>([
  ['str', new Map([['str', 14]])],
  ['str_tired', new Map([['str_tired', 2]])],
  ['dex', new Map([['dex', 3]])],
  ['big', new Map([['big', Number.MAX_SAFE_INTEGER]])],
  [
    'level',
    new Map([
      ['level', 4],
      ['bonus', 2],
    ]),
  ],
  ['weight', new Map([['weight', 9]])],
  ['old', new Map([['old', 5]])],
]);

const ATTACK_INSTANCE: FieldValues = new Map<string, string | number>([
  ['attack', 'Меч'],
  ['bonus', 5],
]);

function sheetWith(rowId: string, values: FieldValues): (id: string) => FieldValues {
  return (id) => (id === rowId ? values : (SHEET.get(id) ?? NO_VALUES));
}

function sheetRow(rowId: string): FieldValues {
  return SHEET.get(rowId) ?? NO_VALUES;
}

// Returns the given values in order, so each face is known before the roll.
function sequence(values: readonly number[]): RandomSource {
  let index = 0;

  return () => {
    const value = values[index];
    index += 1;

    if (value === undefined) {
      throw new Error('The test source ran out of values');
    }

    return value;
  };
}

function treeOf(formula: string): FormulaTree {
  const parsed = parseFormula(formula);

  if (!parsed.ok) {
    throw new Error(`Test formula does not parse: ${formula}`);
  }

  return parsed.value;
}

function evaluateAt(
  formula: string,
  lookup: FieldLookup,
  randoms: readonly number[] = [],
): Result<RollResult, EvaluationFailure> {
  return evaluateFormula(treeOf(formula), lookup, randomFaces(sequence(randoms)));
}

const DICE_ROW_LOOKUP = formulaFieldLookup(TEMPLATE, DICE_ROW, sheetRow, NO_VALUES);

// Field values come from JSON and are finite, so only an injected lookup can yield these.
const NAN_LOOKUP: FieldLookup = () => Number.NaN;
const INFINITY_LOOKUP: FieldLookup = () => Number.POSITIVE_INFINITY;

describe('evaluateFormula', () => {
  test('a roll-under check that holds is a success against the computed target', () => {
    // #given 0.3 on a d20 shows 7; the target is 14 - 2*2 = 10
    // #when
    const result = evaluateAt('1d20 <= str - 2*str_tired', DICE_ROW_LOOKUP, [0.3]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 7, faces: [7], target: 10, targetFaces: [], outcome: 'success' },
    });
  });
  test('a roll-under check that does not hold is a failure', () => {
    // #given 0.7 on a d20 shows 15
    // #when
    const result = evaluateAt('1d20 <= str - 2*str_tired', DICE_ROW_LOOKUP, [0.7]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 15, faces: [15], target: 10, targetFaces: [], outcome: 'failure' },
    });
  });
  test.each<[string, 'success' | 'failure']>([
    ['<=', 'success'],
    ['<', 'failure'],
    ['>=', 'success'],
    ['>', 'failure'],
  ])('a roll equal to its target under %s is a %s', (operator, outcome) => {
    // #given 0.45 on a d20 shows 10
    // #when
    const result = evaluateAt(`1d20 ${operator} 10`, DICE_ROW_LOOKUP, [0.45]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 10, faces: [10], target: 10, targetFaces: [], outcome },
    });
  });
  test('a formula with no comparison is all roll, with no target and no outcome', () => {
    // #given 0.5 and 0.7 on a d6 show 4 and 5; dex is 3
    // #when
    const result = evaluateAt('2d6 + dex', DICE_ROW_LOOKUP, [0.5, 0.7]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 12, faces: [4, 5], target: null, targetFaces: [], outcome: null },
    });
  });
  test.each<[string, number]>([
    ['floor(str / 3)', 4],
    ['ceil(str / 3)', 5],
    ['str / 4', 3.5],
  ])('%s gives %p, as only floor and ceil round', (formula, expected) => {
    // #when
    const result = evaluateAt(formula, DICE_ROW_LOOKUP);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: expected, faces: [], target: null, targetFaces: [], outcome: null },
    });
  });
  test('rolls every die in tree order and reports the roll and target faces apart', () => {
    // #given faces floor(r * M) + 1: d10 0 -> 1, d10 0.99 -> 10, d4 0.5 -> 3, d6 0.25 -> 2
    // #when
    const result = evaluateAt('2d10 + 1d4 < 1d6', DICE_ROW_LOOKUP, [0, 0.99, 0.5, 0.25]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 14, faces: [1, 10, 3], target: 2, targetFaces: [2], outcome: 'failure' },
    });
  });
  test.each<[string, FieldValues, number]>([
    ['checked', new Map([['bless', true]]), 8],
    ['unchecked', new Map([['bless', false]]), 7],
    ['with no key', NO_VALUES, 7],
  ])('a check field %s counts toward the roll', (_case, blessRow, expected) => {
    // #given 0.3 on a d20 shows 7
    const lookup = formulaFieldLookup(TEMPLATE, DICE_ROW, sheetWith('bless', blessRow), NO_VALUES);
    // #when
    const result = evaluateAt('1d20 + bless', lookup, [0.3]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: expected, faces: [7], target: null, targetFaces: [], outcome: null },
    });
  });
  test.each<[string, string, FieldValues]>([
    ['an empty number field', 'str', NO_VALUES],
    ['an empty text field', 'note', NO_VALUES],
    ['a text field of letters', 'note', new Map([['note', 'abc']])],
    ['a text field with trailing letters', 'note', new Map([['note', '12abc']])],
  ])('%s gives the field error naming it', (_case, rowId, values) => {
    // #given
    const lookup = formulaFieldLookup(TEMPLATE, DICE_ROW, sheetWith(rowId, values), NO_VALUES);
    // #when
    const result = evaluateAt(`1d20 + ${rowId}`, lookup, [0.3]);
    // #then
    expect(result).toEqual({ ok: false, error: { code: 'field', fieldId: rowId } });
  });
  test.each<[string, number]>([
    ['1,5', 3],
    [' 7 ', 14],
  ])('a text field holding %p counts as the number the 1.9 parser reads', (text, expected) => {
    // #given
    const note = new Map([['note', text]]);
    const lookup = formulaFieldLookup(TEMPLATE, DICE_ROW, sheetWith('note', note), NO_VALUES);
    // #when
    const result = evaluateAt('note * 2', lookup);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: expected, faces: [], target: null, targetFaces: [], outcome: null },
    });
  });
  test.each<[string, string]>([
    ['an id on no row of the sheet', 'nope'],
    ['an id a preset change removed, though its old value remains', 'old'],
  ])('%s gives the field error naming it', (_case, id) => {
    // #when
    const result = evaluateAt(`1d20 + ${id}`, DICE_ROW_LOOKUP, [0.3]);
    // #then
    expect(result).toEqual({ ok: false, error: { code: 'field', fieldId: id } });
  });
  test.each<[string, TemplateRowPlace, FieldValues]>([
    ['a non-repeat row', DICE_ROW, NO_VALUES],
    ['another repeat section', ATTACK_ROW, ATTACK_INSTANCE],
  ])('a repeat field used from %s gives the field error naming it', (_case, from, ownRow) => {
    // #given
    const lookup = formulaFieldLookup(TEMPLATE, from, sheetRow, ownRow);
    // #when
    const result = evaluateAt('1d20 + weight', lookup, [0.3]);
    // #then
    expect(result).toEqual({ ok: false, error: { code: 'field', fieldId: 'weight' } });
  });
  test('an id in its own repeat row reads that row over the sheet field of the same id', () => {
    // #given the attack row holds bonus 5, the sheet grid bonus 2
    const lookup = formulaFieldLookup(TEMPLATE, ATTACK_ROW, sheetRow, ATTACK_INSTANCE);
    // #when
    const result = evaluateAt('1d20 + bonus', lookup, [0.3]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 12, faces: [7], target: null, targetFaces: [], outcome: null },
    });
  });
  test('a dice cell in the second row of a repeat block reads a field from the first row of its block', () => {
    // #given a two-row repeat section; the block holds bonus 3 in row one and range 2 in row two
    const layout: TemplateLayout = {
      tabs: [
        {
          sections: [
            {
              repeat: { id: 'attack', nameField: 'attack' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'attack' },
                    { kind: 'field', type: 'number', id: 'bonus' },
                  ],
                },
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'range' },
                    { kind: 'dice', formula: '1d20+bonus+range' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const block: FieldValues = new Map<string, number | string>([
      ['attack', 'Лук'],
      ['bonus', 3],
      ['range', 2],
    ]);

    const lookup = formulaFieldLookup(
      layout,
      { tabIndex: 0, sectionIndex: 0, rowIndex: 1 },
      sheetRow,
      block,
    );

    // #when
    const result = evaluateAt('1d20 + bonus + range', lookup, [0.3]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 12, faces: [7], target: null, targetFaces: [], outcome: null },
    });
  });
  test('a repeat row reads a sheet field from the row record that holds it', () => {
    // #given `level` 4 shares its row record with the sheet's `bonus`
    const lookup = formulaFieldLookup(TEMPLATE, ATTACK_ROW, sheetRow, ATTACK_INSTANCE);
    // #when
    const result = evaluateAt('str + level', lookup);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 18, faces: [], target: null, targetFaces: [], outcome: null },
    });
  });
  test('a division by zero gives the arithmetic error with no field name', () => {
    // #when
    const result = evaluateAt('str / (dex - dex)', DICE_ROW_LOOKUP);
    // #then
    expect(result).toEqual({ ok: false, error: { code: 'arithmetic' } });
  });
  test.each<[string]>([['1 <= big * big'], ['big + 1'], ['floor(1 / (big * big))']])(
    '%s leaves the safe integer range at some step and gives the arithmetic error',
    (formula) => {
      // #given big is Number.MAX_SAFE_INTEGER
      // #when
      const result = evaluateAt(formula, DICE_ROW_LOOKUP);
      // #then
      expect(result).toEqual({ ok: false, error: { code: 'arithmetic' } });
    },
  );
  test.each<[string, FieldLookup]>([
    ['NaN', NAN_LOOKUP],
    ['Infinity', INFINITY_LOOKUP],
  ])('a %s value gives the arithmetic error', (_case, lookup) => {
    // #when
    const result = evaluateAt('1d20 + str', lookup, [0.3]);
    // #then
    expect(result).toEqual({ ok: false, error: { code: 'arithmetic' } });
  });
  test.each<[string, EvaluationFailure]>([
    ['1d20 <= nope', { code: 'field', fieldId: 'nope' }],
    ['floor(nope)', { code: 'field', fieldId: 'nope' }],
    ['ceil(str / (dex - dex))', { code: 'arithmetic' }],
  ])('%s fails inside a comparison or a call', (formula, error) => {
    // #when
    const result = evaluateAt(formula, DICE_ROW_LOOKUP, [0.3]);
    // #then
    expect(result).toEqual({ ok: false, error });
  });
  test('a sheet field read from a dice row comes from the row record that holds it', () => {
    // #given `bonus` 2 is the second field of the grid row named `level`
    // #when
    const result = evaluateAt('bonus', DICE_ROW_LOOKUP);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 2, faces: [], target: null, targetFaces: [], outcome: null },
    });
  });
  test('a non-repeat row with no ownRow reads its own fields from its row record', () => {
    // #given the grid row `level` holds level 4 and bonus 2
    const lookup = formulaFieldLookup(TEMPLATE, LEVEL_ROW, sheetRow);
    // #when
    const result = evaluateAt('level + bonus', lookup);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 6, faces: [], target: null, targetFaces: [], outcome: null },
    });
  });
  test('a number field holding the text 12 counts 12', () => {
    // #given
    const str = new Map([['str', '12']]);
    const lookup = formulaFieldLookup(TEMPLATE, DICE_ROW, sheetWith('str', str));
    // #when
    const result = evaluateAt('str', lookup);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 12, faces: [], target: null, targetFaces: [], outcome: null },
    });
  });
  test('a number field holding the text abc gives the field error naming it', () => {
    // #given
    const str = new Map([['str', 'abc']]);
    const lookup = formulaFieldLookup(TEMPLATE, DICE_ROW, sheetWith('str', str));
    // #when
    const result = evaluateAt('str', lookup);
    // #then
    expect(result).toEqual({ ok: false, error: { code: 'field', fieldId: 'str' } });
  });
  test('a check field holding the number 1 counts 0, as only true checks it', () => {
    // #given
    const bless = new Map([['bless', 1]]);
    const lookup = formulaFieldLookup(TEMPLATE, DICE_ROW, sheetWith('bless', bless));
    // #when
    const result = evaluateAt('bless', lookup);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 0, faces: [], target: null, targetFaces: [], outcome: null },
    });
  });
  test.each<[string, number, number]>([
    ['1', 1, 6],
    ['0.9999999', 0.9999999, 6],
    ['-0.5', -0.5, 1],
    ['NaN', Number.NaN, 1],
  ])('a source value of %s on a d6 clamps the face into 1 to 6', (_case, random, face) => {
    // #when
    const result = evaluateAt('1d6', DICE_ROW_LOOKUP, [random]);
    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: face, faces: [face], target: null, targetFaces: [], outcome: null },
    });
  });
});

describe('formulaDiceTerms', () => {
  test.each<
    [
      string,
      string,
      {
        count: number;
        sides: number;
      }[],
    ]
  >([
    ['one die', '1d20 + str', [{ count: 1, sides: 20 }]],
    [
      'several terms, signs dropped',
      '2d6 + 1d8 - 1d4',
      [
        { count: 2, sides: 6 },
        { count: 1, sides: 8 },
        { count: 1, sides: 4 },
      ],
    ],
    [
      'both sides of a comparison, inside a call',
      '1d20 <= floor(3d6 / 2) - 1d4',
      [
        { count: 1, sides: 20 },
        { count: 3, sides: 6 },
        { count: 1, sides: 4 },
      ],
    ],
    ['no dice', 'str + 2', []],
  ])('lists %s in tree order', (_case, formula, terms) => {
    // #when
    const listed = formulaDiceTerms(treeOf(formula));
    // #then
    expect(listed).toEqual(terms);
  });
});

describe('evaluateFormula with listed faces', () => {
  test('takes each face in tree order and applies the signs itself', () => {
    // #when: 6 + 5 + 8 - 3.
    const result = evaluateFormula(
      treeOf('2d6 + 1d8 - 1d4'),
      DICE_ROW_LOOKUP,
      listedFaces(dieFaces([6, 6], [5, 6], [8, 8], [3, 4])),
    );

    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 16, faces: [6, 5, 8, 3], target: null, targetFaces: [], outcome: null },
    });
  });
  test('compares a listed face with the target', () => {
    // #when: the target is 14 - 2 * 2 = 10.
    const result = evaluateFormula(
      treeOf('1d20 <= str - 2*str_tired'),
      DICE_ROW_LOOKUP,
      listedFaces(dieFaces([15, 20])),
    );

    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 15, faces: [15], target: 10, targetFaces: [], outcome: 'failure' },
    });
  });
  test('gives target-side dice the faces after the roll side', () => {
    // #when
    const result = evaluateFormula(
      treeOf('1d20 > 1d6 + 2'),
      DICE_ROW_LOOKUP,
      listedFaces(dieFaces([4, 20], [5, 6])),
    );

    // #then
    expect(result).toEqual({
      ok: true,
      value: { roll: 4, faces: [4], target: 7, targetFaces: [5], outcome: 'failure' },
    });
  });
  test.each<[string, [number, number][]]>([
    [
      'a face for other sides',
      [
        [4, 20],
        [5, 8],
      ],
    ],
    ['a list that runs out', [[4, 20]]],
  ])('throws on %s, as only a broken caller can give one', (_case, faces) => {
    // #when
    const evaluate = (): void => {
      evaluateFormula(treeOf('1d20 > 1d6 + 2'), DICE_ROW_LOOKUP, listedFaces(dieFaces(...faces)));
    };

    // #then
    expect(evaluate).toThrow();
  });
});

// Faces as `[face, sides]` pairs.
function dieFaces(...faces: [number, number][]): DieFace[] {
  return faces.map(([face, sides]) => ({ sides, face }));
}
