import { z } from 'zod';

import { recordKeySchema } from '@/core/records';
import { err, ok, type Result } from '@/core/result';

const STORAGE_FORMAT = 'mr1';

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
