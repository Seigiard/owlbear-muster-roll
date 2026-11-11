import { describe, expect, test } from 'bun:test';

import type { RollResult } from '@/core/formula-evaluate';
import { copy } from '@/ui/copy';

import { rollNotificationText } from './roll-text';

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
    const text = rollNotificationText(rollOf(result), copy);

    // #then
    expect(text).toBe(expected);
  });

  test.each<[string, number, string]>([
    ['a half with a decimal comma', 2.5, '2,5'],
    ['a third with at most two decimals', 10 / 3, '3,33'],
    ['a negative roll with its sign', -3, '-3'],
    ['a negative roll that rounds to zero as 0', -0.001, '0'],
    ['a negative zero as 0', -0, '0'],
    ['a thousand with a no-break space between groups', 1000, '1\u00a0000'],
  ])('formats %s in Russian', (_name, roll, expected) => {
    // #when
    const text = rollNotificationText(rollOf({ roll }), copy);

    // #then
    expect(text).toBe(`Лиза: Брок, Сила — ${expected}`);
  });
});
