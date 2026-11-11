import { describe, expect, test } from 'bun:test';

import type { FieldValue } from '@/core/records';
import type { RepeatBlock } from '@/core/sheet-values';

import { copiesArrived, expectedCopies } from './duplicate-count';

const FIELDS = ['name', 'hp', 'armed'];

function block(instanceId: string, values: Record<string, FieldValue>): RepeatBlock {
  return { instanceId, order: 0, values: new Map(Object.entries(values)) };
}

const SOURCE = block('src', { name: 'Скелет', hp: 7, armed: true });
const BEFORE = new Set(['src']);

describe('copiesArrived', () => {
  test.each<[string, RepeatBlock[], boolean]>([
    ['no new repeat block', [SOURCE], false],
    ['an empty repeat block another client added', [SOURCE, block('add', {})], false],
    [
      'a new repeat block with other values',
      [SOURCE, block('other', { name: 'Орк', hp: 3, armed: true })],
      false,
    ],
    [
      'one of the two copies',
      [SOURCE, block('c1', { name: 'Скелет 1', hp: 7, armed: true })],
      false,
    ],
    [
      'both copies, numbered',
      [
        SOURCE,
        block('add', {}),
        block('c1', { name: 'Скелет 1', hp: 7, armed: true }),
        block('c2', { name: 'Скелет 2', hp: 7, armed: true }),
      ],
      true,
    ],
  ])('a duplicate of 2 with %s: %p', (_name, blocks, expected) => {
    // #given
    const copy = expectedCopies(SOURCE.values, FIELDS, 2);

    // #then
    expect(copiesArrived(blocks, BEFORE, copy)).toBe(expected);
  });

  test('a source with no name: only a block with the same values and no name counts as a copy', () => {
    // #given
    const unnamed = block('src', { hp: 7 });
    const copy = expectedCopies(unnamed.values, FIELDS, 1);

    // #then
    expect({
      nameless: copiesArrived([unnamed, block('c1', { hp: 7 })], BEFORE, copy),
      named: copiesArrived([unnamed, block('c1', { name: 'Скелет 1', hp: 7 })], BEFORE, copy),
    }).toEqual({ nameless: true, named: false });
  });
});
