import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { decodePreset, type Preset } from '@/core/preset';
import { hasLiveSheet, presetDataSchema, type VersionedRecord } from '@/core/records';
import { TIMING } from '@/core/timing';
import type { Notice } from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { copy } from '@/ui/copy';
import { PresetUpload } from '@/ui/preset-actions';
import type { BannerMessage } from '@/ui/primitives/banner';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';
import { SettingsView } from '@/ui/settings/settings-view';
import { WindowShell, type ShellLayout } from '@/ui/shell/window-shell';
import { followTheme } from '@/ui/theme';

import './main.css';

// U+FE0E keeps the gear a text glyph, because some platforms would draw a color emoji.
const GEAR = '⚙︎';

const NPC_TAB = 'npc';

const SETTINGS_TAB = 'settings';

type PresetState = 'unknown' | 'absent' | 'present';

type WindowRootProps = {
  role: PlayerRole;
  store: ProjectionStore;
  sendCommand: ReplicaClient['sendCommand'];
};

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
    const [role] = await Promise.all([
      platform.player.getRole(),
      followTheme(platform.theme, document.documentElement),
    ]);

    const client = startReplicaClient(
      platform.broadcast,
      createSendQueue(platform.broadcast, TIMING),
      store,
      TIMING,
    );

    root.render(<WindowRoot role={role} store={store} sendCommand={client.sendCommand} />);
  } catch (error) {
    console.error('Muster Roll could not render its window', error);
  }
}

function WindowRoot({ role, store: projection, sendCommand }: WindowRootProps): ReactNode {
  const notices = useStore(projection.$notices);
  const loaded = useStore(projection.$loaded);
  const records = useStore(projection.$records);
  const presetData = presetDataOf(records);
  const preset = useMemo(() => decodedPreset(presetData), [presetData]);
  const presetState: PresetState = !loaded ? 'unknown' : preset === null ? 'absent' : 'present';
  const [seenPresetState, setSeenPresetState] = useState(presetState);
  const [selectedTab, setSelectedTab] = useState(NPC_TAB);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (presetState !== seenPresetState) {
    setSeenPresetState(presetState);

    // The arrival of a first preset selects Settings, so the GM sees the result.
    if (seenPresetState === 'absent' && presetState === 'present') {
      setSelectedTab(SETTINGS_TAB);
    }
  }

  const sheetsExist = hasLiveSheet(records.values());
  const loading = <p>{copy.loading}</p>;

  const settings = (
    <SettingsView
      preset={preset}
      sheetsExist={sheetsExist}
      sendCommand={sendCommand}
      store={projection}
    />
  );

  const layout = ((): ShellLayout => {
    // Temporary until Story 2.3: a player client shows only the loading text.
    if (role !== 'GM') {
      return { kind: 'plain', content: loading };
    }

    if (presetState === 'absent') {
      return {
        kind: 'toggle',
        toggle: {
          label: GEAR,
          accessibleName: copy.place.settings,
          isPressed: settingsOpen,
          onToggle: setSettingsOpen,
        },
        content: settingsOpen ? (
          settings
        ) : (
          <PresetUpload
            sendCommand={sendCommand}
            store={projection}
            disabledReason={sheetsExist ? copy.presetLocked : undefined}
          />
        ),
      };
    }

    return {
      kind: 'tabs',
      selectedTab,
      onSelectTab: setSelectedTab,
      tabs: [
        // Temporary until Story 1.6 gives the NPC tab its content.
        { id: NPC_TAB, label: copy.place.npc, content: loading },
        {
          id: SETTINGS_TAB,
          label: GEAR,
          accessibleName: copy.place.settings,
          content: presetState === 'unknown' ? loading : settings,
        },
      ],
    };
  })();

  return <WindowShell layout={layout} banner={bannerFor(notices)} />;
}

function presetDataOf(records: ReadonlyMap<string, VersionedRecord>): string | null {
  const data = presetDataSchema.safeParse(records.get('preset')?.d);

  return data.success ? data.data : null;
}

// The engine validates before it stores, so a preset that does not decode counts as none.
function decodedPreset(data: string | null): Preset | null {
  if (data === null) {
    return null;
  }

  const decoded = decodePreset(data);

  return decoded.ok ? decoded.value : null;
}

function bannerFor(notices: readonly Notice[]): BannerMessage | undefined {
  return notices.includes('local-save-failed')
    ? { variant: 'danger', text: copy.localSaveFailed }
    : undefined;
}
