import { describe, expect, test } from 'bun:test';

import type { RollResult } from '@/core/formula-evaluate';

import { rollNotificationText, type RollCopy } from './roll-text';

// The Roll and Empty sheet name copy of EXPERIENCE.md.
const COPY: RollCopy = {
  roll: (roller, sheet, cell, result) => `${roller}: ${sheet}, ${cell} — ${result}`,
  rollSuccess: 'успех',
  rollFailure: 'провал',
  unnamed: 'Без имени',
};

function rollOf(result: Partial<RollResult>): Parameters<typeof rollNotificationText>[0] {
  return {
    roller: 'Лиза',
    sheetName: 'Брок',
    cell: 'Сила',
    result: { roll: 7, faces: [7], target: null, targetFaces: [], outcome: null, ...result },
  };
}

describe('rollNotificationText', () => {
  test.each<[string, Partial<RollResult>, string]>([
    ['a roll with no comparison', { roll: 12 }, 'Лиза: Брок, Сила — 12'],
    [
      'a comparison that holds',
      { roll: 7, target: 10, outcome: 'success' },
      'Лиза: Брок, Сила — 7, успех',
    ],
    [
      'a comparison that fails',
      { roll: 15, target: 10, outcome: 'failure' },
      'Лиза: Брок, Сила — 15, провал',
    ],
  ])('writes %s as the roller, the sheet, the cell and the result', (_name, result, expected) => {
    // #when
    const text = rollNotificationText(rollOf(result), COPY);

    // #then
    expect(text).toBe(expected);
  });

  test.each([[''], ['   ']])(
    'names a sheet sent with the empty name %j "Без имени"',
    (sheetName) => {
      // #given
      const roll = { ...rollOf({ roll: 12 }), sheetName };

      // #when
      const text = rollNotificationText(roll, COPY);

      // #then
      expect(text).toBe('Лиза: Без имени, Сила — 12');
    },
  );

  test.each<[string, number, string]>([
    ['a half with a decimal comma', 2.5, '2,5'],
    ['a third with at most two decimals', 10 / 3, '3,33'],
    ['a negative roll with its sign', -3, '-3'],
    ['a negative roll that rounds to zero as 0', -0.001, '0'],
    ['a negative zero as 0', -0, '0'],
    ['a thousand with a no-break space between groups', 1000, '1\u00a0000'],
  ])('formats %s in Russian', (_name, roll, expected) => {
    // #when
    const text = rollNotificationText(rollOf({ roll }), COPY);

    // #then
    expect(text).toBe(`Лиза: Брок, Сила — ${expected}`);
  });
});
