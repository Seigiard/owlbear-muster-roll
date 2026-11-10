import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPOSITORY_ROOT = join(import.meta.dir, '..');
const BUILD_TIMEOUT_MS = 120_000;
const HASHED_ASSET = /^.+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;

describe('default-mode vite build', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'muster-roll-build-'));
  let exitCode: number | null = null;

  beforeAll(() => {
    const build = Bun.spawnSync({
      cmd: ['bunx', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'],
      cwd: REPOSITORY_ROOT,
      // bun test sets NODE_ENV to test, and that would give a development React build.
      env: { ...process.env, NODE_ENV: 'production' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    exitCode = build.exitCode;
  }, BUILD_TIMEOUT_MS);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  test('exits 0', () => {
    expect(exitCode).toBe(0);
  });

  test('emits both entry pages, the manifest and the headers file', () => {
    // #given
    const required = ['index.html', 'background.html', 'manifest.json', '_headers'];

    // #when
    const missing = required.filter((name) => !existsSync(join(outDir, name)));

    // #then
    expect(missing).toEqual([]);
  });

  test('emits both JS and CSS', () => {
    // #when
    const extensions = new Set(scriptsAndStyles(outDir).map((name) => name.split('.').at(-1)));

    // #then
    expect(extensions).toEqual(new Set(['css', 'js']));
  });

  test('gives every JS and CSS asset a hashed name', () => {
    // #when
    const unhashed = scriptsAndStyles(outDir).filter((name) => !HASHED_ASSET.test(name));

    // #then
    expect(unhashed).toEqual([]);
  });

  test('bundles the Owlbear adapter chunk', () => {
    // #when
    const hasAdapterChunk = scriptsAndStyles(outDir).some((name) => /^obr-.+\.js$/.test(name));

    // #then
    expect(hasAdapterChunk).toBe(true);
  });

  test('ships no part of the mock adapter', () => {
    // #when
    const leaking = outputFiles(outDir).filter((path) =>
      readFileSync(join(outDir, path), 'utf8').includes('mock-room'),
    );

    // #then
    expect(leaking).toEqual([]);
  });
});

function scriptsAndStyles(outDir: string): string[] {
  return readdirSync(join(outDir, 'assets')).filter((name) => /\.(?:js|css)$/.test(name));
}

function outputFiles(outDir: string): string[] {
  return readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter((path) =>
    statSync(join(outDir, path)).isFile(),
  );
}
