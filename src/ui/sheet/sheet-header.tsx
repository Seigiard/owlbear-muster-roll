import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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

import type { SheetData } from '@/core/records';
import { parseSheetName } from '@/core/sheets';
import { copy } from '@/ui/copy';
import { Chip } from '@/ui/primitives/chip';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

import { AccessPanel } from './access-panel';
import { DuplicateCount } from './duplicate-count';

// A character's header has the "Доступ" chip, and its panel leaves out this client's own player
// id. An NPC takes no access (UX-DR10).
type SheetKindProps =
  | { kind: Extract<SheetData['kind'], 'pc'>; playerId: string }
  | { kind: Extract<SheetData['kind'], 'npc'>; playerId?: undefined };

type SheetHeaderProps = SheetKindProps & {
  // `character` heads a character's tab. `npc` heads one NPC's block on the NPC tab.
  variant?: 'character' | 'npc';
  sheetId: string;
  name: string;
  // A live `link:` record points to this sheet (UX-DR10, UX-DR19).
  tokenLinked: boolean;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections' | '$records' | '$party'>;
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

const DUPLICATE_ACTION = 'duplicate';

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
  kind,
  playerId,
  variant = 'character',
  sheetId,
  name,
  tokenLinked,
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
  const accessRef = useRef<HTMLButtonElement>(null);
  const accessPanelId = useId();
  const [accessOpen, setAccessOpen] = useState(false);
  const rejections = useStore(store.$rejections);
  const [edit, setEdit] = useState<NameEdit>(NO_EDIT);
  // `null` while the duplicate block is closed, else how many times "Дублировать…" was picked.
  const [duplicateAsk, setDuplicateAsk] = useState<number | null>(null);
  const look = VARIANT[variant];
  // Only an NPC is duplicated (UX-DR19).
  const canDuplicate = variant === 'npc';

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

  // The block closes and the focus goes back to "⋯", where the GM asked from.
  const closeDuplicate = useCallback(() => {
    setDuplicateAsk(null);
    actionsRef.current?.focus();
  }, []);

  // `Esc` in the panel closes it, and the focus goes back to "Доступ", where the GM opened it.
  const closeAccess = useCallback(() => {
    setAccessOpen(false);
    accessRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      save();
    } else if (event.key === 'Escape') {
      setEdit(cancelled(edit));
    }
  }

  return (
    <>
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
        {kind === 'pc' ? (
          <span className="shrink-0">
            <Chip
              ref={accessRef}
              pressed={accessOpen}
              expanded={accessOpen}
              controls={accessOpen ? accessPanelId : undefined}
              onPress={() => {
                setAccessOpen((open) => !open);
              }}
            >
              {copy.place.access}
            </Chip>
          </span>
        ) : null}
        <span className="shrink-0">
          <Chip>{tokenLinked ? copy.status.tokenLinked : copy.status.noToken}</Chip>
        </span>
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
            <Menu
              onAction={(action) => {
                if (action === DUPLICATE_ACTION) {
                  setDuplicateAsk((asked) => (asked ?? 0) + 1);
                } else if (action === DELETE_ACTION) {
                  onDelete();
                }
              }}
            >
              {canDuplicate ? (
                <MenuItem
                  id={DUPLICATE_ACTION}
                  className="touch-target flex cursor-default items-center rounded-sm px-3 data-focused:bg-surface-tab"
                >
                  {copy.command.duplicate}
                </MenuItem>
              ) : null}
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
      {playerId !== undefined && accessOpen ? (
        <AccessPanel
          id={accessPanelId}
          sheetId={sheetId}
          ownPlayerId={playerId}
          store={store}
          sendCommand={sendCommand}
          onClose={closeAccess}
        />
      ) : null}
      {canDuplicate && duplicateAsk !== null ? (
        <DuplicateCount
          sheetId={sheetId}
          sendCommand={sendCommand}
          store={store}
          focusRequest={duplicateAsk}
          onDone={closeDuplicate}
          onCancel={closeDuplicate}
        />
      ) : null}
    </>
  );
}

// A player's header: the name as text, with no rename and no "⋯", and the status beside it. The
// status says whether a live `acl:` record gives this player write access (UX-DR10). The `npc` look
// is the NPC tab's header, as the preset preview draws it (TASK-40); a player sees no NPC, so it
// shows no status.
export function ReadOnlySheetHeader({
  name,
  canEdit,
  variant = 'character',
}: {
  name: string;
  canEdit: boolean;
  variant?: 'character' | 'npc';
}): ReactNode {
  const look = VARIANT[variant];

  return (
    <header className={`flex items-baseline gap-2 ${look.header}`}>
      <h1 className={`min-w-[0] px-1 text-text [overflow-wrap:anywhere] ${look.name}`}>{name}</h1>
      {variant === 'npc' ? null : (
        <span className="shrink-0 text-label-sm text-text-muted">
          {canEdit ? copy.status.canEdit : copy.status.readOnly}
        </span>
      )}
    </header>
  );
}

// Drops what the GM typed and keeps a rename that is still on its way.
function cancelled(edit: NameEdit): NameEdit {
  return { ...NO_EDIT, sent: edit.sent };
}
