import { describe, expect, test } from 'bun:test';
import type { Template } from '@/core/preset';
import { previewRecords, previewSheetName, PREVIEW_SHEET_ID } from './preview-records';

const SET: Template = {
  id: 'pc',

  title: 'Экипаж',
  repeat: { nameField: 'name' },
  tabs: [
    {
      sections: [
        { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] },
        {
          repeat: { id: 'item', nameField: 'item' },
          rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item' }] }],
        },
        {
          repeat: { id: 'name', nameField: 'name' },
          rows: [{ cells: [{ kind: 'text', text: 'Нет поля' }] }],
        },
      ],
    },
  ],
};

describe('previewRecords', () => {
  test("gives a sheet set's sample sheet and one empty repeat block per repeat section", () => {
    // #when
    const records = previewRecords(SET);
    // #then
    expect([...records.values()]).toEqual([
      {
        k: `blk:${PREVIEW_SHEET_ID}`,
        d: { set: 'pc', order: 1, cells: {} },
        c: 1,
        a: 'builder',
        l: [1, 'builder'],
      },
      {
        k: `blk:${PREVIEW_SHEET_ID}:item:sample`,
        d: { order: 1, cells: {} },
        c: 1,
        a: 'builder',
        l: [1, 'builder'],
      },
      {
        k: `blk:${PREVIEW_SHEET_ID}:name:sample`,
        d: { order: 1, cells: {} },
        c: 1,
        a: 'builder',
        l: [1, 'builder'],
      },
    ]);
  });
  test('materializes the root of a single sheet', () => {
    // #when
    const records = previewRecords({
      id: 'npc',

      title: 'NPC',
      tabs: [{ sections: [] }],
    });

    // #then
    expect([...records.values()]).toEqual([
      {
        k: `blk:${PREVIEW_SHEET_ID}`,
        d: { order: 1, cells: {} },
        c: 1,
        a: 'builder',
        l: [1, 'builder'],
      },
    ]);
  });
});

describe('previewSheetName', () => {
  test.each<[string, Template, string]>([
    ['a sheet set by its name field id', SET, 'name'],
    [
      'a sheet set with a name field that names no text field',
      { ...SET, repeat: { nameField: 'x' } },
      'Без имени',
    ],
    ['a single sheet by its title', { id: 'npc', title: 'NPC', tabs: [{ sections: [] }] }, 'NPC'],
  ])('names %s', (_name, template, expected) => {
    // #when
    const name = previewSheetName(template);
    // #then
    expect(name).toBe(expected);
  });
});
