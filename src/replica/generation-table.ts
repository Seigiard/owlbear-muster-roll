import type { Result } from 'better-result';
import { compareGenerations, mergeRecords } from '@/core/merge';
import { recordFitsOneMessage } from '@/core/message-size';
import type { VersionedRecord } from '@/core/records';
import type { Snapshot } from '@/core/snapshot';
import type { SnapshotImport } from '@/core/snapshot-import';
import { generationSchema, INITIAL_GENERATION, type Generation } from '@/core/storage-key';
import type { EngineMessage, RejectionReason } from '@/core/ui-messages';
import { RecordTooLargeFailure, recordStoreFailure, type ReplicaFailure } from '@/replica/failures';
import type { Step, TransitionTable } from '@/replica/machine';
import type { RecordStore, RecordStoreFailure } from '@/replica/record-store';

type Persistence = { generation: Generation; store?: RecordStore };

type Memory = {
  persistence: Persistence | null;
  ownGeneration: Generation;
  highestSeen: Generation;
};

type Staging = ReadonlyMap<string, VersionedRecord>;

type LocalWork = { id: string; reply: 'snapshot-imported' | 'wiped'; target: Persistence };

type Settled = Memory & { kind: 'settled'; incoming: null };

type Staged = Memory & { kind: 'staged'; incoming: Staging };

type Importing = Memory & { kind: 'importing'; incoming: Staging | null; work: LocalWork };

type Active = Settled | Staged | Importing;

type Saving = {
  kind: 'saving';
  before: Active;
  work: { kind: 'local'; request: LocalWork } | { kind: 'adoption'; generation: Generation };
};

export type Phase = Active | Saving;

export type GenerationEnv = {
  role: 'GM' | 'PLAYER';
  connectionId: string;
  aborted: boolean;
  accepted: boolean;
  live: boolean;
  adopting: Generation | null;
  plan: Result<SnapshotImport, RejectionReason>;
};

export type ResetEffect = { type: 'reset'; generation: Generation };

export type Input =
  | { kind: 'import'; id: string; expectedDigest: string }
  | { kind: 'wipe'; id: string }
  | { kind: 'check-snapshot'; id: string }
  | { kind: 'adopt-from-copy'; copy: Snapshot; afterRead?: true }
  | { kind: 'see-generation'; generation: Generation; keepNonce: boolean }
  | { kind: 'stage'; records: readonly VersionedRecord[] }
  | { kind: 'clear-staged'; hadData: boolean; keepNonce: boolean }
  | { kind: 'save-adoption'; generation: Generation; fromCopy: boolean }
  | {
      kind: 'store-written';
      copy?: { kind: 'written'; reset: ResetEffect } | { kind: 'finished'; reset: boolean };
    }
  | { kind: 'store-failed'; failure?: RecordStoreFailure }
  | { kind: 'role-changed'; generation: Generation | null; store?: RecordStore };

export type Event = Input & { env: GenerationEnv };

type EventOf<K extends Event['kind']> = Extract<Event, { kind: K }>;

type ImportRequest = EventOf<'import' | 'wipe'>;

export type Effect =
  | { type: 'flush' }
  | {
      type: 'save';
      store?: RecordStore;
      generation: Generation;
      records: readonly VersionedRecord[];
    }
  | { type: 'replace'; records: readonly VersionedRecord[] }
  | { type: 'write-import'; generation: Generation }
  | ResetEffect
  | { type: 'room-copy-replaced'; fromCopy: boolean }
  | {
      type: 'remove-store' | 'remove-older-generations';
      store?: RecordStore;
      generation: Generation;
    }
  | { type: 'remove-older-formats'; store?: RecordStore }
  | { type: 'replica-replaced' }
  | { type: 'clear-pending-edits' }
  | { type: 'drop-pending-work' }
  | { type: 'drop-outbox' }
  | { type: 'notify-data-replaced' }
  | { type: 'clear-deleted-links' }
  | { type: 'generation-read'; copy: Snapshot }
  | { type: 'generation-heard'; generation: Generation; keepNonce: boolean }
  | { type: 'adoption-staged' }
  | { type: 'report'; failure: ReplicaFailure }
  | { type: 'notice' }
  | { type: 'publish' }
  | {
      type: 'reject';
      id: string;
      reason: RejectionReason;
      changed?: Pick<SnapshotImport, 'count' | 'sheets' | 'digest'>;
    }
  | { type: 'reply'; message: EngineMessage };

type Decision = Step<Phase, Effect>;

export const generationTable: TransitionTable<Phase, Event, Effect> = {
  settled: {
    import: importGeneration,
    wipe: importGeneration,
    'check-snapshot': checkSnapshot,
    'adopt-from-copy': adoptFromCopy,
    'see-generation': seeGeneration,
    stage,
    'clear-staged': clearStaged,
    'save-adoption': saveAdoption,
    'store-written': 'ignore',
    'store-failed': 'ignore',
    'role-changed': roleChanged,
  },
  importing: {
    import: (phase, event) => reject(phase, event.id, 'importing'),
    wipe: (phase, event) => reject(phase, event.id, 'importing'),
    'check-snapshot': checkSnapshot,
    'adopt-from-copy': adoptFromCopy,
    'see-generation': seeGeneration,
    stage,
    'clear-staged': clearStaged,
    'save-adoption': saveAdoption,
    'store-written': copyWritten,
    'store-failed': 'ignore',
    'role-changed': roleChanged,
  },
  staged: {
    import: importGeneration,
    wipe: importGeneration,
    'check-snapshot': checkSnapshot,
    'adopt-from-copy': adoptFromCopy,
    'see-generation': seeGeneration,
    stage,
    'clear-staged': clearStaged,
    'save-adoption': saveAdoption,
    'store-written': 'ignore',
    'store-failed': 'ignore',
    'role-changed': roleChanged,
  },
  saving: {
    import: 'ignore',
    wipe: 'ignore',
    'check-snapshot': 'ignore',
    'adopt-from-copy': 'ignore',
    'see-generation': 'ignore',
    stage: 'ignore',
    'clear-staged': 'ignore',
    'save-adoption': 'ignore',
    'store-written': storeWritten,
    'store-failed': storeFailed,
    'role-changed': 'ignore',
  },
};

export function initialPhase(generation: Generation | null, store?: RecordStore): Phase {
  const ownGeneration = generation ?? INITIAL_GENERATION;

  return {
    kind: 'settled',
    persistence: generation === null ? null : { generation, store },
    ownGeneration,
    highestSeen: ownGeneration,
    incoming: null,
  };
}

export function activePhase(phase: Phase): Active {
  return phase.kind === 'saving' ? phase.before : phase;
}

export function isImporting(phase: Phase): boolean {
  return activePhase(phase).kind === 'importing';
}

export function importSuperseded(
  aborted: boolean,
  adopting: Generation | null,
  ownGeneration: Generation,
  generation: Generation,
): boolean {
  return aborted || adopting !== null || compareGenerations(ownGeneration, generation) !== 0;
}

function decision(phase: Phase, ...effects: Effect[]): Decision {
  return { phase, effects };
}

function reject(phase: Phase, id: string, reason: RejectionReason): Decision {
  return decision(phase, { type: 'reject', id, reason });
}

function importGeneration(phase: Settled | Staged, event: ImportRequest): Decision {
  const { id, env } = event;
  const { persistence, ownGeneration, highestSeen } = phase;

  if (persistence === null) {
    return reject(phase, id, 'write-failed');
  }

  let records: readonly VersionedRecord[] = [];

  if (event.kind === 'import') {
    const planned = env.plan;

    if (!planned.isOk()) {
      return reject(phase, id, planned.error);
    }

    const { count, sheets, digest } = planned.value;

    if (digest !== event.expectedDigest) {
      return decision(phase, {
        type: 'reject',
        id,
        reason: 'count-changed',
        changed: { count, sheets, digest },
      });
    }

    records = planned.value.records;
  }

  const generation = {
    n: Math.max(ownGeneration.n, highestSeen.n) + 1,
    a: env.connectionId,
  };

  if (!generationSchema.safeParse(generation).success) {
    return reject(phase, id, 'write-failed');
  }

  const { store } = persistence;

  const request: LocalWork = {
    id,
    reply: event.kind === 'import' ? 'snapshot-imported' : 'wiped',
    target: { generation, store },
  };

  return decision(
    { kind: 'saving', before: phase, work: { kind: 'local', request } },
    { type: 'flush' },
    { type: 'save', store, generation, records },
    { type: 'replace', records },
    { type: 'replica-replaced' },
    { type: 'clear-pending-edits' },
    { type: 'publish' },
    { type: 'write-import', generation },
    { type: 'reset', generation },
  );
}

function checkSnapshot(phase: Active, { id, env }: EventOf<'check-snapshot'>): Decision {
  if (!env.accepted) {
    return decision(phase);
  }

  if (env.role !== 'GM') {
    return reject(phase, id, 'not-allowed');
  }

  if (phase.kind === 'importing') {
    return reject(phase, id, 'importing');
  }

  if (!env.live) {
    return reject(phase, id, 'catching-up');
  }

  if (phase.persistence === null) {
    return reject(phase, id, 'write-failed');
  }

  const planned = env.plan;

  if (!planned.isOk()) {
    return reject(phase, id, planned.error);
  }

  const { count, sheets, digest } = planned.value;

  return decision(phase, {
    type: 'reply',
    message: { t: 'snapshot-check-result', id, count, sheets, digest },
  });
}

function seeGeneration(phase: Active, { generation, keepNonce, env }: EventOf<'see-generation'>) {
  if (env.aborted) {
    return decision(phase);
  }

  const next = rememberGeneration(phase, generation);

  return compareGenerations(generation, env.adopting ?? phase.ownGeneration) <= 0
    ? decision(next)
    : decision(next, { type: 'generation-heard', generation, keepNonce });
}

function adoptFromCopy(phase: Active, { copy, afterRead, env }: EventOf<'adopt-from-copy'>) {
  if (afterRead) {
    const target = env.adopting;

    if (target === null || compareGenerations(copy.g, target) !== 0) {
      return decision(phase);
    }

    const staged = stage(phase, { records: copy.records });

    return decision(staged.phase, ...staged.effects, { type: 'adoption-staged' });
  }

  if (env.aborted) {
    return decision(phase);
  }

  const next = rememberGeneration(phase, copy.g);

  return compareGenerations(copy.g, env.adopting ?? phase.ownGeneration) < 0
    ? decision(next)
    : decision(next, { type: 'generation-read', copy });
}

function stage(phase: Active, { records }: Pick<EventOf<'stage'>, 'records'>): Decision {
  const incoming = new Map(phase.incoming);
  const effects: Effect[] = [];

  for (const record of records) {
    if (!recordFitsOneMessage(record)) {
      effects.push({ type: 'report', failure: new RecordTooLargeFailure({ key: record.k }) });
      continue;
    }

    const current = incoming.get(record.k);
    incoming.set(record.k, current === undefined ? record : mergeRecords(current, record));
  }

  return decision(withStaging(phase, incoming), ...effects);
}

function clearStaged(phase: Active, { hadData, keepNonce }: EventOf<'clear-staged'>): Decision {
  const effects: Effect[] = [{ type: 'drop-outbox' }, { type: 'drop-pending-work' }];

  if (hadData) {
    effects.push({ type: 'notify-data-replaced' });
  }

  if (keepNonce) {
    effects.push({ type: 'publish' });
  }

  return decision(withStaging(phase, null), ...effects);
}

function saveAdoption(phase: Active, { generation, fromCopy }: EventOf<'save-adoption'>): Decision {
  const store = phase.persistence?.store;
  const records = [...(phase.incoming?.values() ?? [])];

  return decision(
    { kind: 'saving', before: phase, work: { kind: 'adoption', generation } },
    { type: 'save', store, generation, records },
    ...(phase.persistence === null ? [] : removeOld({ store, generation })),
    { type: 'replace', records },
    { type: 'room-copy-replaced', fromCopy },
    { type: 'publish' },
  );
}

function storeWritten(phase: Saving, { copy }: EventOf<'store-written'>): Decision {
  if (copy !== undefined) {
    return decision(phase);
  }

  const { before, work } = phase;

  if (work.kind === 'local') {
    return decision({
      ...installed(before, work.request.target.generation),
      kind: 'importing',
      work: work.request,
    });
  }

  return decision(withStaging(installed(before, work.generation), null));
}

function storeFailed({ before, work }: Saving, { failure }: EventOf<'store-failed'>): Decision {
  const generation = work.kind === 'local' ? work.request.target.generation : work.generation;
  const effects: Effect[] = [];

  if (failure !== undefined) {
    effects.push({ type: 'report', failure: recordStoreFailure(failure) }, { type: 'notice' });
  }

  effects.push(
    { type: 'remove-store', store: before.persistence?.store, generation },
    { type: 'publish' },
  );

  if (work.kind === 'local') {
    effects.push({ type: 'reject', id: work.request.id, reason: 'write-failed' });
  }

  return decision(before, ...effects);
}

function copyWritten(phase: Importing, { copy, env }: EventOf<'store-written'>): Decision {
  const { target, id, reply } = phase.work;

  if (copy?.kind !== 'written') {
    const effects: Effect[] = [{ type: 'clear-deleted-links' }];

    if (copy?.reset) {
      effects.push({ type: 'reply', message: { t: reply, id } });
    }

    return decision(withStaging(memory(phase), phase.incoming), ...effects);
  }

  if (env.aborted) {
    return decision(phase);
  }

  if (importSuperseded(false, env.adopting, phase.ownGeneration, target.generation)) {
    return reject(phase, id, 'data-replaced');
  }

  return decision(phase, copy.reset, ...removeOld(target));
}

function removeOld({ store, generation }: Persistence): Effect[] {
  return [
    { type: 'remove-older-generations', store, generation },
    { type: 'remove-older-formats', store },
  ];
}

function roleChanged(phase: Active, { generation, store }: EventOf<'role-changed'>): Decision {
  if (generation === null) {
    return decision({ ...phase, persistence: null });
  }

  return decision({
    ...rememberGeneration(phase, generation),
    ownGeneration: generation,
    persistence: { generation, store },
  });
}

function installed<P extends Active>(phase: P, generation: Generation): P {
  return {
    ...rememberGeneration(phase, generation),
    ownGeneration: generation,
    persistence: phase.persistence === null ? null : { ...phase.persistence, generation },
  };
}

function rememberGeneration<P extends Active>(phase: P, generation: Generation): P {
  return compareGenerations(phase.highestSeen, generation) >= 0
    ? phase
    : { ...phase, highestSeen: generation };
}

function memory({ persistence, ownGeneration, highestSeen }: Memory): Memory {
  return { persistence, ownGeneration, highestSeen };
}

function withStaging(phase: Memory | Importing, incoming: Staging | null): Active {
  if ('work' in phase) {
    return { ...phase, incoming };
  }

  const data = memory(phase);

  return incoming === null
    ? { ...data, kind: 'settled', incoming }
    : { ...data, kind: 'staged', incoming };
}
