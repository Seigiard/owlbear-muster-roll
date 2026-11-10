import type { ReactNode } from 'react';

import type { PresetTemplate } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';

import { SheetSection } from './preset-section';
import { FieldEditingContext, type FieldEditing } from './use-field-edit';

type SheetBodyProps = {
  // The character template or the NPC template, by the sheet's kind.
  template: PresetTemplate;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  // `null` shows every value read-only, with no row controls: a player edits nothing until Epic 3.
  editing: FieldEditing | null;
};

// The container query measures the content area, so a narrow window stacks every section.
export function SheetBody({ template, sheetId, records, editing }: SheetBodyProps): ReactNode {
  return (
    <FieldEditingContext value={editing}>
      <div className="@container">
        <div className="flex flex-wrap gap-4" data-sheet-body>
          {template.sections.map((section, index) => (
            <SheetSection
              key={index}
              section={section}
              sheetId={sheetId}
              records={records}
              readOnly={editing === null}
            />
          ))}
        </div>
      </div>
    </FieldEditingContext>
  );
}
