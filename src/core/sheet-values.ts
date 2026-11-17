import type { PresetCell, PresetSection } from '@/core/preset';
import {
  blockDataSchema,
  blockPathKey,
  blockKey,
  cellValues,
  parseBlockPathKey,
  repDataSchema,
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
  sectionId: string | readonly string[],
): RepeatBlock[] {
  const scopePath = Array.isArray(sectionId) ? [...sectionId] : sectionId.split(':');

  if (
    scopePath.length === 0 ||
    scopePath.length % 2 === 0 ||
    !hasLiveAncestors(records, sheetId, scopePath)
  ) {
    return [];
  }

  const blocks: RepeatBlock[] = [];

  for (const record of records.values()) {
    const parsed = parseBlockPathKey(record.k);

    if (
      parsed === null ||
      parsed.sheetId !== sheetId ||
      parsed.path.length !== scopePath.length + 1 ||
      parsed.path.slice(0, scopePath.length).some((part, index) => part !== scopePath[index])
    ) {
      continue;
    }

    const data = repDataSchema.safeParse(record.d);

    if (data.success) {
      blocks.push({
        instanceId: parsed.path.at(-1) ?? '',
        order: data.data.order,
        values: new Map(Object.entries(cellValues(data.data.cells))),
      });
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

function hasLiveAncestors(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  scopePath: readonly string[],
): boolean {
  for (let length = 2; length < scopePath.length; length += 2) {
    const parent = repDataSchema.safeParse(
      records.get(blockPathKey(sheetId, scopePath.slice(0, length)))?.d,
    );

    if (!parent.success) {
      return false;
    }
  }

  return true;
}

// `before` holds the cells before this one in its row. A `text` cell shows its own text. A field's
// accessible name and a dice cell's label are its name, then the nearest preceding `text` cell with
// visible text, otherwise the field's id or the dice formula, so neither is ever blank.
export function cellLabel(cell: PresetCell, before: readonly PresetCell[]): string {
  if (cell.kind === 'text') {
    return cell.text;
  }

  if (cell.kind !== 'token' && cell.name !== undefined) {
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

  if (cell.kind === 'field') {
    return cell.id;
  }

  if (cell.kind === 'dice') {
    return cell.formula;
  }

  return cell.id;
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
