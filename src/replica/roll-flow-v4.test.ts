import { expect, test } from 'bun:test';
import { encodePreset, type Preset, type PresetRow, type PresetSection } from '@/core/preset';
import { Result } from 'better-result';
import type { RollMessage } from '@/core/room-messages';
import type { RollOutcome, RollRequestMessage } from '@/core/ui-messages';
import { createRollFlow, type RollFlowPorts } from './roll-flow';

type Visibility = 'gm' | undefined;

test('a player rolls a visible row but section and row visibility each refuse the same roll', async () => {
  // #given
  const visible = harness();
  const hiddenSection = harness('gm');
  const hiddenRow = harness(undefined, 'gm');

  // #when
  visible.flow.handleRollRequest(request('visible'));
  hiddenSection.flow.handleRollRequest(request('hidden-section'));
  hiddenRow.flow.handleRollRequest(request('hidden-row'));
  await drain();

  // #then
  expect({
    visible: visible.result(),
    hiddenSection: hiddenSection.result(),
    hiddenRow: hiddenRow.result(),
  }).toEqual({
    visible: { outcomes: [{ code: 'rolled' }], sent: [{ hidden: false }] },
    hiddenSection: { outcomes: [{ code: 'refused' }], sent: [] },
    hiddenRow: { outcomes: [{ code: 'refused' }], sent: [] },
  });
});

function harness(sectionVisibility?: Visibility, rowVisibility?: Visibility) {
  const row: PresetRow = {
    cells: [{ kind: 'dice', formula: '1d6', name: 'Проверка' }],
  };

  if (rowVisibility !== undefined) {
    row.visibility = rowVisibility;
  }

  const section: PresetSection = { rows: [row] };

  if (sectionVisibility !== undefined) {
    section.visibility = sectionVisibility;
  }

  const preset: Preset = {
    v: 4,
    templates: [
      {
        id: 'shared',
        title: 'Общий лист',
        tabs: [
          {
            sections: [section],
          },
        ],
      },
    ],
  };

  const records = new Map([
    ['preset', { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' } as const],
  ]);

  const outcomes: RollOutcome[] = [];

  const sent: RollMessage[] = [];

  const ports: RollFlowPorts = {
    pendingView: () => records,
    presetOf: () => preset,
    role: () => 'PLAYER',
    stopped: () => false,
    generation: () => ({ n: 0, a: '' }),
    dice: {
      ready: async () => 'absent',
      roll: async () => Result.ok([]),
    },
    gmInParty: () => true,
    playerId: 'player-1',
    playerName: async () => 'Игрок',
    random: () => 0,
    newId: () => 'roll-1',
    sendRemote: async (message) => {
      sent.push(message);

      return true;
    },
    replyOutcome: (_id, outcome) => {
      outcomes.push(outcome);
    },
    notify: () => undefined,
  };

  return {
    flow: createRollFlow(ports),
    result: () => ({
      outcomes,
      sent: sent.map((message) => ({ hidden: message.hidden })),
    }),
  };
}

function request(id: string): RollRequestMessage {
  return {
    t: 'roll-request',
    id,
    sheetId: 'shared',
    place: { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 0, instanceId: null },
    shown: {},
  };
}

function drain(count = 10): Promise<void> {
  return count === 0 ? Promise.resolve() : Promise.resolve().then(() => drain(count - 1));
}
