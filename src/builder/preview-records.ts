import { layoutSections, repeatSectionId, type Template } from '@/core/preset';
import { repKey, type VersionedRecord } from '@/core/records';
import { sheetKey } from '@/core/sheets';
import { copy } from '@/copy';

// AD-23: the records the builder's preview draws one template with. No value is set, so every field
// shows its placeholder.

// One sheet id for every template: the preview draws one template at a time, and a template id
// being edited may break the record key rules.
export const PREVIEW_SHEET_ID = 'builder-preview';

const SAMPLE_INSTANCE_ID = 'sample';

const PREVIEW_COUNTER = 1;
const PREVIEW_AUTHOR = 'builder';

// A sheet set's sample sheet gets a `sheet:` record, and each repeat section one empty `rep:`
// record, so it shows one sample repeat block.
export function previewRecords(template: Template): Map<string, VersionedRecord> {
  const records = new Map<string, VersionedRecord>();

  if (template.kind === 'set') {
    const key = sheetKey(PREVIEW_SHEET_ID);

    records.set(key, {
      k: key,
      d: { set: template.id, order: 1 },
      c: PREVIEW_COUNTER,
      a: PREVIEW_AUTHOR,
    });
  }

  for (const section of layoutSections(template)) {
    const sectionId = repeatSectionId(section);

    if (sectionId !== null) {
      const key = repKey(PREVIEW_SHEET_ID, sectionId, SAMPLE_INSTANCE_ID);

      records.set(key, {
        k: key,
        d: { order: 1, cells: {} },
        c: PREVIEW_COUNTER,
        a: PREVIEW_AUTHOR,
      });
    }
  }

  return records;
}

// The name a template's preview tab and header show. A single sheet shows its `title`. A sheet
// set's sample sheet has an empty name, so it shows its name field's placeholder, the field id, or
// "Без имени" when the name field names no text field outside repeat sections on any tab.
export function previewSheetName(template: Template): string {
  if (template.kind === 'single') {
    return template.title;
  }

  const named = layoutSections(template).some(
    (section) =>
      section.repeat !== true &&
      section.rows.some((row) =>
        row.some(
          (cell) => cell.kind === 'field' && cell.type === 'text' && cell.id === template.nameField,
        ),
      ),
  );

  return named ? template.nameField : copy.unnamed;
}
