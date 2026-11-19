import { useEffect, useRef, useState } from 'react';
import type { RefCallback, RefObject } from 'react';

import { childAddress, type BlockAddress } from '@/core/block-address';
import { newInstanceId } from '@/core/ids';
import type { Command } from '@/core/ui-messages';
import type { CommandOutcomePromise } from '@/ui/replica-client';

import { useFieldEditing } from './use-field-edit';

// The value control of a field. A repeat block's controls are buttons, so the first match is the
// repeat block's first field.
const FIELD_SELECTOR = 'input, textarea';

export type RepeatBlockControls = {
  addButton: RefObject<HTMLButtonElement | null>;
  blockElement: (instanceId: string) => RefCallback<HTMLElement>;
  deleteButton: (instanceId: string) => RefCallback<HTMLButtonElement>;
  add: () => void;
  remove: (instanceId: string) => void;
};

// A sent add or delete, until its delta moves the focus or a rejection ends the wait. `next` is the
// repeat block after the deleted one when "Удалить" was pressed.
type FocusWait =
  | {
      kind: 'added';
      instanceId: string;
      outcome: CommandOutcomePromise<undefined>;
    }
  | {
      kind: 'deleted';
      instanceId: string;
      next: string | null;
      outcome: CommandOutcomePromise<undefined>;
    };

// The add and delete controls of one repeat section of one sheet. The window picks the new repeat
// block's id, so it knows which repeat block to focus when the delta brings it.
export function useRepeatBlocks(
  sheetId: string,
  sectionId: string,
  instanceIds: readonly string[],
  parent: BlockAddress,
): RepeatBlockControls {
  const editing = useFieldEditing();
  const [wait, setWait] = useState<FocusWait | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const blockElements = useRef(new Map<string, HTMLElement>());
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (wait === null) {
      return;
    }

    let active = true;

    void wait.outcome
      .then((outcome) => {
        if (!active) {
          return;
        }

        if (outcome.kind !== 'answered') {
          setWait((current) => (current === wait ? null : current));
        }
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a repeat block command', error);
      });

    return () => {
      active = false;
    };
  }, [wait]);

  useEffect(() => {
    if (wait === null) {
      return;
    }

    const present = instanceIds.includes(wait.instanceId);

    if (wait.kind === 'added' && present) {
      // oxlint-disable-next-line react/set-state-in-effect -- Clear the pending command after the rendered instance list confirms the add.
      setWait(null);

      // The GM may have moved on while the repeat block was on its way. Then the focus stays there.
      if (isFocusFree(addButton.current)) {
        blockElements.current
          .get(wait.instanceId)
          ?.querySelector<HTMLElement>(FIELD_SELECTOR)
          ?.focus();
      }
    } else if (wait.kind === 'deleted' && !present) {
      setWait(null);

      // The pressed "Удалить" left with its repeat block, so the focus fell to the page body.
      if (isFocusFree(null)) {
        const next = wait.next === null ? undefined : deleteButtons.current.get(wait.next);

        (next ?? addButton.current)?.focus();
      }
    }
  }, [wait, instanceIds]);

  return {
    addButton,
    blockElement: (instanceId) => (element) => {
      if (element === null) {
        return undefined;
      }

      blockElements.current.set(instanceId, element);

      return () => {
        blockElements.current.delete(instanceId);
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
      // The engine refuses an id this sheet already holds, deleted repeat blocks included, so a
      // collision writes over nothing.
      const instanceId = newInstanceId();

      const command: Extract<Command, { type: 'repeat-block-add' }> = {
        type: 'repeat-block-add',
        sheetId,
        block: childAddress(parent, sectionId, instanceId),
      };

      const outcome = editing.sendCommand(command);

      setWait({ kind: 'added', instanceId, outcome });
    },
    remove: (instanceId) => {
      const command: Extract<Command, { type: 'repeat-block-delete' }> = {
        type: 'repeat-block-delete',
        sheetId,
        block: childAddress(parent, sectionId, instanceId),
      };

      const outcome = editing.sendCommand(command);

      setWait({
        kind: 'deleted',
        instanceId,
        next: instanceIds[instanceIds.indexOf(instanceId) + 1] ?? null,
        outcome,
      });
    },
  };
}

function isFocusFree(allowed: Element | null): boolean {
  const focused = document.activeElement;

  return focused === null || focused === document.body || focused === allowed;
}
