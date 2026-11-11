import { nanoid } from 'nanoid';

// TASK-37: random ids do not compress, and they are about half of the room copy. A sheet id must be
// unique in one room: 12 characters of the 64-symbol nanoid alphabet are 72 bits. A repeat block
// instance id must be unique only in one sheet (AD-2), and its key
// `rep:<sheetId>:<sectionId>:<instanceId>` holds the sheet id: 8 characters are 48 bits. Stored ids
// of any length from 1 to 64 still parse, so ids made before this change keep working.
export const SHEET_ID_LENGTH = 12;
export const INSTANCE_ID_LENGTH = 8;

// The two kinds of id a record key holds that the extension makes itself.
export type RecordIdKind = 'sheet' | 'instance';

export function newSheetId(): string {
  return nanoid(SHEET_ID_LENGTH);
}

export function newInstanceId(): string {
  return nanoid(INSTANCE_ID_LENGTH);
}

export function newRecordId(kind: RecordIdKind): string {
  return kind === 'sheet' ? newSheetId() : newInstanceId();
}
