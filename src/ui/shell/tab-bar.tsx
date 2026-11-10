import type { ReactNode } from 'react';
import { Tab, TabList } from 'react-aria-components';

export type ShellTab = { id: string; label: string; accessibleName?: string };

export function TabBar({ tabs }: { tabs: readonly ShellTab[] }): ReactNode {
  return (
    <TabList className="flex justify-end gap-2 bg-surface-bar px-2 pt-2">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          id={tab.id}
          aria-label={tab.accessibleName}
          className="touch-target inline-flex items-center rounded-t-md bg-surface-tab px-3 text-text -outline-offset-2 data-selected:bg-surface data-selected:text-accent"
        >
          {tab.label}
        </Tab>
      ))}
    </TabList>
  );
}
