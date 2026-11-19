import { expect, test } from 'bun:test';
import fc from 'fast-check';
import type { JsonObject } from '@/core/json';
import { step } from '@/replica/machine';
import {
  initialPhase,
  roomCopyTable,
  type Effect,
  type Event,
  type Phase,
  type RoomCopyEnv,
} from '@/replica/room-copy-table';
import { checkMachine } from '../../tests/support/machine-check';

const gm: RoomCopyEnv = {
  gm: true,
  writable: true,
  generation: { n: 0, a: '' },
  records: [],
  now: 0,
  pauseMs: 40,
};

const catchingUp: RoomCopyEnv = { ...gm, writable: false };
const player: RoomCopyEnv = { ...catchingUp, gm: false };
const edited = { kind: 'edited', env: gm } satisfies Event;
const hidden = { kind: 'page-hidden', env: gm } satisfies Event;
const returned = { kind: 'page-returned', env: gm } satisfies Event;
const fired = { kind: 'fired', timer: { kind: 'pause' }, env: gm } satisfies Event;
const read = { kind: 'read-done', metadata: {}, env: gm } satisfies Event;
const written = { kind: 'write-done', env: gm } satisfies Event;
const stop = { kind: 'stop', env: gm } satisfies Event;

const env = fc.constantFrom(gm, catchingUp, player);
const metadata = fc.constantFrom<JsonObject>({}, { other: 'x'.repeat(15_501) });

const events = {
  edited: fc.record({ kind: fc.constant(edited.kind), env }),
  'caught-up': fc.record({ kind: fc.constant('caught-up'), applied: fc.boolean(), env }),
  'page-hidden': fc.record({ kind: fc.constant(hidden.kind), env }),
  'page-returned': fc.record({ kind: fc.constant(returned.kind), env }),
  fired: fc.record({ kind: fc.constant(fired.kind), timer: fc.constant(fired.timer), env }),
  'read-done': fc.record({ kind: fc.constant('read-done'), metadata, env }),
  'write-done': fc.record({ kind: fc.constant(written.kind), env }),
  'verify-done': fc.record({ kind: fc.constant('verify-done'), metadata, env }),
  failed: fc.record({ kind: fc.constant('failed'), env }),
  stop: fc.record({ kind: fc.constant(stop.kind), env }),
} satisfies { [K in Event['kind']]: fc.Arbitrary<Extract<Event, { kind: K }>> };

const phases = {
  idle: phaseArbitrary('idle', [], [{ ...hidden, env: catchingUp }]),
  reading: phaseArbitrary(
    'reading',
    [hidden],
    [hidden, returned],
    [hidden, hidden],
    [edited, fired],
  ),
  writing: phaseArbitrary('writing', [hidden, read], [hidden, read, hidden]),
  verifying: phaseArbitrary('verifying', [hidden, read, written], [hidden, read, written, hidden]),
  stopped: phaseArbitrary('stopped', [stop], [hidden, stop], [hidden, read, stop]),
};

const otherEffects = [
  'read-metadata',
  'arm',
  'disarm',
  'receive',
  'adopt',
  'publish-status',
  'replaced',
  'report',
  'newer-version',
];

function advance(phase: Phase, event: Event) {
  return step<Phase, Event, Effect>(roomCopyTable, phase, event);
}

function isPhase<K extends Phase['kind']>(
  phase: Phase,
  kind: K,
): phase is Extract<Phase, { kind: K }> {
  return phase.kind === kind;
}

function phaseArbitrary<K extends Phase['kind']>(
  kind: K,
  first: readonly Event[],
  ...more: (readonly Event[])[]
): fc.Arbitrary<Extract<Phase, { kind: K }>> {
  return fc.constantFrom(first, ...more).map((prefix) => {
    const phase = prefix.reduce((before, event) => advance(before, event).phase, initialPhase());

    if (!isPhase(phase, kind)) {
      throw new Error(`Expected ${kind} after ${prefix.map((event) => event.kind).join(', ')}`);
    }

    return phase;
  });
}

test('every room-copy phase has a cell for every room-copy event', () => {
  // #given
  const eventKinds = new Set(Object.keys(events));
  const expectedRows = Object.fromEntries(Object.keys(phases).map((kind) => [kind, eventKinds]));

  // #when
  const rows = Object.fromEntries(
    Object.entries(roomCopyTable).map(([kind, row]) => [kind, new Set(Object.keys(row))]),
  );

  // #then
  expect(rows).toEqual(expectedRows);
});

test('room-copy transition table keeps metadata writes in writing and matches its diagram', () => {
  // #given
  const allowedEffects = {
    idle: otherEffects,
    reading: otherEffects,
    writing: [...otherEffects, 'write-metadata'],
    verifying: otherEffects,
    stopped: ['disarm'],
  };

  // #when
  const check = () =>
    checkMachine<Phase, Event, { readonly type: string }>({
      name: 'room-copy',
      table: roomCopyTable,
      phases,
      events,
      allowedEffects,
      invariants: [],
      diagram: 'docs/machines/room-copy.md',
    });

  // #then
  expect(check).not.toThrow();
});

test('one active room-copy write holds its phase when another trigger arrives', () => {
  // #given
  const active = fc.oneof(phases.reading, phases.writing, phases.verifying);
  const trigger = fc.oneof(events.edited, events['caught-up'], events['page-hidden'], events.fired);

  // #when
  const check = () =>
    fc.assert(
      fc.property(active, trigger, (phase, event) => {
        const next = advance(phase, event);
        expect({
          phase: next.phase.kind,
          portWork: next.effects.filter(
            ({ type }) => type === 'read-metadata' || type === 'write-metadata',
          ),
        }).toEqual({ phase: phase.kind, portWork: [] });
      }),
      { seed: 1151 },
    );

  // #then
  expect(check).not.toThrow();
});

test('a read answer sends at most one metadata write', () => {
  // #given
  const phase = fc.oneof(
    phases.idle,
    phases.reading,
    phases.writing,
    phases.verifying,
    phases.stopped,
  );

  // #when
  const check = () =>
    fc.assert(
      fc.property(phase, events['read-done'], (before, event) => {
        const { effects } = advance(before, event);
        const writes = effects.filter(({ type }) => type === 'write-metadata');
        expect(writes.length <= (before.kind === 'reading' ? 1 : 0)).toBe(true);
      }),
      { seed: 1151 },
    );

  // #then
  expect(check).not.toThrow();
});

test('a stopped room copy cannot restart, even when a held port call answers', () => {
  // #given
  const inputs = fc.oneof(...Object.values(events));

  // #when
  const check = () =>
    fc.assert(
      fc.property(phases.stopped, inputs, (phase, event) => {
        const next = advance(phase, event);
        expect({ phase: next.phase.kind, effects: next.effects }).toEqual({
          phase: 'stopped',
          effects: [],
        });
      }),
      { seed: 1151 },
    );

  // #then
  expect(check).not.toThrow();
});
