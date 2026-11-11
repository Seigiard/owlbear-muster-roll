import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';
import {
  linkedSheetIds,
  linkPickerUrl,
  liveLinks,
  pickerOrder,
  tokenIdSchema,
  tokenMenuEntries,
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
    const entries = tokenMenuEntries(new Map(), 'GM');

    // #then
    expect(entries).toEqual([
      {
        action: 'link',
        filter: { max: 1, roles: ['GM'], every: [{ key: 'layer', value: 'CHARACTER' }] },
      },
    ]);
  });

  test('keeps linked tokens out of "link" and lists them in "unlink" `some` with "||", sorted by id', () => {
    // #given
    const links = new Map([
      ['t2', 'brok'],
      ['t1', 'skel'],
    ]);

    // #when
    const entries = tokenMenuEntries(links, 'GM');

    // #then
    expect(entries).toEqual([
      {
        action: 'link',
        filter: {
          max: 1,
          roles: ['GM'],
          every: [
            { key: 'layer', value: 'CHARACTER' },
            { key: 'id', value: 't1', operator: '!=' },
            { key: 'id', value: 't2', operator: '!=' },
          ],
        },
      },
      {
        action: 'unlink',
        filter: {
          max: 1,
          roles: ['GM'],
          every: [{ key: 'layer', value: 'CHARACTER' }],
          some: [
            { key: 'id', value: 't1', coordinator: '||' },
            { key: 'id', value: 't2' },
          ],
        },
      },
    ]);
  });

  test('gives a player no entry, linked tokens or not', () => {
    // #when
    const entries = tokenMenuEntries(new Map([['t1', 'brok']]), 'PLAYER');

    // #then
    expect(entries).toEqual([]);
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

function sheet(id: string, kind: 'pc' | 'npc', name: string, order: number): VersionedRecord {
  return { k: `sheet:${id}`, d: { kind, name, order }, c: 1, a: 'gm' };
}

function link(tokenId: string, sheetId: string): VersionedRecord {
  return { k: `link:${tokenId}`, d: sheetId, c: 1, a: 'gm' };
}

function byKey(records: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return new Map(records.map((record) => [record.k, record]));
}
