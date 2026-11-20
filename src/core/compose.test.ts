import { Result } from 'better-result';
import { assembleRecords } from '@/core/merge';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { parseCommand } from '@/core/ui-messages';
import { describe, expect, test } from 'bun:test';
import { createComposers } from './compose';

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
                    { kind: 'field', type: 'text', id: 'condition_text' },
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

const NESTED_PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'encounter',
      title: 'Encounter',
      tabs: [
        {
          repeat: { id: 'npc', nameField: 'npc_name' },
          sections: [
            { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'npc_name' }] }] },
            {
              repeat: { id: 'attack', nameField: 'attack_name' },
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'attack_name' }] },
                {
                  repeat: { id: 'effect', nameField: 'effect_name' },
                  cells: [{ kind: 'field', type: 'text', id: 'effect_name' }],
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
  test('keeps a GM root number edit when a repeat tab has a distinct text field', () => {
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
        mode: 'persisted',
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
    expect(result).toEqual(
      Result.ok([
        {
          k: 'blk:brok',
          d: { set: 'pc', order: 0, cells: { hp: [8, 2, 'gm'] } },
          c: 2,
          a: 'gm',
          l: [1, 'seed'],
        },
      ]),
    );
  });
  test('a GM deletes a repeat block, its live descendants and their links in one batch', () => {
    // #given
    const records = assembleRecords([
      { k: 'preset', d: encodePreset(NESTED_PRESET), c: 1, a: 'seed' },
      { k: 'blk:encounter', d: { order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
      {
        k: 'blk:encounter:npc:a',
        d: { order: 0, cells: { npc_name: ['A', 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
      {
        k: 'blk:encounter:npc:a:attack:x',
        d: { order: 0, cells: { attack_name: ['Claw', 4, 'seed'] } },
        c: 4,
        a: 'seed',
        l: [3, 'seed'],
      },
      {
        k: 'blk:encounter:npc:a:attack:x:effect:bleed',
        d: { order: 0, cells: { effect_name: ['Bleed', 9, 'seed'] } },
        c: 9,
        a: 'seed',
        l: [7, 'seed'],
      },
      {
        k: 'blk:encounter:npc:a:attack:old',
        d: null,
        c: 10,
        a: 'seed',
        l: [8, 'seed'],
      },
      {
        k: 'blk:encounter:npc:ab',
        d: { order: 1, cells: { npc_name: ['B', 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
      { k: 'link:a', d: { s: 'encounter', path: ['npc', 'a'], c: 'token' }, c: 1, a: 'seed' },
      {
        k: 'link:child',
        d: { s: 'encounter', path: ['npc', 'a', 'attack', 'x'], c: 'token' },
        c: 1,
        a: 'seed',
      },
      { k: 'link:b', d: { s: 'encounter', path: ['npc', 'ab'], c: 'token' }, c: 1, a: 'seed' },
      {
        k: 'link:stale',
        d: { s: 'encounter', path: ['npc', 'missing', 'attack', 'a'], c: 'token' },
        c: 1,
        a: 'seed',
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
        mode: 'persisted',
      },
      parseCommand({
        type: 'repeat-block-delete',
        sheetId: 'encounter',
        sectionId: 'npc',
        instanceId: 'a',
      }),
    );

    // #then
    expect(
      result.map(([target, ...others]) => ({
        target,
        others: new Set(others),
        otherCount: others.length,
      })),
    ).toEqual(
      Result.ok({
        target: { k: 'blk:encounter:npc:a', d: null, c: 2, a: 'gm', l: [1, 'seed'] },
        others: new Set([
          { k: 'blk:encounter:npc:a:attack:x', d: null, c: 5, a: 'gm', l: [3, 'seed'] },
          {
            k: 'blk:encounter:npc:a:attack:x:effect:bleed',
            d: null,
            c: 10,
            a: 'gm',
            l: [7, 'seed'],
          },
          { k: 'link:a', d: null, c: 2, a: 'gm' },
          { k: 'link:child', d: null, c: 2, a: 'gm' },
        ]),
        otherCount: 4,
      }),
    );
  });
});
