import { expect, test } from 'bun:test';
import { copy } from '@/copy';
import type { DieFace } from '@/core/formula-evaluate';
import { assembleRecords } from '@/core/merge';
import { encodePreset, type Preset } from '@/core/preset';
import { Result } from 'better-result';
import type { Generation } from '@/core/storage-key';
import type { RollMessage } from '@/core/room-messages';
import type { RollOutcome, RollRequestMessage } from '@/core/ui-messages';
import { createRollFlow, type RollDiceFailure, type RollFlowPorts } from './roll-flow';

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'hero',

      title: 'Heroes',
      repeat: { nameField: 'name' },
      tabs: [
        {
          title: 'Main',
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Strike' },
                    { kind: 'field', type: 'number', id: 'bonus' },
                    { kind: 'dice', formula: '1d20 + bonus' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                {
                  cells: [
                    { kind: 'text', text: 'Divide' },
                    { kind: 'dice', formula: '1 / (bonus - bonus)' },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: 'GM',
          visibility: 'gm',
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'text', text: 'Secret strike' },
                    { kind: 'field', type: 'number', id: 'bonus' },
                    { kind: 'dice', formula: '1d20 + bonus' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const RECORDS = assembleRecords([
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'blk:ada', d: { set: 'hero', order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
  {
    k: 'blk:ada',
    d: { order: 0, cells: { bonus: [2, 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  },
  {
    k: 'blk:ada',
    d: { order: 0, cells: { name: ['Ada', 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  },
]);

const REQUEST: RollRequestMessage = {
  t: 'roll-request',
  id: 'request-1',
  sheetId: 'ada',
  place: { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: null },
  shown: {},
};

const HIDDEN_REQUEST: RollRequestMessage = {
  ...REQUEST,
  id: 'request-hidden',
  place: { ...REQUEST.place, tabIndex: 1 },
};

const DIVIDE_REQUEST: RollRequestMessage = {
  ...REQUEST,
  id: 'request-divide',
  place: { ...REQUEST.place, rowIndex: 2, cellIndex: 1 },
};

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
};

type FlowHarness = {
  outcomes: RollOutcome[];
  sent: RollMessage[];
  ports: RollFlowPorts;
};

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;

  const promise = new Promise<Value>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

function createHarness(overrides: Partial<RollFlowPorts> = {}): FlowHarness {
  const outcomes: RollOutcome[] = [];
  const sent: RollMessage[] = [];

  const ports: RollFlowPorts = {
    pendingView: () => RECORDS,
    presetOf: (record) => (record?.k === 'preset' ? PRESET : null),
    role: () => 'GM',
    signal: new AbortController().signal,
    generation: () => ({ n: 0, a: '' }),
    dice: {
      ready: async () => 'permitted',
      roll: async () => Result.ok([{ sides: 20, face: 17 }]),
    },
    gmInParty: () => true,
    playerId: 'player-1',
    playerName: async () => 'Ada Player',
    random: () => 0.3,
    newId: () => 'roll-1',
    sendRemote: async (message) => {
      sent.push(message);

      return true;
    },
    replyOutcome: (_requestId, outcome) => {
      outcomes.push(outcome);
    },
    notify: () => undefined,
    ...overrides,
  };

  return { outcomes, sent, ports };
}

function drain(count = 10): Promise<void> {
  return count === 0 ? Promise.resolve() : Promise.resolve().then(() => drain(count - 1));
}

test('replies waiting-access before a permitted dice roll finishes', async () => {
  // #given
  const diceResult = deferred<Result<DieFace[], RollDiceFailure>>();

  const harness = createHarness({
    dice: {
      ready: async () => 'pending',
      roll: () => diceResult.promise,
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(REQUEST);
  await drain();
  diceResult.resolve(Result.ok([{ sides: 20, face: 17 }]));
  await drain();
  // #then
  expect(harness.outcomes).toEqual([{ code: 'waiting-access' }, { code: 'rolled' }]);
});

test('refuses a hidden request from a player before it asks the dice port', () => {
  // #given
  let readinessCalls = 0;

  const harness = createHarness({
    role: () => 'PLAYER',
    dice: {
      ready: async () => {
        readinessCalls += 1;

        return 'permitted';
      },
      roll: async () => Result.ok([{ sides: 20, face: 17 }]),
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(HIDDEN_REQUEST);
  // #then
  expect({ outcomes: harness.outcomes, readinessCalls, sent: harness.sent }).toEqual({
    outcomes: [{ code: 'refused' }],
    readinessCalls: 0,
    sent: [],
  });
});

test('reports the field label when the pending value cannot be evaluated', () => {
  // #given
  const harness = createHarness();
  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest({
    ...REQUEST,
    id: 'request-invalid-field',
    shown: { bonus: { kind: 'error' } },
  });
  // #then
  expect(harness.outcomes).toEqual([{ code: 'field', field: 'Strike' }]);
});

test('refuses a roll request whose address is not a dice cell', async () => {
  // #given
  const harness = createHarness();
  const flow = createRollFlow(harness.ports);

  // #when
  const result = Promise.resolve().then(() => {
    flow.handleRollRequest({
      ...REQUEST,
      id: 'request-not-dice',
      place: { ...REQUEST.place, cellIndex: 1 },
    });

    return { outcomes: harness.outcomes, sent: harness.sent };
  });

  const [settled] = await Promise.allSettled([result]);
  // #then
  expect(settled).toEqual({
    status: 'fulfilled',
    value: {
      outcomes: [{ code: 'refused' }],
      sent: [],
    },
  });
});

test('reports arithmetic when a prepared roll divides by zero', () => {
  // #given
  const harness = createHarness();
  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(DIVIDE_REQUEST);
  // #then
  expect(harness.outcomes).toEqual([{ code: 'arithmetic' }]);
});

test('falls back to the local result when no dice extension is available', async () => {
  // #given
  let diceRolls = 0;

  const harness = createHarness({
    dice: {
      ready: async () => 'absent',
      roll: async () => {
        diceRolls += 1;

        return Result.ok([{ sides: 20, face: 17 }]);
      },
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(REQUEST);
  await drain();
  // #then
  expect({
    outcomes: harness.outcomes,
    diceRolls,
    sent: harness.sent.map((message) => ({ g: message.g, result: message.result })),
  }).toEqual({
    outcomes: [{ code: 'rolled' }],
    diceRolls: 0,
    sent: [
      {
        g: { n: 0, a: '' },
        result: { roll: 9, faces: [7], target: null, targetFaces: [], outcome: null },
      },
    ],
  });
});

test('reports failed when the player name port rejects', async () => {
  // #given
  const harness = createHarness({
    playerName: async () => Promise.reject(new Error('name unavailable')),
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(REQUEST);
  await drain();
  // #then
  expect({ outcomes: harness.outcomes, sent: harness.sent }).toEqual({
    outcomes: [{ code: 'failed' }],
    sent: [],
  });
});

test('reports failed when the remote roll send fails', async () => {
  // #given
  let sends = 0;

  const harness = createHarness({
    sendRemote: async () => {
      sends += 1;

      return false;
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(REQUEST);
  await drain();
  // #then
  expect({ outcomes: harness.outcomes, sends, sent: harness.sent }).toEqual({
    outcomes: [{ code: 'failed' }],
    sends: 1,
    sent: [],
  });
});

test('does not ask readiness when its signal is already aborted', async () => {
  // #given
  let readinessCalls = 0;
  const controller = new AbortController();
  controller.abort();

  const harness = createHarness({
    signal: controller.signal,
    dice: {
      ready: async () => {
        readinessCalls += 1;

        return 'permitted';
      },
      roll: async () => Result.ok([{ sides: 20, face: 17 }]),
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest({ ...REQUEST, id: 'stopped-before-ready' });
  await drain();
  // #then
  expect({ readinessCalls, outcomes: harness.outcomes, sent: harness.sent }).toEqual({
    readinessCalls: 0,
    outcomes: [],
    sent: [],
  });
});

test('does not ask the dice port when its signal aborts after readiness', async () => {
  // #given
  const stoppedController = new AbortController();
  let stoppedDiceRolls = 0;
  let permittedDiceRolls = 0;

  const stoppedHarness = createHarness({
    signal: stoppedController.signal,
    dice: {
      ready: async () => {
        stoppedController.abort();

        return 'permitted';
      },
      roll: async () => {
        stoppedDiceRolls += 1;

        return Result.ok([{ sides: 20, face: 17 }]);
      },
    },
  });

  const permittedHarness = createHarness({
    dice: {
      ready: async () => 'permitted',
      roll: async () => {
        permittedDiceRolls += 1;

        return Result.ok([{ sides: 20, face: 17 }]);
      },
    },
  });

  // #when
  createRollFlow(stoppedHarness.ports).handleRollRequest({ ...REQUEST, id: 'stopped-after-ready' });
  createRollFlow(permittedHarness.ports).handleRollRequest({
    ...REQUEST,
    id: 'permitted-dice-roll',
  });
  await drain();
  // #then
  expect({ stoppedDiceRolls, permittedDiceRolls }).toEqual({
    stoppedDiceRolls: 0,
    permittedDiceRolls: 1,
  });
});

test('does not report a malformed dice result after its signal aborts during the dice wait', async () => {
  // #given
  const controller = new AbortController();
  const diceResult = deferred<Result<DieFace[], RollDiceFailure>>();

  const harness = createHarness({
    signal: controller.signal,
    dice: {
      ready: async () => 'permitted',
      roll: () => diceResult.promise,
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest({ ...REQUEST, id: 'stopped-during-dice' });
  await drain();
  controller.abort();
  diceResult.resolve(Result.ok([{ sides: 6, face: 1 }]));
  await drain();
  // #then
  expect(harness.outcomes).toEqual([]);
});

test('uses the live role after readiness and again before it sends', async () => {
  // #given
  let readinessRoleCalls = 0;
  let preSendRoleCalls = 0;

  const roleAfterReadiness = createHarness({
    role: () => {
      readinessRoleCalls += 1;

      return readinessRoleCalls === 1 ? 'GM' : 'PLAYER';
    },
  });

  const roleBeforeSend = createHarness({
    role: () => {
      preSendRoleCalls += 1;

      return preSendRoleCalls < 3 ? 'GM' : 'PLAYER';
    },
  });

  // #when
  createRollFlow(roleAfterReadiness.ports).handleRollRequest({
    ...HIDDEN_REQUEST,
    id: 'role-after-readiness',
  });
  createRollFlow(roleBeforeSend.ports).handleRollRequest({
    ...HIDDEN_REQUEST,
    id: 'role-before-send',
  });
  await drain();
  // #then
  expect({
    roleAfterReadiness: {
      calls: readinessRoleCalls,
      outcomes: roleAfterReadiness.outcomes,
      sent: roleAfterReadiness.sent,
    },
    roleBeforeSend: {
      calls: preSendRoleCalls,
      outcomes: roleBeforeSend.outcomes,
      sent: roleBeforeSend.sent,
    },
  }).toEqual({
    roleAfterReadiness: { calls: 3, outcomes: [{ code: 'refused' }], sent: [] },
    roleBeforeSend: { calls: 3, outcomes: [{ code: 'refused' }], sent: [] },
  });
});

test('uses the current generation and aborts after a reported send', async () => {
  // #given
  const controller = new AbortController();
  let generation: Generation = { n: 0, a: '' };
  let notifications = 0;

  const harness = createHarness({
    generation: () => generation,
    playerName: async () => {
      generation = { n: 7, a: 'current' };

      return 'Ada Player';
    },
    sendRemote: async (message) => {
      harness.sent.push(message);
      controller.abort();

      return true;
    },
    signal: controller.signal,
    notify: () => {
      notifications += 1;
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(REQUEST);
  await drain();
  // #then
  expect({
    generation: harness.sent.map((message) => message.g),
    outcomes: harness.outcomes,
    notifications,
  }).toEqual({ generation: [{ n: 7, a: 'current' }], outcomes: [], notifications: 0 });
});

test('shows a received roll under the sender name from the party', async () => {
  // #given
  const notifications: string[] = [];

  const harness = createHarness({
    notify: (text) => {
      notifications.push(text);
    },
    rollCopy: copy,
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.receiveRoll(
    {
      v: 4,
      g: { n: 0, a: '' },
      t: 'roll',
      id: 'remote-roll',
      sheetId: 'ada',
      hidden: false,
      roller: 'Untrusted',
      sheetName: 'Ada',
      cell: 'Strike',
      result: { roll: 9, faces: [7], target: null, targetFaces: [], outcome: null },
    },
    { role: 'GM', name: 'Party member' },
  );
  await drain();
  // #then
  expect(notifications).toEqual(['Party member: Ada, Strike — 9']);
});

test('a repeated roll request id rolls and answers once', async () => {
  // #given
  const harness = createHarness();
  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest(REQUEST);
  flow.handleRollRequest(REQUEST);
  await drain();
  // #then
  expect({ outcomes: harness.outcomes, sent: harness.sent.length }).toEqual({
    outcomes: [{ code: 'rolled' }],
    sent: 1,
  });
});

test('a stopped dice operation produces no fallback roll or outcome', async () => {
  // #given
  const harness = createHarness({
    dice: {
      ready: async () => 'permitted',
      roll: async () => Result.err({ code: 'stopped' }),
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest({ ...REQUEST, id: 'dice-stopped' });
  await drain();
  // #then
  expect({ outcomes: harness.outcomes, sent: harness.sent }).toEqual({ outcomes: [], sent: [] });
});

test('an oversized roll is refused before the room transport', async () => {
  // #given
  let sends = 0;

  const harness = createHarness({
    playerName: async () => 'A'.repeat(16000),
    sendRemote: async () => {
      sends += 1;

      return true;
    },
  });

  const flow = createRollFlow(harness.ports);
  // #when
  flow.handleRollRequest({ ...REQUEST, id: 'oversized' });
  await drain();
  // #then
  expect({ outcomes: harness.outcomes, sends }).toEqual({
    outcomes: [{ code: 'failed' }],
    sends: 0,
  });
});
