import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { FieldError, Input, TextField } from 'react-aria-components';

import { parseSheetName } from '@/core/sheets';
import { copy } from '@/ui/copy';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

type CharacterHeaderProps = {
  sheetId: string;
  name: string;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejection'>;
  // True for a sheet this window has just created, so the GM can type its name at once.
  focusName: boolean;
  onNameFocused: () => void;
};

// `typed` is what the GM has typed and not yet left. `sent` is a saved name the projection has not
// brought back yet, so the field does not flash the old name while the delta is on its way. Its
// command id ties a rejection to it, so a refused name does not stay in the field.
type SentName = { name: string; commandId: string };

type NameEdit = { typed: string | null; sent: SentName | null; tooLong: boolean };

const NO_EDIT: NameEdit = { typed: null, sent: null, tooLong: false };

export function CharacterHeader({
  sheetId,
  name,
  sendCommand,
  store,
  focusName,
  onNameFocused,
}: CharacterHeaderProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const rejection = useStore(store.$rejection);
  const [edit, setEdit] = useState<NameEdit>(NO_EDIT);

  // Only the projection bringing back the last sent name ends the wait. An earlier rename that
  // lands first must not show while the last one is still on its way.
  const settled =
    edit.sent !== null && (edit.sent.name === name || edit.sent.commandId === rejection?.id);

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
    <header className="mb-3 border-b border-line pb-2">
      <TextField
        className="flex flex-col gap-1"
        aria-label={copy.label.sheetName}
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
          className="touch-target w-full border-b border-dotted border-line-strong bg-transparent px-1 text-sheet-title text-text"
        />
        <FieldError className="text-label-sm text-danger-text">{copy.valueTooLong}</FieldError>
      </TextField>
    </header>
  );
}

// Drops what the GM typed and keeps a rename that is still on its way.
function cancelled(edit: NameEdit): NameEdit {
  return { ...NO_EDIT, sent: edit.sent };
}
