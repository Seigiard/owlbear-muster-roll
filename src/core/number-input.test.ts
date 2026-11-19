import { Result } from 'better-result';
import { describe, expect, test } from 'bun:test';
import { parseNumberInput } from './number-input';

describe('parseNumberInput', () => {
  test.each<[string, number]>([
    ['1,5', 1.5],
    ['-2', -2],
    ['+3', 3],
    ['.5', 0.5],
    [',5', 0.5],
    ['12', 12],
    [' 12 ', 12],
    ['1.', 1],
  ])('reads %p as %p', (text, value) => {
    // #when
    const parsed = parseNumberInput(text);
    // #then
    expect(parsed).toEqual(Result.ok(value));
  });
  test('reads an empty text as a clear', () => {
    // #when
    const parsed = parseNumberInput('');
    // #then
    expect(parsed).toEqual(Result.ok(null));
  });
  test.each<[string, string]>([
    ['an exponent', '1e3'],
    ['an exponent past the largest number', '1e999'],
    ['spaces only', '   '],
    ['letters', 'abc'],
    ['a sign alone', '-'],
    ['a point alone', '.'],
    ['two signs', '+-1'],
    ['a space inside', '1 000'],
    ['two decimal points', '1.2.3'],
    ['digits past the largest number', '9'.repeat(400)],
  ])('refuses %s', (_name, text) => {
    // #when
    const parsed = parseNumberInput(text);
    // #then
    expect(parsed).toEqual(Result.err('not-a-number'));
  });
});
