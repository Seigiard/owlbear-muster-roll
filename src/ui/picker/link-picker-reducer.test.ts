import { describe, expect, test } from 'bun:test';

import type { LinkTarget } from '@/core/link-target';
import type { CommandOutcomePromise } from '@/ui/replica-client';

import {
  canOffer,
  canPick,
  initialPickerState,
  pickerReducer,
  type PickerFacts,
  type PickerState,
} from './link-picker-reducer';

const TARGET: LinkTarget = { sheetId: 'arag', instanceId: null };
const BLOCK: LinkTarget = { sheetId: 'npc', instanceId: 'gob' };

const READY: PickerFacts = {
  loaded: true,
  firstCatchUpDone: true,
  role: 'GM',
  arrived: null,
};

describe('link picker reducer', () => {
  test.each([{ loaded: false }, { firstCatchUpDone: false }, { role: 'PLAYER' as const }])(
    'waits for readiness before reading or picking %j',
    (patch) => {
      // #given
      const state = initialPickerState('t1');

      // #when
      const next = pickerReducer(state, { type: 'facts', facts: { ...READY, ...patch } });

      // #then
      expect({ label: next.label.kind, canPick: canPick(next) }).toEqual({
        label: 'pending',
        canPick: false,
      });
    },
  );

  test.each(['', 'bad:token', 'a b', 'x'.repeat(129)])(
    'does not read an invalid token %j',
    (tokenId) => {
      // #given
      const state = initialPickerState(tokenId);

      // #when
      const next = pickerReducer(state, { type: 'facts', facts: READY });

      // #then
      expect({
        validToken: next.validToken,
        label: next.label.kind,
        canPick: canPick(next),
      }).toEqual({
        validToken: false,
        label: 'pending',
        canPick: false,
      });
    },
  );

  test.each([
    ['', true, true],
    ['  ', true, true],
    ['Goblin 2', false, true],
    [null, false, false],
  ] as const)('sets the offer default for label %j', (text, wanted, offer) => {
    // #given
    const reading = readyState();

    // #when
    const next = pickerReducer(reading, {
      type: 'label-read',
      result: { text },
    });

    // #then
    expect({ wanted: next.wanted, offer: canOffer(next), pick: canPick(next) }).toEqual({
      wanted,
      offer,
      pick: true,
    });
  });

  test('ignores a read result that arrived after a failed read', () => {
    // #given
    const reading = readyState();
    const failed = pickerReducer(reading, { type: 'label-read', result: { failed: true } });

    // #when
    const late = pickerReducer(failed, { type: 'label-read', result: { text: '' } });

    // #then
    expect(late).toEqual(failed);
  });

  test('does not finish for the wrong repeat block arrival', () => {
    // #given
    const picked = pickState(BLOCK, 'Goblin');

    // #when
    const next = pickerReducer(picked, {
      type: 'facts',
      facts: { ...READY, arrived: { sheetId: 'npc', instanceId: 'other' } },
    });

    // #then
    expect(next.attempt?.phase).toBe('waiting');
  });

  test('keeps waiting for the replica after an answered command', () => {
    // #given
    const picked = pickState(TARGET, 'Aragorn');

    // #when
    const next = pickerReducer(picked, { type: 'command', id: 1, outcome: 'answered' });

    // #then
    expect({ phase: next.attempt?.phase, failed: next.failed }).toEqual({
      phase: 'waiting',
      failed: false,
    });
  });

  test('arrival wins over a later refused command answer', () => {
    // #given
    const picked = pickState(TARGET, 'Aragorn');

    const arrived = pickerReducer(picked, {
      type: 'facts',
      facts: { ...READY, arrived: TARGET },
    });

    // #when
    const next = pickerReducer(arrived, { type: 'command', id: 1, outcome: 'refused' });

    // #then
    expect({ phase: next.attempt?.phase, failed: next.failed }).toEqual({
      phase: 'writing',
      failed: false,
    });
  });

  test.each(['refused', 'timed-out', 'failed'] as const)(
    'clears a pick after a %s command outcome',
    (outcome) => {
      // #given
      const picked = pickState(TARGET, 'Aragorn');

      // #when
      const next = pickerReducer(picked, { type: 'command', id: 1, outcome });

      // #then
      expect({ attempt: next.attempt, failed: next.failed, canPick: canPick(next) }).toEqual({
        attempt: null,
        failed: true,
        canPick: true,
      });
    },
  );

  test('moves a failed label write through notification before close', () => {
    // #given
    const writing = arrivedState(TARGET, 'Aragorn');

    // #when
    const notifying = pickerReducer(writing, { type: 'label-written', id: 1, ok: false });
    const closing = pickerReducer(notifying, { type: 'notified', id: 1 });

    // #then
    expect({ failedWrite: notifying.attempt?.phase, afterNotice: closing.attempt?.phase }).toEqual({
      failedWrite: 'notifying',
      afterNotice: 'closing',
    });
  });

  test('ignores a duplicate label completion after closing starts', () => {
    // #given
    const writing = arrivedState(TARGET, 'Aragorn');
    const closing = pickerReducer(writing, { type: 'label-written', id: 1, ok: true });

    // #when
    const duplicate = pickerReducer(closing, { type: 'label-written', id: 1, ok: false });

    // #then
    expect(duplicate).toEqual(closing);
  });

  test('demotion before arrival skips the label write and closes', () => {
    // #given
    const picked = pickState(TARGET, 'Aragorn');

    // #when
    const next = pickerReducer(picked, {
      type: 'facts',
      facts: { ...READY, role: 'PLAYER', arrived: TARGET },
    });

    // #then
    expect({ phase: next.attempt?.phase, label: next.attempt?.label }).toEqual({
      phase: 'closing',
      label: 'Aragorn',
    });
  });

  test('permits a same-target retry after close rejection', () => {
    // #given
    let state = arrivedState(TARGET, '');
    state = pickerReducer(state, { type: 'label-written', id: 1, ok: true });
    state = pickerReducer(state, { type: 'closed', id: 1, ok: false });

    // #when
    const retry = pickerReducer(state, {
      type: 'pick',
      target: TARGET,
      name: 'Aragorn again',
      outcome: commandOutcome(),
    });

    // #then
    expect({ id: retry.attempt?.id, phase: retry.attempt?.phase, closed: retry.closed }).toEqual({
      id: 2,
      phase: 'writing',
      closed: false,
    });
  });

  test('disables picks and offers after a successful close', () => {
    // #given
    let state = arrivedState(TARGET, '');
    state = pickerReducer(state, { type: 'label-written', id: 1, ok: true });

    // #when
    const closed = pickerReducer(state, { type: 'closed', id: 1, ok: true });

    // #then
    expect({ canPick: canPick(closed), canOffer: canOffer(closed) }).toEqual({
      canPick: false,
      canOffer: false,
    });
  });

  test('blocks another pick while close is still pending', () => {
    // #given
    const closing = pickerReducer(arrivedState(TARGET, ''), {
      type: 'label-written',
      id: 1,
      ok: true,
    });

    // #when
    const next = pickerReducer(closing, {
      type: 'pick',
      target: BLOCK,
      name: 'Goblin',
      outcome: commandOutcome(),
    });

    // #then
    expect({ id: next.attempt?.id, target: next.attempt?.target }).toEqual({
      id: 1,
      target: TARGET,
    });
  });

  test('ignores a stale command completion from an earlier same-target attempt', () => {
    // #given
    let state = pickState(TARGET, 'Aragorn');
    state = pickerReducer(state, { type: 'command', id: 1, outcome: 'refused' });
    state = pickerReducer(state, {
      type: 'pick',
      target: TARGET,
      name: 'Aragorn again',
      outcome: commandOutcome(),
    });

    // #when
    const next = pickerReducer(state, { type: 'command', id: 1, outcome: 'timed-out' });

    // #then
    expect({ id: next.attempt?.id, phase: next.attempt?.phase, failed: next.failed }).toEqual({
      id: 2,
      phase: 'waiting',
      failed: false,
    });
  });

  test('ignores a stale label completion from an earlier attempt', () => {
    // #given
    let state = arrivedState(TARGET, 'Aragorn');
    state = pickerReducer(state, { type: 'label-written', id: 1, ok: false });
    state = pickerReducer(state, { type: 'notified', id: 1 });
    state = pickerReducer(state, { type: 'closed', id: 1, ok: false });
    state = pickerReducer(state, {
      type: 'pick',
      target: TARGET,
      name: 'Aragorn again',
      outcome: commandOutcome(),
    });

    // #when
    const next = pickerReducer(state, { type: 'label-written', id: 1, ok: true });

    // #then
    expect({
      id: next.attempt?.id,
      phase: next.attempt?.phase,
      label: next.attempt?.label,
    }).toEqual({
      id: 2,
      phase: 'writing',
      label: 'Aragorn again',
    });
  });
});

function readyState(): PickerState {
  return pickerReducer(initialPickerState('t1'), { type: 'facts', facts: READY });
}

function pickState(target: LinkTarget, name: string): PickerState {
  return pickerReducer(readyStateWithEmptyLabel(), {
    type: 'pick',
    target,
    name,
    outcome: commandOutcome(),
  });
}

function arrivedState(target: LinkTarget, name: string): PickerState {
  return pickerReducer(pickState(target, name), {
    type: 'facts',
    facts: { ...READY, arrived: target },
  });
}

function readyStateWithEmptyLabel(): PickerState {
  return pickerReducer(readyState(), { type: 'label-read', result: { text: '' } });
}

function commandOutcome(): CommandOutcomePromise<undefined> {
  return Promise.resolve({ kind: 'answered', answer: undefined });
}
