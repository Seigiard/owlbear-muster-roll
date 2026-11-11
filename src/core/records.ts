import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import { err, ok, type Result } from '@/core/result';

// Every id between the ":" of a key. `__proto__` is refused: as an object key it sets the
// prototype instead of a property, so a value under it would be lost on the next parse.
const NOT_PROTO = '(?!__proto__(?::|$))';
const KEY_SEGMENT = `${NOT_PROTO}[^:]+`;

// Owlbear names a player by an id with no ":", so it fits the `acl:` and `plink:` key forms. The
// bound keeps a forged id from making a key no message could carry. One rule for the keys and for
// every check of a player id.
const PLAYER_ID_PATTERN = `${NOT_PROTO}[^:\\s]{1,128}`;

export const playerIdSchema = z.string().regex(new RegExp(`^${PLAYER_ID_PATTERN}$`));

// One id of a record key, as a file or message names it apart from the key.
export const keySegmentSchema = z.string().regex(new RegExp(`^${KEY_SEGMENT}$`));

const presetKeySchema = z.literal('preset');
const sheetKeySchema = z.string().regex(new RegExp(`^sheet:${KEY_SEGMENT}$`));
const rowKeySchema = z.string().regex(new RegExp(`^row:${KEY_SEGMENT}:${KEY_SEGMENT}$`));
const REP_KEY_PATTERN = `^rep:${KEY_SEGMENT}:${KEY_SEGMENT}:${KEY_SEGMENT}$`;
const repKeySchema = z.string().regex(new RegExp(REP_KEY_PATTERN));
const aclKeySchema = z.string().regex(new RegExp(`^acl:${KEY_SEGMENT}:${PLAYER_ID_PATTERN}$`));
const linkKeySchema = z.string().regex(new RegExp(`^link:${KEY_SEGMENT}$`));
const plinkKeySchema = z.string().regex(new RegExp(`^plink:${KEY_SEGMENT}:${PLAYER_ID_PATTERN}$`));

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

export const fieldValuesSchema = dictionaryOf(z.string().min(1), fieldValueSchema);

export const presetDataSchema = z.base64().min(1);

export const sheetDataSchema = z.strictObject({
  kind: z.enum(['pc', 'npc']),
  name: z.string(),
  order: z.number(),
});

export const repDataSchema = z.strictObject({ order: z.number(), cells: fieldValuesSchema });

// `acl:` and `plink:` hold the player's last known name.
export const playerDataSchema = z.strictObject({ name: z.string() });

export const linkDataSchema = keySegmentSchema;

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

// The key prefix of every `plink:` of one sheet. It ends with ":", so a sheet "a" never reads the
// owner links of a sheet "ab".
export function plinkPrefix(sheetId: string): string {
  return `plink:${sheetId}:`;
}

function versionedRecordOf<Key extends z.ZodType, Data extends z.ZodType>(key: Key, data: Data) {
  return z.strictObject({
    k: key,
    d: data.nullable(),
    c: z.number().int().positive(),
    a: z.string().min(1),
  });
}

// An object with string keys. zod's record skips an own `__proto__` key in silence, as JSON.parse
// makes one, so the value under it would vanish. Such an object is refused instead.
export function dictionaryOf<Value extends z.ZodType>(key: z.ZodString, value: Value) {
  return z
    .unknown()
    .refine((input) => !(input instanceof Object && Object.hasOwn(input, '__proto__')))
    .pipe(z.record(key, value));
}
