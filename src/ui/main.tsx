import { useStore } from '@nanostores/react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { decodePreset, type Preset } from '@/core/preset';
import { hasLiveSheet, presetDataSchema, type VersionedRecord } from '@/core/records';
import { liveSheets, sheetKey } from '@/core/sheets';
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
import { CharacterHeader } from '@/ui/sheet/character-header';
import { DeleteConfirmation } from '@/ui/sheet/delete-confirmation';
import { SheetBody } from '@/ui/sheet/sheet-body';
import { createFieldFlushes, type FieldEditing } from '@/ui/sheet/use-field-edit';
import { focusTab } from '@/ui/shell/tab-bar';
import { WindowShell, type ShellLayout } from '@/ui/shell/window-shell';
import { followTheme } from '@/ui/theme';

import './main.css';

// U+FE0E keeps the gear a text glyph, because some platforms would draw a color emoji.
const GEAR = '⚙︎';

const NPC_TAB = 'npc';

const SETTINGS_TAB = 'settings';

type PresetState = 'unknown' | 'absent' | 'present';

// The command id ties a rejection to the creation, so a refused sheet stops waiting for its tab.
type CreatedTab = { tab: string; commandId: string };

type DeleteAsk = { tab: string; request: number };

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
const pageHideFlushes = createFieldFlushes();

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

    // A closing window still sends what waits in its queue, then the fields typed into and not
    // yet saved, so a newer value of a field lands after an older one.
    window.addEventListener('pagehide', () => {
      client.flushNow();
      pageHideFlushes.flushAll();
    });

    root.render(<WindowRoot role={role} store={store} sendCommand={client.sendCommand} />);
  } catch (error) {
    console.error('Muster Roll could not render its window', error);
  }
}

function WindowRoot({ role, store: projection, sendCommand }: WindowRootProps): ReactNode {
  const notices = useStore(projection.$notices);
  const loaded = useStore(projection.$loaded);
  const records = useStore(projection.$records);
  const rejections = useStore(projection.$rejections);
  const presetData = presetDataOf(records);
  const preset = useMemo(() => decodedPreset(presetData), [presetData]);
  const characters = useMemo(() => liveSheets(records.values(), 'pc'), [records]);
  const presetState: PresetState = !loaded ? 'unknown' : preset === null ? 'absent' : 'present';
  // Starts unseen, as a projection can land before the first render, and a preset that came with
  // it must still select the first tab.
  const [seenPresetState, setSeenPresetState] = useState<PresetState>('unknown');
  const [selectedTab, setSelectedTab] = useState(NPC_TAB);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A sheet this window created, until its record arrives and its tab can open.
  const [createdTab, setCreatedTab] = useState<CreatedTab | null>(null);
  const [focusNameOf, setFocusNameOf] = useState<string | null>(null);
  // The open confirmation. Kept in memory only, so a window that closes forgets it and deletes
  // nothing.
  const [deleteAsk, setDeleteAsk] = useState<DeleteAsk | null>(null);
  const [focusActionsOf, setFocusActionsOf] = useState<string | null>(null);
  // A tab this window has confirmed the deletion of, until its sheet is gone.
  const [deletingTab, setDeletingTab] = useState<string | null>(null);
  const characterTabs = characters.map((sheet) => sheetKey(sheet.sheetId));

  const editing = useMemo<FieldEditing>(
    () => ({
      sendCommand,
      $rejections: projection.$rejections,
      pauseMs: TIMING.fieldSavePauseMs,
      pageHideFlushes,
    }),
    [sendCommand, projection],
  );

  const firstTab = characterTabs[0] ?? NPC_TAB;

  const clearNameFocus = useCallback(() => {
    setFocusNameOf(null);
  }, []);

  const clearActionsFocus = useCallback(() => {
    setFocusActionsOf(null);
  }, []);

  let shownTab = selectedTab;

  if (presetState !== seenPresetState) {
    setSeenPresetState(presetState);

    if (seenPresetState === 'absent' && presetState === 'present') {
      // The arrival of a first preset selects Settings, so the GM sees the result.
      shownTab = SETTINGS_TAB;
    } else if (presetState === 'present') {
      shownTab = firstTab;
    }
  }

  if (createdTab !== null && rejections.has(createdTab.commandId)) {
    setCreatedTab(null);
  } else if (createdTab !== null && characterTabs.includes(createdTab.tab)) {
    setCreatedTab(null);
    setFocusNameOf(createdTab.tab);
    shownTab = createdTab.tab;
  }

  // A selected sheet that disappears hands the selection to the first tab.
  if (shownTab !== NPC_TAB && shownTab !== SETTINGS_TAB && !characterTabs.includes(shownTab)) {
    shownTab = firstTab;
  }

  if (shownTab !== selectedTab) {
    setSelectedTab(shownTab);
  }

  // Another tab, or a sheet deleted elsewhere, closes the confirmation for good, so returning to
  // the tab does not bring it back.
  if (deleteAsk !== null && shownTab !== deleteAsk.tab) {
    setDeleteAsk(null);
  }

  const deletedTabGone = deletingTab !== null && !characterTabs.includes(deletingTab);

  // The pressed "Удалить" is gone with its block, so the focus would stay on the page body.
  useEffect(() => {
    if (!deletedTabGone) {
      return;
    }

    if (document.activeElement === null || document.activeElement === document.body) {
      focusTab(shownTab);
    }

    setDeletingTab(null);
  }, [deletedTabGone, shownTab]);

  function askDelete(tab: string): void {
    // A new request remounts the block, so a repeated "Удалить" takes the focus again.
    setDeleteAsk((current) => ({ tab, request: (current?.request ?? 0) + 1 }));
  }

  function cancelDelete(tab: string): void {
    setDeleteAsk(null);
    setFocusActionsOf(tab);
  }

  function confirmDelete(tab: string, sheetId: string): void {
    // Closed at once, so a second press on the same block sends no second command.
    setDeleteAsk(null);
    setDeletingTab(tab);
    sendCommand({ type: 'sheet-delete', sheetId });
  }

  function addCharacter(): void {
    const sheetId = nanoid();

    const sent = sendCommand({
      type: 'sheet-create',
      sheetId,
      kind: 'pc',
      name: copy.newCharacter,
    });

    if (sent.ok) {
      setCreatedTab({ tab: sheetKey(sheetId), commandId: sent.value });
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
      selectedTab: shownTab,
      onSelectTab: setSelectedTab,
      scrollingTabs: characters.map((sheet) => {
        const id = sheetKey(sheet.sheetId);

        return {
          id,
          label: sheet.name,
          content: (
            <>
              {deleteAsk?.tab === id ? (
                <DeleteConfirmation
                  key={deleteAsk.request}
                  name={sheet.name}
                  onConfirm={() => {
                    confirmDelete(id, sheet.sheetId);
                  }}
                  onCancel={() => {
                    cancelDelete(id);
                  }}
                />
              ) : null}
              <CharacterHeader
                key={id}
                sheetId={sheet.sheetId}
                name={sheet.name}
                sendCommand={sendCommand}
                store={projection}
                focusName={focusNameOf === id}
                onNameFocused={clearNameFocus}
                onDelete={() => {
                  askDelete(id);
                }}
                focusActions={focusActionsOf === id}
                onActionsFocused={clearActionsFocus}
              />
              {preset === null ? null : (
                <SheetBody
                  template={preset.character}
                  sheetId={sheet.sheetId}
                  records={records}
                  editing={editing}
                />
              )}
            </>
          ),
        };
      }),
      add:
        presetState === 'present'
          ? {
              label: copy.addSign,
              accessibleName: copy.command.addCharacter,
              onPress: addCharacter,
            }
          : undefined,
      pinnedTabs: [
        // Temporary until Story 1.11 gives the NPC tab its content.
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
