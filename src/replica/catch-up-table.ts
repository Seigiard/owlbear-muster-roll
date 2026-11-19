import { compareGenerations } from '@/core/merge';
import type { AliveMessage, GenerationRelation, StateMessage } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { GmLink } from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';
import type { CatchUpDecision, CatchUpTimer } from '@/replica/catch-up';
import type { Step, TransitionTable } from '@/replica/machine';

const RECENT_NONCE_LIMIT = 256;
const DRIFT_ALIVE_COUNT = 2;

export type CatchUpTrigger =
  | 'start'
  | 'page-return'
  | 'role'
  | 'generation'
  | 'drift'
  | 'gm-return';

export type CatchUpTiming = {
  readonly catchUpTimeoutMs: number;
  readonly stateAnswerDelayMinMs: number;
  readonly stateAnswerDelayMaxMs: number;
  readonly gmLinkTimeoutMs: number;
  readonly incompleteRequestStartMs: number;
  readonly incompleteRequestMaxMs: number;
};

export type PartyMember = { readonly connectionId: string; readonly role: PlayerRole };

export type CatchUpEnv = {
  readonly timing: CatchUpTiming;
  readonly role: PlayerRole;
  readonly vouches: boolean;
  readonly generation: Generation;
  readonly digest: number;
  readonly commitsUnsent: boolean;
  readonly hasData: boolean;
  readonly now: number;
  readonly gmLink: GmLink;
  readonly random: () => number;
  readonly newId: () => string;
};

type AnswerParts = {
  readonly sender: string;
  readonly n: number;
  readonly parts: readonly number[];
};

type DigestMismatch = {
  readonly sender: string;
  readonly count: number;
  readonly at: number;
};

type SenderDigest = {
  readonly sender: string;
  readonly digest: number;
};

type PendingAdoption = {
  readonly fromCopy: boolean;
  readonly responder: string | null;
};

type Memory = {
  readonly firstCatchUpDone: boolean;
  readonly gmAnswered: boolean;
  readonly lastNonce: string | null;
  readonly answers: readonly AnswerParts[];
  readonly answeredNonces: readonly string[];
  readonly heldRequests: readonly string[];
  readonly lastAliveDigests: readonly SenderDigest[];
  readonly digestMismatches: readonly DigestMismatch[];
  readonly ignoredDigests: readonly SenderDigest[];
  readonly driftStarter: string | null;
  readonly armedAnswers: readonly string[];
};

type ActiveCatchUp = {
  readonly nonce: string;
  readonly trigger: CatchUpTrigger;
  readonly sentNonce: string | null;
  readonly answerSeen: boolean;
};

export type Phase =
  | ({ readonly kind: 'initializing' } & Memory)
  | ({ readonly kind: 'live' } & Memory)
  | ({
      readonly kind: 'catching-up';
      readonly active: ActiveCatchUp;
      readonly mode: { readonly kind: 'ordinary' };
    } & Memory)
  | ({
      readonly kind: 'adopting';
      readonly active: ActiveCatchUp;
      readonly target: Generation;
      readonly retryMs: number;
      readonly pendingAdoption: PendingAdoption | null;
    } & Memory);

export type Event =
  | { readonly kind: 'enter'; readonly trigger: CatchUpTrigger; readonly env: CatchUpEnv }
  | { readonly kind: 'watch'; readonly env: CatchUpEnv }
  | {
      readonly kind: 'room-copy-read';
      readonly r: string;
      readonly fresh: boolean;
      readonly env: CatchUpEnv;
    }
  | {
      readonly kind: 'party-read';
      readonly r: string;
      readonly players: readonly PartyMember[] | null;
      readonly env: CatchUpEnv;
    }
  | {
      readonly kind: 'generation-heard';
      readonly generation: Generation;
      readonly keepNonce: boolean;
      readonly env: CatchUpEnv;
    }
  | {
      readonly kind: 'generation-read';
      readonly generation: Generation;
      readonly env: CatchUpEnv;
    }
  | { readonly kind: 'adoption-staged'; readonly env: CatchUpEnv }
  | {
      readonly kind: 'heard';
      readonly senderRole: PlayerRole | null;
      readonly message: { readonly t: string; readonly r?: string };
      readonly env: CatchUpEnv;
    }
  | { readonly kind: 'state-requested'; readonly r: string; readonly env: CatchUpEnv }
  | { readonly kind: 'ping'; readonly env: CatchUpEnv }
  | {
      readonly kind: 'alive';
      readonly message: AliveMessage;
      readonly sender: string;
      readonly relation: GenerationRelation;
      readonly env: CatchUpEnv;
    }
  | {
      readonly kind: 'state-merged';
      readonly message: StateMessage;
      readonly sender: string;
      readonly relation: GenerationRelation;
      readonly env: CatchUpEnv;
    }
  | { readonly kind: 'fired'; readonly timer: CatchUpTimer; readonly env: CatchUpEnv }
  | { readonly kind: 'closing'; readonly env: CatchUpEnv }
  | {
      readonly kind: 'party-changed';
      readonly players: readonly PartyMember[];
      readonly env: CatchUpEnv;
    }
  | { readonly kind: 'replica-replaced'; readonly env: CatchUpEnv }
  | { readonly kind: 'adoption-saved'; readonly saved: boolean; readonly env: CatchUpEnv };

export type Effect = CatchUpDecision;

export type LivenessPhase = { readonly kind: 'offline' } | { readonly kind: 'online' };

export type LivenessEvent = Extract<Event, { readonly kind: 'heard' | 'fired' | 'watch' }>;

type EventOf<K extends Event['kind']> = Extract<Event, { readonly kind: K }>;

type InitializingPhase = Extract<Phase, { readonly kind: 'initializing' }>;

type CatchingUpPhase = Extract<Phase, { readonly kind: 'catching-up' }>;

type AdoptingPhase = Extract<Phase, { readonly kind: 'adopting' }>;

type LivePhase = Extract<Phase, { readonly kind: 'live' }>;

export function initialPhase(): Phase {
  return { kind: 'initializing', ...emptyMemory() };
}

export function initialLiveness(): LivenessPhase {
  return { kind: 'offline' };
}

const initializingRow = {
  enter: (phase: InitializingPhase, event: EventOf<'enter'>) => catchUpEnter(phase, event),
  watch: 'ignore',
  'room-copy-read': 'ignore',
  'party-read': 'ignore',
  'generation-heard': (phase: InitializingPhase, event: EventOf<'generation-heard'>) =>
    catchUpGenerationHeard(phase, event),
  'generation-read': (phase: InitializingPhase, event: EventOf<'generation-read'>) =>
    catchUpGenerationRead(phase, event),
  'adoption-staged': 'ignore',
  heard: 'ignore',
  'state-requested': (phase: InitializingPhase, event: EventOf<'state-requested'>) =>
    catchUpStateRequested(phase, event),
  ping: 'ignore',
  alive: (phase: InitializingPhase, event: EventOf<'alive'>) => rememberAlive(phase, event),
  'state-merged': (phase: InitializingPhase, event: EventOf<'state-merged'>) =>
    catchUpStateMerged(phase, event),
  fired: (phase: InitializingPhase, event: EventOf<'fired'>) => catchUpFired(phase, event),
  closing: 'ignore',
  'party-changed': (phase: InitializingPhase, event: EventOf<'party-changed'>) =>
    catchUpPartyChanged(phase, event),
  'replica-replaced': (phase: InitializingPhase, event: EventOf<'replica-replaced'>) =>
    catchUpReplicaReplaced(phase, event),
  'adoption-saved': 'ignore',
} satisfies TransitionTable<Phase, Event, Effect>['initializing'];

const catchingUpRow = {
  enter: (phase: CatchingUpPhase, event: EventOf<'enter'>) => catchUpEnter(phase, event),
  watch: 'ignore',
  'room-copy-read': (phase: CatchingUpPhase, event: EventOf<'room-copy-read'>) =>
    catchUpRoomCopyRead(phase, event),
  'party-read': (phase: CatchingUpPhase, event: EventOf<'party-read'>) =>
    catchUpPartyRead(phase, event),
  'generation-heard': (phase: CatchingUpPhase, event: EventOf<'generation-heard'>) =>
    catchUpGenerationHeard(phase, event),
  'generation-read': (phase: CatchingUpPhase, event: EventOf<'generation-read'>) =>
    catchUpGenerationRead(phase, event),
  'adoption-staged': 'ignore',
  heard: (phase: CatchingUpPhase, event: EventOf<'heard'>) => catchUpHeard(phase, event),
  'state-requested': (phase: CatchingUpPhase, event: EventOf<'state-requested'>) =>
    catchUpStateRequested(phase, event),
  ping: 'ignore',
  alive: (phase: CatchingUpPhase, event: EventOf<'alive'>) => rememberAlive(phase, event),
  'state-merged': (phase: CatchingUpPhase, event: EventOf<'state-merged'>) =>
    catchUpStateMerged(phase, event),
  fired: (phase: CatchingUpPhase, event: EventOf<'fired'>) => catchUpFired(phase, event),
  closing: (phase: CatchingUpPhase, event: EventOf<'closing'>) => catchUpClosing(phase, event),
  'party-changed': (phase: CatchingUpPhase, event: EventOf<'party-changed'>) =>
    catchUpPartyChanged(phase, event),
  'replica-replaced': (phase: CatchingUpPhase, event: EventOf<'replica-replaced'>) =>
    catchUpReplicaReplaced(phase, event),
  'adoption-saved': 'ignore',
} satisfies TransitionTable<Phase, Event, Effect>['catching-up'];

const adoptingRow = {
  enter: (phase: AdoptingPhase, event: EventOf<'enter'>) => catchUpEnter(phase, event),
  watch: 'ignore',
  'room-copy-read': (phase: AdoptingPhase, event: EventOf<'room-copy-read'>) =>
    catchUpRoomCopyRead(phase, event),
  'party-read': 'ignore',
  'generation-heard': (phase: AdoptingPhase, event: EventOf<'generation-heard'>) =>
    catchUpGenerationHeard(phase, event),
  'generation-read': (phase: AdoptingPhase, event: EventOf<'generation-read'>) =>
    catchUpGenerationRead(phase, event),
  'adoption-staged': (phase: AdoptingPhase, event: EventOf<'adoption-staged'>) =>
    catchUpAdoptionStaged(phase, event),
  heard: (phase: AdoptingPhase, event: EventOf<'heard'>) => catchUpHeard(phase, event),
  'state-requested': (phase: AdoptingPhase, event: EventOf<'state-requested'>) =>
    catchUpStateRequested(phase, event),
  ping: 'ignore',
  alive: (phase: AdoptingPhase, event: EventOf<'alive'>) => rememberAlive(phase, event),
  'state-merged': (phase: AdoptingPhase, event: EventOf<'state-merged'>) =>
    catchUpStateMerged(phase, event),
  fired: (phase: AdoptingPhase, event: EventOf<'fired'>) => catchUpFired(phase, event),
  closing: 'ignore',
  'party-changed': (phase: AdoptingPhase, event: EventOf<'party-changed'>) =>
    catchUpPartyChanged(phase, event),
  'replica-replaced': (phase: AdoptingPhase, event: EventOf<'replica-replaced'>) =>
    catchUpReplicaReplaced(phase, event),
  'adoption-saved': (phase: AdoptingPhase, event: EventOf<'adoption-saved'>) =>
    catchUpAdoptionSaved(phase, event),
} satisfies TransitionTable<Phase, Event, Effect>['adopting'];

const liveRow = {
  enter: (phase: LivePhase, event: EventOf<'enter'>) => catchUpEnter(phase, event),
  watch: 'ignore',
  'room-copy-read': 'ignore',
  'party-read': 'ignore',
  'generation-heard': (phase: LivePhase, event: EventOf<'generation-heard'>) =>
    catchUpGenerationHeard(phase, event),
  'generation-read': (phase: LivePhase, event: EventOf<'generation-read'>) =>
    catchUpGenerationRead(phase, event),
  'adoption-staged': 'ignore',
  heard: (phase: LivePhase, event: EventOf<'heard'>) => catchUpHeard(phase, event),
  'state-requested': (phase: LivePhase, event: EventOf<'state-requested'>) =>
    catchUpStateRequested(phase, event),
  ping: (phase: LivePhase, event: EventOf<'ping'>) => catchUpPing(phase, event),
  alive: (phase: LivePhase, event: EventOf<'alive'>) => catchUpAlive(phase, event),
  'state-merged': (phase: LivePhase, event: EventOf<'state-merged'>) =>
    catchUpStateMerged(phase, event),
  fired: (phase: LivePhase, event: EventOf<'fired'>) => catchUpFired(phase, event),
  closing: 'ignore',
  'party-changed': (phase: LivePhase, event: EventOf<'party-changed'>) =>
    catchUpPartyChanged(phase, event),
  'replica-replaced': (phase: LivePhase, event: EventOf<'replica-replaced'>) =>
    catchUpReplicaReplaced(phase, event),
  'adoption-saved': 'ignore',
} satisfies TransitionTable<Phase, Event, Effect>['live'];

export const catchUpTable: TransitionTable<Phase, Event, Effect> = {
  initializing: initializingRow,
  'catching-up': catchingUpRow,
  adopting: adoptingRow,
  live: liveRow,
};

export const livenessTable: TransitionTable<LivenessPhase, LivenessEvent, Effect> = {
  offline: {
    heard: livenessHeard,
    fired: livenessFired,
    watch: livenessWatch,
  },
  online: {
    heard: livenessHeard,
    fired: livenessFired,
    watch: livenessWatch,
  },
};

function catchUpEnter(phase: Phase, event: EventOf<'enter'>): Step<Phase, Effect> {
  const keepsNonce = event.trigger === 'page-return' && isCatchingUp(phase);

  if (keepsNonce && isCatchingUp(phase)) {
    return {
      phase,
      effects: [
        { type: 'entered', trigger: event.trigger, fresh: false },
        { type: 'read-room-copy', r: phase.active.nonce, fresh: false },
      ],
    };
  }

  const nonce = event.env.newId();

  const mode = isAdopting(phase)
    ? { kind: 'adopting' as const, target: phase.target, retryMs: phase.retryMs }
    : { kind: 'ordinary' as const };

  const next: Phase = isAdopting(phase)
    ? {
        ...phase,
        kind: 'adopting',
        active: { nonce, trigger: event.trigger, sentNonce: null, answerSeen: false },
        pendingAdoption: null,
        lastNonce: nonce,
        answers: [],
        digestMismatches: [],
        driftStarter: event.trigger === 'drift' ? phase.driftStarter : null,
      }
    : {
        ...phase,
        kind: 'catching-up',
        active: { nonce, trigger: event.trigger, sentNonce: null, answerSeen: false },
        mode: { kind: 'ordinary' },
        lastNonce: nonce,
        answers: [],
        digestMismatches: [],
        driftStarter: event.trigger === 'drift' ? phase.driftStarter : null,
      };

  const delay =
    mode.kind === 'ordinary'
      ? event.env.timing.catchUpTimeoutMs
      : mode.retryMs - (event.env.random() * mode.retryMs) / 4;

  return {
    phase: next,
    effects: [
      { type: 'entered', trigger: event.trigger, fresh: true },
      { type: 'arm', timer: { kind: 'catch-up' }, delayMs: delay },
      { type: 'read-room-copy', r: nonce, fresh: true },
    ],
  };
}

function catchUpRoomCopyRead(
  phase: CatchingUpPhase | AdoptingPhase,
  event: EventOf<'room-copy-read'>,
): Step<Phase, Effect> {
  const effects: Effect[] = [];
  let next: Phase = phase;

  if (event.fresh || !phase.active.answerSeen) {
    const answer = ask(phase, event.r, event.env);
    next = answer.phase;
    effects.push(...answer.effects);
  }

  if (event.env.role === 'GM') {
    effects.push({ type: 'read-party', r: event.r });
  }

  return { phase: next, effects };
}

function catchUpPartyRead(
  phase: CatchingUpPhase,
  event: EventOf<'party-read'>,
): Step<Phase, Effect> {
  if (event.players === null || phase.active.nonce !== event.r || event.env.role !== 'GM') {
    return same(phase);
  }

  return event.players.some((player) => player.role === 'GM')
    ? same(phase)
    : leave(phase, event.env, 'unanswered');
}

function catchUpGenerationHeard(
  phase: Phase,
  event: EventOf<'generation-heard'>,
): Step<Phase, Effect> {
  return enterFromGeneration(phase, event.generation, event.keepNonce, event.env);
}

function catchUpGenerationRead(
  phase: Phase,
  event: EventOf<'generation-read'>,
): Step<Phase, Effect> {
  return enterFromGeneration(phase, event.generation, isCatchingUp(phase), event.env);
}

function catchUpAdoptionStaged(
  phase: AdoptingPhase,
  _event: EventOf<'adoption-staged'>,
): Step<Phase, Effect> {
  return {
    phase: { ...phase, pendingAdoption: { fromCopy: true, responder: null } },
    effects: [],
  };
}

function catchUpHeard(
  phase: CatchingUpPhase | AdoptingPhase | LivePhase,
  event: EventOf<'heard'>,
): Step<Phase, Effect> {
  if (event.senderRole !== 'GM') {
    return same(phase);
  }

  // The shell shares this memoized random value with liveness, preserving the old watch call.
  event.env.random();

  const answersOwn =
    event.message.t === 'state' &&
    event.message.r !== undefined &&
    event.message.r === phase.lastNonce;

  if (event.env.gmLink !== 'offline' || answersOwn) {
    return same(phase);
  }

  if (event.env.role !== 'GM' && phase.kind === 'live') {
    return catchUpEnter(phase, {
      kind: 'enter',
      trigger: 'gm-return',
      env: event.env,
    });
  }

  if (
    isCatchingUp(phase) &&
    phase.active.sentNonce === phase.active.nonce &&
    !phase.active.answerSeen
  ) {
    return request(phase, phase.active.nonce);
  }

  return same(phase);
}

function catchUpStateRequested(
  phase: Phase,
  event: EventOf<'state-requested'>,
): Step<Phase, Effect> {
  const memory = {
    ...phase,
    answeredNonces: removeValue(phase.answeredNonces, event.r),
  };

  if (event.env.role === 'GM' && !canAnswer(phase, event.env)) {
    return { phase: holdRequest(memory, event.r), effects: [] };
  }

  return scheduleAnswer(memory, event.r, event.env);
}

function catchUpPing(phase: LivePhase, event: EventOf<'ping'>): Step<Phase, Effect> {
  return canAnswer(phase, event.env) ? { phase, effects: [{ type: 'alive' }] } : same(phase);
}

function rememberAlive(
  phase: Exclude<Phase, LivePhase>,
  event: EventOf<'alive'>,
): Step<Phase, Effect> {
  if (event.relation !== 'equal') {
    return same(phase);
  }

  return {
    phase: {
      ...phase,
      lastAliveDigests: setDigest(phase.lastAliveDigests, event.sender, event.message.digest),
    },
    effects: [],
  };
}

function catchUpAlive(phase: LivePhase, event: EventOf<'alive'>): Step<Phase, Effect> {
  if (event.relation !== 'equal') {
    return same(phase);
  }

  const withDigest: LivePhase = {
    ...phase,
    lastAliveDigests: setDigest(phase.lastAliveDigests, event.sender, event.message.digest),
  };

  if (event.env.role === 'GM' && event.env.commitsUnsent) {
    return { phase: withDigest, effects: [] };
  }

  const ignored = findDigest(withDigest.ignoredDigests, event.sender);

  if (ignored === event.message.digest) {
    return { phase: withDigest, effects: [] };
  }

  const withoutIgnored = {
    ...withDigest,
    ignoredDigests: removeSender(withDigest.ignoredDigests, event.sender),
  };

  if (event.message.digest === event.env.digest) {
    return {
      phase: {
        ...withoutIgnored,
        digestMismatches: removeSender(withoutIgnored.digestMismatches, event.sender),
      },
      effects: [],
    };
  }

  const counted = findMismatch(withoutIgnored.digestMismatches, event.sender);

  if (counted !== undefined && event.env.now - counted.at < event.env.timing.gmLinkTimeoutMs / 2) {
    return { phase: withoutIgnored, effects: [] };
  }

  const count = (counted?.count ?? 0) + 1;

  if (count < DRIFT_ALIVE_COUNT) {
    return {
      phase: {
        ...withoutIgnored,
        digestMismatches: setMismatch(withoutIgnored.digestMismatches, event.sender, {
          count,
          at: event.env.now,
        }),
      },
      effects: [],
    };
  }

  return catchUpEnter(
    {
      ...withoutIgnored,
      driftStarter: event.sender,
    },
    {
      kind: 'enter',
      trigger: 'drift',
      env: event.env,
    },
  );
}

function catchUpStateMerged(phase: Phase, event: EventOf<'state-merged'>): Step<Phase, Effect> {
  let next = phase;
  const effects: Effect[] = [];

  if (event.relation === 'higher') {
    if (!isAdopting(phase) || compareGenerations(event.message.g, phase.target) !== 0) {
      return same(phase);
    }

    next = markAnswerSeen(phase, event.message.r);
  } else {
    next = {
      ...phase,
      answeredNonces: addBounded(phase.answeredNonces, event.message.r),
      armedAnswers: removeValue(phase.armedAnswers, event.message.r),
    };
    effects.push({ type: 'disarm', timer: { kind: 'answer', r: event.message.r } });
    next = markAnswerSeen(next, event.message.r);
  }

  if (
    event.message.r !== next.lastNonce ||
    (isAdopting(next) && compareGenerations(event.message.g, next.target) !== 0)
  ) {
    return { phase: next, effects };
  }

  const answer = getAnswer(next.answers, event.sender, event.message.n);

  const completed = {
    ...next,
    answers: setAnswer(next.answers, event.sender, {
      sender: event.sender,
      n: event.message.n,
      parts: addBoundedNumber(answer?.parts ?? [], event.message.i),
    }),
  };

  if ((findAnswer(completed.answers, event.sender)?.parts.length ?? 0) !== event.message.n) {
    return { phase: completed, effects };
  }

  if (isAdopting(completed)) {
    return {
      phase: {
        ...completed,
        pendingAdoption: { fromCopy: false, responder: event.sender },
      },
      effects,
    };
  }

  if (completed.kind === 'catching-up') {
    return append(effects, leave(completed, event.env, 'answered', event.sender));
  }

  if (!completed.gmAnswered) {
    return {
      phase: { ...completed, gmAnswered: true },
      effects: [...effects, { type: 'show', projectedOnly: false }],
    };
  }

  return { phase: completed, effects };
}

function catchUpFired(phase: Phase, event: EventOf<'fired'>): Step<Phase, Effect> {
  switch (event.timer.kind) {
    case 'catch-up':
      if (!isCatchingUp(phase)) {
        return same(phase);
      }

      if (isAdopting(phase)) {
        const retryMs = Math.min(phase.retryMs * 2, event.env.timing.incompleteRequestMaxMs);

        return {
          phase: { ...phase, retryMs },
          effects: [
            {
              type: 'arm',
              timer: { kind: 'catch-up' },
              delayMs: retryMs - (event.env.random() * retryMs) / 4,
            },
            { type: 'read-room-copy', r: phase.active.nonce, fresh: true },
          ],
        };
      }

      return leave(phase, event.env, 'unanswered');
    case 'ping':
    case 'gm-silence':
      return same(phase);
    case 'request':
      return isCatchingUp(phase) && phase.active.nonce === event.timer.r
        ? request(phase, event.timer.r)
        : same(phase);
    case 'answer': {
      const withoutArmed = {
        ...phase,
        armedAnswers: removeValue(phase.armedAnswers, event.timer.r),
      };

      if (
        !canAnswer(withoutArmed, event.env) &&
        isCatchingUp(withoutArmed) &&
        !isAdopting(withoutArmed)
      ) {
        return { phase: holdRequest(withoutArmed, event.timer.r), effects: [] };
      }

      return canAnswer(withoutArmed, event.env) &&
        !withoutArmed.answeredNonces.includes(event.timer.r)
        ? {
            phase: {
              ...withoutArmed,
              answeredNonces: addBounded(withoutArmed.answeredNonces, event.timer.r),
            },
            effects: [{ type: 'answer', r: event.timer.r }],
          }
        : { phase: withoutArmed, effects: [] };
    }
  }

  return same(phase);
}

function catchUpClosing(phase: CatchingUpPhase, event: EventOf<'closing'>): Step<Phase, Effect> {
  return leave(phase, event.env, 'unanswered');
}

function catchUpPartyChanged(phase: Phase, event: EventOf<'party-changed'>): Step<Phase, Effect> {
  const present = new Set(event.players.map((player) => player.connectionId));

  return {
    phase: {
      ...phase,
      lastAliveDigests: phase.lastAliveDigests.filter((item) => present.has(item.sender)),
      digestMismatches: phase.digestMismatches.filter((item) => present.has(item.sender)),
      ignoredDigests: phase.ignoredDigests.filter((item) => present.has(item.sender)),
    },
    effects: [],
  };
}

function catchUpReplicaReplaced(
  phase: Phase,
  _event: EventOf<'replica-replaced'>,
): Step<Phase, Effect> {
  return { phase: forgetDigests(phase), effects: [] };
}

function catchUpAdoptionSaved(
  phase: AdoptingPhase,
  event: EventOf<'adoption-saved'>,
): Step<Phase, Effect> {
  if (phase.pendingAdoption === null) {
    return same(phase);
  }

  if (!event.saved) {
    return { phase, effects: [] };
  }

  const ordinary: Extract<Phase, { readonly kind: 'catching-up' }> = {
    ...memoryOnly(forgetDigests(phase)),
    kind: 'catching-up',
    active: phase.active,
    mode: { kind: 'ordinary' },
  };

  const armed: Step<Phase, Effect> = {
    phase: ordinary,
    effects: [
      { type: 'arm', timer: { kind: 'catch-up' }, delayMs: event.env.timing.catchUpTimeoutMs },
    ],
  };

  if (phase.pendingAdoption.fromCopy) {
    return armed;
  }

  return append(
    armed.effects,
    leave(ordinary, event.env, 'answered', phase.pendingAdoption.responder ?? undefined),
  );
}

function livenessHeard(phase: LivenessPhase, event: EventOf<'heard'>): Step<LivenessPhase, Effect> {
  if (event.senderRole !== 'GM') {
    return { phase, effects: [] };
  }

  const effects: Effect[] = [
    { type: 'arm', timer: { kind: 'ping' }, delayMs: pingDelay(event.env) },
    { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: event.env.timing.gmLinkTimeoutMs },
  ];

  if (phase.kind === 'online') {
    return { phase, effects };
  }

  if (event.env.role !== 'GM') {
    effects.push({ type: 'gm-back' });
  }

  effects.push({ type: 'show', projectedOnly: true });

  return { phase: { kind: 'online' }, effects };
}

function livenessFired(phase: LivenessPhase, event: EventOf<'fired'>): Step<LivenessPhase, Effect> {
  switch (event.timer.kind) {
    case 'gm-silence':
      return phase.kind === 'online'
        ? { phase: { kind: 'offline' }, effects: [{ type: 'show', projectedOnly: true }] }
        : { phase, effects: [] };
    case 'ping':
      return {
        phase,
        effects: [
          { type: 'ping' },
          { type: 'arm', timer: { kind: 'ping' }, delayMs: pingDelay(event.env) },
        ],
      };
    default:
      return { phase, effects: [] };
  }
}

function livenessWatch(phase: LivenessPhase, event: EventOf<'watch'>): Step<LivenessPhase, Effect> {
  return {
    phase,
    effects: [
      { type: 'arm', timer: { kind: 'ping' }, delayMs: pingDelay(event.env) },
      { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: event.env.timing.gmLinkTimeoutMs },
    ],
  };
}

function enterFromGeneration(
  phase: Phase,
  generation: Generation,
  keepNonce: boolean,
  env: CatchUpEnv,
): Step<Phase, Effect> {
  const currentAdoption = isAdopting(phase) ? phase : null;

  if (compareGenerations(generation, currentAdoption?.target ?? env.generation) <= 0) {
    return same(phase);
  }

  const previous = currentAdoption?.target ?? null;
  const hadData = env.hasData || currentAdoption !== null;
  const cleared = forgetDigests({ ...phase, answers: [] });

  if (keepNonce && isCatchingUp(phase)) {
    return {
      phase: {
        ...cleared,
        kind: 'adopting',
        active: { ...phase.active, trigger: 'generation' },
        target: generation,
        retryMs: env.timing.incompleteRequestStartMs,
        pendingAdoption: null,
      },
      effects: [{ type: 'adopt', generation, previous, keepNonce: true, hadData }],
    };
  }

  const entered = catchUpEnter(
    {
      ...cleared,
      kind: 'adopting',
      active: isCatchingUp(phase)
        ? phase.active
        : { nonce: '', trigger: 'generation', sentNonce: null, answerSeen: false },
      target: generation,
      retryMs: env.timing.incompleteRequestStartMs,
      pendingAdoption: null,
    },
    { kind: 'enter', trigger: 'generation', env },
  );

  return {
    // SAFETY: catchUpEnter receives an adopting phase and therefore preserves that phase shape.
    phase: {
      ...entered.phase,
      kind: 'adopting',
      target: generation,
      retryMs: env.timing.incompleteRequestStartMs,
      pendingAdoption: null,
    } as Phase,
    effects: [
      { type: 'adopt', generation, previous, keepNonce: false, hadData },
      ...entered.effects,
    ],
  };
}

function leave(
  phase: Phase,
  env: CatchUpEnv,
  exit: 'answered' | 'unanswered',
  responder?: string,
): Step<Phase, Effect> {
  if (phase.kind !== 'catching-up') {
    return same(phase);
  }

  let memory = phase;
  let ignoredDigests = memory.ignoredDigests;

  if (exit === 'answered') {
    const senders = [responder, phase.driftStarter];

    for (const sender of senders) {
      if (sender === undefined || sender === null) {
        continue;
      }

      const digest = findDigest(phase.lastAliveDigests, sender);

      if (digest !== undefined) {
        ignoredDigests = setDigest(ignoredDigests, sender, digest);
      }
    }
  }

  memory = {
    ...memory,
    ignoredDigests,
    driftStarter: null,
    firstCatchUpDone: true,
    gmAnswered: memory.gmAnswered || exit === 'answered',
  };

  const live: Extract<Phase, { readonly kind: 'live' }> = {
    ...memoryOnly(memory),
    kind: 'live',
  };

  const effects: Effect[] = [
    { type: 'disarm', timer: { kind: 'catch-up' } },
    { type: 'caught-up', exit },
  ];

  const held = memory.heldRequests;
  let afterHeld: Phase = { ...live, heldRequests: [] };

  for (const r of held) {
    if (!afterHeld.answeredNonces.includes(r)) {
      const answer = scheduleAnswer(afterHeld, r, env);
      afterHeld = answer.phase;
      effects.push(...answer.effects);
    }
  }

  return { phase: afterHeld, effects };
}

function ask(phase: Phase, r: string, env: CatchUpEnv): Step<Phase, Effect> {
  if (!isCatchingUp(phase) || phase.active.trigger !== 'gm-return') {
    return request(phase, r);
  }

  return {
    phase,
    effects: [
      {
        type: 'arm',
        timer: { kind: 'request', r },
        delayMs: env.random() * env.timing.stateAnswerDelayMaxMs,
      },
    ],
  };
}

function request(phase: Phase, r: string): Step<Phase, Effect> {
  if (!isCatchingUp(phase) || phase.active.nonce !== r) {
    return same(phase);
  }

  return {
    phase: { ...phase, active: { ...phase.active, sentNonce: r } },
    effects: [{ type: 'request', r }],
  };
}

function canAnswer(phase: Phase, env: CatchUpEnv): boolean {
  if (env.role !== 'GM' || !env.vouches) {
    return false;
  }

  return (
    phase.kind === 'live' || (phase.kind === 'catching-up' && phase.active.trigger === 'drift')
  );
}

function scheduleAnswer(phase: Phase, r: string, env: CatchUpEnv): Step<Phase, Effect> {
  if (!canAnswer(phase, env) || phase.armedAnswers.includes(r)) {
    return same(phase);
  }

  return {
    phase: { ...phase, armedAnswers: addBounded(phase.armedAnswers, r) },
    effects: [
      {
        type: 'arm',
        timer: { kind: 'answer', r },
        delayMs:
          env.timing.stateAnswerDelayMinMs +
          env.random() *
            Math.max(0, env.timing.stateAnswerDelayMaxMs - env.timing.stateAnswerDelayMinMs),
      },
    ],
  };
}

function holdRequest(phase: Phase, r: string): Phase {
  return {
    ...phase,
    heldRequests: [...phase.heldRequests.filter((held) => held !== r), r].slice(
      -RECENT_NONCE_LIMIT,
    ),
  };
}

function markAnswerSeen(phase: Phase, r: string): Phase {
  return isCatchingUp(phase) && phase.active.nonce === r
    ? { ...phase, active: { ...phase.active, answerSeen: true } }
    : phase;
}

function pingDelay(env: CatchUpEnv): number {
  return env.timing.gmLinkTimeoutMs / 2 + (env.random() * env.timing.gmLinkTimeoutMs) / 4;
}

function same(phase: Phase): Step<Phase, Effect> {
  return { phase, effects: [] };
}

function append(first: readonly Effect[], second: Step<Phase, Effect>): Step<Phase, Effect> {
  return { phase: second.phase, effects: [...first, ...second.effects] };
}

function isCatchingUp(
  phase: Phase,
): phase is Extract<Phase, { readonly kind: 'catching-up' | 'adopting' }> {
  return phase.kind === 'catching-up' || phase.kind === 'adopting';
}

function isAdopting(phase: Phase): phase is Extract<Phase, { readonly kind: 'adopting' }> {
  return phase.kind === 'adopting';
}

function emptyMemory(): Memory {
  return {
    firstCatchUpDone: false,
    gmAnswered: false,
    lastNonce: null,
    answers: [],
    answeredNonces: [],
    heldRequests: [],
    lastAliveDigests: [],
    digestMismatches: [],
    ignoredDigests: [],
    driftStarter: null,
    armedAnswers: [],
  };
}

function memoryOnly(phase: Phase): Memory {
  return {
    firstCatchUpDone: phase.firstCatchUpDone,
    gmAnswered: phase.gmAnswered,
    lastNonce: phase.lastNonce,
    answers: phase.answers,
    answeredNonces: phase.answeredNonces,
    heldRequests: phase.heldRequests,
    lastAliveDigests: phase.lastAliveDigests,
    digestMismatches: phase.digestMismatches,
    ignoredDigests: phase.ignoredDigests,
    driftStarter: phase.driftStarter,
    armedAnswers: phase.armedAnswers,
  };
}

function forgetDigests<T extends Phase>(phase: T): T {
  return {
    ...phase,
    lastAliveDigests: [],
    digestMismatches: [],
    ignoredDigests: [],
    driftStarter: null,
  };
}

function addBounded(values: readonly string[], value: string): readonly string[] {
  return [...values.filter((item) => item !== value), value].slice(-RECENT_NONCE_LIMIT);
}

function addBoundedNumber(values: readonly number[], value: number): readonly number[] {
  return [...values.filter((item) => item !== value), value];
}

function removeValue(values: readonly string[], value: string): readonly string[] {
  return values.filter((item) => item !== value);
}

function setDigest(
  values: readonly SenderDigest[],
  sender: string,
  digest: number,
): readonly SenderDigest[] {
  return [...values.filter((item) => item.sender !== sender), { sender, digest }];
}

function findDigest(values: readonly SenderDigest[], sender: string): number | undefined {
  return values.find((item) => item.sender === sender)?.digest;
}

function removeSender<T extends { readonly sender: string }>(
  values: readonly T[],
  sender: string,
): readonly T[] {
  return values.filter((item) => item.sender !== sender);
}

function setMismatch(
  values: readonly DigestMismatch[],
  sender: string,
  mismatch: Omit<DigestMismatch, 'sender'>,
): readonly DigestMismatch[] {
  return [...values.filter((item) => item.sender !== sender), { sender, ...mismatch }];
}

function findMismatch(
  values: readonly DigestMismatch[],
  sender: string,
): DigestMismatch | undefined {
  return values.find((item) => item.sender === sender);
}

function getAnswer(
  values: readonly AnswerParts[],
  sender: string,
  n: number,
): AnswerParts | undefined {
  const answer = values.find((item) => item.sender === sender);

  return answer?.n === n ? answer : undefined;
}

function findAnswer(values: readonly AnswerParts[], sender: string): AnswerParts | undefined {
  return values.find((item) => item.sender === sender);
}

function setAnswer(
  values: readonly AnswerParts[],
  sender: string,
  answer: AnswerParts,
): readonly AnswerParts[] {
  return [...values.filter((item) => item.sender !== sender), answer];
}
