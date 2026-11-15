import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { rollDiceCell } from '@/core/dice-roll';
import type { Command, RollOutcome } from '@/core/ui-messages';
import {
  acceptedFieldValue,
  findPatchField,
  patchRecordKey,
  patchedRecord,
} from '@/core/field-patch';
import { DEFAULT_WINDOW_SIZE } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { TIMING } from '@/core/timing';
import { sheetName } from '@/core/sheets';
import { copy } from '@/copy';
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

  const records = useMemo(
    () => new Map(snapshotRecords.map((record) => [record.k, record])),
    [snapshotRecords],
  );

  const preset = useMemo(() => toPreset(document), [document]);
  const localValues = useMemo(createLocalFieldValues, []);
  const pageHideFlushes = useMemo(createFieldFlushes, []);

  const fieldEditing = useMemo<FieldEditing>(
    () => ({
      // SAFETY: the preview sends only field patches; every other command is answered without side
      // effects, and field patches always have an undefined answer.
      sendCommand: ((command: Command) => {
        if (command.type !== 'field-patch') {
          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        const fieldTemplate = selection === null ? null : templateOf(document, selection);
        const layout = fieldTemplate === null ? null : templateToPreset(fieldTemplate);

        const field =
          layout === null ? null : findPatchField(layout, command.target, command.fieldId);

        const value = field === null ? null : acceptedFieldValue(field, command.value);

        if (value === null || !value.ok) {
          return Promise.resolve({ kind: 'answered' as const, answer: undefined });
        }

        const key = patchRecordKey(command.sheetId, command.target);
        const current = records.get(key);

        const patched = patchedRecord(
          command.sheetId,
          command.target,
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
    [document, localValues, pageHideFlushes, records, selection, snapshotRecords, store],
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
        document.templates.map((template) => template.uid),
      ),
    [document.templates, preset, records],
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

  const sample = selectedSheet?.sample === true;
  const activeSheetId = selectedSheet?.sheetId ?? null;
  const renderSheetId = sample ? PREVIEW_SHEET_ID : activeSheetId;

  const renderRecords = useMemo(
    () =>
      template === null || renderSheetId === null
        ? null
        : sample
          ? previewRecords(template)
          : records,
    [records, renderSheetId, sample, template],
  );

  const [shownTab, dispatch] = useReducer(previewNavigationReducer, null);
  const [editingUid, dispatchEditing] = useReducer(previewEditingReducer, null);

  useEffect(() => {
    dispatchEditing({ type: 'selection-changed', uid: selection });
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

      event.preventDefault();
      dispatchEditing({ type: 'enter-pressed', uid: selection, editable: true });
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [document, editingUid, selection]);

  const selectedTab = useMemo(
    () => (selection === null ? null : tabIndexOf(document, selection)),
    [document, selection],
  );

  const navigationTemplate = useMemo<PreviewNavigationTemplate | null>(
    () =>
      docTemplate === null || template === null ? null : { uid: docTemplate.uid, ...template },
    [docTemplate, template],
  );

  const navigationAction = useMemo<PreviewNavigationAction>(
    () => ({ type: 'selection-changed', template: navigationTemplate, selectedTab }),
    [navigationTemplate, selectedTab],
  );

  const nextShownTab = previewNavigationReducer(shownTab, navigationAction);

  useEffect(() => {
    dispatch(navigationAction);
  }, [navigationAction]);

  useEffect(() => {
    dispatchSheet(sheetNavigationAction);
  }, [sheetNavigationAction]);

  const templateUid = docTemplate?.uid ?? null;
  const openTab = template === null ? 0 : (nextShownTab?.tab ?? 0);

  const scale = areaWidth === null ? 1 : Math.min(1, areaWidth / width);

  const visibleIndexes = template?.tabs.map((_tab, index) => index) ?? [];

  const tabs: ShellTab[] = visibleIndexes.map((index) => {
    const templateTab = template?.tabs[index];

    return {
      id: templateTabKey(index),
      label: templateTabLabel(templateTab?.title),
      dataTabIndex: index,
    };
  });

  const activeEditingUid = editingUid === selection ? editingUid : null;

  const preview = useMemo<CellPreview>(
    () => ({
      placeholders: true,
      editableCell:
        activeEditingUid === null
          ? null
          : previewCellKey(document, activeEditingUid, templateUid, openTab),
      onEscape: () => {
        dispatchEditing({ type: 'escape-pressed' });
      },
    }),
    [activeEditingUid, document, openTab, templateUid],
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
        rolling={rolling}
        preview={preview}
      />
    );

  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    if (docTemplate === null || !(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest('[data-sidebar-entry]') !== null) {
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

    const editable = !sample && cell?.kind === 'field';

    if (!selected) {
      store.select(uid);
      dispatchEditing({ type: 'cell-clicked', uid, selected: false, editable });

      if (cellTarget !== null) {
        event.stopPropagation();
      }

      return;
    }

    if (cell?.kind === 'field') {
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
          openTab,
          selection,
          problems,
        )}
      </style>
      <div ref={area} className="min-w-0">
        {docTemplate === null || template === null || renderRecords === null ? (
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
                  onAddSidebarEntry: (setId) => {
                    store.addSheet(setId);
                  },
                  tabs,
                  selectedTab: openTab === null ? null : templateTabKey(openTab),
                  onSelectTab: (id) => {
                    const index = templateIndexFromKey(id);

                    const uid =
                      index === null
                        ? null
                        : uidAt(document, [templateIndexOf(document, docTemplate.uid), index]);

                    if (uid !== null) {
                      store.select(uid);
                    }
                  },
                  header,
                  content,
                  frameClassName: 'h-full',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
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
  openTab: number,
): string | null {
  const path = locate(document, uid);

  if (
    path?.kind !== 'cell' ||
    document.templates[path.template]?.uid !== templateUid ||
    path.tab !== openTab
  ) {
    return null;
  }

  return `${path.tab}.${path.section}.${path.row}.${path.cell}`;
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
  editing,
  rolling,
  preview,
}: {
  template: ReturnType<typeof templateToPreset>;
  sheetId: string;
  records: ReadonlyMap<string, VersionedRecord>;
  openTab: number | null;
  editing: FieldEditing | null;
  rolling: DiceRolling;
  preview: CellPreview;
}): ReactNode {
  return (
    <CellPreviewContext value={preview}>
      <SheetBody
        template={template}
        sheetId={sheetId}
        openTab={openTab}
        records={records}
        editing={editing}
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
    return uidAt(document, [templateIndex, Number(templateTab.getAttribute('data-tab-index'))]);
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
