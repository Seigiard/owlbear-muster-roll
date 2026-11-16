import { assembleRecords } from '@/core/merge';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { PresetCell } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import {
  cellLabel,
  isChecked,
  repeatBlocks,
  rowValues,
  sectionTitle,
  valueText,
} from './sheet-values';

const STRENGTH: PresetCell = { kind: 'text', text: 'Сила' };
const STR: PresetCell = { kind: 'field', type: 'number', id: 'str' };
const TIRED: PresetCell = { kind: 'field', type: 'check', id: 'str_tired' };
const ROLL: PresetCell = { kind: 'dice', formula: '1d20 <= str' };

function recordsOf(...records: VersionedRecord[]): ReadonlyMap<string, VersionedRecord> {
  return assembleRecords(records);
}

function rep(key: string, order: number, cells: Record<string, string>): VersionedRecord {
  return fixtureRecord(key, { order, cells }, 1, 'seed');
}

function blockIds(records: ReadonlyMap<string, VersionedRecord>): string[] {
  return repeatBlocks(records, 'brok', 'attack').map((block) => block.instanceId);
}

describe('rowValues', () => {
  test('reads the row record of this sheet by the row id', () => {
    // #given
    const records = recordsOf({
      k: 'blk:brok',
      d: { order: 0, cells: { str: [14, 2, 'seed'], str_tired: [true, 2, 'seed'] } },
      c: 2,
      a: 'seed',
      l: [1, 'seed'],
    });

    // #when
    const values = rowValues(records, 'brok', 'str');
    // #then
    expect([...values]).toEqual([
      ['str', 14],
      ['str_tired', true],
    ]);
  });
  test('reads nothing for a row with no record', () => {
    // #when
    const values = rowValues(recordsOf(), 'brok', 'str');
    // #then
    expect(values.size).toBe(0);
  });
  test('reads a tombstone as no values', () => {
    // #given
    const records = recordsOf({ k: 'blk:brok', d: null, c: 3, a: 'seed', l: [1, 'seed'] });
    // #when
    const values = rowValues(records, 'brok', 'str');
    // #then
    expect(values.size).toBe(0);
  });
  test('reads nothing for a row with no field', () => {
    // #given
    const records = recordsOf({
      k: 'blk:brok',
      d: { order: 0, cells: { str: [14, 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    });

    // #when
    const values = rowValues(records, 'brok', null);
    // #then
    expect(values.size).toBe(0);
  });
  test("never reads another sheet's row", () => {
    // #given
    const records = recordsOf({
      k: 'blk:liza',
      d: { order: 0, cells: { str: [9, 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    });

    // #when
    const values = rowValues(records, 'brok', 'str');
    // #then
    expect(values.size).toBe(0);
  });
});

describe('repeatBlocks', () => {
  test('orders repeat blocks by order, then by instance id in code units', () => {
    // #given
    const records = recordsOf(
      rep('blk:brok:attack:zed', 1, { attack: 'Лук' }),
      rep('blk:brok:attack:b', 2, { attack: 'Нож' }),
      rep('blk:brok:attack:a', 2, { attack: 'Меч' }),
      rep('blk:brok:attack:Z', 1, { attack: 'Топор' }),
    );

    // #when
    const ids = blockIds(records);
    // #then
    expect(ids).toEqual(['Z', 'zed', 'a', 'b']);
  });
  test('carries the order and the cell values of each repeat block', () => {
    // #given
    const records = recordsOf(rep('blk:brok:attack:i1', 0, { attack: 'Меч', bonus: 'x' }));
    // #when
    const [block] = repeatBlocks(records, 'brok', 'attack');
    // #then
    expect({ order: block?.order, values: [...(block?.values ?? [])] }).toEqual({
      order: 0,
      values: [
        ['attack', 'Меч'],
        ['bonus', 'x'],
      ],
    });
  });
  test("leaves out another sheet's repeat blocks, including a sheet whose id starts with this one", () => {
    // #given
    const records = recordsOf(
      rep('blk:brok:attack:mine', 0, { attack: 'Меч' }),
      rep('blk:liza:attack:other', 0, { attack: 'Лук' }),
      rep('blk:brokx:attack:prefix', 0, { attack: 'Нож' }),
    );

    // #when
    const ids = blockIds(records);
    // #then
    expect(ids).toEqual(['mine']);
  });
  test("leaves out another section's repeat blocks, including a section whose id starts with this one", () => {
    // #given
    const records = recordsOf(
      rep('blk:brok:attack:mine', 0, { attack: 'Меч' }),
      rep('blk:brok:item:other', 0, { item: 'Верёвка' }),
      rep('blk:brok:attack_x:prefix', 0, { attack_x: 'Нож' }),
    );

    // #when
    const ids = blockIds(records);
    // #then
    expect(ids).toEqual(['mine']);
  });
  test('leaves out a tombstoned repeat block', () => {
    // #given
    const records = recordsOf(rep('blk:brok:attack:live', 0, { attack: 'Меч' }), {
      k: 'blk:brok:attack:gone',
      d: null,
      c: 2,
      a: 'seed',
      l: [1, 'seed'],
    });

    // #when
    const ids = blockIds(records);
    // #then
    expect(ids).toEqual(['live']);
  });
});

describe('cellLabel', () => {
  test('a text cell shows its own text', () => {
    // #when
    const label = cellLabel({ kind: 'text', text: 'Ловкость' }, [STRENGTH]);
    // #then
    expect(label).toBe('Ловкость');
  });
  test('a field after a text cell is named by that text', () => {
    // #when
    const label = cellLabel(STR, [STRENGTH]);
    // #then
    expect(label).toBe('Сила');
  });
  test('a named field uses its cell name instead of the preceding text', () => {
    // #given
    const field: PresetCell = { ...STR, name: 'STR, максимум' };
    // #when
    const label = cellLabel(field, [STRENGTH]);
    // #then
    expect(label).toBe('STR, максимум');
  });
  test('a named dice cell uses its cell name instead of the preceding text', () => {
    // #given
    const dice: PresetCell = { ...ROLL, name: 'Спасбросок STR' };
    // #when
    const label = cellLabel(dice, [STRENGTH]);
    // #then
    expect(label).toBe('Спасбросок STR');
  });
  test('a field takes the nearest preceding text cell, past other fields', () => {
    // #when
    const label = cellLabel(TIRED, [{ kind: 'text', text: 'Хиты' }, STRENGTH, STR]);
    // #then
    expect(label).toBe('Сила');
  });
  test('a field first in its row is named by its id', () => {
    // #when
    const label = cellLabel(STR, []);
    // #then
    expect(label).toBe('str');
  });
  test('a field after a field only is named by its id', () => {
    // #when
    const label = cellLabel(TIRED, [STR]);
    // #then
    expect(label).toBe('str_tired');
  });
  test('a dice cell after a text cell shows that text', () => {
    // #when
    const label = cellLabel(ROLL, [STRENGTH, STR, TIRED]);
    // #then
    expect(label).toBe('Сила');
  });
  test('a field skips a blank text cell for the text before it', () => {
    // #when
    const label = cellLabel(STR, [STRENGTH, { kind: 'text', text: '  ' }]);
    // #then
    expect(label).toBe('Сила');
  });
  test('a field after a blank text cell only is named by its id', () => {
    // #when
    const label = cellLabel(STR, [{ kind: 'text', text: '' }]);
    // #then
    expect(label).toBe('str');
  });
  test('a dice cell after a blank text cell only shows its formula', () => {
    // #when
    const label = cellLabel(ROLL, [{ kind: 'text', text: ' \n' }]);
    // #then
    expect(label).toBe('1d20 <= str');
  });
  test('a dice cell with no preceding text cell shows its formula', () => {
    // #when
    const label = cellLabel(ROLL, [STR]);
    // #then
    expect(label).toBe('1d20 <= str');
  });
});

describe('sectionTitle', () => {
  test('is the title as written', () => {
    // #when
    const title = sectionTitle({ title: 'Атаки', rows: [] });
    // #then
    expect(title).toBe('Атаки');
  });
  test.each([
    ['no title', undefined],
    ['an empty title', ''],
    ['a title of spaces', '  \t'],
  ] as const)('is none for %s', (_name, written) => {
    // #when
    const title = sectionTitle(written === undefined ? { rows: [] } : { title: written, rows: [] });
    // #then
    expect(title).toBeNull();
  });
});

describe('valueText', () => {
  test.each([
    ['a text value as it is', 'Воин\nстраж', 'Воин\nстраж'],
    ['a number in its decimal form', 14, '14'],
    ['a negative fraction in its decimal form', -2.5, '-2.5'],
    ['a value of another type as text', true, 'true'],
    ['no value as an empty area', undefined, ''],
  ] as const)('shows %s', (_name, value, shown) => {
    // #when
    const text = valueText(value);
    // #then
    expect(text).toBe(shown);
  });
});

describe('isChecked', () => {
  test.each([
    [true, true],
    [false, false],
    ['true', false],
    [1, false],
    [undefined, false],
  ] as const)('%j checks the box: %j', (value, checked) => {
    // #when
    const result = isChecked(value);
    // #then
    expect(result).toBe(checked);
  });
});
