import { useId, useMemo } from 'react';
import type { ReactNode, RefCallback } from 'react';

import { patchRecordKey, type FieldPatchTarget } from '@/core/field-patch';
import { firstFieldId, type PresetCell, type PresetSection } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { repeatInstances, rowValues, sectionTitle, type FieldValues } from '@/core/sheet-values';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';

import type { DiceRow } from './dice-button';
import { PendingMark, rowPending, type RowPending, type SheetPending } from './pending-mark';
import { SheetCell } from './preset-cell';
import type { FieldPlace } from './use-field-edit';
import { useRepeatRows, type RepeatRows } from './use-repeat-rows';

// The share of the line minus the gaps beside it. Below 480 px of content area every section
// takes the whole line, so the share applies only from 480 px up.
const WIDTH_CLASSES: Record<NonNullable<PresetSection['width']>, string> = {
  '1/3': '@min-[480px]:basis-[calc((100%_-_2_*_var(--spacing-4))_/_3)]',
  '1/2': '@min-[480px]:basis-[calc((100%_-_var(--spacing-4))_/_2)]',
  full: '',
};

const ROW_CLASS = 'touch-target items-center gap-x-2 px-1';

const STRIPE_CLASS = 'bg-surface-stripe';

// UX-DR28: a removed row's cells dim, and its control slot, which holds the mark, does not. Written
// out whole, so Tailwind finds the class.
const REMOVED_ROW_CLASS = '[&>:not([data-row-control])]:opacity-50';

// Field ids hold no "#", so a key from an index never equals one from an id.
const INDEX_KEY_PREFIX = '#';

type SheetSectionProps = {
  section: PresetSection;
  // The section's position in its template, which a roll request names.
  sectionIndex: number;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  readOnly: boolean;
  // A player's edits that wait for a GM, or `null` for a GM, whose edits never wait.
  pending: SheetPending | null;
};

// `instanceId` is set for a row of a repeat section.
type SheetRow = {
  key: string;
  cells: readonly PresetCell[];
  values: FieldValues;
  place: FieldPlace | null;
  instanceId: string | null;
  dice: DiceRow;
  pending: RowPending;
};

type RowsProps = {
  section: PresetSection;
  rows: readonly SheetRow[];
  readOnly: boolean;
  controls?: RepeatRows;
};

type SectionContentProps = Omit<SheetSectionProps, 'readOnly'> & {
  sectionId: string;
  template: readonly PresetCell[];
};

export function SheetSection({
  section,
  sectionIndex,
  sheetId,
  records,
  readOnly,
  pending,
}: SheetSectionProps): ReactNode {
  const headingId = useId();
  const title = sectionTitle(section);
  const repeat = repeatTemplate(section);

  const className = [
    'min-w-[0] shrink-0 grow-0 basis-full border-l-2 border-line pl-2',
    WIDTH_CLASSES[section.width ?? 'full'],
  ].join(' ');

  const content =
    repeat === null ? (
      <PlainContent
        section={section}
        sectionIndex={sectionIndex}
        sheetId={sheetId}
        records={records}
        readOnly={readOnly}
        pending={pending}
      />
    ) : readOnly ? (
      <ReadOnlyRepeatContent
        section={section}
        sectionIndex={sectionIndex}
        sheetId={sheetId}
        records={records}
        pending={pending}
        sectionId={repeat.sectionId}
        template={repeat.template}
      />
    ) : (
      <RepeatContent
        section={section}
        sectionIndex={sectionIndex}
        sheetId={sheetId}
        records={records}
        pending={pending}
        sectionId={repeat.sectionId}
        template={repeat.template}
      />
    );

  if (title === null) {
    return (
      <div className={className} data-section>
        {content}
      </div>
    );
  }

  return (
    <section className={className} aria-labelledby={headingId} data-section>
      <h2 id={headingId} className="mb-1 text-section-heading text-accent">
        {title}
      </h2>
      {content}
    </section>
  );
}

// A grid wider than the section scrolls here, so the page itself never scrolls sideways.
function Body({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="overflow-x-auto" data-section-body>
      {children}
    </div>
  );
}

function PlainContent({
  section,
  sectionIndex,
  sheetId,
  records,
  readOnly,
  pending,
}: SheetSectionProps): ReactNode {
  const rows = useMemo(
    () => plainRows(section, sectionIndex, sheetId, records, pending),
    [section, sectionIndex, sheetId, records, pending],
  );

  return (
    <Body>
      <Rows section={section} rows={rows} readOnly={readOnly} />
    </Body>
  );
}

// A player's repeat section: the rows, with no "Удалить" and no "Добавить строку".
function ReadOnlyRepeatContent({
  section,
  sectionIndex,
  sheetId,
  records,
  pending,
  sectionId,
  template,
}: SectionContentProps): ReactNode {
  const rows = useMemo(
    () => repeatRows(template, sectionIndex, sectionId, sheetId, records, pending),
    [template, sectionIndex, sectionId, sheetId, records, pending],
  );

  return (
    <Body>
      <Rows section={section} rows={rows} readOnly />
    </Body>
  );
}

// A repeat section renders its one template row once per instance of this sheet, each with its
// "Удалить", and "Добавить строку" under them.
function RepeatContent({
  section,
  sectionIndex,
  sheetId,
  records,
  pending,
  sectionId,
  template,
}: SectionContentProps): ReactNode {
  const rows = useMemo(
    () => repeatRows(template, sectionIndex, sectionId, sheetId, records, pending),
    [template, sectionIndex, sectionId, sheetId, records, pending],
  );

  // A row whose removal waits for a GM counts as gone: its "Удалить" is gone, so the focus moves on.
  const instanceIds = useMemo(
    () => rows.flatMap((row) => (row.pending.removed ? [] : (row.instanceId ?? []))),
    [rows],
  );

  const controls = useRepeatRows(sheetId, sectionId, instanceIds);

  return (
    <>
      <Body>
        <Rows section={section} rows={rows} readOnly={false} controls={controls} />
      </Body>
      <div className="mt-1">
        <Button ref={controls.addButton} onPress={controls.add}>
          {copy.command.addRow}
        </Button>
      </div>
    </>
  );
}

// Keyed by row id, instance id or field id where one exists, so the state a field keeps stays with
// that field when the preset changes around it.
// Rows count from 1, so the second, fourth and later even rows stripe.
function Rows({ section, rows, readOnly, controls }: RowsProps): ReactNode {
  // The row mark ids: one per row key under this section's prefix.
  const markPrefix = useId();

  if (section.columns === undefined) {
    return rows.map((row, index) => (
      <div
        key={row.key}
        ref={rowRef(row, controls)}
        className={`flex flex-wrap gap-y-1 ${ROW_CLASS} ${stripe(index)} ${removedClass(row)}`}
        data-row
      >
        <Cells row={row} readOnly={readOnly} rowMarkId={rowMarkId(markPrefix, row)} />
        <RowSlot row={row} index={index} controls={controls} markId={`${markPrefix}${row.key}`} />
      </div>
    ));
  }

  // Each row is a subgrid over all tracks, so its cells align with every other row and its stripe
  // spans the whole grid. A short row leaves its last tracks empty. Row slots take one more track
  // after the preset's columns, so they line up too.
  const columns = section.columns;
  const slotted = controls !== undefined || rows.some((row) => row.pending.rowMarked);
  const tracks = `repeat(${columns}, auto)${slotted ? ' auto' : ''}`;

  return (
    <div className="grid w-max min-w-full gap-x-2" style={{ gridTemplateColumns: tracks }}>
      {rows.map((row, index) => (
        <div
          key={row.key}
          ref={rowRef(row, controls)}
          className={`col-span-full grid grid-cols-subgrid ${ROW_CLASS} ${stripe(index)} ${removedClass(row)}`}
          data-row
        >
          <Cells row={row} readOnly={readOnly} rowMarkId={rowMarkId(markPrefix, row)} />
          <RowSlot
            row={row}
            index={index}
            controls={controls}
            column={columns + 1}
            markId={`${markPrefix}${row.key}`}
          />
        </div>
      ))}
    </div>
  );
}

// A repeat row's slot: its "Удалить", and its own "Ожидает" (UX-DR28), each shown on its own.
// `column` places the slot in the extra grid track, past a short row's empty tracks. A removed row
// has no "Удалить", so it cannot be removed twice and its focus moves on. The slot is a polite live
// region, mounted before the mark, so a removal's mark is announced once, when it appears.
function RowSlot({
  row,
  index,
  controls,
  column,
  markId,
}: {
  row: SheetRow;
  index: number;
  controls: RepeatRows | undefined;
  column?: number;
  markId: string;
}): ReactNode {
  const { instanceId } = row;

  if (instanceId === null || (controls === undefined && !row.pending.rowMarked)) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-2"
      style={column === undefined ? undefined : { gridColumnStart: column }}
      aria-live="polite"
      data-row-control
    >
      {row.pending.rowMarked ? <PendingMark id={markId} /> : null}
      {controls === undefined || row.pending.removed ? null : (
        <Button
          ref={controls.deleteButton(instanceId)}
          accessibleName={copy.label.deleteRow(index + 1)}
          onPress={() => {
            controls.remove(instanceId);
          }}
        >
          {copy.command.delete}
        </Button>
      )}
    </div>
  );
}

function removedClass(row: SheetRow): string {
  return row.pending.removed ? REMOVED_ROW_CLASS : '';
}

// The id of the row's own mark while its slot shows it, which each of its fields names.
function rowMarkId(prefix: string, row: SheetRow): string | null {
  return row.pending.rowMarked && row.instanceId !== null ? `${prefix}${row.key}` : null;
}

function rowRef(
  row: SheetRow,
  controls: RepeatRows | undefined,
): RefCallback<HTMLElement> | undefined {
  return controls === undefined || row.instanceId === null
    ? undefined
    : controls.rowElement(row.instanceId);
}

function stripe(index: number): string {
  return index % 2 === 1 ? STRIPE_CLASS : '';
}

function Cells({
  row,
  readOnly,
  rowMarkId: markId,
}: {
  row: SheetRow;
  readOnly: boolean;
  rowMarkId: string | null;
}): ReactNode {
  return row.cells.map((cell, index) => (
    <SheetCell
      key={cell.kind === 'field' ? cell.id : `${INDEX_KEY_PREFIX}${index}`}
      cell={cell}
      before={row.cells.slice(0, index)}
      values={row.values}
      place={row.place}
      readOnly={readOnly}
      row={row.dice}
      cellIndex={index}
      pending={{
        disabled: row.pending.removed,
        marked: cell.kind === 'field' && row.pending.markedFields.has(cell.id),
        rowMarkId: markId,
      }}
    />
  ));
}

// The template row of a repeat section and the id that names it, or `null` for a plain section.
function repeatTemplate(
  section: PresetSection,
): { template: readonly PresetCell[]; sectionId: string } | null {
  const [template] = section.rows;
  const sectionId = template === undefined ? null : firstFieldId(template);

  return section.repeat !== true || template === undefined || sectionId === null
    ? null
    : { template, sectionId };
}

function plainRows(
  section: PresetSection,
  sectionIndex: number,
  sheetId: string,
  records: ReadonlyMap<string, VersionedRecord>,
  pending: SheetPending | null,
): SheetRow[] {
  return section.rows.map((cells, index) => {
    const rowId = firstFieldId(cells);
    const target: FieldPatchTarget | null = rowId === null ? null : { kind: 'row', rowId };

    return {
      key: rowId ?? `${INDEX_KEY_PREFIX}${index}`,
      pending: rowPending(
        pending,
        target === null ? null : patchRecordKey(sheetId, target),
        fieldIdsOf(cells),
        false,
      ),
      cells,
      values: rowValues(records, sheetId, rowId),
      place: target === null ? null : placeOf(records, sheetId, target),
      instanceId: null,
      dice: {
        sheetId,
        sectionIndex,
        rowIndex: index,
        instanceId: null,
        target,
        fieldIds: fieldIdsOf(cells),
      },
    };
  });
}

// A repeat section holds one template row, so every instance is row 0 of its section.
function repeatRows(
  template: readonly PresetCell[],
  sectionIndex: number,
  sectionId: string,
  sheetId: string,
  records: ReadonlyMap<string, VersionedRecord>,
  pending: SheetPending | null,
): SheetRow[] {
  const fieldIds = fieldIdsOf(template);

  return repeatInstances(records, sheetId, sectionId).map((instance) => {
    const target: FieldPatchTarget = { kind: 'rep', sectionId, instanceId: instance.instanceId };

    return {
      key: instance.instanceId,
      pending: rowPending(pending, patchRecordKey(sheetId, target), fieldIds, true),
      cells: template,
      values: instance.values,
      place: placeOf(records, sheetId, target),
      instanceId: instance.instanceId,
      dice: {
        sheetId,
        sectionIndex,
        rowIndex: 0,
        instanceId: instance.instanceId,
        target,
        fieldIds,
      },
    };
  });
}

function fieldIdsOf(cells: readonly PresetCell[]): ReadonlySet<string> {
  return new Set(cells.flatMap((cell) => (cell.kind === 'field' ? [cell.id] : [])));
}

function placeOf(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  target: FieldPatchTarget,
): FieldPlace {
  return { sheetId, target, record: records.get(patchRecordKey(sheetId, target)) };
}
