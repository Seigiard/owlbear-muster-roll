import { mkdir, mkdtemp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const profiles = new Map<string, string[]>([
  ['quick', ['--grep', '@verify-quick']],
  ['full', []],
  ['builder', ['/(builder|builder-snapshot)\\.e2e\\.ts$']],
  [
    'sheets',
    [
      '/(cell-name|characters|delete|field-edit|navigation-v4|nested-repeat|primitives|repeat-blocks|repeat-tab-context|repeat-tabs|select-field|sheet-layout|sidebar|single-sheets|tabs|templates|window)\\.e2e\\.ts$',
    ],
  ],
  [
    'players',
    ['/(access|hidden-sheets|hidden-tabs|liveness|no-gm|owner|pending|player|propose)\\.e2e\\.ts$'],
  ],
  ['rolls', ['/(dice-choice-field|dice-extension|repeat-tab-dice|roll)\\.e2e\\.ts$']],
  ['tokens', ['/(link|open|selection)\\.e2e\\.ts$']],
  [
    'data',
    ['/(catch-up|duplicate|preset|preset-change|replica|room-copy|snapshot|sync|wipe)\\.e2e\\.ts$'],
  ],
  ['platform', ['/(port-contract-storage|smoke)\\.e2e\\.ts$']],
]);

const count = z.number().int().nonnegative();

const reportSchema = z.object({
  stats: z.object({ expected: count, unexpected: count, skipped: count, flaky: count }),
  errors: z.array(z.unknown()),
});

const root = fileURLToPath(new URL('..', import.meta.url));

async function main() {
  const [command, selection, ...extra] = process.argv.slice(2);
  const listing = command === 'list' || selection === '--list';
  const profile = command === 'list' ? (selection ?? 'full') : command;

  if (command === 'help' || command === '--help' || command === undefined) {
    console.log(`Usage: bun run verify <${[...profiles.keys()].join('|')}>`);
    console.log('       bun run verify list [profile] | <profile> --list | help');
    console.log('List discovers tests without starting browsers or the mock server.');

    return 0;
  }

  const selectedArgs = profile === undefined ? undefined : profiles.get(profile);

  if (!selectedArgs || extra.length > 0 || (!listing && selection !== undefined)) {
    console.error('Unknown profile or extra arguments. Use bun run verify help.');

    return 2;
  }

  const parent = resolve(root, 'test-results/verify');
  await mkdir(parent, { recursive: true });
  const evidence = await mkdtemp(`${parent}/${profile}-`);

  const executable = resolve(root, 'node_modules/.bin/playwright');

  const args = [
    'test',
    '--config=playwright.verify.config.ts',
    ...selectedArgs,
    ...(listing ? ['--list'] : []),
  ];

  const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root });
  const dirty = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: root });
  const patch = Bun.spawnSync(['git', 'diff', '--binary', 'HEAD'], { cwd: root });

  const untracked = Bun.spawnSync(['git', 'ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: root,
  });

  if ([head, dirty, patch, untracked].some((result) => result.exitCode !== 0)) {
    throw new Error('Cannot record Git metadata.');
  }

  await Bun.write(resolve(evidence, 'working-tree.patch'), patch.stdout);

  for (const file of untracked.stdout.toString().split('\0').filter(Boolean)) {
    const destination = resolve(evidence, 'untracked', file);
    // oxlint-disable-next-line no-await-in-loop
    await mkdir(dirname(destination), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop
    await Bun.write(destination, Bun.file(resolve(root, file)));
  }

  await Bun.write(
    resolve(evidence, 'metadata.json'),
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        head: head.stdout.toString().trim(),
        dirty: dirty.stdout.toString().length > 0,
        changes: dirty.stdout.toString(),
        profile,
        listing,
        executable,
        args,
      },
      null,
      2,
    ),
  );
  console.log(`Evidence: ${evidence}`);

  const child = Bun.spawn([executable, ...args], {
    cwd: root,
    env: { ...process.env, VERIFY_EVIDENCE_DIR: evidence },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await Bun.write(
    resolve(evidence, 'process.json'),
    JSON.stringify(
      {
        launcherPid: process.pid,
        childPid: child.pid,
        command: [executable, ...args],
        root,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  const exitCode = await child.exited;
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);

  if (listing) {
    const assigned = [...profiles.entries()]
      .filter(([name]) => name !== 'quick' && name !== 'full')
      .flatMap(([, patterns]) => patterns.map((pattern) => new RegExp(pattern)));

    const unassigned = [];

    for await (const file of new Bun.Glob('**/*.e2e.ts').scan(resolve(root, 'tests'))) {
      if (!assigned.some((pattern) => pattern.test(`/tests/${file}`))) unassigned.push(file);
    }

    console.log(`Profiles: ${[...profiles.keys()].join(', ')}`);
    console.log(`Unassigned files (still included in full): ${unassigned.join(', ') || 'none'}`);

    return exitCode;
  }

  try {
    const report = reportSchema.parse(await Bun.file(resolve(evidence, 'report.json')).json());
    const { expected, unexpected, skipped, flaky } = report.stats;
    console.log(
      `Passed: ${expected}; failed: ${unexpected}; skipped: ${skipped}; flaky: ${flaky}; errors: ${report.errors.length}`,
    );
    const complete = expected > 0 && unexpected + skipped + flaky + report.errors.length === 0;
    console.log(complete && exitCode === 0 ? 'Complete success.' : 'Failed or incomplete run.');

    return exitCode || (complete ? 0 : 1);
  } catch (error) {
    console.error('Missing or invalid Playwright report; run is incomplete.', error);

    return exitCode || 1;
  }
}

process.exitCode = await main().catch((error) => {
  console.error(error);

  return 1;
});
