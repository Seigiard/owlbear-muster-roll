import { describe, expect, test } from 'bun:test';
import type { Generation } from '@/core/storage-key';
import { step } from '@/replica/machine';
import {
  catchUpTable,
  initialPhase,
  type CatchUpEnv,
  type Event,
  type Phase,
} from '@/replica/catch-up-table';

const INITIAL: Generation = { n: 0, a: '' };
const NEXT: Generation = { n: 1, a: 'gm-a' };

function createEnvironment(overrides: Partial<CatchUpEnv> = {}): CatchUpEnv {
  let id = 0;

  return {
    timing: {
      catchUpTimeoutMs: 100,
      stateAnswerDelayMinMs: 10,
      stateAnswerDelayMaxMs: 30,
      gmLinkTimeoutMs: 80,
      incompleteRequestStartMs: 40,
      incompleteRequestMaxMs: 160,
    },
    role: 'PLAYER',
    vouches: true,
    generation: INITIAL,
    digest: 10,
    commitsUnsent: false,
    hasData: true,
    now: 0,
    gmLink: 'offline',
    random: () => 0,
    newId: () => `r-${++id}`,
    ...overrides,
  };
}

function enter(
  env: CatchUpEnv,
  trigger: 'start' | 'page-return' | 'role' | 'generation' | 'drift' | 'gm-return',
): Event {
  return { kind: 'enter', trigger, env };
}

function phaseAfter(events: readonly Event[]): Phase {
  return events.reduce((phase, event) => step(catchUpTable, phase, event).phase, initialPhase());
}

function stepView(phase: Phase, event: Event) {
  const result = step(catchUpTable, phase, event);

  return { phase: result.phase.kind, effects: result.effects };
}

describe('catchUpTable conditional no-ops', () => {
  test('keeps catch-up for a room-copy read with a stale nonce', () => {
    // #given

    const env = createEnvironment();
    const phase = phaseAfter([enter(env, 'start')]);
    // #when

    const result = stepView(phase, { kind: 'room-copy-read', r: 'old', fresh: true, env });
    // #then

    expect(result).toEqual({ phase: 'catching-up', effects: [] });
  });

  test('keeps catch-up for a party read with a stale nonce', () => {
    // #given

    const env = createEnvironment({ role: 'GM' });
    const phase = phaseAfter([enter(env, 'start')]);
    // #when

    const result = stepView(phase, { kind: 'party-read', r: 'old', players: [], env });
    // #then

    expect(result).toEqual({ phase: 'catching-up', effects: [] });
  });

  test('ignores a generation that is not higher than the current generation', () => {
    // #given

    const env = createEnvironment();
    // #when

    const result = stepView(initialPhase(), {
      kind: 'generation-heard',
      generation: INITIAL,
      keepNonce: false,
      env,
    });
    // #then

    expect(result).toEqual({ phase: 'initializing', effects: [] });
  });

  test('keeps adoption active when another catch-up starts', () => {
    // #given

    const env = createEnvironment();

    const phase = phaseAfter([
      enter(env, 'start'),
      { kind: 'generation-heard', generation: NEXT, keepNonce: false, env },
    ]);
    // #when

    const result = stepView(phase, enter(env, 'role'));
    // #then

    expect(result).toEqual({
      phase: 'adopting',
      effects: [
        { type: 'entered', trigger: 'role', fresh: true },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 40 },
        { type: 'read-room-copy', r: 'r-3', fresh: true },
      ],
    });
  });

  test('ignores adoption-staged outside adoption', () => {
    // #given

    const env = createEnvironment();
    // #when

    const result = stepView(initialPhase(), { kind: 'adoption-staged', env });
    // #then

    expect(result).toEqual({ phase: 'initializing', effects: [] });
  });

  test('ignores a higher-generation state part outside adoption', () => {
    // #given

    const env = createEnvironment();
    const phase = phaseAfter([enter(env, 'start')]);
    // #when

    const result = stepView(phase, {
      kind: 'state-merged',
      message: { v: 4, g: NEXT, t: 'state', r: 'r-1', i: 1, n: 1, records: 'eA==' },
      sender: 'gm-a',
      relation: 'higher',
      env,
    });
    // #then

    expect(result).toEqual({ phase: 'catching-up', effects: [] });
  });

  test('ignores a request timer for a stale nonce', () => {
    // #given

    const env = createEnvironment();
    const phase = phaseAfter([enter(env, 'start')]);
    // #when

    const result = stepView(phase, { kind: 'fired', timer: { kind: 'request', r: 'old' }, env });
    // #then

    expect(result).toEqual({ phase: 'catching-up', effects: [] });
  });
});
