import {
  firstFieldId,
  layoutSections,
  repeatSectionId,
  type Preset,
  type PresetCell,
  type PresetFieldCell,
  type Template,
} from '@/core/preset';
import {
  repKey,
  rowKey,
  type FieldValue,
  type FieldValues,
  type VersionedRecord,
} from '@/core/records';
import { cellLabel } from '@/core/sheet-values';
import { isSheetSet, sheetKey } from '@/core/sheets';

// `sample` gives every field a value and every repeat section two repeat blocks. `empty` shows the
// sheets as they are just after they are added: no values, so a sheet of a sheet set has no name.
export type PreviewContent = 'sample' | 'empty';

// One sheet of one template. A sheet of a sheet set takes a preview sheet id, and a single sheet
// its template id.
export type PreviewSheet = { template: Template; sheetId: string };

export type PreviewSheets = {
  records: ReadonlyMap<string, VersionedRecord>;
  // One sheet per template, in preset order.
  sheets: readonly PreviewSheet[];
};

// A template id holds no "-", so no preview sheet id equals one, as AD-18 requires.
const PREVIEW_SHEET_ID_PREFIX = 'preview-';

const REPEAT_BLOCK_COUNT = 2;

// Every sample record has this one version, as no edit ever changes it.
const SAMPLE_COUNTER = 1;
const SAMPLE_AUTHOR = 'preview';

// Sample numbers cycle through a range a d20 roll-under check can use.
const FIRST_SAMPLE_NUMBER = 10;
const SAMPLE_NUMBER_SPREAD = 6;

// Counts each field type over one sheet, so neighbouring fields get different values.
type ValueCounters = { number: number; check: number };

// The id the preview gives the sheet of the sheet set at `index` in the preset.
export function previewSheetId(index: number): string {
  return `${PREVIEW_SHEET_ID_PREFIX}${index + 1}`;
}

// The records of one sheet of every template of `preset`, hidden ones included, so the author sees
// them all. A pure function: the same preset and content give the same records.
export function previewSheets(preset: Preset, content: PreviewContent): PreviewSheets {
  const records = new Map<string, VersionedRecord>();

  const sheets = preset.templates.map((template, index): PreviewSheet => {
    const sheetId = isSheetSet(template) ? previewSheetId(index) : template.id;

    if (isSheetSet(template)) {
      addRecord(records, {
        k: sheetKey(sheetId),
        d: { set: template.id, order: 1 },
        c: SAMPLE_COUNTER,
        a: SAMPLE_AUTHOR,
      });
    }

    if (content === 'sample') {
      addSampleValues(records, template, sheetId);
    }

    return { template, sheetId };
  });

  return { records, sheets };
}

function addSampleValues(
  records: Map<string, VersionedRecord>,
  template: Template,
  sheetId: string,
): void {
  const counters: ValueCounters = { number: 0, check: 0 };

  for (const section of layoutSections(template)) {
    const sectionId = repeatSectionId(section);

    // All rows of a repeat section form one repeat block, with one record.
    if (sectionId !== null) {
      for (let block = 1; block <= REPEAT_BLOCK_COUNT; block += 1) {
        addRecord(records, {
          k: repKey(sheetId, sectionId, `sample-${block}`),
          d: { order: block, cells: sampleValues(section.rows, counters, block) },
          c: SAMPLE_COUNTER,
          a: SAMPLE_AUTHOR,
        });
      }

      continue;
    }

    // A section marked `repeat` with no field cannot pass the preset rules, so it has no record.
    if (section.repeat === true) {
      continue;
    }

    for (const row of section.rows) {
      const rowId = firstFieldId(row);

      // A row with no field has no record.
      if (rowId !== null) {
        addRecord(records, {
          k: rowKey(sheetId, rowId),
          d: sampleValues([row], counters, null),
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

// A text field shows its own label, and in a repeat block the block's number after it, so it is
// never empty: a stored text value is never "".
function sampleValues(
  rows: readonly (readonly PresetCell[])[],
  counters: ValueCounters,
  block: number | null,
): FieldValues {
  const values: [string, FieldValue][] = [];

  for (const row of rows) {
    row.forEach((cell, index) => {
      if (cell.kind === 'field') {
        values.push([cell.id, sampleValue(cell, row.slice(0, index), counters, block)]);
      }
    });
  }

  return Object.fromEntries(values);
}

function sampleValue(
  field: PresetFieldCell,
  before: readonly PresetCell[],
  counters: ValueCounters,
  block: number | null,
): FieldValue {
  if (field.type === 'number') {
    const value = FIRST_SAMPLE_NUMBER + (counters.number % SAMPLE_NUMBER_SPREAD);

    counters.number += 1;

    return value;
  }

  if (field.type === 'check') {
    const value = counters.check % 2 === 0;

    counters.check += 1;

    return value;
  }

  if (field.type === 'select' || field.type === 'dice-choice') {
    return field.options[0] ?? field.id;
  }

  const label = cellLabel(field, before);

  return block === null ? label : `${label} ${block}`;
}
