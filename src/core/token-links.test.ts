import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';
import {
  linkedSheetIds,
  linkPickerUrl,
  liveLinks,
  openTarget,
  pickerOrder,
  removedItemIds,
  tokenIdSchema,
  tokenMenuEntries,
  tokensToUnlink,
  type TokenMenuFilter,
  type TokenMenuKeyFilter,
} from '@/core/token-links';
import { visibleSheets } from '@/core/visibility';

describe('liveLinks', () => {
  test('maps each token to the live sheet its link names, two tokens to one sheet included', () => {
    // #given
    const records = byKey([
      sheet('brok', 'pc', 'Брок', 0),
      sheet('skel', 'npc', 'Скелет', 0),
      link('t1', 'brok'),
      link('t2', 'brok'),
      link('t3', 'skel'),
    ]);

    // #when
    const links = liveLinks(records);

    // #then
    expect([...links]).toEqual([
      ['t1', 'brok'],
      ['t2', 'brok'],
      ['t3', 'skel'],
    ]);
  });

  test('counts no link under a key whose token id no command could write', () => {
    // #given
    const records = byKey([
      sheet('brok', 'pc', 'Брок', 0),
      link('a b', 'brok'),
      link('t1', 'brok'),
    ]);

    // #when
    const links = liveLinks(records);

    // #then
    expect([...links]).toEqual([['t1', 'brok']]);
  });

  test('counts no link to a sheet id no command could write, even with a live sheet under it', () => {
    // #given: "a b" passes the `link:` data schema but not the sheet id schema.
    const records = byKey([sheet('a b', 'pc', 'Аня', 0), link('t1', 'a b')]);

    // #when
    const found = { links: [...liveLinks(records)], target: openTarget(records, 't1', 'GM') };

    // #then
    expect(found).toEqual({ links: [], target: null });
  });

  test('counts no link for a tombstone, a deleted sheet or a sheet it does not hold', () => {
    // #given
    const records = byKey([
      sheet('brok', 'pc', 'Брок', 0),
      { k: 'sheet:gone', d: null, c: 2, a: 'gm' },
      { k: 'link:t1', d: null, c: 3, a: 'gm' },
      link('t2', 'gone'),
      link('t3', 'nobody'),
    ]);

    // #when
    const links = liveLinks(records);

    // #then
    expect([...links]).toEqual([]);
  });
});

describe('linkedSheetIds', () => {
  test('names each sheet a live link points to once', () => {
    // #given
    const records = byKey([
      sheet('brok', 'pc', 'Брок', 0),
      sheet('liza', 'pc', 'Лиза', 1),
      link('t1', 'brok'),
      link('t2', 'brok'),
    ]);

    // #when
    const linked = linkedSheetIds(records);

    // #then
    expect([...linked]).toEqual(['brok']);
  });
});

describe('pickerOrder', () => {
  test('lists characters, then NPCs, each with the sheets with no token first in sheet order', () => {
    // #given
    const records = byKey([
      sheet('a', 'pc', 'Аня', 0),
      sheet('b', 'pc', 'Брок', 1),
      sheet('c', 'pc', 'Вера', 2),
      sheet('d', 'npc', 'Гоблин', 0),
      sheet('e', 'npc', 'Дракон', 1),
      link('t1', 'a'),
      link('t2', 'd'),
    ]);

    // #when
    const order = pickerOrder(visibleSheets('GM', records.values()), records);

    // #then
    expect({
      characters: order.characters.map((one) => one.name),
      npcs: order.npcs.map((one) => one.name),
    }).toEqual({ characters: ['Брок', 'Вера', 'Аня'], npcs: ['Дракон', 'Гоблин'] });
  });

  test('keeps a sheet whose only link names a deleted sheet among the ones with no token', () => {
    // #given: t1 once pointed to "gone"; "b" has a live link.
    const records = byKey([
      sheet('a', 'pc', 'Аня', 0),
      sheet('b', 'pc', 'Брок', 1),
      { k: 'sheet:gone', d: null, c: 2, a: 'gm' },
      link('t1', 'gone'),
      link('t2', 'b'),
    ]);

    // #when
    const order = pickerOrder(visibleSheets('GM', records.values()), records);

    // #then
    expect(order.characters.map((one) => one.name)).toEqual(['Аня', 'Брок']);
  });

  test('lists nothing for a room with no live sheet', () => {
    // #given
    const records = byKey([{ k: 'sheet:gone', d: null, c: 2, a: 'gm' }, link('t1', 'gone')]);

    // #when
    const order = pickerOrder(visibleSheets('GM', records.values()), records);

    // #then
    expect(order).toEqual({ characters: [], npcs: [] });
  });
});

describe('tokenMenuEntries', () => {
  test('gives a GM with no link only "link", on one token of the character layer', () => {
    // #when
    const entries = tokenMenuEntries(byKey([sheet('brok', 'pc', 'Брок', 0)]), 'GM');

    // #then
    expect(entries).toEqual([{ action: 'link', filters: [{ ...GM_ONE_TOKEN, every: [LAYER] }] }]);
  });

  test('keeps linked tokens out of "link", lists them in the GM "open" icon and in "unlink", sorted by id', () => {
    // #given: t2 names a character, t1 an NPC.
    const records = byKey([
      sheet('brok', 'pc', 'Брок', 0),
      sheet('skel', 'npc', 'Скелет', 0),
      link('t2', 'brok'),
      link('t1', 'skel'),
    ]);

    // #when
    const entries = tokenMenuEntries(records, 'GM');

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

  test('gives a player only "open", on tokens linked to a character', () => {
    // #given
    const records = byKey([
      sheet('brok', 'pc', 'Брок', 0),
      sheet('skel', 'npc', 'Скелет', 0),
      link('t1', 'brok'),
      link('t2', 'skel'),
    ]);

    // #when
    const entries = tokenMenuEntries(records, 'PLAYER');

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

  test('leaves the player icon out when every link names an NPC', () => {
    // #given
    const records = byKey([sheet('skel', 'npc', 'Скелет', 0), link('t1', 'skel')]);

    // #when
    const open = tokenMenuEntries(records, 'GM').find((entry) => entry.action === 'open');

    // #then
    expect(open?.filters).toEqual([
      { ...GM_ONE_TOKEN, every: [LAYER], some: [{ key: 'id', value: 't1' }] },
    ]);
  });

  test('gives a player whose links name no live character only the GM icon, which Owlbear hides from it', () => {
    // #given
    const records = byKey([
      sheet('skel', 'npc', 'Скелет', 0),
      { k: 'sheet:gone', d: null, c: 2, a: 'gm' },
      link('t1', 'skel'),
      link('t2', 'gone'),
    ]);

    // #when
    const entries = tokenMenuEntries(records, 'PLAYER');

    // #then: Owlbear never shows the GM icon to a player.
    expect(entries.map((entry) => entry.filters.map((filter) => filter.roles))).toEqual([[['GM']]]);
  });

  test('makes no "open" entry for a dangling link', () => {
    // #given
    const records = byKey([{ k: 'sheet:gone', d: null, c: 2, a: 'gm' }, link('t1', 'gone')]);

    // #when
    const entries = [...tokenMenuEntries(records, 'GM'), ...tokenMenuEntries(records, 'PLAYER')];

    // #then
    expect(entries.map((entry) => entry.action)).toEqual(['link']);
  });
});

describe('openTarget', () => {
  const records = byKey([
    sheet('brok', 'pc', 'Брок', 0),
    sheet('skel', 'npc', 'Скелет', 0),
    { k: 'sheet:gone', d: null, c: 2, a: 'gm' },
    link('t-pc', 'brok'),
    link('t-npc', 'skel'),
    link('t-gone', 'gone'),
    { k: 'link:t-cleared', d: null, c: 2, a: 'gm' },
  ]);

  test.each<[string, 'GM' | 'PLAYER', string | null]>([
    ['t-pc', 'GM', 'brok'],
    ['t-pc', 'PLAYER', 'brok'],
    ['t-npc', 'GM', 'skel'],
    ['t-npc', 'PLAYER', null],
    ['t-gone', 'GM', null],
    ['t-cleared', 'GM', null],
    ['t-none', 'GM', null],
    ['a:b', 'GM', null],
  ])('token %s for a %s opens %p', (tokenId, role, expected) => {
    // #when
    const target = openTarget(records, tokenId, role);

    // #then
    expect(target).toBe(expected);
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
    sheet('brok', 'pc', 'Брок', 0),
    sheet('skel', 'npc', 'Скелет', 0),
    link('t1', 'brok'),
    link('t2', 'skel'),
    link('t3', 'brok'),
    { k: 'link:t-cleared', d: null, c: 2, a: 'gm' },
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

  test('names a token whose link points to a deleted sheet, so no orphan record stays', () => {
    // #when
    const unlinked = tokensToUnlink(['t-gone'], records);

    // #then
    expect(unlinked).toEqual(['t-gone']);
  });
});

const LAYER = { key: 'layer', value: 'CHARACTER' };

const GM_ONE_TOKEN: Pick<TokenMenuFilter, 'max' | 'roles'> = { max: 1, roles: ['GM'] };

const PLAYER_ONE_TOKEN: Pick<TokenMenuFilter, 'max' | 'roles'> = { max: 1, roles: ['PLAYER'] };

function sheet(id: string, kind: 'pc' | 'npc', name: string, order: number): VersionedRecord {
  return { k: `sheet:${id}`, d: { kind, name, order }, c: 1, a: 'gm' };
}

function link(tokenId: string, sheetId: string): VersionedRecord {
  return { k: `link:${tokenId}`, d: sheetId, c: 1, a: 'gm' };
}

function byKey(records: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return new Map(records.map((record) => [record.k, record]));
}
