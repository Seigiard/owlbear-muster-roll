import { atom, type ReadableAtom } from 'nanostores';

import type { ShownValue } from '@/core/dice-roll';
import type { FieldPatchTarget } from '@/core/field-patch';
import { blockAddress, sameAddress, type BlockAddress } from '@/core/block-address';
import {
  repeatScopePathAt,
  resolveFieldReference,
  type TemplateLayout,
  type TemplateRowPlace,
} from '@/core/preset';

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

// The rolled row's place in the template, and its repeat block, `null` outside a repeat.
export type RolledRow = Omit<TemplateRowPlace, 'path'> & { block: BlockAddress | null };

// The local values a formula in the rolled row reads, by field id. An id resolves as the formula
// resolver resolves it: to the nearest enclosing block that has the field, else to a plain row. A
// local value counts only when it belongs to exactly that record, so an enclosing block's input
// error reaches a roll in its child block, and a field of the same id elsewhere does not.
export function shownForRoll(
  values: readonly LocalFieldValue[],
  layout: TemplateLayout,
  row: RolledRow,
): Map<string, ShownValue> {
  const shown = new Map<string, ShownValue>();

  for (const value of values) {
    const source = fieldSource(layout, row, value.fieldId);

    if (source !== null && sameTarget(value.target, source)) {
      shown.set(value.fieldId, value.shown);
    }
  }

  return shown;
}

// The record the field `fieldId` resolves to from the rolled row, `null` for no field.
function fieldSource(
  layout: TemplateLayout,
  row: RolledRow,
  fieldId: string,
): FieldPatchTarget | null {
  const from: TemplateRowPlace = {
    tabIndex: row.tabIndex,
    sectionIndex: row.sectionIndex,
    rowIndex: row.rowIndex,
  };

  const reference = resolveFieldReference(layout, from, fieldId);

  if (reference === null) return null;

  if (reference.scope === 'sheet') return { kind: 'row', rowId: reference.rowId };

  // As the roll reads it: the enclosing block at the field's scope depth, a prefix of the rolled
  // block's address.
  const depth = (reference.scopePath ?? repeatScopePathAt(layout, from)).length * 2;

  if (row.block === null || depth > row.block.path.length) return null;

  const block = blockAddress(row.block.sheetId, row.block.path.slice(0, depth));

  return block === null ? null : { kind: 'rep', block };
}

function sameTarget(first: FieldPatchTarget, second: FieldPatchTarget): boolean {
  if (first.kind === 'row') {
    return second.kind === 'row' && first.rowId === second.rowId;
  }

  return second.kind === 'rep' && sameAddress(first.block, second.block);
}
