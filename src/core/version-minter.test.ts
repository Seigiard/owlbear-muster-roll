import { describe, expect, test } from 'bun:test';
import { createVersionMinter } from './version-minter';

describe('createVersionMinter', () => {
  test('takes the highest known counter + 1 with this connection as author', () => {
    // #given
    const minter = createVersionMinter('conn');
    // #when
    const version = minter.mint('preset', 7);
    // #then
    expect(version).toEqual({ c: 8, a: 'conn' });
  });
  test('starts a key nobody has written at 1', () => {
    // #given
    const minter = createVersionMinter('conn');
    // #when
    const version = minter.mint('preset', 0);
    // #then
    expect(version).toEqual({ c: 1, a: 'conn' });
  });
  test('never repeats a counter when knowledge of the key stays stale', () => {
    // #given
    const minter = createVersionMinter('conn');
    // #when
    const counters = [minter.mint('preset', 7).c, minter.mint('preset', 7).c];
    // #then
    expect(counters).toEqual([8, 9]);
  });
  test('follows newer knowledge that overtakes its own last counter', () => {
    // #given
    const minter = createVersionMinter('conn');
    minter.mint('preset', 7);
    // #when
    const version = minter.mint('preset', 20);
    // #then
    expect(version).toEqual({ c: 21, a: 'conn' });
  });
  test('keeps the last counter per key', () => {
    // #given
    const minter = createVersionMinter('conn');
    minter.mint('blk:a', 7);
    // #when
    const version = minter.mint('blk:b', 2);
    // #then
    expect(version).toEqual({ c: 3, a: 'conn' });
  });
});
