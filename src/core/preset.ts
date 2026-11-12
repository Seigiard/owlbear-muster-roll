import { z } from 'zod';

import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';
import { isFieldId, isTemplateId } from '@/core/field-id';
import { FORMAT_VERSION } from '@/core/format-version';
import { parseFormula, type FormulaExpression, type FormulaTree } from '@/core/formula';
import type { JsonValue } from '@/core/json';
import { err, ok, type Result } from '@/core/result';

// Refused before parsing, so a huge file cannot hang the window.
export const PRESET_FILE_BYTE_LIMIT = 1024 * 1024;

const encoder = new TextEncoder();

const textCellSchema = z.strictObject({ kind: z.literal('text'), text: z.string() });

export const CELL_NAME_MAX_CHARACTERS = 60;

const cellName = { name: z.string().optional() };

// Shared by option-list field types, so a later list-backed type can use the same shape and rules.
const fieldOptions = { options: z.array(z.string()) };

const fieldCellSchema = z.discriminatedUnion('type', [
  z.strictObject({
    kind: z.literal('field'),
    type: z.literal('text'),
    id: z.string(),
    ...cellName,
  }),
  z.strictObject({
    kind: z.literal('field'),
    type: z.literal('number'),
    id: z.string(),
    ...cellName,
  }),
  z.strictObject({
    kind: z.literal('field'),
    type: z.literal('check'),
    id: z.string(),
    ...cellName,
  }),
  z.strictObject({
    kind: z.literal('field'),
    type: z.literal('select'),
    id: z.string(),
    ...cellName,
    ...fieldOptions,
  }),
  z.strictObject({
    kind: z.literal('field'),
    type: z.literal('dice-choice'),
    id: z.string(),
    ...cellName,
    ...fieldOptions,
  }),
]);

const diceCellSchema = z.strictObject({
  kind: z.literal('dice'),
  formula: z.string(),
  ...cellName,
});

const cellSchema = z.discriminatedUnion('kind', [textCellSchema, fieldCellSchema, diceCellSchema]);

// A section links its repeat blocks to tokens only when it repeats.
const sectionSchema = z
  .strictObject({
    title: z.string().optional(),
    width: z.enum(['1/3', '1/2', 'full']).optional(),
    columns: z.number().int().positive().optional(),
    repeat: z.literal(true).optional(),
    tokens: z.literal(true).optional(),
    rows: z.array(z.array(cellSchema)),
  })
  .refine((section) => section.tokens === undefined || section.repeat === true);

const visibilitySchema = z.enum(['all', 'gm']).optional();

const sheetSetTemplateSchema = z.strictObject({
  id: z.string(),
  kind: z.literal('set'),
  title: z.string(),
  nameField: z.string(),
  visibility: visibilitySchema,
  tokens: z.literal(true).optional(),
  sections: z.array(sectionSchema),
});

const singleSheetTemplateSchema = z.strictObject({
  id: z.string(),
  kind: z.literal('single'),
  title: z.string(),
  visibility: visibilitySchema,
  players: z.literal('edit').optional(),
  tokens: z.literal(true).optional(),
  sections: z.array(sectionSchema),
});

const templateSchema = z.discriminatedUnion('kind', [
  sheetSetTemplateSchema,
  singleSheetTemplateSchema,
]);

// TASK-33: the action window size a preset may set, in px, inclusive. The lower bound keeps the
// narrowest sheet layout usable; the upper bound keeps the window on a laptop screen.
export const WINDOW_SIZE_LIMITS = {
  width: { min: 360, max: 1440 },
  height: { min: 360, max: 1080 },
} as const;

const windowSchema = z.strictObject({
  width: z.number().int().min(WINDOW_SIZE_LIMITS.width.min).max(WINDOW_SIZE_LIMITS.width.max),
  height: z.number().int().min(WINDOW_SIZE_LIMITS.height.min).max(WINDOW_SIZE_LIMITS.height.max),
});

const presetSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  window: windowSchema.optional(),
  templates: z.array(templateSchema).min(1),
});

// The builder's draft (AD-21): the preset structure, where a window out of range and no templates
// are rule problems the builder shows, not a broken structure.
const presetStructureSchema = presetSchema.extend({
  window: z.strictObject({ width: z.number().int(), height: z.number().int() }).optional(),
  templates: z.array(templateSchema),
});

const fileObjectSchema = z.looseObject({ v: z.unknown().optional() });

const versionSchema = z.number();

// The message under the upload button shows at most this much of an id or formula.
const DETAIL_MAX_CHARACTERS = 40;

export type Preset = z.infer<typeof presetSchema>;

// A sheet set or a single sheet. `core/sheets` resolves a sheet to its template and reads `kind`.
export type Template = z.infer<typeof templateSchema>;

export type SheetSetTemplate = z.infer<typeof sheetSetTemplateSchema>;

export type SingleSheetTemplate = z.infer<typeof singleSheetTemplateSchema>;

// What lays a sheet out. A template is one, and so is any object with its sections.
export type TemplateLayout = Pick<Template, 'sections'>;

export type PresetSection = z.infer<typeof sectionSchema>;

export type PresetCell = z.infer<typeof cellSchema>;

export type PresetFieldCell = z.infer<typeof fieldCellSchema>;

export type WindowSize = z.infer<typeof windowSchema>;

// The window size with no preset, or with a preset that sets none. `public/manifest.json` opens
// the window at this size before any background page runs, so the two must agree.
export const DEFAULT_WINDOW_SIZE: WindowSize = { width: 600, height: 600 };

// A row of a template by position, so a row with no field, as a dice row, can be named too.
export type TemplateRowPlace = { sectionIndex: number; rowIndex: number };

// `block`: the same repeat block. `sheet`: the `row:` record of `rowId` on the same sheet. The
// caller reads values only from the sheet the cell is on.
export type FieldReference = { scope: 'block' } | { scope: 'sheet'; rowId: string };

export type PresetFailure =
  | { code: 'too-large' }
  | { code: 'not-json' }
  | { code: 'newer-version' }
  | { code: 'unsupported-version' }
  | { code: 'invalid-structure' }
  | { code: 'invalid-template-id'; detail: string }
  | { code: 'duplicate-template'; detail: string }
  | { code: 'bad-name-field'; detail: string; field: string }
  | { code: 'invalid-id'; detail: string }
  | { code: 'duplicate-id'; detail: string }
  | { code: 'bad-repeat' }
  | { code: 'duplicate-section'; detail: string }
  | { code: 'row-too-wide' }
  | { code: 'bad-formula'; detail: string }
  | { code: 'bad-window' }
  | { code: 'no-options'; field: string }
  | { code: 'blank-option'; field: string }
  | { code: 'duplicate-option'; detail: string; field: string }
  | { code: 'bad-die-option'; detail: string; field: string }
  | { code: 'die-field-as-number'; detail: string; field: string }
  | { code: 'field-not-die'; detail: string; field: string }
  | { code: 'blank-name'; detail: string; cell: 'field' | 'dice' }
  | { code: 'long-name'; detail: string; cell: 'field' | 'dice' };

// Check order: size, JSON, `v`, `window`, structure, then rules. `v` comes before the structure,
// because a newer file may have a shape this build does not know.
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

  // No migration from an older format exists: a version 1 preset is rewritten by hand.
  if (version.data < FORMAT_VERSION) {
    return err({ code: 'unsupported-version' });
  }

  // Checked before the structure, so any wrong `window` gets its own reason.
  if (Object.hasOwn(file.data, 'window') && !windowSchema.safeParse(file.data.window).success) {
    return err({ code: 'bad-window' });
  }

  const preset = presetSchema.safeParse(candidate);

  if (!preset.success) {
    return err({ code: 'invalid-structure' });
  }

  const failure = presetRulesFailure(preset.data);

  return failure === null ? ok(preset.data) : err(failure);
}

// The preset structure of a builder draft, or `null` for anything else. It checks no rule, so the
// draft keeps the problems it had.
export function parsePresetStructure(candidate: JsonValue): Preset | null {
  const preset = presetStructureSchema.safeParse(candidate);

  return preset.success ? preset.data : null;
}

// The `preset` record data: the preset JSON, deflated and base64-encoded.
export function encodePreset(preset: Preset): string {
  return deflateToBase64(JSON.stringify(preset));
}

export function decodePreset(data: string): Result<Preset, PresetFailure> {
  const text = inflateFromBase64(data, PRESET_FILE_BYTE_LIMIT);

  return text.ok ? parsePresetFile(text.value) : err({ code: 'invalid-structure' });
}

// The downloaded file: structure and window size only, at the current `v`.
export function formatPresetFile(preset: Preset): string {
  const file: Preset =
    preset.window === undefined
      ? { v: FORMAT_VERSION, templates: preset.templates }
      : { v: FORMAT_VERSION, window: preset.window, templates: preset.templates };

  return JSON.stringify(file, null, 2);
}

// TASK-33: the size the action window takes for the room's preset.
export function windowSizeOf(preset: Preset | null): WindowSize {
  return preset?.window ?? DEFAULT_WINDOW_SIZE;
}

// Template ids are unique in a preset, so at most one template has the id.
export function templateById(preset: Preset, id: string): Template | null {
  return preset.templates.find((template) => template.id === id) ?? null;
}

// The id of a row's first field. It names the row's `row:` record. A row with no field has no
// record.
export function firstFieldId(row: readonly PresetCell[]): string | null {
  for (const cell of row) {
    if (cell.kind === 'field') {
      return cell.id;
    }
  }

  return null;
}

// Every field of a section, in row order. For a repeat section, these are the fields of one repeat
// block.
export function sectionFields(section: PresetSection): PresetFieldCell[] {
  return section.rows.flatMap((row) => row.filter((cell) => cell.kind === 'field'));
}

// The first field of a section in row order. Its id names a repeat section's `rep:` records, its
// value names a repeat block, and a duplicate numbers it.
export function sectionFirstField(section: PresetSection): PresetFieldCell | null {
  return sectionFields(section)[0] ?? null;
}

// The id of a repeat section, `null` for a section that does not repeat.
export function repeatSectionId(section: PresetSection): string | null {
  return section.repeat === true ? (sectionFirstField(section)?.id ?? null) : null;
}

// The repeat section of a template that `sectionId` names.
export function repeatSectionById(layout: TemplateLayout, sectionId: string): PresetSection | null {
  return layout.sections.find((section) => repeatSectionId(section) === sectionId) ?? null;
}

// The non-repeat row whose first field is `rowId`, the row a `row:` record of that id holds.
export function plainRow(layout: TemplateLayout, rowId: string): readonly PresetCell[] | null {
  for (const section of layout.sections) {
    if (section.repeat === true) {
      continue;
    }

    const row = section.rows.find((cells) => firstFieldId(cells) === rowId);

    if (row !== undefined) {
      return row;
    }
  }

  return null;
}

// The id of the non-repeat row that holds the field `fieldId`, which is the row's first field id.
// Non-repeat field ids are unique in a template, so at most one row holds it.
export function plainRowIdOf(layout: TemplateLayout, fieldId: string): string | null {
  for (const section of layout.sections) {
    if (section.repeat === true) {
      continue;
    }

    const row = section.rows.find((cells) => hasField(cells, fieldId));

    if (row !== undefined) {
      return firstFieldId(row);
    }
  }

  return null;
}

// Where `id` resolves from a cell of the row at `from`: the cell's own repeat block first, then the
// template's non-repeat scope. A field of a repeat section is reachable only from inside its own
// repeat block, so an id found only in another repeat section, or only in another template,
// resolves to `null`.
export function resolveFieldReference(
  layout: TemplateLayout,
  from: TemplateRowPlace,
  id: string,
): FieldReference | null {
  const section = layout.sections[from.sectionIndex];

  if (section?.rows[from.rowIndex] === undefined) {
    return null;
  }

  if (section.repeat === true && section.rows.some((row) => hasField(row, id))) {
    return { scope: 'block' };
  }

  const rowId = plainRowIdOf(layout, id);

  return rowId === null ? null : { scope: 'sheet', rowId };
}

// A rule failure and the item that fails the check, as an index path: template, then section, row
// and cell, as deep as that item. An id or a formula names its cell, a too-wide row its row,
// `bad-repeat` its section, a repeated id its second occurrence, and `bad-name-field` and an invalid
// template id their template.
export type PresetProblem = { failure: PresetFailure; path: readonly number[] };

// Every rule failure, in the order `parsePresetFile` checks: per template its id, then its
// sections, then its name field. Each template is a scope of its own, so one field id can occur in
// two templates.
export function presetProblems(preset: Preset): PresetProblem[] {
  const problems: PresetProblem[] = [];
  const templateIds = new Set<string>();

  preset.templates.forEach((template, templateIndex) => {
    const path = [templateIndex];

    if (!isTemplateId(template.id)) {
      problems.push({
        failure: { code: 'invalid-template-id', detail: shortDetail(template.id) },
        path,
      });
    } else if (templateIds.has(template.id)) {
      problems.push({
        failure: { code: 'duplicate-template', detail: shortDetail(template.id) },
        path,
      });
    } else {
      templateIds.add(template.id);
    }

    problems.push(...sectionsProblems(template, path));
    problems.push(...formulaTypeProblems(template, path));

    const nameFailure = nameFieldFailure(template);

    if (nameFailure !== null) {
      problems.push({ failure: nameFailure, path });
    }
  });

  return problems;
}

function presetRulesFailure(preset: Preset): PresetFailure | null {
  return presetProblems(preset)[0]?.failure ?? null;
}

// A sheet set names each sheet by a `text` field outside its repeat sections.
function nameFieldFailure(template: Template): PresetFailure | null {
  if (template.kind !== 'set') {
    return null;
  }

  const named = template.sections.some(
    (section) =>
      section.repeat !== true &&
      section.rows.some((row) =>
        row.some(
          (cell) => cell.kind === 'field' && cell.id === template.nameField && cell.type === 'text',
        ),
      ),
  );

  return named
    ? null
    : {
        code: 'bad-name-field',
        detail: shortDetail(template.id),
        field: shortDetail(template.nameField),
      };
}

// All non-repeat fields of one template are one scope, and each repeat section is its own.
function sectionsProblems(
  layout: TemplateLayout,
  templatePath: readonly number[],
): PresetProblem[] {
  const templateScope = new Set<string>();
  const sectionIds = new Set<string>();

  return layout.sections.flatMap((section, sectionIndex) => {
    const path = [...templatePath, sectionIndex];

    return section.repeat === true
      ? repeatSectionProblems(section, sectionIds, path)
      : rowsProblems(section, templateScope, path);
  });
}

// All rows of a repeat section form one repeat block, so its fields share one scope.
function repeatSectionProblems(
  section: PresetSection,
  sectionIds: Set<string>,
  path: readonly number[],
): PresetProblem[] {
  const sectionId = repeatSectionId(section);

  if (sectionId === null) {
    return [{ failure: { code: 'bad-repeat' }, path }];
  }

  const problems = rowsProblems(section, new Set(), path);

  if (sectionIds.has(sectionId)) {
    problems.push({
      failure: { code: 'duplicate-section', detail: shortDetail(sectionId) },
      path,
    });
  }

  sectionIds.add(sectionId);

  return problems;
}

function rowsProblems(
  section: PresetSection,
  scope: Set<string>,
  sectionPath: readonly number[],
): PresetProblem[] {
  return section.rows.flatMap((row, rowIndex) =>
    rowProblems(section, row, scope, [...sectionPath, rowIndex]),
  );
}

// A row shorter than `columns` is fine: the trailing grid cells stay empty.
function rowProblems(
  section: PresetSection,
  row: readonly PresetCell[],
  scope: Set<string>,
  path: readonly number[],
): PresetProblem[] {
  const problems: PresetProblem[] = [];

  if (section.columns !== undefined && row.length > section.columns) {
    problems.push({ failure: { code: 'row-too-wide' }, path });
  }

  row.forEach((cell, cellIndex) => {
    const failure = cellFailure(cell, scope);

    if (failure !== null) {
      problems.push({ failure, path: [...path, cellIndex] });
    }
  });

  return problems;
}

// A formula may name any valid id. An id absent from the sheet is a roll-time error.
function cellFailure(cell: PresetCell, scope: Set<string>): PresetFailure | null {
  if (cell.kind === 'text') {
    return null;
  }

  if (cell.kind === 'dice') {
    if (!parseFormula(cell.formula).ok) {
      return { code: 'bad-formula', detail: shortDetail(cell.formula) };
    }

    return cellNameFailure(cell.name, shortDetail(cell.formula), 'dice');
  }

  if (!isFieldId(cell.id)) {
    return { code: 'invalid-id', detail: shortDetail(cell.id) };
  }

  if (scope.has(cell.id)) {
    return { code: 'duplicate-id', detail: shortDetail(cell.id) };
  }

  scope.add(cell.id);

  const optionsFailure =
    cell.type === 'select' || cell.type === 'dice-choice' ? selectOptionsFailure(cell) : null;

  return optionsFailure ?? cellNameFailure(cell.name, shortDetail(cell.id), 'field');
}

function cellNameFailure(
  name: string | undefined,
  detail: string,
  cell: 'field' | 'dice',
): PresetFailure | null {
  if (name === undefined) {
    return null;
  }

  if (name.trim() === '') {
    return { code: 'blank-name', detail, cell };
  }

  return Array.from(name).length > CELL_NAME_MAX_CHARACTERS
    ? { code: 'long-name', detail, cell }
    : null;
}

function selectOptionsFailure(
  field: Extract<PresetFieldCell, { type: 'select' | 'dice-choice' }>,
): PresetFailure | null {
  if (field.options.length === 0) {
    return { code: 'no-options', field: shortDetail(field.id) };
  }

  const seen = new Set<string>();

  for (const option of field.options) {
    if (option.trim() === '') {
      return { code: 'blank-option', field: shortDetail(field.id) };
    }

    if (seen.has(option)) {
      return {
        code: 'duplicate-option',
        detail: shortDetail(option),
        field: shortDetail(field.id),
      };
    }

    seen.add(option);

    if (field.type === 'dice-choice' && !/^d(?:[1-9][0-9]{0,2}|1000)$/.test(option)) {
      return { code: 'bad-die-option', detail: shortDetail(option), field: shortDetail(field.id) };
    }
  }

  return null;
}

function formulaTypeProblems(template: Template, templatePath: readonly number[]): PresetProblem[] {
  const problems: PresetProblem[] = [];

  template.sections.forEach((section, sectionIndex) => {
    section.rows.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        if (cell.kind !== 'dice') {
          return;
        }

        const parsed = parseFormula(cell.formula);

        const failure = parsed.ok
          ? formulaTypeFailure(template, { sectionIndex, rowIndex }, parsed.value, cell.formula)
          : null;

        if (failure !== null) {
          problems.push({
            failure,
            path: [...templatePath, sectionIndex, rowIndex, cellIndex],
          });
        }
      });
    });
  });

  return problems;
}

function formulaTypeFailure(
  template: Template,
  from: TemplateRowPlace,
  tree: FormulaTree,
  formula: string,
): PresetFailure | null {
  function walk(expression: FormulaExpression): PresetFailure | null {
    if (expression.kind === 'field') {
      const field = fieldReference(template, from, expression.id);

      return field?.type === 'dice-choice'
        ? {
            code: 'die-field-as-number',
            detail: shortDetail(formula),
            field: shortDetail(expression.id),
          }
        : null;
    }

    if (expression.kind === 'dice-field') {
      const field = fieldReference(template, from, expression.id);

      return field === null || field.type === 'dice-choice'
        ? null
        : {
            code: 'field-not-die',
            detail: shortDetail(formula),
            field: shortDetail(expression.id),
          };
    }

    if (expression.kind === 'integer' || expression.kind === 'dice') {
      return null;
    }

    if (expression.kind === 'call') {
      return walk(expression.argument);
    }

    return walk(expression.left) ?? walk(expression.right);
  }

  if (tree.kind === 'comparison') {
    return walk(tree.left) ?? walk(tree.right);
  }

  return walk(tree);
}

function fieldReference(
  template: Template,
  from: TemplateRowPlace,
  id: string,
): PresetFieldCell | null {
  const reference = resolveFieldReference(template, from, id);

  if (reference === null) {
    return null;
  }

  const rows =
    reference.scope === 'block'
      ? (template.sections[from.sectionIndex]?.rows ?? [])
      : [plainRow(template, reference.rowId) ?? []];

  for (const row of rows) {
    const field = row.find((cell) => cell.kind === 'field' && cell.id === id);

    if (field?.kind === 'field') {
      return field;
    }
  }

  return null;
}

function shortDetail(text: string): string {
  const characters = Array.from(text);

  return characters.length > DETAIL_MAX_CHARACTERS
    ? `${characters.slice(0, DETAIL_MAX_CHARACTERS).join('')}…`
    : text;
}

function hasField(row: readonly PresetCell[], id: string): boolean {
  return row.some((cell) => cell.kind === 'field' && cell.id === id);
}
