import { Result } from 'better-result';
import { expect, test } from 'bun:test';
import type { VersionedRecord } from '@/core/records';
import type { Generation } from '@/core/storage-key';
import {
  generationTable,
  initialPhase,
  type Effect,
  type Event,
  type Phase,
} from './generation-table';
import { step } from './machine';

const own: Generation = { n: 3, a: 'gm-a' };
const target: Generation = { n: 5, a: 'gm-b' };

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

const importSnapshot = {
  kind: 'import',
  id: 'import-1',
  expectedDigest: 'confirmed',
  env: gm,
} satisfies Event;

const stageAdoption = {
  kind: 'stage',
  records: [record],
  env: { ...gm, adopting: target },
} satisfies Event;

const saveAdoption = {
  kind: 'save-adoption',
  generation: target,
  fromCopy: true,
  env: { ...gm, adopting: target },
} satisfies Event;

const replacementEffects: readonly string[] = [
  'flush',
  'save',
  'replace',
  'write-import',
  'reset',
  'room-copy-replaced',
];

const failureEffects = [...replacementEffects, 'remove-store', 'publish', 'reject'];

function advance(phase: Phase, event: Event) {
  return step<Phase, Event, Effect>(generationTable, phase, event);
}

function orderedTypes(effects: readonly Effect[], relevant: readonly string[]): string[] {
  return effects.flatMap(({ type }) => (relevant.includes(type) ? [type] : []));
}

test('local snapshot import plans flush, save, replacement, room copy and reset in that order', () => {
  // #given
  const phase = initialPhase(own);
  // #when
  const result = advance(phase, importSnapshot);
  // #then
  expect(orderedTypes(result.effects, replacementEffects)).toEqual([
    'flush',
    'save',
    'replace',
    'write-import',
    'reset',
  ]);
});

test('remote adoption plans save before replacing the replica and notifying the room copy', () => {
  // #given
  const phase = advance(initialPhase(own), stageAdoption).phase;
  // #when
  const result = advance(phase, saveAdoption);
  // #then
  expect(orderedTypes(result.effects, replacementEffects)).toEqual([
    'save',
    'replace',
    'room-copy-replaced',
  ]);
});

test('a snapshot check from a player is refused even if its plan is valid', () => {
  // #given
  const phase = initialPhase(own);

  // #when
  const result = advance(phase, {
    kind: 'check-snapshot',
    id: 'check-1',
    env: { ...gm, role: 'PLAYER' },
  });

  // #then
  expect(result).toEqual({
    phase,
    effects: [{ type: 'reject', id: 'check-1', reason: 'not-allowed' }],
  });
});

test.each<[string, Generation, Generation | null]>([
  ['below the current generation', { n: 2, a: 'gm-b' }, null],
  ['equal to the current generation', own, null],
  ['below the adoption target but above the current generation', { n: 4, a: 'gm-b' }, target],
  ['equal to the adoption target', target, target],
])('hearing a generation %s does not start adoption', (_name, generation, adopting) => {
  // #given
  const settled = initialPhase(own);

  const phase =
    adopting === null
      ? settled
      : advance(settled, {
          kind: 'see-generation',
          generation: adopting,
          keepNonce: false,
          env: gm,
        }).phase;

  const unchanged = structuredClone(phase);

  // #when
  const result = advance(phase, {
    kind: 'see-generation',
    generation,
    keepNonce: false,
    env: { ...gm, adopting },
  });

  // #then
  expect(result).toEqual({ phase: unchanged, effects: [] });
});

test('a room copy below the adoption target cannot change the staged records or finish adoption', () => {
  // #given
  const seen = advance(initialPhase(own), {
    kind: 'see-generation',
    generation: target,
    keepNonce: false,
    env: gm,
  }).phase;

  const phase = advance(seen, stageAdoption).phase;
  const unchanged = structuredClone(phase);

  // #when
  const result = advance(phase, {
    kind: 'adopt-from-copy',
    copy: { g: { n: 4, a: 'gm-b' }, records: [{ ...record, k: 'blk:stale' }] },
    env: stageAdoption.env,
  });

  // #then
  expect(result).toEqual({ phase: unchanged, effects: [] });
});

test.each<[string, Event, Event[], string[]]>([
  ['import', importSnapshot, [], ['remove-store', 'publish', 'reject']],
  ['adoption', saveAdoption, [stageAdoption], ['remove-store', 'publish']],
])(
  'a failed %s save discards the partial store and preserves the prior phase',
  (_name, request, prefix, cleanup) => {
    // #given
    const before = prefix.reduce((phase, event) => advance(phase, event).phase, initialPhase(own));
    const unchanged = structuredClone(before);
    const saving = advance(before, request).phase;
    // #when
    const result = advance(saving, { kind: 'store-failed', env: request.env });
    // #then
    expect({
      saving: saving.kind,
      phase: result.phase,
      effects: orderedTypes(result.effects, failureEffects),
    }).toEqual({ saving: 'saving', phase: unchanged, effects: cleanup });
  },
);
