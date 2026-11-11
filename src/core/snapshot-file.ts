import { z } from 'zod';

import { FORMAT_VERSION } from '@/core/format-version';
import type { Preset } from '@/core/preset';
import {
  dictionaryOf,
  fieldValuesSchema,
  keySegmentSchema,
  repDataSchema,
  templateIdSchema,
  type FieldValues,
  type VersionedRecord,
} from '@/core/records';
import { isSheetSet, liveSheets } from '@/core/sheets';
import { liveLinks, tokenIdSchema } from '@/core/token-links';

// Tells a snapshot file from a preset file. Story 5.3 refuses a file without it as a bad file.
export const SNAPSHOT_FILE_TYPE = 'muster-roll/snapshot';

// Every id takes the rule of its record key segment, so each file id fits the key it came from.
const repeatBlockSchema = z.strictObject({
  instanceId: keySegmentSchema,
  order: z.number(),
  cells: fieldValuesSchema,
});

// A sheet of a sheet set names its sheet set in `set` and keeps its `order`. A single sheet has
// neither: its `id` is its template id.
const snapshotSheetSchema = z
  .strictObject({
    id: keySegmentSchema,
    set: templateIdSchema.optional(),
    order: z.number().optional(),
    // Row values by the row's id, which is the id of its first field, as in `row:` keys.
    rows: dictionaryOf(keySegmentSchema, fieldValuesSchema),
    // Repeat blocks by the section's id, as in `rep:` keys.
    repeats: dictionaryOf(keySegmentSchema, z.array(repeatBlockSchema)),
  })
  .refine((sheet) => (sheet.set === undefined) === (sheet.order === undefined));

// AD-19: a token links to a sheet, or with `instanceId` to one repeat block of it.
const snapshotLinkSchema = z.strictObject({
  tokenId: tokenIdSchema,
  sheetId: keySegmentSchema,
  instanceId: keySegmentSchema.optional(),
});

const snapshotFileFields = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  type: z.literal(SNAPSHOT_FILE_TYPE),
  sheets: z.array(snapshotSheetSchema),
  links: z.array(snapshotLinkSchema),
});

// AD-9: the export file is a different format from the room copy. It holds values and token links
// only: no `preset`, `acl:`, `plink:`, tombstones or versions. Sheet ids and token ids are unique,
// and a link names a sheet of the file and, with `instanceId`, a repeat block of that sheet, so a
// file that breaks this is refused.
export const snapshotFileSchema = snapshotFileFields.superRefine(checkIds);

export type SnapshotFile = z.infer<typeof snapshotFileSchema>;

type SnapshotSheet = z.infer<typeof snapshotSheetSchema>;

type RepeatBlock = z.infer<typeof repeatBlockSchema>;

// The sheets of every template in preset order, with their row values and repeat blocks, and the
// live links. A sheet set's sheets come by `(order, id)`, and a single sheet once, values or none.
// Repeat blocks come by `(order, instanceId)`. The keys of every dictionary (rows, sections and
// cells) are sorted, so two exports of the same records are equal byte for byte (Story 5.4 compares
// them). Fixed objects keep the key order they are built in.
export function encodeSnapshotFile(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset,
): SnapshotFile {
  // The same rule as the tabs, so no sheet the GM sees is missing from the file.
  const live = preset.templates.flatMap((template): SheetParts[] =>
    isSheetSet(template)
      ? liveSheets(records.values(), preset, template.id).map((sheet) => ({
          sheetId: sheet.sheetId,
          set: { set: sheet.set, order: sheet.order },
          rows: new Map(),
          repeats: new Map(),
        }))
      : [{ sheetId: template.id, set: null, rows: new Map(), repeats: new Map() }],
  );

  const sheets = new Map(live.map((sheet) => [sheet.sheetId, sheet]));

  for (const [key, record] of records) {
    addValues(sheets, key, record);
  }

  const links = [...liveLinks(records, preset)]
    .sort(([first], [second]) => compareCodeUnits(first, second))
    .map(([tokenId, { target }]) =>
      target.instanceId === null
        ? { tokenId, sheetId: target.sheetId }
        : { tokenId, sheetId: target.sheetId, instanceId: target.instanceId },
    );

  return {
    v: FORMAT_VERSION,
    type: SNAPSHOT_FILE_TYPE,
    sheets: live.map(snapshotSheet),
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

// `set` is `null` for a single sheet.
type SheetParts = {
  sheetId: string;
  set: { set: string; order: number } | null;
  rows: Map<string, FieldValues>;
  repeats: Map<string, RepeatBlock[]>;
};

// A `row:` or `rep:` record of a listed sheet joins it. Records of a deleted sheet stay out.
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
  const repeats = [...sheet.repeats].map(([sectionId, blocks]): [string, RepeatBlock[]] => [
    sectionId,
    [...blocks].sort(byOrderThenInstance).map((block) => ({
      instanceId: block.instanceId,
      order: block.order,
      cells: sortedValues(block.cells),
    })),
  ]);

  const rows = [...sheet.rows].map(([rowId, values]): [string, FieldValues] => [
    rowId,
    sortedValues(values),
  ]);

  const body = { rows: sortedObject(rows), repeats: sortedObject(repeats) };

  return sheet.set === null
    ? { id: sheet.sheetId, ...body }
    : { id: sheet.sheetId, set: sheet.set.set, order: sheet.set.order, ...body };
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

function byOrderThenInstance(first: RepeatBlock, second: RepeatBlock): number {
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

// The ids of one file that must be unique: sheet ids and token ids. A link must name a sheet of the
// file, and a repeat block link one of that sheet's repeat blocks. A second repeat block with one
// instance id in one sheet is no refusal: the import drops it (AD-2).
function checkIds(file: z.infer<typeof snapshotFileFields>, ctx: z.RefinementCtx): void {
  const instanceIds = new Map<string, Set<string>>();

  for (const [index, sheet] of file.sheets.entries()) {
    if (instanceIds.has(sheet.id)) {
      ctx.addIssue({
        code: 'custom',
        message: 'duplicate sheet id',
        path: ['sheets', index, 'id'],
      });
    }

    instanceIds.set(
      sheet.id,
      new Set(
        Object.values(sheet.repeats).flatMap((blocks) => blocks.map((block) => block.instanceId)),
      ),
    );
  }

  const tokenIds = new Set<string>();

  for (const [index, link] of file.links.entries()) {
    if (tokenIds.has(link.tokenId)) {
      ctx.addIssue({ code: 'custom', message: 'duplicate token id', path: ['links', index] });
    }

    const blocks = instanceIds.get(link.sheetId);

    if (blocks === undefined) {
      ctx.addIssue({ code: 'custom', message: 'link to no sheet', path: ['links', index] });
    } else if (link.instanceId !== undefined && !blocks.has(link.instanceId)) {
      ctx.addIssue({ code: 'custom', message: 'link to no repeat block', path: ['links', index] });
    }

    tokenIds.add(link.tokenId);
  }
}
