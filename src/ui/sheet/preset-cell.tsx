import { useId } from 'react';
import type { ReactNode } from 'react';

import type { PresetCell, PresetFieldCell } from '@/core/preset';
import { cellLabel, type FieldValues } from '@/core/sheet-values';
import { copy } from '@/ui/copy';

import {
  useCheckFieldEdit,
  useTextFieldEdit,
  type FieldErrorKind,
  type FieldPlace,
} from './use-field-edit';

type SheetCellProps = {
  cell: PresetCell;
  // The cells before this one in its row, where its label comes from.
  before: readonly PresetCell[];
  values: FieldValues;
  // `null` for a row with no field, which has no record.
  place: FieldPlace | null;
};

type FieldProps = {
  field: PresetFieldCell;
  label: string;
  values: FieldValues;
  place: FieldPlace;
};

const ERROR_TEXT: Record<FieldErrorKind, string> = {
  'bad-number': copy.badNumber,
  'too-long': copy.valueTooLong,
};

// The content sizes the control, so a long value widens its grid column as plain text would.
const VALUE_CLASS =
  'touch-target min-w-[3rem] max-w-full resize-none border-b border-dotted border-line-strong bg-transparent px-1 text-text [field-sizing:content] [overflow-wrap:anywhere]';

// Every value is editable in place, with no edit mode.
export function SheetCell({ cell, before, values, place }: SheetCellProps): ReactNode {
  const label = cellLabel(cell, before);

  // A dice cell is a static label until Epic 4 makes it roll.
  if (cell.kind !== 'field' || place === null) {
    return <span>{label}</span>;
  }

  return cell.type === 'check' ? (
    <CheckField field={cell} label={label} values={values} place={place} />
  ) : (
    <TextValueField field={cell} label={label} values={values} place={place} />
  );
}

function CheckField({ field, label, values, place }: FieldProps): ReactNode {
  const edit = useCheckFieldEdit({ place, fieldId: field.id, recordValue: values.get(field.id) });

  return (
    <input
      type="checkbox"
      className="size-4 justify-self-start"
      aria-label={label}
      checked={edit.checked}
      onChange={edit.onToggle}
    />
  );
}

// A `text` field is a textarea that grows with its lines. A `number` field is a text input with
// the full keyboard, so `1,5` and a minus can be typed: the iOS decimal keypad has no minus.
function TextValueField({ field, label, values, place }: FieldProps): ReactNode {
  const errorId = useId();

  const edit = useTextFieldEdit(field.type === 'number' ? 'number' : 'text', {
    place,
    fieldId: field.id,
    recordValue: values.get(field.id),
  });

  const common = {
    'aria-label': label,
    'aria-invalid': edit.error === null ? undefined : true,
    'aria-describedby': edit.error === null ? undefined : errorId,
    className: VALUE_CLASS,
    value: edit.text,
    onFocus: edit.onFocus,
    onBlur: edit.onBlur,
    onKeyDown: edit.onKeyDown,
  };

  return (
    <div className="flex min-w-[0] flex-col">
      {field.type === 'number' ? (
        <input
          {...common}
          type="text"
          inputMode="text"
          onChange={(event) => {
            edit.onChange(event.target.value);
          }}
        />
      ) : (
        <textarea
          {...common}
          // A browser without `field-sizing` sizes the textarea by its rows.
          rows={edit.text.split('\n').length}
          onChange={(event) => {
            edit.onChange(event.target.value);
          }}
        />
      )}
      {/* Always mounted, so a screen reader announces the message after the focus has left. */}
      <span id={errorId} aria-live="polite" className="text-label-sm text-danger-text">
        {edit.error === null ? '' : ERROR_TEXT[edit.error]}
      </span>
    </div>
  );
}
