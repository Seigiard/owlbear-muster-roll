// TASK-40: `bun run preview [path]` starts the mock dev server and opens the preset preview page.
// A path joins the page's list of repository presets and opens first. `bun run` starts in the
// repository root, so a relative path is read from there.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { err, ok, type Result } from '../src/core/result';
import { LAUNCH_FILE_VARIABLE } from '../src/preview/protocol';
import { runDevServer, type DevServerEnvironment, type DevServerLaunch } from './dev-server';

const PREVIEW_PAGE = '/preview.html';

export type Environment = DevServerEnvironment;

export type PreviewLaunch = DevServerLaunch;

// The dev server command and its environment, or the message to stop with. A launch variable the
// shell passed down is dropped, so only the path given here is listed.
export function previewLaunch(
  args: readonly string[],
  environment: Environment,
  cwd: string,
): Result<PreviewLaunch, string> {
  const [path, ...extra] = args;

  if (extra.length > 0) {
    return err('Usage: bun run preview [path-to-preset.json]');
  }

  const env = { ...environment };

  delete env[LAUNCH_FILE_VARIABLE];

  if (path !== undefined) {
    const launchFile = resolve(cwd, path);

    if (!isFile(launchFile)) {
      return err(`No preset file at ${launchFile}`);
    }

    env[LAUNCH_FILE_VARIABLE] = launchFile;
  }

  return ok({ cmd: ['bunx', 'vite', '--mode', 'mock', '--open', PREVIEW_PAGE], env });
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const launch = previewLaunch(process.argv.slice(2), process.env, process.cwd());

  if (!launch.ok) {
    console.error(launch.error);
    process.exit(1);
  }

  process.exit(await runDevServer(launch.value));
}
