import { expect, test } from 'bun:test';

import { canOffer, canPick, initialState, transition, type PickerState } from './picker-flow';
import { BLOCK, READY, TARGET } from './test-support';

test.skipIf(process.cwd() !== import.meta.dir)(
  'environment precondition: the isolated runner has no DOM globals',
  () => {
    // #given
    const globals = globalThis;
    // #when
    const present = ['window', 'document', 'HTMLElement'].filter((key) => key in globals);
    // #then
    expect(present).toEqual([]);
  },
);

test.each([{ loaded: false }, { firstCatchUpDone: false }, { role: 'PLAYER' as const }])(
  'read waits for readiness %j',
  (patch) => {
    // #given
    const state = initialState('t1');
    // #when
    const step = transition(state, { type: 'facts', facts: { ...READY, ...patch } });
    // #then
    expect({ effects: step.effects, canPick: canPick(step.state) }).toEqual({
      effects: [],
      canPick: false,
    });
  },
);

test.each(['', 'bad:token', 'a b', 'x'.repeat(129)])('invalid token %j cannot read', (tokenId) => {
  // #given
  const state = initialState(tokenId);
  // #when
  const step = transition(state, { type: 'facts', facts: READY });
  // #then
  expect(step.effects).toEqual([]);
});

test.each([
  ['', true, true],
  ['  ', true, true],
  ['Goblin 2', false, true],
  [null, false, false],
] as const)('label %j sets the offer default and availability', (text, wanted, enabled) => {
  // #given
  const reading = transition(initialState('t1'), { type: 'facts', facts: READY }).state;
  // #when
  const read = transition(reading, { type: 'read', result: { text } }).state;
  // #then
  expect({ wanted: read.wanted, offer: canOffer(read), pick: canPick(read) }).toEqual({
    wanted,
    offer: enabled,
    pick: true,
  });
});

test('wrong repeat block arrival does not finish the chosen block', () => {
  // #given
  const picked = transition(available(), { type: 'pick', target: BLOCK, name: 'Goblin' }).state;

  // #when
  const step = transition(picked, {
    type: 'facts',
    facts: { ...READY, arrived: { block: { sheetId: 'npc', path: ['npc_name', 'other'] } } },
  });

  // #then
  expect(step.effects).toEqual([]);
});

test('answered command alone leaves the picker waiting for the replica', () => {
  // #given
  const picked = transition(available(), { type: 'pick', target: TARGET, name: 'Aragorn' }).state;
  // #when
  const step = transition(picked, { type: 'command', id: 1, outcome: 'answered' });
  // #then
  expect({ effects: step.effects, phase: step.state.attempt?.phase }).toEqual({
    effects: [],
    phase: 'waiting',
  });
});

test('stale command failure cannot clear a second attempt for the same target', () => {
  // #given
  let state = transition(available(), { type: 'pick', target: TARGET, name: 'Aragorn' }).state;
  state = transition(state, { type: 'command', id: 1, outcome: 'refused' }).state;
  state = transition(state, { type: 'pick', target: TARGET, name: 'Aragorn' }).state;
  // #when
  const step = transition(state, { type: 'command', id: 1, outcome: 'timed-out' });
  // #then
  expect({ id: step.state.attempt?.id, failed: step.state.failed, effects: step.effects }).toEqual({
    id: 2,
    failed: false,
    effects: [],
  });
});

test('duplicate write and notification completions cannot repeat a close', () => {
  // #given
  let state = transition(available(), { type: 'pick', target: TARGET, name: 'Aragorn' }).state;
  state = transition(state, { type: 'facts', facts: { ...READY, arrived: TARGET } }).state;
  state = transition(state, { type: 'write', id: 1, ok: false }).state;
  state = transition(state, { type: 'notified', id: 1 }).state;
  // #when
  const write = transition(state, { type: 'write', id: 1, ok: true });
  const notified = transition(write.state, { type: 'notified', id: 1 });
  // #then
  expect([...write.effects, ...notified.effects]).toEqual([]);
});

test('disposed rules reject facts, picks and late read results', () => {
  // #given
  const disposed = transition(initialState('t1'), { type: 'dispose' }).state;
  // #when
  const facts = transition(disposed, { type: 'facts', facts: READY });
  const pick = transition(facts.state, { type: 'pick', target: TARGET, name: 'Aragorn' });
  const read = transition(pick.state, { type: 'read', result: { text: '' } });
  // #then
  expect(read).toEqual({ state: disposed, effects: [] });
});

function available(): PickerState {
  const reading = transition(initialState('t1'), { type: 'facts', facts: READY }).state;

  return transition(reading, { type: 'read', result: { text: '' } }).state;
}
