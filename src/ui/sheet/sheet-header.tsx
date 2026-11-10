import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  Button as AriaButton,
  FieldError,
  Input,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  TextField,
} from 'react-aria-components';

import { parseSheetName } from '@/core/sheets';
import { copy } from '@/ui/copy';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

type SheetHeaderProps = {
  // `character` heads a character's tab. `npc` heads one NPC's block on the NPC tab.
  variant?: 'character' | 'npc';
  sheetId: string;
  name: string;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections'>;
  // True for a sheet this window has just created, so the GM can type its name at once.
  focusName: boolean;
  onNameFocused: () => void;
  onDelete: () => void;
  // True after the GM cancels a deletion, so the focus goes back where the GM asked from.
  focusActions: boolean;
  onActionsFocused: () => void;
};

// `typed` is what the GM has typed and not yet left. `sent` is a saved name the projection has not
// brought back yet, so the field does not flash the old name while the delta is on its way. Its
// command id ties a rejection to it, so a refused name does not stay in the field.
type SentName = { name: string; commandId: string };

type NameEdit = { typed: string | null; sent: SentName | null; tooLong: boolean };

const NO_EDIT: NameEdit = { typed: null, sent: null, tooLong: false };

const DELETE_ACTION = 'delete';

const MORE = '⋯';

const VARIANT = {
  character: {
    header: 'mb-3 border-b border-line pb-2',
    name: 'text-sheet-title',
    label: copy.label.sheetName,
  },
  npc: {
    header: 'mb-2 border-l-2 border-line pl-2',
    name: 'text-section-heading',
    label: copy.label.npcName,
  },
} as const;

export function SheetHeader({
  variant = 'character',
  sheetId,
  name,
  sendCommand,
  store,
  focusName,
  onNameFocused,
  onDelete,
  focusActions,
  onActionsFocused,
}: SheetHeaderProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const rejections = useStore(store.$rejections);
  const [edit, setEdit] = useState<NameEdit>(NO_EDIT);
  const look = VARIANT[variant];

  // Only the projection bringing back the last sent name ends the wait. An earlier rename that
  // lands first must not show while the last one is still on its way.
  const settled =
    edit.sent !== null && (edit.sent.name === name || rejections.has(edit.sent.commandId));

  if (settled) {
    setEdit({ ...edit, sent: null });
  }

  const shownName = settled ? name : (edit.sent?.name ?? name);

  useEffect(() => {
    if (focusName) {
      inputRef.current?.focus();
      inputRef.current?.select();
      onNameFocused();
    }
  }, [focusName, onNameFocused]);

  useEffect(() => {
    if (focusActions) {
      actionsRef.current?.focus();
      onActionsFocused();
    }
  }, [focusActions, onActionsFocused]);

  function save(): void {
    if (edit.typed === null) {
      return;
    }

    const parsed = parseSheetName(edit.typed);

    if (!parsed.ok) {
      // A blank name returns the old one. A long one stays in the field for correction.
      setEdit(parsed.error === 'empty' ? cancelled(edit) : { ...edit, tooLong: true });

      return;
    }

    if (parsed.value === shownName) {
      setEdit(cancelled(edit));

      return;
    }

    const sent = sendCommand({ type: 'sheet-rename', sheetId, name: parsed.value });

    setEdit({
      typed: null,
      sent: sent.ok ? { name: parsed.value, commandId: sent.value } : edit.sent,
      tooLong: false,
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      save();
    } else if (event.key === 'Escape') {
      setEdit(cancelled(edit));
    }
  }

  return (
    <header className={`flex items-start gap-2 ${look.header}`}>
      <TextField
        className="flex min-w-[0] flex-1 flex-col gap-1"
        aria-label={look.label}
        value={edit.typed ?? shownName}
        isInvalid={edit.tooLong}
        onChange={(typed) => {
          setEdit((current) => ({ ...current, typed }));
        }}
        onBlur={save}
      >
        <Input
          ref={inputRef}
          onKeyDown={handleKeyDown}
          className={`touch-target w-full border-b border-dotted border-line-strong bg-transparent px-1 text-text ${look.name}`}
        />
        <FieldError className="text-label-sm text-danger-text">{copy.valueTooLong}</FieldError>
      </TextField>
      <MenuTrigger>
        <AriaButton
          ref={actionsRef}
          aria-label={copy.label.sheetActions}
          className="touch-target inline-flex shrink-0 items-center justify-center rounded-sm px-3 text-text"
        >
          {MORE}
        </AriaButton>
        <Popover
          placement="bottom end"
          className="rounded-md border border-line bg-surface-bar p-1 text-body text-text"
        >
          <Menu onAction={onDelete}>
            <MenuItem
              id={DELETE_ACTION}
              className="touch-target flex cursor-default items-center rounded-sm px-3 data-focused:bg-surface-tab"
            >
              {copy.command.delete}
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
    </header>
  );
}

// Drops what the GM typed and keeps a rename that is still on its way.
function cancelled(edit: NameEdit): NameEdit {
  return { ...NO_EDIT, sent: edit.sent };
}
