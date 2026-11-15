import { expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';
import type { Command, RejectionReason } from '@/core/ui-messages';
import type { ComposeContext } from '@/replica/composers';
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
    expected: { kind: 'reject'; reason: RejectionReason } | { kind: 'preset-diff' };
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
  const firstA: VersionedRecord = { k: 'row:first:a', d: {}, c: 1, a: 'gm' };
  const firstB: VersionedRecord = { k: 'row:first:b', d: {}, c: 1, a: 'gm' };

  const secondAfterFirstA: VersionedRecord = {
    k: 'row:second:after-first-a',
    d: {},
    c: 1,
    a: 'gm',
  };

  const first: Command = { type: 'sheet-create', sheetId: 'first', set: 'pc' };
  const second: Command = { type: 'sheet-create', sheetId: 'second', set: 'pc' };
  const records = new Map<string, VersionedRecord>();
  const composeContexts: string[][] = [];
  const appliedGroups: string[][] = [];
  const pending = createPendingQueue();

  const context = (): ComposeContext => ({
    records,
    mint: () => ({ c: 1, a: 'gm' }),
    newRecordId: () => 'unused',
    isGmPlayer: () => true,
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
          return { ok: true, value: [firstA, firstB] };
        }

        return {
          ok: true,
          value: current.records.has(firstA.k) ? [secondAfterFirstA] : [],
        };
      },
      composePatches: () => ({ record: null, refusals: [] }),
      composePresetUpload: () => ({ ok: false, error: { reason: 'invalid-preset' } }),
      presetDiffResult: () => ({ ok: false, error: 'invalid-preset' }),
    },
    records: () => records,
    liveContext: context,
    dryContext: context,
    newRecordId: () => 'unused',
    pending,
    pendingEdits: {
      edit: () => ({ ok: false, error: 'not-allowed' }),
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
    appliedGroups: [['row:first:a', 'row:first:b'], ['row:second:after-first-a']],
    composeContexts: [[], ['row:first:a']],
  });
});
