import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { isPresetPath, listPresetFiles, readPresetList } from './preview-plugin';

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'muster-roll-preview-root-'));
  outside = mkdtempSync(join(tmpdir(), 'muster-roll-preview-outside-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function write(path: string, text = '{}'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function writeRepositoryPresets(): void {
  write(join(root, 'docs/example-preset.json'));
  write(join(root, 'tests/fixtures/presets/d6-pool.json'));
  write(join(root, 'tests/fixtures/presets/d20.json'));
  write(join(root, 'presets/mine.json'));
}

describe('listPresetFiles', () => {
  test('lists the example, then the fixtures, then the presets folder, each by name', () => {
    // #given
    writeRepositoryPresets();

    // #when
    const keys = listPresetFiles(root, null).map((file) => file.key);

    // #then
    expect(keys).toEqual([
      'docs/example-preset.json',
      'tests/fixtures/presets/d20.json',
      'tests/fixtures/presets/d6-pool.json',
      'presets/mine.json',
    ]);
  });

  test('skips files that are not JSON and folders inside a preset folder', () => {
    // #given
    write(join(root, 'presets/README.md'), '# Presets');
    write(join(root, 'presets/nested/deep.json'));
    write(join(root, 'presets/sheet.json'));

    // #when
    const keys = listPresetFiles(root, null).map((file) => file.key);

    // #then
    expect(keys).toEqual(['presets/sheet.json']);
  });

  test('lists nothing when no preset file or folder exists', () => {
    // #when
    const files = listPresetFiles(root, null);

    // #then
    expect(files).toEqual([]);
  });

  test('puts a launch file from outside the repository first, marked, by its absolute path', () => {
    // #given
    writeRepositoryPresets();

    const launch = join(outside, 'my-sheet.json');

    write(launch);

    // #when
    const files = listPresetFiles(root, launch);

    // #then
    expect(files[0]).toEqual({ key: launch, label: launch, path: launch, launch: true });
    expect(files.slice(1).map((file) => file.launch)).toEqual([false, false, false, false]);
  });

  test('moves a launch file that is a repository preset to the front, listed once', () => {
    // #given
    writeRepositoryPresets();

    // #when
    const files = listPresetFiles(root, join(root, 'presets/mine.json'));

    // #then
    expect(files.map((file) => [file.key, file.launch])).toEqual([
      ['presets/mine.json', true],
      ['docs/example-preset.json', false],
      ['tests/fixtures/presets/d20.json', false],
      ['tests/fixtures/presets/d6-pool.json', false],
    ]);
  });

  test('reads a relative launch path from the root', () => {
    // #given
    write(join(root, 'presets/mine.json'));

    // #when
    const files = listPresetFiles(root, 'presets/mine.json');

    // #then
    expect(files.map((file) => file.path)).toEqual([join(root, 'presets/mine.json')]);
  });
});

describe('readPresetList', () => {
  test('gives each file its text, and a file that cannot be read none', () => {
    // #given
    write(join(root, 'presets/a.json'), '{"v":1}');
    write(join(root, 'presets/b.json'), 'not json');

    const missing = join(outside, 'gone.json');

    // #when
    const list = readPresetList(listPresetFiles(root, missing));

    // #then
    expect(list).toEqual([
      { key: missing, label: missing, launch: true, text: null },
      { key: 'presets/a.json', label: 'presets/a.json', launch: false, text: '{"v":1}' },
      { key: 'presets/b.json', label: 'presets/b.json', launch: false, text: 'not json' },
    ]);
  });

  test('drops one leading byte order mark, as an upload does', () => {
    // #given
    write(join(root, 'presets/bom.json'), '\uFEFF\uFEFF{"v":1}');

    // #when
    const [entry] = readPresetList(listPresetFiles(root, null));

    // #then
    expect(entry?.text).toBe('\uFEFF{"v":1}');
  });
});

describe('isPresetPath', () => {
  test.each([
    ['the example', 'docs/example-preset.json', true],
    ['a fixture', 'tests/fixtures/presets/new.json', true],
    ['a file in the presets folder', 'presets/new.json', true],
    ['a nested file', 'presets/nested/new.json', false],
    ['a README', 'presets/README.md', false],
    ['a source file', 'src/ui/main.tsx', false],
    ['another JSON file', 'public/manifest.json', false],
  ])('%s: %s is %p', (_name, path, expected) => {
    // #when
    const listed = isPresetPath(root, null, join(root, path));

    // #then
    expect(listed).toBe(expected);
  });

  test('counts the launch file outside the repository', () => {
    // #given
    const launch = join(outside, 'my-sheet.json');

    // #when
    const listed = isPresetPath(root, launch, launch);

    // #then
    expect(listed).toBe(true);
  });
});
