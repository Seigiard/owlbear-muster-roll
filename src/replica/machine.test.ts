import { describe, expect, test } from 'bun:test';
import { step, type TransitionTable } from '@/replica/machine';

type Phase = { readonly kind: 'idle' } | { readonly kind: 'active'; readonly count: number };

type Event =
  | { readonly kind: 'start' }
  | { readonly kind: 'increment' }
  | { readonly kind: 'stop' };

type Effect =
  | { readonly type: 'started' }
  | { readonly type: 'incremented' }
  | { readonly type: 'stopped' };

const table: TransitionTable<Phase, Event, Effect> = {
  idle: {
    start: () => ({ phase: { kind: 'active', count: 0 }, effects: [{ type: 'started' }] }),
    increment: 'ignore',
    stop: 'ignore',
  },
  active: {
    start: 'ignore',
    increment: (phase) => ({
      phase: { kind: 'active', count: phase.count + 1 },
      effects: [{ type: 'incremented' }],
    }),
    stop: () => ({ phase: { kind: 'idle' }, effects: [{ type: 'stopped' }] }),
  },
};

describe('step', () => {
  test('keeps the phase and emits no effects for an explicit ignore cell', () => {
    // #given
    const phase: Phase = { kind: 'idle' };
    // #when
    const result = step(table, phase, { kind: 'increment' });
    // #then
    expect(result).toEqual({ phase, effects: [] });
  });

  test('returns the literal transition from a two-phase table', () => {
    // #given
    const phase: Phase = { kind: 'active', count: 1 };
    // #when
    const result = step(table, phase, { kind: 'increment' });
    // #then
    expect(result).toEqual({
      phase: { kind: 'active', count: 2 },
      effects: [{ type: 'incremented' }],
    });
  });
});
