import { compareGenerations, mergeRecords } from '@/core/merge';
import {
  parseRecord,
  parseStoredRecord,
  type RecordFailure,
  type VersionedRecord,
} from '@/core/records';
import { Result } from 'better-result';
import {
  buildStorageKey,
  generationMarkerKey,
  incompleteMarkerKey,
  INITIAL_GENERATION,
  isOlderFormatRoomKey,
  parseGenerationMarkerKey,
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
  // AD-9: the highest generation of this room with a stored record or a generation marker, and no
  // incomplete marker.
  readHighestGeneration: () => Result<Generation, StorageFailure>;
  // AD-9: set before the records of a new generation are written, and removed once the generation
  // is complete. A generation with the marker is not read at start.
  markIncomplete: (generation: Generation) => Result<void, StorageFailure | StorageKeyFailure>;
  markComplete: (generation: Generation) => Result<void, StorageFailure | StorageKeyFailure>;
  // AD-9: keeps the generation under a marker key as well as in record keys, so a generation with
  // no records, as after a wipe, survives a reload.
  markGeneration: (generation: Generation) => Result<void, StorageFailure | StorageKeyFailure>;
  // Removes every record and the markers of one generation of this room.
  removeGeneration: (generation: Generation) => Result<void, StorageFailure>;
  // Removes every record and marker of this room's generations below `generation`.
  removeGenerationsBelow: (generation: Generation) => Result<void, StorageFailure>;
  // AD-9: removes every generation of this room that still has its incomplete marker: a write that
  // stopped part way, which must not be read as data.
  removeIncomplete: () => Result<void, StorageFailure>;
  // AD-9, AD-11: removes every key of this room in a storage format older than the current one. A
  // wipe and an adopting GM client do this, as no migration reads them.
  removeOlderFormats: () => Result<void, StorageFailure>;
};

// The generation one storage key of this room belongs to, as a record or as a marker. `marker`
// names the marker kind, `null` for a record.
type KeyGeneration = { generation: Generation; marker: 'incomplete' | 'generation' | null };

export function createRecordStore(storage: StoragePort, roomId: string): RecordStore {
  return {
    write: (generation, candidate) => {
      const parsed = parseRecord(candidate);

      if (!parsed.isOk()) {
        return parsed;
      }

      const record = parsed.value;
      const storageKey = buildStorageKey(roomId, generation, record.k);

      if (!storageKey.isOk()) {
        return storageKey;
      }

      const stored = readRecord(storage, storageKey.value, record.k);

      if (!stored.isOk()) {
        return stored;
      }

      const winner = stored.value === null ? record : mergeRecords(stored.value, record);

      if (winner === stored.value) {
        return Result.ok(winner);
      }

      const written = storage.setItem(storageKey.value, JSON.stringify(winner));

      return written.isOk() ? Result.ok(winner) : Result.err(written.error);
    },
    loadGeneration: (generation) => {
      const keys = storage.keys();

      if (!keys.isOk()) {
        return keys;
      }

      const records: VersionedRecord[] = [];
      const corruptKeys: string[] = [];

      for (const storageKey of keys.value) {
        const parts = parseStorageKey(storageKey);

        if (
          parts.isOk() &&
          parts.value.roomId === roomId &&
          compareGenerations(parts.value.generation, generation) === 0
        ) {
          const text = storage.getItem(storageKey);

          if (!text.isOk()) {
            return text;
          }

          if (text.value !== null) {
            const record = parseStoredRecord(text.value, parts.value.key);

            if (record.isOk()) {
              records.push(record.value);
            } else {
              corruptKeys.push(parts.value.key);
            }
          }
        }
      }

      return Result.ok({ records, corruptKeys });
    },
    readHighestGeneration: () => {
      const keys = storage.keys();

      if (!keys.isOk()) {
        return keys;
      }

      let highest = INITIAL_GENERATION;
      const incomplete = incompleteGenerations(keys.value);

      for (const storageKey of keys.value) {
        const marker = parseGenerationMarkerKey(storageKey);

        if (
          marker.isOk() &&
          marker.value.roomId === roomId &&
          !incomplete.has(generationId(marker.value.generation)) &&
          compareGenerations(marker.value.generation, highest) > 0
        ) {
          highest = marker.value.generation;
          continue;
        }

        const parts = parseStorageKey(storageKey);

        if (
          parts.isOk() &&
          parts.value.roomId === roomId &&
          !incomplete.has(generationId(parts.value.generation)) &&
          compareGenerations(parts.value.generation, highest) > 0
        ) {
          const stored = readRecord(storage, storageKey, parts.value.key);

          if (!stored.isOk()) {
            return stored;
          }

          if (stored.value !== null) {
            highest = parts.value.generation;
          }
        }
      }

      return Result.ok(highest);
    },
    markIncomplete: (generation) => {
      const key = incompleteMarkerKey(roomId, generation);

      return key.isOk() ? storage.setItem(key.value, '1') : key;
    },
    markComplete: (generation) => {
      const key = incompleteMarkerKey(roomId, generation);

      return key.isOk() ? storage.removeItem(key.value) : key;
    },
    markGeneration: (generation) => {
      const key = generationMarkerKey(roomId, generation);

      return key.isOk() ? storage.setItem(key.value, '1') : key;
    },
    removeGeneration: (generation) =>
      removeWhere((found) => compareGenerations(found.generation, generation) === 0),
    removeGenerationsBelow: (generation) =>
      removeWhere((found) => compareGenerations(found.generation, generation) < 0),
    removeIncomplete: () => {
      const keys = storage.keys();

      if (!keys.isOk()) {
        return keys;
      }

      const incomplete = incompleteGenerations(keys.value);

      return removeWhere((found) => incomplete.has(generationId(found.generation)));
    },
    removeOlderFormats: () => {
      const keys = storage.keys();

      if (!keys.isOk()) {
        return keys;
      }

      for (const storageKey of keys.value) {
        if (isOlderFormatRoomKey(storageKey, roomId)) {
          const removed = storage.removeItem(storageKey);

          if (!removed.isOk()) {
            return removed;
          }
        }
      }

      return Result.ok(undefined);
    },
  };

  function keyGeneration(storageKey: string): KeyGeneration | null {
    const record = parseStorageKey(storageKey);

    if (record.isOk()) {
      return record.value.roomId === roomId
        ? { generation: record.value.generation, marker: null }
        : null;
    }

    const incomplete = parseIncompleteMarkerKey(storageKey);

    if (incomplete.isOk()) {
      return incomplete.value.roomId === roomId
        ? { generation: incomplete.value.generation, marker: 'incomplete' }
        : null;
    }

    const kept = parseGenerationMarkerKey(storageKey);

    return kept.isOk() && kept.value.roomId === roomId
      ? { generation: kept.value.generation, marker: 'generation' }
      : null;
  }

  function incompleteGenerations(storageKeys: readonly string[]): Set<string> {
    const found = new Set<string>();

    for (const storageKey of storageKeys) {
      const parts = keyGeneration(storageKey);

      if (parts?.marker === 'incomplete') {
        found.add(generationId(parts.generation));
      }
    }

    return found;
  }

  // Records go first, then the generation marker, and the incomplete marker last, so a removal that
  // stops part way still marks the rest.
  function removeWhere(matches: (found: KeyGeneration) => boolean): Result<void, StorageFailure> {
    const keys = storage.keys();

    if (!keys.isOk()) {
      return keys;
    }

    const generationMarkers: string[] = [];
    const incompleteMarkers: string[] = [];

    for (const storageKey of keys.value) {
      const found = keyGeneration(storageKey);

      if (found === null || !matches(found)) {
        continue;
      }

      if (found.marker === 'generation') {
        generationMarkers.push(storageKey);
        continue;
      }

      if (found.marker === 'incomplete') {
        incompleteMarkers.push(storageKey);
        continue;
      }

      const removed = storage.removeItem(storageKey);

      if (!removed.isOk()) {
        return removed;
      }
    }

    for (const storageKey of [...generationMarkers, ...incompleteMarkers]) {
      const removed = storage.removeItem(storageKey);

      if (!removed.isOk()) {
        return removed;
      }
    }

    return Result.ok(undefined);
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

  if (!text.isOk()) {
    return text;
  }

  if (text.value === null) {
    return Result.ok(null);
  }

  const record = parseStoredRecord(text.value, key);

  return Result.ok(record.isOk() ? record.value : null);
}
