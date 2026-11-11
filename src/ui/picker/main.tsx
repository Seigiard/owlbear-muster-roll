import { createRoot } from 'react-dom/client';

import { TIMING } from '@/core/timing';
import { LINK_PICKER_POPOVER_ID, LINK_PICKER_TOKEN_PARAM } from '@/core/token-links';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { createProjectionStore } from '@/ui/projection-store';
import { startReplicaClient } from '@/ui/replica-client';
import { followTheme } from '@/ui/theme';

import { LinkPicker } from './link-picker';

import '../main.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('picker.html has no #root element');
}

const root = createRoot(container);
const store = createProjectionStore();

// The background names the token in the popover's URL.
const tokenId = new URLSearchParams(window.location.search).get(LINK_PICKER_TOKEN_PARAM) ?? '';

platform.onReady(() => {
  void start();
});

// The picker talks to the background like the main window: a projection, then commands.
async function start(): Promise<void> {
  try {
    await followTheme(platform.theme, document.documentElement);

    const client = startReplicaClient(
      platform.broadcast,
      createSendQueue(platform.broadcast, TIMING),
      store,
      TIMING,
    );

    window.addEventListener('pagehide', client.flushNow);

    root.render(
      <LinkPicker
        tokenId={tokenId}
        store={store}
        sendCommand={client.sendCommand}
        scene={platform.scene}
        notification={platform.notification}
        onLinked={closePicker}
      />,
    );
  } catch (error) {
    console.error('Muster Roll could not render its link picker', error);
  }
}

// The picker reports a failed close, so it can take picks again.
function closePicker(): Promise<void> {
  return platform.popover.close(LINK_PICKER_POPOVER_ID);
}
