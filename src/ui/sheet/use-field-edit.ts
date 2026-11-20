import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import {
  patchedRecord,
  patchedRecordFits,
  sameFieldValue,
  type FieldPatchTarget,
  type FieldPatchValue,
} from '@/core/field-patch';
import { parseNumberInput, type NumberInputFailure } from '@/core/number-input';
import type { FieldValue, VersionedRecord } from '@/core/records';
import { Result } from 'better-result';
import { isChecked, valueText } from '@/core/sheet-values';
import type { CommandRejectedMessage } from '@/core/ui-messages';
import type { CommandOutcomePromise, ReplicaClient } from '@/ui/replica-client';

import type { LocalFieldValues } from './local-field-values';

export type FieldFlushes = {
  // Returns the function that takes the flush back out.
  register: (flush: () => void) => () => void;
  flushAll: () => void;
};

// What every editable field of a sheet shares.
export type FieldEditing = {
  sendCommand: ReplicaClient['sendCommand'];
  pauseMs: number;
  // Run on `pagehide`, so a closing window still sends what was typed.
  pageHideFlushes: FieldFlushes;
  // Read by a roll, which uses the value the window shows.
  localValues: LocalFieldValues;
};

// Where a field's patch lands, and the record it lands in as this window sees it.
export type FieldPlace = {
  sheetId: string;
  target: FieldPatchTarget;
  record: VersionedRecord | undefined;
};

export type FieldErrorKind = 'bad-number' | 'too-long';

export type TextFieldEdit = {
  text: string;
  error: FieldErrorKind | null;
  onFocus: () => void;
  onChange: (text: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};

export type CheckFieldEdit = { checked: boolean; onToggle: () => void };

export type SelectFieldEdit = { value: string; onChange: (value: string) => void };

type FieldArguments = {
  place: FieldPlace;
  fieldId: string;
  recordValue: FieldValue | undefined;
  // A field of a row whose removal waits for a GM (UX-DR28).
  disabled?: boolean;
};

// A saved value the projection has not brought back yet, so the field does not flash the old one
// while the delta is on its way. Its outcome ties a refusal to it, and `text` is what the GM typed,
// for a refusal that hands it back.
type Held = { value: FieldPatchValue; text: string; outcome: CommandOutcomePromise<undefined> };

// The text in a focused field, or a left field whose text did not save. `baseline` is the value
// at focus or at the last pause save: a save goes out only when the text means something else.
// `changed` says the GM typed since then, so a value the field cannot parse, as a string in a
// number field, is never parsed or converted when the GM only passes through.
type Draft = { text: string; baseline: FieldPatchValue; changed: boolean; typed: boolean };

type EditState = { draft: Draft | null; error: FieldErrorKind | null };

// `pause` keeps the text and focus, `enter` keeps the focus, `blur` ends the edit. `unmount` and
// `pagehide` save what they can and show nothing.
type SaveMode = 'pause' | 'enter' | 'blur' | 'unmount' | 'pagehide';

// `refused` is the held value a rejection just named, with its reason.
type Shown = {
  value: FieldPatchValue;
  held: Held | null;
  refused: { held: Held; reason: CommandRejectedMessage['reason'] } | null;
};

const NO_EDIT: EditState = { draft: null, error: null };

const IME_KEY_CODE = 229;

export const FieldEditingContext = createContext<FieldEditing | null>(null);

export function createFieldFlushes(): FieldFlushes {
  const flushes = new Set<() => void>();

  return {
    register: (flush) => {
      flushes.add(flush);

      return () => {
        flushes.delete(flush);
      };
    },
    flushAll: () => {
      for (const flush of flushes) {
        flush();
      }
    },
  };
}

// A `text` or `number` field: it saves after a typing pause, on Enter, on blur, when it unmounts
// and when the window closes, never per keystroke.
export function useTextFieldEdit(
  type: 'text' | 'number',
  { place, fieldId, recordValue, disabled = false }: FieldArguments,
): TextFieldEdit {
  const editing = useFieldEditing();
  const shown = useShownValue(editing, recordValue);
  const [state, setState] = useState<EditState>(NO_EDIT);
  // Handlers can run before React renders the state written by a timer.
  const stateRef = useRef(state);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focused = useRef(false);
  const wasDisabled = useRef(disabled);

  function update(next: EditState): void {
    const previous = stateRef.current;

    stateRef.current = next;
    setState(next);

    if (shownLocallyChanged(previous, next)) {
      editing.localValues.changed(place.sheetId);
    }
  }

  // Shows the value as it is now and measures change from it.
  function frozenAt(value: FieldPatchValue | null): EditState {
    return {
      draft: { text: valueText(value ?? undefined), baseline: value, changed: false, typed: false },
      error: null,
    };
  }

  function save(mode: SaveMode): void {
    clearTimeout(pauseTimer.current);

    const { draft } = stateRef.current;

    if (draft === null) {
      return;
    }

    if (!draft.changed) {
      if (mode === 'blur') {
        update(NO_EDIT);
      } else if (mode === 'enter') {
        update(frozenAt(shown.value));
      }

      return;
    }

    const showsMessage = mode === 'enter' || mode === 'blur';
    const parsed = parseText(type, draft.text);

    if (!parsed.isOk()) {
      if (showsMessage) {
        update({ draft, error: 'bad-number' });
      }

      return;
    }

    const patched = patchedRecord(place.sheetId, place.target, place.record, fieldId, parsed.value);

    // A value the record already holds can still need sending: an earlier save of another value
    // may be on its way. A vanished repeat instance takes nothing.
    const unchanged =
      sameFieldValue(parsed.value, draft.baseline) ||
      (!patched.isOk() && patched.error === 'unknown-instance');

    if (unchanged) {
      if (mode === 'blur') {
        update(NO_EDIT);
      } else if (mode === 'enter') {
        update(frozenAt(shown.value));
      } else if (mode === 'pause') {
        // The text is valid again, so an earlier message no longer applies.
        update({ draft, error: null });
      }

      return;
    }

    if (patched.isOk() && !patchedRecordFits(patched.value)) {
      if (showsMessage) {
        update({ draft, error: 'too-long' });
      }

      return;
    }

    const outcome = editing.sendCommand(
      {
        type: 'field-patch',
        sheetId: place.sheetId,
        target: place.target,
        fieldId,
        value: parsed.value,
      },
      { urgent: mode === 'pagehide' },
    );

    const held: Held = { value: parsed.value, text: draft.text, outcome };

    shown.hold(held);

    if (mode === 'pause') {
      update({
        draft: { text: draft.text, baseline: parsed.value, changed: false, typed: false },
        error: null,
      });
    } else if (mode === 'enter') {
      // Enter freezes the value just sent, before the next render brings it back.
      update(frozenAt(parsed.value));
    } else if (mode !== 'unmount') {
      update(NO_EDIT);
    }
  }

  const saveEvent = useEffectEvent(save);
  const updateEvent = useEffectEvent(update);

  useEffect(() => {
    const draft = state.draft;

    if (draft === null || !draft.changed || !draft.typed) {
      return;
    }

    pauseTimer.current = setTimeout(() => {
      saveEvent('pause');
    }, editing.pauseMs);

    return () => {
      clearTimeout(pauseTimer.current);
    };
  }, [editing.pauseMs, state.draft]);

  useEffect(() => {
    const unregister = editing.pageHideFlushes.register(() => {
      saveEvent('pagehide');
    });

    return () => {
      unregister();
      saveEvent('unmount');
    };
  }, [editing.pageHideFlushes]);

  // While a field holds a draft, it shows the draft and not the record: typing not sent yet, the
  // text a focused field keeps, or an input error. A roll uses that value, so it reads it here.
  useEffect(() => {
    const readLocalValue = () => {
      const { draft, error } = stateRef.current;

      if (draft === null) {
        return null;
      }

      return {
        sheetId: place.sheetId,
        target: place.target,
        fieldId,
        shown:
          error === null ? { kind: 'text' as const, text: draft.text } : { kind: 'error' as const },
      };
    };

    return editing.localValues.register(readLocalValue);
  }, [editing.localValues, fieldId, place.sheetId, place.target]);

  // A focused field that turns disabled may lose its focus with no blur, so it saves what was typed
  // as a blur would, first.
  useEffect(() => {
    if (disabled && !wasDisabled.current && focused.current) {
      focused.current = false;
      save('blur');
    }

    wasDisabled.current = disabled;
  });

  const refusedTooLong = shown.refused?.reason === 'too-large' ? shown.refused.held : null;
  const currentRecordValue = useEffectEvent(() => recordValue ?? null);

  // The background found the record too long, so the text comes back with the message, unless the
  // GM has typed something newer since.
  useEffect(() => {
    if (refusedTooLong === null || stateRef.current.draft?.changed === true) {
      return;
    }

    updateEvent({
      draft: {
        text: refusedTooLong.text,
        baseline: currentRecordValue(),
        changed: true,
        typed: false,
      },
      error: 'too-long',
    });
  }, [refusedTooLong]);

  return {
    text: state.draft?.text ?? valueText(shown.value ?? undefined),
    error: state.error,
    onFocus: () => {
      focused.current = true;

      // A focused field keeps its text, so a change from another client does not move it.
      if (stateRef.current.draft === null) {
        update(frozenAt(shown.value));
      }
    },
    onChange: (text) => {
      const { draft, error } = stateRef.current;

      update({
        draft: {
          text,
          baseline: draft === null ? shown.value : draft.baseline,
          changed: true,
          typed: true,
        },
        error,
      });
    },
    onBlur: () => {
      focused.current = false;
      save('blur');
    },
    onKeyDown: (event) => {
      // The Enter that ends an IME composition only confirms the composed text. Some browsers
      // report it as key code 229 instead.
      if (event.nativeEvent.isComposing || event.keyCode === IME_KEY_CODE) {
        return;
      }

      if (event.key === 'Enter' && (!event.shiftKey || type === 'number')) {
        // In a textarea a plain Enter commits, and Shift+Enter is left to add the line.
        event.preventDefault();
        save('enter');
      } else if (event.key === 'Escape') {
        clearTimeout(pauseTimer.current);
        update(frozenAt(shown.value));
      }
    },
  };
}

// A `check` field saves on the click that toggles it.
export function useCheckFieldEdit({ place, fieldId, recordValue }: FieldArguments): CheckFieldEdit {
  const editing = useFieldEditing();
  const shown = useShownValue(editing, recordValue);
  const checked = isChecked(shown.value ?? undefined);

  return {
    checked,
    onToggle: () => {
      const sent = editing.sendCommand({
        type: 'field-patch',
        sheetId: place.sheetId,
        target: place.target,
        fieldId,
        value: !checked,
      });

      shown.hold({ value: !checked, text: '', outcome: sent });
    },
  };
}

// A `select` field saves on the pick that changes its value. The empty option clears the key.
export function useSelectFieldEdit({
  place,
  fieldId,
  recordValue,
}: FieldArguments): SelectFieldEdit {
  const editing = useFieldEditing();
  const shown = useShownValue(editing, recordValue);

  return {
    value: valueText(shown.value ?? undefined),
    onChange: (value) => {
      const next: FieldPatchValue = value === '' ? null : value;

      if (sameFieldValue(shown.value, next)) {
        return;
      }

      const sent = editing.sendCommand({
        type: 'field-patch',
        sheetId: place.sheetId,
        target: place.target,
        fieldId,
        value: next,
      });

      shown.hold({ value: next, text: '', outcome: sent });
    },
  };
}

export function useFieldEditing(): FieldEditing {
  const editing = useContext(FieldEditingContext);

  if (editing === null) {
    throw new Error('An editable field needs FieldEditingContext');
  }

  return editing;
}

// The record value, or a held one until the projection brings it back or a rejection names it.
// Only the last save counts, so an earlier one that lands first does not end the wait.
function useShownValue(
  editing: FieldEditing,
  recordValue: FieldValue | undefined,
): Shown & { hold: (held: Held) => void } {
  const [held, setHeld] = useState<Held | null>(null);
  const [refused, setRefused] = useState<Shown['refused']>(null);

  const settled = held !== null && sameFieldValue(recordValue, held.value);

  useEffect(() => {
    if (settled) {
      // oxlint-disable-next-line react/set-state-in-effect -- Clear the held edit after the external record projection confirms it.
      setHeld(null);
    }
  }, [settled]);

  useEffect(() => {
    if (held === null) {
      return;
    }

    let active = true;

    void held.outcome
      .then((outcome) => {
        if (!active || outcome.kind === 'answered') {
          return;
        }

        setHeld((current) => (current === held ? null : current));

        if (outcome.kind === 'refused') {
          setRefused({ held, reason: outcome.rejection.reason });
        }
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a field edit', error);
      });

    return () => {
      active = false;
    };
  }, [held]);

  const active = settled ? null : held;

  return {
    value: active === null ? (recordValue ?? null) : active.value,
    held: active,
    refused,
    hold: (next) => {
      setRefused(null);
      setHeld(next);
    },
  };
}

// Typing, a revert, or an input error that comes or goes changes what the field shows. A focus or
// a save that ends the draft does not: the field goes on showing the same value.
function shownLocallyChanged(previous: EditState, next: EditState): boolean {
  if (previous.error !== next.error) {
    return true;
  }

  return previous.draft !== null && next.draft !== null && previous.draft.text !== next.draft.text;
}

// An empty text clears the field. A `text` value is stored as typed, line breaks included.
function parseText(
  type: 'text' | 'number',
  text: string,
): Result<FieldPatchValue, NumberInputFailure> {
  if (type === 'number') {
    return parseNumberInput(text);
  }

  return Result.ok(text === '' ? null : text);
}
