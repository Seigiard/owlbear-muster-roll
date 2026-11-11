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
  incompleteMarkerKey,
  INITIAL_GENERATION,
  parseIncompleteMarkerKey,
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
  // AD-9: the highest generation of this room with a stored record and no incomplete marker.
  readHighestGeneration: () => Result<Generation, StorageFailure>;
  // AD-9: set before the records of a new generation are written, and removed once the generation
  // is complete. A generation with the marker is not read at start.
  markIncomplete: (generation: Generation) => Result<void, StorageFailure | StorageKeyFailure>;
  markComplete: (generation: Generation) => Result<void, StorageFailure | StorageKeyFailure>;
  // Removes every record and the marker of one generation of this room.
  removeGeneration: (generation: Generation) => Result<void, StorageFailure>;
  // Removes every record and marker of this room's generations below `generation`.
  removeGenerationsBelow: (generation: Generation) => Result<void, StorageFailure>;
  // AD-9: removes every generation of this room that still has its incomplete marker: a write that
  // stopped part way, which must not be read as data.
  removeIncomplete: () => Result<void, StorageFailure>;
};

// The generation one storage key of this room belongs to, as a record or as a marker.
type KeyGeneration = { generation: Generation; marker: boolean };

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
      const incomplete = incompleteGenerations(keys.value);

      for (const storageKey of keys.value) {
        const parts = parseStorageKey(storageKey);

        if (
          parts.ok &&
          parts.value.roomId === roomId &&
          !incomplete.has(generationId(parts.value.generation)) &&
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
    markIncomplete: (generation) => {
      const key = incompleteMarkerKey(roomId, generation);

      return key.ok ? storage.setItem(key.value, '1') : key;
    },
    markComplete: (generation) => {
      const key = incompleteMarkerKey(roomId, generation);

      return key.ok ? storage.removeItem(key.value) : key;
    },
    removeGeneration: (generation) =>
      removeWhere((found) => compareGenerations(found.generation, generation) === 0),
    removeGenerationsBelow: (generation) =>
      removeWhere((found) => compareGenerations(found.generation, generation) < 0),
    removeIncomplete: () => {
      const keys = storage.keys();

      if (!keys.ok) {
        return keys;
      }

      const incomplete = incompleteGenerations(keys.value);

      return removeWhere((found) => incomplete.has(generationId(found.generation)));
    },
  };

  function keyGeneration(storageKey: string): KeyGeneration | null {
    const record = parseStorageKey(storageKey);

    if (record.ok) {
      return record.value.roomId === roomId
        ? { generation: record.value.generation, marker: false }
        : null;
    }

    const marker = parseIncompleteMarkerKey(storageKey);

    return marker.ok && marker.value.roomId === roomId
      ? { generation: marker.value.generation, marker: true }
      : null;
  }

  function incompleteGenerations(storageKeys: readonly string[]): Set<string> {
    const found = new Set<string>();

    for (const storageKey of storageKeys) {
      const parts = keyGeneration(storageKey);

      if (parts?.marker === true) {
        found.add(generationId(parts.generation));
      }
    }

    return found;
  }

  // Records go first and the marker last, so a removal that stops part way still marks the rest.
  function removeWhere(matches: (found: KeyGeneration) => boolean): Result<void, StorageFailure> {
    const keys = storage.keys();

    if (!keys.ok) {
      return keys;
    }

    const markers: string[] = [];

    for (const storageKey of keys.value) {
      const found = keyGeneration(storageKey);

      if (found === null || !matches(found)) {
        continue;
      }

      if (found.marker) {
        markers.push(storageKey);
        continue;
      }

      const removed = storage.removeItem(storageKey);

      if (!removed.ok) {
        return removed;
      }
    }

    for (const storageKey of markers) {
      const removed = storage.removeItem(storageKey);

      if (!removed.ok) {
        return removed;
      }
    }

    return ok(undefined);
  }
}

// One string per generation, for a set.
function generationId(generation: Generation): string {
  return `${generation.n}:${generation.a}`;
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
