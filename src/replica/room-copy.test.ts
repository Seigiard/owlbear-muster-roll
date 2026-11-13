import { expect, test } from 'bun:test';

import type { JsonObject } from '@/core/json';
import type { VersionedRecord } from '@/core/records';
import { encodeSnapshot, readSnapshot, SNAPSHOT_KEY } from '@/core/snapshot';
import type { Generation } from '@/core/storage-key';
import type { RoomCopyOutcome } from '@/core/ui-messages';
import { createMockPlatform, createMemoryRoom, type MockPlatform } from '@/platform/current';
import type { MetadataUpdate } from '@/platform/ports';

import { createRoomCopy } from './room-copy';

const INITIAL: Generation = { n: 0, a: '' };
const HIGHER: Generation = { n: 1, a: 'other-gm' };
const RECORD: VersionedRecord = { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' };
const NEW_RECORD: VersionedRecord = { k: 'row:brok:str', d: { str: 14 }, c: 1, a: 'gm-a' };

type Gate = {
  reads: number;
  writes: number;
  activeWrites: number;
  peakWrites: number;
  rejectRead: boolean;
  rejectReadAt: number | null;
  rejectWrite: boolean;
  dropWrite: boolean;
  afterWrite: (() => void) | null;
  holdRead: Promise<void> | null;
  holdWrite: Promise<void> | null;
  releaseRead: () => void;
  releaseWrite: () => void;
};

type Subject = ReturnType<typeof createRoomCopy> & {
  gate: Gate;
  room: ReturnType<typeof createMemoryRoom>;
  received: Array<readonly VersionedRecord[]>;
  receivedOutcomes: Array<{ records: readonly VersionedRecord[]; outcome: RoomCopyOutcome }>;
  adopted: unknown[];
  newer: number;
  changed: number;
  delays: number[];
  runScheduled: (index?: number) => Promise<void>;
  writable: (next: boolean) => void;
  gm: (next: boolean) => void;
  generation: (next: Generation) => void;
};

function createGate(): Gate {
  let releaseRead = (): void => undefined;
  let releaseWrite = (): void => undefined;

  return {
    reads: 0,
    writes: 0,
    activeWrites: 0,
    peakWrites: 0,
    rejectRead: false,
    rejectReadAt: null,
    rejectWrite: false,
    dropWrite: false,
    afterWrite: null,
    holdRead: null,
    holdWrite: null,
    releaseRead: () => releaseRead(),
    releaseWrite: () => releaseWrite(),
  };
}

function holdRead(gate: Gate): void {
  gate.holdRead = new Promise((resolve) => {
    gate.releaseRead = resolve;
  });
}

function holdWrite(gate: Gate): void {
  gate.holdWrite = new Promise((resolve) => {
    gate.releaseWrite = resolve;
  });
}

function createSubject(
  options: {
    records?: readonly VersionedRecord[];
    writable?: boolean;
    gm?: boolean;
    generation?: Generation;
  } = {},
): Subject {
  const room = createMemoryRoom();

  const platform = createMockPlatform(undefined, undefined, {
    room,
    connectionId: 'gm-a',
    playerId: 'gm-a',
    name: 'GM A',
    role: 'GM',
  });

  const gate = createGate();
  const metadata = gatedMetadata(platform, gate);
  const received: Array<readonly VersionedRecord[]> = [];

  const receivedOutcomes: Array<{ records: readonly VersionedRecord[]; outcome: RoomCopyOutcome }> =
    [];

  const adopted: unknown[] = [];
  const scheduled: { run: () => void; cancelled: boolean }[] = [];
  const delays: number[] = [];
  let generation = options.generation ?? INITIAL;
  let writable = options.writable ?? true;
  let gm = options.gm ?? true;
  let newer = 0;
  let changed = 0;

  const copy = createRoomCopy({
    metadata,
    timing: { snapshotPauseMs: 10, snapshotJitterMs: 4 },
    random: () => 0.5,
    schedule: (delay, run) => {
      delays.push(delay);

      const entry = { run, cancelled: false };
      scheduled.push(entry);

      return () => {
        entry.cancelled = true;
      };
    },
    writable: () => writable,
    gm: () => gm,
    generation: () => generation,
    records: () => options.records ?? [RECORD, NEW_RECORD],
    receive: (records) => {
      received.push(records);
      receivedOutcomes.push({ records, outcome: copy.status().outcome });
    },
    adopt: (snapshot) => adopted.push(snapshot),
    newerVersion: () => {
      newer += 1;
    },
    changed: () => {
      changed += 1;
    },
  });

  const subject = Object.assign(copy, {
    gate,
    room,
    received,
    receivedOutcomes,
    adopted,

    delays,
    runScheduled: async (index = 0) => {
      const entry = scheduled[index];

      if (entry !== undefined && !entry.cancelled) {
        entry.run();
      }

      await flush();
    },
    writable: (next: boolean) => {
      writable = next;
    },

    gm: (next: boolean) => {
      gm = next;
    },
    generation: (next: Generation) => {
      generation = next;
    },
  });

  Object.defineProperties(subject, {
    newer: { get: () => newer },
    changed: { get: () => changed },
  });

  // SAFETY: the getters installed above supply Subject's dynamic newer and changed fields.
  return subject as Subject;
}

function gatedMetadata(platform: MockPlatform, gate: Gate) {
  return {
    getMetadata: async () => {
      gate.reads += 1;

      const held = gate.holdRead;
      gate.holdRead = null;
      await held;

      if (gate.rejectRead || gate.rejectReadAt === gate.reads) {
        throw new Error('read rejected');
      }

      return platform.metadata.getMetadata();
    },
    setMetadata: async (update: MetadataUpdate) => {
      gate.writes += 1;
      gate.activeWrites += 1;
      gate.peakWrites = Math.max(gate.peakWrites, gate.activeWrites);

      const held = gate.holdWrite;
      gate.holdWrite = null;
      await held;
      gate.activeWrites -= 1;

      if (gate.rejectWrite) {
        throw new Error('write rejected');
      }

      if (!gate.dropWrite) {
        await platform.metadata.setMetadata(update);
        const afterWrite = gate.afterWrite;
        gate.afterWrite = null;
        afterWrite?.();
      }
    },
  };
}

function copied(generation: Generation, records: readonly VersionedRecord[]): JsonObject {
  const encoded = encodeSnapshot(generation, records);

  if (!encoded.ok) {
    throw new Error('fixture did not encode');
  }

  return { [SNAPSHOT_KEY]: encoded.value };
}

function decoded(room: ReturnType<typeof createMemoryRoom>) {
  const read = readSnapshot(room.getMetadata());

  if (!read.ok) {
    throw new Error('room copy did not decode');
  }

  return read.value;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) {
      return;
    }

    await flush();
  }

  throw new Error('test gate did not reach its expected state');
}

async function flush(): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

test('pause arms the literal pause plus jitter again and a player arms nothing', async () => {
  // #given
  const gm = createSubject();
  const player = createSubject({ gm: false });

  // #when
  gm.edited();
  gm.edited();
  player.edited();
  await gm.runScheduled(0);
  await gm.runScheduled(1);

  // #then
  expect({ delays: gm.delays, playerDelays: player.delays, writes: gm.gate.writes }).toEqual({
    delays: [12, 12],
    playerDelays: [],
    writes: 1,
  });
});

test('write receives its generation copy and verifies the literal sorted records before saved', async () => {
  // #given
  const subject = createSubject();
  subject.room.setMetadata(copied(INITIAL, [NEW_RECORD, RECORD]));

  // #when
  subject.pageHidden();
  await flush();

  // #then
  expect({
    received: subject.received,
    copy: decoded(subject.room),
    status: subject.status(),
  }).toEqual({
    received: [[NEW_RECORD, RECORD]],
    copy: { g: INITIAL, records: [NEW_RECORD, RECORD] },
    status: {
      state: 'saved',
      usedBytes: expect.any(Number),
      freeBytes: expect.any(Number),
      outcome: null,
    },
  });
});

test('write replaces a lower room copy without receiving it', async () => {
  // #given
  const subject = createSubject({ generation: HIGHER });
  subject.room.setMetadata(copied(INITIAL, [RECORD]));

  // #when
  subject.pageHidden();
  await flush();

  // #then
  expect({ received: subject.received, copy: decoded(subject.room)?.g }).toEqual({
    received: [],
    copy: HIGHER,
  });
});

test('higher copy at the write read is adopted and never overwritten', async () => {
  // #given
  const subject = createSubject();
  subject.room.setMetadata(copied(HIGHER, [RECORD]));

  // #when
  subject.pageHidden();
  await flush();

  // #then
  expect({
    adopted: subject.adopted,
    writes: subject.gate.writes,
    state: subject.status().state,
  }).toEqual({
    adopted: [{ g: HIGHER, records: [RECORD] }],
    writes: 0,
    state: 'none',
  });
});

test.each([
  ['invalid', { [SNAPSHOT_KEY]: { v: 2, data: 'not-deflate' } }, 'failed', ['room-copy-not-saved']],
  ['newer', { [SNAPSHOT_KEY]: { v: 3, data: 'newer' } }, 'failed', ['room-copy-not-saved']],
  ['older', { [SNAPSHOT_KEY]: { v: 1, data: 'older' } }, 'none', ['room-copy-older-format']],
] as const)(
  'unreadable %s copy has its literal GM status and notice',
  async (_kind, metadata, state, notices) => {
    // #given
    const subject = createSubject();
    subject.room.setMetadata(metadata);

    // #when
    await subject.read();

    // #then
    expect({
      state: subject.status().state,
      notices: subject.notices(),
      writes: subject.gate.writes,
    }).toEqual({
      state,
      notices: [...notices],
      writes: 0,
    });
  },
);

test('metadata above 15500 bytes keeps the previous copy and fails', async () => {
  // #given
  const subject = createSubject();
  subject.room.setMetadata({
    'other.extension/data': 'x'.repeat(15400),
    ...copied(INITIAL, [RECORD]),
  });

  // #when
  subject.pageHidden();
  await flush();

  // #then
  expect({
    copy: decoded(subject.room),
    state: subject.status().state,
    writes: subject.gate.writes,
  }).toEqual({
    copy: { g: INITIAL, records: [RECORD] },
    state: 'failed',
    writes: 0,
  });
});

test.each(['read', 'write', 'read-back', 'dropped'] as const)(
  'a %s port fault fails and the next verified write clears it',
  async (fault) => {
    // #given
    const subject = createSubject();
    subject.gate.rejectRead = fault === 'read';
    subject.gate.rejectReadAt = fault === 'read-back' ? 2 : null;
    subject.gate.rejectWrite = fault === 'write';
    subject.gate.dropWrite = fault === 'dropped';

    // #when
    subject.pageHidden();
    await flush();
    const failed = { state: subject.status().state, notices: subject.notices() };
    subject.gate.rejectRead = false;
    subject.gate.rejectReadAt = null;
    subject.gate.rejectWrite = false;
    subject.gate.dropWrite = false;
    subject.pageHidden();
    await flush();

    // #then
    expect({
      failed,
      saved: {
        state: subject.status().state,
        notices: subject.notices(),
        copy: decoded(subject.room),
      },
    }).toEqual({
      failed: { state: 'failed', notices: ['room-copy-not-saved'] },
      saved: {
        state: 'saved',
        notices: [],
        copy: { g: INITIAL, records: [NEW_RECORD, RECORD] },
      },
    });
  },
);

test('a page return during the held read stops that write and a hidden page writes on its own', async () => {
  // #given
  const subject = createSubject();
  holdRead(subject.gate);

  // #when
  subject.pageHidden();
  await flush();
  subject.pageReturned();
  subject.gate.releaseRead();
  await flush();
  subject.pageHidden();
  await flush();

  // #then
  expect({ writes: subject.gate.writes, copy: decoded(subject.room) }).toEqual({
    writes: 1,
    copy: { g: INITIAL, records: [NEW_RECORD, RECORD] },
  });
});

test('a closed gate owes nothing written and a later catch-up arms the owed write', async () => {
  // #given
  const subject = createSubject({ writable: false });

  // #when
  subject.pageHidden();
  await flush();
  subject.writable(true);
  subject.caughtUp(false);
  await subject.runScheduled();

  // #then
  expect({ writes: subject.gate.writes, state: subject.status().state }).toEqual({
    writes: 1,
    state: 'saved',
  });
});

test('a gate that closes after its write leaves the status unchanged and an owed write', async () => {
  // #given
  const subject = createSubject();
  subject.gate.afterWrite = () => subject.writable(false);

  // #when
  subject.pageHidden();
  await flush();

  const closed = {
    reads: subject.gate.reads,
    writes: subject.gate.writes,
    state: subject.status().state,
    notices: subject.notices(),
  };

  subject.writable(true);
  subject.caughtUp(false);
  await subject.runScheduled();

  // #then
  expect({
    closed,
    recovered: { writes: subject.gate.writes, state: subject.status().state },
  }).toEqual({
    closed: { reads: 1, writes: 1, state: 'none', notices: [] },
    recovered: { writes: 2, state: 'saved' },
  });
});

test('a gate that closes during the held read-back leaves the status unchanged and an owed write', async () => {
  // #given
  const subject = createSubject();
  subject.gate.afterWrite = () => holdRead(subject.gate);

  // #when
  subject.pageHidden();
  await waitFor(() => subject.gate.reads === 2);
  subject.writable(false);
  subject.gate.releaseRead();
  await flush();

  const closed = {
    reads: subject.gate.reads,
    writes: subject.gate.writes,
    state: subject.status().state,
    notices: subject.notices(),
  };

  subject.writable(true);
  subject.caughtUp(false);
  await subject.runScheduled();

  // #then
  expect({
    closed,
    recovered: { writes: subject.gate.writes, state: subject.status().state },
  }).toEqual({
    closed: { reads: 2, writes: 1, state: 'none', notices: [] },
    recovered: { writes: 2, state: 'saved' },
  });
});

test('an unreadable copy fails and stays owed for the next catch-up write', async () => {
  // #given
  const subject = createSubject();
  subject.room.setMetadata({ [SNAPSHOT_KEY]: { v: 2, data: 'not-deflate' } });

  // #when
  await subject.read();
  const failed = { state: subject.status().state, notices: subject.notices() };
  subject.room.setMetadata({ [SNAPSHOT_KEY]: undefined });
  subject.caughtUp(false);
  await subject.runScheduled();

  // #then
  expect({
    failed,
    recovered: { writes: subject.gate.writes, state: subject.status().state },
  }).toEqual({
    failed: { state: 'failed', notices: ['room-copy-not-saved'] },
    recovered: { writes: 1, state: 'saved' },
  });
});

test('a higher copy at routine write read-back is adopted instead of failed', async () => {
  // #given
  const subject = createSubject();
  subject.gate.afterWrite = () => subject.room.setMetadata(copied(HIGHER, [RECORD]));

  // #when
  subject.pageHidden();
  await flush();

  // #then
  expect({
    adopted: subject.adopted,
    writes: subject.gate.writes,
    state: subject.status().state,
    notices: subject.notices(),
  }).toEqual({
    adopted: [{ g: HIGHER, records: [RECORD] }],
    writes: 1,
    state: 'none',
    notices: [],
  });
});

test('one trigger during a held write makes one more write and never overlaps', async () => {
  // #given
  const subject = createSubject();
  holdWrite(subject.gate);

  // #when
  subject.pageHidden();
  await waitFor(() => subject.gate.writes === 1);
  subject.pageHidden();
  await flush();
  const whileHeld = subject.gate.writes;
  subject.gate.releaseWrite();
  await flush();

  // #then
  expect({ whileHeld, writes: subject.gate.writes, peakWrites: subject.gate.peakWrites }).toEqual({
    whileHeld: 1,
    writes: 2,
    peakWrites: 1,
  });
});

test('import waits for a write and saves its generation over a lower copy', async () => {
  // #given
  const subject = createSubject();
  subject.room.setMetadata(copied(INITIAL, [RECORD]));
  holdWrite(subject.gate);
  subject.pageHidden();
  await waitFor(() => subject.gate.writes === 1);

  // #when
  subject.generation(HIGHER);
  const imported = subject.writeImport(HIGHER, () => false);
  await flush();
  const beforeRelease = subject.gate.writes;
  subject.gate.releaseWrite();
  await imported;

  // #then
  expect({
    copy: decoded(subject.room),
    state: subject.status().state,
    writes: subject.gate.writes,
    beforeRelease,
  }).toEqual({
    copy: { g: HIGHER, records: [NEW_RECORD, RECORD] },
    state: 'saved',
    writes: 2,
    beforeRelease: 1,
  });
});

test('import keeps a newer-build copy and raises its literal notice', async () => {
  // #given
  const subject = createSubject();
  const newer = { v: 3, data: 'newer' };
  subject.room.setMetadata({ [SNAPSHOT_KEY]: newer });

  // #when
  subject.generation(HIGHER);
  await subject.writeImport(HIGHER, () => false);

  // #then
  expect({
    copy: subject.room.getMetadata()[SNAPSHOT_KEY],
    newer: subject.newer,
    state: subject.status().state,
  }).toEqual({
    copy: newer,
    newer: 1,
    state: 'failed',
  });
});

test('a failed import keeps a readable copy of its own generation', async () => {
  // #given
  const subject = createSubject({ generation: HIGHER });
  subject.room.setMetadata(copied(HIGHER, [RECORD]));
  subject.gate.dropWrite = true;

  // #when
  await subject.writeImport(HIGHER, () => false);

  // #then
  expect({
    copy: decoded(subject.room),
    writes: subject.gate.writes,
    state: subject.status().state,
    notices: subject.notices(),
  }).toEqual({
    copy: { g: HIGHER, records: [RECORD] },
    writes: 1,
    state: 'failed',
    notices: ['room-copy-not-saved'],
  });
});

test('a verified import clears an earlier owed routine write', async () => {
  // #given
  const subject = createSubject({ writable: false });
  subject.pageHidden();
  await flush();
  subject.writable(true);
  subject.generation(HIGHER);

  // #when
  await subject.writeImport(HIGHER, () => false);
  subject.caughtUp(false);
  await subject.runScheduled();

  // #then
  expect({
    writes: subject.gate.writes,
    delays: subject.delays,
    state: subject.status().state,
  }).toEqual({
    writes: 1,
    delays: [],
    state: 'saved',
  });
});

test('a superseded import leaves the room copy status unchanged', async () => {
  // #given
  const subject = createSubject();

  // #when
  await subject.writeImport(HIGHER, () => true);

  // #then
  expect({
    state: subject.status().state,
    notices: subject.notices(),
    writes: subject.gate.writes,
  }).toEqual({
    state: 'none',
    notices: [],
    writes: 0,
  });
});

test('an import read-back missing an imported record fails instead of saving', async () => {
  // #given
  const subject = createSubject({ generation: HIGHER });
  subject.gate.afterWrite = () => subject.room.setMetadata(copied(HIGHER, [RECORD]));

  // #when
  await subject.writeImport(HIGHER, () => false);

  // #then
  expect({
    copy: decoded(subject.room),
    state: subject.status().state,
    notices: subject.notices(),
  }).toEqual({
    copy: { g: HIGHER, records: [RECORD] },
    state: 'failed',
    notices: ['room-copy-not-saved'],
  });
});

test('a higher import read-back is adopted and left in the room', async () => {
  // #given
  const subject = createSubject();
  subject.gate.afterWrite = () => subject.room.setMetadata(copied(HIGHER, [RECORD]));

  // #when
  await subject.writeImport(INITIAL, () => false);

  // #then
  expect({
    adopted: subject.adopted,
    copy: decoded(subject.room),
    writes: subject.gate.writes,
    state: subject.status().state,
    notices: subject.notices(),
  }).toEqual({
    adopted: [{ g: HIGHER, records: [RECORD] }],
    copy: { g: HIGHER, records: [RECORD] },
    writes: 1,
    state: 'failed',
    notices: ['room-copy-not-saved'],
  });
});

test('a trigger during import runs one write after the import', async () => {
  // #given
  const subject = createSubject();
  holdWrite(subject.gate);

  // #when
  subject.generation(HIGHER);
  const imported = subject.writeImport(HIGHER, () => false);
  await waitFor(() => subject.gate.writes === 1);
  subject.edited();
  await subject.runScheduled();
  subject.gate.releaseWrite();
  await imported;
  const atImportResolution = subject.gate.writes;
  await flush();

  // #then
  expect({
    atImportResolution,
    afterFlush: { writes: subject.gate.writes, copy: decoded(subject.room)?.g },
  }).toEqual({
    atImportResolution: 1,
    afterFlush: { writes: 2, copy: HIGHER },
  });
});

test.each([
  ['none', {}, 'none'],
  ['same', copied(INITIAL, [RECORD]), 'read'],
  ['higher', copied(HIGHER, [RECORD]), 'unreadable'],
] as const)(
  'catch-up read %s reports its literal outcome before received records',
  async (_kind, metadata, outcome) => {
    // #given
    const subject = createSubject();
    subject.room.setMetadata(metadata);

    // #when
    await subject.read();

    // #then
    expect({ outcome: subject.status().outcome, received: subject.receivedOutcomes }).toEqual({
      outcome,
      received: outcome === 'read' ? [{ records: [RECORD], outcome: 'read' }] : [],
    });
  },
);

test.each([
  [
    'invalid',
    { [SNAPSHOT_KEY]: { v: 2, data: 'not-deflate' } },
    'failed',
    ['room-copy-not-saved'],
    'unreadable',
    0,
  ],
  [
    'newer',
    { [SNAPSHOT_KEY]: { v: 3, data: 'newer' } },
    'failed',
    ['room-copy-not-saved'],
    'newer',
    1,
  ],
  [
    'older',
    { [SNAPSHOT_KEY]: { v: 1, data: 'older' } },
    'none',
    ['room-copy-older-format'],
    'older',
    0,
  ],
] as const)(
  'unreadable %s catch-up read has its literal outcome and notice',
  async (_kind, metadata, state, notices, outcome, newer) => {
    // #given
    const subject = createSubject();
    subject.room.setMetadata(metadata);

    // #when
    await subject.read();

    // #then
    expect({
      state: subject.status().state,
      outcome: subject.status().outcome,
      notices: subject.notices(),
      newer: subject.newer,
    }).toEqual({ state, outcome, notices: [...notices], newer });
  },
);

test('a rejected catch-up read is unreadable with no prior outcome', async () => {
  // #given
  const subject = createSubject();
  subject.gate.rejectRead = true;

  // #when
  await subject.read();

  // #then
  expect(subject.status().outcome).toBe('unreadable');
});

test('a rejected catch-up read keeps its earlier outcome', async () => {
  // #given
  const subject = createSubject();
  subject.room.setMetadata(copied(INITIAL, [RECORD]));
  await subject.read();
  subject.gate.rejectRead = true;

  // #when
  await subject.read();

  // #then
  expect(subject.status().outcome).toBe('read');
});

test('watch updates sizes without merging own generation and adopts higher generation', async () => {
  // #given
  const subject = createSubject();

  // #when
  subject.followed(copied(INITIAL, [RECORD]));
  subject.followed(copied(HIGHER, [RECORD]));

  // #then
  expect({
    state: subject.status().state,
    received: subject.received,
    adopted: subject.adopted,
  }).toEqual({
    state: 'none',
    received: [],
    adopted: [{ g: HIGHER, records: [RECORD] }],
  });
});

test('demotion and stop clear scheduled work and block later write effects', async () => {
  // #given
  const subject = createSubject();
  subject.edited();
  subject.demoted();
  subject.stop();
  subject.room.setMetadata(copied(HIGHER, [RECORD]));

  // #when
  await subject.runScheduled();
  await subject.read();

  // #then
  expect({
    writes: subject.gate.writes,
    received: subject.received,
    adopted: subject.adopted,
  }).toEqual({
    writes: 0,
    received: [],
    adopted: [],
  });
});

test('demotion clears a failed notice and its owed catch-up write', async () => {
  // #given
  const subject = createSubject();
  subject.room.setMetadata({ [SNAPSHOT_KEY]: { v: 2, data: 'not-deflate' } });
  await subject.read();

  // #when
  subject.demoted();
  subject.caughtUp(false);
  await subject.runScheduled();

  // #then
  expect({
    writes: subject.gate.writes,
    delays: subject.delays,
    state: subject.status().state,
    notices: subject.notices(),
  }).toEqual({
    writes: 0,
    delays: [],
    state: 'none',
    notices: [],
  });
});

test('each status or notice change signals the publisher', async () => {
  // #given
  const subject = createSubject();

  // #when
  await subject.read();
  subject.pageHidden();
  await flush();

  // #then
  expect(subject.changed).toBe(3);
});
