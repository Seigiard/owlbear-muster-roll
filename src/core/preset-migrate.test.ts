import { assembleRecords } from '@/core/merge';
import { fixtureCells, fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type {
  Preset,
  PresetCell,
  PresetFieldCell,
  PresetSection,
  SheetSetTemplate,
  SingleSheetTemplate,
  Template,
} from '@/core/preset';
import type { FieldValue, VersionedRecord } from '@/core/records';
import { presetDiff, presetMoves, stripToTemplate, type PresetMigration } from './preset-migrate';

type Values = Record<string, FieldValue>;

function number(id: string): PresetFieldCell {
  return { kind: 'field', type: 'number', id };
}

function text(id: string): PresetFieldCell {
  return { kind: 'field', type: 'text', id };
}

function check(id: string): PresetFieldCell {
  return { kind: 'field', type: 'check', id };
}

function select(id: string, options: string[]): PresetFieldCell {
  return { kind: 'field', type: 'select', id, options };
}

function diceChoice(id: string, options: string[]): PresetFieldCell {
  return { kind: 'field', type: 'dice-choice', id, options };
}

function namedNumber(id: string, name?: string): PresetFieldCell {
  return name === undefined ? number(id) : { ...number(id), name };
}

function rows(...cells: PresetCell[][]): PresetSection {
  return { rows: cells.map((rowCells) => ({ cells: rowCells })) };
}

function repeat(...cells: PresetCell[]): PresetSection {
  const fields = cells.filter((cell) => cell.kind === 'field');
  const id = fields[0]?.id ?? 'repeat';
  const nameField = fields.find((field) => field.type === 'text')?.id ?? id;

  return { repeat: { id, nameField }, rows: [{ cells }] };
}

// A repeat section of several rows, all of which form one repeat block.
function repeatRows(...cells: PresetCell[][]): PresetSection {
  const fields = cells.flat().filter((cell) => cell.kind === 'field');
  const id = fields[0]?.id ?? 'repeat';
  const nameField = fields.find((field) => field.type === 'text')?.id ?? id;

  return {
    repeat: { id, nameField },
    rows: cells.map((rowCells) => ({ cells: rowCells })),
  };
}

function linkable(section: PresetSection): PresetSection {
  const [first, ...rest] = section.rows;

  return first === undefined
    ? section
    : {
        ...section,
        rows: [{ ...first, cells: [...first.cells, { kind: 'token', id: 'token' }] }, ...rest],
      };
}

// The sheet set `pc`, named by its `notes` field.
function sheetSet(
  sections: PresetSection[],
  extra: Partial<SheetSetTemplate> = {},
): SheetSetTemplate {
  return {
    id: 'pc',

    title: 'Персонажи',
    repeat: { nameField: 'notes' },
    tabs: [{ sections }],
    ...extra,
  };
}

function single(
  id: string,
  sections: PresetSection[],
  extra: Partial<SingleSheetTemplate> = {},
): SingleSheetTemplate {
  return { id, title: id, tabs: [{ sections }], ...extra };
}

function presetOf(...templates: Template[]): Preset {
  return { v: 4, templates };
}

// A preset whose only template is the sheet set `pc` with these sections.
function preset(character: PresetSection[]): Preset {
  return presetOf(sheetSet(character));
}

const BASE_SECTIONS: PresetSection[] = [
  rows([{ kind: 'text', text: 'Сила' }, number('str'), check('str_tired')], [text('notes')]),
  rows([number('hp')]),
  repeat(text('attack'), number('bonus')),
];

// A sheet of a sheet set with a plain row of a number and a check, a text row, a number row, and a
// repeat section of a text and a number.
const BASE = preset(BASE_SECTIONS);

function sheet(id: string, set = 'pc'): VersionedRecord {
  return { k: `blk:${id}`, d: { set, order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] };
}

function row(sheetId: string, rowId: string, d: Values | null): VersionedRecord {
  if (d === null) {
    return { k: `blk:${sheetId}`, d: null, c: 2, a: 'seed', l: [1, 'seed'] };
  }

  return {
    k: `blk:${sheetId}`,
    d: { order: 0, cells: fixtureCells(d, 2, 'seed') },
    c: 2,
    a: 'seed',
    l: [1, 'seed'],
  };
}

function rep(
  sheetId: string,
  sectionId: string,
  instanceId: string,
  cells: Values | null,
  order = 0,
): VersionedRecord {
  const d = cells === null ? null : { order, cells };

  return fixtureRecord(`blk:${sheetId}:${sectionId}:${instanceId}`, d, 2, 'seed');
}

function link(tokenId: string, s: string, i?: string): VersionedRecord {
  return {
    k: `link:${tokenId}`,
    d: i === undefined ? { s, c: 'token' } : { s, path: ['npc_name', i], c: 'token' },
    c: 2,
    a: 'seed',
  };
}

function player(form: 'acl' | 'plink', sheetId: string, playerId: string): VersionedRecord {
  return fixtureRecord(`${form}:${sheetId}:${playerId}`, { name: 'Лиза' }, 2, 'seed');
}

function replica(...records: VersionedRecord[]): Map<string, VersionedRecord> {
  return assembleRecords(records);
}

function writes(migration: PresetMigration) {
  return {
    first: migration.first.map((write) => `${write.k}=${JSON.stringify(write.d)}`),
    last: migration.last.map((write) => `${write.k}=${JSON.stringify(write.d)}`),
  };
}

function summary(migration: PresetMigration) {
  return {
    count: migration.count,
    sheets: migration.sheets,
    removed: migration.removed,
    ...writes(migration),
  };
}

describe('presetDiff', () => {
  test('erases and moves nothing when only the window size changes', () => {
    // #given
    const resized: Preset = { ...BASE, window: { width: 900, height: 700 } };

    const records = replica(
      sheet('brok'),
      row('brok', 'str', { str: 12, str_tired: false }),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 3 }),
    );

    // #when
    const migration = presetDiff(records, BASE, resized);
    // #then
    expect(summary(migration)).toEqual({
      count: 0,
      sheets: 0,
      removed: {},
      first: [],
      last: [],
    });
  });
  test('keeps every value and key when sections move to another tab', () => {
    // #given: the same sections, split over two titled tabs.
    const [first, second, third] = BASE_SECTIONS;

    const split = presetOf(
      sheetSet([], {
        tabs: [
          { title: 'Основное', sections: first === undefined ? [] : [first] },
          {
            title: 'Бой',
            sections: [second, third].filter((section) => section !== undefined),
          },
        ],
      }),
    );

    const records = replica(
      sheet('brok'),
      row('brok', 'str', { str: 12, str_tired: false }),
      row('brok', 'hp', { hp: 9 }),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 3 }),
    );

    // #when
    const migration = presetDiff(records, BASE, split);
    // #then
    expect(summary(migration)).toEqual({
      count: 0,
      sheets: 0,
      removed: {},
      first: [],
      last: [],
    });
  });
  test('counts the values of a removed tab', () => {
    // #given: two tabs, then the second one removed with its repeat section.
    const [first, second, third] = BASE_SECTIONS;

    const twoTabs = presetOf(
      sheetSet([], {
        tabs: [
          {
            title: 'Основное',
            sections: [first, second].filter((section) => section !== undefined),
          },
          { title: 'Бой', sections: third === undefined ? [] : [third] },
        ],
      }),
    );

    const oneTab = presetOf(
      sheetSet([], {
        tabs: [
          {
            title: 'Основное',
            sections: [first, second].filter((section) => section !== undefined),
          },
        ],
      }),
    );

    const records = replica(
      sheet('brok'),
      row('brok', 'str', { str: 12, str_tired: false }),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 3 }),
    );

    // #when
    const migration = presetDiff(records, twoTabs, oneTab);
    // #then
    expect(migration.count).toBe(2);
    expect(migration.removed).toEqual({ pc: ['attack', 'bonus'] });
  });
  test('keeps every value when only a label changes', () => {
    // #given
    const renamed = preset([
      rows([{ kind: 'text', text: 'Мощь' }, number('str'), check('str_tired')], [text('notes')]),
      rows([number('hp')]),
      repeat(text('attack'), number('bonus')),
    ]);

    const records = replica(
      sheet('brok'),
      row('brok', 'str', { str: 12, str_tired: false }),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 3 }),
    );

    // #when
    const migration = presetDiff(records, BASE, renamed);
    // #then
    expect(migration).toEqual({
      count: 0,
      sheets: 0,
      digest: expect.any(String),
      removed: {},
      first: [],
      last: [],
    });
  });
  test.each([
    ['adds', number('hp'), namedNumber('hp', 'Хиты')],
    ['changes', namedNumber('hp', 'Хиты'), namedNumber('hp', 'HP')],
    ['removes', namedNumber('hp', 'Хиты'), number('hp')],
  ] as const)(
    '%s a cell name without removing or erasing its value',
    (_change, oldField, nextField) => {
      // #given
      const old = preset([rows([oldField], [text('notes')])]);
      const next = preset([rows([nextField], [text('notes')])]);
      const records = replica(sheet('brok'), row('brok', 'hp', { hp: 7 }));
      // #when
      const migration = presetDiff(records, old, next);
      // #then
      expect(summary(migration)).toEqual({
        count: 0,
        sheets: 0,
        removed: {},
        first: [],
        last: [],
      });
    },
  );
  test('counts a removed field that holds a value, `false` and 0 included', () => {
    // #given: str_tired and hp go. Their root cells become versioned null markers.
    const next = preset([
      rows([number('str')], [text('notes')]),
      repeat(text('attack'), number('bonus')),
    ]);

    const records = replica(
      sheet('brok'),
      row('brok', 'str', { str: 12, str_tired: false }),
      row('brok', 'hp', { hp: 0 }),
    );

    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect(summary(migration)).toEqual({
      count: 2,
      sheets: 0,
      removed: { pc: ['hp', 'str_tired'] },
      first: [],
      last: [
        'blk:brok={"order":0,"set":"pc","cells":{"str":[12,2,"seed"],"str_tired":[null,2,"seed"],"hp":[null,2,"seed"]}}',
      ],
    });
  });
  test('does not count a removed field with no key', () => {
    // #given
    const next = preset([rows([number('str')], [text('notes')]), rows([number('hp')])]);
    const records = replica(sheet('brok'), row('brok', 'str', { str: 12 }));
    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: [],
      last: [],
    });
  });
  test('counts a field whose type changes under the same id', () => {
    // #given
    const next = preset([
      rows([number('str'), check('str_tired')], [number('notes')]),
      rows([number('hp')]),
      repeat(text('attack'), number('bonus')),
    ]);

    const records = replica(sheet('brok'), row('brok', 'notes', { notes: 'Храбрый' }));
    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect({ count: migration.count, removed: migration.removed, ...writes(migration) }).toEqual({
      count: 1,
      removed: { pc: ['notes'] },
      first: [],
      last: ['blk:brok={"order":0,"set":"pc","cells":{"notes":[null,2,"seed"]}}'],
    });
  });
  test('keeps a plain select value when only its options change', () => {
    // #given
    const old = preset([rows([select('armor', ['Кожаная', 'Кольчуга'])])]);
    const next = preset([rows([select('armor', ['Без доспеха', 'Кожаная'])])]);
    const records = replica(sheet('brok'), row('brok', 'armor', { armor: 'Кольчуга' }));
    // #when
    const migration = capture(() => summary(presetDiff(records, old, next)));

    const helperControls = {
      success: capture(() => 'control'),
      failure: capture(() => {
        throw new Error('control error');
      }),
    };

    // #then
    expect({ helperControls, migration }).toEqual({
      helperControls: {
        success: { result: 'control' },
        failure: { threw: 'control error' },
      },
      migration: {
        result: { count: 0, sheets: 0, removed: {}, first: [], last: [] },
      },
    });
  });
  test('keeps a repeat-block select value when only its options change', () => {
    // #given
    const old = preset([repeat(select('armor', ['Кожаная', 'Кольчуга']), text('name'))]);
    const next = preset([repeat(select('armor', ['Без доспеха', 'Кожаная']), text('name'))]);
    const records = replica(sheet('brok'), rep('brok', 'armor', 'i1', { armor: 'Кольчуга' }));
    // #when
    const migration = capture(() => summary(presetDiff(records, old, next)));
    // #then
    expect(migration).toEqual({
      result: { count: 0, sheets: 0, removed: {}, first: [], last: [] },
    });
  });
  test('keeps a dice-choice value when only its options change', () => {
    // #given
    const old = preset([rows([diceChoice('weapon_die', ['d6', 'd8'])])]);
    const next = preset([rows([diceChoice('weapon_die', ['d8', 'd10'])])]);
    const records = replica(sheet('brok'), row('brok', 'weapon_die', { weapon_die: 'd6' }));
    // #when
    const migration = capture(() => summary(presetDiff(records, old, next)));
    // #then
    expect(migration).toEqual({
      result: { count: 0, sheets: 0, removed: {}, first: [], last: [] },
    });
  });
  test.each([
    ['select to dice-choice', select('weapon_die', ['d6']), diceChoice('weapon_die', ['d6'])],
    ['dice-choice to select', diceChoice('weapon_die', ['d6']), select('weapon_die', ['d6'])],
  ] as const)(
    'erases and counts a value when its type changes from %s',
    (_name, oldField, nextField) => {
      // #given
      const old = preset([rows([oldField])]);
      const next = preset([rows([nextField])]);
      const records = replica(sheet('brok'), row('brok', 'weapon_die', { weapon_die: 'd6' }));
      // #when
      const migration = capture(() => summary(presetDiff(records, old, next)));
      // #then
      expect(migration).toEqual({
        result: {
          count: 1,
          sheets: 0,
          removed: { pc: ['weapon_die'] },
          first: [],
          last: ['blk:brok={"order":0,"set":"pc","cells":{"weapon_die":[null,2,"seed"]}}'],
        },
      });
    },
  );
  test('erases and counts a text value when the field becomes a select', () => {
    // #given
    const old = preset([rows([text('notes')])]);
    const next = preset([rows([select('notes', ['Смелый', 'Осторожный'])])]);
    const records = replica(sheet('brok'), row('brok', 'notes', { notes: 'Смелый' }));
    // #when
    const migration = capture(() => summary(presetDiff(records, old, next)));
    // #then
    expect(migration).toEqual({
      result: {
        count: 1,
        sheets: 0,
        removed: { pc: ['notes'] },
        first: [],
        last: ['blk:brok={"order":0,"set":"pc","cells":{"notes":[null,2,"seed"]}}'],
      },
    });
  });
  test('erases a repeat-block field that becomes a select and keeps its other fields', () => {
    // #given
    const old = preset([repeat(text('item'), text('armor'))]);
    const next = preset([repeat(text('item'), select('armor', ['Кожаная', 'Кольчуга']))]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'item', 'i1', { item: 'Щит', armor: 'Кожаная' }, 4),
    );

    // #when
    const migration = presetDiff(records, old, next);
    // #then
    expect({ count: migration.count, removed: migration.removed, ...writes(migration) }).toEqual({
      count: 1,
      removed: { pc: ['armor'] },
      first: [],
      last: [
        'blk:brok:item:i1={"order":4,"cells":{"item":["Щит",2,"seed"],"armor":[null,2,"seed"]}}',
      ],
    });
  });
  test('keeps a root value when its field moves to another plain row', () => {
    // #given: hp joins the row of str. Both rows already share one stable v4 root block.
    const next = preset([
      rows([number('str'), check('str_tired'), number('hp')], [text('notes')]),
      repeat(text('attack'), number('bonus')),
    ]);

    const records = replica(
      sheet('brok'),
      row('brok', 'str', { str: 12 }),
      row('brok', 'hp', { hp: 7 }),
    );

    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: [],
      last: [],
    });
  });
  test('keeps the root block when the first field of a plain row changes', () => {
    // #given
    const next = preset([
      rows([check('str_tired'), number('str')], [text('notes')]),
      rows([number('hp')]),
      repeat(text('attack'), number('bonus')),
    ]);

    const records = replica(sheet('brok'), row('brok', 'str', { str: 12, str_tired: true }));
    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: [],
      last: [],
    });
  });
  test('keeps root values across a plain-row move and clears only a stale cell', () => {
    // #given: notes joins hp in another row, but both values stay in the same v4 root block.
    const next = preset([
      rows([number('str'), check('str_tired')]),
      rows([number('hp'), text('notes')]),
      repeat(text('attack'), number('bonus')),
    ]);

    const records = replica(
      sheet('brok'),
      row('brok', 'notes', { notes: 'Храбрый' }),
      row('brok', 'hp', { hp: 7, stale: 'x' }),
    );

    // #when
    const migration = presetDiff(records, BASE, next);
    // #then: the stale value becomes a versioned null after the preset, with no count.
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: [],
      last: [
        'blk:brok={"order":0,"set":"pc","cells":{"notes":["Храбрый",2,"seed"],"hp":[7,2,"seed"],"stale":[null,2,"seed"]}}',
      ],
    });
  });
  test('strips a repeat block in place when its section keeps its id', () => {
    // #given
    const next = preset([
      rows([number('str'), check('str_tired')], [text('notes')]),
      rows([number('hp')]),
      repeat(text('attack')),
    ]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 3 }),
    );

    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 1,
      first: [],
      last: [
        'blk:brok:attack:i1={"order":0,"cells":{"attack":["Меч",2,"seed"],"bonus":[null,2,"seed"]}}',
      ],
    });
  });
  test('tombstones a repeat block whose fields all go and counts each value', () => {
    // #given
    const next = preset([rows([number('str'), check('str_tired')], [text('notes')])]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 0 }),
      rep('brok', 'attack', 'i2', {}),
    );

    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 2,
      first: [],
      last: ['blk:brok:attack:i1=null', 'blk:brok:attack:i2=null'],
    });
  });
  test.each<[string, Preset, VersionedRecord, string]>([
    [
      'from a plain row into a repeat section',
      preset([
        rows([number('str'), check('str_tired')], [text('notes')]),
        repeat(text('attack'), number('bonus'), number('hp')),
      ]),
      row('brok', 'hp', { hp: 7 }),
      'hp',
    ],
    [
      'from a repeat section into a plain row',
      preset([
        rows([number('str'), check('str_tired'), number('bonus')], [text('notes')]),
        rows([number('hp')]),
        repeat(text('attack')),
      ]),
      rep('brok', 'attack', 'i1', { bonus: 3 }),
      'bonus',
    ],
    [
      'between two repeat sections',
      preset([
        rows([number('str'), check('str_tired')], [text('notes')]),
        rows([number('hp')]),
        repeat(text('attack')),
        repeat(text('spell'), number('bonus')),
      ]),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 3 }),
      'bonus',
    ],
  ])('counts a value whose field moves %s', (_name, next, record, fieldId) => {
    // #when
    const migration = presetDiff(replica(sheet('brok'), record), BASE, next);
    // #then
    expect(migration.removed.pc).toContain(fieldId);
  });
  test('prefers the new section that holds the old section id', () => {
    // #given: spell keeps more of the old fields, but the attack section still holds attack.
    const old = preset([repeat(text('attack'), number('bonus'), number('range'))]);

    const next = preset([
      repeat(text('spell'), number('bonus'), number('range')),
      repeat(text('attack')),
    ]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 2 }),
    );

    // #when
    const migration = presetDiff(records, old, next);
    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 1,
      first: [],
      last: [
        'blk:brok:attack:i1={"order":0,"cells":{"attack":["Меч",2,"seed"],"bonus":[null,2,"seed"]}}',
      ],
    });
  });
  test('gives two diffs with one count but other erased values other digests', () => {
    // #given
    const next = preset([rows([number('str')])]);
    const strTired = replica(sheet('brok'), row('brok', 'str', { str: 1, str_tired: true }));

    const notes = replica(
      sheet('brok'),
      row('brok', 'str', { str: 1 }),
      row('brok', 'notes', { notes: 'x' }),
    );

    // #when
    const first = presetDiff(strTired, BASE, next);
    const second = presetDiff(notes, BASE, next);
    // #then
    expect({ counts: [first.count, second.count], same: first.digest === second.digest }).toEqual({
      counts: [1, 1],
      same: false,
    });
  });
  test('gives two diffs with one count but other deleted sheets other digests', () => {
    // #given: each room loses one sheet of the removed sheet set, and no value.
    const next = presetOf(single('inventory', [rows([number('gold')])]));
    const brok = replica(sheet('brok'));
    const anya = replica(sheet('anya'));
    // #when
    const first = presetDiff(brok, BASE, next);
    const second = presetDiff(anya, BASE, next);
    // #then
    expect({ sheets: [first.sheets, second.sheets], same: first.digest === second.digest }).toEqual(
      {
        sheets: [1, 1],
        same: false,
      },
    );
  });
  test('leaves a new field empty and strips a stale value under its id', () => {
    // #given: `rage` is new, and the row holds a stale value under that id.
    const next = preset([
      rows([number('str'), check('str_tired'), number('rage')], [text('notes')]),
      rows([number('hp')]),
      repeat(text('attack'), number('bonus')),
    ]);

    const records = replica(sheet('brok'), row('brok', 'str', { str: 12, rage: 3 }));
    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: [],
      last: [
        'blk:brok={"order":0,"set":"pc","cells":{"str":[12,2,"seed"],"rage":[null,2,"seed"]}}',
      ],
    });
  });
  test('diffs a single sheet against its own template and skips deleted sheets', () => {
    // #given
    const old = presetOf(
      sheetSet([rows([number('hp')])]),
      single('npc', [rows([number('hp'), number('ac')])]),
    );

    const next = presetOf(sheetSet([rows([number('hp')])]), single('npc', [rows([number('hp')])]));

    const records = replica(
      row('npc', 'hp', { hp: 5, ac: 12 }),
      { k: 'blk:gone', d: null, c: 3, a: 'seed', l: [1, 'seed'] },
      row('gone', 'hp', { hp: 1, ac: 2 }),
    );

    // #when
    const migration = presetDiff(records, old, next);
    // #then
    expect(summary(migration)).toEqual({
      count: 1,
      sheets: 0,
      removed: { npc: ['ac'] },
      first: [],
      last: ['blk:npc={"order":0,"cells":{"hp":[5,2,"seed"],"ac":[null,2,"seed"]}}'],
    });
  });
  test('deletes every sheet of a removed sheet set with its dependents and counts its values', () => {
    // #given: three sheets of the sheet set exist; `gone` is a value the old preset does not show.
    const next = presetOf(single('npc', [rows([number('hp')])]));

    const records = replica(
      sheet('a'),
      row('a', 'str', { str: 12, str_tired: false }),
      rep('a', 'attack', 'i1', { attack: 'Меч' }),
      player('acl', 'a', 'p1'),
      player('plink', 'a', 'p1'),
      link('t1', 'a'),
      sheet('b'),
      row('b', 'str', { gone: 1 }),
      sheet('c'),
      row('c', 'hp', { hp: 0 }),
    );

    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect(summary(migration)).toEqual({
      count: 4,
      sheets: 3,
      removed: { pc: ['attack', 'hp', 'str', 'str_tired'] },
      first: ['blk:npc={"order":0,"cells":{}}'],
      last: [
        'blk:a=null',
        'blk:a:attack:i1=null',
        'acl:a:p1=null',
        'plink:a:p1=null',
        'link:t1=null',
        'blk:b=null',
        'blk:c=null',
      ],
    });
  });
  test('deletes a removed single sheet that holds a value as one sheet', () => {
    // #given
    const old = presetOf(
      sheetSet(BASE_SECTIONS),
      single('inventory', [linkable(rows([number('gold')])), repeat(text('item'))]),
    );

    const records = replica(
      row('inventory', 'gold', { gold: 5 }),
      rep('inventory', 'item', 'i1', { item: 'Верёвка' }),
      link('t1', 'inventory'),
    );

    // #when
    const migration = presetDiff(records, old, BASE);
    // #then
    expect(summary(migration)).toEqual({
      count: 2,
      sheets: 1,
      removed: { inventory: ['gold', 'item'] },
      first: [],
      last: ['blk:inventory=null', 'blk:inventory:item:i1=null', 'link:t1=null'],
    });
  });
  test('counts no sheet for a removed single sheet that holds no value', () => {
    // #given
    const old = presetOf(sheetSet(BASE_SECTIONS), single('inventory', [rows([number('gold')])]));
    const records = replica(row('inventory', 'gold', {}));
    // #when
    const migration = presetDiff(records, old, BASE);
    // #then
    expect(summary(migration)).toEqual({
      count: 0,
      sheets: 0,
      removed: {},
      first: [],
      last: ['blk:inventory=null'],
    });
  });
  test('removes a single sheet whose kind changes under the same id', () => {
    // #given
    const old = presetOf(single('npc', [rows([text('name'), number('hp')])]));

    const next = presetOf({
      id: 'npc',

      title: 'NPC',
      repeat: { nameField: 'name' },
      tabs: [{ sections: [rows([text('name'), number('hp')])] }],
    });

    const records = replica(row('npc', 'name', { name: 'Волк', hp: 5 }));
    // #when
    const migration = presetDiff(records, old, next);
    // #then
    expect(summary(migration)).toEqual({
      count: 2,
      sheets: 1,
      removed: { npc: ['hp', 'name'] },
      first: [],
      last: ['blk:npc=null'],
    });
  });
  test('removes the sheets of a sheet set whose kind changes under the same id', () => {
    // #given
    const next = presetOf(single('pc', BASE_SECTIONS));
    const records = replica(sheet('brok'), row('brok', 'hp', { hp: 3 }));
    // #when
    const migration = presetDiff(records, BASE, next);
    // #then
    expect(summary(migration)).toEqual({
      count: 1,
      sheets: 1,
      removed: { pc: ['hp'] },
      first: ['blk:pc={"order":0,"cells":{}}'],
      last: ['blk:brok=null'],
    });
  });
  test('tombstones the links to the sheets of a template that stops being linkable', () => {
    // #given
    const old = presetOf(
      sheetSet([linkable(BASE_SECTIONS[0] ?? rows([])), ...BASE_SECTIONS.slice(1)]),
    );

    const records = replica(sheet('brok'), link('t1', 'brok'));
    // #when
    const migration = presetDiff(records, old, BASE);
    // #then
    expect(summary(migration)).toEqual({
      count: 0,
      sheets: 0,
      removed: {},
      first: [],
      last: ['link:t1=null'],
    });
  });
  test('tombstones the links to the repeat blocks of a section that stops being linkable', () => {
    // #given
    const old = presetOf(single('npc', [linkable(repeat(text('npc_name'), number('hp')))]));
    const next = presetOf(single('npc', [repeat(text('npc_name'), number('hp'))]));

    const records = replica(
      rep('npc', 'npc_name', 'i1', { npc_name: 'Скелет' }),
      link('t2', 'npc', 'i1'),
    );

    // #when
    const migration = presetDiff(records, old, next);
    // #then
    expect(summary(migration)).toEqual({
      count: 0,
      sheets: 0,
      removed: {},
      first: ['blk:npc={"order":0,"cells":{}}'],
      last: ['link:t2=null'],
    });
  });
  test('tombstones the link to a repeat block whose section has no place in the new preset', () => {
    // #given
    const old = presetOf(single('npc', [linkable(repeat(text('npc_name'), number('hp')))]));
    const next = presetOf(single('npc', [linkable(repeat(text('spell')))]));

    const records = replica(
      rep('npc', 'npc_name', 'i1', { npc_name: 'Скелет', hp: 3 }),
      link('t3', 'npc', 'i1'),
    );

    // #when
    const migration = presetDiff(records, old, next);
    // #then
    expect(summary(migration)).toEqual({
      count: 2,
      sheets: 0,
      removed: { npc: ['hp', 'npc_name'] },
      first: ['blk:npc={"order":0,"cells":{}}'],
      last: ['blk:npc:npc_name:i1=null', 'link:t3=null'],
    });
  });
  test('keeps the link and block identity when the repeat name field changes', () => {
    // #given
    const old = presetOf(single('npc', [linkable(repeat(text('npc_name'), number('hp')))]));
    const renamed = linkable(repeat(text('label'), number('hp')));
    renamed.repeat = { id: 'npc_name', nameField: 'label' };
    const next = presetOf(single('npc', [renamed]));

    const records = replica(
      rep('npc', 'npc_name', 'i1', { npc_name: 'Скелет', hp: 3 }),
      link('t3', 'npc', 'i1'),
    );

    // #when
    const migration = presetDiff(records, old, next);
    // #then
    expect(writes(migration)).toEqual({
      first: ['blk:npc={"order":0,"cells":{}}'],
      last: [
        'blk:npc:npc_name:i1={"order":0,"cells":{"hp":[3,2,"seed"],"npc_name":[null,2,"seed"]}}',
      ],
    });
  });
  test('leaves a link that was already inert as it is', () => {
    // #given: the sheet set is not linkable, and the second link names no repeat block.
    const records = replica(sheet('brok'), link('t4', 'brok'), link('t5', 'brok', 'gone'));
    // #when
    const migration = presetDiff(records, BASE, preset(BASE_SECTIONS));
    // #then
    expect(writes(migration)).toEqual({ first: [], last: [] });
  });
  test('reads nothing with no old preset', () => {
    // #given
    const records = replica(sheet('brok'), row('brok', 'str', { str: 12 }));
    // #when
    const migration = presetDiff(records, null, BASE);
    // #then
    expect(migration).toEqual({
      count: 0,
      sheets: 0,
      digest: expect.any(String),
      removed: {},
      first: [],
      last: [],
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

describe('presetMoves', () => {
  test('names the new row of a field and does not infer a new repeat identity from fields', () => {
    // #given
    const after = sheetSet([
      rows([number('str'), check('str_tired'), number('hp')], [text('notes')]),
      repeat(text('weapon'), number('bonus')),
    ]);

    // #when
    const moves = presetMoves(sheetSet(BASE_SECTIONS), after);
    // #then
    expect([
      moves.rowOf('hp'),
      moves.rowOf('gone'),
      moves.sectionOf('attack'),
      moves.sectionOf('gone'),
    ]).toEqual(['str', null, null, null]);
  });
});

describe('stripToTemplate', () => {
  const TEMPLATE = sheetSet(BASE_SECTIONS);
  test('keeps every compatible plain field of the root block', () => {
    // #when
    const stripped = stripToTemplate(
      row('brok', 'str', { str: 12, str_tired: 'yes', hp: 3, gone: 1 }),
      TEMPLATE,
    );

    // #then
    expect(stripped.d).toEqual({
      order: 0,
      cells: { str: [12, 2, 'seed'], hp: [3, 2, 'seed'] },
    });
  });
  test('keeps only the fields of its repeat section in a repeat block', () => {
    // #when
    const stripped = stripToTemplate(
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 2, range: 30 }, 4),
      TEMPLATE,
    );

    // #then
    expect(stripped.d).toEqual({
      order: 4,
      cells: { attack: ['Меч', 2, 'seed'], bonus: [2, 2, 'seed'] },
    });
  });
  test('keeps the fields of every row of a repeat block of several rows', () => {
    // #given
    const npc = single('npc', [repeatRows([text('npc_name'), number('hp')], [number('str')])]);

    // #when
    const stripped = stripToTemplate(
      rep('npc', 'npc_name', 'i1', { npc_name: 'Скелет', hp: 2, str: 3, gone: 1 }),
      npc,
    );

    // #then
    expect(stripped.d).toEqual({
      order: 0,
      cells: {
        npc_name: ['Скелет', 2, 'seed'],
        hp: [2, 2, 'seed'],
        str: [3, 2, 'seed'],
      },
    });
  });
  test('empties a root block whose fields the template no longer has', () => {
    // #then
    expect(stripToTemplate(row('brok', 'gone', { gone: 1 }), TEMPLATE).d).toEqual({
      order: 0,
      cells: {},
    });
  });
  test.each<[string, VersionedRecord]>([
    ['a tombstone', row('brok', 'str', null)],
    ['a sheet', sheet('brok')],
  ])('passes %s as it is', (_name, record) => {
    // #then
    expect(stripToTemplate(record, TEMPLATE)).toBe(record);
  });
});
