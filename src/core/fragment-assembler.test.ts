import { describe, expect, test } from 'bun:test';
import { createFragmentAssembler, type FragmentAssemblerLimits } from '@/core/fragment-assembler';
import type { VersionedRecord } from '@/core/records';

const FIRST_PART: VersionedRecord = {
  k: 'blk:sheet',
  d: { order: 0, cells: { one: ['first', 1, 'gm'] } },
  c: 1,
  a: 'gm',
  l: [1, 'seed'],
};

const SECOND_PART: VersionedRecord = {
  k: 'blk:sheet',
  d: { order: 0, cells: { two: ['second', 1, 'gm'] } },
  c: 1,
  a: 'gm',
  l: [1, 'seed'],
};

const COMPLETE_RECORD: VersionedRecord = {
  k: 'blk:sheet',
  d: {
    order: 0,
    cells: {
      one: ['first', 1, 'gm'],
      two: ['second', 1, 'gm'],
    },
  },
  c: 1,
  a: 'gm',
  l: [1, 'seed'],
};

const CHANGED_FIRST_PART: VersionedRecord = {
  ...FIRST_PART,
  d: { order: 0, cells: { one: ['changed', 1, 'gm'] } },
};

const OVERSIZED_PART: VersionedRecord = {
  ...FIRST_PART,
  d: { order: 0, cells: { large: ['large-value'.repeat(40), 1, 'gm'] } },
};

function limits(overrides: Partial<FragmentAssemblerLimits> = {}): FragmentAssemblerLimits {
  return {
    maxParts: 32,
    maxBytes: 480_000,
    maxAssemblies: 32,
    retentionMs: 60_000,
    ...overrides,
  };
}

describe('fragment assembler', () => {
  test('completes two parts and removes the completed assembly', () => {
    // #given

    const assembler = createFragmentAssembler(limits());
    // #when

    const outcomes = [
      assembler.add('first', { i: 1, n: 2, record: FIRST_PART }, 0),
      assembler.add('first', { i: 2, n: 2, record: SECOND_PART }, 0),
      assembler.add('first', { i: 1, n: 2, record: FIRST_PART }, 0),
    ];
    // #then

    expect(outcomes).toEqual([
      { kind: 'waiting' },
      { kind: 'complete', record: COMPLETE_RECORD },
      { kind: 'waiting' },
    ]);
  });

  test('drops a count mismatch and removes its open assembly', () => {
    // #given

    const assembler = createFragmentAssembler(limits());
    // #when

    const outcomes = [
      assembler.add('mismatch', { i: 1, n: 2, record: FIRST_PART }, 0),
      assembler.add('mismatch', { i: 2, n: 3, record: SECOND_PART }, 1),
      assembler.add('mismatch', { i: 2, n: 2, record: SECOND_PART }, 2),
      assembler.add('mismatch', { i: 1, n: 2, record: FIRST_PART }, 3),
    ];
    // #then

    expect(outcomes).toEqual([
      { kind: 'waiting' },
      { kind: 'dropped', reason: 'count-mismatch' },
      { kind: 'waiting' },
      { kind: 'complete', record: COMPLETE_RECORD },
    ]);
  });

  test('keeps an identical duplicate and drops a changed duplicate', () => {
    // #given

    const assembler = createFragmentAssembler(limits());
    // #when

    const outcomes = [
      assembler.add('identical', { i: 1, n: 2, record: FIRST_PART }, 0),
      assembler.add('identical', { i: 1, n: 2, record: FIRST_PART }, 1),
      assembler.add('identical', { i: 2, n: 2, record: SECOND_PART }, 2),
      assembler.add('changed', { i: 1, n: 2, record: FIRST_PART }, 3),
      assembler.add('changed', { i: 1, n: 2, record: CHANGED_FIRST_PART }, 4),
      assembler.add('changed', { i: 2, n: 2, record: SECOND_PART }, 5),
    ];
    // #then

    expect(outcomes).toEqual([
      { kind: 'waiting' },
      { kind: 'ignored' },
      { kind: 'complete', record: COMPLETE_RECORD },
      { kind: 'waiting' },
      { kind: 'dropped', reason: 'duplicate-part' },
      { kind: 'waiting' },
    ]);
  });

  test('drops too many parts before looking up an assembly', () => {
    // #given

    const assembler = createFragmentAssembler(limits());
    // #when

    const outcomes = [
      assembler.add('too-many', { i: 1, n: 33, record: FIRST_PART }, 0),
      assembler.add('too-many', { i: 2, n: 2, record: SECOND_PART }, 1),
      assembler.add('too-many', { i: 1, n: 2, record: FIRST_PART }, 2),
    ];
    // #then

    expect(outcomes).toEqual([
      { kind: 'dropped', reason: 'too-many-parts' },
      { kind: 'waiting' },
      { kind: 'complete', record: COMPLETE_RECORD },
    ]);
  });

  test('drops an oversized assembly and evicts before rejecting an oversized first part', () => {
    // #given

    const assembler = createFragmentAssembler(limits({ maxBytes: 192, maxAssemblies: 1 }));
    // #when

    const outcomes = [
      assembler.add('old', { i: 1, n: 2, record: FIRST_PART }, 0),
      assembler.add('old', { i: 2, n: 2, record: SECOND_PART }, 1),
      assembler.add('old', { i: 1, n: 2, record: FIRST_PART }, 2),
      assembler.add('oversized', { i: 1, n: 2, record: OVERSIZED_PART }, 3),
      assembler.add('old', { i: 2, n: 2, record: SECOND_PART }, 4),
    ];
    // #then

    expect(outcomes).toEqual([
      { kind: 'waiting' },
      { kind: 'dropped', reason: 'too-large' },
      { kind: 'waiting' },
      { kind: 'dropped', reason: 'too-large' },
      { kind: 'waiting' },
    ]);
  });

  test('expires from the first part even after a later part arrives', () => {
    // #given

    const assembler = createFragmentAssembler(limits());
    // #when

    const outcomes = [
      assembler.add('expires', { i: 1, n: 3, record: FIRST_PART }, 0),
      assembler.add('expires', { i: 2, n: 3, record: SECOND_PART }, 59_999),
      assembler.add('other', { i: 1, n: 2, record: FIRST_PART }, 60_000),
      assembler.add('expires', { i: 3, n: 3, record: SECOND_PART }, 60_000),
    ];
    // #then

    expect(outcomes).toEqual([
      { kind: 'waiting' },
      { kind: 'waiting' },
      { kind: 'waiting' },
      { kind: 'waiting' },
    ]);
  });

  test('evicts the oldest-created assembly when a new key reaches the limit', () => {
    // #given

    const assembler = createFragmentAssembler(limits({ maxAssemblies: 2 }));
    // #when

    const outcomes = [
      assembler.add('oldest', { i: 1, n: 2, record: FIRST_PART }, 0),
      assembler.add('middle', { i: 1, n: 2, record: FIRST_PART }, 1),
      assembler.add('newest', { i: 1, n: 2, record: FIRST_PART }, 2),
      assembler.add('middle', { i: 2, n: 2, record: SECOND_PART }, 3),
      assembler.add('oldest', { i: 2, n: 2, record: SECOND_PART }, 4),
    ];
    // #then

    expect(outcomes).toEqual([
      { kind: 'waiting' },
      { kind: 'waiting' },
      { kind: 'waiting' },
      { kind: 'complete', record: COMPLETE_RECORD },
      { kind: 'waiting' },
    ]);
  });
});
