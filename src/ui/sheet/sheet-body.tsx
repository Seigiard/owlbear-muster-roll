import { useStore } from '@nanostores/react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { firstFieldId, type PresetTemplate } from '@/core/preset';
import { repKeyPrefix, rowKey, type VersionedRecord } from '@/core/records';

import { DiceSheetContext, type DiceRolling, type DiceSheet } from './dice-button';
import { SheetSection } from './preset-section';
import { FieldEditingContext, type FieldEditing } from './use-field-edit';

type SheetBodyProps = {
  // The character template or the NPC template, by the sheet's kind.
  template: PresetTemplate;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  // `null` shows every value read-only, with no row controls: a player edits nothing until Epic 3.
  editing: FieldEditing | null;
  // Anyone who sees a sheet rolls its dice, so a read-only sheet has this too.
  rolling: DiceRolling;
};

// The container query measures the content area, so a narrow window stacks every section.
export function SheetBody({
  template,
  sheetId,
  records,
  editing,
  rolling,
}: SheetBodyProps): ReactNode {
  const localChanges = useStore(rolling.localValues.$changes).get(sheetId) ?? 0;

  const valuesSignature = useMemo(
    () => sheetValuesSignature(template, records, sheetId, localChanges),
    [template, records, sheetId, localChanges],
  );

  const diceSheet = useMemo<DiceSheet>(
    () => ({ ...rolling, valuesSignature }),
    [rolling, valuesSignature],
  );

  return (
    <FieldEditingContext value={editing}>
      <DiceSheetContext value={diceSheet}>
        <div className="@container">
          <div className="flex flex-wrap gap-4" data-sheet-body>
            {template.sections.map((section, index) => (
              <SheetSection
                key={index}
                section={section}
                sectionIndex={index}
                sheetId={sheetId}
                records={records}
                readOnly={editing === null}
              />
            ))}
          </div>
        </div>
      </DiceSheetContext>
    </FieldEditingContext>
  );
}

// The versions of the sheet's `row:` and `rep:` records, and the count of local changes to the
// values its fields show, so it changes with any value of the sheet and with no other record.
function sheetValuesSignature(
  template: PresetTemplate,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  localChanges: number,
): string {
  const versions: string[] = [];
  const repeatPrefixes: string[] = [];

  for (const section of template.sections) {
    for (const row of section.rows) {
      const id = firstFieldId(row);

      if (id === null) {
        continue;
      }

      if (section.repeat === true) {
        repeatPrefixes.push(repKeyPrefix(sheetId, id));
      } else {
        const record = records.get(rowKey(sheetId, id));

        versions.push(record === undefined ? '' : versionOf(record));
      }
    }
  }

  for (const record of records.values()) {
    if (repeatPrefixes.some((prefix) => record.k.startsWith(prefix))) {
      versions.push(versionOf(record));
    }
  }

  // The records come in no set order.
  versions.sort();

  return JSON.stringify([localChanges, versions]);
}

function versionOf(record: VersionedRecord): string {
  return `${record.k} ${record.c} ${record.a}`;
}
