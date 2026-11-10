import { compareGenerations, mergeRecords } from '@/core/merge';
import {
  parseRecord,
  parseStoredRecord,
  type RecordFailure,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import {
  buildStorageKey,
  INITIAL_GENERATION,
  parseStorageKey,
  type Generation,
  type StorageKeyFailure,
} from '@/core/storage-key';
import type { StorageFailure, StoragePort } from '@/platform/ports';

export type RecordStoreFailure = RecordFailure | StorageFailure | StorageKeyFailure;

export type GenerationLoad = { records: VersionedRecord[]; corruptKeys: string[] };

export type RecordStore = {
  write: (
    generation: Generation,
    record: VersionedRecord,
  ) => Result<VersionedRecord, RecordStoreFailure>;
  loadGeneration: (generation: Generation) => Result<GenerationLoad, StorageFailure>;
  readHighestGeneration: () => Result<Generation, StorageFailure>;
};

export function createRecordStore(storage: StoragePort, roomId: string): RecordStore {
  return {
    write: (generation, candidate) => {
      const parsed = parseRecord(candidate);

      if (!parsed.ok) {
        return parsed;
      }

      const record = parsed.value;
      const storageKey = buildStorageKey(roomId, generation, record.k);

      if (!storageKey.ok) {
        return storageKey;
      }

      const stored = readRecord(storage, storageKey.value, record.k);

      if (!stored.ok) {
        return stored;
      }

      const winner = stored.value === null ? record : mergeRecords(stored.value, record);

      if (winner === stored.value) {
        return ok(winner);
      }

      const written = storage.setItem(storageKey.value, JSON.stringify(winner));

      return written.ok ? ok(winner) : err(written.error);
    },
    loadGeneration: (generation) => {
      const keys = storage.keys();

      if (!keys.ok) {
        return keys;
      }

      const records: VersionedRecord[] = [];
      const corruptKeys: string[] = [];

      for (const storageKey of keys.value) {
        const parts = parseStorageKey(storageKey);

        if (
          parts.ok &&
          parts.value.roomId === roomId &&
          compareGenerations(parts.value.generation, generation) === 0
        ) {
          const text = storage.getItem(storageKey);

          if (!text.ok) {
            return text;
          }

          if (text.value !== null) {
            const record = parseStoredRecord(text.value, parts.value.key);

            if (record.ok) {
              records.push(record.value);
            } else {
              corruptKeys.push(parts.value.key);
            }
          }
        }
      }

      return ok({ records, corruptKeys });
    },
    readHighestGeneration: () => {
      const keys = storage.keys();

      if (!keys.ok) {
        return keys;
      }

      let highest = INITIAL_GENERATION;

      for (const storageKey of keys.value) {
        const parts = parseStorageKey(storageKey);

        if (
          parts.ok &&
          parts.value.roomId === roomId &&
          compareGenerations(parts.value.generation, highest) > 0
        ) {
          const stored = readRecord(storage, storageKey, parts.value.key);

          if (!stored.ok) {
            return stored;
          }

          if (stored.value !== null) {
            highest = parts.value.generation;
          }
        }
      }

      return ok(highest);
    },
  };
}

// An absent key and a corrupt value both read as null: neither holds a record to merge with.
function readRecord(
  storage: StoragePort,
  storageKey: string,
  key: string,
): Result<VersionedRecord | null, StorageFailure> {
  const text = storage.getItem(storageKey);

  if (!text.ok) {
    return text;
  }

  if (text.value === null) {
    return ok(null);
  }

  const record = parseStoredRecord(text.value, key);

  return ok(record.ok ? record.value : null);
}
