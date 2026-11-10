import type { ReactNode } from 'react';

import type { PresetTemplate } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';

import { SheetSection } from './preset-section';

type SheetBodyProps = {
  // The character template now. Story 1.11 passes the NPC template.
  template: PresetTemplate;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
};

// The container query measures the content area, so a narrow window stacks every section.
export function SheetBody({ template, sheetId, records }: SheetBodyProps): ReactNode {
  return (
    <div className="@container">
      <div className="flex flex-wrap gap-4" data-sheet-body>
        {template.sections.map((section, index) => (
          <SheetSection key={index} section={section} sheetId={sheetId} records={records} />
        ))}
      </div>
    </div>
  );
}
