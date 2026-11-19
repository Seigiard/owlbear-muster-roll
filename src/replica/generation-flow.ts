import { Result } from 'better-result';
import { presetDataSchema, type VersionedRecord } from '@/core/records';
import { resetMessage } from '@/core/room-messages';
import type { Preset } from '@/core/preset';
import type { Snapshot } from '@/core/snapshot';
import { decodeSnapshotFileData, importSnapshot } from '@/core/snapshot-import';
import type { Generation } from '@/core/storage-key';
import type {
  Command,
  EngineMessage,
  RejectionReason,
  SnapshotCheckMessage,
} from '@/core/ui-messages';
import type { CatchUp, CatchUpDecision } from '@/replica/catch-up';
import { recordStoreFailure, type FailureReporter } from '@/replica/failures';
import {
  activePhase,
  generationTable,
  importSuperseded,
  initialPhase,
  isImporting,
  type Effect,
  type GenerationEnv,
  type Input,
  type ResetEffect,
} from '@/replica/generation-table';
import { step } from '@/replica/machine';
import type { RecordStore, RecordStoreFailure } from '@/replica/record-store';
import type { RoomCopy } from '@/replica/room-copy';

export type GenerationPersistence = {
  store: RecordStore;
  generation: Generation;
};

export type GenerationFlowPorts = {
  report?: FailureReporter;
  initialPersistence: GenerationPersistence | null;
  connectionId: string;
  records: () => ReadonlyMap<string, VersionedRecord>;
  presetOf: (record: VersionedRecord | undefined) => Preset | null;
  role: () => 'GM' | 'PLAYER';
  signal: AbortSignal;
  acceptCommand: (id: string) => boolean;
  catchUp: Pick<
    CatchUp,
    | 'adopting'
    | 'replicaReplaced'
    | 'generationRead'
    | 'generationHeard'
    | 'adoptionStaged'
    | 'live'
  >;
  // Adoption must clear staged records synchronously before adoptFromCopy returns; detached async
  // reads do not need to finish.
  interpretCatchUp: (decisions: readonly CatchUpDecision[]) => void;
  roomCopy: Pick<RoomCopy, 'writeImport' | 'replaced'>;
  flush: () => void;
  dropOutbox: () => void;
  sendRemote: (message: ReturnType<typeof resetMessage>) => void;
  replaceReplica: (records: readonly VersionedRecord[]) => void;
  clearPendingEdits: () => void;
  dropPendingWork: () => void;
  notifyDataReplaced: () => void;
  markGenerationSaveFailed: () => void;
  publish: () => void;
  clearDeletedLinks: () => void;
  reject: (
    id: string,
    reason: RejectionReason,
    changed?: { count: number; sheets: number; digest: string },
  ) => void;
  reply: (message: EngineMessage) => void;
};

export type AdoptFromCopyDecisions = {
  adoptionStaged: CatchUpDecision[];
};

export type GenerationFlow = {
  generation: () => Generation;
  highestSeen: () => Generation;
  importing: () => boolean;
  persistence: () => GenerationPersistence | null;
  importFromSnapshot: (
    id: string,
    command: Extract<Command, { type: 'snapshot-import' }>,
  ) => Promise<void>;
  wipe: (id: string) => Promise<void>;
  checkSnapshot: (message: SnapshotCheckMessage) => void;
  adoptFromCopy: (copy: Snapshot) => AdoptFromCopyDecisions;
  seeGeneration: (generation: Generation, keepNonce: boolean) => CatchUpDecision[];
  stage: (records: readonly VersionedRecord[]) => void;
  clearStaged: (hadData: boolean, keepNonce: boolean) => void;
  saveAdoption: (generation: Generation, fromCopy: boolean) => boolean;
  roleChanged: (next: GenerationPersistence | null) => void;
};

type Outcome = {
  saved?: boolean;
  reset?: true;
  decisions?: CatchUpDecision[];
  writing?: Promise<void>;
};

export function createGenerationFlow(ports: GenerationFlowPorts): GenerationFlow {
  const report = ports.report ?? (() => undefined);

  let phase = initialPhase(
    ports.initialPersistence?.generation ?? null,
    ports.initialPersistence?.store,
  );

  function dispatch(input: Input, data?: string): Outcome {
    const env: GenerationEnv = {
      connectionId: ports.connectionId,
      get role() {
        return ports.role();
      },
      get aborted() {
        return ports.signal.aborted;
      },
      get live() {
        return ports.catchUp.live();
      },
      get adopting() {
        return ports.catchUp.adopting();
      },
      get accepted() {
        return input.kind === 'check-snapshot' && ports.acceptCommand(input.id);
      },
      get plan() {
        return planImport(ports, data ?? '');
      },
    };

    const next = step(generationTable, phase, { ...input, env });

    phase = next.phase;

    return run(next.effects);
  }

  function run(effects: readonly Effect[]): Outcome {
    const outcome: Outcome = {};

    for (const [index, effect] of effects.entries()) {
      switch (effect.type) {
        case 'flush':
          ports.flush();
          break;
        case 'save': {
          const result = saveGeneration(effect);

          outcome.saved = result.isOk();

          if (result.isErr()) {
            dispatch({ kind: 'store-failed', failure: result.error });

            return outcome;
          }

          dispatch({ kind: 'store-written' });
          break;
        }

        case 'replace':
          ports.replaceReplica(effect.records);
          break;
        case 'write-import': {
          const reset = effects[index + 1];

          if (reset?.type !== 'reset' || index + 2 !== effects.length) {
            throw new Error('The room-copy write must be followed by its reset');
          }

          outcome.writing = writeImport(effect.generation, reset);

          return outcome;
        }

        case 'reset':
          ports.sendRemote(resetMessage(effect.generation));
          outcome.reset = true;
          break;
        case 'room-copy-replaced':
          ports.roomCopy.replaced(effect.fromCopy);
          break;
        case 'remove-store':
          reportRemoval(effect.store?.removeGeneration(effect.generation));
          break;
        case 'remove-older-generations':
          reportRemoval(effect.store?.removeGenerationsBelow(effect.generation));
          break;
        case 'remove-older-formats':
          reportRemoval(effect.store?.removeOlderFormats());
          break;
        case 'replica-replaced':
          ports.catchUp.replicaReplaced();
          break;
        case 'clear-pending-edits':
          ports.clearPendingEdits();
          break;
        case 'drop-pending-work':
          ports.dropPendingWork();
          break;
        case 'drop-outbox':
          ports.dropOutbox();
          break;
        case 'notify-data-replaced':
          ports.notifyDataReplaced();
          break;
        case 'clear-deleted-links':
          ports.clearDeletedLinks();
          break;
        case 'generation-read':
          ports.interpretCatchUp(ports.catchUp.generationRead(effect.copy.g));
          outcome.decisions = dispatch({
            kind: 'adopt-from-copy',
            copy: effect.copy,
            afterRead: true,
          }).decisions;
          break;
        case 'generation-heard':
          outcome.decisions = ports.catchUp.generationHeard(effect.generation, effect.keepNonce);
          break;
        case 'adoption-staged':
          outcome.decisions = ports.catchUp.adoptionStaged();
          break;
        case 'report':
          report(effect.failure);
          break;
        case 'notice':
          ports.markGenerationSaveFailed();
          break;
        case 'publish':
          ports.publish();
          break;
        case 'reject':
          ports.reject(effect.id, effect.reason, effect.changed);
          break;
        case 'reply':
          ports.reply(effect.message);
          break;
      }
    }

    return outcome;
  }

  async function writeImport(generation: Generation, reset: ResetEffect): Promise<void> {
    let sentReset = false;

    try {
      await ports.roomCopy.writeImport(generation, () =>
        importSuperseded(
          ports.signal.aborted,
          ports.catchUp.adopting(),
          activePhase(phase).ownGeneration,
          generation,
        ),
      );
      sentReset =
        dispatch({ kind: 'store-written', copy: { kind: 'written', reset } }).reset ?? false;
    } finally {
      dispatch({ kind: 'store-written', copy: { kind: 'finished', reset: sentReset } });
    }
  }

  function reportRemoval(result: Result<void, RecordStoreFailure> | undefined): void {
    if (result?.isErr()) {
      report(recordStoreFailure(result.error));
    }
  }

  return {
    generation: () => activePhase(phase).ownGeneration,
    highestSeen: () => activePhase(phase).highestSeen,
    importing: () => isImporting(phase),
    persistence: () => {
      const persistence = activePhase(phase).persistence;

      return persistence?.store === undefined
        ? null
        : { generation: persistence.generation, store: persistence.store };
    },
    importFromSnapshot: async (id, { expectedDigest, data }) =>
      dispatch({ kind: 'import', id, expectedDigest }, data).writing,
    wipe: async (id) => dispatch({ kind: 'wipe', id }).writing,
    checkSnapshot: ({ id, data }) => {
      dispatch({ kind: 'check-snapshot', id }, data);
    },
    adoptFromCopy: (copy) => ({
      adoptionStaged: dispatch({ kind: 'adopt-from-copy', copy }).decisions ?? [],
    }),
    seeGeneration: (generation, keepNonce) =>
      dispatch({ kind: 'see-generation', generation, keepNonce }).decisions ?? [],
    stage: (records) => {
      dispatch({ kind: 'stage', records });
    },
    clearStaged: (hadData, keepNonce) => {
      dispatch({ kind: 'clear-staged', hadData, keepNonce });
    },
    saveAdoption: (generation, fromCopy) =>
      dispatch({ kind: 'save-adoption', generation, fromCopy }).saved ?? false,
    roleChanged: (next) => {
      dispatch({ kind: 'role-changed', generation: next?.generation ?? null, store: next?.store });
    },
  };
}

function planImport(ports: GenerationFlowPorts, data: string): GenerationEnv['plan'] {
  const file = decodeSnapshotFileData(data);

  if (!file.isOk()) {
    return Result.err(file.error === 'too-large' ? 'too-large' : 'invalid-snapshot');
  }

  const stored = ports.records().get('preset');
  const presetData = presetDataSchema.safeParse(stored?.d);

  if (!presetData.success) {
    return Result.err('preset-required');
  }

  const preset = ports.presetOf(stored);

  if (preset === null) {
    return Result.err('preset-unreadable');
  }

  const imported = importSnapshot(
    file.value,
    { preset, data: presetData.data },
    ports.connectionId,
  );

  return imported.isOk()
    ? Result.ok(imported.value)
    : Result.err(imported.error === 'too-large' ? 'too-large' : 'invalid-snapshot');
}

// AD-9: a reload skips a partial generation until its incomplete marker is removed.
function saveGeneration({
  store,
  generation,
  records,
}: Extract<Effect, { type: 'save' }>): Result<void, RecordStoreFailure> {
  if (store === undefined) {
    return Result.ok();
  }

  const marked = store.markIncomplete(generation);

  if (marked.isErr()) {
    return marked;
  }

  const kept = store.markGeneration(generation);

  if (kept.isErr()) {
    return kept;
  }

  for (const record of records) {
    const written = store.write(generation, record);

    if (written.isErr()) {
      return Result.err(written.error);
    }
  }

  return store.markComplete(generation);
}
