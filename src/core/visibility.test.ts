import { assembleRecords } from '@/core/merge';
import { fixturePatch } from '../../tests/support/block-fixtures';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { Preset, Template } from '@/core/preset';
import type { JsonValue } from '@/core/json';
import type { VersionedRecord } from '@/core/records';
import {
  rollShownTo,
  sheetShownTo,
  templateShownTo,
  visibleRecordMap,
  visibleRecords,
  visibleSheets,
  type PlayerRole,
} from './visibility';

const PC: Template = {
  id: 'pc',
  kind: 'set',
  title: 'Персонажи',
  nameField: 'name',
  tokens: true,
  tabs: [
    {
      title: 'Основное',
      sections: [
        { rows: [[{ kind: 'field', type: 'text', id: 'name' }]] },
        { repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'attack' }]] },
      ],
    },
    {
      title: 'Заметки мастера',
      visibility: 'gm',
      sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'secret' }]] }],
    },
  ],
};

// A hidden single sheet with a linkable repeat section.
const NPC: Template = {
  id: 'npc',
  kind: 'single',
  title: 'НПС',
  visibility: 'gm',
  tabs: [
    {
      sections: [
        { rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] },
        { repeat: true, tokens: true, rows: [[{ kind: 'field', type: 'text', id: 'npc_name' }]] },
      ],
    },
  ],
};

const INVENTORY: Template = {
  id: 'inventory',
  kind: 'single',
  title: 'Инвентарь',
  players: 'edit',
  tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'items' }]] }] }],
};

const VILLAINS: Template = {
  id: 'villains',
  kind: 'set',
  title: 'Злодеи',
  nameField: 'villain',
  visibility: 'gm',
  tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'villain' }]] }] }],
};

const PRESET: Preset = { v: 3, templates: [PC, NPC, INVENTORY, VILLAINS] };

function record(k: string, d: JsonValue): VersionedRecord {
  // SAFETY: some cases build a record no schema takes on purpose, so the code under test meets it.
  return fixtureRecord(k, d, 1, 'conn');
}

const PRESET_RECORD = record('preset', 'eJw=');

const BROK = record('blk:brok', {
  set: 'pc',
  order: 1,
  cells: { name: 'Брок', secret: 'Уязвим к серебру' },
});

const LIZA = record('blk:liza', { set: 'pc', order: 0 });
const BROK_REP = record('blk:brok:attack:i1', { order: 0, cells: {} });
const BROK_ACL = record('acl:brok:p1', { name: 'Оля' });
const BROK_LINK = record('link:token-1', { s: 'brok' });
const NPC_ROW = record('blk:npc', { hp: 7 });
const NPC_REP = record('blk:npc:npc_name:s1', { order: 0, cells: { npc_name: 'Скелет' } });
const NPC_LINK = record('link:token-2', { s: 'npc', i: 's1' });
const INVENTORY_ROW = record('blk:inventory', { items: 'Верёвка' });

const BOSS = record('blk:boss', {
  set: 'villains',
  order: 0,
  cells: { villain: 'Лич' },
});

// A link to a repeat block of a section with no tokens, so it is inert.
const INERT_LINK = record('link:token-3', { s: 'brok', i: 'i1' });

// A sheet whose set names no template, so it resolves to none.
const STRAY = record('blk:stray', { set: 'gone', order: 0, cells: { name: 'Никто' } });

// A sheet whose id starts with the single sheet's, so a prefix match would wrongly hide its row.
const NPCX = record('blk:npcx', {
  set: 'pc',
  order: 2,
  cells: { name: 'Скелетон' },
});

const ROOM: VersionedRecord[] = [
  PRESET_RECORD,
  BROK,
  LIZA,
  BROK_REP,
  BROK_ACL,
  BROK_LINK,
  NPC_ROW,
  NPC_REP,
  NPC_LINK,
  INVENTORY_ROW,
  BOSS,
  INERT_LINK,
  STRAY,
  NPCX,
];

const KNOWN: ReadonlyMap<string, VersionedRecord> = assembleRecords(ROOM);

describe('templateShownTo', () => {
  test.each<[PlayerRole, Template, boolean]>([
    ['GM', PC, true],
    ['GM', NPC, true],
    ['PLAYER', PC, true],
    ['PLAYER', INVENTORY, true],
    ['PLAYER', NPC, false],
    ['PLAYER', VILLAINS, false],
  ])('a %s client sees the template: %#', (role, template, shown) => {
    // #then
    expect(templateShownTo(role, template)).toBe(shown);
  });
});

describe('sheetShownTo', () => {
  test.each<[string, PlayerRole, boolean]>([
    ['brok', 'GM', true],
    ['brok', 'PLAYER', true],
    ['inventory', 'PLAYER', true],
    ['npc', 'GM', true],
    ['npc', 'PLAYER', false],
    ['boss', 'PLAYER', false],
    ['stray', 'GM', false],
    ['gone', 'GM', false],
  ])('the sheet %s is shown to a %s client: %p', (sheetId, role, shown) => {
    // #then
    expect(sheetShownTo(KNOWN, PRESET, sheetId, role)).toBe(shown);
  });
});

describe('visibleRecords', () => {
  test('passes every record through for a GM', () => {
    // #when
    const visible = visibleRecords('GM', PRESET, ROOM);
    // #then
    expect(visible).toEqual(ROOM);
  });
  test('keeps for a player the sheets of visible templates with their dependents and live links to them', () => {
    // #when
    const visible = visibleRecords('PLAYER', PRESET, ROOM);
    // #then
    expect(visible).toEqual([
      PRESET_RECORD,
      BROK,
      LIZA,
      BROK_REP,
      BROK_ACL,
      BROK_LINK,
      INVENTORY_ROW,
      NPCX,
    ]);
  });
  test('keeps a row on a hidden tab in a player projection', () => {
    // #when
    const visible = visibleRecords('PLAYER', PRESET, [BROK], KNOWN);
    // #then
    expect(visible).toEqual([BROK]);
  });
  test('keeps only the preset record for a player with no decoded preset', () => {
    // #when
    const visible = visibleRecords('PLAYER', null, ROOM);
    // #then
    expect(visible).toEqual([PRESET_RECORD]);
  });
  test('judges a record that comes without its sheet by the known records', () => {
    // #when
    const visible = visibleRecords('PLAYER', PRESET, [NPC_REP, BROK_REP], KNOWN);
    // #then
    expect(visible).toEqual([BROK_REP]);
  });
  test('hides a repeat block that comes without its sheet root', () => {
    // #when
    const visible = visibleRecords('PLAYER', PRESET, [BROK_REP]);
    // #then
    expect(visible).toEqual([]);
  });
  test('keeps a sheet tombstone, and hides the dependents of a sheet that is not live', () => {
    // #given
    const sheetTombstone: VersionedRecord = fixturePatch(BOSS, null, 2, BOSS.a);

    const records: VersionedRecord[] = [
      sheetTombstone,
      fixturePatch(BROK_LINK, null, 2, BROK_LINK.a),
      record('blk:ghost', { name: 'Призрак' }),
    ];

    // #when
    const visible = visibleRecords('PLAYER', PRESET, records);
    // #then
    expect(visible).toEqual([sheetTombstone]);
  });
  test('hides a link once it points to a hidden single sheet', () => {
    // #given
    const repointed: VersionedRecord = fixturePatch(
      BROK_LINK,
      { s: 'npc', i: 's1' },
      2,
      BROK_LINK.a,
    );

    // #when
    const visible = visibleRecords('PLAYER', PRESET, [repointed], KNOWN);
    // #then
    expect(visible).toEqual([]);
  });
});

describe('visibleRecordMap', () => {
  test('gives a GM its map as it is', () => {
    // #then
    expect(visibleRecordMap('GM', PRESET, KNOWN)).toBe(KNOWN);
  });
  test('gives a player only the records it sees', () => {
    // #when
    const visible = visibleRecordMap('PLAYER', PRESET, KNOWN);
    // #then
    expect([...visible.keys()]).toEqual([
      'preset',
      'blk:brok',
      'blk:liza',
      'blk:brok:attack:i1',
      'acl:brok:p1',
      'link:token-1',
      'blk:inventory',
      'blk:npcx',
    ]);
  });
});

describe('visibleSheets', () => {
  test('lists every template for a GM in preset order, a sheet set with its sheets in (order, sheetId) order', () => {
    // #when
    const sheets = visibleSheets('GM', PRESET, KNOWN);
    // #then
    expect(sheets).toEqual([
      {
        kind: 'set',
        template: PC,
        sheets: [
          { sheetId: 'liza', set: 'pc', order: 0 },
          { sheetId: 'brok', set: 'pc', order: 1 },
          { sheetId: 'npcx', set: 'pc', order: 2 },
        ],
      },
      { kind: 'single', template: NPC },
      { kind: 'single', template: INVENTORY },
      { kind: 'set', template: VILLAINS, sheets: [{ sheetId: 'boss', set: 'villains', order: 0 }] },
    ]);
  });
  test('lists no hidden template for a player', () => {
    // #when
    const sheets = visibleSheets('PLAYER', PRESET, KNOWN);
    // #then
    expect(sheets.map((entry) => entry.template.id)).toEqual(['pc', 'inventory']);
  });
  test('lists nothing with no decoded preset', () => {
    // #then
    expect(visibleSheets('GM', null, KNOWN)).toEqual([]);
  });
});

describe('rollShownTo', () => {
  test.each<[PlayerRole, boolean, boolean]>([
    ['GM', false, true],
    ['GM', true, true],
    ['PLAYER', false, true],
    ['PLAYER', true, false],
  ])('a %s client shows a roll with hidden %p: %p', (role, hidden, shown) => {
    // #when
    const result = rollShownTo(role, hidden);
    // #then
    expect(result).toBe(shown);
  });
});
