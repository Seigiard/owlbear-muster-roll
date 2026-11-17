import type { JsonValue } from '@/core/json';
import { assembleRecords } from '@/core/merge';
import { fixtureSnapshotCells, fixtureSnapshotBlocks } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { Preset } from '@/core/preset';
import { err } from '@/core/result';
import { blockDataSchema, cellValues, parseRepKey, type VersionedRecord } from '@/core/records';
import { encodeSnapshotFile, type SnapshotFile } from '@/core/snapshot-file';
import {
  decodeSnapshotFileData,
  encodeSnapshotFileData,
  importSnapshot,
  parseSnapshotFile,
  type CurrentPreset,
  type SnapshotFileFailure,
} from '@/core/snapshot-import';

// A preset as the 5.3 spec reads it, on v2 templates: a sheet set `pc` with two non-repeat rows and
// two repeat sections, and a single sheet `npc` with a row and a linkable repeat section whose
// blocks span two rows.
const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Персонажи',
      repeat: { nameField: 'notes' },

      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'str' },
                    { kind: 'field', type: 'check', id: 'tired' },
                    { kind: 'token', id: 'token' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'text', id: 'notes' }] },
              ],
            },
            {
              repeat: { id: 'attack', nameField: 'attack' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'attack' },
                    { kind: 'field', type: 'number', id: 'bonus' },
                  ],
                },
              ],
            },
            {
              repeat: { id: 'item', nameField: 'item' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'item' },
                    { kind: 'field', type: 'number', id: 'weight' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      title: 'NPC',
      tabs: [
        {
          sections: [
            { rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] },
            {
              repeat: { id: 'npc_name', nameField: 'npc_name' },

              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'npc_name' },
                    { kind: 'field', type: 'number', id: 'ac' },
                    { kind: 'token', id: 'token' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'number', id: 'might' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const CURRENT: CurrentPreset = { preset: PRESET, data: 'eJwrSS0uAQAEXQHB' };
const AUTHOR = 'importer';

type SnapshotSheet = SnapshotFile['sheets'][number];

type SheetParts = {
  order?: number;
  rows?: Parameters<typeof fixtureSnapshotCells>[0];
  repeats?: Parameters<typeof fixtureSnapshotBlocks>[0];
};

// A sheet of the sheet set `pc`.
function pc(id: string, parts: SheetParts = {}): SnapshotSheet {
  return {
    id,
    set: 'pc',
    order: parts.order ?? 0,
    cells: fixtureSnapshotCells(parts.rows ?? {}),
    blocks: fixtureSnapshotBlocks(parts.repeats ?? {}),
  };
}

// A single sheet, whose id is its template id.
function single(id: string, parts: SheetParts = {}): SnapshotSheet {
  return {
    id,
    cells: fixtureSnapshotCells(parts.rows ?? {}),
    blocks: fixtureSnapshotBlocks(parts.repeats ?? {}),
  };
}

function file(sheets: readonly SnapshotSheet[], links: SnapshotFile['links'] = []): SnapshotFile {
  return { v: 4, type: 'muster-roll/snapshot', sheets: [...sheets], links };
}

// The imported records by key, and the counts of dropped values and dropped sheets.
type Imported = {
  records: Map<string, VersionedRecord>;
  count: number;
  sheets: number;
};

function imported(input: SnapshotFile): Imported {
  const result = importSnapshot(input, CURRENT, AUTHOR);

  if (!result.ok) {
    throw new Error(`the import failed: ${result.error}`);
  }

  return {
    records: assembleRecords(result.value.records),
    count: result.value.count,
    sheets: result.value.sheets,
  };
}

function dataOf(records: ReadonlyMap<string, VersionedRecord>, key: string): JsonValue {
  const data = blockDataSchema.safeParse(records.get(key)?.d).data;

  if (data === undefined) return null;
  const values = cellValues(data.cells);

  return parseRepKey(key) === null ? values : { order: data.order, cells: values };
}

describe('importSnapshot', () => {
  test('keeps a root number when a repeat tab has a same-id text field', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'npc',
          title: 'NPC',
          tabs: [
            {
              title: 'Основное',
              sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }],
            },
            {
              title: 'Состояния',
              repeat: { id: 'condition', nameField: 'condition_name' },
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'condition_name' },
                        { kind: 'field', type: 'text', id: 'hp' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const input = file([single('npc', { rows: { hp: { hp: 7 } } })]);

    // #when
    const result = importSnapshot(input, { preset, data: CURRENT.data }, AUTHOR);

    // #then
    if (!result.ok) {
      throw new Error(`the import failed: ${result.error}`);
    }

    expect({
      row: dataOf(assembleRecords(result.value.records), 'blk:npc'),
      count: result.value.count,
    }).toEqual({ row: { hp: 7 }, count: 0 });
  });
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
        { tokenId: 't1', sheetId: 'brok', cellId: 'token' },
        {
          tokenId: 't2',
          sheetId: 'npc',
          path: ['npc_name', 'n1'],
          cellId: 'token',
        },
      ],
    );

    // #when
    const result = importSnapshot(input, CURRENT, AUTHOR);
    // #then
    expect(result).toEqual({
      ok: true,
      value: {
        records: [
          {
            k: 'blk:brok',
            d: { set: 'pc', order: 2, cells: { str: [14, 1, AUTHOR] } },
            c: 1,
            a: AUTHOR,
            l: [1, AUTHOR],
          },
          {
            k: 'blk:npc',
            d: { order: 0, cells: { hp: [7, 1, AUTHOR] } },
            c: 1,
            a: AUTHOR,
            l: [1, AUTHOR],
          },
          {
            k: 'blk:npc:npc_name:n1',
            d: { order: 0, cells: { npc_name: ['Волк', 1, AUTHOR] } },
            c: 1,
            a: AUTHOR,
            l: [1, AUTHOR],
          },
          { k: 'link:t1', d: { s: 'brok', c: 'token' }, c: 1, a: AUTHOR },
          {
            k: 'link:t2',
            d: { s: 'npc', path: ['npc_name', 'n1'], c: 'token' },
            c: 1,
            a: AUTHOR,
          },
          { k: 'preset', d: CURRENT.data, c: 1, a: AUTHOR },
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
      root: dataOf(records, 'blk:brok'),
      count,
    }).toEqual({ root: { notes: 'Храбрый', str: 14 }, count: 0 });
  });
  test('keeps the one v4 root-cell value when old row-shaped input names one field twice', () => {
    // #given: v4 has one root cells object, so the later `str` value replaces the earlier one
    // while the fixture is built. The old row identity and its duplicate cannot reach the importer.
    const input = file([
      pc('brok', { rows: { notes: { notes: 'Храбрый', str: 9 }, str: { str: 3 } } }),
    ]);

    // #when
    const { records, count } = imported(input);
    // #then
    expect({
      root: dataOf(records, 'blk:brok'),
      count,
    }).toEqual({ root: { notes: 'Храбрый', str: 3 }, count: 0 });
  });
  test('drops and counts a value whose type differs from the current field', () => {
    // #given
    const input = file([pc('brok', { rows: { str: { str: 'сильный', tired: true } } })]);
    // #when
    const { records, count } = imported(input);
    // #then
    expect({ str: dataOf(records, 'blk:brok'), count }).toEqual({
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
      brok: dataOf(records, 'blk:brok'),
      npc: dataOf(records, 'blk:npc'),
      root: records.has('blk:brok'),
      count,
    }).toEqual({ brok: { str: 3 }, npc: { hp: 4 }, root: true, count: 2 });
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
      root: dataOf(records, 'blk:brok'),
      block: dataOf(records, 'blk:brok:attack:i1'),
      count,
    }).toEqual({ root: {}, block: { order: 0, cells: { attack: 'Лук' } }, count: 2 });
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
      i1: dataOf(records, 'blk:brok:attack:i1'),
      i2: dataOf(records, 'blk:brok:attack:i2'),
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
    expect({ block: dataOf(records, 'blk:npc:npc_name:n1'), count }).toEqual({
      block: { order: 0, cells: { ac: 12, might: 3, npc_name: 'Волк' } },
      count: 0,
    });
  });
  test('keeps every select-only repeat block through export and import into the same preset', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'inventory',

          title: 'Инвентарь',
          tabs: [
            {
              sections: [
                {
                  repeat: { id: 'armor', nameField: 'name' },
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'name' },
                        {
                          kind: 'field',
                          type: 'select',
                          id: 'armor',
                          options: ['Кожаная', 'Кольчуга'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const room = new Map<string, VersionedRecord>([
      [
        'blk:inventory:armor:a1',
        {
          k: 'blk:inventory:armor:a1',
          d: { order: 2, cells: { armor: ['Кожаная', 3, 'gm'] } },
          c: 3,
          a: 'gm',
          l: [1, 'seed'],
        },
      ],
      [
        'blk:inventory:armor:a2',
        {
          k: 'blk:inventory:armor:a2',
          d: { order: 0, cells: { armor: ['Кольчуга', 4, 'gm'] } },
          c: 4,
          a: 'gm',
          l: [1, 'seed'],
        },
      ],
    ]);

    const snapshot = encodeSnapshotFile(room, preset);
    // #when
    const result = importSnapshot(snapshot, { preset, data: CURRENT.data }, AUTHOR);

    // #then
    if (!result.ok) {
      throw new Error(`the import failed: ${result.error}`);
    }

    const records = assembleRecords(result.value.records);
    expect({
      a1: dataOf(records, 'blk:inventory:armor:a1'),
      a2: dataOf(records, 'blk:inventory:armor:a2'),
      count: result.value.count,
      sheets: result.value.sheets,
    }).toEqual({
      a1: { order: 2, cells: { armor: 'Кожаная' } },
      a2: { order: 0, cells: { armor: 'Кольчуга' } },
      count: 0,
      sheets: 0,
    });
  });
  test('matches a snapshot text value to a current dice-choice field', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'inventory',

          title: 'Инвентарь',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        {
                          kind: 'field',
                          type: 'dice-choice',
                          id: 'weapon_die',
                          options: ['d6', 'd8'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const input = file([single('inventory', { rows: { weapon_die: { weapon_die: 'd8' } } })]);

    // #when
    const actual = (() => {
      try {
        const result = importSnapshot(input, { preset, data: CURRENT.data }, AUTHOR);

        return result.ok
          ? {
              row: dataOf(assembleRecords(result.value.records), 'blk:inventory'),
              count: result.value.count,
            }
          : result;
      } catch (error) {
        return { threw: error instanceof Error ? error.message : String(error) };
      }
    })();

    // #then
    expect(actual).toEqual({ row: { weapon_die: 'd8' }, count: 0 });
  });
  test('drops an unknown block scope instead of guessing from its field ids', () => {
    // #given: `gear` is no section id now, even though `item` and `weight` exist elsewhere.
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
    expect({ block: dataOf(records, 'blk:brok:item:i1'), count }).toEqual({
      block: null,
      count: 3,
    });
  });
  test('does not relocate values from a known scope when none fit that scope', () => {
    // #given: `item` is a section id, but its `item` field is text and here it holds a number;
    // `bonus` belongs to another scope.
    const input = file([
      pc('brok', {
        repeats: { item: [{ instanceId: 'i1', order: 0, cells: { item: 5, bonus: 1 } }] },
      }),
    ]);

    // #when
    const { records, count } = imported(input);
    // #then
    expect({
      item: dataOf(records, 'blk:brok:item:i1'),
      attack: dataOf(records, 'blk:brok:attack:i1'),
      count,
    }).toEqual({
      item: { order: 0, cells: {} },
      attack: null,
      count: 2,
    });
  });
  test('does not use template order to guess an unknown block scope', () => {
    // #given: the unknown scope contains one field from each current section.
    const input = file([
      pc('brok', {
        repeats: { mixed: [{ instanceId: 'i1', order: 0, cells: { bonus: 1, weight: 2 } }] },
      }),
    ]);

    // #when
    const { records, count } = imported(input);
    // #then
    expect({
      attack: dataOf(records, 'blk:brok:attack:i1'),
      item: dataOf(records, 'blk:brok:item:i1'),
      count,
    }).toEqual({ attack: null, item: null, count: 2 });
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
      keys: [...records.keys()].filter((key) => key.startsWith('blk:')),
      count,
    }).toEqual({ keys: ['blk:brok', 'blk:npc'], count: 3 });
  });
  test('keeps a known section and drops an unknown one without shifting orders', () => {
    // #given: `item` is current and `gear` is unknown.
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
    // #then: both values under `gear` are dropped. The current `item` blocks keep their orders.
    expect({
      i1: dataOf(records, 'blk:brok:item:i1'),
      i2: dataOf(records, 'blk:brok:item:i2'),
      g1: dataOf(records, 'blk:brok:item:g1'),
      count,
    }).toEqual({
      i1: { order: 0, cells: { item: 'Фляга' } },
      i2: { order: 3, cells: { item: 'Нож' } },
      g1: null,
      count: 2,
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
      attack: dataOf(records, 'blk:brok:attack:i1'),
      item: records.has('blk:brok:item:i1'),
      count,
    }).toEqual({ attack: { order: 0, cells: { attack: 'Меч' } }, item: false, count: 2 });
  });
  test('drops every sheet no template owns with its values and links, counting sheets apart', () => {
    // #given: a set no template has, an id no single sheet has, a set sheet under a template id,
    // and a set that names a single sheet.
    const input = file(
      [
        {
          id: 'x',
          set: 'monsters',
          order: 0,
          cells: fixtureSnapshotCells({ a: { a: 1 } }),
          blocks: fixtureSnapshotBlocks({}),
        },
        single('ghost', {
          repeats: { g: [{ instanceId: 'i1', order: 0, cells: { g: 'x', h: 2 } }] },
        }),
        pc('npc'),
        {
          id: 's2',
          set: 'npc',
          order: 0,
          cells: fixtureSnapshotCells({}),
          blocks: fixtureSnapshotBlocks({}),
        },
        pc('brok'),
      ],
      [
        { tokenId: 't1', sheetId: 'x', cellId: 'token' },
        { tokenId: 't2', sheetId: 'ghost', path: ['g', 'i1'], cellId: 'token' },
        { tokenId: 't3', sheetId: 'npc', cellId: 'token' },
        { tokenId: 't4', sheetId: 'brok', cellId: 'token' },
      ],
    );

    // #when
    const { records, count, sheets } = imported(input);
    // #then
    expect({ keys: [...records.keys()], count, sheets }).toEqual({
      keys: ['blk:brok', 'blk:npc', 'link:t4', 'preset'],
      count: 3,
      sheets: 4,
    });
  });
  test('keeps only the links that are live over the imported records, uncounted', () => {
    // #given: a linkable sheet, a linkable repeat block, a repeat block the file lacks, a repeat
    // block of a section with no `tokens`, and a single sheet whose template has no `tokens`.
    const input = file(
      [
        pc('brok', {
          repeats: { attack: [{ instanceId: 'a1', order: 0, cells: { attack: 'Меч' } }] },
        }),
        single('npc', {
          repeats: { npc_name: [{ instanceId: 'n1', order: 0, cells: { npc_name: 'Скелет' } }] },
        }),
      ],
      [
        { tokenId: 't1', sheetId: 'brok', cellId: 'token' },
        {
          tokenId: 't2',
          sheetId: 'npc',
          path: ['npc_name', 'n1'],
          cellId: 'token',
        },
        {
          tokenId: 't3',
          sheetId: 'npc',
          path: ['npc_name', 'n9'],
          cellId: 'token',
        },
        {
          tokenId: 't4',
          sheetId: 'brok',
          path: ['attack', 'a1'],
          cellId: 'token',
        },
        { tokenId: 't5', sheetId: 'npc', cellId: 'token' },
      ],
    );

    // #when
    const { records, count, sheets } = imported(input);
    // #then
    expect({
      links: [...records.keys()].filter((key) => key.startsWith('link:')),
      count,
      sheets,
    }).toEqual({ links: ['link:t1', 'link:t2'], count: 0, sheets: 0 });
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
    [{ tokenId: 't1', sheetId: 'brok', cellId: 'token' }],
  );

  test('reads a file of the v4 format', () => {
    // #when
    const parsed = parseSnapshotFile(JSON.stringify(valid));
    // #then
    expect(parsed).toEqual({ ok: true, value: valid });
  });
  test.each([
    ['not JSON', '{', 'not-json'],
    ['a newer v, whatever its shape', '{"v":5,"sheets":7}', 'newer-version'],
    [
      'a v1 snapshot file',
      '{"v":1,"type":"muster-roll/snapshot","sheets":[],"links":[]}',
      'older-version',
    ],
    [
      'a lower v',
      '{"v":0,"type":"muster-roll/snapshot","sheets":[],"links":[]}',
      'unsupported-version',
    ],
    ['no v', '{"type":"muster-roll/snapshot"}', 'unsupported-version'],
    ['a preset file', '{"v":3,"templates":[]}', 'not-snapshot'],
    ['an object of another type with no v', '{"type":"other/thing"}', 'not-snapshot'],
    ['an array', '[]', 'invalid-structure'],
    [
      'a wrong shape',
      '{"v":4,"type":"muster-roll/snapshot","sheets":{},"links":[]}',
      'invalid-structure',
    ],
    [
      'a link to no sheet of the file',
      '{"v":4,"type":"muster-roll/snapshot","sheets":[],"links":[{"tokenId":"t","sheetId":"x"}]}',
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
