import type { PresetCell, PresetSection } from '@/core/preset';
import {
  fieldValuesSchema,
  repDataSchema,
  type FieldValue,
  type VersionedRecord,
} from '@/core/records';

export type FieldValues = ReadonlyMap<string, FieldValue>;

export type RepeatInstance = { instanceId: string; values: FieldValues };

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

  const data = fieldValuesSchema.safeParse(records.get(`row:${sheetId}:${rowId}`)?.d);

  return data.success ? new Map(Object.entries(data.data)) : NO_VALUES;
}

// Ties compare by code unit, not by locale, so every client and reload gets the same order. The
// prefix ends with ":", so a sheet "a" never reads the instances of a sheet "ab".
export function repeatInstances(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  sectionId: string,
): RepeatInstance[] {
  const prefix = `rep:${sheetId}:${sectionId}:`;
  const instances: (RepeatInstance & { order: number })[] = [];

  for (const record of records.values()) {
    if (record.k.startsWith(prefix)) {
      const data = repDataSchema.safeParse(record.d);

      if (data.success) {
        instances.push({
          instanceId: record.k.slice(prefix.length),
          order: data.data.order,
          values: new Map(Object.entries(data.data.cells)),
        });
      }
    }
  }

  instances.sort((first, second) => {
    if (first.order !== second.order) {
      return first.order - second.order;
    }

    if (first.instanceId === second.instanceId) {
      return 0;
    }

    return first.instanceId < second.instanceId ? -1 : 1;
  });

  return instances.map(({ instanceId, values }) => ({ instanceId, values }));
}

// `before` holds the cells before this one in its row. A `text` cell shows its own text. A field's
// accessible name and a dice cell's label are the nearest preceding `text` cell with visible text,
// otherwise the field's id or the dice formula, so neither is ever blank.
export function cellLabel(cell: PresetCell, before: readonly PresetCell[]): string {
  if (cell.kind === 'text') {
    return cell.text;
  }

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
