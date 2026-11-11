import { useStore } from '@nanostores/react';
import { createContext, useContext, useId, useState } from 'react';
import type { ReactNode } from 'react';

import type { DicePlace } from '@/core/dice-roll';
import type { FieldPatchTarget } from '@/core/field-patch';
import type { RollOutcome } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { Pressable } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

import { shownForRoll, type LocalFieldValues } from './local-field-values';

// `dice-button`: accent text and border, `sm` radius, `label-sm`.
const DICE_BUTTON_CLASS = 'rounded-sm border border-accent px-2 text-label-sm text-accent';

// What every dice button of a window shares. A player rolls too, so this is not `FieldEditing`.
export type DiceRolling = {
  requestRoll: ReplicaClient['requestRoll'];
  $rollOutcomes: ProjectionStore['$rollOutcomes'];
  localValues: LocalFieldValues;
};

// `valuesSignature` changes whenever a value of the sheet changes, in a record or in a field.
export type DiceSheet = DiceRolling & { valuesSignature: string };

// The rolled row, as a roll request names it and as its local values are told apart.
export type DiceRow = {
  sheetId: string;
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
  row: DiceRow;
  cellIndex: number;
  disabledReasonId?: string;
};

// A message shows until the sheet's values change from the ones it was shown with.
type ShownMessage = { text: string; signature: string };

export const DiceSheetContext = createContext<DiceSheet | null>(null);

// Rolls on press. A bad formula shows its message under the button and sends nothing; the
// message clears on the next press or on any value change of the sheet. A press while a roll is on
// its way does nothing, so one press never rolls twice.
export function DiceButton({
  label,
  row,
  cellIndex,
  disabledReasonId,
}: DiceButtonProps): ReactNode {
  const messageId = useId();
  const sheet = useDiceSheet();
  const outcomes = useStore(sheet.$rollOutcomes);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<ShownMessage | null>(null);
  const outcome = requestId === null ? undefined : outcomes.get(requestId)?.outcome;

  // The signature is taken when the outcome lands, so a field patch the press itself saved, whose
  // delta comes before the outcome, does not clear the message.
  if (outcome !== undefined) {
    const text = outcomeText(outcome);

    setRequestId(null);
    setMessage(text === null ? null : { text, signature: sheet.valuesSignature });
  } else if (message !== null && message.signature !== sheet.valuesSignature) {
    setMessage(null);
  }

  function roll(): void {
    if (requestId !== null) {
      return;
    }

    setMessage(null);

    const place: DicePlace = {
      sectionIndex: row.sectionIndex,
      rowIndex: row.rowIndex,
      cellIndex,
      instanceId: row.instanceId,
    };

    const shown = shownForRoll(sheet.localValues.read(row.sheetId), row.target, row.fieldIds);

    const sent = sheet.requestRoll({
      sheetId: row.sheetId,
      place,
      shown: Object.fromEntries(shown),
    });

    if (sent.ok) {
      setRequestId(sent.value);
    } else {
      setMessage({ text: copy.rollFailed, signature: sheet.valuesSignature });
    }
  }

  return (
    <div className="flex min-w-[0] flex-col items-start">
      <Pressable
        className={DICE_BUTTON_CLASS}
        onPress={roll}
        describedBy={message === null ? undefined : messageId}
        disabledReasonId={disabledReasonId}
      >
        {label}
      </Pressable>
      {/* Always mounted, so a screen reader announces the message. */}
      <span id={messageId} aria-live="polite" className="text-label-sm text-danger-text">
        {message?.text ?? ''}
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
  if (outcome.code === 'rolled') {
    return null;
  }

  if (outcome.code === 'field') {
    return copy.badFormula(outcome.field);
  }

  return outcome.code === 'arithmetic' ? copy.badFormulaResult : copy.rollFailed;
}
