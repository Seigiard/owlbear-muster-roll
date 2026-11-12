import { describe, expect, test } from 'bun:test';

import { aclKey, plinkKey } from '@/core/access';
import { FORMAT_VERSION } from '@/core/format-version';
import type { Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { resolveSheet, type SheetPolicy } from '@/core/sheets';

import { playerMayEdit, sheetTabs, tabEntries, type TabEntry } from './sheet-tabs';

const PLAYER = 'p1';

// A sheet set, a hidden single sheet, a player-editable single sheet, and a second sheet set.
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

function record(k: string, d: VersionedRecord['d']): [string, VersionedRecord] {
  // SAFETY: every record built here holds data of the schema its key form names.
  return [k, { k, d, c: 1, a: 'seed' } as VersionedRecord];
}

const RECORDS: ReadonlyMap<string, VersionedRecord> = new Map([
  record('sheet:arag', { set: 'pc', order: 0 }),
  record('row:arag:name', { name: 'Арагорн' }),
  record('sheet:frodo', { set: 'pc', order: 1 }),
  record(plinkKey('frodo', PLAYER), { name: 'Player' }),
  record(aclKey('frodo', PLAYER), { name: 'Player' }),
]);

// Each entry as one short line: a sheet tab by its id, name and owner mark, a "+" by its set. A
// single sheet is named by its template's title.
function summary(entries: readonly TabEntry[]): string[] {
  return entries.map((entry) =>
    entry.kind === 'add'
      ? `+${entry.set.id}`
      : `${entry.tab.id} "${entry.tab.name}"${entry.tab.owned ? ' owned' : ''}`,
  );
}

function policyOf(sheetId: string): SheetPolicy {
  const policy = resolveSheet(RECORDS, PRESET, sheetId);

  if (policy === null) {
    throw new Error(`no policy for ${sheetId}`);
  }

  return policy;
}

describe('tabEntries', () => {
  test('a GM gets every template in preset order, each sheet set followed by its "+", even with no sheet', () => {
    // #when
    const entries = tabEntries('GM', PRESET, RECORDS, PLAYER);

    // #then
    expect(summary(entries)).toEqual([
      'sheet:arag "Арагорн"',
      'sheet:frodo ""',
      '+pc',
      'sheet:npc "NPCs"',
      'sheet:loot "Loot"',
      '+ship',
    ]);
  });

  test('a player gets the visible templates with no "+", and the own sheets first', () => {
    // #when
    const entries = tabEntries('PLAYER', PRESET, RECORDS, PLAYER);

    // #then
    expect(summary(entries)).toEqual([
      'sheet:frodo "" owned',
      'sheet:arag "Арагорн"',
      'sheet:loot "Loot"',
    ]);
  });

  test('with no preset there is no tab', () => {
    // #then
    expect(tabEntries('GM', null, RECORDS, PLAYER)).toEqual([]);
  });

  test('sheetTabs keeps the sheet tabs in order and drops the "+"', () => {
    // #when
    const tabs = sheetTabs(tabEntries('GM', PRESET, RECORDS, PLAYER));

    // #then
    expect(tabs.map((tab) => tab.sheetId)).toEqual(['arag', 'frodo', 'npc', 'loot']);
  });
});

describe('playerMayEdit', () => {
  test.each<[string, string, boolean]>([
    ["a sheet of a set with the player's live acl", 'frodo', true],
    ['a sheet of a set with no acl', 'arag', false],
    ['a single sheet with players: edit', 'loot', true],
    ['a hidden single sheet', 'npc', false],
  ])('%s: %p', (_name, sheetId, expected) => {
    // #then
    expect(playerMayEdit(policyOf(sheetId), RECORDS, PLAYER)).toBe(expected);
  });
});
