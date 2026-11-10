import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import type { PresetTemplate } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { sheetKey, type SheetSummary } from '@/core/sheets';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

import { SheetHeader } from './sheet-header';
import { SheetBody } from './sheet-body';
import type { FieldEditing } from './use-field-edit';

type NpcTabProps = {
  npcs: readonly SheetSummary[];
  template: PresetTemplate;
  records: ReadonlyMap<string, VersionedRecord>;
  editing: FieldEditing;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections'>;
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
};

// Every NPC on one page, each a block from the NPC template, in the order the sheets sort in.
export function NpcTab({
  npcs,
  template,
  records,
  editing,
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
}: NpcTabProps): ReactNode {
  const addButton = useRef<HTMLButtonElement>(null);

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
        <ul className="flex flex-col gap-4">
          {npcs.map((npc) => {
            const key = sheetKey(npc.sheetId);

            return (
              <li key={key}>
                <section aria-label={npc.name}>
                  <SheetHeader
                    variant="npc"
                    sheetId={npc.sheetId}
                    name={npc.name}
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
