import type { VersionedRecord } from '@/core/records';
import { canonicalJson } from '@/core/json';

const FNV_OFFSET_BASIS = 0x811c9dc5;

const FNV_PRIME = 0x01000193;

const encoder = new TextEncoder();

// Block fragments may share an outer version without sharing cell coverage.
// Canonical content makes the digest independent of object insertion order.
export function recordDigest(records: Iterable<VersionedRecord>): number {
  let digest = 0;

  for (const record of records) {
    digest ^= versionHash(record);
  }

  return digest >>> 0;
}

function versionHash(record: VersionedRecord): number {
  let hash = FNV_OFFSET_BASIS;

  // The schemas allow any character in a key and an author, so a separator alone could join two
  // different versions to one text. Lengths, in UTF-16 code units, keep the fields apart.
  const text = canonicalJson(record);

  for (const byte of encoder.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}
