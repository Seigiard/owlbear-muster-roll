import { describe, expect, test } from 'bun:test';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { assembleRecords } from './merge';
import { presetDiff } from './preset-migrate';

const OLD_PRESET = {
  v: 4,
  templates: [
    {
      id: 'pc',
      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }],
            },
            {
              repeat: { id: 'attacks', nameField: 'attack' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'attack' },
                    { kind: 'field', type: 'text', id: 'alias' },
                    { kind: 'field', type: 'number', id: 'bonus' },
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

describe('v4 preset changes', () => {
  test('changing repeat.id erases its blocks instead of relocating matching fields', () => {
    // #given
    const records = assembleRecords([
      fixtureRecord('blk:brok', {
        set: 'pc',
        order: 0,
        cells: { name: ['Брок', 1, 'seed'] },
      }),
      fixtureRecord('blk:brok:attacks:a1', {
        order: 0,
        cells: {
          attack: ['Меч', 1, 'seed'],
          alias: ['Клинок', 1, 'seed'],
          bonus: [2, 1, 'seed'],
        },
      }),
    ]);

    type OldPreset = Parameters<typeof presetDiff>[1];

    type NewPreset = Parameters<typeof presetDiff>[2];

    const oldPreset: OldPreset = JSON.parse(JSON.stringify(OLD_PRESET));
    const nextPreset: NewPreset = JSON.parse(JSON.stringify(OLD_PRESET));

    Object(nextPreset).templates[0].tabs[0].sections[1].repeat.id = 'moves';

    // #when
    const result = capture(() => {
      const migration = presetDiff(records, oldPreset, nextPreset);

      return {
        count: migration.count,
        sheets: migration.sheets,
        removed: migration.removed,
        first: migration.first,
        last: migration.last,
      };
    });

    // #then
    expect(result).toEqual({
      result: {
        count: 3,
        sheets: 0,
        removed: { pc: ['alias', 'attack', 'bonus'] },
        first: [],
        last: [{ k: 'blk:brok:attacks:a1', d: null }],
      },
    });
  });

  test('changing repeat.nameField keeps the block identity and every value', () => {
    // #given
    const records = assembleRecords([
      fixtureRecord('blk:brok', {
        set: 'pc',
        order: 0,
        cells: { name: ['Брок', 1, 'seed'] },
      }),
      fixtureRecord('blk:brok:attacks:a1', {
        order: 0,
        cells: {
          attack: ['Меч', 1, 'seed'],
          alias: ['Клинок', 1, 'seed'],
          bonus: [2, 1, 'seed'],
        },
      }),
    ]);

    type OldPreset = Parameters<typeof presetDiff>[1];

    type NewPreset = Parameters<typeof presetDiff>[2];

    const oldPreset: OldPreset = JSON.parse(JSON.stringify(OLD_PRESET));
    const nextPreset: NewPreset = JSON.parse(JSON.stringify(OLD_PRESET));

    Object(nextPreset).templates[0].tabs[0].sections[1].repeat.nameField = 'alias';

    // #when
    const result = capture(() => {
      const migration = presetDiff(records, oldPreset, nextPreset);

      return {
        count: migration.count,
        sheets: migration.sheets,
        removed: migration.removed,
        first: migration.first,
        last: migration.last,
      };
    });

    // #then
    expect(result).toEqual({
      result: {
        count: 0,
        sheets: 0,
        removed: {},
        first: [],
        last: [],
      },
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
