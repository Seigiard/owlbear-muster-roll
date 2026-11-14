import { describe, expect, test } from 'bun:test';

import type { CommandOutcome, CommandOutcomePromise, ErasedCounts } from '@/ui/replica-client';

import { snapshotReducer, type SnapshotState } from './snapshot-actions-reducer';

type CheckingState = Extract<SnapshotState, { phase: 'checking' }>;

type AskingState = Extract<SnapshotState, { phase: 'asking' }>;

type ImportingState = Extract<SnapshotState, { phase: 'importing' }>;

describe('snapshotReducer', () => {
  test('resets a previous file message while preserving the confirmation count', () => {
    // #given
    const shown = idle({ message: 'Предыдущее сообщение', ask: 4 });

    // #when
    const reset = snapshotReducer(shown, { type: 'reset' });

    // #then
    expect(reset).toEqual({ phase: 'idle', message: null, ask: 4 });
  });

  test('shows a file error while preserving the confirmation count', () => {
    // #given
    const ready = idle({ ask: 4 });

    // #when
    const failed = snapshotReducer(ready, {
      type: 'file-error',
      message: 'Файл не подошёл: это не JSON. Ничего не изменено.',
    });

    // #then
    expect(failed).toEqual({
      phase: 'idle',
      message: 'Файл не подошёл: это не JSON. Ничего не изменено.',
      ask: 4,
    });
  });

  test('waits for the supplied snapshot check request', () => {
    // #given
    const request = checkRequest();
    const ready = idle({ ask: 2 });

    // #when
    const checking = snapshotReducer(ready, {
      type: 'check-requested',
      data: 'encoded-snapshot',
      outcome: request,
    });

    // #then
    expect(checking).toEqual({
      phase: 'checking',
      data: 'encoded-snapshot',
      outcome: request,
      ask: 2,
    });
  });

  test('asks for confirmation even when the check reports no losses', () => {
    // #given
    const checking = checkingState({ ask: 2 });

    // #when
    const asked = snapshotReducer(checking, {
      type: 'outcome',
      state: checking,
      request: checking.outcome,
      result: { kind: 'answered', answer: { count: 0, sheets: 0, digest: 'digest-none' } },
    });

    // #then
    expect(asked).toEqual({
      phase: 'asking',
      data: 'encoded-snapshot',
      count: 0,
      sheets: 0,
      digest: 'digest-none',
      ask: 3,
    });
  });

  test('asks with the exact counts, digest, data, and next confirmation count from the check', () => {
    // #given
    const checking = checkingState({ data: 'snapshot-with-drops', ask: 5 });

    // #when
    const asked = snapshotReducer(checking, {
      type: 'outcome',
      state: checking,
      request: checking.outcome,
      result: { kind: 'answered', answer: { count: 3, sheets: 2, digest: 'digest-3-2' } },
    });

    // #then
    expect(asked).toEqual({
      phase: 'asking',
      data: 'snapshot-with-drops',
      count: 3,
      sheets: 2,
      digest: 'digest-3-2',
      ask: 6,
    });
  });

  test('starts importing with the supplied outcome after confirmation', () => {
    // #given
    const asking = askingState({ ask: 3 });
    const request = importRequest();

    // #when
    const importing = snapshotReducer(asking, { type: 'confirm', outcome: request });

    // #then
    expect(importing).toEqual({
      phase: 'importing',
      data: 'encoded-snapshot',
      outcome: request,
      ask: 3,
    });
  });

  test('cancels confirmation without advancing its count', () => {
    // #given
    const asking = askingState({ ask: 3 });

    // #when
    const cancelled = snapshotReducer(asking, { type: 'cancel' });

    // #then
    expect(cancelled).toEqual({ phase: 'idle', message: null, ask: 3 });
  });

  test('closes confirmation when catch-up starts', () => {
    // #given
    const asking = askingState({ ask: 3 });

    // #when
    const closed = snapshotReducer(asking, { type: 'catch-up-started' });

    // #then
    expect(closed).toEqual({ phase: 'idle', message: null, ask: 3 });
  });

  test('asks again with the changed count and digest', () => {
    // #given
    const importing = importingState({ data: 'snapshot-with-drops', ask: 3 });

    // #when
    const askedAgain = snapshotReducer(importing, {
      type: 'outcome',
      state: importing,
      request: importing.outcome,
      result: {
        kind: 'refused',
        rejection: {
          t: 'command-rejected',
          id: 'snapshot-1',
          reason: 'count-changed',
          count: 4,
          sheets: 1,
          digest: 'digest-4-1',
        },
      },
    });

    // #then
    expect(askedAgain).toEqual({
      phase: 'asking',
      data: 'snapshot-with-drops',
      count: 4,
      sheets: 1,
      digest: 'digest-4-1',
      ask: 4,
    });
  });

  test('reports a timed-out check as a failed snapshot import', () => {
    // #given
    const checking = checkingState({ ask: 3 });

    // #when
    const timedOut = snapshotReducer(checking, {
      type: 'outcome',
      state: checking,
      request: checking.outcome,
      result: { kind: 'timed-out' },
    });

    // #then
    expect(timedOut).toEqual({
      phase: 'idle',
      message: 'Не удалось загрузить снимок. Попробуйте ещё раз.',
      ask: 3,
    });
  });

  test('reports a timed-out import as an answer that may still arrive', () => {
    // #given
    const importing = importingState({ ask: 3 });

    // #when
    const timedOut = snapshotReducer(importing, {
      type: 'outcome',
      state: importing,
      request: importing.outcome,
      result: { kind: 'timed-out' },
    });

    // #then
    expect(timedOut).toEqual({
      phase: 'idle',
      message: 'Ответ не пришёл. Проверьте листы, прежде чем загружать снова.',
      ask: 3,
    });
  });

  test('maps a refused import without GM permission to its snapshot message', () => {
    // #given
    const importing = importingState({ ask: 3 });

    // #when
    const refused = snapshotReducer(importing, {
      type: 'outcome',
      state: importing,
      request: importing.outcome,
      result: {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: 'snapshot-1', reason: 'not-allowed' },
      },
    });

    // #then
    expect(refused).toEqual({
      phase: 'idle',
      message: 'Загружать снимок может только мастер.',
      ask: 3,
    });
  });

  test('reports a check answer without counts as a failed snapshot import', () => {
    // #given
    const checking = checkingState({ ask: 3 });

    // #when
    const missingCounts = snapshotReducer(checking, {
      type: 'outcome',
      state: checking,
      request: checking.outcome,
      result: { kind: 'answered', answer: undefined },
    });

    // #then
    expect(missingCounts).toEqual({
      phase: 'idle',
      message: 'Не удалось загрузить снимок. Попробуйте ещё раз.',
      ask: 3,
    });
  });

  test('closes the flow without a message after a matching import succeeds', () => {
    // #given
    const importing = importingState({ ask: 3 });

    // #when
    const completed = snapshotReducer(importing, {
      type: 'outcome',
      state: importing,
      request: importing.outcome,
      result: { kind: 'answered', answer: undefined },
    });

    // #then
    expect(completed).toEqual({ phase: 'idle', message: null, ask: 3 });
  });

  test('ignores an old check outcome after the flow resets', () => {
    // #given
    const checking = checkingState();
    const reset = snapshotReducer(checking, { type: 'reset' });

    // #when
    const ignored = snapshotReducer(reset, {
      type: 'outcome',
      state: checking,
      request: checking.outcome,
      result: { kind: 'answered', answer: { count: 3, sheets: 2, digest: 'digest-3-2' } },
    });

    // #then
    expect(ignored).toBe(reset);
  });

  test('ignores the first check outcome after a new check starts', () => {
    // #given
    const first = checkingState({ data: 'first-snapshot' });
    const second = checkingState({ data: 'second-snapshot' });

    // #when
    const ignored = snapshotReducer(second, {
      type: 'outcome',
      state: first,
      request: first.outcome,
      result: { kind: 'answered', answer: { count: 3, sheets: 2, digest: 'digest-3-2' } },
    });

    // #then
    expect(ignored).toBe(second);
  });

  test('ignores an outcome after the matching request has already reached confirmation', () => {
    // #given
    const checking = checkingState();
    const asking = askingState();

    // #when
    const ignored = snapshotReducer(asking, {
      type: 'outcome',
      state: checking,
      request: checking.outcome,
      result: { kind: 'timed-out' },
    });

    // #then
    expect(ignored).toBe(asking);
  });
});

function idle({
  message = null,
  ask = 0,
}: Partial<Extract<SnapshotState, { phase: 'idle' }>> = {}): Extract<
  SnapshotState,
  { phase: 'idle' }
> {
  return { phase: 'idle', message, ask };
}

function checkingState({
  data = 'encoded-snapshot',
  outcome = checkRequest(),
  ask = 0,
}: Partial<CheckingState> = {}): CheckingState {
  return { phase: 'checking', data, outcome, ask };
}

function askingState({
  data = 'encoded-snapshot',
  count = 3,
  sheets = 2,
  digest = 'digest-3-2',
  ask = 0,
}: Partial<AskingState> = {}): AskingState {
  return { phase: 'asking', data, count, sheets, digest, ask };
}

function importingState({
  data = 'encoded-snapshot',
  outcome = importRequest(),
  ask = 0,
}: Partial<ImportingState> = {}): ImportingState {
  return { phase: 'importing', data, outcome, ask };
}

function checkRequest(): Promise<CommandOutcome<ErasedCounts>> {
  return Promise.resolve({
    kind: 'answered',
    answer: { count: 0, sheets: 0, digest: 'fixture-digest' },
  });
}

function importRequest(): CommandOutcomePromise<undefined> {
  return Promise.resolve({ kind: 'answered', answer: undefined });
}
