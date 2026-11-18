import { z } from 'zod';

import { FORMAT_VERSION } from '@/core/format-version';
import { recordKeySchema } from '@/core/records';
import { err, ok, type Result } from '@/core/result';

// AD-11: the key prefix of the current storage format, `mr` and the format version.
const STORAGE_FORMAT = `mr${FORMAT_VERSION}`;

const CANONICAL_INTEGER = /^(?:0|[1-9][0-9]*)$/;

// A generation author and a room id sit inside a colon-separated key.
export const generationSchema = z.strictObject({
  n: z.number().int().nonnegative(),
  a: z.string().regex(/^[^:]*$/),
});

const storageKeyPartsSchema = z.strictObject({
  roomId: z.string().regex(/^[^:]+$/),
  generation: generationSchema,
  key: recordKeySchema,
});

export type Generation = z.infer<typeof generationSchema>;

export type StorageKeyParts = z.infer<typeof storageKeyPartsSchema>;

export type StorageKeyFailure = 'invalid-storage-key';

export const INITIAL_GENERATION: Generation = { n: 0, a: '' };

export function buildStorageKey(
  roomId: string,
  generation: Generation,
  key: string,
): Result<string, StorageKeyFailure> {
  const parts = storageKeyPartsSchema.safeParse({ roomId, generation, key });

  if (!parts.success) {
    return err('invalid-storage-key');
  }

  const { n, a } = parts.data.generation;

  return ok(`${STORAGE_FORMAT}:${parts.data.roomId}:${n}:${a}:${parts.data.key}`);
}

// AD-9: the marker a client sets before it writes the records of a new generation and removes once
// the generation is complete. No record key starts with "#", so a marker never reads as a record.
const INCOMPLETE_MARK = '#incomplete';

// AD-9: the marker a GM client keeps for each generation it persists, so a generation with no
// records, as after a wipe, survives a reload.
const GENERATION_MARK = '#generation';

const markerPartsSchema = z.strictObject({
  roomId: storageKeyPartsSchema.shape.roomId,
  generation: generationSchema,
});

export type StorageMarker = z.infer<typeof markerPartsSchema>;

export function incompleteMarkerKey(
  roomId: string,
  generation: Generation,
): Result<string, StorageKeyFailure> {
  return markerKey(roomId, generation, INCOMPLETE_MARK);
}

export function parseIncompleteMarkerKey(
  storageKey: string,
): Result<StorageMarker, StorageKeyFailure> {
  return parseMarkerKey(storageKey, INCOMPLETE_MARK);
}

export function generationMarkerKey(
  roomId: string,
  generation: Generation,
): Result<string, StorageKeyFailure> {
  return markerKey(roomId, generation, GENERATION_MARK);
}

export function parseGenerationMarkerKey(
  storageKey: string,
): Result<StorageMarker, StorageKeyFailure> {
  return parseMarkerKey(storageKey, GENERATION_MARK);
}

// The storage format version of a key that room `roomId` owns in any format, as `mr3:{roomId}:…` or
// `mr4:{roomId}:…`. `null` for a key of another room or of no format. A wipe deletes every key with
// a format, and an adopting GM client those of a format below the current one (AD-9).
export function roomKeyFormat(storageKey: string, roomId: string): number | null {
  const [format = '', room] = storageKey.split(':', 2);
  const version = /^mr(0|[1-9][0-9]*)$/.exec(format)?.[1];

  return version === undefined || room !== roomId || roomId === '' ? null : Number(version);
}

// True for a key of room `roomId` in a storage format older than the current one.
export function isOlderFormatRoomKey(storageKey: string, roomId: string): boolean {
  const format = roomKeyFormat(storageKey, roomId);

  return format !== null && format < FORMAT_VERSION;
}

export function parseStorageKey(storageKey: string): Result<StorageKeyParts, StorageKeyFailure> {
  const [format, roomId, counter, author, ...keySegments] = storageKey.split(':');

  if (format !== STORAGE_FORMAT || counter === undefined || !CANONICAL_INTEGER.test(counter)) {
    return err('invalid-storage-key');
  }

  const parts = storageKeyPartsSchema.safeParse({
    roomId,
    generation: { n: Number(counter), a: author },
    key: keySegments.join(':'),
  });

  return parts.success ? ok(parts.data) : err('invalid-storage-key');
}

function markerKey(
  roomId: string,
  generation: Generation,
  mark: string,
): Result<string, StorageKeyFailure> {
  const parts = markerPartsSchema.safeParse({ roomId, generation });

  if (!parts.success) {
    return err('invalid-storage-key');
  }

  const { n, a } = parts.data.generation;

  return ok(`${STORAGE_FORMAT}:${parts.data.roomId}:${n}:${a}:${mark}`);
}

function parseMarkerKey(
  storageKey: string,
  mark: string,
): Result<StorageMarker, StorageKeyFailure> {
  const [format, roomId, counter, author, found, ...rest] = storageKey.split(':');

  if (
    format !== STORAGE_FORMAT ||
    counter === undefined ||
    !CANONICAL_INTEGER.test(counter) ||
    found !== mark ||
    rest.length > 0
  ) {
    return err('invalid-storage-key');
  }

  const parts = markerPartsSchema.safeParse({
    roomId,
    generation: { n: Number(counter), a: author },
  });

  return parts.success ? ok(parts.data) : err('invalid-storage-key');
}
