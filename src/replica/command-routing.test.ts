import { expect, test } from 'bun:test';

import type { Command, RejectionReason } from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';

import {
  decideCommandRoute,
  decidePresetDiffRoute,
  replayPending,
  runPresetBatch,
  type CommandRouteContext,
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
  const records = new Map<string, string>();
  const composeContexts: Array<readonly [string, string]> = [];
  const appliedGroups: string[][] = [];

  // #when
  const actual = replayPending(
    [
      { id: 'first', command: 'first' },
      { id: 'second', command: 'second' },
    ],
    {
      role: (): PlayerRole => 'GM',
      context: () => new Map(records),
      compose: (context, command) => {
        composeContexts.push([...context]);

        return command === 'first' ? ['first-a', 'first-b'] : ['second-after-first-a'];
      },
      apply: (group) => {
        appliedGroups.push([...group]);
        const applied = group[0] === 'first-a' ? group.slice(0, 1) : group;

        for (const record of applied) {
          records.set(record, record);
        }

        return applied;
      },
      reject: () => undefined,
    },
  );

  // #then
  expect({ actual, appliedGroups, composeContexts }).toEqual({
    actual: { applied: ['first-a', 'second-after-first-a'], completed: ['first', 'second'] },
    appliedGroups: [['first-a', 'first-b'], ['second-after-first-a']],
    composeContexts: [[], [['first-a', 'first-a']]],
  });
});
