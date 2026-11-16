import { assembleRecords } from '@/core/merge';
import { fixtureSnapshotCells, fixtureSnapshotBlocks } from '../../tests/support/block-fixtures';
import { fixtureRecord } from '../../tests/support/block-fixtures';
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
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      tabs: [
        {
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
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      tabs: [
        {
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
      ],
    },
    {
      id: 'notes',
      kind: 'single',
      title: 'Заметки',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'plot' }]] }] }],
    },
  ],
};

describe('encodeSnapshotFile', () => {
  test('holds the sheets of every template in preset order with their values and live links, and nothing else', () => {
    // #given
    const records = byKey([
      record('preset', 'eJwrSS0uAQAEXQHB', 4),
      record('blk:brok', { set: 'pc', order: 1 }, 3),
      record('blk:anya', { set: 'pc', order: 0 }),
      record('blk:brok', { str_tired: false, str: 14 }, 5),
      record('blk:brok', { name: 'Брок' }),
      record('blk:brok:attack:i2', { order: 1, cells: { bonus: 2, attack: 'Топор' } }),
      record('blk:brok:attack:i1', { order: 0, cells: { attack: 'Меч' } }),
      record('blk:npc:npc_name:n1', { order: 0, cells: { npc_name: 'Скелет', hp: 7 } }),
      record('acl:brok:lisa', { name: 'Лиза' }),
      record('plink:brok:lisa', { name: 'Лиза' }),
      record('link:t2', { s: 'npc', i: 'n1' }, 2),
      record('link:t1', { s: 'brok' }, 2),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then
    expect(file).toEqual({
      v: 4,
      type: 'muster-roll/snapshot',
      sheets: [
        {
          id: 'anya',
          set: 'pc',
          order: 0,
          cells: fixtureSnapshotCells({}),
          blocks: fixtureSnapshotBlocks({}),
        },
        {
          id: 'brok',
          set: 'pc',
          order: 1,
          cells: fixtureSnapshotCells({
            name: { name: 'Брок' },
            str: { str: 14, str_tired: false },
          }),
          blocks: fixtureSnapshotBlocks({
            attack: [
              { instanceId: 'i1', order: 0, cells: { attack: 'Меч' } },
              { instanceId: 'i2', order: 1, cells: { attack: 'Топор', bonus: 2 } },
            ],
          }),
        },
        {
          id: 'npc',
          cells: fixtureSnapshotCells({}),
          blocks: fixtureSnapshotBlocks({
            npc_name: [{ instanceId: 'n1', order: 0, cells: { hp: 7, npc_name: 'Скелет' } }],
          }),
        },
        { id: 'notes', cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) },
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
      v: 4,
      type: 'muster-roll/snapshot',
      sheets: [
        { id: 'npc', cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) },
        { id: 'notes', cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) },
      ],
      links: [],
    });
  });
  test('leaves out a deleted sheet and the live rows it left behind', () => {
    // #given
    const records = byKey([
      record('blk:gone', null, 2),
      record('blk:gone', { str: 9 }),
      record('blk:gone:attack:i1', { order: 0, cells: { attack: 'Лук' } }),
      record('blk:brok', { set: 'pc', order: 0 }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then
    expect(file.sheets.map((sheet) => sheet.id)).toEqual(['brok', 'npc', 'notes']);
  });
  test('leaves out a sheet whose set names no sheet set, and a sheet record under a template id', () => {
    // #given
    const records = byKey([
      record('blk:stray', { set: 'npc', order: 0 }),
      record('blk:stray', { str: 9 }),
      record('blk:gone_set', { set: 'monsters', order: 0 }),
      record('blk:notes', { set: 'pc', order: 0 }),
      record('blk:notes', { plot: 'Дракон' }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then: `notes` is listed once, as its single sheet.
    expect(file.sheets).toEqual([
      { id: 'npc', cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) },
      {
        id: 'notes',
        cells: fixtureSnapshotCells({ plot: { plot: 'Дракон' } }),
        blocks: fixtureSnapshotBlocks({}),
      },
    ]);
  });
  test('leaves out blocks with no sheet record, and tombstoned blocks of a live sheet', () => {
    // #given
    const records = byKey([
      record('blk:ghost', { str: 9 }),
      record('blk:brok', { set: 'pc', order: 0 }),
      record('blk:brok:attack:i1', null, 2),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then
    expect(file.sheets[0]).toEqual({
      id: 'brok',
      set: 'pc',
      order: 0,
      cells: fixtureSnapshotCells({}),
      blocks: fixtureSnapshotBlocks({}),
    });
  });
  test('writes a row record with no values as an empty row', () => {
    // #given
    const records = byKey([record('blk:notes', {})]);
    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then
    expect(file.sheets[1]).toEqual({
      id: 'notes',
      cells: fixtureSnapshotCells({ plot: {} }),
      blocks: fixtureSnapshotBlocks({}),
    });
  });
  test('leaves out a section whose repeat blocks are all tombstoned', () => {
    // #given
    const records = byKey([
      record('blk:brok', { set: 'pc', order: 0 }),
      record('blk:brok:attack:i1', null, 2),
      record('blk:brok:attack:i2', null, 2),
      record('blk:brok:item:i3', { order: 0, cells: { item: 'Верёвка' } }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then
    expect(file.sheets[0]?.blocks).toEqual([
      { path: ['item', 'i3'], order: 0, cells: { item: 'Верёвка' } },
    ]);
  });
  test('holds a sheet the tabs list whose id no command makes, with its rows', () => {
    // #given: "a.b" fits a record key, as an older or hand-made room may hold it.
    const records = byKey([
      record('blk:a.b', { set: 'pc', order: 0 }),
      record('blk:a.b', { str: 1 }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then
    expect(file.sheets[0]).toEqual({
      id: 'a.b',
      set: 'pc',
      order: 0,
      cells: fixtureSnapshotCells({ str: { str: 1 } }),
      blocks: fixtureSnapshotBlocks({}),
    });
  });
  test('leaves out every inert link and a tombstoned link', () => {
    // #given
    const records = byKey([
      record('blk:gone', null, 2),
      record('blk:brok', { set: 'pc', order: 0 }),
      record('blk:brok:attack:i1', { order: 0, cells: {} }),
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
      record('blk:b', { set: 'pc', order: 0 }),
      record('blk:a', { set: 'pc', order: 0 }),
      record('blk:b:attack:y', { order: 0, cells: {} }),
      record('blk:b:attack:x', { order: 0, cells: {} }),
    ]);

    // #when
    const file = encodeSnapshotFile(records, PRESET);
    // #then
    expect({
      sheets: file.sheets.map((sheet) => sheet.id),
      blocks: file.sheets[1]?.blocks.map((block) => block.path.at(-1)),
    }).toEqual({ sheets: ['a', 'b', 'npc', 'notes'], blocks: ['x', 'y'] });
  });
});

describe('formatSnapshotFile', () => {
  test('writes the file pretty-printed with 2 spaces and keys in the format order', () => {
    // #given: one template of each kind.
    const preset: Preset = { v: 3, templates: PRESET.templates.slice(0, 2) };

    const records = byKey([
      record('blk:brok', { set: 'pc', order: 0 }),
      record('blk:brok', { str_tired: true, str: 14 }),
      record('blk:npc:npc_name:i1', { order: 0, cells: { npc_name: 'Скелет' } }),
      record('link:t1', { s: 'brok' }),
      record('link:t2', { s: 'npc', i: 'i1' }),
    ]);

    // #when
    const text = formatSnapshotFile(encodeSnapshotFile(records, preset));
    // #then
    expect(text).toBe(
      JSON.stringify(
        {
          v: 4,
          type: 'muster-roll/snapshot',
          sheets: [
            {
              id: 'brok',
              cells: { str: 14, str_tired: true },
              blocks: [],
              set: 'pc',
              order: 0,
            },
            {
              id: 'npc',
              cells: {},
              blocks: [
                {
                  path: ['npc_name', 'i1'],
                  order: 0,
                  cells: { npc_name: 'Скелет' },
                },
              ],
            },
          ],
          links: [
            { tokenId: 't1', sheetId: 'brok' },
            { tokenId: 't2', sheetId: 'npc', instanceId: 'i1' },
          ],
        },
        null,
        2,
      ),
    );
  });
  test('gives the same bytes for the same records in any order, key order and version', () => {
    // #given
    const list = [
      record('blk:b', { set: 'pc', order: 1 }),
      record('blk:a', { set: 'pc', order: 0 }),
      record('blk:b', { str_tired: false, str: 3 }),
      record('blk:b', { name: 'Маг' }),
      record('blk:b:attack:y', { order: 2, cells: { attack: 'Б', bonus: 1 } }),
      record('blk:b:attack:x', { order: 1, cells: { attack: 'А' } }),
      record('blk:b:item:z', { order: 0, cells: { equipped: true, item: 'Верёвка' } }),
      record('blk:npc:npc_name:n1', { order: 0, cells: { npc_name: 'Скелет', hp: 3 } }),
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
        record('blk:brok', { set: 'pc', order: 0.5 }),
        record('blk:brok', { str: -1.5, str_tired: false }),
        record('blk:brok:attack:i1', { order: 0, cells: { attack: 'Меч', bonus: 0 } }),
        record('blk:npc:npc_name:n1', { order: 0, cells: { hp: 2 } }),
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
  test('accepts two links to one target', () => {
    // #given
    const candidate = file({
      sheets: [{ ...sheet('s'), blocks: [block('attack', 'i1')] }],
      links: [link('t1', 's'), link('t2', 's'), link('t3', 's', 'i1'), link('t4', 's', 'i1')],
    });

    // #when
    const parsed = snapshotFileSchema.safeParse(candidate);
    // #then
    expect(parsed.success).toBe(true);
  });
  test('accepts a single sheet with no set and no order', () => {
    // #given
    const candidate = file({
      sheets: [{ id: 'npc', cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) }],
    });

    // #when
    const parsed = snapshotFileSchema.safeParse(candidate);
    // #then
    expect(parsed.success).toBe(true);
  });
  test.each<[string, JsonValue]>([
    ['no type, as a preset file has none', { v: 3, sheets: [], links: [] }],
    ['the type of a preset', { ...file({}), type: 'muster-roll/preset' }],
    ['an older v', { ...file({}), v: 3 }],
    ['a newer v', { ...file({}), v: 5 }],
    ['a preset', { ...file({}), preset: 'x' }],
    ['two sheets with one id', file({ sheets: [sheet('s'), sheet('s')] })],
    [
      'two blocks with one path',
      file({
        sheets: [{ ...sheet('s'), blocks: [block('attack', 'i1'), block('attack', 'i1')] }],
      }),
    ],
    [
      'one block instance id under two paths',
      file({
        sheets: [{ ...sheet('s'), blocks: [block('attack', 'i1'), block('item', 'i1')] }],
      }),
    ],
    [
      'two links with one token',
      file({ sheets: [sheet('s'), sheet('r')], links: [link('t1', 's'), link('t1', 'r')] }),
    ],
    ['a link to a sheet the file does not hold', file({ links: [link('t1', 's')] })],
    [
      'a link to a repeat block the sheet does not hold',
      file({
        sheets: [{ ...sheet('s'), blocks: [block('attack', 'i1')] }],
        links: [link('t1', 's', 'i2')],
      }),
    ],
    ['a sheet id with ":"', file({ sheets: [sheet('a:b')] })],
    [
      'a sheet with set and no order',
      file({
        sheets: [
          {
            id: 's',
            set: 'pc',
            cells: fixtureSnapshotCells({}),
            blocks: fixtureSnapshotBlocks({}),
          },
        ],
      }),
    ],
    [
      'a sheet with order and no set',
      file({
        sheets: [
          { id: 's', order: 0, cells: fixtureSnapshotCells({}), blocks: fixtureSnapshotBlocks({}) },
        ],
      }),
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
    ['sheet id', '{"id": "__proto__", "set": "pc", "order": 0, "cells": {}, "blocks": []}'],
    [
      'root cell id',
      '{"id": "s", "set": "pc", "order": 0, "cells": {"__proto__": 1}, "blocks": []}',
    ],
    [
      'scope id',
      '{"id": "s", "set": "pc", "order": 0, "cells": {}, "blocks": [{"path": ["__proto__", "i"], "order": 0, "cells": {}}]}',
    ],
    [
      'block cell id',
      '{"id": "s", "set": "pc", "order": 0, "cells": {}, "blocks": [{"path": ["a", "i"], "order": 0, "cells": {"__proto__": 1}}]}',
    ],
  ])('refuses the %s __proto__', (_name, sheetText) => {
    // #given
    const text = `{"v": 4, "type": "muster-roll/snapshot", "sheets": [${sheetText}], "links": []}`;
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
  const parsed = parseRecord(fixtureRecord(k, d, c, 'seed'));

  if (!parsed.ok) {
    throw new Error(`the test record ${k} does not parse`);
  }

  return parsed.value;
}

function byKey(records: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return assembleRecords(records);
}

function file(parts: { sheets?: JsonValue[]; links?: JsonValue[] }): JsonObject {
  return {
    v: 4,
    type: 'muster-roll/snapshot',
    sheets: parts.sheets ?? [],
    links: parts.links ?? [],
  };
}

// A sheet of a sheet set.
function sheet(id: string, parts: { set?: string } = {}): JsonObject {
  return {
    id,
    set: parts.set ?? 'pc',
    order: 0,
    cells: fixtureSnapshotCells({}),
    blocks: [],
  };
}

function block(scopeId: string, instanceId: string): JsonObject {
  return { path: [scopeId, instanceId], order: 0, cells: {} };
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
