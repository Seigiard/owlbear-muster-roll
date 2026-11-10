import { nanoid } from 'nanoid';

import { createBoundedIdSet } from '@/core/bounded-id-set';
import { fitsOneMessage } from '@/core/message-size';
import { err, ok, type Result } from '@/core/result';
import type { Timing } from '@/core/timing';
import {
  parseEngineMessage,
  UI_CHANNEL,
  type Command,
  type DeltaMessage,
  type EngineMessage,
  type ProjectionMessage,
  type WindowMessage,
} from '@/core/ui-messages';
import type { BroadcastOptions, BroadcastPort } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import type { ProjectionStore } from '@/ui/projection-store';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

const OWN_COMMAND_ID_LIMIT = 256;

type Phase = 'requesting' | 'assembling' | 'live';

type Assembly = {
  engine: string;
  seq: number;
  n: number;
  parts: Map<number, ProjectionMessage>;
};

export type CommandFailure = 'too-large';

export type ReplicaClient = {
  sendCommand: (command: Command) => Result<string, CommandFailure>;
  stop: () => void;
};

export function startReplicaClient(
  broadcast: Pick<BroadcastPort, 'onMessage'>,
  sendQueue: SendQueue,
  store: ProjectionStore,
  timing: Timing,
  newId: () => string = nanoid,
): ReplicaClient {
  const ownCommandIds = createBoundedIdSet(OWN_COMMAND_ID_LIMIT);
  let phase: Phase = 'requesting';
  let nonce = newId();
  let queuedNonce: string | null = null;
  let assembly: Assembly | null = null;
  let buffered: DeltaMessage[] = [];
  let liveEngine = '';
  let lastSeq = 0;
  let repeatTimer: ReturnType<typeof setTimeout> | undefined;
  let incompleteTimer: ReturnType<typeof setTimeout> | undefined;

  function send(message: WindowMessage): Promise<void> {
    return sendQueue.enqueue(UI_CHANNEL, message, LOCAL);
  }

  function sendRequest(): void {
    // Armed first, because a bus that delivers at once can answer during the send below.
    repeatTimer = setTimeout(sendRequest, timing.projectionRequestRepeatMs);

    // Under a rate limit the previous repeat can still be queued. Another copy only adds load.
    if (queuedNonce !== nonce) {
      const requested = nonce;

      queuedNonce = requested;
      send({ t: 'projection-request', nonce: requested })
        .then(() => {
          if (queuedNonce === requested) {
            queuedNonce = null;
          }
        })
        .catch((error) => {
          console.error('Muster Roll could not request its projection', error);
        });
    }
  }

  function request(): void {
    clearTimeout(repeatTimer);
    clearTimeout(incompleteTimer);
    phase = 'requesting';
    nonce = newId();
    assembly = null;
    buffered = [];
    sendRequest();
  }

  function assemblyFor(part: ProjectionMessage): Assembly {
    if (
      assembly !== null &&
      assembly.engine === part.engine &&
      assembly.seq === part.seq &&
      assembly.n === part.n
    ) {
      return assembly;
    }

    return { engine: part.engine, seq: part.seq, n: part.n, parts: new Map() };
  }

  function receiveProjectionPart(part: ProjectionMessage): void {
    if (part.nonce !== nonce || phase === 'live') {
      return;
    }

    clearTimeout(repeatTimer);
    clearTimeout(incompleteTimer);
    phase = 'assembling';

    const current = assemblyFor(part);

    current.parts.set(part.i, part);
    assembly = current;

    if (current.parts.size === current.n) {
      completeAssembly(current, part);

      return;
    }

    incompleteTimer = setTimeout(request, timing.projectionIncompleteTimeoutMs);
  }

  function completeAssembly(complete: Assembly, lastPart: ProjectionMessage): void {
    const records = Array.from({ length: complete.n }, (_unused, index) => {
      return complete.parts.get(index + 1)?.records ?? [];
    }).flat();

    store.replaceAll(records, lastPart.notices);
    liveEngine = complete.engine;
    lastSeq = complete.seq;
    phase = 'live';
    assembly = null;

    const waiting = buffered;

    buffered = [];

    for (const delta of waiting) {
      applyLiveDelta(delta);

      if (phase !== 'live') {
        return;
      }
    }
  }

  function applyLiveDelta(delta: DeltaMessage): void {
    if (delta.engine !== liveEngine) {
      // A restarted engine counts from zero again, so its sequence says nothing.
      request();

      return;
    }

    if (delta.seq <= lastSeq) {
      return;
    }

    if (delta.seq !== lastSeq + 1) {
      request();

      return;
    }

    lastSeq = delta.seq;
    store.applyDelta(delta.records, delta.notices);
  }

  function handleMessage(message: EngineMessage): void {
    if (message.t === 'projection') {
      receiveProjectionPart(message);
    } else if (message.t === 'command-rejected') {
      if (ownCommandIds.has(message.id)) {
        store.setRejection(message);
      }
    } else if (phase === 'live') {
      applyLiveDelta(message);
    } else if (phase === 'assembling') {
      buffered.push(message);
    }
  }

  const unsubscribe = broadcast.onMessage(UI_CHANNEL, (event) => {
    // Echoes of a window's own requests and commands fail this schema and stop here.
    const parsed = parseEngineMessage(event.data);

    if (parsed.ok) {
      handleMessage(parsed.value);
    }
  });

  sendRequest();

  return {
    sendCommand: (command) => {
      const id = newId();
      const message: WindowMessage = { t: 'command', id, command };

      if (!fitsOneMessage(message)) {
        return err('too-large');
      }

      ownCommandIds.add(id);
      send(message).catch((error) => {
        console.error('Muster Roll could not send a command', error);
      });

      return ok(id);
    },
    stop: () => {
      unsubscribe();
      clearTimeout(repeatTimer);
      clearTimeout(incompleteTimer);
    },
  };
}
