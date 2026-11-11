import { describe, expect, test } from 'bun:test';

import type { Preset, PresetSection, Template } from '@/core/preset';
import type { JsonValue } from '@/core/json';
import type { VersionedRecord } from '@/core/records';

import {
  dependentSheetId,
  isDependentKey,
  isSheetDependent,
  liveSheets,
  repeatBlockName,
  resolveSheet,
  SHEET_NAME_MAX_LENGTH,
  sheetIdSchema,
  sheetName,
  sortSheets,
  templateSheetIds,
} from './sheets';

// A linkable sheet set whose name field is the second field of the row `level`.
const PC: Template = {
  id: 'pc',
  kind: 'set',
  title: 'Персонажи',
  nameField: 'name',
  tokens: true,
  sections: [
    {
      rows: [
        [
          { kind: 'text', text: 'Уровень' },
          { kind: 'field', type: 'number', id: 'level' },
          { kind: 'text', text: 'Имя' },
          { kind: 'field', type: 'text', id: 'name' },
        ],
      ],
    },
  ],
};

const NPC_SECTION: PresetSection = {
  repeat: true,
  tokens: true,
  rows: [
    [
      { kind: 'field', type: 'text', id: 'npc_name' },
      { kind: 'field', type: 'number', id: 'hp' },
    ],
  ],
};

// A hidden single sheet. Only its repeat section is linkable, not the sheet.
const NPC: Template = {
  id: 'npc',
  kind: 'single',
  title: 'НПС',
  visibility: 'gm',
  sections: [NPC_SECTION],
};

const INVENTORY: Template = {
  id: 'inventory',
  kind: 'single',
  title: 'Инвентарь',
  players: 'edit',
  tokens: true,
  sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'items' }]] }],
};

const JOURNAL: Template = {
  id: 'journal',
  kind: 'single',
  title: 'Журнал',
  sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'entry' }]] }],
};

const VILLAINS: Template = {
  id: 'villains',
  kind: 'set',
  title: 'Злодеи',
  nameField: 'villain',
  visibility: 'gm',
  sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'villain' }]] }],
};

const PRESET: Preset = { v: 2, templates: [PC, NPC, INVENTORY, JOURNAL, VILLAINS] };

function record(k: string, d: JsonValue): VersionedRecord {
  // SAFETY: some cases build a record no schema takes on purpose, so the code under test meets it.
  return { k, d, c: 1, a: 'gm' } as VersionedRecord;
}

function recordsOf(...records: VersionedRecord[]): ReadonlyMap<string, VersionedRecord> {
  return new Map(records.map((entry) => [entry.k, entry]));
}

describe('SHEET_NAME_MAX_LENGTH', () => {
  test('is 100 characters, as TASK-8 names it', () => {
    // #then
    expect(SHEET_NAME_MAX_LENGTH).toBe(100);
  });
});

describe('sheetIdSchema', () => {
  test.each(['V1StGXR8_Z5jdHi6B-myT', 'a', 'a'.repeat(64)])('accepts %s', (id) => {
    // #then
    expect(sheetIdSchema.safeParse(id).success).toBe(true);
  });

  test.each(['', 'a'.repeat(65), 'a:b', 'a b', 'лист', 'a.b'])('refuses %j', (id) => {
    // #then
    expect(sheetIdSchema.safeParse(id).success).toBe(false);
  });
});

describe('resolveSheet', () => {
  test('gives a live sheet of a sheet set its set, per-player write and its name field', () => {
    // #given
    const records = recordsOf(record('sheet:brok', { set: 'pc', order: 0 }));

    // #when
    const policy = resolveSheet(records, PRESET, 'brok');

    // #then
    expect(policy).toEqual({
      sheetId: 'brok',
      template: PC,
      hidden: false,
      write: 'per-player',
      nameField: { rowId: 'level', fieldId: 'name' },
      linkable: true,
    });
  });

  test('gives a single sheet with players edit to its template id with no sheet record', () => {
    // #when
    const policy = resolveSheet(recordsOf(), PRESET, 'inventory');

    // #then
    expect(policy).toEqual({
      sheetId: 'inventory',
      template: INVENTORY,
      hidden: false,
      write: 'players-edit',
      nameField: null,
      linkable: true,
    });
  });

  test('gives a single sheet with no players key no player write', () => {
    // #when
    const policy = resolveSheet(recordsOf(), PRESET, 'journal');

    // #then
    expect(policy).toEqual({
      sheetId: 'journal',
      template: JOURNAL,
      hidden: false,
      write: 'none',
      nameField: null,
      linkable: false,
    });
  });

  test('gives a hidden single sheet no player write, and a linkable repeat section does not make it linkable', () => {
    // #when
    const policy = resolveSheet(recordsOf(), PRESET, 'npc');

    // #then
    expect(policy).toEqual({
      sheetId: 'npc',
      template: NPC,
      hidden: true,
      write: 'none',
      nameField: null,
      linkable: false,
    });
  });

  test('gives a sheet of a hidden sheet set no player write', () => {
    // #given
    const records = recordsOf(record('sheet:boss', { set: 'villains', order: 0 }));

    // #when
    const policy = resolveSheet(records, PRESET, 'boss');

    // #then
    expect(policy).toEqual({
      sheetId: 'boss',
      template: VILLAINS,
      hidden: true,
      write: 'none',
      nameField: { rowId: 'villain', fieldId: 'villain' },
      linkable: false,
    });
  });

  test('keeps a single sheet its own when a sheet record names a sheet set under its id', () => {
    // #given
    const records = recordsOf(record('sheet:inventory', { set: 'pc', order: 0 }));

    // #when
    const policy = resolveSheet(records, PRESET, 'inventory');

    // #then
    expect(policy?.template).toBe(INVENTORY);
  });

  test.each<[string, ReadonlyMap<string, VersionedRecord>, string]>([
    ['a sheet with no sheet record', recordsOf(), 'brok'],
    ['a tombstoned sheet', recordsOf(record('sheet:brok', null)), 'brok'],
    [
      'a sheet record whose set is a single sheet',
      recordsOf(record('sheet:brok', { set: 'inventory', order: 0 })),
      'brok',
    ],
    [
      'a sheet record whose set names no template',
      recordsOf(record('sheet:brok', { set: 'gone', order: 0 })),
      'brok',
    ],
    [
      'a sheet id equal to a sheet set id',
      recordsOf(record('sheet:pc', { set: 'pc', order: 0 })),
      'pc',
    ],
    [
      'a sheet record of another shape',
      recordsOf(record('sheet:brok', { kind: 'pc', name: 'Брок', order: 0 })),
      'brok',
    ],
  ])('resolves %s to no template', (_name, records, sheetId) => {
    // #then
    expect(resolveSheet(records, PRESET, sheetId)).toBeNull();
  });

  test('resolves nothing with no decoded preset', () => {
    // #then
    expect(resolveSheet(recordsOf(), null, 'inventory')).toBeNull();
  });
});

describe('sortSheets', () => {
  test('puts a lower order first', () => {
    // #when
    const sorted = sortSheets([
      { sheetId: 'a', order: 2 },
      { sheetId: 'b', order: 0 },
      { sheetId: 'c', order: 1 },
    ]);

    // #then
    expect(sorted.map((sheet) => sheet.sheetId)).toEqual(['b', 'c', 'a']);
  });

  test('breaks an order tie by sheetId in code unit order, not locale order', () => {
    // #given: locale order would put "a" before "B" and "Z".
    const sheets = [
      { sheetId: 'a', order: 0 },
      { sheetId: 'Z', order: 0 },
      { sheetId: 'B', order: 0 },
      { sheetId: '_', order: 0 },
      { sheetId: '-', order: 0 },
    ];

    // #when
    const sorted = sortSheets(sheets);

    // #then
    expect(sorted.map((sheet) => sheet.sheetId)).toEqual(['-', 'B', 'Z', '_', 'a']);
  });

  test('gives the same order whatever order the sheets come in', () => {
    // #given
    const b = { sheetId: 'b', order: 1 };
    const a = { sheetId: 'a', order: 1 };
    const c = { sheetId: 'c', order: 0 };

    // #when
    const orders = [sortSheets([b, a, c]), sortSheets([c, a, b])];

    // #then
    expect(orders.map((sorted) => sorted.map((sheet) => sheet.sheetId))).toEqual([
      ['c', 'a', 'b'],
      ['c', 'a', 'b'],
    ]);
  });
});

describe('liveSheets', () => {
  const RECORDS: VersionedRecord[] = [
    record('sheet:b', { set: 'pc', order: 1 }),
    record('sheet:gone', null),
    record('sheet:boss', { set: 'villains', order: 0 }),
    record('preset', 'AAAA'),
    record('sheet:a', { set: 'pc', order: 1 }),
    record('sheet:inventory', { set: 'pc', order: 0 }),
    record('sheet:z', { set: 'pc', order: 0 }),
  ];

  test('lists the live sheets of one sheet set in tab order, leaving out a sheet id that is a template id', () => {
    // #when
    const sheets = liveSheets(RECORDS, PRESET, 'pc');

    // #then
    expect(sheets).toEqual([
      { sheetId: 'z', set: 'pc', order: 0 },
      { sheetId: 'a', set: 'pc', order: 1 },
      { sheetId: 'b', set: 'pc', order: 1 },
    ]);
  });

  test.each([
    ['a single sheet', 'inventory'],
    ['an unknown template', 'gone'],
  ])('lists nothing for %s', (_name, setId) => {
    // #then
    expect(liveSheets(RECORDS, PRESET, setId)).toEqual([]);
  });
});

describe('templateSheetIds', () => {
  test('lists the live sheets of a sheet set', () => {
    // #given
    const records = [
      record('sheet:liza', { set: 'pc', order: 1 }),
      record('sheet:brok', { set: 'pc', order: 0 }),
    ];

    // #then
    expect(templateSheetIds(records, PRESET, PC)).toEqual(['brok', 'liza']);
  });

  test('lists a single sheet as its template id', () => {
    // #then
    expect(templateSheetIds([], PRESET, INVENTORY)).toEqual(['inventory']);
  });
});

describe('sheetName', () => {
  test('names a sheet of a sheet set by its name field value, read from the row the field sits in', () => {
    // #given
    const records = recordsOf(
      record('sheet:brok', { set: 'pc', order: 0 }),
      record('row:brok:level', { level: 3, name: 'Брок' }),
    );

    // #then
    expect(sheetName(records, PRESET, 'brok')).toBe('Брок');
  });

  test('names a single sheet by its title', () => {
    // #then
    expect(sheetName(recordsOf(), PRESET, 'inventory')).toBe('Инвентарь');
  });

  test.each<[string, VersionedRecord[]]>([
    ['no row record', []],
    ['an emptied row record', [record('row:brok:level', {})]],
    ['a blank value', [record('row:brok:level', { name: '   ' })]],
    ['a tombstoned row record', [record('row:brok:level', null)]],
  ])('gives the empty name for %s', (_name, rows) => {
    // #given
    const records = recordsOf(record('sheet:brok', { set: 'pc', order: 0 }), ...rows);

    // #then
    expect(sheetName(records, PRESET, 'brok')).toBe('');
  });

  test('names a sheet whose name field holds a number by its digits', () => {
    // #given
    const records = recordsOf(
      record('sheet:brok', { set: 'pc', order: 0 }),
      record('row:brok:level', { name: 12 }),
    );

    // #then
    expect(sheetName(records, PRESET, 'brok')).toBe('12');
  });

  test('names no sheet that no template owns', () => {
    // #then
    expect(sheetName(recordsOf(record('sheet:brok', null)), PRESET, 'brok')).toBeNull();
  });
});

describe('repeatBlockName', () => {
  test('names a repeat block by its first field value', () => {
    // #given
    const records = recordsOf(
      record('rep:npc:npc_name:s1', { order: 0, cells: { npc_name: 'Скелет 1', hp: 7 } }),
    );

    // #then
    expect(repeatBlockName(records, 'npc', NPC_SECTION, 's1')).toBe('Скелет 1');
  });

  test.each<[string, VersionedRecord[]]>([
    ['an empty first field', [record('rep:npc:npc_name:s1', { order: 0, cells: { hp: 7 } })]],
    ['no rep record', []],
    ['a tombstoned rep record', [record('rep:npc:npc_name:s1', null)]],
  ])('gives the empty name for %s', (_name, reps) => {
    // #then
    expect(repeatBlockName(recordsOf(...reps), 'npc', NPC_SECTION, 's1')).toBe('');
  });

  test('gives the empty name when the first field is a check', () => {
    // #given
    const section: PresetSection = {
      repeat: true,
      rows: [
        [
          { kind: 'field', type: 'check', id: 'ready' },
          { kind: 'field', type: 'text', id: 'label' },
        ],
      ],
    };

    const records = recordsOf(
      record('rep:npc:ready:s1', { order: 0, cells: { ready: true, label: 'Скелет' } }),
    );

    // #then
    expect(repeatBlockName(records, 'npc', section, 's1')).toBe('');
  });
});

describe('isSheetDependent', () => {
  test.each([
    ['a row', 'row:brok:str', { str: 3 }],
    ['a repeat block', 'rep:brok:items:i1', { order: 0, cells: {} }],
    ['an access grant', 'acl:brok:p1', { name: 'Оля' }],
    ['a player link', 'plink:brok:p1', { name: 'Оля' }],
    ['a token link to the sheet', 'link:token1', { s: 'brok' }],
    ['a token link to a repeat block of the sheet', 'link:token1', { s: 'brok', i: 'i1' }],
  ])('counts %s of the sheet', (_name, key, d) => {
    // #when
    const dependent = isSheetDependent(key, { d }, 'brok');

    // #then
    expect(dependent).toBe(true);
  });

  test.each([
    ['the sheet record itself', 'sheet:brok', { set: 'pc', order: 0 }],
    ['the preset', 'preset', 'AAAA'],
    ['a row of another sheet', 'row:liza:str', { str: 3 }],
    ['a row of a sheet whose id starts with this one', 'row:brokk:str', { str: 3 }],
    ['an access grant of a sheet whose id starts with this one', 'acl:brok2:p1', { name: 'Оля' }],
    ['a token link that names another sheet', 'link:token1', { s: 'liza' }],
    ['a token link whose token id is the sheet id', 'link:brok', { s: 'liza' }],
    ['a token link in the old bare sheet id form', 'link:token1', 'brok'],
  ])('does not count %s', (_name, key, d) => {
    // #when
    const dependent = isSheetDependent(key, { d }, 'brok');

    // #then
    expect(dependent).toBe(false);
  });
});

describe('isDependentKey', () => {
  test.each([
    ['row:brok:str', true],
    ['rep:brok:attack:i1', true],
    ['acl:brok:p1', true],
    ['plink:brok:p1', true],
    ['link:token1', true],
    ['sheet:brok', false],
    ['preset', false],
  ])('judges %s as %p', (key, expected) => {
    // #then
    expect(isDependentKey(key)).toBe(expected);
  });
});

describe('dependentSheetId', () => {
  test.each([
    ['a row', 'row:brok:str', { str: 3 }, 'brok'],
    ['an access grant', 'acl:brok:p1', { name: 'Оля' }, 'brok'],
    ['a player link', 'plink:brok:p1', { name: 'Оля' }, 'brok'],
    ['a token link to a sheet', 'link:token1', { s: 'brok' }, 'brok'],
    ['a token link to a repeat block', 'link:token1', { s: 'brok', i: 'i1' }, 'brok'],
    ['a row key with no second ":"', 'row:brok', { str: 3 }, null],
    ['a row key with an empty sheet id', 'row::x', { str: 3 }, null],
    ['a token link whose sheet is no sheet id', 'link:token1', { s: 'not a sheet id' }, null],
    ['a token link in the old bare sheet id form', 'link:token1', 'brok', null],
    ['a tombstoned token link', 'link:token1', null, null],
    ['the sheet record itself', 'sheet:brok', { set: 'pc', order: 0 }, null],
  ])('reads %s', (_name, key, d, expected) => {
    // #when
    const sheetId = dependentSheetId(key, { d });

    // #then
    expect(sheetId).toBe(expected);
  });
});
