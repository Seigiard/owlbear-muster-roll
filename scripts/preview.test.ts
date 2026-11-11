import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LAUNCH_FILE_VARIABLE } from '../src/preview/protocol';

import { previewLaunch, type PreviewLaunch } from './preview';

const SCRIPT = join(import.meta.dir, 'preview.ts');

type PreviewRun = { exitCode: number; stderr: string };

// Each case exits before the dev server starts, so no server is left behind.
function runPreview(args: readonly string[]): PreviewRun {
  const run = Bun.spawnSync({ cmd: ['bun', SCRIPT, ...args], stdout: 'pipe', stderr: 'pipe' });

  return { exitCode: run.exitCode, stderr: run.stderr.toString() };
}

describe('bun run preview', () => {
  test('stops with a message naming the path when no file is there', () => {
    // #given
    const missing = join(import.meta.dir, 'no-such-preset.json');

    // #when
    const run = runPreview([missing]);

    // #then
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain(`No preset file at ${missing}`);
  });

  test('stops with a message when the path is a folder', () => {
    // #when
    const run = runPreview([import.meta.dir]);

    // #then
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain(`No preset file at ${import.meta.dir}`);
  });

  test('stops with the usage line when given two paths', () => {
    // #when
    const run = runPreview(['a.json', 'b.json']);

    // #then
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('Usage: bun run preview');
  });
});

describe('previewLaunch', () => {
  let folder: string;
  let launchFile: string;

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'muster-roll-preview-launch-'));
    launchFile = join(folder, 'my-sheet.json');
    writeFileSync(launchFile, '{}');
  });

  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  function launched(args: readonly string[], cwd = folder): PreviewLaunch {
    const launch = previewLaunch(
      args,
      { HOME: '/home/owner', [LAUNCH_FILE_VARIABLE]: '/stale.json' },
      cwd,
    );

    if (!launch.ok) {
      throw new Error(launch.error);
    }

    return launch.value;
  }

  test('starts the mock dev server on the preview page', () => {
    // #when
    const launch = launched([]);

    // #then
    expect(launch.cmd).toEqual(['bunx', 'vite', '--mode', 'mock', '--open', '/preview.html']);
  });

  test('with no path, drops a launch variable the shell passed down and keeps the rest', () => {
    // #when
    const launch = launched([]);

    // #then
    expect(launch.env).toEqual({ HOME: '/home/owner' });
  });

  test('reads a relative path from the working folder', () => {
    // #when
    const launch = launched(['my-sheet.json']);

    // #then
    expect(launch.env[LAUNCH_FILE_VARIABLE]).toBe(launchFile);
  });

  test('passes an absolute path as it is', () => {
    // #when
    const launch = launched([launchFile], '/');

    // #then
    expect(launch.env[LAUNCH_FILE_VARIABLE]).toBe(launchFile);
  });

  test('refuses a relative path with no file in the working folder', () => {
    // #when
    const launch = previewLaunch(['other.json'], {}, folder);

    // #then
    expect(launch).toEqual({ ok: false, error: `No preset file at ${join(folder, 'other.json')}` });
  });
});
