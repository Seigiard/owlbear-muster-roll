import { useId, useMemo } from 'react';
import type { ReactNode, RefCallback } from 'react';

import { patchRecordKey, type FieldPatchTarget } from '@/core/field-patch';
import { firstFieldId, type PresetCell, type PresetSection } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { repeatInstances, rowValues, sectionTitle, type FieldValues } from '@/core/sheet-values';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';

import type { DiceRow } from './dice-button';
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

// Field ids hold no "#", so a key from an index never equals one from an id.
const INDEX_KEY_PREFIX = '#';

type SheetSectionProps = {
  section: PresetSection;
  // The section's position in its template, which a roll request names.
  sectionIndex: number;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  readOnly: boolean;
};

// `instanceId` is set for a row of a repeat section.
type SheetRow = {
  key: string;
  cells: readonly PresetCell[];
  values: FieldValues;
  place: FieldPlace | null;
  instanceId: string | null;
  dice: DiceRow;
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
      />
    ) : readOnly ? (
      <ReadOnlyRepeatContent
        section={section}
        sectionIndex={sectionIndex}
        sheetId={sheetId}
        records={records}
        sectionId={repeat.sectionId}
        template={repeat.template}
      />
    ) : (
      <RepeatContent
        section={section}
        sectionIndex={sectionIndex}
        sheetId={sheetId}
        records={records}
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
}: SheetSectionProps): ReactNode {
  const rows = useMemo(
    () => plainRows(section, sectionIndex, sheetId, records),
    [section, sectionIndex, sheetId, records],
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
  sectionId,
  template,
}: SectionContentProps): ReactNode {
  const rows = useMemo(
    () => repeatRows(template, sectionIndex, sectionId, sheetId, records),
    [template, sectionIndex, sectionId, sheetId, records],
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
  sectionId,
  template,
}: SectionContentProps): ReactNode {
  const rows = useMemo(
    () => repeatRows(template, sectionIndex, sectionId, sheetId, records),
    [template, sectionIndex, sectionId, sheetId, records],
  );

  const instanceIds = useMemo(() => rows.flatMap((row) => row.instanceId ?? []), [rows]);
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
  if (section.columns === undefined) {
    return rows.map((row, index) => (
      <div
        key={row.key}
        ref={rowRef(row, controls)}
        className={`flex flex-wrap gap-y-1 ${ROW_CLASS} ${stripe(index)}`}
        data-row
      >
        <Cells row={row} readOnly={readOnly} />
        <DeleteControl row={row} index={index} controls={controls} />
      </div>
    ));
  }

  // Each row is a subgrid over all tracks, so its cells align with every other row and its stripe
  // spans the whole grid. A short row leaves its last tracks empty. Row controls take one more
  // track after the preset's columns, so they line up too.
  const columns = section.columns;
  const tracks = `repeat(${columns}, auto)${controls === undefined ? '' : ' auto'}`;

  return (
    <div className="grid w-max min-w-full gap-x-2" style={{ gridTemplateColumns: tracks }}>
      {rows.map((row, index) => (
        <div
          key={row.key}
          ref={rowRef(row, controls)}
          className={`col-span-full grid grid-cols-subgrid ${ROW_CLASS} ${stripe(index)}`}
          data-row
        >
          <Cells row={row} readOnly={readOnly} />
          <DeleteControl row={row} index={index} controls={controls} column={columns + 1} />
        </div>
      ))}
    </div>
  );
}

// `column` places the control in the extra grid track, past a short row's empty tracks.
function DeleteControl({
  row,
  index,
  controls,
  column,
}: {
  row: SheetRow;
  index: number;
  controls: RepeatRows | undefined;
  column?: number;
}): ReactNode {
  const { instanceId } = row;

  if (controls === undefined || instanceId === null) {
    return null;
  }

  return (
    <div style={column === undefined ? undefined : { gridColumnStart: column }}>
      <Button
        ref={controls.deleteButton(instanceId)}
        accessibleName={copy.label.deleteRow(index + 1)}
        onPress={() => {
          controls.remove(instanceId);
        }}
      >
        {copy.command.delete}
      </Button>
    </div>
  );
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

function Cells({ row, readOnly }: { row: SheetRow; readOnly: boolean }): ReactNode {
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
): SheetRow[] {
  return section.rows.map((cells, index) => {
    const rowId = firstFieldId(cells);
    const target: FieldPatchTarget | null = rowId === null ? null : { kind: 'row', rowId };

    return {
      key: rowId ?? `${INDEX_KEY_PREFIX}${index}`,
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
): SheetRow[] {
  const fieldIds = fieldIdsOf(template);

  return repeatInstances(records, sheetId, sectionId).map((instance) => {
    const target: FieldPatchTarget = { kind: 'rep', sectionId, instanceId: instance.instanceId };

    return {
      key: instance.instanceId,
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
