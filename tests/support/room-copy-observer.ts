import type { JsonObject } from '../../src/core/json';
import { mergeRecords } from '../../src/core/merge';
import type { VersionedRecord } from '../../src/core/records';
import { encodeSnapshot, readSnapshot, SNAPSHOT_KEY } from '../../src/core/snapshot';
import type { Generation } from '../../src/core/storage-key';
import type { MetadataUpdate } from '../../src/platform/ports';
import { createRoomCopy } from '../../src/replica/room-copy';

const INITIAL: Generation = { n: 0, a: '' };
const HIGHER: Generation = { n: 1, a: 'other-gm' };

const RECORD: VersionedRecord = {
  k: 'blk:brok',
  d: { set: 'pc', order: 0, cells: {} },
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
};

const NEW_RECORD: VersionedRecord = {
  k: 'blk:brok',
  d: { order: 0, cells: { str: [14, 1, 'gm-a'] } },
  c: 1,
  a: 'gm-a',
  l: [1, 'seed'],
};

const RECORDS = [mergeRecords(RECORD, NEW_RECORD)];

function createHeldWriteCopy() {
  let metadata: JsonObject = {};
  let writes = 0;
  let activeWrites = 0;
  let peakWrites = 0;
  let heldWrite: Promise<void> | null = null;
  let releaseWrite = (): void => undefined;
  let afterWrite: (() => void) | null = null;

  const metadataPort = {
    getMetadata: async () => metadata,
    setMetadata: async (update: MetadataUpdate) => {
      writes += 1;
      activeWrites += 1;
      peakWrites = Math.max(peakWrites, activeWrites);
      const held = heldWrite;
      heldWrite = null;
      await held;
      activeWrites -= 1;

      for (const [key, value] of Object.entries(update)) {
        if (value === undefined) {
          delete metadata[key];
        } else {
          metadata[key] = value;
        }
      }

      const completed = afterWrite;
      afterWrite = null;
      completed?.();
    },
  };

  const roomCopy = createRoomCopy({
    metadata: metadataPort,
    timing: { snapshotPauseMs: 10, snapshotJitterMs: 0 },
    random: () => 0,
    schedule: () => () => undefined,
    writable: () => true,
    gm: () => true,
    generation: () => INITIAL,
    records: () => RECORDS,
    receive: () => undefined,
    adopt: () => undefined,
    newerVersion: () => undefined,
    changed: () => undefined,
  });

  return {
    copy: roomCopy,
    holdWrite: () => {
      heldWrite = new Promise((resolve) => {
        releaseWrite = resolve;
      });
    },
    releaseWrite: () => releaseWrite(),
    writes: () => writes,
    peakWrites: () => peakWrites,
    afterWrite: (next: () => void) => {
      afterWrite = next;
    },
    setLowerCopy: () => {
      const encoded = encodeSnapshot(INITIAL, [RECORD]);

      if (!encoded.ok) {
        throw new Error('observer fixture did not encode');
      }

      metadata = { [SNAPSHOT_KEY]: encoded.value };
    },
    snapshot: () => {
      const read = readSnapshot(metadata);

      if (!read.ok || read.value === null) {
        throw new Error('observer fixture did not decode');
      }

      return read.value;
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error('observer gate did not reach its expected state');
}

async function observeStoppedWrite(): Promise<void> {
  const subject = createHeldWriteCopy();
  subject.holdWrite();
  subject.copy.pageHidden();
  await waitFor(() => subject.writes() === 1);
  const imported = subject.copy.writeImport(HIGHER, () => false);
  subject.copy.stop();
  subject.releaseWrite();
  await imported;
  console.log(
    JSON.stringify({
      event: 'stopped-write-import-complete',
      writes: subject.writes(),
      state: subject.copy.status().state,
    }),
  );
}

async function observeLaterMacrotask(): Promise<void> {
  const subject = createHeldWriteCopy();
  subject.setLowerCopy();
  subject.holdWrite();
  subject.copy.pageHidden();
  await waitFor(() => subject.writes() === 1);
  const imported = subject.copy.writeImport(HIGHER, () => false);
  setTimeout(subject.releaseWrite, 0);
  await imported;
  console.log(
    JSON.stringify({
      event: 'later-macrotask-import-complete',
      writes: subject.writes(),
      copy: subject.snapshot(),
    }),
  );
}

async function observeRoutineRerun(): Promise<void> {
  const subject = createHeldWriteCopy();
  subject.holdWrite();
  subject.copy.pageHidden();
  await waitFor(() => subject.writes() === 1);
  subject.copy.pageHidden();
  const imported = subject.copy.writeImport(HIGHER, () => false);
  subject.afterWrite(subject.holdWrite);
  subject.releaseWrite();
  await waitFor(() => subject.writes() === 2);

  const whileRerunHeld = {
    writes: subject.writes(),
    peakWrites: subject.peakWrites(),
  };

  subject.releaseWrite();
  await imported;
  console.log(
    JSON.stringify({
      event: 'routine-rerun-import-complete',
      whileRerunHeld,
      final: { writes: subject.writes(), peakWrites: subject.peakWrites() },
    }),
  );
}

const scenario = process.argv[2];

if (scenario === 'stopped-write') {
  await observeStoppedWrite();
} else if (scenario === 'later-macrotask') {
  await observeLaterMacrotask();
} else if (scenario === 'routine-rerun') {
  await observeRoutineRerun();
} else {
  throw new Error(`unknown observer scenario: ${scenario ?? '<missing>'}`);
}
