import { Result } from 'better-result';
import { describe, expect, test } from 'bun:test';
import { dicePlusDice, dicePlusFaces, dicePlusTarget } from '@/core/dice-plus';
import type { DiceTerm } from '@/core/formula-evaluate';
import type { JsonValue } from '@/core/json';

const D20: DiceTerm[] = [{ count: 1, sides: 20 }];

const VOLLEY: DiceTerm[] = [
  { count: 2, sides: 6 },
  { count: 1, sides: 8 },
];

// A result as the Dice+ protocol sends it, from groups of `[diceType, faces]`.
function result(groups: [string, number[]][]): JsonValue {
  return {
    rollId: 'r1',
    playerId: 'p1',
    playerName: 'Лиза',
    rollTarget: 'everyone',
    result: {
      totalValue: 0,
      rollSummary: '',
      groups: groups.map(([diceType, faces]) => ({
        description: diceType,
        diceType,
        dice: faces.map((value) => ({ value, kept: true })),
        total: 0,
        isNegative: false,
      })),
    },
  };
}

function terms(...counts: [number, number][]): DiceTerm[] {
  return counts.map(([count, sides]) => ({ count, sides }));
}

describe('dicePlusDice', () => {
  test.each<[string, DiceTerm[], string]>([
    ['one die', D20, '1d20'],
    ['terms out of the dice set order, in its order', terms([1, 20], [1, 4]), '1d4+1d20'],
    ['same-sided terms, merged', terms([2, 6], [1, 8], [1, 6]), '3d6+1d8'],
    [
      'every supported die',
      terms([1, 20], [1, 12], [1, 10], [1, 8], [1, 6], [1, 4]),
      '1d4+1d6+1d8+1d10+1d12+1d20',
    ],
    ['20 dice in one term', terms([20, 6]), '20d6'],
    ['50 dice in all', terms([20, 6], [20, 6], [10, 6]), '50d6'],
  ])('writes %s as one positive notation', (_case, given, notation) => {
    // #when
    const dice = dicePlusDice(given);
    // #then
    expect(dice?.notation).toBe(notation);
  });
  test.each<[string, DiceTerm[]]>([
    ['no dice', []],
    ['a d3', terms([1, 3])],
    ['a d100, which dicex reports as tens only', terms([1, 100])],
    ['a d1000', terms([1, 1000])],
    ['a d2 beside a d20', terms([1, 20], [1, 2])],
    ['21 dice in one term', terms([21, 6])],
    ['30 dice in one term', terms([30, 6])],
    ['51 dice in all', terms([20, 6], [20, 6], [11, 6])],
    ['60 dice in all', terms([20, 6], [20, 6], [20, 6])],
  ])('leaves %s to a local roll', (_case, given) => {
    // #when
    const dice = dicePlusDice(given);
    // #then
    expect(dice).toBeNull();
  });
});

describe('dicePlusTarget', () => {
  test('shows a roll of a visible sheet to everyone and of a hidden sheet to GM clients only', () => {
    // #when
    const targets = [dicePlusTarget(false), dicePlusTarget(true)];
    // #then
    expect(targets).toEqual(['everyone', 'gm_only']);
  });
});

describe('dicePlusFaces', () => {
  test('takes the faces of every group in order', () => {
    // #when
    const faces = dicePlusFaces(
      VOLLEY,
      result([
        ['d6', [6, 1]],
        ['d8', [8]],
      ]),
    );

    // #then
    expect(faces).toEqual(
      Result.ok([
        { sides: 6, face: 6 },
        { sides: 6, face: 1 },
        { sides: 8, face: 8 },
      ]),
    );
  });
  test('gives the faces back in tree order for groups in dice set order', () => {
    // #when: `1d20 + 1d4` goes as `1d4+1d20`.
    const faces = dicePlusFaces(
      terms([1, 20], [1, 4]),
      result([
        ['d4', [3]],
        ['d20', [17]],
      ]),
    );

    // #then
    expect(faces).toEqual(
      Result.ok([
        { sides: 20, face: 17 },
        { sides: 4, face: 3 },
      ]),
    );
  });
  test('splits a merged group between same-sided terms in their order', () => {
    // #when: `2d6 + 1d8 - 1d6` goes as `3d6+1d8`.
    const faces = dicePlusFaces(
      terms([2, 6], [1, 8], [1, 6]),
      result([
        ['d6', [1, 2, 6]],
        ['d8', [8]],
      ]),
    );

    // #then
    expect(faces).toEqual(
      Result.ok([
        { sides: 6, face: 1 },
        { sides: 6, face: 2 },
        { sides: 8, face: 8 },
        { sides: 6, face: 6 },
      ]),
    );
  });
  test('reads the 0 dicex reports for a d10 that shows 10 as 10', () => {
    // #when
    const faces = dicePlusFaces(terms([2, 10]), result([['d10', [0, 7]]]));
    // #then
    expect(faces).toEqual(
      Result.ok([
        { sides: 10, face: 10 },
        { sides: 10, face: 7 },
      ]),
    );
  });
  test.each<[string, DiceTerm[], JsonValue]>([
    ['one group missing', VOLLEY, result([['d6', [6, 1]]])],
    [
      'a group too many',
      VOLLEY,
      result([
        ['d6', [6, 1]],
        ['d8', [8]],
        ['d4', [2]],
      ]),
    ],
    [
      'groups out of order',
      VOLLEY,
      result([
        ['d8', [8]],
        ['d6', [6, 1]],
      ]),
    ],
    [
      'too few dice in a group',
      VOLLEY,
      result([
        ['d6', [6]],
        ['d8', [8]],
      ]),
    ],
    [
      'too many dice in a group',
      VOLLEY,
      result([
        ['d6', [6, 1, 2]],
        ['d8', [8]],
      ]),
    ],
    [
      'a face of 0',
      VOLLEY,
      result([
        ['d6', [0, 1]],
        ['d8', [8]],
      ]),
    ],
    [
      'a face past the sides',
      VOLLEY,
      result([
        ['d6', [7, 1]],
        ['d8', [8]],
      ]),
    ],
    [
      'a face that is not whole',
      VOLLEY,
      result([
        ['d6', [2.5, 1]],
        ['d8', [8]],
      ]),
    ],
    ['no result', D20, { rollId: 'r1' }],
    ['no groups', D20, { rollId: 'r1', result: { totalValue: 3 } }],
    [
      'a face that is not a number',
      D20,
      { rollId: 'r1', result: { groups: [{ diceType: 'd20', dice: [{ value: '5' }] }] } },
    ],
  ])('refuses a result with %s', (_case, given, data) => {
    // #when
    const faces = dicePlusFaces(given, data);
    // #then
    expect(faces.isOk()).toBe(false);
  });
});
