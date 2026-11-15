import { fileURLToPath } from 'node:url';
import { z } from 'zod';

type Mutant = {
  id: string;
  rule: string;
  file: string;
  find: string;
  replace: string;
  test: string[];
};

const mutantSchema: z.ZodType<Mutant> = z.object({
  id: z.string().min(1),
  rule: z.string().min(1),
  file: z.string().min(1),
  find: z.string().min(1),
  replace: z.string(),
  test: z.array(z.string().min(1)).min(1),
});

type MutantResult = 'killed' | 'survived' | 'stale';

type RunningTest = { exited: Promise<number>; kill(signal: string): void };

const mutantsDirectory = new URL('./', import.meta.url);
let activeTest: RunningTest | null = null;
let interrupted = false;

async function main(): Promise<number> {
  const root = await repositoryRoot();
  const availableModules = await moduleNames();
  const requestedModules = process.argv.slice(2);
  const selectedModules = requestedModules.length === 0 ? availableModules : requestedModules;
  const unknownModules = selectedModules.filter((module) => !availableModules.includes(module));

  if (unknownModules.length > 0) {
    console.error(`Unknown module: ${unknownModules.join(', ')}`);
    console.error(`Available modules: ${availableModules.join(', ')}`);

    return 1;
  }

  const modules = await Promise.all(
    selectedModules.map(async (module) => ({ module, mutants: await loadMutants(module) })),
  );

  const targetFiles = [
    ...new Set(modules.flatMap(({ mutants }) => mutants.map(({ file }) => file))),
  ];

  for (const file of targetFiles) {
    if (await hasUncommittedChanges(root, file)) {
      console.error('Refusing to run:', file, 'has uncommitted changes.');

      return 1;
    }
  }

  const results: Record<MutantResult, number> = { killed: 0, survived: 0, stale: 0 };

  for (const { module, mutants } of modules) {
    for (const mutant of mutants) {
      if (interrupted) {
        printSummary(results);

        return 130;
      }

      const result = await runMutant(root, mutant);
      results[result] += 1;
      console.log(`${module} ${mutant.id}: ${result}`);

      if (interrupted) {
        printSummary(results);

        return 130;
      }
    }
  }

  printSummary(results);

  return results.stale > 0 || results.survived > 0 ? 1 : 0;
}

async function runMutant(root: string, mutant: Mutant): Promise<MutantResult> {
  const target = `${root}/${mutant.file}`;
  const original = await Bun.file(target).text();
  const matches = countOccurrences(original, mutant.find);

  if (matches !== 1) {
    return 'stale';
  }

  const index = original.indexOf(mutant.find);
  const mutated = `${original.slice(0, index)}${mutant.replace}${original.slice(index + mutant.find.length)}`;

  try {
    await Bun.write(target, mutated);
    activeTest = Bun.spawn({
      cmd: ['bun', 'test', '--bail', ...mutant.test],
      cwd: root,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await activeTest.exited;

    return exitCode === 0 ? 'survived' : 'killed';
  } finally {
    activeTest = null;
    await Bun.write(target, original);
  }
}

async function repositoryRoot(): Promise<string> {
  const result = Bun.spawn({
    cmd: ['git', 'rev-parse', '--show-toplevel'],
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || 'Could not find the repository root.');
  }

  return stdout.trim();
}

async function moduleNames(): Promise<string[]> {
  const directory = await Array.fromAsync(
    new Bun.Glob('*.json').scan({ cwd: fileURLToPath(mutantsDirectory) }),
  );

  return directory.map((file) => file.replace(/\.json$/, '')).sort();
}

async function loadMutants(module: string): Promise<Mutant[]> {
  const source = await Bun.file(new URL(`./${module}.json`, mutantsDirectory)).text();

  return z.array(mutantSchema).parse(JSON.parse(source));
}

async function hasUncommittedChanges(root: string, file: string): Promise<boolean> {
  const result = Bun.spawn({
    cmd: ['git', 'status', '--porcelain', '--', file],
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `Could not inspect ${file}.`);
  }

  return stdout.length > 0;
}

function countOccurrences(source: string, find: string): number {
  let count = 0;
  let index = 0;

  while ((index = source.indexOf(find, index)) !== -1) {
    count += 1;
    index += find.length;
  }

  return count;
}

function printSummary(results: Record<MutantResult, number>): void {
  const total = results.killed + results.survived + results.stale;
  console.log(
    `Summary: ${total} mutants; ${results.killed} killed, ${results.survived} survived, ${results.stale} stale.`,
  );
}

function interrupt(): void {
  interrupted = true;
  activeTest?.kill('SIGINT');
}

process.on('SIGINT', interrupt);

process.on('SIGTERM', interrupt);

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
