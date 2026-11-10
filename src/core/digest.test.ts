import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';

import { recordDigest } from './digest';

// Expected values come from a separate FNV-1a implementation, not from this module.
const BROK: VersionedRecord = {
  k: 'sheet:brok',
  d: { kind: 'pc', name: 'Брок', order: 0 },
  c: 1,
  a: 'seed',
};

const BROK_HASH = 14557499;

const STR: VersionedRecord = { k: 'row:brok:str', d: { str: 14 }, c: 3, a: 'gm-a' };
const BROK_XOR_STR = 2639216743;

// A key outside ASCII is hashed by its UTF-8 bytes.
const LIZA: VersionedRecord = { k: 'sheet:лиза', d: null, c: 12, a: 'gm-b' };
const ALL_THREE = 2628984762;

describe('recordDigest', () => {
  test('is 0 for no records', () => {
    // #when
    const digest = recordDigest([]);

    // #then
    expect(digest).toBe(0);
  });

  test('is the FNV-1a hash of the length-prefixed k, c and a for one record', () => {
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

  test('ignores the data, so equal versions give equal digests', () => {
    // #given
    const otherData: VersionedRecord = { ...BROK, d: { kind: 'pc', name: 'Другой', order: 5 } };

    // #when
    const digest = recordDigest([otherData]);

    // #then
    expect(digest).toBe(BROK_HASH);
  });

  test('changes when a record has another counter', () => {
    // #when
    const digest = recordDigest([{ ...BROK, c: 2 }]);

    // #then
    expect(digest).toBe(995741264);
  });
});
