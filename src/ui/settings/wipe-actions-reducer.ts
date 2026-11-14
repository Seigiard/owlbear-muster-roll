import type { RejectionReason } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import type { CommandOutcome, CommandOutcomePromise } from '@/ui/replica-client';

// AD-9, kept in this window only, so a window that closes, or a GM who leaves Settings, forgets it
// and writes nothing. `asking` shows the block, `wiping` waits for the answer. `ask` counts the
// questions, so a new one remounts the block and its focus goes to "Отменить" again.
// `untilCatchUpEnds` marks a message that holds only while catch-up runs, so its end clears it.
export type WipeState =
  | { phase: 'idle'; message: string | null; untilCatchUpEnds?: boolean; ask: number }
  | { phase: 'asking'; ask: number }
  | { phase: 'wiping'; outcome: CommandOutcomePromise<undefined>; ask: number };

export type WipeAction =
  | { type: 'ask'; catchingUp: boolean }
  | { type: 'cancel' }
  | { type: 'confirm'; outcome: CommandOutcomePromise<undefined> }
  | { type: 'catch-up-started' }
  | { type: 'catch-up-ended' }
  | {
      type: 'outcome';
      request: CommandOutcomePromise<undefined>;
      result: CommandOutcome<undefined>;
    };

export const initialWipeState: WipeState = { phase: 'idle', message: null, ask: 0 };

export function wipeReducer(state: WipeState, action: WipeAction): WipeState {
  switch (action.type) {
    case 'ask':
      return action.catchingUp || state.phase === 'wiping'
        ? state
        : { phase: 'asking', ask: state.ask + 1 };
    case 'cancel':
      return state.phase === 'asking' ? { phase: 'idle', message: null, ask: state.ask } : state;
    case 'confirm':
      return state.phase === 'asking'
        ? { phase: 'wiping', outcome: action.outcome, ask: state.ask }
        : state;
    case 'catch-up-started':
      return state.phase === 'asking' ? { phase: 'idle', message: null, ask: state.ask } : state;
    case 'catch-up-ended':
      return state.phase === 'idle' && state.untilCatchUpEnds
        ? { phase: 'idle', message: null, ask: state.ask }
        : state;
    case 'outcome':
      return settleWipe(state, action);
    default:
      return assertNever(action);
  }
}

function settleWipe(state: WipeState, action: Extract<WipeAction, { type: 'outcome' }>): WipeState {
  if (state.phase !== 'wiping' || state.outcome !== action.request) {
    return state;
  }

  if (action.result.kind === 'answered') {
    return { phase: 'idle', message: null, ask: state.ask };
  }

  if (action.result.kind === 'timed-out') {
    return { phase: 'idle', message: copy.wipeFailed, ask: state.ask };
  }

  return {
    phase: 'idle',
    message: wipeRejectionText(action.result.rejection.reason),
    untilCatchUpEnds: action.result.rejection.reason === 'catching-up',
    ask: state.ask,
  };
}

// What the window says under "Очистить всё" for a refused wipe. A reason no case names, such as a
// failed write, is a failed wipe.
export function wipeRejectionText(reason: RejectionReason): string {
  switch (reason) {
    case 'not-allowed':
      return copy.wipeNotAllowed;
    case 'catching-up':
      return copy.loading;
    case 'importing':
      return copy.wipeAfterImport;
    case 'data-replaced':
      return copy.snapshotDataReplaced;
    default:
      return copy.wipeFailed;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown wipe action: ${JSON.stringify(value)}`);
}
