import { Result } from 'better-result';
import { describe, expect, test } from 'bun:test';
import { parseFormula, type FormulaFailure, type FormulaTree } from './formula';

describe('parseFormula', () => {
  test('parses a roll-under check into one comparison over two sums', () => {
    // #when
    const parsed = parseFormula('1d20 <= str - 2*str_tired');
    // #then
    expect(parsed).toEqual(
      Result.ok({
        kind: 'comparison',
        operator: '<=',
        left: { kind: 'dice', count: 1, sides: 20 },
        right: {
          kind: 'binary',
          operator: '-',
          left: { kind: 'field', id: 'str' },
          right: {
            kind: 'binary',
            operator: '*',
            left: { kind: 'integer', value: 2 },
            right: { kind: 'field', id: 'str_tired' },
          },
        },
      }),
    );
  });
  test('parses floor and ceil calls', () => {
    // #when
    const parsed = parseFormula('floor(a/2)+ceil(b)');
    // #then
    expect(parsed).toEqual(
      Result.ok({
        kind: 'binary',
        operator: '+',
        left: {
          kind: 'call',
          name: 'floor',
          argument: {
            kind: 'binary',
            operator: '/',
            left: { kind: 'field', id: 'a' },
            right: { kind: 'integer', value: 2 },
          },
        },
        right: { kind: 'call', name: 'ceil', argument: { kind: 'field', id: 'b' } },
      }),
    );
  });
  test('reads an upper-case D as a dice term', () => {
    // #when
    const parsed = parseFormula('2D6+1');
    // #then
    expect(parsed).toEqual(
      Result.ok({
        kind: 'binary',
        operator: '+',
        left: { kind: 'dice', count: 2, sides: 6 },
        right: { kind: 'integer', value: 1 },
      }),
    );
  });
  test.each<[string, unknown]>([
    ['1d(weapon_die)', { kind: 'dice-field', count: 1, id: 'weapon_die' }],
    ['2D( weapon_die )', { kind: 'dice-field', count: 2, id: 'weapon_die' }],
  ])('parses a dice-choice term %s', (formula, tree) => {
    // #when
    const parsed = parseFormula(formula);
    const actual: unknown = parsed;
    // #then
    expect(actual).toEqual(Result.ok(tree));
  });
  test('groups subtraction from the left and lets parentheses override it', () => {
    // #when
    const parsed = [parseFormula('a - b - c'), parseFormula('a - (b - c)')];
    // #then
    expect(parsed).toEqual([
      Result.ok({
        kind: 'binary',
        operator: '-',
        left: {
          kind: 'binary',
          operator: '-',
          left: { kind: 'field', id: 'a' },
          right: { kind: 'field', id: 'b' },
        },
        right: { kind: 'field', id: 'c' },
      }),
      Result.ok({
        kind: 'binary',
        operator: '-',
        left: { kind: 'field', id: 'a' },
        right: {
          kind: 'binary',
          operator: '-',
          left: { kind: 'field', id: 'b' },
          right: { kind: 'field', id: 'c' },
        },
      }),
    ]);
  });
  test.each<[string, FormulaTree]>([
    ['1d1', { kind: 'dice', count: 1, sides: 1 }],
    ['100d1000', { kind: 'dice', count: 100, sides: 1000 }],
  ])('accepts the dice limit %s', (formula, tree) => {
    // #when
    const parsed = parseFormula(formula);
    // #then
    expect(parsed).toEqual(Result.ok(tree));
  });
  test('accepts a formula of exactly 200 characters', () => {
    // #given
    const formula = `a+${' '.repeat(197)}b`;
    // #when
    const parsed = parseFormula(formula);
    // #then
    expect(parsed).toEqual(
      Result.ok({
        kind: 'binary',
        operator: '+',
        left: { kind: 'field', id: 'a' },
        right: { kind: 'field', id: 'b' },
      }),
    );
  });
  test('refuses a formula over 200 characters', () => {
    // #given
    const formula = `a+${' '.repeat(198)}b`;
    // #when
    const parsed = parseFormula(formula);
    // #then
    expect(parsed).toEqual(Result.err('too-long'));
  });
  test.each<[string, FormulaFailure]>([
    ['0d6', 'dice-out-of-range'],
    ['101d6', 'dice-out-of-range'],
    ['1d0', 'dice-out-of-range'],
    ['1d1001', 'dice-out-of-range'],
    ['sqrt(4)', 'unknown-function'],
    ['str(1)', 'unknown-function'],
    ['', 'syntax-error'],
    ['1 +', 'syntax-error'],
    ['(1', 'syntax-error'],
    ['1)', 'syntax-error'],
    ['a b', 'syntax-error'],
    ['-1', 'syntax-error'],
    ['a < b < c', 'syntax-error'],
    ['(a < b)', 'syntax-error'],
    ['floor(a < b)', 'syntax-error'],
    ['d20', 'syntax-error'],
    ['D1', 'syntax-error'],
    ['floor', 'syntax-error'],
    ['ceil + 1', 'syntax-error'],
    ['constructor', 'syntax-error'],
    ['1d6x', 'syntax-error'],
    ['1d6_', 'syntax-error'],
    ['2abc', 'syntax-error'],
    ['1d', 'syntax-error'],
    ['1d(2)', 'syntax-error'],
    ['1d()', 'syntax-error'],
    ['1d(a+b)', 'syntax-error'],
    ['1d(d6)', 'syntax-error'],
    ['1d(D20)', 'syntax-error'],
    ['1d(floor)', 'syntax-error'],
    ['1d(constructor)', 'syntax-error'],
    ['a % 2', 'syntax-error'],
    ['a == 2', 'syntax-error'],
    ['9007199254740992', 'syntax-error'],
  ])('refuses %j with %s', (formula, failure) => {
    // #when
    const parsed = parseFormula(formula);
    // #then
    expect(parsed).toEqual(Result.err(failure));
  });
  test('accepts the largest safe integer', () => {
    // #when
    const parsed = parseFormula('9007199254740991');
    // #then
    expect(parsed).toEqual(Result.ok({ kind: 'integer', value: 9007199254740991 }));
  });
});
