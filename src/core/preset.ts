import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';

import { isFieldId } from '@/core/field-id';
import { FORMAT_VERSION } from '@/core/format-version';
import { parseFormula } from '@/core/formula';
import { err, ok, type Result } from '@/core/result';

// Refused before parsing, so a huge file cannot hang the window.
export const PRESET_FILE_BYTE_LIMIT = 1024 * 1024;

// Keeps String.fromCharCode under the engine's argument limit.
const BASE64_CHUNK_BYTES = 0x8000;

const encoder = new TextEncoder();

const textCellSchema = z.strictObject({ kind: z.literal('text'), text: z.string() });

const fieldCellSchema = z.strictObject({
  kind: z.literal('field'),
  type: z.enum(['text', 'number', 'check']),
  id: z.string(),
});

const diceCellSchema = z.strictObject({ kind: z.literal('dice'), formula: z.string() });

const cellSchema = z.discriminatedUnion('kind', [textCellSchema, fieldCellSchema, diceCellSchema]);

const sectionSchema = z.strictObject({
  title: z.string().optional(),
  width: z.enum(['1/3', '1/2', 'full']).optional(),
  columns: z.number().int().positive().optional(),
  repeat: z.literal(true).optional(),
  rows: z.array(z.array(cellSchema)),
});

const templateSchema = z.strictObject({ sections: z.array(sectionSchema) });

const presetSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  character: templateSchema,
  npc: templateSchema,
});

const fileObjectSchema = z.looseObject({ v: z.unknown().optional() });

const versionSchema = z.number();

// The message under the upload button shows at most this much of an id or formula.
const DETAIL_MAX_CHARACTERS = 40;

export type Preset = z.infer<typeof presetSchema>;

export type PresetTemplate = z.infer<typeof templateSchema>;

export type PresetSection = z.infer<typeof sectionSchema>;

export type PresetCell = z.infer<typeof cellSchema>;

export type PresetFieldCell = z.infer<typeof fieldCellSchema>;

export type PresetFailure =
  | { code: 'too-large' }
  | { code: 'not-json' }
  | { code: 'newer-version' }
  | { code: 'unsupported-version' }
  | { code: 'invalid-structure' }
  | { code: 'invalid-id'; detail: string }
  | { code: 'duplicate-id'; detail: string }
  | { code: 'bad-repeat' }
  | { code: 'duplicate-section'; detail: string }
  | { code: 'row-too-wide' }
  | { code: 'bad-formula'; detail: string };

// Check order: size, JSON, `v`, structure, then rules. `v` comes before the structure, because a
// newer file may have a shape this build does not know.
export function parsePresetFile(text: string): Result<Preset, PresetFailure> {
  if (encoder.encode(text).length > PRESET_FILE_BYTE_LIMIT) {
    return err({ code: 'too-large' });
  }

  let candidate: ReturnType<typeof JSON.parse>;

  try {
    candidate = JSON.parse(text);
  } catch {
    return err({ code: 'not-json' });
  }

  const file = fileObjectSchema.safeParse(candidate);

  if (!file.success) {
    return err({ code: 'invalid-structure' });
  }

  const version = versionSchema.safeParse(file.data.v);

  // A version is an integer. `Number.isInteger` also holds above the safe range, so `1e16` is newer.
  if (!version.success || !Number.isInteger(version.data)) {
    return err({ code: 'unsupported-version' });
  }

  if (version.data > FORMAT_VERSION) {
    return err({ code: 'newer-version' });
  }

  // No migration exists yet, so a lower `v` is refused. The first format change adds the registry.
  if (version.data < FORMAT_VERSION) {
    return err({ code: 'unsupported-version' });
  }

  const preset = presetSchema.safeParse(candidate);

  if (!preset.success) {
    return err({ code: 'invalid-structure' });
  }

  const failure = templateFailure(preset.data.character) ?? templateFailure(preset.data.npc);

  return failure === null ? ok(preset.data) : err(failure);
}

// The `preset` record data: the preset JSON, deflated and base64-encoded.
export function encodePreset(preset: Preset): string {
  return toBase64(deflateSync(strToU8(JSON.stringify(preset))));
}

export function decodePreset(data: string): Result<Preset, PresetFailure> {
  let text: string;

  try {
    text = strFromU8(inflateSync(fromBase64(data)));
  } catch {
    return err({ code: 'invalid-structure' });
  }

  return parsePresetFile(text);
}

// The downloaded file: structure only, at the current `v`.
export function formatPresetFile(preset: Preset): string {
  const file: Preset = { v: FORMAT_VERSION, character: preset.character, npc: preset.npc };

  return JSON.stringify(file, null, 2);
}

// The id of a row's first field. It names the row's `row:` record, and for a repeat row the
// section's `rep:` records. A row with no field has no record.
export function firstFieldId(row: readonly PresetCell[]): string | null {
  for (const cell of row) {
    if (cell.kind === 'field') {
      return cell.id;
    }
  }

  return null;
}

// All non-repeat fields of one template are one scope, and each repeat row is its own.
function templateFailure(template: PresetTemplate): PresetFailure | null {
  const templateScope = new Set<string>();
  const sectionIds = new Set<string>();

  for (const section of template.sections) {
    const failure =
      section.repeat === true
        ? repeatSectionFailure(section, sectionIds)
        : rowsFailure(section, templateScope);

    if (failure !== null) {
      return failure;
    }
  }

  return null;
}

function repeatSectionFailure(
  section: PresetSection,
  sectionIds: Set<string>,
): PresetFailure | null {
  const [row, ...others] = section.rows;
  const sectionId = row === undefined ? null : firstFieldId(row);

  if (row === undefined || others.length > 0 || sectionId === null) {
    return { code: 'bad-repeat' };
  }

  const failure = rowFailure(section, row, new Set());

  if (failure !== null) {
    return failure;
  }

  if (sectionIds.has(sectionId)) {
    return { code: 'duplicate-section', detail: shortDetail(sectionId) };
  }

  sectionIds.add(sectionId);

  return null;
}

function rowsFailure(section: PresetSection, scope: Set<string>): PresetFailure | null {
  for (const row of section.rows) {
    const failure = rowFailure(section, row, scope);

    if (failure !== null) {
      return failure;
    }
  }

  return null;
}

// A row shorter than `columns` is fine: the trailing grid cells stay empty.
function rowFailure(
  section: PresetSection,
  row: readonly PresetCell[],
  scope: Set<string>,
): PresetFailure | null {
  if (section.columns !== undefined && row.length > section.columns) {
    return { code: 'row-too-wide' };
  }

  for (const cell of row) {
    const failure = cellFailure(cell, scope);

    if (failure !== null) {
      return failure;
    }
  }

  return null;
}

// A formula may name any valid id. An id absent from the sheet is a roll-time error.
function cellFailure(cell: PresetCell, scope: Set<string>): PresetFailure | null {
  if (cell.kind === 'text') {
    return null;
  }

  if (cell.kind === 'dice') {
    return parseFormula(cell.formula).ok
      ? null
      : { code: 'bad-formula', detail: shortDetail(cell.formula) };
  }

  if (!isFieldId(cell.id)) {
    return { code: 'invalid-id', detail: shortDetail(cell.id) };
  }

  if (scope.has(cell.id)) {
    return { code: 'duplicate-id', detail: shortDetail(cell.id) };
  }

  scope.add(cell.id);

  return null;
}

function shortDetail(text: string): string {
  const characters = Array.from(text);

  return characters.length > DETAIL_MAX_CHARACTERS
    ? `${characters.slice(0, DETAIL_MAX_CHARACTERS).join('')}…`
    : text;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_BYTES));
  }

  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}
