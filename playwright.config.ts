import { createHash } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

const portOffset = createHash('sha1').update(process.cwd()).digest().readUInt16BE(0) % 18_000;
const port = 10_000 + portOffset;
const baseURL = `http://127.0.0.1:${port}`;

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
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
