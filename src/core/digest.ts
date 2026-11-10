import type { VersionedRecord } from '@/core/records';

const FNV_OFFSET_BASIS = 0x811c9dc5;

const FNV_PRIME = 0x01000193;

const encoder = new TextEncoder();

// AD-7: the XOR of a 32-bit FNV-1a hash of `(k, c, a)` over all records, as an unsigned integer.
// XOR ignores order, so two clients that hold the same versions get the same digest. `d` is left
// out: one connection never emits one `(k, c, a)` with two different `d` (AD-3).
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
  const text = `${record.k.length}:${record.k}${record.c}:${record.a.length}:${record.a}`;

  for (const byte of encoder.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}
