import type { PresetCell, PresetSection } from '@/core/preset';
import {
  blockDataSchema,
  blockKey,
  cellValues,
  repDataSchema,
  repKeyPrefix,
  type FieldValue,
  type VersionedRecord,
} from '@/core/records';

export type FieldValues = ReadonlyMap<string, FieldValue>;

// One repeat block of one sheet: the values of every row of its section.
export type RepeatBlock = { instanceId: string; order: number; values: FieldValues };

const NO_VALUES: FieldValues = new Map();

// A tombstone or a missing record reads as a row with no values.
export function rowValues(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  rowId: string | null,
): FieldValues {
  if (rowId === null) {
    return NO_VALUES;
  }

  const data = blockDataSchema.safeParse(records.get(blockKey(sheetId))?.d);

  return data.success ? new Map(Object.entries(cellValues(data.data.cells))) : NO_VALUES;
}

// Ties compare by code unit, not by locale, so every client and reload gets the same order.
export function repeatBlocks(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  sectionId: string,
): RepeatBlock[] {
  const prefix = repKeyPrefix(sheetId, sectionId);
  const blocks: RepeatBlock[] = [];

  for (const record of records.values()) {
    if (record.k.startsWith(prefix)) {
      const data = repDataSchema.safeParse(record.d);

      if (data.success) {
        blocks.push({
          instanceId: record.k.slice(prefix.length),
          order: data.data.order,
          values: new Map(Object.entries(cellValues(data.data.cells))),
        });
      }
    }
  }

  blocks.sort((first, second) => {
    if (first.order !== second.order) {
      return first.order - second.order;
    }

    if (first.instanceId === second.instanceId) {
      return 0;
    }

    return first.instanceId < second.instanceId ? -1 : 1;
  });

  return blocks;
}

// `before` holds the cells before this one in its row. A `text` cell shows its own text. A field's
// accessible name and a dice cell's label are its name, then the nearest preceding `text` cell with
// visible text, otherwise the field's id or the dice formula, so neither is ever blank.
export function cellLabel(cell: PresetCell, before: readonly PresetCell[]): string {
  if (cell.kind === 'text') {
    return cell.text;
  }

  if (cell.name !== undefined) {
    return cell.name;
  }

  return cellVisibleLabel(cell, before);
}

// The dice button keeps its old visible label even when its accessible name is a cell name.
export function cellVisibleLabel(
  cell: Exclude<PresetCell, { kind: 'text' }>,
  before: readonly PresetCell[],
): string {
  for (let index = before.length - 1; index >= 0; index -= 1) {
    const other = before[index];

    if (other?.kind === 'text' && other.text.trim() !== '') {
      return other.text;
    }
  }

  return cell.kind === 'field' ? cell.id : cell.formula;
}

// A blank title counts as none, so no empty heading names the section.
export function sectionTitle(section: PresetSection): string | null {
  return section.title === undefined || section.title.trim() === '' ? null : section.title;
}

// A value of another type, as a field whose type changed leaves it, still shows, as text.
export function valueText(value: FieldValue | undefined): string {
  return value === undefined ? '' : String(value);
}

// Only `true` checks a box, so a value of another type shows unchecked.
export function isChecked(value: FieldValue | undefined): boolean {
  return value === true;
}
