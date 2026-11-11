import { describe, expect, test } from 'bun:test';

import type { PresetFieldCell, TemplateLayout } from '@/core/preset';
import type { FieldValue, VersionedRecord } from '@/core/records';

import {
  acceptedFieldValue,
  findPatchField,
  patchedRecord,
  patchedRecordFits,
  patchRecordKey,
  targetFields,
} from './field-patch';

const STR: PresetFieldCell = { kind: 'field', type: 'number', id: 'str' };
const TIRED: PresetFieldCell = { kind: 'field', type: 'check', id: 'str_tired' };
const NOTES: PresetFieldCell = { kind: 'field', type: 'text', id: 'notes' };
const ATTACK: PresetFieldCell = { kind: 'field', type: 'text', id: 'attack' };
const BONUS: PresetFieldCell = { kind: 'field', type: 'number', id: 'bonus' };
const RANGE: PresetFieldCell = { kind: 'field', type: 'number', id: 'range' };

const TEMPLATE: TemplateLayout = {
  sections: [
    { rows: [[{ kind: 'text', text: 'Сила' }, STR, TIRED], [NOTES]] },
    {
      repeat: true,
      rows: [
        [ATTACK, BONUS],
        [{ kind: 'text', text: 'Дальность' }, RANGE],
      ],
    },
  ],
};

function row(d: Record<string, FieldValue> | null): VersionedRecord {
  return { k: 'row:brok:str', d, c: 3, a: 'seed' };
}

function rep(d: { order: number; cells: Record<string, FieldValue> } | null): VersionedRecord {
  return { k: 'rep:brok:attack:i1', d, c: 3, a: 'seed' };
}

describe('patchRecordKey', () => {
  test('names the row record of a row target', () => {
    // #then
    expect(patchRecordKey('brok', { kind: 'row', rowId: 'str' })).toBe('row:brok:str');
  });

  test('names the repeat block record of a repeat target', () => {
    // #then
    expect(patchRecordKey('brok', { kind: 'rep', sectionId: 'attack', instanceId: 'i1' })).toBe(
      'rep:brok:attack:i1',
    );
  });
});

describe('findPatchField', () => {
  test('finds a field of the row its first field names', () => {
    // #then
    expect(findPatchField(TEMPLATE, { kind: 'row', rowId: 'str' }, 'str_tired')).toEqual(TIRED);
  });

  test('finds a field of the repeat section', () => {
    // #given
    const target = { kind: 'rep', sectionId: 'attack', instanceId: 'i1' } as const;

    // #then
    expect(findPatchField(TEMPLATE, target, 'bonus')).toEqual(BONUS);
  });

  test('finds a field of the second row of a repeat block, which spans every row of its section', () => {
    // #given
    const target = { kind: 'rep', sectionId: 'attack', instanceId: 'i1' } as const;

    // #then
    expect(findPatchField(TEMPLATE, target, 'range')).toEqual(RANGE);
  });

  test.each([
    ['a field of another row', { kind: 'row', rowId: 'str' } as const, 'notes'],
    [
      'a row id that is not a first field',
      { kind: 'row', rowId: 'str_tired' } as const,
      'str_tired',
    ],
    ['an unknown field', { kind: 'row', rowId: 'str' } as const, 'dex'],
    ['a repeat field addressed as a row', { kind: 'row', rowId: 'attack' } as const, 'bonus'],
    [
      'a plain row addressed as a repeat section',
      { kind: 'rep', sectionId: 'str', instanceId: 'i1' } as const,
      'str',
    ],
  ])('finds nothing for %s', (_name, target, fieldId) => {
    // #then
    expect(findPatchField(TEMPLATE, target, fieldId)).toBeNull();
  });
});

describe('targetFields', () => {
  test('lists the fields of every row of a repeat section, in row order', () => {
    // #then
    expect(targetFields(TEMPLATE, { kind: 'rep', sectionId: 'attack' })).toEqual([
      ATTACK,
      BONUS,
      RANGE,
    ]);
  });

  test('lists only the fields of one plain row', () => {
    // #then
    expect(targetFields(TEMPLATE, { kind: 'row', rowId: 'str' })).toEqual([STR, TIRED]);
  });

  test('gives null for a section id that is the second field of a repeat section', () => {
    // #then
    expect(targetFields(TEMPLATE, { kind: 'rep', sectionId: 'range' })).toBeNull();
  });
});

describe('acceptedFieldValue', () => {
  test.each([
    ['a number for a number field', STR, 12],
    ['a non-empty string for a text field', NOTES, 'abc'],
    ['true for a check field', TIRED, true],
    ['false for a check field', TIRED, false],
    ['null for any field', STR, null],
  ])('accepts %s', (_name, field, value) => {
    // #then
    expect(acceptedFieldValue(field, value)).toEqual({ ok: true, value });
  });

  test.each([
    ['a string for a number field', STR, '12'],
    ['a boolean for a number field', STR, true],
    ['an empty string for a text field', NOTES, ''],
    ['a number for a text field', NOTES, 12],
    ['a number for a check field', TIRED, 1],
    ['an object for any field', NOTES, { text: 'abc' }],
    ['an array for any field', STR, [12]],
  ])('refuses %s', (_name, field, value) => {
    // #then
    expect(acceptedFieldValue(field, value)).toEqual({ ok: false, error: 'invalid-value' });
  });
});

describe('patchedRecord', () => {
  const ROW = { kind: 'row', rowId: 'str' } as const;
  const REP = { kind: 'rep', sectionId: 'attack', instanceId: 'i1' } as const;

  test('merges the value into the row record and keeps its other fields', () => {
    // #then
    expect(patchedRecord('brok', ROW, row({ str: 9, str_tired: true }), 'str', 12)).toEqual({
      ok: true,
      value: { k: 'row:brok:str', d: { str: 12, str_tired: true } },
    });
  });

  test('starts an absent row record empty', () => {
    // #then
    expect(patchedRecord('brok', ROW, undefined, 'str_tired', false)).toEqual({
      ok: true,
      value: { k: 'row:brok:str', d: { str_tired: false } },
    });
  });

  test('removes the key of a cleared field', () => {
    // #then
    expect(patchedRecord('brok', ROW, row({ str: 9, str_tired: true }), 'str', null)).toEqual({
      ok: true,
      value: { k: 'row:brok:str', d: { str_tired: true } },
    });
  });

  test('refuses a clear of an absent key as unchanged', () => {
    // #then
    expect(patchedRecord('brok', ROW, row({ str_tired: true }), 'str', null)).toEqual({
      ok: false,
      error: 'unchanged',
    });
  });

  test('refuses the value the record already holds as unchanged', () => {
    // #then
    expect(patchedRecord('brok', ROW, row({ str: 9 }), 'str', 9)).toEqual({
      ok: false,
      error: 'unchanged',
    });
  });

  test('saves a number over a string of the same digits', () => {
    // #then
    expect(patchedRecord('brok', ROW, row({ str: '9' }), 'str', 9)).toEqual({
      ok: true,
      value: { k: 'row:brok:str', d: { str: 9 } },
    });
  });

  test('merges into the cells of a live instance and keeps its order', () => {
    // #then
    expect(
      patchedRecord('brok', REP, rep({ order: 2, cells: { attack: 'Меч' } }), 'bonus', 3),
    ).toEqual({
      ok: true,
      value: { k: 'rep:brok:attack:i1', d: { order: 2, cells: { attack: 'Меч', bonus: 3 } } },
    });
  });

  test.each([
    ['an unknown instance', undefined],
    ['a deleted instance', rep(null)],
  ])('refuses %s', (_name, current) => {
    // #then
    expect(patchedRecord('brok', REP, current, 'bonus', 3)).toEqual({
      ok: false,
      error: 'unknown-instance',
    });
  });
});

describe('patchedRecordFits', () => {
  test('passes a record well under 15000 bytes', () => {
    // #then
    expect(patchedRecordFits({ k: 'row:brok:notes', d: { notes: 'ы'.repeat(1000) } })).toBe(true);
  });

  // With the largest counter and a 64-character author the record holds 131 bytes around the
  // text, and with the 512-byte envelope reserve it must stay under 15000 bytes.
  test('passes the longest text that keeps the record under the limit', () => {
    // #then
    expect(patchedRecordFits({ k: 'row:brok:notes', d: { notes: 'x'.repeat(14356) } })).toBe(true);
  });

  test('refuses one character more', () => {
    // #then
    expect(patchedRecordFits({ k: 'row:brok:notes', d: { notes: 'x'.repeat(14357) } })).toBe(false);
  });

  test('refuses a record over 15000 bytes', () => {
    // #then
    expect(patchedRecordFits({ k: 'row:brok:notes', d: { notes: 'ы'.repeat(7500) } })).toBe(false);
  });
});
