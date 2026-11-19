import { Result } from 'better-result';
import { expect, test } from 'bun:test';
import fc from 'fast-check';
import type { VersionedRecord } from '@/core/records';
import type { Generation } from '@/core/storage-key';
import { checkMachine } from '../../tests/support/machine-check';
import {
  generationTable,
  initialPhase,
  type Effect,
  type Event,
  type Phase,
} from './generation-table';
import { step } from './machine';

const own = { n: 3, a: 'gm-a' };
const target = { n: 5, a: 'gm-b' };

const record: VersionedRecord = {
  k: 'blk:anya',
  d: { set: 'pc', order: 0, cells: {} },
  c: 1,
  a: 'gm-b',
  l: [1, 'gm-b'],
};

const gm = {
  role: 'GM',
  connectionId: 'gm-a',
  aborted: false,
  accepted: true,
  live: true,
  adopting: null,
  plan: Result.ok({ records: [record], count: 0, sheets: 0, digest: 'confirmed' }),
} satisfies Event['env'];

const adopting = { ...gm, adopting: target };
const player = { ...gm, role: 'PLAYER' } satisfies Event['env'];
const env = fc.constantFrom<Event['env']>(gm, adopting, player, { ...gm, aborted: true });
const generations = fc.constantFrom({ n: 2, a: 'gm-b' }, own, { n: 4, a: 'gm-b' }, target);

const events = {
  import: fc.record({
    kind: fc.constant('import'),
    id: fc.constant('import'),
    expectedDigest: fc.constantFrom('confirmed', 'changed'),
    env,
  }),
  wipe: fc.record({ kind: fc.constant('wipe'), id: fc.constant('wipe'), env }),
  'check-snapshot': fc.record({
    kind: fc.constant('check-snapshot'),
    id: fc.constant('check'),
    env,
  }),
  'adopt-from-copy': fc.record({
    kind: fc.constant('adopt-from-copy'),
    copy: fc.record({ g: generations, records: fc.constantFrom([], [record]) }),
    env,
  }),
  'see-generation': fc.record({
    kind: fc.constant('see-generation'),
    generation: generations,
    keepNonce: fc.boolean(),
    env,
  }),
  stage: fc.record({ kind: fc.constant('stage'), records: fc.constantFrom([], [record]), env }),
  'clear-staged': fc.record({
    kind: fc.constant('clear-staged'),
    hadData: fc.boolean(),
    keepNonce: fc.boolean(),
    env,
  }),
  'save-adoption': fc.record({
    kind: fc.constant('save-adoption'),
    generation: generations,
    fromCopy: fc.boolean(),
    env,
  }),
  'store-written': fc.record({ kind: fc.constant('store-written'), env }),
  'store-failed': fc.record({ kind: fc.constant('store-failed'), env }),
  'role-changed': fc.record({
    kind: fc.constant('role-changed'),
    generation: fc.option(generations),
    env,
  }),
} satisfies { [K in Event['kind']]: fc.Arbitrary<Extract<Event, { kind: K }>> };

const wipe = { kind: 'wipe', id: 'wipe', env: gm } satisfies Event;
const storeWritten = { kind: 'store-written', env: gm } satisfies Event;
const stage = { kind: 'stage', records: [record], env: adopting } satisfies Event;

const save = {
  kind: 'save-adoption',
  generation: target,
  fromCopy: false,
  env: adopting,
} satisfies Event;

const phases = {
  settled: phaseArbitrary(
    'settled',
    { prefix: [], generation: own },
    { prefix: [], generation: null },
  ),
  importing: phaseArbitrary('importing', { prefix: [wipe, storeWritten], generation: own }),
  staged: phaseArbitrary(
    'staged',
    { prefix: [stage], generation: own },
    { prefix: [stage], generation: null },
  ),
  saving: phaseArbitrary(
    'saving',
    { prefix: [wipe], generation: own },
    { prefix: [stage, save], generation: own },
  ),
};

const run = { seed: 1151, numRuns: 20 };

type PhaseFixture = { prefix: readonly Event[]; generation: Generation | null };

function advance(phase: Phase, event: Event) {
  return step<Phase, Event, Effect>(generationTable, phase, event);
}

function isPhase<K extends Phase['kind']>(
  phase: Phase,
  kind: K,
): phase is Extract<Phase, { kind: K }> {
  return phase.kind === kind;
}

function phaseArbitrary<K extends Phase['kind']>(
  kind: K,
  first: PhaseFixture,
  ...more: PhaseFixture[]
): fc.Arbitrary<Extract<Phase, { kind: K }>> {
  return fc.constantFrom(first, ...more).map(({ prefix, generation }) => {
    const phase = prefix.reduce(
      (before, event) => advance(before, event).phase,
      initialPhase(generation),
    );

    if (!isPhase(phase, kind)) {
      throw new Error(`Expected ${kind} after ${prefix.map((event) => event.kind).join(', ')}`);
    }

    return phase;
  });
}

test('every generation phase has a cell for every generation event', () => {
  // #given
  const eventKinds = new Set(Object.keys(events));
  const expected = Object.fromEntries(Object.keys(phases).map((kind) => [kind, eventKinds]));

  // #when
  const rows = Object.fromEntries(
    Object.entries<object>(generationTable).map(([kind, row]) => [kind, new Set(Object.keys(row))]),
  );

  // #then
  expect(rows).toEqual(expected);
});

test('the generation table matches its committed diagram', () => {
  // #given
  const effects: readonly string[] = [
    'flush',
    'save',
    'replace',
    'write-import',
    'reset',
    'room-copy-replaced',
    'remove-store',
    'remove-older-generations',
    'remove-older-formats',
    'replica-replaced',
    'clear-pending-edits',
    'drop-pending-work',
    'drop-outbox',
    'notify-data-replaced',
    'clear-deleted-links',
    'generation-read',
    'generation-heard',
    'adoption-staged',
    'report',
    'notice',
    'publish',
    'reject',
    'reply',
  ];

  // #when
  const check = () =>
    checkMachine<Phase, Event, { readonly type: string }>({
      name: 'generation',
      table: generationTable,
      phases,
      events,
      allowedEffects: { settled: effects, importing: effects, staged: effects, saving: effects },
      invariants: [],
      diagram: 'docs/machines/generation.md',
    });

  // #then
  expect(check).not.toThrow();
});

test('no generation transition replaces before saving or leaves saving without a store answer', () => {
  // #given
  const phaseArbitraries: fc.Arbitrary<Phase>[] = Object.values(phases);
  const eventArbitraries: fc.Arbitrary<Event>[] = Object.values(events);

  // #when
  const check = () => {
    for (const phase of phaseArbitraries) {
      for (const event of eventArbitraries) {
        fc.assert(
          fc.property(phase, event, (before, input) => {
            const after = advance(before, input);
            const types: readonly string[] = after.effects.map(({ type }) => type);
            const firstSave = types.indexOf('save');
            const firstReplacement = types.indexOf('replace');

            expect({
              replacementBeforeSave:
                firstReplacement >= 0 && (firstSave < 0 || firstReplacement < firstSave),
              leftSavingWithoutStoreAnswer:
                before.kind === 'saving' &&
                after.phase.kind !== 'saving' &&
                input.kind !== 'store-written' &&
                input.kind !== 'store-failed',
            }).toEqual({ replacementBeforeSave: false, leftSavingWithoutStoreAnswer: false });
          }),
          run,
        );
      }
    }
  };

  // #then
  expect(check).not.toThrow();
});
