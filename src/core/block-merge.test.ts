import { fixturePatch } from '../../tests/support/block-fixtures';
import { expect, test } from 'bun:test';
import { mergeRecords, recordHolds } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';

const base: VersionedRecord = {
  k: 'blk:hero',
  c: 1,
  a: 'gm',
  l: [1, 'gm'],
  d: { order: 0, set: 'party', cells: {} },
};

test('concurrent cells survive repeated and reordered delivery', () => {
  // #given
  const strength: VersionedRecord = fixturePatch(
    base,
    { order: 0, set: 'party', cells: { str: [12, 2, 'a'] } },
    2,
    'a',
  );

  const name: VersionedRecord = fixturePatch(
    base,
    { order: 0, set: 'party', cells: { name: ['Brok', 2, 'b'] } },
    2,
    'b',
  );

  // #when
  const merged = mergeRecords(strength, name);
  // #then
  expect([merged.d, mergeRecords(name, strength).d, mergeRecords(merged, strength).d]).toEqual(
    Array(3).fill({ order: 0, set: 'party', cells: { str: [12, 2, 'a'], name: ['Brok', 2, 'b'] } }),
  );
});

test('the latest version of one cell wins repeated and reordered delivery', () => {
  // #given
  const older: VersionedRecord = fixturePatch(
    base,
    { order: 0, cells: { hp: [10, 2, 'z'] } },
    20,
    'z',
  );

  const latest: VersionedRecord = fixturePatch(
    base,
    { order: 0, cells: { hp: [12, 3, 'a'] } },
    3,
    'a',
  );

  // #when
  const merged = mergeRecords(older, latest);
  // #then
  expect([merged.d, mergeRecords(latest, older).d, mergeRecords(merged, older).d]).toEqual(
    Array(3).fill({ order: 0, set: 'party', cells: { hp: [12, 3, 'a'] } }),
  );
});

test('a versioned clear defeats an older value without losing zero and false', () => {
  // #given
  const old: VersionedRecord = fixturePatch(
    base,
    { order: 0, cells: { name: ['Brok', 1, 'gm'] } },
    100,
    base.a,
  );

  const clear: VersionedRecord = fixturePatch(
    base,
    { order: 0, cells: { name: [null, 2, 'gm'], hp: [0, 2, 'gm'], tired: [false, 2, 'gm'] } },
    2,
    base.a,
  );

  // #when
  const merged = mergeRecords(clear, old);
  // #then
  expect(merged.d).toEqual(clear.d);
});

test('a block tombstone defeats a higher counter cell edit in the same lifecycle', () => {
  // #given
  const removed: VersionedRecord = fixturePatch(base, null, 2, base.a);

  const delayed: VersionedRecord = fixturePatch(
    base,
    { order: 0, cells: { hp: [20, 100, 'gm'] } },
    100,
    base.a,
  );

  // #when
  const results = [mergeRecords(removed, delayed), mergeRecords(delayed, removed)];
  // #then
  expect(results).toEqual([removed, removed]);
});

test('equal outer versions with incomplete cell coverage fail read-back coverage', () => {
  // #given
  const full: VersionedRecord = fixturePatch(
    base,
    { order: 0, cells: { hp: [10, 1, 'gm'] } },
    base.c,
    base.a,
  );

  // #when
  const holds = recordHolds(base, full);
  // #then
  expect(holds).toBe(false);
});
