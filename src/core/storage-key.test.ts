import { describe, expect, test } from 'bun:test';
import { Result } from 'better-result';
import {
  buildStorageKey,
  generationMarkerKey,
  incompleteMarkerKey,
  INITIAL_GENERATION,
  isOlderFormatRoomKey,
  parseGenerationMarkerKey,
  parseIncompleteMarkerKey,
  parseStorageKey,
  roomKeyFormat,
} from '@/core/storage-key';

const INVALID = Result.err<never, 'invalid-storage-key'>('invalid-storage-key');

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
    expect(built).toEqual(Result.ok('mr4:r:2:x:preset'));
  });
  test('builds the key of the initial generation with an empty author segment', () => {
    // #when
    const built = buildStorageKey('r', { n: 0, a: '' }, 'blk:s');
    // #then
    expect(built).toEqual(Result.ok('mr4:r:0::blk:s'));
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
    const parsed = parseStorageKey('mr4:r:2:x:blk:s:sec:i');
    // #then
    expect(parsed).toEqual(
      Result.ok({ roomId: 'r', generation: { n: 2, a: 'x' }, key: 'blk:s:sec:i' }),
    );
  });
  test('reads an empty generation author', () => {
    // #when
    const parsed = parseStorageKey('mr4:r:0::preset');
    // #then
    expect(parsed).toEqual(Result.ok({ roomId: 'r', generation: { n: 0, a: '' }, key: 'preset' }));
  });
  test.each([
    ['the older format version', 'mr1:r:2:x:preset'],
    ['the format 2', 'mr2:r:2:x:preset'],
    ['the format 3', 'mr3:r:2:x:preset'],
    ['a newer format version', 'mr5:r:2:x:preset'],
    ['a key of another application', 'theme'],
    ['a missing record key', 'mr4:r:2:x'],
    ['an empty room id', 'mr4::2:x:preset'],
    ['a non-numeric generation', 'mr4:r:two:x:preset'],
    ['a generation with a leading zero', 'mr4:r:02:x:preset'],
    ['a negative generation', 'mr4:r:-1:x:preset'],
    ['a generation in exponent form', 'mr4:r:1e3:x:preset'],
    ['an unknown record key', 'mr4:r:2:x:note:1'],
    ['an old row key in the new storage format', 'mr4:r:2:x:row:s:f'],
    ['an old repeat key in the new storage format', 'mr4:r:2:x:rep:s:scope:id'],
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
    expect({ key, asRecord: key.isOk() ? parseStorageKey(key.value).isOk() : true }).toEqual({
      key: Result.ok('mr4:room:3:gm:#incomplete'),
      asRecord: false,
    });
  });
  test('reads its room and generation back', () => {
    // #when
    const parts = parseIncompleteMarkerKey('mr4:room:0::#incomplete');
    // #then
    expect(parts).toEqual(Result.ok({ roomId: 'room', generation: { n: 0, a: '' } }));
  });
  test('does not read a record key as a marker', () => {
    // #when
    const parts = parseIncompleteMarkerKey('mr4:room:3:gm:blk:brok');
    // #then
    expect(parts.isOk()).toBe(false);
  });
});

describe('generation marker', () => {
  test('builds a key under the generation that no record key can take', () => {
    // #when
    const key = generationMarkerKey('room', { n: 3, a: 'gm' });
    // #then
    expect({ key, asRecord: key.isOk() ? parseStorageKey(key.value).isOk() : true }).toEqual({
      key: Result.ok('mr4:room:3:gm:#generation'),
      asRecord: false,
    });
  });
  test('reads its room and generation back', () => {
    // #when
    const parts = parseGenerationMarkerKey('mr4:room:0::#generation');
    // #then
    expect(parts).toEqual(Result.ok({ roomId: 'room', generation: { n: 0, a: '' } }));
  });
  test.each([
    ['an incomplete marker', 'mr4:room:3:gm:#incomplete'],
    ['a record key', 'mr4:room:3:gm:blk:brok'],
    ['a marker of the older format', 'mr1:room:3:gm:#generation'],
  ])('does not read %s as a generation marker', (_name, storageKey) => {
    // #when
    const parts = parseGenerationMarkerKey(storageKey);
    // #then
    expect(parts.isOk()).toBe(false);
  });
});

describe('roomKeyFormat', () => {
  test.each<[string, string, number | null]>([
    ['a key of the current format', 'mr4:room:3:gm:preset', 4],
    ['a key of the format 3', 'mr3:room:3:gm:preset', 3],
    ['a key of the format 2', 'mr2:room:3:gm:preset', 2],
    ['a key of the older format', 'mr1:room:3:gm:preset', 1],
    ['a marker of the older format', 'mr1:room:3:gm:#incomplete', 1],
    ['a key of a newer format', 'mr7:room:3:gm:preset', 7],
    ['a key of another room', 'mr1:other:3:gm:preset', null],
    ['a key of another application', 'theme', null],
    ['a format with a leading zero', 'mr01:room:3:gm:preset', null],
    ['a format with no number', 'mr:room:3:gm:preset', null],
  ])('reads %s', (_name, storageKey, format) => {
    // #when
    const read = roomKeyFormat(storageKey, 'room');
    // #then
    expect(read).toBe(format);
  });
});

describe('isOlderFormatRoomKey', () => {
  test.each<[string, string, boolean]>([
    ['a key of the format 1', 'mr1:room:3:gm:preset', true],
    ['a key of the format 2', 'mr2:room:3:gm:preset', true],
    ['a key of the format 3', 'mr3:room:3:gm:preset', true],
    ['a key of the current format', 'mr4:room:3:gm:preset', false],
    ['a key of a newer format', 'mr5:room:3:gm:preset', false],
    ['a key of the format 1 for another room', 'mr1:other:3:gm:preset', false],
  ])('answers for %s', (_name, storageKey, older) => {
    // #when
    const answer = isOlderFormatRoomKey(storageKey, 'room');
    // #then
    expect(answer).toBe(older);
  });
});
