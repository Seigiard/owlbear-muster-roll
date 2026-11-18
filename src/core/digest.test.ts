import { fixturePatch } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { VersionedRecord } from '@/core/records';
import { recordDigest } from './digest';

// Expected values come from a separate FNV-1a implementation, not from this module.
const BROK: VersionedRecord = {
  k: 'blk:brok',
  d: { set: 'pc', order: 0, cells: { name: ['Брок', 1, 'seed'] } },
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
};

const BROK_HASH = 61299170;

const STR: VersionedRecord = {
  k: 'blk:brok',
  d: { order: 0, cells: { str: [14, 3, 'gm-a'] } },
  c: 3,
  a: 'gm-a',
  l: [1, 'seed'],
};

const BROK_XOR_STR = 3750227586;

// A key outside ASCII is hashed by its UTF-8 bytes.
const LIZA: VersionedRecord = { k: 'blk:лиза', d: null, c: 12, a: 'gm-b', l: [1, 'seed'] };
const ALL_THREE = 3491267192;

describe('recordDigest', () => {
  test('is 0 for no records', () => {
    // #when
    const digest = recordDigest([]);
    // #then
    expect(digest).toBe(0);
  });
  test('is the FNV-1a hash of one canonical record', () => {
    // #when
    const digest = recordDigest([BROK]);
    // #then
    expect(digest).toBe(BROK_HASH);
  });
  test('is the XOR of the record hashes, as an unsigned integer', () => {
    // #when
    const digest = recordDigest([BROK, STR, LIZA]);
    // #then
    expect(digest).toBe(ALL_THREE);
  });
  test('does not depend on the order of the records', () => {
    // #when
    const digests = [recordDigest([BROK, STR]), recordDigest([STR, BROK])];
    // #then
    expect(digests).toEqual([BROK_XOR_STR, BROK_XOR_STR]);
  });
  test('changes when equal outer versions cover different data', () => {
    // #given
    const otherData: VersionedRecord = fixturePatch(
      BROK,
      { set: 'pc', order: 5, cells: { name: 'Другой' } },
      BROK.c,
      BROK.a,
    );

    // #when
    const digest = recordDigest([otherData]);
    // #then
    expect(digest).toBe(2057765362);
  });
  test('changes when a record has another counter', () => {
    // #when
    const digest = recordDigest([{ ...BROK, c: 2 }]);
    // #then
    expect(digest).toBe(1651747085);
  });
});
