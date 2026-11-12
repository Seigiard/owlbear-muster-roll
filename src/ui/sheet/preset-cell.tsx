import { createContext, useContext, useId } from 'react';
import type { ReactNode } from 'react';

import type { PresetCell, PresetFieldCell } from '@/core/preset';
import { cellLabel, isChecked, valueText, type FieldValues } from '@/core/sheet-values';
import { copy } from '@/ui/copy';

import { DiceButton, type DiceRow } from './dice-button';
import { PendingMark } from './pending-mark';
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
  readOnly: boolean;
  row: DiceRow;
  cellIndex: number;
  pending: CellPending;
};

// UX-DR28: `disabled` for a field of a row whose removal waits for a GM. `marked` shows the field's
// own "Ожидает". `rowMarkId` names the row's mark, which describes each of its fields.
export type CellPending = { disabled: boolean; marked: boolean; rowMarkId: string | null };

type FieldProps = {
  field: PresetFieldCell;
  label: string;
  values: FieldValues;
  place: FieldPlace;
  pending: CellPending;
};

const ERROR_TEXT: Record<FieldErrorKind, string> = {
  'bad-number': copy.badNumber,
  'too-long': copy.valueTooLong,
};

// The content sizes the control, so a long value widens its grid column as plain text would.
const VALUE_CLASS =
  'touch-target min-w-[3rem] max-w-full resize-none border-b border-dotted border-line-strong bg-transparent px-1 text-text [field-sizing:content] [overflow-wrap:anywhere]';

// A read-only value takes the place and size of the control, with no dotted line, so a sheet looks
// the same for both roles. It is no form control, so Tab skips it.
const READ_ONLY_VALUE_CLASS =
  'touch-target inline-flex min-w-[3rem] max-w-full items-center whitespace-pre-wrap border-b border-transparent px-1 text-text [overflow-wrap:anywhere]';

// The box of a check, as the checkbox of the GM draws it.
const READ_ONLY_CHECK_CLASS =
  'inline-flex size-4 items-center justify-center justify-self-start rounded-sm border border-line-strong text-label-sm text-text';

const CHECK_MARK = '✓';

// AD-23: the preset builder's preview, `null` in the window. When set, each cell sits in a
// `display: contents` element that names its place, `{section}.{row}.{cell}`, so a click and a mark
// find it, and an empty field shows its id as a placeholder, the name formulas use.
export type CellPreview = { placeholders: true };

export const CellPreviewContext = createContext<CellPreview | null>(null);

// Every value is editable in place, with no edit mode. A read-only value is text.
export function SheetCell({
  cell,
  before,
  values,
  place,
  readOnly,
  row,
  cellIndex,
  pending,
}: SheetCellProps): ReactNode {
  const preview = useContext(CellPreviewContext);

  const node = (
    <CellContent
      cell={cell}
      before={before}
      values={values}
      place={place}
      readOnly={readOnly}
      row={row}
      cellIndex={cellIndex}
      pending={pending}
    />
  );

  return preview === null ? (
    node
  ) : (
    <div className="contents" data-cell={`${row.sectionIndex}.${row.rowIndex}.${cellIndex}`}>
      {node}
    </div>
  );
}

function CellContent({
  cell,
  before,
  values,
  place,
  readOnly,
  row,
  cellIndex,
  pending,
}: SheetCellProps): ReactNode {
  const label = cellLabel(cell, before);

  // Anyone who sees a sheet rolls it, with or without write access.
  // A row whose removal waits rolls nothing: its mark, shown at once, says why.
  if (cell.kind === 'dice') {
    return (
      <DiceButton
        label={label}
        row={row}
        cellIndex={cellIndex}
        disabledReasonId={pending.disabled ? (pending.rowMarkId ?? undefined) : undefined}
      />
    );
  }

  if (cell.kind !== 'field' || place === null) {
    return <span>{label}</span>;
  }

  if (readOnly) {
    return <ReadOnlyValue field={cell} label={label} values={values} />;
  }

  return cell.type === 'check' ? (
    <CheckField field={cell} label={label} values={values} place={place} pending={pending} />
  ) : (
    <TextValueField field={cell} label={label} values={values} place={place} pending={pending} />
  );
}

// Named by the field's label, as the GM's control is, so a screen reader says what the value is.
function ReadOnlyValue({ field, label, values }: Omit<FieldProps, 'place' | 'pending'>): ReactNode {
  const value = values.get(field.id);

  if (field.type === 'check') {
    const checked = isChecked(value);

    return (
      <span
        role="img"
        aria-label={checked ? copy.label.checked(label) : copy.label.unchecked(label)}
        className={READ_ONLY_CHECK_CLASS}
        data-read-only-value
      >
        {checked ? CHECK_MARK : ''}
      </span>
    );
  }

  const preview = useContext(CellPreviewContext);
  const text = valueText(value);

  return (
    <span role="group" aria-label={label} className={READ_ONLY_VALUE_CLASS} data-read-only-value>
      {text === '' && preview !== null ? <span className="text-text-muted">{field.id}</span> : text}
    </span>
  );
}

// The wrapper stays mounted with or without the mark, so a focused checkbox keeps its focus.
function CheckField({ field, label, values, place, pending }: FieldProps): ReactNode {
  const markId = useId();
  const edit = useCheckFieldEdit({ place, fieldId: field.id, recordValue: values.get(field.id) });

  return (
    <span className="inline-flex items-center gap-1 justify-self-start">
      <input
        type="checkbox"
        className="size-4"
        aria-label={label}
        aria-describedby={describedBy([pending.marked ? markId : null, pending.rowMarkId])}
        checked={edit.checked}
        disabled={pending.disabled}
        onChange={edit.onToggle}
      />
      {pending.marked ? <PendingMark id={markId} /> : null}
    </span>
  );
}

// A `text` field is a textarea that grows with its lines. A `number` field is a text input with
// the full keyboard, so `1,5` and a minus can be typed: the iOS decimal keypad has no minus.
function TextValueField({ field, label, values, place, pending }: FieldProps): ReactNode {
  const errorId = useId();
  const markId = useId();

  const edit = useTextFieldEdit(field.type === 'number' ? 'number' : 'text', {
    place,
    fieldId: field.id,
    recordValue: values.get(field.id),
    disabled: pending.disabled,
  });

  const common = {
    'aria-label': label,
    'aria-invalid': edit.error === null ? undefined : true,
    'aria-describedby': describedBy([
      edit.error === null ? null : errorId,
      pending.marked ? markId : null,
      pending.rowMarkId,
    ]),
    className: VALUE_CLASS,
    disabled: pending.disabled,
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
      {/* After the live region, so the field it follows keeps its place, focus and caret. */}
      {pending.marked ? <PendingMark id={markId} /> : null}
    </div>
  );
}

// The ids of the messages about a field, or none.
function describedBy(ids: readonly (string | null)[]): string | undefined {
  const present = ids.filter((id) => id !== null);

  return present.length === 0 ? undefined : present.join(' ');
}
