import { z } from 'zod';

import { sheetDataSchema, type SheetData, type VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';

export const SHEET_NAME_MAX_LENGTH = 100;

// The nanoid alphabet. A narrower rule than the record key's, so an id never holds ":".
export const sheetIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// The forms whose key holds the sheet id right after the form name. A `link:` key holds a token id
// instead, so it is matched by its data.
const KEYED_DEPENDENT_FORMS = ['row', 'rep', 'acl', 'plink'] as const;

export type SheetSummary = SheetData & { sheetId: string };

export type SheetNameFailure = 'empty' | 'too-long';

export function sheetKey(sheetId: string): string {
  return `sheet:${sheetId}`;
}

// True for a live record the sheet's deletion must tombstone with it. A tombstone needs no second
// one, so the caller filters tombstones out first. The trailing ":" keeps a sheet "a" from matching
// the records of a sheet "ab".
export function isSheetDependent(
  key: string,
  record: Pick<VersionedRecord, 'd'>,
  sheetId: string,
): boolean {
  if (key.startsWith('link:')) {
    return record.d === sheetId;
  }

  return KEYED_DEPENDENT_FORMS.some((form) => key.startsWith(`${form}:${sheetId}:`));
}

export function parseSheetName(candidate: string): Result<string, SheetNameFailure> {
  const name = candidate.trim();

  if (name === '') {
    return err('empty');
  }

  // Counted in code points, so a letter outside the BMP counts once and not as two code units.
  if (Array.from(name).length > SHEET_NAME_MAX_LENGTH) {
    return err('too-long');
  }

  return ok(name);
}

// Ties compare by code unit, not by locale, so every client and reload gets the same order.
export function sortSheets<Sheet extends Pick<SheetSummary, 'sheetId' | 'order'>>(
  sheets: readonly Sheet[],
): Sheet[] {
  return [...sheets].sort((first, second) => {
    if (first.order !== second.order) {
      return first.order - second.order;
    }

    if (first.sheetId === second.sheetId) {
      return 0;
    }

    return first.sheetId < second.sheetId ? -1 : 1;
  });
}

// A tombstoned sheet is deleted, so it is not listed.
export function liveSheets(
  records: Iterable<VersionedRecord>,
  kind: SheetData['kind'],
): SheetSummary[] {
  const sheets: SheetSummary[] = [];

  for (const record of records) {
    if (record.k.startsWith('sheet:')) {
      const data = sheetDataSchema.safeParse(record.d);

      if (data.success && data.data.kind === kind) {
        sheets.push({ sheetId: record.k.slice('sheet:'.length), ...data.data });
      }
    }
  }

  return sortSheets(sheets);
}
