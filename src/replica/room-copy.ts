import type { JsonObject } from '@/core/json';
import { compareGenerations } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import {
  encodeSnapshot,
  readBackHolds,
  readSnapshot,
  ROOM_METADATA_BYTE_LIMIT,
  roomCopyUsage,
  roomMetadataBytes,
  SNAPSHOT_KEY,
  type Snapshot,
  type SnapshotFailure,
  type SnapshotValue,
} from '@/core/snapshot';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { Notice, RoomCopyOutcome, RoomCopyStatus } from '@/core/ui-messages';
import type { MetadataPort } from '@/platform/ports';

export type RoomCopyOptions = {
  metadata: Pick<MetadataPort, 'getMetadata' | 'setMetadata'>;
  timing: Pick<Timing, 'snapshotPauseMs' | 'snapshotJitterMs'>;
  random: () => number;
  schedule: (delayMs: number, run: () => void) => () => void;
  writable: () => boolean;
  gm: () => boolean;
  generation: () => Generation;
  records: () => readonly VersionedRecord[];
  receive: (records: readonly VersionedRecord[]) => void;
  adopt: (copy: Snapshot) => void;
  newerVersion: () => void;
  changed: () => void;
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
  stop: () => void;
  writeImport: (generation: Generation, superseded: () => boolean) => Promise<void>;
  status: () => RoomCopyStatus;
  notices: () => Notice[];
};

type WriteMode = 'ordinary' | 'import';

type WritePhase = 'reading' | 'writing' | 'verifying';

type ActiveWrite = {
  phase: WritePhase;
  mode: WriteMode;
  completion: Promise<void>;
};

type WriteLifecycle = { phase: 'idle' } | ActiveWrite | { phase: 'stopped'; active?: ActiveWrite };

type DeferredWork = {
  owed: boolean;
  rerun: boolean;
  scheduled?: { cancel: () => void };
};

export function createRoomCopy(options: RoomCopyOptions): RoomCopy {
  // AD-8 room copy. The notice stays until the next verified write.
  let notSaved = false;
  // A readable room copy of this client's generation was last read or written.
  let exists = false;
  let used = 0;
  let free = ROOM_METADATA_BYTE_LIMIT;
  // What the last catch-up found in the room copy. A player with no GM answer shows data by it.
  let outcome: RoomCopyOutcome = null;
  // AD-12: the room copy last read is of an older format. A GM sees the notice until a wipe or an
  // import replaces the copy, and no routine write replaces it meanwhile.
  let older = false;
  // Deferred work is independent from the saved-copy status and the active write lifecycle.
  const deferred: DeferredWork = { owed: false, rerun: false };
  let lifecycle: WriteLifecycle = { phase: 'idle' };
  // Counts `resume` and visibility changes. A write stops when one falls between its read and its
  // write.
  let pageChanges = 0;

  function cancelScheduledWrite(): void {
    const scheduled = deferred.scheduled;
    deferred.scheduled = undefined;
    scheduled?.cancel();
  }

  function isActiveWrite(state: WriteLifecycle): state is ActiveWrite {
    return state.phase === 'reading' || state.phase === 'writing' || state.phase === 'verifying';
  }

  function activeWrite(): ActiveWrite | undefined {
    if (isActiveWrite(lifecycle)) {
      return lifecycle;
    }

    return lifecycle.phase === 'stopped' ? lifecycle.active : undefined;
  }

  function beginWrite(mode: WriteMode): ActiveWrite {
    const operation: ActiveWrite = {
      phase: 'reading',
      mode,
      completion: Promise.resolve(),
    };

    lifecycle = operation;

    return operation;
  }

  function finishWrite(operation: ActiveWrite): void {
    if (lifecycle === operation) {
      lifecycle = { phase: 'idle' };
    } else if (lifecycle.phase === 'stopped' && lifecycle.active === operation) {
      lifecycle = { phase: 'stopped' };
    }
  }

  // AD-7 and AD-9: a copy of this client's generation merges. A copy of a higher generation is
  // adopted, as at start a client takes the highest one it knows. A lower one is left alone. `null`
  // is a failed read, which proves nothing.
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
      console.error('Muster Roll could not read the room copy', read.error);
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

    // AD-9: a copy of a higher generation is adopted, and as it decodes it completes that
    // generation at once: a client that starts after an import takes the highest generation of its
    // storage and the copy.
    if (compareGenerations(copy.g, options.generation()) > 0) {
      options.adopt(copy);
    }

    const sameGeneration = compareGenerations(copy.g, options.generation()) === 0;

    // Set before the records merge, so the delta that brings them carries it: a window never sees
    // `read` without the records read.
    // A copy of another generation is there but cannot be read as this client's data.
    outcome = sameGeneration ? 'read' : 'unreadable';

    if (sameGeneration) {
      options.receive(copy.records);
    }

    noteRoomCopy(metadata, sameGeneration);
  }

  // AD-8: the edits paused. Each edit puts the write off again by the whole pause.
  function scheduleRoomCopy(): void {
    cancelScheduledWrite();

    if (lifecycle.phase === 'stopped' || !options.gm()) {
      return;
    }

    const delay =
      options.timing.snapshotPauseMs + options.random() * options.timing.snapshotJitterMs;

    const cancel = options.schedule(delay, () => {
      deferred.scheduled = undefined;
      void writeRoomCopy().catch((error) => {
        console.error('Muster Roll could not write the room copy', error);
      });
    });

    deferred.scheduled = { cancel };
  }

  // AD-8: read, merge, encode, measure, write and read back. Any run that does not end in a
  // verified write leaves the write owed, so catch-up's end or the next trigger tries again.
  async function writeRoomCopy(): Promise<void> {
    if (lifecycle.phase === 'stopped') {
      return;
    }

    cancelScheduledWrite();
    deferred.owed = true;

    if (activeWrite() !== undefined) {
      deferred.rerun = true;

      return;
    }

    if (!options.writable()) {
      return;
    }

    const operation = beginWrite('ordinary');
    const run = runRoomCopyWrite(operation);
    operation.completion = run.catch(() => undefined);

    try {
      await run;
    } finally {
      finishWrite(operation);
    }

    if (deferred.rerun) {
      deferred.rerun = false;
      await writeRoomCopy();
    }
  }

  async function waitForWrite(): Promise<void> {
    const operation = activeWrite();

    if (operation === undefined) {
      return;
    }

    await operation.completion;
    await waitForWrite();
  }

  async function runRoomCopyWrite(operation: ActiveWrite): Promise<void> {
    const changesAtRead = pageChanges;
    const metadata = await readMetadata(options.metadata);

    // Step 2: a `resume` or a visibility change during the read stops the write.
    if (!options.writable() || pageChanges !== changesAtRead) {
      return;
    }

    if (metadata === null) {
      failRoomCopy(null);

      return;
    }

    const read = readSnapshot(metadata);

    // Step 1: a copy this build cannot read is never overwritten.
    if (!read.isOk()) {
      console.error('Muster Roll could not read the room copy', read.error);
      unreadableRoomCopy(metadata, read.error);

      return;
    }

    const copy = read.value;

    if (copy !== null) {
      const relation = compareGenerations(copy.g, options.generation());

      if (relation > 0) {
        options.adopt(copy);

        return;
      }

      // A lower generation is not merged, and the write below replaces it.
      if (relation === 0) {
        options.receive(copy.records);
      }
    }

    const written: Snapshot = { g: options.generation(), records: [...options.records()] };
    const value = encodeSnapshot(written.g, written.records);

    // Step 4: over the limit the previous copy stays.
    if (!value.isOk() || roomMetadataBytes(metadata, value.value) > ROOM_METADATA_BYTE_LIMIT) {
      failRoomCopy(metadata);

      return;
    }

    await verifyRoomCopyWrite(operation, written, value.value);
  }

  // Step 5: Owlbear reports success for a write it drops, so only the read-back counts.
  async function verifyRoomCopyWrite(
    operation: ActiveWrite,
    written: Snapshot,
    value: SnapshotValue,
  ): Promise<void> {
    operation.phase = 'writing';

    try {
      await options.metadata.setMetadata({ [SNAPSHOT_KEY]: value });
    } catch (error) {
      console.error('Muster Roll could not write the room copy', error);

      if (options.writable()) {
        failRoomCopy(null);
      }

      return;
    }

    if (!options.writable()) {
      return;
    }

    operation.phase = 'verifying';
    const readBack = await readMetadata(options.metadata);

    if (!options.writable()) {
      return;
    }

    if (readBack === null) {
      failRoomCopy(null);

      return;
    }

    const check = readSnapshot(readBack);

    // A copy of a higher generation holds none of this client's records, so it is not saved.
    if (check.isOk() && check.value !== null && compareGenerations(check.value.g, written.g) > 0) {
      options.adopt(check.value);

      return;
    }

    if (!check.isOk() || !readBackHolds(written, check.value)) {
      failRoomCopy(readBack);

      return;
    }

    deferred.owed = false;
    notSaved = false;
    noteRoomCopy(readBack, true);
  }

  // AD-9: the importer's room copy of the new generation. One that does not fit or fails its
  // read-back raises the not-saved notice, and a copy of a lower generation goes from the room, so
  // a player with no GM does not read the replaced data. It waits for a write in flight, which
  // could land an older copy after it.
  async function writeImportCopy(generation: Generation, superseded: () => boolean): Promise<void> {
    await waitForWrite();

    if (lifecycle.phase === 'stopped') {
      return;
    }

    const operation = beginWrite('import');
    const run = runImportCopy(operation, generation, superseded);
    operation.completion = run.then(() => undefined).catch(() => undefined);
    let supersededImport = false;

    try {
      supersededImport = await run;
    } finally {
      finishWrite(operation);
    }

    if (!supersededImport && deferred.rerun) {
      deferred.rerun = false;
      void writeRoomCopy().catch((error) => {
        console.error('Muster Roll could not write the room copy', error);
      });
    }
  }

  async function runImportCopy(
    operation: ActiveWrite,
    generation: Generation,
    superseded: () => boolean,
  ): Promise<boolean> {
    const verified = await importCopyVerified(operation, generation, superseded);

    if (superseded()) {
      return true;
    }

    if (verified !== null) {
      deferred.owed = false;
      notSaved = false;
      noteRoomCopy(verified, true);
    } else {
      notSaved = true;
      deferred.owed = true;
      await removeLowerCopy(operation, generation, superseded);
    }

    return false;
  }

  // The read-back metadata of a verified write, or `null`. AD-9: it writes over a copy of a lower
  // generation, one that does not decode and one of an older format, never one of a newer build.
  async function importCopyVerified(
    operation: ActiveWrite,
    generation: Generation,
    superseded: () => boolean,
  ): Promise<JsonObject | null> {
    operation.phase = 'reading';
    const metadata = await readMetadata(options.metadata);

    if (metadata === null || superseded()) {
      return null;
    }

    const current = readSnapshot(metadata);

    if (!current.isOk() && current.error === 'newer-version') {
      console.error('Muster Roll could not replace the room copy of a newer build');
      options.newerVersion();

      return null;
    }

    // A copy of a higher generation is another import that won: it is adopted, not overwritten.
    if (adoptedHigherCopy(metadata, generation)) {
      return null;
    }

    const written: Snapshot = { g: generation, records: [...options.records()] };
    const value = encodeSnapshot(written.g, written.records);

    if (!value.isOk() || roomMetadataBytes(metadata, value.value) > ROOM_METADATA_BYTE_LIMIT) {
      return null;
    }

    operation.phase = 'writing';

    try {
      await options.metadata.setMetadata({ [SNAPSHOT_KEY]: value.value });
    } catch (error) {
      console.error('Muster Roll could not write the room copy', error);

      return null;
    }

    operation.phase = 'verifying';
    const readBack = await readMetadata(options.metadata);

    if (readBack === null || superseded() || adoptedHigherCopy(readBack, generation)) {
      return null;
    }

    const check = readSnapshot(readBack);

    return check.isOk() && readBackHolds(written, check.value) ? readBack : null;
  }

  // Adopts a room copy of a generation above `generation`, and says whether there was one.
  function adoptedHigherCopy(metadata: JsonObject, generation: Generation): boolean {
    const read = readSnapshot(metadata);

    if (!read.isOk() || read.value === null || compareGenerations(read.value.g, generation) <= 0) {
      return false;
    }

    options.adopt(read.value);

    return true;
  }

  // A copy this build cannot read stays: it may be a newer build's.
  async function removeLowerCopy(
    operation: ActiveWrite,
    generation: Generation,
    superseded: () => boolean,
  ): Promise<void> {
    operation.phase = 'reading';
    const metadata = await readMetadata(options.metadata);

    if (metadata === null || superseded()) {
      options.changed();

      return;
    }

    const read = readSnapshot(metadata);

    if (!read.isOk() || read.value === null || compareGenerations(read.value.g, generation) >= 0) {
      noteRoomCopy(metadata, false);

      return;
    }

    operation.phase = 'writing';

    try {
      await options.metadata.setMetadata({ [SNAPSHOT_KEY]: undefined });
    } catch (error) {
      console.error('Muster Roll could not remove the replaced room copy', error);
    }

    operation.phase = 'verifying';
    const after = await readMetadata(options.metadata);

    if (after === null || lifecycle.phase === 'stopped') {
      options.changed();

      return;
    }

    noteRoomCopy(after, false);
  }

  // A GM raises the not-saved notice for a copy it cannot read; a newer build's copy also raises
  // the new-version notice. A copy of an older format raises the GM's older-format notice instead,
  // as only a wipe replaces it (AD-12). A player shows the catch-up outcome instead (Story 2.6).
  function unreadableRoomCopy(metadata: JsonObject, failure: SnapshotFailure): void {
    if (failure === 'newer-version') {
      options.newerVersion();
    }

    if (options.gm() && failure !== 'older-version') {
      failRoomCopy(metadata);
    } else {
      noteRoomCopy(metadata, false);
    }
  }

  // `null` keeps the sizes last read.
  function failRoomCopy(metadata: JsonObject | null): void {
    notSaved = true;
    deferred.owed = true;

    if (metadata === null) {
      options.changed();
    } else {
      noteRoomCopy(metadata, exists);
    }
  }

  // Another GM's write or another extension's data changes what Settings shows. A copy of this
  // generation does not merge here. A copy of a higher generation is adopted (gap 12), as an
  // importer writes it before its `reset`.
  function followMetadata(metadata: JsonObject): void {
    if (lifecycle.phase === 'stopped') {
      return;
    }

    const read = readSnapshot(metadata);
    const copy = read.isOk() ? read.value : null;

    if (copy !== null && compareGenerations(copy.g, options.generation()) > 0) {
      options.adopt(copy);
    }

    noteRoomCopy(metadata, copy !== null && compareGenerations(copy.g, options.generation()) === 0);
  }

  // Takes the sizes from the metadata just read. The publisher compares the resulting header.
  function noteRoomCopy(metadata: JsonObject, copyExists: boolean): void {
    const usage = roomCopyUsage(metadata);
    const read = readSnapshot(metadata);

    older = !read.isOk() && read.error === 'older-version';
    exists = copyExists;
    used = usage.usedBytes;
    free = usage.freeBytes;
    options.changed();
  }

  return {
    edited: scheduleRoomCopy,
    pageHidden: () => {
      pageChanges += 1;
      void writeRoomCopy().catch((error) => {
        console.error('Muster Roll could not write the room copy', error);
      });
    },
    pageReturned: () => {
      pageChanges += 1;
    },
    caughtUp: (applied) => {
      if (deferred.owed || applied) {
        scheduleRoomCopy();
      }
    },
    read: async () => {
      const metadata = await readMetadata(options.metadata);

      if (lifecycle.phase === 'stopped') {
        return;
      }

      mergeRoomCopy(metadata);
    },
    followed: followMetadata,
    replaced: (fromCopy) => {
      exists = fromCopy;
      options.changed();
    },
    demoted: () => {
      cancelScheduledWrite();
      deferred.owed = false;
      notSaved = false;
    },
    stop: () => {
      const active = activeWrite();
      cancelScheduledWrite();
      lifecycle = active === undefined ? { phase: 'stopped' } : { phase: 'stopped', active };
    },
    writeImport: writeImportCopy,
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
): Promise<JsonObject | null> {
  try {
    return await metadata.getMetadata();
  } catch (error) {
    console.error('Muster Roll could not read the room metadata', error);

    return null;
  }
}

// AD-12: what a room copy that cannot be read shows a player: a newer build's, an older format's,
// or one that does not decode.
function outcomeOf(failure: SnapshotFailure): RoomCopyOutcome {
  if (failure === 'newer-version') {
    return 'newer';
  }

  return failure === 'older-version' ? 'older' : 'unreadable';
}
