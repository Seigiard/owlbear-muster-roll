import { useStore } from '@nanostores/react';
import type { ReadableAtom } from 'nanostores';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { ok, type Result } from '@/core/result';
import { isChecked, valueText } from '@/core/sheet-values';
import type { CommandRejectedMessage } from '@/core/ui-messages';
import type { ReplicaClient } from '@/ui/replica-client';

import type { LocalFieldValues } from './local-field-values';

export type FieldFlushes = {
  // Returns the function that takes the flush back out.
  register: (flush: () => void) => () => void;
  flushAll: () => void;
};

// What every editable field of a sheet shares.
export type FieldEditing = {
  sendCommand: ReplicaClient['sendCommand'];
  $rejections: ReadableAtom<ReadonlyMap<string, CommandRejectedMessage>>;
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

type FieldArguments = {
  place: FieldPlace;
  fieldId: string;
  recordValue: FieldValue | undefined;
};

// A saved value the projection has not brought back yet, so the field does not flash the old one
// while the delta is on its way. Its command id ties a rejection to it, and `text` is what the GM
// typed, for a rejection that hands it back.
type Held = { value: FieldPatchValue; text: string; commandId: string };

// The text in a focused field, or a left field whose text did not save. `baseline` is the value
// at focus or at the last pause save: a save goes out only when the text means something else.
// `changed` says the GM typed since then, so a value the field cannot parse, as a string in a
// number field, is never parsed or converted when the GM only passes through.
type Draft = { text: string; baseline: FieldPatchValue; changed: boolean };

type EditState = { draft: Draft | null; error: FieldErrorKind | null };

// `pause` keeps the text and focus, `enter` keeps the focus, `blur` ends the edit. `unmount` and
// `pagehide` save what they can and show nothing.
type SaveMode = 'pause' | 'enter' | 'blur' | 'unmount' | 'pagehide';

type Latest = FieldArguments & { editing: FieldEditing; type: 'text' | 'number'; shown: Shown };

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
  { place, fieldId, recordValue }: FieldArguments,
): TextFieldEdit {
  const editing = useFieldEditing();
  const shown = useShownValue(editing, recordValue);
  const [state, setState] = useState<EditState>(NO_EDIT);
  // Timers, the unmount and `pagehide` run outside a render, so they read the newest of each here.
  const stateRef = useRef(state);
  const latest = useRef<Latest>({ place, fieldId, recordValue, editing, type, shown });
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    latest.current = { place, fieldId, recordValue, editing, type, shown };
  });

  function update(next: EditState): void {
    const previous = stateRef.current;

    stateRef.current = next;
    setState(next);

    if (shownLocallyChanged(previous, next)) {
      latest.current.editing.localValues.changed(latest.current.place.sheetId);
    }
  }

  // Shows the value as it is now and measures change from it.
  function frozenAtCurrent(): EditState {
    const { value } = latest.current.shown;

    return {
      draft: { text: valueText(value ?? undefined), baseline: value, changed: false },
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
        update(frozenAtCurrent());
      }

      return;
    }

    const current = latest.current;
    const showsMessage = mode === 'enter' || mode === 'blur';
    const parsed = parseText(current.type, draft.text);

    if (!parsed.ok) {
      if (showsMessage) {
        update({ draft, error: 'bad-number' });
      }

      return;
    }

    const patched = patchedRecord(
      current.place.sheetId,
      current.place.target,
      current.place.record,
      current.fieldId,
      parsed.value,
    );

    // A value the record already holds can still need sending: an earlier save of another value
    // may be on its way. A vanished repeat instance takes nothing.
    const unchanged =
      sameFieldValue(parsed.value, draft.baseline) ||
      (!patched.ok && patched.error === 'unknown-instance');

    if (unchanged) {
      if (mode === 'blur') {
        update(NO_EDIT);
      } else if (mode === 'enter') {
        update(frozenAtCurrent());
      } else if (mode === 'pause') {
        // The text is valid again, so an earlier message no longer applies.
        update({ draft, error: null });
      }

      return;
    }

    if (patched.ok && !patchedRecordFits(patched.value)) {
      if (showsMessage) {
        update({ draft, error: 'too-long' });
      }

      return;
    }

    const sent = current.editing.sendCommand(
      {
        type: 'field-patch',
        sheetId: current.place.sheetId,
        target: current.place.target,
        fieldId: current.fieldId,
        value: parsed.value,
      },
      { urgent: mode === 'pagehide' },
    );

    if (!sent.ok) {
      if (showsMessage) {
        update({ draft, error: 'too-long' });
      }

      return;
    }

    const held: Held = { value: parsed.value, text: draft.text, commandId: sent.value };

    // `enter` freezes the text at the value just sent, before the next render brings it.
    current.shown = { value: parsed.value, held, refused: null };
    shown.hold(held);

    if (mode === 'pause') {
      update({
        draft: { text: draft.text, baseline: parsed.value, changed: false },
        error: null,
      });
    } else if (mode === 'enter') {
      update(frozenAtCurrent());
    } else if (mode !== 'unmount') {
      update(NO_EDIT);
    }
  }

  useEffect(() => {
    const unregister = latest.current.editing.pageHideFlushes.register(() => {
      save('pagehide');
    });

    return () => {
      unregister();
      save('unmount');
    };
    // Registered once: `save` reads everything it needs through the refs.
  }, []);

  // While a field holds a draft, it shows the draft and not the record: typing not sent yet, the
  // text a focused field keeps, or an input error. A roll uses that value, so it reads it here.
  useEffect(
    () =>
      latest.current.editing.localValues.register(() => {
        const { draft, error } = stateRef.current;

        if (draft === null) {
          return null;
        }

        const current = latest.current;

        return {
          sheetId: current.place.sheetId,
          target: current.place.target,
          fieldId: current.fieldId,
          shown: error === null ? { kind: 'text', text: draft.text } : { kind: 'error' },
        };
      }),
    // Registered once, as above.
    [],
  );

  const refusedTooLong = shown.refused?.reason === 'too-large' ? shown.refused.held : null;

  // The background found the record too long, so the text comes back with the message, unless the
  // GM has typed something newer since.
  useEffect(() => {
    if (refusedTooLong === null || stateRef.current.draft?.changed === true) {
      return;
    }

    update({
      draft: {
        text: refusedTooLong.text,
        baseline: latest.current.recordValue ?? null,
        changed: true,
      },
      error: 'too-long',
    });
  }, [refusedTooLong]);

  return {
    text: state.draft?.text ?? valueText(shown.value ?? undefined),
    error: state.error,
    onFocus: () => {
      // A focused field keeps its text, so a change from another client does not move it.
      if (stateRef.current.draft === null) {
        update(frozenAtCurrent());
      }
    },
    onChange: (text) => {
      const { draft } = stateRef.current;

      update({
        draft: { text, baseline: draft === null ? shown.value : draft.baseline, changed: true },
        error: stateRef.current.error,
      });
      clearTimeout(pauseTimer.current);
      pauseTimer.current = setTimeout(() => {
        save('pause');
      }, editing.pauseMs);
    },
    onBlur: () => {
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
        update(frozenAtCurrent());
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

      if (sent.ok) {
        shown.hold({ value: !checked, text: '', commandId: sent.value });
      }
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
  const rejections = useStore(editing.$rejections);
  const [held, setHeld] = useState<Held | null>(null);
  const rejection = held === null ? undefined : rejections.get(held.commandId);

  const settled =
    held !== null && (sameFieldValue(recordValue, held.value) || rejection !== undefined);

  useEffect(() => {
    if (settled) {
      setHeld(null);
    }
  }, [settled]);

  const active = settled ? null : held;

  return {
    value: active === null ? (recordValue ?? null) : active.value,
    held: active,
    refused: held !== null && rejection !== undefined ? { held, reason: rejection.reason } : null,
    hold: setHeld,
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

  return ok(text === '' ? null : text);
}
