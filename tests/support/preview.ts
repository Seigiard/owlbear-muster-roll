import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// TASK-40: the launch file the e2e dev server lists first, as `bun run preview <path>` would give
// it. It lives outside the repository, so the test also covers a file anywhere on disk. The name
// follows the checkout, so two worktrees never share it.
export const PREVIEW_LAUNCH_FILE = join(
  tmpdir(),
  `muster-roll-preview-${createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12)}.json`,
);

// The dev server watches the file from its start, so it must exist by then. A test writes the text
// it needs, so this never overwrites one.
export function ensurePreviewLaunchFile(text: string): void {
  if (!existsSync(PREVIEW_LAUNCH_FILE)) {
    writeFileSync(PREVIEW_LAUNCH_FILE, text);
  }
}
