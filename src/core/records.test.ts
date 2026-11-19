import { describe, expect, test } from 'bun:test';
import type { JsonObject, JsonValue } from '@/core/json';
import { parseRecord, parseStoredRecord, repKey } from '@/core/records';

const VALID_FORMS: [string, JsonValue][] = [
  ['preset', 'eJyrVgIAAS8Arg=='],
  ['blk:s1', { set: 'pc', order: 1, cells: {} }],
  ['blk:s2', { set: 'crew_2', order: 2.5, cells: {} }],
  [
    'blk:s3',
    { order: 0, cells: { str: [3, 1, 'conn'], note: ['x', 1, 'conn'], tired: [false, 1, 'conn'] } },
  ],
  ['blk:single', { order: 0, cells: {} }],
  ['blk:s1:item:i1', { order: 1, cells: { item: ['rope', 1, 'conn'], qty: [2, 1, 'conn'] } }],
  ['blk:s1:item:i1:child:i2', { order: 0, cells: { cleared: [null, 2, 'conn'] } }],
  ['acl:s1:p1', { name: 'Bob' }],
  ['link:t1', { s: 's1', c: 'token' }],
  ['link:t2', { s: 's1', path: ['item', 'i1'], c: 'token' }],
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
  'sheet:s1',
  'row:s1:str',
  'rep:s1:item:i1',
  'blk:',
  'blk:s:scope',
  'blk:s:scope:block:extra',
  'blk:__proto__',
  'blk:s:__proto__:block',
  'blk:s:scope:__proto__',
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
  'sheet:__proto__',
  'row:__proto__:r',
  'row:s:__proto__',
  'rep:s:__proto__:i',
  'rep:s:sec:__proto__',
  'acl:s:__proto__',
  'link:__proto__',
  'plink:__proto__:p',
];

const INVALID_DATA: [string, JsonValue][] = [
  ['preset', 5],
  ['preset', ''],
  ['preset', 'not base64!'],
  ['preset', { z: 1 }],
  ['blk:s', { kind: 'pc', name: 'x', order: 1, cells: {} }],
  ['blk:s', { set: 'pc', cells: {} }],
  ['blk:s', { set: 5, order: 1, cells: {} }],
  ['blk:s', { set: '1pc', order: 1, cells: {} }],
  ['blk:s', { set: 'd20', order: 1, cells: {} }],
  ['blk:s', { set: 'constructor', order: 1, cells: {} }],
  ['blk:s', { set: 'a'.repeat(65), order: 1, cells: {} }],
  ['blk:s', { set: 'pc', order: '1', cells: {} }],
  ['blk:s', { set: 'pc', order: 1, cells: {}, name: 'x' }],
  ['blk:s', 's'],
  ['blk:s', [1]],
  ['blk:s', { order: 0, cells: { '': [1, 1, 'conn'] } }],
  ['blk:s:sec:i', { order: 1 }],
  ['blk:s:sec:i', { cells: {} }],
  ['blk:s:sec:i', { order: 1, cells: {}, extra: 1 }],
  ['blk:s:sec:i', { order: 1, cells: [] }],
  ['blk:s', { order: 0, cells: { x: [1, 0, 'conn'] } }],
  ['blk:s', { order: 0, cells: { x: [1, 1, ''] } }],
  ['blk:s', { order: 0, cells: { x: [1, 1] } }],
  ['blk:s', { order: 0, cells: { constructor: [1, 1, 'conn'] } }],
  ['acl:s:p', {}],
  ['acl:s:p', { name: 5 }],
  ['acl:s:p', { name: 'x', extra: 1 }],
  ['link:t', 5],
  ['link:t', 's'],
  ['link:t', {}],
  ['link:t', { s: '' }],
  ['link:t', { s: 'a:b' }],
  ['link:t', { s: '__proto__' }],
  ['link:t', { s: 's', i: '' }],
  ['link:t', { s: 's', i: 'a:b' }],
  ['link:t', { i: 'i' }],
  ['link:t', { s: 's', section: 'sec' }],
  ['link:t', { sheetId: 's' }],
  ['plink:s:p', {}],
  ['plink:s:p', { name: 'x', extra: 1 }],
];

const INVALID_FIELD_VALUES: [string, JsonValue][] = [
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
    const candidate = candidateOf(k, d, 1);
    // #when
    const parsed = parseRecord(candidate);
    // #then
    expect(parsed.ok).toBe(true);

    if (!parsed.ok) throw new Error(parsed.error);
    const actual: unknown = parsed.value;

    expect(actual).toEqual(candidate);
  });
  test.each(VALID_FORMS)('a tombstone of the key %s', (k) => {
    // #given
    const candidate = candidateOf(k, null, 2);
    // #when
    const parsed = parseRecord(candidate);
    // #then
    expect(parsed.ok).toBe(true);

    if (!parsed.ok) throw new Error(parsed.error);
    const actual: unknown = parsed.value;

    expect(actual).toEqual(candidate);
  });
  test.each([[3], [0], [-1.5], ['x'], [true], [false], [null]])('the field value %j', (value) => {
    // #given
    const d = { order: 0, cells: { field: [value, 1, 'conn'] } };
    const candidate = candidateOf('blk:s', d, 1);
    // #when
    const parsed = parseRecord(candidate);
    // #then
    expect(parsed.ok).toBe(true);

    if (!parsed.ok) throw new Error(parsed.error);
    const actual: unknown = parsed.value;

    expect(actual).toEqual(candidate);
  });
});

describe('parseRecord refuses', () => {
  test.each(INVALID_KEYS)('the key %j', (k) => {
    // #when
    const parsed = parseRecord(candidateOf(k, null, 1));
    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
  test.each(INVALID_DATA)('for the key %s the data %j', (k, d) => {
    // #when
    const parsed = parseRecord(candidateOf(k, d, 1));
    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
  test.each(INVALID_FIELD_VALUES)('a row field holding %s', (_name, value) => {
    // #when
    const parsed = parseRecord(
      candidateOf('blk:s', { order: 0, cells: { field: [value, 1, 'conn'] } }, 1),
    );

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
  test.each(INVALID_FIELD_VALUES)('a repeat cell holding %s', (_name, value) => {
    // #when
    const parsed = parseRecord({
      k: 'blk:s:sec:i',
      d: { order: 1, cells: { field: [value, 1, 'conn'] } },
      c: 1,
      a: 'conn',
      l: [1, 'conn'],
    });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
  test('lifecycle metadata on a non-block record', () => {
    // #given
    const candidate = { k: 'acl:s:p', d: { name: 'Bob' }, c: 1, a: 'conn', l: [1, 'conn'] };
    // #when
    const parsed = parseRecord(candidate);
    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
  test.each<[string, JsonValue]>([
    ['blk:s', { order: 0, cells: ownProtoKey([1, 1, 'conn']) }],
    ['blk:s:sec:i', { order: 0, cells: ownProtoKey([1, 1, 'conn']) }],
  ])('for the key %s a field id __proto__', (k, d) => {
    // #when
    const parsed = parseRecord(candidateOf(k, d, 1));
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
    const text = '{"k":"link:t","d":{"s":"s","c":"token"},"c":3,"a":"conn"}';
    // #when
    const parsed = parseStoredRecord(text, 'link:t');
    // #then
    expect(parsed).toEqual({
      ok: true,
      value: { k: 'link:t', d: { s: 's', c: 'token' }, c: 3, a: 'conn' },
    });
  });
  test('refuses text that is not JSON without throwing', () => {
    // #when
    const parsed = parseStoredRecord('{not json', 'link:t');
    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
  test('refuses valid JSON that is not a record', () => {
    // #when
    const parsed = parseStoredRecord(
      '{"k":"link:t","d":{"s":"s","c":"token"},"c":0,"a":"conn"}',
      'link:t',
    );

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
  test('refuses a valid record filed under another key', () => {
    // #when
    const parsed = parseStoredRecord('{"k":"link:t","d":{"s":"s"},"c":3,"a":"conn"}', 'link:other');
    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-record' });
  });
});

describe('repKey', () => {
  test('names one repeat block as blk:{sheetId}:{sectionId}:{instanceId}', () => {
    // #when
    const key = repKey('s1', 'attack', 'i1');
    // #then
    expect(key).toBe('blk:s1:attack:i1');
  });
});

function candidateOf(k: string, d: JsonValue, c: number): JsonObject {
  const candidate: JsonObject = { k, d, c, a: 'conn' };

  if (k.startsWith('blk:')) candidate.l = [1, 'conn'];

  return candidate;
}

// An object with an own `__proto__` key, as JSON.parse makes one from a message or stored text.
function ownProtoKey(value: JsonValue): JsonObject {
  const object: JsonObject = {};
  Object.defineProperty(object, '__proto__', {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });

  return object;
}
