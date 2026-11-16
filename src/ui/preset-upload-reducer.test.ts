import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { RejectionReason } from '@/core/ui-messages';
import type { CommandOutcome, CommandOutcomePromise, ErasedCounts } from '@/ui/replica-client';
import { initialUploadState, presetUploadReducer, type UploadState } from './preset-upload-reducer';

type IdleState = Extract<
  UploadState,
  {
    phase: 'idle';
  }
>;

type DiffingState = Extract<
  UploadState,
  {
    phase: 'diffing';
  }
>;

type AskingState = Extract<
  UploadState,
  {
    phase: 'asking';
  }
>;

type SendState = Extract<
  UploadState,
  {
    phase: 'send';
  }
>;

type UploadingState = Extract<
  UploadState,
  {
    phase: 'uploading';
  }
>;

type AskingFixture = Partial<Pick<AskingState, 'data' | 'ask'>> & {
  count?: number;
  sheets?: number;
  digest?: string;
};

describe('presetUploadReducer', () => {
  test('starts a new attempt without the previous message and retains the ask count', () => {
    // #given
    const previous = idle({ message: { text: 'previous failure', tone: 'error' }, ask: 3 });
    // #when
    const reset = presetUploadReducer(previous, { type: 'reset' });
    // #then
    expect(reset).toEqual({ phase: 'idle', message: null, ask: 3 });
  });
  test('shows the supplied invalid-file error', () => {
    // #given
    const message = 'Файл не подошёл: это не JSON. Ничего не изменено.';
    // #when
    const failed = presetUploadReducer(initialUploadState, { type: 'file-error', message });
    // #then
    expect(failed).toEqual({ phase: 'idle', message: { text: message, tone: 'error' }, ask: 0 });
  });
  test('holds the selected data and supplied diff request', () => {
    // #given
    const request = diffRequest();
    const state = idle({ ask: 3 });

    // #when
    const requested = presetUploadReducer(state, {
      type: 'diff-requested',
      data: 'encoded-next-preset',
      outcome: request,
    });

    // #then
    expect(requested).toEqual({
      phase: 'diffing',
      data: 'encoded-next-preset',
      outcome: request,
      ask: 3,
    });
  });
  test('asks again when the diff reports values to erase', () => {
    // #given
    const request = diffRequest();
    const state = diffing({ outcome: request, ask: 3 });

    // #when
    const asked = presetUploadReducer(state, {
      type: 'outcome',
      request,
      result: { kind: 'answered', answer: { count: 2, sheets: 0, digest: 'values-digest' } },
    });

    // #then
    expect(asked).toEqual({
      phase: 'asking',
      data: 'encoded-preset',
      loss: { count: 2, sheets: 0, digest: 'values-digest' },
      ask: 4,
    });
  });
  test('asks again when the diff reports sheets to delete', () => {
    // #given
    const request = diffRequest();
    const state = diffing({ outcome: request, ask: 3 });

    // #when
    const asked = presetUploadReducer(state, {
      type: 'outcome',
      request,
      result: { kind: 'answered', answer: { count: 0, sheets: 3, digest: 'sheets-digest' } },
    });

    // #then
    expect(asked).toEqual({
      phase: 'asking',
      data: 'encoded-preset',
      loss: { count: 0, sheets: 3, digest: 'sheets-digest' },
      ask: 4,
    });
  });
  test('hands a zero-loss diff to the local send state', () => {
    // #given
    const request = diffRequest();
    const state = diffing({ outcome: request, ask: 3 });

    // #when
    const ready = presetUploadReducer(state, {
      type: 'outcome',
      request,
      result: { kind: 'answered', answer: { count: 0, sheets: 0, digest: 'no-loss-digest' } },
    });

    // #then
    expect(ready).toEqual({
      phase: 'send',
      data: 'encoded-preset',
      digest: 'no-loss-digest',
      ask: 3,
    });
  });
  test('starts an upload from the local zero-loss send handoff', () => {
    // #given
    const outcome = uploadRequest();
    const state = sending({ ask: 3 });
    // #when
    const started = presetUploadReducer(state, { type: 'send-started', outcome });
    // #then
    expect(started).toEqual({
      phase: 'uploading',
      data: 'encoded-preset',
      outcome,
      ask: 3,
    });
  });
  test('confirms an asking upload with its supplied outcome', () => {
    // #given
    const outcome = uploadRequest();
    const state = asking({ ask: 4 });
    // #when
    const confirmed = presetUploadReducer(state, { type: 'confirm', outcome });
    // #then
    expect(confirmed).toEqual({
      phase: 'uploading',
      data: 'encoded-preset',
      outcome,
      ask: 4,
    });
  });
  test('cancels an asking upload without advancing the ask count', () => {
    // #given
    const state = asking({ ask: 4 });
    // #when
    const cancelled = presetUploadReducer(state, { type: 'cancel' });
    // #then
    expect(cancelled).toEqual({ phase: 'idle', message: null, ask: 4 });
  });
  test('closes an asking upload when catch-up starts', () => {
    // #given
    const state = asking({ ask: 4 });
    // #when
    const cancelled = presetUploadReducer(state, { type: 'catch-up-started' });
    // #then
    expect(cancelled).toEqual({ phase: 'idle', message: null, ask: 4 });
  });
  test('asks again with fresh loss and digest after a changed-count rejection', () => {
    // #given
    const outcome = uploadRequest();
    const state = uploading({ outcome, ask: 4 });

    // #when
    const asked = presetUploadReducer(state, {
      type: 'outcome',
      request: outcome,
      result: countChanged(1, 2, 'fresh-digest'),
    });

    // #then
    expect(asked).toEqual({
      phase: 'asking',
      data: 'encoded-preset',
      loss: { count: 1, sheets: 2, digest: 'fresh-digest' },
      ask: 5,
    });
  });
  test('returns a timed-out diff to the exact idle failure state', () => {
    // #given
    const request = diffRequest();
    const state = diffing({ outcome: request, ask: 3 });

    // #when
    const timedOut = presetUploadReducer(state, {
      type: 'outcome',
      request,
      result: { kind: 'timed-out' },
    });

    // #then
    expect(timedOut).toEqual({
      phase: 'idle',
      message: { text: 'Не удалось сохранить пресет. Попробуйте ещё раз.', tone: 'error' },
      ask: 3,
    });
  });
  test('returns a timed-out upload to the exact idle failure state', () => {
    // #given
    const outcome = uploadRequest();
    const state = uploading({ outcome, ask: 4 });

    // #when
    const timedOut = presetUploadReducer(state, {
      type: 'outcome',
      request: outcome,
      result: { kind: 'timed-out' },
    });

    // #then
    expect(timedOut).toEqual({
      phase: 'idle',
      message: { text: 'Не удалось сохранить пресет. Попробуйте ещё раз.', tone: 'error' },
      ask: 4,
    });
  });
  test('shows a representative refusal message from a diff', () => {
    // #given
    const request = diffRequest();
    const state = diffing({ outcome: request, ask: 3 });

    // #when
    const refused = presetUploadReducer(state, {
      type: 'outcome',
      request,
      result: rejected('write-failed'),
    });

    // #then
    expect(refused).toEqual({
      phase: 'idle',
      message: { text: 'Не удалось сохранить пресет. Попробуйте ещё раз.', tone: 'error' },
      ask: 3,
    });
  });
  test('leaves an upload refusal with no message when catch-up owns the explanation', () => {
    // #given
    const outcome = uploadRequest();
    const state = uploading({ outcome, ask: 4 });

    // #when
    const refused = presetUploadReducer(state, {
      type: 'outcome',
      request: outcome,
      result: rejected('catching-up'),
    });

    // #then
    expect(refused).toEqual({ phase: 'idle', message: null, ask: 4 });
  });
  test('rejects a diff outcome with no answer', () => {
    // #given
    const request = diffRequest();
    const state = diffing({ outcome: request, ask: 3 });

    // #when
    const rejectedOutcome = presetUploadReducer(state, {
      type: 'outcome',
      request,
      result: { kind: 'answered', answer: undefined },
    });

    // #then
    expect(rejectedOutcome).toEqual({
      phase: 'idle',
      message: { text: 'Не удалось сохранить пресет. Попробуйте ещё раз.', tone: 'error' },
      ask: 3,
    });
  });
  test('rejects a malformed diff outcome without a digest', () => {
    // #given
    const request = diffRequest();
    const state = diffing({ outcome: request, ask: 3 });

    // SAFETY: the reducer receives this untrusted runtime payload after the replica boundary.
    const malformed = z
      .unknown()
      .parse({ kind: 'answered', answer: { count: 1, sheets: 0 } }) as CommandOutcome<ErasedCounts>;

    // #when
    const rejectedOutcome = presetUploadReducer(state, {
      type: 'outcome',
      request,
      result: malformed,
    });

    // #then
    expect(rejectedOutcome).toEqual({
      phase: 'idle',
      message: { text: 'Не удалось сохранить пресет. Попробуйте ещё раз.', tone: 'error' },
      ask: 3,
    });
  });
  test('shows the successful upload result message', () => {
    // #given
    const outcome = uploadRequest();
    const state = uploading({ outcome, ask: 4 });

    // #when
    const settled = presetUploadReducer(state, {
      type: 'outcome',
      request: outcome,
      result: { kind: 'answered', answer: { count: 0, sheets: 0 } },
    });

    // #then
    expect(settled).toEqual({
      phase: 'idle',
      message: { text: 'Формат листов изменён.', tone: 'result' },
      ask: 4,
    });
  });
  test('ignores a late diff result after a new attempt replaces its state', () => {
    // #given
    const request = diffRequest();
    const waiting = diffing({ outcome: request, ask: 3 });
    const replacement = presetUploadReducer(waiting, { type: 'reset' });

    // #when
    const settled = presetUploadReducer(replacement, {
      type: 'outcome',
      request,
      result: { kind: 'answered', answer: { count: 2, sheets: 0, digest: 'late-digest' } },
    });

    // #then
    expect(settled).toEqual({ phase: 'idle', message: null, ask: 3 });
  });
});

function idle({
  message = null,
  ask = 3,
}: Partial<Pick<IdleState, 'message' | 'ask'>> = {}): IdleState {
  return { phase: 'idle', message, ask };
}

function diffing({
  data = 'encoded-preset',
  outcome = diffRequest(),
  ask = 3,
}: Partial<Pick<DiffingState, 'data' | 'outcome' | 'ask'>> = {}): DiffingState {
  return { phase: 'diffing', data, outcome, ask };
}

function asking({
  data = 'encoded-preset',
  count = 2,
  sheets = 0,
  digest = 'digest',
  ask = 4,
}: AskingFixture = {}): AskingState {
  return { phase: 'asking', data, loss: { count, sheets, digest }, ask };
}

function sending({
  data = 'encoded-preset',
  digest = 'no-loss-digest',
  ask = 3,
}: Partial<Pick<SendState, 'data' | 'digest' | 'ask'>> = {}): SendState {
  return { phase: 'send', data, digest, ask };
}

function uploading({
  data = 'encoded-preset',
  outcome = uploadRequest(),
  ask = 4,
}: Partial<Pick<UploadingState, 'data' | 'outcome' | 'ask'>> = {}): UploadingState {
  return { phase: 'uploading', data, outcome, ask };
}

function diffRequest(): Promise<CommandOutcome<ErasedCounts>> {
  return Promise.resolve({
    kind: 'answered',
    answer: { count: 0, sheets: 0, digest: 'unused-digest' },
  });
}

function uploadRequest(): CommandOutcomePromise<{
  count: number;
  sheets: number;
}> {
  return Promise.resolve({ kind: 'answered', answer: { count: 0, sheets: 0 } });
}

function rejected(reason: Exclude<RejectionReason, 'count-changed'>): CommandOutcome<undefined> {
  return { kind: 'refused', rejection: { t: 'command-rejected', id: 'preset-1', reason } };
}

function countChanged(count: number, sheets: number, digest: string): CommandOutcome<undefined> {
  return {
    kind: 'refused',
    rejection: {
      t: 'command-rejected',
      id: 'preset-1',
      reason: 'count-changed',
      count,
      sheets,
      digest,
    },
  };
}
