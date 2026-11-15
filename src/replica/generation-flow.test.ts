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
const RECORD: VersionedRecord = { k: 'sheet:anya', d: { set: 'pc', order: 0 }, c: 1, a: 'gm-a' };

const STALE_RECORD: VersionedRecord = {
  k: 'sheet:stale',
  d: { set: 'pc', order: 1 },
  c: 1,
  a: 'old-gm',
};

const COPY: Snapshot = { g: NEXT, records: [RECORD] };

const PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Characters',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [{ kind: 'field', type: 'text', id: 'name' }],
                [{ kind: 'field', type: 'number', id: 'str' }],
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
  v: 3,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'anya',
      set: 'pc',
      order: 0,
      rows: { name: { name: 'Anya' }, str: { str: 12 } },
      repeats: {},
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
  holdImport: () => void;
  releaseImport: () => void;
  onWriteImport: (next: () => void) => void;
  runCatchUp: (decisions: readonly CatchUpDecision[]) => void;
};

function createSubject(): Subject {
  const events: string[] = [];
  const replies: EngineMessage[] = [];
  let writesFail = false;
  let waitForImport: Promise<void> | null = null;
  let releaseImport = noop;
  let writeImportHook: (() => void) | null = null;
  let flow: GenerationFlow;

  const store = createStore(events, () => writesFail);

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

function createStore(events: string[], writesFail: () => boolean): RecordStore {
  return {
    write: (generation, record) => {
      events.push(`store:write:${generationId(generation)}:${record.k}`);

      return writesFail() ? err({ operation: 'write', reason: 'quota' }) : ok(record);
    },
    loadGeneration: () => ok({ records: [], corruptKeys: [] }),
    readHighestGeneration: () => ok(INITIAL),
    markIncomplete: (generation) => {
      events.push(`store:incomplete:${generationId(generation)}`);

      return ok(undefined);
    },
    markComplete: (generation) => {
      events.push(`store:complete:${generationId(generation)}`);

      return ok(undefined);
    },
    markGeneration: (generation) => {
      events.push(`store:generation:${generationId(generation)}`);

      return ok(undefined);
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
      'store:write:1:gm-a:sheet:anya',
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
      'store:write:1:gm-a:preset',
      'store:write:1:gm-a:row:anya:name',
      'store:write:1:gm-a:row:anya:str',
      'store:write:1:gm-a:sheet:anya',
      'store:complete:1:gm-a',
      'replace:preset,row:anya:name,row:anya:str,sheet:anya',
      'clear-pending-edits',
      'publish',
      'room-copy:write-import:1:gm-a',
    ],
    final: [
      'flush',
      'store:incomplete:1:gm-a',
      'store:generation:1:gm-a',
      'store:write:1:gm-a:preset',
      'store:write:1:gm-a:row:anya:name',
      'store:write:1:gm-a:row:anya:str',
      'store:write:1:gm-a:sheet:anya',
      'store:complete:1:gm-a',
      'replace:preset,row:anya:name,row:anya:str,sheet:anya',
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
    'store:write:1:gm-a:sheet:anya',
    'store:complete:1:gm-a',
    'store:remove-below:1:gm-a',
    'store:remove-older-formats',
    'room-copy:replaced:true',
    'publish',
  ]);
});
