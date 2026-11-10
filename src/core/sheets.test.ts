import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';

import {
  isSheetDependent,
  liveSheets,
  parseSheetName,
  SHEET_NAME_MAX_LENGTH,
  sheetIdSchema,
  sortSheets,
} from './sheets';

describe('SHEET_NAME_MAX_LENGTH', () => {
  test('is 100 characters, as TASK-8 names it', () => {
    // #then
    expect(SHEET_NAME_MAX_LENGTH).toBe(100);
  });
});

describe('parseSheetName', () => {
  test('drops the spaces around a name', () => {
    // #when
    const parsed = parseSheetName('  Брок ');

    // #then
    expect(parsed).toEqual({ ok: true, value: 'Брок' });
  });

  test('keeps the spaces inside a name', () => {
    // #when
    const parsed = parseSheetName(' Брок  Железный ');

    // #then
    expect(parsed).toEqual({ ok: true, value: 'Брок  Железный' });
  });

  test.each(['', '   ', '\t\n '])('refuses %j as empty', (candidate) => {
    // #when
    const parsed = parseSheetName(candidate);

    // #then
    expect(parsed).toEqual({ ok: false, error: 'empty' });
  });

  test('accepts 100 characters after the spaces are dropped', () => {
    // #when
    const parsed = parseSheetName(` ${'ы'.repeat(100)} `);

    // #then
    expect(parsed).toEqual({ ok: true, value: 'ы'.repeat(100) });
  });

  test('refuses 101 characters as too long', () => {
    // #when
    const parsed = parseSheetName('ы'.repeat(101));

    // #then
    expect(parsed).toEqual({ ok: false, error: 'too-long' });
  });

  test('counts a character outside the BMP once, though it takes two code units', () => {
    // #given: 100 characters, 200 UTF-16 code units.
    const name = '𝔄'.repeat(100);

    // #when
    const parsed = parseSheetName(name);

    // #then
    expect(parsed).toEqual({ ok: true, value: name });
  });
});

describe('sheetIdSchema', () => {
  test.each(['V1StGXR8_Z5jdHi6B-myT', 'a', 'a'.repeat(64)])('accepts %s', (id) => {
    // #then
    expect(sheetIdSchema.safeParse(id).success).toBe(true);
  });

  test.each(['', 'a'.repeat(65), 'a:b', 'a b', 'лист', 'a.b'])('refuses %j', (id) => {
    // #then
    expect(sheetIdSchema.safeParse(id).success).toBe(false);
  });
});

describe('sortSheets', () => {
  test('puts a lower order first', () => {
    // #when
    const sorted = sortSheets([
      { sheetId: 'a', order: 2 },
      { sheetId: 'b', order: 0 },
      { sheetId: 'c', order: 1 },
    ]);

    // #then
    expect(sorted.map((sheet) => sheet.sheetId)).toEqual(['b', 'c', 'a']);
  });

  test('breaks an order tie by sheetId in code unit order, not locale order', () => {
    // #given: locale order would put "a" before "B" and "Z".
    const sheets = [
      { sheetId: 'a', order: 0 },
      { sheetId: 'Z', order: 0 },
      { sheetId: 'B', order: 0 },
      { sheetId: '_', order: 0 },
      { sheetId: '-', order: 0 },
    ];

    // #when
    const sorted = sortSheets(sheets);

    // #then
    expect(sorted.map((sheet) => sheet.sheetId)).toEqual(['-', 'B', 'Z', '_', 'a']);
  });

  test('gives the same order whatever order the sheets come in', () => {
    // #given
    const b = { sheetId: 'b', order: 1 };
    const a = { sheetId: 'a', order: 1 };
    const c = { sheetId: 'c', order: 0 };

    // #when
    const orders = [sortSheets([b, a, c]), sortSheets([c, a, b])];

    // #then
    expect(orders.map((sorted) => sorted.map((sheet) => sheet.sheetId))).toEqual([
      ['c', 'a', 'b'],
      ['c', 'a', 'b'],
    ]);
  });
});

describe('liveSheets', () => {
  test('lists the live sheets of one kind in tab order', () => {
    // #given
    const records: VersionedRecord[] = [
      { k: 'sheet:b', d: { kind: 'pc', name: 'Лиза', order: 1 }, c: 1, a: 'x' },
      { k: 'sheet:gone', d: null, c: 2, a: 'x' },
      { k: 'sheet:npc', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'x' },
      { k: 'preset', d: 'AAAA', c: 1, a: 'x' },
      { k: 'sheet:a', d: { kind: 'pc', name: 'Брок', order: 1 }, c: 1, a: 'x' },
    ];

    // #when
    const sheets = liveSheets(records, 'pc');

    // #then
    expect(sheets).toEqual([
      { sheetId: 'a', kind: 'pc', name: 'Брок', order: 1 },
      { sheetId: 'b', kind: 'pc', name: 'Лиза', order: 1 },
    ]);
  });
});

describe('isSheetDependent', () => {
  test.each([
    ['a row', 'row:brok:str', { str: 3 }],
    ['a repeat instance', 'rep:brok:items:i1', { order: 0, cells: {} }],
    ['an access grant', 'acl:brok:p1', { name: 'Оля' }],
    ['a player link', 'plink:brok:p1', { name: 'Оля' }],
    ['a token link that names the sheet', 'link:token1', 'brok'],
  ])('counts %s of the sheet', (_name, key, d) => {
    // #when
    const dependent = isSheetDependent(key, { d }, 'brok');

    // #then
    expect(dependent).toBe(true);
  });

  test.each([
    ['the sheet record itself', 'sheet:brok', { kind: 'pc', name: 'Брок', order: 0 }],
    ['the preset', 'preset', 'AAAA'],
    ['a row of another sheet', 'row:liza:str', { str: 3 }],
    ['a row of a sheet whose id starts with this one', 'row:brokk:str', { str: 3 }],
    ['an access grant of a sheet whose id starts with this one', 'acl:brok2:p1', { name: 'Оля' }],
    ['a token link that names another sheet', 'link:token1', 'liza'],
    ['a token link whose token id is the sheet id', 'link:brok', 'liza'],
  ])('does not count %s', (_name, key, d) => {
    // #when
    const dependent = isSheetDependent(key, { d }, 'brok');

    // #then
    expect(dependent).toBe(false);
  });
});
