import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { compile } from 'tailwindcss';
import { z } from 'zod';

const REPOSITORY_ROOT = join(import.meta.dir, '..');
const BUILD_TIMEOUT_MS = 120_000;

const DESIGN_PATH =
  '_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md';

const BUILDER_CHUNK = /^builder-/;

const HASHED_ASSET = /^.+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;

// Every DESIGN.md theme-mapped hex, with the short forms a minifier can write.
const MAPPED_HEX =
  /#(?:333333|333|2a2a2a|3a3a3a|2d2d2d|dddddd|ddd|aaaaaa|aaa|d9b36c|222222|222|4a4a4a|888888|888)(?![0-9a-f])/gi;

const FIXED_HEX = [
  '#4a3a1e',
  '#ffd894',
  '#4f2b26',
  '#ffb4a8',
  '#fff1d6',
  '#6b4700',
  '#fde3df',
  '#8a2318',
];

const DESIGN_FRONT_MATTER = z.object({
  colors: z.record(z.string(), z.string()),
  typography: z.record(
    z.string(),
    z.object({ fontSize: z.string(), lineHeight: z.string(), fontWeight: z.string() }),
  ),
  rounded: z.record(z.string(), z.string()),
  spacing: z.record(z.string(), z.string()),
});

const DESIGN_UTILITIES = [
  'bg-surface',
  'bg-surface-bar',
  'bg-surface-tab',
  'bg-surface-stripe',
  'text-text',
  'text-text-muted',
  'bg-accent',
  'text-accent-contrast',
  'border-line',
  'border-line-strong',
  'outline-focus',
  'bg-warning-surface',
  'text-warning-text',
  'bg-danger-surface',
  'text-danger-text',
  'bg-warning-surface-light',
  'text-warning-text-light',
  'bg-danger-surface-light',
  'text-danger-text-light',
  'text-body',
  'text-label-sm',
  'text-section-heading',
  'text-sheet-title',
  'rounded-sm',
  'rounded-md',
  'rounded-lg',
  'rounded-full',
  'p-1',
  'p-2',
  'p-3',
  'p-4',
];

const FOREIGN_UTILITIES = [
  'bg-red-500',
  'text-white',
  'shadow-md',
  'rounded-xl',
  'p-5',
  'text-xl',
  'font-sans',
  'font-mono',
  'font-bold',
];

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

  test('emits every entry page, the manifest and the headers file', () => {
    // #given
    const required = [
      'index.html',
      'background.html',
      'picker.html',
      'builder.html',
      'manifest.json',
      '_headers',
    ];

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

  test('ships no part of the dev-only preset preview', () => {
    // #when
    const leaking = outputFiles(outDir).filter(
      (path) =>
        path.endsWith('preview.html') ||
        readFileSync(join(outDir, path), 'utf8').includes('__muster-roll-preview'),
    );

    // #then
    expect(leaking).toEqual([]);
  });

  test('ships no hex value of a theme-mapped token', () => {
    // #when
    // AD-20: the builder page runs outside Owlbear, so its own entry chunk carries the fixed
    // themes of the preset preview.
    const leaking = scriptsAndStyles(outDir)
      .filter((name) => !BUILDER_CHUNK.test(name))
      .flatMap((name) =>
        [...readFileSync(join(outDir, 'assets', name), 'utf8').matchAll(MAPPED_HEX)].map(
          (match) => `${name}: ${match[0]}`,
        ),
      );

    // #then
    expect(leaking).toEqual([]);
  });

  test('loads no Owlbear adapter chunk in the builder page', () => {
    // #given
    const page = readFileSync(join(outDir, 'builder.html'), 'utf8');
    const entry = /src="\/assets\/(builder-[^"]+\.js)"/.exec(page)?.[1] ?? '';

    // #when
    const imported = staticImports(outDir, entry);

    // #then
    expect(entry).not.toBe('');
    expect([...imported].filter((name) => name.startsWith('obr-'))).toEqual([]);
    expect(page).not.toContain('obr-');
  });

  test('ships the fixed warning and danger hex values', () => {
    // #given
    const css = scriptsAndStyles(outDir)
      .filter((name) => name.endsWith('.css'))
      .map((name) => readFileSync(join(outDir, 'assets', name), 'utf8').toLowerCase())
      .join('');

    // #when
    const missing = FIXED_HEX.filter((hex) => !css.includes(hex));

    // #then
    expect(missing).toEqual([]);
  });

  test('ships the DESIGN.md value of every typography, radius, spacing and fixed color token', () => {
    // #given
    const expected = designTokenValues();

    // #when
    const declared = declaredThemeValues(outDir);
    const actual = [...expected.keys()].map((name) => [name, declared.get(name)]);

    // #then
    expect(actual).toEqual([...expected]);
  });
});

describe('tailwind theme', () => {
  test('exposes every DESIGN.md color, typography style, radius and spacing step', async () => {
    // #given
    const compiler = await compileMainCss();

    // #when
    const css = compiler.build(DESIGN_UTILITIES);

    // #then
    expect(DESIGN_UTILITIES.filter((name) => !hasUtility(css, name))).toEqual([]);
  });

  test('generates nothing from the default Tailwind scales', async () => {
    // #given
    const compiler = await compileMainCss();

    // #when
    const css = compiler.build(FOREIGN_UTILITIES);

    // #then
    expect(FOREIGN_UTILITIES.filter((name) => hasUtility(css, name))).toEqual([]);
  });
});

function hasUtility(css: string, name: string): boolean {
  return new RegExp(`\\.${name}(?![\\w-])`).test(css);
}

// The first declaration of a name is the theme layer's. The light-mode rule comes later.
function declaredThemeValues(outDir: string): ReadonlyMap<string, string> {
  const declared = new Map<string, string>();

  for (const name of scriptsAndStyles(outDir).filter((file) => file.endsWith('.css'))) {
    const css = readFileSync(join(outDir, 'assets', name), 'utf8');

    for (const [, token = '', value = ''] of css.matchAll(/(--[\w-]+):([^;}]+)/g)) {
      if (!declared.has(token)) {
        declared.set(token, value);
      }
    }
  }

  return declared;
}

function designTokenValues(): ReadonlyMap<string, string> {
  const frontMatter = readFileSync(join(REPOSITORY_ROOT, DESIGN_PATH), 'utf8').split('---\n')[1];
  const design = DESIGN_FRONT_MATTER.parse(Bun.YAML.parse(frontMatter ?? ''));
  const expected = new Map<string, string>();

  for (const [name, style] of Object.entries(design.typography)) {
    expected.set(`--text-${name}`, style.fontSize);
    expected.set(`--text-${name}--line-height`, style.lineHeight);
    expected.set(`--text-${name}--font-weight`, style.fontWeight);
  }

  for (const [name, radius] of Object.entries(design.rounded)) {
    expected.set(`--radius-${name}`, radius);
  }

  for (const [step, size] of Object.entries(design.spacing)) {
    expected.set(`--spacing-${step}`, size);
  }

  for (const [name, hex] of Object.entries(design.colors)) {
    if (/^(?:warning|danger)-/.test(name)) {
      expected.set(`--color-${name}`, hex.toLowerCase());
    }
  }

  return expected;
}

function compileMainCss(): ReturnType<typeof compile> {
  const mainCssPath = join(REPOSITORY_ROOT, 'src/ui/main.css');

  return compile(readFileSync(mainCssPath, 'utf8'), {
    base: dirname(mainCssPath),
    loadStylesheet: (id, base) => {
      const path =
        id === 'tailwindcss'
          ? join(REPOSITORY_ROOT, 'node_modules/tailwindcss/index.css')
          : resolve(base, id);

      return Promise.resolve({
        path,
        base: dirname(path),
        content: readFileSync(path, 'utf8'),
      });
    },
  });
}

// Every chunk an entry chunk loads, as its static imports name them.
function staticImports(outDir: string, entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const name = queue.pop() ?? '';

    if (name === '' || seen.has(name)) {
      continue;
    }

    seen.add(name);

    const code = readFileSync(join(outDir, 'assets', name), 'utf8');

    for (const [, imported = ''] of code.matchAll(/from"\.\/([^"]+\.js)"/g)) {
      queue.push(imported);
    }
  }

  return seen;
}

function scriptsAndStyles(outDir: string): string[] {
  return readdirSync(join(outDir, 'assets')).filter((name) => /\.(?:js|css)$/.test(name));
}

function outputFiles(outDir: string): string[] {
  return readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter((path) =>
    statSync(join(outDir, path)).isFile(),
  );
}
