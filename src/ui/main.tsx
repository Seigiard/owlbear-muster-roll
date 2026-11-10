import { useStore } from '@nanostores/react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { TIMING } from '@/core/timing';
import type { Notice } from '@/core/ui-messages';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { copy } from '@/ui/copy';
import type { BannerMessage } from '@/ui/primitives/banner';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient } from '@/ui/replica-client';
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
const store = createProjectionStore();

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    await followTheme(platform.theme, document.documentElement);
    root.render(<WindowRoot store={store} />);
    startReplicaClient(
      platform.broadcast,
      createSendQueue(platform.broadcast, TIMING),
      store,
      TIMING,
    );
  } catch (error) {
    console.error('Muster Roll could not render its window', error);
  }
}

function WindowRoot({ store: projection }: { store: ProjectionStore }): ReactNode {
  const notices = useStore(projection.$notices);

  return (
    <WindowShell tabs={TABS} banner={bannerFor(notices)}>
      <p>{copy.loading}</p>
    </WindowShell>
  );
}

function bannerFor(notices: readonly Notice[]): BannerMessage | undefined {
  return notices.includes('local-save-failed')
    ? { variant: 'danger', text: copy.localSaveFailed }
    : undefined;
}
