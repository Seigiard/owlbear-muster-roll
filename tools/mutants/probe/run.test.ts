import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const fixtures: string[] = [];

const probe = new URL('./run.ts', import.meta.url).pathname;

const outputRowsSchema = z.array(
  z.object({
    op: z.string(),
    before: z.string(),
    result: z.string(),
  }),
);

type RepositoryOptions = {
  unitTestFails?: boolean;
  replicaTestFails?: boolean;
  source?: string;
  unitTestSource?: string;
  replicaTestSource?: string | null;
  baseline?: string;
};

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('probe CLI', () => {
  test('rejects an unknown module before creating a checkout and names available modules', async () => {
    // #given
    const root = await createRepository();
    const before = await worktrees(root);

    // #when
    const result = await runProbe(root, ['nope']);

    // #then
    expect({
      exitCode: result.exitCode,
      stderr: result.stderr,
      worktrees: await worktrees(root),
    }).toEqual({
      exitCode: 1,
      stderr: 'Unknown module: nope\nAvailable modules: sample\n',
      worktrees: before,
    });
  });

  test('refuses a dirty selected module without creating a checkout', async () => {
    // #given
    const root = await createRepository();
    await Bun.write(join(root, 'src/replica/sample.ts'), 'export const changed = true;\n');
    const before = await worktrees(root);

    // #when
    const result = await runProbe(root, ['sample']);

    // #then
    expect({
      exitCode: result.exitCode,
      stderr: result.stderr,
      worktrees: await worktrees(root),
    }).toEqual({
      exitCode: 1,
      stderr: 'Refusing to run: src/replica/sample.ts has uncommitted changes.\n',
      worktrees: before,
    });
  });

  test('refuses an uncommitted deletion of the selected module unit test', async () => {
    // #given
    const root = await createRepository();
    await rm(join(root, 'src/replica/sample.test.ts'));
    const before = await worktrees(root);

    // #when
    const result = await runProbe(root, [
      'sample',
      '--unit-timeout',
      '1000',
      '--replica-timeout',
      '1000',
    ]);

    // #then
    expect({
      exitCode: result.exitCode,
      stderr: result.stderr,
      worktrees: await worktrees(root),
    }).toEqual({
      exitCode: 1,
      stderr: 'Refusing to run: src/replica/sample.test.ts has uncommitted changes.\n',
      worktrees: before,
    });
  }, 10_000);

  test('removes detached checkouts and exits 130 after SIGINT', async () => {
    // #given
    const root = await createRepository();

    const before = await worktrees(root);

    const process = Bun.spawn({
      cmd: ['bun', probe, 'sample', '--jobs', '1', '--unit-timeout', '1000'],
      cwd: root,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    const checkoutCreated = await waitForCheckout(root, before);

    // #when
    if (checkoutCreated) {
      process.kill('SIGINT');
    }

    const [exitCode, stdout] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
    ]);

    // #then
    expect({
      exitCode,
      checkoutCreated,
      lastStdoutLine: stdout.trim().split('\n').at(-1),
      worktrees: await worktrees(root),
    }).toEqual({
      exitCode: 130,
      checkoutCreated: true,
      lastStdoutLine: 'Partial counts: 0 killed, 0 survived, 0 timed out.',
      worktrees: before,
    });
  }, 15_000);

  test('prints results that finish before SIGINT while the same module is still running', async () => {
    // #given
    const directory = await mkdtemp(join(tmpdir(), 'mutation-probe-signals-'));
    fixtures.push(directory);
    const firstMutation = join(directory, 'first');
    const secondMutation = join(directory, 'second');
    const source = ['export const ready = false;', 'export const hang = false;', ''].join('\n');

    const unitTestSource = [
      "import { expect, test } from 'bun:test';",
      "import { hang, ready } from './sample';",
      '',
      "test('observes mutations', async () => {",
      `  if (ready) await Bun.write(${JSON.stringify(firstMutation)}, 'finished');`,
      '  if (hang) {',
      `    await Bun.write(${JSON.stringify(secondMutation)}, 'started');`,
      '    await Bun.sleep(5000);',
      '  }',
      '  expect(ready).toBe(false);',
      '  expect(hang).toBe(false);',
      '});',
      '',
    ].join('\n');

    const root = await createRepository({
      source,
      unitTestSource,
      replicaTestSource: null,
    });

    const process = Bun.spawn({
      cmd: ['bun', probe, 'sample', '--jobs', '1', '--unit-timeout', '10000'],
      cwd: root,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    const secondMutationStarted = await waitForFile(secondMutation);

    // #when
    if (secondMutationStarted) {
      process.kill('SIGINT');
    }

    const [exitCode, stdout] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
    ]);

    // #then
    expect({
      exitCode,
      secondMutationStarted,
      lastStdoutLine: stdout.trim().split('\n').at(-1),
    }).toEqual({
      exitCode: 130,
      secondMutationStarted: true,
      lastStdoutLine: 'Partial counts: 1 killed, 0 survived, 0 timed out.',
    });
  }, 20_000);

  test('removes detached checkouts after SIGTERM', async () => {
    // #given
    const root = await createRepository();

    const before = await worktrees(root);

    const process = Bun.spawn({
      cmd: ['bun', probe, 'sample', '--jobs', '1', '--unit-timeout', '1000'],
      cwd: root,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    const checkoutCreated = await waitForCheckout(root, before);

    // #when
    if (checkoutCreated) {
      process.kill('SIGTERM');
    }

    await process.exited;

    // #then
    expect({
      checkoutCreated,
      worktrees: await worktrees(root),
    }).toEqual({ checkoutCreated: true, worktrees: before });
  }, 15_000);

  test('keeps the caller checkout unchanged and records unit, replica, survivor and timeout outcomes', async () => {
    // #given
    const root = await createRepository();

    const sourceBefore = await Bun.file(join(root, 'src/replica/sample.ts')).text();

    const before = await worktrees(root);

    const output = await createOutputPath();

    // #when
    const result = await runProbe(root, [
      'sample',
      '--jobs',
      '1',
      '--unit-timeout',
      '2000',
      '--replica-timeout',
      '10000',
      '--out',
      output,
    ]);

    const outputValue = await Bun.file(output)
      .json()
      .catch(() => []);

    const rows = outputRowsSchema.safeParse(outputValue).data ?? [];

    // #then
    expect({
      exitCode: result.exitCode,
      rows: rows.map(({ op, before, result: status }) => ({ op, before, status })),
      source: await Bun.file(join(root, 'src/replica/sample.ts')).text(),
      status: await git(root, ['status', '--porcelain']),
      worktrees: await worktrees(root),
    }).toEqual({
      exitCode: 1,
      rows: [
        { op: 'false→true', before: 'false', status: 'timeout' },
        { op: 'true→false', before: 'true', status: 'survived' },
        { op: 'if→true', before: 'input', status: 'killed' },
        { op: 'if→false', before: 'input', status: 'killed' },
      ],
      source: sourceBefore,
      status: '',
      worktrees: before,
    });
  }, 30_000);

  test('reports a selected module baseline entry as missing when it yields no mutations', async () => {
    // #given
    const root = await createRepository({
      source: 'export const answer = 42;\n',
      unitTestSource: "import { test } from 'bun:test';\ntest('passes', () => {});\n",
      replicaTestSource: null,
      baseline: JSON.stringify([
        {
          file: 'src/replica/sample.ts',
          fn: '<module>',
          op: 'true→false',
          text: 'true',
          nth: 1,
          verdict: 'equivalent',
          reason: 'The earlier source had an equivalent constant.',
        },
      ]),
    });

    // #when
    const result = await runProbe(root, ['sample']);

    // #then
    expect({
      exitCode: result.exitCode,
      stdout: result.stdout,
    }).toEqual({
      exitCode: 1,
      stdout: [
        'sample: 0 mutations; 0 killed, 0 survived, 0 timed out.',
        '0 new survivors, 0 new timeouts, 1 missing baseline entries.',
        'New survivors:',
        'New timeouts:',
        'Missing baseline entries:',
        'src/replica/sample.ts <module> true→false true #1',
        '',
      ].join('\n'),
    });
  });

  test('stops before mutations when the unmutated unit test fails', async () => {
    // #given
    const root = await createRepository({ unitTestFails: true });
    const before = await worktrees(root);
    const output = await createOutputPath();

    // #when
    const result = await runProbe(root, [
      'sample',
      '--jobs',
      '1',
      '--unit-timeout',
      '2000',
      '--replica-timeout',
      '10000',
      '--out',
      output,
    ]);

    const rows = await Bun.file(output).json();

    // #then
    expect({
      exitCode: result.exitCode,
      stderr: result.stderr,
      rows,
      worktrees: await worktrees(root),
    }).toEqual({
      exitCode: 1,
      stderr: expect.stringContaining('bun test --bail src/replica/sample.test.ts'),
      rows: [],
      worktrees: before,
    });
  }, 30_000);

  test('stops before mutations when the unmutated replica pass fails', async () => {
    // #given
    const root = await createRepository({ replicaTestFails: true });
    const before = await worktrees(root);
    const output = await createOutputPath();

    // #when
    const result = await runProbe(root, [
      'sample',
      '--jobs',
      '1',
      '--unit-timeout',
      '2000',
      '--replica-timeout',
      '10000',
      '--out',
      output,
    ]);

    const rows = await Bun.file(output).json();

    // #then
    expect({
      exitCode: result.exitCode,
      stderr: result.stderr,
      rows,
      worktrees: await worktrees(root),
    }).toEqual({
      exitCode: 1,
      stderr: expect.stringContaining('bun test --bail src/replica/'),
      rows: [],
      worktrees: before,
    });
  }, 30_000);
});

async function createRepository(options: RepositoryOptions = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mutation-probe-'));

  fixtures.push(root);

  await mkdir(join(root, 'src/replica'), { recursive: true });

  await mkdir(join(root, 'tools/mutants'), { recursive: true });

  await git(root, ['init']);

  await git(root, ['config', 'user.email', 'probe@example.test']);

  await git(root, ['config', 'user.name', 'Mutation Probe']);

  await Bun.write(
    join(root, 'src/replica/sample.ts'),
    options.source ??
      [
        'export const hang = false;',
        'export const unused = true;',
        'export function classify(input: boolean): string {',
        "  if (input) return 'yes';",
        "  return 'no';",
        '}',
        '',
      ].join('\n'),
  );

  await Bun.write(
    join(root, 'src/replica/sample.test.ts'),
    options.unitTestSource ??
      [
        "import { expect, test } from 'bun:test';",
        "import { classify, hang } from './sample';",
        '',
        "test('classifies true', async () => {",
        '  if (hang) await Bun.sleep(5000);',
        `  expect(classify(true)).toBe('${options.unitTestFails ? 'no' : 'yes'}');`,
        '});',
        '',
      ].join('\n'),
  );

  if (options.replicaTestSource !== null) {
    await Bun.write(
      join(root, 'src/replica/sample-replica.test.ts'),
      options.replicaTestSource ??
        [
          "import { expect, test } from 'bun:test';",
          "import { classify } from './sample';",
          '',
          "test('classifies false', () => {",
          `  expect(classify(false)).toBe('${options.replicaTestFails ? 'yes' : 'no'}');`,
          '});',
          '',
        ].join('\n'),
    );
  }

  await Bun.write(join(root, 'tools/mutants/probe-baseline.json'), options.baseline ?? '[]\n');

  await git(root, ['add', '.']);

  await git(root, ['commit', '-m', 'Add probe fixture']);

  return root;
}

async function createOutputPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mutation-probe-output-'));

  fixtures.push(directory);

  return join(directory, 'probe.json');
}

async function runProbe(
  root: string,
  args: string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const process = Bun.spawn({
    cmd: ['bun', probe, ...args],
    cwd: root,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text(),
  ]);

  return { exitCode, stderr, stdout };
}

async function git(root: string, args: string[]): Promise<string> {
  const process = Bun.spawn({ cmd: ['git', ...args], cwd: root, stderr: 'pipe', stdout: 'pipe' });

  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr);
  }

  return stdout;
}

async function worktrees(root: string): Promise<string> {
  return git(root, ['worktree', 'list', '--porcelain']);
}

async function waitForCheckout(root: string, before: string): Promise<boolean> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if ((await worktrees(root)) !== before) {
      return true;
    }

    await Bun.sleep(10);
  }

  return false;
}

async function waitForFile(path: string): Promise<boolean> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (await Bun.file(path).exists()) {
      return true;
    }

    await Bun.sleep(10);
  }

  return false;
}
