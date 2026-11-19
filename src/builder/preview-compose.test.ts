import { describe, expect, test } from 'bun:test';

import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { createVersionMinter } from '@/core/version-minter';
import { previewCompose } from './preview-compose';

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',
      title: 'Экипаж',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'field', type: 'number', id: 'hp' },
                  ],
                },
              ],
            },
            {
              repeat: { id: 'atk', nameField: 'attack' },
              rows: [
                {
                  cells: [{ kind: 'field', type: 'text', id: 'attack' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const PRESET_DATA = encodePreset(PRESET);

describe('previewCompose', () => {
  test('a field edit keeps the other cells while a refused edit leaves the snapshot unchanged', () => {
    // #given
    const snapshot: VersionedRecord[] = [
      {
        k: 'blk:s1',
        d: {
          set: 'pc',
          order: 0,
          cells: { name: ['Аня', 3, 'seed'], hp: [4, 3, 'seed'] },
        },
        c: 3,
        a: 'seed',
        l: [1, 'seed'],
      },
    ];

    // #when
    const result = previewCompose(
      snapshot,
      recordMap(snapshot),
      PRESET_DATA,
      createVersionMinter('builder'),
      {
        type: 'field-patch',
        sheetId: 's1',
        target: { kind: 'row', rowId: 'name' },
        fieldId: 'hp',
        value: 7,
      },
    );

    const refused = previewCompose(
      snapshot,
      recordMap(snapshot),
      PRESET_DATA,
      createVersionMinter('builder'),
      {
        type: 'field-patch',
        sheetId: 's1',
        target: { kind: 'row', rowId: 'missing' },
        fieldId: 'missing',
        value: 7,
      },
    );

    // #then
    expect({
      accepted: result,
      refused: { sameSnapshot: refused.snapshot === snapshot, ok: refused.ok },
    }).toEqual({
      accepted: {
        ok: true,
        snapshot: [
          {
            k: 'blk:s1',
            d: {
              set: 'pc',
              order: 0,
              cells: { name: ['Аня', 3, 'seed'], hp: [7, 4, 'builder'] },
            },
            c: 4,
            a: 'builder',
            l: [1, 'seed'],
          },
        ],
      },
      refused: { sameSnapshot: true, ok: false },
    });
  });

  test('two edits of one field mint counters four and five', () => {
    // #given
    const snapshot: VersionedRecord[] = [
      {
        k: 'blk:s1',
        d: {
          set: 'pc',
          order: 0,
          cells: { name: ['Аня', 3, 'seed'], hp: [4, 3, 'seed'] },
        },
        c: 3,
        a: 'seed',
        l: [1, 'seed'],
      },
    ];

    const minter = createVersionMinter('builder');

    // #when
    const first = previewCompose(snapshot, recordMap(snapshot), PRESET_DATA, minter, {
      type: 'field-patch',
      sheetId: 's1',
      target: { kind: 'row', rowId: 'name' },
      fieldId: 'hp',
      value: 7,
    });

    const second = previewCompose(first.snapshot, recordMap(first.snapshot), PRESET_DATA, minter, {
      type: 'field-patch',
      sheetId: 's1',
      target: { kind: 'row', rowId: 'name' },
      fieldId: 'hp',
      value: 8,
    });

    // #then
    expect({ first: first.snapshot, second: second.snapshot }).toEqual({
      first: [
        {
          k: 'blk:s1',
          d: {
            set: 'pc',
            order: 0,
            cells: { name: ['Аня', 3, 'seed'], hp: [7, 4, 'builder'] },
          },
          c: 4,
          a: 'builder',
          l: [1, 'seed'],
        },
      ],
      second: [
        {
          k: 'blk:s1',
          d: {
            set: 'pc',
            order: 0,
            cells: { name: ['Аня', 3, 'seed'], hp: [8, 5, 'builder'] },
          },
          c: 5,
          a: 'builder',
          l: [1, 'seed'],
        },
      ],
    });
  });

  test('a block add follows direct live siblings and ignores their descendants', () => {
    // #given
    const snapshot: VersionedRecord[] = [
      {
        k: 'blk:s1',
        d: { set: 'pc', order: 0, cells: {} },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
      {
        k: 'blk:s1:atk:a',
        d: { order: 0, cells: { attack: ['Удар', 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
      {
        k: 'blk:s1:atk:a:detail:x',
        d: { order: 9, cells: {} },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ];

    // #when
    const result = previewCompose(
      snapshot,
      recordMap(snapshot),
      PRESET_DATA,
      createVersionMinter('builder'),
      {
        type: 'repeat-block-add',
        sheetId: 's1',
        block: { sheetId: 's1', path: ['atk', 'b'] },
      },
    );

    // #then
    expect(result).toEqual({
      ok: true,
      snapshot: [
        {
          k: 'blk:s1',
          d: { set: 'pc', order: 0, cells: {} },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: 'blk:s1:atk:a',
          d: { order: 0, cells: { attack: ['Удар', 1, 'seed'] } },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: 'blk:s1:atk:a:detail:x',
          d: { order: 9, cells: {} },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: 'blk:s1:atk:b',
          d: { order: 1, cells: {} },
          c: 1,
          a: 'builder',
          l: [1, 'builder'],
        },
      ],
    });
  });

  test('a block delete keeps its lifecycle and tombstones its link', () => {
    // #given
    const snapshot: VersionedRecord[] = [
      {
        k: 'blk:s1',
        d: { set: 'pc', order: 0, cells: {} },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
      {
        k: 'blk:s1:atk:a',
        d: { order: 0, cells: { attack: ['Удар', 2, 'seed'] } },
        c: 2,
        a: 'seed',
        l: [1, 'builder'],
      },
      {
        k: 'link:token-a',
        d: { s: 's1', path: ['atk', 'a'], c: 'token' },
        c: 1,
        a: 'seed',
      },
    ];

    // #when
    const result = previewCompose(
      snapshot,
      recordMap(snapshot),
      PRESET_DATA,
      createVersionMinter('builder'),
      {
        type: 'repeat-block-delete',
        sheetId: 's1',
        block: { sheetId: 's1', path: ['atk', 'a'] },
      },
    );

    // #then
    expect(result).toEqual({
      ok: true,
      snapshot: [
        {
          k: 'blk:s1',
          d: { set: 'pc', order: 0, cells: {} },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: 'blk:s1:atk:a',
          d: null,
          c: 3,
          a: 'builder',
          l: [1, 'builder'],
        },
        { k: 'link:token-a', d: null, c: 2, a: 'builder' },
      ],
    });
  });

  test('a sample edit appends its root while another command leaves the snapshot unchanged', () => {
    // #given
    const snapshot: VersionedRecord[] = [];

    const sampleRoot: VersionedRecord = {
      k: 'blk:builder-preview',
      d: { set: 'pc', order: 1, cells: {} },
      c: 1,
      a: 'builder',
      l: [1, 'builder'],
    };

    // #when
    const result = previewCompose(
      snapshot,
      recordMap([sampleRoot]),
      PRESET_DATA,
      createVersionMinter('builder'),
      {
        type: 'field-patch',
        sheetId: 'builder-preview',
        target: { kind: 'row', rowId: 'name' },
        fieldId: 'hp',
        value: 7,
      },
    );

    const otherCommand = previewCompose(
      snapshot,
      recordMap([sampleRoot]),
      PRESET_DATA,
      createVersionMinter('builder'),
      { type: 'sheet-create', sheetId: 's2', set: 'pc' },
    );

    // #then
    expect({
      accepted: result,
      other: { sameSnapshot: otherCommand.snapshot === snapshot, ok: otherCommand.ok },
    }).toEqual({
      accepted: {
        ok: true,
        snapshot: [
          {
            k: 'blk:builder-preview',
            d: { set: 'pc', order: 1, cells: { hp: [7, 2, 'builder'] } },
            c: 2,
            a: 'builder',
            l: [1, 'builder'],
          },
        ],
      },
      other: { sameSnapshot: true, ok: false },
    });
  });
});

function recordMap(records: readonly VersionedRecord[]): ReadonlyMap<string, VersionedRecord> {
  return new Map(records.map((record): [string, VersionedRecord] => [record.k, record]));
}
