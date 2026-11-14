import type { Key, ReactNode } from 'react';
import { Button, Tab, TabList, Tabs } from 'react-aria-components';

import { copy } from '@/ui/copy';
import { Banner } from '@/ui/primitives/banner';
import type { BannerMessage } from '@/ui/primitives/banner';
import { CellTooltip } from '@/ui/primitives/tooltip';

import { TabBar, useTabKeyEntersAtSelection } from './tab-bar';
import type { ShellTab } from './tab-bar';
import type { SidebarEntries, SidebarSheet } from './sidebar-entries';

export const CONTENT_CLASS = 'min-h-0 flex-1 overflow-auto p-3 -outline-offset-2';

const MULTI_TAB_CONTENT_CLASS = 'p-3 -outline-offset-2';

// Navigation has no fill at rest. The selected entry takes the tonal accent, the same as a
// pressed chip, so "selected" looks one way across the window.
const SIDEBAR_TAB_CLASS =
  'touch-target inline-flex min-w-0 w-full items-center gap-1 rounded-md px-2 text-start text-text -outline-offset-2 [&[data-hovered]:not([data-selected])]:bg-fill data-selected:bg-accent-soft data-selected:font-medium data-selected:text-accent-ink';

const SIDEBAR_SCROLLER_CLASS =
  'min-h-0 flex-1 overflow-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const SIDEBAR_FLOW_CLASS = 'flex min-h-full flex-col gap-1';

type SidebarSettings = { id: string; label: string; accessibleName: string };

export function templateTabKey(index: number): string {
  return `template-tab-${index}`;
}

export function templateIndexFromKey(key: string): number | null {
  const prefix = 'template-tab-';

  if (!key.startsWith(prefix)) {
    return null;
  }

  const index = Number(key.slice(prefix.length));

  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function templateTabLabel(title: string | undefined): string {
  return title === undefined || title.trim() === '' ? copy.untitledTab : title;
}

export type WindowFrameLayout = {
  sidebar: SidebarEntries;
  selectedSidebarEntry: string;
  onSelectSidebarEntry: (id: string) => void;
  onAddSidebarEntry?: (setId: string) => void;
  settings?: SidebarSettings;
  tabs: readonly ShellTab[];
  selectedTab: string | null;
  onSelectTab: (id: string) => void;
  panelLabel?: string;
  header?: ReactNode;
  content: ReactNode;
  frameClassName?: string;
};

type WindowFrameProps = { layout: WindowFrameLayout; banner?: BannerMessage };

// AD-26: the only frame for the room window and both previews. It owns the sidebar, banner, tab
// row and content area; callers provide only the navigation model and the selected content.
export function WindowFrame({ layout, banner }: WindowFrameProps): ReactNode {
  const content =
    layout.tabs.length > 1 ? (
      <Tabs
        key={layout.selectedSidebarEntry}
        className="flex min-h-0 flex-1 flex-col"
        selectedKey={layout.selectedTab ?? undefined}
        onSelectionChange={(key: Key) => {
          layout.onSelectTab(String(key));
        }}
      >
        <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-auto">
          {layout.header === undefined ? null : (
            <div className="shrink-0 p-3 pb-0">{layout.header}</div>
          )}
          <TabBar tabs={layout.tabs} />
          {layout.selectedTab === null ? null : (
            <div
              key={`${layout.selectedSidebarEntry}:${layout.selectedTab}`}
              id={layout.selectedTab}
              className={MULTI_TAB_CONTENT_CLASS}
            >
              {layout.content}
            </div>
          )}
        </div>
      </Tabs>
    ) : layout.selectedTab === null ? (
      <div key={layout.selectedSidebarEntry} role="tabpanel" className={CONTENT_CLASS}>
        {layout.header}
        {layout.content}
      </div>
    ) : (
      <div
        key={layout.selectedSidebarEntry}
        id={layout.selectedTab}
        role="tabpanel"
        aria-label={layout.panelLabel ?? layout.tabs[0]?.label}
        className={CONTENT_CLASS}
      >
        {layout.header}
        {layout.content}
      </div>
    );

  return (
    <main
      className={`flex ${layout.frameClassName ?? 'h-dvh'} min-w-0 overflow-clip rounded-lg bg-surface text-body text-text`}
    >
      <Sidebar
        entries={layout.sidebar}
        selected={layout.selectedSidebarEntry}
        onSelect={layout.onSelectSidebarEntry}
        onAdd={layout.onAddSidebarEntry}
        settings={layout.settings}
      />
      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <Banner message={banner} />
        {content}
      </div>
    </main>
  );
}

type SidebarProps = {
  entries: SidebarEntries;
  selected: string;
  onSelect: (id: string) => void;
  onAdd?: (setId: string) => void;
  settings?: SidebarSettings;
};

function Sidebar({ entries, selected, onSelect, onAdd, settings }: SidebarProps): ReactNode {
  let order = 0;
  const visual: ReactNode[] = [];
  const actions: ReactNode[] = [];
  const tabs: ReactNode[] = [];

  for (const section of entries.sections) {
    if (section.kind === 'group') {
      const headingId = `sidebar-heading-${section.id}`;

      visual.push(
        <h2
          key={`heading:${section.id}`}
          id={headingId}
          aria-label={section.title}
          data-sidebar-heading={section.title}
          style={{ order }}
          className="px-2 pt-1 text-label-sm font-semibold text-text-muted"
        ></h2>,
      );
      order += 1;

      for (const sheet of section.sheets) {
        tabs.push(
          <SidebarTab
            key={sheet.id}
            sheet={sheet}
            describedBy={headingId}
            order={order}
            selected={selected === sheet.id}
          />,
        );
        order += 1;
      }

      if (section.canAdd && onAdd !== undefined) {
        actions.push(
          <Button
            key={`add:${section.id}`}
            aria-label={copy.label.addToSet(section.title)}
            onPress={() => {
              onAdd(section.id);
            }}
            style={{ order }}
            className={`${SIDEBAR_TAB_CLASS} text-text-muted`}
          >
            {copy.addSign}
          </Button>,
        );
        order += 1;
      }

      visual.push(
        <div
          key={`divider:${section.id}`}
          aria-hidden
          style={{ order }}
          className="mx-2 my-2 h-px shrink-0 bg-line"
        />,
      );
      order += 1;
    } else {
      tabs.push(
        <SidebarTab
          key={section.sheet.id}
          sheet={section.sheet}
          order={order}
          selected={selected === section.sheet.id}
        />,
      );
      order += 1;
    }
  }

  return (
    <Tabs
      orientation="vertical"
      data-sidebar-root
      className="relative flex min-h-0 w-[10rem] shrink-0 flex-col bg-surface-bar shadow-[inset_-1px_0_0_var(--color-line)]"
      selectedKey={selected}
      onSelectionChange={(key: Key) => {
        onSelect(String(key));
      }}
    >
      <SidebarContents visual={visual} tabs={tabs} actions={actions} settings={settings} />
    </Tabs>
  );
}

function SidebarContents({
  visual,
  tabs,
  actions,
  settings,
}: {
  visual: readonly ReactNode[];
  tabs: readonly ReactNode[];
  actions: readonly ReactNode[];
  settings?: SidebarSettings;
}): ReactNode {
  useTabKeyEntersAtSelection();

  return (
    <>
      <div className={SIDEBAR_SCROLLER_CLASS}>
        <div className={SIDEBAR_FLOW_CLASS}>
          {visual}
          <TabList aria-label={copy.label.sidebar} className="contents">
            {tabs}
            {settings === undefined ? null : (
              <Tab
                id={settings.id}
                aria-label={settings.accessibleName}
                data-sidebar-entry
                style={{
                  position: 'absolute',
                  insetInline: 'var(--spacing-2)',
                  insetBlockEnd: 'var(--spacing-2)',
                  width: 'auto',
                }}
                className={SIDEBAR_TAB_CLASS}
              >
                {settings.label}
              </Tab>
            )}
          </TabList>
          {actions}
        </div>
      </div>
      {settings === undefined ? null : (
        <div aria-hidden className="h-[3rem] shrink-0 border-bs border-line" />
      )}
    </>
  );
}

function SidebarTab({
  sheet,
  describedBy,
  order,
  selected,
}: {
  sheet: SidebarSheet;
  describedBy?: string;
  order: number;
  selected: boolean;
}): ReactNode {
  const label = sheet.name === '' ? copy.unnamed : sheet.name;
  const named = sheet.owned ? `${label}, ${copy.ownMark}` : label;
  const accessibleName = sheet.selectedOnMap ? copy.label.selectedOnMap(named) : named;

  return (
    <Tab
      id={sheet.id}
      aria-label={accessibleName}
      aria-describedby={describedBy}
      data-sidebar-entry
      style={{ order }}
      className={SIDEBAR_TAB_CLASS}
    >
      {selected ? (
        <CellTooltip name={label} className="min-w-0 flex-1 truncate">
          <span className="block truncate">{label}</span>
        </CellTooltip>
      ) : (
        <span className="min-w-0 flex-1 truncate" title={label}>
          {label}
        </span>
      )}
      {sheet.owned ? (
        <span className="shrink-0 text-label-sm text-text-muted">{copy.ownMark}</span>
      ) : null}
      {sheet.selectedOnMap ? (
        <span aria-hidden data-map-mark className="size-[6px] shrink-0 rounded-full bg-accent" />
      ) : null}
    </Tab>
  );
}

export function focusSidebarEntry(id: string, options?: FocusOptions): void {
  document
    .querySelector<HTMLElement>(`[role="tab"][data-sidebar-entry][data-key="${CSS.escape(id)}"]`)
    ?.focus(options);
}

export function revealSidebarEntry(id: string): void {
  document
    .querySelector<HTMLElement>(`[role="tab"][data-sidebar-entry][data-key="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
