import clsx from 'clsx';
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';

import { rollDiceCell } from '@/core/dice-roll';
import { blockAddress, blockIdOf, fieldPatchTargetOf, sectionIdOf } from '@/core/block-address';
import { wireCommandOf, type Command, type RollOutcome } from '@/core/ui-messages';
import {
  acceptedFieldValue,
  findPatchField,
  patchRecordKey,
  patchedRecord,
} from '@/core/field-patch';
import { DEFAULT_WINDOW_SIZE, type RenderedTab } from '@/core/preset';
import { newInstanceId } from '@/core/ids';
import { renderedTabs as renderTabs } from '@/core/rendered-tabs';
import { blockPathKey, repDataSchema, recordSchema, type VersionedRecord } from '@/core/records';
import { TIMING } from '@/core/timing';
import { sheetName } from '@/core/sheets';
import { tabShownTo, templateShownTo, visibleRecordMap, type PlayerRole } from '@/core/visibility';
import { copy } from '@/copy';
import { SECONDARY_BUTTON_CLASS } from '@/ui/primitives/button';
import { CellPreviewContext, type CellPreview } from '@/ui/sheet/preset-cell';
import { SheetBody } from '@/ui/sheet/sheet-body';
import { SheetHeader } from '@/ui/sheet/sheet-header';
import type { DiceRolling } from '@/ui/sheet/dice-button';
import { createFieldFlushes, type FieldEditing } from '@/ui/sheet/use-field-edit';
import { createLocalFieldValues } from '@/ui/sheet/local-field-values';
import type { ReplicaClient } from '@/ui/replica-client';
import {
  builderSidebarEntries,
  type SidebarEntries,
  type SidebarSheet,
} from '@/ui/shell/sidebar-entries';
import {
  templateIndexFromKey,
  templateTabKey,
  templateTabLabel,
  WindowFrame,
} from '@/ui/shell/window-frame';
import type { ShellTab } from '@/ui/shell/tab-bar';

import type { BuilderStore } from './builder-store';
import {
  indexPath,
  locate,
  templateOf,
  templateToPreset,
  toPreset,
  uidAt,
  type BuilderDocument,
} from './document';
import { previewRecords, previewSheetName, PREVIEW_SHEET_ID } from './preview-records';
import {
  findSidebarSheet,
  previewNavigationReducer,
  previewSheetNavigationReducer,
  selectedSidebarSheet,
  type PreviewNavigationAction,
  type PreviewNavigationTemplate,
  type PreviewSheetNavigationAction,
  type ShownTab,
} from './preview-navigation';
import { previewEditingReducer } from './preview-editing';
import type { BuilderProblem } from './problems';

type PreviewPaneProps = {
  store: BuilderStore;
  document: BuilderDocument;
  records: readonly VersionedRecord[];
  selection: string | null;
  problems: readonly BuilderProblem[];
};

type PreviewRollOutcome = Exclude<RollOutcome, { code: 'waiting-access' }>;

const CELL_PREVIEW: CellPreview = { placeholders: true };

// The pane's own attribute, which scopes its mark rules.
const PREVIEW_SCOPE = '[data-builder-preview]';

const SELECTED_RULE = 'outline: 2px solid var(--color-accent); outline-offset: 2px;';

const PROBLEM_RULE = 'box-shadow: 0 0 0 2px var(--color-danger-text);';

// The smallest frame the preview draws, so a window size far out of range still shows.
const MIN_FRAME_PX = 120;

// CAP-22, AD-23: the template that holds the selected item, drawn by the window's own sheet
// components in a frame of the preset's window size, on the tab that holds the selected item, else
// on the tab shown before. A click on a cell, row, section, tab or sidebar entry selects its item.
export function PreviewPane({
  store,
  document,
  records: snapshotRecords,
  selection,
  problems,
}: PreviewPaneProps): ReactNode {
  const headingId = useId();
  const area = useRef<HTMLDivElement>(null);
  const areaWidth = useWidth(area);
  const [role, setRole] = useState<PlayerRole>('GM');

  const sourceRecords = useMemo(
    () => new Map(snapshotRecords.map((record) => [record.k, record])),
    [snapshotRecords],
  );

  const preset = useMemo(() => toPreset(document), [document]);

  const records = useMemo(
    () => visibleRecordMap(role, preset, sourceRecords),
    [preset, role, sourceRecords],
  );

  const localValues = useMemo(createLocalFieldValues, []);
  const pageHideFlushes = useMemo(createFieldFlushes, []);

  const [createdTabBlock, setCreatedTabBlock] = useState<{
    sheetId: string;
    scopeId: string;
    instanceId: string;
  } | null>(null);

  const [selectedRenderedTab, setSelectedRenderedTab] = useState<number | null>(null);

  useEffect(() => {
    const flush = (): void => {
      pageHideFlushes.flushAll();
    };

    window.addEventListener('pagehide', flush);

    return () => {
      window.removeEventListener('pagehide', flush);
    };
  }, [pageHideFlushes]);

  const fieldEditing = useMemo<FieldEditing>(
    () => ({
      // SAFETY: the preview sends only field patches; every other command is answered without side
      // effects except local repeat-tab lifecycle, which changes only the builder snapshot.
      sendCommand: ((input: Command) => {
        const command = wireCommandOf(input);

        if (command.type === 'repeat-block-add') {
          const path = command.path ?? [command.sectionId, command.instanceId];
          const key = blockPathKey(command.sheetId, path);
          const prefix = `${key.slice(0, key.lastIndexOf(':'))}:`;

          const blocks = snapshotRecords
            .map((record) => (repDataSchema.safeParse(record.d).success ? record : null))
            .filter((record): record is VersionedRecord => record !== null)
            .filter((record) => record.k.startsWith(prefix));

          const order =
            blocks.reduce((highest, record) => {
              const data = repDataSchema.parse(record.d);

              return Math.max(highest, data.order);
            }, -1) + 1;

          const record = recordSchema.parse({
            k: key,
            d: { order, cells: {} },
            c: 1,
            a: 'builder',
            l: [1, 'builder'],
          });

          store.setSnapshot([...snapshotRecords, record]);
          setCreatedTabBlock({
            sheetId: command.sheetId,
            scopeId: command.sectionId,
            instanceId: command.instanceId,
          });

          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        if (command.type === 'repeat-block-delete') {
          const path = command.path ?? [command.sectionId, command.instanceId];
          const key = blockPathKey(command.sheetId, path);
          const current = snapshotRecords.find((record) => record.k === key);

          if (current !== undefined) {
            store.setSnapshot(
              snapshotRecords.map((record) =>
                record.k === key
                  ? {
                      ...record,
                      d: null,
                      c: record.c + 1,
                      a: 'builder',
                      l: record.l ?? [record.c + 1, 'builder'],
                    }
                  : record,
              ),
            );
          }

          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        if (command.type !== 'field-patch') {
          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        const fieldTemplate = selection === null ? null : templateOf(document, selection);

        const editable = role === 'GM' || fieldTemplate?.players === 'edit';

        if (!editable) {
          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        const layout = fieldTemplate === null ? null : templateToPreset(fieldTemplate);

        const target =
          command.target.kind === 'row'
            ? command.target
            : fieldPatchTargetOf(command.sheetId, command.target);

        const field =
          layout === null || target === null
            ? null
            : findPatchField(layout, target, command.fieldId);

        const value = field === null ? null : acceptedFieldValue(field, command.value);

        if (value === null || !value.ok || target === null) {
          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        const key = patchRecordKey(command.sheetId, target);
        const current = records.get(key);

        const patched = patchedRecord(
          command.sheetId,
          target,
          current,
          command.fieldId,
          value.value,
        );

        if (!patched.ok) {
          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        const next = recordSchema.parse({
          ...patched.value,
          c: (current?.c ?? 0) + 1,
          a: 'builder',
          l: current?.l ?? [(current?.c ?? 0) + 1, 'builder'],
          d: {
            ...patched.value.d,
            cells: {
              ...patched.value.d.cells,
              [command.fieldId]: [value.value, (current?.c ?? 0) + 1, 'builder'],
            },
          },
        });

        const nextRecords = snapshotRecords.some((record) => record.k === key)
          ? snapshotRecords.map((record) => (record.k === key ? next : record))
          : [...snapshotRecords, next];

        store.setSnapshot(nextRecords);

        return Promise.resolve({ kind: 'answered' as const, answer: undefined });
      }) as ReplicaClient['sendCommand'],
      pauseMs: TIMING.fieldSavePauseMs,
      pageHideFlushes,
      localValues,
    }),
    [document, localValues, pageHideFlushes, records, role, selection, snapshotRecords, store],
  );

  const size = document.window ?? DEFAULT_WINDOW_SIZE;
  const width = Math.max(size.width, MIN_FRAME_PX);
  const height = Math.max(size.height, MIN_FRAME_PX);

  const docTemplate =
    (selection === null ? null : templateOf(document, selection)) ?? document.templates[0] ?? null;

  const template = useMemo(
    () => (docTemplate === null ? null : templateToPreset(docTemplate)),
    [docTemplate],
  );

  const rolling = useMemo<DiceRolling>(
    () => ({
      requestRoll: (request) => {
        const result =
          template === null
            ? { ok: false as const, error: { code: 'not-dice' as const } }
            : rollDiceCell(
                template,
                records,
                request.sheetId,
                request.place,
                new Map(Object.entries(request.shown)),
                () => Math.random(),
              );

        const answer: PreviewRollOutcome = result.ok
          ? { code: 'rolled' }
          : result.error.code === 'field'
            ? { code: 'field', field: result.error.field }
            : result.error.code === 'arithmetic'
              ? { code: 'arithmetic' }
              : { code: 'refused' };

        return Promise.resolve({ kind: 'answered' as const, answer });
      },
      localValues,
    }),
    [localValues, records, template],
  );

  const sidebar = useMemo(
    () =>
      builderSidebarEntries(
        preset,
        records,
        document.templates.map((entry) => entry.uid),
        role,
      ),
    [document.templates, preset, records, role],
  );

  const allSidebar = useMemo(
    () =>
      builderSidebarEntries(
        preset,
        sourceRecords,
        document.templates.map((entry) => entry.uid),
      ),
    [document.templates, preset, sourceRecords],
  );

  const [shownSheetId, dispatchSheet] = useReducer(previewSheetNavigationReducer, null);

  const sheetNavigationAction = useMemo<PreviewSheetNavigationAction>(
    () => ({
      type: 'template-changed',
      templateUid: docTemplate?.uid ?? null,
      entries: sidebar,
    }),
    [docTemplate?.uid, sidebar],
  );

  const selectedSheet = selectedSidebarSheet(sidebar, docTemplate?.uid ?? null, shownSheetId);

  const selectedSourceSheet = selectedSidebarSheet(
    allSidebar,
    docTemplate?.uid ?? null,
    shownSheetId,
  );

  const sample = selectedSheet?.sample === true;
  const activeSheetId = selectedSheet?.sheetId ?? null;
  const renderSheetId = sample ? PREVIEW_SHEET_ID : activeSheetId;
  const hiddenTemplate = role === 'PLAYER' && template !== null && !templateShownTo(role, template);

  const renderRecords = useMemo(
    () =>
      template === null
        ? null
        : renderSheetId === null
          ? hiddenTemplate
            ? records
            : null
          : sample
            ? previewRecords(template)
            : records,
    [hiddenTemplate, records, renderSheetId, sample, template],
  );

  const hiddenSheetNote =
    hiddenTemplate && template !== null
      ? copy.builder.hiddenSheet(sheetNameFor(selectedSourceSheet, sourceRecords, preset, template))
      : null;

  const [shownTab, dispatch] = useReducer(previewNavigationReducer, null);
  const [editingUid, dispatchEditing] = useReducer(previewEditingReducer, null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const previewSelection = useRef<string | null>(null);

  const canEdit = role === 'GM' || docTemplate?.players === 'edit';

  useEffect(() => {
    dispatchEditing({ type: 'selection-changed', uid: selection });

    if (previewSelection.current === selection) {
      previewSelection.current = null;
    } else {
      setEditingInstanceId(null);
      setSelectedRenderedTab(null);
    }
  }, [selection]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (
        event.key !== 'Enter' ||
        editingUid !== null ||
        isTextEntryTarget(event.target) ||
        selection === null
      ) {
        return;
      }

      const path = locate(document, selection);

      const cell =
        path?.kind === 'cell'
          ? document.templates[path.template]?.tabs[path.tab]?.sections[path.section]?.rows[
              path.row
            ]?.cells[path.cell]
          : undefined;

      if (cell?.kind !== 'field') {
        return;
      }

      if (
        editingInstanceId !== null &&
        area.current?.querySelector(`[data-repeat-block="${CSS.escape(editingInstanceId)}"]`) ===
          null
      ) {
        setEditingInstanceId(null);

        return;
      }

      event.preventDefault();
      dispatchEditing({ type: 'enter-pressed', uid: selection, editable: canEdit });
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canEdit, document, editingInstanceId, editingUid, selection]);

  const selectedTab = useMemo(
    () => (selection === null ? null : tabIndexOf(document, selection)),
    [document, selection],
  );

  const tabIsShown = useMemo(
    () =>
      (index: number): boolean =>
        template === null || tabShownTo(role, template, index),
    [role, template],
  );

  const visibleRenderedTabs = useMemo(
    () =>
      template === null || renderRecords === null || renderSheetId === null
        ? []
        : renderTabs(template, renderRecords, renderSheetId).filter((candidate) =>
            tabIsShown(candidate.sourceIndex),
          ),
    [renderRecords, renderSheetId, tabIsShown, template],
  );

  const visibleRepeatTabs = useMemo(
    () =>
      template === null || renderSheetId === null
        ? []
        : template.tabs
            .filter(
              (candidate, sourceIndex) => candidate.repeat !== undefined && tabIsShown(sourceIndex),
            )
            .filter(
              (candidate, index, all) =>
                all.findIndex((other) => other.repeat?.id === candidate.repeat?.id) === index,
            ),
    [renderSheetId, tabIsShown, template],
  );

  const navigationTemplate = useMemo<PreviewNavigationTemplate | null>(
    () =>
      docTemplate === null || template === null ? null : { uid: docTemplate.uid, ...template },
    [docTemplate, template],
  );

  const navigationAction = useMemo<PreviewNavigationAction>(
    () => ({
      type: 'selection-changed',
      template: navigationTemplate,
      selectedTab,
      tabShown: tabIsShown,
    }),
    [navigationTemplate, selectedTab, tabIsShown],
  );

  const nextShownTab = previewNavigationReducer(shownTab, navigationAction);

  useEffect(() => {
    dispatch(navigationAction);
  }, [navigationAction]);

  useEffect(() => {
    dispatchSheet(sheetNavigationAction);
  }, [sheetNavigationAction]);

  const templateUid = docTemplate?.uid ?? null;

  const fallbackRenderedIndex =
    nextShownTab === null
      ? -1
      : visibleRenderedTabs.findIndex((candidate) => candidate.sourceIndex === nextShownTab.tab);

  const openRenderedIndex =
    selectedRenderedTab !== null && visibleRenderedTabs[selectedRenderedTab] !== undefined
      ? selectedRenderedTab
      : fallbackRenderedIndex === -1
        ? null
        : fallbackRenderedIndex;

  const openRenderedTab =
    openRenderedIndex === null ? null : (visibleRenderedTabs[openRenderedIndex] ?? null);

  const openTab = openRenderedTab?.sourceIndex ?? null;

  useEffect(() => {
    if (createdTabBlock === null) return;

    const index = visibleRenderedTabs.findIndex(
      (candidate) =>
        candidate.block !== null &&
        sectionIdOf(candidate.block.block) === createdTabBlock.scopeId &&
        blockIdOf(candidate.block.block) === createdTabBlock.instanceId,
    );

    if (index === -1) return;

    setSelectedRenderedTab(index);
    setCreatedTabBlock(null);
  }, [createdTabBlock, visibleRenderedTabs]);

  const scale = areaWidth === null ? 1 : Math.min(1, areaWidth / width);

  const tabs: ShellTab[] = visibleRenderedTabs
    .map((rendered, index): ShellTab => ({
      id: templateTabKey(index),
      label:
        rendered.block === null
          ? templateTabLabel(rendered.tab.title)
          : rendered.block.name === ''
            ? copy.unnamedBlock(rendered.blockIndex ?? index + 1)
            : rendered.block.name,
      dataTabIndex: index,
      sourceTabIndex: rendered.sourceIndex,
    }))
    .concat(
      role === 'GM'
        ? visibleRepeatTabs.map((candidate) => ({
            id: `template-tab-add:${candidate.repeat?.id ?? ''}`,
            label: copy.addTab,
            addScopeId: candidate.repeat?.id ?? '',
            addScopeTitle:
              visibleRepeatTabs.length > 1 ? templateTabLabel(candidate.title) : undefined,
          }))
        : [],
    );

  const activeEditingUid = canEdit && editingUid === selection ? editingUid : null;

  const preview = useMemo<CellPreview>(
    () => ({
      placeholders: true,
      editableCell:
        activeEditingUid === null
          ? null
          : previewCellKey(document, activeEditingUid, templateUid, openTab, editingInstanceId),
      onEscape: () => {
        dispatchEditing({ type: 'escape-pressed' });
      },
    }),
    [activeEditingUid, document, editingInstanceId, openTab, templateUid],
  );

  const header =
    template === null || renderRecords === null || renderSheetId === null ? null : (
      <PreviewHeader
        sheetId={renderSheetId}
        name={sheetNameFor(selectedSheet, records, preset, template)}
        records={renderRecords}
      />
    );

  const content =
    template === null || renderRecords === null || renderSheetId === null ? null : (
      <PreviewBody
        template={template}
        sheetId={renderSheetId}
        records={renderRecords}
        openTab={openTab}
        editing={activeEditingUid === null ? null : fieldEditing}
        tabBlockEditing={canEdit ? { sendCommand: fieldEditing.sendCommand } : null}
        renderedTab={openRenderedTab}
        role={role}
        rolling={rolling}
        preview={preview}
      />
    );

  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    if (docTemplate === null || openTab === null || !(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest('[data-sidebar-entry]') !== null) {
      return;
    }

    if (editingUid === selection && event.target.closest('input, select, textarea') !== null) {
      return;
    }

    const uid = clickedUid(document, docTemplate.uid, openTab, event.target);

    if (uid === null) {
      return;
    }

    const cellTarget = event.target.closest('[data-cell]');
    const selected = selection === uid;
    const path = locate(document, uid);

    const cell =
      path?.kind === 'cell'
        ? document.templates[path.template]?.tabs[path.tab]?.sections[path.section]?.rows[path.row]
            ?.cells[path.cell]
        : undefined;

    const editable = !sample && cell?.kind === 'field' && canEdit;

    if (!selected) {
      previewSelection.current = uid;
      store.select(uid);
      setEditingInstanceId(repeatBlockId(event.target));
      dispatchEditing({ type: 'cell-clicked', uid, selected: false, editable });

      if (cellTarget !== null) {
        event.stopPropagation();
      }

      return;
    }

    if (cell?.kind === 'field') {
      setEditingInstanceId(repeatBlockId(event.target));
      dispatchEditing({ type: 'cell-clicked', uid, selected: true, editable });

      if (cellTarget !== null) {
        event.stopPropagation();
      }
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-2"
      data-builder-preview
    >
      <h2 id={headingId} className="text-section-heading">
        {copy.builder.preview(size.width, size.height)}
      </h2>
      <style>
        {markRules(
          document,
          sidebar,
          templateUid,
          selectedSheet?.id ?? null,
          openTab ?? 0,
          selection,
          problems,
        )}
      </style>
      <div ref={area} className="min-w-0">
        {docTemplate === null || template === null ? (
          <p className="text-text-muted">{copy.builder.emptyPreset}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <PreviewRoleSwitch role={role} onRole={setRole} />
            {renderRecords === null ? (
              <p className="text-text-muted">{copy.builder.emptyPreset}</p>
            ) : (
              <div style={{ width: width * scale, height: height * scale }}>
                <div
                  className="origin-top-left overflow-clip rounded-window bg-surface text-body text-text"
                  style={{ width, height, transform: scale === 1 ? undefined : `scale(${scale})` }}
                  onClickCapture={handleClick}
                  data-preview-frame
                >
                  <WindowFrame
                    layout={{
                      sidebar,
                      selectedSidebarEntry: selectedSheet?.id ?? '',
                      onSelectSidebarEntry: (id) => {
                        const entry = findSidebarSheet(sidebar, id);

                        if (entry === null) {
                          return;
                        }

                        dispatchSheet({ type: 'sheet-selected', sheetId: entry.sheetId });

                        if (entry.templateUid !== undefined) {
                          store.select(entry.templateUid);
                        }
                      },
                      onAddSidebarEntry:
                        role === 'GM' ? (setId) => store.addSheet(setId) : undefined,
                      tabs,
                      selectedTab:
                        openRenderedIndex === null ? null : templateTabKey(openRenderedIndex),
                      onSelectTab: (id) => {
                        if (id.startsWith('template-tab-add:')) {
                          const scopeId = id.slice('template-tab-add:'.length);
                          const instanceId = newInstanceId();
                          const block = blockAddress(renderSheetId ?? '', [scopeId, instanceId]);

                          if (block === null) {
                            return;
                          }

                          setCreatedTabBlock({
                            sheetId: renderSheetId ?? '',
                            scopeId,
                            instanceId,
                          });
                          void fieldEditing
                            .sendCommand({
                              type: 'repeat-block-add',
                              sheetId: renderSheetId ?? '',
                              block,
                            })
                            .catch((error) => {
                              console.error('Muster Roll preview could not add a tab block', error);
                              setCreatedTabBlock(null);
                            });

                          return;
                        }

                        const index = templateIndexFromKey(id);
                        const rendered = index === null ? undefined : visibleRenderedTabs[index];

                        const uid =
                          rendered === undefined
                            ? null
                            : uidAt(document, [
                                templateIndexOf(document, docTemplate.uid),
                                rendered.sourceIndex,
                              ]);

                        if (uid !== null) {
                          previewSelection.current = uid;
                          setSelectedRenderedTab(index);
                          store.select(uid);
                        }
                      },
                      header: hiddenSheetNote === null ? header : null,
                      content: hiddenSheetNote === null ? content : <p>{hiddenSheetNote}</p>,
                      frameClassName: 'h-full',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewRoleSwitch({
  role,
  onRole,
}: {
  role: PlayerRole;
  onRole: (role: PlayerRole) => void;
}): ReactNode {
  return (
    <div
      role="group"
      aria-label={copy.builder.previewRole}
      className="flex flex-wrap items-center gap-1"
    >
      <AriaButton
        className={clsx(SECONDARY_BUTTON_CLASS, role === 'GM' && 'bg-fill-strong')}
        aria-pressed={role === 'GM'}
        onPress={() => {
          onRole('GM');
        }}
      >
        {copy.builder.previewGm}
      </AriaButton>
      <AriaButton
        className={clsx(SECONDARY_BUTTON_CLASS, role === 'PLAYER' && 'bg-fill-strong')}
        aria-pressed={role === 'PLAYER'}
        onPress={() => {
          onRole('PLAYER');
        }}
      >
        {copy.builder.previewPlayer}
      </AriaButton>
    </div>
  );
}

function sheetNameFor(
  selected: SidebarSheet | null,
  records: ReadonlyMap<string, VersionedRecord>,
  preset: ReturnType<typeof toPreset>,
  template: ReturnType<typeof templateToPreset>,
): string {
  if (selected?.sample === true) {
    return copy.builder.previewSample;
  }

  return selected === null
    ? previewSheetName(template)
    : (sheetName(records, preset, selected.sheetId) ?? previewSheetName(template));
}

function previewCellKey(
  document: BuilderDocument,
  uid: string,
  templateUid: string | null,
  openTab: number | null,
  instanceId: string | null,
): string | null {
  const path = locate(document, uid);

  if (
    path?.kind !== 'cell' ||
    document.templates[path.template]?.uid !== templateUid ||
    path.tab !== openTab
  ) {
    return null;
  }

  return `${path.tab}.${path.section}.${path.row}.${path.cell}.${instanceId ?? ''}`;
}

function repeatBlockId(target: Element): string | null {
  return target.closest('[data-repeat-block]')?.getAttribute('data-repeat-block') ?? null;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (target instanceof HTMLInputElement) {
    return true;
  }

  return target instanceof HTMLElement && target.isContentEditable;
}

function noop(): void {
  // The preview focuses no name.
}

function PreviewHeader({
  sheetId,
  name,
  records,
}: {
  sheetId: string;
  name: string;
  records: ReadonlyMap<string, VersionedRecord>;
}): ReactNode {
  return (
    <CellPreviewContext value={CELL_PREVIEW}>
      <SheetHeader
        sheetId={sheetId}
        name={name}
        nameField={null}
        records={records}
        editing={null}
        status={null}
        gm={null}
        focusName={false}
        onNameFocused={noop}
      />
    </CellPreviewContext>
  );
}

function PreviewBody({
  template,
  sheetId,
  records,
  openTab,
  renderedTab,
  editing,
  tabBlockEditing,
  role,
  rolling,
  preview,
}: {
  template: ReturnType<typeof templateToPreset>;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  openTab: number | null;
  renderedTab: RenderedTab | null;
  editing: FieldEditing | null;
  tabBlockEditing: Pick<FieldEditing, 'sendCommand'> | null;
  role: PlayerRole;
  rolling: DiceRolling;
  preview: CellPreview;
}): ReactNode {
  return (
    <CellPreviewContext value={preview}>
      <SheetBody
        template={template}
        sheetId={sheetId}
        openTab={openTab}
        renderedTab={renderedTab}
        records={records}
        editing={editing}
        tabBlockEditing={tabBlockEditing}
        role={role}
        rolling={rolling}
        pending={null}
      />
    </CellPreviewContext>
  );
}

// The template and tab that hold an item, `null` for the window, a template or an unknown uid.
function tabIndexOf(document: BuilderDocument, uid: string): ShownTab | null {
  const path = locate(document, uid);

  if (path === null || path.kind === 'window' || path.kind === 'template') {
    return null;
  }

  const template = document.templates[path.template];

  return template === undefined ? null : { template: template.uid, tab: path.tab };
}

function templateIndexOf(document: BuilderDocument, templateUid: string): number {
  return document.templates.findIndex((template) => template.uid === templateUid);
}

// The item a click in the frame lands on: an inner tab, a cell, row, section or field of the shown
// template. Sidebar clicks are handled by WindowFrame itself.
function clickedUid(
  document: BuilderDocument,
  templateUid: string,
  openTab: number,
  target: Element,
): string | null {
  const templateIndex = templateIndexOf(document, templateUid);
  const templateTab = target.closest('[role="tab"][data-tab-index]');

  if (templateTab !== null) {
    const sourceIndex = Number(
      templateTab.getAttribute('data-source-tab-index') ??
        templateTab.getAttribute('data-tab-index'),
    );

    return uidAt(document, [templateIndex, sourceIndex]);
  }

  const cell = target.closest('[data-cell]')?.getAttribute('data-cell');

  if (cell !== undefined && cell !== null) {
    return uidAt(document, [templateIndex, ...cell.split('.').map(Number)]);
  }

  const section = target.closest('[data-section-index]')?.getAttribute('data-section-index');
  const row = target.closest('[data-row-index]')?.getAttribute('data-row-index');

  if (section === undefined || section === null) {
    return null;
  }

  const path = [templateIndex, openTab, Number(section)];

  return uidAt(document, row === undefined || row === null ? path : [...path, Number(row)]);
}

// The selection and problem marks of the shown template, as one scoped style sheet, so the sheet
// components stay as the window draws them.
function markRules(
  document: BuilderDocument,
  sidebar: SidebarEntries,
  templateUid: string | null,
  selectedSidebarId: string | null,
  openTab: number,
  selection: string | null,
  problems: readonly BuilderProblem[],
): string {
  if (templateUid === null) {
    return '';
  }

  const rules: string[] = [];

  const selector =
    selection === null
      ? null
      : markSelector(document, sidebar, templateUid, selectedSidebarId, openTab, selection);

  if (selector !== null) {
    rules.push(`${selector} { ${SELECTED_RULE} }`);
  }

  for (const problem of problems) {
    const problemSelector = markSelector(
      document,
      sidebar,
      templateUid,
      selectedSidebarId,
      openTab,
      problem.uid,
    );

    if (problemSelector !== null) {
      rules.push(`${problemSelector} { ${PROBLEM_RULE} }`);
    }
  }

  return rules.join('\n');
}

// An item of another tab is not drawn, so it gets no mark. A tab's mark sits on its tab in the tab
// row, which a template with one tab does not draw.
function markSelector(
  document: BuilderDocument,
  sidebar: SidebarEntries,
  templateUid: string,
  selectedSidebarId: string | null,
  openTab: number,
  uid: string,
): string | null {
  const path = locate(document, uid);

  if (path === null || path.kind === 'window') {
    return null;
  }

  const scope = PREVIEW_SCOPE;

  if (path.kind === 'template') {
    const targetTemplateUid = document.templates[path.template]?.uid;

    if (targetTemplateUid === undefined) {
      return null;
    }

    const entryId = sidebarEntryId(
      sidebar,
      targetTemplateUid,
      targetTemplateUid === templateUid ? selectedSidebarId : null,
    );

    return entryId === null
      ? null
      : `${scope} [data-sidebar-entry][data-key="${CSS.escape(entryId)}"]`;
  }

  if (document.templates[path.template]?.uid !== templateUid) {
    return null;
  }

  const [, tab, section, row, cell] = indexPath(path);

  if (path.kind === 'tab') {
    return `${scope} [role="tab"][data-frame-tab][data-tab-index="${tab}"]`;
  }

  if (tab !== openTab) {
    return null;
  }

  const sectionSelector = `${scope} [data-sheet-body] [data-section-index="${section}"]`;

  if (path.kind === 'section') {
    return sectionSelector;
  }

  if (path.kind === 'row') {
    return `${sectionSelector} [data-row-index="${row}"]`;
  }

  return `${sectionSelector} [data-cell="${tab}.${section}.${row}.${cell}"] > *`;
}

function sidebarEntryId(
  sidebar: SidebarEntries,
  templateUid: string,
  preferredId: string | null,
): string | null {
  const sheets = sidebar.sections.flatMap((section) =>
    section.kind === 'single' ? [section.sheet] : section.sheets,
  );

  return (
    sheets.find((sheet) => sheet.templateUid === templateUid && sheet.id === preferredId)?.id ??
    sheets.find((sheet) => sheet.templateUid === templateUid)?.id ??
    null
  );
}

// The width of an element, followed as the page resizes, so the frame scales down to fit.
function useWidth(element: { current: HTMLElement | null }): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const target = element.current;

    if (target === null) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setWidth(target.clientWidth);
    });

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return width;
}
