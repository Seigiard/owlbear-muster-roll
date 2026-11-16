import { expect, test } from 'bun:test';
import { encodePreset, type Preset } from '@/core/preset';
import { ok } from '@/core/result';
import type { RollMessage } from '@/core/room-messages';
import type { RollOutcome, RollRequestMessage } from '@/core/ui-messages';
import { createRollFlow, type RollFlowPorts } from './roll-flow';

test('a GM sends hidden section and row rolls as GM-only while a visible sibling stays public', async () => {
  // #given
  const harness = createHarness();

  // #when
  harness.flow.handleRollRequest(request('visible', 0));
  harness.flow.handleRollRequest(request('hidden-section', 1));
  harness.flow.handleRollRequest(request('hidden-row', 2));
  await drain();

  // #then
  expect(harness.result()).toEqual({
    outcomes: [{ code: 'rolled' }, { code: 'rolled' }, { code: 'rolled' }],
    sent: [
      { id: 'roll-1', hidden: false },
      { id: 'roll-2', hidden: true },
      { id: 'roll-3', hidden: true },
    ],
  });
});

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'shared',
      title: 'Общий лист',
      tabs: [
        {
          sections: [
            { rows: [{ cells: [{ kind: 'dice', formula: '1d6' }] }] },
            {
              visibility: 'gm',
              rows: [{ cells: [{ kind: 'dice', formula: '1d6' }] }],
            },
            {
              rows: [
                {
                  visibility: 'gm',
                  cells: [{ kind: 'dice', formula: '1d6' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function createHarness() {
  const records = new Map([
    ['preset', { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' } as const],
  ]);

  const outcomes: RollOutcome[] = [];

  const sent: RollMessage[] = [];

  let ids = 0;

  const ports: RollFlowPorts = {
    pendingView: () => records,
    presetOf: () => PRESET,
    role: () => 'GM',
    stopped: () => false,
    generation: () => ({ n: 0, a: '' }),
    dice: { ready: async () => 'absent', roll: async () => ok([]) },
    gmInRoom: () => true,
    playerId: 'gm',
    playerName: async () => 'Ведущий',
    random: () => 0,
    newId: () => `roll-${++ids}`,
    sendRemote: async (message) => {
      sent.push(message);

      return true;
    },
    replyOutcome: (_id, outcome) => outcomes.push(outcome),
    notify: () => undefined,
  };

  return {
    flow: createRollFlow(ports),
    result: () => ({
      outcomes,
      sent: sent.map((message) => ({ id: message.id, hidden: message.hidden })),
    }),
  };
}

function request(id: string, sectionIndex: number): RollRequestMessage {
  return {
    t: 'roll-request',
    id,
    sheetId: 'shared',
    place: { tabIndex: 0, sectionIndex, rowIndex: 0, cellIndex: 0, instanceId: null },
    shown: {},
  };
}

function drain(count = 10): Promise<void> {
  return count === 0 ? Promise.resolve() : Promise.resolve().then(() => drain(count - 1));
}
