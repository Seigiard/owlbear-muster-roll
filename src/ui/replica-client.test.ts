import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { JsonValue } from '@/core/json';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type CommandRejectedMessage, type EngineMessage } from '@/core/ui-messages';
import { createMemoryBus, createMockPlatform } from '@/platform/current';
import type { BroadcastPort } from '@/platform/ports';
import { createSendQueue } from '@/platform/send-queue';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';

const TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 60000,
  projectionIncompleteTimeoutMs: 60000,
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 400,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 0,
  gmLinkTimeoutMs: 60000,
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 60000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
  wipeTimeoutMs: 60000,
  accessChangeTimeoutMs: 60000,
  linkSetTimeoutMs: 60000,
  rollTimeoutMs: 60000,
  commandTimeoutMs: 60000,
};

const NONCE = 'nonce-1';

const SYNC = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'GM',
} as const;

const ROOM_COPY = { state: 'none', usedBytes: 0, freeBytes: 15500, outcome: null } as const;

const PROJECTION: Extract<
  EngineMessage,
  {
    t: 'projection';
  }
> = {
  t: 'projection',
  nonce: NONCE,
  engine: 'engine-1',
  seq: 0,
  i: 1,
  n: 1,
  records: [],
  pending: [],
  notices: [],
  sync: SYNC,
  roomCopy: ROOM_COPY,
  party: [],
};

const OPEN: EngineMessage = {
  t: 'open-sheet',
  id: 'open-1',
  sheetId: 'npc',
  path: ['npc_name', 'skeleton-1'],
  cellId: 'portrait',
};

type Harness = {
  client: ReplicaClient;
  engine: Pick<BroadcastPort, 'sendMessage'>;
  store: ProjectionStore;
  sent: JsonValue[];
};

type TestCommandOutcome =
  | {
      kind: 'answered';
      answer: JsonValue | undefined;
    }
  | {
      kind: 'refused';
      rejection: CommandRejectedMessage;
    }
  | {
      kind: 'timed-out';
    };

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }

  mock.restore();
});

describe('replica client open requests', () => {
  test('a window takes no open request before its projection, and takes one after it', async () => {
    // #given
    const harness = startHarness(['unused']);
    // #when
    await emit(harness, OPEN);
    const before = harness.store.$openRequest.get();
    await emit(harness, PROJECTION);
    await emit(harness, OPEN);
    // #then
    expect({ before, after: harness.store.$openRequest.get() }).toEqual({
      before: null,
      after: {
        id: 'open-1',
        sheetId: 'npc',
        path: ['npc_name', 'skeleton-1'],
        cellId: 'portrait',
      },
    });
  });
});

describe('replica client command outcomes', () => {
  test("a window takes the answer to its own wipe, and not another window's", async () => {
    // #given
    const harness = await loadedHarness(['wipe-own']);
    const outcome = Promise.resolve(harness.client.sendCommand({ type: 'wipe' }));
    // #when
    await emit(harness, { t: 'wiped', id: 'wipe-other' });
    const beforeOwn = await Promise.race([outcome, pause(5).then(() => 'pending' as const)]);
    await emit(harness, { t: 'wiped', id: 'wipe-own' });
    // #then
    expect({ beforeOwn, outcome: await outcome }).toEqual({
      beforeOwn: 'pending',
      outcome: { kind: 'answered', answer: undefined },
    });
  });
  test('answered outcomes keep every result field and generic commands answer after command-done', async () => {
    // #given
    const harness = await loadedHarness([
      'generic',
      'preset-diff',
      'snapshot-check',
      'preset-upload',
      'snapshot-import',
      'wipe',
      'roll',
    ]);

    const generic = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    );

    const presetDiff = Promise.resolve(harness.client.requestPresetDiff('Zg=='));
    const snapshotCheck = Promise.resolve(harness.client.requestSnapshotCheck('Zg=='));

    const presetUpload = Promise.resolve(
      harness.client.sendCommand({
        type: 'preset-upload',
        data: 'Zg==',
        expectedCount: 0,
        expectedSheets: 0,
        expectedDigest: '00000000',
      }),
    );

    const snapshotImport = Promise.resolve(
      harness.client.sendCommand({
        type: 'snapshot-import',
        data: 'Zg==',
        expectedDigest: '00000000',
      }),
    );

    const wipe = Promise.resolve(harness.client.sendCommand({ type: 'wipe' }));

    const roll = Promise.resolve(
      harness.client.requestRoll({
        sheetId: 'npc',
        place: { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 0, instanceId: null },
        shown: {},
      }),
    );

    // #when
    await emit(harness, { t: 'command-done', id: 'generic' });
    await emit(harness, {
      t: 'preset-diff-result',
      id: 'preset-diff',
      count: 2,
      sheets: 1,
      digest: '0123abcd',
    });
    await emit(harness, {
      t: 'snapshot-check-result',
      id: 'snapshot-check',
      count: 4,
      sheets: 3,
      digest: '89abcdef',
    });
    await emit(harness, { t: 'preset-uploaded', id: 'preset-upload', count: 6, sheets: 5 });
    await emit(harness, { t: 'snapshot-imported', id: 'snapshot-import' });
    await emit(harness, { t: 'wiped', id: 'wipe' });
    await emit(harness, { t: 'roll-outcome', id: 'roll', outcome: { code: 'rolled' } });
    // #then
    expect(
      await Promise.all([
        generic,
        presetDiff,
        snapshotCheck,
        presetUpload,
        snapshotImport,
        wipe,
        roll,
      ]),
    ).toEqual([
      { kind: 'answered', answer: undefined },
      { kind: 'answered', answer: { count: 2, sheets: 1, digest: '0123abcd' } },
      { kind: 'answered', answer: { count: 4, sheets: 3, digest: '89abcdef' } },
      { kind: 'answered', answer: { count: 6, sheets: 5 } },
      { kind: 'answered', answer: undefined },
      { kind: 'answered', answer: undefined },
      { kind: 'answered', answer: { code: 'rolled' } },
    ]);
  });
  test('a refusal keeps its reason and count-changed fields', async () => {
    // #given
    const harness = await loadedHarness(['own']);

    const outcome = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    );

    const rejection = {
      t: 'command-rejected',
      id: 'own',
      reason: 'count-changed',
      count: 3,
      sheets: 2,
      digest: '0123abcd',
    } as const;

    // #when
    await emit(harness, rejection);
    // #then
    expect(await outcome).toEqual({ kind: 'refused', rejection });
  });
  test('a foreign answer is dropped and a repeated answer cannot replace the first outcome', async () => {
    // #given
    const harness = await loadedHarness(['own']);

    const outcome = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    );

    // #when
    await emit(harness, { t: 'command-done', id: 'foreign' });
    const afterForeign = await Promise.race([outcome, pause(5).then(() => 'pending' as const)]);
    await emit(harness, { t: 'command-rejected', id: 'own', reason: 'unknown-template' });
    await emit(harness, { t: 'command-done', id: 'own' });
    // #then
    expect({ afterForeign, outcome: await outcome }).toEqual({
      afterForeign: 'pending',
      outcome: {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: 'own', reason: 'unknown-template' },
      },
    });
  });
  test('an answer waits behind the projection and earlier deltas', async () => {
    // #given
    const harness = startHarness(['buffered']);

    const observed = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    ).then((outcome) => ({ outcome, record: harness.store.$records.get().get('blk:hero') }));

    await emit(harness, projectionPart(1, 2));
    await emit(harness, {
      t: 'delta',
      engine: 'engine-1',
      seq: 1,
      records: [
        { k: 'blk:hero', d: { set: 'pc', order: 0, cells: {} }, c: 1, a: 'gm', l: [1, 'seed'] },
      ],
      pending: [],
      withdrawn: [],
      notices: [],
      sync: SYNC,
      roomCopy: ROOM_COPY,
      party: [],
    });
    // #when
    await emit(harness, { t: 'command-done', id: 'buffered' });

    const beforeProjection = await Promise.race([
      observed,
      pause(5).then(() => 'pending' as const),
    ]);

    await emit(harness, projectionPart(2, 2));
    // #then
    expect({ beforeProjection, observed: await observed }).toEqual({
      beforeProjection: 'pending',
      observed: {
        outcome: { kind: 'answered', answer: undefined },
        record: {
          k: 'blk:hero',
          d: { set: 'pc', order: 0, cells: {} },
          c: 1,
          a: 'gm',
          l: [1, 'seed'],
        },
      },
    });
  });
  test('an answer buffered before a projection restart settles after the replacement projection', async () => {
    // #given
    const harness = startHarness(['buffered', 'replacement'], {
      projectionIncompleteTimeoutMs: 5,
      commandTimeoutMs: 1000,
    });

    const observed = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    ).then((outcome) => ({ outcome, record: harness.store.$records.get().get('blk:hero') }));

    await emit(harness, projectionPart(1, 2));
    await emit(harness, { t: 'command-done', id: 'buffered' });
    await pause(15);
    // #when
    await emit(harness, {
      ...PROJECTION,
      nonce: 'replacement',
      records: [
        { k: 'blk:hero', d: { set: 'pc', order: 0, cells: {} }, c: 1, a: 'gm', l: [1, 'seed'] },
      ],
    });
    const settled = await Promise.race([observed, pause(20).then(() => 'still-waiting' as const)]);
    // #then
    expect({
      settled,
      recordAfterProjection: harness.store.$records.get().get('blk:hero'),
    }).toEqual({
      settled: {
        outcome: { kind: 'answered', answer: undefined },
        record: {
          k: 'blk:hero',
          d: { set: 'pc', order: 0, cells: {} },
          c: 1,
          a: 'gm',
          l: [1, 'seed'],
        },
      },
      recordAfterProjection: {
        k: 'blk:hero',
        d: { set: 'pc', order: 0, cells: {} },
        c: 1,
        a: 'gm',
        l: [1, 'seed'],
      },
    });
  });
  test('an answer after a replayed sequence gap survives the replacement projection', async () => {
    // #given
    const harness = startHarness(['buffered', 'replacement']);

    const observed = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    ).then((outcome) => ({ outcome, record: harness.store.$records.get().get('blk:hero') }));

    await emit(harness, projectionPart(1, 2));
    await emit(harness, {
      t: 'delta',
      engine: 'engine-1',
      seq: 2,
      records: [
        { k: 'blk:old', d: { set: 'pc', order: 0, cells: {} }, c: 1, a: 'gm', l: [1, 'seed'] },
      ],
      pending: [],
      withdrawn: [],
      notices: [],
      sync: SYNC,
      roomCopy: ROOM_COPY,
      party: [],
    });
    await emit(harness, { t: 'command-done', id: 'buffered' });
    // #when
    await emit(harness, projectionPart(2, 2));

    const beforeReplacement = await Promise.race([
      observed,
      pause(5).then(() => 'pending' as const),
    ]);

    await emit(harness, {
      ...PROJECTION,
      nonce: 'replacement',
      records: [
        { k: 'blk:hero', d: { set: 'pc', order: 1, cells: {} }, c: 1, a: 'gm', l: [1, 'seed'] },
      ],
    });
    // #then
    expect({
      beforeReplacement,
      observed: await Promise.race([observed, pause(20).then(() => 'still-waiting' as const)]),
      oldRecord: harness.store.$records.get().get('blk:old'),
    }).toEqual({
      beforeReplacement: 'pending',
      observed: {
        outcome: { kind: 'answered', answer: undefined },
        record: {
          k: 'blk:hero',
          d: { set: 'pc', order: 1, cells: {} },
          c: 1,
          a: 'gm',
          l: [1, 'seed'],
        },
      },
      oldRecord: undefined,
    });
  });
  test('waiting-access reports progress and only the final roll code settles the outcome', async () => {
    // #given
    const harness = await loadedHarness(['roll']);
    let waiting = 0;

    const outcome = Promise.resolve(
      harness.client.requestRoll(
        {
          sheetId: 'npc',
          place: { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 0, instanceId: null },
          shown: {},
        },
        () => {
          waiting += 1;
        },
      ),
    );

    // #when
    await emit(harness, { t: 'roll-outcome', id: 'roll', outcome: { code: 'waiting-access' } });
    const afterProgress = await Promise.race([outcome, pause(5).then(() => 'pending' as const)]);
    await emit(harness, { t: 'roll-outcome', id: 'roll', outcome: { code: 'rolled' } });
    // #then
    expect({ waiting, afterProgress, outcome: await outcome }).toEqual({
      waiting: 1,
      afterProgress: 'pending',
      outcome: { kind: 'answered', answer: { code: 'rolled' } },
    });
  });
  test('stop settles every waiting outcome as timed out without rejecting', async () => {
    // #given
    const harness = await loadedHarness(['command', 'roll']);

    const command = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    );

    const roll = Promise.resolve(
      harness.client.requestRoll({
        sheetId: 'npc',
        place: { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 0, instanceId: null },
        shown: {},
      }),
    );

    // #when
    harness.client.stop();
    // #then
    expect(await Promise.all([command, roll])).toEqual([
      { kind: 'timed-out' },
      { kind: 'timed-out' },
    ]);
  });
  test('a command over one message is refused without a send or a timer', async () => {
    // #given
    const harness = await loadedHarness(['large']);
    const setTimeoutSpy = spyOn(globalThis, 'setTimeout');
    const beforeTimers = setTimeoutSpy.mock.calls.length;
    const beforeSends = commandsOf(harness).length;

    // #when
    const outcome = await Promise.resolve(
      harness.client.sendCommand({
        type: 'field-patch',
        sheetId: 'hero',
        target: { kind: 'row', rowId: 'name' },
        fieldId: 'name',
        value: 'ы'.repeat(8000),
      }),
    );

    // #then
    expect({
      outcome,
      sends: commandsOf(harness).length - beforeSends,
      timers: setTimeoutSpy.mock.calls.length - beforeTimers,
    }).toEqual({
      outcome: {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: 'large', reason: 'too-large' },
      },
      sends: 0,
      timers: 0,
    });
  });
  test('a late answer after timeout is dropped', async () => {
    // #given
    const harness = await loadedHarness(['late'], { commandTimeoutMs: 5 });

    const outcome = Promise.resolve(
      harness.client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
    );

    // #when
    await pause(15);
    await emit(harness, { t: 'command-done', id: 'late' });
    // #then
    expect(await outcome).toEqual({ kind: 'timed-out' });
  });
});

const TIMEOUT_CASES: readonly {
  name: string;
  field: keyof Timing;
  begin: (client: ReplicaClient) => Promise<TestCommandOutcome>;
}[] = [
  {
    name: 'preset diff',
    field: 'presetRequestTimeoutMs',
    begin: (client) => client.requestPresetDiff('Zg=='),
  },
  {
    name: 'preset upload',
    field: 'presetRequestTimeoutMs',
    begin: (client) =>
      client.sendCommand({
        type: 'preset-upload',
        data: 'Zg==',
        expectedCount: 0,
        expectedSheets: 0,
        expectedDigest: '00000000',
      }),
  },
  {
    name: 'snapshot check',
    field: 'presetRequestTimeoutMs',
    begin: (client) => client.requestSnapshotCheck('Zg=='),
  },
  {
    name: 'snapshot import',
    field: 'snapshotImportTimeoutMs',
    begin: (client) =>
      client.sendCommand({ type: 'snapshot-import', data: 'Zg==', expectedDigest: '00000000' }),
  },
  { name: 'wipe', field: 'wipeTimeoutMs', begin: (client) => client.sendCommand({ type: 'wipe' }) },
  {
    name: 'acl-set',
    field: 'accessChangeTimeoutMs',
    begin: (client) =>
      client.sendCommand({
        type: 'acl-set',
        sheetId: 'hero',
        playerId: 'player',
        name: 'Player',
        on: true,
      }),
  },
  {
    name: 'owner-set',
    field: 'accessChangeTimeoutMs',
    begin: (client) =>
      client.sendCommand({
        type: 'owner-set',
        sheetId: 'hero',
        playerId: 'player',
        name: 'Player',
      }),
  },
  {
    name: 'link-set',
    field: 'linkSetTimeoutMs',
    begin: (client) =>
      client.sendCommand({
        type: 'link-set',
        tokenId: 'token',
        sheetId: 'hero',
        cellId: 'portrait',
      }),
  },
  {
    name: 'roll',
    field: 'rollTimeoutMs',
    begin: (client) =>
      client.requestRoll({
        sheetId: 'npc',
        place: { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 0, instanceId: null },
        shown: {},
      }),
  },
  {
    name: 'another command',
    field: 'commandTimeoutMs',
    begin: (client) => client.sendCommand({ type: 'sheet-create', sheetId: 'hero', set: 'pc' }),
  },
];

describe('replica client timeout selection', () => {
  test.each(TIMEOUT_CASES)('$name reads only $field', async ({ field, begin }) => {
    // #given
    const timing = {
      ...TIMING,
      presetRequestTimeoutMs: 1000,
      snapshotImportTimeoutMs: 1000,
      wipeTimeoutMs: 1000,
      accessChangeTimeoutMs: 1000,
      linkSetTimeoutMs: 1000,
      rollTimeoutMs: 1000,
      commandTimeoutMs: 1000,
      [field]: 5,
    };

    const harness = await loadedHarness(['timed'], timing);

    // #when
    const observed = await Promise.race([
      Promise.resolve(begin(harness.client)),
      pause(40).then(() => 'still-waiting' as const),
    ]);

    // #then
    expect(observed).toEqual({ kind: 'timed-out' });
  });
});

function startHarness(ids: string[], timing: Partial<Timing> = {}): Harness {
  const bus = createMemoryBus();
  const windowPlatform = createMockPlatform(bus);
  const engine = createMockPlatform(bus).broadcast;
  const store = createProjectionStore();
  const sent: JsonValue[] = [];
  const allIds = [NONCE, ...ids];

  const unsubscribe = bus.subscribe(UI_CHANNEL, (event) => {
    sent.push(event.data);
  });

  const client = startReplicaClient(
    windowPlatform.broadcast,
    createSendQueue(windowPlatform.broadcast, { ...TIMING, ...timing }),
    store,
    { ...TIMING, ...timing },
    () => allIds.shift() ?? 'unused',
  );

  cleanups.push(client.stop, unsubscribe);

  return { client, engine, store, sent };
}

async function loadedHarness(ids: string[], timing: Partial<Timing> = {}): Promise<Harness> {
  const harness = startHarness(ids, timing);
  await emit(harness, PROJECTION);

  return harness;
}

async function emit(harness: Harness, message: JsonValue): Promise<void> {
  await harness.engine.sendMessage(UI_CHANNEL, message, { destination: 'LOCAL' });
  await pause(0);
}

function projectionPart(
  i: number,
  n: number,
): Extract<
  EngineMessage,
  {
    t: 'projection';
  }
> {
  return { ...PROJECTION, i, n };
}

function commandsOf(harness: Harness): JsonValue[] {
  return harness.sent.filter((message) => Object(message).t === 'command');
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
