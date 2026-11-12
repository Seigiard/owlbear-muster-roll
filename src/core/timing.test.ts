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

  test('holds a sheet opened from a token for a window 15 s', () => {
    // #then
    expect(TIMING.openRequestTtlMs).toBe(15000);
  });

  test('gives up on a preset diff or upload with no answer after 15 s', () => {
    // #then
    expect(TIMING.presetRequestTimeoutMs).toBe(15000);
  });

  test('asks again for an incomplete generation after 2 s, doubling up to 30 s, as the 5.3 spec says', () => {
    // #then
    expect([TIMING.incompleteRequestStartMs, TIMING.incompleteRequestMaxMs]).toEqual([2000, 30000]);
  });

  test('gives up on a snapshot import with no answer after 60 s', () => {
    // #then
    expect(TIMING.snapshotImportTimeoutMs).toBe(60000);
  });

  test('gives ordinary commands 15 s, and access and link changes 5 s', () => {
    // #then
    expect([
      TIMING.commandTimeoutMs,
      TIMING.accessChangeTimeoutMs,
      TIMING.linkSetTimeoutMs,
    ]).toEqual([15000, 5000, 5000]);
  });

  test('gives wipe the same 60 s as snapshot import', () => {
    // #then
    expect([TIMING.wipeTimeoutMs, TIMING.snapshotImportTimeoutMs]).toEqual([60000, 60000]);
  });

  test('gives a roll 90 s for the dice extension and the GM answer', () => {
    // #then
    expect(TIMING.rollTimeoutMs).toBe(90000);
  });
});
