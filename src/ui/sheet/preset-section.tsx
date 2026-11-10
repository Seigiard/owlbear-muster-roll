import { useId, useMemo } from 'react';
import type { ReactNode } from 'react';

import { firstFieldId, type PresetCell, type PresetSection } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { repeatInstances, rowValues, sectionTitle, type FieldValues } from '@/core/sheet-values';

import { SheetCell } from './preset-cell';

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
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
};

type SheetRow = { key: string; cells: readonly PresetCell[]; values: FieldValues };

type RowsProps = { section: PresetSection; rows: readonly SheetRow[] };

export function SheetSection({ section, sheetId, records }: SheetSectionProps): ReactNode {
  const headingId = useId();
  const title = sectionTitle(section);
  const rows = useMemo(() => sheetRows(section, sheetId, records), [section, sheetId, records]);

  const className = [
    'min-w-[0] shrink-0 grow-0 basis-full border-l-2 border-line pl-2',
    WIDTH_CLASSES[section.width ?? 'full'],
  ].join(' ');

  // A grid wider than the section scrolls here, so the page itself never scrolls sideways.
  const body = (
    <div className="overflow-x-auto" data-section-body>
      <Rows section={section} rows={rows} />
    </div>
  );

  if (title === null) {
    return (
      <div className={className} data-section>
        {body}
      </div>
    );
  }

  return (
    <section className={className} aria-labelledby={headingId} data-section>
      <h2 id={headingId} className="mb-1 text-section-heading text-accent">
        {title}
      </h2>
      {body}
    </section>
  );
}

// Keyed by row id, instance id or field id where one exists, so the state a field keeps stays with
// that field when the preset changes around it.
// Rows count from 1, so the second, fourth and later even rows stripe.
function Rows({ section, rows }: RowsProps): ReactNode {
  if (section.columns === undefined) {
    return rows.map((row, index) => (
      <div
        key={row.key}
        className={`flex flex-wrap gap-y-1 ${ROW_CLASS} ${stripe(index)}`}
        data-row
      >
        <Cells row={row} />
      </div>
    ));
  }

  // Each row is a subgrid over all tracks, so its cells align with every other row and its stripe
  // spans the whole grid. A short row leaves its last tracks empty.
  return (
    <div
      className="grid w-max min-w-full gap-x-2"
      style={{ gridTemplateColumns: `repeat(${section.columns}, auto)` }}
    >
      {rows.map((row, index) => (
        <div
          key={row.key}
          className={`col-span-full grid grid-cols-subgrid ${ROW_CLASS} ${stripe(index)}`}
          data-row
        >
          <Cells row={row} />
        </div>
      ))}
    </div>
  );
}

function stripe(index: number): string {
  return index % 2 === 1 ? STRIPE_CLASS : '';
}

function Cells({ row }: { row: SheetRow }): ReactNode {
  return row.cells.map((cell, index) => (
    <SheetCell
      key={cell.kind === 'field' ? cell.id : `${INDEX_KEY_PREFIX}${index}`}
      cell={cell}
      before={row.cells.slice(0, index)}
      values={row.values}
    />
  ));
}

// A repeat section renders its one template row once per instance of this sheet.
function sheetRows(
  section: PresetSection,
  sheetId: string,
  records: ReadonlyMap<string, VersionedRecord>,
): SheetRow[] {
  if (section.repeat !== true) {
    return section.rows.map((cells, index) => ({
      key: firstFieldId(cells) ?? `${INDEX_KEY_PREFIX}${index}`,
      cells,
      values: rowValues(records, sheetId, firstFieldId(cells)),
    }));
  }

  const [template] = section.rows;
  const sectionId = template === undefined ? null : firstFieldId(template);

  if (template === undefined || sectionId === null) {
    return [];
  }

  return repeatInstances(records, sheetId, sectionId).map((instance) => ({
    key: instance.instanceId,
    cells: template,
    values: instance.values,
  }));
}
