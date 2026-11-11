import { useStore } from '@nanostores/react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { firstFieldId, type PresetTemplate } from '@/core/preset';
import { repKeyPrefix, rowKey, type VersionedRecord } from '@/core/records';

import { DiceSheetContext, type DiceRolling, type DiceSheet } from './dice-button';
import { withRemovedRows, type SheetPending } from './pending-mark';
import { SheetSection } from './preset-section';
import { FieldEditingContext, type FieldEditing } from './use-field-edit';

type SheetBodyProps = {
  // The character template or the NPC template, by the sheet's kind.
  template: PresetTemplate;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  // `null` shows every value read-only, with no row controls: a player with no access to the sheet.
  editing: FieldEditing | null;
  // Anyone who sees a sheet rolls its dice, so a read-only sheet has this too.
  rolling: DiceRolling;
  // A player's edits that wait for a GM (UX-DR28). `null` for a GM, whose edits never wait.
  pending: SheetPending | null;
};

// The container query measures the content area, so a narrow window stacks every section.
export function SheetBody({
  template,
  sheetId,
  records,
  editing,
  rolling,
  pending,
}: SheetBodyProps): ReactNode {
  const shownRecords = useMemo(() => withRemovedRows(records, pending), [records, pending]);
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
                records={shownRecords}
                readOnly={editing === null}
                pending={pending}
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
