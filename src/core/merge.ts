import type { VersionedRecord } from '@/core/records';
import type { Generation } from '@/core/storage-key';

export type Version = Pick<VersionedRecord, 'c' | 'a'>;

export type Ordering = -1 | 0 | 1;

export function compareVersions(left: Version, right: Version): Ordering {
  if (left.c !== right.c) {
    return left.c > right.c ? 1 : -1;
  }

  if (left.a === right.a) {
    return 0;
  }

  // Relational operators compare by UTF-16 code unit, so every client orders authors alike.
  return left.a > right.a ? 1 : -1;
}

export function compareGenerations(left: Generation, right: Generation): Ordering {
  return compareVersions({ c: left.n, a: left.a }, { c: right.n, a: right.a });
}

export function mergeRecords(left: VersionedRecord, right: VersionedRecord): VersionedRecord {
  const ordering = compareVersions(left, right);

  if (ordering !== 0) {
    return ordering > 0 ? left : right;
  }

  // A correct client never emits one (k, c, a) with two different d. Merge must still pick
  // the same winner on every client, or it is not commutative.
  return JSON.stringify(left.d) >= JSON.stringify(right.d) ? left : right;
}

export function nextCounter(highestKnown: number, lastMinted: number): number {
  return Math.max(highestKnown, lastMinted) + 1;
}
