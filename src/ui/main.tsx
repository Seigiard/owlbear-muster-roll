import { useStore } from '@nanostores/react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { decodePreset, type Preset } from '@/core/preset';
import { hasLiveSheet, presetDataSchema, type VersionedRecord } from '@/core/records';
import { liveSheets, sheetKey, type SheetSummary } from '@/core/sheets';
import { TIMING } from '@/core/timing';
import type { Notice } from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { copy } from '@/ui/copy';
import { PresetUpload, uploadDisabledReason } from '@/ui/preset-actions';
import type { BannerMessage } from '@/ui/primitives/banner';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';
import { SettingsView } from '@/ui/settings/settings-view';
import { SheetHeader } from '@/ui/sheet/sheet-header';
import { DeleteConfirmation } from '@/ui/sheet/delete-confirmation';
import { NpcTab } from '@/ui/sheet/npc-tab';
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

// A sheet is named by its record key. The command id ties a rejection to the creation, so a
// refused sheet stops waiting for its tab.
type CreatedSheet = { sheet: string; commandId: string };

// `neighbours` is `null` for a character. For an NPC it holds the NPC after it, then the one
// before it, which take the focus when its block goes.
type DeleteAsk = { sheet: string; request: number; neighbours: readonly string[] | null };

// The command id ties a rejection to the deletion, so a refused one stops waiting.
type DeletingSheet = { sheet: string; commandId: string; neighbours: readonly string[] | null };

// Where the focus goes once the control that held it is gone: the selected tab, the first of
// `neighbours` still listed or else "Добавить NPC", or the "⋯" of a sheet whose deletion failed.
type FocusAfterLoss =
  | { kind: 'tab' }
  | { kind: 'npc'; neighbours: readonly string[] }
  | { kind: 'actions'; sheet: string; tab: string | null };

type WindowRootProps = {
  // The window's own read, shown until the first projection brings the engine's role.
  initialRole: PlayerRole;
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
    const [initialRole] = await Promise.all([
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

    root.render(
      <WindowRoot initialRole={initialRole} store={store} sendCommand={client.sendCommand} />,
    );
  } catch (error) {
    console.error('Muster Roll could not render its window', error);
  }
}

function WindowRoot({ initialRole, store: projection, sendCommand }: WindowRootProps): ReactNode {
  const notices = useStore(projection.$notices);
  const loaded = useStore(projection.$loaded);
  const sync = useStore(projection.$sync);
  // The engine re-reads the role on every party change, so the window follows it.
  const role = loaded ? sync.role : initialRole;
  const records = useStore(projection.$records);
  const rejections = useStore(projection.$rejections);
  const presetData = presetDataOf(records);
  const preset = useMemo(() => decodedPreset(presetData), [presetData]);
  const characters = useMemo(() => liveSheets(records.values(), 'pc'), [records]);
  const npcs = useMemo(() => liveSheets(records.values(), 'npc'), [records]);
  // AD-7: until the first catch-up ends, no data counts as the room's. The tab bar shows what is
  // known and every panel says "Загрузка…", so no empty or no-preset state shows too early.
  const ready = loaded && sync.firstCatchUpDone;
  const catchingUp = sync.state === 'catching-up';
  const presetState: PresetState = !ready ? 'unknown' : preset === null ? 'absent' : 'present';
  // Starts unseen, as a projection can land before the first render, and a preset that came with
  // it must still select the first tab.
  const [seenPresetState, setSeenPresetState] = useState<PresetState>('unknown');
  const [selectedTab, setSelectedTab] = useState(NPC_TAB);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A sheet this window created, until its record arrives and its tab can open.
  const [created, setCreated] = useState<CreatedSheet | null>(null);
  const [focusNameOf, setFocusNameOf] = useState<string | null>(null);
  // The open confirmation. Kept in memory only, so a window that closes forgets it and deletes
  // nothing.
  const [deleteAsk, setDeleteAsk] = useState<DeleteAsk | null>(null);
  const [focusActionsOf, setFocusActionsOf] = useState<string | null>(null);
  const [focusAddNpc, setFocusAddNpc] = useState(false);
  // A sheet this window has confirmed the deletion of, until it is gone or the deletion fails.
  const [deleting, setDeleting] = useState<DeletingSheet | null>(null);
  const [focusAfterLoss, setFocusAfterLoss] = useState<FocusAfterLoss | null>(null);
  const characterTabs = characters.map((sheet) => sheetKey(sheet.sheetId));
  // Kept stable between renders, as the focus effect reads it.
  const npcSheets = useMemo(() => npcs.map((sheet) => sheetKey(sheet.sheetId)), [npcs]);

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

  const clearAddNpcFocus = useCallback(() => {
    setFocusAddNpc(false);
  }, []);

  // The tab that shows a sheet, or `null` for a sheet that is not listed.
  function tabOf(sheet: string): string | null {
    if (characterTabs.includes(sheet)) {
      return sheet;
    }

    return npcSheets.includes(sheet) ? NPC_TAB : null;
  }

  // The NPC after `sheet`, then the one before it, or `null` for a sheet that is not a listed NPC.
  function npcNeighbours(sheet: string): readonly string[] | null {
    const index = npcSheets.indexOf(sheet);

    if (index === -1) {
      return null;
    }

    return [npcSheets[index + 1], npcSheets[index - 1]].filter(
      (neighbour) => neighbour !== undefined,
    );
  }

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

  const createdTab = created === null ? null : tabOf(created.sheet);

  if (created !== null && rejections.has(created.commandId)) {
    setCreated(null);
  } else if (created !== null && createdTab !== null) {
    setCreated(null);

    // A character's tab opens. An NPC lands on its own tab and pulls no GM back to it.
    if (createdTab !== NPC_TAB) {
      shownTab = createdTab;
    }

    if (shownTab === createdTab) {
      setFocusNameOf(created.sheet);
    }
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
  if (deleteAsk !== null && tabOf(deleteAsk.sheet) !== shownTab) {
    setDeleteAsk(null);

    // An NPC deleted elsewhere takes "Отменить" with it, on a tab that stays open.
    if (deleteAsk.neighbours !== null && tabOf(deleteAsk.sheet) === null) {
      setFocusAfterLoss({ kind: 'npc', neighbours: deleteAsk.neighbours });
    }
  }

  // The pressed "Удалить" is gone with its block. A refused deletion leaves the sheet, so the
  // focus goes back to its "⋯".
  if (deleting !== null && tabOf(deleting.sheet) === null) {
    setDeleting(null);
    setFocusAfterLoss(
      deleting.neighbours === null
        ? { kind: 'tab' }
        : { kind: 'npc', neighbours: deleting.neighbours },
    );
  } else if (deleting !== null && rejections.has(deleting.commandId)) {
    setDeleting(null);
    setFocusAfterLoss({ kind: 'actions', sheet: deleting.sheet, tab: tabOf(deleting.sheet) });
  }

  // Applied only to focus that fell to the page body, and only on the tab that lost it, so a
  // target set elsewhere never grabs the focus on a later visit.
  useEffect(() => {
    if (focusAfterLoss === null) {
      return;
    }

    setFocusAfterLoss(null);

    if (document.activeElement !== null && document.activeElement !== document.body) {
      return;
    }

    if (focusAfterLoss.kind === 'tab') {
      focusTab(shownTab);
    } else if (focusAfterLoss.kind === 'actions') {
      if (focusAfterLoss.tab === shownTab) {
        setFocusActionsOf(focusAfterLoss.sheet);
      }
    } else if (shownTab === NPC_TAB) {
      const neighbour = focusAfterLoss.neighbours.find((sheet) => npcSheets.includes(sheet));

      if (neighbour === undefined) {
        setFocusAddNpc(true);
      } else {
        setFocusActionsOf(neighbour);
      }
    }
  }, [focusAfterLoss, shownTab, npcSheets]);

  function askDelete(sheet: string): void {
    const neighbours = npcNeighbours(sheet);

    // A new request remounts the block, so a repeated "Удалить" takes the focus again.
    setDeleteAsk((current) => ({ sheet, request: (current?.request ?? 0) + 1, neighbours }));
  }

  function cancelDelete(sheet: string): void {
    setDeleteAsk(null);
    setFocusActionsOf(sheet);
  }

  function confirmDelete(sheet: SheetSummary): void {
    const key = sheetKey(sheet.sheetId);

    // Closed at once, so a second press on the same block sends no second command.
    setDeleteAsk(null);

    const sent = sendCommand({ type: 'sheet-delete', sheetId: sheet.sheetId });

    if (sent.ok) {
      setDeleting({ sheet: key, commandId: sent.value, neighbours: npcNeighbours(key) });
    } else {
      setFocusActionsOf(key);
    }
  }

  function addSheet(kind: SheetSummary['kind']): void {
    const sheetId = nanoid();

    // The GM has moved on from the open confirmation.
    setDeleteAsk(null);

    const sent = sendCommand({
      type: 'sheet-create',
      sheetId,
      kind,
      name: kind === 'pc' ? copy.newCharacter : copy.newNpc,
    });

    if (sent.ok) {
      setCreated({ sheet: sheetKey(sheetId), commandId: sent.value });
    }
  }

  // The open confirmation, when it asks about `sheet`.
  function confirmationFor(sheet: SheetSummary | undefined): ReactNode {
    if (sheet === undefined || deleteAsk?.sheet !== sheetKey(sheet.sheetId)) {
      return null;
    }

    const asked = deleteAsk.sheet;

    return (
      <DeleteConfirmation
        key={deleteAsk.request}
        name={sheet.name}
        onConfirm={() => {
          confirmDelete(sheet);
        }}
        onCancel={() => {
          cancelDelete(asked);
        }}
      />
    );
  }

  const sheetsExist = hasLiveSheet(records.values());
  const loading = <p>{copy.loading}</p>;

  const settings = (
    <SettingsView
      preset={preset}
      sheetsExist={sheetsExist}
      catchingUp={catchingUp}
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
            disabledReason={uploadDisabledReason(catchingUp, sheetsExist)}
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
          content: !ready ? (
            loading
          ) : (
            <>
              {confirmationFor(sheet)}
              <SheetHeader
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
              onPress: () => {
                addSheet('pc');
              },
            }
          : undefined,
      pinnedTabs: [
        {
          id: NPC_TAB,
          label: copy.place.npc,
          content:
            preset === null || !ready ? (
              loading
            ) : (
              <NpcTab
                npcs={npcs}
                template={preset.npc}
                records={records}
                editing={editing}
                sendCommand={sendCommand}
                store={projection}
                confirmation={confirmationFor(
                  npcs.find((npc) => sheetKey(npc.sheetId) === deleteAsk?.sheet),
                )}
                onAdd={() => {
                  addSheet('npc');
                }}
                onDelete={(npc) => {
                  askDelete(sheetKey(npc.sheetId));
                }}
                focusNameOf={focusNameOf}
                onNameFocused={clearNameFocus}
                focusActionsOf={focusActionsOf}
                onActionsFocused={clearActionsFocus}
                focusAdd={focusAddNpc}
                onAddFocused={clearAddNpcFocus}
              />
            ),
        },
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

// One banner at a time, by the UX-DR24 priority.
function bannerFor(notices: readonly Notice[]): BannerMessage | undefined {
  if (notices.includes('local-save-failed')) {
    return { variant: 'danger', text: copy.localSaveFailed };
  }

  if (notices.includes('new-version')) {
    return { variant: 'warning', text: copy.newVersion };
  }

  return undefined;
}
