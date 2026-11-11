import { describe, expect, test } from 'bun:test';

import type { Preset, PresetCell, PresetFieldCell, PresetTemplate } from '@/core/preset';
import type { FieldValue, VersionedRecord } from '@/core/records';

import { presetDiff, stripToTemplate, type PresetMigration } from './preset-migrate';

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

function rows(...cells: PresetCell[][]): PresetTemplate['sections'][number] {
  return { rows: cells };
}

function repeat(...cells: PresetCell[]): PresetTemplate['sections'][number] {
  return { repeat: true, rows: [cells] };
}

function preset(
  character: PresetTemplate['sections'],
  npc: PresetTemplate['sections'] = [],
): Preset {
  return { v: 1, character: { sections: character }, npc: { sections: npc } };
}

// A character sheet with a plain row of a number and a check, a text row, a number row, and a
// repeat section of a text and a number.
const BASE = preset([
  rows([{ kind: 'text', text: 'Сила' }, number('str'), check('str_tired')], [text('notes')]),
  rows([number('hp')]),
  repeat(text('attack'), number('bonus')),
]);

function sheet(id: string, kind: 'pc' | 'npc' = 'pc'): VersionedRecord {
  return { k: `sheet:${id}`, d: { kind, name: id, order: 0 }, c: 1, a: 'seed' };
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

function replica(...records: VersionedRecord[]): Map<string, VersionedRecord> {
  return new Map(records.map((record) => [record.k, record]));
}

function writes(migration: PresetMigration) {
  return {
    first: migration.first.map((write) => `${write.k}=${JSON.stringify(write.d)}`),
    last: migration.last.map((write) => `${write.k}=${JSON.stringify(write.d)}`),
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
    expect({ count: migration.count, removed: migration.removed, ...writes(migration) }).toEqual({
      count: 0,
      removed: { pc: [], npc: [] },
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
      digest: expect.any(String),
      removed: { pc: [], npc: [] },
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
    expect({ count: migration.count, removed: migration.removed, ...writes(migration) }).toEqual({
      count: 2,
      removed: { pc: ['hp', 'str_tired'], npc: [] },
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
    expect({ count: migration.count, removed: migration.removed.pc, ...writes(migration) }).toEqual(
      { count: 1, removed: ['notes'], first: [], last: ['row:brok:notes={}'] },
    );
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

  test('moves every repeat row to the new section while one field id survives', () => {
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
    expect({ count: migration.count, removed: migration.removed.pc, ...writes(migration) }).toEqual(
      {
        count: 2,
        removed: ['attack'],
        first: [
          'rep:brok:weapon:i1={"order":0,"cells":{"bonus":3}}',
          'rep:brok:weapon:i2={"order":1,"cells":{}}',
        ],
        last: ['rep:brok:attack:i1=null', 'rep:brok:attack:i2=null'],
      },
    );
  });

  test('strips a repeat row in place when its section keeps its id', () => {
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

  test('tombstones a repeat row whose fields all go and counts each value', () => {
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

  test.each<[string, Preset, VersionedRecord]>([
    [
      'from a plain row into a repeat section',
      preset([
        rows([number('str'), check('str_tired')], [text('notes')]),
        repeat(text('attack'), number('bonus'), number('hp')),
      ]),
      row('brok', 'hp', { hp: 7 }),
    ],
    [
      'from a repeat section into a plain row',
      preset([
        rows([number('str'), check('str_tired'), number('bonus')], [text('notes')]),
        rows([number('hp')]),
        repeat(text('attack')),
      ]),
      rep('brok', 'attack', 'i1', { bonus: 3 }),
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
    ],
  ])('counts a value whose field moves %s', (_name, next, record) => {
    // #when
    const migration = presetDiff(replica(sheet('brok'), record), BASE, next);

    // #then
    expect(migration.removed.pc).toContain(record.k.startsWith('row:') ? 'hp' : 'bonus');
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

  test('tombstones a moved repeat row whose new key is taken, counting its values', () => {
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

  test('moves rows back over their own tombstones on a round trip, with nothing counted', () => {
    // #given: an earlier upload moved the rows from section a to b; this one moves them back.
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

  test('puts the rows of a merged section after the rows of the section they join', () => {
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

  test('only tombstones the old key of a row a stopped batch already moved', () => {
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

  test('diffs an NPC against the NPC templates and skips deleted sheets', () => {
    // #given
    const old = preset([rows([number('hp')])], [rows([number('hp'), number('ac')])]);
    const next = preset([rows([number('hp')])], [rows([number('hp')])]);

    const records = replica(
      sheet('wolf', 'npc'),
      row('wolf', 'hp', { hp: 5, ac: 12 }),
      { k: 'sheet:gone', d: null, c: 3, a: 'seed' },
      row('gone', 'hp', { hp: 1, ac: 2 }),
    );

    // #when
    const migration = presetDiff(records, old, next);

    // #then
    expect({ count: migration.count, removed: migration.removed, ...writes(migration) }).toEqual({
      count: 1,
      removed: { pc: [], npc: ['ac'] },
      first: [],
      last: ['row:wolf:hp={"hp":5}'],
    });
  });

  test('reads nothing with no old preset', () => {
    // #given
    const records = replica(sheet('brok'), row('brok', 'str', { str: 12 }));

    // #when
    const migration = presetDiff(records, null, BASE);

    // #then
    expect(migration).toEqual({
      count: 0,
      digest: expect.any(String),
      removed: { pc: [], npc: [] },
      first: [],
      last: [],
    });
  });
});

describe('stripToTemplate', () => {
  const TEMPLATE = BASE.character;

  test('keeps only the fields of its row, each of its type', () => {
    // #when
    const stripped = stripToTemplate(
      row('brok', 'str', { str: 12, str_tired: 'yes', hp: 3, gone: 1 }),
      TEMPLATE,
    );

    // #then
    expect(stripped.d).toEqual({ str: 12 });
  });

  test('keeps only the fields of its repeat section in a repeat row', () => {
    // #when
    const stripped = stripToTemplate(
      rep('brok', 'attack', 'i1', { attack: 'Меч', bonus: 2, range: 30 }, 4),
      TEMPLATE,
    );

    // #then
    expect(stripped.d).toEqual({ order: 4, cells: { attack: 'Меч', bonus: 2 } });
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
