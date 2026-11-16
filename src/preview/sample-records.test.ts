import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRESET_FORMAT_VERSION as FORMAT_VERSION } from '@/core/format-version';
import { parsePresetFile, type Preset, type PresetFieldCell } from '@/core/preset';
import { blockDataSchema, recordSchema, type VersionedRecord } from '@/core/records';
import { repeatBlocks, rowValues } from '@/core/sheet-values';
import { sheetName } from '@/core/sheets';
import { previewSheets } from './sample-records';

const REPOSITORY_ROOT = join(import.meta.dir, '../..');
const ARMOR = selectField('armor', ['Кожаная', 'Кольчуга']);

function selectField(id: string, options: string[]): PresetFieldCell {
  return { kind: 'field', type: 'select', id, options };
}

// A sheet set first, then a hidden single sheet whose repeat section spans two rows.
const PRESET: Preset = {
  v: FORMAT_VERSION,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Characters',
      nameField: 'name',
      tabs: [
        {
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
                [{ kind: 'text', text: 'Броня' }, ARMOR],
                [{ kind: 'dice', formula: '1d6' }],
                [
                  { kind: 'text', text: '  ' },
                  { kind: 'field', type: 'text', id: 'motto' },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPCs',
      visibility: 'gm',
      tabs: [
        {
          sections: [
            {
              title: 'Foes',
              repeat: true,
              rows: [
                [
                  { kind: 'text', text: 'Foe' },
                  { kind: 'field', type: 'text', id: 'foe' },
                ],
                [
                  { kind: 'field', type: 'number', id: 'hp' },
                  { kind: 'dice', formula: '1d20 + hp' },
                ],
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('previewSheets with sample content', () => {
  test('makes one sheet per template, in preset order: a preview sheet for a set, the template id for a single sheet', () => {
    // #when
    const { records, sheets } = previewSheets(PRESET, 'sample');
    const setSheet = blockDataSchema.parse(records.get('blk:preview-1')?.d);
    // #then
    expect({
      sheets: sheets.map((sheet) => [sheet.template.id, sheet.sheetId]),
      setSheet: { set: setSheet.set, order: setSheet.order },
      singleSheet: records.get('blk:npc'),
    }).toEqual({
      sheets: [
        ['pc', 'preview-1'],
        ['npc', 'npc'],
      ],
      setSheet: { set: 'pc', order: 1 },
      singleSheet: {
        k: 'blk:npc',
        d: { order: 1, cells: {} },
        c: 1,
        a: 'preview',
        l: [1, 'preview'],
      },
    });
  });
  test('gives every field a value of its type, so the sheet of the set has a name', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');
    // #then
    expect({
      name: sheetName(records, PRESET, 'preview-1'),
      root: Object.fromEntries(rowValues(records, 'preview-1', 'str')),
    }).toEqual({
      name: 'Name',
      root: {
        name: 'Name',
        motto: 'motto',
        str: 10,
        str_tired: true,
        dex: 11,
        dex_tired: false,
        armor: 'Кожаная',
      },
    });
  });
  test('gives a text field with no visible label its id, so no value is empty', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');
    // #then
    expect(rowValues(records, 'preview-1', 'motto').get('motto')).toBe('motto');
  });
  test('gives a select field one of the options from its preset', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');
    const value = rowValues(records, 'preview-1', 'armor').get('armor');
    // #then
    expect(['Кожаная', 'Кольчуга'].includes(String(value))).toBe(true);
  });
  test('gives a repeat section two repeat blocks, each with every field of the section', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');
    const blocks = repeatBlocks(records, 'npc', 'foe');
    // #then
    expect(
      blocks.map((block) => ({ id: block.instanceId, values: Object.fromEntries(block.values) })),
    ).toEqual([
      { id: 'sample-1', values: { foe: 'Foe 1', hp: 10 } },
      { id: 'sample-2', values: { foe: 'Foe 2', hp: 11 } },
    ]);
  });
  test('makes no record for a row with no field', () => {
    // #when
    const { records } = previewSheets(PRESET, 'sample');
    // #then
    expect([...records.keys()].sort()).toEqual(
      ['blk:preview-1', 'blk:npc', 'blk:npc:foe:sample-1', 'blk:npc:foe:sample-2'].sort(),
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
  test('keeps only the sheet of the set, with no name, and no value or repeat block', () => {
    // #when
    const { records } = previewSheets(PRESET, 'empty');
    // #then
    expect({
      keys: [...records.keys()],
      name: sheetName(records, PRESET, 'preview-1'),
      blocks: repeatBlocks(records, 'npc', 'foe'),
    }).toEqual({ keys: ['blk:preview-1', 'blk:npc'], name: '', blocks: [] });
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
