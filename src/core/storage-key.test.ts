import { describe, expect, test } from 'bun:test';

import { ok } from '@/core/result';
import {
  buildStorageKey,
  incompleteMarkerKey,
  INITIAL_GENERATION,
  parseIncompleteMarkerKey,
  parseStorageKey,
} from '@/core/storage-key';

const INVALID = { ok: false, error: 'invalid-storage-key' } as const;

describe('INITIAL_GENERATION', () => {
  test('is generation zero with an empty author', () => {
    // #then
    expect(INITIAL_GENERATION).toEqual({ n: 0, a: '' });
  });
});

describe('buildStorageKey', () => {
  test('builds the AD-11 key', () => {
    // #when
    const built = buildStorageKey('r', { n: 2, a: 'x' }, 'preset');

    // #then
    expect(built).toEqual({ ok: true, value: 'mr1:r:2:x:preset' });
  });

  test('builds the key of the initial generation with an empty author segment', () => {
    // #when
    const built = buildStorageKey('r', { n: 0, a: '' }, 'row:s:f');

    // #then
    expect(built).toEqual({ ok: true, value: 'mr1:r:0::row:s:f' });
  });

  test.each([
    ['a room id with a colon', 'r:1', { n: 1, a: 'x' }, 'preset'],
    ['an empty room id', '', { n: 1, a: 'x' }, 'preset'],
    ['a generation author with a colon', 'r', { n: 1, a: 'x:y' }, 'preset'],
    ['a negative generation', 'r', { n: -1, a: 'x' }, 'preset'],
    ['a fractional generation', 'r', { n: 1.5, a: 'x' }, 'preset'],
    ['an unknown record key', 'r', { n: 1, a: 'x' }, 'note:1'],
  ])('refuses %s', (_name, roomId, generation, key) => {
    // #when
    const built = buildStorageKey(roomId, generation, key);

    // #then
    expect(built).toEqual(INVALID);
  });
});

describe('parseStorageKey', () => {
  test('splits a key whose record key has colons of its own', () => {
    // #when
    const parsed = parseStorageKey('mr1:r:2:x:rep:s:sec:i');

    // #then
    expect(parsed).toEqual({
      ok: true,
      value: { roomId: 'r', generation: { n: 2, a: 'x' }, key: 'rep:s:sec:i' },
    });
  });

  test('reads an empty generation author', () => {
    // #when
    const parsed = parseStorageKey('mr1:r:0::preset');

    // #then
    expect(parsed).toEqual({
      ok: true,
      value: { roomId: 'r', generation: { n: 0, a: '' }, key: 'preset' },
    });
  });

  test.each([
    ['another format version', 'mr2:r:2:x:preset'],
    ['a key of another application', 'theme'],
    ['a missing record key', 'mr1:r:2:x'],
    ['an empty room id', 'mr1::2:x:preset'],
    ['a non-numeric generation', 'mr1:r:two:x:preset'],
    ['a generation with a leading zero', 'mr1:r:02:x:preset'],
    ['a negative generation', 'mr1:r:-1:x:preset'],
    ['a generation in exponent form', 'mr1:r:1e3:x:preset'],
    ['an unknown record key', 'mr1:r:2:x:note:1'],
  ])('refuses %s', (_name, storageKey) => {
    // #when
    const parsed = parseStorageKey(storageKey);

    // #then
    expect(parsed).toEqual(INVALID);
  });
});

describe('incomplete generation marker', () => {
  test('builds a key under the generation that no record key can take', () => {
    // #when
    const key = incompleteMarkerKey('room', { n: 3, a: 'gm' });

    // #then
    expect({ key, asRecord: key.ok ? parseStorageKey(key.value).ok : true }).toEqual({
      key: ok('mr1:room:3:gm:#incomplete'),
      asRecord: false,
    });
  });

  test('reads its room and generation back', () => {
    // #when
    const parts = parseIncompleteMarkerKey('mr1:room:0::#incomplete');

    // #then
    expect(parts).toEqual(ok({ roomId: 'room', generation: { n: 0, a: '' } }));
  });

  test('does not read a record key as a marker', () => {
    // #when
    const parts = parseIncompleteMarkerKey('mr1:room:3:gm:sheet:brok');

    // #then
    expect(parts.ok).toBe(false);
  });
});
