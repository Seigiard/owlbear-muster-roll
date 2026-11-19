import { expect, test } from '@playwright/test';

import { PORT_CONTRACT_SCENARIOS } from './support/port-contract';

test.describe('Chromium port contract', () => {
  test(PORT_CONTRACT_SCENARIOS.clock, async ({ page }) => {
    // #given
    await page.goto('/index.html');

    // #when
    const observation = await page.evaluate(async (moduleUrl) => {
      // SAFETY: this test passes the fixed Vite URL for the statically typed support module.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const contract = (await import(
        moduleUrl
      )) as typeof import('./support/browser-port-contract');

      return contract.runBrowserClockContract();
    }, '/tests/support/browser-port-contract.ts');

    // #then
    expect(observation).toEqual({
      finite: true,
      nondecreasing: true,
      nearWallTime: true,
      immediateCalls: 0,
      calls: 1,
      canceledCalls: 0,
      abortedCalls: 0,
      firedAfterDelay: true,
    });
  });

  test(PORT_CONTRACT_SCENARIOS.storageLifecycle, async ({ page }) => {
    // #given
    await page.goto('/index.html');

    // #when
    const observation = await page.evaluate(async (moduleUrl) => {
      // SAFETY: this test passes the fixed Vite URL for the statically typed support module.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const contract = (await import(
        moduleUrl
      )) as typeof import('./support/browser-port-contract');

      return contract.runBrowserStorageLifecycle();
    }, '/tests/support/browser-port-contract.ts');

    // #then
    expect(observation).toEqual({
      missing: { ok: true, value: null },
      firstWrite: { ok: true, value: undefined },
      overwrite: { ok: true, value: undefined },
      secondWrite: { ok: true, value: undefined },
      overwritten: { ok: true, value: 'overwritten value' },
      keysBeforeRemove: { ok: true, value: ['first', 'second'] },
      remove: { ok: true, value: undefined },
      removed: { ok: true, value: null },
      keysAfterRemove: { ok: true, value: ['second'] },
    });
  });
});
