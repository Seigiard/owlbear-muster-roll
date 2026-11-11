import { describe, expect, test } from 'bun:test';

import { randomFaces } from '@/core/formula-evaluate';
import type { PresetTemplate } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';

import { rollDiceCell, type DicePlace, type ShownValue } from './dice-roll';

// Every 1d20 shows 7: floor(0.3 * 20) + 1.
const SEVEN = (): number => 0.3;

const TEMPLATE: PresetTemplate = {
  sections: [
    {
      rows: [
        [
          { kind: 'text', text: 'Сила' },
          { kind: 'field', type: 'number', id: 'str' },
          { kind: 'field', type: 'check', id: 'str_tired' },
          { kind: 'dice', formula: '1d20 <= str - 2*str_tired' },
        ],
        [
          { kind: 'field', type: 'number', id: 'dex' },
          { kind: 'dice', formula: '1d20 + dex' },
        ],
        [
          { kind: 'text', text: 'Деление' },
          { kind: 'dice', formula: 'str / (str - str)' },
        ],
        [
          { kind: 'text', text: 'Чужое' },
          { kind: 'dice', formula: '1d20 + bonus' },
        ],
      ],
    },
    {
      repeat: true,
      rows: [
        [
          { kind: 'text', text: 'Атака' },
          { kind: 'field', type: 'text', id: 'attack' },
          { kind: 'field', type: 'number', id: 'bonus' },
          { kind: 'dice', formula: '1d20 + bonus + str' },
        ],
      ],
    },
  ],
};

const ROWS: VersionedRecord[] = [
  { k: 'row:brok:str', d: { str: 14, str_tired: true }, c: 1, a: 'gm' },
  { k: 'rep:brok:attack:i1', d: { order: 0, cells: { attack: 'Меч', bonus: 3 } }, c: 1, a: 'gm' },
];

const RECORDS: ReadonlyMap<string, VersionedRecord> = new Map(
  ROWS.map((record) => [record.k, record]),
);

const STRENGTH: DicePlace = { sectionIndex: 0, rowIndex: 0, cellIndex: 3, instanceId: null };

const ATTACK: DicePlace = { sectionIndex: 1, rowIndex: 0, cellIndex: 3, instanceId: 'i1' };

function roll(place: DicePlace, shown: [string, ShownValue][] = []) {
  return rollDiceCell(TEMPLATE, RECORDS, 'brok', place, new Map(shown), randomFaces(SEVEN));
}

describe('rollDiceCell', () => {
  test('rolls from the records and labels the roll by the cell', () => {
    // #when
    const rolled = roll(STRENGTH);

    // #then
    expect(rolled).toEqual({
      ok: true,
      value: {
        cell: 'Сила',
        result: { roll: 7, faces: [7], target: 12, targetFaces: [], outcome: 'success' },
      },
    });
  });

  test('uses the text a field shows over its record', () => {
    // #when
    const rolled = roll(STRENGTH, [['str', { kind: 'text', text: '16' }]]);

    // #then
    expect(rolled.ok && rolled.value.result.target).toBe(14);
  });

  test('uses the text a repeat row shows over its own instance', () => {
    // #when
    const rolled = roll(ATTACK, [['bonus', { kind: 'text', text: '5' }]]);

    // #then
    expect(rolled).toEqual({
      ok: true,
      value: {
        cell: 'Атака',
        result: { roll: 26, faces: [7], target: null, targetFaces: [], outcome: null },
      },
    });
  });

  test.each<[string, DicePlace, [string, ShownValue][], string]>([
    ['a field shown in an input error', STRENGTH, [['str', { kind: 'error' }]], 'Сила'],
    ['a field shown empty', STRENGTH, [['str', { kind: 'text', text: '' }]], 'Сила'],
    [
      'a field shown as text that is no number',
      STRENGTH,
      [['str', { kind: 'text', text: '1x' }]],
      'Сила',
    ],
    [
      'an empty field with no text before it, by its id',
      { ...STRENGTH, rowIndex: 1, cellIndex: 1 },
      [],
      'dex',
    ],
    [
      'a plain field a repeat row reads, by its label in the plain section',
      ATTACK,
      [['str', { kind: 'error' }]],
      'Сила',
    ],
    [
      'an id that only a repeat row holds, by the id',
      { ...STRENGTH, rowIndex: 3, cellIndex: 1 },
      [],
      'bonus',
    ],
  ])('names %s in the field error', (_name, place, shown, field) => {
    // #when
    const rolled = roll(place, shown);

    // #then
    expect(rolled).toEqual({ ok: false, error: { code: 'field', field } });
  });

  test('gives the arithmetic error with no field for a division by zero', () => {
    // #when
    const rolled = roll({ ...STRENGTH, rowIndex: 2, cellIndex: 1 });

    // #then
    expect(rolled).toEqual({ ok: false, error: { code: 'arithmetic' } });
  });

  test.each<[string, DicePlace]>([
    ['a cell that is a field', { ...STRENGTH, cellIndex: 1 }],
    ['a row past the section', { ...STRENGTH, rowIndex: 9 }],
    ['a repeat row that is gone', { ...ATTACK, instanceId: 'gone' }],
    ['a repeat row named with no instance', { ...ATTACK, instanceId: null }],
    ['a plain row named with an instance', { ...STRENGTH, instanceId: 'i1' }],
  ])('refuses %s', (_name, place) => {
    // #when
    const rolled = roll(place);

    // #then
    expect(rolled).toEqual({ ok: false, error: { code: 'not-dice' } });
  });
});
