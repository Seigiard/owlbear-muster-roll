import type { JsonObject, JsonValue } from '@/core/json';
import { Result } from 'better-result';
import type {
  BroadcastEvent,
  BroadcastPort,
  MetadataFailure,
  MetadataPort,
  NotificationFailure,
  PartyMember,
  PartyReadFailure,
  PlayerRole,
  PlayerReadFailure,
  SendResult,
  StorageFailure,
  StorageOperation,
  StoragePort,
  Unsubscribe,
} from '@/platform/ports';

export const PORT_CONTRACT_SCENARIOS = {
  storageLifecycle: 'storage stores, overwrites, removes, and lists owned strings',
  storageReadFailure: 'storage returns a read failure when its backing throws',
  storageWriteFailure: 'storage returns a write failure when its backing throws',
  storageRemoveFailure: 'storage returns a remove failure when its backing throws',
  storageListFailure: 'storage returns a list failure when its backing throws',
  broadcastLocal: 'LOCAL broadcast reaches the sender client only',
  broadcastRemote: 'REMOTE broadcast reaches another client and does not echo',
  broadcastOrder: 'broadcast preserves one sender arrival order',
  broadcastRateLimit: 'a rate-limited send resolves and delivers no event',
  metadataMerge: 'metadata merges retained entries and deletes undefined entries',
  partyReadFailure: 'party read returns its tagged failure',
  playerRoleFailure: 'player role read returns its tagged failure',
  metadataReadFailure: 'metadata read returns its tagged failure',
  notificationFailure: 'notification returns its tagged failure',
} as const;

export type PortContractScenarioName =
  (typeof PORT_CONTRACT_SCENARIOS)[keyof typeof PORT_CONTRACT_SCENARIOS];

export type ScenarioEvidence = 'real-adapter' | 'local-injection' | 'live-host';

export type UnsupportedBoundary = 'live-only' | 'local-injection-only' | 'unavailable';

export type SupportedScenario<Factory> = {
  status: 'supported';
  evidence: ScenarioEvidence;
  create: Factory;
};

export type UnsupportedScenario = {
  status: 'unsupported';
  boundary: UnsupportedBoundary;
  reason: string;
};

export type ScenarioBinding<Factory> = SupportedScenario<Factory> | UnsupportedScenario;

export type StorageFixture = {
  storage: StoragePort;
  key: (name: 'first' | 'second') => string;
  ownsKey: (key: string) => boolean;
  cleanup: () => void | Promise<void>;
};

export type BroadcastFixture = {
  sender: BroadcastPort;
  localPeer: BroadcastPort;
  remotePeer: BroadcastPort;
  senderConnectionId: string;
  observationTimeoutMs: number;
  quietPeriodMs: number;
  cleanup: () => void | Promise<void>;
};

export type RateLimitedBroadcastFixture = BroadcastFixture & {
  injectRateLimitedSend: () => void;
};

export type MetadataFixture = {
  writer: MetadataPort;
  reader: MetadataPort;
  key: (name: 'retained' | 'removed' | 'added') => string;
  ownsKey: (key: string) => boolean;
  observationTimeoutMs: number;
  cleanup: () => void | Promise<void>;
};

export type PortFailureFixture<Value, Failure> = {
  inject: () => void;
  invoke: () => Promise<Result<Value, Failure>>;
  cleanup: () => void | Promise<void>;
};

export type PortContractFactory = {
  storageLifecycle: ScenarioBinding<() => StorageFixture | Promise<StorageFixture>>;
  storageExternalFailure: ScenarioBinding<
    (operation: StorageOperation) => StoragePort | Promise<StoragePort>
  >;
  broadcast: ScenarioBinding<() => BroadcastFixture | Promise<BroadcastFixture>>;
  broadcastRateLimit: ScenarioBinding<
    () => RateLimitedBroadcastFixture | Promise<RateLimitedBroadcastFixture>
  >;
  metadata: ScenarioBinding<() => MetadataFixture | Promise<MetadataFixture>>;
  partyReadFailure: ScenarioBinding<
    () =>
      | PortFailureFixture<PartyMember[], PartyReadFailure>
      | Promise<PortFailureFixture<PartyMember[], PartyReadFailure>>
  >;
  playerRoleFailure: ScenarioBinding<
    () =>
      | PortFailureFixture<PlayerRole, PlayerReadFailure>
      | Promise<PortFailureFixture<PlayerRole, PlayerReadFailure>>
  >;
  metadataReadFailure: ScenarioBinding<
    () =>
      | PortFailureFixture<JsonObject, MetadataFailure>
      | Promise<PortFailureFixture<JsonObject, MetadataFailure>>
  >;
  notificationFailure: ScenarioBinding<
    () =>
      | PortFailureFixture<string, NotificationFailure>
      | Promise<PortFailureFixture<string, NotificationFailure>>
  >;
};

export type ScenarioSupportReport =
  | {
      name: PortContractScenarioName;
      status: 'supported';
      evidence: ScenarioEvidence;
    }
  | {
      name: PortContractScenarioName;
      status: 'unsupported';
      boundary: UnsupportedBoundary;
      reason: string;
    };

export type ObservationWait = { status: 'observed' } | { status: 'missing'; reason: string };

export type StorageLifecycleObservation = {
  missing: ReturnType<StoragePort['getItem']>;
  firstWrite: ReturnType<StoragePort['setItem']>;
  overwrite: ReturnType<StoragePort['setItem']>;
  secondWrite: ReturnType<StoragePort['setItem']>;
  overwritten: ReturnType<StoragePort['getItem']>;
  keysBeforeRemove: Result<string[], StorageFailure>;
  remove: ReturnType<StoragePort['removeItem']>;
  removed: ReturnType<StoragePort['getItem']>;
  keysAfterRemove: Result<string[], StorageFailure>;
};

export type StorageFailureObservation =
  | {
      status: 'returned';
      result: Result<string | null | void | string[], StorageFailure>;
    }
  | { status: 'threw'; error: string };

type SendSettlement =
  | { status: 'resolved'; result: SendResult }
  | { status: 'rejected'; reason: string };

type NormalizedBroadcastEvent = {
  recipient: 'sender' | 'local-peer' | 'remote-peer';
  data: JsonValue;
  connectionId: string;
};

export type BroadcastDeliveryObservation = {
  delivery: ObservationWait;
  send: SendSettlement;
  events: NormalizedBroadcastEvent[];
};

export type BroadcastOrderObservation = {
  delivery: ObservationWait;
  sends: SendSettlement[];
  received: JsonValue[];
};

export type RateLimitedBroadcastObservation = {
  send: SendSettlement;
  events: NormalizedBroadcastEvent[];
};

export type MetadataObservation = {
  delivery: ObservationWait;
  read: JsonObject;
  observedFinalSnapshot: JsonObject | null;
};

export type PortFailureObservation<Value, Failure> =
  | { status: 'returned'; result: Result<Value, Failure> }
  | { status: 'threw'; error: string };

const SCENARIO_CAPABILITIES: readonly {
  name: PortContractScenarioName;
  capability: keyof PortContractFactory;
}[] = [
  {
    name: PORT_CONTRACT_SCENARIOS.storageLifecycle,
    capability: 'storageLifecycle',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.storageReadFailure,
    capability: 'storageExternalFailure',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.storageWriteFailure,
    capability: 'storageExternalFailure',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.storageRemoveFailure,
    capability: 'storageExternalFailure',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.storageListFailure,
    capability: 'storageExternalFailure',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.broadcastLocal,
    capability: 'broadcast',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.broadcastRemote,
    capability: 'broadcast',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.broadcastOrder,
    capability: 'broadcast',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.broadcastRateLimit,
    capability: 'broadcastRateLimit',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.metadataMerge,
    capability: 'metadata',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.partyReadFailure,
    capability: 'partyReadFailure',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.playerRoleFailure,
    capability: 'playerRoleFailure',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.metadataReadFailure,
    capability: 'metadataReadFailure',
  },
  {
    name: PORT_CONTRACT_SCENARIOS.notificationFailure,
    capability: 'notificationFailure',
  },
];

export function supportedScenario<Factory>(
  create: Factory,
  evidence: ScenarioEvidence,
): SupportedScenario<Factory> {
  return { status: 'supported', evidence, create };
}

export function unsupportedScenario(
  boundary: UnsupportedBoundary,
  reason: string,
): UnsupportedScenario {
  return { status: 'unsupported', boundary, reason };
}

export function reportPortContractSupport(factory: PortContractFactory): ScenarioSupportReport[] {
  return SCENARIO_CAPABILITIES.map(({ name, capability }) => {
    const binding = factory[capability];

    return binding.status === 'supported'
      ? { name, status: binding.status, evidence: binding.evidence }
      : {
          name,
          status: binding.status,
          boundary: binding.boundary,
          reason: binding.reason,
        };
  });
}

export async function storageStoresOverwritesRemovesAndListsOwnedStrings(
  factory: PortContractFactory,
): Promise<StorageLifecycleObservation> {
  const create = requireSupported(
    factory.storageLifecycle,
    PORT_CONTRACT_SCENARIOS.storageLifecycle,
  );

  const fixture = await create();
  const first = fixture.key('first');
  const second = fixture.key('second');

  try {
    const missing = fixture.storage.getItem(first);
    const firstWrite = fixture.storage.setItem(first, 'first value');
    const overwrite = fixture.storage.setItem(first, 'overwritten value');
    const secondWrite = fixture.storage.setItem(second, 'second value');
    const overwritten = fixture.storage.getItem(first);

    const keysBeforeRemove = normalizeOwnedKeys(fixture.storage.keys(), fixture, {
      [first]: 'first',
      [second]: 'second',
    });

    const remove = fixture.storage.removeItem(first);
    const removed = fixture.storage.getItem(first);

    const keysAfterRemove = normalizeOwnedKeys(fixture.storage.keys(), fixture, {
      [first]: 'first',
      [second]: 'second',
    });

    return {
      missing,
      firstWrite,
      overwrite,
      secondWrite,
      overwritten,
      keysBeforeRemove,
      remove,
      removed,
      keysAfterRemove,
    };
  } finally {
    await fixture.cleanup();
  }
}

export async function storageFailureIsReturnedForOperation(
  factory: PortContractFactory,
  operation: StorageOperation,
): Promise<StorageFailureObservation> {
  const scenarioName = storageFailureScenarioName(operation);
  const create = requireSupported(factory.storageExternalFailure, scenarioName);
  const storage = await create(operation);

  try {
    return {
      status: 'returned',
      result: invokeStorageOperation(storage, operation),
    };
  } catch (error) {
    return { status: 'threw', error: String(error) };
  }
}

export async function portFailureIsReturned<Value, Failure>(
  binding: ScenarioBinding<
    () => PortFailureFixture<Value, Failure> | Promise<PortFailureFixture<Value, Failure>>
  >,
  scenarioName: PortContractScenarioName,
): Promise<PortFailureObservation<Value, Failure>> {
  const create = requireSupported(binding, scenarioName);
  const fixture = await create();

  try {
    fixture.inject();

    return { status: 'returned', result: await fixture.invoke() };
  } catch (error) {
    return { status: 'threw', error: String(error) };
  } finally {
    await fixture.cleanup();
  }
}

export async function localBroadcastReachesTheSenderClientOnly(
  factory: PortContractFactory,
): Promise<BroadcastDeliveryObservation> {
  return observeBroadcastDelivery(
    factory,
    PORT_CONTRACT_SCENARIOS.broadcastLocal,
    'local contract message',
    'LOCAL',
    2,
  );
}

export async function remoteBroadcastReachesAnotherClientAndDoesNotEcho(
  factory: PortContractFactory,
): Promise<BroadcastDeliveryObservation> {
  return observeBroadcastDelivery(
    factory,
    PORT_CONTRACT_SCENARIOS.broadcastRemote,
    'remote contract message',
    'REMOTE',
    1,
  );
}

export async function broadcastPreservesOneSenderArrivalOrder(
  factory: PortContractFactory,
): Promise<BroadcastOrderObservation> {
  const create = requireSupported(factory.broadcast, PORT_CONTRACT_SCENARIOS.broadcastOrder);
  const fixture = await create();
  const received: JsonValue[] = [];

  const unsubscribe = fixture.remotePeer.onMessage('port-contract:order', (event) => {
    received.push(event.data);
  });

  try {
    const sends: SendSettlement[] = [];

    for (const value of ['first', 'second', 'third']) {
      // The contract sends in sequence, but waits on observed receiver events separately.
      // oxlint-disable-next-line no-await-in-loop
      sends.push(await settleSend(fixture.sender, 'port-contract:order', value, 'REMOTE'));
    }

    const delivery = await waitForObserved(
      () => received.length === 3,
      PORT_CONTRACT_SCENARIOS.broadcastOrder,
      fixture.observationTimeoutMs,
    );

    return { delivery, sends, received };
  } finally {
    unsubscribe();
    await fixture.cleanup();
  }
}

export async function rateLimitedSendResolvesAndDeliversNoEvent(
  factory: PortContractFactory,
): Promise<RateLimitedBroadcastObservation> {
  const create = requireSupported(
    factory.broadcastRateLimit,
    PORT_CONTRACT_SCENARIOS.broadcastRateLimit,
  );

  const fixture = await create();
  const events: NormalizedBroadcastEvent[] = [];
  const unsubscribes = subscribeToAll(fixture, 'port-contract:rate-limit', events);

  try {
    fixture.injectRateLimitedSend();

    const send = await settleSend(
      fixture.sender,
      'port-contract:rate-limit',
      'limited contract message',
      'LOCAL',
    );

    await waitForQuietPeriod(fixture.quietPeriodMs);

    return { send, events: sortedEvents(events) };
  } finally {
    unsubscribeAll(unsubscribes);
    await fixture.cleanup();
  }
}

export async function metadataMergesRetainedEntriesAndDeletesUndefinedEntries(
  factory: PortContractFactory,
): Promise<MetadataObservation> {
  const create = requireSupported(factory.metadata, PORT_CONTRACT_SCENARIOS.metadataMerge);
  const fixture = await create();
  const retained = fixture.key('retained');
  const removed = fixture.key('removed');
  const added = fixture.key('added');
  const observed: JsonObject[] = [];
  let unsubscribe: Unsubscribe | undefined;

  try {
    await fixture.writer.setMetadata({
      [retained]: 'retained value',
      [removed]: 'remove me',
    });

    unsubscribe = fixture.reader.onMetadataChange((metadata) => {
      observed.push(
        normalizeOwnedMetadata(metadata, fixture, {
          [retained]: 'retained',
          [removed]: 'removed',
          [added]: 'added',
        }),
      );
    });

    await fixture.writer.setMetadata({
      [removed]: undefined,
      [added]: { version: 2 },
    });

    const expectedFinalSnapshot: JsonObject = {
      added: { version: 2 },
      retained: 'retained value',
    };

    const delivery = await waitForObserved(
      () => observed.some((metadata) => metadataSnapshotsMatch(metadata, expectedFinalSnapshot)),
      PORT_CONTRACT_SCENARIOS.metadataMerge,
      fixture.observationTimeoutMs,
    );

    const read = normalizeOwnedMetadata(await fixture.reader.getMetadata(), fixture, {
      [retained]: 'retained',
      [removed]: 'removed',
      [added]: 'added',
    });

    const observedFinalSnapshot =
      observed.find((metadata) => metadataSnapshotsMatch(metadata, expectedFinalSnapshot)) ?? null;

    return { delivery, read, observedFinalSnapshot };
  } finally {
    unsubscribe?.();
    await fixture.cleanup();
  }
}

export async function waitForObserved(
  condition: () => boolean,
  label: string,
  timeoutMs: number,
): Promise<ObservationWait> {
  const deadline = Date.now() + timeoutMs;

  while (!condition() && Date.now() < deadline) {
    // The observed adapter event is the completion signal.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1);
    });
  }

  return condition()
    ? { status: 'observed' }
    : { status: 'missing', reason: `No observed event: ${label}` };
}

function requireSupported<Factory>(
  binding: ScenarioBinding<Factory>,
  name: PortContractScenarioName,
): Factory {
  if (binding.status === 'supported') {
    return binding.create;
  }

  throw new Error(
    `Unsupported port contract scenario "${name}" (${binding.boundary}): ${binding.reason}`,
  );
}

function normalizeOwnedKeys(
  result: Result<string[], StorageFailure>,
  fixture: StorageFixture,
  names: Readonly<Record<string, string>>,
): Result<string[], StorageFailure> {
  if (!result.isOk()) {
    return result;
  }

  const keys = result.value.filter(fixture.ownsKey).map((key) => names[key] ?? `unexpected:${key}`);

  // The ES2022 target has no toSorted; keys is a new array owned by this helper.
  // oxlint-disable-next-line unicorn/no-array-sort
  keys.sort();

  return Result.ok(keys);
}

function invokeStorageOperation(
  storage: StoragePort,
  operation: StorageOperation,
): Result<string | null | void | string[], StorageFailure> {
  switch (operation) {
    case 'read':
      return storage.getItem('port-contract:failure');
    case 'write':
      return storage.setItem('port-contract:failure', 'value');
    case 'remove':
      return storage.removeItem('port-contract:failure');
    case 'list':
      return storage.keys();
  }

  throw new Error('Unknown storage operation');
}

function storageFailureScenarioName(operation: StorageOperation): PortContractScenarioName {
  switch (operation) {
    case 'read':
      return PORT_CONTRACT_SCENARIOS.storageReadFailure;
    case 'write':
      return PORT_CONTRACT_SCENARIOS.storageWriteFailure;
    case 'remove':
      return PORT_CONTRACT_SCENARIOS.storageRemoveFailure;
    case 'list':
      return PORT_CONTRACT_SCENARIOS.storageListFailure;
  }

  throw new Error('Unknown storage operation');
}

async function observeBroadcastDelivery(
  factory: PortContractFactory,
  scenarioName: PortContractScenarioName,
  data: JsonValue,
  destination: 'LOCAL' | 'REMOTE',
  expectedEvents: number,
): Promise<BroadcastDeliveryObservation> {
  const create = requireSupported(factory.broadcast, scenarioName);
  const fixture = await create();
  const events: NormalizedBroadcastEvent[] = [];
  const unsubscribes = subscribeToAll(fixture, `port-contract:${destination}`, events);

  try {
    const send = await settleSend(
      fixture.sender,
      `port-contract:${destination}`,
      data,
      destination,
    );

    const delivery = await waitForObserved(
      () => events.length === expectedEvents,
      scenarioName,
      fixture.observationTimeoutMs,
    );

    await waitForQuietPeriod(fixture.quietPeriodMs);

    return { delivery, send, events: sortedEvents(events) };
  } finally {
    unsubscribeAll(unsubscribes);
    await fixture.cleanup();
  }
}

function subscribeToAll(
  fixture: BroadcastFixture,
  channel: string,
  events: NormalizedBroadcastEvent[],
): Unsubscribe[] {
  return [
    subscribeTo(fixture, fixture.sender, 'sender', channel, events),
    subscribeTo(fixture, fixture.localPeer, 'local-peer', channel, events),
    subscribeTo(fixture, fixture.remotePeer, 'remote-peer', channel, events),
  ];
}

function subscribeTo(
  fixture: BroadcastFixture,
  port: BroadcastPort,
  recipient: NormalizedBroadcastEvent['recipient'],
  channel: string,
  events: NormalizedBroadcastEvent[],
): Unsubscribe {
  return port.onMessage(channel, (event) => {
    events.push(normalizeBroadcastEvent(fixture, recipient, event));
  });
}

function normalizeBroadcastEvent(
  fixture: BroadcastFixture,
  recipient: NormalizedBroadcastEvent['recipient'],
  event: BroadcastEvent,
): NormalizedBroadcastEvent {
  return {
    recipient,
    data: event.data,
    connectionId: event.connectionId === fixture.senderConnectionId ? 'sender' : event.connectionId,
  };
}

function sortedEvents(events: NormalizedBroadcastEvent[]): NormalizedBroadcastEvent[] {
  const sorted = [...events];

  // The ES2022 target has no toSorted; sorted is a new array owned by this helper.
  // oxlint-disable-next-line unicorn/no-array-sort
  sorted.sort((left, right) => left.recipient.localeCompare(right.recipient));

  return sorted;
}

async function settleSend(
  port: BroadcastPort,
  channel: string,
  data: JsonValue,
  destination: 'LOCAL' | 'REMOTE',
): Promise<SendSettlement> {
  try {
    return {
      status: 'resolved',
      result: await port.sendMessage(channel, data, { destination }),
    };
  } catch (error) {
    return { status: 'rejected', reason: String(error) };
  }
}

async function waitForQuietPeriod(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function unsubscribeAll(unsubscribes: readonly Unsubscribe[]): void {
  for (const unsubscribe of unsubscribes) {
    unsubscribe();
  }
}

function normalizeOwnedMetadata(
  metadata: JsonObject,
  fixture: MetadataFixture,
  names: Readonly<Record<string, string>>,
): JsonObject {
  const entries = Object.entries(metadata)
    .filter(([key]) => fixture.ownsKey(key))
    .map(([key, value]): [string, JsonValue] => [names[key] ?? `unexpected:${key}`, value]);

  // The ES2022 target has no toSorted; entries is a new array owned by this helper.
  // oxlint-disable-next-line unicorn/no-array-sort
  entries.sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
}

function metadataSnapshotsMatch(left: JsonObject, right: JsonObject): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
