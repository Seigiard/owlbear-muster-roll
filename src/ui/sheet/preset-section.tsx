import clsx from 'clsx';
import { useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefCallback } from 'react';

import { patchRecordKey, type FieldPatchTarget } from '@/core/field-patch';
import { linkTargetKey, type LinkTarget } from '@/core/link-target';
import {
  firstFieldId,
  repeatSectionById,
  repeatSectionId,
  repeatScopeById,
  sectionFields,
  type TabBlock,
  type PresetCell,
  type PresetSection,
  type Template,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { rowShownTo } from '@/core/visibility';
import { repeatBlockName } from '@/core/sheets';
import { repeatBlocks, rowValues, sectionTitle, type FieldValues } from '@/core/sheet-values';
import type { Command } from '@/core/ui-messages';
import { copy } from '@/copy';
import { Button } from '@/ui/primitives/button';
import { IconButton } from '@/ui/primitives/icon-button';
import { DuplicateIcon, TrashIcon } from '@/ui/primitives/icons';
import type { CommandOutcomePromise } from '@/ui/replica-client';

import type { DiceRow } from './dice-button';
import { DuplicateCount } from './duplicate-count';
import { MapSelectionContext } from './map-toggle';
import { PendingMark, rowPending, type RowPending, type SheetPending } from './pending-mark';
import { SheetCell, type TokenCellTools } from './preset-cell';
import type { FieldPlace } from './use-field-edit';
import { useRepeatBlocks, type RepeatBlockControls } from './use-repeat-blocks';

// The share of the line minus the gaps beside it. Below 480 px of content area every section
// takes the whole line, so the share applies only from 480 px up.
const WIDTH_CLASSES: Record<NonNullable<PresetSection['width']>, string> = {
  '1/3': '@min-[480px]:basis-[calc((100%_-_2_*_var(--spacing-4))_/_3)]',
  '1/2': '@min-[480px]:basis-[calc((100%_-_var(--spacing-4))_/_2)]',
  full: '',
};

// A row lights up under the pointer, so the eye can follow it across a wide grid.
const ROW_CLASS = 'touch-target items-center gap-x-2 rounded-md px-1 hover:bg-fill';

// Repeat blocks after the first sit under a hairline, so each block reads as one.
const BLOCK_RULE_CLASS = 'border-t border-hairline';

// CAP-32: a repeat block whose linked token is selected on the map, as a bar on its left edge.
// Forced colors drop shadows, so there it is an outline.
const MAP_MARK_CLASS =
  'shadow-[inset_3px_0_0_var(--color-accent)] forced-colors:outline-3 forced-colors:outline-solid forced-colors:-outline-offset-3';

// UX-DR28: a removed repeat block's cells dim, and its control slot, which holds the mark, does
// not. Written out whole, so Tailwind finds the class.
const REMOVED_ROW_CLASS = '[&>:not([data-row-control])]:opacity-50';

// Field ids hold no "#", so a key from an index never equals one from an id.
const INDEX_KEY_PREFIX = '#';

// CAP-30, CAP-18: what a GM gets on each repeat block: "Дублировать…", and the token status when
// the section is linkable. A player and the preview get none.
export type BlockTools = TokenCellTools & {
  sendCommand: (
    command: Extract<Command, { type: 'repeat-block-duplicate' }>,
  ) => CommandOutcomePromise<undefined>;
  // The `linkTargetKey` of every target a live link names (AD-19).
  linkedTargets: ReadonlySet<string>;
};

type SheetSectionProps = {
  template: Template;
  section: PresetSection;
  // The section's position in its template, its tab and its index within that tab, which a roll
  // request names.
  tabIndex: number;
  sectionIndex: number;
  // The title of the section's template, which names an untitled repeat section's "Добавить".
  templateTitle: string;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  readOnly: boolean;
  // A player's edits that wait for a GM, or `null` for a GM, whose edits never wait.
  pending: SheetPending | null;
  blockTools: BlockTools | null;
  tabBlock: TabBlock | null;
  role: 'GM' | 'PLAYER';
};

type PlainContentProps = Omit<SheetSectionProps, 'templateTitle'>;

// One row as its cells show it. Every row of a repeat block shares the block's record.
type SheetRow = {
  key: string;
  cells: readonly PresetCell[];
  values: FieldValues;
  place: FieldPlace | null;
  dice: DiceRow;
  pending: RowPending;
  sourceIndex: number;
};

// One repeat block: every row of its section, with the values of one descendant block record.
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
  template,
  section,
  tabIndex,
  sectionIndex,
  templateTitle,
  sheetId,
  records,
  readOnly,
  pending,
  blockTools,
  tabBlock,
  role,
}: SheetSectionProps): ReactNode {
  const headingId = useId();
  const title = sectionTitle(section);
  const sectionId = repeatSectionId(section);

  const rowRepeatId =
    sectionId === null
      ? (section.rows.find((row) => row.repeat !== undefined)?.repeat?.id ?? null)
      : null;

  const widthClass = section.width ? WIDTH_CLASSES[section.width] : WIDTH_CLASSES.full;

  const className = clsx('min-w-0 shrink-0 grow-0 basis-full', widthClass);

  const repeatProps = {
    template,
    section,
    tabIndex,
    sectionIndex,
    sheetId,
    records,
    pending,
    blockTools,
    tabBlock,
    role,
  };

  const content =
    sectionId === null && rowRepeatId === null ? (
      <PlainContent
        template={template}
        section={section}
        tabIndex={tabIndex}
        sectionIndex={sectionIndex}
        sheetId={sheetId}
        records={records}
        readOnly={readOnly}
        pending={pending}
        blockTools={blockTools}
        tabBlock={tabBlock}
        role={role}
      />
    ) : sectionId === null ? (
      <RowRepeatContent
        {...repeatProps}
        templateTitle={templateTitle}
        readOnly={readOnly}
        role={role}
      />
    ) : readOnly ? (
      <ReadOnlyRepeatContent {...repeatProps} sectionId={sectionId} />
    ) : (
      <RepeatContent {...repeatProps} templateTitle={templateTitle} sectionId={sectionId} />
    );

  if (title === null) {
    return (
      <div className={className} data-section data-section-index={sectionIndex}>
        {content}
      </div>
    );
  }

  return (
    <section
      className={className}
      aria-labelledby={headingId}
      data-section
      data-section-index={sectionIndex}
    >
      <h2
        id={headingId}
        className="mb-1 border-b border-hairline px-1 pb-2 text-section-heading text-text-muted"
      >
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
  template,
  section,
  tabIndex,
  sectionIndex,
  sheetId,
  records,
  readOnly,
  pending,
  blockTools,
  tabBlock,
  role,
}: PlainContentProps): ReactNode {
  const rows = useMemo(
    () =>
      plainRows(
        template,
        section,
        tabIndex,
        sectionIndex,
        sheetId,
        records,
        pending,
        role,
        tabBlock,
      ),
    [template, section, tabIndex, sectionIndex, sheetId, records, pending, role, tabBlock],
  );

  return (
    <Body>
      <PlainRows section={section} rows={rows} readOnly={readOnly} tools={blockTools} />
    </Body>
  );
}

function RowRepeatContent({
  template,
  section,
  tabIndex,
  sectionIndex,
  templateTitle,
  sheetId,
  records,
  readOnly,
  pending,
  blockTools,
  tabBlock,
  role,
}: SheetSectionProps): ReactNode {
  const plain = plainRows(
    template,
    section,
    tabIndex,
    sectionIndex,
    sheetId,
    records,
    pending,
    role,
    tabBlock,
  );

  const repeated = section.rows.flatMap((row, rowIndex) => {
    const id = row.repeat?.id;

    if (id === undefined || !rowShownTo(role, template, tabIndex, sectionIndex, rowIndex)) {
      return [];
    }

    const repeatedSection = repeatSectionById(template, id);

    return repeatedSection === null ? [] : [{ id, section: repeatedSection }];
  });

  return (
    <>
      {plain.length === 0 ? null : (
        <Body>
          <PlainRows section={section} rows={plain} readOnly={readOnly} tools={blockTools} />
        </Body>
      )}
      {repeated.map(({ id, section: repeatedSection }) =>
        readOnly ? (
          <ReadOnlyRepeatContent
            key={id}
            template={template}
            section={repeatedSection}
            tabIndex={tabIndex}
            sectionIndex={sectionIndex}
            sheetId={sheetId}
            records={records}
            pending={pending}
            sectionId={id}
            blockTools={blockTools}
            tabBlock={tabBlock}
            role={role}
          />
        ) : (
          <RepeatContent
            key={id}
            template={template}
            section={repeatedSection}
            tabIndex={tabIndex}
            sectionIndex={sectionIndex}
            templateTitle={templateTitle}
            sheetId={sheetId}
            records={records}
            pending={pending}
            sectionId={id}
            blockTools={blockTools}
            tabBlock={tabBlock}
            role={role}
          />
        ),
      )}
    </>
  );
}

// A player's repeat section with no write access: the repeat blocks, with no "Удалить" and no
// "Добавить".
function ReadOnlyRepeatContent({
  template,
  section,
  tabIndex,
  sectionIndex,
  sheetId,
  records,
  pending,
  sectionId,
  blockTools,
  role,
}: ReadOnlyRepeatContentProps): ReactNode {
  const blocks = useMemo(
    () =>
      repeatBlocksOf(
        template,
        section,
        tabIndex,
        sectionIndex,
        sectionId,
        sheetId,
        records,
        pending,
        role,
      ),
    [template, section, tabIndex, sectionIndex, sectionId, sheetId, records, pending, role],
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
  template,
  section,
  tabIndex,
  sectionIndex,
  templateTitle,
  sheetId,
  records,
  pending,
  sectionId,
  blockTools,
  role,
}: RepeatContentProps): ReactNode {
  const blocks = useMemo(
    () =>
      repeatBlocksOf(
        template,
        section,
        tabIndex,
        sectionIndex,
        sectionId,
        sheetId,
        records,
        pending,
        role,
      ),
    [template, section, tabIndex, sectionIndex, sectionId, sheetId, records, pending, role],
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
// when the preset changes around it.
function PlainRows({
  section,
  rows,
  readOnly,
  tools,
}: {
  section: PresetSection;
  rows: readonly SheetRow[];
  readOnly: boolean;
  tools: BlockTools | null;
}): ReactNode {
  if (section.columns === undefined) {
    return rows.map((row) => (
      <div
        key={row.key}
        className={clsx('flex flex-wrap gap-y-1', ROW_CLASS)}
        data-row
        data-row-index={row.sourceIndex}
      >
        <Cells row={row} readOnly={readOnly} rowMarkId={null} tools={tools} />
      </div>
    ));
  }

  // Each row is a subgrid over all tracks, so its cells align with every other row and its hover
  // spans the whole grid. A short row leaves its last tracks empty.
  return (
    <div
      className="grid w-max min-w-full gap-x-2"
      style={{ gridTemplateColumns: `repeat(${section.columns}, auto)` }}
    >
      {rows.map((row) => (
        <div
          key={row.key}
          className={clsx('col-span-full grid grid-cols-subgrid', ROW_CLASS)}
          data-row
          data-row-index={row.sourceIndex}
        >
          <Cells row={row} readOnly={readOnly} rowMarkId={null} tools={tools} />
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

// Every repeat block in order, each holding all rows of the section. The block's control slot sits
// in its first row.
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

    const slot = slotted ? (
      <BlockSlot
        block={block}
        index={index}
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
        className={clsx(
          {
            'flex flex-wrap gap-y-1': columns === undefined,
            'col-span-full grid grid-cols-subgrid': columns !== undefined,
          },
          ROW_CLASS,
          { [REMOVED_ROW_CLASS]: block.pending.removed },
        )}
        data-row
        data-row-index={rowIndex}
      >
        <Cells
          row={row}
          readOnly={readOnly}
          rowMarkId={rowMarkId}
          sectionId={sectionId}
          tools={tools}
        />
        {rowIndex === 0 ? slot : null}
      </div>
    ));

    const duplicate =
      tools !== null && duplicateAsk?.instanceId === block.instanceId ? (
        <div
          className={clsx({
            'px-1 pt-1': columns === undefined,
            'col-span-full px-1 pt-1': columns !== undefined,
          })}
        >
          <DuplicateCount
            sheetId={sheetId}
            sectionId={sectionId}
            instanceId={block.instanceId}
            sendCommand={tools.sendCommand}
            focusRequest={duplicateAsk.request}
            onDone={closeDuplicate}
            onCancel={closeDuplicate}
          />
        </div>
      ) : null;

    const name = block.name === '' ? copy.unnamed : block.name;

    const onMap = section.rows.some((row) =>
      row.cells.some(
        (cell) =>
          cell.kind === 'token' &&
          mapMarked.has(
            linkTargetKey({
              sheetId,
              instanceId: block.instanceId,
              path: [sectionId, block.instanceId],
              cellId: cell.id,
            }),
          ),
      ),
    );

    return (
      <div
        key={block.instanceId}
        ref={controls?.blockElement(block.instanceId)}
        role="group"
        aria-label={onMap ? copy.label.selectedOnMap(name) : name}
        tabIndex={-1}
        className={clsx({
          'col-span-full grid grid-cols-subgrid': columns !== undefined,
          [BLOCK_RULE_CLASS]: index > 0,
          [MAP_MARK_CLASS]: onMap,
        })}
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
  controls,
  tools,
  column,
  markId,
  duplicateButton,
  onDuplicate,
}: BlockSlotProps): ReactNode {
  const { instanceId } = block;

  return (
    <div
      className="flex flex-wrap items-center gap-x-1"
      style={column === undefined ? undefined : { gridColumnStart: column }}
      aria-live="polite"
      data-row-control
    >
      {block.pending.rowMarked ? <PendingMark id={markId} /> : null}
      {tools === null || block.pending.removed ? null : (
        <IconButton
          ref={duplicateButton}
          icon={<DuplicateIcon />}
          label={copy.label.duplicateBlock(index + 1)}
          tooltip={copy.command.duplicate}
          onPress={onDuplicate}
        />
      )}
      {controls === undefined || block.pending.removed ? null : (
        <IconButton
          ref={controls.deleteButton(instanceId)}
          icon={<TrashIcon />}
          label={copy.label.deleteBlock(index + 1)}
          tooltip={copy.command.delete}
          tone="danger"
          onPress={() => {
            controls.remove(instanceId);
          }}
        />
      )}
    </div>
  );
}

function Cells({
  row,
  readOnly,
  rowMarkId: markId,
  sectionId = null,
  tools = null,
}: {
  row: SheetRow;
  readOnly: boolean;
  rowMarkId: string | null;
  sectionId?: string | null;
  tools?: BlockTools | null;
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
      tokenTarget={tokenTargetOf(row.dice, cell, sectionId)}
      tokenTools={tools}
    />
  ));
}

function tokenTargetOf(
  row: DiceRow,
  cell: PresetCell,
  sectionId: string | null,
): LinkTarget | null {
  if (cell.kind !== 'token') {
    return null;
  }

  return row.instanceId === null
    ? { sheetId: row.sheetId, instanceId: null, cellId: cell.id }
    : {
        sheetId: row.sheetId,
        instanceId: row.instanceId,
        path: [
          sectionId ?? (row.target?.kind === 'rep' ? row.target.sectionId : ''),
          row.instanceId,
        ],
        cellId: cell.id,
      };
}

function plainRows(
  template: Template,
  section: PresetSection,
  tabIndex: number,
  sectionIndex: number,
  sheetId: string,
  records: ReadonlyMap<string, VersionedRecord>,
  pending: SheetPending | null,
  role: 'GM' | 'PLAYER',
  tabBlock: TabBlock | null,
): SheetRow[] {
  const blockValues =
    tabBlock === null
      ? null
      : (repeatBlocks(records, sheetId, tabBlock.scopeId).find(
          (block) => block.instanceId === tabBlock.instanceId,
        )?.values ?? new Map());

  return section.rows.flatMap((row, index) => {
    if (row.repeat !== undefined || !rowShownTo(role, template, tabIndex, sectionIndex, index)) {
      return [];
    }

    const cells = row.cells;
    const rowId = firstFieldId(row);

    const target: FieldPatchTarget | null =
      tabBlock === null
        ? rowId === null
          ? null
          : { kind: 'row', rowId }
        : { kind: 'rep', sectionId: tabBlock.scopeId, instanceId: tabBlock.instanceId };

    return [
      {
        key: rowId ?? `${INDEX_KEY_PREFIX}${index}`,
        pending: rowPending(
          pending,
          target === null ? null : patchRecordKey(sheetId, target),
          fieldIdsOf(cells),
          false,
        ),
        cells,
        values: blockValues ?? rowValues(records, sheetId, rowId),
        place: target === null ? null : placeOf(records, sheetId, target),
        dice: {
          sheetId,
          tabIndex,
          sectionIndex,
          rowIndex: index,
          instanceId: tabBlock?.instanceId ?? null,
          target,
          fieldIds: fieldIdsOf(cells),
        },
        sourceIndex: index,
      },
    ];
  });
}

// CAP-5: all rows of a repeat section form one repeat block, so every row reads and writes the same
// descendant block record, and a formula in any row reaches every field of that block.
function repeatBlocksOf(
  template: Template,
  section: PresetSection,
  tabIndex: number,
  sectionIndex: number,
  sectionId: string,
  sheetId: string,
  records: ReadonlyMap<string, VersionedRecord>,
  pending: SheetPending | null,
  role: 'GM' | 'PLAYER',
): SheetBlock[] {
  const fieldIds: ReadonlySet<string> = new Set(sectionFields(section).map((field) => field.id));
  const scope = repeatScopeById(template, sectionId);

  return repeatBlocks(records, sheetId, sectionId).map((block) => {
    const target: FieldPatchTarget = { kind: 'rep', sectionId, instanceId: block.instanceId };
    const blockPending = rowPending(pending, patchRecordKey(sheetId, target), fieldIds, true);
    const place = placeOf(records, sheetId, target);

    return {
      instanceId: block.instanceId,
      name: repeatBlockName(records, sheetId, section, block.instanceId),
      pending: blockPending,
      rows: section.rows.flatMap((row, rowIndex) => {
        const sourceIndex =
          scope === null || scope.row === null ? rowIndex : scope.section.rows.indexOf(scope.row);

        return rowShownTo(role, template, tabIndex, sectionIndex, sourceIndex)
          ? [
              {
                key: firstFieldId(row) ?? `${INDEX_KEY_PREFIX}${sourceIndex}`,
                cells: row.cells,
                values: block.values,
                place,
                pending: blockPending,
                dice: {
                  sheetId,
                  tabIndex,
                  sectionIndex,
                  rowIndex: sourceIndex,
                  instanceId: block.instanceId,
                  target,
                  fieldIds,
                },
                sourceIndex,
              },
            ]
          : [];
      }),
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
