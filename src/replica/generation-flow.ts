import { compareGenerations, mergeRecords } from '@/core/merge';
import { recordFitsOneMessage } from '@/core/message-size';
import {
  generationRelation as roomGenerationRelation,
  resetMessage,
  type GenerationRelation,
} from '@/core/room-messages';
import {
  decodeSnapshotFileData,
  importSnapshot,
  type SnapshotImport,
} from '@/core/snapshot-import';
import { generationSchema, INITIAL_GENERATION, type Generation } from '@/core/storage-key';
import { presetDataSchema, type VersionedRecord } from '@/core/records';
import { err, type Result } from '@/core/result';
import type { Snapshot } from '@/core/snapshot';
import type { CatchUp, CatchUpDecision } from '@/replica/catch-up';
import type { RecordStore } from '@/replica/record-store';
import type { RoomCopy } from '@/replica/room-copy';
import type {
  Command,
  EngineMessage,
  RejectionReason,
  SnapshotCheckMessage,
} from '@/core/ui-messages';
import type { Preset } from '@/core/preset';

export type GenerationPersistence = {
  store: RecordStore;
  generation: Generation;
};

export type GenerationFlowPorts = {
  initialPersistence: GenerationPersistence | null;
  connectionId: string;
  records: () => ReadonlyMap<string, VersionedRecord>;
  presetOf: (record: VersionedRecord | undefined) => Preset | null;
  role: () => 'GM' | 'PLAYER';
  stopped: () => boolean;
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
  generationRead: CatchUpDecision[];
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

export function nextGeneration(
  ownGeneration: Generation,
  highestSeenGeneration: Generation,
  connectionId: string,
): Generation {
  return {
    n: Math.max(ownGeneration.n, highestSeenGeneration.n) + 1,
    a: connectionId,
  };
}

export function generationSchemaValid(generation: Generation): boolean {
  return generationSchema.safeParse(generation).success;
}

export function importSuperseded(
  stopped: boolean,
  adopting: Generation | null,
  ownGeneration: Generation,
  generation: Generation,
): boolean {
  return stopped || adopting !== null || compareGenerations(ownGeneration, generation) !== 0;
}

export function generationRelation(
  generation: Generation,
  ownGeneration: Generation,
): GenerationRelation {
  return roomGenerationRelation(generation, ownGeneration);
}

export function createGenerationFlow(ports: GenerationFlowPorts): GenerationFlow {
  let persistence = ports.initialPersistence;
  let ownGeneration = persistence?.generation ?? INITIAL_GENERATION;
  let highestSeenGeneration = ownGeneration;
  let incoming = new Map<string, VersionedRecord>();
  let importing = false;

  function planImport(data: string): Result<SnapshotImport, RejectionReason> {
    const file = decodeSnapshotFileData(data);

    if (!file.ok) {
      return err(file.error === 'too-large' ? 'too-large' : 'invalid-snapshot');
    }

    const stored = ports.records().get('preset');
    const presetData = presetDataSchema.safeParse(stored?.d);

    if (!presetData.success) {
      return err('preset-required');
    }

    const preset = ports.presetOf(stored);

    if (preset === null) {
      return err('preset-unreadable');
    }

    const imported = importSnapshot(
      file.value,
      {
        preset,
        data: presetData.data,
      },
      ports.connectionId,
    );

    if (!imported.ok) {
      return err(imported.error === 'too-large' ? 'too-large' : 'invalid-snapshot');
    }

    return imported;
  }

  async function importFromSnapshot(
    id: string,
    command: Extract<Command, { type: 'snapshot-import' }>,
  ): Promise<void> {
    if (importing) {
      ports.reject(id, 'importing');

      return;
    }

    if (persistence === null) {
      ports.reject(id, 'write-failed');

      return;
    }

    const planned = planImport(command.data);

    if (!planned.ok) {
      ports.reject(id, planned.error);

      return;
    }

    const { records, count, sheets, digest } = planned.value;

    if (digest !== command.expectedDigest) {
      ports.reject(id, 'count-changed', { count, sheets, digest });

      return;
    }

    if (await replaceGeneration(id, records)) {
      ports.reply({ t: 'snapshot-imported', id });
    }
  }

  async function wipe(id: string): Promise<void> {
    if (importing) {
      ports.reject(id, 'importing');

      return;
    }

    if (persistence === null) {
      ports.reject(id, 'write-failed');

      return;
    }

    if (await replaceGeneration(id, [])) {
      ports.reply({ t: 'wiped', id });
    }
  }

  function checkSnapshot(message: SnapshotCheckMessage): void {
    if (!ports.acceptCommand(message.id)) {
      return;
    }

    if (ports.role() !== 'GM') {
      ports.reject(message.id, 'not-allowed');

      return;
    }

    if (importing) {
      ports.reject(message.id, 'importing');

      return;
    }

    if (!ports.catchUp.live()) {
      ports.reject(message.id, 'catching-up');

      return;
    }

    if (!persistence) {
      ports.reject(message.id, 'write-failed');

      return;
    }

    const planned = planImport(message.data);

    if (!planned.ok) {
      ports.reject(message.id, planned.error);

      return;
    }

    const { count, sheets, digest } = planned.value;
    ports.reply({ t: 'snapshot-check-result', id: message.id, count, sheets, digest });
  }

  async function replaceGeneration(
    id: string,
    records: readonly VersionedRecord[],
  ): Promise<boolean> {
    if (persistence === null) {
      ports.reject(id, 'write-failed');

      return false;
    }

    const generation = nextGeneration(ownGeneration, highestSeenGeneration, ports.connectionId);

    if (!generationSchemaValid(generation)) {
      ports.reject(id, 'write-failed');

      return false;
    }

    ports.flush();

    const { store } = persistence;

    if (!saveGeneration(store, generation, records)) {
      const removed = store.removeGeneration(generation);

      if (!removed.ok) {
        console.error('Muster Roll could not remove a part saved generation', removed.error);
      }

      ports.publish();
      ports.reject(id, 'write-failed');

      return false;
    }

    importing = true;
    persistence = { store, generation };
    ownGeneration = generation;
    highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);
    ports.replaceReplica(records);
    ports.catchUp.replicaReplaced();
    ports.clearPendingEdits();
    ports.publish();

    try {
      await ports.roomCopy.writeImport(generation, () =>
        importSuperseded(ports.stopped(), ports.catchUp.adopting(), ownGeneration, generation),
      );

      if (ports.stopped()) {
        return false;
      }

      if (importSuperseded(ports.stopped(), ports.catchUp.adopting(), ownGeneration, generation)) {
        ports.reject(id, 'data-replaced');

        return false;
      }

      ports.sendRemote(resetMessage(generation));

      const removed = store.removeGenerationsBelow(generation);

      if (!removed.ok) {
        console.error('Muster Roll could not remove the replaced records', removed.error);
      }

      removeOlderFormats(store);
    } finally {
      importing = false;
      ports.clearDeletedLinks();
    }

    return true;
  }

  function adoptFromCopy(copy: Snapshot): AdoptFromCopyDecisions {
    if (ports.stopped()) {
      return { generationRead: [], adoptionStaged: [] };
    }

    highestSeenGeneration = higherGeneration(highestSeenGeneration, copy.g);
    const generationRead = ports.catchUp.generationRead(copy.g);
    const target = ports.catchUp.adopting();

    if (target === null || compareGenerations(copy.g, target) !== 0) {
      return { generationRead, adoptionStaged: [] };
    }

    stage(copy.records);

    return {
      generationRead,
      adoptionStaged: ports.catchUp.adoptionStaged(),
    };
  }

  function seeGeneration(generation: Generation, keepNonce: boolean): CatchUpDecision[] {
    if (ports.stopped()) {
      return [];
    }

    highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);

    return ports.catchUp.generationHeard(generation, keepNonce);
  }

  function stage(records: readonly VersionedRecord[]): void {
    for (const record of records) {
      if (!recordFitsOneMessage(record)) {
        console.error('Muster Roll dropped a remote record too large for one message', record.k);
        continue;
      }

      const current = incoming.get(record.k);

      incoming.set(record.k, current === undefined ? record : mergeRecords(current, record));
    }
  }

  function clearStaged(hadData: boolean, keepNonce: boolean): void {
    incoming = new Map();
    ports.dropOutbox();
    ports.dropPendingWork();

    if (hadData) {
      ports.notifyDataReplaced();
    }

    if (keepNonce) {
      ports.publish();
    }
  }

  function saveAdoption(generation: Generation, fromCopy: boolean): boolean {
    const records = [...incoming.values()];

    if (persistence !== null) {
      const { store } = persistence;

      if (!saveGeneration(store, generation, records)) {
        const removed = store.removeGeneration(generation);

        if (!removed.ok) {
          console.error('Muster Roll could not remove a part saved generation', removed.error);
        }

        ports.publish();

        return false;
      }

      persistence = { store, generation };

      const removed = store.removeGenerationsBelow(generation);

      if (!removed.ok) {
        console.error('Muster Roll could not remove the replaced records', removed.error);
      }

      removeOlderFormats(store);
    }

    incoming = new Map();
    ownGeneration = generation;
    highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);
    ports.replaceReplica(records);
    ports.roomCopy.replaced(fromCopy);
    ports.publish();

    return true;
  }

  function roleChanged(next: GenerationPersistence | null): void {
    persistence = next;

    if (next !== null) {
      ownGeneration = next.generation;
      highestSeenGeneration = higherGeneration(highestSeenGeneration, next.generation);
    }
  }

  function saveGeneration(
    store: RecordStore,
    generation: Generation,
    records: readonly VersionedRecord[],
  ): boolean {
    const marked = store.markIncomplete(generation);

    if (!marked.ok) {
      console.error('Muster Roll could not mark a new generation', marked.error);
      ports.markGenerationSaveFailed();

      return false;
    }

    const kept = store.markGeneration(generation);

    if (!kept.ok) {
      console.error('Muster Roll could not keep a new generation', kept.error);
      ports.markGenerationSaveFailed();

      return false;
    }

    for (const record of records) {
      const written = store.write(generation, record);

      if (!written.ok) {
        console.error('Muster Roll could not save a record of a new generation', written.error);
        ports.markGenerationSaveFailed();

        return false;
      }
    }

    const complete = store.markComplete(generation);

    if (!complete.ok) {
      console.error('Muster Roll could not mark a new generation complete', complete.error);
      ports.markGenerationSaveFailed();

      return false;
    }

    return true;
  }

  return {
    generation: () => ownGeneration,
    highestSeen: () => highestSeenGeneration,
    importing: () => importing,
    persistence: () => persistence,
    importFromSnapshot,
    wipe,
    checkSnapshot,
    adoptFromCopy,
    seeGeneration,
    stage,
    clearStaged,
    saveAdoption,
    roleChanged,
  };
}

function higherGeneration(first: Generation, second: Generation): Generation {
  return compareGenerations(first, second) >= 0 ? first : second;
}

function removeOlderFormats(store: RecordStore): void {
  const removed = store.removeOlderFormats();

  if (!removed.ok) {
    console.error('Muster Roll could not remove the records of an older format', removed.error);
  }
}
