import type { Result } from 'better-result';
import { PartyReadFailure } from '@/platform/ports';
import type { CatchUp, CatchUpDecision, CatchUpTimer, PartyMember } from '@/replica/catch-up';
import { MessageRejectedFailure, type ReplicaFailure } from '@/replica/failures';
import type { Schedule } from '@/platform/ports';

export type CatchUpEffectsPorts = {
  readonly signal: AbortSignal;
  readonly schedule: Schedule;
  readonly report: (failure: ReplicaFailure) => void;
  readonly catchUp: Omit<Pick<CatchUp, 'fired' | 'roomCopyRead' | 'partyRead'>, 'partyRead'> & {
    readonly partyRead: (
      r: string,
      players: readonly PartyMember[],
    ) => ReturnType<CatchUp['partyRead']>;
  };
  readonly mergePersisted: () => void;
  readonly publish: () => void;
  readonly readRoomCopy: () => Promise<void>;
  readonly readParty: () => Promise<Result<readonly PartyMember[], PartyReadFailure>>;
  readonly sendStateRequest: (r: string) => void;
  readonly sendStateAnswer: (r: string) => void;
  readonly sendAlive: () => void;
  readonly sendPing: () => void;
  readonly caughtUp: (exit: 'answered' | 'unanswered') => void;
  readonly gmBack: () => void;
  readonly clearStaged: (hadData: boolean, keepNonce: boolean) => void;
};

export type CatchUpEffects = {
  run: (decisions: readonly CatchUpDecision[]) => Promise<void>;
};

function timerKey(timer: CatchUpTimer): string {
  return timer.kind === 'request' || timer.kind === 'answer'
    ? `${timer.kind}:${timer.r}`
    : timer.kind;
}

export function createCatchUpEffects(ports: CatchUpEffectsPorts): CatchUpEffects {
  const timers = new Map<string, () => void>();

  function disarm(timer: CatchUpTimer): void {
    const key = timerKey(timer);
    const cancel = timers.get(key);

    if (cancel === undefined) {
      return;
    }

    timers.delete(key);
    cancel();
  }

  function arm(timer: CatchUpTimer, delayMs: number): void {
    if (ports.signal.aborted) {
      return;
    }

    const key = timerKey(timer);

    disarm(timer);

    const cancel = ports.schedule(ports.signal, delayMs, () => {
      if (ports.signal.aborted || timers.get(key) !== cancel) {
        return;
      }

      timers.delete(key);

      try {
        void run(ports.catchUp.fired(timer)).catch((error) => {
          ports.report(new MessageRejectedFailure({ reason: String(error) }));
        });
      } catch (error) {
        ports.report(new MessageRejectedFailure({ reason: String(error) }));
      }
    });

    timers.set(key, cancel);
  }

  function run(decisions: readonly CatchUpDecision[]): Promise<void> {
    if (ports.signal.aborted) {
      return Promise.resolve();
    }

    const reads: Promise<void>[] = [];

    for (const decision of decisions) {
      if (ports.signal.aborted) {
        break;
      }

      switch (decision.type) {
        case 'arm':
          arm(decision.timer, decision.delayMs);
          break;
        case 'disarm':
          disarm(decision.timer);
          break;
        case 'entered':
          if (decision.trigger !== 'start') {
            ports.mergePersisted();
          }

          ports.publish();
          break;
        case 'read-room-copy':
          reads.push(
            ports
              .readRoomCopy()
              .then(() => {
                if (ports.signal.aborted) {
                  return Promise.resolve();
                }

                // Merge is idempotent, so a copy read while an answer ended catch-up still merges.
                return run(ports.catchUp.roomCopyRead(decision.r, decision.fresh));
              })
              .catch((error) => {
                ports.report(new MessageRejectedFailure({ reason: String(error) }));
              }),
          );
          break;
        case 'read-party':
          reads.push(
            ports
              .readParty()
              .then((result) => {
                if (ports.signal.aborted) {
                  return Promise.resolve();
                }

                if (!result.isOk()) {
                  ports.report(result.error);

                  return;
                }

                return run(ports.catchUp.partyRead(decision.r, result.value));
              })
              .catch((error) => {
                ports.report(new PartyReadFailure({ reason: String(error) }));
              }),
          );
          break;
        case 'request':
          ports.sendStateRequest(decision.r);
          break;
        case 'answer':
          ports.sendStateAnswer(decision.r);
          break;
        case 'alive':
          ports.sendAlive();
          break;
        case 'ping':
          ports.sendPing();
          break;
        case 'caught-up':
          ports.caughtUp(decision.exit);
          break;
        case 'show':
          ports.publish();
          break;
        case 'gm-back':
          // A GM is back, so the edits that waited for one go out now, not after their backoff.
          ports.gmBack();
          break;
        case 'adopt':
          ports.clearStaged(decision.hadData, decision.keepNonce);
          break;
      }
    }

    return Promise.all(reads).then(() => undefined);
  }

  return { run };
}
