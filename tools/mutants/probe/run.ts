import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { compare, formatReport, loadBaseline, type ProbeResult, type ProbeRow } from './baseline';
import { generate, type Mutation } from './generate';

const DEFAULT_JOBS = 6;
const DEFAULT_UNIT_TIMEOUT = 30_000;
const DEFAULT_REPLICA_TIMEOUT = 180_000;
const BASELINED_MODULES = ['catch-up', 'room-copy', 'window-publisher'];

type Module = {
  name: string;
  file: string;
  unitTest?: string;
};

type Options = {
  modules: string[];
  jobs: number;
  unitTimeout: number;
  replicaTimeout: number;
  output?: string;
};

type Counts = {
  killed: number;
  survived: number;
  timedOut: number;
};

type Process = ReturnType<typeof Bun.spawn>;

class InterruptedRun extends Error {
  constructor() {
    super('Probe interrupted.');
  }
}

let interruptedWith: 130 | 143 | null = null;
const activeProcesses = new Set<Process>();

class WorktreePool {
  private constructor(
    private readonly root: string,
    private readonly paths: string[],
    private readonly temporaryDirectory: string,
  ) {}

  static async create(repository: string, count: number): Promise<WorktreePool> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mutation-probe-'));
    const paths: string[] = [];

    try {
      for (let index = 0; index < count; index += 1) {
        throwIfInterrupted();

        const path = join(temporaryDirectory, String(index));
        await runGit(repository, ['worktree', 'add', '--detach', path, 'HEAD']);
        paths.push(path);
        await symlink(join(repository, 'node_modules'), join(path, 'node_modules'), 'dir');
        throwIfInterrupted();
      }
    } catch (error) {
      await WorktreePool.removePaths(repository, paths, temporaryDirectory);
      throw error;
    }

    return new WorktreePool(repository, paths, temporaryDirectory);
  }

  get workers(): readonly string[] {
    return this.paths;
  }

  async dispose(): Promise<void> {
    await WorktreePool.removePaths(this.root, this.paths, this.temporaryDirectory);
  }

  private static async removePaths(
    repository: string,
    paths: readonly string[],
    temporaryDirectory: string,
  ): Promise<void> {
    await Promise.all(
      paths.map(async (path) => {
        await runGit(repository, ['worktree', 'remove', '--force', path], true).catch(
          () => undefined,
        );
      }),
    );
    await rm(temporaryDirectory, { force: true, recursive: true }).catch(() => undefined);
    await runGit(repository, ['worktree', 'prune'], true).catch(() => undefined);
  }
}

async function main(): Promise<number> {
  const repository = await repositoryRoot();
  const options = parseOptions(process.argv.slice(2));
  const availableModules = await moduleNames(repository);
  const requestedModules = options.modules.length > 0 ? options.modules : BASELINED_MODULES;
  const unknownModules = requestedModules.filter((name) => !availableModules.includes(name));

  if (unknownModules.length > 0) {
    console.error(`Unknown module: ${unknownModules.join(', ')}`);
    console.error(`Available modules: ${availableModules.join(', ')}`);

    return 1;
  }

  const selectedModules = requestedModules.map(moduleFor);

  for (const module of selectedModules) {
    const unitTest = `src/replica/${module.name}.test.ts`;

    if (
      (await Bun.file(join(repository, unitTest)).exists()) ||
      (await isTracked(repository, unitTest))
    ) {
      module.unitTest = unitTest;
    }

    if (await hasUncommittedChanges(repository, module.file)) {
      console.error(`Refusing to run: ${module.file} has uncommitted changes.`);

      return 1;
    }

    if (
      module.unitTest !== undefined &&
      (await hasUncommittedChanges(repository, module.unitTest))
    ) {
      console.error(`Refusing to run: ${module.unitTest} has uncommitted changes.`);

      return 1;
    }
  }

  throwIfInterrupted();

  const inventories = await Promise.all(
    selectedModules.map(async (module) => ({
      module,
      mutations: await generate(module.file, await Bun.file(join(repository, module.file)).text()),
    })),
  );

  const allMutations = inventories.flatMap(({ mutations }) => mutations);

  const baselinePath = join(repository, 'tools/mutants/probe-baseline.json');
  const baseline = await loadBaseline(baselinePath);
  let rows: ProbeRow[] = [];

  if (allMutations.length > 0) {
    const pool = await WorktreePool.create(repository, Math.min(options.jobs, allMutations.length));
    const counts: Counts = { killed: 0, survived: 0, timedOut: 0 };
    let interrupted = false;

    try {
      await runPreflight(inventories, pool, options);
      rows = await runInventories(inventories, pool, options, counts);
    } catch (error) {
      if (error instanceof InterruptedRun) {
        interrupted = true;
      } else {
        if (options.output !== undefined) {
          await Bun.write(options.output, '[]\n');
        }

        throw error;
      }
    } finally {
      await pool.dispose();
    }

    if (interrupted || interruptedWith !== null) {
      console.log(
        `Partial counts: ${counts.killed} killed, ${counts.survived} survived, ${counts.timedOut} timed out.`,
      );

      return interruptedWith ?? 130;
    }
  }

  if (options.output !== undefined) {
    await Bun.write(options.output, `${JSON.stringify(rows, null, 2)}\n`);
  }

  const selectedFiles = new Set(selectedModules.map(({ file }) => file));

  const comparison = compare(
    rows,
    baseline.filter(({ file }) => selectedFiles.has(file)),
  );

  for (const { module, mutations } of inventories) {
    const moduleRows = rows.filter(({ file }) => file === module.file);
    const moduleCounts = summarize(moduleRows);
    console.log(
      `${module.name}: ${mutations.length} mutations; ${moduleCounts.killed} killed, ` +
        `${moduleCounts.survived} survived, ${moduleCounts.timedOut} timed out.`,
    );
  }

  console.log(
    `${comparison.newSurvivors.length} new survivors, ` +
      `${comparison.newTimeouts.length} new timeouts, ` +
      `${comparison.missing.length} missing baseline entries.`,
  );

  if (
    comparison.newSurvivors.length > 0 ||
    comparison.newTimeouts.length > 0 ||
    comparison.missing.length > 0
  ) {
    console.log(formatReport(comparison));
  }

  return comparison.newSurvivors.length === 0 &&
    comparison.newTimeouts.length === 0 &&
    comparison.missing.length === 0
    ? 0
    : 1;
}

async function runInventories(
  inventories: readonly { module: Module; mutations: Mutation[] }[],
  pool: WorktreePool,
  options: Options,
  counts: Counts,
): Promise<ProbeRow[]> {
  const rows: ProbeRow[] = [];

  for (const { module, mutations } of inventories) {
    const unitResults =
      module.unitTest === undefined
        ? mutations.map(() => null)
        : await runBatch(mutations, [module.unitTest], options.unitTimeout, pool, (result) => {
            if (result !== 'survived') {
              addCount(counts, result);
            }
          });

    throwIfInterrupted();

    const passTwoMutations = mutations.filter(
      (_, index) => unitResults[index] === null || unitResults[index] === 'survived',
    );

    const passTwoResults =
      passTwoMutations.length === 0
        ? []
        : await runBatch(
            passTwoMutations,
            ['src/replica/'],
            options.replicaTimeout,
            pool,
            (result) => addCount(counts, result),
          );

    let passTwoIndex = 0;

    for (let index = 0; index < mutations.length; index += 1) {
      const mutation = mutations[index];

      if (mutation === undefined) {
        throw new Error(`Missing mutation at index ${index}.`);
      }

      const unitResult = unitResults[index];

      const result =
        unitResult === null || unitResult === 'survived'
          ? passTwoResults[passTwoIndex++]
          : unitResult;

      if (result === undefined || result === null) {
        throw new Error(`Missing probe result for ${mutation.file}.`);
      }

      const row = { ...mutation, result };
      rows.push(row);
    }
  }

  return rows;
}

async function runPreflight(
  inventories: readonly { module: Module; mutations: Mutation[] }[],
  pool: WorktreePool,
  options: Options,
): Promise<void> {
  const checkout = pool.workers[0];

  if (checkout === undefined) {
    throw new Error('No checkout available for preflight.');
  }

  for (const { module } of inventories) {
    if (module.unitTest !== undefined) {
      await requirePreflight(
        checkout,
        [module.unitTest],
        options.unitTimeout,
        `bun test --bail ${module.unitTest}`,
      );
    }
  }

  await requirePreflight(
    checkout,
    ['src/replica/'],
    options.replicaTimeout,
    'bun test --bail src/replica/',
  );
}

async function requirePreflight(
  checkout: string,
  tests: readonly string[],
  timeout: number,
  command: string,
): Promise<void> {
  const result = await runTests(checkout, tests, timeout);

  if (result === 'survived') {
    return;
  }

  const outcome = result === 'timeout' ? 'timed out' : 'failed';
  throw new Error(`Preflight command ${command} ${outcome}.`);
}

async function runBatch(
  mutations: readonly Mutation[],
  tests: readonly string[],
  timeout: number,
  pool: WorktreePool,
  onResult: (result: ProbeResult) => void,
): Promise<(ProbeResult | null)[]> {
  const results: (ProbeResult | null)[] = Array.from({ length: mutations.length }, () => null);
  let nextIndex = 0;

  const workers = pool.workers.map(async (checkout) => {
    while (true) {
      if (interruptedWith !== null) {
        throw new InterruptedRun();
      }

      const index = nextIndex++;

      if (index >= mutations.length) {
        return;
      }

      const mutation = mutations[index];

      if (mutation === undefined) {
        throw new Error(`Missing mutation at index ${index}.`);
      }

      const result = await runMutation(checkout, mutation, tests, timeout);
      results[index] = result;
      onResult(result);
    }
  });

  const settled = await Promise.allSettled(workers);

  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (rejected !== undefined) {
    throw rejected.reason;
  }

  if (interruptedWith !== null) {
    throw new InterruptedRun();
  }

  return results;
}

async function runMutation(
  checkout: string,
  mutation: Mutation,
  tests: readonly string[],
  timeout: number,
): Promise<ProbeResult> {
  throwIfInterrupted();

  const path = join(checkout, mutation.file);
  const original = await Bun.file(path).text();
  const mutated = `${original.slice(0, mutation.start)}${mutation.after}${original.slice(mutation.end)}`;
  await Bun.write(path, mutated);

  try {
    return await runTests(checkout, tests, timeout);
  } finally {
    await Bun.write(path, original);
  }
}

async function runTests(
  checkout: string,
  tests: readonly string[],
  timeout: number,
): Promise<ProbeResult> {
  let process: Process | undefined;
  let timedOut = false;

  try {
    throwIfInterrupted();

    process = Bun.spawn({
      cmd: ['bun', 'test', '--bail', ...tests],
      cwd: checkout,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    activeProcesses.add(process);

    if (interruptedWith !== null) {
      process.kill('SIGKILL');
      throw new InterruptedRun();
    }

    const timer = setTimeout(() => {
      timedOut = true;
      process?.kill('SIGKILL');
    }, timeout);

    const exitCode = await process.exited;
    clearTimeout(timer);

    if (interruptedWith !== null) {
      throw new InterruptedRun();
    }

    if (timedOut || process.signalCode === 'SIGKILL') {
      return 'timeout';
    }

    return exitCode === 0 ? 'survived' : 'killed';
  } finally {
    if (process !== undefined) {
      activeProcesses.delete(process);
    }
  }
}

function addCount(counts: Counts, result: ProbeResult): void {
  if (result === 'killed') {
    counts.killed += 1;
  } else if (result === 'survived') {
    counts.survived += 1;
  } else {
    counts.timedOut += 1;
  }
}

function summarize(rows: readonly ProbeRow[]): Counts {
  const counts: Counts = { killed: 0, survived: 0, timedOut: 0 };

  for (const row of rows) {
    addCount(counts, row.result);
  }

  return counts;
}

function parseOptions(arguments_: readonly string[]): Options {
  const modules: string[] = [];
  let jobs = DEFAULT_JOBS;
  let unitTimeout = DEFAULT_UNIT_TIMEOUT;
  let replicaTimeout = DEFAULT_REPLICA_TIMEOUT;
  let output: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === undefined) {
      throw new Error(`Missing argument at index ${index}.`);
    }

    if (!argument.startsWith('--')) {
      modules.push(argument);
      continue;
    }

    const [flag, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? arguments_[++index];

    if (value === undefined) {
      throw new Error(`Missing value for ${flag}.`);
    }

    if (flag === '--jobs') {
      jobs = positiveInteger(flag, value);
    } else if (flag === '--unit-timeout') {
      unitTimeout = positiveInteger(flag, value);
    } else if (flag === '--replica-timeout') {
      replicaTimeout = positiveInteger(flag, value);
    } else if (flag === '--out') {
      output = resolve(value);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }

  return { modules, jobs, unitTimeout, replicaTimeout, output };
}

function positiveInteger(flag: string, value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function moduleFor(name: string): Module {
  return {
    name,
    file: `src/replica/${name}.ts`,
    unitTest: undefined,
  };
}

async function moduleNames(repository: string): Promise<string[]> {
  const names: string[] = [];

  for await (const file of new Bun.Glob('src/replica/*.ts').scan({ cwd: repository })) {
    if (!file.endsWith('.test.ts')) {
      names.push(file.slice('src/replica/'.length, -'.ts'.length));
    }
  }

  return names.sort();
}

async function repositoryRoot(): Promise<string> {
  const result = await runGit(process.cwd(), ['rev-parse', '--show-toplevel']);

  return result.trim();
}

async function hasUncommittedChanges(repository: string, file: string): Promise<boolean> {
  return (await runGit(repository, ['status', '--porcelain', '--', file])).length > 0;
}

async function isTracked(repository: string, file: string): Promise<boolean> {
  try {
    await runGit(repository, ['ls-files', '--error-unmatch', '--', file]);

    return true;
  } catch {
    if (interruptedWith !== null) {
      throw new InterruptedRun();
    }

    return false;
  }
}

async function runGit(
  cwd: string,
  arguments_: readonly string[],
  allowInterrupted = false,
): Promise<string> {
  if (!allowInterrupted) {
    throwIfInterrupted();
  }

  const process = Bun.spawn({
    cmd: ['git', ...arguments_],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (!allowInterrupted && interruptedWith !== null) {
    process.kill('SIGKILL');
  }

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  if (!allowInterrupted && interruptedWith !== null) {
    throw new InterruptedRun();
  }

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${arguments_.join(' ')} failed.`);
  }

  return stdout;
}

function interrupt(signal: 'SIGINT' | 'SIGTERM'): void {
  interruptedWith ??= signal === 'SIGINT' ? 130 : 143;

  for (const process of activeProcesses) {
    process.kill(signal);
  }
}

function throwIfInterrupted(): void {
  if (interruptedWith !== null) {
    throw new InterruptedRun();
  }
}

const onSigint = (): void => interrupt('SIGINT');
const onSigterm = (): void => interrupt('SIGTERM');

process.on('SIGINT', onSigint);

process.on('SIGTERM', onSigterm);

try {
  process.exitCode = await main();
} catch (error) {
  if (error instanceof InterruptedRun) {
    console.log('Partial counts: 0 killed, 0 survived, 0 timed out.');
    process.exitCode = interruptedWith ?? 130;
  } else {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = interruptedWith ?? 1;
  }
} finally {
  process.off('SIGINT', onSigint);
  process.off('SIGTERM', onSigterm);
}
