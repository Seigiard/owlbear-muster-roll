import type { JsonObject } from '@/core/json';
import { compareGenerations } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import {
  encodeSnapshot,
  readBackHolds,
  readSnapshot,
  ROOM_METADATA_BYTE_LIMIT,
  roomMetadataBytes,
  type Snapshot,
  type SnapshotValue,
} from '@/core/snapshot';
import type { Generation } from '@/core/storage-key';
import { MessageRejectedFailure, type ReplicaFailure } from '@/replica/failures';
import type { Step, TransitionTable } from '@/replica/machine';

type ErrorRoute = 'metadata' | 'message';

type ImportRequest = { id: number; generation: Generation };

type Ordinary = { mode: 'ordinary'; pageChanges: number; errors: ErrorRoute };

type Import = { mode: 'import'; request: ImportRequest };

type Cleanup = { mode: 'cleanup'; request: ImportRequest };

type ReadWork = Ordinary | Import | Cleanup;

type SentWork = ((Ordinary | Import) & { snapshot: Snapshot }) | Cleanup;

type Unexpected = { error: unknown };

type PortOwner = { route: ErrorRoute; importId?: never } | { importId: number; route?: never };

type Memory = {
  owed: boolean;
  pageChanges: number;
  rerun: boolean;
  imports: readonly ImportRequest[];
};

type Idle = { kind: 'idle' } & Memory;

type Reading = { kind: 'reading'; work: ReadWork } & Memory;

type Writing = { kind: 'writing'; work: SentWork } & Memory;

type Verifying = { kind: 'verifying'; work: SentWork } & Memory;

type Active = Reading | Writing | Verifying;

type Stopped = { kind: 'stopped'; active?: Active };

export type Phase = Idle | Active | Stopped;

export type RoomCopyEnv = {
  gm: boolean;
  writable: boolean;
  generation: Generation;
  records: readonly VersionedRecord[];
  now?: number;
  pauseMs: number;
  superseded?: boolean;
};

type Input =
  | { kind: 'edited'; reason?: { kind: 'import'; request: ImportRequest } | { kind: 'demoted' } }
  | { kind: 'caught-up'; applied: boolean }
  | { kind: 'page-hidden' }
  | { kind: 'page-returned' }
  | { kind: 'fired'; timer: { kind: 'pause' } }
  | {
      kind: 'read-done';
      metadata: JsonObject | null;
      source?: 'catch-up' | 'followed' | 'merged';
    }
  | { kind: 'write-done' }
  | {
      kind: 'verify-done';
      metadata: JsonObject | null;
      after?: 'ordinary-adopted' | 'import-rejected';
    }
  | { kind: 'failed'; unexpected?: Unexpected }
  | { kind: 'stop' };

export type Event = Input & { env: RoomCopyEnv };

type StatusUpdate =
  | { kind: 'failed'; metadata: JsonObject | null }
  | { kind: 'saved'; metadata: JsonObject }
  | { kind: 'absent'; metadata: JsonObject | null }
  | { kind: 'import-failed' };

export type Effect =
  | { type: 'arm'; delayMs: number }
  | { type: 'disarm' }
  | { type: 'read-metadata'; answer: 'read-done' | 'verify-done'; owner: PortOwner }
  | { type: 'write-metadata'; value: SnapshotValue | undefined; owner: PortOwner }
  | { type: 'receive'; records: readonly VersionedRecord[]; metadata: JsonObject }
  | { type: 'adopt'; snapshot: Snapshot; resumeOrdinary?: true }
  | { type: 'publish-status'; update: StatusUpdate }
  | { type: 'observe-metadata'; source: 'catch-up' | 'followed'; metadata: JsonObject | null }
  | { type: 'report'; failure: ReplicaFailure }
  | { type: 'newer-version' }
  | { type: 'recheck-import'; request: ImportRequest }
  | { type: 'complete-import'; request: ImportRequest; unexpected?: Unexpected };

type Decision = Step<Phase, Effect>;

type ReadDone = Extract<Event, { kind: 'read-done' }>;

export const roomCopyTable: TransitionTable<Phase, Event, Effect> = {
  idle: {
    edited,
    'caught-up': caughtUp,
    'page-hidden': hidden,
    'page-returned': returned,
    fired: (phase, { env }) => trigger(phase, env, 'metadata'),
    'read-done': observeRead,
    'write-done': 'ignore',
    'verify-done': 'ignore',
    failed: 'ignore',
    stop: (phase) => stop(phase),
  },
  reading: {
    edited,
    'caught-up': caughtUp,
    'page-hidden': hidden,
    'page-returned': returned,
    fired: (phase, { env }) => trigger(phase, env, 'metadata'),
    'read-done': readDone,
    'write-done': 'ignore',
    'verify-done': (phase, event) => afterAdoption(phase, event),
    failed: (phase, { env, unexpected }) => failed(phase, env, unexpected),
    stop,
  },
  writing: {
    edited,
    'caught-up': caughtUp,
    'page-hidden': hidden,
    'page-returned': returned,
    fired: (phase, { env }) => trigger(phase, env, 'metadata'),
    'read-done': observeRead,
    'write-done': (phase, { env }) => writeDone(phase, env),
    'verify-done': 'ignore',
    failed: (phase, { env, unexpected }) => failed(phase, env, unexpected),
    stop,
  },
  verifying: {
    edited,
    'caught-up': caughtUp,
    'page-hidden': hidden,
    'page-returned': returned,
    fired: (phase, { env }) => trigger(phase, env, 'metadata'),
    'read-done': observeRead,
    'write-done': 'ignore',
    'verify-done': (phase, event) =>
      event.after !== undefined
        ? afterAdoption(phase, event)
        : event.metadata === null
          ? failed(phase, event.env)
          : verifyDone(phase, event.metadata, event.env),
    failed: (phase, { env, unexpected }) => failed(phase, env, unexpected),
    stop,
  },
  stopped: {
    edited: stoppedEdited,
    'caught-up': 'ignore',
    'page-hidden': 'ignore',
    'page-returned': 'ignore',
    fired: 'ignore',
    'read-done': (phase, { source }) =>
      (source === undefined || source === 'merged') && phase.active?.kind === 'reading'
        ? drain(phase.active)
        : decision(phase),
    'write-done': (phase, { env }) =>
      phase.active?.kind === 'writing' ? writeDone(phase.active, env, true) : decision(phase),
    'verify-done': stoppedVerifyDone,
    failed: (phase, { env, unexpected }) =>
      phase.active === undefined ? decision(phase) : failed(phase.active, env, unexpected, true),
    stop: 'ignore',
  },
};

export function initialPhase(): Phase {
  return { kind: 'idle', owed: false, pageChanges: 0, rerun: false, imports: [] };
}

function decision(phase: Phase, ...effects: Effect[]): Decision {
  return { phase, effects };
}

function status(update: StatusUpdate): Effect {
  return { type: 'publish-status', update };
}

function pause(phase: Idle | Active, env: RoomCopyEnv): Decision {
  return env.gm
    ? decision(phase, { type: 'disarm' }, { type: 'arm', delayMs: env.pauseMs })
    : decision(phase, { type: 'disarm' });
}

function edited(
  phase: Idle | Active,
  { env, reason }: Extract<Event, { kind: 'edited' }>,
): Decision {
  if (reason?.kind === 'import') {
    const { request } = reason;

    return phase.kind === 'idle'
      ? read(phase, { mode: 'import', request })
      : decision({ ...phase, imports: [...phase.imports, request] });
  }

  return reason?.kind === 'demoted'
    ? decision({ ...phase, owed: false }, { type: 'disarm' })
    : pause(phase, env);
}

function caughtUp(
  phase: Idle | Active,
  { applied, env }: Extract<Event, { kind: 'caught-up' }>,
): Decision {
  return phase.owed || applied ? pause(phase, env) : decision(phase);
}

function hidden(phase: Idle | Active, { env }: Event): Decision {
  return trigger({ ...phase, pageChanges: phase.pageChanges + 1 }, env, 'message');
}

function returned(phase: Idle | Active): Decision {
  return decision({ ...phase, pageChanges: phase.pageChanges + 1 });
}

function trigger(phase: Idle | Active, env: RoomCopyEnv, errors: ErrorRoute): Decision {
  const next = { ...phase, owed: true };
  const disarm = { type: 'disarm' } satisfies Effect;

  if (next.kind !== 'idle') {
    return decision({ ...next, rerun: true }, disarm);
  }

  return env.writable
    ? read(next, { mode: 'ordinary', errors, pageChanges: next.pageChanges }, disarm)
    : decision(next, disarm);
}

function requestOf(work: ReadWork): ImportRequest | undefined {
  return work.mode === 'ordinary' ? undefined : work.request;
}

function portOwner(work: ReadWork): PortOwner {
  return work.mode === 'ordinary' ? { route: work.errors } : { importId: work.request.id };
}

function read(phase: Memory, work: ReadWork, ...effects: Effect[]): Decision {
  return decision({ ...memory(phase), kind: 'reading', work }, ...effects, {
    type: 'read-metadata',
    answer: 'read-done',
    owner: portOwner(work),
  });
}

function memory({ owed, pageChanges, rerun, imports }: Memory): Memory {
  return { owed, pageChanges, rerun, imports };
}

function finish(
  phase: Active,
  env: RoomCopyEnv,
  effects: readonly Effect[] = [],
  options: { owed?: boolean; skipRerun?: boolean; unexpected?: Unexpected } = {},
): Decision {
  const idle: Idle = { ...memory(phase), kind: 'idle', owed: options.owed ?? phase.owed };
  const request = requestOf(phase.work);

  const tail =
    request === undefined
      ? effects
      : [
          ...effects,
          { type: 'complete-import', request, unexpected: options.unexpected } satisfies Effect,
        ];

  if (idle.rerun && !options.skipRerun) {
    // The routine rerun already owes a write. A queued import must not overtake it.
    const rerun = trigger(
      { ...idle, rerun: false },
      env,
      phase.work.mode === 'ordinary' ? phase.work.errors : 'message',
    );

    if (rerun.phase.kind === 'reading') {
      return decision(rerun.phase, ...tail, ...rerun.effects);
    }

    return nextImport({ ...idle, owed: true, rerun: false }, [...tail, ...rerun.effects]);
  }

  return nextImport(idle, tail);
}

function nextImport(phase: Idle, effects: readonly Effect[]): Decision {
  const [request, ...imports] = phase.imports;

  return request === undefined
    ? decision(phase, ...effects)
    : read({ ...phase, imports }, { mode: 'import', request }, ...effects);
}

function observeRead(phase: Idle | Active, { source, metadata, env }: ReadDone): Decision {
  if (source !== 'catch-up' && source !== 'followed') {
    return decision(phase);
  }

  const snapshot = source === 'catch-up' && metadata !== null ? readSnapshot(metadata) : null;

  // A page that closed during its write left the room copy behind its own stored records, or with
  // no copy at all, and the owed write died with the page (TASK-118). The copy a GM reads in
  // catch-up shows that it is owed. A GM with no records owes nothing to a room with no copy.
  const behind =
    snapshot !== null &&
    snapshot.isOk() &&
    env.records.length > 0 &&
    !readBackHolds({ g: env.generation, records: [...env.records] }, snapshot.value);

  const owed =
    phase.owed ||
    (env.gm && snapshot !== null && !snapshot.isOk() && snapshot.error !== 'older-version') ||
    (env.gm && behind);

  const next = { ...phase, owed };
  const observe: Effect = { type: 'observe-metadata', source, metadata };

  // A read that answers after catch-up timed out finds `caughtUp` already run, so it arms the write
  // itself. During catch-up the gate is closed and `caughtUp` arms it.
  return owed && !phase.owed && env.writable
    ? decision(next, observe, ...pause(next, env).effects)
    : decision(next, observe);
}

function readDone(phase: Reading, event: ReadDone): Decision {
  const { metadata, env, source } = event;
  const { work } = phase;

  if (source === 'catch-up' || source === 'followed') {
    return observeRead(phase, event);
  }

  if (metadata === null) {
    return failed(phase, env);
  }

  if (work.mode === 'cleanup') {
    return cleanupRead(phase, work, metadata, env);
  }

  if (work.mode === 'import') {
    return importRead(phase, work, metadata, env);
  }

  if (!env.writable || work.pageChanges !== phase.pageChanges) {
    return finish(phase, env);
  }

  if (source !== 'merged') {
    const current = readSnapshot(metadata);

    if (!current.isOk()) {
      const effects: Effect[] = [
        { type: 'report', failure: new MessageRejectedFailure({ reason: current.error }) },
      ];

      if (current.error === 'newer-version') {
        effects.push({ type: 'newer-version' });
      }

      const raiseNotice = env.gm && current.error !== 'older-version';

      effects.push(
        status(raiseNotice ? { kind: 'failed', metadata } : { kind: 'absent', metadata }),
      );

      return finish(phase, env, effects, { owed: raiseNotice || phase.owed });
    }

    if (current.value !== null) {
      const relation = compareGenerations(current.value.g, env.generation);

      if (relation > 0) {
        return adoptForOrdinary(phase, current.value, env);
      }

      if (relation === 0) {
        return decision(phase, { type: 'receive', records: current.value.records, metadata });
      }
    }
  }

  return encodeWrite(phase, work, env.generation, metadata, env);
}

function importRead(
  phase: Reading,
  work: Import,
  metadata: JsonObject,
  env: RoomCopyEnv,
): Decision {
  if (env.superseded) {
    return finish(phase, env, [], { skipRerun: true });
  }

  const current = readSnapshot(metadata);

  if (!current.isOk() && current.error === 'newer-version') {
    return decision(
      phase,
      { type: 'report', failure: new MessageRejectedFailure({ reason: 'newer-version' }) },
      { type: 'newer-version' },
      { type: 'recheck-import', request: work.request },
    );
  }

  if (
    current.isOk() &&
    current.value !== null &&
    compareGenerations(current.value.g, work.request.generation) > 0
  ) {
    // Adoption can supersede this import. Check again before cleaning up the room copy.
    return decision(
      phase,
      { type: 'adopt', snapshot: current.value },
      { type: 'recheck-import', request: work.request },
    );
  }

  return encodeWrite(phase, work, work.request.generation, metadata, env);
}

function adoptForOrdinary(
  phase: Reading | Verifying,
  snapshot: Snapshot,
  env: RoomCopyEnv,
): Decision {
  // Adoption changes the write gate. A deferred write must see the new gate.
  return phase.rerun || phase.imports.length > 0
    ? decision(phase, { type: 'adopt', snapshot, resumeOrdinary: true })
    : finish(phase, env, [{ type: 'adopt', snapshot }]);
}

function afterAdoption(
  phase: Reading | Verifying,
  { after, env }: Extract<Event, { kind: 'verify-done' }>,
): Decision {
  if (after === 'ordinary-adopted' && phase.work.mode === 'ordinary') {
    return finish(phase, env);
  }

  return after === 'import-rejected' && phase.work.mode === 'import'
    ? importRejected(phase, phase.work, env)
    : decision(phase);
}

function cleanupRead(
  phase: Reading,
  work: Cleanup,
  metadata: JsonObject,
  env: RoomCopyEnv,
): Decision {
  if (env.superseded) {
    return finish(phase, env, [status({ kind: 'absent', metadata: null })]);
  }

  const current = readSnapshot(metadata);

  if (
    !current.isOk() ||
    current.value === null ||
    compareGenerations(current.value.g, work.request.generation) >= 0
  ) {
    return finish(phase, env, [status({ kind: 'absent', metadata })]);
  }

  return write(phase, work, undefined);
}

function encodeWrite(
  phase: Reading,
  work: Ordinary | Import,
  generation: Generation,
  metadata: JsonObject,
  env: RoomCopyEnv,
): Decision {
  const snapshot: Snapshot = { g: generation, records: [...env.records] };
  const encoded = encodeSnapshot(snapshot.g, snapshot.records);

  if (!encoded.isOk() || roomMetadataBytes(metadata, encoded.value) > ROOM_METADATA_BYTE_LIMIT) {
    return work.mode === 'import'
      ? importRejected(phase, work, env)
      : finish(phase, env, [status({ kind: 'failed', metadata })], { owed: true });
  }

  return write(phase, { ...work, snapshot }, encoded.value);
}

function write(phase: Reading, work: SentWork, value: SnapshotValue | undefined): Decision {
  return decision(
    { ...phase, kind: 'writing', work },
    { type: 'write-metadata', value, owner: portOwner(work) },
  );
}

function writeDone(phase: Writing, env: RoomCopyEnv, stopped = false): Decision {
  if (phase.work.mode === 'ordinary' && !env.writable) {
    return stopped ? drain(phase) : finish(phase, env);
  }

  const verifying: Verifying = { ...phase, kind: 'verifying' };

  return decision(stopped ? { kind: 'stopped', active: verifying } : verifying, {
    type: 'read-metadata',
    answer: 'verify-done',
    owner: portOwner(phase.work),
  });
}

function verifyDone(
  phase: Verifying,
  metadata: JsonObject,
  env: RoomCopyEnv,
  stopped = false,
): Decision {
  const { work } = phase;

  if (work.mode === 'cleanup') {
    const update = status({ kind: 'absent', metadata: stopped ? null : metadata });

    return stopped ? drain(phase, [update]) : finish(phase, env, [update]);
  }

  if ((work.mode === 'ordinary' && !env.writable) || (work.mode === 'import' && env.superseded)) {
    return stopped ? drain(phase) : finish(phase, env, [], { skipRerun: work.mode === 'import' });
  }

  const current = readSnapshot(metadata);

  if (
    current.isOk() &&
    current.value !== null &&
    compareGenerations(current.value.g, work.snapshot.g) > 0
  ) {
    if (stopped) {
      return drain(phase);
    }

    const adopt = { type: 'adopt', snapshot: current.value } satisfies Effect;

    return work.mode === 'ordinary'
      ? adoptForOrdinary(phase, current.value, env)
      : decision(phase, adopt, { type: 'recheck-import', request: work.request });
  }

  if (current.isOk() && readBackHolds(work.snapshot, current.value)) {
    const update = status({ kind: 'saved', metadata });

    return stopped ? drain(phase, [update]) : finish(phase, env, [update], { owed: false });
  }

  const update = status({ kind: 'failed', metadata });

  if (stopped) {
    return drain(phase, [update]);
  }

  return work.mode === 'ordinary'
    ? finish(phase, env, [update], { owed: true })
    : importRejected(phase, work, env);
}

function importRejected(phase: Active, work: Import, env: RoomCopyEnv): Decision {
  return env.superseded
    ? finish(phase, env, [], { skipRerun: true })
    : read(
        { ...phase, owed: true },
        { mode: 'cleanup', request: work.request },
        status({ kind: 'import-failed' }),
      );
}

function failed(
  phase: Active,
  env: RoomCopyEnv,
  unexpected?: Unexpected,
  stopped = false,
): Decision {
  const { work } = phase;

  if (unexpected !== undefined) {
    return stopped
      ? drain(phase, [], unexpected)
      : finish(phase, env, [], { skipRerun: true, unexpected });
  }

  if (stopped && phase.kind === 'reading') {
    return drain(phase);
  }

  if (work.mode === 'cleanup') {
    if (phase.kind === 'writing') {
      return writeDone(phase, env, stopped);
    }

    const update = status({ kind: 'absent', metadata: null });

    return stopped ? drain(phase, [update]) : finish(phase, env, [update]);
  }

  if (work.mode === 'import') {
    return stopped ? drain(phase) : importRejected(phase, work, env);
  }

  const effects =
    env.writable && (phase.kind !== 'reading' || work.pageChanges === phase.pageChanges)
      ? [status({ kind: 'failed', metadata: null })]
      : [];

  return stopped
    ? drain(phase, effects)
    : finish(phase, env, effects, { owed: effects.length > 0 || phase.owed });
}

function stop(phase: Idle | Active): Decision {
  return decision(
    phase.kind === 'idle' ? { kind: 'stopped' } : { kind: 'stopped', active: phase },
    { type: 'disarm' },
  );
}

function stoppedEdited(phase: Stopped, { reason }: Extract<Event, { kind: 'edited' }>): Decision {
  if (phase.active === undefined || reason?.kind !== 'import') {
    return decision(phase);
  }

  const { request } = reason;

  return decision({
    ...phase,
    active: { ...phase.active, imports: [...phase.active.imports, request] },
  });
}

function stoppedVerifyDone(
  phase: Stopped,
  { metadata, env, after }: Extract<Event, { kind: 'verify-done' }>,
): Decision {
  const { active } = phase;

  if (after !== undefined && (active?.kind === 'reading' || active?.kind === 'verifying')) {
    return drain(active);
  }

  if (active?.kind !== 'verifying') {
    return decision(phase);
  }

  return metadata === null
    ? failed(active, env, undefined, true)
    : verifyDone(active, metadata, env, true);
}

function drain(phase: Active, effects: readonly Effect[] = [], unexpected?: Unexpected): Decision {
  const current = requestOf(phase.work);
  const pending = phase.imports.map((request): Effect => ({ type: 'complete-import', request }));

  const complete =
    current === undefined
      ? pending
      : [{ type: 'complete-import', request: current, unexpected } satisfies Effect, ...pending];

  return decision({ kind: 'stopped' }, ...effects, ...complete);
}
