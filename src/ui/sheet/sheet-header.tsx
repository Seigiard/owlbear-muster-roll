import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';

import { fieldValuesSchema, rowKey, type VersionedRecord } from '@/core/records';
import type { NameField } from '@/core/sheets';
import { copy } from '@/ui/copy';
import { Chip } from '@/ui/primitives/chip';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

import { AccessPanel } from './access-panel';
import { MapToggle } from './map-toggle';
import { FieldEditingContext, useTextFieldEdit, type FieldEditing } from './use-field-edit';

const DELETE_ACTION = 'delete';

const MORE = '⋯';

const HEADER_CLASS = 'mb-3 flex items-start gap-2 border-b border-line pb-2';

const NAME_CLASS = 'text-sheet-title';

// A player's status beside the name (UX-DR10).
export type HeaderStatus = 'can-edit' | 'read-only';

// What a GM gets in the header. `access` shows the "Доступ" chip, on a visible sheet of a sheet
// set. `tokenLinked` is the token status of a linkable template, `null` for one that is not.
// `onDelete` shows "⋯" with "Удалить", on a sheet of a sheet set only.
export type GmHeader = {
  playerId: string;
  access: boolean;
  tokenLinked: boolean | null;
  onDelete: (() => void) | null;
  // True after the GM cancels a deletion, so the focus goes back where the GM asked from.
  focusActions: boolean;
  onActionsFocused: () => void;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections' | '$records' | '$party'>;
};

type SheetHeaderProps = {
  sheetId: string;
  // The sheet's name as `core` names it, "" for an empty one.
  name: string;
  // AD-18: a sheet of a sheet set is named by its name field, which anyone who may edit the sheet
  // edits here too. `null` for a single sheet, named by its title, which nobody edits.
  nameField: NameField | null;
  records: ReadonlyMap<string, VersionedRecord>;
  // `null` shows the name as text: no write access to the sheet.
  editing: FieldEditing | null;
  // A player's status, `null` for a GM.
  status: HeaderStatus | null;
  gm: GmHeader | null;
  // True for a sheet this window has just created, so the GM can type its name at once.
  focusName: boolean;
  onNameFocused: () => void;
};

// The head of a sheet's tab: the name, the GM's chips and actions, or a player's status.
export function SheetHeader({
  sheetId,
  name,
  nameField,
  records,
  editing,
  status,
  gm,
  focusName,
  onNameFocused,
}: SheetHeaderProps): ReactNode {
  const actionsRef = useRef<HTMLButtonElement>(null);
  const accessRef = useRef<HTMLButtonElement>(null);
  const accessPanelId = useId();
  const [accessOpen, setAccessOpen] = useState(false);
  const focusActions = gm?.focusActions ?? false;
  const onActionsFocused = gm?.onActionsFocused;

  useEffect(() => {
    if (focusActions) {
      actionsRef.current?.focus();
      onActionsFocused?.();
    }
  }, [focusActions, onActionsFocused]);

  // `Esc` in the panel closes it, and the focus goes back to "Доступ", where the GM opened it.
  const closeAccess = useCallback(() => {
    setAccessOpen(false);
    accessRef.current?.focus();
  }, []);

  const nameNode =
    nameField !== null && editing !== null ? (
      <FieldEditingContext value={editing}>
        <NameInput
          sheetId={sheetId}
          nameField={nameField}
          records={records}
          focusName={focusName}
          onNameFocused={onNameFocused}
        />
      </FieldEditingContext>
    ) : (
      <h1 className={`min-w-[0] flex-1 px-1 text-text [overflow-wrap:anywhere] ${NAME_CLASS}`}>
        {name === '' ? copy.unnamed : name}
      </h1>
    );

  return (
    <>
      <header className={HEADER_CLASS}>
        {nameNode}
        {status === null ? null : (
          <span className="shrink-0 self-center text-label-sm text-text-muted">
            {status === 'can-edit' ? copy.status.canEdit : copy.status.readOnly}
          </span>
        )}
        {gm?.access === true ? (
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
        {gm === null || gm.tokenLinked === null ? null : (
          <span className="shrink-0">
            <Chip>{gm.tokenLinked ? copy.status.tokenLinked : copy.status.noToken}</Chip>
          </span>
        )}
        {gm?.tokenLinked === true ? <MapToggle target={{ sheetId, instanceId: null }} /> : null}
        {gm === null || gm.onDelete === null ? null : (
          <SheetActions actionsRef={actionsRef} onDelete={gm.onDelete} />
        )}
      </header>
      {gm?.access === true && accessOpen ? (
        <AccessPanel
          id={accessPanelId}
          sheetId={sheetId}
          ownPlayerId={gm.playerId}
          store={gm.store}
          sendCommand={gm.sendCommand}
          onClose={closeAccess}
        />
      ) : null}
    </>
  );
}

// "⋯" with "Удалить".
function SheetActions({
  actionsRef,
  onDelete,
}: {
  actionsRef: RefObject<HTMLButtonElement | null>;
  onDelete: () => void;
}): ReactNode {
  return (
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
            if (action === DELETE_ACTION) {
              onDelete();
            }
          }}
        >
          <MenuItem
            id={DELETE_ACTION}
            className="touch-target flex cursor-default items-center rounded-sm px-3 data-focused:bg-surface-tab"
          >
            {copy.command.delete}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

type NameInputProps = {
  sheetId: string;
  nameField: NameField;
  records: ReadonlyMap<string, VersionedRecord>;
  focusName: boolean;
  onNameFocused: () => void;
};

// CAP-17: the name edits the same value as the name field in the sheet, a field patch of its row,
// so it saves as that field does: after a typing pause, on Enter and on blur. An empty name shows
// "Без имени" until a name is typed.
function NameInput({
  sheetId,
  nameField,
  records,
  focusName,
  onNameFocused,
}: NameInputProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const record = records.get(rowKey(sheetId, nameField.rowId));
  const values = fieldValuesSchema.safeParse(record?.d);

  const edit = useTextFieldEdit('text', {
    place: { sheetId, target: { kind: 'row', rowId: nameField.rowId }, record },
    fieldId: nameField.fieldId,
    recordValue: values.success ? values.data[nameField.fieldId] : undefined,
  });

  useEffect(() => {
    if (focusName) {
      inputRef.current?.focus();
      inputRef.current?.select();
      onNameFocused();
    }
  }, [focusName, onNameFocused]);

  return (
    <div className="flex min-w-[0] flex-1 flex-col gap-1">
      <input
        ref={inputRef}
        type="text"
        aria-label={copy.label.sheetName}
        aria-invalid={edit.error === null ? undefined : true}
        aria-describedby={edit.error === null ? undefined : errorId}
        placeholder={copy.unnamed}
        value={edit.text}
        onFocus={edit.onFocus}
        onBlur={edit.onBlur}
        onKeyDown={edit.onKeyDown}
        onChange={(event) => {
          edit.onChange(event.target.value);
        }}
        className={`touch-target w-full border-b border-dotted border-line-strong bg-transparent px-1 text-text placeholder:text-text-muted ${NAME_CLASS}`}
      />
      <span id={errorId} aria-live="polite" className="text-label-sm text-danger-text empty:hidden">
        {edit.error === 'too-long' ? copy.valueTooLong : ''}
      </span>
    </div>
  );
}
