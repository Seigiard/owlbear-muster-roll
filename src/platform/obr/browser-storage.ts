import { err, ok, type Result } from '@/core/result';
import type { StorageFailure, StorageOperation, StoragePort } from '@/platform/ports';

// Reading `localStorage` itself throws when the browser blocks storage for the iframe,
// so the store is fetched inside each guarded call.
export function createBrowserStorage(getStorage: () => Storage): StoragePort {
  return {
    getItem: (key) => attempt('read', () => getStorage().getItem(key)),
    setItem: (key, value) => {
      return attempt('write', () => {
        getStorage().setItem(key, value);
      });
    },
    removeItem: (key) => {
      return attempt('remove', () => {
        getStorage().removeItem(key);
      });
    },
    keys: () => attempt('list', () => listKeys(getStorage())),
  };
}

function attempt<Value>(
  operation: StorageOperation,
  action: () => Value,
): Result<Value, StorageFailure> {
  try {
    return ok(action());
  } catch (cause) {
    return err({ operation, reason: String(cause) });
  }
}

function listKeys(storage: Storage): string[] {
  const keys: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (key !== null) {
      keys.push(key);
    }
  }

  return keys;
}
