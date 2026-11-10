import type { Key, ReactNode } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';

import { Banner } from '@/ui/primitives/banner';
import type { BannerMessage } from '@/ui/primitives/banner';

import { TabBar, ToggleBar } from './tab-bar';
import type { ShellTab, ShellToggle } from './tab-bar';

const CONTENT_CLASS = 'min-h-[0] flex-1 overflow-auto p-3 -outline-offset-2';

export type ShellLayout =
  | {
      kind: 'tabs';
      tabs: readonly ShellTab[];
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
          <TabBar tabs={layout.tabs} />
          <Banner message={banner} />
          {layout.tabs.map((tab) => (
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
