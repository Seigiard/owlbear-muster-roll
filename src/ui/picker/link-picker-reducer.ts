import { sameLinkTarget, type LinkTarget } from '@/core/link-target';
import { tokenIdSchema } from '@/core/token-links';
import type { PlayerRole } from '@/core/visibility';
import type { CommandOutcomePromise } from '@/ui/replica-client';

export type PickerFacts = {
  loaded: boolean;
  firstCatchUpDone: boolean;
  role: PlayerRole;
  arrived: LinkTarget | null;
};

export type PickerLabel =
  | { kind: 'pending' | 'reading' | 'unreadable' | 'unlabelable' }
  | { kind: 'read'; text: string };

type WaitingAttempt = {
  id: number;
  target: LinkTarget;
  label: string | null;
  outcome: CommandOutcomePromise<undefined>;
  phase: 'waiting';
};

type WritingAttempt = Omit<WaitingAttempt, 'label' | 'phase'> & {
  label: string;
  phase: 'writing';
};

type NotifyingAttempt = Omit<WritingAttempt, 'phase'> & { phase: 'notifying' };

type ClosingAttempt = Omit<WaitingAttempt, 'phase'> & { phase: 'closing' };

export type PickerAttempt = WaitingAttempt | WritingAttempt | NotifyingAttempt | ClosingAttempt;

export type PickerState = {
  validToken: boolean;
  facts: PickerFacts;
  label: PickerLabel;
  wanted: boolean;
  attempt: PickerAttempt | null;
  nextAttempt: number;
  failed: boolean;
  closed: boolean;
};

export type PickerAction =
  | { type: 'facts'; facts: PickerFacts }
  | { type: 'label-read'; result: { text: string | null } | { failed: true } }
  | { type: 'offer'; wanted: boolean }
  | {
      type: 'pick';
      target: LinkTarget;
      name: string;
      outcome: CommandOutcomePromise<undefined>;
    }
  | { type: 'command'; id: number; outcome: 'answered' | 'refused' | 'timed-out' | 'failed' }
  | { type: 'label-written'; id: number; ok: boolean }
  | { type: 'notified'; id: number }
  | { type: 'closed'; id: number; ok: boolean };

export function initialPickerState(tokenId: string): PickerState {
  return {
    validToken: tokenIdSchema.safeParse(tokenId).success,
    facts: { loaded: false, firstCatchUpDone: false, role: 'PLAYER', arrived: null },
    label: { kind: 'pending' },
    wanted: false,
    attempt: null,
    nextAttempt: 1,
    failed: false,
    closed: false,
  };
}

export function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  if (state.closed) {
    return state;
  }

  switch (action.type) {
    case 'facts': {
      let next = { ...state, facts: action.facts };

      if (ready(next) && next.label.kind === 'pending') {
        next = { ...next, label: { kind: 'reading' } };
      }

      return finishIfArrived(next);
    }

    case 'label-read':
      if (state.label.kind !== 'reading') {
        return state;
      }

      if ('failed' in action.result) {
        return { ...state, label: { kind: 'unreadable' }, wanted: false };
      }

      return action.result.text === null
        ? { ...state, label: { kind: 'unlabelable' }, wanted: false }
        : {
            ...state,
            label: { kind: 'read', text: action.result.text },
            wanted: action.result.text.trim() === '',
          };

    case 'offer':
      return canOffer(state) ? { ...state, wanted: action.wanted } : state;

    case 'pick': {
      if (!canPick(state)) {
        return state;
      }

      const id = state.nextAttempt;

      const attempt: WaitingAttempt = {
        id,
        target: { ...action.target },
        label: state.wanted && action.name !== '' ? action.name : null,
        outcome: action.outcome,
        phase: 'waiting',
      };

      return finishIfArrived({
        ...state,
        attempt,
        nextAttempt: id + 1,
        failed: false,
      });
    }

    case 'command':
      return state.attempt?.id === action.id &&
        state.attempt.phase === 'waiting' &&
        action.outcome !== 'answered'
        ? { ...state, attempt: null, failed: true }
        : state;

    case 'label-written':
      if (state.attempt?.id !== action.id || state.attempt.phase !== 'writing') {
        return state;
      }

      return action.ok
        ? toClosing(state, state.attempt)
        : {
            ...state,
            attempt: { ...state.attempt, phase: 'notifying' },
          };
    case 'notified':
      return state.attempt?.id === action.id && state.attempt.phase === 'notifying'
        ? toClosing(state, state.attempt)
        : state;
    case 'closed':
      return state.attempt?.id === action.id && state.attempt.phase === 'closing'
        ? { ...state, attempt: null, closed: action.ok }
        : state;
    default:
      return assertNever(action);
  }
}

export function canPick(state: PickerState): boolean {
  return (
    !state.closed &&
    ready(state) &&
    state.label.kind !== 'pending' &&
    state.label.kind !== 'reading' &&
    state.attempt === null
  );
}

export function canOffer(state: PickerState): boolean {
  return canPick(state) && state.label.kind !== 'unlabelable';
}

function ready(state: PickerState): boolean {
  return (
    state.validToken &&
    state.facts.loaded &&
    state.facts.firstCatchUpDone &&
    state.facts.role === 'GM'
  );
}

function finishIfArrived(state: PickerState): PickerState {
  const attempt = state.attempt;

  if (
    attempt === null ||
    attempt.phase !== 'waiting' ||
    state.facts.arrived === null ||
    !sameLinkTarget(state.facts.arrived, attempt.target)
  ) {
    return state;
  }

  if (attempt.label === null || state.facts.role !== 'GM') {
    return toClosing(state, attempt);
  }

  return {
    ...state,
    attempt: { ...attempt, label: attempt.label, phase: 'writing' },
  };
}

function toClosing(
  state: PickerState,
  attempt: Exclude<PickerAttempt, ClosingAttempt>,
): PickerState {
  return { ...state, attempt: { ...attempt, phase: 'closing' } };
}

function assertNever(value: never): never {
  throw new Error(`Unknown picker action: ${JSON.stringify(value)}`);
}
