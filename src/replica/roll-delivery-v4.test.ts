import { expect, test } from 'bun:test';
import { copy } from '@/copy';
import { encodePreset, type Preset } from '@/core/preset';
import { Result } from 'better-result';
import type { RollMessage } from '@/core/room-messages';
import type { RollOutcome, RollRequestMessage } from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';
import { createRollFlow, type RollFlowPorts } from './roll-flow';

test('GM and player notifications deliver hidden descendant rolls only to the GM', async () => {
  // #given
  const sender = createHarness('GM');
  const gm = createHarness('GM');
  const player = createHarness('PLAYER');

  // #when
  sender.flow.handleRollRequest(request('visible', 0));
  sender.flow.handleRollRequest(request('hidden-section', 1));
  sender.flow.handleRollRequest(request('hidden-row', 2));
  await drain();

  for (const message of sender.messages()) {
    gm.flow.receiveRoll(message, { role: 'GM', name: 'Ведущий' });
    player.flow.receiveRoll(message, { role: 'GM', name: 'Ведущий' });
  }

  await drain();

  // #then
  expect({
    sent: sender.result(),
    gm: gm.notifications,
    player: player.notifications,
  }).toEqual({
    sent: {
      outcomes: [{ code: 'rolled' }, { code: 'rolled' }, { code: 'rolled' }],
      sent: [
        { id: 'roll-1', hidden: false },
        { id: 'roll-2', hidden: true },
        { id: 'roll-3', hidden: true },
      ],
    },
    gm: [
      'Ведущий: Общий лист, Открытый — 1',
      'Ведущий: Общий лист, Секрет раздела — 1',
      'Ведущий: Общий лист, Секрет строки — 1',
    ],
    player: ['Ведущий: Общий лист, Открытый — 1'],
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
            { rows: [{ cells: [{ kind: 'dice', formula: '1d6', name: 'Открытый' }] }] },
            {
              visibility: 'gm',
              rows: [
                {
                  cells: [{ kind: 'dice', formula: '1d6', name: 'Секрет раздела' }],
                },
              ],
            },
            {
              rows: [
                {
                  visibility: 'gm',
                  cells: [{ kind: 'dice', formula: '1d6', name: 'Секрет строки' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function createHarness(role: PlayerRole) {
  const records = new Map([
    ['preset', { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' } as const],
  ]);

  const outcomes: RollOutcome[] = [];

  const sent: RollMessage[] = [];

  const notifications: string[] = [];

  let ids = 0;

  const ports: RollFlowPorts = {
    pendingView: () => records,
    presetOf: () => PRESET,
    role: () => role,
    stopped: () => false,
    generation: () => ({ n: 0, a: '' }),
    dice: { ready: async () => 'absent', roll: async () => Result.ok([]) },
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
    notify: (text) => {
      notifications.push(text);
    },
    rollCopy: copy,
  };

  return {
    flow: createRollFlow(ports),
    messages: () => sent,
    notifications,
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
