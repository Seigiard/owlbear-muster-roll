import { assembleRecords } from '@/core/merge';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { describe, expect, test } from 'bun:test';
import { createComposers } from './composers';

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',
      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [
        {
          title: 'Основное',
          sections: [
            {
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                { cells: [{ kind: 'field', type: 'number', id: 'hp' }] },
              ],
            },
          ],
        },
        {
          title: 'Состояния',
          repeat: { id: 'condition', nameField: 'condition_name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'condition_name' },
                    { kind: 'field', type: 'text', id: 'hp' },
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

describe('createComposers', () => {
  test('keeps a GM root number edit when a repeat tab has a same-id text field', () => {
    // #given
    const records = assembleRecords([
      { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
      {
        k: 'blk:brok',
        d: { set: 'pc', order: 0, cells: { hp: [7, 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ] satisfies VersionedRecord[]);

    const composers = createComposers('gm');

    // #when
    const result = composers.compose(
      {
        records,
        mint: (_key, highestKnownCounter) => ({ c: highestKnownCounter + 1, a: 'gm' }),
        newRecordId: (_kind, role) => role,
        isGmPlayer: () => true,
      },
      {
        type: 'field-patch',
        sheetId: 'brok',
        target: { kind: 'row', rowId: 'hp' },
        fieldId: 'hp',
        value: 8,
      },
    );

    // #then
    expect(result).toEqual({
      ok: true,
      value: [
        {
          k: 'blk:brok',
          d: { set: 'pc', order: 0, cells: { hp: [8, 2, 'gm'] } },
          c: 2,
          a: 'gm',
          l: [1, 'seed'],
        },
      ],
    });
  });
});
