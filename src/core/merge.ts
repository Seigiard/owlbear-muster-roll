import { sameJson } from '@/core/json';
import {
  blockDataSchema,
  type Cell,
  type Cells,
  playerDataSchema,
  playerIdSchema,
  plinkPrefix,
  type VersionedRecord,
} from '@/core/records';
import type { Generation } from '@/core/storage-key';

const PLINK_FORM = 'plink:';

// A live `plink:` and the player id its key names.
type Owner = { record: VersionedRecord; playerId: string };

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
  if (left.k.startsWith('blk:') && right.k === left.k) {
    return mergeBlock(left, right);
  }

  const ordering = compareVersions(left, right);

  if (ordering !== 0) {
    return ordering > 0 ? left : right;
  }

  // A correct client never emits one (k, c, a) with two different d. Merge must still pick
  // the same winner on every client, or it is not commutative.
  return JSON.stringify(left.d) >= JSON.stringify(right.d) ? left : right;
}

export function recordHolds(held: VersionedRecord, required: VersionedRecord): boolean {
  return sameRecord(mergeRecords(held, required), held);
}

export function assembleRecords(records: Iterable<VersionedRecord>): Map<string, VersionedRecord> {
  const assembled = new Map<string, VersionedRecord>();

  for (const record of records) {
    const old = assembled.get(record.k);
    assembled.set(record.k, old === undefined ? record : mergeRecords(old, record));
  }

  return assembled;
}

function mergeBlock(left: VersionedRecord, right: VersionedRecord): VersionedRecord {
  const l = left.l;
  const r = right.l;

  const lifecycle = compareVersions(
    { c: l?.[0] ?? 1, a: l?.[1] ?? '' },
    { c: r?.[0] ?? 1, a: r?.[1] ?? '' },
  );

  if (lifecycle !== 0) {
    return lifecycle > 0 ? left : right;
  }

  if (left.d === null || right.d === null) {
    if (left.d !== null) return right;

    if (right.d !== null) return left;

    return compareVersions(left, right) >= 0 ? left : right;
  }

  const first = blockDataSchema.parse(left.d);
  const second = blockDataSchema.parse(right.d);
  const cells: Cells = { ...first.cells };

  for (const [id, cell] of Object.entries(second.cells)) {
    const old = cells[id];

    if (old === undefined || compareCells(cell, old) > 0) cells[id] = cell;
  }

  const metadata =
    JSON.stringify([first.set !== undefined, first.order, first.set ?? null]) >=
    JSON.stringify([second.set !== undefined, second.order, second.set ?? null])
      ? first
      : second;

  const outer = compareVersions(left, right) >= 0 ? left : right;

  const merged: VersionedRecord = {
    ...outer,
    l: outer.l ?? [outer.c, outer.a],
    d: { ...metadata, cells },
  };

  if (sameRecord(left, merged)) return left;

  if (sameRecord(right, merged)) return right;

  return merged;
}

export function compareCells(left: Cell, right: Cell): Ordering {
  const order = compareVersions({ c: left[1], a: left[2] }, { c: right[1], a: right[2] });

  if (order !== 0) return order;
  const first = JSON.stringify(left[0]);
  const second = JSON.stringify(right[0]);

  return first === second ? 0 : first > second ? 1 : -1;
}

// FR19: a sheet of a sheet set has at most one owner. Two GM clients can pick owners at once and
// leave two live `plink:` records of one sheet, so every client takes the live one with the highest
// `(c, a)` as the only owner, and the higher key on an equal `(c, a)`. Returns its player id, or
// `null` with no live `plink:` of the sheet.
export function ownerOf(records: Iterable<VersionedRecord>, sheetId: string): string | null {
  const prefix = plinkPrefix(sheetId);
  let owner: Owner | null = null;

  for (const record of records) {
    if (record.k.startsWith(prefix)) {
      owner = laterOwner(owner, record, record.k.slice(prefix.length));
    }
  }

  return owner?.playerId ?? null;
}

// The owner of every sheet that has one, by sheet id, in one pass, by the rule of `ownerOf`.
export function ownersBySheet(records: Iterable<VersionedRecord>): Map<string, string> {
  const owners = new Map<string, Owner>();

  for (const record of records) {
    if (!record.k.startsWith(PLINK_FORM)) {
      continue;
    }

    const rest = record.k.slice(PLINK_FORM.length);
    const end = rest.indexOf(':');

    if (end > 0) {
      const sheetId = rest.slice(0, end);
      const owner = laterOwner(owners.get(sheetId) ?? null, record, rest.slice(end + 1));

      if (owner !== null) {
        owners.set(sheetId, owner);
      }
    }
  }

  return new Map([...owners].map(([sheetId, owner]) => [sheetId, owner.playerId]));
}

// `current`, or `record` as the owner when it is a live `plink:` of a valid player id that beats it.
function laterOwner(
  current: Owner | null,
  record: VersionedRecord,
  playerId: string,
): Owner | null {
  if (
    !playerDataSchema.safeParse(record.d).success ||
    !playerIdSchema.safeParse(playerId).success
  ) {
    return current;
  }

  if (current !== null) {
    const ordering = compareVersions(record, current.record);

    if (ordering < 0 || (ordering === 0 && record.k <= current.record.k)) {
      return current;
    }
  }

  return { record, playerId };
}

// AD-4: a GM client merges a player's proposal only when its counter is above the current record's.
// An equal counter with a higher author still counts as stale, so a player never wins a tie it
// raced a GM edit into.
export function counterAbove(proposed: Version, current: Version): boolean {
  return proposed.c > current.c;
}

// One `(k, c, a)` with one `d`: what a GM client already holds.
export function sameRecord(first: VersionedRecord, second: VersionedRecord): boolean {
  return (
    first.k === second.k &&
    compareVersions(first, second) === 0 &&
    sameJson(first.l ?? null, second.l ?? null) &&
    sameJson(first.d, second.d)
  );
}

export function nextCounter(highestKnown: number, lastMinted: number): number {
  return Math.max(highestKnown, lastMinted) + 1;
}
