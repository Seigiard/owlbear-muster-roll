import { describe, expect, test } from 'bun:test';

import { downloadFileName, nameFromFile } from './file-name';

describe('nameFromFile', () => {
  test.each<[string, string]>([
    ['d20.json', 'd20'],
    ['Мой пресет.JSON', 'Мой пресет'],
    ['d20-2026-11-12-0930.json', 'd20'],
    ['.json', 'preset'],
  ])('reads %p as %p', (fileName, expected) => {
    // #when
    const name = nameFromFile(fileName);

    // #then
    expect(name).toBe(expected);
  });
});

describe('downloadFileName', () => {
  test('adds the local date and time to the name', () => {
    // #when
    const fileName = downloadFileName('d20', new Date(2026, 10, 2, 9, 5));

    // #then
    expect(fileName).toBe('d20-2026-11-02-0905.json');
  });

  test('a downloaded file opened again keeps one time', () => {
    // #when
    const fileName = downloadFileName(
      nameFromFile('d20-2026-11-02-0905.json'),
      new Date(2026, 10, 3, 10, 0),
    );

    // #then
    expect(fileName).toBe('d20-2026-11-03-1000.json');
  });
});
