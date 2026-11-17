import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  firstFieldId,
  layoutSections,
  repeatSectionId,
  type RenderedTab,
  type Template,
  type TemplateLayout,
} from '@/core/preset';
import { repKeyPrefix, rowKey, type VersionedRecord } from '@/core/records';
import { repeatBlocks } from '@/core/sheet-values';
import { sectionShownTo } from '@/core/visibility';
import { copy } from '@/copy';
import { IconButton } from '@/ui/primitives/icon-button';
import { revealElement } from '@/ui/reveal';

import { DiceSheetContext, type DiceRolling, type DiceSheet } from './dice-button';
import { DeleteConfirmation } from './delete-confirmation';
import { withRemovedRows, type SheetPending } from './pending-mark';
import { SheetSection, type BlockTools } from './preset-section';
import { FieldEditingContext, type FieldEditing } from './use-field-edit';

// FR14: the token cell "Открыть лист" asked for. It scrolls into view once, and takes the focus
// when `focus` is set. A null instance addresses a root cell.
export type BlockReveal = { instanceId: string | null; cellId: string; focus: boolean };

type SheetBodyProps = {
  // The sheet's template, as `core/sheets` resolves it.
  // The title names an untitled repeat section's "Добавить".
  template: Template;
  sheetId: string;
  // The tab this sheet shows, as the caller's one AD-26 open-tab check picks it.
  openTab: number | null;
  renderedTab?: RenderedTab | null;
  records: ReadonlyMap<string, VersionedRecord>;
  // `null` shows every value read-only, with no row controls: a player with no access to the sheet.
  editing: FieldEditing | null;
  // Anyone who sees a sheet rolls its dice, so a read-only sheet has this too.
  rolling: DiceRolling;
  // A player's edits that wait for a GM (UX-DR28). `null` for a GM, whose edits never wait.
  pending: SheetPending | null;
  tabBlockEditing?: Pick<FieldEditing, 'sendCommand'> | null;
  role?: 'GM' | 'PLAYER';
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
  renderedTab = null,
  records,
  editing,
  rolling,
  pending,
  tabBlockEditing = null,
  role = 'GM',
  blockTools = null,
  reveal = null,
  onRevealed,
}: SheetBodyProps): ReactNode {
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
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      const scope =
        reveal.instanceId === null
          ? body.current
          : body.current?.querySelector<HTMLElement>(
              `[data-repeat-block="${CSS.escape(reveal.instanceId)}"]`,
            );

      const cell = scope?.querySelector<HTMLElement>(
        `[data-cell-id="${CSS.escape(reveal.cellId)}"][data-cell-scope="${CSS.escape(
          reveal.instanceId ?? 'root',
        )}"]`,
      );

      revealElement(cell ?? scope);
      onRevealed?.();

      // The tab switched under the focus, so the focus goes to the target cell or its block.
      if (reveal.focus) {
        setTimeout(() => {
          (cell ?? scope)?.focus({ preventScroll: true });
        });
      }
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [reveal, openTab, onRevealed]);

  const renderedTabKey =
    renderedTab === null
      ? JSON.stringify([openTab, null, null])
      : JSON.stringify([
          renderedTab.sourceIndex,
          renderedTab.block?.scopeId ?? null,
          renderedTab.block?.instanceId ?? null,
        ]);

  const previousRenderedTab = useRef<RenderedTab | null>(null);

  const [settledVanishedTab, setSettledVanishedTab] = useState<string | null>(null);

  const vanishedTab =
    previousRenderedTab.current !== null &&
    renderedTab !== null &&
    previousRenderedTab.current.block !== null &&
    !sameRenderedTab(previousRenderedTab.current, renderedTab) &&
    !hasRepeatBlock(records, sheetId, previousRenderedTab.current) &&
    settledVanishedTab !== renderedTabKey;

  const displayedTab = vanishedTab ? previousRenderedTab.current : renderedTab;

  const displayedTabKey =
    displayedTab === null
      ? JSON.stringify([openTab, null, null])
      : JSON.stringify([
          displayedTab.sourceIndex,
          displayedTab.block?.scopeId ?? null,
          displayedTab.block?.instanceId ?? null,
        ]);

  useEffect(() => {
    previousRenderedTab.current = renderedTab;

    if (vanishedTab) {
      setSettledVanishedTab(renderedTabKey);
    }
  }, [renderedTab, renderedTabKey, vanishedTab]);

  if (openTab === null) {
    return null;
  }

  const displayedTabIndex = displayedTab?.sourceIndex ?? openTab;
  const displayedTabBlock = displayedTab?.block ?? null;

  const sections = (template.tabs[displayedTabIndex]?.sections ?? []).flatMap((section, index) =>
    sectionShownTo(role, template, displayedTabIndex, index)
      ? [
          <SheetSection
            key={`${displayedTabKey}.${index}`}
            template={template}
            section={section}
            tabIndex={displayedTabIndex}
            sectionIndex={index}
            templateTitle={template.title}
            sheetId={sheetId}
            records={shownRecords}
            readOnly={editing === null}
            pending={pending}
            blockTools={blockTools}
            tabBlock={displayedTabBlock}
            role={role}
          />,
        ]
      : [],
  );

  const tabContent = (
    <>
      {sections}
      {displayedTabBlock !== null && tabBlockEditing !== null && role === 'GM' ? (
        <TabBlockControls
          key={displayedTabKey}
          sheetId={sheetId}
          scopeId={displayedTabBlock.scopeId}
          instanceId={displayedTabBlock.instanceId}
          name={displayedTabBlock.name}
          editing={tabBlockEditing}
        />
      ) : null}
    </>
  );

  return (
    <FieldEditingContext value={editing}>
      <DiceSheetContext value={diceSheet}>
        <div className="@container">
          <div
            ref={body}
            className="flex flex-wrap gap-x-4 gap-y-6"
            data-sheet-body
            data-tab-index={displayedTabIndex}
          >
            {displayedTabBlock === null ? (
              tabContent
            ) : (
              <div className="contents" data-repeat-block={displayedTabBlock.instanceId}>
                {tabContent}
              </div>
            )}
          </div>
        </div>
      </DiceSheetContext>
    </FieldEditingContext>
  );
}

function sameRenderedTab(left: RenderedTab, right: RenderedTab): boolean {
  return (
    left.sourceIndex === right.sourceIndex &&
    left.block?.scopeId === right.block?.scopeId &&
    left.block?.instanceId === right.block?.instanceId
  );
}

function hasRepeatBlock(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  renderedTab: RenderedTab,
): boolean {
  const block = renderedTab.block;

  return (
    block !== null &&
    repeatBlocks(records, sheetId, block.scopeId).some(
      (candidate) => candidate.instanceId === block.instanceId,
    )
  );
}

function TabBlockControls({
  sheetId,
  scopeId,
  instanceId,
  name,
  editing,
}: {
  sheetId: string;
  scopeId: string;
  instanceId: string;
  name: string;
  editing: Pick<FieldEditing, 'sendCommand'>;
}): ReactNode {
  const [asking, setAsking] = useState(false);
  const [waiting, setWaiting] = useState(false);

  function confirm(): void {
    if (waiting) return;

    setWaiting(true);
    void editing
      .sendCommand({
        type: 'repeat-block-delete',
        sheetId,
        sectionId: scopeId,
        instanceId,
      })
      .then((outcome) => {
        if (outcome.kind !== 'answered') {
          setWaiting(false);
        }
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a tab block deletion', error);
        setWaiting(false);
      });
  }

  return asking ? (
    <DeleteConfirmation
      name={name === '' ? copy.unnamed : name}
      onConfirm={confirm}
      onCancel={() => {
        if (!waiting) setAsking(false);
      }}
    />
  ) : (
    <IconButton
      icon={<span aria-hidden>×</span>}
      label={copy.command.delete}
      tone="danger"
      onPress={() => {
        setAsking(true);
      }}
    />
  );
}

// The versions of the sheet's root and descendant blocks on every tab, and the count of local
// changes to the values its fields show. A formula may read a field of another tab.
function sheetValuesSignature(
  template: TemplateLayout,
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  localChanges: number,
): string {
  const versions: string[] = [];
  const rootKeys = new Set<string>();
  const repeatPrefixes: string[] = [];

  for (const section of layoutSections(template)) {
    const sectionId = repeatSectionId(section);

    if (section.repeat !== undefined) {
      if (sectionId !== null) {
        repeatPrefixes.push(repKeyPrefix(sheetId, sectionId));
      }

      continue;
    }

    for (const row of section.rows) {
      if (row.repeat !== undefined) {
        repeatPrefixes.push(repKeyPrefix(sheetId, row.repeat.id));
        continue;
      }

      const id = firstFieldId(row);

      if (id !== null) {
        rootKeys.add(rowKey(sheetId, id));
      }
    }
  }

  for (const key of rootKeys) {
    const record = records.get(key);

    versions.push(record === undefined ? '' : versionOf(record));
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
  return JSON.stringify(record);
}
