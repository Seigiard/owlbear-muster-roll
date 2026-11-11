import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

import { LAUNCH_FILE_VARIABLE } from './src/preview/protocol';
import { ensurePreviewLaunchFile, PREVIEW_LAUNCH_FILE } from './tests/support/preview';

const portOffset = createHash('sha1').update(process.cwd()).digest().readUInt16BE(0) % 18_000;
const port = 10_000 + portOffset;
const baseURL = `http://127.0.0.1:${port}`;

ensurePreviewLaunchFile(readFileSync('docs/example-preset.json', 'utf8'));

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL },
    },
  ],
  webServer: {
    command: `bunx vite --mode mock --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/index.html`,
    // TASK-40: the preview page lists this file first, as after `bun run preview <path>`.
    env: { [LAUNCH_FILE_VARIABLE]: PREVIEW_LAUNCH_FILE },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
