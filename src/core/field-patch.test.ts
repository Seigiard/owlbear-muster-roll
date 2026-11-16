import { fixtureRecord } from '../../tests/support/block-fixtures';
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
const ARMOR = selectField('armor', ['Кожаная', 'Кольчуга']);

function selectField(id: string, options: string[]): PresetFieldCell {
  return { kind: 'field', type: 'select', id, options };
}

function diceChoiceField(id: string, options: string[]): PresetFieldCell {
  return { kind: 'field', type: 'dice-choice', id, options };
}

const TEMPLATE: TemplateLayout = {
  tabs: [
    {
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
    },
  ],
};

function row(d: Record<string, FieldValue> | null): VersionedRecord {
  return fixtureRecord('blk:brok', d, 3, 'seed');
}

function rep(
  d: {
    order: number;
    cells: Record<string, FieldValue>;
  } | null,
): VersionedRecord {
  return fixtureRecord('blk:brok:attack:i1', d, 3, 'seed');
}

describe('patchRecordKey', () => {
  test('names the row record of a row target', () => {
    // #then
    expect(patchRecordKey('brok', { kind: 'row', rowId: 'str' })).toBe('blk:brok');
  });
  test('names the repeat block record of a repeat target', () => {
    // #then
    expect(patchRecordKey('brok', { kind: 'rep', sectionId: 'attack', instanceId: 'i1' })).toBe(
      'blk:brok:attack:i1',
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
  test('a select accepts any non-empty string, including a stale option, and nothing else', () => {
    // #given
    const helperSuccess = capture(() => 'control');

    const helperFailure = capture(() => {
      throw new Error('control error');
    });

    // #when
    const results = {
      listed: capture(() => acceptedFieldValue(ARMOR, 'Кожаная')),
      stale: capture(() => acceptedFieldValue(ARMOR, 'Латы')),
      empty: capture(() => acceptedFieldValue(ARMOR, '')),
      number: capture(() => acceptedFieldValue(ARMOR, 2)),
    };

    // #then
    expect({ helperSuccess, helperFailure, results }).toEqual({
      helperSuccess: { result: 'control' },
      helperFailure: { threw: 'control error' },
      results: {
        listed: { result: { ok: true, value: 'Кожаная' } },
        stale: { result: { ok: true, value: 'Латы' } },
        empty: { result: { ok: false, error: 'invalid-value' } },
        number: { result: { ok: false, error: 'invalid-value' } },
      },
    });
  });
  test('a dice-choice field accepts any non-empty string without checking option membership', () => {
    // #given
    const field = diceChoiceField('weapon_die', ['d6', 'd8']);

    // #when
    const results = {
      listed: capture(() => acceptedFieldValue(field, 'd8')),
      stale: capture(() => acceptedFieldValue(field, 'd12')),
      empty: capture(() => acceptedFieldValue(field, '')),
      number: capture(() => acceptedFieldValue(field, 8)),
    };

    // #then
    expect(results).toEqual({
      listed: { result: { ok: true, value: 'd8' } },
      stale: { result: { ok: true, value: 'd12' } },
      empty: { result: { ok: false, error: 'invalid-value' } },
      number: { result: { ok: false, error: 'invalid-value' } },
    });
  });
});

function capture<Result>(operation: () => Result):
  | {
      result: Result;
    }
  | {
      threw: string;
    } {
  try {
    return { result: operation() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

describe('patchedRecord', () => {
  const ROW = { kind: 'row', rowId: 'str' } as const;
  const REP = { kind: 'rep', sectionId: 'attack', instanceId: 'i1' } as const;
  test('merges the value into the row record and keeps its other fields', () => {
    // #then
    expect(patchedRecord('brok', ROW, row({ str: 9, str_tired: true }), 'str', 12)).toEqual({
      ok: true,
      value: {
        k: 'blk:brok',
        d: {
          order: 0,
          cells: {
            str: [12, Number.MAX_SAFE_INTEGER, 'a'.repeat(64)],
            str_tired: [true, 3, 'seed'],
          },
        },
      },
    });
  });
  test('starts an absent row record empty', () => {
    // #then
    expect(patchedRecord('brok', ROW, undefined, 'str_tired', false)).toEqual({
      ok: true,
      value: {
        k: 'blk:brok',
        d: {
          order: 0,
          cells: { str_tired: [false, Number.MAX_SAFE_INTEGER, 'a'.repeat(64)] },
        },
      },
    });
  });
  test('writes a versioned null for a cleared field', () => {
    // #then
    expect(patchedRecord('brok', ROW, row({ str: 9, str_tired: true }), 'str', null)).toEqual({
      ok: true,
      value: {
        k: 'blk:brok',
        d: {
          order: 0,
          cells: {
            str: [null, Number.MAX_SAFE_INTEGER, 'a'.repeat(64)],
            str_tired: [true, 3, 'seed'],
          },
        },
      },
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
      value: {
        k: 'blk:brok',
        d: {
          order: 0,
          cells: { str: [9, Number.MAX_SAFE_INTEGER, 'a'.repeat(64)] },
        },
      },
    });
  });
  test('merges into the cells of a live instance and keeps its order', () => {
    // #then
    expect(
      patchedRecord('brok', REP, rep({ order: 2, cells: { attack: 'Меч' } }), 'bonus', 3),
    ).toEqual({
      ok: true,
      value: {
        k: 'blk:brok:attack:i1',
        d: {
          order: 2,
          cells: {
            attack: ['Меч', 3, 'seed'],
            bonus: [3, Number.MAX_SAFE_INTEGER, 'a'.repeat(64)],
          },
        },
      },
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
    expect(
      patchedRecordFits({
        k: 'blk:brok',
        d: { order: 0, cells: { notes: ['ы'.repeat(1000), 1, 'seed'] } },
      }),
    ).toBe(true);
  });
  // With the largest counter and a 64-character author the record holds 246 bytes around the
  // text, and with the 512-byte envelope reserve it must stay under 15000 bytes.
  test('passes the longest text that keeps the record under the limit', () => {
    // #then
    expect(
      patchedRecordFits({
        k: 'blk:brok',
        d: { order: 0, cells: { notes: ['x'.repeat(14241), 1, 'seed'] } },
      }),
    ).toBe(true);
  });
  test('refuses one character more', () => {
    // #then
    expect(
      patchedRecordFits({
        k: 'blk:brok',
        d: { order: 0, cells: { notes: ['x'.repeat(14242), 1, 'seed'] } },
      }),
    ).toBe(false);
  });
  test('refuses a record over 15000 bytes', () => {
    // #then
    expect(
      patchedRecordFits({
        k: 'blk:brok',
        d: { order: 0, cells: { notes: ['ы'.repeat(7500), 1, 'seed'] } },
      }),
    ).toBe(false);
  });
});
