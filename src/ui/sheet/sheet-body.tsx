import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

import {
  firstFieldId,
  layoutSections,
  repeatSectionId,
  type Template,
  type TemplateLayout,
} from '@/core/preset';
import { repKeyPrefix, rowKey, type VersionedRecord } from '@/core/records';
import { revealElement } from '@/ui/reveal';

import { DiceSheetContext, type DiceRolling, type DiceSheet } from './dice-button';
import { withRemovedRows, type SheetPending } from './pending-mark';
import { SheetSection, type BlockTools } from './preset-section';
import { TabRow } from './tab-row';
import { FieldEditingContext, type FieldEditing } from './use-field-edit';

// FR14: the repeat block "Открыть лист" asked for. It scrolls into view once, and takes the focus
// when `focus` is set.
export type BlockReveal = { instanceId: string; focus: boolean };

type SheetBodyProps = {
  // The sheet's template, as `core/sheets` resolves it.
  // The title names an untitled repeat section's "Добавить".
  template: Pick<Template, 'tabs' | 'title'>;
  sheetId: string;
  // The tab this sheet shows, as the caller's one AD-26 open-tab check picks it. The tab row reports
  // a choice through `onOpenTab`; without it the row shows the tab and keeps it.
  openTab: number | null;
  // A room player gets only tabs visible to the role. Omitted indexes keep preset-space addresses.
  visibleTabIndexes?: readonly number[];
  onOpenTab?: (index: number) => void;
  records: ReadonlyMap<string, VersionedRecord>;
  // `null` shows every value read-only, with no row controls: a player with no access to the sheet.
  editing: FieldEditing | null;
  // Anyone who sees a sheet rolls its dice, so a read-only sheet has this too.
  rolling: DiceRolling;
  // A player's edits that wait for a GM (UX-DR28). `null` for a GM, whose edits never wait.
  pending: SheetPending | null;
  // The GM's controls on each repeat block, `null` for a player and the preview.
  blockTools?: BlockTools | null;
  reveal?: BlockReveal | null;
  onRevealed?: () => void;
};

// The container query measures the content area, so a narrow window stacks every section.
export function SheetBody({
  template,
  sheetId,
  openTab,
  visibleTabIndexes,
  onOpenTab,
  records,
  editing,
  rolling,
  pending,
  blockTools = null,
  reveal = null,
  onRevealed,
}: SheetBodyProps): ReactNode {
  const shownTabIndexes = visibleTabIndexes ?? template.tabs.map((_tab, index) => index);

  const body = useRef<HTMLDivElement>(null);
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

  // Runs when the body mounts too, so a request that selected this sheet, and the tab that holds
  // its repeat block, finds that block. A repeat block that is gone shows nothing, and the request
  // still ends.
  useEffect(() => {
    if (reveal === null || openTab === null) {
      return;
    }

    const block = body.current?.querySelector<HTMLElement>(
      `[data-repeat-block="${CSS.escape(reveal.instanceId)}"]`,
    );

    revealElement(block);

    // The tab switched under the focus, so the focus goes to the repeat block, which names itself.
    if (reveal.focus) {
      block?.focus({ preventScroll: true });
    }

    onRevealed?.();
  }, [reveal, openTab, onRevealed]);

  if (openTab === null) {
    return null;
  }

  return (
    <FieldEditingContext value={editing}>
      <DiceSheetContext value={diceSheet}>
        <TabRow
          tabs={template.tabs}
          visibleTabIndexes={shownTabIndexes}
          openTab={openTab}
          onOpenTab={onOpenTab}
        >
          <div className="@container">
            <div
              ref={body}
              className="flex flex-wrap gap-4"
              data-sheet-body
              data-tab-index={openTab}
            >
              {(template.tabs[openTab]?.sections ?? []).map((section, index) => (
                <SheetSection
                  key={`${openTab}.${index}`}
                  section={section}
                  tabIndex={openTab}
                  sectionIndex={index}
                  templateTitle={template.title}
                  sheetId={sheetId}
                  records={shownRecords}
                  readOnly={editing === null}
                  pending={pending}
                  blockTools={blockTools}
                />
              ))}
            </div>
          </div>
        </TabRow>
      </DiceSheetContext>
    </FieldEditingContext>
  );
}

// The versions of the sheet's `row:` and `rep:` records on every tab, and the count of local
// changes to the values its fields show, so it changes with any value of the sheet and with no
// other record. A formula may read a field of another tab.
function sheetValuesSignature(
  template: TemplateLayout,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  localChanges: number,
): string {
  const versions: string[] = [];
  const repeatPrefixes: string[] = [];

  for (const section of layoutSections(template)) {
    const sectionId = repeatSectionId(section);

    if (section.repeat === true) {
      if (sectionId !== null) {
        repeatPrefixes.push(repKeyPrefix(sheetId, sectionId));
      }

      continue;
    }

    for (const row of section.rows) {
      const id = firstFieldId(row);

      if (id !== null) {
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
