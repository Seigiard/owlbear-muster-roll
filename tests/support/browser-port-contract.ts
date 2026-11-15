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
};

export function runBrowserStorageLifecycle(): Promise<StorageLifecycleObservation> {
  return storageStoresOverwritesRemovesAndListsOwnedStrings(browserPortContractFactory);
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

      if (!keys.ok) {
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
