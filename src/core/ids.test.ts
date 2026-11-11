import { describe, expect, test } from 'bun:test';

import { newInstanceId, newRecordId, newSheetId } from './ids';
import { sheetIdSchema } from './sheets';

// TASK-37 AC 1, written out by hand: 12 and 8 characters of the URL-safe nanoid alphabet.
const SHEET_ID = /^[A-Za-z0-9_-]{12}$/;
const INSTANCE_ID = /^[A-Za-z0-9_-]{8}$/;
const DRAWS = 200;

describe('new record ids', () => {
  test('a new sheet id is 12 characters of the URL-safe alphabet', () => {
    // #when
    const ids = Array.from({ length: DRAWS }, newSheetId);

    // #then
    expect(ids.filter((id) => !SHEET_ID.test(id))).toEqual([]);
  });

  test('a new instance id is 8 characters of the URL-safe alphabet', () => {
    // #when
    const ids = Array.from({ length: DRAWS }, newInstanceId);

    // #then
    expect(ids.filter((id) => !INSTANCE_ID.test(id))).toEqual([]);
  });

  test('newRecordId draws by kind: 12 characters for a sheet, 8 for an instance', () => {
    // #when
    const lengths = [newRecordId('sheet').length, newRecordId('instance').length];

    // #then
    expect(lengths).toEqual([12, 8]);
  });

  test('every new id passes the sheet id schema that refuses ":"', () => {
    // #when
    const ids = Array.from({ length: DRAWS }, (_unused, index) =>
      index % 2 === 0 ? newSheetId() : newInstanceId(),
    );

    // #then
    expect(ids.filter((id) => !sheetIdSchema.safeParse(id).success)).toEqual([]);
  });
});
