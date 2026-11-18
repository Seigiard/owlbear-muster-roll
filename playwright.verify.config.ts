import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { defineConfig } from '@playwright/test';

import base from './playwright.config';

const evidence = process.env.VERIFY_EVIDENCE_DIR ?? resolve('test-results/verify', randomUUID());

export default defineConfig(base, {
  forbidOnly: true,
  retries: 0,
  workers: 4,
  outputDir: resolve(evidence, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: resolve(evidence, 'report.json') }]],
  use: { trace: 'on', screenshot: 'only-on-failure' },
});
