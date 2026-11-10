import { sheetDataSchema, type VersionedRecord } from '@/core/records';
import { dependentSheetId, isDependentKey, liveSheets, type SheetSummary } from '@/core/sheets';

export type PlayerRole = 'GM' | 'PLAYER';

export type VisibleSheets = { characters: SheetSummary[]; npcs: SheetSummary[] };

// FR2: a GM sees every record. A player sees the preset, every character and the records that
// depend on one, and no NPC. Hiding is at the interface only: a player client still holds and
// merges NPC records. A dependent record shows only while `known` holds its sheet as a live
// character, so a row that comes before its sheet, or a link that points to an NPC, stays hidden.
// A sheet tombstone stays: its kind cannot be told, and it shows nothing by itself.
export function visibleRecords(
  role: PlayerRole,
  records: readonly VersionedRecord[],
  known: Iterable<VersionedRecord> = records,
): VersionedRecord[] {
  if (role === 'GM') {
    return [...records];
  }

  const characterIds = new Set(liveSheets(known, 'pc').map((sheet) => sheet.sheetId));

  return records.filter((record) => {
    if (record.k.startsWith('sheet:')) {
      return sheetDataSchema.safeParse(record.d).data?.kind !== 'npc';
    }

    if (!isDependentKey(record.k)) {
      return true;
    }

    const sheetId = dependentSheetId(record.k, record);

    return sheetId !== null && characterIds.has(sheetId);
  });
}

// The window's records as a role sees them. A GM sees every record, so its map comes back as is.
export function visibleRecordMap(
  role: PlayerRole,
  records: ReadonlyMap<string, VersionedRecord>,
): ReadonlyMap<string, VersionedRecord> {
  if (role === 'GM') {
    return records;
  }

  return new Map(visibleRecords(role, [...records.values()]).map((record) => [record.k, record]));
}

// The only way a view lists sheets, so no view filters by kind or role on its own.
export function visibleSheets(role: PlayerRole, records: Iterable<VersionedRecord>): VisibleSheets {
  const visible = visibleRecords(role, [...records]);

  return { characters: liveSheets(visible, 'pc'), npcs: liveSheets(visible, 'npc') };
}
