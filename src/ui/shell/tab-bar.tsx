import { useContext, useEffect } from 'react';
import type { ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { Tab, TabList, TabListStateContext } from 'react-aria-components';

import { copy } from '@/ui/copy';
import { CellTooltip } from '@/ui/primitives/tooltip';

const TAB_CLASS =
  'touch-target inline-flex min-w-[0] shrink-0 items-center gap-1 rounded-t-md border border-b-0 border-transparent bg-surface-tab px-3 text-text -outline-offset-2 data-selected:border-line data-selected:bg-surface data-selected:text-accent';

const SCROLLER_CLASS =
  'flex min-w-[0] gap-2 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

// The tab row of the selected sheet. Its parent WindowFrame owns the Tabs state and panel.
export type ShellTab = {
  id: string;
  label: string;
  selectedOnMap?: boolean;
  dataTabIndex?: number;
};

type TabBarProps = { tabs: readonly ShellTab[] };

export function TabBar({ tabs }: TabBarProps): ReactNode {
  useTabKeyEntersAtSelection();

  return (
    <div className="bg-surface-bar px-2 pt-2" onWheel={scrollSideways}>
      <div data-tab-scroller className={SCROLLER_CLASS}>
        <TabList aria-label={copy.label.sheetTabs} className="flex gap-2">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              id={tab.id}
              aria-label={tabName(tab)}
              data-frame-tab
              data-tab-index={tab.dataTabIndex}
              className={TAB_CLASS}
            >
              <span className="min-w-[0] truncate">
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

function tabName(tab: ShellTab): string | undefined {
  if (tab.selectedOnMap === true) {
    return copy.label.selectedOnMap(tab.label);
  }

  return tab.label;
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
