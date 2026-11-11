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

  test('starts the GM link timeout at the 20 s of the 2.4 spec', () => {
    // #then
    expect(TIMING.gmLinkTimeoutMs).toBe(20000);
  });

  test('starts the room copy pause at 3 s with 2 s of jitter, as the 2.5 spec says', () => {
    // #then
    expect([TIMING.snapshotPauseMs, TIMING.snapshotJitterMs]).toEqual([3000, 2000]);
  });
});
