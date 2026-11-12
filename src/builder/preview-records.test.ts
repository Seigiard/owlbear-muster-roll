import { describe, expect, test } from 'bun:test';

import type { Template } from '@/core/preset';

import { previewRecords, previewSheetName, PREVIEW_SHEET_ID } from './preview-records';

const SET: Template = {
  id: 'pc',
  kind: 'set',
  title: 'Экипаж',
  nameField: 'name',
  sections: [
    { rows: [[{ kind: 'field', type: 'text', id: 'name' }]] },
    { repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'item' }]] },
    { repeat: true, rows: [[{ kind: 'text', text: 'Нет поля' }]] },
  ],
};

describe('previewRecords', () => {
  test("gives a sheet set's sample sheet and one empty repeat block per repeat section", () => {
    // #when
    const records = previewRecords(SET);

    // #then
    expect([...records.values()]).toEqual([
      { k: `sheet:${PREVIEW_SHEET_ID}`, d: { set: 'pc', order: 1 }, c: 1, a: 'builder' },
      { k: `rep:${PREVIEW_SHEET_ID}:item:sample`, d: { order: 1, cells: {} }, c: 1, a: 'builder' },
    ]);
  });

  test('gives a single sheet no sheet record', () => {
    // #when
    const records = previewRecords({ id: 'npc', kind: 'single', title: 'NPC', sections: [] });

    // #then
    expect(records.size).toBe(0);
  });
});

describe('previewSheetName', () => {
  test.each<[string, Template, string]>([
    ['a sheet set by its name field id', SET, 'name'],
    [
      'a sheet set with a name field that names no text field',
      { ...SET, nameField: 'x' },
      'Без имени',
    ],
    [
      'a single sheet by its title',
      { id: 'npc', kind: 'single', title: 'NPC', sections: [] },
      'NPC',
    ],
  ])('names %s', (_name, template, expected) => {
    // #when
    const name = previewSheetName(template);

    // #then
    expect(name).toBe(expected);
  });
});
