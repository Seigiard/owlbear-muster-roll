import { useContext, useEffect } from 'react';
import type { ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { Tab, TabList, TabListStateContext } from 'react-aria-components';

import { copy } from '@/copy';
import { CellTooltip } from '@/ui/primitives/tooltip';

// The selected tab is underlined in the text color; forced colors drop the shadow, so there it is
// a text underline.
const TAB_CLASS =
  'touch-target inline-flex min-w-0 shrink-0 items-center gap-1 px-3 text-text-muted -outline-offset-2 data-hovered:text-text data-selected:font-medium data-selected:text-text data-selected:shadow-[inset_0_-2px_0_var(--color-text)] forced-colors:data-selected:underline';

const SCROLLER_CLASS =
  'flex min-w-0 gap-1 overflow-x-auto border-b border-hairline scrollbar-none [&::-webkit-scrollbar]:hidden';

// The tab row of the selected sheet. Its parent WindowFrame owns the Tabs state and panel.
export type ShellTab = {
  id: string;
  label: string;
  selectedOnMap?: boolean;
  dataTabIndex?: number;
  sourceTabIndex?: number;
  addScopeId?: string;
  addScopeTitle?: string;
};

type TabBarProps = {
  tabs: readonly ShellTab[];
  onAddTab: (id: string) => void;
};

export function TabBar({ tabs, onAddTab }: TabBarProps): ReactNode {
  useTabKeyEntersAtSelection();

  const duplicateAddScopeTitles = duplicateValues(
    tabs.flatMap((tab) => (tab.addScopeTitle === undefined ? [] : [tab.addScopeTitle])),
  );

  return (
    <div className="px-3 pt-1" onWheel={scrollSideways}>
      <div data-tab-scroller className={SCROLLER_CLASS}>
        <TabList aria-label={copy.label.sheetTabs} className="flex gap-1">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              id={tab.id}
              aria-label={tabName(tab, duplicateAddScopeTitles)}
              data-frame-tab
              data-tab-index={tab.dataTabIndex}
              data-source-tab-index={tab.sourceTabIndex}
              onPress={
                tab.addScopeId === undefined
                  ? undefined
                  : () => {
                      onAddTab(tab.id);
                    }
              }
              className={TAB_CLASS}
            >
              <span className="min-w-0 truncate">
                <CellTooltip name={tab.label}>
                  <span className="truncate">{tab.label}</span>
                </CellTooltip>
              </span>
              {tab.selectedOnMap === true ? (
                <span
                  aria-hidden
                  data-map-mark
                  className="size-[6px] shrink-0 rounded-full bg-accent"
                />
              ) : null}
            </Tab>
          ))}
        </TabList>
      </div>
    </div>
  );
}

function tabName(tab: ShellTab, duplicateAddScopeTitles: ReadonlySet<string>): string | undefined {
  const name =
    tab.addScopeTitle === undefined
      ? tab.label
      : copy.label.addToSection(
          tab.addScopeTitle,
          duplicateAddScopeTitles.has(tab.addScopeTitle) ? tab.addScopeId : undefined,
        );

  if (tab.selectedOnMap === true) {
    return copy.label.selectedOnMap(name);
  }

  return name;
}

function duplicateValues(values: readonly string[]): ReadonlySet<string> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const duplicates = new Set<string>();

  for (const [value, count] of counts) {
    if (count > 1) {
      duplicates.add(value);
    }
  }

  return duplicates;
}

// React Aria moves focus to the selected tab after a selection change. This also handles a tab row
// that mounts after the first preset arrives, when the old focus was on Settings.
export function useTabKeyEntersAtSelection(): void {
  const state = useContext(TabListStateContext);

  useEffect(() => {
    if (state === null) {
      return;
    }

    const { selectedKey, selectionManager, collection } = state;

    const active = document.activeElement;

    const canEnterFromFocus =
      active === document.body ||
      active === document.documentElement ||
      active?.closest('[role="tablist"]') !== null;

    if (
      canEnterFromFocus &&
      !selectionManager.isFocused &&
      selectedKey !== null &&
      selectionManager.focusedKey !== selectedKey &&
      collection.getItem(selectedKey) !== null
    ) {
      selectionManager.setFocusedKey(selectedKey);
    }
  });
}

// A mouse wheel has only a vertical delta. A trackpad or a tilt wheel that has a horizontal one
// already scrolls the row by itself.
export function scrollSideways(event: ReactWheelEvent<HTMLDivElement>): void {
  if (event.deltaX !== 0 || event.deltaY === 0) {
    return;
  }

  const scroller = event.currentTarget.firstElementChild;

  if (!(scroller instanceof HTMLElement)) {
    return;
  }

  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 20
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scroller.clientWidth
        : 1;

  scroller.scrollLeft += event.deltaY * unit;
}
