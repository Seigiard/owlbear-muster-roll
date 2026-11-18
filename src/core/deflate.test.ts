import { describe, expect, test } from 'bun:test';
import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';

const LARGE_CAP = 1024 * 1024;

describe('deflate', () => {
  test('gives back the text it deflated, letters outside ASCII included', () => {
    // #when
    const text = inflateFromBase64(deflateToBase64('Брок 🎲'.repeat(20000)), LARGE_CAP);
    // #then
    expect(text).toEqual({ ok: true, value: 'Брок 🎲'.repeat(20000) });
  });
  test('refuses data that is not deflated base64', () => {
    // #when
    const results = [
      inflateFromBase64('%%%', LARGE_CAP),
      inflateFromBase64(btoa('plain text'), LARGE_CAP),
    ];

    // #then
    expect(results).toEqual([
      { ok: false, error: 'invalid-data' },
      { ok: false, error: 'invalid-data' },
    ]);
  });
  test('refuses data that inflates past the cap, and takes data that inflates to it', () => {
    // #given a few hundred bytes that inflate to a megabyte
    const data = deflateToBase64('a'.repeat(1024 * 1024));

    // #when
    const results = [
      inflateFromBase64(data, 1024 * 1024 - 1),
      inflateFromBase64(data, 1024 * 1024),
    ];

    // #then
    expect(data.length).toBeLessThan(15000);
    expect(results[0]).toEqual({ ok: false, error: 'too-large' });
    expect(results[1]).toEqual({ ok: true, value: 'a'.repeat(1024 * 1024) });
  });
});
