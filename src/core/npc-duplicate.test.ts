import { describe, expect, test } from 'bun:test';

import { duplicateNames, isDuplicateCount, parseDuplicateCount } from './npc-duplicate';

describe('duplicateNames', () => {
  test('continues a numbered source with no namesakes from its own number', () => {
    // #when
    const names = duplicateNames('Скелет 1', ['Скелет 1'], 9);

    // #then
    expect(names).toEqual({
      ok: true,
      value: [
        'Скелет 2',
        'Скелет 3',
        'Скелет 4',
        'Скелет 5',
        'Скелет 6',
        'Скелет 7',
        'Скелет 8',
        'Скелет 9',
        'Скелет 10',
      ],
    });
  });

  test('continues from the highest number among NPCs of the same base', () => {
    // #when
    const names = duplicateNames('Скелет 1', ['Скелет 1', 'Скелет 7', 'Гоблин 12'], 2);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 8', 'Скелет 9'] });
  });

  test('numbers an unnumbered source from 1 and leaves its own name out', () => {
    // #when
    const names = duplicateNames('Скелет', ['Скелет'], 2);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 1', 'Скелет 2'] });
  });

  test('numbers an unnumbered source after a numbered namesake', () => {
    // #when
    const names = duplicateNames('Скелет', ['Скелет', 'Скелет 3'], 1);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 4'] });
  });

  test('does not count a name whose base only starts like the source base', () => {
    // #when
    const names = duplicateNames('Скелет 1', ['Скелет 1', 'Скелет-лучник 3', 'Скелеты 5'], 1);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 2'] });
  });

  test('does not count a name with the number glued on or with text after it', () => {
    // #when
    const names = duplicateNames('Скелет 1', ['Скелет 1', 'Скелет5', 'Скелет 6 б'], 1);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 2'] });
  });

  test('takes only the last number off, so "Отряд 2 1" has the base "Отряд 2"', () => {
    // #when
    const names = duplicateNames('Отряд 2 1', ['Отряд 2 1', 'Отряд 5'], 1);

    // #then
    expect(names).toEqual({ ok: true, value: ['Отряд 2 2'] });
  });

  test('reads a number with leading zeros by its value', () => {
    // #when
    const names = duplicateNames('Скелет 007', ['Скелет 007'], 1);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 8'] });
  });

  test('counts a number past the precision of a double exactly', () => {
    // #when
    const names = duplicateNames('Скелет 99999999999999999999', ['Скелет 99999999999999999999'], 1);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 100000000000000000000'] });
  });

  test('keeps a 97-letter base whole when it fits 100 characters with the new number', () => {
    // #given: 97 letters, a space and "9" make 99 characters.
    const base = 'Щ'.repeat(97);

    // #when
    const names = duplicateNames(`${base} 9`, [`${base} 9`], 2);

    // #then: "10" and "11" need 3 more characters with the space, so the base keeps 97.
    expect(names).toEqual({ ok: true, value: [`${'Щ'.repeat(97)} 10`, `${'Щ'.repeat(97)} 11`] });
  });

  test('cuts the base by one letter when the number gains a digit at the limit', () => {
    // #given: 98 letters, a space and "9" make 100 characters.
    const base = 'Щ'.repeat(98);

    // #when
    const names = duplicateNames(`${base} 9`, [`${base} 9`], 1);

    // #then
    expect(names).toEqual({ ok: true, value: [`${'Щ'.repeat(97)} 10`] });
  });

  test('counts a source number written after two spaces with its single-spaced namesakes', () => {
    // #when
    const names = duplicateNames('Скелет  1', ['Скелет  1', 'Скелет 5'], 1);

    // #then
    expect(names).toEqual({ ok: true, value: ['Скелет 6'] });
  });

  test('skips a number whose shortened name an NPC already has, so a second duplicate repeats none', () => {
    // #given: 98 letters, a space and "9" make 100 characters, and a first duplicate made "… 10".
    const source = `${'Щ'.repeat(98)} 9`;

    // #when
    const names = duplicateNames(source, [source, `${'Щ'.repeat(97)} 10`], 1);

    // #then
    expect(names).toEqual({ ok: true, value: [`${'Щ'.repeat(97)} 11`] });
  });

  test('cuts a long base between graphemes, so a letter keeps its combining mark', () => {
    // #given: "А", 49 letters "й" written as "и" and a combining breve, and "Б": 100 code points.
    const source = `А${'и\u0306'.repeat(49)}Б`;

    // #when: " 1" leaves 98 code points, which would end inside the 49th "й".
    const names = duplicateNames(source, [source], 1);

    // #then
    expect(names).toEqual({ ok: true, value: [`А${'и\u0306'.repeat(48)} 1`] });
  });

  test('fails when the number alone cannot fit a name', () => {
    // #given: a stored name longer than the limit, with a 100-digit number.
    const source = `Скелет ${'9'.repeat(100)}`;

    // #when
    const names = duplicateNames(source, [source], 1);

    // #then
    expect(names).toEqual({ ok: false, error: 'name-too-long' });
  });

  test('counts a letter outside the BMP once when it shortens the base', () => {
    // #given: 99 skulls, each two code units, as an unnumbered name.
    const base = '💀'.repeat(99);

    // #when
    const names = duplicateNames(base, [base], 1);

    // #then
    expect(names).toEqual({ ok: true, value: [`${'💀'.repeat(98)} 1`] });
  });

  test('drops the spaces a cut leaves at the end of the base', () => {
    // #given: 100 characters with no number. " 1" leaves room for 98, and the 98th is the space.
    const base = `${'Щ'.repeat(96)}А ${'Щ'.repeat(2)}`;

    // #when
    const names = duplicateNames(base, [base], 1);

    // #then
    expect(names).toEqual({ ok: true, value: [`${'Щ'.repeat(96)}А 1`] });
  });
});

describe('parseDuplicateCount', () => {
  test.each([
    ['1', 1],
    ['9', 9],
    ['50', 50],
    [' 3 ', 3],
    ['07', 7],
  ])('accepts %j as %d', (text, count) => {
    // #when
    const parsed = parseDuplicateCount(text);

    // #then
    expect(parsed).toEqual({ ok: true, value: count });
  });

  test.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['not a number', 'девять'],
    ['a fraction with a point', '1.5'],
    ['a fraction with a comma', '1,5'],
    ['a whole number written with a point', '2.0'],
    ['zero', '0'],
    ['negative', '-1'],
    ['signed', '+3'],
    ['above 50', '51'],
    ['far above 50', '99999999999999999999999'],
    ['an exponent', '1e1'],
    ['digits outside ASCII', '٣'],
  ])('refuses %s', (_name, text) => {
    // #when
    const parsed = parseDuplicateCount(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-count' });
  });
});

describe('isDuplicateCount', () => {
  test.each([
    [0, false],
    [1, true],
    [50, true],
    [51, false],
    [2.5, false],
    [Number.NaN, false],
  ])('judges %d as %p', (count, expected) => {
    // #then
    expect(isDuplicateCount(count)).toBe(expected);
  });
});
