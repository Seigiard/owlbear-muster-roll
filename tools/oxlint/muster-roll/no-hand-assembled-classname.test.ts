import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const repositoryRoot = resolve(import.meta.dir, '../../..');
const oxlintPath = join(repositoryRoot, 'node_modules/.bin/oxlint');
const oxlintConfigPath = join(repositoryRoot, '.oxlintrc.json');
const projectRuleCode = 'muster-roll(no-hand-assembled-classname)';

const oxlintOutputSchema = z.object({
  diagnostics: z.array(z.object({ code: z.string().optional() })),
});

type OxlintDiagnostic = z.infer<typeof oxlintOutputSchema>['diagnostics'][number];

type OxlintOutput = z.infer<typeof oxlintOutputSchema>;

type LintFixtureResult = {
  exitCode: number | null;
  output: OxlintOutput;
};

const forbiddenCases = [
  {
    name: 'a template literal substitution',
    source: `
declare const BASE_CLASS: string;
export const View = () => <div className={\`\${BASE_CLASS} bg-fill\`} />;
`,
  },
  {
    name: 'binary string concatenation',
    source: `
declare const BASE_CLASS: string;
export const View = () => <div className={BASE_CLASS + " bg-fill"} />;
`,
  },
  {
    name: 'a direct ternary',
    source: `
declare const enabled: boolean;
export const View = () => <div className={enabled ? "bg-fill" : "text-text"} />;
`,
  },
  {
    name: 'a direct logical && expression',
    source: `
declare const enabled: boolean;
export const View = () => <div className={enabled && "bg-fill"} />;
`,
  },
  {
    name: 'an array join call',
    source: `
export const View = () => <div className={["bg-fill", "text-text"].join(" ")} />;
`,
  },
] as const;

const allowedCases = [
  {
    name: 'a static template literal',
    source: `
export const View = () => <div className={\`bg-fill text-text\`} />;
`,
  },
  {
    name: 'an identifier',
    source: `
declare const BASE_CLASS: string;
export const View = () => <div className={BASE_CLASS} />;
`,
  },
  {
    name: 'a clsx call with a ternary argument',
    source: `
declare const enabled: boolean;
declare const clsx: (...values: unknown[]) => string;
export const View = () => <div className={clsx(enabled ? "bg-fill" : "text-text")} />;
`,
  },
  {
    name: 'a clsx call with a logical argument',
    source: `
declare const enabled: boolean;
declare const clsx: (...values: unknown[]) => string;
export const View = () => <div className={clsx(enabled && "bg-fill", "text-text")} />;
`,
  },
  {
    name: 'a cva call, a string literal, and an unrelated JSX attribute',
    source: `
declare const enabled: boolean;
declare const cva: (...values: unknown[]) => string;

export const View = () => (
  <div className={cva("bg-fill")} title={enabled ? "shown" : "hidden"}>
    <span className="text-text" />
  </div>
);
`,
  },
] as const;

for (const fixture of forbiddenCases) {
  test(`reports ${fixture.name} in className`, () => {
    // #given
    const result = lintFixture(fixture.source);

    // #when
    const exitCode = result.exitCode;

    // #then
    expect(exitCode).toBe(1);
    expect(projectRuleDiagnostics(result.output)).toHaveLength(1);
  });
}

for (const fixture of allowedCases) {
  test(`allows ${fixture.name} in className`, () => {
    // #given
    const result = lintFixture(fixture.source);

    // #when
    const diagnostics = projectRuleDiagnostics(result.output);

    // #then
    expect(result.exitCode).toBe(0);
    expect(diagnostics).toEqual([]);
  });
}

function lintFixture(source: string): LintFixtureResult {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'muster-roll-oxlint-'));
  const fixturePath = join(fixtureDirectory, 'fixture.tsx');
  writeFileSync(fixturePath, source);

  try {
    const result = Bun.spawnSync({
      cmd: [oxlintPath, '--config', oxlintConfigPath, '--format', 'json', fixturePath],
      cwd: repositoryRoot,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(result.exitCode === 0 || result.exitCode === 1).toBe(true);
    expect(result.stderr.toString()).toBe('');

    return {
      exitCode: result.exitCode,
      output: parseOxlintOutput(result.stdout.toString()),
    };
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

function parseOxlintOutput(stdout: string): OxlintOutput {
  return oxlintOutputSchema.parse(JSON.parse(stdout));
}

function projectRuleDiagnostics(output: OxlintOutput): OxlintDiagnostic[] {
  return output.diagnostics.filter((diagnostic) => diagnostic.code === projectRuleCode);
}
