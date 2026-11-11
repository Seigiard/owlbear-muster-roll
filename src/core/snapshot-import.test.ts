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

// A preset as the 5.3 spec reads it, on v2 templates: a sheet set `pc` with two non-repeat rows
// and two repeat sections, and a single sheet `npc` with a row and a linkable repeat section whose
// blocks span two rows.
const PRESET: Preset = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'notes',
      tokens: true,
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
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      sections: [
        { rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] },
        {
          repeat: true,
          tokens: true,
          rows: [
            [
              { kind: 'field', type: 'text', id: 'npc_name' },
              { kind: 'field', type: 'number', id: 'ac' },
            ],
            [{ kind: 'field', type: 'number', id: 'might' }],
          ],
        },
      ],
    },
  ],
};

const CURRENT: CurrentPreset = { preset: PRESET, data: 'eJwrSS0uAQAEXQHB' };

const AUTHOR = 'importer';

type SnapshotSheet = SnapshotFile['sheets'][number];

type SheetParts = Partial<Pick<SnapshotSheet, 'order' | 'rows' | 'repeats'>>;

// A sheet of the sheet set `pc`.
function pc(id: string, parts: SheetParts = {}): SnapshotSheet {
  return {
    id,
    set: 'pc',
    order: parts.order ?? 0,
    rows: parts.rows ?? {},
    repeats: parts.repeats ?? {},
  };
}

// A single sheet, whose id is its template id.
function single(id: string, parts: SheetParts = {}): SnapshotSheet {
  return { id, rows: parts.rows ?? {}, repeats: parts.repeats ?? {} };
}

function file(sheets: readonly SnapshotSheet[], links: SnapshotFile['links'] = []): SnapshotFile {
  return { v: 2, type: 'muster-roll/snapshot', sheets: [...sheets], links };
}

// The imported records by key, and the counts of dropped values and dropped sheets.
type Imported = { records: Map<string, VersionedRecord>; count: number; sheets: number };

function imported(input: SnapshotFile): Imported {
  const result = importSnapshot(input, CURRENT, AUTHOR);

  if (!result.ok) {
    throw new Error(`the import failed: ${result.error}`);
  }

  return {
    records: new Map(result.value.records.map((record) => [record.k, record])),
    count: result.value.count,
    sheets: result.value.sheets,
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
        pc('brok', { order: 2, rows: { str: { str: 14 } } }),
        single('npc', {
          rows: { hp: { hp: 7 } },
          repeats: { npc_name: [{ instanceId: 'n1', order: 0, cells: { npc_name: 'Волк' } }] },
        }),
      ],
      [
        { tokenId: 't1', sheetId: 'brok' },
        { tokenId: 't2', sheetId: 'npc', instanceId: 'n1' },
      ],
    );

    // #when
    const result = importSnapshot(input, CURRENT, AUTHOR);

    // #then
    expect(result).toEqual({
      ok: true,
      value: {
        records: [
          { k: 'link:t1', d: { s: 'brok' }, c: 1, a: AUTHOR },
          { k: 'link:t2', d: { s: 'npc', i: 'n1' }, c: 1, a: AUTHOR },
          { k: 'preset', d: CURRENT.data, c: 1, a: AUTHOR },
          {
            k: 'rep:npc:npc_name:n1',
            d: { order: 0, cells: { npc_name: 'Волк' } },
            c: 1,
            a: AUTHOR,
          },
          { k: 'row:brok:str', d: { str: 14 }, c: 1, a: AUTHOR },
          { k: 'row:npc:hp', d: { hp: 7 }, c: 1, a: AUTHOR },
          { k: 'sheet:brok', d: { set: 'pc', order: 2 }, c: 1, a: AUTHOR },
        ],
        count: 0,
        sheets: 0,
        digest: expect.any(String),
      },
    });
  });

  test('places a value by field id when the field is now in another row', () => {
    // #given: `notes` was in the row of `str`.
    const input = file([pc('brok', { rows: { str: { str: 14, notes: 'Храбрый' } } })]);

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
      pc('brok', { rows: { notes: { notes: 'Храбрый', str: 9 }, str: { str: 3 } } }),
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
    const input = file([pc('brok', { rows: { str: { str: 'сильный', tired: true } } })]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({ str: dataOf(records, 'row:brok:str'), count }).toEqual({
      str: { tired: true },
      count: 1,
    });
  });

  test('drops and counts a value whose id the template of the sheet does not have', () => {
    // #given: `str` is a field of the sheet set, not of the NPC sheet.
    const input = file([
      pc('brok', { rows: { old: { gone: 'x', str: 3 } } }),
      single('npc', { rows: { hp: { hp: 4, str: 9 } } }),
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      brok: dataOf(records, 'row:brok:str'),
      npc: dataOf(records, 'row:npc:hp'),
      old: records.has('row:brok:old'),
      count,
    }).toEqual({ brok: { str: 3 }, npc: { hp: 4 }, old: false, count: 2 });
  });

  test('drops and counts a value moved across a repeat boundary, either way', () => {
    // #given: `attack` is a repeat field now, `notes` a non-repeat one.
    const input = file([
      pc('brok', {
        rows: { notes: { attack: 'Меч' } },
        repeats: { attack: [{ instanceId: 'i1', order: 0, cells: { attack: 'Лук', notes: 'x' } }] },
      }),
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      notes: records.has('row:brok:notes'),
      block: dataOf(records, 'rep:brok:attack:i1'),
      count,
    }).toEqual({ notes: false, block: { order: 0, cells: { attack: 'Лук' } }, count: 2 });
  });

  test('keeps a repeat block with its instance id and order in the section that holds its section id', () => {
    // #given
    const input = file([
      pc('brok', {
        repeats: {
          attack: [
            { instanceId: 'i2', order: 5, cells: { attack: 'Топор', bonus: 2 } },
            { instanceId: 'i1', order: 1, cells: {} },
          ],
        },
      }),
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

  test('keeps the values of every row of a repeat block in one record', () => {
    // #given: `npc_name` and `ac` are in the first row of the block, `might` in the second.
    const input = file([
      single('npc', {
        repeats: {
          npc_name: [{ instanceId: 'n1', order: 0, cells: { npc_name: 'Волк', ac: 12, might: 3 } }],
        },
      }),
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({ block: dataOf(records, 'rep:npc:npc_name:n1'), count }).toEqual({
      block: { order: 0, cells: { ac: 12, might: 3, npc_name: 'Волк' } },
      count: 0,
    });
  });

  test('maps a section the template does not name to the one that holds most of its field ids', () => {
    // #given: `gear` is no section id now; `item` and `weight` are in the `item` section.
    const input = file([
      pc('brok', {
        repeats: {
          gear: [{ instanceId: 'i1', order: 0, cells: { item: 'Верёвка', weight: 1, bonus: 3 } }],
        },
      }),
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({ block: dataOf(records, 'rep:brok:item:i1'), count }).toEqual({
      block: { order: 0, cells: { item: 'Верёвка', weight: 1 } },
      count: 1,
    });
  });

  test('does not send a section to the one with its id when no field of the same type is kept there', () => {
    // #given: `item` is a section id, but its `item` field is text and here it holds a number.
    const input = file([
      pc('brok', {
        repeats: { item: [{ instanceId: 'i1', order: 0, cells: { item: 5, bonus: 1 } }] },
      }),
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
      pc('brok', {
        repeats: { mixed: [{ instanceId: 'i1', order: 0, cells: { bonus: 1, weight: 2 } }] },
      }),
    ]);

    // #when
    const { records } = imported(input);

    // #then
    expect(dataOf(records, 'rep:brok:attack:i1')).toEqual({ order: 0, cells: { bonus: 1 } });
  });

  test('drops and counts every value of a section no current section holds', () => {
    // #given
    const input = file([
      pc('brok', {
        repeats: {
          spells: [
            { instanceId: 'i1', order: 0, cells: { spell: 'Огонь', level: 1 } },
            { instanceId: 'i2', order: 1, cells: { spell: 'Лёд' } },
          ],
        },
      }),
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
      pc('brok', {
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
      }),
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

  test('drops and counts a repeat block whose instance id an earlier section of the sheet took', () => {
    // #given: AD-2 makes an instance id unique in its sheet; `attack` comes first in the template.
    const input = file([
      pc('brok', {
        repeats: {
          attack: [{ instanceId: 'i1', order: 0, cells: { attack: 'Меч' } }],
          item: [{ instanceId: 'i1', order: 0, cells: { item: 'Верёвка', weight: 1 } }],
        },
      }),
    ]);

    // #when
    const { records, count } = imported(input);

    // #then
    expect({
      attack: dataOf(records, 'rep:brok:attack:i1'),
      item: records.has('rep:brok:item:i1'),
      count,
    }).toEqual({ attack: { order: 0, cells: { attack: 'Меч' } }, item: false, count: 2 });
  });

  test('drops every sheet no template owns with its values and links, counting sheets apart', () => {
    // #given: a set no template has, an id no single sheet has, a set sheet under a template id,
    // and a set that names a single sheet.
    const input = file(
      [
        { id: 'x', set: 'monsters', order: 0, rows: { a: { a: 1 } }, repeats: {} },
        single('ghost', {
          repeats: { g: [{ instanceId: 'i1', order: 0, cells: { g: 'x', h: 2 } }] },
        }),
        pc('npc'),
        { id: 's2', set: 'npc', order: 0, rows: {}, repeats: {} },
        pc('brok'),
      ],
      [
        { tokenId: 't1', sheetId: 'x' },
        { tokenId: 't2', sheetId: 'ghost', instanceId: 'i1' },
        { tokenId: 't3', sheetId: 'npc' },
        { tokenId: 't4', sheetId: 'brok' },
      ],
    );

    // #when
    const { records, count, sheets } = imported(input);

    // #then
    expect({ keys: [...records.keys()], count, sheets }).toEqual({
      keys: ['link:t4', 'preset', 'sheet:brok'],
      count: 3,
      sheets: 4,
    });
  });

  test('gives the same digest for the same dropped values and another for others', () => {
    // #given
    const first = file([pc('brok', { rows: { x: { gone: 1 } } })]);
    const same = file([pc('brok', { rows: { x: { gone: 1 } } })]);
    const other = file([pc('brok', { rows: { x: { lost: 1 } } })]);

    // #when
    const digests = [first, same, other].map((input) => {
      const result = importSnapshot(input, CURRENT, AUTHOR);

      return result.ok ? result.value.digest : null;
    });

    // #then
    expect([digests[0] === digests[1], digests[0] === digests[2]]).toEqual([true, false]);
  });

  test('gives another digest for another dropped sheet with no values', () => {
    // #given
    const first = file([single('ghost')]);
    const other = file([single('phantom')]);

    // #when
    const results = [first, other].map((input) => imported(input));

    const digests = [first, other].map((input) => {
      const result = importSnapshot(input, CURRENT, AUTHOR);

      return result.ok ? result.value.digest : null;
    });

    // #then
    expect({
      counts: results.map(({ count, sheets }) => [count, sheets]),
      same: digests[0] === digests[1],
    }).toEqual({
      counts: [
        [0, 1],
        [0, 1],
      ],
      same: false,
    });
  });

  test('refuses a record that does not fit one message as too large', () => {
    // #given
    const input = file([pc('brok', { rows: { notes: { notes: 'я'.repeat(9000) } } })]);

    // #when
    const result = importSnapshot(input, CURRENT, AUTHOR);

    // #then
    expect(result).toEqual({ ok: false, error: 'too-large' });
  });
});

describe('parseSnapshotFile', () => {
  const valid = file(
    [pc('brok', { rows: { str: { str: 1 } } }), single('npc')],
    [{ tokenId: 't1', sheetId: 'brok' }],
  );

  test('reads a file of the v2 format', () => {
    // #when
    const parsed = parseSnapshotFile(JSON.stringify(valid));

    // #then
    expect(parsed).toEqual({ ok: true, value: valid });
  });

  test.each([
    ['not JSON', '{', 'not-json'],
    ['a newer v, whatever its shape', '{"v":3,"sheets":7}', 'newer-version'],
    [
      'a v1 snapshot file',
      '{"v":1,"type":"muster-roll/snapshot","sheets":[],"links":[]}',
      'unsupported-version',
    ],
    [
      'a lower v',
      '{"v":0,"type":"muster-roll/snapshot","sheets":[],"links":[]}',
      'unsupported-version',
    ],
    ['no v', '{"type":"muster-roll/snapshot"}', 'unsupported-version'],
    ['a preset file', '{"v":2,"templates":[]}', 'not-snapshot'],
    ['an object of another type with no v', '{"type":"other/thing"}', 'not-snapshot'],
    ['an array', '[]', 'invalid-structure'],
    [
      'a wrong shape',
      '{"v":2,"type":"muster-roll/snapshot","sheets":{},"links":[]}',
      'invalid-structure',
    ],
    [
      'a link to no sheet of the file',
      '{"v":2,"type":"muster-roll/snapshot","sheets":[],"links":[{"tokenId":"t","sheetId":"x"}]}',
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
    const parsed = parseSnapshotFile(`﻿${JSON.stringify(valid)}`);

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
