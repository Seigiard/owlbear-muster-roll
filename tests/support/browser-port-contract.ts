import type { Result } from 'better-result';

// This binding must exercise the OBR adapter's real Chromium storage primitive.
// oxlint-disable-next-line no-restricted-imports
import { createBrowserStorage } from '@/platform/obr/browser-storage';

import {
  reportPortContractSupport,
  storageStoresOverwritesRemovesAndListsOwnedStrings,
  supportedScenario,
  unsupportedScenario,
  type PortContractFactory,
  type ScenarioSupportReport,
  type StorageFixture,
  type StorageLifecycleObservation,
} from './port-contract';

const LIVE_ONLY_REASON = 'Normal Playwright runs Vite in mock mode, outside an Owlbear live room.';

const STORAGE_FAILURE_REASON =
  'Injecting a replacement Storage would not exercise Chromium localStorage.';

export const browserPortContractFactory: PortContractFactory = {
  storageLifecycle: supportedScenario(createChromiumStorageFixture, 'real-adapter'),
  storageExternalFailure: unsupportedScenario('local-injection-only', STORAGE_FAILURE_REASON),
  broadcast: unsupportedScenario('live-only', LIVE_ONLY_REASON),
  broadcastRateLimit: unsupportedScenario(
    'live-only',
    'A real Owlbear rate-limit outcome and recovery require an owner-run live room.',
  ),
  metadata: unsupportedScenario('live-only', LIVE_ONLY_REASON),
  partyReadFailure: unsupportedScenario('local-injection-only', LIVE_ONLY_REASON),
  playerRoleFailure: unsupportedScenario('local-injection-only', LIVE_ONLY_REASON),
  metadataReadFailure: unsupportedScenario('local-injection-only', LIVE_ONLY_REASON),
  notificationFailure: unsupportedScenario('local-injection-only', LIVE_ONLY_REASON),
};

type PlainResult<Value, Failure> = { ok: true; value: Value } | { ok: false; error: Failure };

type BrowserStorageLifecycleObservation = {
  [Key in keyof StorageLifecycleObservation]: StorageLifecycleObservation[Key] extends Result<
    infer Value,
    infer Failure
  >
    ? PlainResult<Value, Failure>
    : never;
};

export async function runBrowserStorageLifecycle(): Promise<BrowserStorageLifecycleObservation> {
  const observation = await storageStoresOverwritesRemovesAndListsOwnedStrings(
    browserPortContractFactory,
  );

  return {
    missing: toPlainResult(observation.missing),
    firstWrite: toPlainResult(observation.firstWrite),
    overwrite: toPlainResult(observation.overwrite),
    secondWrite: toPlainResult(observation.secondWrite),
    overwritten: toPlainResult(observation.overwritten),
    keysBeforeRemove: toPlainResult(observation.keysBeforeRemove),
    remove: toPlainResult(observation.remove),
    removed: toPlainResult(observation.removed),
    keysAfterRemove: toPlainResult(observation.keysAfterRemove),
  };
}

export function browserPortContractSupport(): ScenarioSupportReport[] {
  return reportPortContractSupport(browserPortContractFactory);
}

function createChromiumStorageFixture(): StorageFixture {
  const storage = createBrowserStorage(() => localStorage);
  const prefix = `port-contract:${crypto.randomUUID()}:`;

  return {
    storage,
    key: (name) => `${prefix}${name}`,
    ownsKey: (key) => key.startsWith(prefix),
    cleanup: () => {
      const keys = storage.keys();

      if (!keys.isOk()) {
        return;
      }

      for (const key of keys.value) {
        if (key.startsWith(prefix)) {
          storage.removeItem(key);
        }
      }
    },
  };
}

function toPlainResult<Value, Failure>(
  result: Result<Value, Failure>,
): PlainResult<Value, Failure> {
  return result.isOk() ? { ok: true, value: result.value } : { ok: false, error: result.error };
}
