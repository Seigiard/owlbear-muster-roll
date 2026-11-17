import { z } from 'zod';

import {
  evaluateFormula,
  formulaDiceFieldLookup,
  formulaDiceTerms,
  formulaFieldLookup,
  resolveFormulaDiceFields,
  type DiceTerm,
  type FaceSource,
  type RollResult,
} from '@/core/formula-evaluate';
import { parseFormula, writeDiceFields } from '@/core/formula';
import {
  plainRow,
  repeatSectionByPath,
  repeatSectionId,
  resolveFieldReference,
  sectionAt,
  type PresetCell,
  type PresetSection,
  type TemplateLayout,
  type TemplateRowPlace,
} from '@/core/preset';
import {
  cellValues,
  blockPathKey,
  repDataSchema,
  type FieldValue,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { cellLabel, rowValues, type FieldValues } from '@/core/sheet-values';

// What a window shows in a field it holds locally: unsent text, or an input error.
export const shownValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string() }),
  z.strictObject({ kind: z.literal('error') }),
]);

// A dice cell by position in its template: its tab, its section within that tab, row and cell.
// `instanceId` names the repeat block, `null` a plain row.
export const dicePlaceSchema = z.strictObject({
  tabIndex: z.number().int().nonnegative(),
  sectionIndex: z.number().int().nonnegative(),
  rowIndex: z.number().int().nonnegative(),
  cellIndex: z.number().int().nonnegative(),
  instanceId: z.string().min(1).max(64).nullable(),
  path: z
    .array(z.string().min(1))
    .min(2)
    .refine((parts) => parts.length % 2 === 0)
    .optional(),
});

export type ShownValue = z.infer<typeof shownValueSchema>;

// By field id. The window keeps only the entry a formula in the rolled row resolves to.
export type ShownValues = ReadonlyMap<string, ShownValue>;

export type DicePlace = z.infer<typeof dicePlaceSchema>;

// `cell` is the preceding text label, or the formula with each Nd(id) written as NdM.
export type DiceRoll = { cell: string; result: RollResult };

// `field` names the referenced field by its label, or by its id when it is not on the sheet.
// `not-dice` is a place with no dice cell or a repeat block that is gone.
export type DiceRollFailure =
  | { code: 'field'; field: string }
  | { code: 'arithmetic' }
  | { code: 'not-dice' };

// A dice cell ready to roll: its label, its dice terms in tree order, and the roll itself, which
// reads the values `prepareDiceRoll` was given each time it runs.
export type PreparedDiceRoll = {
  cell: string;
  terms: DiceTerm[];
  roll: (faces: FaceSource) => Result<RollResult, DiceRollFailure>;
};

// Rolls the dice cell at `place` of one sheet, from `records` as the client shows them with the
// window's `shown` values over them. A field shown in an input error gives the field error.
export function rollDiceCell(
  layout: TemplateLayout,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  place: DicePlace,
  shown: ShownValues,
  faces: FaceSource,
): Result<DiceRoll, DiceRollFailure> {
  const prepared = prepareDiceRoll(layout, records, sheetId, place, shown);

  if (!prepared.ok) {
    return prepared;
  }

  const rolled = prepared.value.roll(faces);

  return rolled.ok ? ok({ cell: prepared.value.cell, result: rolled.value }) : rolled;
}

// As `rollDiceCell`, with the faces left for later, so a caller can ask for them by the terms.
// `records` and `shown` must not change while the result is in use.
export function prepareDiceRoll(
  layout: TemplateLayout,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  place: DicePlace,
  shown: ShownValues,
): Result<PreparedDiceRoll, DiceRollFailure> {
  const section = sectionAt(layout, place);
  const row = section?.rows[place.rowIndex];
  const cell = row?.cells[place.cellIndex];

  const repeat =
    section?.repeat !== undefined ||
    row?.repeat !== undefined ||
    layout.tabs[place.tabIndex]?.repeat !== undefined;

  if (
    section === null ||
    row === undefined ||
    cell?.kind !== 'dice' ||
    repeat !== (place.instanceId !== null)
  ) {
    return err({ code: 'not-dice' });
  }

  const from: TemplateRowPlace = {
    tabIndex: place.tabIndex,
    sectionIndex: place.sectionIndex,
    rowIndex: place.rowIndex,
    path: place.path,
  };

  let ownBlock: FieldValues | undefined;

  if (place.instanceId !== null) {
    const block = blockValues(records, sheetId, section, row, place.instanceId, place.path);

    if (block === null) {
      return err({ code: 'not-dice' });
    }

    ownBlock = withShown(block, shown);
  }

  const tree = parseFormula(cell.formula);

  // The preset schema refuses a formula that does not parse, so none reaches a roll.
  if (!tree.ok) {
    return err({ code: 'arithmetic' });
  }

  const formula = tree.value;

  const lookup = formulaFieldLookup(
    layout,
    from,
    (rowId) => withShown(rowValues(records, sheetId, rowId), shown),
    ownBlock,
    (scopePath) => {
      const values = blockValuesAtScope(records, sheetId, place.path, scopePath);

      return values === null ? null : withShown(values, shown);
    },
  );

  const diceFieldLookup = formulaDiceFieldLookup(
    layout,
    from,
    (rowId) => withShown(rowValues(records, sheetId, rowId), shown),
    ownBlock,
    (scopePath) => {
      const values = blockValuesAtScope(records, sheetId, place.path, scopePath);

      return values === null ? null : withShown(values, shown);
    },
  );

  const resolved = resolveFormulaDiceFields(formula, diceFieldLookup);

  if (!resolved.ok) {
    return err({ code: 'field', field: fieldLabel(layout, from, resolved.error.fieldId) });
  }

  // Resolution above proves every Nd(id) has a value, so the writer can use a non-null lookup.
  const writtenFormula = writeDiceFields(cell.formula, (id) => {
    const sides = diceFieldLookup(id);

    if (sides === null) {
      throw new Error(`Unresolved dice field ${id}`);
    }

    return sides;
  });

  const cellText = cellLabel(cell, row.cells.slice(0, place.cellIndex));

  const label =
    writtenFormula !== cell.formula
      ? cell.name === undefined && cellText === cell.formula
        ? writtenFormula
        : `${cellText} (${writtenFormula})`
      : cellText;

  return ok({
    cell: label,
    terms: formulaDiceTerms(resolved.value),
    roll: (faces) => {
      const rolled = evaluateFormula(
        resolved.value,
        (id) => (shown.get(id)?.kind === 'error' ? null : lookup(id)),
        faces,
      );

      if (!rolled.ok) {
        return err(
          rolled.error.code === 'field'
            ? { code: 'field', field: fieldLabel(layout, from, rolled.error.fieldId) }
            : { code: 'arithmetic' },
        );
      }

      return rolled;
    },
  });
}

// The values of one repeat block, or `null` for a repeat block that is gone.
function blockValues(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  section: PresetSection,
  row: PresetSection['rows'][number],
  instanceId: string,
  path: readonly string[] | undefined,
): FieldValues | null {
  const sectionId = repeatSectionId(section) ?? row.repeat?.id ?? null;

  if (sectionId === null) {
    return null;
  }

  const fullPath = path ?? [sectionId, instanceId];

  if (
    fullPath.at(-1) !== instanceId ||
    fullPath.at(-2) !== sectionId ||
    !liveBlockPath(records, sheetId, fullPath)
  ) {
    return null;
  }

  const data = repDataSchema.safeParse(records.get(blockPathKey(sheetId, fullPath))?.d);

  return data.success ? new Map(Object.entries(cellValues(data.data.cells))) : null;
}

function blockValuesAtScope(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  path: readonly string[] | undefined,
  scopePath: readonly string[],
): FieldValues | null {
  if (path === undefined) {
    return null;
  }

  const scopeIndex = scopePath.reduce(
    (last, scopeId, index) =>
      path[index * 2] === scopeId && path[index * 2 + 1] !== undefined ? index : -1,
    -1,
  );

  if (scopeIndex !== scopePath.length - 1) {
    return null;
  }

  const ancestorPath = path.slice(0, (scopeIndex + 1) * 2);

  if (!liveBlockPath(records, sheetId, ancestorPath)) {
    return null;
  }

  const data = repDataSchema.safeParse(records.get(blockPathKey(sheetId, ancestorPath))?.d);

  return data.success ? new Map(Object.entries(cellValues(data.data.cells))) : null;
}

function liveBlockPath(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  path: readonly string[],
): boolean {
  for (let length = 2; length <= path.length; length += 2) {
    if (
      !repDataSchema.safeParse(records.get(blockPathKey(sheetId, path.slice(0, length)))?.d).success
    ) {
      return false;
    }
  }

  return path.length > 0 && path.length % 2 === 0;
}

// A shown text stands in for the stored value, and an empty one for no value. Every row gets the
// same overlay: an id names one field in the scope it resolves in, and only that row reads it.
function withShown(values: FieldValues, shown: ShownValues): FieldValues {
  if (shown.size === 0) {
    return values;
  }

  const overlaid = new Map<string, FieldValue>(values);

  for (const [fieldId, value] of shown) {
    if (value.kind === 'text' && value.text !== '') {
      overlaid.set(fieldId, value.text);
    } else {
      overlaid.delete(fieldId);
    }
  }

  return overlaid;
}

// The label of the field `id` resolves to from the rolled row, or the id itself for an id that
// resolves to no field on the sheet. The label comes from the row that holds the field.
function fieldLabel(layout: TemplateLayout, from: TemplateRowPlace, id: string): string {
  const reference = resolveFieldReference(layout, from, id);

  if (reference === null) return id;

  const rows: readonly (readonly PresetCell[])[] =
    reference.scope === 'block'
      ? scopeRows(layout, reference.scopePath).map((row) => row.cells)
      : [plainRow(layout, reference.rowId) ?? []];

  for (const row of rows) {
    const index = row.findIndex((candidate) => candidate.kind === 'field' && candidate.id === id);
    const cell = row[index];

    if (cell !== undefined) {
      return cellLabel(cell, row.slice(0, index));
    }
  }

  return id;
}

function scopeRows(layout: TemplateLayout, scopePath: readonly string[]): PresetSection['rows'] {
  const section = repeatSectionByPath(layout, scopePath);

  return section?.rows ?? [];
}
