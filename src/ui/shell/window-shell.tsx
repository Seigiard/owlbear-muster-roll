import type { ReactNode } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';

import { Banner } from '@/ui/primitives/banner';
import type { BannerMessage } from '@/ui/primitives/banner';

import { TabBar } from './tab-bar';
import type { ShellTab } from './tab-bar';

type WindowShellProps = {
  tabs: readonly ShellTab[];
  banner?: BannerMessage;
  children: ReactNode;
};

export function WindowShell({ tabs, banner, children }: WindowShellProps): ReactNode {
  return (
    <main className="flex h-dvh flex-col overflow-hidden rounded-lg bg-surface text-body text-text">
      <Tabs className="flex min-h-[0] flex-1 flex-col">
        <TabBar tabs={tabs} />
        <Banner message={banner} />
        {tabs.map((tab) => (
          <TabPanel
            key={tab.id}
            id={tab.id}
            className="min-h-[0] flex-1 overflow-auto p-3 -outline-offset-2"
          >
            {children}
          </TabPanel>
        ))}
      </Tabs>
    </main>
  );
}
