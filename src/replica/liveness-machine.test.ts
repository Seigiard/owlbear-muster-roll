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

function onlineAt(now: number): LivenessPhase {
  return step(livenessTable, initialLiveness(), {
    kind: 'heard',
    senderRole: 'GM',
    message: { t: 'commit' },
    env: { ...createEnvironment('online'), now },
  }).phase;
}

function pingedAt(phase: LivenessPhase, now: number): LivenessPhase {
  return step(livenessTable, phase, {
    kind: 'fired',
    timer: { kind: 'ping' },
    env: { ...createEnvironment('online'), now },
  }).phase;
}

function silenceAt(now: number): Extract<LivenessEvent, { kind: 'fired' }> {
  return {
    kind: 'fired',
    timer: { kind: 'gm-silence' },
    env: { ...createEnvironment('online'), now },
  };
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

  test('takes an online GM link offline when its silence timer fires after an unanswered ping', () => {
    // #given: online at 0, so silence is due at 80, and a ping at 60 got no reply.

    const online = pingedAt(onlineAt(0), 60);
    // #when

    const result = stepView(online, silenceAt(80));
    // #then

    expect(result).toEqual({ phase: 'offline', effects: [{ type: 'show', projectedOnly: true }] });
  });

  test('takes the GM link offline when its silence timer fires up to a quarter late', () => {
    // #given: online at 0, so silence is due at 80, and a ping at 60 got no reply.

    const online = pingedAt(onlineAt(0), 60);
    // #when

    const result = stepView(online, silenceAt(100));
    // #then

    expect(result).toEqual({ phase: 'offline', effects: [{ type: 'show', projectedOnly: true }] });
  });

  test('keeps an online GM link and pings again when its silence timer fires more than a quarter late', () => {
    // #given: online at 0, so silence is due at 80, and a ping at 60.

    const online = pingedAt(onlineAt(0), 60);
    // #when

    const result = stepView(online, silenceAt(101));
    // #then

    expect(result).toEqual({
      phase: 'online',
      effects: [{ type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 20 }, { type: 'ping' }],
    });
  });

  test('keeps an online GM link and pings again when its last ping is under a quarter old', () => {
    // #given: online at 0; the page woke at 79 and its overdue ping went out then.

    const online = pingedAt(onlineAt(0), 79);
    // #when

    const result = stepView(online, silenceAt(80));
    // #then

    expect(result).toEqual({
      phase: 'online',
      effects: [{ type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 20 }, { type: 'ping' }],
    });
  });

  test('keeps an online GM link and pings when its silence timer fires with no ping since it was armed', () => {
    // #given

    const online = onlineAt(0);
    // #when

    const result = stepView(online, silenceAt(80));
    // #then

    expect(result).toEqual({
      phase: 'online',
      effects: [{ type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 20 }, { type: 'ping' }],
    });
  });

  test('a watch moves the silence due time of an online link', () => {
    // #given: online at 0, watched again at 50, so silence is due at 130; a ping at 110.

    const watched = step(livenessTable, onlineAt(0), {
      kind: 'watch',
      env: { ...createEnvironment('online'), now: 50 },
    }).phase;
    // #when

    const result = stepView(pingedAt(watched, 110), silenceAt(140));
    // #then

    expect(result).toEqual({ phase: 'offline', effects: [{ type: 'show', projectedOnly: true }] });
  });

  test('takes the link offline when the recheck a quarter after its ping hears nothing', () => {
    // #given: a late silence at 101 pinged and armed the recheck for 121.

    const rechecked = step(livenessTable, pingedAt(onlineAt(0), 60), silenceAt(101)).phase;
    // #when

    const result = stepView(rechecked, silenceAt(121));
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

  // The online phases below heard the GM at 0 and pinged at 60: silence at 80 is on time after
  // an unanswered ping, and at 101 more than a quarter late.
  const silence = silenceAt(80);

  const lateSilence = silenceAt(101);

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
            pingedAt(
              events.reduce(
                (phase, event) => step(livenessTable, phase, event).phase,
                initialLiveness(),
              ),
              60,
            ),
          )
          .filter(
            (phase): phase is Extract<LivenessPhase, { kind: 'online' }> => phase.kind === 'online',
          ),
      },
      events: {
        heard: fc.constant(heard),
        fired: fc.constantFrom(silence, lateSilence),
        watch: fc.constant(watch),
      },
      allowedEffects: { offline: allEffects, online: allEffects },
      invariants: [],
      diagram: 'docs/machines/liveness.md',
    });
  // #then

  expect(check).not.toThrow();
});
