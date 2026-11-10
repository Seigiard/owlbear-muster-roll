import { describe, expect, test } from 'bun:test';

import { TIMING } from './timing';

describe('timing constants', () => {
  test('starts send spacing at the 50 ms of AD-12', () => {
    // #then
    expect(TIMING.sendSpacingMs).toBe(50);
  });

  test('starts the field save pause at the 800 ms of the 1.9 spec', () => {
    // #then
    expect(TIMING.fieldSavePauseMs).toBe(800);
  });

  test('starts catch-up at a 4 s timeout and an answer delay of 20 to 300 ms, as the 2.2 spec says', () => {
    // #then
    expect([
      TIMING.catchUpTimeoutMs,
      TIMING.stateAnswerDelayMinMs,
      TIMING.stateAnswerDelayMaxMs,
    ]).toEqual([4000, 20, 300]);
  });
});
