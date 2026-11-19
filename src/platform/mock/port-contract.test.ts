import { Result } from 'better-result';
import { describe, expect, test } from 'bun:test';

import type { PlayerRole, StorageOperation } from '@/platform/ports';

import {
  broadcastPreservesOneSenderArrivalOrder,
  localBroadcastReachesTheSenderClientOnly,
  metadataMergesRetainedEntriesAndDeletesUndefinedEntries,
  PORT_CONTRACT_SCENARIOS,
  rateLimitedSendResolvesAndDeliversNoEvent,
  remoteBroadcastReachesAnotherClientAndDoesNotEcho,
  storageFailureIsReturnedForOperation,
  storageStoresOverwritesRemovesAndListsOwnedStrings,
  supportedScenario,
  type BroadcastFixture,
  type MetadataFixture,
  type PortContractFactory,
  type RateLimitedBroadcastFixture,
  type StorageFixture,
} from '../../../tests/support/port-contract';
import {
  createMemoryBacking,
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockClient,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from './index';

const OBSERVATION_TIMEOUT_MS = 50;
const QUIET_PERIOD_MS = 5;
const STORAGE_FAILURE_REASON = 'Error: external backing access denied';

const mockPortContractFactory: PortContractFactory = {
  storageLifecycle: supportedScenario(createStorageFixture, 'real-adapter'),
  storageExternalFailure: supportedScenario(createThrowingStorage, 'local-injection'),
  broadcast: supportedScenario(createBroadcastFixture, 'real-adapter'),
  broadcastRateLimit: supportedScenario(createRateLimitedBroadcastFixture, 'local-injection'),
  metadata: supportedScenario(createMetadataFixture, 'real-adapter'),
};

describe('mock storage port contract', () => {
  test(PORT_CONTRACT_SCENARIOS.storageLifecycle, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await storageStoresOverwritesRemovesAndListsOwnedStrings(factory);

    // #then
    expect(observation).toEqual({
      missing: Result.ok(null),
      firstWrite: Result.ok(undefined),
      overwrite: Result.ok(undefined),
      secondWrite: Result.ok(undefined),
      overwritten: Result.ok('overwritten value'),
      keysBeforeRemove: Result.ok(['first', 'second']),
      remove: Result.ok(undefined),
      removed: Result.ok(null),
      keysAfterRemove: Result.ok(['second']),
    });
  });

  test(PORT_CONTRACT_SCENARIOS.storageReadFailure, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await storageFailureIsReturnedForOperation(factory, 'read');

    // #then
    expect(observation).toEqual({
      status: 'returned',
      result: Result.err({ operation: 'read', reason: STORAGE_FAILURE_REASON }),
    });
  });

  test(PORT_CONTRACT_SCENARIOS.storageWriteFailure, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await storageFailureIsReturnedForOperation(factory, 'write');

    // #then
    expect(observation).toEqual({
      status: 'returned',
      result: Result.err({ operation: 'write', reason: STORAGE_FAILURE_REASON }),
    });
  });

  test(PORT_CONTRACT_SCENARIOS.storageRemoveFailure, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await storageFailureIsReturnedForOperation(factory, 'remove');

    // #then
    expect(observation).toEqual({
      status: 'returned',
      result: Result.err({ operation: 'remove', reason: STORAGE_FAILURE_REASON }),
    });
  });

  test(PORT_CONTRACT_SCENARIOS.storageListFailure, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await storageFailureIsReturnedForOperation(factory, 'list');

    // #then
    expect(observation).toEqual({
      status: 'returned',
      result: Result.err({ operation: 'list', reason: STORAGE_FAILURE_REASON }),
    });
  });
});

describe('mock broadcast port contract', () => {
  test(PORT_CONTRACT_SCENARIOS.broadcastLocal, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await localBroadcastReachesTheSenderClientOnly(factory);

    // #then
    expect(observation).toEqual({
      delivery: { status: 'observed' },
      send: { status: 'resolved', result: Result.ok(undefined) },
      events: [
        {
          recipient: 'local-peer',
          data: 'local contract message',
          connectionId: 'sender',
        },
        { recipient: 'sender', data: 'local contract message', connectionId: 'sender' },
      ],
    });
  });

  test(PORT_CONTRACT_SCENARIOS.broadcastRemote, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await remoteBroadcastReachesAnotherClientAndDoesNotEcho(factory);

    // #then
    expect(observation).toEqual({
      delivery: { status: 'observed' },
      send: { status: 'resolved', result: Result.ok(undefined) },
      events: [
        {
          recipient: 'remote-peer',
          data: 'remote contract message',
          connectionId: 'sender',
        },
      ],
    });
  });

  test(PORT_CONTRACT_SCENARIOS.broadcastOrder, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await broadcastPreservesOneSenderArrivalOrder(factory);

    // #then
    expect(observation).toEqual({
      delivery: { status: 'observed' },
      sends: [
        { status: 'resolved', result: Result.ok(undefined) },
        { status: 'resolved', result: Result.ok(undefined) },
        { status: 'resolved', result: Result.ok(undefined) },
      ],
      received: ['first', 'second', 'third'],
    });
  });

  test(PORT_CONTRACT_SCENARIOS.broadcastRateLimit, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await rateLimitedSendResolvesAndDeliversNoEvent(factory);

    // #then
    expect(observation).toEqual({
      send: {
        status: 'resolved',
        result: Result.err({ kind: 'rate-limited' }),
      },
      events: [],
    });
  });
});

describe('mock metadata port contract', () => {
  test(PORT_CONTRACT_SCENARIOS.metadataMerge, async () => {
    // #given
    const factory = mockPortContractFactory;

    // #when
    const observation = await metadataMergesRetainedEntriesAndDeletesUndefinedEntries(factory);

    // #then
    expect(observation).toEqual({
      delivery: { status: 'observed' },
      read: {
        added: { version: 2 },
        retained: 'retained value',
      },
      observedFinalSnapshot: {
        added: { version: 2 },
        retained: 'retained value',
      },
    });
  });
});

function createStorageFixture(): StorageFixture {
  const platform = createMockPlatform();
  const prefix = 'port-contract:storage:';

  return {
    storage: platform.storage,
    key: (name) => `${prefix}${name}`,
    ownsKey: (key) => key.startsWith(prefix),
    cleanup: () => {
      const keys = platform.storage.keys();

      for (const key of keys.isOk() ? keys.value : []) {
        if (key.startsWith(prefix)) {
          platform.storage.removeItem(key);
        }
      }
    },
  };
}

function createThrowingStorage(operation: StorageOperation) {
  const backing = throwingBacking(operation);

  return createMockPlatform(createMemoryBus(), backing).storage;
}

function throwingBacking(operation: StorageOperation): MockStorageBacking {
  const backing = createMemoryBacking();

  return {
    get: operation === 'read' ? failExternalBacking : backing.get,
    set: operation === 'write' ? failExternalBacking : backing.set,
    remove: operation === 'remove' ? failExternalBacking : backing.remove,
    keys: operation === 'list' ? failExternalBacking : backing.keys,
  };
}

function createBroadcastFixture(): BroadcastFixture {
  const topology = createTopology();

  return {
    sender: topology.backgroundA.broadcast,
    localPeer: topology.windowA.broadcast,
    remotePeer: topology.windowB.broadcast,
    senderConnectionId: 'connection-a',
    observationTimeoutMs: OBSERVATION_TIMEOUT_MS,
    quietPeriodMs: QUIET_PERIOD_MS,
    cleanup: () => undefined,
  };
}

function createRateLimitedBroadcastFixture(): RateLimitedBroadcastFixture {
  const topology = createTopology();

  return {
    sender: topology.backgroundA.broadcast,
    localPeer: topology.windowA.broadcast,
    remotePeer: topology.windowB.broadcast,
    senderConnectionId: 'connection-a',
    observationTimeoutMs: OBSERVATION_TIMEOUT_MS,
    quietPeriodMs: QUIET_PERIOD_MS,
    injectRateLimitedSend: () => {
      topology.backgroundA.failNextSends([{ kind: 'rate-limited' }]);
    },
    cleanup: () => undefined,
  };
}

function createMetadataFixture(): MetadataFixture {
  const topology = createTopology();
  const prefix = 'port-contract:metadata:';

  return {
    writer: topology.backgroundA.metadata,
    reader: topology.windowB.metadata,
    key: (name) => `${prefix}${name}`,
    ownsKey: (key) => key.startsWith(prefix),
    observationTimeoutMs: OBSERVATION_TIMEOUT_MS,
    cleanup: async () => {
      await topology.backgroundA.metadata.setMetadata({
        [`${prefix}retained`]: undefined,
        [`${prefix}removed`]: undefined,
        [`${prefix}added`]: undefined,
      });
    },
  };
}

function createTopology() {
  const room = createMemoryRoom();
  const busA = createMemoryBus();
  const busB = createMemoryBus();

  return {
    backgroundA: createClient(room, busA, 'connection-a'),
    windowA: createClient(room, busA, 'connection-a'),
    windowB: createClient(room, busB, 'connection-b'),
  };
}

function createClient(
  room: MockRoom,
  bus: ReturnType<typeof createMemoryBus>,
  connectionId: string,
  role: PlayerRole = 'GM',
): MockPlatform {
  const client: MockClient = {
    room,
    connectionId,
    playerId: `player-${connectionId}`,
    name: `Name ${connectionId}`,
    role,
  };

  return createMockPlatform(bus, undefined, client);
}

function failExternalBacking(): never {
  throw new Error('external backing access denied');
}
