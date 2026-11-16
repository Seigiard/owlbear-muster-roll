import type { JsonValue } from '@/core/json';
import { fixtureRecord } from '../../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import { aclKey, plinkKey } from '@/core/access';
import { PRESET_FORMAT_VERSION as FORMAT_VERSION } from '@/core/format-version';
import type { Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { sidebarEntries } from './sidebar-entries';

const PLAYER = 'p1';

const PRESET: Preset = {
  v: FORMAT_VERSION,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Characters',
      nameField: 'name',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] }],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPCs',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] }],
    },
    {
      id: 'loot',
      kind: 'single',
      title: 'Loot',
      players: 'edit',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'gold' }]] }] }],
    },
    {
      id: 'ship',
      kind: 'set',
      title: 'Ships',
      nameField: 'hull',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'hull' }]] }] }],
    },
  ],
};

function record(k: string, d: JsonValue): [string, VersionedRecord] {
  return [k, recordSchema.parse(fixtureRecord(k, d, 1, 'seed'))];
}

const RECORDS: ReadonlyMap<string, VersionedRecord> = new Map([
  record('blk:arag', { set: 'pc', order: 0, cells: { name: 'Арагорн' } }),
  record('blk:frodo', { set: 'pc', order: 1 }),
  record(plinkKey('frodo', PLAYER), { name: 'Player' }),
  record(aclKey('frodo', PLAYER), { name: 'Player' }),
]);

function summary(role: 'GM' | 'PLAYER'): string[] {
  return sidebarEntries(role, PRESET, RECORDS, PLAYER).sections.flatMap((section) => {
    if (section.kind === 'single') {
      return [`${section.sheet.id} "${section.sheet.name}"`];
    }

    const result = [`[${section.id}]`];
    result.push(
      ...section.sheets.map((sheet) => `${sheet.id} "${sheet.name}"${sheet.owned ? ' owned' : ''}`),
    );

    if (section.canAdd) {
      result.push(`+${section.id}`);
    }

    return result;
  });
}

describe('sidebarEntries', () => {
  test('a GM gets groups and singles in preset order, including empty groups', () => {
    // #when
    const entries = summary('GM');
    // #then
    expect(entries).toEqual([
      '[pc]',
      'blk:arag "Арагорн"',
      'blk:frodo ""',
      '+pc',
      'blk:npc "NPCs"',
      'blk:loot "Loot"',
      '[ship]',
      '+ship',
    ]);
  });
  test('a player gets visible sections with own sheets first and no add controls', () => {
    // #when
    const entries = summary('PLAYER');
    // #then
    expect(entries).toEqual([
      '[pc]',
      'blk:frodo "" owned',
      'blk:arag "Арагорн"',
      'blk:loot "Loot"',
    ]);
  });
  test('a player does not get an empty group', () => {
    // #then
    expect(summary('PLAYER')).not.toContain('[ship]');
  });
  test('with no preset there are no sidebar sections', () => {
    // #then
    expect(sidebarEntries('GM', null, RECORDS, PLAYER)).toEqual({ sections: [] });
  });
});
