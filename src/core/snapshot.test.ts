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
  k: 'sheet:b',
  d: { set: 'pc', order: 0 },
  c: 2,
  a: 'x',
};

const ROW: VersionedRecord = { k: 'row:b:str', d: { str: 12 }, c: 1, a: 'x' };
const ACL: VersionedRecord = { k: 'acl:b:p1', d: { name: 'Лиза' }, c: 1, a: 'x' };
const TOMBSTONE: VersionedRecord = { k: 'link:t1', d: null, c: 3, a: 'y' };

// Written by hand, as the spec describes the stored value, with no code under test.
function storedValue(content: JsonValue, v: JsonValue = 2): JsonObject {
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
      v: encoded.ok ? encoded.value.v : null,
      data: encoded.ok ? decodedData(encoded.value) : null,
    }).toEqual({
      v: 2,
      data: { g: { n: 2, a: 'gm' }, records: [ACL, TOMBSTONE, ROW, SHEET] },
    });
  });

  test('refuses a replica whose JSON passes the inflate cap of a read', () => {
    // #given
    const huge: VersionedRecord = {
      k: 'row:b:notes',
      d: { notes: 'я'.repeat(500_000) },
      c: 1,
      a: 'x',
    };

    // #when
    const encoded = encodeSnapshot(INITIAL, [huge]);

    // #then
    expect(encoded).toEqual({ ok: false, error: 'too-large' });
  });
});

describe('readSnapshot', () => {
  test('reads a stored copy back to its generation and records', () => {
    // #given
    const metadata = { [KEY]: storedValue({ g: { n: 1, a: 'gm' }, records: [ROW, TOMBSTONE] }) };

    // #when
    const read = readSnapshot(metadata);

    // #then
    expect(read).toEqual({ ok: true, value: { g: { n: 1, a: 'gm' }, records: [ROW, TOMBSTONE] } });
  });

  test('reads a room with no copy as null', () => {
    // #when
    const read = readSnapshot({ 'other.extension/key': 1 });

    // #then
    expect(read).toEqual({ ok: true, value: null });
  });

  test('refuses a higher v without decoding its data', () => {
    // #given
    const metadata = { [KEY]: { v: 3, data: 'not base64 and not deflate!' } };

    // #when
    const read = readSnapshot(metadata);

    // #then
    expect(read).toEqual({ ok: false, error: 'newer-version' });
  });

  test('refuses a copy of the older format 1 without decoding its data', () => {
    // #given
    const metadata = { [KEY]: { v: 1, data: 'not base64 and not deflate!' } };

    // #when
    const read = readSnapshot(metadata);

    // #then
    expect(read).toEqual({ ok: false, error: 'older-version' });
  });

  test('refuses a well-formed copy of the older format 1 as older, not as valid', () => {
    // #given
    const metadata = { [KEY]: storedValue({ g: INITIAL, records: [] }, 1) };

    // #when
    const read = readSnapshot(metadata);

    // #then
    expect(read).toEqual({ ok: false, error: 'older-version' });
  });

  test.each<[string, JsonValue]>([
    ['a lower v', storedValue({ g: INITIAL, records: [] }, 0)],
    ['no v', { data: storedValue({ g: INITIAL, records: [] }).data ?? '' }],
    ['a string', 'snapshot'],
    ['data that is not base64', { v: 2, data: '%%%' }],
    ['data that is not deflate', { v: 2, data: Buffer.from('plain text').toString('base64') }],
    ['JSON that is not a snapshot', storedValue({ g: INITIAL })],
    [
      'an invalid record',
      storedValue({ g: INITIAL, records: [{ k: 'row:b:str', d: 1, c: 0, a: '' }] }),
    ],
    ['an extra field', { ...storedValue({ g: INITIAL, records: [] }), extra: 1 }],
  ])('refuses %s as invalid', (_name, value) => {
    // #when
    const read = readSnapshot({ [KEY]: value });

    // #then
    expect(read).toEqual({ ok: false, error: 'invalid-snapshot' });
  });

  test('refuses data that inflates past the cap', () => {
    // #given
    const bomb = Buffer.from(deflateSync(new Uint8Array(1_000_000))).toString('base64');

    // #when
    const read = readSnapshot({ [KEY]: { v: 2, data: bomb } });

    // #then
    expect(read).toEqual({ ok: false, error: 'invalid-snapshot' });
  });
});

describe('roomMetadataBytes', () => {
  test('counts all metadata as UTF-8 JSON with the copy key replaced', () => {
    // #given
    // {"other":"я","app.muster-roll/snapshot":{"v":2,"data":"AA"}} is 60 characters, and "я" takes
    // two bytes in UTF-8.
    const metadata = { other: 'я', [KEY]: { v: 2, data: 'old copy, much longer' } };

    // #when
    const bytes = roomMetadataBytes(metadata, { v: 2, data: 'AA' });

    // #then
    expect(bytes).toBe(61);
  });

  test('counts the metadata with the copy key taken out for an undefined value', () => {
    // #given
    const metadata = { other: 'я', [KEY]: { v: 2, data: 'AA' } };

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
    const metadata = { other: 'я', [KEY]: { v: 2, data: 'AA' } };

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
  const written: Snapshot = { g: { n: 1, a: 'gm' }, records: [SHEET, ROW] };

  test.each<[string, Snapshot | null, boolean]>([
    ['the same records', { g: { n: 1, a: 'gm' }, records: [ROW, SHEET] }, true],
    [
      'a newer version of a record and one more record',
      { g: { n: 1, a: 'gm' }, records: [{ ...SHEET, c: 3 }, ROW, ACL] },
      true,
    ],
    [
      'an equal counter of a higher author',
      { g: { n: 1, a: 'gm' }, records: [{ ...SHEET, a: 'z' }, ROW] },
      true,
    ],
    [
      'an older version of a record',
      { g: { n: 1, a: 'gm' }, records: [{ ...SHEET, c: 1 }, ROW] },
      false,
    ],
    ['a record missing', { g: { n: 1, a: 'gm' }, records: [SHEET] }, false],
    ['no copy', null, false],
    [
      'a higher generation with none of the records',
      { g: { n: 2, a: 'other' }, records: [] },
      true,
    ],
    [
      'a lower generation with all the records',
      { g: { n: 0, a: '' }, records: [SHEET, ROW] },
      false,
    ],
  ])('judges a read-back holding %s', (_name, readBack, expected) => {
    // #when
    const holds = readBackHolds(written, readBack);

    // #then
    expect(holds).toBe(expected);
  });
});
