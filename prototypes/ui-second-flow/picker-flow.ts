import { sameLinkTarget, type LinkTarget } from '../../src/core/link-target';
import { tokenIdSchema } from '../../src/core/token-links';

export type PickerFacts = {
  loaded: boolean;
  firstCatchUpDone: boolean;
  role: 'GM' | 'PLAYER';
  arrived: LinkTarget | null;
};

export type Label =
  | { kind: 'pending' | 'reading' | 'unreadable' | 'unlabelable' }
  | { kind: 'read'; text: string };

export type Attempt = {
  id: number;
  target: LinkTarget;
  label: string | null;
  phase: 'waiting' | 'writing' | 'notifying' | 'closing';
};

export type PickerState = {
  validToken: boolean;
  facts: PickerFacts;
  label: Label;
  wanted: boolean;
  attempt: Attempt | null;
  nextAttempt: number;
  failed: boolean;
  closed: boolean;
  disposed: boolean;
};

export type PickerEvent =
  | { type: 'facts'; facts: PickerFacts }
  | { type: 'read'; result: { text: string | null } | { failed: true } }
  | { type: 'offer'; wanted: boolean }
  | { type: 'pick'; target: LinkTarget; name: string }
  | { type: 'command'; id: number; outcome: 'answered' | 'refused' | 'timed-out' | 'failed' }
  | { type: 'write'; id: number; ok: boolean }
  | { type: 'notified'; id: number }
  | { type: 'close'; id: number; ok: boolean }
  | { type: 'dispose' };

export type PickerEffect =
  | { kind: 'read' }
  | { kind: 'link'; id: number; target: LinkTarget }
  | { kind: 'write'; id: number; label: string }
  | { kind: 'notify' | 'close'; id: number };

export type PickerStep = { state: PickerState; effects: readonly PickerEffect[] };

export function transition(state: PickerState, event: PickerEvent): PickerStep {
  if (state.disposed || state.closed) {
    return unchanged(state);
  }

  switch (event.type) {
    case 'dispose':
      return unchanged({ ...state, disposed: true });
    case 'facts': {
      let next = { ...state, facts: event.facts };
      const effects: PickerEffect[] = [];

      if (ready(next) && next.label.kind === 'pending') {
        next = { ...next, label: { kind: 'reading' } };
        effects.push({ kind: 'read' });
      }

      return finishIfArrived(next, effects);
    }

    case 'read': {
      if (state.label.kind !== 'reading') {
        return unchanged(state);
      }

      if ('failed' in event.result) {
        return unchanged({ ...state, label: { kind: 'unreadable' }, wanted: false });
      }

      const text = event.result.text;

      return unchanged({
        ...state,
        label: text === null ? { kind: 'unlabelable' } : { kind: 'read', text },
        wanted: text !== null && text.trim() === '',
      });
    }

    case 'offer':
      return unchanged(canOffer(state) ? { ...state, wanted: event.wanted } : state);
    case 'pick': {
      if (!canPick(state)) {
        return unchanged(state);
      }

      const id = state.nextAttempt;
      const target = { ...event.target };

      return finishIfArrived(
        {
          ...state,
          nextAttempt: id + 1,
          failed: false,
          attempt: {
            id,
            target,
            label: state.wanted && event.name !== '' ? event.name : null,
            phase: 'waiting',
          },
        },
        [{ kind: 'link', id, target }],
      );
    }

    case 'command':
      return unchanged(
        state.attempt?.id === event.id &&
          state.attempt.phase === 'waiting' &&
          event.outcome !== 'answered'
          ? { ...state, attempt: null, failed: true }
          : state,
      );
    case 'write':
      if (state.attempt?.id !== event.id || state.attempt.phase !== 'writing') {
        return unchanged(state);
      }

      return event.ok
        ? close(state, state.attempt)
        : {
            state: { ...state, attempt: { ...state.attempt, phase: 'notifying' } },
            effects: [{ kind: 'notify', id: event.id }],
          };
    case 'notified':
      return state.attempt?.id === event.id && state.attempt.phase === 'notifying'
        ? close(state, state.attempt)
        : unchanged(state);
    case 'close':
      return unchanged(
        state.attempt?.id === event.id && state.attempt.phase === 'closing'
          ? { ...state, attempt: null, closed: event.ok }
          : state,
      );
  }

  return unchanged(state);
}

export function initialState(tokenId: string): PickerState {
  return {
    validToken: tokenIdSchema.safeParse(tokenId).success,
    facts: { loaded: false, firstCatchUpDone: false, role: 'PLAYER', arrived: null },
    label: { kind: 'pending' },
    wanted: false,
    attempt: null,
    nextAttempt: 1,
    failed: false,
    closed: false,
    disposed: false,
  };
}

export function canPick(state: PickerState): boolean {
  return (
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
    !state.disposed &&
    !state.closed &&
    state.validToken &&
    state.facts.loaded &&
    state.facts.firstCatchUpDone &&
    state.facts.role === 'GM'
  );
}

function finishIfArrived(state: PickerState, effects: PickerEffect[]): PickerStep {
  const attempt = state.attempt;

  if (
    attempt === null ||
    attempt.phase !== 'waiting' ||
    state.facts.arrived === null ||
    !sameLinkTarget(state.facts.arrived, attempt.target)
  ) {
    return { state, effects };
  }

  if (attempt.label !== null && state.facts.role === 'GM') {
    return {
      state: { ...state, attempt: { ...attempt, phase: 'writing' } },
      effects: [...effects, { kind: 'write', id: attempt.id, label: attempt.label }],
    };
  }

  const closing = close(state, attempt);

  return { state: closing.state, effects: [...effects, ...closing.effects] };
}

function close(state: PickerState, attempt: Attempt): PickerStep {
  return {
    state: { ...state, attempt: { ...attempt, phase: 'closing' } },
    effects: [{ kind: 'close', id: attempt.id }],
  };
}

function unchanged(state: PickerState): PickerStep {
  return { state, effects: [] };
}
