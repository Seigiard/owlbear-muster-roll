import { expect, test } from 'bun:test';
import { FORMAT_VERSION } from '@/core/format-version';
import type { JsonObject } from '@/core/json';
import { SNAPSHOT_KEY } from '@/core/snapshot';
import { step } from '@/replica/machine';
import {
  initialPhase,
  roomCopyTable,
  type Effect,
  type Event,
  type Phase,
  type RoomCopyEnv,
} from '@/replica/room-copy-table';

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
const hidden = { kind: 'page-hidden', env: gm } satisfies Event;
const fired = { kind: 'fired', timer: { kind: 'pause' }, env: gm } satisfies Event;
const readDone = { kind: 'read-done', metadata: {}, env: gm } satisfies Event;
const writeDone = { kind: 'write-done', env: gm } satisfies Event;

const verifiedCopy = {
  [SNAPSHOT_KEY]: { v: FORMAT_VERSION, data: 'q1ZKV7KqVkpUslJS0lHKU7IyqNVRKkpNzi9KKVayio6tBQA=' },
};

const higherCopy = {
  [SNAPSHOT_KEY]: {
    v: FORMAT_VERSION,
    data: 'q1ZKV7KqVkpUslLKL8lILdJNz1XSUcpTsjKs1VEqSk3OL0opVrKKjq0FAA==',
  },
};

function after(...events: Event[]): Phase {
  return events.reduce((phase, event) => advance(phase, event).phase, initialPhase());
}

function advance(phase: Phase, event: Event) {
  return step<Phase, Event, Effect>(roomCopyTable, phase, event);
}

function decision({ phase, effects }: ReturnType<typeof advance>) {
  return {
    phase: phase.kind,
    effects: effects
      .map<string>(({ type }) => type)
      .filter((type) => type !== 'disarm' && type !== 'report'),
  };
}

test('a player edit does not arm the pause', () => {
  // #given
  const phase = initialPhase();
  // #when
  const result = advance(phase, { kind: 'edited', env: player });
  // #then
  expect(decision(result)).toEqual({ phase: 'idle', effects: [] });
});

test.each<[string, boolean, RoomCopyEnv, Event[], string[]]>([
  ['no applied edit or owed write', false, gm, [], []],
  ['a command applied during catch-up', true, gm, [], ['arm']],
  ['an owed write', false, gm, [{ ...hidden, env: catchingUp }], ['arm']],
  ['a player even with an applied command', true, player, [], []],
])('catch-up completion handles %s', (_name, applied, env, prefix, effects) => {
  // #given
  const phase = after(...prefix);
  // #when
  const result = advance(phase, { kind: 'caught-up', applied, env });
  // #then
  expect(decision(result)).toEqual({ phase: 'idle', effects });
});

test.each<[string, Event, RoomCopyEnv]>([
  ['a hidden player page', hidden, player],
  ['a GM pause fired during catch-up', fired, catchingUp],
])('%s cannot start a metadata read', (_name, trigger, env) => {
  // #given
  const phase = after({ kind: 'edited', env: gm });
  // #when
  const result = advance(phase, { ...trigger, env });
  // #then
  expect(decision(result)).toEqual({ phase: 'idle', effects: [] });
});

test.each<[string, Event[], RoomCopyEnv, Phase['kind'], string[]]>([
  [
    'a page return invalidates the read even when the GM is live again',
    [{ kind: 'page-returned', env: gm }],
    gm,
    'idle',
    [],
  ],
  ['catch-up closes the write gate before the read answers', [], catchingUp, 'idle', []],
  ['a writable GM with an unchanged page can write', [], gm, 'writing', ['write-metadata']],
])('read-done handles when %s', (_name, intervening, env, next, effects) => {
  // #given
  const phase = after(hidden, ...intervening);
  // #when
  const result = advance(phase, { ...readDone, env });
  // #then
  expect(decision(result)).toEqual({ phase: next, effects });
});

test('a hidden page invalidates the held read and starts a new read, not a write', () => {
  // #given
  const phase = after(hidden, hidden);
  // #when
  const result = advance(phase, readDone);
  // #then
  expect(decision(result)).toEqual({ phase: 'reading', effects: ['read-metadata'] });
});

test.each<[string, JsonObject, string[]]>([
  ['an unreadable room copy', { [SNAPSHOT_KEY]: {} }, ['publish-status']],
  ['a higher generation', higherCopy, ['adopt']],
  ['metadata beyond the room-copy budget', { other: 'x'.repeat(15_501) }, ['publish-status']],
])('read-done does not overwrite %s', (_name, metadata, effects) => {
  // #given
  const phase = after(hidden);
  // #when
  const result = advance(phase, { ...readDone, metadata });
  // #then
  expect(decision(result)).toEqual({ phase: 'idle', effects });
});

test('a successful write does not start verification if the write gate has closed', () => {
  // #given
  const phase = after(hidden, readDone);
  // #when
  const result = advance(phase, { ...writeDone, env: catchingUp });
  // #then
  expect(decision(result)).toEqual({ phase: 'idle', effects: [] });
});

test.each<[string, JsonObject, RoomCopyEnv, string[], string[]]>([
  ['a verified copy', verifiedCopy, gm, ['publish-status'], []],
  ['a dropped write', {}, gm, ['publish-status'], ['arm']],
  ['a higher-generation copy', higherCopy, gm, ['adopt'], ['arm']],
  ['a closed write gate', verifiedCopy, catchingUp, [], ['arm']],
])('read-back handles %s', (_name, metadata, env, effects, retryEffects) => {
  // #given
  const phase = after(hidden, readDone, writeDone);
  // #when
  const result = advance(phase, { kind: 'verify-done', metadata, env });
  const caughtUp = advance(result.phase, { kind: 'caught-up', applied: false, env: gm });
  // #then
  expect({ verified: decision(result), caughtUp: decision(caughtUp) }).toEqual({
    verified: { phase: 'idle', effects },
    caughtUp: { phase: 'idle', effects: retryEffects },
  });
});

test.each<[string, Event[], RoomCopyEnv, string[]]>([
  ['a refused metadata read', [], gm, ['publish-status']],
  ['a refused metadata read after catch-up starts', [], catchingUp, []],
  ['a refused metadata write', [readDone], gm, ['publish-status']],
  ['a refused metadata write after catch-up starts', [readDone], catchingUp, []],
  ['a refused read-back', [readDone, writeDone], gm, ['publish-status']],
  ['a refused read-back after catch-up starts', [readDone, writeDone], catchingUp, []],
  [
    'a refused metadata read from before a page return',
    [{ kind: 'page-returned', env: gm }],
    gm,
    [],
  ],
])('failure handles %s', (_name, prefix, env, effects) => {
  // #given
  const phase = after(hidden, ...prefix);
  // #when
  const result = advance(phase, { kind: 'failed', env });
  // #then
  expect(decision(result)).toEqual({ phase: 'idle', effects });
});

const stop = { kind: 'stop', env: gm } satisfies Event;
const verifyDone = { kind: 'verify-done', metadata: verifiedCopy, env: gm } satisfies Event;
const failed = { kind: 'failed', env: gm } satisfies Event;

test.each<[string, RoomCopyEnv, string[]]>([
  ['open', gm, ['read-metadata']],
  ['closed', catchingUp, []],
])('an already sent write answers after stop with the write gate %s', (_name, env, effects) => {
  // #given
  const phase = after(hidden, readDone, stop);
  // #when
  const result = advance(phase, { ...writeDone, env });
  // #then
  expect(decision(result)).toEqual({ phase: 'stopped', effects });
});

test.each<[string, Event[], Event]>([
  ['a verified write', [writeDone], verifyDone],
  ['a dropped write', [writeDone], { ...verifyDone, metadata: {} }],
  ['a failed write', [], failed],
])('a stopped room copy settles %s exactly once', (_name, prefix, completion) => {
  // #given
  const phase = after(hidden, readDone, stop, ...prefix);

  // #when
  const result = advance(phase, completion);

  const repeated = [writeDone, verifyDone, failed].map((event) =>
    decision(advance(result.phase, event)),
  );

  // #then
  expect({ completion: decision(result), repeated }).toEqual({
    completion: { phase: 'stopped', effects: ['publish-status'] },
    repeated: [
      { phase: 'stopped', effects: [] },
      { phase: 'stopped', effects: [] },
      { phase: 'stopped', effects: [] },
    ],
  });
});
