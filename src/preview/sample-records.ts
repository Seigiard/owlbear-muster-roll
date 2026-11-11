import { firstFieldId, type Preset, type PresetCell, type PresetTemplate } from '@/core/preset';
import {
  repKeyPrefix,
  rowKey,
  type FieldValue,
  type FieldValues,
  type SheetData,
  type VersionedRecord,
} from '@/core/records';
import { cellLabel } from '@/core/sheet-values';

// `sample` gives every field a value and every repeat section two rows. `empty` shows the sheets
// as they are just after they are added: a name and no values.
export type PreviewContent = 'sample' | 'empty';

export type PreviewSheet = { sheetId: string; name: string };

export type PreviewSheets = {
  records: ReadonlyMap<string, VersionedRecord>;
  character: PreviewSheet;
  npc: PreviewSheet;
};

export const PREVIEW_CHARACTER: PreviewSheet = {
  sheetId: 'preview-character',
  name: 'Sample character',
};

export const PREVIEW_NPC: PreviewSheet = { sheetId: 'preview-npc', name: 'Sample NPC' };

const REPEAT_INSTANCE_COUNT = 2;

// Every sample record has this one version, as no edit ever changes it.
const SAMPLE_COUNTER = 1;
const SAMPLE_AUTHOR = 'preview';

// Sample numbers cycle through a range a d20 roll-under check can use.
const FIRST_SAMPLE_NUMBER = 10;
const SAMPLE_NUMBER_SPREAD = 6;

// Counts each field type over one sheet, so neighbouring fields get different values.
type ValueCounters = { number: number; check: number };

// The records of one character sheet and one NPC sheet of `preset`. A pure function: the same
// preset and content give the same records.
export function previewSheets(preset: Preset, content: PreviewContent): PreviewSheets {
  const records = new Map<string, VersionedRecord>();

  addSheet(records, PREVIEW_CHARACTER, 'pc', preset.character, content);
  addSheet(records, PREVIEW_NPC, 'npc', preset.npc, content);

  return { records, character: PREVIEW_CHARACTER, npc: PREVIEW_NPC };
}

function addSheet(
  records: Map<string, VersionedRecord>,
  sheet: PreviewSheet,
  kind: SheetData['kind'],
  template: PresetTemplate,
  content: PreviewContent,
): void {
  const data: SheetData = { kind, name: sheet.name, order: 1 };

  addRecord(records, { k: `sheet:${sheet.sheetId}`, d: data, c: SAMPLE_COUNTER, a: SAMPLE_AUTHOR });

  if (content === 'empty') {
    return;
  }

  const counters: ValueCounters = { number: 0, check: 0 };

  for (const section of template.sections) {
    for (const row of section.rows) {
      const rowId = firstFieldId(row);

      // A row with no field has no record.
      if (rowId === null) {
        continue;
      }

      if (section.repeat === true) {
        for (let instance = 1; instance <= REPEAT_INSTANCE_COUNT; instance += 1) {
          addRecord(records, {
            k: `${repKeyPrefix(sheet.sheetId, rowId)}sample-${instance}`,
            d: { order: instance, cells: sampleValues(row, counters, instance) },
            c: SAMPLE_COUNTER,
            a: SAMPLE_AUTHOR,
          });
        }
      } else {
        addRecord(records, {
          k: rowKey(sheet.sheetId, rowId),
          d: sampleValues(row, counters, null),
          c: SAMPLE_COUNTER,
          a: SAMPLE_AUTHOR,
        });
      }
    }
  }
}

function addRecord(records: Map<string, VersionedRecord>, record: VersionedRecord): void {
  records.set(record.k, record);
}

// A text field shows its own label, and in a repeat row the row's number after it, so it is never
// empty: a stored text value is never "".
function sampleValues(
  row: readonly PresetCell[],
  counters: ValueCounters,
  instance: number | null,
): FieldValues {
  const values: [string, FieldValue][] = [];

  row.forEach((cell, index) => {
    if (cell.kind !== 'field') {
      return;
    }

    if (cell.type === 'number') {
      values.push([cell.id, FIRST_SAMPLE_NUMBER + (counters.number % SAMPLE_NUMBER_SPREAD)]);
      counters.number += 1;
    } else if (cell.type === 'check') {
      values.push([cell.id, counters.check % 2 === 0]);
      counters.check += 1;
    } else {
      const label = cellLabel(cell, row.slice(0, index));

      values.push([cell.id, instance === null ? label : `${label} ${instance}`]);
    }
  });

  return Object.fromEntries(values);
}
