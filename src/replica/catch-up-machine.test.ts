import { expect, test } from 'bun:test';
import fc from 'fast-check';
import type { Generation } from '@/core/storage-key';
import { checkMachine } from '../../tests/support/machine-check';
import { step } from '@/replica/machine';
import {
  catchUpTable,
  initialPhase,
  type CatchUpEnv,
  type Effect,
  type Event,
  type Phase,
} from '@/replica/catch-up-table';

const INITIAL: Generation = { n: 0, a: '' };
const NEXT: Generation = { n: 1, a: 'gm-a' };

const environment: CatchUpEnv = {
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
  newId: () => 'r-1',
};

const events = [
  { kind: 'enter', trigger: 'start', env: environment },
  { kind: 'watch', env: environment },
  { kind: 'room-copy-read', r: 'r-1', fresh: true, env: environment },
  { kind: 'party-read', r: 'r-1', players: [], env: environment },
  { kind: 'generation-heard', generation: NEXT, keepNonce: false, env: environment },
  { kind: 'generation-read', generation: NEXT, env: environment },
  { kind: 'adoption-staged', env: environment },
  { kind: 'heard', senderRole: 'GM', message: { t: 'commit' }, env: environment },
  { kind: 'state-requested', r: 'r-1', env: environment },
  { kind: 'ping', env: environment },
  {
    kind: 'alive',
    message: { v: 4, g: INITIAL, t: 'alive', digest: 10 },
    sender: 'gm-a',
    relation: 'equal',
    env: environment,
  },
  {
    kind: 'state-merged',
    message: { v: 4, g: INITIAL, t: 'state', r: 'r-1', i: 1, n: 1, records: 'eA==' },
    sender: 'gm-a',
    relation: 'equal',
    env: environment,
  },
  { kind: 'fired', timer: { kind: 'catch-up' }, env: environment },
  { kind: 'closing', env: environment },
  { kind: 'party-changed', players: [], env: environment },
  { kind: 'replica-replaced', env: environment },
  { kind: 'adoption-saved', saved: true, env: environment },
] as const satisfies readonly Event[];

function walk(eventsToRun: readonly Event[]): Phase {
  return eventsToRun.reduce(
    (phase, event) => step(catchUpTable, phase, event).phase,
    initialPhase(),
  );
}

function phaseArbitrary<K extends Phase['kind']>(
  prefix: readonly Event[],
  kind: K,
): fc.Arbitrary<Extract<Phase, { readonly kind: K }>> {
  return fc
    .array(fc.constantFrom(...events), { maxLength: 4 })
    .map((suffix) => walk([...prefix, ...suffix]))
    .filter((phase): phase is Extract<Phase, { readonly kind: K }> => phase.kind === kind);
}

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

test('catch-up transition table has valid phases, effects, invariants, and diagram', () => {
  // #given

  const enter = events[0];
  const generationHeard = events[4];
  const stateMerged = events[11];

  if (enter === undefined || generationHeard === undefined || stateMerged === undefined) {
    throw new Error('catch-up machine event fixtures are incomplete');
  }
  // #when

  const check = () =>
    checkMachine({
      name: 'catch-up',
      table: catchUpTable,
      phases: {
        initializing: phaseArbitrary([], 'initializing'),
        'catching-up': phaseArbitrary([enter], 'catching-up'),
        adopting: phaseArbitrary([enter, generationHeard], 'adopting'),
        live: phaseArbitrary([enter, stateMerged], 'live'),
      },
      events: {
        enter: fc.constant(enter),
        watch: fc.constant(events[1]),
        'room-copy-read': fc.constant(events[2]),
        'party-read': fc.constant(events[3]),
        'generation-heard': fc.constant(generationHeard),
        'generation-read': fc.constant(events[5]),
        'adoption-staged': fc.constant(events[6]),
        heard: fc.constant(events[7]),
        'state-requested': fc.constant(events[8]),
        ping: fc.constant(events[9]),
        alive: fc.constant(events[10]),
        'state-merged': fc.constant(stateMerged),
        fired: fc.constant(events[12]),
        closing: fc.constant(events[13]),
        'party-changed': fc.constant(events[14]),
        'replica-replaced': fc.constant(events[15]),
        'adoption-saved': fc.constant(events[16]),
      },
      allowedEffects: {
        initializing: allEffects,
        'catching-up': allEffects,
        adopting: allEffects,
        live: allEffects,
      },
      invariants: [
        {
          name: 'sent nonce belongs to the active catch-up',
          holds: (phase) =>
            (phase.kind !== 'catching-up' && phase.kind !== 'adopting') ||
            phase.active.sentNonce === null ||
            phase.active.sentNonce === phase.active.nonce,
        },
        {
          name: 'adoption keeps its catch-up target',
          holds: (phase) => phase.kind !== 'adopting' || ('active' in phase && 'target' in phase),
        },
        {
          name: 'initializing and live have no active catch-up',
          holds: (phase) =>
            (phase.kind !== 'initializing' && phase.kind !== 'live') || !('active' in phase),
        },
      ],
      diagram: 'docs/machines/catch-up.md',
    });
  // #then

  expect(check).not.toThrow();
});
