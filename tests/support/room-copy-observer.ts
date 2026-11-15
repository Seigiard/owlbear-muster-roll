import { createRoomCopy } from '../../src/replica/room-copy';

const INITIAL = { n: 0, a: '' };
const HIGHER = { n: 1, a: 'other-gm' };

function createHeldWriteCopy() {
  let releaseWriteStarted = (): void => undefined;

  const writeStarted = new Promise<void>((resolve) => {
    releaseWriteStarted = resolve;
  });

  let releaseHeldWrite = (): void => undefined;

  const heldWrite = new Promise<void>((resolve) => {
    releaseHeldWrite = resolve;
  });

  let writes = 0;

  const copy = createRoomCopy({
    metadata: {
      getMetadata: async () => ({}),
      setMetadata: async () => {
        writes += 1;
        releaseWriteStarted();
        await heldWrite;
      },
    },
    timing: { snapshotPauseMs: 10, snapshotJitterMs: 0 },
    random: () => 0,
    schedule: () => () => undefined,
    writable: () => true,
    gm: () => true,
    generation: () => INITIAL,
    records: () => [],
    receive: () => undefined,
    adopt: () => undefined,
    newerVersion: () => undefined,
    changed: () => undefined,
  });

  return {
    copy,
    writeStarted,
    releaseWrite: () => releaseHeldWrite(),
    writes: () => writes,
  };
}

const routine = createHeldWriteCopy();

routine.copy.pageHidden();

await routine.writeStarted;

const routineImport = routine.copy.writeImport(HIGHER, () => false);

setTimeout(routine.releaseWrite, 0);

await routineImport;

const stopped = createHeldWriteCopy();

stopped.copy.pageHidden();

await stopped.writeStarted;

const stoppedImport = stopped.copy.writeImport(HIGHER, () => false);

stopped.copy.stop();

stopped.releaseWrite();

await stoppedImport;

console.log(JSON.stringify({ event: 'import-complete', writes: stopped.writes() }));
