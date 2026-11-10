import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';

import { visibleRecords, visibleSheets } from './visibility';

const PRESET: VersionedRecord = { k: 'preset', d: 'eJw=', c: 1, a: 'conn' };

const BROK: VersionedRecord = {
  k: 'sheet:brok',
  d: { kind: 'pc', name: 'Брок', order: 1 },
  c: 1,
  a: 'conn',
};

const LIZA: VersionedRecord = {
  k: 'sheet:liza',
  d: { kind: 'pc', name: 'Лиза', order: 0 },
  c: 1,
  a: 'conn',
};

const BROK_ROW: VersionedRecord = { k: 'row:brok:str', d: { str: 14 }, c: 1, a: 'conn' };

const BROK_REP: VersionedRecord = {
  k: 'rep:brok:attack:i1',
  d: { order: 0, cells: {} },
  c: 1,
  a: 'conn',
};

const BROK_LINK: VersionedRecord = { k: 'link:token-1', d: 'brok', c: 1, a: 'conn' };

const SKELETON: VersionedRecord = {
  k: 'sheet:skel',
  d: { kind: 'npc', name: 'Скелет', order: 0 },
  c: 1,
  a: 'conn',
};

const SKELETON_ROW: VersionedRecord = { k: 'row:skel:hp', d: { hp: 7 }, c: 1, a: 'conn' };

const SKELETON_REP: VersionedRecord = {
  k: 'rep:skel:attack:i1',
  d: { order: 0, cells: {} },
  c: 1,
  a: 'conn',
};

const SKELETON_LINK: VersionedRecord = { k: 'link:token-2', d: 'skel', c: 1, a: 'conn' };

// A character whose id starts with the NPC's, so a prefix match would wrongly hide its row.
const SKELETONS: VersionedRecord = {
  k: 'sheet:skeleton',
  d: { kind: 'pc', name: 'Скелетон', order: 2 },
  c: 1,
  a: 'conn',
};

const SKELETONS_ROW: VersionedRecord = { k: 'row:skeleton:hp', d: { hp: 3 }, c: 1, a: 'conn' };

const ROOM: VersionedRecord[] = [
  PRESET,
  BROK,
  LIZA,
  BROK_ROW,
  BROK_REP,
  BROK_LINK,
  SKELETON,
  SKELETON_ROW,
  SKELETON_REP,
  SKELETON_LINK,
  SKELETONS,
  SKELETONS_ROW,
];

describe('visibleRecords', () => {
  test('passes every record through for a GM', () => {
    // #when
    const visible = visibleRecords('GM', ROOM);

    // #then
    expect(visible).toEqual(ROOM);
  });

  test('drops NPC sheets and their rows, repeat rows and links for a player, and keeps the rest', () => {
    // #when
    const visible = visibleRecords('PLAYER', ROOM);

    // #then
    expect(visible).toEqual([
      PRESET,
      BROK,
      LIZA,
      BROK_ROW,
      BROK_REP,
      BROK_LINK,
      SKELETONS,
      SKELETONS_ROW,
    ]);
  });

  test('judges a record that comes without its sheet by the known records', () => {
    // #when
    const visible = visibleRecords('PLAYER', [SKELETON_ROW, BROK_ROW], ROOM);

    // #then
    expect(visible).toEqual([BROK_ROW]);
  });

  test('keeps a sheet tombstone, and hides dependents whose sheet is not a live character', () => {
    // #given
    const sheetTombstone: VersionedRecord = { ...SKELETON, d: null, c: 2 };

    const records: VersionedRecord[] = [
      sheetTombstone,
      { ...SKELETON_LINK, d: null, c: 2 },
      { k: 'row:ghost:hp', d: { hp: 1 }, c: 1, a: 'conn' },
    ];

    // #when
    const visible = visibleRecords('PLAYER', records);

    // #then
    expect(visible).toEqual([sheetTombstone]);
  });

  test('hides a link once it points to an NPC', () => {
    // #given
    const repointed: VersionedRecord = { ...BROK_LINK, d: 'skel', c: 2 };

    // #when
    const visible = visibleRecords('PLAYER', [repointed], ROOM);

    // #then
    expect(visible).toEqual([]);
  });
});

describe('visibleSheets', () => {
  test('lists characters in (order, sheetId) order and NPCs for a GM', () => {
    // #when
    const sheets = visibleSheets('GM', ROOM);

    // #then
    expect({
      characters: sheets.characters.map((sheet) => sheet.sheetId),
      npcs: sheets.npcs.map((sheet) => sheet.sheetId),
    }).toEqual({ characters: ['liza', 'brok', 'skeleton'], npcs: ['skel'] });
  });

  test('lists characters and no NPC for a player', () => {
    // #when
    const sheets = visibleSheets('PLAYER', ROOM);

    // #then
    expect({
      characters: sheets.characters.map((sheet) => sheet.sheetId),
      npcs: sheets.npcs,
    }).toEqual({ characters: ['liza', 'brok', 'skeleton'], npcs: [] });
  });
});
