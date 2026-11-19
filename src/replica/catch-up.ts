import type { AliveMessage, GenerationRelation, StateMessage } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { SyncState } from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';
import { step } from '@/replica/machine';
import {
  catchUpTable,
  initialLiveness,
  initialPhase,
  livenessTable,
  type CatchUpEnv,
  type CatchUpTiming,
  type CatchUpTrigger,
  type Event,
  type LivenessEvent,
  type PartyMember,
  type Phase,
} from '@/replica/catch-up-table';

export { catchUpTable, livenessTable } from '@/replica/catch-up-table';

export type { Effect, Event, LivenessEvent, LivenessPhase, Phase } from '@/replica/catch-up-table';

export type { CatchUpTiming } from '@/replica/catch-up-table';

export type { CatchUpTrigger, PartyMember } from '@/replica/catch-up-table';

export type CatchUpTimer =
  | { readonly kind: 'catch-up' }
  | { readonly kind: 'ping' }
  | { readonly kind: 'gm-silence' }
  | { readonly kind: 'request'; readonly r: string }
  | { readonly kind: 'answer'; readonly r: string };

export type CatchUpDecision =
  | { readonly type: 'arm'; readonly timer: CatchUpTimer; readonly delayMs: number }
  | { readonly type: 'disarm'; readonly timer: CatchUpTimer }
  | { readonly type: 'entered'; readonly trigger: CatchUpTrigger; readonly fresh: boolean }
  | { readonly type: 'read-room-copy'; readonly r: string; readonly fresh: boolean }
  | { readonly type: 'read-party'; readonly r: string }
  | { readonly type: 'request'; readonly r: string }
  | { readonly type: 'answer'; readonly r: string }
  | { readonly type: 'alive' }
  | { readonly type: 'ping' }
  | { readonly type: 'caught-up'; readonly exit: 'answered' | 'unanswered' }
  | { readonly type: 'show'; readonly projectedOnly: boolean }
  | { readonly type: 'gm-back' }
  | {
      readonly type: 'adopt';
      readonly generation: Generation;
      readonly previous: Generation | null;
      readonly keepNonce: boolean;
      readonly hadData: boolean;
    };

export type CatchUpView = Omit<SyncState, 'role'>;

export type CatchUpOptions = {
  readonly timing: CatchUpTiming;
  readonly random: () => number;
  readonly newId: () => string;
  readonly now: () => number;
  readonly role: () => PlayerRole;
  readonly vouches: () => boolean;
  readonly generation: () => Generation;
  readonly digest: () => number;
  readonly commitsUnsent: () => boolean;
  readonly hasData: () => boolean;
  readonly saveAdoption: (generation: Generation, fromCopy: boolean) => boolean;
};

export type CatchUp = {
  enter: (trigger: CatchUpTrigger) => CatchUpDecision[];
  watch: () => CatchUpDecision[];
  roomCopyRead: (r: string, fresh: boolean) => CatchUpDecision[];
  partyRead: (r: string, players: readonly PartyMember[] | null) => CatchUpDecision[];
  generationHeard: (generation: Generation, keepNonce: boolean) => CatchUpDecision[];
  generationRead: (generation: Generation) => CatchUpDecision[];
  adoptionStaged: () => CatchUpDecision[];
  heard: (
    senderRole: PlayerRole | null,
    message: { readonly t: string; readonly r?: string },
  ) => CatchUpDecision[];
  stateRequested: (r: string) => CatchUpDecision[];
  pingReceived: () => CatchUpDecision[];
  aliveReceived: (
    message: AliveMessage,
    sender: string,
    relation: GenerationRelation,
  ) => CatchUpDecision[];
  stateMerged: (
    message: StateMessage,
    sender: string,
    relation: GenerationRelation,
  ) => CatchUpDecision[];
  fired: (timer: CatchUpTimer) => CatchUpDecision[];
  closing: () => CatchUpDecision[];
  partyChanged: (players: readonly PartyMember[]) => void;
  replicaReplaced: () => void;
  view: () => CatchUpView;
  live: () => boolean;
  adopting: () => Generation | null;
  answersOwn: (r: string) => boolean;
};

type EventInput = {
  [K in Event['kind']]: Omit<Extract<Event, { readonly kind: K }>, 'env'>;
}[Event['kind']];

export function createCatchUp(options: CatchUpOptions): CatchUp {
  let phase: Phase = initialPhase();
  let liveness = initialLiveness();

  function feed(input: EventInput): CatchUpDecision[] {
    let randomValue: number | undefined;

    const env: CatchUpEnv = {
      timing: options.timing,
      role: options.role(),
      vouches: options.vouches(),
      generation: options.generation(),
      digest: options.digest(),
      commitsUnsent: options.commitsUnsent(),
      hasData: options.hasData(),
      now: options.now(),
      gmLink: liveness.kind,
      random: () => {
        if (input.kind !== 'heard') {
          return options.random();
        }

        randomValue ??= options.random();

        return randomValue;
      },
      newId: options.newId,
    };

    // SAFETY: input supplies every event field except env, which is added above.
    const event = { ...input, env } as Event;

    const beforePending = isPendingAdoption(phase);

    const result = step(catchUpTable, phase, event);

    phase = result.phase;
    const catchUpDecisions = [...result.effects];

    if (
      isAdoptionSaveTrigger(input.kind) &&
      isPendingAdoption(phase) &&
      (!beforePending || input.kind === 'adoption-staged' || input.kind === 'state-merged')
    ) {
      const pending = phase.pendingAdoption;

      const saved = options.saveAdoption(phase.target, pending.fromCopy);

      const followUp = step(catchUpTable, phase, {
        kind: 'adoption-saved',
        saved,
        env,
      });

      phase = followUp.phase;
      catchUpDecisions.push(...followUp.effects);
    }

    let livenessDecisions: CatchUpDecision[] = [];

    if (isLivenessEvent(event)) {
      const livenessResult = step(livenessTable, liveness, event);

      liveness = livenessResult.phase;
      livenessDecisions = [...livenessResult.effects];
    }

    if (input.kind !== 'heard') {
      return [...catchUpDecisions, ...livenessDecisions];
    }

    const show = livenessDecisions.filter(
      (decision): decision is Extract<CatchUpDecision, { readonly type: 'show' }> =>
        decision.type === 'show',
    );

    const withoutShow = livenessDecisions.filter((decision) => decision.type !== 'show');

    const startsReturn = catchUpDecisions.some(
      (decision) => decision.type === 'entered' && decision.trigger === 'gm-return',
    );

    const asksAgain = catchUpDecisions.some((decision) => decision.type === 'request');

    if (startsReturn) {
      return [...withoutShow, ...catchUpDecisions];
    }

    return asksAgain
      ? [...withoutShow, ...catchUpDecisions, ...show]
      : [...livenessDecisions, ...catchUpDecisions];
  }

  return {
    enter: (trigger) => feed({ kind: 'enter', trigger }),
    watch: () => feed({ kind: 'watch' }),
    roomCopyRead: (r, fresh) => feed({ kind: 'room-copy-read', r, fresh }),
    partyRead: (r, players) => feed({ kind: 'party-read', r, players }),
    generationHeard: (generation, keepNonce) =>
      feed({ kind: 'generation-heard', generation, keepNonce }),
    generationRead: (generation) => feed({ kind: 'generation-read', generation }),
    adoptionStaged: () => feed({ kind: 'adoption-staged' }),
    heard: (senderRole, message) => feed({ kind: 'heard', senderRole, message }),
    stateRequested: (r) => feed({ kind: 'state-requested', r }),
    pingReceived: () => feed({ kind: 'ping' }),
    aliveReceived: (message, sender, relation) =>
      feed({ kind: 'alive', message, sender, relation }),
    stateMerged: (message, sender, relation) =>
      feed({ kind: 'state-merged', message, sender, relation }),
    fired: (timer) => feed({ kind: 'fired', timer }),
    closing: () => feed({ kind: 'closing' }),
    partyChanged: (players) => {
      feed({ kind: 'party-changed', players });
    },
    replicaReplaced: () => {
      feed({ kind: 'replica-replaced' });
    },
    view: () => ({
      state: phase.kind === 'live' ? 'live' : 'catching-up',
      firstCatchUpDone: phase.firstCatchUpDone,
      gmAnswered: phase.gmAnswered,
      gmLink: liveness.kind,
    }),
    live: () => phase.kind === 'live',
    adopting: () => (phase.kind === 'adopting' ? phase.target : null),
    answersOwn: (r) => phase.kind === 'catching-up' && phase.active.nonce === r,
  };
}

function isAdoptionSaveTrigger(kind: Event['kind']): kind is 'adoption-staged' | 'state-merged' {
  return kind === 'adoption-staged' || kind === 'state-merged';
}

function isPendingAdoption(phase: Phase): phase is Extract<Phase, { readonly kind: 'adopting' }> & {
  readonly pendingAdoption: NonNullable<
    Extract<Phase, { readonly kind: 'adopting' }>['pendingAdoption']
  >;
} {
  return phase.kind === 'adopting' && phase.pendingAdoption !== null;
}

function isLivenessEvent(event: Event): event is LivenessEvent {
  return event.kind === 'heard' || event.kind === 'fired' || event.kind === 'watch';
}
