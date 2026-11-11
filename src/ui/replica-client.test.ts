import { afterEach, describe, expect, test } from 'bun:test';

import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type EngineMessage } from '@/core/ui-messages';
import { createMemoryBus, createMockPlatform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { createProjectionStore } from '@/ui/projection-store';
import { startReplicaClient } from '@/ui/replica-client';

const TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  // Far past any test, so the window asks for its projection once.
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
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
};

const NONCE = 'nonce-1';

const PROJECTION: EngineMessage = {
  t: 'projection',
  nonce: NONCE,
  engine: 'engine-1',
  seq: 0,
  i: 1,
  n: 1,
  records: [],
  pending: [],
  notices: [],
  sync: {
    state: 'live',
    firstCatchUpDone: true,
    gmAnswered: true,
    gmLink: 'online',
    role: 'GM',
  },
  roomCopy: { state: 'none', usedBytes: 0, freeBytes: 15500, outcome: null },
  party: [],
};

const OPEN: EngineMessage = {
  t: 'open-sheet',
  id: 'open-1',
  sheetId: 'npc',
  instanceId: 'skeleton-1',
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('replica client open requests', () => {
  test('a window takes no open request before its projection, and takes one after it', () => {
    // #given
    const bus = createMemoryBus();
    const engine = createMockPlatform(bus).broadcast;
    const store = createProjectionStore();

    const client = startReplicaClient(
      createMockPlatform(bus).broadcast,
      createSendQueue(engine, TIMING),
      store,
      TIMING,
      () => NONCE,
    );

    cleanups.push(client.stop);

    // #when
    void engine.sendMessage(UI_CHANNEL, OPEN, { destination: 'LOCAL' });

    const before = store.$openRequest.get();

    void engine.sendMessage(UI_CHANNEL, PROJECTION, { destination: 'LOCAL' });
    void engine.sendMessage(UI_CHANNEL, OPEN, { destination: 'LOCAL' });

    // #then
    expect({ before, after: store.$openRequest.get() }).toEqual({
      before: null,
      after: { id: 'open-1', sheetId: 'npc', instanceId: 'skeleton-1' },
    });
  });
});

describe('replica client wipe answers', () => {
  test("a window takes the answer to its own wipe, and not another window's", () => {
    // #given
    const bus = createMemoryBus();
    const engine = createMockPlatform(bus).broadcast;
    const store = createProjectionStore();
    // The first id names the projection request the window sends on start.
    const ids = [NONCE, 'wipe-own'];

    const client = startReplicaClient(
      createMockPlatform(bus).broadcast,
      createSendQueue(engine, TIMING),
      store,
      TIMING,
      () => ids.shift() ?? NONCE,
    );

    cleanups.push(client.stop);

    const sent = client.sendCommand({ type: 'wipe' });

    // #when
    void engine.sendMessage(UI_CHANNEL, { t: 'wiped', id: 'wipe-other' }, { destination: 'LOCAL' });
    void engine.sendMessage(UI_CHANNEL, { t: 'wiped', id: 'wipe-own' }, { destination: 'LOCAL' });

    // #then
    expect({ sent, results: [...store.$wipeResults.get()] }).toEqual({
      sent: { ok: true, value: 'wipe-own' },
      results: [['wipe-own', { t: 'wiped', id: 'wipe-own' }]],
    });
  });
});
