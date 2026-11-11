import { describe, expect, test } from 'bun:test';

import {
  accessRows,
  aclKey,
  canEdit,
  ownedFirst,
  ownedSheetIds,
  PARTY_LIMIT,
  partyEntries,
  playerName,
  plinkKey,
  type PartyEntry,
} from '@/core/access';
import { playerIdSchema, recordKeySchema, type VersionedRecord } from '@/core/records';

// The GM's own player id, which never gets a row.
const OWN = 'p-own';

describe('accessRows', () => {
  test('lists the players in the room by name, with no GM, and no access yet', () => {
    // #given
    const party: PartyEntry[] = [
      player('p-oly', 'Оля'),
      gm('g-1', 'Мастер'),
      player('p-brok', 'Брок'),
      player('p-ann', 'Анна'),
    ];

    // #when
    const rows = accessRows(party, [], 'brok', OWN);

    // #then
    expect(rows).toEqual([
      { playerId: 'p-ann', name: 'Анна', canEdit: false },
      { playerId: 'p-brok', name: 'Брок', canEdit: false },
      { playerId: 'p-oly', name: 'Оля', canEdit: false },
    ]);
  });

  test('lists a player id once, however many connections it has', () => {
    // #given
    const party: PartyEntry[] = [player('p-oly', 'Оля'), player('p-oly', 'Оля')];

    // #when
    const rows = accessRows(party, [acl('brok', 'p-oly', 'Оля')], 'brok', OWN);

    // #then
    expect(rows).toEqual([{ playerId: 'p-oly', name: 'Оля', canEdit: true }]);
  });

  test('adds a player who is not in the room but holds a live acl: or plink: of this sheet', () => {
    // #given
    const records = [
      acl('brok', 'p-lisa', 'Лиза'),
      plink('brok', 'p-vova', 'Вова'),
      acl('liza', 'p-gena', 'Гена'),
      tombstone('acl:brok:p-zoya'),
    ];

    // #when
    const rows = accessRows([], records, 'brok', OWN);

    // #then
    expect(rows).toEqual([
      { playerId: 'p-vova', name: 'Вова', canEdit: false },
      { playerId: 'p-lisa', name: 'Лиза', canEdit: true },
    ]);
  });

  test('names a player by the party first, then by acl:, then by plink:', () => {
    // #given
    const party: PartyEntry[] = [player('p-1', 'Новое имя')];

    const records = [
      acl('brok', 'p-1', 'Старое имя'),
      acl('brok', 'p-2', 'Из acl'),
      plink('brok', 'p-2', 'Из plink'),
      plink('brok', 'p-3', 'Только plink'),
    ];

    // #when
    const rows = accessRows(party, records, 'brok', OWN);

    // #then
    expect(rows.map((row) => [row.playerId, row.name])).toEqual([
      ['p-2', 'Из acl'],
      ['p-1', 'Новое имя'],
      ['p-3', 'Только plink'],
    ]);
  });

  test('gives no row to a player id the room lists as a GM, even with an acl: record', () => {
    // #given
    const party: PartyEntry[] = [gm('p-promoted', 'Оля')];

    // #when
    const rows = accessRows(party, [acl('brok', 'p-promoted', 'Оля')], 'brok', OWN);

    // #then
    expect(rows).toEqual([]);
  });

  test('does not read the records of a sheet whose id starts with this one', () => {
    // #when
    const rows = accessRows([], [acl('brok2', 'p-1', 'Оля')], 'brok', OWN);

    // #then
    expect(rows).toEqual([]);
  });

  test("gives no row to this client's own player id, also when only a record names it", () => {
    // #given
    const party: PartyEntry[] = [player(OWN, 'Я'), player('p-1', 'Оля')];

    // #when
    const rows = [
      accessRows(party, [], 'brok', OWN),
      accessRows([], [acl('brok', OWN, 'Я')], 'brok', OWN),
    ];

    // #then
    expect(rows).toEqual([[{ playerId: 'p-1', name: 'Оля', canEdit: false }], []]);
  });

  test('gives no row to a GM id that only a record names while the party lists it', () => {
    // #given
    const party: PartyEntry[] = [gm('p-gm', 'Мастер')];

    // #when
    const rows = accessRows(party, [plink('brok', 'p-gm', 'Мастер')], 'brok', OWN);

    // #then
    expect(rows).toEqual([]);
  });

  test('marks a name as unknown when no non-blank name is known, and trims a known one', () => {
    // #given
    const party: PartyEntry[] = [player('p-1', '   '), player('p-2', '  Оля  ')];

    // #when
    const rows = accessRows(party, [acl('brok', 'p-3', '')], 'brok', OWN);

    // #then
    expect(rows).toEqual([
      { playerId: 'p-2', name: 'Оля', canEdit: false },
      { playerId: 'p-1', name: null, canEdit: false },
      { playerId: 'p-3', name: null, canEdit: true },
    ]);
  });

  test('gives no row to a party id that no acl: key can hold', () => {
    // #given
    const party: PartyEntry[] = [player('a b', 'Оля'), player('a:b', 'Гена')];

    // #when
    const rows = accessRows(party, [], 'brok', OWN);

    // #then
    expect(rows).toEqual([]);
  });

  test('keeps one order for equal names, by player id', () => {
    // #given
    const party: PartyEntry[] = [player('p-b', 'Оля'), player('p-a', 'Оля')];

    // #when
    const rows = accessRows(party, [], 'brok', OWN);

    // #then
    expect(rows.map((row) => row.playerId)).toEqual(['p-a', 'p-b']);
  });
});

describe('canEdit', () => {
  test('is true only for a live acl: of this sheet and this player', () => {
    // #given
    const records = byKey([
      acl('brok', 'p-1', 'Оля'),
      tombstone('acl:brok:p-2'),
      acl('liza', 'p-3', 'Гена'),
    ]);

    // #when
    const found = [
      canEdit(records, 'brok', 'p-1'),
      canEdit(records, 'brok', 'p-2'),
      canEdit(records, 'brok', 'p-3'),
      canEdit(records, 'liza', 'p-1'),
    ];

    // #then
    expect(found).toEqual([true, false, false, false]);
  });

  test('is false for a player id no acl: key can hold', () => {
    // #given
    const records = byKey([{ k: 'acl:brok:a b', d: { name: 'Оля' }, c: 1, a: 'seed' }]);

    // #when
    const found = canEdit(records, 'brok', 'a b');

    // #then
    expect(found).toBe(false);
  });
});

describe('partyEntries', () => {
  test('keeps one entry per valid player id, sorted by id, a GM when any connection is one', () => {
    // #given
    const members: PartyEntry[] = [
      player('p-b', ''),
      player('p-b', ' Оля '),
      player('p-a', 'Гена'),
      gm('p-a', 'Гена'),
      player('a b', 'Плохой'),
    ];

    // #when
    const entries = partyEntries(members);

    // #then
    expect(entries).toEqual([
      { id: 'p-a', name: 'Гена', role: 'GM' },
      { id: 'p-b', name: 'Оля', role: 'PLAYER' },
    ]);
  });

  test(`keeps at most ${PARTY_LIMIT} entries and cuts each name`, () => {
    // #given
    const members = Array.from({ length: PARTY_LIMIT + 5 }, (_unused, index) =>
      player(`p-${String(index).padStart(3, '0')}`, 'Я'.repeat(150)),
    );

    // #when
    const entries = partyEntries(members);

    // #then
    expect({
      count: entries.length,
      last: entries.at(-1)?.id,
      nameLength: Array.from(entries[0]?.name ?? '').length,
    }).toEqual({ count: PARTY_LIMIT, last: 'p-099', nameLength: 100 });
  });
});

describe('playerName', () => {
  test('trims and cuts at 100 code points, and turns a blank name into ""', () => {
    // #when
    const names = [playerName('  Оля  '), playerName('   '), playerName('😀'.repeat(120))];

    // #then
    expect(names.map((name) => Array.from(name).length)).toEqual([3, 0, 100]);
  });
});

describe('playerIdSchema', () => {
  test('accepts an Owlbear player id and refuses one no acl: key can hold', () => {
    // #when
    const accepted = [
      '3f2b1c9e-7a44-4b4e-9d6e-1c2b3a4d5e6f',
      'p',
      'a'.repeat(128),
      'a:b',
      'a b',
      '',
    ].map((id) => playerIdSchema.safeParse(id).success);

    // #then
    expect(accepted).toEqual([true, true, true, false, false, false]);
  });

  test('is the rule of the acl: and plink: keys', () => {
    // #when
    const accepted = [
      'acl:s:p',
      'acl:s:a b',
      `acl:s:${'a'.repeat(129)}`,
      'plink:s:p',
      'plink:s:a b',
    ].map((key) => recordKeySchema.safeParse(key).success);

    // #then
    expect(accepted).toEqual([true, false, false, true, false]);
  });

  test('makes the acl: key of a sheet and a player', () => {
    // #when
    const key = aclKey('brok', 'p-1');

    // #then
    expect(key).toBe('acl:brok:p-1');
  });
});

describe('ownedSheetIds', () => {
  test('holds the sheets whose owner is this player, and none another player owns', () => {
    // #given
    const sheets = [{ sheetId: 'brok' }, { sheetId: 'kira' }, { sheetId: 'yarl' }];

    const records = byKey([
      plink('brok', 'p-oly', 'Оля'),
      plink('kira', 'p-gena', 'Гена'),
      { ...plink('yarl', 'p-oly', 'Оля'), d: null, c: 2 },
    ]);

    // #when
    const owned = ownedSheetIds(sheets, records, 'p-oly');

    // #then
    expect([...owned]).toEqual(['brok']);
  });

  test('follows the plink: with the highest (c, a) when two are live', () => {
    // #given
    const records = byKey([
      { ...plink('brok', 'p-oly', 'Оля'), c: 2, a: 'gm-a' },
      { ...plink('brok', 'p-gena', 'Гена'), c: 2, a: 'gm-b' },
    ]);

    // #when
    const owned = [
      [...ownedSheetIds([{ sheetId: 'brok' }], records, 'p-oly')],
      [...ownedSheetIds([{ sheetId: 'brok' }], records, 'p-gena')],
    ];

    // #then
    expect(owned).toEqual([[], ['brok']]);
  });
});

describe('ownedFirst', () => {
  const SHEETS = [
    { sheetId: 'd', order: 1 },
    { sheetId: 'b', order: 0 },
    { sheetId: 'c', order: 1 },
    { sheetId: 'a', order: 2 },
  ];

  test('puts an owned character first, then the rest by (order, sheetId)', () => {
    // #when
    const sheets = ownedFirst(SHEETS, new Set(['a']));

    // #then
    expect(sheets.map((sheet) => sheet.sheetId)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('puts several owned characters first by (order, sheetId), then the rest the same way', () => {
    // #when
    const sheets = ownedFirst(SHEETS, new Set(['a', 'd', 'c']));

    // #then
    expect(sheets.map((sheet) => sheet.sheetId)).toEqual(['c', 'd', 'a', 'b']);
  });

  test('keeps the order by (order, sheetId) with nothing owned', () => {
    // #when
    const sheets = ownedFirst(SHEETS, new Set());

    // #then
    expect(sheets.map((sheet) => sheet.sheetId)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('plinkKey', () => {
  test('makes the plink: key of a sheet and a player', () => {
    // #when
    const key = plinkKey('brok', 'p-1');

    // #then
    expect(key).toBe('plink:brok:p-1');
  });
});

function player(id: string, name: string): PartyEntry {
  return { id, name, role: 'PLAYER' };
}

function gm(id: string, name: string): PartyEntry {
  return { id, name, role: 'GM' };
}

function acl(sheetId: string, playerId: string, name: string): VersionedRecord {
  return { k: `acl:${sheetId}:${playerId}`, d: { name }, c: 1, a: 'seed' };
}

function plink(sheetId: string, playerId: string, name: string): VersionedRecord {
  return { k: `plink:${sheetId}:${playerId}`, d: { name }, c: 1, a: 'seed' };
}

function tombstone(k: string): VersionedRecord {
  return { k, d: null, c: 2, a: 'seed' };
}

function byKey(records: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return new Map(records.map((record) => [record.k, record]));
}
