import { createRoot } from 'react-dom/client';

import { TIMING } from '@/core/timing';
import {
  LINK_PICKER_POPOVER_ID,
  LINK_PICKER_TARGET_PARAM,
  LINK_PICKER_TOKEN_PARAM,
} from '@/core/token-links';
import { linkTargetOf, type LinkTarget } from '@/core/link-target';
import { linkDataSchema } from '@/core/records';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { createProjectionStore } from '@/ui/projection-store';
import { startReplicaClient } from '@/ui/replica-client';
import { followTheme } from '@/ui/theme';

import { LinkPicker, TokenCellPicker } from './link-picker';

import '../main.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('picker.html has no #root element');
}

const root = createRoot(container);
const store = createProjectionStore();

// The background names the token in the popover's URL.
const tokenId = new URLSearchParams(window.location.search).get(LINK_PICKER_TOKEN_PARAM) ?? '';
const target = targetFromUrl();

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
      target === null ? (
        <LinkPicker
          tokenId={tokenId}
          store={store}
          sendCommand={(command) => client.sendCommand(command)}
          scene={platform.scene}
          notification={platform.notification}
          onLinked={closePicker}
        />
      ) : (
        <TokenCellPicker
          target={target}
          store={store}
          sendCommand={(command) => client.sendCommand(command)}
          scene={platform.scene}
          viewport={platform.viewport}
          onLinked={closePicker}
        />
      ),
    );
  } catch (error) {
    console.error('Muster Roll could not render its link picker', error);
  }
}

function targetFromUrl(): LinkTarget | null {
  const raw = new URLSearchParams(window.location.search).get(LINK_PICKER_TARGET_PARAM);

  if (raw === null) {
    return null;
  }

  try {
    const parsed = linkDataSchema.safeParse(JSON.parse(raw));

    return parsed.success ? linkTargetOf(parsed.data) : null;
  } catch {
    return null;
  }
}

// The picker reports a failed close, so it can take picks again.
function closePicker(): Promise<void> {
  return platform.popover.close(LINK_PICKER_POPOVER_ID);
}
