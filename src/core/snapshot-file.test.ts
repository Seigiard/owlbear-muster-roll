import { describe, expect, test } from 'bun:test';

import type { JsonObject, JsonValue } from '@/core/json';
import type { Preset } from '@/core/preset';
import { parseRecord, type VersionedRecord } from '@/core/records';
import {
  encodeSnapshotFile,
  formatSnapshotFile,
  snapshotFileName,
  snapshotFileSchema,
} from '@/core/snapshot-file';

// A linkable sheet set `pc`, a single sheet `npc` with a linkable repeat section, and a single
// sheet `notes` with no token link.
const PRESET: Preset = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      sections: [
        {
          rows: [
            [{ kind: 'field', type: 'text', id: 'name' }],
            [
              { kind: 'field', type: 'number', id: 'str' },
              { kind: 'field', type: 'check', id: 'str_tired' },
            ],
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
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [
        {
          repeat: true,
          tokens: true,
          rows: [
            [
              { kind: 'field', type: 'text', id: 'npc_name' },
              { kind: 'field', type: 'number', id: 'hp' },
            ],
          ],
        },
      ],
    },
    {
      id: 'notes',
      kind: 'single',
      title: 'Заметки',
      sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'plot' }]] }],
    },
  ],
};

describe('encodeSnapshotFile', () => {
  test('holds the sheets of every template in preset order with their values and live links, and nothing else', () => {
    // #given
    const records = byKey([
      record('preset', 'eJwrSS0uAQAEXQHB', 4),
      record('sheet:brok', { set: 'pc', order: 1 }, 3),
      record('sheet:anya', { set: 'pc', order: 0 }),
      record('row:brok:str', { str_tired: false, str: 14 }, 5),
      record('row:brok:name', { name: 'Брок' }),
      record('rep:brok:attack:i2', { order: 1, cells: { bonus: 2, attack: 'Топор' } }),
      record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
      record('rep:npc:npc_name:n1', { order: 0, cells: { npc_name: 'Скелет', hp: 7 } }),
      record('acl:brok:lisa', { name: 'Лиза' }),
      record('plink:brok:lisa', { name: 'Лиза' }),
      record('link:t2', { s: 'npc', i: 'n1' }, 2),
      record('link:t1', { s: 'brok' }, 2),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect(file).toEqual({
      v: 2,
      type: 'muster-roll/snapshot',
      sheets: [
        { id: 'anya', set: 'pc', order: 0, rows: {}, repeats: {} },
        {
          id: 'brok',
          set: 'pc',
          order: 1,
          rows: { name: { name: 'Брок' }, str: { str: 14, str_tired: false } },
          repeats: {
            attack: [
              { instanceId: 'i1', order: 0, cells: { attack: 'Меч' } },
              { instanceId: 'i2', order: 1, cells: { attack: 'Топор', bonus: 2 } },
            ],
          },
        },
        {
          id: 'npc',
          rows: {},
          repeats: {
            npc_name: [{ instanceId: 'n1', order: 0, cells: { hp: 7, npc_name: 'Скелет' } }],
          },
        },
        { id: 'notes', rows: {}, repeats: {} },
      ],
      links: [
        { tokenId: 't1', sheetId: 'brok' },
        { tokenId: 't2', sheetId: 'npc', instanceId: 'n1' },
      ],
    });
  });

  test('gives every single sheet, empty, and no links for a room with a preset and no values', () => {
    // #given
    const records = byKey([record('preset', 'eJwrSS0uAQAEXQHB')]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect(file).toEqual({
      v: 2,
      type: 'muster-roll/snapshot',
      sheets: [
        { id: 'npc', rows: {}, repeats: {} },
        { id: 'notes', rows: {}, repeats: {} },
      ],
      links: [],
    });
  });

  test('leaves out a deleted sheet and the live rows it left behind', () => {
    // #given
    const records = byKey([
      record('sheet:gone', null, 2),
      record('row:gone:str', { str: 9 }),
      record('rep:gone:attack:i1', { order: 0, cells: { attack: 'Лук' } }),
      record('sheet:brok', { set: 'pc', order: 0 }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect(file.sheets.map((sheet) => sheet.id)).toEqual(['brok', 'npc', 'notes']);
  });

  test('leaves out a sheet whose set names no sheet set, and a sheet record under a template id', () => {
    // #given
    const records = byKey([
      record('sheet:stray', { set: 'npc', order: 0 }),
      record('row:stray:str', { str: 9 }),
      record('sheet:gone_set', { set: 'monsters', order: 0 }),
      record('sheet:notes', { set: 'pc', order: 0 }),
      record('row:notes:plot', { plot: 'Дракон' }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then: `notes` is listed once, as its single sheet.
    expect(file.sheets).toEqual([
      { id: 'npc', rows: {}, repeats: {} },
      { id: 'notes', rows: { plot: { plot: 'Дракон' } }, repeats: {} },
    ]);
  });

  test('leaves out rows with no sheet record, and tombstoned rows of a live sheet', () => {
    // #given
    const records = byKey([
      record('row:ghost:str', { str: 9 }),
      record('sheet:brok', { set: 'pc', order: 0 }),
      record('row:brok:str', null, 2),
      record('rep:brok:attack:i1', null, 2),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect(file.sheets[0]).toEqual({ id: 'brok', set: 'pc', order: 0, rows: {}, repeats: {} });
  });

  test('writes a row record with no values as an empty row', () => {
    // #given
    const records = byKey([record('row:notes:plot', {})]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect(file.sheets[1]).toEqual({ id: 'notes', rows: { plot: {} }, repeats: {} });
  });

  test('leaves out a section whose repeat blocks are all tombstoned', () => {
    // #given
    const records = byKey([
      record('sheet:brok', { set: 'pc', order: 0 }),
      record('rep:brok:attack:i1', null, 2),
      record('rep:brok:attack:i2', null, 2),
      record('rep:brok:item:i3', { order: 0, cells: { item: 'Верёвка' } }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect(file.sheets[0]?.repeats).toEqual({
      item: [{ instanceId: 'i3', order: 0, cells: { item: 'Верёвка' } }],
    });
  });

  test('holds a sheet the tabs list whose id no command makes, with its rows', () => {
    // #given: "a.b" fits a record key, as an older or hand-made room may hold it.
    const records = byKey([
      record('sheet:a.b', { set: 'pc', order: 0 }),
      record('row:a.b:str', { str: 1 }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect(file.sheets[0]).toEqual({
      id: 'a.b',
      set: 'pc',
      order: 0,
      rows: { str: { str: 1 } },
      repeats: {},
    });
  });

  test('leaves out every inert link and a tombstoned link', () => {
    // #given
    const records = byKey([
      record('sheet:gone', null, 2),
      record('sheet:brok', { set: 'pc', order: 0 }),
      record('rep:brok:attack:i1', { order: 0, cells: {} }),
      record('link:t1', { s: 'gone' }),
      record('link:t2', { s: 'nobody' }),
      record('link:t3', null, 2),
      record('link:t4', { s: 'brok' }),
      record('link:t5', { s: 'npc', i: 'missing' }),
      record('link:t6', { s: 'notes' }),
      record('link:t7', { s: 'brok', i: 'i1' }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then: t5 names no block, t6 a template with no tokens, t7 a section with no tokens.
    expect(file.links).toEqual([{ tokenId: 't4', sheetId: 'brok' }]);
  });

  test('sorts sheets of equal order by id, and repeat blocks of equal order by instance id', () => {
    // #given
    const records = byKey([
      record('sheet:b', { set: 'pc', order: 0 }),
      record('sheet:a', { set: 'pc', order: 0 }),
      record('rep:b:attack:y', { order: 0, cells: {} }),
      record('rep:b:attack:x', { order: 0, cells: {} }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);

    // #then
    expect({
      sheets: file.sheets.map((sheet) => sheet.id),
      blocks: file.sheets[1]?.repeats['attack']?.map((block) => block.instanceId),
    }).toEqual({ sheets: ['a', 'b', 'npc', 'notes'], blocks: ['x', 'y'] });
  });
});

describe('formatSnapshotFile', () => {
  test('writes the file pretty-printed with 2 spaces and keys in the format order', () => {
    // #given: one template of each kind.
    const preset: Preset = { v: 2, templates: PRESET.templates.slice(0, 2) };

    const records = byKey([
      record('sheet:brok', { set: 'pc', order: 0 }),
      record('row:brok:str', { str_tired: true, str: 14 }),
      record('rep:npc:npc_name:i1', { order: 0, cells: { npc_name: 'Скелет' } }),
      record('link:t1', { s: 'brok' }),
      record('link:t2', { s: 'npc', i: 'i1' }),
    ]);

    // #when
    const text = formatSnapshotFile(encodeSnapshotFile(records, preset));

    // #then
    expect(text).toBe(
      [
        '{',
        '  "v": 2,',
        '  "type": "muster-roll/snapshot",',
        '  "sheets": [',
        '    {',
        '      "id": "brok",',
        '      "set": "pc",',
        '      "order": 0,',
        '      "rows": {',
        '        "str": {',
        '          "str": 14,',
        '          "str_tired": true',
        '        }',
        '      },',
        '      "repeats": {}',
        '    },',
        '    {',
        '      "id": "npc",',
        '      "rows": {},',
        '      "repeats": {',
        '        "npc_name": [',
        '          {',
        '            "instanceId": "i1",',
        '            "order": 0,',
        '            "cells": {',
        '              "npc_name": "Скелет"',
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
        '    },',
        '    {',
        '      "tokenId": "t2",',
        '      "sheetId": "npc",',
        '      "instanceId": "i1"',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
    );
  });

  test('gives the same bytes for the same records in any order, key order and version', () => {
    // #given
    const list = [
      record('sheet:b', { set: 'pc', order: 1 }),
      record('sheet:a', { set: 'pc', order: 0 }),
      record('row:b:str', { str_tired: false, str: 3 }),
      record('row:b:name', { name: 'Маг' }),
      record('rep:b:attack:y', { order: 2, cells: { attack: 'Б', bonus: 1 } }),
      record('rep:b:attack:x', { order: 1, cells: { attack: 'А' } }),
      record('rep:b:item:z', { order: 0, cells: { equipped: true, item: 'Верёвка' } }),
      record('rep:npc:npc_name:n1', { order: 0, cells: { npc_name: 'Скелет', hp: 3 } }),
      record('link:t2', { s: 'a' }),
      record('link:t1', { i: 'n1', s: 'npc' }),
    ];

    // Records, sections and every object's keys come in the other order, at other versions.
    const reordered = [...list]
      .reverse()
      .map((one) => record(one.k, reversedKeys(one.d), one.c + 7));

    // #when
    const texts = [list, reordered].map((one) =>
      formatSnapshotFile(encodeSnapshotFile(byKey(one), PRESET)),
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
        record('sheet:brok', { set: 'pc', order: 0.5 }),
        record('row:brok:str', { str: -1.5, str_tired: false }),
        record('rep:brok:attack:i1', { order: 0, cells: { attack: 'Меч', bonus: 0 } }),
        record('rep:npc:npc_name:n1', { order: 0, cells: { hp: 2 } }),
        record('link:t1', { s: 'brok' }),
        record('link:t2', { s: 'npc', i: 'n1' }),
      ]),
      PRESET,
    );

    // #when
    const parsed = snapshotFileSchema.safeParse(JSON.parse(formatSnapshotFile(file)));

    // #then
    expect(parsed).toEqual({ success: true, data: file });
  });

  test('accepts one instance id twice in a sheet and two links to one target', () => {
    // #given: the import, not the file, drops the second repeat block of one instance id (AD-2).
    const candidate = file({
      sheets: [
        sheet('s', {
          repeats: { attack: [block('i1'), block('i1')], item: [block('i1')] },
        }),
      ],
      links: [link('t1', 's'), link('t2', 's'), link('t3', 's', 'i1'), link('t4', 's', 'i1')],
    });

    // #when
    const parsed = snapshotFileSchema.safeParse(candidate);

    // #then
    expect(parsed.success).toBe(true);
  });

  test('accepts a single sheet with no set and no order', () => {
    // #given
    const candidate = file({ sheets: [{ id: 'npc', rows: {}, repeats: {} }] });

    // #when
    const parsed = snapshotFileSchema.safeParse(candidate);

    // #then
    expect(parsed.success).toBe(true);
  });

  test.each<[string, JsonValue]>([
    ['no type, as a preset file has none', { v: 2, sheets: [], links: [] }],
    ['the type of a preset', { ...file({}), type: 'muster-roll/preset' }],
    ['an older v', { ...file({}), v: 1 }],
    ['a newer v', { ...file({}), v: 3 }],
    ['a preset', { ...file({}), preset: 'x' }],
    ['two sheets with one id', file({ sheets: [sheet('s'), sheet('s')] })],
    [
      'two links with one token',
      file({ sheets: [sheet('s'), sheet('r')], links: [link('t1', 's'), link('t1', 'r')] }),
    ],
    ['a link to a sheet the file does not hold', file({ links: [link('t1', 's')] })],
    [
      'a link to a repeat block the sheet does not hold',
      file({
        sheets: [sheet('s', { repeats: { attack: [block('i1')] } })],
        links: [link('t1', 's', 'i2')],
      }),
    ],
    ['a sheet id with ":"', file({ sheets: [sheet('a:b')] })],
    [
      'a sheet with set and no order',
      file({ sheets: [{ id: 's', set: 'pc', rows: {}, repeats: {} }] }),
    ],
    [
      'a sheet with order and no set',
      file({ sheets: [{ id: 's', order: 0, rows: {}, repeats: {} }] }),
    ],
    ['a set that is no template id', file({ sheets: [sheet('s', { set: 'Персонажи' })] })],
    ['a sheet with a name', file({ sheets: [{ ...sheet('s'), name: 'Брок' }] })],
  ])('refuses a file with %s', (_name, candidate) => {
    // #when
    const parsed = snapshotFileSchema.safeParse(candidate);

    // #then
    expect(parsed.success).toBe(false);
  });

  // JSON.parse makes `__proto__` an own key, which a parse into a plain object would drop.
  test.each([
    ['sheet id', '{"id": "__proto__", "set": "pc", "order": 0, "rows": {}, "repeats": {}}'],
    ['row id', '{"id": "s", "set": "pc", "order": 0, "rows": {"__proto__": {}}, "repeats": {}}'],
    [
      'section id',
      '{"id": "s", "set": "pc", "order": 0, "rows": {}, "repeats": {"__proto__": []}}',
    ],
    [
      'field id',
      '{"id": "s", "set": "pc", "order": 0, "rows": {"r": {"__proto__": 1}}, "repeats": {}}',
    ],
    [
      'cell id',
      '{"id": "s", "set": "pc", "order": 0, "rows": {}, "repeats": {"a": [{"instanceId": "i", "order": 0, "cells": {"__proto__": 1}}]}}',
    ],
  ])('refuses the %s __proto__', (_name, sheetText) => {
    // #given
    const text = `{"v": 2, "type": "muster-roll/snapshot", "sheets": [${sheetText}], "links": []}`;

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
    v: 2,
    type: 'muster-roll/snapshot',
    sheets: parts.sheets ?? [],
    links: parts.links ?? [],
  };
}

// A sheet of a sheet set.
function sheet(id: string, parts: { set?: string; repeats?: JsonObject } = {}): JsonObject {
  return { id, set: parts.set ?? 'pc', order: 0, rows: {}, repeats: parts.repeats ?? {} };
}

function block(instanceId: string): JsonObject {
  return { instanceId, order: 0, cells: {} };
}

function link(tokenId: string, sheetId: string, instanceId?: string): JsonObject {
  return instanceId === undefined ? { tokenId, sheetId } : { tokenId, sheetId, instanceId };
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
