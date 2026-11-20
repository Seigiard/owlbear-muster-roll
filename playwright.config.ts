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
    // Node 26.13.1 and earlier abort the server mid-run in Buffer.byteLength:
    // https://github.com/nodejs/node/issues/66870. Drop the flag once the Node
    // in .tool-versions has the fix. NODE_OPTIONS does not accept V8 flags.
    command: `node --no-turbo-fast-api-calls node_modules/vite/bin/vite.js --mode mock --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/index.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
