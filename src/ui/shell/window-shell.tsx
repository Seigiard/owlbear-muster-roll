import type { ReactNode } from 'react';

import type { BannerMessage } from '@/ui/primitives/banner';

import { WindowFrame } from './window-frame';
import type { WindowFrameLayout } from './window-frame';
import type { ShellTab } from './tab-bar';

// Kept for the primitive fixture while callers migrate to WindowFrame. Production surfaces use
// WindowFrame directly; this adapter does not own another layout.
type ShellContentTab = ShellTab & { content: ReactNode };

export type ShellLayout = {
  kind: 'tabs';
  items: readonly { kind: 'tab'; tab: ShellContentTab }[];
  pinnedTabs: readonly ShellContentTab[];
  selectedTab: string;
  onSelectTab: (id: string) => void;
};

export function WindowShell({
  layout,
  banner,
}: {
  layout: ShellLayout;
  banner?: BannerMessage;
}): ReactNode {
  const contentTabs = [...layout.items.map((item) => item.tab), ...layout.pinnedTabs];
  const tabs: ShellTab[] = contentTabs.map(({ id, label }) => ({ id, label }));

  const content = contentTabs.find((tab) => tab.id === layout.selectedTab)?.content ?? null;

  const frame: WindowFrameLayout = {
    sidebar: { sections: [] },
    selectedSidebarEntry: '',
    onSelectSidebarEntry: () => undefined,
    tabs,
    selectedTab: layout.selectedTab,
    onSelectTab: layout.onSelectTab,
    content,
  };

  return <WindowFrame layout={frame} banner={banner} />;
}

export { CONTENT_CLASS, WindowFrame } from './window-frame';

export type { WindowFrameLayout } from './window-frame';
