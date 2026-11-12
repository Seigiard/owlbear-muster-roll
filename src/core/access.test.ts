import { describe, expect, test } from 'bun:test';

import {
  accessRows,
  aclKey,
  canEdit,
  checkProposal,
  ownedFirst,
  ownedSheetIds,
  PARTY_LIMIT,
  partyEntries,
  playerName,
  plinkKey,
  PROPOSE_C_MAX_STEP,
  proposalAllowed,
  type PartyEntry,
  type ProposalContext,
  type ProposalSender,
} from '@/core/access';
import type { Preset, Template } from '@/core/preset';
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

  test('puts an owned sheet first, then the rest by (order, sheetId)', () => {
    // #when
    const sheets = ownedFirst(SHEETS, new Set(['a']));

    // #then
    expect(sheets.map((sheet) => sheet.sheetId)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('puts several owned sheets first by (order, sheetId), then the rest the same way', () => {
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

// The sheet set "pc" has a plain row "str" with a note and a check, and a two-row repeat section
// "item", whose one repeat block holds `item`, `qty` and `weight`.
const PC: Template = {
  id: 'pc',
  kind: 'set',
  title: 'Персонажи',
  nameField: 'note',
  tabs: [
    {
      sections: [
        {
          rows: [
            [
              { kind: 'field', type: 'number', id: 'str' },
              { kind: 'field', type: 'text', id: 'note' },
              { kind: 'field', type: 'check', id: 'tired' },
            ],
          ],
        },
        {
          repeat: true,
          rows: [
            [
              { kind: 'field', type: 'text', id: 'item' },
              { kind: 'field', type: 'number', id: 'qty' },
            ],
            [{ kind: 'field', type: 'number', id: 'weight' }],
          ],
        },
      ],
    },
  ],
};

const PROPOSAL_PRESET: Preset = {
  v: 3,
  templates: [
    PC,
    // Hidden, so its `players: "edit"` lets no player edit it.
    {
      id: 'npc',
      kind: 'single',
      title: 'НПС',
      visibility: 'gm',
      players: 'edit',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] }],
    },
    {
      id: 'inventory',
      kind: 'single',
      title: 'Инвентарь',
      players: 'edit',
      tabs: [
        {
          sections: [
            { rows: [[{ kind: 'field', type: 'text', id: 'items' }]] },
            { repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'gear' }]] },
            { repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'tool' }]] },
          ],
        },
      ],
    },
    {
      id: 'journal',
      kind: 'single',
      title: 'Журнал',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'entry' }]] }] }],
    },
    {
      id: 'villains',
      kind: 'set',
      title: 'Злодеи',
      nameField: 'villain',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'villain' }]] }] }],
    },
  ],
};

const STR_ROW: VersionedRecord = { k: 'row:brok:str', d: { str: 5 }, c: 3, a: 'gm-a' };

const LIVE_ITEM: VersionedRecord = {
  k: 'rep:brok:item:r1',
  d: { order: 0, cells: { item: 'Меч' } },
  c: 2,
  a: 'gm-a',
};

const REMOVED_ITEM: VersionedRecord = { k: 'rep:brok:item:r2', d: null, c: 4, a: 'gm-a' };

// A repeat block Оля's connection wrote, so a copy of it is her own record.
const OWN_ITEM: VersionedRecord = {
  k: 'rep:brok:item:r3',
  d: { order: 2, cells: { qty: 1 } },
  c: 5,
  a: 'p-conn',
};

// "Брок" is a live sheet of a sheet set Оля may edit, "Лиза" a deleted one she held access to,
// "Кира" a live one she has no access to, "Босс" a sheet of a hidden sheet set she holds an `acl:`
// of, and "stray" a sheet record whose `set` is a single sheet. She also holds an `acl:` of the
// single sheets "npc" and "journal", which a single sheet does not read. The single sheet
// "inventory" holds the instance ids "t1", live, and "t2", removed, in its section "tool".
const PROPOSAL_CONTEXT: ProposalContext = {
  preset: PROPOSAL_PRESET,
  records: byKey([
    { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'gm-a' },
    { k: 'sheet:liza', d: null, c: 2, a: 'gm-a' },
    { k: 'sheet:kira', d: { set: 'pc', order: 1 }, c: 1, a: 'gm-a' },
    { k: 'sheet:boss', d: { set: 'villains', order: 0 }, c: 1, a: 'gm-a' },
    { k: 'sheet:stray', d: { set: 'inventory', order: 0 }, c: 1, a: 'gm-a' },
    acl('brok', 'p-oly', 'Оля'),
    acl('liza', 'p-oly', 'Оля'),
    acl('boss', 'p-oly', 'Оля'),
    acl('stray', 'p-oly', 'Оля'),
    acl('npc', 'p-oly', 'Оля'),
    acl('journal', 'p-oly', 'Оля'),
    STR_ROW,
    LIVE_ITEM,
    REMOVED_ITEM,
    OWN_ITEM,
    { k: 'rep:inventory:tool:t1', d: { order: 0, cells: { tool: 'Кирка' } }, c: 1, a: 'gm-a' },
    { k: 'rep:inventory:tool:t2', d: null, c: 2, a: 'gm-a' },
  ]),
};

// Оля on the connection whose records carry `a: 'p-conn'`.
const OLY: ProposalSender = { playerId: 'p-oly', author: 'p-conn' };

describe('checkProposal', () => {
  test.each<[string, VersionedRecord]>([
    ['a row edit with c above the current one', { ...STR_ROW, d: { str: 6 }, c: 4, a: 'p-conn' }],
    [
      'a new repeat block',
      { k: 'rep:brok:item:r9', d: { order: 1, cells: {} }, c: 1, a: 'p-conn' },
    ],
    [
      'a repeat block edit with c above',
      { ...LIVE_ITEM, d: { order: 0, cells: { item: 'Лук', qty: 2 } }, c: 3, a: 'p-conn' },
    ],
    [
      'a field of the second row of a repeat block',
      { ...LIVE_ITEM, d: { order: 0, cells: { item: 'Меч', weight: 3 } }, c: 3, a: 'p-conn' },
    ],
    ['a removal of a live repeat block with c above', { ...LIVE_ITEM, d: null, c: 3, a: 'p-conn' }],
    ['a record identical to the current one, which is its own', OWN_ITEM],
    [
      'a c exactly PROPOSE_C_MAX_STEP above the current one',
      { ...STR_ROW, d: { str: 6 }, c: 3 + PROPOSE_C_MAX_STEP, a: 'p-conn' },
    ],
    ['a clear of every value of a row', { ...STR_ROW, d: {}, c: 4, a: 'p-conn' }],
    [
      'every field type of the row with its own JSON type',
      { ...STR_ROW, d: { str: -1.5, note: 'устал', tired: false }, c: 9, a: 'p-conn' },
    ],
    [
      'an edit of a player-editable single sheet with no acl: of it',
      { k: 'row:inventory:items', d: { items: 'Верёвка' }, c: 1, a: 'p-conn' },
    ],
    [
      'a new repeat block of a player-editable single sheet',
      { k: 'rep:inventory:gear:g1', d: { order: 0, cells: { gear: 'Фонарь' } }, c: 1, a: 'p-conn' },
    ],
  ])('commits %s', (_name, record) => {
    // #when
    const verdict = checkProposal(PROPOSAL_CONTEXT, OLY, record);

    // #then
    expect(verdict).toEqual({ kind: 'commit' });
  });

  test('commits the existing tombstone for a removal of a removed repeat block, whatever its c', () => {
    // #when
    const verdict = checkProposal(PROPOSAL_CONTEXT, OLY, {
      ...REMOVED_ITEM,
      c: 1,
      a: 'p-conn',
    });

    // #then
    expect(verdict).toEqual({ kind: 'commit-existing', record: REMOVED_ITEM });
  });

  test.each<[string, VersionedRecord, VersionedRecord]>([
    ['an equal c with a higher author', { ...STR_ROW, d: { str: 6 }, a: 'p-conn' }, STR_ROW],
    ['a lower c', { ...STR_ROW, d: { str: 6 }, c: 2, a: 'p-conn' }, STR_ROW],
    ['a lower c on a live repeat block', { ...LIVE_ITEM, d: null, c: 1, a: 'p-conn' }, LIVE_ITEM],
    [
      'a field id absent from the row, even with c above',
      { ...STR_ROW, d: { qty: 1 }, c: 4, a: 'p-conn' },
      STR_ROW,
    ],
    [
      'a field id of another row in a repeat block, even with c above',
      { ...LIVE_ITEM, d: { order: 0, cells: { str: 1 } }, c: 3, a: 'p-conn' },
      LIVE_ITEM,
    ],
  ])('answers stale with the current record for %s', (_name, record, current) => {
    // #when
    const verdict = checkProposal(PROPOSAL_CONTEXT, OLY, record);

    // #then
    expect(verdict).toEqual({ kind: 'stale', current });
  });

  test.each<[string, VersionedRecord]>([
    ['a tombstoned sheet', { k: 'row:liza:str', d: { str: 1 }, c: 1, a: 'p-conn' }],
    [
      'a hidden single sheet, even player-editable',
      { k: 'row:npc:str', d: { str: 1 }, c: 1, a: 'p-conn' },
    ],
    [
      'a single sheet that is not player-editable, even with an acl: of it',
      { k: 'row:journal:entry', d: { entry: 'День 1' }, c: 1, a: 'p-conn' },
    ],
    [
      'a sheet of a hidden sheet set, even with an acl: of it',
      { k: 'row:boss:villain', d: { villain: 'Лич' }, c: 1, a: 'p-conn' },
    ],
    [
      'a sheet record whose set is a single sheet',
      { k: 'row:stray:items', d: { items: 'Верёвка' }, c: 1, a: 'p-conn' },
    ],
    ['a sheet with no record', { k: 'row:ghost:str', d: { str: 1 }, c: 1, a: 'p-conn' }],
    [
      'an edit of a tombstoned repeat block, even with c above',
      { ...REMOVED_ITEM, d: { order: 0, cells: {} }, c: 9, a: 'p-conn' },
    ],
    ['a row id the template does not have', { k: 'row:brok:note', d: {}, c: 1, a: 'p-conn' }],
    [
      'a section id the template does not have as a repeat section',
      { k: 'rep:brok:str:r9', d: { order: 0, cells: {} }, c: 1, a: 'p-conn' },
    ],
    [
      'the second field of a repeat section as its section id',
      { k: 'rep:brok:weight:r9', d: { order: 0, cells: {} }, c: 1, a: 'p-conn' },
    ],
    ['a string in a number field', { ...STR_ROW, d: { str: '6' }, c: 4, a: 'p-conn' }],
    ['a number in a text field', { ...STR_ROW, d: { note: 6 }, c: 4, a: 'p-conn' }],
    ['a string in a check field', { ...STR_ROW, d: { tired: 'да' }, c: 4, a: 'p-conn' }],
    [
      'a wrong JSON type next to a field id absent from the row',
      { ...STR_ROW, d: { qty: 1, str: '6' }, c: 4, a: 'p-conn' },
    ],
    ['a removal of a plain row', { ...STR_ROW, d: null, c: 4, a: 'p-conn' }],
    ['a sheet with no access', { k: 'row:kira:str', d: { str: 1 }, c: 1, a: 'p-conn' }],
    ['the GM key form sheet:', { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 2, a: 'p-conn' }],
    ['the GM key form acl:', { k: 'acl:kira:p-oly', d: { name: 'Оля' }, c: 1, a: 'p-conn' }],
    ['the GM key form plink:', { k: 'plink:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'p-conn' }],
    ['the GM key form link:', { k: 'link:token-1', d: { s: 'brok' }, c: 1, a: 'p-conn' }],
    ['the GM key form preset', { k: 'preset', d: 'AAAA', c: 9, a: 'p-conn' }],
    ["an author that is not the sender's", { ...STR_ROW, d: { str: 6 }, c: 4, a: 'gm-a' }],
    ['a copy of a GM record', STR_ROW],
    [
      'a c more than PROPOSE_C_MAX_STEP above the current one',
      { ...STR_ROW, d: { str: 6 }, c: 4 + PROPOSE_C_MAX_STEP, a: 'p-conn' },
    ],
    [
      'a c more than PROPOSE_C_MAX_STEP above none',
      { k: 'rep:brok:item:r9', d: { order: 1, cells: {} }, c: 1 + PROPOSE_C_MAX_STEP, a: 'p-conn' },
    ],
    ['the largest safe c', { ...STR_ROW, d: { str: 6 }, c: Number.MAX_SAFE_INTEGER, a: 'p-conn' }],
    [
      'a new repeat block whose cells set a field its section does not have',
      { k: 'rep:brok:item:r9', d: { order: 1, cells: { str: 1 } }, c: 1, a: 'p-conn' },
    ],
    [
      'a new row record that sets a field its row does not have',
      { k: 'row:inventory:items', d: { gear: 'Фонарь' }, c: 1, a: 'p-conn' },
    ],
    [
      'a new repeat block whose instance id another section of the sheet holds live',
      { k: 'rep:inventory:gear:t1', d: { order: 0, cells: { gear: 'Фонарь' } }, c: 1, a: 'p-conn' },
    ],
    [
      'a new repeat block whose instance id another section of the sheet holds removed',
      { k: 'rep:inventory:gear:t2', d: { order: 0, cells: { gear: 'Фонарь' } }, c: 1, a: 'p-conn' },
    ],
  ])('denies %s', (_name, record) => {
    // #when
    const verdict = checkProposal(PROPOSAL_CONTEXT, OLY, record);

    // #then
    expect(verdict).toEqual({ kind: 'denied' });
  });

  test('denies a record identical to the current one from a player with no access', () => {
    // #when
    const verdict = checkProposal(
      PROPOSAL_CONTEXT,
      { playerId: 'p-gena', author: 'gm-a' },
      STR_ROW,
    );

    // #then
    expect(verdict).toEqual({ kind: 'denied' });
  });

  test('denies an access that was revoked', () => {
    // #given
    const records = new Map(PROPOSAL_CONTEXT.records);

    records.set('acl:brok:p-oly', tombstone('acl:brok:p-oly'));

    // #when
    const verdict = checkProposal({ ...PROPOSAL_CONTEXT, records }, OLY, {
      ...STR_ROW,
      d: { str: 6 },
      c: 4,
      a: 'p-conn',
    });

    // #then
    expect(verdict).toEqual({ kind: 'denied' });
  });

  test('denies every edit while the room holds no preset', () => {
    // #when
    const verdict = checkProposal({ ...PROPOSAL_CONTEXT, preset: null }, OLY, {
      ...STR_ROW,
      d: { str: 6 },
      c: 4,
      a: 'p-conn',
    });

    // #then
    expect(verdict).toEqual({ kind: 'denied' });
  });
});

describe('checkProposal over values an older preset left', () => {
  // `old` is a field the template no longer has, and `note` holds a number in a text field.
  const LEGACY_ROW: VersionedRecord = {
    k: 'row:brok:str',
    d: { str: 5, old: 'x', note: 7 },
    c: 3,
    a: 'gm-a',
  };

  const LEGACY_ITEM: VersionedRecord = {
    k: 'rep:brok:item:r1',
    d: { order: 0, cells: { item: 'Меч', gone: true } },
    c: 2,
    a: 'gm-a',
  };

  const context: ProposalContext = {
    ...PROPOSAL_CONTEXT,
    records: new Map([
      ...PROPOSAL_CONTEXT.records,
      [LEGACY_ROW.k, LEGACY_ROW],
      [LEGACY_ITEM.k, LEGACY_ITEM],
    ]),
  };

  test.each<[string, VersionedRecord]>([
    [
      'an edit of another field of the row, which keeps them',
      { ...LEGACY_ROW, d: { str: 6, old: 'x', note: 7 }, c: 4, a: 'p-conn' },
    ],
    ['a clear of them', { ...LEGACY_ROW, d: { str: 5 }, c: 4, a: 'p-conn' }],
    [
      'an edit of another cell of the repeat block, which keeps them',
      { ...LEGACY_ITEM, d: { order: 0, cells: { item: 'Лук', gone: true } }, c: 3, a: 'p-conn' },
    ],
  ])('commits %s', (_name, record) => {
    // #when
    const verdict = checkProposal(context, OLY, record);

    // #then
    expect(verdict).toEqual({ kind: 'commit' });
  });

  test('answers stale with the current record for a new value of a field the template lacks', () => {
    // #when
    const verdict = checkProposal(context, OLY, {
      ...LEGACY_ROW,
      d: { str: 5, old: 'y', note: 7 },
      c: 4,
      a: 'p-conn',
    });

    // #then
    expect(verdict).toEqual({ kind: 'stale', current: LEGACY_ROW });
  });

  test('denies a new value of the wrong JSON type', () => {
    // #when
    const verdict = checkProposal(context, OLY, {
      ...LEGACY_ROW,
      d: { str: 5, old: 'x', note: 8 },
      c: 4,
      a: 'p-conn',
    });

    // #then
    expect(verdict).toEqual({ kind: 'denied' });
  });
});

describe('proposalAllowed', () => {
  test('reads no version: a stale record of an allowed key passes', () => {
    // #when
    const allowed = proposalAllowed(PROPOSAL_CONTEXT, 'p-oly', { ...STR_ROW, c: 1, a: 'p-conn' });

    // #then
    expect(allowed).toBe(true);
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
