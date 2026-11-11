import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import { recordFitsOneMessage } from '@/core/message-size';
import {
  firstFieldId,
  type PresetCell,
  type PresetFieldCell,
  type PresetTemplate,
} from '@/core/preset';
import {
  fieldValuesSchema,
  repDataSchema,
  repKeyPrefix,
  type FieldValue,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';

const targetIdSchema = z.string().min(1).max(64);

// A patch lands in the record of one preset row, or of one repeat instance.
export const fieldPatchTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('row'), rowId: targetIdSchema }),
  z.strictObject({
    kind: z.literal('rep'),
    sectionId: targetIdSchema,
    instanceId: targetIdSchema,
  }),
]);

// zod's number refuses Infinity and NaN. An empty text is a clear, sent as `null`.
const VALUE_SCHEMAS = {
  number: z.number(),
  text: z.string().min(1),
  check: z.boolean(),
} as const satisfies Record<PresetFieldCell['type'], z.ZodType<FieldValue>>;

// The largest id on the wire, standing in for the author a record gets when it is minted. The
// window does not know the background's connection id, and both sides must measure the same record.
const AUTHOR_STAND_IN = 'a'.repeat(64);

export type FieldPatchTarget = z.infer<typeof fieldPatchTargetSchema>;

// `null` clears the field: its key leaves the record.
export type FieldPatchValue = FieldValue | null;

export type PatchedRecord =
  | { k: string; d: z.infer<typeof fieldValuesSchema> }
  | { k: string; d: z.infer<typeof repDataSchema> };

export type FieldPatchFailure = 'unknown-instance' | 'unchanged';

export function patchRecordKey(sheetId: string, target: FieldPatchTarget): string {
  return target.kind === 'row'
    ? `row:${sheetId}:${target.rowId}`
    : `${repKeyPrefix(sheetId, target.sectionId)}${target.instanceId}`;
}

// The field with this id in the targeted row: a plain row whose first field names it, or the
// template row of the repeat section it names. A field of another row does not count.
export function findPatchField(
  template: PresetTemplate,
  target: FieldPatchTarget,
  fieldId: string,
): PresetFieldCell | null {
  const row = targetRow(template, target);
  const field = row?.find((cell) => cell.kind === 'field' && cell.id === fieldId);

  return field?.kind === 'field' ? field : null;
}

// The fields of the targeted row: a plain row whose first field is `rowId`, or the template row of
// the repeat section it names. `null` when the template has no such row.
export function targetFields(
  template: PresetTemplate,
  target: { kind: 'row'; rowId: string } | { kind: 'rep'; sectionId: string },
): PresetFieldCell[] | null {
  const row = targetRow(template, target);

  return row === null ? null : row.filter((cell) => cell.kind === 'field');
}

// A repeat section is named by the id of its template row's first field.
export function isRepeatSectionId(template: PresetTemplate, sectionId: string): boolean {
  return targetRow(template, { kind: 'rep', sectionId }) !== null;
}

// `number` takes a finite number, `text` a non-empty string and `check` a boolean. Any type may
// be cleared.
export function acceptedFieldValue(
  field: PresetFieldCell,
  value: JsonValue,
): Result<FieldPatchValue, 'invalid-value'> {
  if (value === null) {
    return ok(null);
  }

  const parsed = VALUE_SCHEMAS[field.type].safeParse(value);

  return parsed.success ? ok(parsed.data) : err('invalid-value');
}

// The record data after the patch, merged into what the record holds now. An absent or deleted
// row record starts empty. A repeat instance must be live, because only Story 1.10 adds one. A patch
// that changes nothing is refused, so no version is minted for it.
export function patchedRecord(
  sheetId: string,
  target: FieldPatchTarget,
  current: VersionedRecord | undefined,
  fieldId: string,
  value: FieldPatchValue,
): Result<PatchedRecord, FieldPatchFailure> {
  const k = patchRecordKey(sheetId, target);

  if (target.kind === 'row') {
    const values = fieldValuesSchema.safeParse(current?.d);
    const cells = withValue(values.success ? values.data : {}, fieldId, value);

    return cells === null ? err('unchanged') : ok({ k, d: cells });
  }

  const instance = repDataSchema.safeParse(current?.d);

  if (!instance.success) {
    return err('unknown-instance');
  }

  const cells = withValue(instance.data.cells, fieldId, value);

  return cells === null ? err('unchanged') : ok({ k, d: { ...instance.data, cells } });
}

// Measured at the largest version the record can reach, so a patch that passes here still fits
// when the background mints it. The window measures its projection copy of the record, which can
// lag behind, so the background's check on its own replica is the one that decides.
export function patchedRecordFits(record: PatchedRecord): boolean {
  return recordFitsOneMessage({ ...record, c: Number.MAX_SAFE_INTEGER, a: AUTHOR_STAND_IN });
}

export function sameFieldValue(
  first: FieldPatchValue | undefined,
  second: FieldPatchValue | undefined,
): boolean {
  return (first ?? null) === (second ?? null);
}

// `null` when the value is already there, or a clear finds no key.
function withValue(
  values: Readonly<Record<string, FieldValue>>,
  fieldId: string,
  value: FieldPatchValue,
): Record<string, FieldValue> | null {
  const present = Object.hasOwn(values, fieldId) ? values[fieldId] : undefined;

  if (sameFieldValue(present, value)) {
    return null;
  }

  const next = { ...values };

  if (value === null) {
    delete next[fieldId];
  } else {
    next[fieldId] = value;
  }

  return next;
}

function targetRow(
  template: PresetTemplate,
  target: { kind: 'row'; rowId: string } | { kind: 'rep'; sectionId: string },
): readonly PresetCell[] | null {
  const id = target.kind === 'row' ? target.rowId : target.sectionId;

  for (const section of template.sections) {
    if ((section.repeat === true) === (target.kind === 'rep')) {
      const row = section.rows.find((cells) => firstFieldId(cells) === id);

      if (row !== undefined) {
        return row;
      }
    }
  }

  return null;
}
