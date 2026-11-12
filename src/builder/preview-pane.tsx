import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';

import { DEFAULT_WINDOW_SIZE } from '@/core/preset';
import { createStubRolling } from '@/preview/stub-rolling';
import { copy } from '@/ui/copy';
import { CellPreviewContext, type CellPreview } from '@/ui/sheet/preset-cell';
import { SheetBody } from '@/ui/sheet/sheet-body';
import { SheetHeader } from '@/ui/sheet/sheet-header';
import { TabBar, type ShellBarItem } from '@/ui/shell/tab-bar';
import { CONTENT_CLASS } from '@/ui/shell/window-shell';

import type { BuilderStore } from './builder-store';
import {
  indexPath,
  locate,
  templateOf,
  templateToPreset,
  uidAt,
  type BuilderDocument,
} from './document';
import { previewRecords, previewSheetName, PREVIEW_SHEET_ID } from './preview-records';
import type { BuilderProblem } from './problems';

type PreviewPaneProps = {
  store: BuilderStore;
  document: BuilderDocument;
  selection: string | null;
  problems: readonly BuilderProblem[];
};

// One stub for the page: the preview takes no roll.
const stubRolling = createStubRolling();

const CELL_PREVIEW: CellPreview = { placeholders: true };

// The pane's own attribute, which scopes its mark rules.
const PREVIEW_SCOPE = '[data-builder-preview]';

const SELECTED_RULE = 'outline: 2px solid var(--color-accent); outline-offset: 2px;';

const PROBLEM_RULE = 'box-shadow: 0 0 0 2px var(--color-danger-text);';

// The smallest frame the preview draws, so a window size far out of range still shows.
const MIN_FRAME_PX = 120;

// CAP-22, AD-23: the template that holds the selected item, drawn by the window's own sheet
// components in a frame of the preset's window size. Read-only, with every field empty. A click on a
// cell, row, section or tab selects its item.
export function PreviewPane({ store, document, selection, problems }: PreviewPaneProps): ReactNode {
  const headingId = useId();
  const area = useRef<HTMLDivElement>(null);
  const areaWidth = useWidth(area);
  const size = document.window ?? DEFAULT_WINDOW_SIZE;
  const width = Math.max(size.width, MIN_FRAME_PX);
  const height = Math.max(size.height, MIN_FRAME_PX);

  const docTemplate =
    (selection === null ? null : templateOf(document, selection)) ?? document.templates[0] ?? null;

  const template = useMemo(
    () => (docTemplate === null ? null : templateToPreset(docTemplate)),
    [docTemplate],
  );

  const records = useMemo(() => (template === null ? null : previewRecords(template)), [template]);
  const scale = areaWidth === null ? 1 : Math.min(1, areaWidth / width);

  const items: ShellBarItem[] = document.templates.map((other) => ({
    kind: 'tab',
    tab: { id: other.uid, label: previewSheetName(templateToPreset(other)), content: null },
  }));

  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    if (docTemplate === null || !(event.target instanceof Element)) {
      return;
    }

    const uid = clickedUid(document, docTemplate.uid, event.target);

    if (uid !== null) {
      store.select(uid);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-[0] flex-col gap-2"
      data-builder-preview
    >
      <h2 id={headingId} className="text-section-heading">
        {copy.builder.preview(size.width, size.height)}
      </h2>
      <style>{markRules(document, docTemplate?.uid ?? null, selection, problems)}</style>
      <div ref={area} className="min-w-[0]">
        {docTemplate === null || template === null || records === null ? (
          <p className="text-text-muted">{copy.builder.emptyPreset}</p>
        ) : (
          <div style={{ width: width * scale, height: height * scale }}>
            <div
              className="flex origin-top-left flex-col overflow-hidden rounded-lg bg-surface text-body text-text"
              style={{ width, height, transform: scale === 1 ? undefined : `scale(${scale})` }}
              onClickCapture={handleClick}
              data-preview-frame
            >
              <Tabs
                className="flex min-h-[0] flex-1 flex-col"
                selectedKey={docTemplate.uid}
                onSelectionChange={(key) => {
                  store.select(String(key));
                }}
              >
                <TabBar items={items} pinnedTabs={[]} />
                <TabPanel id={docTemplate.uid} className={CONTENT_CLASS}>
                  <CellPreviewContext value={CELL_PREVIEW}>
                    <SheetHeader
                      sheetId={PREVIEW_SHEET_ID}
                      name={previewSheetName(template)}
                      nameField={null}
                      records={records}
                      editing={null}
                      status={null}
                      gm={null}
                      focusName={false}
                      onNameFocused={noop}
                    />
                    <SheetBody
                      template={template}
                      sheetId={PREVIEW_SHEET_ID}
                      records={records}
                      editing={null}
                      rolling={stubRolling}
                      pending={null}
                    />
                  </CellPreviewContext>
                </TabPanel>
              </Tabs>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function noop(): void {
  // The preview focuses no name.
}

// The item a click in the frame lands on: a tab's template, or the cell, row or section of the
// shown template.
function clickedUid(
  document: BuilderDocument,
  templateUid: string,
  target: Element,
): string | null {
  const tab = target.closest('[role="tab"][data-key]');

  if (tab !== null) {
    return tab.getAttribute('data-key');
  }

  const templateIndex = document.templates.findIndex((template) => template.uid === templateUid);
  const cell = target.closest('[data-cell]')?.getAttribute('data-cell');

  if (cell !== undefined && cell !== null) {
    return uidAt(document, [templateIndex, ...cell.split('.').map(Number)]);
  }

  const section = target.closest('[data-section-index]')?.getAttribute('data-section-index');
  const row = target.closest('[data-row-index]')?.getAttribute('data-row-index');

  if (section === undefined || section === null) {
    return null;
  }

  const path = [templateIndex, Number(section)];

  return uidAt(document, row === undefined || row === null ? path : [...path, Number(row)]);
}

// The selection and problem marks of the shown template, as one scoped style sheet, so the sheet
// components stay as the window draws them.
function markRules(
  document: BuilderDocument,
  templateUid: string | null,
  selection: string | null,
  problems: readonly BuilderProblem[],
): string {
  if (templateUid === null) {
    return '';
  }

  const rules: string[] = [];
  const selector = selection === null ? null : markSelector(document, templateUid, selection);

  if (selector !== null) {
    rules.push(`${selector} { ${SELECTED_RULE} }`);
  }

  for (const problem of problems) {
    const problemSelector = markSelector(document, templateUid, problem.uid);

    if (problemSelector !== null) {
      rules.push(`${problemSelector} { ${PROBLEM_RULE} }`);
    }
  }

  return rules.join('\n');
}

function markSelector(document: BuilderDocument, templateUid: string, uid: string): string | null {
  const path = locate(document, uid);

  if (path === null || path.kind === 'window') {
    return null;
  }

  const scope = PREVIEW_SCOPE;

  if (document.templates[path.template]?.uid !== templateUid) {
    // A template's own item is its tab, which every template shows.
    return path.kind === 'template' ? `${scope} [role="tab"][data-key="${CSS.escape(uid)}"]` : null;
  }

  const [, section, row, cell] = indexPath(path);

  if (path.kind === 'template') {
    return `${scope} [role="tab"][data-key="${CSS.escape(uid)}"]`;
  }

  const sectionSelector = `${scope} [data-section-index="${section}"]`;

  if (path.kind === 'section') {
    return sectionSelector;
  }

  if (path.kind === 'row') {
    return `${sectionSelector} [data-row-index="${row}"]`;
  }

  return `${sectionSelector} [data-cell="${section}.${row}.${cell}"] > *`;
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
