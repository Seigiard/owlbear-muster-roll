import {
  DICE_PLUS_ACCESS_CHANNEL,
  DICE_PLUS_ERROR_CHANNEL,
  DICE_PLUS_NO_GM,
  DICE_PLUS_NOT_PERMITTED,
  DICE_PLUS_READY_CHANNEL,
  DICE_PLUS_REQUEST_ACCESS_CHANNEL,
  DICE_PLUS_RESULT_CHANNEL,
  DICE_PLUS_ROLL_REQUEST_CHANNEL,
  DICE_PLUS_SOURCE,
  dicePlusAccessReplySchema,
  dicePlusErrorTextSchema,
  dicePlusFaces,
  dicePlusReadyReplySchema,
  dicePlusReplySchema,
  type DicePlusAccessRequest,
  type DicePlusAccessStatus,
  type DicePlusReadyProbe,
  type DicePlusRollRequest,
  type DicePlusTarget,
} from '@/core/dice-plus';
import type { DiceTerm, DieFace } from '@/core/formula-evaluate';
import type { JsonValue } from '@/core/json';
import { Result } from 'better-result';
import type { DiceExtensionTiming } from '@/core/timing';
import { SendFailure, type BroadcastOptions, type BroadcastPort } from '@/platform/ports';
import { taggedSendFailure, type FailureReporter } from '@/replica/failures';

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

// The GM's answer for Muster Roll, as this client last learned it (TASK-36). `permitted`: the
// extension rolls for Muster Roll, or knows no access, as the commercial Dice+. `pending`: a GM was
// asked and has not answered yet. `unknown`: the extension has no answer, and nobody waits for one.
// `refused`: the GM denied, or no GM was in the room to answer.
export type DiceAccess = 'permitted' | 'pending' | 'unknown' | 'refused';

// Whether a roll may use the extension: `absent` when the latest probe had no answer, else what
// this client knows of access.
export type DiceExtensionReadiness = 'absent' | DiceAccess;

// `stopped`: the background page stopped while the roll waited, so nothing more happens with it.
export type DiceExtensionFailure = { code: 'failed'; reason: string } | { code: 'stopped' };

export type DiceExtension = {
  // TASK-36: probes at once, and again a few times while nothing answers.
  start: () => void;
  // What the latest probe answered. A probe older than the max age, or a latest probe with no
  // answer, starts a new one, and a roll waits for it.
  ready: () => Promise<DiceExtensionReadiness>;
  // The faces the extension rolled, in the tree order of the terms, or why there are none: an error
  // reply (a refusal of access too), a result that does not match the terms, a failed send, or no
  // result in time. A roll sent without access waits the access wait longer.
  roll: (request: DiceExtensionRoll) => Promise<Result<DieFace[], DiceExtensionFailure>>;
  // This client became a GM's: it probes, and asks for access when the answer says it has none.
  becameGm: () => void;
  stop: () => void;
};

// `gone` marks an answer that shows no extension is listening: a failed send or no result.
type WaitingRoll = {
  terms: readonly DiceTerm[];
  finish: (faces: Result<DieFace[], DiceExtensionFailure>, gone?: boolean) => void;
};

// The latest probe. `settle` ends the wait of a roll for it.
type LatestProbe = { id: string; startedAt: number; settle: (ready: boolean) => void };

// The Dice+ client of the background page. Its messages are LOCAL, so they skip the paced send
// queue: they never reach the network, and at start the queue is busy with catch-up, which would
// hold a probe past its wait. Each wait counts from its start. `dicex` keeps one pending request
// and drops the one before, so one roll goes out at a time. `mayAskAccess` says whether this client
// is a GM's: only a GM client asks the extension for access, so the GM sees the prompt before
// anyone rolls.
export function createDiceExtension(
  broadcast: BroadcastPort,
  timing: DiceExtensionTiming,
  newId: () => string,
  mayAskAccess: () => boolean,
  report: FailureReporter = () => undefined,
): DiceExtension {
  // The latest answer to a probe, and when the latest probe started, on the monotonic clock.
  let lastReady = false;
  let probedAt = Number.NEGATIVE_INFINITY;
  let latestProbe: LatestProbe | null = null;
  let probing: Promise<boolean> | null = null;
  let access: DiceAccess = 'unknown';
  // When access was last granted. A probe that started before then cannot take it back.
  let permittedAt = Number.NEGATIVE_INFINITY;
  let stopped = false;
  // Settles when the roll asked for last has its answer, so the next one waits for it.
  let lastRoll: Promise<void> = Promise.resolve();
  // Access is asked once per start. A `timeout` or `no-gm` answer, no answer in time, a failed send,
  // or access that the extension took back lets a later probe that finds no access ask again.
  let accessAsked = false;
  const accessRequests = new Set<string>();
  const rolls = new Map<string, WaitingRoll>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  // A late answer to the latest probe still counts, for the next roll.
  const unsubscribeReady = broadcast.onMessage(DICE_PLUS_READY_CHANNEL, (event) => {
    const reply = dicePlusReadyReplySchema.safeParse(event.data);
    const latest = latestProbe;

    if (!reply.success || latest === null || reply.data.requestId !== latest.id || stopped) {
      return;
    }

    lastReady = reply.data.ready;

    if (reply.data.ready) {
      learnFromProbe(reply.data.permitted ?? true, latest.startedAt);
    }

    latest.settle(reply.data.ready);
  });

  const unsubscribeAccess = broadcast.onMessage(DICE_PLUS_ACCESS_CHANNEL, (event) => {
    const reply = dicePlusAccessReplySchema.safeParse(event.data);

    if (!reply.success || !accessRequests.has(reply.data.requestId)) {
      return;
    }

    // `pending` is no answer: the GM was only asked.
    if (reply.data.status === 'pending') {
      if (access !== 'permitted') {
        access = 'pending';
      }

      return;
    }

    endAccessRequest(reply.data.requestId, reply.data.status);
  });

  const unsubscribeResult = broadcast.onMessage(DICE_PLUS_RESULT_CHANNEL, (event) => {
    const waiting = waitingFor(event.data);

    if (waiting === undefined) {
      return;
    }

    // The extension rolled, so the GM allowed this source.
    permit();

    const faces = dicePlusFaces(waiting.terms, event.data);

    waiting.finish(
      faces.isOk()
        ? Result.ok<DieFace[], DiceExtensionFailure>(faces.value)
        : Result.err({ code: 'failed', reason: faces.error }),
    );
  });

  // Matched by `rollId` alone, as a result is: any error for a waiting roll ends its wait.
  const unsubscribeError = broadcast.onMessage(DICE_PLUS_ERROR_CHANNEL, (event) => {
    const waiting = waitingFor(event.data);
    const text = dicePlusErrorTextSchema.safeParse(event.data);
    const error = text.success ? text.data.error : null;

    if (waiting === undefined) {
      return;
    }

    if (error === DICE_PLUS_NOT_PERMITTED || error === DICE_PLUS_NO_GM) {
      refuse(error);
    }

    waiting.finish(Result.err({ code: 'failed', reason: refusalReason(error) }));
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

  // A failed send, or one that threw, counts as not sent.
  function send(
    channel: string,
    message: DicePlusReadyProbe | DicePlusRollRequest | DicePlusAccessRequest,
    then: (sent: boolean) => void,
  ): void {
    broadcast.sendMessage(channel, message, LOCAL).then(
      (result) => {
        if (!result.isOk()) {
          report(taggedSendFailure(result.error));
        }

        then(result.isOk());
      },
      (error) => {
        report(new SendFailure({ kind: 'failed', reason: String(error), channel }));
        then(false);
      },
    );
  }

  function permit(): void {
    access = 'permitted';
    permittedAt = performance.now();
  }

  // A roll error that refuses access. The extension took back access it gave before, as when the
  // GM changed the answer or the extension forgot it, so a GM client asks again.
  function refuse(error: string): void {
    const revoked = access === 'permitted' && error === DICE_PLUS_NOT_PERMITTED;

    access = 'refused';

    if (revoked || error === DICE_PLUS_NO_GM) {
      accessAsked = false;
    }

    if (revoked) {
      askAccess();
    }
  }

  function learnFromProbe(permitted: boolean, startedAt: number): void {
    if (permitted) {
      permit();

      return;
    }

    // Access granted after this probe started is newer than its answer.
    if (permittedAt > startedAt) {
      return;
    }

    // The extension no longer has the answer it rolled by, so a GM client asks again.
    if (access === 'permitted') {
      access = 'unknown';
      accessAsked = false;
    }

    askAccess();
  }

  // The GM's client asks once, so the GM answers the extension's prompt before anyone rolls.
  function askAccess(): void {
    if (accessAsked || stopped || !mayAskAccess()) {
      return;
    }

    const requestId = newId();

    accessAsked = true;
    accessRequests.add(requestId);
    // The extension waits `accessWaitMs` for the GM. Past that, and a probe wait for its answer to
    // arrive, the request counts as timed out.
    after(timing.accessWaitMs + timing.probeWaitMs, () => {
      endAccessRequest(requestId, 'timeout');
    });
    send(DICE_PLUS_REQUEST_ACCESS_CHANNEL, { requestId, source: DICE_PLUS_SOURCE }, (sent) => {
      if (!sent) {
        endAccessRequest(requestId, 'timeout');
      }
    });
  }

  function endAccessRequest(
    requestId: string,
    status: Exclude<DicePlusAccessStatus, 'pending'>,
  ): void {
    if (!accessRequests.delete(requestId)) {
      return;
    }

    if (status === 'allowed') {
      permit();
    } else if (status === 'denied') {
      access = 'refused';
    } else if (status === 'no-gm') {
      access = 'refused';
      accessAsked = false;
    } else {
      accessAsked = false;

      if (access === 'pending') {
        access = 'unknown';
      }
    }
  }

  function readiness(): DiceExtensionReadiness {
    return lastReady ? access : 'absent';
  }

  function probe(): Promise<boolean> {
    if (probing !== null) {
      return probing;
    }

    const requestId = newId();
    const startedAt = performance.now();
    let settle: (ready: boolean) => void = ignore;

    const answer = new Promise<boolean>((resolve) => {
      settle = (ready) => {
        if (probing === answer) {
          probing = null;
        }

        resolve(ready);
      };
    });

    // No answer in time, or a failed send, counts as no extension until an answer comes.
    const unanswered = (): void => {
      if (probing === answer) {
        lastReady = false;
        settle(false);
      }
    };

    latestProbe = { id: requestId, startedAt, settle };
    probedAt = startedAt;
    probing = answer;
    after(timing.probeWaitMs, unanswered);

    // The answer can come while the message is sent, so `probing` is set first.
    send(
      DICE_PLUS_READY_CHANNEL,
      { requestId, timestamp: Date.now(), source: DICE_PLUS_SOURCE },
      (sent) => {
        if (!sent) {
          unanswered();
        }
      },
    );

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
  // Its wait starts then. `dicex` holds a roll it may not take yet until the GM answers.
  function sendRoll(message: DicePlusRollRequest): void {
    if (!rolls.has(message.rollId)) {
      return;
    }

    const wait = timing.resultTimeoutMs + (access === 'permitted' ? 0 : timing.accessWaitMs);

    after(wait, () => {
      rolls
        .get(message.rollId)
        ?.finish(Result.err({ code: 'failed', reason: 'no result in time' }), true);
    });
    send(DICE_PLUS_ROLL_REQUEST_CHANNEL, message, (sent) => {
      if (!sent) {
        rolls
          .get(message.rollId)
          ?.finish(Result.err({ code: 'failed', reason: 'the roll request was not sent' }), true);
      }
    });
  }

  return {
    start: () => {
      probeAtStart(timing.startProbeRetries, timing.startProbeRetryMs);
    },
    ready: () => {
      if (stopped) {
        return Promise.resolve('absent');
      }

      const stale = !lastReady || performance.now() - probedAt >= timing.probeMaxAgeMs;
      const answer = probing ?? (stale ? probe() : null);

      return answer === null ? Promise.resolve(readiness()) : answer.then(readiness);
    },
    roll: (request) => {
      if (stopped) {
        return Promise.resolve(Result.err({ code: 'stopped' }));
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

      const before = lastRoll;

      lastRoll = answer.then(() => undefined);
      void before.then(() => {
        sendRoll(message);
      });

      return answer;
    },
    becameGm: () => {
      if (!stopped) {
        void probe();
      }
    },
    stop: () => {
      stopped = true;
      unsubscribeReady();
      unsubscribeResult();
      unsubscribeError();
      unsubscribeAccess();

      for (const timer of timers) {
        clearTimeout(timer);
      }

      timers.clear();
      latestProbe?.settle(false);

      for (const waiting of rolls.values()) {
        waiting.finish(Result.err({ code: 'stopped' }));
      }
    },
  };
}

// Stands in for a probe's `settle` until its promise exists.
function ignore(): void {}

// What a roll error says, in the log of the local roll that replaces it.
function refusalReason(error: string | null): string {
  if (error === DICE_PLUS_NOT_PERMITTED) {
    return 'the GM has not allowed Muster Roll to roll dice in this room';
  }

  if (error === DICE_PLUS_NO_GM) {
    return 'no GM is in the room to allow Muster Roll to roll dice';
  }

  return `the extension refused the roll: ${error ?? 'no reason given'}`;
}
