import type { JsonObject, JsonValue } from '@/core/json';
import { z } from 'zod';
import { Result } from 'better-result';
import { MetadataFailure } from '@/platform/ports';
import type {
  BroadcastEvent,
  BroadcastPort,
  MetadataPort,
  Platform,
  StoragePort,
} from '@/platform/ports';
import { platform } from '@/platform/current';

import {
  reportPortContractSupport,
  supportedScenario,
  unsupportedScenario,
  type BroadcastFixture,
  type MetadataFixture,
  type PortContractFactory,
  type ScenarioSupportReport,
  type StorageFixture,
} from '../support/port-contract';

type PeerRecord = { roomId: string; connectionId: string };

type EventListener = (event: BroadcastEvent) => void;

type PendingRead = {
  resolve: (metadata: JsonObject) => void;
  reject: (error: Error) => void;
};

const CONTROL_RPC_TIMEOUT_MS = 5_000;

const controlMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('coordinator-ready'), runId: z.string(), roomId: z.string() }),
  z.object({
    kind: z.literal('local-peer-ready'),
    runId: z.string(),
    roomId: z.string(),
    connectionId: z.string(),
  }),
  z.object({
    kind: z.literal('local-peer-event'),
    runId: z.string(),
    channel: z.string(),
    data: z.json(),
    connectionId: z.string(),
  }),
  z.object({
    kind: z.literal('peer-ready'),
    runId: z.string(),
    roomId: z.string(),
    connectionId: z.string(),
  }),
  z.object({
    kind: z.literal('peer-event'),
    runId: z.string(),
    channel: z.string(),
    data: z.json(),
    connectionId: z.string(),
  }),
  z.object({
    kind: z.literal('metadata-event'),
    runId: z.string(),
    metadata: z.record(z.string(), z.json()),
  }),
  z.object({ kind: z.literal('metadata-read'), runId: z.string(), requestId: z.string() }),
  z.object({
    kind: z.literal('metadata-read-result'),
    runId: z.string(),
    requestId: z.string(),
    metadata: z.record(z.string(), z.json()),
  }),
  z.object({
    kind: z.literal('rpc-error'),
    runId: z.string(),
    requestId: z.string(),
    reason: z.string(),
  }),
  z.object({ kind: z.literal('cleanup'), runId: z.string() }),
]);

type ControlMessage = z.infer<typeof controlMessageSchema>;

const BROADCAST_SCENARIO_CHANNELS = ['LOCAL', 'REMOTE', 'order', 'rate-limit'] as const;

const STORAGE_FAILURE_REASON =
  'Storage failures need a real host outcome; injection is local-only.';

const RATE_LIMIT_REASON =
  'A real Owlbear rate-limit outcome and recovery require an owner-run live room.';

export type LiveCoordinator = {
  factory: PortContractFactory;
  waitForPeer: (timeoutMs?: number) => Promise<void>;
  cleanup: () => Promise<void>;
  close: () => void;
  peer: () => PeerRecord | null;
};

export type LivePeer = {
  close: () => void;
};

export async function createLiveCoordinator(runId: string): Promise<LiveCoordinator> {
  const roomId = platform.metadata.getRoomId();
  const senderConnectionId = await platform.player.getConnectionId();
  const namespace = `port-contract-live:${runId}:`;
  const controlChannel = `${namespace}control`;
  const localPeerListeners = new Map<string, Set<EventListener>>();
  const remotePeerListeners = new Map<string, Set<EventListener>>();
  const metadataListeners = new Set<(metadata: JsonObject) => void>();
  const pendingReads = new Map<string, PendingRead>();
  let peerRecord: PeerRecord | null = null;
  let peerWaiter: (() => void) | null = null;
  let localPeerReady = false;
  let localPeerWaiter: (() => void) | null = null;
  let requestNumber = 0;
  const localPeerPopoverId = `${namespace}local-peer`;

  const unsubscribeControl = platform.broadcast.onMessage(controlChannel, (event) => {
    const message = parseControlMessage(event.data, runId);

    if (message === null) {
      return;
    }

    if (message.kind === 'local-peer-ready') {
      if (message.roomId === roomId) {
        localPeerReady = true;
        localPeerWaiter?.();
      }

      return;
    }

    if (message.kind === 'local-peer-event') {
      for (const listener of localPeerListeners.get(message.channel) ?? []) {
        listener({ data: message.data, connectionId: message.connectionId });
      }

      return;
    }

    if (message.kind === 'peer-ready') {
      if (message.roomId === roomId && message.connectionId !== senderConnectionId) {
        peerRecord = { roomId: message.roomId, connectionId: message.connectionId };
        peerWaiter?.();
      }

      return;
    }

    if (message.kind === 'peer-event') {
      for (const listener of remotePeerListeners.get(message.channel) ?? []) {
        listener({ data: message.data, connectionId: message.connectionId });
      }

      return;
    }

    if (message.kind === 'metadata-event') {
      for (const listener of metadataListeners) {
        listener(message.metadata);
      }

      return;
    }

    if (message.kind === 'metadata-read-result') {
      pendingReads.get(message.requestId)?.resolve(message.metadata);
      pendingReads.delete(message.requestId);

      return;
    }

    if (message.kind === 'rpc-error') {
      const error = new Error(message.reason);
      pendingReads.get(message.requestId)?.reject(error);
      pendingReads.delete(message.requestId);
    }
  });

  await sendControl(controlChannel, { kind: 'coordinator-ready', runId, roomId });

  return {
    factory: {
      storageLifecycle: supportedScenario(
        () => createStorageFixture(platform.storage, namespace),
        'real-adapter',
      ),
      storageExternalFailure: unsupportedScenario('local-injection-only', STORAGE_FAILURE_REASON),
      broadcast: supportedScenario(
        () =>
          createBroadcastFixture(
            platform,
            localPeerListeners,
            remotePeerListeners,
            namespace,
            senderConnectionId,
            ensureLocalPeer,
          ),
        'live-host',
      ),
      broadcastRateLimit: unsupportedScenario('live-only', RATE_LIMIT_REASON),
      metadata: supportedScenario(
        () =>
          createMetadataFixture(
            platform,
            metadataListeners,
            pendingReads,
            () => `${runId}:request:${(requestNumber += 1)}`,
            controlChannel,
            namespace,
          ),
        'live-host',
      ),
      partyReadFailure: unsupportedScenario(
        'local-injection-only',
        'The live harness cannot inject a party read failure.',
      ),
      playerRoleFailure: unsupportedScenario(
        'local-injection-only',
        'The live harness cannot inject a player role read failure.',
      ),
      metadataReadFailure: unsupportedScenario(
        'local-injection-only',
        'The live harness cannot inject a metadata read failure.',
      ),
      notificationFailure: unsupportedScenario(
        'local-injection-only',
        'The live harness cannot inject a notification failure.',
      ),
    },
    waitForPeer: (timeoutMs = 30_000) => {
      if (peerRecord !== null) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          peerWaiter = null;
          reject(
            new Error(
              'No peer joined this run id and room. Open the harness in a second Owlbear client.',
            ),
          );
        }, timeoutMs);

        peerWaiter = () => {
          clearTimeout(timeoutId);
          peerWaiter = null;
          resolve();
        };
      });
    },
    cleanup: async () => {
      cleanupStorageNamespace(platform.storage, namespace);
      await platform.metadata.setMetadata({
        [`${namespace}metadata:retained`]: undefined,
        [`${namespace}metadata:removed`]: undefined,
        [`${namespace}metadata:added`]: undefined,
      });
      await sendControl(controlChannel, { kind: 'cleanup', runId });
    },
    close: () => {
      unsubscribeControl();
      void platform.popover.close(localPeerPopoverId).catch(reportControlFailure);
    },
    peer: () => peerRecord,
  };

  async function ensureLocalPeer(): Promise<void> {
    if (localPeerReady) {
      return;
    }

    const ready = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        localPeerWaiter = null;
        reject(new Error('No second extension context joined the local broadcast bridge.'));
      }, CONTROL_RPC_TIMEOUT_MS);

      localPeerWaiter = () => {
        clearTimeout(timeoutId);
        localPeerWaiter = null;
        resolve();
      };
    });

    try {
      await platform.popover.open({
        id: localPeerPopoverId,
        url: `/port-contract-live.html?${new URLSearchParams({
          run: runId,
          role: 'local-peer',
        }).toString()}`,
        width: 1,
        height: 1,
      });
      await ready;
    } catch (error) {
      localPeerWaiter = null;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}

export async function startLivePeer(runId: string): Promise<LivePeer> {
  const roomId = platform.metadata.getRoomId();
  const connectionId = await platform.player.getConnectionId();
  const namespace = `port-contract-live:${runId}:`;
  const controlChannel = `${namespace}control`;

  const broadcastUnsubscribes = BROADCAST_SCENARIO_CHANNELS.map((suffix) =>
    platform.broadcast.onMessage(`${namespace}broadcast:port-contract:${suffix}`, (event) => {
      sendControl(controlChannel, {
        kind: 'peer-event',
        runId,
        channel: `${namespace}broadcast:port-contract:${suffix}`,
        data: event.data,
        connectionId: event.connectionId,
      }).catch(reportControlFailure);
    }),
  );

  const unsubscribeMetadata = platform.metadata.onMetadataChange((metadata) => {
    sendControl(controlChannel, { kind: 'metadata-event', runId, metadata }).catch(
      reportControlFailure,
    );
  });

  const unsubscribeControl = platform.broadcast.onMessage(controlChannel, (event) => {
    const message = parseControlMessage(event.data, runId);

    if (message === null) {
      return;
    }

    if (message.kind === 'coordinator-ready' && message.roomId === roomId) {
      sendPeerReady(controlChannel, runId, roomId, connectionId).catch(reportControlFailure);

      return;
    }

    if (message.kind === 'metadata-read') {
      platform.metadata
        .getMetadata()
        .then((result) => {
          if (!result.isOk()) {
            throw result.error;
          }

          return sendControl(controlChannel, {
            kind: 'metadata-read-result',
            runId,
            requestId: message.requestId,
            metadata: result.value,
          });
        })
        .catch((error) =>
          sendControl(controlChannel, {
            kind: 'rpc-error',
            runId,
            requestId: message.requestId,
            reason: String(error),
          }).catch(reportControlFailure),
        );

      return;
    }

    if (message.kind === 'cleanup') {
      cleanupStorageNamespace(platform.storage, namespace);
    }
  });

  await sendPeerReady(controlChannel, runId, roomId, connectionId);

  return {
    close: () => {
      unsubscribeControl();
      unsubscribeMetadata();

      for (const unsubscribe of broadcastUnsubscribes) {
        unsubscribe();
      }
    },
  };
}

export async function startLiveLocalPeer(runId: string): Promise<LivePeer> {
  const roomId = platform.metadata.getRoomId();
  const connectionId = await platform.player.getConnectionId();
  const namespace = `port-contract-live:${runId}:`;
  const controlChannel = `${namespace}control`;

  const broadcastUnsubscribes = BROADCAST_SCENARIO_CHANNELS.map((suffix) =>
    platform.broadcast.onMessage(`${namespace}broadcast:port-contract:${suffix}`, (event) => {
      sendControl(
        controlChannel,
        {
          kind: 'local-peer-event',
          runId,
          channel: `${namespace}broadcast:port-contract:${suffix}`,
          data: event.data,
          connectionId: event.connectionId,
        },
        'LOCAL',
      ).catch(reportControlFailure);
    }),
  );

  await sendControl(
    controlChannel,
    {
      kind: 'local-peer-ready',
      runId,
      roomId,
      connectionId,
    },
    'LOCAL',
  );

  return {
    close: () => {
      for (const unsubscribe of broadcastUnsubscribes) {
        unsubscribe();
      }
    },
  };
}

export function livePortContractSupport(factory: PortContractFactory): ScenarioSupportReport[] {
  return reportPortContractSupport(factory);
}

export function cleanupStorageNamespace(storage: StoragePort, namespace: string): void {
  const keys = storage.keys();

  if (!keys.isOk()) {
    throw new Error(keys.error.reason);
  }

  for (const key of keys.value) {
    if (!key.startsWith(namespace)) {
      continue;
    }

    const removed = storage.removeItem(key);

    if (!removed.isOk()) {
      throw new Error(removed.error.reason);
    }
  }
}

function createMetadataFixture(
  livePlatform: Platform,
  metadataListeners: Set<(metadata: JsonObject) => void>,
  pendingReads: Map<string, PendingRead>,
  requestId: () => string,
  controlChannel: string,
  namespace: string,
): MetadataFixture {
  const reader: MetadataPort = {
    getRoomId: () => livePlatform.metadata.getRoomId(),
    getMetadata: () =>
      Result.tryPromise({
        try: () => requestPeerMetadata(pendingReads, requestId(), controlChannel, namespace),
        catch: (error) => new MetadataFailure({ operation: 'read', reason: String(error) }),
      }),
    setMetadata: async () => {
      throw new Error('Live harness reader metadata writes are unsupported.');
    },
    onMetadataChange: (callback) => {
      metadataListeners.add(callback);

      return () => {
        metadataListeners.delete(callback);
      };
    },
  };

  return {
    writer: livePlatform.metadata,
    reader,
    key: (name) => `${namespace}metadata:${name}`,
    ownsKey: (key) => key.startsWith(`${namespace}metadata:`),
    observationTimeoutMs: 2_000,
    cleanup: async () => {
      await livePlatform.metadata.setMetadata({
        [`${namespace}metadata:retained`]: undefined,
        [`${namespace}metadata:removed`]: undefined,
        [`${namespace}metadata:added`]: undefined,
      });
    },
  };
}

function createStorageFixture(storage: StoragePort, namespace: string): StorageFixture {
  const prefix = `${namespace}storage:`;

  return {
    storage,
    key: (name) => `${prefix}${name}`,
    ownsKey: (key) => key.startsWith(prefix),
    cleanup: () => cleanupStorageNamespace(storage, prefix),
  };
}

async function createBroadcastFixture(
  livePlatform: Platform,
  localPeerListeners: Map<string, Set<EventListener>>,
  remotePeerListeners: Map<string, Set<EventListener>>,
  namespace: string,
  senderConnectionId: string,
  ensureLocalPeer: () => Promise<void>,
): Promise<BroadcastFixture> {
  await ensureLocalPeer();
  const sender = namespacedBroadcast(livePlatform.broadcast, namespace);

  const remotePeer: BroadcastPort = {
    sendMessage: (channel, data, options) =>
      livePlatform.broadcast.sendMessage(namespacedChannel(namespace, channel), data, options),
    onMessage: (channel, callback) => {
      const fullChannel = namespacedChannel(namespace, channel);
      const listeners = remotePeerListeners.get(fullChannel) ?? new Set<EventListener>();
      listeners.add(callback);
      remotePeerListeners.set(fullChannel, listeners);

      return () => {
        listeners.delete(callback);

        if (listeners.size === 0) {
          remotePeerListeners.delete(fullChannel);
        }
      };
    },
  };

  return {
    sender,
    localPeer: localPeerBroadcast(localPeerListeners, namespace),
    remotePeer,
    senderConnectionId,
    observationTimeoutMs: 2_000,
    quietPeriodMs: 100,
    cleanup: () => undefined,
  };
}

function localPeerBroadcast(
  localPeerListeners: Map<string, Set<EventListener>>,
  namespace: string,
): BroadcastPort {
  return {
    sendMessage: async () => {
      throw new Error('The live local peer only observes messages from its second context.');
    },
    onMessage: (channel, callback) => {
      const fullChannel = namespacedChannel(namespace, channel);
      const listeners = localPeerListeners.get(fullChannel) ?? new Set<EventListener>();
      listeners.add(callback);
      localPeerListeners.set(fullChannel, listeners);

      return () => {
        listeners.delete(callback);

        if (listeners.size === 0) {
          localPeerListeners.delete(fullChannel);
        }
      };
    },
  };
}

function namespacedBroadcast(port: BroadcastPort, namespace: string): BroadcastPort {
  return {
    sendMessage: (channel, data, options) =>
      port.sendMessage(namespacedChannel(namespace, channel), data, options),
    onMessage: (channel, callback) =>
      port.onMessage(namespacedChannel(namespace, channel), callback),
  };
}

function namespacedChannel(namespace: string, channel: string): string {
  return `${namespace}broadcast:${channel}`;
}

function requestPeerMetadata(
  pendingReads: Map<string, PendingRead>,
  requestId: string,
  controlChannel: string,
  namespace: string,
): Promise<JsonObject> {
  return new Promise<JsonObject>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (pendingReads.delete(requestId)) {
        reject(new Error('Live harness control transport timed out during metadata read.'));
      }
    }, CONTROL_RPC_TIMEOUT_MS);

    pendingReads.set(requestId, {
      resolve: (metadata) => {
        clearTimeout(timeoutId);
        resolve(metadata);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });

    sendControl(controlChannel, {
      kind: 'metadata-read',
      runId: namespace.slice('port-contract-live:'.length, -1),
      requestId,
    }).catch((error) => {
      pendingReads.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

async function sendPeerReady(
  controlChannel: string,
  runId: string,
  roomId: string,
  connectionId: string,
): Promise<void> {
  await sendControl(controlChannel, { kind: 'peer-ready', runId, roomId, connectionId });
}

async function sendControl(
  controlChannel: string,
  message: ControlMessage,
  destination: 'LOCAL' | 'REMOTE' = 'REMOTE',
): Promise<void> {
  const result = await withControlTimeout(
    platform.broadcast.sendMessage(controlChannel, message, {
      destination,
    }),
    'Live harness control transport timed out while sending a control message.',
  );

  if (!result.isOk()) {
    throw new Error(
      result.error.kind === 'rate-limited'
        ? 'The live harness control message was rate-limited.'
        : result.error.reason,
    );
  }
}

function withControlTimeout<T>(operation: Promise<T>, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(reason)), CONTROL_RPC_TIMEOUT_MS);

    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function reportControlFailure(error: Error): void {
  console.error(`Live harness control transport failed: ${String(error)}`);
}

function parseControlMessage(data: JsonValue, runId: string): ControlMessage | null {
  const parsed = controlMessageSchema.safeParse(data);

  if (!parsed.success || parsed.data.runId !== runId) {
    return null;
  }

  return parsed.data;
}
