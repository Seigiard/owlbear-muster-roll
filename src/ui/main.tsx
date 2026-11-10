import { createRoot } from 'react-dom/client';

import { platform } from '@/platform/current';
import { copy } from '@/ui/copy';
import { WindowShell } from '@/ui/shell/window-shell';
import type { ShellTab } from '@/ui/shell/tab-bar';
import { followTheme } from '@/ui/theme';

import './main.css';

// U+FE0E keeps the gear a text glyph, because some platforms would draw a color emoji.
const GEAR = '⚙︎';

const TABS: readonly ShellTab[] = [
  { id: 'npc', label: copy.place.npc },
  { id: 'settings', label: GEAR, accessibleName: copy.place.settings },
];

const container = document.getElementById('root');

if (container === null) {
  throw new Error('index.html has no #root element');
}

const root = createRoot(container);

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    await followTheme(platform.theme, document.documentElement);
    root.render(
      <WindowShell tabs={TABS}>
        <p>{copy.loading}</p>
      </WindowShell>,
    );
  } catch (error) {
    console.error('Muster Roll could not render its window', error);
  }
}
