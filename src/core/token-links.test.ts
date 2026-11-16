import { assembleRecords } from '@/core/merge';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { LinkTarget } from '@/core/link-target';
import type { JsonValue } from '@/core/json';
import type { FieldValue, VersionedRecord } from '@/core/records';
import type { Preset, PresetSection, Template } from '@/core/preset';
import {
  linkedTargetKeys,
  linkPickerUrl,
  liveLinks,
  openTarget,
  pickerGroups,
  removedItemIds,
  tokenIdSchema,
  tokenMenuEntries,
  tokensToUnlink,
  type TokenMenuFilter,
  type TokenMenuKeyFilter,
} from '@/core/token-links';

// A two-row linkable repeat section: one repeat block spans both rows.
const PET_SECTION: PresetSection = {
  repeat: { id: 'pet', nameField: 'pet' },

  rows: [
    {
      cells: [
        { kind: 'field', type: 'text', id: 'pet' },
        { kind: 'token', id: 'token' },
      ],
    },
    { cells: [{ kind: 'field', type: 'number', id: 'pet_hp' }] },
  ],
};

const PC: Template = {
  id: 'pc',

  title: 'Персонажи',
  repeat: { nameField: 'name' },

  tabs: [
    {
      title: 'Основное',
      sections: [
        {
          rows: [
            {
              cells: [
                { kind: 'field', type: 'text', id: 'name' },
                { kind: 'token', id: 'token' },
              ],
            },
          ],
        },
      ],
    },
    { title: 'Заметки мастера', visibility: 'gm', sections: [PET_SECTION] },
  ],
};

const NPC_SECTION: PresetSection = {
  repeat: { id: 'npc_name', nameField: 'npc_name' },

  rows: [
    {
      cells: [
        { kind: 'field', type: 'text', id: 'npc_name' },
        { kind: 'token', id: 'token' },
      ],
    },
  ],
};

// Hidden, and only its repeat blocks are linkable.
const NPC: Template = {
  id: 'npc',

  title: 'НПС',
  visibility: 'gm',
  tabs: [{ sections: [NPC_SECTION] }],
};

const INVENTORY: Template = {
  id: 'inventory',

  title: 'Инвентарь',
  players: 'edit',

  tabs: [
    {
      sections: [
        {
          rows: [
            {
              cells: [
                { kind: 'field', type: 'text', id: 'items' },
                { kind: 'token', id: 'token' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// Nothing in it is linkable.
const JOURNAL: Template = {
  id: 'journal',

  title: 'Журнал',
  tabs: [
    {
      sections: [
        {
          repeat: { id: 'entry', nameField: 'entry' },
          rows: [{ cells: [{ kind: 'field', type: 'text', id: 'entry' }] }],
        },
      ],
    },
  ],
};

const PRESET: Preset = { v: 4, templates: [PC, NPC, INVENTORY, JOURNAL] };

describe('liveLinks', () => {
  test('maps each token to the live target its link names, two tokens to one sheet included', () => {
    // #given
    const records = byKey([
      ...pc('brok', 'Брок', 0),
      block('npc', 'npc_name', 's1', 0, { npc_name: 'Скелет' }),
      link('t1', 'brok'),
      link('t2', 'brok'),
      link('t3', 'npc', 's1'),
      link('t4', 'inventory'),
    ]);

    // #when
    const links = liveLinks(records, PRESET);
    // #then
    expect([...links].map(([tokenId, live]) => [tokenId, live.target])).toEqual([
      ['t1', { sheetId: 'brok', instanceId: null, path: null, cellId: 'token' }],
      ['t2', { sheetId: 'brok', instanceId: null, path: null, cellId: 'token' }],
      [
        't3',
        {
          sheetId: 'npc',
          instanceId: 's1',
          path: ['npc_name', 's1'],
          cellId: 'token',
        },
      ],
      ['t4', { sheetId: 'inventory', instanceId: null, path: null, cellId: 'token' }],
    ]);
  });
  test('counts no link under a key whose token id no command could write', () => {
    // #given
    const records = byKey([...pc('brok', 'Брок', 0), link('a b', 'brok'), link('t1', 'brok')]);
    // #when
    const links = liveLinks(records, PRESET);
    // #then
    expect([...links.keys()]).toEqual(['t1']);
  });
  test('counts no link to a sheet id no command could write, even with a live sheet under it', () => {
    // #given: "a b" passes the `link:` data schema but not the sheet id schema.
    const records = byKey([...pc('a b', 'Аня', 0), link('t1', 'a b')]);

    // #when
    const found = {
      links: [...liveLinks(records, PRESET)],
      target: openTarget(records, PRESET, 't1', 'GM'),
    };

    // #then
    expect(found).toEqual({ links: [], target: null });
  });
  test('counts no inert link: a tombstone, a deleted or unknown sheet, a removed block, or a target with no tokens', () => {
    // #given
    const records = byKey([
      ...pc('brok', 'Брок', 0),
      record('blk:gone', null),
      record('blk:brok:pet:dead', null),
      block('journal', 'entry', 'e1', 0, { entry: 'День 1' }),
      record('link:t1', null),
      link('t2', 'gone'),
      link('t3', 'nobody'),
      link('t4', 'brok', 'dead'),
      link('t5', 'npc'),
      link('t6', 'journal', 'e1'),
    ]);

    // #when
    const links = liveLinks(records, PRESET);
    // #then
    expect([...links]).toEqual([]);
  });
  test('counts no link with no decoded preset', () => {
    // #given
    const records = byKey([...pc('brok', 'Брок', 0), link('t1', 'brok')]);
    // #then
    expect(liveLinks(records, null).size).toBe(0);
  });
});

describe('linkedTargetKeys', () => {
  test('names each target a live link points to once', () => {
    // #given
    const records = byKey([
      ...pc('brok', 'Брок', 0),
      ...pc('liza', 'Лиза', 1),
      block('brok', 'pet', 'wolf', 0, { pet: 'Волк' }),
      link('t1', 'brok'),
      link('t2', 'brok'),
      link('t3', 'brok', 'wolf'),
    ]);

    // #when
    const linked = linkedTargetKeys(records, PRESET);
    // #then
    expect([...linked]).toEqual(['brok::token', 'brok:pet:wolf:token']);
  });
});

describe('pickerGroups', () => {
  test('groups targets by template and linkable section in preset order, each with the targets with no token first', () => {
    // #given
    const records = byKey([
      ...pc('a', 'Аня', 0),
      ...pc('b', 'Брок', 1),
      ...pc('c', 'Вера', 2),
      block('b', 'pet', 'wolf', 0, { pet: 'Волк' }),
      block('b', 'pet', 'cat', 1, { pet: 'Кот', pet_hp: 2 }),
      block('a', 'pet', 'owl', 0, { pet: 'Сова' }),
      block('npc', 'npc_name', 's1', 0, { npc_name: 'Гоблин' }),
      block('npc', 'npc_name', 's2', 1, { npc_name: 'Дракон' }),
      block('journal', 'entry', 'e1', 0, { entry: 'День 1' }),
      link('t1', 'a'),
      link('t2', 'npc', 's1'),
      link('t3', 'b', 'cat'),
    ]);

    // #when
    const groups = pickerGroups(records, PRESET);
    // #then
    expect(groups).toEqual([
      {
        template: PC,
        section: null,
        targets: [
          sheetTarget('b', 'Брок', false),
          sheetTarget('c', 'Вера', false),
          sheetTarget('a', 'Аня', true),
        ],
      },
      {
        template: PC,
        section: PET_SECTION,
        targets: [
          blockTarget('a', 'owl', 'Аня', 'Сова', false),
          blockTarget('b', 'wolf', 'Брок', 'Волк', false),
          blockTarget('b', 'cat', 'Брок', 'Кот', true),
        ],
      },
      {
        template: NPC,
        section: NPC_SECTION,
        targets: [
          blockTarget('npc', 's2', 'НПС', 'Дракон', false),
          blockTarget('npc', 's1', 'НПС', 'Гоблин', true),
        ],
      },
      {
        template: INVENTORY,
        section: null,
        targets: [sheetTarget('inventory', 'Инвентарь', false)],
      },
    ]);
  });
  test('gives an empty sheet name and an empty block name as ""', () => {
    // #given
    const records = byKey([
      record('blk:x', { set: 'pc', order: 0 }),
      block('x', 'pet', 'p1', 0, { pet_hp: 3 }),
    ]);

    // #when
    const groups = pickerGroups(records, PRESET);
    // #then
    expect(groups.slice(0, 2)).toEqual([
      { template: PC, section: null, targets: [sheetTarget('x', '', false)] },
      { template: PC, section: PET_SECTION, targets: [blockTarget('x', 'p1', '', '', false)] },
    ]);
  });
  test('keeps a sheet whose only link is inert among the ones with no token', () => {
    // #given: t1 names a removed repeat block of "a"; "b" has a live link.
    const records = byKey([
      ...pc('a', 'Аня', 0),
      ...pc('b', 'Брок', 1),
      record('blk:a:pet:dead', null),
      link('t1', 'a', 'dead'),
      link('t2', 'b'),
    ]);

    // #when
    const [characters] = pickerGroups(records, PRESET);
    // #then
    expect(characters?.targets).toEqual([
      sheetTarget('a', 'Аня', false),
      sheetTarget('b', 'Брок', true),
    ]);
  });
  test('leaves out a group with no target, so a room with no sheet of a sheet set lists only linkable single sheets', () => {
    // #given
    const records = byKey([record('blk:gone', null), link('t1', 'gone')]);
    // #when
    const groups = pickerGroups(records, PRESET);
    // #then
    expect(groups).toEqual([
      {
        template: INVENTORY,
        section: null,
        targets: [sheetTarget('inventory', 'Инвентарь', false)],
      },
    ]);
  });
  test('lists nothing with no decoded preset', () => {
    // #then
    expect(pickerGroups(byKey([...pc('a', 'Аня', 0)]), null)).toEqual([]);
  });
});

describe('tokenMenuEntries', () => {
  test('gives a GM with no link only "link", on one token of the character layer', () => {
    // #when
    const entries = tokenMenuEntries(byKey([...pc('brok', 'Брок', 0)]), PRESET, 'GM');
    // #then
    expect(entries).toEqual([{ action: 'link', filters: [{ ...GM_ONE_TOKEN, every: [LAYER] }] }]);
  });
  test('keeps linked tokens out of "link", lists them in the GM "open" icon and in "unlink", sorted by id', () => {
    // #given: t2 names a sheet of a visible sheet set, t1 a repeat block of a hidden single sheet.
    const records = byKey([
      ...pc('brok', 'Брок', 0),
      block('npc', 'npc_name', 's1', 0, { npc_name: 'Скелет' }),
      link('t2', 'brok'),
      link('t1', 'npc', 's1'),
    ]);

    // #when
    const entries = tokenMenuEntries(records, PRESET, 'GM');

    // #then
    const both: TokenMenuKeyFilter[] = [
      { key: 'id', value: 't1', coordinator: '||' },
      { key: 'id', value: 't2' },
    ];

    expect(entries).toEqual([
      {
        action: 'link',
        filters: [
          {
            ...GM_ONE_TOKEN,
            every: [
              LAYER,
              { key: 'id', value: 't1', operator: '!=' },
              { key: 'id', value: 't2', operator: '!=' },
            ],
          },
        ],
      },
      {
        action: 'open',
        filters: [
          { ...GM_ONE_TOKEN, every: [LAYER], some: both },
          { ...PLAYER_ONE_TOKEN, every: [LAYER], some: [{ key: 'id', value: 't2' }] },
        ],
      },
      { action: 'unlink', filters: [{ ...GM_ONE_TOKEN, every: [LAYER], some: both }] },
    ]);
  });
  test('gives a player only "open", on tokens linked to a target of a visible template', () => {
    // #given
    const records = byKey([
      ...pc('brok', 'Брок', 0),
      block('npc', 'npc_name', 's1', 0, { npc_name: 'Скелет' }),
      link('t1', 'brok'),
      link('t2', 'npc', 's1'),
    ]);

    // #when
    const entries = tokenMenuEntries(records, PRESET, 'PLAYER');
    // #then
    expect(entries).toEqual([
      {
        action: 'open',
        filters: [
          {
            ...GM_ONE_TOKEN,
            every: [LAYER],
            some: [
              { key: 'id', value: 't1', coordinator: '||' },
              { key: 'id', value: 't2' },
            ],
          },
          { ...PLAYER_ONE_TOKEN, every: [LAYER], some: [{ key: 'id', value: 't1' }] },
        ],
      },
    ]);
  });
  test('gives no player open icon for a repeat block on a hidden tab of a visible sheet', () => {
    // #given
    const records = byKey([
      ...pc('brok', 'Брок', 0),
      block('brok', 'pet', 'wolf', 0, { pet: 'Волк' }),
      link('t-sheet', 'brok'),
      link('t-hidden-block', 'brok', 'wolf'),
    ]);

    // #when
    const open = tokenMenuEntries(records, PRESET, 'PLAYER').find(
      (entry) => entry.action === 'open',
    );

    // #then
    expect(open?.filters).toEqual([
      {
        ...GM_ONE_TOKEN,
        every: [LAYER],
        some: [
          { key: 'id', value: 't-hidden-block', coordinator: '||' },
          { key: 'id', value: 't-sheet' },
        ],
      },
      { ...PLAYER_ONE_TOKEN, every: [LAYER], some: [{ key: 'id', value: 't-sheet' }] },
    ]);
  });
  test('leaves the player icon out when every link names a hidden template', () => {
    // #given
    const records = byKey([
      block('npc', 'npc_name', 's1', 0, { npc_name: 'Скелет' }),
      link('t1', 'npc', 's1'),
    ]);

    // #when
    const open = tokenMenuEntries(records, PRESET, 'GM').find((entry) => entry.action === 'open');
    // #then
    expect(open?.filters).toEqual([
      { ...GM_ONE_TOKEN, every: [LAYER], some: [{ key: 'id', value: 't1' }] },
    ]);
  });
  test('gives a player whose links name no visible target only the GM icon, which Owlbear hides from it', () => {
    // #given
    const records = byKey([
      block('npc', 'npc_name', 's1', 0, { npc_name: 'Скелет' }),
      record('blk:gone', null),
      link('t1', 'npc', 's1'),
      link('t2', 'gone'),
    ]);

    // #when
    const entries = tokenMenuEntries(records, PRESET, 'PLAYER');
    // #then: Owlbear never shows the GM icon to a player.
    expect(entries.map((entry) => entry.filters.map((filter) => filter.roles))).toEqual([[['GM']]]);
  });
  test('treats an inert link as no link: no "open" or "unlink", and its token can be linked again', () => {
    // #given
    const records = byKey([
      ...pc('brok', 'Брок', 0),
      record('blk:gone', null),
      record('blk:brok:pet:dead', null),
      link('t1', 'gone'),
      link('t2', 'brok', 'dead'),
      link('t3', 'journal'),
    ]);

    // #when
    const entries = [
      ...tokenMenuEntries(records, PRESET, 'GM'),
      ...tokenMenuEntries(records, PRESET, 'PLAYER'),
    ];

    // #then
    expect(entries).toEqual([{ action: 'link', filters: [{ ...GM_ONE_TOKEN, every: [LAYER] }] }]);
  });
});

describe('openTarget', () => {
  const records = byKey([
    ...pc('brok', 'Брок', 0),
    block('npc', 'npc_name', 's1', 0, { npc_name: 'Скелет' }),
    record('blk:gone', null),
    link('t-pc', 'brok'),
    block('brok', 'pet', 'wolf', 0, { pet: 'Волк' }),
    link('t-hidden-block', 'brok', 'wolf'),
    link('t-npc', 'npc', 's1'),
    link('t-inventory', 'inventory'),
    link('t-journal', 'journal'),
    link('t-gone', 'gone'),
    record('link:t-cleared', null),
  ]);

  test.each<[string, 'GM' | 'PLAYER', LinkTarget | null]>([
    ['t-pc', 'GM', { sheetId: 'brok', instanceId: null, path: null, cellId: 'token' }],
    ['t-pc', 'PLAYER', { sheetId: 'brok', instanceId: null, path: null, cellId: 'token' }],
    [
      't-hidden-block',
      'GM',
      {
        sheetId: 'brok',
        instanceId: 'wolf',
        path: ['pet', 'wolf'],
        cellId: 'token',
      },
    ],
    ['t-hidden-block', 'PLAYER', null],
    [
      't-npc',
      'GM',
      {
        sheetId: 'npc',
        instanceId: 's1',
        path: ['npc_name', 's1'],
        cellId: 'token',
      },
    ],
    ['t-npc', 'PLAYER', null],
    [
      't-inventory',
      'PLAYER',
      { sheetId: 'inventory', instanceId: null, path: null, cellId: 'token' },
    ],
    ['t-journal', 'GM', null],
    ['t-gone', 'GM', null],
    ['t-cleared', 'GM', null],
    ['t-none', 'GM', null],
    ['a:b', 'GM', null],
  ])('token %s for a %s opens %j', (tokenId, role, expected) => {
    // #when
    const target = openTarget(records, PRESET, tokenId, role);
    // #then
    expect(target).toEqual(expected);
  });
});

describe('tokenIdSchema', () => {
  test('takes an Owlbear item id and refuses one a link key cannot hold', () => {
    // #given
    const candidates = ['V1StGXR8_Z5jdHi6B-myT', '', 'a:b', 'a b', 'x'.repeat(129)];
    // #when
    const accepted = candidates.map((candidate) => tokenIdSchema.safeParse(candidate).success);
    // #then
    expect(accepted).toEqual([true, false, false, false, false]);
  });
});

describe('linkPickerUrl', () => {
  test('names the token in the picker page query', () => {
    // #when
    const url = linkPickerUrl('a/b&c');
    // #then
    expect(url).toBe('/picker.html?token=a%2Fb%26c');
  });
});

describe('removedItemIds', () => {
  test('lists the ids the previous list held and the next one does not, in their order', () => {
    // #when
    const removed = removedItemIds(['t1', 't2', 'map', 't3'], new Set(['t2', 'new']));
    // #then
    expect(removed).toEqual(['t1', 'map', 't3']);
  });
  test('lists nothing for an id that only the next list holds, such as a token never seen', () => {
    // #when
    const removed = removedItemIds(['t1'], new Set(['t1', 'other-scene-token']));
    // #then
    expect(removed).toEqual([]);
  });
});

describe('tokensToUnlink', () => {
  const records = byKey([
    ...pc('brok', 'Брок', 0),
    block('npc', 'npc_name', 's1', 0, { npc_name: 'Скелет' }),
    link('t1', 'brok'),
    link('t2', 'npc', 's1'),
    link('t3', 'brok'),
    record('link:t-cleared', null),
    link('t-gone', 'deleted-sheet'),
  ]);

  test('names a deleted token whose link is live', () => {
    // #when
    const unlinked = tokensToUnlink(removedItemIds(['t1', 't2'], new Set(['t2'])), records);
    // #then
    expect(unlinked).toEqual(['t1']);
  });
  test('names every linked token deleted at once, sorted', () => {
    // #when
    const unlinked = tokensToUnlink(['t3', 'map', 't1', 't2'], records);
    // #then
    expect(unlinked).toEqual(['t1', 't2', 't3']);
  });
  test('keeps the link of a token that was never in the list, such as one on another scene', () => {
    // #when
    const unlinked = tokensToUnlink(removedItemIds(['t2', 'map'], new Set(['map'])), records);
    // #then
    expect(unlinked).toEqual(['t2']);
  });
  test('names no token with no link, a cleared link, or a key no command could write', () => {
    // #given
    const withBadKey = new Map(records).set('link:bad:id', link('bad:id', 'brok'));
    // #when
    const unlinked = tokensToUnlink(['map', 't-cleared', 'bad:id'], withBadKey);
    // #then
    expect(unlinked).toEqual([]);
  });
  test('names a token whose link is inert, so no orphan record stays', () => {
    // #when
    const unlinked = tokensToUnlink(['t-gone'], records);
    // #then
    expect(unlinked).toEqual(['t-gone']);
  });
});

const LAYER = { key: 'layer', value: 'CHARACTER' };
const GM_ONE_TOKEN: Pick<TokenMenuFilter, 'max' | 'roles'> = { max: 1, roles: ['GM'] };
const PLAYER_ONE_TOKEN: Pick<TokenMenuFilter, 'max' | 'roles'> = { max: 1, roles: ['PLAYER'] };

function record(k: string, d: JsonValue): VersionedRecord {
  // SAFETY: some cases build a record no schema takes on purpose, so the code under test meets it.
  return fixtureRecord(k, d, 1, 'gm');
}

// A sheet of the "pc" sheet set with its name field value.
function pc(id: string, name: string, order: number): VersionedRecord[] {
  return [record(`blk:${id}`, { set: 'pc', order }), record(`blk:${id}`, { name })];
}

function block(
  sheetId: string,
  sectionId: string,
  instanceId: string,
  order: number,
  cells: Record<string, FieldValue>,
): VersionedRecord {
  return record(`blk:${sheetId}:${sectionId}:${instanceId}`, { order, cells });
}

function link(tokenId: string, sheetId: string, instanceId?: string): VersionedRecord {
  const sectionId = sheetId === 'npc' ? 'npc_name' : sheetId === 'journal' ? 'entry' : 'pet';

  return record(
    `link:${tokenId}`,
    instanceId === undefined
      ? { s: sheetId, c: 'token' }
      : { s: sheetId, path: [sectionId, instanceId], c: 'token' },
  );
}

function sheetTarget(sheetId: string, sheetName: string, linked: boolean) {
  return {
    target: { sheetId, instanceId: null, cellId: 'token' },
    cellId: 'token',
    sheetName,
    blockName: null,
    label: sheetName || 'Персонажи',
    linked,
  };
}

function blockTarget(
  sheetId: string,
  instanceId: string,
  sheetName: string,
  blockName: string,
  linked: boolean,
) {
  const sectionId = sheetId === 'npc' ? 'npc_name' : 'pet';

  return {
    target: {
      sheetId,
      instanceId,
      path: [sectionId, instanceId],
      cellId: 'token',
    },
    cellId: 'token',
    sheetName,
    blockName,
    label: blockName || sheetName || (sheetId === 'npc' ? 'НПС' : 'Персонажи'),
    linked,
  };
}

function byKey(records: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return assembleRecords(records);
}
