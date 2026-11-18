import type { ReactNode } from 'react';

import { dependentSheetId } from '@/core/sheets';
import type { VersionedRecord } from '@/core/records';
import { copy } from '@/copy';
import { fieldUnit, recordUnit, unitKey } from '@/ui/pending-marks';
import type { PendingEntry } from '@/ui/projection-store';

// UX-DR28: a player's edits that wait for a GM's check, and the units whose mark shows by now.
export type SheetPending = {
  entries: ReadonlyMap<string, PendingEntry>;
  marked: ReadonlySet<string>;
};

// The entries and marks of one sheet's records only, so a sheet does not follow another's edits.
export function sheetPendingOf(pending: SheetPending, sheetId: string): SheetPending {
  const entries = new Map(
    [...pending.entries].filter(([key]) => dependentSheetId(key, { d: null }) === sheetId),
  );

  return {
    entries,
    marked: new Set([...pending.marked].filter((unit) => entries.has(unitKey(unit)))),
  };
}

const NO_FIELDS: ReadonlySet<string> = new Set();

// The pending state of one row's record, as its cells and control slot show it.
export type RowPending = {
  // A removed repeat row stays in place, dimmed, with its inputs disabled, until a GM answers.
  removed: boolean;
  // The row's own mark, in its slot: a new or removed repeat row, or an edit of one whose changed
  // values show in none of its fields.
  rowMarked: boolean;
  // The fields that carry their own mark.
  markedFields: ReadonlySet<string>;
};

const NOT_PENDING: RowPending = {
  removed: false,
  rowMarked: false,
  markedFields: NO_FIELDS,
};

// `fieldIds` are the fields the row shows. `hasSlot` says the row has a slot for its own mark, as a
// repeat row has. An edit marks each changed field the row shows. An edit that changes none of
// them, as one edited back to the applied value or one of `order` alone, still waits, so the whole
// record carries the mark: in the row's slot, or else on every field of the row.
export function rowPending(
  pending: SheetPending | null,
  key: string | null,
  fieldIds: ReadonlySet<string>,
  hasSlot: boolean,
): RowPending {
  const entry = key === null ? undefined : pending?.entries.get(key);

  if (pending === null || key === null || entry === undefined) {
    return NOT_PENDING;
  }

  const recordMarked = pending.marked.has(recordUnit(key));

  if (entry.kind !== 'edit') {
    return { removed: entry.kind === 'remove', rowMarked: recordMarked, markedFields: NO_FIELDS };
  }

  const shown = [...entry.fields.keys()].filter((fieldId) => fieldIds.has(fieldId));

  if (shown.length > 0) {
    const marked = shown.filter((fieldId) => pending.marked.has(fieldUnit(key, fieldId)));

    return { removed: false, rowMarked: false, markedFields: new Set(marked) };
  }

  if (entry.fields.size > 0) {
    return NOT_PENDING;
  }

  if (!recordMarked) {
    return NOT_PENDING;
  }

  return hasSlot
    ? { removed: false, rowMarked: true, markedFields: NO_FIELDS }
    : { removed: false, rowMarked: false, markedFields: fieldIds };
}

// The records with each row a pending removal tombstones shown as the record applied to it, so the
// row keeps its place and values until a GM answers.
export function withRemovedRows(
  records: ReadonlyMap<string, VersionedRecord>,
  pending: SheetPending | null,
): ReadonlyMap<string, VersionedRecord> {
  const removed = [...(pending?.entries ?? [])].filter(
    ([, entry]) =>
      entry.kind === 'remove' && entry.applied !== undefined && entry.applied.d !== null,
  );

  if (removed.length === 0) {
    return records;
  }

  const shown = new Map(records);

  for (const [key, entry] of removed) {
    if (entry.applied !== undefined) {
      shown.set(key, entry.applied);
    }
  }

  return shown;
}

// UX-DR3: text, so it does not rely on color, on the warning surface and text pair. A field names
// it in `aria-describedby`.
export function PendingMark({ id }: { id: string }): ReactNode {
  return (
    <span
      id={id}
      className="inline-flex w-fit items-center rounded-sm bg-warning-surface px-1 text-label-sm text-warning-text"
      data-pending-mark
    >
      {copy.status.pending}
    </span>
  );
}
