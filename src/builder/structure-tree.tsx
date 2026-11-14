import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  DropIndicator,
  Tree,
  TreeItem,
  TreeItemContent,
  useDragAndDrop,
  type DragTypes,
  type DropTarget,
} from 'react-aria-components';

import { copy } from '@/copy';

import type { BuilderStore } from './builder-store';
import {
  acceptsDrop,
  addCell,
  addRow,
  addSection,
  addTab,
  addTemplate,
  ancestorUids,
  locate,
  moveItem,
  PRESET_UID,
  WINDOW_UID,
  type BuilderDocument,
  type CellKind,
  type DocCell,
  type DocRow,
  type DocSection,
  type DocTab,
  type DocTemplate,
  type DropSpot,
  type ItemKind,
} from './document';
import type { BuilderProblem } from './problems';

// The counter asks the tree to move the focus to an item. `count` grows with each press.
export type FocusRequest = { uid: string; count: number };

type StructureTreeProps = {
  store: BuilderStore;
  document: BuilderDocument;
  selection: string | null;
  problems: readonly BuilderProblem[];
  focusRequest: FocusRequest | null;
};

// An add item's key names what it adds and where: `add:set`, `add:single`, `add:tab:{uid}`,
// `add:section:{uid}`, `add:row:{uid}`, or `add:{cell kind}:{uid}`. Uids hold no ":".
const ADD_PREFIX = 'add:';
const ADD_SET_KEY = 'add:set';
const ADD_SINGLE_KEY = 'add:single';

const DRAG_TYPE_PREFIX = 'application/x-muster-roll-';

// The window and the add items cannot move. Their drag type is accepted nowhere.
const FIXED_DRAG_TYPE = `${DRAG_TYPE_PREFIX}fixed`;

const MOVABLE_KINDS: readonly ItemKind[] = ['template', 'tab', 'section', 'row', 'cell'];

const ITEM_CLASS =
  'touch-target flex cursor-default items-center rounded-sm text-text outline-none data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:outline-focus data-selected:bg-surface-tab data-dragging:opacity-50 data-drop-target:bg-surface-tab';

const ADD_ITEM_CLASS =
  'touch-target flex cursor-default items-center rounded-sm text-accent outline-none data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:outline-focus';

const ICON_BUTTON_CLASS =
  'inline-flex size-[24px] shrink-0 items-center justify-center rounded-sm text-text-muted';

const INDENT_PX = 16;

// CAP-22, AD-25: the preset as a tree. The window first, then each template with its tabs,
// sections, rows and cells, each container closed by its add items. Every template shows its tab
// level, a one-tab template too, so a drop into a tab is always reachable. Reorder is by drag only.
export function StructureTree({
  store,
  document,
  selection,
  problems,
  focusRequest,
}: StructureTreeProps): ReactNode {
  const treeRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [shownSelection, setShownSelection] = useState(selection);
  const problemUids = new Set(problems.map((problem) => problem.uid));

  // A newly selected item is never hidden in a collapsed container.
  if (shownSelection !== selection) {
    setShownSelection(selection);

    const ancestors = selection === null ? [] : ancestorUids(document, selection).slice(1);

    if (ancestors.some((uid) => collapsed.has(uid))) {
      setCollapsed(new Set([...collapsed].filter((uid) => !ancestors.includes(uid))));
    }
  }

  useEffect(() => {
    if (focusRequest === null) {
      return;
    }

    const key = focusRequest.uid === PRESET_UID ? ADD_SET_KEY : focusRequest.uid;

    treeRef.current
      ?.querySelector<HTMLElement>(`[role="row"][data-key="${CSS.escape(key)}"]`)
      ?.focus();
  }, [focusRequest]);

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => {
      const current = store.$state.get().step.document;

      return [...keys].map((key) => ({ [dragTypeOf(current, String(key))]: String(key) }));
    },
    getDropOperation: (target, types) => {
      const kind = draggedKind(types);
      const current = store.$state.get().step.document;

      return kind !== null && dropSpotOf(current, target, kind) !== null ? 'move' : 'cancel';
    },
    onMove: (event) => {
      const current = store.$state.get().step.document;
      const key = [...event.keys][0];
      const path = key === undefined ? null : locate(current, String(key));

      if (key === undefined || path === null) {
        return;
      }

      const spot = dropSpotOf(current, event.target, path.kind);

      if (spot !== null) {
        store.edit((next) => moveItem(next, String(key), spot));
      }
    },
    renderDropIndicator: (target) => (
      <DropIndicator target={target} className="h-[2px] rounded-full data-drop-target:bg-accent" />
    ),
  });

  const expanded = new Set(containerUids(document).filter((uid) => !collapsed.has(uid)));
  const addKeys = allAddKeys(document);

  function add(key: string): void {
    store.edit((current) => addFromKey(current, key));
  }

  return (
    <Tree
      ref={treeRef}
      aria-label={copy.builder.structure}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={selection === null ? [] : [selection]}
      onSelectionChange={(keys) => {
        if (keys !== 'all') {
          const key = [...keys][0];

          if (key !== undefined) {
            store.select(String(key));
          }
        }
      }}
      disabledKeys={addKeys}
      disabledBehavior="selection"
      expandedKeys={expanded}
      onExpandedChange={(keys) => {
        const open = new Set([...keys].map(String));
        const closed = containerUids(document).filter((uid) => !open.has(uid));

        setCollapsed(new Set(closed));

        // The outermost container closed over the selection takes the selection. The containers
        // come nearest first.
        let hidden: string | null = null;

        for (const uid of selection === null ? [] : ancestorUids(document, selection).slice(1)) {
          if (closed.includes(uid)) {
            hidden = uid;
          }
        }

        if (hidden !== null) {
          store.select(hidden);
        }
      }}
      dragAndDropHooks={dragAndDropHooks}
      className="flex max-h-[50vh] flex-col overflow-auto"
      data-builder-tree
    >
      <Item
        uid={WINDOW_UID}
        label={copy.builder.windowItem(
          document.window?.width ?? DEFAULT_WIDTH,
          document.window?.height ?? DEFAULT_HEIGHT,
        )}
        problem={problemUids.has(WINDOW_UID)}
        movable={false}
      />
      {document.templates.map((template) => (
        <TemplateItem key={template.uid} template={template} problems={problemUids} onAdd={add} />
      ))}
      <AddItem addKey={ADD_SET_KEY} label={copy.builder.addSet} onAdd={add} />
      <AddItem addKey={ADD_SINGLE_KEY} label={copy.builder.addSingle} onAdd={add} />
    </Tree>
  );
}

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 600;

type ItemProps = {
  uid: string;
  label: string;
  problem: boolean;
  movable: boolean;
  children?: ReactNode;
};

function Item({ uid, label, problem, movable, children }: ItemProps): ReactNode {
  return (
    <TreeItem id={uid} textValue={label} className={ITEM_CLASS} data-problem={problem || undefined}>
      <TreeItemContent>
        {({ hasChildItems, isExpanded, level }) => (
          <div
            className="flex min-w-0 flex-1 items-center gap-1 pr-1"
            style={{ paddingInlineStart: (level - 1) * INDENT_PX }}
          >
            {hasChildItems ? (
              <Button
                slot="chevron"
                aria-label={copy.builder.expand(label)}
                className={ICON_BUTTON_CLASS}
              >
                {isExpanded ? '▾' : '▸'}
              </Button>
            ) : (
              <span className="size-[24px] shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {problem ? (
              <span className="shrink-0 text-danger-text">
                <span aria-hidden>!</span>
                <span className="sr-only">{copy.builder.problemMark}</span>
              </span>
            ) : null}
            {movable ? (
              <Button
                slot="drag"
                aria-label={copy.builder.dragHandle(label)}
                className={ICON_BUTTON_CLASS}
              >
                ⠿
              </Button>
            ) : (
              <FixedDragSlot />
            )}
          </div>
        )}
      </TreeItemContent>
      {children}
    </TreeItem>
  );
}

function AddItem({
  addKey,
  label,
  onAdd,
}: {
  addKey: string;
  label: string;
  onAdd: (key: string) => void;
}): ReactNode {
  return (
    <TreeItem
      id={addKey}
      textValue={label}
      className={ADD_ITEM_CLASS}
      onAction={() => {
        onAdd(addKey);
      }}
    >
      <TreeItemContent>
        {({ level }) => (
          <div
            className="flex items-center gap-1"
            style={{ paddingInlineStart: (level - 1) * INDENT_PX }}
          >
            <span className="w-[24px] shrink-0 text-center" aria-hidden>
              +
            </span>
            {label}
            <FixedDragSlot />
          </div>
        )}
      </TreeItemContent>
    </TreeItem>
  );
}

// React Aria expects a drag button in every item of a tree that drags. The window and the add items
// never move, as no drop accepts them, so theirs is never shown.
function FixedDragSlot(): ReactNode {
  return <Button slot="drag" className="hidden" excludeFromTabOrder aria-hidden />;
}

type ContainerProps = { problems: ReadonlySet<string>; onAdd: (key: string) => void };

function TemplateItem({
  template,
  problems,
  onAdd,
}: ContainerProps & { template: DocTemplate }): ReactNode {
  const kind = template.kind === 'set' ? copy.builder.form.kindSet : copy.builder.form.kindSingle;
  const title = template.title.trim() === '' ? copy.builder.untitled : template.title;

  return (
    <Item
      uid={template.uid}
      label={copy.builder.templateItem(title, kind)}
      problem={problems.has(template.uid)}
      movable
    >
      {template.tabs.map((tab) => (
        <TabItem key={tab.uid} tab={tab} problems={problems} onAdd={onAdd} />
      ))}
      <AddItem
        addKey={`${ADD_PREFIX}tab:${template.uid}`}
        label={copy.builder.addTab}
        onAdd={onAdd}
      />
    </Item>
  );
}

function TabItem({ tab, problems, onAdd }: ContainerProps & { tab: DocTab }): ReactNode {
  const title =
    tab.title === undefined || tab.title.trim() === '' ? copy.builder.untitledTab : tab.title;

  return (
    <Item uid={tab.uid} label={title} problem={problems.has(tab.uid)} movable>
      {tab.sections.map((section) => (
        <SectionItem key={section.uid} section={section} problems={problems} onAdd={onAdd} />
      ))}
      <AddItem
        addKey={`${ADD_PREFIX}section:${tab.uid}`}
        label={copy.builder.addSection}
        onAdd={onAdd}
      />
    </Item>
  );
}

function SectionItem({
  section,
  problems,
  onAdd,
}: ContainerProps & { section: DocSection }): ReactNode {
  const title =
    section.title === undefined || section.title.trim() === ''
      ? copy.builder.untitledSection
      : section.title;

  return (
    <Item uid={section.uid} label={title} problem={problems.has(section.uid)} movable>
      {section.rows.map((row, index) => (
        <RowItem key={row.uid} row={row} index={index} problems={problems} onAdd={onAdd} />
      ))}
      <AddItem
        addKey={`${ADD_PREFIX}row:${section.uid}`}
        label={copy.builder.addRow}
        onAdd={onAdd}
      />
    </Item>
  );
}

function RowItem({
  row,
  index,
  problems,
  onAdd,
}: ContainerProps & { row: DocRow; index: number }): ReactNode {
  return (
    <Item
      uid={row.uid}
      label={copy.builder.rowItem(index + 1)}
      problem={problems.has(row.uid)}
      movable
    >
      {row.cells.map((cell) => (
        <Item
          key={cell.uid}
          uid={cell.uid}
          label={cellItemLabel(cell)}
          problem={problems.has(cell.uid)}
          movable
        />
      ))}
      <AddItem
        addKey={`${ADD_PREFIX}text:${row.uid}`}
        label={copy.builder.addLabel}
        onAdd={onAdd}
      />
      <AddItem
        addKey={`${ADD_PREFIX}field:${row.uid}`}
        label={copy.builder.addField}
        onAdd={onAdd}
      />
      <AddItem addKey={`${ADD_PREFIX}dice:${row.uid}`} label={copy.builder.addDice} onAdd={onAdd} />
    </Item>
  );
}

const FIELD_TYPE_NAMES = {
  text: copy.builder.form.typeText,
  number: copy.builder.form.typeNumber,
  check: copy.builder.form.typeCheck,
  select: copy.builder.form.typeSelect,
  'dice-choice': copy.builder.form.typeDiceChoice,
} as const;

// A label shows its text, a field its id and type, a dice cell its formula.
export function cellItemLabel(cell: DocCell): string {
  if (cell.kind === 'text') {
    return cell.text.trim() === '' ? copy.builder.emptyText : cell.text;
  }

  if (cell.kind === 'field') {
    return copy.builder.fieldItem(cell.id, FIELD_TYPE_NAMES[cell.type]);
  }

  return cell.formula.trim() === '' ? copy.builder.emptyFormula : cell.formula;
}

function containerUids(document: BuilderDocument): string[] {
  return document.templates.flatMap((template) => [
    template.uid,
    ...template.tabs.flatMap((tab) => [
      tab.uid,
      ...tab.sections.flatMap((section) => [section.uid, ...section.rows.map((row) => row.uid)]),
    ]),
  ]);
}

function allAddKeys(document: BuilderDocument): string[] {
  return [
    ADD_SET_KEY,
    ADD_SINGLE_KEY,
    ...document.templates.flatMap((template) => [
      `${ADD_PREFIX}tab:${template.uid}`,
      ...template.tabs.flatMap((tab) => [
        `${ADD_PREFIX}section:${tab.uid}`,
        ...tab.sections.flatMap((section) => [
          `${ADD_PREFIX}row:${section.uid}`,
          ...section.rows.flatMap((row) =>
            (['text', 'field', 'dice'] as const).map((kind) => `${ADD_PREFIX}${kind}:${row.uid}`),
          ),
        ]),
      ]),
    ]),
  ];
}

// An add item's target: what it adds, and the container it adds into.
type AddTarget = {
  adds: 'set' | 'single' | 'tab' | 'section' | 'row' | CellKind;
  container: string | null;
};

function parseAddKey(key: string): AddTarget | null {
  if (!key.startsWith(ADD_PREFIX)) {
    return null;
  }

  const [adds = '', container = null] = key.slice(ADD_PREFIX.length).split(':');

  switch (adds) {
    case 'set':
    case 'single':
    case 'tab':
    case 'section':
    case 'row':
    case 'text':
    case 'field':
    case 'dice':
      return { adds, container };
    default:
      return null;
  }
}

function addFromKey(document: BuilderDocument, key: string): ReturnType<typeof addSection> {
  const target = parseAddKey(key);

  if (target === null) {
    return null;
  }

  if (target.adds === 'set' || target.adds === 'single') {
    return addTemplate(document, target.adds);
  }

  if (target.container === null) {
    return null;
  }

  if (target.adds === 'tab') {
    return addTab(document, target.container);
  }

  if (target.adds === 'section') {
    return addSection(document, target.container);
  }

  if (target.adds === 'row') {
    return addRow(document, target.container);
  }

  return addCell(document, target.container, target.adds);
}

function dragTypeOf(document: BuilderDocument, key: string): string {
  const kind = locate(document, key)?.kind;

  return kind === undefined || kind === 'window' ? FIXED_DRAG_TYPE : `${DRAG_TYPE_PREFIX}${kind}`;
}

function draggedKind(types: DragTypes): ItemKind | null {
  return MOVABLE_KINDS.find((kind) => types.has(`${DRAG_TYPE_PREFIX}${kind}`)) ?? null;
}

// The kind of item an add item's container holds.
const ADDED_KIND: Readonly<Record<AddTarget['adds'], ItemKind>> = {
  set: 'template',
  single: 'template',
  tab: 'tab',
  section: 'section',
  row: 'row',
  text: 'cell',
  field: 'cell',
  dice: 'cell',
};

// Where a drop lands, or `null` for a drop the preset form refuses. A drop before an add item lands
// at the end of its container. A drop on a container lands at its end.
function dropSpotOf(
  document: BuilderDocument,
  target: DropTarget,
  kind: ItemKind,
): DropSpot | null {
  if (target.type === 'root') {
    return null;
  }

  const key = String(target.key);
  const add = parseAddKey(key);
  let spot: DropSpot | null;

  if (add !== null) {
    spot =
      target.dropPosition === 'before' && ADDED_KIND[add.adds] === kind
        ? { place: 'into', parent: add.container }
        : null;
  } else if (target.dropPosition === 'on') {
    spot = { place: 'into', parent: key };
  } else {
    spot = { place: target.dropPosition, sibling: key };
  }

  return spot !== null && acceptsDrop(document, kind, spot) ? spot : null;
}
