import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORMAT_VERSION } from '@/core/format-version';
import { parsePresetFile, type Preset, type PresetTemplate } from '@/core/preset';
import { recordSchema, sheetDataSchema, type VersionedRecord } from '@/core/records';
import { repeatInstances, rowValues } from '@/core/sheet-values';

import { PREVIEW_CHARACTER, PREVIEW_NPC, previewSheets } from './sample-records';

const REPOSITORY_ROOT = join(import.meta.dir, '../..');

const CHARACTER: PresetTemplate = {
  sections: [
    {
      title: 'Stats',
      rows: [
        [
          { kind: 'text', text: 'Name' },
          { kind: 'field', type: 'text', id: 'name' },
        ],
        [
          { kind: 'text', text: 'Strength' },
          { kind: 'field', type: 'number', id: 'str' },
          { kind: 'field', type: 'check', id: 'str_tired' },
          { kind: 'dice', formula: '1d20 <= str' },
        ],
        [
          { kind: 'text', text: 'Dexterity' },
          { kind: 'field', type: 'number', id: 'dex' },
          { kind: 'field', type: 'check', id: 'dex_tired' },
        ],
        [{ kind: 'dice', formula: '1d6' }],
        [
          { kind: 'text', text: '  ' },
          { kind: 'field', type: 'text', id: 'motto' },
        ],
      ],
    },
    {
      title: 'Attacks',
      repeat: true,
      rows: [
        [
          { kind: 'text', text: 'Attack' },
          { kind: 'field', type: 'text', id: 'attack' },
          { kind: 'field', type: 'number', id: 'bonus' },
          { kind: 'dice', formula: '1d20 + bonus' },
        ],
      ],
    },
  ],
};

const NPC: PresetTemplate = {
  sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }],
};

const PRESET: Preset = { v: FORMAT_VERSION, character: CHARACTER, npc: NPC };

describe('previewSheets with sample content', () => {
  test('names one character sheet and one NPC sheet', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');

    // #then
    expect(records.get(`sheet:${PREVIEW_CHARACTER.sheetId}`)?.d).toEqual({
      kind: 'pc',
      name: PREVIEW_CHARACTER.name,
      order: 1,
    });

    expect(records.get(`sheet:${PREVIEW_NPC.sheetId}`)?.d).toEqual({
      kind: 'npc',
      name: PREVIEW_NPC.name,
      order: 1,
    });
  });

  test('gives every field a value of its type', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');

    const character = PREVIEW_CHARACTER.sheetId;

    // #then
    expect(Object.fromEntries(rowValues(records, character, 'name'))).toEqual({ name: 'Name' });

    expect(Object.fromEntries(rowValues(records, character, 'str'))).toEqual({
      str: 10,
      str_tired: true,
    });

    expect(Object.fromEntries(rowValues(records, character, 'dex'))).toEqual({
      dex: 11,
      dex_tired: false,
    });

    expect(Object.fromEntries(rowValues(records, PREVIEW_NPC.sheetId, 'hp'))).toEqual({ hp: 10 });
  });

  test('gives a text field with no visible label its id, so no value is empty', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');

    // #then
    expect(rowValues(records, PREVIEW_CHARACTER.sheetId, 'motto').get('motto')).toBe('motto');
  });

  test('gives a repeat section two rows with values of their own', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');

    const instances = repeatInstances(records, PREVIEW_CHARACTER.sheetId, 'attack');

    // #then
    expect(instances.map((instance) => Object.fromEntries(instance.values))).toEqual([
      { attack: 'Attack 1', bonus: 12 },
      { attack: 'Attack 2', bonus: 13 },
    ]);
  });

  test('makes no record for a row with no field', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');

    // #then
    expect([...records.keys()].sort()).toEqual(
      [
        'sheet:preview-character',
        'sheet:preview-npc',
        'row:preview-character:name',
        'row:preview-character:str',
        'row:preview-character:dex',
        'row:preview-character:motto',
        'rep:preview-character:attack:sample-1',
        'rep:preview-character:attack:sample-2',
        'row:preview-npc:hp',
      ].sort(),
    );
  });

  test('gives the same records for the same preset', () => {
    // #when
    const first = previewSheets(PRESET, 'sample');
    const second = previewSheets(PRESET, 'sample');

    // #then
    expect([...second.records]).toEqual([...first.records]);
  });
});

describe('previewSheets with empty content', () => {
  test('keeps the two named sheets and makes no value record', () => {
    // #when
    const { records } = previewSheets(PRESET, 'empty');

    // #then
    expect([...records.keys()].sort()).toEqual(['sheet:preview-character', 'sheet:preview-npc']);
    expect(sheetDataSchema.parse(records.get('sheet:preview-npc')?.d).name).toBe(PREVIEW_NPC.name);
  });

  test('shows a repeat section with no rows, as in a new sheet', () => {
    // #when
    const { records } = previewSheets(PRESET, 'empty');

    // #then
    expect(repeatInstances(records, PREVIEW_CHARACTER.sheetId, 'attack')).toEqual([]);
  });
});

describe('previewSheets over the repository presets', () => {
  const presetPaths = [
    'docs/example-preset.json',
    ...readdirSync(join(REPOSITORY_ROOT, 'tests/fixtures/presets')).map(
      (name) => `tests/fixtures/presets/${name}`,
    ),
  ];

  test.each(presetPaths)('makes only records the room would accept from %s', (path) => {
    // #given
    const parsed = parsePresetFile(readFileSync(join(REPOSITORY_ROOT, path), 'utf8'));

    if (!parsed.ok) {
      throw new Error(`${path} is not a valid preset: ${parsed.error.code}`);
    }

    // #when
    const records: VersionedRecord[] = [
      ...previewSheets(parsed.value, 'sample').records.values(),
      ...previewSheets(parsed.value, 'empty').records.values(),
    ];

    // #then
    const refused = records.filter((record) => !recordSchema.safeParse(record).success);

    expect(refused).toEqual([]);
  });
});
