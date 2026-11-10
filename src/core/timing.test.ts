import { describe, expect, test } from 'bun:test';

import { TIMING } from './timing';

describe('timing constants', () => {
  test('starts send spacing at the 50 ms of AD-12', () => {
    // #then
    expect(TIMING.sendSpacingMs).toBe(50);
  });
});
