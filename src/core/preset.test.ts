import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';
import { parseFormula, type FormulaTree } from '@/core/formula';
import type { JsonObject, JsonValue } from '@/core/json';
import {
  DEFAULT_WINDOW_SIZE,
  decodePreset,
  encodePreset,
  firstFieldId,
  formatPresetFile,
  layoutSections,
  openTabIndex,
  parsePresetFile,
  parsePresetStructure,
  placedSections,
  plainRowIdOf,
  presetProblems,
  repeatSectionId,
  resolveFieldReference,
  templateById,
  windowSizeOf,
  type Preset,
  type PresetSection,
  type TemplateLayout,
  type WindowSize,
} from './preset';
import { cellLabel } from './sheet-values';

const EXAMPLE_PATH = join(import.meta.dir, '../../docs/example-preset.json');
const EXAMPLE_TEXT = readFileSync(EXAMPLE_PATH, 'utf8');
const FIXTURE_DIR = join(import.meta.dir, '../../tests/fixtures/presets');
const PRESET_DIR = join(import.meta.dir, '../../presets');
const MANIFEST_PATH = join(import.meta.dir, '../../public/manifest.json');
const NUMBER_FIELD = (id: string): JsonObject => ({ kind: 'field', type: 'number', id });
const TEXT_FIELD = (id: string): JsonObject => ({ kind: 'field', type: 'text', id });

const SELECT_FIELD = (id: string, options: string[]): JsonObject => ({
  kind: 'field',
  type: 'select',
  id,
  options,
});

const DICE_CHOICE_FIELD = (id: string, options: string[]): JsonObject => ({
  kind: 'field',
  type: 'dice-choice',
  id,
  options,
});

const LABEL: JsonObject = { kind: 'text', text: 'Сила' };

type SelectFailure =
  | {
      code: 'no-options';
      field: string;
    }
  | {
      code: 'blank-option';
      field: string;
    }
  | {
      code: 'duplicate-option';
      detail: string;
      field: string;
    };

const MINIMAL: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',
      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] }] }],
    },
  ],
};

const OLDER_V3: JsonObject = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] }],
    },
  ],
};

// A sheet set named by its `name` field, which the first section holds before `sections`.
function setOf(id: string, sections: JsonValue[], nameField = 'name'): JsonObject {
  return {
    id,
    title: 'Персонажи',
    repeat: { nameField },
    tabs: [{ sections: [{ rows: [{ cells: [TEXT_FIELD('name')] }] }, ...sections] }],
  };
}

function singleOf(id: string, sections: JsonValue[]): JsonObject {
  return { id, title: 'Заметки', tabs: [{ sections }] };
}

function presetOf(...templates: JsonValue[]): string {
  return JSON.stringify({ v: 4, templates });
}

// A preset of one single sheet with these sections, so no name field rule applies.
function fileOf(sections: JsonValue[]): string {
  return presetOf(singleOf('notes', sections));
}

function presetWithSelect(options: string[]): Preset {
  return {
    v: 4,
    templates: [
      {
        id: 'notes',
        title: 'Заметки',
        tabs: [
          {
            sections: [
              {
                rows: [
                  {
                    cells: [
                      {
                        kind: 'field',
                        type: 'select',
                        id: 'armor',
                        options,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function decodeIndependently(data: string): JsonValue {
  return z.json().parse(JSON.parse(strFromU8(inflateSync(Buffer.from(data, 'base64')))));
}

describe('parsePresetFile', () => {
  test('accepts the committed example preset as it is', () => {
    // #when
    const parsed = parsePresetFile(EXAMPLE_TEXT);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(EXAMPLE_TEXT) });
  });
  test('the committed example includes a select field', () => {
    // #given
    const parsed = parsePresetFile(EXAMPLE_TEXT);

    if (!parsed.ok) {
      throw new Error('the committed example must parse');
    }

    // #when
    const hasSelect = parsed.value.templates.some((template) =>
      layoutSections(template).some((section) =>
        section.rows.some((row) =>
          row.cells.some(
            (cell) => cell.kind === 'field' && z.literal('select').safeParse(cell.type).success,
          ),
        ),
      ),
    );

    // #then
    expect(hasSelect).toBe(true);
  });
  test('accepts a select field with its options in preset order', () => {
    // #given
    const text = fileOf([
      { rows: [{ cells: [SELECT_FIELD('armor', ['Нет', 'Кожаная', 'Кольчуга'])] }] },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test('accepts a dice-choice field with die options in preset order', () => {
    // #given
    const text = fileOf([
      { rows: [{ cells: [DICE_CHOICE_FIELD('weapon_die', ['d1', 'd4', 'd1000'])] }] },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test('accepts every cell kind, columns, repeat and every width', () => {
    // #given
    const text = fileOf([
      {
        title: 'Характеристики',
        width: '1/3',
        columns: 3,
        rows: [{ cells: [LABEL, NUMBER_FIELD('str'), { kind: 'dice', formula: '1d20 <= str' }] }],
      },
      { width: '1/2', rows: [{ cells: [{ kind: 'field', type: 'check', id: 'tired' }] }] },
      {
        width: 'full',
        repeat: { id: 'item', nameField: 'item' },
        rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item' }] }],
      },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test('accepts a cell name on every field type and on a dice cell', () => {
    // #given
    const text = fileOf([
      {
        rows: [
          {
            cells: [
              { ...TEXT_FIELD('notes'), name: 'Заметки' },
              { ...NUMBER_FIELD('hp'), name: 'Хиты' },
              { kind: 'field', type: 'check', id: 'tired', name: 'Усталость' },
              {
                ...SELECT_FIELD('armor', ['Нет', 'Кожаная']),
                name: 'Доспех',
              },
              {
                ...DICE_CHOICE_FIELD('damage_die', ['d6', 'd8']),
                name: 'Кубик урона',
              },
              { kind: 'dice', formula: '1d20 <= hp', name: 'Проверка хитов' },
            ],
          },
        ],
      },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test('refuses a name on a text cell as an invalid structure', () => {
    // #given
    const text = fileOf([{ rows: [{ cells: [{ kind: 'text', text: 'Сила', name: 'STR' }] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'invalid-structure' } });
  });
  test.each([
    [
      'an empty field name',
      { ...NUMBER_FIELD('hp'), name: '' },
      { code: 'blank-name', detail: 'hp', cell: 'field' },
    ],
    [
      'a spaces-only field name',
      { ...NUMBER_FIELD('hp'), name: '  ' },
      { code: 'blank-name', detail: 'hp', cell: 'field' },
    ],
    [
      'an empty dice name',
      { kind: 'dice', formula: '1d20', name: '' },
      { code: 'blank-name', detail: '1d20', cell: 'dice' },
    ],
    [
      'a spaces-only dice name',
      { kind: 'dice', formula: '1d20', name: '\t ' },
      { code: 'blank-name', detail: '1d20', cell: 'dice' },
    ],
  ] as const)('refuses %s and names its cell', (_name, cell, error) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [cell] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    const actual: unknown = parsed;
    // #then
    expect(actual).toEqual({ ok: false, error });
  });
  test('accepts a field and a dice name of exactly 60 Unicode code points', () => {
    // #given
    const name = '😀'.repeat(60);

    const text = fileOf([
      {
        rows: [
          {
            cells: [
              { ...NUMBER_FIELD('hp'), name },
              { kind: 'dice', formula: '1d20', name },
            ],
          },
        ],
      },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test.each([
    [
      'field',
      { ...NUMBER_FIELD('hp'), name: '😀'.repeat(61) },
      { code: 'long-name', detail: 'hp', cell: 'field' },
    ],
    [
      'dice cell',
      { kind: 'dice', formula: '1d20', name: '😀'.repeat(61) },
      { code: 'long-name', detail: '1d20', cell: 'dice' },
    ],
  ] as const)('refuses a 61-code-point name on a %s', (_name, cell, error) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [cell] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    const actual: unknown = parsed;
    // #then
    expect(actual).toEqual({ ok: false, error });
  });
  test('accepts every template property the format names', () => {
    // #given
    const text = presetOf(
      {
        ...setOf('pc', [
          {
            repeat: { id: 'attack', nameField: 'attack' },
            rows: [{ cells: [TEXT_FIELD('attack')] }],
          },
        ]),
        visibility: 'all',
      },
      {
        ...singleOf('npc', [
          {
            repeat: { id: 'npc_name', nameField: 'npc_name' },
            rows: [{ cells: [TEXT_FIELD('npc_name')] }],
          },
        ]),
        visibility: 'gm',
      },
      {
        ...singleOf('inventory', [{ rows: [{ cells: [NUMBER_FIELD('gold')] }] }]),
        players: 'edit',
      },
    );

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test('accepts one field id in two templates', () => {
    // #given
    const text = presetOf(
      setOf('pc', [{ rows: [{ cells: [NUMBER_FIELD('hp')] }] }]),
      singleOf('npc', [{ rows: [{ cells: [NUMBER_FIELD('hp')] }] }]),
    );

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test('accepts one id in a repeat section and outside it', () => {
    // #given
    const text = fileOf([
      { rows: [{ cells: [NUMBER_FIELD('bonus')] }] },
      {
        repeat: { id: 'attack', nameField: 'attack' },
        rows: [{ cells: [TEXT_FIELD('attack'), NUMBER_FIELD('bonus')] }],
      },
      {
        repeat: { id: 'spell', nameField: 'spell' },
        rows: [{ cells: [TEXT_FIELD('spell')] }, { cells: [NUMBER_FIELD('bonus')] }],
      },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test('accepts a repeat section of several rows whose first field is in a later row', () => {
    // #given
    const text = fileOf([
      {
        repeat: { id: 'npc_name', nameField: 'npc_name' },
        rows: [
          { cells: [LABEL] },
          { cells: [TEXT_FIELD('npc_name'), NUMBER_FIELD('hp')] },
          { cells: [NUMBER_FIELD('ac')] },
        ],
      },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test('accepts a columns row with fewer cells than the grid', () => {
    // #given
    const text = fileOf([
      { columns: 4, rows: [{ cells: [LABEL, NUMBER_FIELD('str')] }, { cells: [] }] },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test.each<[string, string]>([
    ['not JSON', '{"v": 3,'],
    ['an empty file', ''],
  ])('refuses %s as not JSON', (_name, text) => {
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'not-json' } });
  });
  test('refuses a file over 1 MiB before it parses it', () => {
    // #given
    const text = ' '.repeat(1024 * 1024 + 1);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'too-large' } });
  });
  test('counts the 1 MiB limit in UTF-8 bytes', () => {
    // #given: 524289 two-byte letters are under 1 MiB characters but over 1 MiB bytes.
    const text = `"${'ы'.repeat(524289)}"`;
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'too-large' } });
  });
  test.each<[string, JsonValue]>([
    ['an integer above the current one', 5],
    ['a much higher integer', 99],
  ])('refuses a file whose v is %s as newer', (_name, v) => {
    // #given: a newer file may have any shape.
    const text = JSON.stringify({ v, something: 'unknown' });
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'newer-version' } });
  });
  test('refuses a file whose v is above the largest safe integer as newer', () => {
    // #given: JSON preserves this integer, and it is greater than the current format version.
    const text = JSON.stringify({ v: 1e16, something: 'unknown' });
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'newer-version' } });
  });
  test.each<[string, JsonValue | undefined]>([
    ['absent', undefined],
    ['lower', 0],
    ['the older format 1', 1],
    ['the older format 2', 2],
    ['a fraction below the current one', 2.5],
    ['a fraction above the current one', 3.5],
    ['a string', '3'],
    ['null', null],
  ])('refuses a file whose v is %s as an unsupported version', (_name, v) => {
    // #given
    const text = JSON.stringify({ ...OLDER_V3, v });
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'unsupported-version' } });
  });
  test('refuses a whole preset of format 1 as an unsupported version', () => {
    // #given
    const text = JSON.stringify({
      v: 1,
      character: { sections: [{ rows: [[NUMBER_FIELD('str')]] }] },
      npc: { sections: [] },
    });

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'unsupported-version' } });
  });
  test('refuses a whole preset of format 2, with sections in a template, as an unsupported version', () => {
    // #given
    const text = JSON.stringify({
      v: 2,
      templates: [
        {
          id: 'npc',
          kind: 'single',
          title: 'NPC',
          sections: [{ rows: [[NUMBER_FIELD('str')]] }],
        },
      ],
    });

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'unsupported-version' } });
  });
  test('refuses a whole preset of format 3 as an unsupported version', () => {
    // #when
    const parsed = parsePresetFile(JSON.stringify(OLDER_V3));
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'unsupported-version' } });
  });
  test('accepts a template without the removed kind property', () => {
    // #given
    const text = presetOf({ id: 'notes', title: 'Notes', tabs: [{ sections: [] }] });
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test('accepts players edit on a repeated template', () => {
    // #given
    const text = presetOf({ ...setOf('pc', []), players: 'edit' });
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test.each<[string, JsonValue]>([
    ['an array', [MINIMAL]],
    ['a number', 1],
    ['an unknown top-level key', { ...MINIMAL, extra: true }],
    ['no templates', { v: 4 }],
    ['an empty template list', { v: 4, templates: [] }],
    [
      'the templates of format 1 at v 4',
      { v: 4, character: { sections: [] }, npc: { sections: [] } },
    ],
    ['a template of an unknown kind', JSON.parse(presetOf({ ...singleOf('x', []), kind: 'npc' }))],
    ['a template with no id', JSON.parse(presetOf({ title: 'X', tabs: [{ sections: [] }] }))],
    ['a template with no title', JSON.parse(presetOf({ id: 'x', tabs: [{ sections: [] }] }))],
    ['a template with no tabs', JSON.parse(presetOf({ id: 'x', title: 'X' }))],
    ['an unknown template key', JSON.parse(presetOf({ ...singleOf('x', []), order: 1 }))],
    [
      'a repeated template with no name field',
      JSON.parse(presetOf({ id: 'pc', title: 'Персонажи', repeat: {}, tabs: [{ sections: [] }] })),
    ],
    [
      'a name field on a single sheet',
      JSON.parse(
        presetOf({
          ...singleOf('x', [{ rows: [{ cells: [TEXT_FIELD('name')] }] }]),
          nameField: 'name',
        }),
      ),
    ],
    ['players other than edit', JSON.parse(presetOf({ ...singleOf('x', []), players: 'view' }))],
    [
      'an unknown visibility',
      JSON.parse(presetOf({ ...singleOf('x', []), visibility: 'players' })),
    ],
    ['tokens that is false', JSON.parse(presetOf({ ...singleOf('x', []), tokens: false }))],
    [
      'section tokens without repeat',
      JSON.parse(fileOf([{ tokens: true, rows: [{ cells: [LABEL] }] }])),
    ],
    ['an unknown section key', JSON.parse(fileOf([{ rows: [], hidden: true }]))],
    ['an unknown cell key', JSON.parse(fileOf([{ rows: [{ cells: [{ ...LABEL, size: 2 }] }] }]))],
    [
      'an unknown cell kind',
      JSON.parse(fileOf([{ rows: [{ cells: [{ kind: 'image', src: 'x' }] }] }])),
    ],
    [
      'an unknown field type',
      JSON.parse(fileOf([{ rows: [{ cells: [{ kind: 'field', type: 'date', id: 'born' }] }] }])),
    ],
    ['an unknown width', JSON.parse(fileOf([{ width: '1/4', rows: [] }]))],
    ['a zero columns', JSON.parse(fileOf([{ columns: 0, rows: [] }]))],
    ['a fractional columns', JSON.parse(fileOf([{ columns: 1.5, rows: [] }]))],
    ['a repeat that is false', JSON.parse(fileOf([{ repeat: false, rows: [] }]))],
    [
      'a field without an id',
      JSON.parse(fileOf([{ rows: [{ cells: [{ kind: 'field', type: 'text' }] }] }])),
    ],
    [
      'a select field without options',
      JSON.parse(fileOf([{ rows: [{ cells: [{ kind: 'field', type: 'select', id: 'armor' }] }] }])),
    ],
    [
      'options on a text field',
      JSON.parse(
        fileOf([{ rows: [{ cells: [{ ...TEXT_FIELD('armor'), options: ['Кожаная'] }] }] }]),
      ),
    ],
    [
      'options on a number field',
      JSON.parse(
        fileOf([{ rows: [{ cells: [{ ...NUMBER_FIELD('armor'), options: ['Кожаная'] }] }] }]),
      ),
    ],
    [
      'options on a check field',
      JSON.parse(
        fileOf([
          {
            rows: [
              {
                cells: [
                  {
                    kind: 'field',
                    type: 'check',
                    id: 'armor',
                    options: ['Кожаная'],
                  },
                ],
              },
            ],
          },
        ]),
      ),
    ],
  ])('refuses %s as an invalid structure', (_name, file) => {
    // #when
    const parsed = parsePresetFile(JSON.stringify(file));
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'invalid-structure' } });
  });
  test.each<[string, string[], SelectFailure]>([
    ['no option', [], { code: 'no-options', field: 'armor' }],
    ['an empty option', ['', 'Кожаная'], { code: 'blank-option', field: 'armor' }],
    ['a spaces-only option', ['Кожаная', '  '], { code: 'blank-option', field: 'armor' }],
    [
      'a repeated option',
      ['Кожаная', 'Кольчуга', 'Кожаная'],
      { code: 'duplicate-option', detail: 'Кожаная', field: 'armor' },
    ],
  ])('refuses a select field with %s', (_name, options, error) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [SELECT_FIELD('armor', options)] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    const actual: unknown = parsed;
    // #then
    expect(actual).toEqual({ ok: false, error });
  });
  test.each([
    ['a number without d', ['d8', '8'], '8'],
    ['a leading zero', ['d04'], 'd04'],
    ['zero sides', ['d0'], 'd0'],
    ['more than 1000 sides', ['d1001'], 'd1001'],
  ] as const)('refuses a dice-choice field with %s', (_name, options, detail) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [DICE_CHOICE_FIELD('weapon_die', [...options])] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    const actual: unknown = parsed;
    // #then
    expect(actual).toEqual({
      ok: false,
      error: { code: 'bad-die-option', detail, field: 'weapon_die' },
    });
  });
  test.each([
    [
      'a dice-choice field used as a number',
      [DICE_CHOICE_FIELD('weapon_die', ['d8']), { kind: 'dice', formula: '1d20 + weapon_die' }],
      {
        code: 'die-field-as-number',
        detail: '1d20 + weapon_die',
        field: 'weapon_die',
      },
    ],
    [
      'a number field used as a die',
      [NUMBER_FIELD('bonus'), { kind: 'dice', formula: '1d(bonus)' }],
      { code: 'field-not-die', detail: '1d(bonus)', field: 'bonus' },
    ],
  ] as const)('refuses %s at the dice cell', (_name, row, error) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [...row] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    const actual: unknown = parsed;
    // #then
    expect(actual).toEqual({ ok: false, error });
  });
  test('accepts an unknown id in a dice-choice slot for a roll-time field error', () => {
    // #given
    const text = fileOf([{ rows: [{ cells: [{ kind: 'dice', formula: '1d(nothing)' }] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test.each<[string, string]>([
    ['two words', 'two words'],
    ['1st', '1st'],
    ['a-b', 'a-b'],
    ['a:b', 'a:b'],
    ['', ''],
    ['d20', 'd20'],
    ['floor', 'floor'],
    ['constructor', 'constructor'],
    ['__proto__', '__proto__'],
    ['a'.repeat(65), `${'a'.repeat(40)}…`],
  ])('refuses the template id %j', (id, detail) => {
    // #given
    const text = presetOf(singleOf(id, []));
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'invalid-template-id', detail } });
  });
  test.each(['pc', '_hidden', 'Gm_notes', 'a'.repeat(64)])('accepts the template id %j', (id) => {
    // #given
    const text = presetOf(singleOf(id, []));
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test('refuses two templates that share an id, whatever their kind', () => {
    // #given
    const text = presetOf(setOf('pc', []), singleOf('pc', []));
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-template', detail: 'pc' } });
  });
  test.each<[string, JsonValue[]]>([
    ['a number field', [{ rows: [{ cells: [NUMBER_FIELD('title')] }] }]],
    ['a check field', [{ rows: [{ cells: [{ kind: 'field', type: 'check', id: 'title' }] }] }]],
    [
      'a text field of a repeat section',
      [{ repeat: { id: 'title', nameField: 'title' }, rows: [{ cells: [TEXT_FIELD('title')] }] }],
    ],
    ['no field', [{ rows: [{ cells: [TEXT_FIELD('other')] }] }]],
  ])('refuses a sheet set whose name field names %s', (_name, sections) => {
    // #given
    const text = presetOf({
      id: 'crew',
      title: 'Экипаж',
      repeat: { nameField: 'title' },
      tabs: [{ sections }],
    });

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({
      ok: false,
      error: { code: 'bad-name-field', detail: 'crew', field: 'title' },
    });
  });
  test('accepts a name field that a text field outside repeat sections holds in any row', () => {
    // #given
    const text = presetOf({
      id: 'crew',
      title: 'Экипаж',
      repeat: { nameField: 'title' },
      tabs: [
        {
          sections: [
            { repeat: { id: 'item', nameField: 'item' }, rows: [{ cells: [TEXT_FIELD('item')] }] },
            { rows: [{ cells: [NUMBER_FIELD('str')] }, { cells: [LABEL, TEXT_FIELD('title')] }] },
          ],
        },
      ],
    });

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test.each([
    'two words',
    '1st',
    'a-b',
    'a:b',
    '',
    'd20',
    'D1',
    'floor',
    'ceil',
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
  ])('refuses the field id %j', (id) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [NUMBER_FIELD(id)] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'invalid-id', detail: id } });
  });
  test.each(['_hidden', 'dex', 'd20x', 'Floor', 'str_2'])('accepts the field id %j', (id) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [NUMBER_FIELD(id)] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test.each<[string, JsonValue[], string]>([
    ['one row', [{ rows: [{ cells: [NUMBER_FIELD('str'), NUMBER_FIELD('str')] }] }], 'str'],
    [
      'two rows of one section',
      [{ rows: [{ cells: [NUMBER_FIELD('str')] }, { cells: [NUMBER_FIELD('str')] }] }],
      'str',
    ],
    [
      'two sections',
      [{ rows: [{ cells: [NUMBER_FIELD('str')] }] }, { rows: [{ cells: [NUMBER_FIELD('str')] }] }],
      'str',
    ],
    [
      'one repeat row',
      [
        {
          repeat: { id: 'item', nameField: 'item' },
          rows: [{ cells: [NUMBER_FIELD('item'), NUMBER_FIELD('item')] }],
        },
      ],
      'item',
    ],
    [
      'two rows of one repeat section',
      [
        {
          repeat: { id: 'item', nameField: 'item' },
          rows: [
            { cells: [NUMBER_FIELD('item'), NUMBER_FIELD('qty')] },
            { cells: [NUMBER_FIELD('qty')] },
          ],
        },
      ],
      'qty',
    ],
  ])('refuses an id twice in %s', (_name, sections, id) => {
    // #when
    const parsed = parsePresetFile(fileOf(sections));
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-id', detail: id } });
  });
  test('refuses an id twice in one scope of a later template', () => {
    // #given
    const text = presetOf(
      setOf('pc', [{ rows: [{ cells: [NUMBER_FIELD('hp')] }] }]),
      singleOf('npc', [{ rows: [{ cells: [NUMBER_FIELD('hp'), NUMBER_FIELD('hp')] }] }]),
    );

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-id', detail: 'hp' } });
  });
  test.each<[string, JsonValue]>([
    ['no row', { repeat: { id: 'name', nameField: 'name' }, rows: [] }],
    [
      'a row with no field',
      {
        repeat: { id: 'name', nameField: 'name' },
        rows: [{ cells: [LABEL, { kind: 'dice', formula: '1d6' }] }],
      },
    ],
    [
      'two rows with no field',
      {
        repeat: { id: 'name', nameField: 'name' },
        rows: [{ cells: [LABEL] }, { cells: [{ kind: 'dice', formula: '1d6' }] }],
      },
    ],
  ])('refuses a repeat section whose name field has %s', (_name, section) => {
    // #when
    const parsed = parsePresetFile(fileOf([section]));
    // #then
    expect(parsed).toEqual({
      ok: false,
      error: { code: 'bad-name-field', detail: 'name', field: 'name' },
    });
  });
  test.each<[string, JsonValue]>([
    [
      'in its first row',
      { repeat: { id: 'item', nameField: 'item' }, rows: [{ cells: [TEXT_FIELD('item')] }] },
    ],
    [
      'in a later row',
      {
        repeat: { id: 'item', nameField: 'item' },
        rows: [{ cells: [LABEL] }, { cells: [TEXT_FIELD('item')] }],
      },
    ],
  ])('refuses two repeat sections with one explicit id when its name field is %s', (_n, s) => {
    // #given
    const text = fileOf([
      {
        repeat: { id: 'item', nameField: 'item' },
        rows: [{ cells: [LABEL, TEXT_FIELD('item'), NUMBER_FIELD('weight')] }],
      },
      s,
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-section', detail: 'item' } });
  });
  test('accepts two templates with repeat sections that start with one id', () => {
    // #given
    const text = presetOf(
      singleOf('npc', [
        { repeat: { id: 'item', nameField: 'item' }, rows: [{ cells: [TEXT_FIELD('item')] }] },
      ]),
      singleOf('inventory', [
        { repeat: { id: 'item', nameField: 'item' }, rows: [{ cells: [TEXT_FIELD('item')] }] },
      ]),
    );

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test('refuses a columns row with more cells than the grid', () => {
    // #given
    const text = fileOf([
      { columns: 2, rows: [{ cells: [LABEL] }, { cells: [LABEL, NUMBER_FIELD('str'), LABEL] }] },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'row-too-wide' } });
  });
  test.each([
    '1d20 <',
    'sqrt(str)',
    '0d6',
    '101d6',
    '1d0',
    '1d1001',
    'a < b < c',
    '(a < b)',
    '1d(d6)',
    '1d(D20)',
    '1d(floor)',
    '1d(constructor)',
  ])('refuses the formula %j', (formula) => {
    // #given
    const text = fileOf([{ rows: [{ cells: [{ kind: 'dice', formula }] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'bad-formula', detail: formula } });
  });
  test('refuses a formula over 200 characters and shortens it in the detail', () => {
    // #given: 201 characters, valid in every other way.
    const text = fileOf([
      { rows: [{ cells: [{ kind: 'dice', formula: `str+${' '.repeat(196)}1` }] }] },
    ]);

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({
      ok: false,
      error: { code: 'bad-formula', detail: `str+${' '.repeat(36)}…` },
    });
  });
  test('cuts a long id in the detail to 40 characters and an ellipsis', () => {
    // #given
    const id = `a${'b'.repeat(59)}`;
    const text = fileOf([{ rows: [{ cells: [NUMBER_FIELD(id), NUMBER_FIELD(id)] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({
      ok: false,
      error: { code: 'duplicate-id', detail: `a${'b'.repeat(39)}…` },
    });
  });
  test('accepts a formula that names an id absent from the sheet', () => {
    // #given
    const text = fileOf([{ rows: [{ cells: [{ kind: 'dice', formula: '1d20 <= missing' }] }] }]);
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
});

// CAP-34: a template's sections live in its tabs.
function tabbedSet(tabs: JsonValue[]): JsonObject {
  return { id: 'pc', title: 'Персонажи', repeat: { nameField: 'name' }, tabs };
}

describe('parsePresetFile with tabs', () => {
  test('accepts a template of two titled tabs', () => {
    // #given
    const text = presetOf(
      tabbedSet([
        { title: 'Основное', sections: [{ rows: [{ cells: [TEXT_FIELD('name')] }] }] },
        {
          title: 'Заметки',
          visibility: 'gm',
          sections: [{ rows: [{ cells: [TEXT_FIELD('notes')] }] }],
        },
      ]),
    );

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test('accepts a template of one tab with no title', () => {
    // #given
    const text = presetOf(tabbedSet([{ sections: [{ rows: [{ cells: [TEXT_FIELD('name')] }] }] }]));
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);
  });
  test('accepts a visible template whose every tab is hidden from players', () => {
    // #given
    const text = presetOf(
      tabbedSet([
        {
          visibility: 'gm',
          sections: [{ rows: [{ cells: [TEXT_FIELD('name'), TEXT_FIELD('notes')] }] }],
        },
      ]),
    );

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });
  test.each<[string, JsonObject]>([
    ['no title', {}],
    ['a blank title', { title: '  ' }],
  ])('refuses a tab with %s beside another tab, naming the template', (_name, title) => {
    // #given
    const text = presetOf(
      tabbedSet([
        { title: 'Основное', sections: [{ rows: [{ cells: [TEXT_FIELD('name')] }] }] },
        { ...title, sections: [] },
      ]),
    );

    // #when
    const parsed = parsePresetFile(text);
    const preset = parsePresetStructure(JSON.parse(text));
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'untitled-tab', detail: 'pc' } });
    expect(preset === null ? null : presetProblems(preset)).toEqual([
      { failure: { code: 'untitled-tab', detail: 'pc' }, path: [0, 1] },
    ]);
  });
  test('refuses a template with no tabs as a broken structure, which a builder draft holds', () => {
    // #given
    const draft: JsonObject = { v: 4, templates: [{ id: 'npc', title: 'NPC', tabs: [] }] };
    // #when
    const parsed = parsePresetFile(JSON.stringify(draft));
    const structure = parsePresetStructure(draft);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'invalid-structure' } });
    expect(structure).toBeNull();
  });
  test('refuses a field id on two tabs outside repeat sections, at the second one', () => {
    // #given
    const text = presetOf(
      tabbedSet([
        {
          title: 'Основное',
          sections: [{ rows: [{ cells: [TEXT_FIELD('name'), NUMBER_FIELD('str')] }] }],
        },
        {
          title: 'Бой',
          sections: [
            { rows: [{ cells: [NUMBER_FIELD('hp')] }] },
            { rows: [{ cells: [NUMBER_FIELD('str')] }] },
          ],
        },
      ]),
    );

    // #when
    const parsed = parsePresetFile(text);
    const preset = parsePresetStructure(JSON.parse(text));
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-id', detail: 'str' } });
    expect(preset === null ? null : presetProblems(preset)).toEqual([
      { failure: { code: 'duplicate-id', detail: 'str' }, path: [0, 1, 1, 0, 0] },
    ]);
  });
  test('accepts a formula on one tab that names a field on another', () => {
    // #given
    const text = presetOf(
      tabbedSet([
        {
          title: 'Основное',
          sections: [{ rows: [{ cells: [TEXT_FIELD('name'), NUMBER_FIELD('str')] }] }],
        },
        {
          title: 'Бой',
          sections: [{ rows: [{ cells: [{ kind: 'dice', formula: '1d20 + str' }] }] }],
        },
      ]),
    );

    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      const template = parsed.value.templates[0];
      expect(
        template === undefined
          ? null
          : resolveFieldReference(template, { tabIndex: 1, sectionIndex: 0, rowIndex: 0 }, 'str'),
      ).toEqual({ scope: 'sheet', rowId: 'name' });
    }
  });
});

describe('openTabIndex', () => {
  const layout: TemplateLayout = {
    tabs: [
      { title: 'A', sections: [] },
      { title: 'B', sections: [] },
    ],
  };

  test.each<[string, number | undefined, number]>([
    ['no choice', undefined, 0],
    ['a chosen tab the template has', 1, 1],
    ['a chosen tab past the last one', 2, 0],
    ['a negative choice', -1, 0],
  ])('opens the right tab for %s', (_name, chosen, expected) => {
    // #when
    const open = openTabIndex(layout, chosen);
    // #then
    expect(open).toBe(expected);
  });
});

describe('parsePresetFile with a window size', () => {
  test.each<[string, WindowSize]>([
    ['a common size', { width: 900, height: 700 }],
    ['the smallest size', { width: 480, height: 360 }],
    ['the largest size', { width: 1440, height: 1080 }],
  ])('accepts %s', (_name, window) => {
    // #given
    const text = JSON.stringify({ ...MINIMAL, window });
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: true, value: { ...MINIMAL, window } });
  });
  test.each<[string, JsonValue]>([
    ['a width below 480', { width: 479, height: 700 }],
    ['a width of 400, which fits no sidebar beside a sheet', { width: 400, height: 700 }],
    ['a width above 1440', { width: 1441, height: 700 }],
    ['a height below 360', { width: 900, height: 359 }],
    ['a height above 1080', { width: 900, height: 1081 }],
    ['a zero width', { width: 0, height: 700 }],
    ['a negative height', { width: 900, height: -700 }],
    ['an empty object', {}],
    ['a missing height', { width: 900 }],
    ['a missing width', { height: 700 }],
    ['a string width', { width: '900', height: 700 }],
    ['a fractional width', { width: 900.5, height: 700 }],
    ['an extra key', { width: 900, height: 700, resizable: true }],
    ['null', null],
    ['an array', [900, 700]],
  ])('refuses %s as a bad window', (_name, window) => {
    // #given
    const text = JSON.stringify({ ...MINIMAL, window });
    // #when
    const parsed = parsePresetFile(text);
    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'bad-window' } });
  });
  test('keeps the window size through encode and decode', () => {
    // #given
    const preset: Preset = { ...MINIMAL, window: { width: 900, height: 700 } };
    // #when
    const decoded = decodePreset(encodePreset(preset));
    // #then
    expect(decoded).toEqual({ ok: true, value: preset });
  });
});

describe('windowSizeOf', () => {
  test('is the size the preset sets', () => {
    // #when
    const size = windowSizeOf({ ...MINIMAL, window: { width: 900, height: 700 } });
    // #then
    expect(size).toEqual({ width: 900, height: 700 });
  });
  test.each<[string, Preset | null]>([
    ['a preset with no size', MINIMAL],
    ['no preset', null],
  ])('is 600 by 600 for %s', (_name, preset) => {
    // #when
    const size = windowSizeOf(preset);
    // #then
    expect(size).toEqual({ width: 600, height: 600 });
  });
  test('the default is the size the manifest opens the window at', () => {
    // #given
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    // #when
    const opened = { width: manifest.action.width, height: manifest.action.height };
    // #then
    expect(opened).toEqual(DEFAULT_WINDOW_SIZE);
  });
});

describe('templateById', () => {
  const PRESET: Preset = {
    v: 4,
    templates: [
      { id: 'pc', title: 'Персонажи', repeat: { nameField: 'name' }, tabs: [{ sections: [] }] },
      { id: 'npc', title: 'NPC', visibility: 'gm', tabs: [{ sections: [] }] },
    ],
  };

  test('finds a template by its id', () => {
    // #when
    const found = templateById(PRESET, 'npc');
    // #then
    expect(found).toEqual({
      id: 'npc',
      title: 'NPC',
      visibility: 'gm',
      tabs: [{ sections: [] }],
    });
  });
  test('is null for an id no template has', () => {
    // #when
    const found = templateById(PRESET, 'journal');
    // #then
    expect(found).toBeNull();
  });
});

describe('firstFieldId', () => {
  test('is the id of the first field, after any text cell', () => {
    // #when
    const id = firstFieldId({
      cells: [
        { kind: 'text', text: 'Сила' },
        { kind: 'field', type: 'number', id: 'str' },
        { kind: 'field', type: 'check', id: 'str_tired' },
      ],
    });

    // #then
    expect(id).toBe('str');
  });
  test('is null for a row with no field', () => {
    // #when
    const id = firstFieldId({
      cells: [
        { kind: 'text', text: 'Сила' },
        { kind: 'dice', formula: '1d20' },
      ],
    });

    // #then
    expect(id).toBeNull();
  });
});

describe('repeatSectionId', () => {
  test.each<[string, PresetSection, string | null]>([
    [
      'the first field of the first row with one',
      {
        repeat: { id: 'npc_name', nameField: 'npc_name' },
        rows: [
          { cells: [{ kind: 'text', text: 'Противник' }] },
          {
            cells: [
              { kind: 'field', type: 'text', id: 'npc_name' },
              { kind: 'field', type: 'number', id: 'hp' },
            ],
          },
          { cells: [{ kind: 'field', type: 'number', id: 'ac' }] },
        ],
      },
      'npc_name',
    ],
    [
      'null for a section that does not repeat',
      { rows: [{ cells: [{ kind: 'field', type: 'number', id: 'str' }] }] },
      null,
    ],
  ])('is %s', (_name, section, expected) => {
    // #when
    const id = repeatSectionId(section);
    // #then
    expect(id).toBe(expected);
  });
});

describe('plainRowIdOf', () => {
  const LAYOUT: TemplateLayout = {
    tabs: [
      {
        sections: [
          {
            rows: [
              {
                cells: [
                  { kind: 'field', type: 'number', id: 'level' },
                  { kind: 'field', type: 'number', id: 'bonus' },
                ],
              },
            ],
          },
          {
            repeat: { id: 'item', nameField: 'item' },
            rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item' }] }],
          },
        ],
      },
    ],
  };

  test.each<[string, string, string | null]>([
    ['the first field id of the row that holds a later field', 'bonus', 'level'],
    ['the id of a row named by its own first field', 'level', 'level'],
    ['null for a field of a repeat section', 'item', null],
    ['null for an id the layout does not hold', 'hp', null],
  ])('is %s', (_name, fieldId, expected) => {
    // #when
    const rowId = plainRowIdOf(LAYOUT, fieldId);
    // #then
    expect(rowId).toBe(expected);
  });
});

describe('resolveFieldReference', () => {
  // `bonus` sits in the attack repeat block and in the sheet's grid. `weight` only in another
  // repeat section. Sections: 0 grid, 1 attacks (repeat, two rows), 2 inventory (repeat), 3 a dice
  // row with no field.
  const LAYOUT: TemplateLayout = {
    tabs: [
      {
        sections: [
          {
            rows: [
              {
                cells: [
                  { kind: 'text', text: 'Сила' },
                  { kind: 'field', type: 'number', id: 'str' },
                ],
              },
              {
                cells: [
                  { kind: 'field', type: 'number', id: 'level' },
                  { kind: 'field', type: 'number', id: 'bonus' },
                ],
              },
            ],
          },
          {
            repeat: { id: 'attack', nameField: 'attack' },
            rows: [
              {
                cells: [
                  { kind: 'field', type: 'text', id: 'attack' },
                  { kind: 'field', type: 'number', id: 'bonus' },
                  { kind: 'dice', formula: '1d20+bonus+str' },
                ],
              },
              {
                cells: [
                  { kind: 'field', type: 'text', id: 'damage' },
                  { kind: 'dice', formula: '1d8+bonus' },
                ],
              },
            ],
          },
          {
            repeat: { id: 'item', nameField: 'item' },
            rows: [
              {
                cells: [
                  { kind: 'field', type: 'text', id: 'item' },
                  { kind: 'field', type: 'number', id: 'weight' },
                ],
              },
            ],
          },
          { rows: [{ cells: [{ kind: 'dice', formula: '1d20+str' }] }] },
        ],
      },
    ],
  };

  test.each<[string, number, number, string, ReturnType<typeof resolveFieldReference>]>([
    [
      'an id in the same repeat row over one elsewhere on the sheet',
      1,
      0,
      'bonus',
      { scope: 'block' },
    ],
    ['an id in another row of the same repeat block', 1, 1, 'bonus', { scope: 'block' }],
    ['the first field of the repeat block from its later row', 1, 1, 'attack', { scope: 'block' }],
    [
      'an id only in the non-repeat scope, from a repeat row',
      1,
      0,
      'str',
      { scope: 'sheet', rowId: 'str' },
    ],
    [
      'an id in another row of the sheet, named by that row',
      1,
      1,
      'level',
      { scope: 'sheet', rowId: 'level' },
    ],
    [
      'an id in the same plain row, named by that row',
      0,
      1,
      'bonus',
      { scope: 'sheet', rowId: 'level' },
    ],
    [
      'an id of another plain row, from a row with no field',
      3,
      0,
      'str',
      { scope: 'sheet', rowId: 'str' },
    ],
    ['an id only in another repeat section', 1, 0, 'weight', null],
    ['a repeat id from a plain row', 0, 0, 'attack', null],
    ['an id the template does not hold', 1, 0, 'hp', null],
    ['a sheet id from a section index past the template', 9, 0, 'str', null],
    ['a sheet id from a row index past a real section', 1, 2, 'str', null],
    ['a sheet id from a negative row index', 0, -1, 'str', null],
    ['a sheet id from a negative section index', -1, 0, 'str', null],
  ])('resolves %s', (_name, sectionIndex, rowIndex, id, expected) => {
    // #when
    const reference = resolveFieldReference(LAYOUT, { tabIndex: 0, sectionIndex, rowIndex }, id);
    // #then
    expect(reference).toEqual(expected);
  });
});

describe('encodePreset', () => {
  test('deflates and base64-encodes the preset JSON', () => {
    // #given
    const preset: Preset = JSON.parse(EXAMPLE_TEXT);
    // #when
    const data = encodePreset(preset);
    // #then
    expect(decodeIndependently(data)).toEqual(JSON.parse(EXAMPLE_TEXT));
  });
});

describe('encodePreset with a large preset', () => {
  test('encodes deflated data far above one base64 chunk and decodes back to the input', () => {
    // #given: random letters barely deflate. 1.5 M of them pass the spread argument limit of
    // V8 (about 125 K) and of Bun (about 1 M), not only one 0x8000-byte chunk.
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'notes',
          title: 'Заметки',
          tabs: [
            { sections: [{ rows: [{ cells: [{ kind: 'text', text: randomLabel(1500000) }] }] }] },
          ],
        },
      ],
    };

    // #when
    const data = encodePreset(preset);
    // #then
    expect(decodeIndependently(data)).toEqual({
      v: 4,
      templates: [
        {
          id: 'notes',
          title: 'Заметки',
          tabs: [
            { sections: [{ rows: [{ cells: [{ kind: 'text', text: randomLabel(1500000) }] }] }] },
          ],
        },
      ],
    });
  });
});

describe('decodePreset', () => {
  test('returns the preset that was encoded', () => {
    // #given
    const preset: Preset = JSON.parse(EXAMPLE_TEXT);
    // #when
    const decoded = decodePreset(encodePreset(preset));
    // #then
    expect(decoded).toEqual({ ok: true, value: JSON.parse(EXAMPLE_TEXT) });
  });
  test('refuses a stored preset of format 1 as an unsupported version', () => {
    // #given: the record data an older build stored, deflated and base64-encoded by hand.
    const stored = {
      v: 1,
      character: { tabs: [{ sections: [{ rows: [{ cells: [NUMBER_FIELD('str')] }] }] }] },
      npc: { tabs: [{ sections: [] }] },
    };

    const data = Buffer.from(deflateSync(strToU8(JSON.stringify(stored)))).toString('base64');
    // #when
    const decoded = decodePreset(data);
    // #then
    expect(decoded).toEqual({ ok: false, error: { code: 'unsupported-version' } });
  });
  test.each([
    ['text that is not base64', 'not base64!'],
    ['base64 of bytes that are not deflated', btoa('plain text')],
  ])('refuses %s as an invalid structure', (_name, data) => {
    // #when
    const decoded = decodePreset(data);
    // #then
    expect(decoded).toEqual({ ok: false, error: { code: 'invalid-structure' } });
  });
});

describe('formatPresetFile', () => {
  test('writes the structure at the current v with a two-space indent', () => {
    // #given
    const preset: Preset = JSON.parse(EXAMPLE_TEXT);
    // #when
    const lines = formatPresetFile(preset).split('\n');
    // #then
    expect(lines.slice(0, 4)).toEqual(['{', '  "v": 4,', '  "templates": [', '    {']);
  });
  test('writes the window size after v and before the templates', () => {
    // #given
    const preset: Preset = { ...MINIMAL, window: { width: 900, height: 700 } };
    // #when
    const lines = formatPresetFile(preset).split('\n');
    // #then
    expect(lines.slice(0, 7)).toEqual([
      '{',
      '  "v": 4,',
      '  "window": {',
      '    "width": 900,',
      '    "height": 700',
      '  },',
      '  "templates": [',
    ]);
  });
  test('gives back the same structure when the downloaded file is uploaded again', () => {
    // #given
    const uploaded = parsePresetFile(EXAMPLE_TEXT);

    if (!uploaded.ok) {
      throw new Error('the example preset must parse');
    }

    // #when
    const reuploaded = parsePresetFile(formatPresetFile(uploaded.value));
    // #then
    expect(reuploaded).toEqual({ ok: true, value: JSON.parse(EXAMPLE_TEXT) });
  });
});

function randomLabel(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let state = 5;

  return Array.from({ length }, () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;

    return alphabet[(state >>> 16) % 64] ?? 'x';
  }).join('');
}

describe('the e2e preset fixtures', () => {
  test('are the two game systems the e2e tests load', () => {
    // #when
    const names = new Set(readdirSync(FIXTURE_DIR));
    // #then
    expect(names).toEqual(new Set(['d20.json', 'd6-pool.json']));
  });

  for (const name of readdirSync(FIXTURE_DIR)) {
    test(`${name} parses into the preset it holds`, () => {
      // #given
      const text = readFileSync(join(FIXTURE_DIR, name), 'utf8');
      // #when
      const parsed = parsePresetFile(text);
      // #then
      expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
    });
  }
});

describe('the preset files in presets/', () => {
  const names = readdirSync(PRESET_DIR).filter((name) => name.endsWith('.json'));
  test('include the Cairn 2e preset', () => {
    // #then
    expect(names).toContain('cairn-2e.json');
  });
  test('the Cairn controls have the specified accessible labels and no id or «из» fallback', () => {
    // #given
    const text = readFileSync(join(PRESET_DIR, 'cairn-2e.json'), 'utf8');
    const parsed = parsePresetFile(text);

    if (!parsed.ok) {
      throw new Error('the Cairn preset must parse');
    }

    // #when
    const labels = new Map<string, string>();
    const badFallbacks: string[] = [];

    for (const template of parsed.value.templates) {
      for (const section of layoutSections(template)) {
        for (const row of section.rows) {
          row.cells.forEach((cell, index) => {
            if (cell.kind === 'text' || cell.kind === 'token') {
              return;
            }

            const key = `${template.id}:${cell.kind === 'field' ? cell.id : cell.formula}`;
            const label = cellLabel(cell, row.cells.slice(0, index));
            labels.set(key, label);

            if (label === (cell.kind === 'field' ? cell.id : cell.formula) || label === 'из') {
              badFallbacks.push(key);
            }
          });
        }
      }
    }

    // #then
    expect({
      named: Object.fromEntries(
        [
          'pc:weapon',
          'pc:str_max',
          'pc:dex_max',
          'pc:wil_max',
          'pc:hp_max',
          'npc:npc_name',
          'npc:hp_max',
          'npc:attack_1',
          'npc:attack_1_die',
          'npc:1d(attack_1_die)',
          'npc:attack_2',
          'npc:attack_2_die',
          'npc:1d(attack_2_die)',
        ].map((key) => [key, labels.get(key)]),
      ),
      badFallbacks,
    }).toEqual({
      named: {
        'pc:weapon': 'Оружие',
        'pc:str_max': 'STR, максимум',
        'pc:dex_max': 'DEX, максимум',
        'pc:wil_max': 'WIL, максимум',
        'pc:hp_max': 'HP, максимум',
        'npc:npc_name': 'Имя NPC',
        'npc:hp_max': 'HP, максимум',
        'npc:attack_1': 'Атака 1',
        'npc:attack_1_die': 'Урон атаки 1',
        'npc:1d(attack_1_die)': 'Урон атаки 1',
        'npc:attack_2': 'Атака 2',
        'npc:attack_2_die': 'Урон атаки 2',
        'npc:1d(attack_2_die)': 'Урон атаки 2',
      },
      badFallbacks: [],
    });
  });

  for (const name of names) {
    test(`${name} parses into the preset it holds`, () => {
      // #given
      const text = readFileSync(join(PRESET_DIR, name), 'utf8');
      // #when
      const parsed = parsePresetFile(text);
      // #then
      expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
    });
    // The parse accepts any valid id in a formula, so a misspelt one shows only when it is rolled.
    test(`${name} names in each formula only fields its dice cell can read`, () => {
      // #given
      const preset = structureOf(readFileSync(join(PRESET_DIR, name), 'utf8'));
      // #when
      const unresolved: string[] = [];

      for (const template of preset.templates) {
        placedSections(template).forEach(({ place, section }) => {
          section.rows.forEach((row, rowIndex) => {
            for (const cell of row.cells) {
              const tree = cell.kind === 'dice' ? parseFormula(cell.formula) : null;

              if (tree === null || !tree.ok) {
                continue;
              }

              for (const id of formulaFieldIds(tree.value)) {
                if (resolveFieldReference(template, { ...place, rowIndex }, id) === null) {
                  unresolved.push(`${template.id}: ${id}`);
                }
              }
            }
          });
        });
      }

      // #then
      expect(unresolved).toEqual([]);
    });
  }
});

type FormulaDiceField = {
  kind: 'dice-field';
  count: number;
  id: string;
};

function formulaFieldIds(tree: FormulaTree | FormulaDiceField): string[] {
  switch (tree.kind) {
    case 'field':
    case 'dice-field':
      return [tree.id];
    case 'call':
      return formulaFieldIds(tree.argument);
    case 'binary':
    case 'comparison':
      return [...formulaFieldIds(tree.left), ...formulaFieldIds(tree.right)];
    default:
      return [];
  }
}

describe('formulaFieldIds test helper', () => {
  test('includes a dice-choice slot and excludes a literal die', () => {
    // #when
    const ids = [
      formulaFieldIds({ kind: 'dice-field', count: 1, id: 'weapon_die' }),
      formulaFieldIds({ kind: 'dice', count: 1, sides: 8 }),
    ];

    // #then
    expect(ids).toEqual([['weapon_die'], []]);
  });
});

// A preset that passes the structure check, for the rule checks alone.
function structureOf(text: string): Preset {
  const preset = parsePresetStructure(z.json().parse(JSON.parse(text)));

  if (preset === null) {
    throw new Error('The test preset fails the structure check');
  }

  return preset;
}

describe('presetProblems', () => {
  test('is empty for a preset the upload accepts', () => {
    // #when
    const problems = presetProblems(structureOf(EXAMPLE_TEXT));
    // #then
    expect(problems).toEqual([]);
  });
  test('points dice-choice option and formula type failures at their owning cells', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'notes',
          title: 'Заметки',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        {
                          kind: 'field',
                          type: 'dice-choice',
                          id: 'weapon_die',
                          options: ['d8', '8'],
                        },
                        { kind: 'dice', formula: '1d20 + weapon_die' },
                      ],
                    },
                    {
                      cells: [
                        { kind: 'field', type: 'number', id: 'bonus' },
                        { kind: 'dice', formula: '1d(bonus)' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // #when
    const problems = presetProblems(preset);
    const actual: unknown = problems;
    // #then
    expect(actual).toEqual([
      {
        failure: { code: 'bad-die-option', detail: '8', field: 'weapon_die' },
        path: [0, 0, 0, 0, 0],
      },
      {
        failure: {
          code: 'die-field-as-number',
          detail: '1d20 + weapon_die',
          field: 'weapon_die',
        },
        path: [0, 0, 0, 0, 1],
      },
      {
        failure: { code: 'field-not-die', detail: '1d(bonus)', field: 'bonus' },
        path: [0, 0, 0, 1, 1],
      },
    ]);
  });
  test('lists every problem with the path of its item, in the order the upload checks', () => {
    // #given
    const text = presetOf(
      setOf('pc', [
        {
          columns: 1,
          rows: [
            { cells: [NUMBER_FIELD('hp'), NUMBER_FIELD('d20')] },
            { cells: [{ kind: 'dice', formula: '1d20+' }] },
          ],
        },
        {
          repeat: { id: 'd20', nameField: 'name' },
          rows: [{ cells: [LABEL, TEXT_FIELD('name')] }],
        },
      ]),
      setOf('pc', [{ rows: [{ cells: [NUMBER_FIELD('name')] }] }], 'nope'),
      singleOf('1bad', [
        { repeat: { id: 'item', nameField: 'item' }, rows: [{ cells: [TEXT_FIELD('item')] }] },
        {
          repeat: { id: 'item', nameField: 'item' },
          rows: [{ cells: [TEXT_FIELD('item'), NUMBER_FIELD('item')] }],
        },
      ]),
    );

    // #when
    const problems = presetProblems(structureOf(text));
    // #then
    expect(problems).toEqual([
      { failure: { code: 'row-too-wide' }, path: [0, 0, 1, 0] },
      { failure: { code: 'invalid-id', detail: 'd20' }, path: [0, 0, 1, 0, 1] },
      { failure: { code: 'bad-formula', detail: '1d20+' }, path: [0, 0, 1, 1, 0] },
      { failure: { code: 'bad-repeat' }, path: [0, 0, 2] },
      { failure: { code: 'duplicate-template', detail: 'pc' }, path: [1] },
      { failure: { code: 'duplicate-id', detail: 'name' }, path: [1, 0, 1, 0, 0] },
      { failure: { code: 'bad-name-field', detail: 'pc', field: 'nope' }, path: [1] },
      { failure: { code: 'invalid-template-id', detail: '1bad' }, path: [2] },
      { failure: { code: 'duplicate-section', detail: 'item' }, path: [2, 0, 1] },
      { failure: { code: 'duplicate-id', detail: 'item' }, path: [2, 0, 1, 0, 1] },
    ]);
  });
  test('starts with the failure the upload refuses the file for', () => {
    // #given
    const text = presetOf(
      singleOf('notes', [
        { rows: [{ cells: [{ kind: 'dice', formula: '(' }] }, { cells: [NUMBER_FIELD('d6')] }] },
      ]),
    );

    // #when
    const problems = presetProblems(structureOf(text));
    const parsed = parsePresetFile(text);
    // #then
    expect(problems.length).toBeGreaterThan(1);
    expect(parsed.ok ? null : parsed.error).toEqual(problems[0]?.failure ?? null);
  });
  test.each<[string, string[], SelectFailure]>([
    ['no options', [], { code: 'no-options', field: 'armor' }],
    ['a blank option', ['Кожаная', ' '], { code: 'blank-option', field: 'armor' }],
    [
      'a repeated option',
      ['Кожаная', 'Кольчуга', 'Кожаная'],
      { code: 'duplicate-option', detail: 'Кожаная', field: 'armor' },
    ],
  ])('points %s at the select field cell', (_name, options, failure) => {
    // #given
    const preset = presetWithSelect(options);
    // #when
    const problems = presetProblems(preset);
    const actual: unknown = problems;
    // #then
    expect(actual).toEqual([{ failure, path: [0, 0, 0, 0, 0] }]);
  });
});

describe('parsePresetStructure', () => {
  test('keeps a preset with no templates and a window out of range', () => {
    // #given
    const draft: Preset = { v: 4, window: { width: 200, height: 2000 }, templates: [] };
    // #when
    const preset = parsePresetStructure(draft);
    // #then
    expect(preset).toEqual(draft);
  });
  test.each<[string, JsonValue]>([
    ['an unknown key', { v: 4, templates: [], extra: 1 }],
    ['another version', { v: 1, templates: [] }],
    ['a window of fractions', { v: 4, window: { width: 600.5, height: 600 }, templates: [] }],
    [
      'a cell of no kind',
      { v: 4, templates: [singleOf('a', [{ rows: [{ cells: [{ text: 'x' }] }] }])] },
    ],
  ])('is null for %s', (_name, candidate) => {
    // #when
    const preset = parsePresetStructure(candidate);
    // #then
    expect(preset).toBeNull();
  });
});
