import { z } from 'zod';

import { sheetDataSchema, type SheetData, type VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';

export const SHEET_NAME_MAX_LENGTH = 100;

// The nanoid alphabet. A narrower rule than the record key's, so an id never holds ":".
export const sheetIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export type SheetSummary = SheetData & { sheetId: string };

export type SheetNameFailure = 'empty' | 'too-long';

export function sheetKey(sheetId: string): string {
  return `sheet:${sheetId}`;
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
