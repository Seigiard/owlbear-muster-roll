import { z } from 'zod';

import { FORMAT_VERSION } from '@/core/format-version';
import {
  dictionaryOf,
  fieldValuesSchema,
  keySegmentSchema,
  repDataSchema,
  sheetDataSchema,
  type FieldValues,
  type VersionedRecord,
} from '@/core/records';
import { liveSheets, sortSheets } from '@/core/sheets';
import { liveLinks, tokenIdSchema } from '@/core/token-links';

// Tells a snapshot file from a preset file. Story 5.3 refuses a file without it as a bad file.
export const SNAPSHOT_FILE_TYPE = 'muster-roll/snapshot';

// Every id takes the rule of its record key segment, so each file id fits the key it came from.
const repeatRowSchema = z.strictObject({
  instanceId: keySegmentSchema,
  order: z.number(),
  cells: fieldValuesSchema,
});

const snapshotSheetSchema = z.strictObject({
  id: keySegmentSchema,
  kind: sheetDataSchema.shape.kind,
  name: sheetDataSchema.shape.name,
  order: sheetDataSchema.shape.order,
  // Row values by the row's id, which is the id of its first field, as in `row:` keys.
  rows: dictionaryOf(keySegmentSchema, fieldValuesSchema),
  // Repeat rows by the section's id, as in `rep:` keys.
  repeats: dictionaryOf(keySegmentSchema, z.array(repeatRowSchema)),
});

const snapshotLinkSchema = z.strictObject({ tokenId: tokenIdSchema, sheetId: keySegmentSchema });

const snapshotFileFields = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  type: z.literal(SNAPSHOT_FILE_TYPE),
  sheets: z.array(snapshotSheetSchema),
  links: z.array(snapshotLinkSchema),
});

// AD-9: the export file is a different format from the room copy. It holds values and token links
// only: no `preset`, `acl:`, `plink:`, tombstones or versions. Each id names one record key, so a
// file with two records under one key, or a link to a sheet it does not hold, is refused.
export const snapshotFileSchema = snapshotFileFields.superRefine(checkIds);

export type SnapshotFile = z.infer<typeof snapshotFileSchema>;

type SnapshotSheet = z.infer<typeof snapshotSheetSchema>;

type RepeatRow = z.infer<typeof repeatRowSchema>;

// The live sheets with their row values and repeat rows, and the links to them. Sheets come by
// `(order, id)` and repeat rows by `(order, instanceId)`. The keys of every dictionary (rows,
// sections and cells) are sorted, so two exports of the same records are equal byte for byte
// (Story 5.4 compares them). Fixed objects keep the key order they are built in.
export function encodeSnapshotFile(records: ReadonlyMap<string, VersionedRecord>): SnapshotFile {
  // The same rule as the tabs, so no sheet the GM sees is missing from the file.
  const live = [...liveSheets(records.values(), 'pc'), ...liveSheets(records.values(), 'npc')];

  const sheets = new Map(
    live.map((sheet): [string, SheetParts] => [
      sheet.sheetId,
      { ...sheet, rows: new Map(), repeats: new Map() },
    ]),
  );

  for (const [key, record] of records) {
    addValues(sheets, key, record);
  }

  const links = [...liveLinks(records)]
    .sort(([first], [second]) => compareCodeUnits(first, second))
    .map(([tokenId, sheetId]) => ({ tokenId, sheetId }));

  return {
    v: FORMAT_VERSION,
    type: SNAPSHOT_FILE_TYPE,
    sheets: sortSheets([...sheets.values()]).map(snapshotSheet),
    links,
  };
}

// The downloaded text: pretty-printed with 2 spaces, as the preset download.
export function formatSnapshotFile(file: SnapshotFile): string {
  return JSON.stringify(file, null, 2);
}

// `muster-roll-snapshot-YYYY-MM-DD.json`, by the local date of `now`.
export function snapshotFileName(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `muster-roll-snapshot-${now.getFullYear()}-${month}-${day}.json`;
}

type SheetParts = {
  sheetId: string;
  kind: SnapshotSheet['kind'];
  name: string;
  order: number;
  rows: Map<string, FieldValues>;
  repeats: Map<string, RepeatRow[]>;
};

// A `row:` or `rep:` record of a live sheet joins it. Records of a deleted sheet stay out.
function addValues(
  sheets: ReadonlyMap<string, SheetParts>,
  key: string,
  record: VersionedRecord,
): void {
  const [form, sheetId = '', id = '', instanceId = ''] = key.split(':');
  const sheet = form === 'row' || form === 'rep' ? sheets.get(sheetId) : undefined;

  if (sheet === undefined) {
    return;
  }

  if (form === 'row') {
    const values = fieldValuesSchema.safeParse(record.d);

    if (values.success) {
      sheet.rows.set(id, values.data);
    }
  } else if (form === 'rep') {
    const data = repDataSchema.safeParse(record.d);

    if (data.success) {
      const section = sheet.repeats.get(id) ?? [];

      section.push({ instanceId, order: data.data.order, cells: data.data.cells });
      sheet.repeats.set(id, section);
    }
  }
}

function snapshotSheet(sheet: SheetParts): SnapshotSheet {
  const repeats = [...sheet.repeats].map(([sectionId, rows]): [string, RepeatRow[]] => [
    sectionId,
    [...rows].sort(byOrderThenInstance).map((row) => ({
      instanceId: row.instanceId,
      order: row.order,
      cells: sortedValues(row.cells),
    })),
  ]);

  const rows = [...sheet.rows].map(([rowId, values]): [string, FieldValues] => [
    rowId,
    sortedValues(values),
  ]);

  return {
    id: sheet.sheetId,
    kind: sheet.kind,
    name: sheet.name,
    order: sheet.order,
    rows: sortedObject(rows),
    repeats: sortedObject(repeats),
  };
}

function sortedValues(values: FieldValues): FieldValues {
  return sortedObject(Object.entries(values));
}

// Records refuse a `__proto__` id, so no key here can set the prototype. JavaScript lists
// integer-like keys first, by number, whatever the sort, so their place is fixed as well.
function sortedObject<Value>(entries: [string, Value][]): Record<string, Value> {
  return Object.fromEntries(
    [...entries].sort(([first], [second]) => compareCodeUnits(first, second)),
  );
}

function byOrderThenInstance(first: RepeatRow, second: RepeatRow): number {
  return first.order === second.order
    ? compareCodeUnits(first.instanceId, second.instanceId)
    : first.order - second.order;
}

// By code unit, not by locale, so every client and reload gets the same order.
function compareCodeUnits(first: string, second: string): number {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
}

// The ids of one file that must be unique: sheet ids, token ids, and instance ids in one section.
// A link must name a sheet of the file.
function checkIds(file: z.infer<typeof snapshotFileFields>, ctx: z.RefinementCtx): void {
  const sheetIds = new Set<string>();

  for (const [index, sheet] of file.sheets.entries()) {
    if (sheetIds.has(sheet.id)) {
      ctx.addIssue({
        code: 'custom',
        message: 'duplicate sheet id',
        path: ['sheets', index, 'id'],
      });
    }

    sheetIds.add(sheet.id);

    for (const [sectionId, rows] of Object.entries(sheet.repeats)) {
      const instanceIds = new Set<string>();

      for (const [rowIndex, row] of rows.entries()) {
        if (instanceIds.has(row.instanceId)) {
          ctx.addIssue({
            code: 'custom',
            message: 'duplicate instance id',
            path: ['sheets', index, 'repeats', sectionId, rowIndex, 'instanceId'],
          });
        }

        instanceIds.add(row.instanceId);
      }
    }
  }

  const tokenIds = new Set<string>();

  for (const [index, link] of file.links.entries()) {
    if (tokenIds.has(link.tokenId)) {
      ctx.addIssue({ code: 'custom', message: 'duplicate token id', path: ['links', index] });
    }

    if (!sheetIds.has(link.sheetId)) {
      ctx.addIssue({ code: 'custom', message: 'link to no sheet', path: ['links', index] });
    }

    tokenIds.add(link.tokenId);
  }
}
