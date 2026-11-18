import { createContext, useContext, useId } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import clsx from 'clsx';

import type { PresetCell, PresetFieldCell } from '@/core/preset';
import { blockOfLinkTarget, linkTargetKey, type LinkTarget } from '@/core/link-target';
import {
  cellLabel,
  cellVisibleLabel,
  isChecked,
  valueText,
  type FieldValues,
} from '@/core/sheet-values';
import { copy } from '@/copy';
import { CellTooltip } from '@/ui/primitives/tooltip';

import { DiceButton, type DiceRow } from './dice-button';
import { PendingMark } from './pending-mark';
import { TokenCellControl } from './map-toggle';
import {
  useCheckFieldEdit,
  useSelectFieldEdit,
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
  autoFocus?: boolean;
  onEscape?: () => void;
  tokenTarget?: LinkTarget | null;
  tokenTools?: TokenCellTools | null;
};

export type TokenCellTools = {
  linkedTargets: ReadonlySet<string>;
  open: (target: LinkTarget) => void;
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
  autoFocus?: boolean;
  onEscape?: () => void;
};

const ERROR_TEXT: Record<FieldErrorKind, string> = {
  'bad-number': copy.badNumber,
  'too-long': copy.valueTooLong,
};

// The content sizes the control, so a long value widens its grid column as plain text would.
const VALUE_CLASS =
  'touch-target field-ghost min-w-[3rem] max-w-full resize-none px-2 py-[6px] text-text tabular-nums field-sizing-content wrap-anywhere';

// A read-only value takes the place and size of the control, with a transparent edge, so a sheet
// keeps its layout for both roles. It is no form control, so only a named value is a Tab stop.
const READ_ONLY_VALUE_CLASS =
  'touch-target inline-flex min-w-[3rem] max-w-full items-center whitespace-pre-wrap border border-transparent px-2 text-text tabular-nums wrap-anywhere';

// The box of a check, as the checkbox of the GM draws it.
const READ_ONLY_CHECK_CLASS =
  'inline-flex size-4 items-center justify-center justify-self-start rounded-sm border border-line-strong text-label-sm text-text';

const CHECK_MARK = '✓';

// AD-23: the preset builder's preview, `null` in the window. When set, each cell sits in a
// `display: contents` element that names its place, `{section}.{row}.{cell}`, so a click and a mark
// find it, and an empty field shows its id as a placeholder, the name formulas use. The selected
// cell may be temporarily editable for the preview's in-place editing flow.
export type CellPreview = {
  placeholders: true;
  editableCell?: string | null;
  onEscape?: () => void;
};

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
  tokenTarget,
  tokenTools,
}: SheetCellProps): ReactNode {
  const preview = useContext(CellPreviewContext);
  const cellKey = `${row.tabIndex}.${row.sectionIndex}.${row.rowIndex}.${cellIndex}.${row.instanceId ?? ''}`;
  const previewEditable = preview?.editableCell === cellKey;

  const node = (
    <CellContent
      cell={cell}
      before={before}
      values={values}
      place={place}
      readOnly={readOnly || (preview !== null && !previewEditable)}
      row={row}
      cellIndex={cellIndex}
      pending={pending}
      autoFocus={previewEditable}
      onEscape={preview?.onEscape}
      tokenTarget={tokenTarget}
      tokenTools={tokenTools}
    />
  );

  return (
    <div
      className={clsx(cell.kind === 'token' ? 'inline-flex min-h-px min-w-px' : 'contents')}
      data-cell-id={cell.kind === 'token' ? cell.id : undefined}
      data-cell-scope={
        cell.kind === 'token'
          ? tokenTarget === null || tokenTarget === undefined
            ? 'root'
            : (blockOfLinkTarget(tokenTarget).path.at(-1) ?? 'root')
          : undefined
      }
      tabIndex={cell.kind === 'token' ? -1 : undefined}
      {...(preview === null
        ? {}
        : { 'data-cell': `${row.tabIndex}.${row.sectionIndex}.${row.rowIndex}.${cellIndex}` })}
    >
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
  autoFocus = false,
  onEscape,
  tokenTarget,
  tokenTools,
}: SheetCellProps): ReactNode {
  const label = cellLabel(cell, before);
  const tools = tokenTools ?? null;
  let content: ReactNode;

  // Anyone who sees a sheet rolls it, with or without write access.
  // A row whose removal waits rolls nothing: its mark, shown at once, says why.
  if (cell.kind === 'dice') {
    content = (
      <DiceButton
        label={cellVisibleLabel(cell, before)}
        accessibleName={label}
        row={row}
        cellIndex={cellIndex}
        disabledReasonId={pending.disabled ? (pending.rowMarkId ?? undefined) : undefined}
      />
    );
  } else if (cell.kind === 'token') {
    content =
      readOnly || tokenTarget === null || tokenTarget === undefined || tools === null ? null : (
        <TokenCellControl
          target={tokenTarget}
          linked={tools.linkedTargets.has(linkTargetKey(tokenTarget))}
          onOpen={() => {
            tools.open(tokenTarget);
          }}
        />
      );
  } else if (cell.kind !== 'field' || place === null) {
    content = <span className="text-text-muted">{label}</span>;
  } else if (readOnly) {
    content = <ReadOnlyValue field={cell} label={label} values={values} />;
  } else {
    content =
      cell.type === 'check' ? (
        <CheckField
          field={cell}
          label={label}
          values={values}
          place={place}
          pending={pending}
          autoFocus={autoFocus}
          onEscape={onEscape}
        />
      ) : cell.type === 'select' || cell.type === 'dice-choice' ? (
        <SelectField
          field={cell}
          label={label}
          values={values}
          place={place}
          pending={pending}
          autoFocus={autoFocus}
          onEscape={onEscape}
        />
      ) : (
        <TextValueField
          field={cell}
          label={label}
          values={values}
          place={place}
          pending={pending}
          autoFocus={autoFocus}
          onEscape={onEscape}
        />
      );
  }

  return cell.kind === 'text' || cell.kind === 'token' || cell.name === undefined ? (
    content
  ) : (
    <CellTooltip name={cell.name}>{content}</CellTooltip>
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
        tabIndex={field.name === undefined ? undefined : 0}
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
    <span
      role="group"
      aria-label={label}
      tabIndex={field.name === undefined ? undefined : 0}
      className={READ_ONLY_VALUE_CLASS}
      data-read-only-value
    >
      {text === '' && preview !== null ? <span className="text-text-muted">{field.id}</span> : text}
    </span>
  );
}

// The wrapper stays mounted with or without the mark, so a focused checkbox keeps its focus.
function CheckField({
  field,
  label,
  values,
  place,
  pending,
  autoFocus = false,
  onEscape,
}: FieldProps): ReactNode {
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
        autoFocus={autoFocus}
        onChange={edit.onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onEscape !== undefined) {
            event.preventDefault();
            onEscape();
          }
        }}
      />
      {pending.marked ? <PendingMark id={markId} /> : null}
    </span>
  );
}

function SelectField({
  field,
  label,
  values,
  place,
  pending,
  autoFocus = false,
  onEscape,
}: Omit<FieldProps, 'field'> & {
  field: Extract<PresetFieldCell, { type: 'select' | 'dice-choice' }>;
}): ReactNode {
  const markId = useId();
  const edit = useSelectFieldEdit({ place, fieldId: field.id, recordValue: values.get(field.id) });

  const stale =
    edit.value !== '' && !field.options.includes(edit.value) ? (
      <option value={edit.value} disabled>
        {edit.value}
      </option>
    ) : null;

  return (
    <span className="inline-flex items-center gap-1 justify-self-start">
      <select
        className={VALUE_CLASS}
        aria-label={label}
        aria-describedby={describedBy([pending.marked ? markId : null, pending.rowMarkId])}
        disabled={pending.disabled}
        autoFocus={autoFocus}
        value={edit.value}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onEscape !== undefined) {
            event.preventDefault();
            onEscape();

            return;
          }

          if (event.altKey || event.metaKey || event.ctrlKey) {
            return;
          }

          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            return;
          }

          // Plain arrows change and save the value on every platform; modified arrows stay native.
          const currentIndex = field.options.indexOf(edit.value);

          const nextIndex =
            event.key === 'ArrowDown'
              ? Math.min(currentIndex + 1, field.options.length - 1)
              : currentIndex <= 0
                ? -1
                : currentIndex - 1;

          const next = nextIndex === -1 ? '' : field.options[nextIndex];

          if (next !== undefined) {
            event.preventDefault();
            edit.onChange(next);
          }
        }}
        onChange={(event) => {
          edit.onChange(event.target.value);
        }}
      >
        <option value="">{copy.emptySelectOption}</option>
        {stale}
        {field.options.map((option, index) => (
          <option key={`${option}-${index}`} value={option}>
            {option}
          </option>
        ))}
      </select>
      {pending.marked ? <PendingMark id={markId} /> : null}
    </span>
  );
}

// A `text` field is a textarea that grows with its lines. A `number` field is a text input with
// the full keyboard, so `1,5` and a minus can be typed: the iOS decimal keypad has no minus.
function TextValueField({
  field,
  label,
  values,
  place,
  pending,
  autoFocus = false,
  onEscape,
}: FieldProps): ReactNode {
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
    autoFocus,
    value: edit.text,
    onFocus: edit.onFocus,
    onBlur: () => {
      edit.onBlur();
      onEscape?.();
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape' && onEscape !== undefined) {
        event.preventDefault();
        edit.onBlur();
        onEscape();

        return;
      }

      edit.onKeyDown(event);
    },
  };

  return (
    <div className="flex min-w-0 flex-col">
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
