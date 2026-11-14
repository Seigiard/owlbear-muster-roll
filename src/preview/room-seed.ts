import { deflateToBase64 } from '@/core/deflate';
import { parsePresetFile, type PresetFailure } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { ok, type Result } from '@/core/result';
import { buildStorageKey, INITIAL_GENERATION, type StorageKeyFailure } from '@/core/storage-key';
// The side-effect-free room id and connection id are safe for the host page to import.
// oxlint-disable-next-line no-restricted-imports
import { MOCK_CONNECTION_ID, MOCK_ROOM_ID } from '@/platform/mock/client-params';

import { previewSheets } from './sample-records';

export type RoomStorageEntry = readonly [key: string, value: string];

export type RoomSeedFailure = PresetFailure | StorageKeyFailure;

// Builds the records the mock background reads on its first catch-up. It does not touch browser
// storage, so the same entries can be inspected in a unit test and written by the host page.
export function roomSeed(presetText: string): Result<readonly RoomStorageEntry[], RoomSeedFailure> {
  const parsed = parsePresetFile(presetText);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const preview = previewSheets(parsed.value, 'sample');

  const records: VersionedRecord[] = [
    {
      k: 'preset',
      d: deflateToBase64(JSON.stringify(parsed.value)),
      c: 1,
      a: MOCK_CONNECTION_ID,
    },
    ...preview.records.values(),
  ];

  const entries: RoomStorageEntry[] = [];

  for (const record of records) {
    const key = buildStorageKey(MOCK_ROOM_ID, INITIAL_GENERATION, record.k);

    if (!key.ok) {
      return key;
    }

    entries.push([key.value, JSON.stringify(record)]);
  }

  return ok(entries);
}
