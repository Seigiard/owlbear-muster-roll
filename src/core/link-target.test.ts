import { assembleRecords } from '@/core/merge';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { Preset, PresetRow, PresetSection, Template, TemplateLayout } from '@/core/preset';
import type { JsonValue } from '@/core/json';
import { blockAddress, type BlockAddress } from './block-address';
import type { VersionedRecord } from '@/core/records';
import {
  linkDataOf,
  linkTargetKey,
  linkTargetOf,
  liveLinkTarget,
  repeatBlockTabIndex,
  sameLinkTarget,
  tokenCellPlace,
  type LinkTarget,
} from './link-target';

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

const ITEM_SECTION: PresetSection = {
  repeat: { id: 'item', nameField: 'item' },
  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item' }] }],
};

// A linkable sheet set with one linkable and one plain repeat section.
const PC: Template = {
  id: 'pc',

  title: 'Персонажи',
  repeat: { nameField: 'name' },

  tabs: [
    {
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
        PET_SECTION,
        ITEM_SECTION,
      ],
    },
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

// A hidden single sheet that is not linkable, with a linkable repeat section.
const NPC: Template = {
  id: 'npc',

  title: 'НПС',
  visibility: 'gm',
  tabs: [{ sections: [NPC_SECTION] }],
};

const PRESET: Preset = { v: 4, templates: [PC, NPC] };

function record(k: string, d: JsonValue): VersionedRecord {
  // SAFETY: some cases build a record no schema takes on purpose, so the code under test meets it.
  return fixtureRecord(k, d, 1, 'gm');
}

function block(sheetId: string, path: readonly string[] = []): BlockAddress {
  const value = blockAddress(sheetId, path);

  if (value === null) throw new Error('fixture must be a block address');

  return value;
}

function linkTarget(sheetId: string, path: readonly string[] = [], cellId?: string): LinkTarget {
  return { block: block(sheetId, path), cellId };
}

const RECORDS: ReadonlyMap<string, VersionedRecord> = assembleRecords([
  record('blk:brok', { set: 'pc', order: 0 }),
  record('blk:gone', null),
  record('blk:brok:pet:wolf', { order: 0, cells: { pet: 'Волк' } }),
  record('blk:brok:pet:dead', null),
  record('blk:brok:item:rope', { order: 0, cells: { item: 'Верёвка' } }),
  record('blk:npc:npc_name:s1', { order: 0, cells: { npc_name: 'Скелет 1' } }),
]);

function live(target: LinkTarget, preset: Preset | null = PRESET) {
  const found = liveLinkTarget(RECORDS, preset, target);

  return found === null
    ? null
    : { target: found.target, template: found.policy.template, section: found.section };
}

describe('linkTargetOf', () => {
  test('reads a sheet link', () => {
    // #then
    expect(linkTargetOf({ s: 'brok', c: 'portrait' })).toEqual({
      block: { sheetId: 'brok', path: [] },
      cellId: 'portrait',
    });
  });
  test('reads a repeat block link', () => {
    // #then
    expect(linkTargetOf({ s: 'brok', path: ['pet', 'wolf'], c: 'portrait' })).toEqual({
      block: { sheetId: 'brok', path: ['pet', 'wolf'] },
      cellId: 'portrait',
    });
  });
  test.each<[string, JsonValue]>([
    ['a tombstone', null],
    ['the old bare sheet id form', 'brok'],
    ['the old sheet object without a cell', { s: 'brok' }],
    ['the old repeat instance key', { s: 'brok', i: 'wolf' }],
    ['a sheet id no command could write', { s: 'a b', c: 'portrait' }],
    ['an extra key', { s: 'brok', c: 'portrait', section: 'pet' }],
  ])('reads no target from %s', (_name, d) => {
    // #then
    expect(linkTargetOf(d)).toBeNull();
  });
});

describe('linkDataOf', () => {
  const linkDataCases: { s: string; path?: string[]; c: string }[] = [
    { s: 'brok', c: 'portrait' },
    { s: 'brok', path: ['pet', 'wolf'], c: 'portrait' },
  ];

  test.each(linkDataCases)('keeps the v4 storage bytes for %j', (data) => {
    // #when
    const parsed = linkTargetOf(data);

    // #then
    expect(parsed === null ? null : linkDataOf(parsed)).toEqual(data);
  });

  test('writes a sheet target as { s, c }', () => {
    // #then
    expect(linkDataOf(linkTarget('brok', [], 'portrait'))).toEqual({
      s: 'brok',
      c: 'portrait',
    });
  });
  test('writes a repeat block target as { s, path, c }', () => {
    // #then
    expect(linkDataOf(linkTarget('brok', ['pet', 'wolf'], 'portrait'))).toEqual({
      s: 'brok',
      path: ['pet', 'wolf'],
      c: 'portrait',
    });
  });
});

describe('linkTargetKey', () => {
  test.each<[LinkTarget, string]>([
    [linkTarget('brok', [], 'portrait'), 'brok::portrait'],
    [linkTarget('brok', ['pet', 'wolf'], 'portrait'), 'brok:pet:wolf:portrait'],
  ])('keys %j as %s', (target, key) => {
    // #then
    expect(linkTargetKey(target)).toBe(key);
  });
});

describe('sameLinkTarget', () => {
  test.each<[LinkTarget, LinkTarget, boolean]>([
    [linkTarget('brok', [], 'token'), linkTarget('brok', [], 'token'), true],
    [
      linkTarget('brok', ['pet', 'wolf'], 'token'),
      linkTarget('brok', ['pet', 'wolf'], 'token'),
      true,
    ],
    [linkTarget('brok', [], 'token'), linkTarget('brok', ['pet', 'wolf'], 'token'), false],
    [
      linkTarget('brok', ['pet', 'wolf'], 'token'),
      linkTarget('liza', ['pet', 'wolf'], 'token'),
      false,
    ],
  ])('compares %j with %j as %p', (first, second, expected) => {
    // #then
    expect(sameLinkTarget(first, second)).toBe(expected);
  });
});

describe('liveLinkTarget', () => {
  test('resolves a token cell inside the exact repeat tab block named by the link path', () => {
    // #given
    const template: Template = {
      id: 'npc',
      title: 'NPC',
      tabs: [
        {
          title: 'Overview',
          sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'count' }] }] }],
        },
        {
          title: 'NPC',
          repeat: { id: 'npc', nameField: 'name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'portrait' },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: 'Notes',
          sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'notes' }] }] }],
        },
      ],
    };

    const records = assembleRecords([
      record('blk:npc', { order: 0, cells: {} }),
      record('blk:npc:npc:b', { order: 1, cells: { name: 'Beta' } }),
    ]);

    const target = linkTarget('npc', ['npc', 'b'], 'portrait');

    // #when
    const found = liveLinkTarget(records, { v: 4, templates: [template] }, target);

    // #then
    expect(
      found === null
        ? null
        : {
            target: found.target,
            tabIndex: found.cell.tabIndex,
            sectionIndex: found.cell.sectionIndex,
            rowIndex: found.cell.rowIndex,
          },
    ).toEqual({
      target,
      tabIndex: 1,
      sectionIndex: 0,
      rowIndex: 0,
    });
  });

  test('keeps a link to a live sheet of a linkable template', () => {
    // #given
    const target = linkTarget('brok', [], 'token');
    // #then
    expect(live(target)).toEqual({ target, template: PC, section: null });
  });
  test('keeps a link to a live repeat block of a linkable section', () => {
    // #given
    const target = linkTarget('brok', ['pet', 'wolf'], 'token');

    // #then
    expect(live(target)).toEqual({ target, template: PC, section: PET_SECTION });
  });
  test('keeps a link to a repeat block of a hidden single sheet, as visibility is not liveness', () => {
    // #given
    const target = linkTarget('npc', ['npc_name', 's1'], 'token');

    // #then
    expect(live(target)).toEqual({ target, template: NPC, section: NPC_SECTION });
  });
  test('keeps literal root and scoped repeat-tab targets but not a root target for the repeat-tab cell', () => {
    // #given
    const template: Template = {
      id: 'npc',
      title: 'NPC',
      tabs: [
        {
          sections: [{ rows: [{ cells: [{ kind: 'token', id: 'root' }] }] }],
        },
        {
          repeat: { id: 'member', nameField: 'name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'repeat' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const records = assembleRecords([
      record('blk:npc:member:one', { order: 0, cells: { name: 'One' } }),
    ]);

    const root = linkTarget('npc', [], 'root');
    const repeat = linkTarget('npc', ['member', 'one'], 'repeat');

    // #when
    const targets = [root, linkTarget('npc', [], 'repeat'), repeat].map((target) =>
      liveLinkTarget(records, { v: 4, templates: [template] }, target),
    );

    // #then
    expect(targets.map((target) => target?.target ?? null)).toEqual([root, null, repeat]);
  });
  test.each<[string, LinkTarget]>([
    ['a sheet of a template with no root token', linkTarget('npc', [], 'token')],
    ['a repeat block of a section with no tokens', linkTarget('brok', ['item', 'rope'], 'token')],
    ['a removed repeat block', linkTarget('brok', ['pet', 'dead'], 'token')],
    ['an unknown repeat block', linkTarget('brok', ['pet', 'cat'], 'token')],
    ['a repeat block named under another sheet', linkTarget('npc', ['npc_name', 'wolf'], 'token')],
    ['a deleted sheet', linkTarget('gone', [], 'token')],
    ['a sheet with no sheet record', linkTarget('liza', [], 'token')],
  ])('treats a link to %s as inert', (_name, target) => {
    // #then
    expect(live(target)).toBeNull();
  });
  test('treats every link as inert with no decoded preset', () => {
    // #then
    expect(live(linkTarget('brok', [], 'token'), null)).toBeNull();
  });
});

describe('tokenCellPlace', () => {
  test('finds a token in a repeat row inside a repeat section on a plain tab', () => {
    // #given
    const template: Template = {
      id: 'plain',
      title: 'Plain',
      tabs: [
        {
          sections: [
            {
              repeat: { id: 'group', nameField: 'group_name' },
              rows: [
                {
                  cells: [{ kind: 'field', type: 'text', id: 'group_name' }],
                },
                {
                  repeat: { id: 'move', nameField: 'move_name' },
                  cells: [
                    { kind: 'field', type: 'text', id: 'move_name' },
                    { kind: 'token', id: 'move_token' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // #when
    const place = tokenCellPlace(template, 'move_token', ['group', 'move']);

    // #then
    expect(
      place === null
        ? null
        : {
            tabIndex: place.tabIndex,
            sectionIndex: place.sectionIndex,
            rowIndex: place.rowIndex,
          },
    ).toEqual({ tabIndex: 0, sectionIndex: 0, rowIndex: 1 });
  });

  test('finds the root row token when an earlier repeat section nests a row of the same id', () => {
    // #given
    const attack = { id: 'attack', nameField: 'attack_name' };

    const attackRow: PresetRow = {
      repeat: attack,
      cells: [
        { kind: 'field', type: 'text', id: 'attack_name' },
        { kind: 'token', id: 'target' },
      ],
    };

    const template: TemplateLayout = {
      tabs: [
        {
          title: 'NPC',
          sections: [
            {
              repeat: { id: 'npc', nameField: 'npc_name' },
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'npc_name' }] }, attackRow],
            },
          ],
        },
        { title: 'Attacks', sections: [{ rows: [attackRow] }] },
      ],
    };

    // #when
    const place = tokenCellPlace(template, 'target', ['attack']);

    // #then
    expect(
      place === null
        ? null
        : { tabIndex: place.tabIndex, sectionIndex: place.sectionIndex, rowIndex: place.rowIndex },
    ).toEqual({ tabIndex: 1, sectionIndex: 0, rowIndex: 0 });
  });
});

describe('repeatBlockTabIndex', () => {
  // CAP-34: the repeat section `pet` sits on the second tab.
  const LAYOUT: TemplateLayout = {
    tabs: [
      {
        title: 'Основное',
        sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] }],
      },
      { title: 'Питомцы', sections: [PET_SECTION] },
    ],
  };

  const REPEAT_TAB_RECORDS: VersionedRecord[] = [
    { k: 'blk:brok:pet:p1', d: { order: 0, cells: {} }, c: 1, a: 'gm', l: [1, 'seed'] },
    { k: 'blk:brok:pet:gone', d: null, c: 2, a: 'gm', l: [1, 'seed'] },
  ];

  test.each<[string, BlockAddress, number | null]>([
    ['a live repeat block', block('brok', ['pet', 'p1']), 1],
    ['a removed repeat block', block('brok', ['pet', 'gone']), null],
    ['an unknown repeat block', block('brok', ['pet', 'nobody']), null],
  ])('finds the tab of %s', (_name, target, expected) => {
    // #when
    const tab = repeatBlockTabIndex(REPEAT_TAB_RECORDS, LAYOUT, target);
    // #then
    expect(tab).toBe(expected);
  });
});
