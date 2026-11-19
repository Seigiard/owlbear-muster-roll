import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import fc from 'fast-check';
import { checkMachine } from './machine-check';
import type { TransitionTable } from '@/replica/machine';

type ToyPhase = { readonly kind: 'idle' } | { readonly kind: 'active' };

type ToyEvent = { readonly kind: 'start' } | { readonly kind: 'stop' } | { readonly kind: 'stay' };

type ToyEffect = { readonly type: 'entered' };

type ToyMachineSpec = {
  readonly name: string;
  readonly table: TransitionTable<ToyPhase, ToyEvent, ToyEffect>;
  readonly phases: {
    readonly idle: fc.Arbitrary<{ readonly kind: 'idle' }>;
    readonly active: fc.Arbitrary<{ readonly kind: 'active' }>;
  };
  readonly events: {
    readonly start: fc.Arbitrary<{ readonly kind: 'start' }>;
    readonly stop: fc.Arbitrary<{ readonly kind: 'stop' }>;
    readonly stay: fc.Arbitrary<{ readonly kind: 'stay' }>;
  };
  readonly allowedEffects: {
    readonly idle: readonly ToyEffect['type'][];
    readonly active: readonly ToyEffect['type'][];
  };
  readonly invariants: readonly {
    readonly name: string;
    readonly holds: (phase: ToyPhase) => boolean;
  }[];
  readonly diagram: string;
};

const diagram = ['stateDiagram-v2', '  idle --> active: start', '  active --> idle: stop', ''].join(
  '\n',
);

const table: TransitionTable<ToyPhase, ToyEvent, ToyEffect> = {
  idle: {
    start: () => ({ phase: { kind: 'active' }, effects: [{ type: 'entered' }] }),
    stop: 'ignore',
    stay: 'ignore',
  },
  active: {
    start: 'ignore',
    stop: () => ({ phase: { kind: 'idle' }, effects: [] }),
    stay: 'ignore',
  },
};

const diagramPaths: string[] = [];

function machineSpec(
  name: string,
  machine: TransitionTable<ToyPhase, ToyEvent, ToyEffect> = table,
  invariants: readonly {
    readonly name: string;
    readonly holds: (phase: ToyPhase) => boolean;
  }[] = [],
): ToyMachineSpec {
  const path = join('docs', 'machines', `${name}.md`);
  diagramPaths.push(path);

  return {
    name,
    table: machine,
    phases: {
      idle: fc.constant({ kind: 'idle' }),
      active: fc.constant({ kind: 'active' }),
    },
    events: {
      start: fc.constant({ kind: 'start' }),
      stop: fc.constant({ kind: 'stop' }),
      stay: fc.constant({ kind: 'stay' }),
    },
    allowedEffects: { idle: [], active: ['entered'] },
    invariants,
    diagram: path,
  };
}

function invalidPhase(): ToyPhase {
  const phase: ToyPhase = { kind: 'idle' };
  Object.defineProperty(phase, 'kind', { value: 'missing' });

  return phase;
}

function forbiddenEffect(): ToyEffect {
  const effect: ToyEffect = { type: 'entered' };
  Object.defineProperty(effect, 'type', { value: 'forbidden' });

  return effect;
}

async function writeDiagram(path: string, contents: string = diagram): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

afterEach(async () => {
  await Promise.all(diagramPaths.splice(0).map((path) => rm(path, { force: true })));
});

describe('checkMachine', () => {
  test('accepts valid transitions and the committed Mermaid diagram', async () => {
    // #given

    const spec = machineSpec('machine-check-valid');
    await writeDiagram(spec.diagram);
    // #when

    const check = () => checkMachine(spec);
    // #then

    expect(check).not.toThrow();
  });

  test('rejects a result phase kind that has no table row', async () => {
    // #given

    const broken: TransitionTable<ToyPhase, ToyEvent, ToyEffect> = {
      ...table,
      idle: {
        ...table.idle,
        start: () => ({ phase: invalidPhase(), effects: [] }),
      },
    };

    const spec = machineSpec('machine-check-missing-row', broken);
    await writeDiagram(spec.diagram);
    // #when

    const check = () => checkMachine(spec);
    // #then

    expect(check).toThrow(/phase kind.*row/i);
  });

  test('rejects an effect that the result phase does not allow', async () => {
    // #given

    const broken: TransitionTable<ToyPhase, ToyEvent, ToyEffect> = {
      ...table,
      idle: {
        ...table.idle,
        start: () => ({
          phase: { kind: 'active' },
          effects: [forbiddenEffect()],
        }),
      },
    };

    const spec = machineSpec('machine-check-forbidden-effect', broken);
    await writeDiagram(spec.diagram);
    // #when

    const check = () => checkMachine(spec);
    // #then

    expect(check).toThrow(/allowed effect/i);
  });

  test('rejects a result phase that breaks an invariant', async () => {
    // #given

    const spec = machineSpec('machine-check-broken-invariant', table, [
      { name: 'must stay idle', holds: (phase) => phase.kind === 'idle' },
    ]);

    await writeDiagram(spec.diagram);
    // #when

    const check = () => checkMachine(spec);
    // #then

    expect(check).toThrow(/invariant.*must stay idle/i);
  });

  test('prints a replacement Mermaid diagram when the committed diagram is stale', async () => {
    // #given

    const spec = machineSpec('machine-check-stale-diagram');
    await writeDiagram(spec.diagram, 'stale\n');
    // #when

    const check = () => checkMachine(spec);
    // #then

    expect(check).toThrow(diagram);
  });
});
