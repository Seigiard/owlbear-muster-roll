import { copy } from '@/copy';
import { presetRejectionMessage } from '@/ui/preset-errors';
import type { CommandOutcome, CommandOutcomePromise, ErasedCounts } from '@/ui/replica-client';

// AD-14, kept in this window only, so a window that closes forgets it and writes nothing. The new
// preset's data stays here while the GM decides; other windows see nothing until the batch commits.
// `diffing` waits for the counts, `asking` shows the block, `send` is the local zero-loss handoff,
// and `uploading` waits for the batch. `ask` counts the questions, so a new count remounts the
// block and its focus goes to "Отменить" again. `loss` names the values and the sheets the GM was
// asked about, so the upload erases only those.
export type UploadState =
  | { phase: 'idle'; message: UploadMessage | null; ask: number }
  | { phase: 'diffing'; data: string; outcome: Promise<CommandOutcome<ErasedCounts>>; ask: number }
  | { phase: 'asking'; data: string; loss: UploadLoss; ask: number }
  | { phase: 'send'; data: string; digest: string; ask: number }
  | {
      phase: 'uploading';
      data: string;
      outcome: CommandOutcomePromise<{ count: number; sheets: number }>;
      ask: number;
    };

export type UploadAction =
  | { type: 'reset' }
  | { type: 'file-error'; message: string }
  | {
      type: 'diff-requested';
      data: string;
      outcome: Promise<CommandOutcome<ErasedCounts>>;
    }
  | { type: 'cancel' }
  | {
      type: 'confirm';
      outcome: CommandOutcomePromise<{ count: number; sheets: number }>;
    }
  | { type: 'catch-up-started' }
  | {
      type: 'send-started';
      outcome: CommandOutcomePromise<{ count: number; sheets: number }>;
    }
  | {
      type: 'outcome';
      request: UploadRequest;
      result: UploadOutcome;
    };

export type UploadLoss = { count: number; sheets: number; digest: string };

export type UploadMessage = { text: string; tone: 'error' | 'result' };

type UploadRequest =
  | Promise<CommandOutcome<ErasedCounts>>
  | CommandOutcomePromise<{ count: number; sheets: number }>;

type UploadOutcome = CommandOutcome<ErasedCounts | { count: number; sheets: number } | undefined>;

export const initialUploadState: UploadState = { phase: 'idle', message: null, ask: 0 };

export function presetUploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'reset':
      return { phase: 'idle', message: null, ask: state.ask };
    case 'file-error':
      return { phase: 'idle', message: errorMessage(action.message), ask: state.ask };
    case 'diff-requested':
      return { phase: 'diffing', data: action.data, outcome: action.outcome, ask: state.ask };
    case 'cancel':
      return state.phase === 'asking' ? { phase: 'idle', message: null, ask: state.ask } : state;
    case 'confirm':
      return state.phase === 'asking'
        ? { phase: 'uploading', data: state.data, outcome: action.outcome, ask: state.ask }
        : state;
    case 'catch-up-started':
      return state.phase === 'asking' ? { phase: 'idle', message: null, ask: state.ask } : state;
    case 'send-started':
      return state.phase === 'send'
        ? { phase: 'uploading', data: state.data, outcome: action.outcome, ask: state.ask }
        : state;
    case 'outcome':
      return settleUpload(state, action);
    default:
      return assertNever(action);
  }
}

function settleUpload(
  state: UploadState,
  action: Extract<UploadAction, { type: 'outcome' }>,
): UploadState {
  if (
    (state.phase !== 'diffing' && state.phase !== 'uploading') ||
    state.outcome !== action.request
  ) {
    return state;
  }

  if (action.result.kind === 'timed-out') {
    return { phase: 'idle', message: errorMessage(copy.presetWriteFailed), ask: state.ask };
  }

  if (action.result.kind === 'refused' && action.result.rejection.reason === 'count-changed') {
    return {
      phase: 'asking',
      data: state.data,
      loss: {
        count: action.result.rejection.count,
        sheets: action.result.rejection.sheets,
        digest: action.result.rejection.digest,
      },
      ask: state.ask + 1,
    };
  }

  if (action.result.kind === 'refused') {
    const text = presetRejectionMessage(action.result.rejection.reason);

    return { phase: 'idle', message: text === null ? null : errorMessage(text), ask: state.ask };
  }

  if (state.phase === 'diffing') {
    const answer = action.result.answer;

    if (answer === undefined || !('digest' in answer)) {
      return { phase: 'idle', message: errorMessage(copy.presetWriteFailed), ask: state.ask };
    }

    return answer.count === 0 && answer.sheets === 0
      ? { phase: 'send', data: state.data, digest: answer.digest, ask: state.ask }
      : {
          phase: 'asking',
          data: state.data,
          loss: {
            count: answer.count,
            sheets: answer.sheets,
            digest: answer.digest,
          },
          ask: state.ask + 1,
        };
  }

  return {
    phase: 'idle',
    message: { text: copy.presetUploadRemovesNothing, tone: 'result' },
    ask: state.ask,
  };
}

function errorMessage(text: string): UploadMessage {
  return { text, tone: 'error' };
}

function assertNever(value: never): never {
  throw new Error(`Unknown upload action: ${JSON.stringify(value)}`);
}
