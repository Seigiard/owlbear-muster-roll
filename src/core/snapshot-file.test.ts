import { describe, expect, test } from 'bun:test';

import type { JsonObject, JsonValue } from '@/core/json';
import { parseRecord, type VersionedRecord } from '@/core/records';
import {
  encodeSnapshotFile,
  formatSnapshotFile,
  snapshotFileName,
  snapshotFileSchema,
} from '@/core/snapshot-file';

describe('encodeSnapshotFile', () => {
  test('holds every live sheet with its rows, repeat rows and links, and nothing else', () => {
    // #given
    const records = byKey([
      record('preset', 'eJwrSS0uAQAEXQHB', 4),
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 1 }, 3),
      record('sheet:anya', { kind: 'pc', name: 'Аня', order: 0 }),
      record('sheet:skel', { kind: 'npc', name: 'Скелет', order: 0 }),
      record('row:brok:str', { str_tired: false, str: 14 }, 5),
      record('row:brok:class', { level: 3, class: 'Воин' }),
      record('rep:brok:attack:i2', { order: 1, cells: { bonus: 2, attack: 'Топор' } }),
      record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
      record('row:skel:hp', { hp: 7 }),
      record('acl:brok:lisa', { name: 'Лиза' }),
      record('plink:brok:lisa', { name: 'Лиза' }),
      record('link:t1', 'brok', 2),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file).toEqual({
      v: 1,
      type: 'muster-roll/snapshot',
      sheets: [
        { id: 'anya', kind: 'pc', name: 'Аня', order: 0, rows: {}, repeats: {} },
        {
          id: 'skel',
          kind: 'npc',
          name: 'Скелет',
          order: 0,
          rows: { hp: { hp: 7 } },
          repeats: {},
        },
        {
          id: 'brok',
          kind: 'pc',
          name: 'Брок',
          order: 1,
          rows: { class: { class: 'Воин', level: 3 }, str: { str: 14, str_tired: false } },
          repeats: {
            attack: [
              { instanceId: 'i1', order: 0, cells: { attack: 'Меч' } },
              { instanceId: 'i2', order: 1, cells: { attack: 'Топор', bonus: 2 } },
            ],
          },
        },
      ],
      links: [{ tokenId: 't1', sheetId: 'brok' }],
    });
  });

  test('gives an empty sheet list and no links for a room with a preset and no sheets', () => {
    // #given
    const records = byKey([record('preset', 'eJwrSS0uAQAEXQHB')]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file).toEqual({ v: 1, type: 'muster-roll/snapshot', sheets: [], links: [] });
  });

  test('leaves out a deleted sheet and the live rows it left behind', () => {
    // #given
    const records = byKey([
      record('sheet:gone', null, 2),
      record('row:gone:str', { str: 9 }),
      record('rep:gone:attack:i1', { order: 0, cells: { attack: 'Лук' } }),
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file.sheets).toEqual([
      { id: 'brok', kind: 'pc', name: 'Брок', order: 0, rows: {}, repeats: {} },
    ]);
  });

  test('leaves out rows with no sheet record, and tombstoned rows of a live sheet', () => {
    // #given
    const records = byKey([
      record('row:ghost:str', { str: 9 }),
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
      record('row:brok:str', null, 2),
      record('rep:brok:attack:i1', null, 2),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file.sheets).toEqual([
      { id: 'brok', kind: 'pc', name: 'Брок', order: 0, rows: {}, repeats: {} },
    ]);
  });

  test('writes a row record with no values as an empty row', () => {
    // #given
    const records = byKey([
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
      record('row:brok:str', {}),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file.sheets[0]?.rows).toEqual({ str: {} });
  });

  test('leaves out a section whose repeat rows are all tombstoned', () => {
    // #given
    const records = byKey([
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
      record('rep:brok:attack:i1', null, 2),
      record('rep:brok:attack:i2', null, 2),
      record('rep:brok:item:i3', { order: 0, cells: { item: 'Верёвка' } }),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file.sheets[0]?.repeats).toEqual({
      item: [{ instanceId: 'i3', order: 0, cells: { item: 'Верёвка' } }],
    });
  });

  test('holds a sheet the tabs list whose id no command makes, with its rows', () => {
    // #given: "a.b" fits a record key, as an older or hand-made room may hold it.
    const records = byKey([
      record('sheet:a.b', { kind: 'pc', name: 'Аня', order: 0 }),
      record('row:a.b:str', { str: 1 }),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file.sheets).toEqual([
      { id: 'a.b', kind: 'pc', name: 'Аня', order: 0, rows: { str: { str: 1 } }, repeats: {} },
    ]);
  });

  test('leaves out a link to a deleted sheet, to an unknown sheet, and a tombstoned link', () => {
    // #given
    const records = byKey([
      record('sheet:gone', null, 2),
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
      record('link:t1', 'gone'),
      record('link:t2', 'nobody'),
      record('link:t3', null, 2),
      record('link:t4', 'brok'),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect(file.links).toEqual([{ tokenId: 't4', sheetId: 'brok' }]);
  });

  test('sorts sheets of equal order by id, and repeat rows of equal order by instance id', () => {
    // #given
    const records = byKey([
      record('sheet:b', { kind: 'pc', name: 'Б', order: 0 }),
      record('sheet:a', { kind: 'npc', name: 'А', order: 0 }),
      record('rep:b:attack:y', { order: 0, cells: {} }),
      record('rep:b:attack:x', { order: 0, cells: {} }),
    ]);

    // #when
    const file = encodeSnapshotFile(records);

    // #then
    expect({
      sheets: file.sheets.map((sheet) => sheet.id),
      rows: file.sheets[1]?.repeats['attack']?.map((row) => row.instanceId),
    }).toEqual({ sheets: ['a', 'b'], rows: ['x', 'y'] });
  });
});

describe('formatSnapshotFile', () => {
  test('writes the file pretty-printed with 2 spaces and keys in the format order', () => {
    // #given
    const records = byKey([
      record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }),
      record('row:brok:str', { str_tired: true, str: 14 }),
      record('rep:brok:item:i1', { order: 0, cells: { item: 'Верёвка' } }),
      record('link:t1', 'brok'),
    ]);

    // #when
    const text = formatSnapshotFile(encodeSnapshotFile(records));

    // #then
    expect(text).toBe(
      [
        '{',
        '  "v": 1,',
        '  "type": "muster-roll/snapshot",',
        '  "sheets": [',
        '    {',
        '      "id": "brok",',
        '      "kind": "pc",',
        '      "name": "Брок",',
        '      "order": 0,',
        '      "rows": {',
        '        "str": {',
        '          "str": 14,',
        '          "str_tired": true',
        '        }',
        '      },',
        '      "repeats": {',
        '        "item": [',
        '          {',
        '            "instanceId": "i1",',
        '            "order": 0,',
        '            "cells": {',
        '              "item": "Верёвка"',
        '            }',
        '          }',
        '        ]',
        '      }',
        '    }',
        '  ],',
        '  "links": [',
        '    {',
        '      "tokenId": "t1",',
        '      "sheetId": "brok"',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
    );
  });

  test('gives the same bytes for the same records in any order, key order and version', () => {
    // #given
    const list = [
      record('sheet:b', { kind: 'pc', name: 'Б', order: 1 }),
      record('sheet:a', { kind: 'npc', name: 'А', order: 0 }),
      record('row:b:str', { str_tired: false, str: 3 }),
      record('row:b:class', { class: 'Маг', level: 2 }),
      record('rep:b:attack:y', { order: 2, cells: { attack: 'Б', bonus: 1 } }),
      record('rep:b:attack:x', { order: 1, cells: { attack: 'А' } }),
      record('rep:b:item:z', { order: 0, cells: { equipped: true, item: 'Верёвка' } }),
      record('link:t2', 'a'),
      record('link:t1', 'b'),
    ];

    // Records, sections and every object's keys come in the other order, at other versions.
    const reordered = [...list]
      .reverse()
      .map((one) => record(one.k, reversedKeys(one.d), one.c + 7));

    // #when
    const texts = [list, reordered].map((one) =>
      formatSnapshotFile(encodeSnapshotFile(byKey(one))),
    );

    // #then
    expect(texts[1]).toBe(texts[0] ?? '');
  });
});

describe('snapshotFileSchema', () => {
  test('parses the downloaded text back to the encoded file', () => {
    // #given
    const file = encodeSnapshotFile(
      byKey([
        record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0.5 }),
        record('row:brok:str', { str: -1.5, str_tired: false }),
        record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч', bonus: 0 } }),
        record('link:t1', 'brok'),
      ]),
    );

    // #when
    const parsed = snapshotFileSchema.safeParse(JSON.parse(formatSnapshotFile(file)));

    // #then
    expect(parsed).toEqual({ success: true, data: file });
  });

  test('accepts one instance id in two sections and two links to one sheet', () => {
    // #given
    const candidate = file({
      sheets: [
        sheet('s', {
          repeats: { attack: [repeatRow('i1')], item: [repeatRow('i1')] },
        }),
      ],
      links: [link('t1', 's'), link('t2', 's')],
    });

    // #when
    const parsed = snapshotFileSchema.safeParse(candidate);

    // #then
    expect(parsed.success).toBe(true);
  });

  test.each<[string, JsonValue]>([
    ['no type, as a preset file has none', { v: 1, sheets: [], links: [] }],
    ['the type of a preset', { ...file({}), type: 'muster-roll/preset' }],
    ['a newer v', { ...file({}), v: 2 }],
    ['a preset', { ...file({}), preset: 'x' }],
    ['two sheets with one id', file({ sheets: [sheet('s'), sheet('s')] })],
    [
      'two links with one token',
      file({ sheets: [sheet('s'), sheet('r')], links: [link('t1', 's'), link('t1', 'r')] }),
    ],
    [
      'one instance id twice in a section',
      file({ sheets: [sheet('s', { repeats: { attack: [repeatRow('i1'), repeatRow('i1')] } })] }),
    ],
    ['a link to a sheet the file does not hold', file({ links: [link('t1', 's')] })],
    ['a sheet id with ":"', file({ sheets: [sheet('a:b')] })],
  ])('refuses a file with %s', (_name, candidate) => {
    // #when
    const parsed = snapshotFileSchema.safeParse(candidate);

    // #then
    expect(parsed.success).toBe(false);
  });

  // JSON.parse makes `__proto__` an own key, which a parse into a plain object would drop.
  test.each([
    [
      'sheet id',
      '{"id": "__proto__", "kind": "pc", "name": "A", "order": 0, "rows": {}, "repeats": {}}',
    ],
    [
      'row id',
      '{"id": "s", "kind": "pc", "name": "A", "order": 0, "rows": {"__proto__": {}}, "repeats": {}}',
    ],
    [
      'section id',
      '{"id": "s", "kind": "pc", "name": "A", "order": 0, "rows": {}, "repeats": {"__proto__": []}}',
    ],
    [
      'field id',
      '{"id": "s", "kind": "pc", "name": "A", "order": 0, "rows": {"r": {"__proto__": 1}}, "repeats": {}}',
    ],
    [
      'cell id',
      '{"id": "s", "kind": "pc", "name": "A", "order": 0, "rows": {}, "repeats": {"a": [{"instanceId": "i", "order": 0, "cells": {"__proto__": 1}}]}}',
    ],
  ])('refuses the %s __proto__', (_name, sheetText) => {
    // #given
    const text = `{"v": 1, "type": "muster-roll/snapshot", "sheets": [${sheetText}], "links": []}`;

    // #when
    const parsed = snapshotFileSchema.safeParse(JSON.parse(text));

    // #then
    expect(parsed.success).toBe(false);
  });
});

describe('snapshotFileName', () => {
  test('names the file by the local date with zero-padded month and day', () => {
    // #given
    const now = new Date(2026, 0, 5, 23, 59);

    // #when
    const name = snapshotFileName(now);

    // #then
    expect(name).toBe('muster-roll-snapshot-2026-01-05.json');
  });
});

function record(k: string, d: JsonValue, c = 1): VersionedRecord {
  const parsed = parseRecord({ k, d, c, a: 'seed' });

  if (!parsed.ok) {
    throw new Error(`the test record ${k} does not parse`);
  }

  return parsed.value;
}

function byKey(records: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return new Map(records.map((one) => [one.k, one]));
}

function file(parts: { sheets?: JsonValue[]; links?: JsonValue[] }): JsonObject {
  return {
    v: 1,
    type: 'muster-roll/snapshot',
    sheets: parts.sheets ?? [],
    links: parts.links ?? [],
  };
}

function sheet(id: string, parts: { repeats?: JsonObject } = {}): JsonObject {
  return { id, kind: 'pc', name: 'А', order: 0, rows: {}, repeats: parts.repeats ?? {} };
}

function repeatRow(instanceId: string): JsonObject {
  return { instanceId, order: 0, cells: {} };
}

function link(tokenId: string, sheetId: string): JsonObject {
  return { tokenId, sheetId };
}

function reversedKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(reversedKeys);
  }

  if (value instanceof Object) {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, inner]) => [key, reversedKeys(inner)]),
    );
  }

  return value;
}
