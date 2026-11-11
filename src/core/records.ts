import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import { err, ok, type Result } from '@/core/result';

const presetKeySchema = z.literal('preset');
const sheetKeySchema = z.string().regex(/^sheet:[^:]+$/);
const rowKeySchema = z.string().regex(/^row:[^:]+:[^:]+$/);
const repKeySchema = z.string().regex(/^rep:[^:]+:[^:]+:[^:]+$/);
const aclKeySchema = z.string().regex(/^acl:[^:]+:[^:]+$/);
const linkKeySchema = z.string().regex(/^link:[^:]+$/);
const plinkKeySchema = z.string().regex(/^plink:[^:]+:[^:]+$/);

export const recordKeySchema = z.union([
  presetKeySchema,
  sheetKeySchema,
  rowKeySchema,
  repKeySchema,
  aclKeySchema,
  linkKeySchema,
  plinkKeySchema,
]);

// An empty text field has no key, so "" is never a stored value.
export const fieldValueSchema = z.union([z.number(), z.string().min(1), z.boolean()]);

export const fieldValuesSchema = z.record(z.string().min(1), fieldValueSchema);

export const presetDataSchema = z.base64().min(1);

export const sheetDataSchema = z.strictObject({
  kind: z.enum(['pc', 'npc']),
  name: z.string(),
  order: z.number(),
});

export const repDataSchema = z.strictObject({ order: z.number(), cells: fieldValuesSchema });

const playerDataSchema = z.strictObject({ name: z.string() });

export const linkDataSchema = z.string().regex(/^[^:]+$/);

export const recordSchema = z.union([
  versionedRecordOf(presetKeySchema, presetDataSchema),
  versionedRecordOf(sheetKeySchema, sheetDataSchema),
  versionedRecordOf(rowKeySchema, fieldValuesSchema),
  versionedRecordOf(repKeySchema, repDataSchema),
  versionedRecordOf(aclKeySchema, playerDataSchema),
  versionedRecordOf(linkKeySchema, linkDataSchema),
  versionedRecordOf(plinkKeySchema, playerDataSchema),
]);

export type VersionedRecord = z.infer<typeof recordSchema>;

export type SheetData = z.infer<typeof sheetDataSchema>;

export type FieldValue = z.infer<typeof fieldValueSchema>;

export type FieldValues = z.infer<typeof fieldValuesSchema>;

export type RepData = z.infer<typeof repDataSchema>;

export type RecordFailure = 'invalid-record';

export function parseRecord(candidate: JsonValue): Result<VersionedRecord, RecordFailure> {
  const parsed = recordSchema.safeParse(candidate);

  return parsed.success ? ok(parsed.data) : err('invalid-record');
}

export function parseStoredRecord(
  text: string,
  expectedKey: string,
): Result<VersionedRecord, RecordFailure> {
  try {
    const parsed = recordSchema.safeParse(JSON.parse(text));

    // A record filed under another key must not take that key's place.
    return parsed.success && parsed.data.k === expectedKey
      ? ok(parsed.data)
      : err('invalid-record');
  } catch {
    return err('invalid-record');
  }
}

// The key of one sheet's record of the plain row whose first field is `rowId`.
export function rowKey(sheetId: string, rowId: string): string {
  return `row:${sheetId}:${rowId}`;
}

// The key prefix of every row one sheet has in one repeat section. It ends with ":", so a sheet "a"
// never reads the rows of a sheet "ab".
export function repKeyPrefix(sheetId: string, sectionId: string): string {
  return `rep:${sheetId}:${sectionId}:`;
}

// A tombstoned sheet is deleted, so it does not count.
export function hasLiveSheet(records: Iterable<VersionedRecord>): boolean {
  for (const record of records) {
    if (record.k.startsWith('sheet:') && record.d !== null) {
      return true;
    }
  }

  return false;
}

function versionedRecordOf<Key extends z.ZodType, Data extends z.ZodType>(key: Key, data: Data) {
  return z.strictObject({
    k: key,
    d: data.nullable(),
    c: z.number().int().positive(),
    a: z.string().min(1),
  });
}
