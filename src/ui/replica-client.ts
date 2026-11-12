import { nanoid } from 'nanoid';

import { fitsOneMessage } from '@/core/message-size';
import type { Timing } from '@/core/timing';
import {
  parseEngineMessage,
  UI_CHANNEL,
  type Command,
  type CommandRejectedMessage,
  type DeltaMessage,
  type EngineMessage,
  type PresetDiffResultMessage,
  type PresetUploadedMessage,
  type ProjectionMessage,
  type RollRequestMessage,
  type RollOutcome,
  type SnapshotCheckResultMessage,
  type WindowMessage,
} from '@/core/ui-messages';
import type { BroadcastOptions, BroadcastPort } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import type { ProjectionStore } from '@/ui/projection-store';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

type Phase = 'requesting' | 'assembling' | 'live';

type Assembly = {
  engine: string;
  seq: number;
  n: number;
  parts: Map<number, ProjectionMessage>;
};

// `urgent` skips the spacing queue, for a window that is closing.
export type SendCommandOptions = { urgent?: boolean };

// A roll request as a view makes it. The client adds the id.
export type RollRequest = Omit<RollRequestMessage, 't' | 'id'>;

export type CommandOutcome<Answer> =
  | { kind: 'answered'; answer: Answer }
  | { kind: 'refused'; rejection: CommandRejectedMessage }
  | { kind: 'timed-out' };

export type ErasedCounts = { count: number; sheets: number; digest: string };

export type CommandOutcomePromise<Answer> = {
  then: Promise<CommandOutcome<Answer>>['then'];
  catch: Promise<CommandOutcome<Answer>>['catch'];
  finally: Promise<CommandOutcome<Answer>>['finally'];
  readonly [Symbol.toStringTag]: string;
};

type AnswerFor<CommandType extends Command> = CommandType extends {
  type: 'preset-upload';
}
  ? Pick<PresetUploadedMessage, 'count' | 'sheets'>
  : undefined;

type FinalRollOutcome = Exclude<RollOutcome, { code: 'waiting-access' }>;

type AnswerMessage =
  | Extract<EngineMessage, { t: 'command-rejected' }>
  | Extract<EngineMessage, { t: 'command-done' }>
  | PresetDiffResultMessage
  | PresetUploadedMessage
  | SnapshotCheckResultMessage
  | Extract<EngineMessage, { t: 'snapshot-imported' | 'wiped' }>
  | Extract<EngineMessage, { t: 'roll-outcome' }>;

type PendingOutcome = {
  resolve: (outcome: CommandOutcome<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
  onWaitingAccess?: () => void;
};

export type ReplicaClient = {
  sendCommand: <C extends Command>(
    command: C,
    options?: SendCommandOptions,
  ) => CommandOutcomePromise<AnswerFor<C>>;
  // AD-14: asks how many stored values the preset in `data` would erase. The answer and any
  // refusal come by the id hidden inside the returned promise.
  requestPresetDiff: (data: string) => Promise<CommandOutcome<ErasedCounts>>;
  // AD-9: asks how many values of the snapshot file in `data` the current preset would drop. The
  // answer and any refusal come by the id hidden inside the returned promise.
  requestSnapshotCheck: (data: string) => Promise<CommandOutcome<ErasedCounts>>;
  // Through the same queue as commands, so a field patch sent before it reaches the engine first.
  requestRoll: (
    request: RollRequest,
    onWaitingAccess?: () => void,
  ) => CommandOutcomePromise<FinalRollOutcome>;
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
  const pending = new Map<string, PendingOutcome>();
  let phase: Phase = 'requesting';
  let nonce = newId();
  let queuedNonce: string | null = null;
  let assembly: Assembly | null = null;
  let buffered: Array<DeltaMessage | AnswerMessage> = [];
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
    buffered = buffered.filter(isAnswerMessage);
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

    for (const [index, message] of waiting.entries()) {
      applyLiveMessage(message);

      if (phase !== 'live') {
        // `applyLiveDelta` can restart the projection while replaying this local list. Keep every
        // later answer, but drop the old stream's remaining deltas.
        buffered.push(...waiting.slice(index + 1).filter(isAnswerMessage));

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

  function applyLiveMessage(message: DeltaMessage | AnswerMessage): void {
    if (message.t === 'delta') {
      applyLiveDelta(message);
    } else {
      handleAnswer(message);
    }
  }

  function handleAnswer(message: AnswerMessage): void {
    const waiting = pending.get(message.id);

    if (waiting === undefined) {
      return;
    }

    if (message.t === 'roll-outcome' && message.outcome.code === 'waiting-access') {
      try {
        waiting.onWaitingAccess?.();
      } catch (error) {
        console.error('Muster Roll could not report that a roll waits for the GM', error);
      }

      return;
    }

    pending.delete(message.id);
    clearTimeout(waiting.timer);

    if (message.t === 'command-rejected') {
      waiting.resolve({ kind: 'refused', rejection: message });
    } else if (
      message.t === 'command-done' ||
      message.t === 'snapshot-imported' ||
      message.t === 'wiped'
    ) {
      waiting.resolve({ kind: 'answered', answer: undefined });
    } else if (message.t === 'preset-diff-result' || message.t === 'snapshot-check-result') {
      const { id: _id, t: _type, ...answer } = message;
      waiting.resolve({ kind: 'answered', answer });
    } else if (message.t === 'preset-uploaded') {
      waiting.resolve({
        kind: 'answered',
        answer: { count: message.count, sheets: message.sheets },
      });
    } else if (message.t === 'roll-outcome') {
      waiting.resolve({ kind: 'answered', answer: message.outcome });
    }
  }

  function waitFor<Answer>(
    id: string,
    timeoutMs: number,
    sendMessage: () => Promise<void>,
    onWaitingAccess?: () => void,
    sendImmediately = false,
  ): Promise<CommandOutcome<Answer>> {
    const promise = new Promise<CommandOutcome<unknown>>((resolve) => {
      const timer = setTimeout(() => {
        const waiting = pending.get(id);

        if (waiting === undefined) {
          return;
        }

        pending.delete(id);
        resolve({ kind: 'timed-out' });
      }, timeoutMs);

      pending.set(id, { resolve, timer, onWaitingAccess });
    });

    const sendRequest = (): void => {
      sendMessage().catch((error) => {
        console.error('Muster Roll could not send a window request', error);
      });
    };

    if (sendImmediately) {
      sendRequest();
    } else {
      queueMicrotask(sendRequest);
    }

    // SAFETY: `pending` resolves this promise only with `CommandOutcome<Answer>`; the unknown
    // resolver type prevents a generic promise from being assigned without this boundary cast.
    return promise as CommandOutcomePromise<Answer>;
  }

  function timeoutForCommand(command: Command): number {
    switch (command.type) {
      case 'preset-upload':
        return timing.presetRequestTimeoutMs;
      case 'snapshot-import':
        return timing.snapshotImportTimeoutMs;
      case 'wipe':
        return timing.wipeTimeoutMs;
      case 'acl-set':
      case 'owner-set':
        return timing.accessChangeTimeoutMs;
      case 'link-set':
      case 'link-clear':
        return timing.linkSetTimeoutMs;
      default:
        return timing.commandTimeoutMs;
    }
  }

  function handleMessage(message: EngineMessage): void {
    if (message.t === 'projection') {
      receiveProjectionPart(message);
    } else if (message.t === 'open-sheet') {
      // Only a window that holds the records can find the sheet. The engine sends the request
      // again after the projection this window waits for.
      if (phase === 'live') {
        store.setOpenRequest({
          id: message.id,
          sheetId: message.sheetId,
          instanceId: message.instanceId,
        });
      }
    } else if (isAnswerMessage(message)) {
      if (phase === 'live') {
        handleAnswer(message);
      } else {
        buffered.push(message);
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
    // SAFETY: the implementation handles every `Command` with its corresponding `AnswerFor`
    // result; this assertion exposes that relationship through the generic public method.
    sendCommand: ((command: Command, options?: SendCommandOptions) => {
      const id = newId();
      const message: WindowMessage = { t: 'command', id, command };

      if (!fitsOneMessage(message)) {
        const outcome = Promise.resolve({
          kind: 'refused',
          rejection: { t: 'command-rejected', id, reason: 'too-large' },
        });

        return outcome;
      }

      return waitFor<AnswerFor<typeof command>>(
        id,
        timeoutForCommand(command),
        () =>
          options?.urgent === true ? sendQueue.sendNow(UI_CHANNEL, message, LOCAL) : send(message),
        undefined,
        options?.urgent === true,
      );
    }) as ReplicaClient['sendCommand'],
    requestPresetDiff: (data) => {
      const id = newId();
      const message: WindowMessage = { t: 'preset-diff', id, data };

      if (!fitsOneMessage(message)) {
        return Promise.resolve({
          kind: 'refused',
          rejection: { t: 'command-rejected', id, reason: 'too-large' },
        });
      }

      return waitFor<ErasedCounts>(id, timing.presetRequestTimeoutMs, () => send(message));
    },
    requestSnapshotCheck: (data) => {
      const id = newId();
      const message: WindowMessage = { t: 'snapshot-check', id, data };

      if (!fitsOneMessage(message)) {
        return Promise.resolve({
          kind: 'refused',
          rejection: { t: 'command-rejected', id, reason: 'too-large' },
        });
      }

      return waitFor<ErasedCounts>(id, timing.presetRequestTimeoutMs, () => send(message));
    },
    requestRoll: (roll, onWaitingAccess) => {
      const id = newId();
      const message: WindowMessage = { t: 'roll-request', id, ...roll };

      if (!fitsOneMessage(message)) {
        return Promise.resolve({
          kind: 'refused',
          rejection: { t: 'command-rejected', id, reason: 'too-large' },
        });
      }

      return waitFor<FinalRollOutcome>(
        id,
        timing.rollTimeoutMs,
        () => send(message),
        onWaitingAccess,
      );
    },
    acknowledgeOpen: (id) => {
      send({ t: 'open-sheet-ack', id }).catch((error) => {
        console.error('Muster Roll could not acknowledge an open request', error);
      });
    },
    flushNow: sendQueue.flushNow,
    stop: () => {
      for (const [id, waiting] of pending) {
        pending.delete(id);
        clearTimeout(waiting.timer);
        waiting.resolve({ kind: 'timed-out' });
      }

      unsubscribe();
      clearTimeout(repeatTimer);
      clearTimeout(incompleteTimer);
    },
  };
}

function isAnswerMessage(message: EngineMessage): message is AnswerMessage {
  return (
    message.t === 'command-rejected' ||
    message.t === 'command-done' ||
    message.t === 'preset-diff-result' ||
    message.t === 'preset-uploaded' ||
    message.t === 'snapshot-check-result' ||
    message.t === 'snapshot-imported' ||
    message.t === 'wiped' ||
    message.t === 'roll-outcome'
  );
}
