import type { MouseEvent, ReactNode } from 'react';

import type { PresetCell } from '@/core/preset';
import { cellLabel, isChecked, valueText, type FieldValues } from '@/core/sheet-values';

type SheetCellProps = {
  cell: PresetCell;
  // The cells before this one in its row, where its label comes from.
  before: readonly PresetCell[];
  values: FieldValues;
};

// Read-only until Story 1.9 makes values editable, so no value takes the focus: a textbox is a
// plain element, and a checkbox, focusable by nature, leaves the Tab order.
export function SheetCell({ cell, before, values }: SheetCellProps): ReactNode {
  const label = cellLabel(cell, before);

  if (cell.kind !== 'field') {
    // A dice cell is a static label until Epic 4 makes it roll.
    return <span>{label}</span>;
  }

  const value = values.get(cell.id);

  if (cell.type === 'check') {
    return (
      <input
        type="checkbox"
        className="size-4 justify-self-start"
        aria-label={label}
        aria-readonly="true"
        // `readOnly` only quiets React's warning about `checked` with no `onChange`, as a checkbox
        // ignores it. `keepState` cancels the click, so the box neither toggles nor fires a change.
        readOnly
        tabIndex={-1}
        checked={isChecked(value)}
        onClick={keepState}
      />
    );
  }

  return (
    <div
      role="textbox"
      aria-label={label}
      aria-readonly="true"
      aria-multiline={cell.type === 'text'}
      className="min-h-[1lh] min-w-[3rem] border-b border-dotted border-line-strong px-1 whitespace-pre-wrap [overflow-wrap:anywhere]"
    >
      {valueText(value)}
    </div>
  );
}

// React also puts a controlled `checked` back after a click. This does not rely on that, and it
// keeps the change event from reaching the handlers Story 1.9 adds.
function keepState(event: MouseEvent<HTMLInputElement>): void {
  event.preventDefault();
}
