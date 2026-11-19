import { Result } from 'better-result';
import { describe, expect, test } from 'bun:test';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { JsonObject, JsonValue } from '@/core/json';
import type { VersionedRecord } from '@/core/records';
import {
  encodeSnapshot,
  readBackHolds,
  readSnapshot,
  roomCopyUsage,
  roomMetadataBytes,
  type Snapshot,
} from './snapshot';

const KEY = 'app.muster-roll/snapshot';
const INITIAL = { n: 0, a: '' };

const SHEET: VersionedRecord = {
  k: 'blk:b',
  d: { set: 'pc', order: 0, cells: {} },
  c: 2,
  a: 'x',
  l: [1, 'seed'],
};

const ROW: VersionedRecord = {
  k: 'blk:b',
  d: { order: 0, cells: { str: [12, 1, 'x'] } },
  c: 1,
  a: 'x',
  l: [1, 'seed'],
};

const ACL: VersionedRecord = { k: 'acl:b:p1', d: { name: 'Лиза' }, c: 1, a: 'x' };
const TOMBSTONE: VersionedRecord = { k: 'link:t1', d: null, c: 3, a: 'y' };

// Written by hand, as the spec describes the stored value, with no code under test.
function storedValue(content: JsonValue, v: JsonValue = 4): JsonObject {
  const deflated = deflateSync(strToU8(JSON.stringify(content)));

  return { v, data: Buffer.from(deflated).toString('base64') };
}

function decodedData(value: JsonValue): JsonValue {
  const data = String(Object(value).data);

  return JSON.parse(strFromU8(inflateSync(new Uint8Array(Buffer.from(data, 'base64')))));
}

describe('encodeSnapshot', () => {
  test('stores v and the deflated base64 JSON of the generation and every record sorted by key', () => {
    // #when
    const encoded = encodeSnapshot({ n: 2, a: 'gm' }, [SHEET, TOMBSTONE, ROW, ACL]);
    // #then
    expect({
      v: encoded.isOk() ? encoded.value.v : null,
      data: encoded.isOk() ? decodedData(encoded.value) : null,
    }).toEqual({
      v: 4,
      data: { g: { n: 2, a: 'gm' }, records: [ACL, SHEET, ROW, TOMBSTONE] },
    });
  });
  test('refuses a replica whose JSON passes the inflate cap of a read', () => {
    // #given
    const huge: VersionedRecord = {
      k: 'blk:b',
      d: { order: 0, cells: { notes: ['я'.repeat(500000), 1, 'x'] } },
      c: 1,
      a: 'x',
      l: [1, 'seed'],
    };

    // #when
    const encoded = encodeSnapshot(INITIAL, [huge]);
    // #then
    expect(encoded).toEqual(Result.err('too-large'));
  });
});

describe('readSnapshot', () => {
  test('reads a stored copy back to its generation and records', () => {
    // #given
    const metadata = { [KEY]: storedValue({ g: { n: 1, a: 'gm' }, records: [ROW, TOMBSTONE] }) };
    // #when
    const read = readSnapshot(metadata);
    // #then
    expect(read).toEqual(Result.ok({ g: { n: 1, a: 'gm' }, records: [ROW, TOMBSTONE] }));
  });
  test('reads a room with no copy as null', () => {
    // #when
    const read = readSnapshot({ 'other.extension/key': 1 });
    // #then
    expect(read).toEqual(Result.ok(null));
  });
  test('refuses a higher v without decoding its data', () => {
    // #given
    const metadata = { [KEY]: { v: 5, data: 'not base64 and not deflate!' } };
    // #when
    const read = readSnapshot(metadata);
    // #then
    expect(read).toEqual(Result.err('newer-version'));
  });
  test.each([1, 2, 3])(
    'refuses a copy of the older format %i without decoding its data',
    (format) => {
      // #given
      const metadata = { [KEY]: { v: format, data: 'not base64 and not deflate!' } };
      // #when
      const read = readSnapshot(metadata);
      // #then
      expect(read).toEqual(Result.err('older-version'));
    },
  );
  test.each([1, 2, 3])(
    'refuses a well-formed copy of the older format %i as older, not as valid',
    (format) => {
      // #given
      const metadata = { [KEY]: storedValue({ g: INITIAL, records: [] }, format) };
      // #when
      const read = readSnapshot(metadata);
      // #then
      expect(read).toEqual(Result.err('older-version'));
    },
  );
  test.each<[string, JsonValue]>([
    ['a lower v', storedValue({ g: INITIAL, records: [] }, 0)],
    ['no v', { data: storedValue({ g: INITIAL, records: [] }).data ?? '' }],
    ['a string', 'snapshot'],
    ['data that is not base64', { v: 4, data: '%%%' }],
    ['data that is not deflate', { v: 4, data: Buffer.from('plain text').toString('base64') }],
    ['JSON that is not a snapshot', storedValue({ g: INITIAL })],
    [
      'an invalid record',
      storedValue({
        g: INITIAL,
        records: [
          {
            k: 'blk:b',
            d: { order: 0, cells: { bad: [1, 0, ''] } },
            c: 0,
            a: '',
            l: [1, 'seed'],
          },
        ],
      }),
    ],
    ['an extra field', { ...storedValue({ g: INITIAL, records: [] }), extra: 1 }],
  ])('refuses %s as invalid', (_name, value) => {
    // #when
    const read = readSnapshot({ [KEY]: value });
    // #then
    expect(read).toEqual(Result.err('invalid-snapshot'));
  });
  test('refuses data that inflates past the cap', () => {
    // #given
    const bomb = Buffer.from(deflateSync(new Uint8Array(1000000))).toString('base64');
    // #when
    const read = readSnapshot({ [KEY]: { v: 4, data: bomb } });
    // #then
    expect(read).toEqual(Result.err('invalid-snapshot'));
  });
});

describe('roomMetadataBytes', () => {
  test('counts all metadata as UTF-8 JSON with the copy key replaced', () => {
    // #given
    // {"other":"я","app.muster-roll/snapshot":{"v":3,"data":"AA"}} is 60 characters, and "я" takes
    // two bytes in UTF-8.
    const metadata = { other: 'я', [KEY]: { v: 3, data: 'old copy, much longer' } };
    // #when
    const bytes = roomMetadataBytes(metadata, { v: 3, data: 'AA' });
    // #then
    expect(bytes).toBe(61);
  });
  test('counts the metadata with the copy key taken out for an undefined value', () => {
    // #given
    const metadata = { other: 'я', [KEY]: { v: 3, data: 'AA' } };
    // #when
    const bytes = roomMetadataBytes(metadata, undefined);
    // #then
    expect(bytes).toBe(14);
  });
});

describe('roomCopyUsage', () => {
  test('gives the copy key its own bytes and leaves the limit less all metadata free', () => {
    // #given
    // 61 bytes in all, 14 of them without the copy.
    const metadata = { other: 'я', [KEY]: { v: 3, data: 'AA' } };
    // #when
    const usage = roomCopyUsage(metadata);
    // #then
    expect(usage).toEqual({ usedBytes: 47, freeBytes: 15439 });
  });
  test('uses nothing with no copy and frees nothing below 0', () => {
    // #given
    const metadata = { other: 'x'.repeat(16000) };
    // #when
    const usage = roomCopyUsage(metadata);
    // #then
    expect(usage).toEqual({ usedBytes: 0, freeBytes: 0 });
  });
});

describe('readBackHolds', () => {
  const ROOT: VersionedRecord = {
    ...SHEET,
    d: { set: 'pc', order: 0, cells: { str: [12, 1, 'x'] } },
  };

  const written: Snapshot = { g: { n: 1, a: 'gm' }, records: [ROOT] };
  test.each<[string, Snapshot | null, boolean]>([
    ['the same records', { g: { n: 1, a: 'gm' }, records: [ROOT] }, true],
    [
      'a newer version of a record and one more record',
      { g: { n: 1, a: 'gm' }, records: [{ ...ROOT, c: 3 }, ACL] },
      true,
    ],
    [
      'an equal counter of a higher author',
      { g: { n: 1, a: 'gm' }, records: [{ ...ROOT, a: 'z' }] },
      true,
    ],
    ['an older version of a record', { g: { n: 1, a: 'gm' }, records: [{ ...ROOT, c: 1 }] }, false],
    ['a record missing', { g: { n: 1, a: 'gm' }, records: [] }, false],
    ['no copy', null, false],
    [
      'a higher generation with none of the records',
      { g: { n: 2, a: 'other' }, records: [] },
      true,
    ],
    ['a lower generation with all the records', { g: { n: 0, a: '' }, records: [ROOT] }, false],
  ])('judges a read-back holding %s', (_name, readBack, expected) => {
    // #when
    const holds = readBackHolds(written, readBack);
    // #then
    expect(holds).toBe(expected);
  });
});
