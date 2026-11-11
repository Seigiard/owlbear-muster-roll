import { describe, expect, test } from 'bun:test';

import fc from 'fast-check';

import {
  compareGenerations,
  mergeRecords,
  nextCounter,
  ownerOf,
  ownersBySheet,
  sameRecord,
  type Ordering,
} from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import type { Generation } from '@/core/storage-key';

const NUM_RUNS = 1000;

const fieldValue = fc.oneof(
  fc.integer({ min: -2, max: 2 }),
  fc.constantFrom('a', 'b'),
  fc.boolean(),
);

const rowData = fc.oneof(
  fc.constant(null),
  fc.dictionary(fc.constantFrom('x', 'y', 'z'), fieldValue, { noNullPrototype: true }),
);

// A small domain, so that equal versions come up often.
const anyVersion = fc.record({
  k: fc.constant('row:s:r'),
  d: rowData,
  c: fc.integer({ min: 1, max: 3 }),
  a: fc.constantFrom('a', 'b', 'Z'),
});

const equalVersion = fc.record({
  k: fc.constant('row:s:r'),
  d: rowData,
  c: fc.constant(4),
  a: fc.constant('a'),
});

function row(c: number, a: string, d: Record<string, number> | null = { x: 1 }): VersionedRecord {
  return { k: 'row:s:r', d, c, a };
}

describe('mergeRecords', () => {
  test('picks the higher counter when it is the left record', () => {
    // #given
    const newer = row(10, 'a');

    // #when
    const winner = mergeRecords(newer, row(9, 'z'));

    // #then
    expect(winner).toBe(newer);
  });

  test('picks the higher counter when it is the right record', () => {
    // #given
    const newer = row(10, 'a');

    // #when
    const winner = mergeRecords(row(9, 'z'), newer);

    // #then
    expect(winner).toBe(newer);
  });

  test('breaks a counter tie with the higher author', () => {
    // #given
    const higher = row(5, 'b');

    // #when
    const winner = mergeRecords(row(5, 'a'), higher);

    // #then
    expect(winner).toBe(higher);
  });

  test('orders authors by code unit, not by locale: "a" beats "Z"', () => {
    // #given
    const lowerCase = row(5, 'a');

    // #when
    const winner = mergeRecords(row(5, 'Z'), lowerCase);

    // #then
    expect(winner).toBe(lowerCase);
  });

  test('orders authors by UTF-16 code unit, not by code point', () => {
    // #given
    const higherCodeUnit = row(5, '\u{FFFD}');

    // #when
    const winner = mergeRecords(row(5, '\u{1F600}'), higherCodeUnit);

    // #then
    expect(winner).toBe(higherCodeUnit);
  });

  test('lets a newer tombstone beat a record with data', () => {
    // #given
    const tombstone = row(6, 'a', null);

    // #when
    const winner = mergeRecords(row(5, 'z'), tombstone);

    // #then
    expect(winner).toEqual({ k: 'row:s:r', d: null, c: 6, a: 'a' });
  });

  test('picks the higher JSON text of d for equal versions, from either side', () => {
    // #given
    const first = row(5, 'a', { x: 1 });
    const second = row(5, 'a', { x: 2 });

    // #when
    const winners = [mergeRecords(first, second), mergeRecords(second, first)];

    // #then
    expect(winners).toEqual([second, second]);
  });
});

describe.each([
  ['any versions', anyVersion],
  ['equal (c, a) with different d', equalVersion],
])('merge laws over %s', (_name, version) => {
  test('merge is commutative', () => {
    fc.assert(
      fc.property(version, version, (left, right) => {
        expect(mergeRecords(left, right)).toEqual(mergeRecords(right, left));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('merge is associative', () => {
    fc.assert(
      fc.property(version, version, version, (first, second, third) => {
        expect(mergeRecords(mergeRecords(first, second), third)).toEqual(
          mergeRecords(first, mergeRecords(second, third)),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test('merge is idempotent', () => {
    fc.assert(
      fc.property(version, (record) => {
        expect(mergeRecords(record, record)).toEqual(record);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('compareGenerations', () => {
  test.each<[Generation, Generation, Ordering]>([
    [{ n: 2, a: 'a' }, { n: 1, a: 'z' }, 1],
    [{ n: 10, a: 'a' }, { n: 9, a: 'a' }, 1],
    [{ n: 1, a: 'a' }, { n: 1, a: 'b' }, -1],
    [{ n: 1, a: 'a' }, { n: 1, a: 'a' }, 0],
  ])('orders %j against %j as %d', (left, right, expected) => {
    // #when
    const ordering = compareGenerations(left, right);

    // #then
    expect(ordering).toBe(expected);
  });
});

describe('sameRecord', () => {
  const ITEM: VersionedRecord = {
    k: 'rep:brok:item:r1',
    d: { order: 0, cells: { item: 'Меч', qty: 2 } },
    c: 3,
    a: 'p',
  };

  test.each<[string, VersionedRecord, boolean]>([
    [
      'the same content in another key order',
      { ...ITEM, d: { cells: { qty: 2, item: 'Меч' }, order: 0 } },
      true,
    ],
    ['another cell value', { ...ITEM, d: { order: 0, cells: { item: 'Меч', qty: 3 } } }, false],
    ['one cell fewer', { ...ITEM, d: { order: 0, cells: { item: 'Меч' } } }, false],
    ['a tombstone', { ...ITEM, d: null }, false],
    ['another author', { ...ITEM, a: 'q' }, false],
  ])('%s gives %p', (_name, other, expected) => {
    // #when
    const same = sameRecord(ITEM, other);

    // #then
    expect(same).toBe(expected);
  });
});

describe('nextCounter', () => {
  test.each([
    [7, 0, 8],
    [7, 8, 9],
    [12, 8, 13],
  ])('after known %d and minted %d gives %d', (known, minted, expected) => {
    // #when
    const next = nextCounter(known, minted);

    // #then
    expect(next).toBe(expected);
  });
});

describe('ownerOf', () => {
  test('is the player of the one live plink: of the sheet', () => {
    // #given
    const records = [plink('brok', 'p-oly', 1, 'gm-a'), plink('brok', 'p-gena', 3, 'gm-a', null)];

    // #when
    const owner = ownerOf(records, 'brok');

    // #then
    expect(owner).toBe('p-oly');
  });

  test('is null with no live plink: of the sheet', () => {
    // #given
    const records = [plink('brok', 'p-oly', 2, 'gm-a', null), plink('kira', 'p-oly', 1, 'gm-a')];

    // #when
    const owner = ownerOf(records, 'brok');

    // #then
    expect(owner).toBeNull();
  });

  test('takes the live plink: with the highest c when two GM clients picked at once', () => {
    // #given
    const records = [plink('brok', 'p-oly', 4, 'gm-z'), plink('brok', 'p-gena', 5, 'gm-a')];

    // #when
    const owner = ownerOf(records, 'brok');

    // #then
    expect(owner).toBe('p-gena');
  });

  test('breaks an equal c by the author, the same way in any record order', () => {
    // #given
    const oly = plink('brok', 'p-oly', 1, 'gm-b');
    const gena = plink('brok', 'p-gena', 1, 'gm-a');

    // #when
    const owners = [ownerOf([oly, gena], 'brok'), ownerOf([gena, oly], 'brok')];

    // #then
    expect(owners).toEqual(['p-oly', 'p-oly']);
  });

  test('breaks an equal (c, a) by the higher key, the same way in any record order', () => {
    // #given
    const oly = plink('brok', 'p-oly', 1, 'gm-a');
    const gena = plink('brok', 'p-gena', 1, 'gm-a');

    // #when
    const owners = [
      ownerOf([oly, gena], 'brok'),
      ownerOf([gena, oly], 'brok'),
      ownersBySheet([oly, gena]).get('brok'),
      ownersBySheet([gena, oly]).get('brok'),
    ];

    // #then
    expect(owners).toEqual(['p-oly', 'p-oly', 'p-oly', 'p-oly']);
  });

  test('reads no plink: of a sheet whose id starts with this one, and no other key form', () => {
    // #given
    const records: VersionedRecord[] = [
      plink('brokk', 'p-oly', 9, 'gm-a'),
      { k: 'acl:brok:p-gena', d: { name: 'Гена' }, c: 9, a: 'gm-a' },
    ];

    // #when
    const owner = ownerOf(records, 'brok');

    // #then
    expect(owner).toBeNull();
  });

  test('skips a plink: whose data or player id no plink: may hold', () => {
    // #given
    const records: VersionedRecord[] = [
      { k: 'plink:brok:p-oly', d: { s: 'Оля' }, c: 9, a: 'gm-a' },
      { k: 'plink:brok:a b', d: { name: 'Гена' }, c: 9, a: 'gm-a' },
      plink('brok', 'p-vova', 1, 'gm-a'),
    ];

    // #when
    const owner = ownerOf(records, 'brok');

    // #then
    expect(owner).toBe('p-vova');
  });
});

describe('ownersBySheet', () => {
  test('gives the owner of every sheet that has one, as ownerOf does for each', () => {
    // #given
    const records: VersionedRecord[] = [
      plink('brok', 'p-oly', 1, 'gm-a'),
      plink('brok', 'p-gena', 2, 'gm-a'),
      plink('kira', 'p-oly', 3, 'gm-a', null),
      plink('yarl', 'p-vova', 1, 'gm-a'),
      { k: 'plink:anya:a b', d: { name: 'Аня' }, c: 1, a: 'gm-a' },
      { k: 'acl:zed:p-oly', d: { name: 'Оля' }, c: 1, a: 'gm-a' },
    ];

    // #when
    const owners = ownersBySheet(records);

    // #then
    expect({
      owners: [...owners].sort(([first], [second]) => (first < second ? -1 : 1)),
      perSheet: ['brok', 'kira', 'yarl', 'anya'].map((sheetId) => ownerOf(records, sheetId)),
    }).toEqual({
      owners: [
        ['brok', 'p-gena'],
        ['yarl', 'p-vova'],
      ],
      perSheet: ['p-gena', null, 'p-vova', null],
    });
  });
});

function plink(
  sheetId: string,
  playerId: string,
  c: number,
  a: string,
  d: { name: string } | null = { name: playerId },
): VersionedRecord {
  return { k: `plink:${sheetId}:${playerId}`, d, c, a };
}
