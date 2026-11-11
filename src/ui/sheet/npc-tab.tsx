import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import type { PresetTemplate } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { sheetKey, type SheetSummary } from '@/core/sheets';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';
import { revealElement } from '@/ui/reveal';

import type { DiceRolling } from './dice-button';
import { SheetHeader } from './sheet-header';
import { SheetBody } from './sheet-body';
import type { FieldEditing } from './use-field-edit';

type NpcTabProps = {
  npcs: readonly SheetSummary[];
  template: PresetTemplate;
  records: ReadonlyMap<string, VersionedRecord>;
  // The sheets a live link points to.
  linkedSheets: ReadonlySet<string>;
  editing: FieldEditing;
  rolling: DiceRolling;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections' | '$records' | '$party'>;
  // The open delete confirmation for one of these NPCs, or `null`.
  confirmation: ReactNode;
  onAdd: () => void;
  onDelete: (sheet: SheetSummary) => void;
  // Each names a sheet by its record key.
  focusNameOf: string | null;
  onNameFocused: () => void;
  focusActionsOf: string | null;
  onActionsFocused: () => void;
  // True when a deletion leaves no NPC, so the focus does not fall to the page body.
  focusAdd: boolean;
  onAddFocused: () => void;
  // The NPC "Открыть лист" asked for, by its record key: its block scrolls into view once, and
  // takes the focus when `focus` is set.
  reveal: { sheet: string; focus: boolean } | null;
  onRevealed: () => void;
};

// Every NPC on one page, each a block from the NPC template, in the order the sheets sort in.
export function NpcTab({
  npcs,
  template,
  records,
  linkedSheets,
  editing,
  rolling,
  sendCommand,
  store,
  confirmation,
  onAdd,
  onDelete,
  focusNameOf,
  onNameFocused,
  focusActionsOf,
  onActionsFocused,
  focusAdd,
  onAddFocused,
  reveal,
  onRevealed,
}: NpcTabProps): ReactNode {
  const addButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // Runs when the tab mounts too, so a request that selected this tab finds its block.
  useEffect(() => {
    if (reveal === null) {
      return;
    }

    const block = list.current?.querySelector<HTMLElement>(
      `[data-sheet="${CSS.escape(reveal.sheet)}"]`,
    );

    revealElement(block);

    // The tab switched under the focus, so the focus goes to the block, which names the NPC.
    if (reveal.focus) {
      block?.focus({ preventScroll: true });
    }

    onRevealed();
  }, [reveal, onRevealed]);

  useEffect(() => {
    if (focusAdd) {
      addButton.current?.focus();
      onAddFocused();
    }
  }, [focusAdd, onAddFocused]);

  return (
    <>
      {confirmation}
      <div className="mb-4">
        <Button ref={addButton} onPress={onAdd}>
          {copy.command.addNpc}
        </Button>
      </div>
      {npcs.length === 0 ? null : (
        <ul ref={list} className="flex flex-col gap-4">
          {npcs.map((npc) => {
            const key = sheetKey(npc.sheetId);

            return (
              <li key={key}>
                <section aria-label={npc.name} data-sheet={key} tabIndex={-1}>
                  <SheetHeader
                    kind="npc"
                    variant="npc"
                    sheetId={npc.sheetId}
                    name={npc.name}
                    tokenLinked={linkedSheets.has(npc.sheetId)}
                    sendCommand={sendCommand}
                    store={store}
                    focusName={focusNameOf === key}
                    onNameFocused={onNameFocused}
                    onDelete={() => {
                      onDelete(npc);
                    }}
                    focusActions={focusActionsOf === key}
                    onActionsFocused={onActionsFocused}
                  />
                  <SheetBody
                    template={template}
                    sheetId={npc.sheetId}
                    records={records}
                    editing={editing}
                    rolling={rolling}
                  />
                </section>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
