import { Result } from 'better-result';
import { expect, test } from 'bun:test';
import type { VersionedRecord } from '@/core/records';
import type { Command, RejectionReason } from '@/core/ui-messages';
import type { ComposeContext, ComposeMode } from '@/core/compose';
import { createPendingQueue } from '@/replica/pending-queue';
import {
  createCommandRouting,
  decideCommandRoute,
  decidePresetDiffRoute,
  runPresetBatch,
  type CommandRouteContext,
  type CommandRoutingPorts,
} from './command-routing';

type RouteCase = {
  name: string;
  context: CommandRouteContext;
  command: Pick<Command, 'type'>;
  expected: ReturnType<typeof decideCommandRoute>;
};

const GM_LIVE: CommandRouteContext = { role: 'GM', importing: false, live: true };

function routingPorts(overrides: Partial<CommandRoutingPorts> = {}): CommandRoutingPorts {
  return {
    role: () => 'GM',
    importing: () => false,
    live: () => true,
    acceptCommand: () => true,
    composers: {
      compose: () => Result.ok([]),
      composePatches: () => ({ record: null, refusals: [] }),
      composePresetUpload: () => Result.err({ reason: 'invalid-preset' }),
      presetDiffResult: () => Result.err('invalid-preset'),
    },
    records: () => new Map(),
    liveContext: () => ({
      records: new Map(),
      mint: () => ({ c: 1, a: 'gm' }),
      newRecordId: () => 'unused',
      isGmPlayer: () => true,
      mode: 'persisted',
    }),
    dryContext: () => ({
      records: new Map(),
      mint: () => ({ c: 1, a: 'gm' }),
      newRecordId: () => 'unused',
      isGmPlayer: () => true,
      mode: 'pending',
    }),
    newRecordId: () => 'unused',
    pending: createPendingQueue(),
    pendingEdits: {
      edit: () => Result.err('not-allowed'),
      overlay: () => undefined,
    },
    apply: () => [],
    reject: () => undefined,
    commandDone: () => undefined,
    notifyDenied: () => undefined,
    publish: () => undefined,
    hasPersistence: () => false,
    flushOutbox: () => undefined,
    addCommits: () => undefined,
    roomCopyEdited: () => undefined,
    importFromSnapshot: async () => undefined,
    wipe: async () => undefined,
    reply: () => undefined,
    ...overrides,
  };
}

const COMMAND_ROUTES: readonly RouteCase[] = [
  {
    name: 'sends a player command to pending edits before GM-only checks',
    context: { role: 'PLAYER', importing: true, live: false },
    command: { type: 'sheet-create' },
    expected: { kind: 'player' },
  },
  {
    name: 'rejects a GM command while importing',
    context: { role: 'GM', importing: true, live: true },
    command: { type: 'sheet-create' },
    expected: { kind: 'reject', reason: 'importing' },
  },
  {
    name: 'queues an ordinary GM command during catch-up',
    context: { role: 'GM', importing: false, live: false },
    command: { type: 'sheet-create' },
    expected: { kind: 'queue' },
  },
  {
    name: 'rejects a preset upload during catch-up',
    context: { role: 'GM', importing: false, live: false },
    command: { type: 'preset-upload' },
    expected: { kind: 'reject', reason: 'catching-up' },
  },
  {
    name: 'rejects a snapshot import during catch-up',
    context: { role: 'GM', importing: false, live: false },
    command: { type: 'snapshot-import' },
    expected: { kind: 'reject', reason: 'catching-up' },
  },
  {
    name: 'rejects a wipe during catch-up',
    context: { role: 'GM', importing: false, live: false },
    command: { type: 'wipe' },
    expected: { kind: 'reject', reason: 'catching-up' },
  },
  {
    name: 'composes an ordinary live GM command',
    context: GM_LIVE,
    command: { type: 'sheet-create' },
    expected: { kind: 'compose' },
  },
  {
    name: 'composes a scene-submitted link clear for a live GM',
    context: GM_LIVE,
    command: { type: 'link-clear' },
    expected: { kind: 'compose' },
  },
  {
    name: 'starts a confirmed preset upload for a live GM',
    context: GM_LIVE,
    command: { type: 'preset-upload' },
    expected: { kind: 'preset-upload' },
  },
  {
    name: 'starts a snapshot import for a live GM',
    context: GM_LIVE,
    command: { type: 'snapshot-import' },
    expected: { kind: 'snapshot-import' },
  },
  {
    name: 'starts a wipe for a live GM',
    context: GM_LIVE,
    command: { type: 'wipe' },
    expected: { kind: 'wipe' },
  },
];

for (const route of COMMAND_ROUTES) {
  test(`command route ${route.name}`, () => {
    // #given
    const { context, command, expected } = route;
    // #when
    const actual = decideCommandRoute(context, command);
    // #then
    expect(actual).toEqual(expected);
  });
}

test('a preset diff is GM-only and needs a live GM, but is not blocked by an import', () => {
  // #given
  const contexts: readonly {
    context: CommandRouteContext;
    expected:
      | {
          kind: 'reject';
          reason: RejectionReason;
        }
      | {
          kind: 'preset-diff';
        };
  }[] = [
    {
      context: { role: 'PLAYER', importing: false, live: true },
      expected: { kind: 'reject', reason: 'not-allowed' },
    },
    {
      context: { role: 'GM', importing: false, live: false },
      expected: { kind: 'reject', reason: 'catching-up' },
    },
    {
      context: { role: 'GM', importing: true, live: true },
      expected: { kind: 'preset-diff' },
    },
  ];

  // #when
  const actual = contexts.map(({ context }) => decidePresetDiffRoute(context));
  // #then
  expect(actual).toEqual(contexts.map(({ expected }) => expected));
});

test('a preset batch stops before its later group when an earlier group applies only partly', () => {
  // #given
  const appliedGroups: string[][] = [];
  const groups = [['new-row', 'new-repeat'], ['preset'], ['old-row']];

  // #when
  const actual = runPresetBatch(groups, (group) => {
    appliedGroups.push([...group]);

    return group.slice(0, 1);
  });

  // #then
  expect({ actual, appliedGroups }).toEqual({
    actual: { applied: ['new-row'], complete: false },
    appliedGroups: [['new-row', 'new-repeat']],
  });
});

test('a complete preset batch applies every group in order', () => {
  // #given
  const groups = [['new-row'], ['preset'], ['old-row']];
  // #when
  const actual = runPresetBatch(groups, (group) => group);
  // #then
  expect(actual).toEqual({ applied: ['new-row', 'preset', 'old-row'], complete: true });
});

test('pending replay continues after a partial entry and composes the next entry from updated records', () => {
  // #given
  const firstA: VersionedRecord = {
    k: 'blk:first',
    d: { order: 0, cells: {} },
    c: 1,
    a: 'gm',
    l: [1, 'seed'],
  };

  const firstB: VersionedRecord = {
    k: 'blk:first',
    d: { order: 0, cells: {} },
    c: 1,
    a: 'gm',
    l: [1, 'seed'],
  };

  const secondAfterFirstA: VersionedRecord = {
    k: 'blk:second',
    d: { order: 0, cells: {} },
    c: 1,
    a: 'gm',
    l: [1, 'seed'],
  };

  const first: Command = { type: 'sheet-create', sheetId: 'first', set: 'pc' };
  const second: Command = { type: 'sheet-create', sheetId: 'second', set: 'pc' };
  const records = new Map<string, VersionedRecord>();
  const composeContexts: string[][] = [];
  const appliedGroups: string[][] = [];
  const pending = createPendingQueue();

  const context = (mode: ComposeMode): ComposeContext => ({
    records,
    mint: () => ({ c: 1, a: 'gm' }),
    newRecordId: () => 'unused',
    isGmPlayer: () => true,
    mode,
  });

  pending.add('first', first);
  pending.add('second', second);

  const routing = createCommandRouting({
    role: () => 'GM',
    importing: () => false,
    live: () => true,
    acceptCommand: () => true,
    composers: {
      compose: (current, command) => {
        composeContexts.push([...current.records.keys()]);

        if (command.type === 'sheet-create' && command.sheetId === 'first') {
          return Result.ok([firstA, firstB]);
        }

        return Result.ok(current.records.has(firstA.k) ? [secondAfterFirstA] : []);
      },
      composePatches: () => ({ record: null, refusals: [] }),
      composePresetUpload: () => Result.err({ reason: 'invalid-preset' }),
      presetDiffResult: () => Result.err('invalid-preset'),
    },
    records: () => records,
    liveContext: () => context('persisted'),
    dryContext: () => context('pending'),
    newRecordId: () => 'unused',
    pending,
    pendingEdits: {
      edit: () => Result.err('not-allowed'),
      overlay: () => undefined,
    },
    apply: (group) => {
      appliedGroups.push(group.map((record) => record.k));
      const applied = group[0]?.k === firstA.k ? group.slice(0, 1) : [...group];

      for (const record of applied) {
        records.set(record.k, record);
      }

      return applied;
    },
    reject: () => undefined,
    commandDone: () => undefined,
    notifyDenied: () => undefined,
    publish: () => undefined,
    hasPersistence: () => false,
    flushOutbox: () => undefined,
    addCommits: () => undefined,
    roomCopyEdited: () => undefined,
    importFromSnapshot: async () => undefined,
    wipe: async () => undefined,
    reply: () => undefined,
  } satisfies CommandRoutingPorts);

  // #when
  const actual = routing.replayPending();
  // #then
  expect({ actual, appliedGroups, composeContexts }).toEqual({
    actual: { applied: [firstA, secondAfterFirstA], completed: ['first', 'second'] },
    appliedGroups: [['blk:first', 'blk:first'], ['blk:second']],
    composeContexts: [[], ['blk:first']],
  });
});

test('a repeated window command id runs its command once', () => {
  // #given
  const events: string[] = [];
  let accepted = 0;

  const routing = createCommandRouting(
    routingPorts({
      acceptCommand: () => {
        accepted += 1;

        return accepted === 1;
      },
      composers: {
        compose: () => {
          events.push('compose');

          return Result.ok([]);
        },
        composePatches: () => ({ record: null, refusals: [] }),
        composePresetUpload: () => Result.err({ reason: 'invalid-preset' }),
        presetDiffResult: () => Result.err('invalid-preset'),
      },
      commandDone: () => {
        events.push('done');
      },
      publish: () => {
        events.push('publish');
      },
    }),
  );

  // #when
  routing.handleCommand({
    t: 'command',
    id: 'repeat',
    command: { type: 'sheet-create', sheetId: 'a', set: 'pc' },
  });
  routing.handleCommand({
    t: 'command',
    id: 'repeat',
    command: { type: 'sheet-create', sheetId: 'a', set: 'pc' },
  });
  // #then
  expect(events).toEqual(['compose', 'publish', 'done']);
});

test('a queued intent that becomes invalid is rejected on catch-up exit', () => {
  // #given
  const rejections: string[] = [];
  const applyInputs: unknown[] = [];
  const pending = createPendingQueue();
  pending.add('queued', { type: 'sheet-create', sheetId: 'a', set: 'pc' });

  const routing = createCommandRouting(
    routingPorts({
      composers: {
        compose: () => Result.err('deleted-sheet'),
        composePatches: () => ({ record: null, refusals: [] }),
        composePresetUpload: () => Result.err({ reason: 'invalid-preset' }),
        presetDiffResult: () => Result.err('invalid-preset'),
      },
      pending,
      apply: (records) => {
        applyInputs.push(records);

        return [];
      },
      reject: (id, reason) => {
        rejections.push(`${id}:${reason}`);
      },
    }),
  );

  // #when
  const actual = routing.replayPending();
  // #then
  expect({ actual, rejections, applyInputs }).toEqual({
    actual: { applied: [], completed: [] },
    rejections: ['queued:deleted-sheet'],
    applyInputs: [],
  });
});

test('a repeated preset diff id produces one terminal result', () => {
  // #given
  let accepted = 0;
  const replies: string[] = [];

  const routing = createCommandRouting(
    routingPorts({
      acceptCommand: () => {
        accepted += 1;

        return accepted === 1;
      },
      composers: {
        ...routingPorts().composers,
        presetDiffResult: () => Result.ok({ count: 0, sheets: 0, digest: 'none' }),
      },
      reply: (message) => replies.push(`${message.t}:${'id' in message ? message.id : ''}`),
    }),
  );

  // #when
  routing.handlePresetDiff({ t: 'preset-diff', id: 'same', data: '{}' });
  routing.handlePresetDiff({ t: 'preset-diff', id: 'same', data: '{}' });
  // #then
  expect(replies).toEqual(['preset-diff-result:same']);
});

test('a denied player edit shows its notice once', () => {
  // #given
  const effects: string[] = [];

  const routing = createCommandRouting(
    routingPorts({
      role: () => 'PLAYER',
      pendingEdits: {
        edit: () => Result.ok({ notify: true }),
        overlay: () => undefined,
      },
      notifyDenied: () => effects.push('denied'),
      publish: () => effects.push('publish'),
      commandDone: () => effects.push('done'),
    }),
  );

  // #when
  routing.runCommand('edit', {
    type: 'field-patch',
    sheetId: 'a',
    target: { kind: 'row', rowId: 'name' },
    fieldId: 'name',
    value: 'Ada',
  });
  // #then
  expect(effects).toEqual(['denied', 'publish', 'done']);
});

test('a player edit denied for size passes its cause to the notice', () => {
  // #given
  const causes: (string | undefined)[] = [];

  const routing = createCommandRouting(
    routingPorts({
      role: () => 'PLAYER',
      pendingEdits: {
        edit: () => Result.ok({ notify: true, cause: 'too-large' }),
        overlay: () => undefined,
      },
      notifyDenied: (cause?: string) => causes.push(cause),
    }),
  );

  // #when
  routing.runCommand('edit', {
    type: 'field-patch',
    sheetId: 'a',
    target: { kind: 'row', rowId: 'name' },
    fieldId: 'name',
    value: 'Ada',
  });
  // #then
  expect(causes).toEqual(['too-large']);
});

test('a fully refused queued patch batch is never applied', () => {
  // #given
  const pending = createPendingQueue();
  pending.add('patch', {
    type: 'field-patch',
    sheetId: 'a',
    target: { kind: 'row', rowId: 'name' },
    fieldId: 'name',
    value: 'Ada',
  });
  const effects: string[] = [];

  const routing = createCommandRouting(
    routingPorts({
      pending,
      composers: {
        ...routingPorts().composers,
        composePatches: () => ({
          record: null,
          refusals: [{ id: 'patch', reason: 'not-allowed' }],
        }),
      },
      apply: () => {
        effects.push('apply');

        return [];
      },
      reject: (id, reason) => effects.push(`reject:${id}:${reason}`),
    }),
  );

  // #when
  const replayed = routing.replayPending();
  // #then
  expect({ effects, replayed }).toEqual({
    effects: ['reject:patch:not-allowed'],
    replayed: { applied: [], completed: [] },
  });
});
