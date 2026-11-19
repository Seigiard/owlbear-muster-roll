import { z } from 'zod';

import {
  blockKeyOf,
  blockPathSchema,
  scopePathOf,
  type BlockAddress,
  wireBlockPathSchema,
} from '@/core/block-address';
import type { JsonValue } from '@/core/json';
import { recordFitsOneMessage } from '@/core/message-size';
import {
  plainRow,
  repeatSectionByPath,
  repeatScopeByPath,
  sectionFields,
  type PresetFieldCell,
  type TemplateLayout,
} from '@/core/preset';
import {
  blockDataSchema,
  repDataSchema,
  rowKey,
  type FieldValue,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';

const targetIdSchema = z.string().min(1).max(64);

// A patch lands in the record of one preset row, or of one repeat block, which holds the fields of
// every row of its section.
export const fieldPatchTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('row'), rowId: targetIdSchema }),
  z.strictObject({
    kind: z.literal('rep'),
    block: z.strictObject({
      sheetId: targetIdSchema,
      path: blockPathSchema,
    }),
  }),
]);

// The wire message keeps arrays mutable for the JSON transport. Public callers may still provide
// readonly tuples; the client copies them at the transport boundary.
export const fieldPatchTargetWireSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('row'), rowId: targetIdSchema }),
  z.strictObject({
    kind: z.literal('rep'),
    sectionId: targetIdSchema,
    instanceId: targetIdSchema,
    path: wireBlockPathSchema.optional(),
  }),
]);

export type FieldPatchWireTarget =
  | { kind: 'row'; rowId: string }
  | { kind: 'rep'; sectionId: string; instanceId: string; path?: readonly string[] };

// zod's number refuses Infinity and NaN. An empty text is a clear, sent as `null`.
const VALUE_SCHEMAS = {
  number: z.number(),
  text: z.string().min(1),
  check: z.boolean(),
  select: z.string().min(1),
  'dice-choice': z.string().min(1),
} as const satisfies Record<PresetFieldCell['type'], z.ZodType<FieldValue>>;

// The largest id on the wire, standing in for the author a record gets when it is minted. The
// window does not know the background's connection id, and both sides must measure the same record.
const AUTHOR_STAND_IN = 'a'.repeat(64);

export type FieldPatchTarget =
  | { kind: 'row'; rowId: string }
  | { kind: 'rep'; block: BlockAddress };

// A clear remains a cell, so delayed values cannot restore it.
export type FieldPatchValue = FieldValue | null;

export type PatchedRecord = { k: string; d: z.infer<typeof blockDataSchema> };

export type FieldPatchFailure = 'unknown-instance' | 'unchanged';

export function patchRecordKey(sheetId: string, target: FieldPatchTarget): string {
  if (target.kind === 'row') return rowKey(sheetId, target.rowId);

  return blockKeyOf(target.block);
}

// The field with this id in the target: the plain row whose first field is `rowId`, or any row of
// the repeat section `sectionId` names. A field of another row or section does not count.
export function findPatchField(
  layout: TemplateLayout,
  target: FieldPatchTarget,
  fieldId: string,
): PresetFieldCell | null {
  return targetFields(layout, target)?.find((field) => field.id === fieldId) ?? null;
}

// The fields of the target: a plain row whose first field is `rowId`, or every row of the repeat
// section `sectionId` names, as one repeat block holds them. `null` when the template has no such
// row or section.
export function targetFields(
  layout: TemplateLayout,
  target: FieldPatchTarget,
): PresetFieldCell[] | null {
  if (target.kind === 'rep') {
    const scopePath = scopePathOf(target.block);
    const scope = repeatScopeByPath(layout, scopePath);

    if (scope?.row !== null && scope?.row !== undefined) {
      return scope.row.cells.filter((cell): cell is PresetFieldCell => cell.kind === 'field');
    }

    const section = repeatSectionByPath(layout, scopePath);

    return section === null ? null : sectionFields(section);
  }

  const row = plainRow(layout, target.rowId);

  return row === null ? null : row.filter((cell) => cell.kind === 'field');
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

// The record data after the patch, merged into what the record holds now. An absent or deleted row
// record starts empty. A repeat block must be live, because only an add command makes one. A patch
// that changes nothing is refused, so no version is minted for it.
export function patchedRecord(
  sheetId: string,
  target: FieldPatchTarget,
  current: VersionedRecord | undefined,
  fieldId: string,
  value: FieldPatchValue,
): Result<PatchedRecord, FieldPatchFailure> {
  const k = patchRecordKey(sheetId, target);

  const block = repDataSchema.safeParse(current?.d);

  if (!block.success) {
    if (current?.d === null || target.kind === 'rep') return err('unknown-instance');

    return value === null
      ? err('unchanged')
      : ok({
          k,
          d: { order: 0, cells: { [fieldId]: [value, Number.MAX_SAFE_INTEGER, AUTHOR_STAND_IN] } },
        });
  }

  if (sameFieldValue(block.data.cells[fieldId]?.[0], value)) return err('unchanged');

  return ok({
    k,
    d: {
      ...block.data,
      cells: {
        ...block.data.cells,
        [fieldId]: [value, Number.MAX_SAFE_INTEGER, AUTHOR_STAND_IN],
      },
    },
  });
}

// Measured at the largest version the record can reach, so a patch that passes here still fits
// when the background mints it. The window measures its projection copy of the record, which can
// lag behind, so the background's check on its own replica is the one that decides.
export function patchedRecordFits(record: PatchedRecord): boolean {
  return recordFitsOneMessage({
    ...record,
    c: Number.MAX_SAFE_INTEGER,
    a: AUTHOR_STAND_IN,
    l: [Number.MAX_SAFE_INTEGER, AUTHOR_STAND_IN],
  });
}

export function sameFieldValue(
  first: FieldPatchValue | undefined,
  second: FieldPatchValue | undefined,
): boolean {
  return (first ?? null) === (second ?? null);
}
