import { describe, expect, test } from 'bun:test';
import type { CommandOutcomePromise } from '@/ui/replica-client';
import { initialWipeState, wipeReducer } from './wipe-actions-reducer';

describe('wipeReducer', () => {
  test('confirms an asking wipe with its supplied outcome', () => {
    // #given
    const outcome = wipeOutcome();
    const asking = { phase: 'asking' as const, ask: 1 };
    // #when
    const confirmed = wipeReducer(asking, { type: 'confirm', outcome });
    // #then
    expect(confirmed).toEqual({ phase: 'wiping', outcome, ask: 1 });
  });
  test('cancels an asking wipe without advancing its ask count', () => {
    // #given
    const asking = { phase: 'asking' as const, ask: 1 };
    // #when
    const cancelled = wipeReducer(asking, { type: 'cancel' });
    // #then
    expect(cancelled).toEqual({ phase: 'idle', message: null, ask: 1 });
  });
  test('ignores a second ask while a wipe is sending', () => {
    // #given
    const wiping = { phase: 'wiping' as const, outcome: wipeOutcome(), ask: 1 };
    // #when
    const repeated = wipeReducer(wiping, { type: 'ask', catchingUp: false });
    // #then
    expect(repeated).toBe(wiping);
  });
  test('increments the ask count when asking again before confirmation', () => {
    // #given
    const asking = { phase: 'asking' as const, ask: 1 };
    // #when
    const repeated = wipeReducer(asking, { type: 'ask', catchingUp: false });
    // #then
    expect(repeated).toEqual({ phase: 'asking', ask: 2 });
  });
  test('does not confirm after catch-up starts during a wipe confirmation', () => {
    // #given
    const outcome = wipeOutcome();
    const asking = { phase: 'asking' as const, ask: 1 };
    const cancelled = wipeReducer(asking, { type: 'catch-up-started' });
    // #when
    const confirmed = wipeReducer(cancelled, { type: 'confirm', outcome });
    // #then
    expect(confirmed).toEqual({ phase: 'idle', message: null, ask: 1 });
  });
  test('keeps the original outcome when confirming again while wiping', () => {
    // #given
    const originalOutcome = wipeOutcome();
    const wiping = { phase: 'wiping' as const, outcome: originalOutcome, ask: 1 };
    // #when
    const repeated = wipeReducer(wiping, { type: 'confirm', outcome: wipeOutcome() });
    // #then
    expect(repeated).toBe(wiping);
  });
  test('returns a matching answered wipe outcome to exact idle without a message', () => {
    // #given
    const request = wipeOutcome();
    const wiping = { phase: 'wiping' as const, outcome: request, ask: 1 };

    // #when
    const settled = wipeReducer(wiping, {
      type: 'outcome',
      request,
      result: { kind: 'answered', answer: undefined },
    });

    // #then
    expect(settled).toEqual({ phase: 'idle', message: null, ask: 1 });
  });
  test('clears the catch-up refusal message when catch-up ends', () => {
    // #given
    const refusedDuringCatchUp = {
      phase: 'idle' as const,
      message: 'Загрузка…',
      untilCatchUpEnds: true,
      ask: 1,
    };

    // #when
    const cleared = wipeReducer(refusedDuringCatchUp, { type: 'catch-up-ended' });
    // #then
    expect(cleared).toEqual({ phase: 'idle', message: null, ask: 1 });
  });
  test('returns a matching write-failed refusal to the exact idle failure state', () => {
    // #given
    const request = wipeOutcome();
    const wiping = { phase: 'wiping' as const, outcome: request, ask: 1 };

    // #when
    const refused = wipeReducer(wiping, {
      type: 'outcome',
      request,
      result: {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: 'wipe-1', reason: 'write-failed' },
      },
    });

    // #then
    expect(refused).toEqual({
      phase: 'idle',
      message: 'Не удалось очистить. Попробуйте ещё раз.',
      untilCatchUpEnds: false,
      ask: 1,
    });
  });
  test('returns a matching timed-out wipe outcome to the exact idle failure state', () => {
    // #given
    const request = wipeOutcome();
    const wiping = { phase: 'wiping' as const, outcome: request, ask: 1 };

    // #when
    const timedOut = wipeReducer(wiping, {
      type: 'outcome',
      request,
      result: { kind: 'timed-out' },
    });

    // #then
    expect(timedOut).toEqual({
      phase: 'idle',
      message: 'Не удалось очистить. Попробуйте ещё раз.',
      ask: 1,
    });
  });
  test('blocks opening wipe confirmation while catch-up is in progress', () => {
    // #given
    const idle = initialWipeState;
    // #when
    const blocked = wipeReducer(idle, { type: 'ask', catchingUp: true });
    // #then
    expect(blocked).toEqual({ phase: 'idle', message: null, ask: 0 });
  });
});

function wipeOutcome(): CommandOutcomePromise<undefined> {
  return Promise.resolve({ kind: 'answered', answer: undefined });
}
