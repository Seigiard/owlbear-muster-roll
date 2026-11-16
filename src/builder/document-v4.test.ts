import { describe, expect, test } from 'bun:test';
import { fromPreset, toPreset } from './document';

const PRESET_V4 = {
  v: 4,
  window: { width: 900, height: 700 },
  templates: [
    {
      id: 'crew',
      title: 'Экипаж',
      repeat: { nameField: 'name' },
      players: 'edit',
      tabs: [
        {
          title: 'Основное',
          sections: [
            {
              title: 'Атаки',
              width: '1/2',
              columns: 3,
              repeat: { id: 'attacks', nameField: 'attack' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'bonus', name: 'Бонус' },
                    { kind: 'field', type: 'text', id: 'attack' },
                    { kind: 'token', id: 'attack_token' },
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

describe('Builder preset v4 document', () => {
  test('round-trips representative v4 properties without adding Builder uids', () => {
    // #given
    type BuilderInput = Parameters<typeof fromPreset>[0];

    const input: BuilderInput = JSON.parse(JSON.stringify(PRESET_V4));

    // #when
    const roundTrip: unknown = capture(() => toPreset(fromPreset(input)));

    // #then
    expect(roundTrip).toEqual({ result: PRESET_V4 });
  });

  test('preserves explicit row visibility and leaves default row visibility absent', () => {
    // #given
    type BuilderInput = Parameters<typeof fromPreset>[0];

    const input: BuilderInput = {
      templates: [
        {
          id: 'notes',
          title: 'Заметки',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    { visibility: 'gm', cells: [{ kind: 'text', text: 'Секрет' }] },
                    { cells: [{ kind: 'text', text: 'Общее' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // #when
    const roundTrip = capture(() => {
      const rows = toPreset(fromPreset(input)).templates[0]?.tabs[0]?.sections[0]?.rows;

      return {
        explicit: rows?.[0]?.visibility,
        defaultHasVisibility: rows?.[1] !== undefined && 'visibility' in rows[1],
      };
    });

    // #then
    expect(roundTrip).toEqual({
      result: { explicit: 'gm', defaultHasVisibility: false },
    });
  });
});

function capture<Result>(operation: () => Result): { result: Result } | { threw: string } {
  try {
    return { result: operation() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}
