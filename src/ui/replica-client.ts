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
  type RollRequestMessage,
  type WindowMessage,
} from '@/core/ui-messages';
import type { BroadcastOptions, BroadcastPort } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import type { ProjectionStore } from '@/ui/projection-store';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

const OWN_COMMAND_ID_LIMIT = 256;

const OWN_ROLL_ID_LIMIT = 256;

type Phase = 'requesting' | 'assembling' | 'live';

type Assembly = {
  engine: string;
  seq: number;
  n: number;
  parts: Map<number, ProjectionMessage>;
};

export type CommandFailure = 'too-large';

// `urgent` skips the spacing queue, for a window that is closing.
export type SendCommandOptions = { urgent?: boolean };

// A roll request as a view makes it. The client adds the id.
export type RollRequest = Omit<RollRequestMessage, 't' | 'id'>;

export type ReplicaClient = {
  sendCommand: (command: Command, options?: SendCommandOptions) => Result<string, CommandFailure>;
  // Through the same queue as commands, so a field patch sent before it reaches the engine first.
  requestRoll: (request: RollRequest) => Result<string, CommandFailure>;
  // FR14: tells the engine this window took the open request with this id, so no window gets it
  // again.
  acknowledgeOpen: (id: string) => void;
  // Sends every waiting message at once, for a window that is closing.
  flushNow: () => void;
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
  const ownRollIds = createBoundedIdSet(OWN_ROLL_ID_LIMIT);
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
    const parts = Array.from({ length: complete.n }, (_unused, index) =>
      complete.parts.get(index + 1),
    );

    store.replaceAll(
      parts.flatMap((part) => part?.records ?? []),
      parts.flatMap((part) => part?.pending ?? []),
      lastPart.notices,
      lastPart.sync,
    );
    store.setRoomCopy(lastPart.roomCopy);
    store.setParty(lastPart.party);
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
    store.applyDelta(delta.records, delta.pending, delta.withdrawn, delta.notices, delta.sync);
    store.setRoomCopy(delta.roomCopy);
    store.setParty(delta.party);
  }

  function handleMessage(message: EngineMessage): void {
    if (message.t === 'projection') {
      receiveProjectionPart(message);
    } else if (message.t === 'command-rejected') {
      if (ownCommandIds.has(message.id)) {
        store.setRejection(message);
      }
    } else if (message.t === 'roll-outcome') {
      if (ownRollIds.has(message.id)) {
        store.setRollOutcome(message);
      }
    } else if (message.t === 'open-sheet') {
      // Only a window that holds the records can find the sheet. The engine sends the request
      // again after the projection this window waits for.
      if (phase === 'live') {
        store.setOpenRequest({ id: message.id, sheetId: message.sheetId });
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
    sendCommand: (command, options) => {
      const id = newId();
      const message: WindowMessage = { t: 'command', id, command };

      if (!fitsOneMessage(message)) {
        return err('too-large');
      }

      ownCommandIds.add(id);

      const sent =
        options?.urgent === true ? sendQueue.sendNow(UI_CHANNEL, message, LOCAL) : send(message);

      sent.catch((error) => {
        console.error('Muster Roll could not send a command', error);
      });

      return ok(id);
    },
    requestRoll: (roll) => {
      const id = newId();
      const message: WindowMessage = { t: 'roll-request', id, ...roll };

      if (!fitsOneMessage(message)) {
        return err('too-large');
      }

      ownRollIds.add(id);
      send(message).catch((error) => {
        console.error('Muster Roll could not request a roll', error);
      });

      return ok(id);
    },
    acknowledgeOpen: (id) => {
      send({ t: 'open-sheet-ack', id }).catch((error) => {
        console.error('Muster Roll could not acknowledge an open request', error);
      });
    },
    flushNow: sendQueue.flushNow,
    stop: () => {
      unsubscribe();
      clearTimeout(repeatTimer);
      clearTimeout(incompleteTimer);
    },
  };
}
