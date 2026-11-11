import { z } from 'zod';

import { deflateToBase64, inflateFromBase64 } from '@/core/deflate';
import { FORMAT_VERSION } from '@/core/format-version';
import type { JsonObject, JsonValue } from '@/core/json';
import { compareGenerations, compareVersions } from '@/core/merge';
import { jsonByteLength } from '@/core/message-size';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { generationSchema, type Generation } from '@/core/storage-key';

// AD-8: the room copy lives in room metadata under this key.
export const SNAPSHOT_KEY = 'app.muster-roll/snapshot';

// Room metadata holds 16 kB for every extension of the room, and Owlbear drops a write past it
// while it reports success. All metadata with the room copy in it stays under this.
export const ROOM_METADATA_BYTE_LIMIT = 15500;

// Deflate shrinks record JSON a few times over, so an honest copy that fits the metadata limit
// inflates far below this. A crafted one stops here before the parse.
export const SNAPSHOT_INFLATED_BYTE_LIMIT = ROOM_METADATA_BYTE_LIMIT * 64;

// Read first and alone, so a copy of a newer build is refused before its data is touched.
const versionSchema = z.object({ v: z.number() });

const snapshotValueSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  data: z.base64().min(1),
});

const snapshotContentSchema = z.strictObject({
  g: generationSchema,
  records: z.array(recordSchema),
});

export type Snapshot = z.infer<typeof snapshotContentSchema>;

// The value stored under SNAPSHOT_KEY: `data` is the deflated, base64-encoded JSON of a Snapshot.
export type SnapshotValue = z.infer<typeof snapshotValueSchema>;

// `newer-version`: a newer build wrote it, so this one neither reads nor overwrites it (AD-12).
export type SnapshotFailure = 'newer-version' | 'invalid-snapshot';

export type EncodeFailure = 'too-large';

// The bytes the room copy takes in the metadata JSON, and the bytes left under the limit.
export type RoomCopyUsage = { usedBytes: number; freeBytes: number };

// AD-8 step 3: every record, tombstones and versions included, sorted by key, so two clients with
// one replica write one value.
export function encodeSnapshot(
  generation: Generation,
  records: readonly VersionedRecord[],
): Result<SnapshotValue, EncodeFailure> {
  const snapshot: Snapshot = { g: generation, records: [...records].sort(byKey) };
  const text = JSON.stringify(snapshot);

  // A copy this client could not read back would fail every read-back.
  if (new TextEncoder().encode(text).length > SNAPSHOT_INFLATED_BYTE_LIMIT) {
    return err('too-large');
  }

  return ok({ v: FORMAT_VERSION, data: deflateToBase64(text) });
}

// Reads the room copy out of all room metadata. `null` when the room has none.
export function readSnapshot(metadata: JsonObject): Result<Snapshot | null, SnapshotFailure> {
  const value = metadata[SNAPSHOT_KEY];

  if (value === undefined) {
    return ok(null);
  }

  const version = versionSchema.safeParse(value);

  if (version.success && version.data.v > FORMAT_VERSION) {
    return err('newer-version');
  }

  const parsed = snapshotValueSchema.safeParse(value);

  if (!parsed.success) {
    return err('invalid-snapshot');
  }

  const text = inflateFromBase64(parsed.data.data, SNAPSHOT_INFLATED_BYTE_LIMIT);

  if (!text.ok) {
    return err('invalid-snapshot');
  }

  try {
    const content = snapshotContentSchema.safeParse(JSON.parse(text.value));

    return content.success ? ok(content.data) : err('invalid-snapshot');
  } catch {
    return err('invalid-snapshot');
  }
}

// AD-8 step 4: the UTF-8 JSON size of all room metadata with the room copy replaced by `value`, or
// taken out when `value` is undefined.
export function roomMetadataBytes(metadata: JsonObject, value: JsonValue | undefined): number {
  const next: JsonObject = { ...metadata };

  if (value === undefined) {
    delete next[SNAPSHOT_KEY];
  } else {
    next[SNAPSHOT_KEY] = value;
  }

  return jsonByteLength(next);
}

// `usedBytes` is what the room copy adds to the metadata JSON. `freeBytes` is the limit less all
// metadata, never below 0.
export function roomCopyUsage(metadata: JsonObject): RoomCopyUsage {
  const total = jsonByteLength(metadata);
  const withoutCopy = roomMetadataBytes(metadata, undefined);

  return {
    usedBytes: total - withoutCopy,
    freeBytes: Math.max(0, ROOM_METADATA_BYTE_LIMIT - total),
  };
}

// AD-8 step 5: the read-back passes when it holds every written record at an equal or higher
// version, or when it is of a higher generation.
export function readBackHolds(written: Snapshot, readBack: Snapshot | null): boolean {
  if (readBack === null) {
    return false;
  }

  const relation = compareGenerations(readBack.g, written.g);

  if (relation !== 0) {
    return relation > 0;
  }

  const held = new Map(readBack.records.map((record) => [record.k, record]));

  return written.records.every((record) => {
    const found = held.get(record.k);

    return found !== undefined && compareVersions(found, record) >= 0;
  });
}

function byKey(left: VersionedRecord, right: VersionedRecord): number {
  if (left.k === right.k) {
    return 0;
  }

  return left.k < right.k ? -1 : 1;
}
