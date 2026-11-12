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

function rows(...cells: PresetCell[][]): PresetSection {
  return { rows: cells };
}

function repeat(...cells: PresetCell[]): PresetSection {
  return { repeat: true, rows: [cells] };
}

// A repeat section of several rows, all of which form one repeat block.
function repeatRows(...cells: PresetCell[][]): PresetSection {
  return { repeat: true, rows: cells };
}

function linkable(section: PresetSection): PresetSection {
  return { ...section, tokens: true };
}

// The sheet set `pc`, named by its `notes` field.
function sheetSet(
  sections: PresetSection[],
  extra: Partial<SheetSetTemplate> = {},
): SheetSetTemplate {
  return { id: 'pc', kind: 'set', title: 'Персонажи', nameField: 'notes', sections, ...extra };
}

function single(
  id: string,
  sections: PresetSection[],
  extra: Partial<SingleSheetTemplate> = {},
): SingleSheetTemplate {
  return { id, kind: 'single', title: id, sections, ...extra };
}

function presetOf(...templates: Template[]): Preset {
  return { v: 2, templates };
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
  return { k: `sheet:${id}`, d: { set, order: 0 }, c: 1, a: 'seed' };
}

function row(sheetId: string, rowId: string, d: Values | null): VersionedRecord {
  return { k: `row:${sheetId}:${rowId}`, d, c: 2, a: 'seed' };
}

function rep(
  sheetId: string,
  sectionId: string,
  instanceId: string,
  cells: Values | null,
  order = 0,
): VersionedRecord {
  const d = cells === null ? null : { order, cells };

  return { k: `rep:${sheetId}:${sectionId}:${instanceId}`, d, c: 2, a: 'seed' };
}

function link(tokenId: string, s: string, i?: string): VersionedRecord {
  return { k: `link:${tokenId}`, d: i === undefined ? { s } : { s, i }, c: 2, a: 'seed' };
}

function player(form: 'acl' | 'plink', sheetId: string, playerId: string): VersionedRecord {
  return { k: `${form}:${sheetId}:${playerId}`, d: { name: 'Лиза' }, c: 2, a: 'seed' };
}

function replica(...records: VersionedRecord[]): Map<string, VersionedRecord> {
  return new Map(records.map((record) => [record.k, record]));
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

  test('counts a removed field that holds a value, `false` and 0 included', () => {
    // #given: str_tired and hp go. A row whose last value goes keeps an empty record.
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
      last: ['row:brok:str={"str":12}', 'row:brok:hp=null'],
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
      last: ['row:brok:notes={}'],
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
    const old = preset([repeat(select('armor', ['Кожаная', 'Кольчуга']))]);
    const next = preset([repeat(select('armor', ['Без доспеха', 'Кожаная']))]);

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
          last: ['row:brok:weapon_die={}'],
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
        last: ['row:brok:notes={}'],
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
      last: ['rep:brok:item:i1={"order":4,"cells":{"item":"Щит"}}'],
    });
  });

  test('moves a value to the row that holds its field now, before the preset', () => {
    // #given: hp joins the row of str, so the row of hp goes.
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
      first: ['row:brok:str={"str":12,"hp":7}'],
      last: ['row:brok:hp=null'],
    });
  });

  test('writes a row under its new key when its first field changes', () => {
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
      first: ['row:brok:str_tired={"str":12,"str_tired":true}'],
      last: ['row:brok:str=null'],
    });
  });

  test('keeps the old values of a row that gains one until after the preset', () => {
    // #given: notes leaves for the row of hp, and hp's row keeps its own value.
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

    // #then: the stale value is stripped after the preset, with no count.
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: ['row:brok:hp={"hp":7,"stale":"x","notes":"Храбрый"}'],
      last: ['row:brok:hp={"hp":7,"notes":"Храбрый"}', 'row:brok:notes=null'],
    });
  });

  test('moves every repeat block to the new section while one field id survives', () => {
    // #given: attack goes, bonus stays, and the section is now named by weapon.
    const next = preset([
      rows([number('str'), check('str_tired')], [text('notes')]),
      rows([number('hp')]),
      repeat(text('weapon'), number('bonus')),
    ]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 3 }, 0),
      rep('brok', 'attack', 'i2', { attack: 'Лук' }, 1),
      rep('brok', 'attack', 'i3', null),
    );

    // #when
    const migration = presetDiff(records, BASE, next);

    // #then
    expect({ count: migration.count, removed: migration.removed, ...writes(migration) }).toEqual({
      count: 2,
      removed: { pc: ['attack'] },
      first: [
        'rep:brok:weapon:i1={"order":0,"cells":{"bonus":3}}',
        'rep:brok:weapon:i2={"order":1,"cells":{}}',
      ],
      last: ['rep:brok:attack:i1=null', 'rep:brok:attack:i2=null'],
    });
  });

  test('moves a repeat block of several rows as one record with all its fields', () => {
    // #given: the NPC block spans two rows; its first field changes, so its section id changes.
    const old = presetOf(
      sheetSet(BASE_SECTIONS),
      single('npc', [repeatRows([text('npc_name'), number('hp')], [number('str')])]),
    );

    const next = presetOf(
      sheetSet(BASE_SECTIONS),
      single('npc', [repeatRows([text('label'), number('hp')], [number('str'), check('elite')])]),
    );

    const records = replica(rep('npc', 'npc_name', 'i1', { npc_name: 'Скелет 1', hp: 7, str: 3 }));

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect(summary(migration)).toEqual({
      count: 1,
      sheets: 0,
      removed: { npc: ['npc_name'] },
      first: ['rep:npc:label:i1={"order":0,"cells":{"hp":7,"str":3}}'],
      last: ['rep:npc:npc_name:i1=null'],
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
      last: ['rep:brok:attack:i1={"order":0,"cells":{"attack":"Меч"}}'],
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
      last: ['rep:brok:attack:i1=null', 'rep:brok:attack:i2=null'],
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
      last: ['rep:brok:attack:i1={"order":0,"cells":{"attack":"Меч"}}'],
    });
  });

  test('picks the new section that keeps the most ids, ties by template order', () => {
    // #given
    const old = preset([repeat(text('attack'), number('bonus'), number('range'))]);

    const next = preset([
      repeat(text('first'), number('bonus')),
      repeat(text('second'), number('range')),
    ]);

    const records = replica(sheet('brok'), rep('brok', 'attack', 'i1', { bonus: 2, range: 30 }));

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect(writes(migration).first).toEqual(['rep:brok:first:i1={"order":0,"cells":{"bonus":2}}']);
  });

  test('tombstones a moved repeat block whose new key is taken, counting its values', () => {
    // #given: both old sections land in one new section with the same instance id.
    const old = preset([
      repeat(text('attack'), number('bonus')),
      repeat(text('spell'), number('mana')),
    ]);

    const next = preset([repeat(text('attack'), number('bonus'), number('mana'))]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'i1', { bonus: 1 }),
      rep('brok', 'spell', 'i1', { mana: 4 }),
    );

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 1,
      first: [],
      last: ['rep:brok:spell:i1=null'],
    });
  });

  test('moves blocks back over their own tombstones on a round trip, with nothing counted', () => {
    // #given: an earlier upload moved the blocks from section a to b; this one moves them back.
    const sectionB = preset([repeat(text('b'), number('qty'))]);
    const sectionA = preset([repeat(text('a'), number('qty'))]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'a', 'i1', null),
      rep('brok', 'b', 'i1', { qty: 2 }, 3),
    );

    // #when
    const migration = presetDiff(records, sectionB, sectionA);

    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: ['rep:brok:a:i1={"order":3,"cells":{"qty":2}}'],
      last: ['rep:brok:b:i1=null'],
    });
  });

  test('lets the first of two old sections claim a new key, and counts the second', () => {
    // #given: both old sections go to a new section, with one instance id in each.
    const old = preset([
      repeat(text('attack'), number('bonus')),
      repeat(text('spell'), number('bonus')),
    ]);

    const next = preset([repeat(text('action'), number('bonus'))]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'i1', { bonus: 1 }),
      rep('brok', 'spell', 'i1', { bonus: 4 }),
    );

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 1,
      first: ['rep:brok:action:i1={"order":0,"cells":{"bonus":1}}'],
      last: ['rep:brok:attack:i1=null', 'rep:brok:spell:i1=null'],
    });
  });

  test('puts the blocks of a merged section after the blocks of the section they join', () => {
    // #given
    const old = preset([
      repeat(text('attack'), number('bonus')),
      repeat(text('spell'), number('mana')),
    ]);

    const next = preset([repeat(text('attack'), number('bonus'), number('mana'))]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'a1', { bonus: 1 }, 0),
      rep('brok', 'attack', 'a2', { bonus: 2 }, 1),
      rep('brok', 'spell', 's1', { mana: 3 }, 0),
      rep('brok', 'spell', 's2', { mana: 4 }, 1),
    );

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: [
        'rep:brok:attack:s1={"order":2,"cells":{"mana":3}}',
        'rep:brok:attack:s2={"order":3,"cells":{"mana":4}}',
      ],
      last: ['rep:brok:spell:s1=null', 'rep:brok:spell:s2=null'],
    });
  });

  test('only tombstones the old key of a block a stopped batch already moved', () => {
    // #given: the first try wrote spell:s1 under attack:s1, then stopped before the preset.
    const old = preset([
      repeat(text('attack'), number('bonus')),
      repeat(text('spell'), number('mana')),
    ]);

    const next = preset([repeat(text('attack'), number('bonus'), number('mana'))]);

    const records = replica(
      sheet('brok'),
      rep('brok', 'attack', 'a1', { bonus: 1 }, 0),
      rep('brok', 'attack', 's1', { mana: 3 }, 1),
      rep('brok', 'spell', 's1', { spell: 'Огонь', mana: 3 }, 0),
    );

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect({ count: migration.count, ...writes(migration) }).toEqual({
      count: 0,
      first: [],
      last: ['rep:brok:spell:s1=null'],
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
      last: ['row:brok:str={"str":12}'],
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
      { k: 'sheet:gone', d: null, c: 3, a: 'seed' },
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
      last: ['row:npc:hp={"hp":5}'],
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
      first: [],
      last: [
        'acl:a:p1=null',
        'link:t1=null',
        'plink:a:p1=null',
        'rep:a:attack:i1=null',
        'row:a:str=null',
        'sheet:a=null',
        'row:b:str=null',
        'sheet:b=null',
        'row:c:hp=null',
        'sheet:c=null',
      ],
    });
  });

  test('deletes a removed single sheet that holds a value as one sheet', () => {
    // #given
    const old = presetOf(
      sheetSet(BASE_SECTIONS),
      single('inventory', [rows([number('gold')]), repeat(text('item'))], { tokens: true }),
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
      last: ['link:t1=null', 'rep:inventory:item:i1=null', 'row:inventory:gold=null'],
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
      last: ['row:inventory:gold=null'],
    });
  });

  test('removes a single sheet whose kind changes under the same id', () => {
    // #given
    const old = presetOf(single('npc', [rows([text('name'), number('hp')])]));

    const next = presetOf({
      id: 'npc',
      kind: 'set',
      title: 'NPC',
      nameField: 'name',
      sections: [rows([text('name'), number('hp')])],
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
      last: ['row:npc:name=null'],
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
      first: [],
      last: ['row:brok:hp=null', 'sheet:brok=null'],
    });
  });

  test('tombstones the links to the sheets of a template that stops being linkable', () => {
    // #given
    const old = presetOf(sheetSet(BASE_SECTIONS, { tokens: true }));
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
      first: [],
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
      first: [],
      last: ['rep:npc:npc_name:i1=null', 'link:t3=null'],
    });
  });

  test('keeps the link to a repeat block that moves to another linkable section', () => {
    // #given
    const old = presetOf(single('npc', [linkable(repeat(text('npc_name'), number('hp')))]));
    const next = presetOf(single('npc', [linkable(repeat(text('label'), number('hp')))]));

    const records = replica(
      rep('npc', 'npc_name', 'i1', { npc_name: 'Скелет', hp: 3 }),
      link('t3', 'npc', 'i1'),
    );

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect(writes(migration)).toEqual({
      first: ['rep:npc:label:i1={"order":0,"cells":{"hp":3}}'],
      last: ['rep:npc:npc_name:i1=null'],
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

function capture<Result>(operation: () => Result): { result: Result } | { threw: string } {
  try {
    return { result: operation() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

describe('presetMoves', () => {
  test('names the new row of a field and the new section of a repeat section', () => {
    // #given: hp joins the row of str, and the attack section is now named by weapon.
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
    ]).toEqual(['str', null, 'weapon', null]);
  });
});

describe('stripToTemplate', () => {
  const TEMPLATE = sheetSet(BASE_SECTIONS);

  test('keeps only the fields of its row, each of its type', () => {
    // #when
    const stripped = stripToTemplate(
      row('brok', 'str', { str: 12, str_tired: 'yes', hp: 3, gone: 1 }),
      TEMPLATE,
    );

    // #then
    expect(stripped.d).toEqual({ str: 12 });
  });

  test('keeps only the fields of its repeat section in a repeat block', () => {
    // #when
    const stripped = stripToTemplate(
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 2, range: 30 }, 4),
      TEMPLATE,
    );

    // #then
    expect(stripped.d).toEqual({ order: 4, cells: { attack: 'Меч', bonus: 2 } });
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
    expect(stripped.d).toEqual({ order: 0, cells: { npc_name: 'Скелет', hp: 2, str: 3 } });
  });

  test('empties a row the template no longer has', () => {
    // #then
    expect(stripToTemplate(row('brok', 'gone', { gone: 1 }), TEMPLATE).d).toEqual({});
  });

  test.each<[string, VersionedRecord]>([
    ['a tombstone', row('brok', 'str', null)],
    ['a sheet', sheet('brok')],
  ])('passes %s as it is', (_name, record) => {
    // #then
    expect(stripToTemplate(record, TEMPLATE)).toBe(record);
  });
});
