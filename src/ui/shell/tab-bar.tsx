import type { ReactNode } from 'react';
import { Tab, TabList, ToggleButton } from 'react-aria-components';

const BAR_CLASS = 'flex justify-end gap-2 bg-surface-bar px-2 pt-2';

const TAB_CLASS =
  'touch-target inline-flex items-center rounded-t-md bg-surface-tab px-3 text-text -outline-offset-2';

export type ShellTab = { id: string; label: string; accessibleName?: string; content: ReactNode };

export type ShellToggle = {
  label: string;
  accessibleName: string;
  isPressed: boolean;
  onToggle: (isPressed: boolean) => void;
};

export function TabBar({ tabs }: { tabs: readonly ShellTab[] }): ReactNode {
  return (
    <TabList className={BAR_CLASS}>
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          id={tab.id}
          aria-label={tab.accessibleName}
          className={`${TAB_CLASS} data-selected:bg-surface data-selected:text-accent`}
        >
          {tab.label}
        </Tab>
      ))}
    </TabList>
  );
}

// A tab bar with one tab could never switch away, so a lone gear is a toggle button instead.
export function ToggleBar({ toggle }: { toggle: ShellToggle }): ReactNode {
  return (
    <div className={BAR_CLASS}>
      <ToggleButton
        aria-label={toggle.accessibleName}
        isSelected={toggle.isPressed}
        onChange={toggle.onToggle}
        className={`${TAB_CLASS} data-selected:bg-surface data-selected:text-accent`}
      >
        {toggle.label}
      </ToggleButton>
    </div>
  );
}
