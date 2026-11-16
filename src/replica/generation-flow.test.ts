import { fixtureSnapshotCells, fixtureSnapshotBlocks } from '../../tests/support/block-fixtures';
import { expect, test } from 'bun:test';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { err, ok } from '@/core/result';
import type { Snapshot } from '@/core/snapshot';
import type { SnapshotFile } from '@/core/snapshot-file';
import { encodeSnapshotFileData } from '@/core/snapshot-import';
import type { Generation } from '@/core/storage-key';
import type { EngineMessage } from '@/core/ui-messages';
import { createCatchUp, type CatchUp, type CatchUpDecision } from './catch-up';
import {
  createGenerationFlow,
  type GenerationFlow,
  type GenerationFlowPorts,
} from './generation-flow';
import type { RecordStore } from './record-store';

const INITIAL: Generation = { n: 0, a: '' };
const NEXT: Generation = { n: 1, a: 'gm-a' };
const HIGHER: Generation = { n: 2, a: 'other-gm' };

const RECORD: VersionedRecord = {
  k: 'blk:anya',
  d: { set: 'pc', order: 0, cells: {} },
  c: 1,
  a: 'gm-a',
  l: [1, 'seed'],
};

const STALE_RECORD: VersionedRecord = {
  k: 'blk:stale',
  d: { set: 'pc', order: 1, cells: {} },
  c: 1,
  a: 'old-gm',
  l: [1, 'seed'],
};

const COPY: Snapshot = { g: NEXT, records: [RECORD] };

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Characters',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                { cells: [{ kind: 'field', type: 'number', id: 'str' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

const FILE: SnapshotFile = {
  v: 4,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'anya',
      set: 'pc',
      order: 0,
      cells: fixtureSnapshotCells({ name: { name: 'Anya' }, str: { str: 12 } }),
      blocks: fixtureSnapshotBlocks({}),
    },
  ],
  links: [],
};

type GenerationFlowPortsWithInterpreter = GenerationFlowPorts & {
  interpretCatchUp: (decisions: readonly CatchUpDecision[]) => void;
};

type Subject = {
  flow: GenerationFlow;
  catchUp: CatchUp;
  events: string[];
  replies: EngineMessage[];
  failWrite: () => void;
  failStore: (operation: 'mark-incomplete' | 'mark-generation' | 'mark-complete') => void;
  holdImport: () => void;
  releaseImport: () => void;
  onWriteImport: (next: () => void) => void;
  runCatchUp: (decisions: readonly CatchUpDecision[]) => void;
};

function createSubject(overrides: Partial<GenerationFlowPortsWithInterpreter> = {}): Subject {
  const events: string[] = [];
  const replies: EngineMessage[] = [];
  let writesFail = false;
  const failedStoreOperations = new Set<string>();
  let waitForImport: Promise<void> | null = null;
  let releaseImport = noop;
  let writeImportHook: (() => void) | null = null;
  let flow: GenerationFlow;
  const store = createStore(events, () => writesFail, failedStoreOperations);

  const catchUp = createCatchUp({
    timing: {
      catchUpTimeoutMs: 100,
      stateAnswerDelayMinMs: 10,
      stateAnswerDelayMaxMs: 30,
      gmLinkTimeoutMs: 80,
      incompleteRequestStartMs: 40,
      incompleteRequestMaxMs: 160,
    },
    random: () => 0,
    newId: () => 'catch-up-id',
    now: () => 0,
    role: () => 'GM',
    vouches: () => true,
    generation: () => flow?.generation() ?? INITIAL,
    digest: () => 0,
    commitsUnsent: () => false,
    hasData: () => true,
    saveAdoption: (generation, fromCopy) => flow.saveAdoption(generation, fromCopy),
  });

  const runCatchUp = (decisions: readonly CatchUpDecision[]): void => {
    for (const decision of decisions) {
      if (decision.type === 'adopt') {
        events.push('interpreter:adopt');
        flow.clearStaged(decision.hadData, decision.keepNonce);
      }
    }
  };

  const ports: GenerationFlowPortsWithInterpreter = {
    initialPersistence: { store, generation: INITIAL },
    connectionId: 'gm-a',
    records: () => new Map([[PRESET_RECORD.k, PRESET_RECORD]]),
    presetOf: (record) => (record?.k === 'preset' ? PRESET : null),
    role: () => 'GM',
    stopped: () => false,
    acceptCommand: () => true,
    catchUp,
    roomCopy: {
      writeImport: async (generation, superseded) => {
        events.push(`room-copy:write-import:${generationId(generation)}`);
        writeImportHook?.();

        if (superseded()) {
          events.push('room-copy:superseded');

          return;
        }

        await waitForImport;
      },
      replaced: (fromCopy) => events.push(`room-copy:replaced:${fromCopy}`),
    },
    flush: () => events.push('flush'),
    dropOutbox: () => events.push('drop-outbox'),
    sendRemote: (message) => events.push(`reset:${generationId(message.g)}`),
    replaceReplica: (records) =>
      events.push(`replace:${records.map((record) => record.k).join(',')}`),
    clearPendingEdits: () => events.push('clear-pending-edits'),
    dropPendingWork: () => events.push('drop-pending-work'),
    notifyDataReplaced: () => events.push('data-replaced-notice'),
    markGenerationSaveFailed: () => events.push('save-failed'),
    publish: () => events.push('publish'),
    clearDeletedLinks: () => events.push('clear-deleted-links'),
    reject: (id, reason) => events.push(`reject:${id}:${reason}`),
    reply: (message) => {
      replies.push(message);
      events.push(`reply:${message.t}:${'id' in message ? message.id : 'none'}`);
    },
    interpretCatchUp: runCatchUp,
    ...overrides,
  };

  flow = createGenerationFlow(ports);

  return {
    flow,
    catchUp,
    events,
    replies,
    failWrite: () => {
      writesFail = true;
    },
    failStore: (operation) => {
      failedStoreOperations.add(operation);
    },
    holdImport: () => {
      waitForImport = new Promise((resolve) => {
        releaseImport = resolve;
      });
    },
    releaseImport: () => {
      releaseImport();
      waitForImport = null;
    },
    onWriteImport: (next) => {
      writeImportHook = next;
    },
    runCatchUp,
  };
}

function createStore(
  events: string[],
  writesFail: () => boolean,
  failedOperations: ReadonlySet<string>,
): RecordStore {
  return {
    write: (generation, record) => {
      events.push(`store:write:${generationId(generation)}:${record.k}`);

      return writesFail() ? err({ operation: 'write', reason: 'quota' }) : ok(record);
    },
    loadGeneration: () => ok({ records: [], corruptKeys: [] }),
    readHighestGeneration: () => ok(INITIAL),
    markIncomplete: (generation) => {
      events.push(`store:incomplete:${generationId(generation)}`);

      return failedOperations.has('mark-incomplete')
        ? err({ operation: 'write', reason: 'quota' })
        : ok(undefined);
    },
    markComplete: (generation) => {
      events.push(`store:complete:${generationId(generation)}`);

      return failedOperations.has('mark-complete')
        ? err({ operation: 'write', reason: 'quota' })
        : ok(undefined);
    },
    markGeneration: (generation) => {
      events.push(`store:generation:${generationId(generation)}`);

      return failedOperations.has('mark-generation')
        ? err({ operation: 'write', reason: 'quota' })
        : ok(undefined);
    },
    removeGeneration: (generation) => {
      events.push(`store:remove:${generationId(generation)}`);

      return ok(undefined);
    },
    removeGenerationsBelow: (generation) => {
      events.push(`store:remove-below:${generationId(generation)}`);

      return ok(undefined);
    },
    removeIncomplete: () => ok(undefined),
    removeOlderFormats: () => {
      events.push('store:remove-older-formats');

      return ok(undefined);
    },
  };
}

function generationId(generation: Generation): string {
  return `${generation.n}:${generation.a}`;
}

function noop(): void {}

test('a local wipe flushes, completes the save, replaces, writes the copy, then resets', async () => {
  // #given
  const subject = createSubject();
  // #when
  await subject.flow.wipe('wipe-1');
  // #then
  expect(subject.events).toEqual([
    'flush',
    'store:incomplete:1:gm-a',
    'store:generation:1:gm-a',
    'store:complete:1:gm-a',
    'replace:',
    'clear-pending-edits',
    'publish',
    'room-copy:write-import:1:gm-a',
    'reset:1:gm-a',
    'store:remove-below:1:gm-a',
    'store:remove-older-formats',
    'clear-deleted-links',
    'reply:wiped:wipe-1',
  ]);
});

test('a higher generation during room-copy import rejects replacement without reset', async () => {
  // #given
  const subject = createSubject();
  subject.onWriteImport(() => {
    subject.flow.seeGeneration(HIGHER, false);
  });
  // #when
  await subject.flow.wipe('wipe-1');
  // #then
  expect(subject.events).toEqual([
    'flush',
    'store:incomplete:1:gm-a',
    'store:generation:1:gm-a',
    'store:complete:1:gm-a',
    'replace:',
    'clear-pending-edits',
    'publish',
    'room-copy:write-import:1:gm-a',
    'room-copy:superseded',
    'reject:wipe-1:data-replaced',
    'clear-deleted-links',
  ]);
});

test('a failed synchronous adoption save removes its partial generation and keeps adoption open', () => {
  // #given
  const subject = createSubject();
  subject.failWrite();
  subject.catchUp.generationRead(NEXT);
  subject.flow.stage([RECORD]);
  // #when
  const decisions = subject.catchUp.adoptionStaged();
  // #then
  expect({ events: subject.events, decisions, adopting: subject.catchUp.adopting() }).toEqual({
    events: [
      'store:incomplete:1:gm-a',
      'store:generation:1:gm-a',
      'store:write:1:gm-a:blk:anya',
      'save-failed',
      'store:remove:1:gm-a',
      'publish',
    ],
    decisions: [],
    adopting: NEXT,
  });
});

test('a snapshot import replies only after its room-copy import resolves', async () => {
  // #given
  const subject = createSubject();
  subject.holdImport();
  subject.catchUp.enter('start');
  subject.catchUp.partyRead('catch-up-id', []);
  subject.flow.checkSnapshot({
    t: 'snapshot-check',
    id: 'check-1',
    data: encodeSnapshotFileData(FILE),
  });
  const checkReply = subject.replies.at(-1);

  if (checkReply?.t !== 'snapshot-check-result') {
    throw new Error('snapshot check did not supply an import digest');
  }

  const { digest: expectedDigest } = checkReply;
  subject.events.splice(0);

  // #when
  const importing = subject.flow.importFromSnapshot('import-1', {
    type: 'snapshot-import',
    data: encodeSnapshotFileData(FILE),
    expectedDigest,
  });

  await Promise.resolve();
  const whileHeld = [...subject.events];
  subject.releaseImport();
  await importing;
  // #then
  expect({ whileHeld, final: subject.events }).toEqual({
    whileHeld: [
      'flush',
      'store:incomplete:1:gm-a',
      'store:generation:1:gm-a',
      'store:write:1:gm-a:blk:anya',
      'store:write:1:gm-a:preset',
      'store:complete:1:gm-a',
      'replace:blk:anya,preset',
      'clear-pending-edits',
      'publish',
      'room-copy:write-import:1:gm-a',
    ],
    final: [
      'flush',
      'store:incomplete:1:gm-a',
      'store:generation:1:gm-a',
      'store:write:1:gm-a:blk:anya',
      'store:write:1:gm-a:preset',
      'store:complete:1:gm-a',
      'replace:blk:anya,preset',
      'clear-pending-edits',
      'publish',
      'room-copy:write-import:1:gm-a',
      'reset:1:gm-a',
      'store:remove-below:1:gm-a',
      'store:remove-older-formats',
      'clear-deleted-links',
      'reply:snapshot-imported:import-1',
    ],
  });
});

test('room-copy adoption interprets generationRead before staging can synchronously save', () => {
  // #given
  const subject = createSubject();
  subject.flow.stage([STALE_RECORD]);
  // #when
  const decisions = subject.flow.adoptFromCopy(COPY);
  subject.runCatchUp(decisions.adoptionStaged);
  // #then
  expect(subject.events).toEqual([
    'interpreter:adopt',
    'drop-outbox',
    'drop-pending-work',
    'data-replaced-notice',
    'store:incomplete:1:gm-a',
    'store:generation:1:gm-a',
    'store:write:1:gm-a:blk:anya',
    'store:complete:1:gm-a',
    'store:remove-below:1:gm-a',
    'store:remove-older-formats',
    'replace:blk:anya',
    'room-copy:replaced:true',
    'publish',
  ]);
});

test.each([
  {
    name: 'a duplicate snapshot check',
    overrides: { acceptCommand: () => false },
    prepare: (_subject: Subject) => undefined,
    expected: [],
  },
  {
    name: 'a player snapshot check',
    overrides: { role: () => 'PLAYER' as const },
    prepare: (_subject: Subject) => undefined,
    expected: ['reject:check:not-allowed'],
  },
  {
    name: 'a snapshot check during catch-up',
    overrides: {},
    prepare: (_subject: Subject) => undefined,
    expected: ['reject:check:catching-up'],
  },
  {
    name: 'a snapshot check without writable persistence',
    overrides: { initialPersistence: null },
    prepare: (subject: Subject) => {
      subject.catchUp.enter('start');
      subject.catchUp.partyRead('catch-up-id', []);
    },
    expected: ['reject:check:write-failed'],
  },
] satisfies readonly {
  name: string;
  overrides: Partial<GenerationFlowPortsWithInterpreter>;
  prepare: (subject: Subject) => void;
  expected: string[];
}[])('$name has only its required terminal effect', ({ overrides, prepare, expected }) => {
  // #given
  const subject = createSubject(overrides);
  prepare(subject);
  // #when
  subject.flow.checkSnapshot({ t: 'snapshot-check', id: 'check', data: 'invalid' });
  // #then
  expect(subject.events).toEqual(expected);
});

test('a wipe without writable persistence is rejected without replacing data', async () => {
  // #given
  const subject = createSubject({ initialPersistence: null });
  // #when
  await subject.flow.wipe('wipe');
  // #then
  expect(subject.events).toEqual(['reject:wipe:write-failed']);
});

test('a stopped room-copy adoption leaves the replica unchanged', () => {
  // #given
  const subject = createSubject({ stopped: () => true });
  // #when
  const actual = subject.flow.adoptFromCopy(COPY);
  // #then
  expect({ actual, events: subject.events, generation: subject.flow.generation() }).toEqual({
    actual: { adoptionStaged: [] },
    events: [],
    generation: INITIAL,
  });
});

test('clearing an adopted generation with a retained nonce publishes the replacement state', () => {
  // #given
  const subject = createSubject();
  // #when
  subject.flow.clearStaged(false, true);
  // #then
  expect(subject.events).toEqual(['drop-outbox', 'drop-pending-work', 'publish']);
});

test('a second adoption does not reuse records staged for the first generation', () => {
  // #given
  const subject = createSubject();
  subject.catchUp.generationRead(NEXT);
  subject.flow.stage([STALE_RECORD]);
  expect(subject.flow.saveAdoption(NEXT, false)).toBe(true);
  subject.events.splice(0);
  // #when
  subject.catchUp.generationRead(HIGHER);
  expect(subject.flow.saveAdoption(HIGHER, false)).toBe(true);
  // #then
  expect(subject.events).toEqual([
    'store:incomplete:2:other-gm',
    'store:generation:2:other-gm',
    'store:complete:2:other-gm',
    'store:remove-below:2:other-gm',
    'store:remove-older-formats',
    'replace:',
    'room-copy:replaced:false',
    'publish',
  ]);
});

test('a second snapshot import is rejected while the first writes its room copy', async () => {
  // #given
  const subject = createSubject();
  subject.holdImport();
  subject.catchUp.enter('start');
  subject.catchUp.partyRead('catch-up-id', []);
  subject.flow.checkSnapshot({
    t: 'snapshot-check',
    id: 'check',
    data: encodeSnapshotFileData(FILE),
  });
  const checked = subject.replies.at(-1);

  if (checked?.t !== 'snapshot-check-result') {
    throw new Error('snapshot check did not return a digest');
  }

  const command = {
    type: 'snapshot-import' as const,
    data: encodeSnapshotFileData(FILE),
    expectedDigest: checked.digest,
  };

  const first = subject.flow.importFromSnapshot('first', command);
  await Promise.resolve();
  subject.events.splice(0);
  // #when
  const second = subject.flow.importFromSnapshot('second', command);
  await Promise.resolve();

  // #then
  try {
    expect(subject.events).toEqual(['reject:second:importing']);
  } finally {
    subject.releaseImport();
    await Promise.all([first, second]);
  }
});

test('a wipe and snapshot check are rejected while an import writes its room copy', async () => {
  // #given
  const subject = createSubject();
  subject.holdImport();
  const first = subject.flow.wipe('first');
  await Promise.resolve();
  subject.events.splice(0);
  // #when
  const second = subject.flow.wipe('second');
  await Promise.resolve();
  subject.flow.checkSnapshot({ t: 'snapshot-check', id: 'check', data: 'invalid' });

  // #then
  try {
    expect(subject.events).toEqual(['reject:second:importing', 'reject:check:importing']);
  } finally {
    subject.releaseImport();
    await Promise.all([first, second]);
  }
});

test('an invalid snapshot import is rejected before storage or room effects', async () => {
  // #given
  const subject = createSubject();

  // #when
  const result = subject.flow
    .importFromSnapshot('import', {
      type: 'snapshot-import',
      data: 'invalid',
      expectedDigest: 'none',
    })
    .then(() => subject.events);

  const [settled] = await Promise.allSettled([result]);
  // #then
  expect(settled).toEqual({
    status: 'fulfilled',
    value: ['reject:import:invalid-snapshot'],
  });
});

test('a snapshot import without writable persistence is rejected before parsing', async () => {
  // #given
  const subject = createSubject({ initialPersistence: null });
  // #when
  await subject.flow.importFromSnapshot('import', {
    type: 'snapshot-import',
    data: 'invalid',
    expectedDigest: 'none',
  });
  // #then
  expect(subject.events).toEqual(['reject:import:write-failed']);
});

test.each([
  ['mark-incomplete', ['store:incomplete:1:gm-a']],
  ['mark-generation', ['store:incomplete:1:gm-a', 'store:generation:1:gm-a']],
  [
    'mark-complete',
    ['store:incomplete:1:gm-a', 'store:generation:1:gm-a', 'store:complete:1:gm-a'],
  ],
] as const)(
  'a %s failure keeps the old generation and refuses the wipe',
  async (operation, storageEvents) => {
    // #given
    const subject = createSubject();
    subject.failStore(operation);
    // #when
    await subject.flow.wipe('wipe');
    // #then
    expect(subject.events).toEqual([
      'flush',
      ...storageEvents,
      'save-failed',
      'store:remove:1:gm-a',
      'publish',
      'reject:wipe:write-failed',
    ]);
  },
);
