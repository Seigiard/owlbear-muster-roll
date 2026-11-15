import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

const REPOSITORY = join(import.meta.dir, '..');
const FIXTURE_DIRECTORY = join(REPOSITORY, 'tests/support/dev-owlbear');
const MANIFEST_URL_PATTERN = /https:\/\/[\w-]+\.trycloudflare\.com\/manifest\.json/g;

type OutputObservation = { output: string; found: boolean; ended: boolean };

async function readUntil(
  stream: ReadableStream<Uint8Array>,
  expected: string,
): Promise<OutputObservation> {
  let output = '';
  const decoder = new TextDecoder();

  for await (const chunk of stream) {
    output += decoder.decode(chunk, { stream: true });

    if (output.includes(expected)) {
      return { output, found: true, ended: false };
    }
  }

  return { output, found: false, ended: true };
}

test('prints the manifest URL from its quick tunnel', async () => {
  // #given
  const folder = mkdtempSync(join(tmpdir(), 'muster-roll-dev-owlbear-'));
  const bin = join(folder, 'bin');
  const childExitFile = join(folder, 'children-exited');
  const tunnelUrl = `https://${crypto.randomUUID()}.trycloudflare.com`;
  const manifestUrl = `${tunnelUrl}/manifest.json`;

  mkdirSync(bin);

  for (const name of ['bunx', 'cloudflared']) {
    const fake = join(bin, name);

    copyFileSync(join(FIXTURE_DIRECTORY, name), fake);
    chmodSync(fake, 0o755);
  }

  const run = Bun.spawn({
    cmd: ['bun', 'run', 'dev:owlbear'],
    cwd: REPOSITORY,
    env: {
      ...process.env,
      DEV_OWLBEAR_CHILD_EXIT_FILE: childExitFile,
      DEV_OWLBEAR_TUNNEL_URL: tunnelUrl,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stderr = new Response(run.stderr).text();
  let observedRunning = false;

  try {
    // #when
    const observation = await Promise.race([
      readUntil(run.stdout, manifestUrl),
      Bun.sleep(5_000).then(() => ({ output: '', found: false, ended: false })),
    ]);

    if (observation.ended) {
      await run.exited;
    }

    const earlyExit =
      run.exitCode === null ? null : { exitCode: run.exitCode, stderr: await stderr };

    // #then
    if (observation.found || observation.ended) {
      expect(earlyExit).toBeNull();
    }

    observedRunning = observation.found && earlyExit === null;
    expect(observation.output.match(MANIFEST_URL_PATTERN) ?? []).toEqual([manifestUrl]);
  } finally {
    if (run.exitCode === null) {
      run.kill('SIGTERM');
    }

    await run.exited;
    await stderr;

    if (observedRunning) {
      expect(new Set(readFileSync(childExitFile, 'utf8').trim().split('\n'))).toEqual(
        new Set(['cloudflared', 'vite']),
      );
    }

    rmSync(folder, { recursive: true, force: true });
  }
}, 7_000);
