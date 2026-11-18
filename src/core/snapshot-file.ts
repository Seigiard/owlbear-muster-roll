import { z } from 'zod';

import { blockAddress, blockIdOf, blockPathSchema, parseBlockKey } from '@/core/block-address';
import { FORMAT_VERSION } from '@/core/format-version';
import type { Preset } from '@/core/preset';
import {
  blockDataSchema,
  blockKey,
  cellValues,
  fieldValuesSchema,
  keySegmentSchema,
  templateIdSchema,
  type VersionedRecord,
} from '@/core/records';
import { isSheetSet, liveSheets } from '@/core/sheets';
import { blockOfLinkTarget } from '@/core/link-target';
import { liveLinks, tokenIdSchema } from '@/core/token-links';

export const SNAPSHOT_FILE_TYPE = 'muster-roll/snapshot';

const blockSchema = z.strictObject({
  path: blockPathSchema,
  order: z.number(),
  cells: fieldValuesSchema,
});

const sheetSchema = z
  .strictObject({
    id: keySegmentSchema,
    set: templateIdSchema.optional(),
    order: z.number().optional(),
    cells: fieldValuesSchema,
    blocks: z.array(blockSchema),
  })
  .refine((sheet) => (sheet.set === undefined) === (sheet.order === undefined));

const linkSchema = z.strictObject({
  tokenId: tokenIdSchema,
  sheetId: keySegmentSchema,
  path: blockPathSchema.optional(),
  cellId: keySegmentSchema,
});

const fileSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  type: z.literal(SNAPSHOT_FILE_TYPE),
  sheets: z.array(sheetSchema),
  links: z.array(linkSchema),
});

export const snapshotFileSchema = fileSchema.superRefine((file, context) => {
  const sheets = new Map<string, Set<string>>();

  for (const [index, sheet] of file.sheets.entries()) {
    if (sheets.has(sheet.id))
      context.addIssue({
        code: 'custom',
        message: 'duplicate sheet id',
        path: ['sheets', index, 'id'],
      });
    const paths = new Set<string>();
    const instances = new Set<string>();

    for (const [blockIndex, block] of sheet.blocks.entries()) {
      const path = block.path.join(':');
      const address = blockAddress(sheet.id, block.path);
      const instance = address === null ? '' : (blockIdOf(address) ?? '');

      if (paths.has(path))
        context.addIssue({
          code: 'custom',
          message: 'duplicate block path',
          path: ['sheets', index, 'blocks', blockIndex, 'path'],
        });

      if (block.path.length === 2 && instances.has(instance))
        context.addIssue({
          code: 'custom',
          message: 'duplicate block instance id',
          path: ['sheets', index, 'blocks', blockIndex, 'path'],
        });
      paths.add(path);

      if (block.path.length === 2) instances.add(instance);
    }

    sheets.set(sheet.id, instances);
  }

  const tokens = new Set<string>();

  for (const [index, link] of file.links.entries()) {
    if (tokens.has(link.tokenId))
      context.addIssue({ code: 'custom', message: 'duplicate token id', path: ['links', index] });
    tokens.add(link.tokenId);
    const blocks = sheets.get(link.sheetId);

    if (
      blocks === undefined ||
      (link.path !== undefined && !hasSnapshotPath(file.sheets, link.sheetId, link.path))
    ) {
      context.addIssue({ code: 'custom', message: 'link to no block', path: ['links', index] });
    }
  }
});

function hasSnapshotPath(
  sheets: readonly z.infer<typeof sheetSchema>[],
  sheetId: string,
  path: readonly string[],
): boolean {
  return (
    sheets
      .find((sheet) => sheet.id === sheetId)
      ?.blocks.some((block) => block.path.join(':') === path.join(':')) ?? false
  );
}

export type SnapshotFile = z.infer<typeof snapshotFileSchema>;

export function encodeSnapshotFile(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset,
): SnapshotFile {
  const sheets = preset.templates.flatMap((template): SnapshotFile['sheets'] => {
    const ids = isSheetSet(template)
      ? liveSheets(records.values(), preset, template.id)
      : [{ sheetId: template.id, order: 0 }];

    return ids.map((sheet) => {
      const root = blockDataSchema.safeParse(records.get(blockKey(sheet.sheetId))?.d).data;
      const blocks: SnapshotFile['sheets'][number]['blocks'] = [];

      for (const record of records.values()) {
        const parts = parseBlockKey(record.k);
        const data = blockDataSchema.safeParse(record.d).data;

        if (parts?.sheetId === sheet.sheetId && parts.path.length > 0 && data !== undefined) {
          blocks.push({
            path: [...parts.path],
            order: data.order,
            cells: sorted(cellValues(data.cells)),
          });
        }
      }

      blocks.sort((a, b) => a.order - b.order || compare(a.path.join(':'), b.path.join(':')));

      const body = {
        id: sheet.sheetId,
        cells: sorted(cellValues(root?.cells ?? {})),
        blocks,
      };

      return isSheetSet(template) ? { ...body, set: template.id, order: sheet.order } : body;
    });
  });

  const links = [...liveLinks(records, preset)]
    .sort(([a], [b]) => compare(a, b))
    .map(([tokenId, { target }]) => {
      const block = blockOfLinkTarget(target);

      return block.path.length === 0
        ? { tokenId, sheetId: block.sheetId, cellId: target.cellId ?? '' }
        : { tokenId, sheetId: block.sheetId, path: [...block.path], cellId: target.cellId ?? '' };
    });

  return { v: FORMAT_VERSION, type: SNAPSHOT_FILE_TYPE, sheets, links };
}

export function formatSnapshotFile(file: SnapshotFile): string {
  return JSON.stringify(file, null, 2);
}

export function snapshotFileName(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `muster-roll-snapshot-${now.getFullYear()}-${month}-${day}.json`;
}

function sorted<Value>(values: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(Object.entries(values).sort(([a], [b]) => compare(a, b)));
}

function compare(first: string, second: string): number {
  return first === second ? 0 : first < second ? -1 : 1;
}
