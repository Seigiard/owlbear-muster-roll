import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import type { Generation } from '@/core/storage-key';
import { checkMachine } from '../../tests/support/machine-check';
import { step } from '@/replica/machine';
import {
  initialLiveness,
  livenessTable,
  type CatchUpEnv,
  type Effect,
  type LivenessEvent,
  type LivenessPhase,
} from '@/replica/catch-up-table';

const INITIAL: Generation = { n: 0, a: '' };

function createEnvironment(gmLink: CatchUpEnv['gmLink'] = 'offline'): CatchUpEnv {
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
    gmLink,
    random: () => 0,
    newId: () => 'r-1',
  };
}

function stepView(phase: LivenessPhase, event: LivenessEvent) {
  const result = step(livenessTable, phase, event);

  return { phase: result.phase.kind, effects: result.effects };
}

describe('livenessTable', () => {
  test('brings an offline GM link online when a GM message is heard', () => {
    // #given

    const env = createEnvironment();
    // #when

    const result = stepView(initialLiveness(), {
      kind: 'heard',
      senderRole: 'GM',
      message: { t: 'commit' },
      env,
    });
    // #then

    expect(result).toEqual({
      phase: 'online',
      effects: [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 40 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
        { type: 'gm-back' },
        { type: 'show', projectedOnly: true },
      ],
    });
  });

  test('takes an online GM link offline when its silence timer fires', () => {
    // #given

    const env = createEnvironment('online');

    const online = step(livenessTable, initialLiveness(), {
      kind: 'heard',
      senderRole: 'GM',
      message: { t: 'commit' },
      env,
    }).phase;
    // #when

    const result = stepView(online, { kind: 'fired', timer: { kind: 'gm-silence' }, env });
    // #then

    expect(result).toEqual({ phase: 'offline', effects: [{ type: 'show', projectedOnly: true }] });
  });

  test('rearms liveness watches when a GM message leaves the link online', () => {
    // #given

    const env = createEnvironment('online');

    const online = step(livenessTable, initialLiveness(), {
      kind: 'heard',
      senderRole: 'GM',
      message: { t: 'commit' },
      env,
    }).phase;
    // #when

    const result = stepView(online, {
      kind: 'heard',
      senderRole: 'GM',
      message: { t: 'commit' },
      env,
    });
    // #then

    expect(result).toEqual({
      phase: 'online',
      effects: [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 40 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
      ],
    });
  });

  test('emits nothing when the offline silence timer fires again', () => {
    // #given

    const env = createEnvironment();
    // #when

    const result = stepView(initialLiveness(), {
      kind: 'fired',
      timer: { kind: 'gm-silence' },
      env,
    });
    // #then

    expect(result).toEqual({ phase: 'offline', effects: [] });
  });

  test('keeps the link unchanged for a catch-up-only timer', () => {
    // #given

    const env = createEnvironment();
    // #when

    const result = stepView(initialLiveness(), {
      kind: 'fired',
      timer: { kind: 'catch-up' },
      env,
    });
    // #then

    expect(result).toEqual({ phase: 'offline', effects: [] });
  });
});

const allEffects = [
  'arm',
  'disarm',
  'entered',
  'read-room-copy',
  'read-party',
  'request',
  'answer',
  'alive',
  'ping',
  'caught-up',
  'show',
  'gm-back',
  'adopt',
] as const satisfies readonly Effect['type'][];

test('liveness transition table has valid phases, effects, and diagram', () => {
  // #given

  const offlineEnvironment = createEnvironment();

  const onlineEnvironment = createEnvironment('online');

  const heard: LivenessEvent = {
    kind: 'heard',
    senderRole: 'GM',
    message: { t: 'commit' },
    env: onlineEnvironment,
  };

  const silence: LivenessEvent = {
    kind: 'fired',
    timer: { kind: 'gm-silence' },
    env: offlineEnvironment,
  };

  const watch: LivenessEvent = { kind: 'watch', env: offlineEnvironment };
  // #when

  const check = () =>
    checkMachine({
      name: 'liveness',
      table: livenessTable,
      phases: {
        offline: fc
          .array(fc.constant(watch), { maxLength: 4 })
          .map(() => initialLiveness())
          .filter(
            (phase): phase is Extract<LivenessPhase, { kind: 'offline' }> =>
              phase.kind === 'offline',
          ),
        online: fc
          .array(fc.constant(heard), { minLength: 1, maxLength: 4 })
          .map((events) =>
            events.reduce(
              (phase, event) => step(livenessTable, phase, event).phase,
              initialLiveness(),
            ),
          )
          .filter(
            (phase): phase is Extract<LivenessPhase, { kind: 'online' }> => phase.kind === 'online',
          ),
      },
      events: {
        heard: fc.constant(heard),
        fired: fc.constant(silence),
        watch: fc.constant(watch),
      },
      allowedEffects: { offline: allEffects, online: allEffects },
      invariants: [],
      diagram: 'docs/machines/liveness.md',
    });
  // #then

  expect(check).not.toThrow();
});
