import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { parseRecord, parseStoredRecord } from '@/core/records';

const VALID_FORMS: [string, JsonValue][] = [
  ['preset', 'eJyrVgIAAS8Arg=='],
  ['sheet:s1', { kind: 'pc', name: 'Ada', order: 1 }],
  ['sheet:s2', { kind: 'npc', name: 'Orc', order: 2.5 }],
  ['row:s1:str', { str: 3, note: 'x', tired: false }],
  ['row:s1:empty', {}],
  ['rep:s1:item:i1', { order: 1, cells: { item: 'rope', qty: 2 } }],
  ['acl:s1:p1', { name: 'Bob' }],
  ['link:t1', 's1'],
  ['plink:s1:p1', { name: 'Bob' }],
];

const INVALID_KEYS = [
  'note:x',
  'Preset',
  '',
  'preset:x',
  'sheet',
  'sheet:',
  'sheet:s:x',
  'row:s',
  'row::r',
  'row:s:',
  'row:s:r:x',
  'rep:s:sec',
  'rep:s::i',
  'rep:s:sec:i:x',
  'acl:s',
  'acl:s:p:x',
  'link',
  'link:t:x',
  'plink:s',
  'plink:s:p:x',
  'constructor:x',
  '__proto__:x',
];

const INVALID_DATA: [string, JsonValue][] = [
  ['preset', 5],
  ['preset', ''],
  ['preset', 'not base64!'],
  ['preset', { z: 1 }],
  ['sheet:s', { kind: 'monster', name: 'x', order: 1 }],
  ['sheet:s', { kind: 'pc', name: 'x' }],
  ['sheet:s', { kind: 'pc', name: 5, order: 1 }],
  ['sheet:s', { kind: 'pc', name: 'x', order: '1' }],
  ['sheet:s', { kind: 'pc', name: 'x', order: 1, extra: true }],
  ['sheet:s', 's'],
  ['row:s:r', 's'],
  ['row:s:r', [1]],
  ['row:s:r', { '': 1 }],
  ['rep:s:sec:i', { order: 1 }],
  ['rep:s:sec:i', { cells: {} }],
  ['rep:s:sec:i', { order: 1, cells: {}, extra: 1 }],
  ['rep:s:sec:i', { order: 1, cells: [] }],
  ['acl:s:p', {}],
  ['acl:s:p', { name: 5 }],
  ['acl:s:p', { name: 'x', extra: 1 }],
  ['link:t', 5],
  ['link:t', ''],
  ['link:t', 'a:b'],
  ['link:t', { sheetId: 's' }],
  ['plink:s:p', {}],
  ['plink:s:p', { name: 'x', extra: 1 }],
];

const INVALID_FIELD_VALUES: [string, JsonValue][] = [
  ['null', null],
  ['object', { nested: 1 }],
  ['array', [1]],
  ['empty string', ''],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
];

describe('parseRecord accepts', () => {
  test.each(VALID_FORMS)('the key %s with its data', (k, d) => {
    // #given
    const candidate: JsonValue = { k, d, c: 1, a: 'conn' };

    // #when
    const parsed = parseRecord(candidate);

    // #then
    expect(parsed).toEqual<JsonValue>({ ok: true, value: { k, d, c: 1, a: 'conn' } });
  });

  test.each(VALID_FORMS)('a tombstone of the key %s', (k) => {
    // #given
    const candidate: JsonValue = { k, d: null, c: 2, a: 'conn' };

    // #when
    const parsed = parseRecord(candidate);

    // #then
    expect(parsed).toEqual({ ok: true, value: { k, d: null, c: 2, a: 'conn' } });
  });

  test.each([[3], [0], [-1.5], ['x'], [true], [false]])('the field value %j', (value) => {
    // #given
    const d = { field: value };

    // #when
    const parsed = parseRecord({ k: 'row:s:r', d, c: 1, a: 'conn' });

    // #then
    expect(parsed).toEqual({ ok: true, value: { k: 'row:s:r', d, c: 1, a: 'conn' } });
  });
});

describe('parseRecord refuses', () => {
  test.each(INVALID_KEYS)('the key %j', (k) => {
    // #when
    const parsed = parseRecord({ k, d: null, c: 1, a: 'conn' });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });

  test.each(INVALID_DATA)('for the key %s the data %j', (k, d) => {
    // #when
    const parsed = parseRecord({ k, d, c: 1, a: 'conn' });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });

  test.each(INVALID_FIELD_VALUES)('a row field holding %s', (_name, value) => {
    // #when
    const parsed = parseRecord({ k: 'row:s:r', d: { field: value }, c: 1, a: 'conn' });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });

  test.each(INVALID_FIELD_VALUES)('a repeat cell holding %s', (_name, value) => {
    // #when
    const parsed = parseRecord({
      k: 'rep:s:sec:i',
      d: { order: 1, cells: { field: value } },
      c: 1,
      a: 'conn',
    });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });

  test.each([[0], [-1], [1.5], ['1'], [null], [2 ** 53]])('the counter %j', (c) => {
    // #when
    const parsed = parseRecord({ k: 'preset', d: null, c, a: 'conn' });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });

  test.each<[string, JsonValue]>([
    ['no d', { k: 'preset', c: 1, a: 'conn' }],
    ['no c', { k: 'preset', d: null, a: 'conn' }],
    ['no a', { k: 'preset', d: null, c: 1 }],
    ['no k', { d: null, c: 1, a: 'conn' }],
    ['an empty author', { k: 'preset', d: null, c: 1, a: '' }],
    ['an extra field', { k: 'preset', d: null, c: 1, a: 'conn', t: 1 }],
    ['null', null],
    ['a string', 'preset'],
    ['an array', []],
  ])('a candidate with %s', (_name, candidate) => {
    // #when
    const parsed = parseRecord(candidate);

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
});

describe('parseStoredRecord', () => {
  test('parses a valid record filed under its own key', () => {
    // #given
    const text = '{"k":"link:t","d":"s","c":3,"a":"conn"}';

    // #when
    const parsed = parseStoredRecord(text, 'link:t');

    // #then
    expect(parsed).toEqual({ ok: true, value: { k: 'link:t', d: 's', c: 3, a: 'conn' } });
  });

  test('refuses text that is not JSON without throwing', () => {
    // #when
    const parsed = parseStoredRecord('{not json', 'link:t');

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });

  test('refuses valid JSON that is not a record', () => {
    // #when
    const parsed = parseStoredRecord('{"k":"link:t","d":"s","c":0,"a":"conn"}', 'link:t');

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });

  test('refuses a valid record filed under another key', () => {
    // #when
    const parsed = parseStoredRecord('{"k":"link:t","d":"s","c":3,"a":"conn"}', 'link:other');

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
});
