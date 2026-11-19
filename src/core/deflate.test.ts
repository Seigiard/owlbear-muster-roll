import { Result } from 'better-result';
import { describe, expect, test } from 'bun:test';
import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';

const LARGE_CAP = 1024 * 1024;

describe('deflate', () => {
  test('gives back the text it deflated, letters outside ASCII included', () => {
    // #when
    const text = inflateFromBase64(deflateToBase64('Брок 🎲'.repeat(20000)), LARGE_CAP);
    // #then
    expect(text).toEqual(Result.ok('Брок 🎲'.repeat(20000)));
  });
  test('refuses data that is not deflated base64', () => {
    // #when
    const results = [
      inflateFromBase64('%%%', LARGE_CAP),
      inflateFromBase64(btoa('plain text'), LARGE_CAP),
    ];

    // #then
    expect(results).toEqual([Result.err('invalid-data'), Result.err('invalid-data')]);
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
    expect(results[0]).toEqual(Result.err('too-large'));
    expect(results[1]).toEqual(Result.ok('a'.repeat(1024 * 1024)));
  });
});
