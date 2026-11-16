import { assembleRecords } from '@/core/merge';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { Preset, PresetSection, Template, TemplateLayout } from '@/core/preset';
import type { JsonValue } from '@/core/json';
import type { VersionedRecord } from '@/core/records';
import {
  blockIndex,
  linkDataOf,
  linkTargetKey,
  linkTargetOf,
  liveLinkTarget,
  repeatBlockTabIndex,
  sameLinkTarget,
  type LinkTarget,
} from './link-target';

const PET_SECTION: PresetSection = {
  repeat: true,
  tokens: true,
  rows: [
    [{ kind: 'field', type: 'text', id: 'pet' }],
    [{ kind: 'field', type: 'number', id: 'pet_hp' }],
  ],
};

const ITEM_SECTION: PresetSection = {
  repeat: true,
  rows: [[{ kind: 'field', type: 'text', id: 'item' }]],
};

// A linkable sheet set with one linkable and one plain repeat section.
const PC: Template = {
  id: 'pc',
  kind: 'set',
  title: 'Персонажи',
  nameField: 'name',
  tokens: true,
  tabs: [
    {
      sections: [
        { rows: [[{ kind: 'field', type: 'text', id: 'name' }]] },
        PET_SECTION,
        ITEM_SECTION,
      ],
    },
  ],
};

const NPC_SECTION: PresetSection = {
  repeat: true,
  tokens: true,
  rows: [[{ kind: 'field', type: 'text', id: 'npc_name' }]],
};

// A hidden single sheet that is not linkable, with a linkable repeat section.
const NPC: Template = {
  id: 'npc',
  kind: 'single',
  title: 'НПС',
  visibility: 'gm',
  tabs: [{ sections: [NPC_SECTION] }],
};

const PRESET: Preset = { v: 3, templates: [PC, NPC] };

function record(k: string, d: JsonValue): VersionedRecord {
  // SAFETY: some cases build a record no schema takes on purpose, so the code under test meets it.
  return fixtureRecord(k, d, 1, 'gm');
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
    expect(linkTargetOf({ s: 'brok' })).toEqual({ sheetId: 'brok', instanceId: null });
  });
  test('reads a repeat block link', () => {
    // #then
    expect(linkTargetOf({ s: 'brok', i: 'wolf' })).toEqual({ sheetId: 'brok', instanceId: 'wolf' });
  });
  test.each<[string, JsonValue]>([
    ['a tombstone', null],
    ['the old bare sheet id form', 'brok'],
    ['a sheet id no command could write', { s: 'a b' }],
    ['an extra key', { s: 'brok', section: 'pet' }],
  ])('reads no target from %s', (_name, d) => {
    // #then
    expect(linkTargetOf(d)).toBeNull();
  });
});

describe('linkDataOf', () => {
  test('writes a sheet target as { s }', () => {
    // #then
    expect(linkDataOf({ sheetId: 'brok', instanceId: null })).toEqual({ s: 'brok' });
  });
  test('writes a repeat block target as { s, i }', () => {
    // #then
    expect(linkDataOf({ sheetId: 'brok', instanceId: 'wolf' })).toEqual({ s: 'brok', i: 'wolf' });
  });
});

describe('linkTargetKey', () => {
  test.each<[LinkTarget, string]>([
    [{ sheetId: 'brok', instanceId: null }, 'brok'],
    [{ sheetId: 'brok', instanceId: 'wolf' }, 'brok:wolf'],
  ])('keys %j as %s', (target, key) => {
    // #then
    expect(linkTargetKey(target)).toBe(key);
  });
});

describe('sameLinkTarget', () => {
  test.each<[LinkTarget, LinkTarget, boolean]>([
    [{ sheetId: 'brok', instanceId: null }, { sheetId: 'brok', instanceId: null }, true],
    [{ sheetId: 'brok', instanceId: 'wolf' }, { sheetId: 'brok', instanceId: 'wolf' }, true],
    [{ sheetId: 'brok', instanceId: null }, { sheetId: 'brok', instanceId: 'wolf' }, false],
    [{ sheetId: 'brok', instanceId: 'wolf' }, { sheetId: 'liza', instanceId: 'wolf' }, false],
  ])('compares %j with %j as %p', (first, second, expected) => {
    // #then
    expect(sameLinkTarget(first, second)).toBe(expected);
  });
});

describe('blockIndex', () => {
  test('maps each live repeat block to its section by sheet id and instance id', () => {
    // #when
    const index = blockIndex(RECORDS.values());
    // #then
    expect([...index].sort(([left], [right]) => (left < right ? -1 : 1))).toEqual([
      ['brok:rope', 'item'],
      ['brok:wolf', 'pet'],
      ['npc:s1', 'npc_name'],
    ]);
  });
  test('gives one instance id held by two sections the section of the lower key on every client', () => {
    // #given
    const records = [
      record('blk:brok:pet:twin', { order: 0, cells: {} }),
      record('blk:brok:item:twin', { order: 0, cells: {} }),
    ];

    // #when
    const indexes = [blockIndex(records), blockIndex([...records].reverse())];
    // #then
    expect(indexes.map((index) => index.get('brok:twin'))).toEqual(['item', 'item']);
  });
});

describe('liveLinkTarget', () => {
  test('keeps a link to a live sheet of a linkable template', () => {
    // #given
    const target = { sheetId: 'brok', instanceId: null };
    // #then
    expect(live(target)).toEqual({ target, template: PC, section: null });
  });
  test('keeps a link to a live repeat block of a linkable section', () => {
    // #given
    const target = { sheetId: 'brok', instanceId: 'wolf' };
    // #then
    expect(live(target)).toEqual({ target, template: PC, section: PET_SECTION });
  });
  test('keeps a link to a repeat block of a hidden single sheet, as visibility is not liveness', () => {
    // #given
    const target = { sheetId: 'npc', instanceId: 's1' };
    // #then
    expect(live(target)).toEqual({ target, template: NPC, section: NPC_SECTION });
  });
  test.each<[string, LinkTarget]>([
    ['a sheet of a template with no tokens', { sheetId: 'npc', instanceId: null }],
    ['a repeat block of a section with no tokens', { sheetId: 'brok', instanceId: 'rope' }],
    ['a removed repeat block', { sheetId: 'brok', instanceId: 'dead' }],
    ['an unknown repeat block', { sheetId: 'brok', instanceId: 'cat' }],
    ['a repeat block named under another sheet', { sheetId: 'npc', instanceId: 'wolf' }],
    ['a deleted sheet', { sheetId: 'gone', instanceId: null }],
    ['a sheet with no sheet record', { sheetId: 'liza', instanceId: null }],
  ])('treats a link to %s as inert', (_name, target) => {
    // #then
    expect(live(target)).toBeNull();
  });
  test('treats every link as inert with no decoded preset', () => {
    // #then
    expect(live({ sheetId: 'brok', instanceId: null }, null)).toBeNull();
  });
});

describe('repeatBlockTabIndex', () => {
  // CAP-34: the repeat section `pet` sits on the second tab.
  const LAYOUT: TemplateLayout = {
    tabs: [
      { title: 'Основное', sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] },
      { title: 'Питомцы', sections: [PET_SECTION] },
    ],
  };

  const RECORDS: VersionedRecord[] = [
    { k: 'blk:brok:pet:p1', d: { order: 0, cells: {} }, c: 1, a: 'gm', l: [1, 'seed'] },
    { k: 'blk:brok:pet:gone', d: null, c: 2, a: 'gm', l: [1, 'seed'] },
  ];

  test.each<[string, string, number | null]>([
    ['a live repeat block', 'p1', 1],
    ['a removed repeat block', 'gone', null],
    ['an unknown repeat block', 'nobody', null],
  ])('finds the tab of %s', (_name, instanceId, expected) => {
    // #when
    const tab = repeatBlockTabIndex(RECORDS, LAYOUT, 'brok', instanceId);
    // #then
    expect(tab).toBe(expected);
  });
});
