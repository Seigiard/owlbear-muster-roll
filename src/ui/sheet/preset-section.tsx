import clsx from 'clsx';
import { useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefCallback } from 'react';

import {
  blockIdOf,
  blockKeyOf,
  childAddress,
  parentOf,
  sectionIdOf,
  scopePathOf,
  sheetRootAddress,
  type BlockAddress,
} from '@/core/block-address';
import { patchRecordKey, type FieldPatchTarget } from '@/core/field-patch';
import { linkTargetKey, type LinkTarget } from '@/core/link-target';
import {
  firstFieldId,
  repeatSectionByPath,
  repeatScopeByPath,
  repeatSectionId,
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
  parent: BlockAddress;
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
  block: BlockAddress;
  // The value of the section's first field, "" when empty.
  name: string;
  rows: SheetRow[];
  nested: NestedRepeat[];
  pending: RowPending;
};

type NestedRepeat = { id: string; section: PresetSection };

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
  parent,
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
    parent,
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
        parent={parent}
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
  parent,
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

    const repeatedSection = repeatSectionByPath(template, [...scopePathOf(parent), id]);

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
            parent={parent}
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
            parent={parent}
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
  parent,
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
        parent,
      ),
    [template, section, tabIndex, sectionIndex, sectionId, sheetId, records, pending, role, parent],
  );

  return (
    <Body>
      <Blocks
        template={template}
        tabIndex={tabIndex}
        sectionIndex={sectionIndex}
        section={section}
        sheetId={sheetId}
        records={records}
        pending={pending}
        templateTitle={sectionTitle(section) ?? ''}
        role={role}
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
  parent,
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
        parent,
      ),
    [template, section, tabIndex, sectionIndex, sectionId, sheetId, records, pending, role, parent],
  );

  // A repeat block whose removal waits for a GM counts as gone: its "Удалить" is gone, so the focus
  // moves on.
  const instanceIds = useMemo(
    () =>
      blocks.flatMap((block) => {
        const instanceId = blockIdOf(block.block);

        return block.pending.removed || instanceId === null ? [] : [instanceId];
      }),
    [blocks],
  );

  const controls = useRepeatBlocks(sheetId, sectionId, instanceIds, parent);
  const title = sectionTitle(section) ?? templateTitle;

  const body = (
    <Body>
      <Blocks
        template={template}
        tabIndex={tabIndex}
        sectionIndex={sectionIndex}
        section={section}
        sheetId={sheetId}
        records={records}
        pending={pending}
        templateTitle={templateTitle}
        role={role}
        blocks={blocks}
        readOnly={false}
        controls={controls}
        tools={blockTools}
      />
    </Body>
  );

  const add = (
    <Button
      ref={controls.addButton}
      accessibleName={copy.label.addToSection(title)}
      onPress={controls.add}
    >
      {copy.command.add}
    </Button>
  );

  return (
    <>
      {body}
      <div className="mt-1">{add}</div>
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
  template: Template;
  tabIndex: number;
  sectionIndex: number;
  section: PresetSection;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  pending: SheetPending | null;
  templateTitle: string;
  role: 'GM' | 'PLAYER';
  blocks: readonly SheetBlock[];
  readOnly: boolean;
  controls: RepeatBlockControls | undefined;
  tools: BlockTools | null;
};

// The duplicate block is open under one repeat block. `request` grows each time "Дублировать…" is
// pressed, so its field takes the focus again.
type DuplicateAsk = { blockKey: string; request: number };

// Every repeat block in order, each holding all rows of the section. The block's control slot sits
// in its first row.
function Blocks({
  template,
  tabIndex,
  sectionIndex,
  section,
  sheetId,
  records,
  pending,
  templateTitle,
  role,
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
    askedBlock.current = duplicateAsk?.blockKey ?? null;
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
    !blocks.some((block) => blockKeyOf(block.block) === duplicateAsk.blockKey)
  ) {
    setDuplicateAsk(null);
  }

  const duplicateButton = (blockKey: string): RefCallback<HTMLButtonElement> => {
    return (element) => {
      if (element === null) {
        return undefined;
      }

      duplicateButtons.current.set(blockKey, element);

      return () => {
        duplicateButtons.current.delete(blockKey);
      };
    };
  };

  const slotted =
    controls !== undefined || tools !== null || blocks.some((block) => block.pending.rowMarked);

  const columns = section.columns;

  const blockNodes = blocks.map((block, index) => {
    const instanceId = instanceIdOf(block.block);
    const blockKey = blockKeyOf(block.block);
    const markId = `${markPrefix}${instanceId}`;
    const rowMarkId = block.pending.rowMarked ? markId : null;

    const slot = slotted ? (
      <BlockSlot
        block={block}
        index={index}
        controls={controls}
        tools={tools}
        column={columns === undefined ? undefined : columns + 1}
        markId={markId}
        duplicateButton={duplicateButton(blockKey)}
        onDuplicate={() => {
          setDuplicateAsk((current) => ({
            blockKey,
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
        data-row-index={row.sourceIndex}
      >
        <Cells row={row} readOnly={readOnly} rowMarkId={rowMarkId} tools={tools} />
        {rowIndex === 0 ? slot : null}
      </div>
    ));

    const nested = block.nested.map(({ id, section: nestedSection }) =>
      readOnly ? (
        <ReadOnlyRepeatContent
          key={id}
          template={template}
          section={nestedSection}
          tabIndex={tabIndex}
          sectionIndex={sectionIndex}
          sheetId={sheetId}
          records={records}
          pending={pending}
          sectionId={id}
          blockTools={tools}
          tabBlock={null}
          parent={block.block}
          role={role}
        />
      ) : (
        <RepeatContent
          key={id}
          template={template}
          section={nestedSection}
          tabIndex={tabIndex}
          sectionIndex={sectionIndex}
          templateTitle={templateTitle}
          sheetId={sheetId}
          records={records}
          pending={pending}
          sectionId={id}
          blockTools={tools}
          tabBlock={null}
          parent={block.block}
          role={role}
        />
      ),
    );

    const duplicate =
      tools !== null && duplicateAsk?.blockKey === blockKey ? (
        <div
          className={clsx({
            'px-1 pt-1': columns === undefined,
            'col-span-full px-1 pt-1': columns !== undefined,
          })}
        >
          <DuplicateCount
            block={block.block}
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
          mapMarked.has(linkTargetKey({ block: block.block, cellId: cell.id })),
      ),
    );

    return (
      <div
        key={blockKey}
        ref={controls?.blockElement(instanceId)}
        role="group"
        aria-label={onMap ? copy.label.selectedOnMap(name) : name}
        tabIndex={-1}
        className={clsx({
          'col-span-full grid grid-cols-subgrid': columns !== undefined,
          [BLOCK_RULE_CLASS]: index > 0,
          [MAP_MARK_CLASS]: onMap,
        })}
        data-repeat-block={instanceId}
        data-block={blockKey}
      >
        {rows}
        {nested}
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
  const instanceId = instanceIdOf(block.block);

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
  tools = null,
}: {
  row: SheetRow;
  readOnly: boolean;
  rowMarkId: string | null;
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
      tokenTarget={tokenTargetOf(row.dice, cell)}
      tokenTools={tools}
    />
  ));
}

function tokenTargetOf(row: DiceRow, cell: PresetCell): LinkTarget | null {
  if (cell.kind !== 'token') {
    return null;
  }

  return { block: row.block ?? sheetRootAddress(row.sheetId), cellId: cell.id };
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
  const blockValues = tabBlock === null ? null : valuesOfBlock(records, tabBlock.block);

  return section.rows.flatMap((row, index) => {
    if (row.repeat !== undefined || !rowShownTo(role, template, tabIndex, sectionIndex, index)) {
      return [];
    }

    const cells = row.cells;
    const rowId = firstFieldId(row);

    let target: FieldPatchTarget | null =
      tabBlock === null
        ? rowId === null
          ? null
          : { kind: 'row', rowId }
        : { kind: 'rep', block: tabBlock.block };

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
          block: tabBlock?.block ?? null,
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
  parent: BlockAddress,
): SheetBlock[] {
  const fieldIds: ReadonlySet<string> = new Set(sectionFields(section).map((field) => field.id));
  const scopePath = [...scopePathOf(parent), sectionId];
  const scope = repeatScopeByPath(template, scopePath);

  return repeatBlocks(records, parent, sectionId).map((block) => {
    const address = childAddress(parent, sectionId, block.instanceId);

    const nested = section.rows.flatMap((row) => {
      const id = row.repeat?.id;

      if (id === undefined || id === section.repeat?.id) {
        return [];
      }

      const nestedSection = repeatSectionByPath(template, [...scopePath, id]);

      return nestedSection === null ? [] : [{ id, section: nestedSection }];
    });

    const target: FieldPatchTarget = { kind: 'rep', block: address };

    const blockPending = rowPending(pending, patchRecordKey(sheetId, target), fieldIds, true);
    const place = placeOf(records, sheetId, target);

    return {
      block: address,
      name: repeatBlockName(records, address, section),
      nested,
      pending: blockPending,
      rows: section.rows.flatMap((row, rowIndex) => {
        if (row.repeat !== undefined && row.repeat.id !== section.repeat?.id) {
          return [];
        }

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
                  block: address,
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

function valuesOfBlock(
  records: ReadonlyMap<string, VersionedRecord>,
  block: BlockAddress,
): FieldValues {
  const parent = parentOf(block);
  const sectionId = sectionIdOf(block);
  const instanceId = blockIdOf(block);

  if (parent === null || sectionId === null || instanceId === null) {
    return new Map();
  }

  return (
    repeatBlocks(records, parent, sectionId).find(
      (candidate) => candidate.instanceId === instanceId,
    )?.values ?? new Map()
  );
}

function instanceIdOf(block: BlockAddress): string {
  const instanceId = blockIdOf(block);

  if (instanceId === null) {
    throw new Error('A rendered repeat block must name an instance');
  }

  return instanceId;
}
