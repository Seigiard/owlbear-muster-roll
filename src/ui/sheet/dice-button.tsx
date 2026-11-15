import clsx from 'clsx';
import { createContext, useContext, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { DicePlace } from '@/core/dice-roll';
import type { FieldPatchTarget } from '@/core/field-patch';
import type { RollOutcome } from '@/core/ui-messages';
import { copy } from '@/copy';
import { Pressable } from '@/ui/primitives/button';
import type { ReplicaClient } from '@/ui/replica-client';

import { shownForRoll, type LocalFieldValues } from './local-field-values';

// `dice-button`: accent text and border, `sm` radius, `label-sm`.
// A roll is the one action in the accent: tonal at rest, solid under the pointer.
const DICE_BUTTON_CLASS =
  'touch-target-compact rounded-md border border-accent/30 bg-accent-soft px-2 text-label-sm font-medium text-accent-ink data-hovered:border-accent data-hovered:bg-accent data-hovered:text-accent-contrast';

// What every dice button of a window shares. A player rolls too, so this is not `FieldEditing`.
export type DiceRolling = {
  requestRoll: ReplicaClient['requestRoll'];
  localValues: LocalFieldValues;
};

// `valuesSignature` changes whenever a value of the sheet changes, in a record or in a field.
export type DiceSheet = DiceRolling & { valuesSignature: string };

// The rolled row, as a roll request names it and as its local values are told apart.
export type DiceRow = {
  sheetId: string;
  tabIndex: number;
  sectionIndex: number;
  rowIndex: number;
  instanceId: string | null;
  // The row's record, `null` for a row with no field.
  target: FieldPatchTarget | null;
  fieldIds: ReadonlySet<string>;
};

// `disabledReasonId` names the text that says why the button is off, as a removed row's mark.
type DiceButtonProps = {
  label: string;
  accessibleName: string;
  row: DiceRow;
  cellIndex: number;
  disabledReasonId?: string;
};

// A message shows until the sheet's values change from the ones it was shown with.
type ShownMessage = { text: string; signature: string };

export const DiceSheetContext = createContext<DiceSheet | null>(null);

// Rolls on press. A bad formula shows its message under the button and sends nothing; the
// message clears on the next press or on any value change of the sheet. A press while a roll is on
// its way does nothing, so one press never rolls twice, and the line under the button says it waits,
// and for the GM's answer when the dice extension waits for it.
export function DiceButton({
  label,
  accessibleName,
  row,
  cellIndex,
  disabledReasonId,
}: DiceButtonProps): ReactNode {
  const messageId = useId();
  const sheet = useDiceSheet();
  const [rolling, setRolling] = useState(false);
  const [waitingForGm, setWaitingForGm] = useState(false);
  const [message, setMessage] = useState<ShownMessage | null>(null);
  const latestSignature = useRef(sheet.valuesSignature);

  latestSignature.current = sheet.valuesSignature;

  if (message !== null && message.signature !== sheet.valuesSignature) {
    setMessage(null);
  }

  function roll(): void {
    if (rolling) {
      return;
    }

    setMessage(null);

    const place: DicePlace = {
      tabIndex: row.tabIndex,
      sectionIndex: row.sectionIndex,
      rowIndex: row.rowIndex,
      cellIndex,
      instanceId: row.instanceId,
    };

    const shown = shownForRoll(sheet.localValues.read(row.sheetId), row.target, row.fieldIds);

    setRolling(true);
    setWaitingForGm(false);

    const outcome = sheet.requestRoll(
      {
        sheetId: row.sheetId,
        place,
        shown: Object.fromEntries(shown),
      },
      () => {
        setWaitingForGm(true);
      },
    );

    void outcome
      .then((result) => {
        setRolling(false);
        setWaitingForGm(false);

        const text = result.kind === 'answered' ? outcomeText(result.answer) : copy.rollFailed;

        setMessage(text === null ? null : { text, signature: latestSignature.current });
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a roll', error);
        setRolling(false);
        setWaitingForGm(false);
        setMessage({ text: copy.rollFailed, signature: latestSignature.current });
      });
  }

  return (
    <div className="flex min-w-0 flex-col items-start">
      <Pressable
        className={DICE_BUTTON_CLASS}
        accessibleName={accessibleName}
        onPress={roll}
        describedBy={message === null ? undefined : messageId}
        disabledReasonId={disabledReasonId}
      >
        {label}
      </Pressable>
      {/* Always mounted, so a screen reader announces the message. A roll on its way shows that it
      waits, as the dice extension can take seconds. */}
      <span
        id={messageId}
        aria-live="polite"
        className={clsx('text-label-sm', {
          'text-text-muted': rolling,
          'text-danger-text': !rolling,
        })}
      >
        {!rolling ? (message?.text ?? '') : waitingForGm ? copy.rollWaitingForGm : copy.rolling}
      </span>
    </div>
  );
}

function useDiceSheet(): DiceSheet {
  const sheet = useContext(DiceSheetContext);

  if (sheet === null) {
    throw new Error('A dice button needs DiceSheetContext');
  }

  return sheet;
}

// A roll that went out shows nothing here; it shows as a notification.
function outcomeText(outcome: RollOutcome): string | null {
  if (outcome.code === 'rolled' || outcome.code === 'waiting-access') {
    return null;
  }

  if (outcome.code === 'field') {
    return copy.badFormula(outcome.field);
  }

  return outcome.code === 'arithmetic' ? copy.badFormulaResult : copy.rollFailed;
}
