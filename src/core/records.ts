import { z } from 'zod';

import { isTemplateId } from '@/core/field-id';
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

const blockKeySchema = z
  .string()
  .regex(new RegExp(`^blk:${KEY_SEGMENT}(?::${KEY_SEGMENT}:${KEY_SEGMENT})*$`));

const aclKeySchema = z.string().regex(new RegExp(`^acl:${KEY_SEGMENT}:${PLAYER_ID_PATTERN}$`));
const linkKeySchema = z.string().regex(new RegExp(`^link:${KEY_SEGMENT}$`));
const plinkKeySchema = z.string().regex(new RegExp(`^plink:${KEY_SEGMENT}:${PLAYER_ID_PATTERN}$`));

export const recordKeySchema = z.union([
  presetKeySchema,
  blockKeySchema,
  aclKeySchema,
  linkKeySchema,
  plinkKeySchema,
]);

// Empty text is represented by a null cell, never "".
export const fieldValueSchema = z.union([z.number(), z.string().min(1), z.boolean()]);

export const fieldValuesSchema = dictionaryOf(z.string().min(1), fieldValueSchema);

export const lifecycleSchema = z.tuple([z.number().int().positive(), z.string().min(1)]);

export const cellSchema = z.tuple([
  fieldValueSchema.nullable(),
  z.number().int().positive(),
  z.string().min(1),
]);

export const cellsSchema = dictionaryOf(z.string().min(1), cellSchema);

export const presetDataSchema = z.base64().min(1);

// A template id of the preset, as `set` names one.
export const templateIdSchema = z.string().refine(isTemplateId);

// Roots and repeat instances share one shape; only a sheet-set root carries `set`.
export const blockDataSchema = z.strictObject({
  order: z.number(),
  set: templateIdSchema.optional(),
  cells: cellsSchema,
});

export const sheetDataSchema = blockDataSchema.extend({ set: templateIdSchema });
export const repDataSchema = blockDataSchema;

// `acl:` and `plink:` hold the player's last known name.
export const playerDataSchema = z.strictObject({ name: z.string() });

// AD-19: a token links to the sheet `s`, or with `i` to its repeat block of that instance id. The
// repeat block's scope is read from its `blk:` key, as an instance id is unique in its sheet.
export const linkDataSchema = z.strictObject({
  s: keySegmentSchema,
  i: keySegmentSchema.optional(),
});

export const recordSchema = z.union([
  versionedRecordOf(presetKeySchema, presetDataSchema),
  versionedRecordOf(blockKeySchema, blockDataSchema).extend({ l: lifecycleSchema }),
  versionedRecordOf(aclKeySchema, playerDataSchema),
  versionedRecordOf(linkKeySchema, linkDataSchema),
  versionedRecordOf(plinkKeySchema, playerDataSchema),
]);

export type VersionedRecord = z.infer<typeof recordSchema>;

export type SheetData = z.infer<typeof sheetDataSchema>;

export type FieldValue = z.infer<typeof fieldValueSchema>;

export type FieldValues = z.infer<typeof fieldValuesSchema>;

export type RepData = z.infer<typeof repDataSchema>;

export type BlockData = z.infer<typeof blockDataSchema>;

export type Cell = z.infer<typeof cellSchema>;

export type Cells = z.infer<typeof cellsSchema>;

export type Lifecycle = z.infer<typeof lifecycleSchema>;

export function blockKey(sheetId: string): string {
  return `blk:${sheetId}`;
}

export function cellValues(cells: Readonly<Cells>): FieldValues {
  return Object.fromEntries(
    Object.entries(cells).flatMap(([id, [value]]) => (value === null ? [] : [[id, value]])),
  );
}

export function versionCells(
  values: Readonly<Record<string, FieldValue | null>>,
  c: number,
  a: string,
): Cells {
  return Object.fromEntries(Object.entries(values).map(([id, value]) => [id, [value, c, a]]));
}

export type LinkData = z.infer<typeof linkDataSchema>;

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

// A plain row is a command address, not a storage identity.
export function rowKey(sheetId: string, rowId: string): string {
  void rowId;

  return blockKey(sheetId);
}

// The key prefix of every repeat block one sheet has in one repeat section. It ends with ":", so a
// sheet "a" never reads the repeat blocks of a sheet "ab".
export function repKeyPrefix(sheetId: string, sectionId: string): string {
  return `blk:${sheetId}:${sectionId}:`;
}

export function repKey(sheetId: string, sectionId: string, instanceId: string): string {
  return `${repKeyPrefix(sheetId, sectionId)}${instanceId}`;
}

export type RepKeyParts = { sheetId: string; sectionId: string; instanceId: string };

// The ids of one repeat level, or null for a root or another key form.
export function parseRepKey(key: string): RepKeyParts | null {
  const [form, sheetId, sectionId, instanceId, ...rest] = key.split(':');

  if (
    form !== 'blk' ||
    sheetId === undefined ||
    sheetId === '' ||
    sectionId === undefined ||
    sectionId === '' ||
    instanceId === undefined ||
    instanceId === '' ||
    rest.length > 0
  ) {
    return null;
  }

  return { sheetId, sectionId, instanceId };
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
    l: lifecycleSchema.optional(),
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
