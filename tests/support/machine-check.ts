import fc from 'fast-check';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { step, type Tagged, type TransitionTable } from '@/replica/machine';

type MachineSpec<
  Phase extends Tagged<string>,
  Event extends Tagged<string>,
  Effect extends { readonly type: string },
> = {
  readonly name: string;
  readonly table: TransitionTable<Phase, Event, Effect>;
  readonly phases: {
    readonly [K in Phase['kind']]: fc.Arbitrary<Extract<Phase, { kind: K }>>;
  };
  readonly events: {
    readonly [K in Event['kind']]: fc.Arbitrary<Extract<Event, { kind: K }>>;
  };
  readonly allowedEffects: {
    readonly [K in Phase['kind']]: readonly Effect['type'][];
  };
  readonly invariants: readonly {
    readonly name: string;
    readonly holds: (phase: Phase) => boolean;
  }[];
  readonly diagram: string;
};

export function checkMachine<
  Phase extends Tagged<string>,
  Event extends Tagged<string>,
  Effect extends { readonly type: string },
>(spec: MachineSpec<Phase, Event, Effect>): void {
  // SAFETY: TransitionTable has one runtime property for every Phase kind.
  const phaseKinds = Object.keys(spec.table) as Phase['kind'][];

  for (const phaseKind of phaseKinds) {
    // SAFETY: phaseKind came from the mapped TransitionTable keys above.
    const row = spec.table[phaseKind as keyof typeof spec.table];
    const phaseArbitrary = spec.phases[phaseKind];

    // SAFETY: every event kind is a mapped key in each table row.
    for (const eventKind of Object.keys(row) as Event['kind'][]) {
      const cell = row[eventKind];

      if (cell === 'ignore') {
        continue;
      }

      const eventArbitrary = spec.events[eventKind];

      const phases = fc.sample(phaseArbitrary, { seed: 1151, numRuns: 20 });
      const events = fc.sample(eventArbitrary, { seed: 1151, numRuns: 20 });

      for (let index = 0; index < phases.length; index += 1) {
        const phase = phases[index];
        const event = events[index];

        if (phase === undefined || event === undefined) {
          continue;
        }

        {
          const result = step(spec.table, phase, event);
          // SAFETY: result phase kinds are checked against the table at runtime below.
          const resultRow = spec.table[result.phase.kind as keyof typeof spec.table];

          if (resultRow === undefined) {
            throw new Error(
              `Machine ${spec.name} returned phase kind ${result.phase.kind}, but that kind has no table row`,
            );
          }

          // SAFETY: result phase kinds are the same keys used by allowedEffects.
          const allowed =
            spec.allowedEffects[result.phase.kind as keyof typeof spec.allowedEffects];

          for (const effect of result.effects) {
            if (!allowed.includes(effect.type)) {
              throw new Error(
                `Machine ${spec.name} emitted an allowed effect violation: ${effect.type} is not allowed for result phase ${result.phase.kind}`,
              );
            }
          }

          for (const invariant of spec.invariants) {
            if (!invariant.holds(result.phase)) {
              throw new Error(`Machine ${spec.name} violated invariant ${invariant.name}`);
            }
          }
        }
      }
    }
  }

  const rendered = renderMachine(spec);
  const diagramPath = join(process.cwd(), spec.diagram);

  if (process.env.UPDATE_MACHINES === '1') {
    mkdirSync(join(process.cwd(), spec.diagram, '..'), { recursive: true });
    writeFileSync(diagramPath, rendered);

    return;
  }

  let committed: string;

  try {
    committed = readFileSync(diagramPath, 'utf8');
  } catch {
    throw new Error(`Machine ${spec.name} diagram is missing. Replace it with:\n${rendered}`);
  }

  if (committed !== rendered) {
    throw new Error(`Machine ${spec.name} diagram is stale. Replace it with:\n${rendered}`);
  }
}

function renderMachine<Phase extends Tagged<string>, Event extends Tagged<string>, Effect>(
  spec: MachineSpec<Phase, Event, Effect & { readonly type: string }>,
): string {
  const arrows = new Set<string>();
  const table = spec.table;

  // SAFETY: TransitionTable has one runtime property for every Phase kind.
  for (const phaseKind of Object.keys(table) as Phase['kind'][]) {
    const row = table[phaseKind];

    // SAFETY: every event kind is a mapped key in each table row.
    for (const eventKind of Object.keys(row) as Event['kind'][]) {
      const cell = row[eventKind];

      if (cell === 'ignore') {
        continue;
      }

      const targets = phaseTargets(spec, phaseKind, eventKind);

      for (const target of targets) {
        arrows.add(`  ${phaseKind} --> ${target}: ${eventKind}`);
      }
    }
  }

  return ['stateDiagram-v2', ...arrows, ''].join('\n');
}

function phaseTargets<
  Phase extends Tagged<string>,
  Event extends Tagged<string>,
  Effect extends { readonly type: string },
>(
  spec: MachineSpec<Phase, Event, Effect>,
  phaseKind: Phase['kind'],
  eventKind: Event['kind'],
): Phase['kind'][] {
  const phaseArbitrary = spec.phases[phaseKind];
  const eventArbitrary = spec.events[eventKind];
  const targets = new Set<Phase['kind']>();
  const phases = fc.sample(phaseArbitrary, { seed: 1151, numRuns: 20 });
  const events = fc.sample(eventArbitrary, { seed: 1151, numRuns: 20 });

  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    const event = events[index];

    if (phase !== undefined && event !== undefined) {
      targets.add(step(spec.table, phase, event).phase.kind);
    }
  }

  return [...targets].sort();
}
