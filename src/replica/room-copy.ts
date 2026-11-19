import type { JsonObject } from '@/core/json';
import { compareGenerations } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import {
  readSnapshot,
  ROOM_METADATA_BYTE_LIMIT,
  roomCopyUsage,
  SNAPSHOT_KEY,
  type Snapshot,
  type SnapshotFailure,
} from '@/core/snapshot';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { Notice, RoomCopyOutcome, RoomCopyStatus } from '@/core/ui-messages';
import { MetadataFailure, type MetadataPort, type Schedule } from '@/platform/ports';
import { MessageRejectedFailure, type FailureReporter } from '@/replica/failures';
import { step } from '@/replica/machine';
import {
  initialPhase,
  roomCopyTable,
  type Effect,
  type Event,
  type Phase,
  type RoomCopyEnv,
} from '@/replica/room-copy-table';

export type RoomCopyOptions = {
  metadata: Pick<MetadataPort, 'getMetadata' | 'setMetadata'>;
  timing: Pick<Timing, 'snapshotPauseMs' | 'snapshotJitterMs'>;
  random: () => number;
  signal: AbortSignal;
  schedule: Schedule;
  writable: () => boolean;
  gm: () => boolean;
  generation: () => Generation;
  records: () => readonly VersionedRecord[];
  receive: (records: readonly VersionedRecord[]) => void;
  adopt: (copy: Snapshot) => void;
  newerVersion: () => void;
  changed: () => void;
  report?: FailureReporter;
};

export type RoomCopy = {
  edited: () => void;
  pageHidden: () => void;
  pageReturned: () => void;
  caughtUp: (applied: boolean) => void;
  read: () => Promise<void>;
  followed: (metadata: JsonObject) => void;
  replaced: (fromCopy: boolean) => void;
  demoted: () => void;
  writeImport: (generation: Generation, superseded: () => boolean) => Promise<void>;
  status: () => RoomCopyStatus;
  notices: () => Notice[];
};

type Input = {
  [K in Event['kind']]: Omit<Extract<Event, { kind: K }>, 'env'>;
}[Event['kind']];

type PortEffect = Extract<Effect, { type: 'read-metadata' | 'write-metadata' }>;

type ImportCompletion = {
  superseded: () => boolean;
  resolve: () => void;
  reject: (failure: { error: unknown }) => void;
};

export function createRoomCopy(options: RoomCopyOptions): RoomCopy {
  const report = options.report ?? (() => undefined);
  let phase: Phase = initialPhase();
  let cancelPause: (() => void) | undefined;
  let nextImportId = 0;
  const imports = new Map<number, ImportCompletion>();
  let notSaved = false;
  let exists = false;
  let used = 0;
  let free = ROOM_METADATA_BYTE_LIMIT;
  let outcome: RoomCopyOutcome = null;
  let older = false;

  function dispatch(input: Input, importId?: number): boolean {
    const env: RoomCopyEnv = {
      get gm() {
        return options.gm();
      },
      get writable() {
        return options.writable();
      },
      get generation() {
        return options.generation();
      },
      get records() {
        return options.records();
      },
      get pauseMs() {
        return options.timing.snapshotPauseMs + options.random() * options.timing.snapshotJitterMs;
      },
      get superseded() {
        return importId === undefined ? false : imports.get(importId)?.superseded();
      },
    };

    const before = phase;
    const result = step(roomCopyTable, before, { ...input, env });

    phase = result.phase;

    for (const effect of result.effects) {
      run(effect);
    }

    return result.phase !== before || result.effects.length > 0;
  }

  function run(effect: Effect): void {
    switch (effect.type) {
      case 'arm':
        cancelPause = options.schedule(options.signal, effect.delayMs, () => {
          cancelPause = undefined;
          dispatch({ kind: 'fired', timer: { kind: 'pause' } });
        });
        break;
      case 'disarm':
        cancelPause?.();
        cancelPause = undefined;
        break;
      case 'read-metadata':
      case 'write-metadata':
        void runPortEffect(effect).catch((error) => portThrew(effect, { error }));
        break;
      case 'receive':
        options.receive(effect.records);
        dispatch({ kind: 'read-done', source: 'merged', metadata: effect.metadata });
        break;
      case 'adopt':
        options.adopt(effect.snapshot);

        if (effect.resumeOrdinary) {
          dispatch({ kind: 'verify-done', metadata: null, after: 'ordinary-adopted' });
        }

        break;
      case 'publish-status':
        publishStatus(effect.update);
        break;
      case 'observe-metadata':
        if (effect.source === 'followed' && effect.metadata !== null) {
          followMetadata(effect.metadata);
        } else {
          mergeRoomCopy(effect.metadata);
        }

        break;
      case 'report':
        report(effect.failure);
        break;
      case 'newer-version':
        options.newerVersion();
        break;
      case 'recheck-import':
        dispatch(
          { kind: 'verify-done', metadata: null, after: 'import-rejected' },
          effect.request.id,
        );
        break;
      case 'complete-import': {
        const completion = imports.get(effect.request.id);
        imports.delete(effect.request.id);

        if (effect.unexpected === undefined) {
          completion?.resolve();
        } else {
          completion?.reject(effect.unexpected);
        }

        break;
      }
    }
  }

  function portThrew({ owner }: PortEffect, unexpected: { error: unknown }): void {
    if (owner.route === 'metadata') {
      report(new MetadataFailure({ operation: 'write', reason: String(unexpected.error) }));
    } else if (owner.route === 'message') {
      report(new MessageRejectedFailure({ reason: String(unexpected.error) }));
    }

    dispatch({ kind: 'failed', unexpected }, owner.importId);
  }

  async function runPortEffect(effect: PortEffect): Promise<void> {
    const { importId } = effect.owner;

    if (effect.type === 'read-metadata') {
      const metadata = await readMetadata(options.metadata, report);

      dispatch(
        metadata === null ? { kind: 'failed' } : { kind: effect.answer, metadata },
        importId,
      );

      return;
    }

    try {
      await options.metadata.setMetadata({ [SNAPSHOT_KEY]: effect.value });
    } catch (error) {
      report(new MetadataFailure({ operation: 'write', reason: String(error) }));
      dispatch({ kind: 'failed' }, importId);

      return;
    }

    dispatch({ kind: 'write-done' }, importId);
  }

  async function writeImport(generation: Generation, superseded: () => boolean): Promise<void> {
    await Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const id = nextImportId++;
      imports.set(id, { superseded, resolve, reject: ({ error }) => reject(error) });

      const accepted = dispatch({
        kind: 'edited',
        reason: { kind: 'import', request: { id, generation } },
      });

      if (!accepted) {
        imports.delete(id);
        resolve();
      }
    });
  }

  function mergeRoomCopy(metadata: JsonObject | null): void {
    if (metadata === null) {
      // A player alone would load forever with no outcome; a known one stays.
      outcome ??= 'unreadable';
      options.changed();

      return;
    }

    mergeReadRoomCopy(metadata);
    // The windows learn the outcome even when nothing else they show changed.
    options.changed();
  }

  function mergeReadRoomCopy(metadata: JsonObject): void {
    const read = readSnapshot(metadata);

    if (!read.isOk()) {
      report(new MessageRejectedFailure({ reason: read.error }));
      outcome = outcomeOf(read.error);
      unreadableRoomCopy(metadata, read.error);

      return;
    }

    const copy = read.value;

    if (copy === null) {
      outcome = 'none';
      noteRoomCopy(metadata, false);

      return;
    }

    // AD-9: a readable copy completes its generation at once.
    if (compareGenerations(copy.g, options.generation()) > 0) {
      options.adopt(copy);
    }

    const sameGeneration = compareGenerations(copy.g, options.generation()) === 0;

    // Set before the records merge so the delta that brings them carries the outcome.
    outcome = sameGeneration ? 'read' : 'unreadable';

    if (sameGeneration) {
      options.receive(copy.records);
    }

    noteRoomCopy(metadata, sameGeneration);
  }

  function unreadableRoomCopy(metadata: JsonObject, failure: SnapshotFailure): void {
    if (failure === 'newer-version') {
      options.newerVersion();
    }

    if (options.gm() && failure !== 'older-version') {
      publishStatus({ kind: 'failed', metadata });
    } else {
      noteRoomCopy(metadata, false);
    }
  }

  function publishStatus(update: Extract<Effect, { type: 'publish-status' }>['update']): void {
    switch (update.kind) {
      case 'failed':
        notSaved = true;

        if (update.metadata === null) {
          options.changed();
        } else {
          noteRoomCopy(update.metadata, exists);
        }

        break;
      case 'saved':
        notSaved = false;
        noteRoomCopy(update.metadata, true);
        break;
      case 'absent':
        if (update.metadata === null) {
          options.changed();
        } else {
          noteRoomCopy(update.metadata, false);
        }

        break;
      case 'import-failed':
        notSaved = true;
        break;
    }
  }

  // Another GM's write or another extension's data changes what Settings shows.
  function followMetadata(metadata: JsonObject): void {
    const read = readSnapshot(metadata);
    const copy = read.isOk() ? read.value : null;

    if (copy !== null && compareGenerations(copy.g, options.generation()) > 0) {
      options.adopt(copy);
    }

    noteRoomCopy(metadata, copy !== null && compareGenerations(copy.g, options.generation()) === 0);
  }

  function noteRoomCopy(metadata: JsonObject, copyExists: boolean): void {
    const usage = roomCopyUsage(metadata);
    const read = readSnapshot(metadata);

    older = !read.isOk() && read.error === 'older-version';
    exists = copyExists;
    used = usage.usedBytes;
    free = usage.freeBytes;
    options.changed();
  }

  options.signal.addEventListener('abort', () => dispatch({ kind: 'stop' }), { once: true });

  if (options.signal.aborted) {
    dispatch({ kind: 'stop' });
  }

  return {
    edited: () => dispatch({ kind: 'edited' }),
    pageHidden: () => dispatch({ kind: 'page-hidden' }),
    pageReturned: () => dispatch({ kind: 'page-returned' }),
    caughtUp: (applied) => dispatch({ kind: 'caught-up', applied }),
    read: async () => {
      const metadata = await readMetadata(options.metadata, report);
      dispatch({ kind: 'read-done', source: 'catch-up', metadata });
    },
    followed: (metadata) => dispatch({ kind: 'read-done', source: 'followed', metadata }),
    replaced: (fromCopy) => {
      exists = fromCopy;
      options.changed();
    },
    demoted: () => {
      dispatch({ kind: 'edited', reason: { kind: 'demoted' } });
      notSaved = false;
    },
    writeImport,
    status: () => {
      const state = notSaved ? 'failed' : exists ? 'saved' : 'none';

      return { state, usedBytes: used, freeBytes: free, outcome };
    },
    notices: () => {
      const notices: Notice[] = [];

      if (notSaved) {
        notices.push('room-copy-not-saved');
      }

      if (older && options.gm()) {
        notices.push('room-copy-older-format');
      }

      return notices;
    },
  };
}

// A failed read is logged and comes back as `null`, so a caller never waits on a rejection.
async function readMetadata(
  metadata: Pick<MetadataPort, 'getMetadata'>,
  report: FailureReporter,
): Promise<JsonObject | null> {
  const result = await metadata.getMetadata();

  if (result.isOk()) {
    return result.value;
  }

  report(result.error);

  return null;
}

function outcomeOf(failure: SnapshotFailure): RoomCopyOutcome {
  if (failure === 'newer-version') {
    return 'newer';
  }

  return failure === 'older-version' ? 'older' : 'unreadable';
}
