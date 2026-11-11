import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import type { RefCallback, RefObject } from 'react';

import { newInstanceId } from '@/core/ids';

import { useFieldEditing } from './use-field-edit';

// The value control of a field. A row's "Удалить" comes after its cells, so the first match is the
// row's first field.
const FIELD_SELECTOR = 'input, textarea';

export type RepeatRows = {
  addButton: RefObject<HTMLButtonElement | null>;
  rowElement: (instanceId: string) => RefCallback<HTMLElement>;
  deleteButton: (instanceId: string) => RefCallback<HTMLButtonElement>;
  add: () => void;
  remove: (instanceId: string) => void;
};

// A sent add or delete, until its delta moves the focus or a rejection ends the wait. `next` is the
// row after the deleted one when "Удалить" was pressed.
type FocusWait =
  | { kind: 'added'; instanceId: string; commandId: string }
  | { kind: 'deleted'; instanceId: string; next: string | null; commandId: string };

// The add and delete controls of one repeat section of one sheet. The window picks the new row's
// id, so it knows which row to focus when the delta brings it.
export function useRepeatRows(
  sheetId: string,
  sectionId: string,
  instanceIds: readonly string[],
): RepeatRows {
  const editing = useFieldEditing();
  const rejections = useStore(editing.$rejections);
  const [wait, setWait] = useState<FocusWait | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const rowElements = useRef(new Map<string, HTMLElement>());
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (wait === null) {
      return;
    }

    if (rejections.has(wait.commandId)) {
      setWait(null);

      return;
    }

    const present = instanceIds.includes(wait.instanceId);

    if (wait.kind === 'added' && present) {
      setWait(null);

      // The GM may have moved on while the row was on its way. Then the focus stays there.
      if (isFocusFree(addButton.current)) {
        rowElements.current
          .get(wait.instanceId)
          ?.querySelector<HTMLElement>(FIELD_SELECTOR)
          ?.focus();
      }
    } else if (wait.kind === 'deleted' && !present) {
      setWait(null);

      // The pressed "Удалить" left with its row, so the focus fell to the page body.
      if (isFocusFree(null)) {
        const next = wait.next === null ? undefined : deleteButtons.current.get(wait.next);

        (next ?? addButton.current)?.focus();
      }
    }
  }, [wait, rejections, instanceIds]);

  return {
    addButton,
    rowElement: (instanceId) => (element) => {
      if (element === null) {
        return undefined;
      }

      rowElements.current.set(instanceId, element);

      return () => {
        rowElements.current.delete(instanceId);
      };
    },
    deleteButton: (instanceId) => (element) => {
      if (element === null) {
        return undefined;
      }

      deleteButtons.current.set(instanceId, element);

      return () => {
        deleteButtons.current.delete(instanceId);
      };
    },
    add: () => {
      // The engine refuses an id this repeat section of this sheet already holds, deleted rows
      // included, so a collision writes over nothing.
      const instanceId = newInstanceId();

      const sent = editing.sendCommand({ type: 'repeat-row-add', sheetId, sectionId, instanceId });

      if (sent.ok) {
        setWait({ kind: 'added', instanceId, commandId: sent.value });
      }
    },
    remove: (instanceId) => {
      const sent = editing.sendCommand({
        type: 'repeat-row-delete',
        sheetId,
        sectionId,
        instanceId,
      });

      if (sent.ok) {
        setWait({
          kind: 'deleted',
          instanceId,
          next: instanceIds[instanceIds.indexOf(instanceId) + 1] ?? null,
          commandId: sent.value,
        });
      }
    },
  };
}

function isFocusFree(allowed: Element | null): boolean {
  const focused = document.activeElement;

  return focused === null || focused === document.body || focused === allowed;
}
