import { describe, expect, test } from 'bun:test';

import type { Preset } from '@/core/preset';
import { err } from '@/core/result';
import type { VersionedRecord } from '@/core/records';
import type { SnapshotFile } from '@/core/snapshot-file';
import {
  decodeSnapshotFileData,
  encodeSnapshotFileData,
  importSnapshot,
  parseSnapshotFile,
  type CurrentPreset,
  type SnapshotFileFailure,
} from '@/core/snapshot-import';

// A preset as the 5.3 spec reads it: two non-repeat rows and two repeat sections for a character.
const PRESET: Preset = {
  v: 1,
  character: {
    sections: [
      {
        rows: [
          [
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'field', type: 'check', id: 'tired' },
          ],
          [{ kind: 'field', type: 'text', id: 'notes' }],
        ],
      },
      {
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'attack' },
            { kind: 'field', type: 'number', id: 'bonus' },
          ],
        ],
      },
      {
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'item' },
            { kind: 'field', type: 'number', id: 'weight' },
          ],
        ],
      },
    ],
  },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] },
};

const CURRENT: CurrentPreset = { preset: PRESET, data: 'eJwrSS0uAQAEXQHB' };

const AUTHOR = 'importer';

type SheetInput = Partial<SnapshotFile['sheets'][number]> & { id: string };

function file(sheets: readonly SheetInput[], links: SnapshotFile['links'] = []): SnapshotFile {
  return {
    v: 1,
    type: 'muster-roll/snapshot',
    sheets: sheets.map((sheet) => ({
      kind: 'pc',
      name: sheet.id,
      order: 0,
      rows: {},
      repeats: {},
      ...sheet,
    })),
    links,
  };
}

// The imported records by key, and the count of dropped values.
type Imported = { records: Map<string, VersionedRecord>; count: number };

function imported(input: SnapshotFile): Imported {
  const result = importSnapshot(input, CURRENT, AUTHOR);

  if (!result.ok) {
    throw new Error(`the import failed: ${result.error}`);
  }

  return {
    records: new Map(result.value.records.map((record) => [record.k, record])),
    count: result.value.count,
  };
}

function dataOf(records: ReadonlyMap<string, VersionedRecord>, key: string): VersionedRecord['d'] {
  return records.get(key)?.d ?? null;
}

describe('importSnapshot', () => {
  test('writes every record at c: 1 with the current preset and the file links, and no acl: or plink:', () => {
    // #given
    const input = file(
      [
        { id: 'brok', name: 'Брок', order: 2, rows: { str: { str: 14 } } },
        { id: 'skel', kind: 'npc', name: 'Скелет', rows: { hp: { hp: 7 } } },
      ],
      [
        { tokenId: 't1', sheetId: 'brok' },
        { tokenId: 't2', sheetId: 'skel' },
      ],
    );

    // #when
    const result = importSnapshot(input, CURRENT, AUTHOR);

    // #then
    expect(result).toEqual({
      ok: true,
      value: {
        records: [
          { k: 'link:t1', d: 'brok', c: 1, a: AUTHOR },
          { k: 'link:t2', d: 'skel', c: 1, a: AUTHOR },
          { k: 'preset', d: CURRENT.data, c: 1, a: AUTHOR },
          { k: 'row:brok:str', d: { str: 14 }, c: 1, a: AUTHOR },
          { k: 'row:skel:hp', d: { hp: 7 }, c: 1, a: AUTHOR },
          { k: 'sheet:brok', d: { kind: 'pc', name: 'Брок', order: 2 }, c: 1, a: AUTHOR },
          { k: 'sheet:skel', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: AUTHOR },
        ],
        count: 0,
        digest: expect.any(String),
      },
    });
  });

  test('places a value by field id when the field is now in another row', () => {
    // #given: `notes` was in the row of `str`.
    const input = file([{ id: 'brok', rows: { str: { str: 14, notes: 'Храбрый' } } }]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      str: dataOf(records, 'row:brok:str'),
      notes: dataOf(records, 'row:brok:notes'),
      count,
    }).toEqual({ str: { str: 14 }, notes: { notes: 'Храбрый' }, count: 0 });
  });

  test("takes the value in the field's own row over a stray copy in another row, and drops the copy", () => {
    // #given: the `notes` row sorts first and holds a stray `str`.
    const input = file([
      { id: 'brok', rows: { notes: { notes: 'Храбрый', str: 9 }, str: { str: 3 } } },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      notes: dataOf(records, 'row:brok:notes'),
      str: dataOf(records, 'row:brok:str'),
      count,
    }).toEqual({ notes: { notes: 'Храбрый' }, str: { str: 3 }, count: 1 });
  });

  test('drops and counts a value whose type differs from the current field', () => {
    // #given
    const input = file([{ id: 'brok', rows: { str: { str: 'сильный', tired: true } } }]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({ str: dataOf(records, 'row:brok:str'), count }).toEqual({
      str: { tired: true },
      count: 1,
    });
  });

  test('drops and counts a value whose id the template of the sheet kind does not have', () => {
    // #given: `str` is a character field, not an NPC one.
    const input = file([
      { id: 'brok', rows: { old: { gone: 'x', str: 3 } } },
      { id: 'skel', kind: 'npc', rows: { hp: { hp: 4, str: 9 } } },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      brok: dataOf(records, 'row:brok:str'),
      skel: dataOf(records, 'row:skel:hp'),
      old: records.has('row:brok:old'),
      count,
    }).toEqual({ brok: { str: 3 }, skel: { hp: 4 }, old: false, count: 2 });
  });

  test('drops and counts a value moved across a repeat boundary, either way', () => {
    // #given: `attack` is a repeat field now, `notes` a non-repeat one.
    const input = file([
      {
        id: 'brok',
        rows: { notes: { attack: 'Меч' } },
        repeats: { attack: [{ instanceId: 'i1', order: 0, cells: { attack: 'Лук', notes: 'x' } }] },
      },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      notes: records.has('row:brok:notes'),
      row: dataOf(records, 'rep:brok:attack:i1'),
      count,
    }).toEqual({ notes: false, row: { order: 0, cells: { attack: 'Лук' } }, count: 2 });
  });

  test('keeps a repeat row with its instance id and order in the section that holds its section id', () => {
    // #given
    const input = file([
      {
        id: 'brok',
        repeats: {
          attack: [
            { instanceId: 'i2', order: 5, cells: { attack: 'Топор', bonus: 2 } },
            { instanceId: 'i1', order: 1, cells: {} },
          ],
        },
      },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      i1: dataOf(records, 'rep:brok:attack:i1'),
      i2: dataOf(records, 'rep:brok:attack:i2'),
      count,
    }).toEqual({
      i1: { order: 1, cells: {} },
      i2: { order: 5, cells: { attack: 'Топор', bonus: 2 } },
      count: 0,
    });
  });

  test('maps a section the template does not name to the one that holds most of its field ids', () => {
    // #given: `gear` is no section id now; `item` and `weight` are in the `item` section.
    const input = file([
      {
        id: 'brok',
        repeats: {
          gear: [{ instanceId: 'i1', order: 0, cells: { item: 'Верёвка', weight: 1, bonus: 3 } }],
        },
      },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({ row: dataOf(records, 'rep:brok:item:i1'), count }).toEqual({
      row: { order: 0, cells: { item: 'Верёвка', weight: 1 } },
      count: 1,
    });
  });

  test('does not send a section to the one with its id when no field of the same type is kept there', () => {
    // #given: `item` is a section id, but its `item` field is text and here it holds a number.
    const input = file([
      {
        id: 'brok',
        repeats: { item: [{ instanceId: 'i1', order: 0, cells: { item: 5, bonus: 1 } }] },
      },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({ attack: dataOf(records, 'rep:brok:attack:i1'), count }).toEqual({
      attack: { order: 0, cells: { bonus: 1 } },
      count: 1,
    });
  });

  test('breaks a tie between sections by template order', () => {
    // #given: one id of each section.
    const input = file([
      {
        id: 'brok',
        repeats: { mixed: [{ instanceId: 'i1', order: 0, cells: { bonus: 1, weight: 2 } }] },
      },
    ]);

    // #when
    const { records } = imported(input);

    // #then
    expect(dataOf(records, 'rep:brok:attack:i1')).toEqual({ order: 0, cells: { bonus: 1 } });
  });

  test('drops and counts every value of a section no current section holds', () => {
    // #given
    const input = file([
      {
        id: 'brok',
        repeats: {
          spells: [
            { instanceId: 'i1', order: 0, cells: { spell: 'Огонь', level: 1 } },
            { instanceId: 'i2', order: 1, cells: { spell: 'Лёд' } },
          ],
        },
      },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      keys: [...records.keys()].filter((key) => key.startsWith('rep:')),
      count,
    }).toEqual({ keys: [], count: 3 });
  });

  test('merges two file sections into one with orders shifted after the highest, own section first', () => {
    // #given: `gear` maps to `item` too.
    const input = file([
      {
        id: 'brok',
        repeats: {
          gear: [
            { instanceId: 'g1', order: 0, cells: { weight: 4 } },
            { instanceId: 'i1', order: 1, cells: { weight: 9 } },
          ],
          item: [
            { instanceId: 'i1', order: 0, cells: { item: 'Фляга' } },
            { instanceId: 'i2', order: 3, cells: { item: 'Нож' } },
          ],
        },
      },
    ]);

    // #when
    const { records, count } = imported(input);

    // #then: `i1` of `gear` collides with `item`'s own and is dropped with its value.
    expect({
      i1: dataOf(records, 'rep:brok:item:i1'),
      i2: dataOf(records, 'rep:brok:item:i2'),
      g1: dataOf(records, 'rep:brok:item:g1'),
      count,
    }).toEqual({
      i1: { order: 0, cells: { item: 'Фляга' } },
      i2: { order: 3, cells: { item: 'Нож' } },
      g1: { order: 4, cells: { weight: 4 } },
      count: 1,
    });
  });

  test('gives the same digest for the same dropped values and another for others', () => {
    // #given
    const first = file([{ id: 'brok', rows: { x: { gone: 1 } } }]);
    const same = file([{ id: 'brok', rows: { x: { gone: 1 } } }]);
    const other = file([{ id: 'brok', rows: { x: { lost: 1 } } }]);

    // #when
    const digests = [first, same, other].map((input) => {
      const result = importSnapshot(input, CURRENT, AUTHOR);

      return result.ok ? result.value.digest : null;
    });

    // #then
    expect([digests[0] === digests[1], digests[0] === digests[2]]).toEqual([true, false]);
  });

  test('refuses a sheet name the sheet name rules refuse as a bad structure', () => {
    // #given
    const input = file([{ id: 'brok', name: '   ' }]);

    // #when
    const result = importSnapshot(input, CURRENT, AUTHOR);

    // #then
    expect(result).toEqual({ ok: false, error: 'invalid-structure' });
  });

  test('refuses a record that does not fit one message as too large', () => {
    // #given
    const input = file([{ id: 'brok', rows: { notes: { notes: 'я'.repeat(9000) } } }]);

    // #when
    const result = importSnapshot(input, CURRENT, AUTHOR);

    // #then
    expect(result).toEqual({ ok: false, error: 'too-large' });
  });
});

describe('parseSnapshotFile', () => {
  const valid = file(
    [{ id: 'brok', rows: { str: { str: 1 } } }],
    [{ tokenId: 't1', sheetId: 'brok' }],
  );

  test('reads a file of the 5.2 format', () => {
    // #when
    const parsed = parseSnapshotFile(JSON.stringify(valid));

    // #then
    expect(parsed).toEqual({ ok: true, value: valid });
  });

  test.each([
    ['not JSON', '{', 'not-json'],
    ['a newer v, whatever its shape', '{"v":2,"sheets":7}', 'newer-version'],
    [
      'a lower v',
      '{"v":0,"type":"muster-roll/snapshot","sheets":[],"links":[]}',
      'unsupported-version',
    ],
    ['no v', '{"type":"muster-roll/snapshot"}', 'unsupported-version'],
    ['a preset file', '{"v":1,"character":{"sections":[]},"npc":{"sections":[]}}', 'not-snapshot'],
    ['an object of another type with no v', '{"type":"other/thing"}', 'not-snapshot'],
    ['an array', '[]', 'invalid-structure'],
    [
      'a wrong shape',
      '{"v":1,"type":"muster-roll/snapshot","sheets":{},"links":[]}',
      'invalid-structure',
    ],
    [
      'a link to no sheet of the file',
      '{"v":1,"type":"muster-roll/snapshot","sheets":[],"links":[{"tokenId":"t","sheetId":"x"}]}',
      'invalid-structure',
    ],
  ] satisfies [string, string, SnapshotFileFailure][])('refuses %s', (_name, text, failure) => {
    // #when
    const parsed = parseSnapshotFile(text);

    // #then
    expect(parsed).toEqual(err(failure));
  });

  test('refuses a file over 1 MiB as too large before it reads JSON', () => {
    // #given
    const text = ' '.repeat(1024 * 1024 + 1);

    // #when
    const parsed = parseSnapshotFile(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: 'too-large' });
  });

  test('reads a file saved with a byte order mark', () => {
    // #when
    const parsed = parseSnapshotFile(`\uFEFF${JSON.stringify(valid)}`);

    // #then
    expect(parsed).toEqual({ ok: true, value: valid });
  });

  test('round-trips through the data a window sends', () => {
    // #when
    const decoded = decodeSnapshotFileData(encodeSnapshotFileData(valid));

    // #then
    expect(decoded).toEqual({ ok: true, value: valid });
  });

  test('refuses data that does not inflate as a bad structure', () => {
    // #when
    const decoded = decodeSnapshotFileData('bm90IGRlZmxhdGU=');

    // #then
    expect(decoded).toEqual({ ok: false, error: 'invalid-structure' });
  });
});
