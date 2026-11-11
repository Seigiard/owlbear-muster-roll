import { useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefCallback } from 'react';

import { patchRecordKey, type FieldPatchTarget } from '@/core/field-patch';
import { linkTargetKey } from '@/core/link-target';
import {
  firstFieldId,
  repeatSectionId,
  sectionFields,
  type PresetCell,
  type PresetSection,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { repeatBlockName } from '@/core/sheets';
import { repeatBlocks, rowValues, sectionTitle, type FieldValues } from '@/core/sheet-values';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import { Chip } from '@/ui/primitives/chip';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

import type { DiceRow } from './dice-button';
import { DuplicateCount } from './duplicate-count';
import { MapSelectionContext, MapToggle } from './map-toggle';
import { PendingMark, rowPending, type RowPending, type SheetPending } from './pending-mark';
import { SheetCell } from './preset-cell';
import type { FieldPlace } from './use-field-edit';
import { useRepeatBlocks, type RepeatBlockControls } from './use-repeat-blocks';

// The share of the line minus the gaps beside it. Below 480 px of content area every section
// takes the whole line, so the share applies only from 480 px up.
const WIDTH_CLASSES: Record<NonNullable<PresetSection['width']>, string> = {
  '1/3': '@min-[480px]:basis-[calc((100%_-_2_*_var(--spacing-4))_/_3)]',
  '1/2': '@min-[480px]:basis-[calc((100%_-_var(--spacing-4))_/_2)]',
  full: '',
};

const ROW_CLASS = 'touch-target items-center gap-x-2 px-1';

const STRIPE_CLASS = 'bg-surface-stripe';

// CAP-32: a repeat block whose linked token is selected on the map, as a bar on its left edge.
const MAP_MARK_CLASS = 'shadow-[inset_3px_0_0_var(--color-accent)]';

// UX-DR28: a removed repeat block's cells dim, and its control slot, which holds the mark, does
// not. Written out whole, so Tailwind finds the class.
const REMOVED_ROW_CLASS = '[&>:not([data-row-control])]:opacity-50';

// Field ids hold no "#", so a key from an index never equals one from an id.
const INDEX_KEY_PREFIX = '#';

// CAP-30, CAP-18: what a GM gets on each repeat block: "Дублировать…", and the token status when
// the section is linkable. A player and the preview get none.
export type BlockTools = {
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections' | '$records'>;
  // The `linkTargetKey` of every target a live link names (AD-19).
  linkedTargets: ReadonlySet<string>;
};

type SheetSectionProps = {
  section: PresetSection;
  // The section's position in its template, which a roll request names.
  sectionIndex: number;
  // The title of the section's template, which names an untitled repeat section's "Добавить".
  templateTitle: string;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  readOnly: boolean;
  // A player's edits that wait for a GM, or `null` for a GM, whose edits never wait.
  pending: SheetPending | null;
  blockTools: BlockTools | null;
};

type PlainContentProps = Omit<SheetSectionProps, 'blockTools' | 'templateTitle'>;

// One row as its cells show it. Every row of a repeat block shares the block's record.
type SheetRow = {
  key: string;
  cells: readonly PresetCell[];
  values: FieldValues;
  place: FieldPlace | null;
  dice: DiceRow;
  pending: RowPending;
};

// One repeat block: every row of its section, with the values of one `rep:` record.
type SheetBlock = {
  instanceId: string;
  // The value of the section's first field, "" when empty.
  name: string;
  rows: SheetRow[];
  pending: RowPending;
};

type RepeatContentProps = Omit<SheetSectionProps, 'readOnly'> & { sectionId: string };

type ReadOnlyRepeatContentProps = Omit<RepeatContentProps, 'templateTitle'>;

export function SheetSection({
  section,
  sectionIndex,
  templateTitle,
  sheetId,
  records,
  readOnly,
  pending,
  blockTools,
}: SheetSectionProps): ReactNode {
  const headingId = useId();
  const title = sectionTitle(section);
  const sectionId = repeatSectionId(section);

  const className = [
    'min-w-[0] shrink-0 grow-0 basis-full border-l-2 border-line pl-2',
    WIDTH_CLASSES[section.width ?? 'full'],
  ].join(' ');

  const repeatProps = {
    section,
    sectionIndex,
    sheetId,
    records,
    pending,
    blockTools,
  };

  const content =
    sectionId === null ? (
      <PlainContent
        section={section}
        sectionIndex={sectionIndex}
        sheetId={sheetId}
        records={records}
        readOnly={readOnly}
        pending={pending}
      />
    ) : readOnly ? (
      <ReadOnlyRepeatContent {...repeatProps} sectionId={sectionId} />
    ) : (
      <RepeatContent {...repeatProps} templateTitle={templateTitle} sectionId={sectionId} />
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
}: PlainContentProps): ReactNode {
  const rows = useMemo(
    () => plainRows(section, sectionIndex, sheetId, records, pending),
    [section, sectionIndex, sheetId, records, pending],
  );

  return (
    <Body>
      <PlainRows section={section} rows={rows} readOnly={readOnly} />
    </Body>
  );
}

// A player's repeat section with no write access: the repeat blocks, with no "Удалить" and no
// "Добавить".
function ReadOnlyRepeatContent({
  section,
  sectionIndex,
  sheetId,
  records,
  pending,
  sectionId,
  blockTools,
}: ReadOnlyRepeatContentProps): ReactNode {
  const blocks = useMemo(
    () => repeatBlocksOf(section, sectionIndex, sectionId, sheetId, records, pending),
    [section, sectionIndex, sectionId, sheetId, records, pending],
  );

  return (
    <Body>
      <Blocks
        section={section}
        sheetId={sheetId}
        sectionId={sectionId}
        blocks={blocks}
        readOnly
        controls={undefined}
        tools={blockTools}
      />
    </Body>
  );
}

// A repeat section shows each repeat block of this sheet with its "Удалить", and "Добавить" under
// them. The accessible name of "Добавить" names the section by its title, or an untitled one by its
// template's, so the buttons of two sections differ.
function RepeatContent({
  section,
  sectionIndex,
  templateTitle,
  sheetId,
  records,
  pending,
  sectionId,
  blockTools,
}: RepeatContentProps): ReactNode {
  const blocks = useMemo(
    () => repeatBlocksOf(section, sectionIndex, sectionId, sheetId, records, pending),
    [section, sectionIndex, sectionId, sheetId, records, pending],
  );

  // A repeat block whose removal waits for a GM counts as gone: its "Удалить" is gone, so the focus
  // moves on.
  const instanceIds = useMemo(
    () => blocks.flatMap((block) => (block.pending.removed ? [] : [block.instanceId])),
    [blocks],
  );

  const controls = useRepeatBlocks(sheetId, sectionId, instanceIds);
  const title = sectionTitle(section) ?? templateTitle;

  return (
    <>
      <Body>
        <Blocks
          section={section}
          sheetId={sheetId}
          sectionId={sectionId}
          blocks={blocks}
          readOnly={false}
          controls={controls}
          tools={blockTools}
        />
      </Body>
      <div className="mt-1">
        <Button
          ref={controls.addButton}
          accessibleName={copy.label.addToSection(title)}
          onPress={controls.add}
        >
          {copy.command.add}
        </Button>
      </div>
    </>
  );
}

// Keyed by row id or field id where one exists, so the state a field keeps stays with that field
// when the preset changes around it. Rows count from 1, so the second, fourth and later even rows
// stripe.
function PlainRows({
  section,
  rows,
  readOnly,
}: {
  section: PresetSection;
  rows: readonly SheetRow[];
  readOnly: boolean;
}): ReactNode {
  if (section.columns === undefined) {
    return rows.map((row, index) => (
      <div
        key={row.key}
        className={`flex flex-wrap gap-y-1 ${ROW_CLASS} ${stripe(index)}`}
        data-row
      >
        <Cells row={row} readOnly={readOnly} rowMarkId={null} />
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
          <Cells row={row} readOnly={readOnly} rowMarkId={null} />
        </div>
      ))}
    </div>
  );
}

type BlocksProps = {
  section: PresetSection;
  sheetId: string;
  sectionId: string;
  blocks: readonly SheetBlock[];
  readOnly: boolean;
  controls: RepeatBlockControls | undefined;
  tools: BlockTools | null;
};

// The duplicate block is open under one repeat block. `request` grows each time "Дублировать…" is
// pressed, so its field takes the focus again.
type DuplicateAsk = { instanceId: string; request: number };

// Every repeat block in order, each holding all rows of the section. Repeat blocks count from 1, so
// the second, fourth and later even ones stripe. The block's control slot sits in its first row.
function Blocks({
  section,
  sheetId,
  sectionId,
  blocks,
  readOnly,
  controls,
  tools,
}: BlocksProps): ReactNode {
  // The mark ids: one per repeat block under this section's prefix.
  const markPrefix = useId();
  const mapMarked = useContext(MapSelectionContext).marked;
  const [duplicateAsk, setDuplicateAsk] = useState<DuplicateAsk | null>(null);
  const duplicateButtons = useRef(new Map<string, HTMLButtonElement>());
  // The repeat block the open duplicate block belongs to, for a close that runs outside a render.
  const askedBlock = useRef<string | null>(null);

  useLayoutEffect(() => {
    askedBlock.current = duplicateAsk?.instanceId ?? null;
  });

  // The block closes and the focus goes back to the "Дублировать…" it was opened from.
  const closeDuplicate = useCallback(() => {
    const asked = askedBlock.current;

    setDuplicateAsk(null);

    if (asked !== null) {
      duplicateButtons.current.get(asked)?.focus();
    }
  }, []);

  // A repeat block gone elsewhere takes its open duplicate block with it.
  if (
    duplicateAsk !== null &&
    !blocks.some((block) => block.instanceId === duplicateAsk.instanceId)
  ) {
    setDuplicateAsk(null);
  }

  const duplicateButton = (instanceId: string): RefCallback<HTMLButtonElement> => {
    return (element) => {
      if (element === null) {
        return undefined;
      }

      duplicateButtons.current.set(instanceId, element);

      return () => {
        duplicateButtons.current.delete(instanceId);
      };
    };
  };

  const slotted =
    controls !== undefined || tools !== null || blocks.some((block) => block.pending.rowMarked);

  const columns = section.columns;

  const blockNodes = blocks.map((block, index) => {
    const markId = `${markPrefix}${block.instanceId}`;
    const rowMarkId = block.pending.rowMarked ? markId : null;
    const removed = block.pending.removed ? REMOVED_ROW_CLASS : '';

    const slot = slotted ? (
      <BlockSlot
        block={block}
        index={index}
        section={section}
        sheetId={sheetId}
        controls={controls}
        tools={tools}
        column={columns === undefined ? undefined : columns + 1}
        markId={markId}
        duplicateButton={duplicateButton(block.instanceId)}
        onDuplicate={() => {
          setDuplicateAsk((current) => ({
            instanceId: block.instanceId,
            request: (current?.request ?? 0) + 1,
          }));
        }}
      />
    ) : null;

    const rows = block.rows.map((row, rowIndex) => (
      <div
        key={row.key}
        className={
          columns === undefined
            ? `flex flex-wrap gap-y-1 ${ROW_CLASS} ${removed}`
            : `col-span-full grid grid-cols-subgrid ${ROW_CLASS} ${removed}`
        }
        data-row
      >
        <Cells row={row} readOnly={readOnly} rowMarkId={rowMarkId} />
        {rowIndex === 0 ? slot : null}
      </div>
    ));

    const duplicate =
      tools !== null && duplicateAsk?.instanceId === block.instanceId ? (
        <div className={columns === undefined ? 'px-1 pt-1' : 'col-span-full px-1 pt-1'}>
          <DuplicateCount
            sheetId={sheetId}
            sectionId={sectionId}
            instanceId={block.instanceId}
            fieldIds={sectionFields(section).map((field) => field.id)}
            sendCommand={tools.sendCommand}
            store={tools.store}
            focusRequest={duplicateAsk.request}
            onDone={closeDuplicate}
            onCancel={closeDuplicate}
          />
        </div>
      ) : null;

    const name = block.name === '' ? copy.unnamed : block.name;
    const onMap = mapMarked.has(linkTargetKey({ sheetId, instanceId: block.instanceId }));

    return (
      <div
        key={block.instanceId}
        ref={controls?.blockElement(block.instanceId)}
        role="group"
        aria-label={onMap ? copy.label.selectedOnMap(name) : name}
        tabIndex={-1}
        className={`${columns === undefined ? '' : 'col-span-full grid grid-cols-subgrid'} ${stripe(index)} ${onMap ? MAP_MARK_CLASS : ''}`}
        data-repeat-block={block.instanceId}
      >
        {rows}
        {duplicate}
      </div>
    );
  });

  if (columns === undefined) {
    return blockNodes;
  }

  // Row slots take one more track after the preset's columns, so they line up too.
  const tracks = `repeat(${columns}, auto)${slotted ? ' auto' : ''}`;

  return (
    <div className="grid w-max min-w-full gap-x-2" style={{ gridTemplateColumns: tracks }}>
      {blockNodes}
    </div>
  );
}

type BlockSlotProps = {
  block: SheetBlock;
  index: number;
  section: PresetSection;
  sheetId: string;
  controls: RepeatBlockControls | undefined;
  tools: BlockTools | null;
  column: number | undefined;
  markId: string;
  duplicateButton: RefCallback<HTMLButtonElement>;
  onDuplicate: () => void;
};

// A repeat block's slot: its own "Ожидает" (UX-DR28), the GM's token status and "Дублировать…", and
// its "Удалить", each shown on its own. `column` places the slot in the extra grid track, past a
// short row's empty tracks. A removed repeat block has no "Удалить", so it cannot be removed twice
// and its focus moves on. The slot is a polite live region, mounted before the mark, so a removal's
// mark is announced once, when it appears.
function BlockSlot({
  block,
  index,
  section,
  sheetId,
  controls,
  tools,
  column,
  markId,
  duplicateButton,
  onDuplicate,
}: BlockSlotProps): ReactNode {
  const { instanceId } = block;

  const linked =
    tools !== null && section.tokens === true
      ? tools.linkedTargets.has(linkTargetKey({ sheetId, instanceId }))
      : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2"
      style={column === undefined ? undefined : { gridColumnStart: column }}
      aria-live="polite"
      data-row-control
    >
      {block.pending.rowMarked ? <PendingMark id={markId} /> : null}
      {linked === null ? null : (
        <Chip>{linked ? copy.status.tokenLinked : copy.status.noToken}</Chip>
      )}
      {linked === true ? (
        <MapToggle
          target={{ sheetId, instanceId }}
          accessibleName={copy.label.selectBlockOnMap(index + 1)}
        />
      ) : null}
      {tools === null || block.pending.removed ? null : (
        <Button
          ref={duplicateButton}
          accessibleName={copy.label.duplicateBlock(index + 1)}
          onPress={onDuplicate}
        >
          {copy.command.duplicate}
        </Button>
      )}
      {controls === undefined || block.pending.removed ? null : (
        <Button
          ref={controls.deleteButton(instanceId)}
          accessibleName={copy.label.deleteBlock(index + 1)}
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

// CAP-5: all rows of a repeat section form one repeat block, so every row of a block reads and
// writes the block's one `rep:` record, and a formula in any of them reaches every field of it.
function repeatBlocksOf(
  section: PresetSection,
  sectionIndex: number,
  sectionId: string,
  sheetId: string,
  records: ReadonlyMap<string, VersionedRecord>,
  pending: SheetPending | null,
): SheetBlock[] {
  const fieldIds: ReadonlySet<string> = new Set(sectionFields(section).map((field) => field.id));

  return repeatBlocks(records, sheetId, sectionId).map((block) => {
    const target: FieldPatchTarget = { kind: 'rep', sectionId, instanceId: block.instanceId };
    const blockPending = rowPending(pending, patchRecordKey(sheetId, target), fieldIds, true);
    const place = placeOf(records, sheetId, target);

    return {
      instanceId: block.instanceId,
      name: repeatBlockName(records, sheetId, section, block.instanceId),
      pending: blockPending,
      rows: section.rows.map((cells, rowIndex) => ({
        key: firstFieldId(cells) ?? `${INDEX_KEY_PREFIX}${rowIndex}`,
        cells,
        values: block.values,
        place,
        pending: blockPending,
        dice: {
          sheetId,
          sectionIndex,
          rowIndex,
          instanceId: block.instanceId,
          target,
          fieldIds,
        },
      })),
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
