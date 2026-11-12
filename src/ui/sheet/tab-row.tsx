import type { Key, ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';

import type { PresetTab } from '@/core/preset';
import { copy } from '@/ui/copy';
import { scrollSideways } from '@/ui/shell/tab-bar';

// `tab` and `tab-active` (DESIGN.md): the open tab takes the content area's surface and joins it
// through the row's bottom line.
const TAB_CLASS =
  'touch-target -mb-px inline-flex max-w-[160px] shrink-0 items-center rounded-t-md border border-b-0 border-transparent bg-surface-tab px-3 text-text -outline-offset-2 data-selected:border-line data-selected:bg-surface data-selected:text-accent';

const SCROLLER_CLASS =
  'mb-3 flex gap-2 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

type TabRowProps = {
  tabs: readonly PresetTab[];
  openTab: number;
  // `undefined` keeps the open tab fixed, as for a caller that shows one tab only.
  onOpenTab?: (index: number) => void;
  children: ReactNode;
};

// CAP-34: the tabs of a sheet's template in preset order, with the open tab's content under them. A
// template with one tab draws no row. The row scrolls sideways when it overflows, also with a
// vertical mouse wheel; `Left` and `Right` move between tabs.
export function TabRow({ tabs, openTab, onOpenTab, children }: TabRowProps): ReactNode {
  if (tabs.length < 2) {
    return children;
  }

  return (
    <Tabs
      selectedKey={tabKey(openTab)}
      onSelectionChange={(key: Key) => {
        onOpenTab?.(tabIndexOf(key));
      }}
    >
      <div className={SCROLLER_CLASS} onWheel={scrollSideways}>
        <TabList aria-label={copy.label.sheetTabs} className="flex gap-2">
          {tabs.map((tab, index) => (
            <Tab key={index} id={tabKey(index)} data-tab-index={index} className={TAB_CLASS}>
              <span className="min-w-[0] truncate">{tabTitle(tab)}</span>
            </Tab>
          ))}
        </TabList>
      </div>
      <TabPanel id={tabKey(openTab)} className="-outline-offset-2">
        {children}
      </TabPanel>
    </Tabs>
  );
}

function tabTitle(tab: PresetTab): string {
  return tab.title === undefined || tab.title.trim() === '' ? copy.untitledTab : tab.title;
}

// The keys differ from the sheet tab bar's, which a query by `data-key` reads across the window.
function tabKey(index: number): string {
  return `template-tab-${index}`;
}

function tabIndexOf(key: Key): number {
  return Number(String(key).slice('template-tab-'.length));
}
