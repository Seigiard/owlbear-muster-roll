import { layoutSections, repeatSectionId, type Template } from '@/core/preset';
import { repKey, type VersionedRecord } from '@/core/records';
import { isSheetSet, sheetKey } from '@/core/sheets';
import { copy } from '@/copy';

// AD-23: the records the builder's preview draws one template with. No value is set, so every field
// shows its placeholder.

// One sheet id for every template: the preview draws one template at a time, and a template id
// being edited may break the record key rules.
export const PREVIEW_SHEET_ID = 'builder-preview';

const SAMPLE_INSTANCE_ID = 'sample';

const PREVIEW_COUNTER = 1;
const PREVIEW_AUTHOR = 'builder';

// A sheet set's sample sheet gets a root block, and each repeat section gets one empty descendant
// block, so the preview shows one sample repeat block.
export function previewRecords(
  template: Template,
  sheetId: string = PREVIEW_SHEET_ID,
): Map<string, VersionedRecord> {
  const records = new Map<string, VersionedRecord>();

  {
    const key = sheetKey(sheetId);

    records.set(key, {
      k: key,
      d: isSheetSet(template) ? { set: template.id, order: 1, cells: {} } : { order: 1, cells: {} },
      c: PREVIEW_COUNTER,
      a: PREVIEW_AUTHOR,
      l: [PREVIEW_COUNTER, PREVIEW_AUTHOR],
    });
  }

  for (const section of layoutSections(template)) {
    const sectionId = repeatSectionId(section);

    if (sectionId !== null) {
      const key = repKey(sheetId, sectionId, SAMPLE_INSTANCE_ID);

      records.set(key, {
        k: key,
        d: { order: 1, cells: {} },
        c: PREVIEW_COUNTER,
        a: PREVIEW_AUTHOR,
        l: [PREVIEW_COUNTER, PREVIEW_AUTHOR],
      });
    }
  }

  return records;
}

// The name a template's preview tab and header show. A single sheet shows its `title`. A sheet
// set's sample sheet has an empty name, so it shows its name field's placeholder, the field id, or
// "Без имени" when the name field names no text field outside repeat sections on any tab.
export function previewSheetName(template: Template): string {
  if (!isSheetSet(template)) {
    return template.title;
  }

  const named = layoutSections(template).some(
    (section) =>
      section.repeat === undefined &&
      section.rows.some((row) =>
        row.cells.some(
          (cell) =>
            cell.kind === 'field' && cell.type === 'text' && cell.id === template.repeat?.nameField,
        ),
      ),
  );

  return named ? (template.repeat?.nameField ?? copy.unnamed) : copy.unnamed;
}
