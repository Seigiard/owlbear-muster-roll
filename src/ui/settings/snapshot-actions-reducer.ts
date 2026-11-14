import { copy } from '@/ui/copy';
import type { CommandOutcome, CommandOutcomePromise, ErasedCounts } from '@/ui/replica-client';
import { snapshotRejectionText } from '@/ui/settings/snapshot-text';

// AD-9, kept in this window only, so a window that closes, or a GM who leaves Settings, forgets it
// and writes nothing. `checking` waits for the count, `asking` shows the block, `importing` waits
// for the import. `ask` counts the questions, so a new count remounts the block and its focus goes
// to "Отменить" again. `digest` names the values and the sheets the GM was told about, so the
// import drops only those.
export type SnapshotState =
  | { phase: 'idle'; message: string | null; ask: number }
  | { phase: 'checking'; data: string; outcome: Promise<CommandOutcome<ErasedCounts>>; ask: number }
  | { phase: 'asking'; data: string; count: number; sheets: number; digest: string; ask: number }
  | { phase: 'importing'; data: string; outcome: CommandOutcomePromise<undefined>; ask: number };

export type SnapshotAction =
  | { type: 'reset' }
  | { type: 'file-error'; message: string }
  | { type: 'check-requested'; data: string; outcome: Promise<CommandOutcome<ErasedCounts>> }
  | { type: 'cancel' }
  | { type: 'confirm'; outcome: CommandOutcomePromise<undefined> }
  | { type: 'catch-up-started' }
  | {
      type: 'outcome';
      state: SnapshotWaitingState;
      request: SnapshotRequest;
      result: SnapshotOutcome;
    };

type SnapshotWaitingState = Extract<SnapshotState, { phase: 'checking' | 'importing' }>;

type SnapshotRequest = Promise<CommandOutcome<ErasedCounts>> | CommandOutcomePromise<undefined>;

type SnapshotOutcome = CommandOutcome<ErasedCounts | undefined>;

export const initialSnapshotState: SnapshotState = { phase: 'idle', message: null, ask: 0 };

export function snapshotReducer(state: SnapshotState, action: SnapshotAction): SnapshotState {
  switch (action.type) {
    case 'reset':
      return { phase: 'idle', message: null, ask: state.ask };
    case 'file-error':
      return { phase: 'idle', message: action.message, ask: state.ask };
    case 'check-requested':
      return { phase: 'checking', data: action.data, outcome: action.outcome, ask: state.ask };
    case 'cancel':
      return state.phase === 'asking' ? { phase: 'idle', message: null, ask: state.ask } : state;
    case 'confirm':
      return state.phase === 'asking'
        ? { phase: 'importing', data: state.data, outcome: action.outcome, ask: state.ask }
        : state;
    case 'catch-up-started':
      return state.phase === 'asking' ? { phase: 'idle', message: null, ask: state.ask } : state;
    case 'outcome':
      return settleSnapshot(state, action);
    default:
      return assertNever(action);
  }
}

function settleSnapshot(
  state: SnapshotState,
  action: Extract<SnapshotAction, { type: 'outcome' }>,
): SnapshotState {
  // A late answer must settle only the waiting state whose effect observed it; no attempt id is
  // needed when the component passes that state identity through the action.
  if (
    (state.phase !== 'checking' && state.phase !== 'importing') ||
    state !== action.state ||
    state.outcome !== action.request
  ) {
    return state;
  }

  if (action.result.kind === 'timed-out') {
    return {
      phase: 'idle',
      message:
        state.phase === 'importing' ? copy.snapshotImportNoAnswer : copy.snapshotImportFailed,
      ask: state.ask,
    };
  }

  if (action.result.kind === 'refused' && action.result.rejection.reason === 'count-changed') {
    return {
      phase: 'asking',
      data: state.data,
      count: action.result.rejection.count,
      sheets: action.result.rejection.sheets,
      digest: action.result.rejection.digest,
      ask: state.ask + 1,
    };
  }

  if (action.result.kind === 'refused') {
    return {
      phase: 'idle',
      message: snapshotRejectionText(action.result.rejection.reason),
      ask: state.ask,
    };
  }

  if (state.phase === 'checking') {
    if (action.result.answer === undefined) {
      return { phase: 'idle', message: copy.snapshotImportFailed, ask: state.ask };
    }

    return {
      phase: 'asking',
      data: state.data,
      count: action.result.answer.count,
      sheets: action.result.answer.sheets,
      digest: action.result.answer.digest,
      ask: state.ask + 1,
    };
  }

  return { phase: 'idle', message: null, ask: state.ask };
}

function assertNever(value: never): never {
  throw new Error(`Unknown snapshot action: ${JSON.stringify(value)}`);
}
