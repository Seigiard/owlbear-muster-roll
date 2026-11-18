import { describe, expect, test } from 'bun:test';
import { createBoundedIdSet } from './bounded-id-set';

describe('createBoundedIdSet', () => {
  test('remembers an added id', () => {
    // #given
    const ids = createBoundedIdSet(2);
    // #when
    ids.add('a');
    // #then
    expect(ids.has('a')).toBe(true);
  });
  test('forgets the oldest id past the limit and keeps the newer ones', () => {
    // #given
    const ids = createBoundedIdSet(2);
    // #when
    ids.add('a');
    ids.add('b');
    ids.add('c');
    // #then
    expect([ids.has('a'), ids.has('b'), ids.has('c')]).toEqual([false, true, true]);
  });
});
