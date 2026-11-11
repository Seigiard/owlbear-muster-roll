import { z } from 'zod';

import {
  evaluateFormula,
  formulaDiceTerms,
  formulaFieldLookup,
  type DiceTerm,
  type FaceSource,
  type RollResult,
} from '@/core/formula-evaluate';
import { parseFormula } from '@/core/formula';
import {
  firstFieldId,
  resolveFieldReference,
  type PresetCell,
  type PresetTemplate,
  type TemplateRowPlace,
} from '@/core/preset';
import { repDataSchema, repKeyPrefix, type FieldValue, type VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { cellLabel, rowValues, type FieldValues } from '@/core/sheet-values';

// What a window shows in a field it holds locally: unsent text, or an input error.
export const shownValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string() }),
  z.strictObject({ kind: z.literal('error') }),
]);

// A dice cell by position in its template. `instanceId` names the repeat row, `null` a plain row.
export const dicePlaceSchema = z.strictObject({
  sectionIndex: z.number().int().nonnegative(),
  rowIndex: z.number().int().nonnegative(),
  cellIndex: z.number().int().nonnegative(),
  instanceId: z.string().min(1).max(64).nullable(),
});

export type ShownValue = z.infer<typeof shownValueSchema>;

// By field id. The window keeps only the entry a formula in the rolled row resolves to.
export type ShownValues = ReadonlyMap<string, ShownValue>;

export type DicePlace = z.infer<typeof dicePlaceSchema>;

// `cell` is the dice button's label by the Story 1.8 rule.
export type DiceRoll = { cell: string; result: RollResult };

// `field` names the referenced field by its label, or by its id when it is not on the sheet.
// `not-dice` is a place with no dice cell or a repeat row that is gone.
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
  template: PresetTemplate,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  place: DicePlace,
  shown: ShownValues,
  faces: FaceSource,
): Result<DiceRoll, DiceRollFailure> {
  const prepared = prepareDiceRoll(template, records, sheetId, place, shown);

  if (!prepared.ok) {
    return prepared;
  }

  const rolled = prepared.value.roll(faces);

  return rolled.ok ? ok({ cell: prepared.value.cell, result: rolled.value }) : rolled;
}

// As `rollDiceCell`, with the faces left for later, so a caller can ask for them by the terms.
// `records` and `shown` must not change while the result is in use.
export function prepareDiceRoll(
  template: PresetTemplate,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  place: DicePlace,
  shown: ShownValues,
): Result<PreparedDiceRoll, DiceRollFailure> {
  const section = template.sections[place.sectionIndex];
  const row = section?.rows[place.rowIndex];
  const cell = row?.[place.cellIndex];
  const repeat = section?.repeat === true;

  if (row === undefined || cell?.kind !== 'dice' || repeat !== (place.instanceId !== null)) {
    return err({ code: 'not-dice' });
  }

  const from: TemplateRowPlace = { sectionIndex: place.sectionIndex, rowIndex: place.rowIndex };
  let ownRow: FieldValues | undefined;

  if (place.instanceId !== null) {
    const instance = instanceValues(records, sheetId, row, place.instanceId);

    if (instance === null) {
      return err({ code: 'not-dice' });
    }

    ownRow = withShown(instance, shown);
  }

  const tree = parseFormula(cell.formula);

  // The preset schema refuses a formula that does not parse, so none reaches a roll.
  if (!tree.ok) {
    return err({ code: 'arithmetic' });
  }

  const formula = tree.value;

  const lookup = formulaFieldLookup(
    template,
    from,
    (rowId) => withShown(rowValues(records, sheetId, rowId), shown),
    ownRow,
  );

  return ok({
    cell: cellLabel(cell, row.slice(0, place.cellIndex)),
    terms: formulaDiceTerms(formula),
    roll: (faces) => {
      const rolled = evaluateFormula(
        formula,
        (id) => (shown.get(id)?.kind === 'error' ? null : lookup(id)),
        faces,
      );

      if (!rolled.ok) {
        return err(
          rolled.error.code === 'field'
            ? { code: 'field', field: fieldLabel(template, from, rolled.error.fieldId) }
            : { code: 'arithmetic' },
        );
      }

      return rolled;
    },
  });
}

// The values of one repeat row, or `null` for an instance that is gone.
function instanceValues(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  row: readonly PresetCell[],
  instanceId: string,
): FieldValues | null {
  const sectionId = firstFieldId(row);

  if (sectionId === null) {
    return null;
  }

  const data = repDataSchema.safeParse(
    records.get(`${repKeyPrefix(sheetId, sectionId)}${instanceId}`)?.d,
  );

  return data.success ? new Map(Object.entries(data.data.cells)) : null;
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
// resolves to no field on the sheet.
function fieldLabel(template: PresetTemplate, from: TemplateRowPlace, id: string): string {
  const reference = resolveFieldReference(template, from, id);
  const ownRow = template.sections[from.sectionIndex]?.rows[from.rowIndex];

  const row =
    reference === null
      ? undefined
      : reference.scope === 'row'
        ? ownRow
        : sheetScopeRow(template, reference.rowId);

  const index = row?.findIndex((cell) => cell.kind === 'field' && cell.id === id) ?? -1;
  const cell = index === -1 ? undefined : row?.[index];

  return row === undefined || cell === undefined ? id : cellLabel(cell, row.slice(0, index));
}

function sheetScopeRow(template: PresetTemplate, rowId: string): readonly PresetCell[] | undefined {
  return template.sections
    .filter((section) => section.repeat !== true)
    .flatMap((section) => section.rows)
    .find((row) => firstFieldId(row) === rowId);
}
