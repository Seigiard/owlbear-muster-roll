import { describe, expect, test } from 'bun:test';

import { fitsOneMessage, jsonByteLength, recordFitsOneMessage, splitBatch } from './message-size';

describe('jsonByteLength', () => {
  test('counts UTF-8 bytes, not characters', () => {
    // #when
    const bytes = jsonByteLength('ы');

    // #then: two quotes plus two bytes.
    expect(bytes).toBe(4);
  });
});

describe('fitsOneMessage', () => {
  test('accepts 14999 bytes of JSON', () => {
    // #when
    const fits = fitsOneMessage('a'.repeat(14997));

    // #then
    expect(fits).toBe(true);
  });

  test('refuses exactly 15000 bytes of JSON', () => {
    // #when
    const fits = fitsOneMessage('a'.repeat(14998));

    // #then
    expect(fits).toBe(false);
  });

  test('counts multibyte text by its bytes', () => {
    // #when
    const fits = fitsOneMessage('ы'.repeat(8000));

    // #then
    expect(fits).toBe(false);
  });
});

describe('recordFitsOneMessage', () => {
  test('accepts a small record', () => {
    // #when
    const fits = recordFitsOneMessage({ k: 'link:t', d: 's', c: 1, a: 'conn' });

    // #then
    expect(fits).toBe(true);
  });

  test('refuses a record that fits alone but leaves no room for its message', () => {
    // #when
    const fits = recordFitsOneMessage({ k: 'link:t', d: 'x'.repeat(14900), c: 1, a: 'conn' });

    // #then
    expect(fits).toBe(false);
  });
});

describe('splitBatch', () => {
  test('makes one empty part for an empty batch', () => {
    // #when
    const split = splitBatch([], 100);

    // #then
    expect(split).toEqual({ ok: true, value: [[]] });
  });

  test('keeps a batch that fits in one part', () => {
    // #when
    const split = splitBatch(['a', 'b'], 100);

    // #then
    expect(split).toEqual({ ok: true, value: [['a', 'b']] });
  });

  test('keeps every part with its envelope under the limit for multibyte text', () => {
    // #given
    const items = Array.from({ length: 40 }, () => 'ы'.repeat(1000));
    const envelopeBytes = jsonByteLength({ t: 'delta', records: [] });

    // #when
    const split = splitBatch(items, envelopeBytes);

    // #then
    expect(
      split.ok
        ? split.value.map((part) => jsonByteLength({ t: 'delta', records: part }) < 15000)
        : [],
    ).toEqual([true, true, true, true, true, true]);
  });

  test('keeps the items in order across parts', () => {
    // #given
    const items = Array.from({ length: 10 }, (_unused, index) => `${index}${'a'.repeat(4000)}`);

    // #when
    const split = splitBatch(items, 50);

    // #then
    expect(split.ok ? split.value.flat() : []).toEqual(items);
  });

  test('fills a part exactly up to 14999 bytes with its envelope', () => {
    // #given: envelope 9 bytes, so an item of 14990 bytes leaves the total at 14999.
    const item = 'a'.repeat(14988);

    // #when
    const split = splitBatch([item], 9);

    // #then
    expect(split).toEqual({ ok: true, value: [[item]] });
  });

  test('refuses an item that cannot fit one message', () => {
    // #when
    const split = splitBatch(['a'.repeat(14989)], 9);

    // #then
    expect(split).toEqual({ ok: false, error: 'item-too-large' });
  });
});
