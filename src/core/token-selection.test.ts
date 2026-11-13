import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import type { Preset, Template } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { liveLinks } from '@/core/token-links';
import { sameItemIds, selectionMarks, selectionStep, tokensByTarget } from '@/core/token-selection';
import { visibleRecordMap } from '@/core/visibility';

const PC: Template = {
  id: 'pc',
  kind: 'set',
  title: 'Персонажи',
  nameField: 'name',
  tokens: true,
  tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] }],
};

// Hidden, and only its repeat blocks are linkable.
const NPC: Template = {
  id: 'npc',
  kind: 'single',
  title: 'НПС',
  visibility: 'gm',
  tabs: [
    {
      sections: [
        { repeat: true, tokens: true, rows: [[{ kind: 'field', type: 'text', id: 'npc_name' }]] },
      ],
    },
  ],
};

const PRESET: Preset = { v: 3, templates: [PC, NPC] };

// t-brok and t-brok-2 link Брок, t-vera links Вера, t-skel links the skeleton's repeat block,
// t-gone links a deleted sheet, so its link is inert.
const RECORDS = byKey([
  record('sheet:brok', { set: 'pc', order: 0 }),
  record('row:brok:name', { name: 'Брок' }),
  record('sheet:vera', { set: 'pc', order: 1 }),
  record('row:vera:name', { name: 'Вера' }),
  record('rep:npc:npc_name:s1', { order: 0, cells: { npc_name: 'Скелет' } }),
  record('link:t-brok', { s: 'brok' }),
  record('link:t-brok-2', { s: 'brok' }),
  record('link:t-vera', { s: 'vera' }),
  record('link:t-skel', { s: 'npc', i: 's1' }),
  record('sheet:gone', null),
  record('link:t-gone', { s: 'gone' }),
]);

const GM_LINKS = liveLinks(RECORDS, PRESET);

describe('selectionMarks', () => {
  test('a token linked to a sheet marks that sheet only', () => {
    // #when
    const marks = selectionMarks(GM_LINKS, ['t-brok']);

    // #then
    expect(marks).toEqual({ sheetIds: new Set(['brok']), targets: new Set(['brok']) });
  });

  test('a token linked to a repeat block marks its sheet and the repeat block', () => {
    // #when
    const marks = selectionMarks(GM_LINKS, ['t-skel']);

    // #then
    expect(marks).toEqual({ sheetIds: new Set(['npc']), targets: new Set(['npc:s1']) });
  });

  test('several selected tokens mark every target, and unlinked or inert items mark nothing', () => {
    // #when
    const marks = selectionMarks(GM_LINKS, ['t-brok', 't-brok-2', 't-skel', 'tree', 't-gone']);

    // #then
    expect(marks).toEqual({
      sheetIds: new Set(['brok', 'npc']),
      targets: new Set(['brok', 'npc:s1']),
    });
  });

  test('an empty selection marks nothing', () => {
    // #when
    const marks = selectionMarks(GM_LINKS, []);

    // #then
    expect(marks).toEqual({ sheetIds: new Set(), targets: new Set() });
  });

  test("a player's selection of a token linked to a hidden template marks nothing", () => {
    // #given
    const playerLinks = liveLinks(visibleRecordMap('PLAYER', PRESET, RECORDS), PRESET);

    // #when
    const marks = selectionMarks(playerLinks, ['t-skel', 't-vera']);

    // #then
    expect(marks).toEqual({ sheetIds: new Set(['vera']), targets: new Set(['vera']) });
  });
});

describe('tokensByTarget', () => {
  test('lists the tokens of each live target, sorted, and leaves out inert links', () => {
    // #when
    const tokens = tokensByTarget(GM_LINKS);

    // #then
    expect(tokens).toEqual(
      new Map([
        ['brok', ['t-brok', 't-brok-2']],
        ['vera', ['t-vera']],
        ['npc:s1', ['t-skel']],
      ]),
    );
  });
});

describe('selectionStep', () => {
  test('selects every token on the scene when none is selected', () => {
    // #when
    const step = selectionStep(['t1', 't2'], new Set(['t1', 't2', 'tree']), new Set(['tree']));

    // #then
    expect(step).toEqual({ kind: 'select', tokenIds: ['t1', 't2'] });
  });

  test('selects them all when only some are selected', () => {
    // #when
    const step = selectionStep(['t1', 't2'], new Set(['t1', 't2']), new Set(['t1']));

    // #then
    expect(step).toEqual({ kind: 'select', tokenIds: ['t1', 't2'] });
  });

  test('deselects them when every one is selected', () => {
    // #when
    const step = selectionStep(['t1', 't2'], new Set(['t1', 't2']), new Set(['t1', 't2', 'x']));

    // #then
    expect(step).toEqual({ kind: 'deselect', tokenIds: ['t1', 't2'] });
  });

  test('skips a token that is not on the open scene', () => {
    // #when
    const step = selectionStep(['t1', 't9'], new Set(['t1']), new Set(['t1']));

    // #then
    expect(step).toEqual({ kind: 'deselect', tokenIds: ['t1'] });
  });

  test('offers no step when no linked token is on the open scene', () => {
    // #when
    const step = selectionStep(['t9'], new Set(['t1']), new Set());

    // #then
    expect(step).toBeNull();
  });
});

describe('sameItemIds', () => {
  test('holds for the same ids in another order', () => {
    // #when
    const same = sameItemIds(['a', 'b'], ['b', 'a']);

    // #then
    expect(same).toBe(true);
  });

  test('fails for a list with one more id', () => {
    // #when
    const same = sameItemIds(['a'], ['a', 'b']);

    // #then
    expect(same).toBe(false);
  });

  test('fails for lists of one length with other ids', () => {
    // #when
    const same = sameItemIds(['a', 'b'], ['a', 'c']);

    // #then
    expect(same).toBe(false);
  });
});

function record(k: string, d: JsonValue): VersionedRecord {
  // SAFETY: test records follow the AD-2 shapes, which the code under test parses itself.
  return { k, d, c: 1, a: 'gm' } as VersionedRecord;
}

function byKey(records: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return new Map(records.map((entry) => [entry.k, entry]));
}
