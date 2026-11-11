import {
  DICE_PLUS_ERROR_CHANNEL,
  DICE_PLUS_READY_CHANNEL,
  DICE_PLUS_RESULT_CHANNEL,
  DICE_PLUS_ROLL_REQUEST_CHANNEL,
  DICE_PLUS_SOURCE,
  dicePlusErrorTextSchema,
  dicePlusFaces,
  dicePlusReadyReplySchema,
  dicePlusReplySchema,
  type DicePlusReadyProbe,
  type DicePlusRollRequest,
  type DicePlusTarget,
} from '@/core/dice-plus';
import type { DiceTerm, DieFace } from '@/core/formula-evaluate';
import type { JsonValue } from '@/core/json';
import { err, type Result } from '@/core/result';
import type { DiceExtensionTiming } from '@/core/timing';
import type { BroadcastOptions, BroadcastPort } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

// One roll for the dice extension. `playerId` is this client's own player: the extension rolls only
// for the player of the client it runs in.
export type DiceExtensionRoll = {
  terms: readonly DiceTerm[];
  notation: string;
  playerId: string;
  playerName: string;
  rollTarget: DicePlusTarget;
};

// `stopped`: the background page stopped while the roll waited, so nothing more happens with it.
export type DiceExtensionFailure = { code: 'failed'; reason: string } | { code: 'stopped' };

export type DiceExtension = {
  // TASK-36: probes at once, and again a few times while nothing answers.
  start: () => void;
  // Whether a roll may use the extension: only when the latest probe answered ready. A probe older
  // than the max age starts a new one, and a roll waits for it. With no extension last time a roll
  // never waits, and each roll starts a probe in the background.
  ready: () => Promise<boolean>;
  // The faces the extension rolled, in the tree order of the terms, or why there are none: an error
  // reply, a result that does not match the terms, a failed send, or no result in time.
  roll: (request: DiceExtensionRoll) => Promise<Result<DieFace[], DiceExtensionFailure>>;
  stop: () => void;
};

// `gone` marks an answer that shows no extension is listening: a failed send or no result.
type WaitingRoll = {
  terms: readonly DiceTerm[];
  finish: (faces: Result<DieFace[], DiceExtensionFailure>, gone?: boolean) => void;
};

// The Dice+ client of the background page. Every message goes through the send queue, as all
// sends do (AD-12). Each wait counts from its start, the queue's pace included. `dicex` keeps one
// pending request and drops the one before, so one roll goes out at a time.
export function createDiceExtension(
  broadcast: BroadcastPort,
  sendQueue: SendQueue,
  timing: DiceExtensionTiming,
  newId: () => string,
): DiceExtension {
  // The latest answered probe, and when the latest probe started, on the monotonic clock.
  let lastReady = false;
  let probedAt = Number.NEGATIVE_INFINITY;
  let probing: Promise<boolean> | null = null;
  let stopped = false;
  // Settles when the roll asked for last has its answer, so the next one waits for it.
  let lastRoll: Promise<void> = Promise.resolve();
  const probes = new Map<string, (ready: boolean) => void>();
  const rolls = new Map<string, WaitingRoll>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const unsubscribeReady = broadcast.onMessage(DICE_PLUS_READY_CHANNEL, (event) => {
    const reply = dicePlusReadyReplySchema.safeParse(event.data);

    if (reply.success) {
      probes.get(reply.data.requestId)?.(reply.data.ready);
    }
  });

  const unsubscribeResult = broadcast.onMessage(DICE_PLUS_RESULT_CHANNEL, (event) => {
    const waiting = waitingFor(event.data);
    const faces = waiting === undefined ? null : dicePlusFaces(waiting.terms, event.data);

    if (waiting !== undefined && faces !== null) {
      waiting.finish(faces.ok ? faces : err({ code: 'failed', reason: faces.error }));
    }
  });

  // Matched by `rollId` alone, as a result is: any error for a waiting roll ends its wait.
  const unsubscribeError = broadcast.onMessage(DICE_PLUS_ERROR_CHANNEL, (event) => {
    const text = dicePlusErrorTextSchema.safeParse(event.data);
    const reason = text.success ? text.data.error : 'no reason given';

    waitingFor(event.data)?.finish(
      err({ code: 'failed', reason: `the extension refused the roll: ${reason}` }),
    );
  });

  function waitingFor(data: JsonValue): WaitingRoll | undefined {
    const reply = dicePlusReplySchema.safeParse(data);

    return reply.success ? rolls.get(reply.data.rollId) : undefined;
  }

  // Runs `action` after `delay`, unless the client stops first. An answer that comes first leaves
  // the timer to find nothing waiting.
  function after(delay: number, action: () => void): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      action();
    }, delay);

    timers.add(timer);
  }

  // A send the queue gave up on, or one that threw, counts as not sent.
  function whenSent(
    channel: string,
    message: DicePlusReadyProbe | DicePlusRollRequest,
    then: (sent: boolean) => void,
  ): void {
    sendQueue.enqueueReported(channel, message, LOCAL).then(then, (error) => {
      console.error('Muster Roll could not send to the dice extension', error);
      then(false);
    });
  }

  function probe(): Promise<boolean> {
    if (probing !== null) {
      return probing;
    }

    const requestId = newId();
    const message: DicePlusReadyProbe = { requestId, timestamp: Date.now() };

    const answer = new Promise<boolean>((resolve) => {
      probes.set(requestId, (ready) => {
        if (!probes.delete(requestId)) {
          return;
        }

        lastReady = ready;

        if (probing === answer) {
          probing = null;
        }

        resolve(ready);
      });
    });

    probedAt = performance.now();
    probing = answer;
    after(timing.probeWaitMs, () => {
      probes.get(requestId)?.(false);
    });

    // The answer can come while the message is sent, so `probing` is set first.
    whenSent(DICE_PLUS_READY_CHANNEL, message, (sent) => {
      if (!sent) {
        probes.get(requestId)?.(false);
      }
    });

    return answer;
  }

  function probeAtStart(retriesLeft: number, delay: number): void {
    void probe().then((ready) => {
      if (!ready && !stopped && retriesLeft > 0) {
        after(delay, () => {
          probeAtStart(retriesLeft - 1, delay * 2);
        });
      }
    });
  }

  // The request goes out once the roll before it has its answer, and only while this roll waits.
  function send(message: DicePlusRollRequest): void {
    if (!rolls.has(message.rollId)) {
      return;
    }

    whenSent(DICE_PLUS_ROLL_REQUEST_CHANNEL, message, (sent) => {
      if (!sent) {
        rolls
          .get(message.rollId)
          ?.finish(err({ code: 'failed', reason: 'the roll request was not sent' }), true);
      }
    });
  }

  return {
    start: () => {
      probeAtStart(timing.startProbeRetries, timing.startProbeRetryMs);
    },
    ready: () => {
      if (stopped) {
        return Promise.resolve(false);
      }

      if (!lastReady) {
        void probe();

        return Promise.resolve(false);
      }

      const stale = performance.now() - probedAt >= timing.probeMaxAgeMs;

      return probing ?? (stale ? probe() : Promise.resolve(true));
    },
    roll: (request) => {
      if (stopped) {
        return Promise.resolve(err({ code: 'stopped' }));
      }

      const rollId = newId();

      const message: DicePlusRollRequest = {
        rollId,
        playerId: request.playerId,
        playerName: request.playerName,
        rollTarget: request.rollTarget,
        diceNotation: request.notation,
        showResults: false,
        timestamp: Date.now(),
        source: DICE_PLUS_SOURCE,
      };

      const answer = new Promise<Result<DieFace[], DiceExtensionFailure>>((resolve) => {
        rolls.set(rollId, {
          terms: request.terms,
          finish: (faces, gone = false) => {
            if (!rolls.delete(rollId)) {
              return;
            }

            // An extension that stopped answering is gone until a probe finds it again.
            if (gone && !stopped) {
              lastReady = false;
              void probe();
            }

            resolve(faces);
          },
        });
      });

      after(timing.resultTimeoutMs, () => {
        rolls.get(rollId)?.finish(err({ code: 'failed', reason: 'no result in time' }), true);
      });

      const before = lastRoll;

      lastRoll = answer.then(() => undefined);
      void before.then(() => {
        send(message);
      });

      return answer;
    },
    stop: () => {
      stopped = true;
      unsubscribeReady();
      unsubscribeResult();
      unsubscribeError();

      for (const timer of timers) {
        clearTimeout(timer);
      }

      timers.clear();

      for (const finish of probes.values()) {
        finish(false);
      }

      for (const waiting of rolls.values()) {
        waiting.finish(err({ code: 'stopped' }));
      }
    },
  };
}
