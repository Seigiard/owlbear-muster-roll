import type { Key, ReactNode } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';

import { Banner } from '@/ui/primitives/banner';
import type { BannerMessage } from '@/ui/primitives/banner';

import { itemTabs, TabBar, ToggleBar } from './tab-bar';
import type { ShellBarItem, ShellTab, ShellToggle } from './tab-bar';

// The preset preview (TASK-40) lays out its frames with this too, so they match the window.
export const CONTENT_CLASS = 'min-h-[0] flex-1 overflow-auto p-3 -outline-offset-2';

export type ShellLayout =
  | {
      kind: 'tabs';
      // UX: one scrolling row of tabs in preset order, each sheet set's "+" after its last tab.
      // Pinned tabs, the gear, stay at the right.
      items: readonly ShellBarItem[];
      pinnedTabs: readonly ShellTab[];
      selectedTab: string;
      onSelectTab: (id: string) => void;
    }
  | { kind: 'toggle'; toggle: ShellToggle; content: ReactNode }
  | { kind: 'plain'; content: ReactNode };

type WindowShellProps = { layout: ShellLayout; banner?: BannerMessage };

export function WindowShell({ layout, banner }: WindowShellProps): ReactNode {
  return (
    <main className="flex h-dvh flex-col overflow-hidden rounded-lg bg-surface text-body text-text">
      {layout.kind === 'tabs' ? (
        <Tabs
          className="flex min-h-[0] flex-1 flex-col"
          selectedKey={layout.selectedTab}
          onSelectionChange={(key: Key) => {
            layout.onSelectTab(String(key));
          }}
        >
          <TabBar items={layout.items} pinnedTabs={layout.pinnedTabs} />
          <Banner message={banner} />
          {[...itemTabs(layout.items), ...layout.pinnedTabs].map((tab) => (
            <TabPanel key={tab.id} id={tab.id} className={CONTENT_CLASS}>
              {tab.content}
            </TabPanel>
          ))}
        </Tabs>
      ) : (
        <>
          {layout.kind === 'toggle' ? <ToggleBar toggle={layout.toggle} /> : null}
          <Banner message={banner} />
          <div className={CONTENT_CLASS}>{layout.content}</div>
        </>
      )}
    </main>
  );
}
