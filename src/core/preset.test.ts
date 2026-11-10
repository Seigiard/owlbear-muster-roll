import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { inflateSync, strFromU8 } from 'fflate';
import { z } from 'zod';

import type { JsonObject, JsonValue } from '@/core/json';

import {
  decodePreset,
  encodePreset,
  firstFieldId,
  formatPresetFile,
  parsePresetFile,
  resolveFieldReference,
  type Preset,
  type PresetTemplate,
} from './preset';

const EXAMPLE_PATH = join(import.meta.dir, '../../docs/example-preset.json');

const EXAMPLE_TEXT = readFileSync(EXAMPLE_PATH, 'utf8');

const NUMBER_FIELD = (id: string): JsonObject => ({ kind: 'field', type: 'number', id });

const LABEL: JsonObject = { kind: 'text', text: 'Сила' };

const MINIMAL: Preset = {
  v: 1,
  character: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] },
  npc: { sections: [] },
};

function fileOf(character: JsonValue[], npc: JsonValue[] = []): string {
  return JSON.stringify({ v: 1, character: { sections: character }, npc: { sections: npc } });
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

  test('accepts every cell kind, columns, repeat and every width', () => {
    // #given
    const text = fileOf([
      {
        title: 'Характеристики',
        width: '1/3',
        columns: 3,
        rows: [[LABEL, NUMBER_FIELD('str'), { kind: 'dice', formula: '1d20 <= str' }]],
      },
      { width: '1/2', rows: [[{ kind: 'field', type: 'check', id: 'tired' }]] },
      { width: 'full', repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'item' }]] },
    ]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed).toEqual({ ok: true, value: JSON.parse(text) });
  });

  test('accepts one id in the character and the NPC template', () => {
    // #given
    const text = fileOf([{ rows: [[NUMBER_FIELD('hp')]] }], [{ rows: [[NUMBER_FIELD('hp')]] }]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed.ok).toBe(true);
  });

  test('accepts one id in a repeat row and outside it', () => {
    // #given
    const text = fileOf([
      { rows: [[NUMBER_FIELD('bonus')]] },
      { repeat: true, rows: [[NUMBER_FIELD('attack'), NUMBER_FIELD('bonus')]] },
      { repeat: true, rows: [[NUMBER_FIELD('spell'), NUMBER_FIELD('bonus')]] },
    ]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed.ok).toBe(true);
  });

  test('accepts a columns row with fewer cells than the grid', () => {
    // #given
    const text = fileOf([{ columns: 4, rows: [[LABEL, NUMBER_FIELD('str')], []] }]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed.ok).toBe(true);
  });

  test.each<[string, string]>([
    ['not JSON', '{"v": 1,'],
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
    ['an integer above the current one', 2],
    ['a much higher integer', 99],
    ['above the largest safe integer', 1e16],
  ])('refuses a file whose v is %s as newer', (_name, v) => {
    // #given: a newer file may have any shape.
    const text = JSON.stringify({ v, something: 'unknown' });

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'newer-version' } });
  });

  test.each<[string, JsonValue | undefined]>([
    ['absent', undefined],
    ['lower', 0],
    ['a fraction below the current one', 0.5],
    ['a fraction above the current one', 1.5],
    ['a string', '1'],
    ['null', null],
  ])('refuses a file whose v is %s as an unsupported version', (_name, v) => {
    // #given
    const text = JSON.stringify({ ...MINIMAL, v });

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'unsupported-version' } });
  });

  test.each<[string, JsonValue]>([
    ['an array', [MINIMAL]],
    ['a number', 1],
    ['an unknown top-level key', { ...MINIMAL, extra: true }],
    ['a missing template', { v: 1, character: MINIMAL.character }],
    ['an unknown section key', JSON.parse(fileOf([{ rows: [], hidden: true }]))],
    ['an unknown cell key', JSON.parse(fileOf([{ rows: [[{ ...LABEL, size: 2 }]] }]))],
    ['an unknown cell kind', JSON.parse(fileOf([{ rows: [[{ kind: 'image', src: 'x' }]] }]))],
    [
      'an unknown field type',
      JSON.parse(fileOf([{ rows: [[{ kind: 'field', type: 'date', id: 'born' }]] }])),
    ],
    ['an unknown width', JSON.parse(fileOf([{ width: '1/4', rows: [] }]))],
    ['a zero columns', JSON.parse(fileOf([{ columns: 0, rows: [] }]))],
    ['a fractional columns', JSON.parse(fileOf([{ columns: 1.5, rows: [] }]))],
    ['a repeat that is false', JSON.parse(fileOf([{ repeat: false, rows: [] }]))],
    ['a field without an id', JSON.parse(fileOf([{ rows: [[{ kind: 'field', type: 'text' }]] }]))],
  ])('refuses %s as an invalid structure', (_name, file) => {
    // #when
    const parsed = parsePresetFile(JSON.stringify(file));

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'invalid-structure' } });
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
    const text = fileOf([{ rows: [[NUMBER_FIELD(id)]] }]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'invalid-id', detail: id } });
  });

  test.each(['_hidden', 'dex', 'd20x', 'Floor', 'str_2'])('accepts the field id %j', (id) => {
    // #given
    const text = fileOf([{ rows: [[NUMBER_FIELD(id)]] }]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed.ok).toBe(true);
  });

  test.each<[string, JsonValue[], string]>([
    ['one row', [{ rows: [[NUMBER_FIELD('str'), NUMBER_FIELD('str')]] }], 'str'],
    ['two rows of one section', [{ rows: [[NUMBER_FIELD('str')], [NUMBER_FIELD('str')]] }], 'str'],
    ['two sections', [{ rows: [[NUMBER_FIELD('str')]] }, { rows: [[NUMBER_FIELD('str')]] }], 'str'],
    [
      'one repeat row',
      [{ repeat: true, rows: [[NUMBER_FIELD('item'), NUMBER_FIELD('item')]] }],
      'item',
    ],
  ])('refuses an id twice in %s', (_name, sections, id) => {
    // #when
    const parsed = parsePresetFile(fileOf(sections));

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-id', detail: id } });
  });

  test('refuses an id twice in one scope of the NPC template', () => {
    // #given
    const text = fileOf([], [{ rows: [[NUMBER_FIELD('hp'), NUMBER_FIELD('hp')]] }]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-id', detail: 'hp' } });
  });

  test.each<[string, JsonValue]>([
    ['no row', { repeat: true, rows: [] }],
    ['two rows', { repeat: true, rows: [[NUMBER_FIELD('a')], [NUMBER_FIELD('b')]] }],
    ['a row with no field', { repeat: true, rows: [[LABEL, { kind: 'dice', formula: '1d6' }]] }],
  ])('refuses a repeat section with %s', (_name, section) => {
    // #when
    const parsed = parsePresetFile(fileOf([section]));

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'bad-repeat' } });
  });

  test('refuses two repeat sections of one template that start with one id', () => {
    // #given
    const text = fileOf([
      { repeat: true, rows: [[LABEL, NUMBER_FIELD('item'), NUMBER_FIELD('weight')]] },
      { repeat: true, rows: [[NUMBER_FIELD('item')]] },
    ]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'duplicate-section', detail: 'item' } });
  });

  test('refuses a columns row with more cells than the grid', () => {
    // #given
    const text = fileOf([{ columns: 2, rows: [[LABEL], [LABEL, NUMBER_FIELD('str'), LABEL]] }]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed).toEqual({ ok: false, error: { code: 'row-too-wide' } });
  });

  test.each(['1d20 <', 'sqrt(str)', '0d6', '101d6', '1d0', '1d1001', 'a < b < c', '(a < b)'])(
    'refuses the formula %j',
    (formula) => {
      // #given
      const text = fileOf([{ rows: [[{ kind: 'dice', formula }]] }]);

      // #when
      const parsed = parsePresetFile(text);

      // #then
      expect(parsed).toEqual({ ok: false, error: { code: 'bad-formula', detail: formula } });
    },
  );

  test('refuses a formula over 200 characters and shortens it in the detail', () => {
    // #given: 201 characters, valid in every other way.
    const text = fileOf([{ rows: [[{ kind: 'dice', formula: `str+${' '.repeat(196)}1` }]] }]);

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
    const text = fileOf([{ rows: [[NUMBER_FIELD(id), NUMBER_FIELD(id)]] }]);

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
    const text = fileOf([{ rows: [[{ kind: 'dice', formula: '1d20 <= missing' }]] }]);

    // #when
    const parsed = parsePresetFile(text);

    // #then
    expect(parsed.ok).toBe(true);
  });
});

describe('firstFieldId', () => {
  test('is the id of the first field, after any text cell', () => {
    // #when
    const id = firstFieldId([
      { kind: 'text', text: 'Сила' },
      { kind: 'field', type: 'number', id: 'str' },
      { kind: 'field', type: 'check', id: 'str_tired' },
    ]);

    // #then
    expect(id).toBe('str');
  });

  test('is null for a row with no field', () => {
    // #when
    const id = firstFieldId([
      { kind: 'text', text: 'Сила' },
      { kind: 'dice', formula: '1d20' },
    ]);

    // #then
    expect(id).toBeNull();
  });
});

describe('resolveFieldReference', () => {
  // `bonus` sits in the attack row and in the sheet's grid. `weight` only in another repeat section.
  // Sections: 0 grid, 1 attacks (repeat), 2 inventory (repeat), 3 a dice row with no field.
  const TEMPLATE: PresetTemplate = {
    sections: [
      {
        rows: [
          [
            { kind: 'text', text: 'Сила' },
            { kind: 'field', type: 'number', id: 'str' },
          ],
          [
            { kind: 'field', type: 'number', id: 'level' },
            { kind: 'field', type: 'number', id: 'bonus' },
          ],
        ],
      },
      {
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'attack' },
            { kind: 'field', type: 'number', id: 'bonus' },
            { kind: 'dice', formula: '1d20+bonus+str' },
          ],
        ],
      },
      {
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'item' },
            { kind: 'field', type: 'number', id: 'weight' },
          ],
        ],
      },
      { rows: [[{ kind: 'dice', formula: '1d20+str' }]] },
    ],
  };

  test.each<
    [string, PresetTemplate, number, number, string, ReturnType<typeof resolveFieldReference>]
  >([
    [
      'an id in the same repeat row over one elsewhere on the sheet',
      TEMPLATE,
      1,
      0,
      'bonus',
      { scope: 'row' },
    ],
    [
      'an id only in the non-repeat scope, from a repeat row',
      TEMPLATE,
      1,
      0,
      'str',
      { scope: 'sheet', rowId: 'str' },
    ],
    [
      'an id in another row of the sheet, named by that row',
      TEMPLATE,
      1,
      0,
      'level',
      { scope: 'sheet', rowId: 'level' },
    ],
    ['an id in the same plain row', TEMPLATE, 0, 1, 'bonus', { scope: 'row' }],
    [
      'an id of another plain row, from a row with no field',
      TEMPLATE,
      3,
      0,
      'str',
      { scope: 'sheet', rowId: 'str' },
    ],
    ['an id only in another repeat section', TEMPLATE, 1, 0, 'weight', null],
    ['a repeat id from a plain row', TEMPLATE, 0, 0, 'attack', null],
    ['an id the template does not hold', TEMPLATE, 1, 0, 'hp', null],
    ['a sheet id from a section index past the template', TEMPLATE, 9, 0, 'str', null],
    ['a sheet id from a row index past a real section', TEMPLATE, 1, 1, 'str', null],
    ['a sheet id from a negative row index', TEMPLATE, 0, -1, 'str', null],
    ['a sheet id from a negative section index', TEMPLATE, -1, 0, 'str', null],
  ])('resolves %s', (_name, template, sectionIndex, rowIndex, id, expected) => {
    // #when
    const reference = resolveFieldReference(template, { sectionIndex, rowIndex }, id);

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
      v: 1,
      character: { sections: [{ rows: [[{ kind: 'text', text: randomLabel(1_500_000) }]] }] },
      npc: { sections: [] },
    };

    // #when
    const data = encodePreset(preset);

    // #then
    expect(decodeIndependently(data)).toEqual({
      v: 1,
      character: { sections: [{ rows: [[{ kind: 'text', text: randomLabel(1_500_000) }]] }] },
      npc: { sections: [] },
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
    expect(lines.slice(0, 3)).toEqual(['{', '  "v": 1,', '  "character": {']);
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
