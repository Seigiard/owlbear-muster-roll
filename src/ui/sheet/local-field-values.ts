import { atom, type ReadableAtom } from 'nanostores';

import type { ShownValue } from '@/core/dice-roll';
import type { FieldPatchTarget } from '@/core/field-patch';
import { sameAddress } from '@/core/block-address';

// A field whose shown value lives in the window only: text not sent yet, or an input error.
export type LocalFieldValue = {
  sheetId: string;
  target: FieldPatchTarget;
  fieldId: string;
  shown: ShownValue;
};

// Each editable field registers a read of its local value, `null` while it shows the record's.
export type LocalFieldValues = {
  // Returns the function that takes the read back out.
  register: (read: () => LocalFieldValue | null) => () => void;
  read: (sheetId: string) => LocalFieldValue[];
  // How many times a field of each sheet changed the value it shows locally.
  $changes: ReadableAtom<ReadonlyMap<string, number>>;
  changed: (sheetId: string) => void;
};

export function createLocalFieldValues(): LocalFieldValues {
  const reads = new Set<() => LocalFieldValue | null>();
  const $changes = atom<ReadonlyMap<string, number>>(new Map());

  return {
    register: (read) => {
      reads.add(read);

      return () => {
        reads.delete(read);
      };
    },
    read: (sheetId) => {
      const values: LocalFieldValue[] = [];

      for (const read of reads) {
        const value = read();

        if (value !== null && value.sheetId === sheetId) {
          values.push(value);
        }
      }

      return values;
    },
    $changes,
    changed: (sheetId) => {
      const next = new Map($changes.get());

      next.set(sheetId, (next.get(sheetId) ?? 0) + 1);
      $changes.set(next);
    },
  };
}

// The local values a formula in the rolled row can reach, by field id, as the 1.10 resolver reaches
// them: the row's own fields first, then the fields of the sheet's plain rows. `ownTarget` is the
// rolled row's record, `null` for a row with no field. `ownFieldIds` are the ids of the rolled
// row's fields, which hide a plain-row field of the same id.
export function shownForRoll(
  values: readonly LocalFieldValue[],
  ownTarget: FieldPatchTarget | null,
  ownFieldIds: ReadonlySet<string>,
): Map<string, ShownValue> {
  const shown = new Map<string, ShownValue>();

  for (const value of values) {
    const ownRow = ownTarget !== null && sameTarget(value.target, ownTarget);
    const reachable = ownRow || (value.target.kind === 'row' && !ownFieldIds.has(value.fieldId));

    if (reachable) {
      shown.set(value.fieldId, value.shown);
    }
  }

  return shown;
}

function sameTarget(first: FieldPatchTarget, second: FieldPatchTarget): boolean {
  if (first.kind === 'row') {
    return second.kind === 'row' && first.rowId === second.rowId;
  }

  if (second.kind !== 'rep') return false;

  if ('block' in first) {
    return 'block' in second && sameAddress(first.block, second.block);
  }

  return (
    !('block' in second) &&
    first.sectionId === second.sectionId &&
    first.instanceId === second.instanceId &&
    JSON.stringify(first.path ?? null) === JSON.stringify(second.path ?? null)
  );
}
