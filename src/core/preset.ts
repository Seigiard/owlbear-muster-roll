import { z } from 'zod';

import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';
import { isFieldId, isTemplateId } from '@/core/field-id';
import { PRESET_FORMAT_VERSION as FORMAT_VERSION } from '@/core/format-version';
import { parseFormula, type FormulaExpression, type FormulaTree } from '@/core/formula';
import type { JsonValue } from '@/core/json';
import { PRESET_REGISTRY } from '@/core/preset-registry';
import { err, ok, type Result } from '@/core/result';

export const PRESET_FILE_BYTE_LIMIT = 1024 * 1024;
export const CELL_NAME_MAX_CHARACTERS = 60;
const DETAIL_MAX_CHARACTERS = 40;

const visibility = z.enum(['all', 'gm']).optional();
const repeat = z.strictObject({ id: z.string(), nameField: z.string() });

function nodeObject<
  K extends keyof typeof PRESET_REGISTRY,
  Fields extends Record<string, z.ZodTypeAny>,
>(kind: K, fields: Fields): z.ZodObject<Fields> {
  return z
    .object(fields)
    .passthrough()
    .superRefine((value, context) => {
      const allowed = PRESET_REGISTRY[kind].keys;

      for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
          context.addIssue({ code: 'unrecognized_keys', keys: [key] });
        }
      }
    });
}

const textCell = nodeObject('cell-text', { kind: z.literal('text'), text: z.string() });

const fieldCell = z.discriminatedUnion('type', [
  nodeObject('cell-field-text', {
    kind: z.literal('field'),
    type: z.literal('text'),
    id: z.string(),
    name: z.string().optional(),
  }),
  nodeObject('cell-field-number', {
    kind: z.literal('field'),
    type: z.literal('number'),
    id: z.string(),
    name: z.string().optional(),
  }),
  nodeObject('cell-field-check', {
    kind: z.literal('field'),
    type: z.literal('check'),
    id: z.string(),
    name: z.string().optional(),
  }),
  nodeObject('cell-field-select', {
    kind: z.literal('field'),
    type: z.literal('select'),
    id: z.string(),
    name: z.string().optional(),
    options: z.array(z.string()),
  }),
  nodeObject('cell-field-dice-choice', {
    kind: z.literal('field'),
    type: z.literal('dice-choice'),
    id: z.string(),
    name: z.string().optional(),
    options: z.array(z.string()),
  }),
]);

const diceCell = nodeObject('cell-dice', {
  kind: z.literal('dice'),
  formula: z.string(),
  name: z.string().optional(),
});

const tokenCell = nodeObject('cell-token', { kind: z.literal('token'), id: z.string() });
const cell = z.discriminatedUnion('kind', [textCell, fieldCell, diceCell, tokenCell]);
const row = nodeObject('row', { visibility, repeat: repeat.optional(), cells: z.array(cell) });

const section = nodeObject('section', {
  title: z.string().optional(),
  width: z.enum(['1/3', '1/2', 'full']).optional(),
  columns: z.number().int().positive().optional(),
  visibility,
  repeat: repeat.optional(),
  rows: z.array(row),
});

const tab = nodeObject('tab', {
  title: z.string().optional(),
  visibility,
  repeat: repeat.optional(),
  sections: z.array(section),
});

const template = nodeObject('template', {
  id: z.string(),
  title: z.string(),
  visibility,
  repeat: z.strictObject({ nameField: z.string() }).optional(),
  players: z.literal('edit').optional(),
  tabs: z.array(tab).min(1),
});

const structureTemplate = nodeObject('template', {
  id: z.string(),
  title: z.string(),
  visibility,
  repeat: z.strictObject({ nameField: z.string() }).optional(),
  players: z.literal('edit').optional(),
  tabs: z.array(tab),
});

const fileTemplate = template;

const fileSchema = nodeObject('preset', {
  v: z.literal(FORMAT_VERSION),
  window: z
    .strictObject({
      width: z.number().int().min(480).max(1440),
      height: z.number().int().min(360).max(1080),
    })
    .optional(),
  templates: z.array(fileTemplate).min(1),
});

const structureSchema = nodeObject('preset', {
  v: z.literal(FORMAT_VERSION),
  window: z.strictObject({ width: z.number().int(), height: z.number().int() }).optional(),
  templates: z.array(structureTemplate),
});

const fileObject = z.looseObject({ v: z.unknown().optional() });

export type Preset = z.infer<typeof fileSchema>;

export type Template = z.infer<typeof template>;

export type SheetSetTemplate = Omit<Template, 'repeat'> & { repeat: { nameField: string } };

export type SingleSheetTemplate = Omit<Template, 'repeat'> & { repeat?: undefined };

export function isSheetSet<T extends { repeat?: unknown }>(
  template: T,
): template is T & { repeat: { nameField: string } };
export function isSheetSet(template: { repeat?: { nameField: string } }): boolean {
  return template.repeat !== undefined;
}

export type TemplateLayout = { tabs: readonly PresetTab[] };

export type PresetTab = z.infer<typeof tab>;

export type PresetSection = z.infer<typeof section>;

export type PresetRow = z.infer<typeof row>;

export type PresetCell = z.infer<typeof cell>;

export type PresetFieldCell = z.infer<typeof fieldCell>;

export type WindowSize = { width: number; height: number };

export const DEFAULT_WINDOW_SIZE: WindowSize = { width: 600, height: 600 };

export const WINDOW_SIZE_LIMITS = {
  width: { min: 480, max: 1440 },
  height: { min: 360, max: 1080 },
} as const;

export type FieldReference = { scope: 'block' } | { scope: 'sheet'; rowId: string };

export type PresetFailure =
  | { code: 'too-large' }
  | { code: 'not-json' }
  | { code: 'newer-version' }
  | { code: 'unsupported-version' }
  | { code: 'invalid-structure' }
  | { code: 'invalid-template-id'; detail: string }
  | { code: 'untitled-tab'; detail: string }
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

export type PresetProblem = { failure: PresetFailure; path: readonly number[] };

const encoder = new TextEncoder();

export function parsePresetFile(text: string): Result<Preset, PresetFailure> {
  if (encoder.encode(text).length > PRESET_FILE_BYTE_LIMIT) return err({ code: 'too-large' });
  let candidate: unknown;

  try {
    candidate = JSON.parse(text);
  } catch {
    return err({ code: 'not-json' });
  }

  const object = fileObject.safeParse(candidate);

  if (!object.success) return err({ code: 'invalid-structure' });
  const versionResult = z.number().safeParse(object.data.v);

  if (!versionResult.success || !Number.isInteger(versionResult.data)) {
    return err({ code: 'unsupported-version' });
  }

  const version = versionResult.data;
  const candidateObject = object.data;

  if (version > FORMAT_VERSION) return err({ code: 'newer-version' });

  if (version < FORMAT_VERSION) return err({ code: 'unsupported-version' });

  if (
    Object.hasOwn(candidateObject, 'window') &&
    !fileSchema.shape.window.safeParse(candidateObject.window).success
  ) {
    return err({ code: 'bad-window' });
  }

  const parsed = fileSchema.safeParse(candidateObject);

  if (!parsed.success) return err({ code: 'invalid-structure' });
  const failure = presetProblems(parsed.data)[0]?.failure ?? null;

  return failure === null ? ok(parsed.data) : err(failure);
}

export function parsePresetStructure(candidate: JsonValue): Preset | null {
  const parsed = structureSchema.safeParse(candidate);

  return parsed.success ? parsed.data : null;
}

export function encodePreset(preset: Preset): string {
  return deflateToBase64(JSON.stringify(preset));
}

export function decodePreset(data: string): Result<Preset, PresetFailure> {
  const text = inflateFromBase64(data, PRESET_FILE_BYTE_LIMIT);

  return text.ok ? parsePresetFile(text.value) : err({ code: 'invalid-structure' });
}

export function formatPresetFile(preset: Preset): string {
  const file =
    preset.window === undefined
      ? { v: FORMAT_VERSION, templates: preset.templates }
      : { v: FORMAT_VERSION, window: preset.window, templates: preset.templates };

  return JSON.stringify(file, null, 2);
}

export function windowSizeOf(preset: Preset | null): WindowSize {
  return preset?.window ?? DEFAULT_WINDOW_SIZE;
}

export function templateById(preset: Preset, id: string): Template | null {
  return preset.templates.find((item) => item.id === id) ?? null;
}

export function rowCells(row: PresetRow): readonly PresetCell[] {
  return row.cells;
}

export function firstFieldId(row: PresetRow): string | null {
  return rowCells(row).find((item) => item.kind === 'field')?.id ?? null;
}

export function sectionFields(section: PresetSection): PresetFieldCell[] {
  return section.rows.flatMap((item) =>
    rowCells(item).filter((candidate): candidate is PresetFieldCell => candidate.kind === 'field'),
  );
}

export function sectionFirstField(section: PresetSection): PresetFieldCell | null {
  return sectionFields(section)[0] ?? null;
}

export function repeatSectionId(section: PresetSection): string | null {
  return section.repeat?.id ?? null;
}

export function layoutSections(layout: TemplateLayout): PresetSection[] {
  return layout.tabs.flatMap((item) => item.sections);
}

export type TemplateSectionPlace = { tabIndex: number; sectionIndex: number };

export type TemplateRowPlace = TemplateSectionPlace & { rowIndex: number };

export function sectionAt(
  layout: TemplateLayout,
  place: TemplateSectionPlace,
): PresetSection | null {
  return layout.tabs[place.tabIndex]?.sections[place.sectionIndex] ?? null;
}

export function placedSections(
  layout: TemplateLayout,
): { place: TemplateSectionPlace; section: PresetSection }[] {
  return layout.tabs.flatMap((tab, tabIndex) =>
    tab.sections.map((item, sectionIndex) => ({
      place: { tabIndex, sectionIndex },
      section: item,
    })),
  );
}

export function openTabIndex(
  layout: TemplateLayout,
  chosen: number | undefined,
  shown?: (index: number) => boolean,
): number | null {
  if (
    chosen !== undefined &&
    Number.isInteger(chosen) &&
    chosen >= 0 &&
    chosen < layout.tabs.length &&
    (shown === undefined || shown(chosen))
  )
    return chosen;

  if (shown === undefined) return 0;
  const index = layout.tabs.findIndex((_tab, i) => shown(i));

  return index === -1 ? null : index;
}

export function repeatSectionById(layout: TemplateLayout, id: string): PresetSection | null {
  const scope = repeatScopeById(layout, id);

  if (scope === null) return null;

  return scope.row === null
    ? scope.section
    : { ...scope.section, repeat: scope.row.repeat, rows: [scope.row] };
}

export function repeatSectionPlace(
  layout: TemplateLayout,
  id: string,
): { place: TemplateSectionPlace; section: PresetSection } | null {
  const scope = repeatScopeById(layout, id);

  return scope === null
    ? null
    : {
        place: scope.place,
        section:
          scope.row === null
            ? scope.section
            : { ...scope.section, repeat: scope.row.repeat, rows: [scope.row] },
      };
}

export type RepeatScope = {
  place: TemplateSectionPlace;
  section: PresetSection;
  row: PresetRow | null;
};

export function repeatScopeById(layout: TemplateLayout, id: string): RepeatScope | null {
  for (const { place, section } of placedSections(layout)) {
    if (section.repeat?.id === id) return { place, section, row: null };

    const row = section.rows.find((candidate) => candidate.repeat?.id === id);

    if (row !== undefined) return { place, section, row };
  }

  return null;
}

export function plainRow(layout: TemplateLayout, rowId: string): readonly PresetCell[] | null {
  for (const section of layoutSections(layout)) {
    if (repeatSectionId(section) !== null) continue;
    const row = section.rows.find((item) => firstFieldId(item) === rowId);

    if (row !== undefined) return rowCells(row);
  }

  return null;
}

export function plainRowIdOf(layout: TemplateLayout, fieldId: string): string | null {
  for (const section of layoutSections(layout)) {
    if (repeatSectionId(section) !== null) continue;

    const row = section.rows.find((item) =>
      rowCells(item).some((candidate) => candidate.kind === 'field' && candidate.id === fieldId),
    );

    if (row !== undefined) return firstFieldId(row);
  }

  return null;
}

export function resolveFieldReference(
  layout: TemplateLayout,
  from: TemplateRowPlace,
  id: string,
): FieldReference | null {
  const section = sectionAt(layout, from);

  if (section === null) return null;

  const currentRow = section.rows[from.rowIndex];

  if (currentRow === undefined) return null;

  const tab = layout.tabs[from.tabIndex];

  if (currentRow.repeat !== undefined && rowHasField(currentRow, id)) {
    return { scope: 'block' };
  }

  if (
    section.repeat !== undefined &&
    section.rows.some((row) => row.repeat === undefined && rowHasField(row, id))
  ) {
    return { scope: 'block' };
  }

  if (
    tab?.repeat !== undefined &&
    tab.sections.some(
      (candidate) =>
        candidate.repeat === undefined &&
        candidate.rows.some((row) => row.repeat === undefined && rowHasField(row, id)),
    )
  ) {
    return { scope: 'block' };
  }

  const rowId = plainRowIdOf(layout, id);

  return rowId === null ? null : { scope: 'sheet', rowId };
}

function rowHasField(row: PresetRow, id: string): boolean {
  return row.cells.some((candidate) => candidate.kind === 'field' && candidate.id === id);
}

export function presetProblems(preset: Preset): PresetProblem[] {
  const problems: PresetProblem[] = [];
  const templateIds = new Set<string>();
  preset.templates.forEach((item, ti) => {
    const path = [ti];

    if (!isTemplateId(item.id))
      problems.push({ failure: { code: 'invalid-template-id', detail: short(item.id) }, path });
    else if (templateIds.has(item.id))
      problems.push({ failure: { code: 'duplicate-template', detail: short(item.id) }, path });
    else templateIds.add(item.id);

    if (item.tabs.length > 1)
      item.tabs.forEach((t, i) => {
        if (t.title === undefined || t.title.trim() === '')
          problems.push({
            failure: { code: 'untitled-tab', detail: short(item.id) },
            path: [...path, i],
          });
      });
    problems.push(...treeProblems(item, path));
    problems.push(...formulaTypeProblems(item, path));

    if (item.repeat !== undefined && !templateHasNameField(item, item.repeat.nameField)) {
      problems.push({
        failure: {
          code: 'bad-name-field',
          detail: short(item.id),
          field: short(item.repeat.nameField),
        },
        path,
      });
    }
  });

  return problems;
}

function templateHasNameField(template: Template, id: string): boolean {
  return layoutSections(template)
    .filter((section) => section.repeat === undefined)
    .some((section) =>
      section.rows
        .filter((row) => row.repeat === undefined)
        .some((row) =>
          row.cells.some(
            (candidate) =>
              candidate.kind === 'field' && candidate.id === id && candidate.type === 'text',
          ),
        ),
    );
}

function formulaTypeProblems(template: Template, templatePath: number[]): PresetProblem[] {
  const problems: PresetProblem[] = [];

  placedSections(template).forEach(({ place, section }) => {
    section.rows.forEach((row, rowIndex) => {
      row.cells.forEach((candidate, cellIndex) => {
        if (candidate.kind !== 'dice') return;
        const parsed = parseFormula(candidate.formula);

        const failure = parsed.ok
          ? formulaTypeFailure(template, { ...place, rowIndex }, parsed.value, candidate.formula)
          : null;

        if (failure !== null) {
          problems.push({
            failure,
            path: [...templatePath, place.tabIndex, place.sectionIndex, rowIndex, cellIndex],
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
  const walk = (expression: FormulaExpression): PresetFailure | null => {
    if (expression.kind === 'field') {
      const field = fieldReference(template, from, expression.id);

      return field?.type === 'dice-choice'
        ? { code: 'die-field-as-number', detail: short(formula), field: short(expression.id) }
        : null;
    }

    if (expression.kind === 'dice-field') {
      const field = fieldReference(template, from, expression.id);

      return field !== null && field.type !== 'dice-choice'
        ? { code: 'field-not-die', detail: short(formula), field: short(expression.id) }
        : null;
    }

    if (expression.kind === 'integer' || expression.kind === 'dice') return null;

    if (expression.kind === 'call') return walk(expression.argument);

    return walk(expression.left) ?? walk(expression.right);
  };

  return tree.kind === 'comparison' ? (walk(tree.left) ?? walk(tree.right)) : walk(tree);
}

function fieldReference(
  template: Template,
  from: TemplateRowPlace,
  id: string,
): PresetFieldCell | null {
  const reference = resolveFieldReference(template, from, id);

  if (reference === null) return null;
  const section = sectionAt(template, from);

  if (reference.scope === 'block') {
    const currentRow = section?.rows[from.rowIndex];
    const tab = template.tabs[from.tabIndex];

    if (currentRow?.repeat !== undefined) {
      return fieldInRow(currentRow, id);
    }

    if (section?.repeat !== undefined) {
      return fieldInRows(
        section.rows.filter((row) => row.repeat === undefined),
        id,
      );
    }

    if (tab?.repeat !== undefined) {
      return fieldInRows(
        tab.sections
          .filter((candidate) => candidate.repeat === undefined)
          .flatMap((candidate) => candidate.rows.filter((row) => row.repeat === undefined)),
        id,
      );
    }

    return null;
  }

  return (
    plainRow(template, reference.rowId)?.find(
      (candidate): candidate is PresetFieldCell =>
        candidate.kind === 'field' && candidate.id === id,
    ) ?? null
  );
}

function fieldInRow(row: PresetRow, id: string): PresetFieldCell | null {
  return (
    row.cells.find(
      (candidate): candidate is PresetFieldCell =>
        candidate.kind === 'field' && candidate.id === id,
    ) ?? null
  );
}

function fieldInRows(rows: readonly PresetRow[], id: string): PresetFieldCell | null {
  for (const row of rows) {
    const field = fieldInRow(row, id);

    if (field !== null) return field;
  }

  return null;
}

function treeProblems(template: Template, templatePath: number[]): PresetProblem[] {
  const problems: PresetProblem[] = [];
  const rootFields = new Set<string>();
  const repeatIds = new Set<string>();
  const tabRepeatIds = new Set<string>();
  template.tabs.forEach((tab, ti) => {
    if (tab.repeat !== undefined) {
      if (!validRepeat(tab.repeat))
        problems.push({ failure: { code: 'bad-repeat' }, path: [...templatePath, ti] });

      if (tabRepeatIds.has(tab.repeat.id)) {
        problems.push({
          failure: { code: 'duplicate-section', detail: short(tab.repeat.id) },
          path: [...templatePath, ti],
        });
      }

      tabRepeatIds.add(tab.repeat.id);
      repeatIds.add(tab.repeat.id);

      if (!hasTextFieldInScope(tab, tab.repeat.nameField, true)) {
        problems.push({
          failure: {
            code: 'bad-name-field',
            detail: short(tab.repeat.id),
            field: short(tab.repeat.nameField),
          },
          path: [...templatePath, ti],
        });
      }
    }

    tab.sections.forEach((section, si) => {
      const sectionPath = [...templatePath, ti, si];

      if (section.repeat !== undefined) {
        if (!validRepeat(section.repeat))
          problems.push({ failure: { code: 'bad-repeat' }, path: sectionPath });

        if (repeatIds.has(section.repeat.id))
          problems.push({
            failure: { code: 'duplicate-section', detail: short(section.repeat.id) },
            path: sectionPath,
          });
        repeatIds.add(section.repeat.id);
      }

      const scope = section.repeat === undefined ? rootFields : new Set<string>();
      section.rows.forEach((item, ri) => {
        const rowPath = [...sectionPath, ri];

        if (item.repeat !== undefined && !validRepeat(item.repeat))
          problems.push({ failure: { code: 'bad-repeat' }, path: rowPath });

        if (item.repeat !== undefined && repeatIds.has(item.repeat.id)) {
          problems.push({
            failure: { code: 'duplicate-section', detail: short(item.repeat.id) },
            path: rowPath,
          });
        }

        if (item.repeat !== undefined) repeatIds.add(item.repeat.id);

        if (section.columns !== undefined && item.cells.length > section.columns)
          problems.push({ failure: { code: 'row-too-wide' }, path: rowPath });
        const rowScope = item.repeat === undefined ? scope : new Set<string>();
        item.cells.forEach((candidate, ci) => {
          const failure = cellFailure(candidate, rowScope);

          if (failure !== null) problems.push({ failure, path: [...rowPath, ci] });
        });

        if (item.repeat !== undefined && !hasTextFieldInScope(item, item.repeat.nameField, true)) {
          problems.push({
            failure: {
              code: 'bad-name-field',
              detail: short(item.repeat.id),
              field: short(item.repeat.nameField),
            },
            path: rowPath,
          });
        }
      });

      if (
        section.repeat !== undefined &&
        !hasTextFieldInScope(section, section.repeat.nameField, true)
      ) {
        problems.push({
          failure: {
            code: 'bad-name-field',
            detail: short(section.repeat.id),
            field: short(section.repeat.nameField),
          },
          path: sectionPath,
        });
      }
    });
  });

  return problems;
}

function validRepeat(value: unknown): value is { id: string; nameField: string } {
  const parsed = repeat.safeParse(value);

  return parsed.success && isFieldId(parsed.data.id) && isFieldId(parsed.data.nameField);
}

function hasTextFieldInScope(
  owner: Template | PresetTab | PresetSection | PresetRow,
  id: string,
  block: boolean,
): boolean {
  void block;

  const rows =
    'cells' in owner
      ? [owner]
      : 'rows' in owner
        ? owner.rows.filter((row) => row.repeat === undefined)
        : 'sections' in owner
          ? owner.sections
              .filter((section) => section.repeat === undefined)
              .flatMap((section) => section.rows.filter((row) => row.repeat === undefined))
          : owner.tabs.flatMap((tab) =>
              tab.sections
                .filter((section) => section.repeat === undefined)
                .flatMap((section) => section.rows.filter((row) => row.repeat === undefined)),
            );

  return rows.some((item) =>
    rowCells(item).some(
      (candidate) => candidate.kind === 'field' && candidate.id === id && candidate.type === 'text',
    ),
  );
}

function cellFailure(candidate: PresetCell, scope: Set<string>): PresetFailure | null {
  if (candidate.kind === 'text' || candidate.kind === 'token') {
    if (candidate.kind === 'token' && !isFieldId(candidate.id))
      return { code: 'invalid-id', detail: short(candidate.id) };

    if (candidate.kind === 'token' && scope.has(candidate.id))
      return { code: 'duplicate-id', detail: short(candidate.id) };

    if (candidate.kind === 'token') scope.add(candidate.id);

    return null;
  }

  if (candidate.kind === 'dice') {
    const parsed = parseFormula(candidate.formula);

    if (!parsed.ok) return { code: 'bad-formula', detail: short(candidate.formula) };

    return nameFailure(candidate.name, short(candidate.formula), 'dice');
  }

  if (!isFieldId(candidate.id)) return { code: 'invalid-id', detail: short(candidate.id) };

  if (scope.has(candidate.id)) return { code: 'duplicate-id', detail: short(candidate.id) };
  scope.add(candidate.id);

  if (candidate.type === 'select' || candidate.type === 'dice-choice') {
    if (candidate.options.length === 0) return { code: 'no-options', field: short(candidate.id) };
    const seen = new Set<string>();

    for (const option of candidate.options) {
      if (option.trim() === '') return { code: 'blank-option', field: short(candidate.id) };

      if (seen.has(option))
        return { code: 'duplicate-option', detail: short(option), field: short(candidate.id) };
      seen.add(option);

      if (candidate.type === 'dice-choice' && !/^d(?:[1-9][0-9]{0,2}|1000)$/.test(option)) {
        return { code: 'bad-die-option', detail: short(option), field: short(candidate.id) };
      }
    }
  }

  return nameFailure(candidate.name, short(candidate.id), 'field');
}

function nameFailure(
  name: string | undefined,
  detail: string,
  cellKind: 'field' | 'dice',
): PresetFailure | null {
  if (name === undefined) return null;

  if (name.trim() === '') return { code: 'blank-name', detail, cell: cellKind };

  return Array.from(name).length > CELL_NAME_MAX_CHARACTERS
    ? { code: 'long-name', detail, cell: cellKind }
    : null;
}

function short(value: string): string {
  const chars = Array.from(value);

  return chars.length > DETAIL_MAX_CHARACTERS
    ? `${chars.slice(0, DETAIL_MAX_CHARACTERS).join('')}…`
    : value;
}

export function hasField(row: PresetRow, id: string): boolean {
  return rowCells(row).some((item) => item.kind === 'field' && item.id === id);
}
