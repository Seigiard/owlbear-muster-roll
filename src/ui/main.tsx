import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { canEdit, ownedFirst, ownedSheetIds } from '@/core/access';
import { newSheetId } from '@/core/ids';
import { decodePreset, type Preset } from '@/core/preset';
import { hasLiveSheet, presetDataSchema, type VersionedRecord } from '@/core/records';
import { sheetKey, type SheetSummary } from '@/core/sheets';
import { TIMING } from '@/core/timing';
import { linkedSheetIds } from '@/core/token-links';
import { visibleRecordMap, visibleSheets, type PlayerRole } from '@/core/visibility';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { bannerFor } from '@/ui/banner-message';
import { copy } from '@/ui/copy';
import { PresetUpload, uploadDisabledReason } from '@/ui/preset-actions';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';
import { SettingsView } from '@/ui/settings/settings-view';
import { ReadOnlySheetHeader, SheetHeader } from '@/ui/sheet/sheet-header';
import { DeleteConfirmation } from '@/ui/sheet/delete-confirmation';
import type { DiceRolling } from '@/ui/sheet/dice-button';
import { createLocalFieldValues } from '@/ui/sheet/local-field-values';
import { NpcTab } from '@/ui/sheet/npc-tab';
import { SheetBody } from '@/ui/sheet/sheet-body';
import { createFieldFlushes, type FieldEditing } from '@/ui/sheet/use-field-edit';
import { focusTab, revealTab } from '@/ui/shell/tab-bar';
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

// A sheet "Открыть лист" selected, by its record key, and the tab that shows it. Its tab, or its
// NPC block, scrolls into view once, and takes the focus when the focus was in the window.
type Reveal = { sheet: string; tab: string; focus: boolean };

// Where the focus goes once the control that held it is gone: the selected tab, the first of
// `neighbours` still listed or else "Добавить NPC", or the "⋯" of a sheet whose deletion failed.
type FocusAfterLoss =
  | { kind: 'tab' }
  | { kind: 'npc'; neighbours: readonly string[] }
  | { kind: 'actions'; sheet: string; tab: string | null };

type WindowRootProps = {
  // The window's own read, shown until the first projection brings the engine's role.
  initialRole: PlayerRole;
  // This client's player id, which a player's write access names (FR3).
  playerId: string;
  store: ProjectionStore;
  sendCommand: ReplicaClient['sendCommand'];
  requestRoll: ReplicaClient['requestRoll'];
  acknowledgeOpen: ReplicaClient['acknowledgeOpen'];
};

const container = document.getElementById('root');

if (container === null) {
  throw new Error('index.html has no #root element');
}

const root = createRoot(container);
const store = createProjectionStore();
const pageHideFlushes = createFieldFlushes();
const localFieldValues = createLocalFieldValues();

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    const [initialRole, playerId] = await Promise.all([
      platform.player.getRole(),
      platform.player.getId(),
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
      <WindowRoot
        initialRole={initialRole}
        playerId={playerId}
        store={store}
        sendCommand={client.sendCommand}
        requestRoll={client.requestRoll}
        acknowledgeOpen={client.acknowledgeOpen}
      />,
    );
  } catch (error) {
    console.error('Muster Roll could not render its window', error);
  }
}

function WindowRoot({
  initialRole,
  playerId,
  store: projection,
  sendCommand,
  requestRoll,
  acknowledgeOpen,
}: WindowRootProps): ReactNode {
  const notices = useStore(projection.$notices);
  const loaded = useStore(projection.$loaded);
  const sync = useStore(projection.$sync);
  const roomCopy = useStore(projection.$roomCopy);
  // The engine re-reads the role on every party change, so the window follows it.
  const role = loaded ? sync.role : initialRole;
  const isGm = role === 'GM';
  const allRecords = useStore(projection.$records);
  // Every view reads the records and the sheets through visibility, so no view filters by kind or
  // role on its own.
  const records = useMemo(() => visibleRecordMap(role, allRecords), [role, allRecords]);
  const rejections = useStore(projection.$rejections);
  const openRequest = useStore(projection.$openRequest);
  const presetData = presetDataOf(records);
  const preset = useMemo(() => decodedPreset(presetData), [presetData]);

  // FR19, UX-DR8: a player's own characters come first and carry the mark "вы". A GM owns none.
  const { characters, npcs, owned } = useMemo(() => {
    const visible = visibleSheets(role, records.values());

    const ownedIds =
      role === 'GM' ? new Set<string>() : ownedSheetIds(visible.characters, records, playerId);

    return {
      characters: ownedFirst(visible.characters, ownedIds),
      npcs: visible.npcs,
      owned: ownedIds,
    };
  }, [role, records, playerId]);

  // AD-7: until the first catch-up ends, no data counts as the room's. The tab bar shows what is
  // known and every panel says "Загрузка…", so no empty or no-preset state shows too early.
  const ready = loaded && sync.firstCatchUpDone;
  const catchingUp = sync.state === 'catching-up';
  // A player's data source: a GM client that answered, or a room copy of this generation that a
  // catch-up read with no GM (Story 2.6).
  const dataSourceKnown = sync.gmAnswered || roomCopy.outcome === 'read';
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
  // The id of the last open request this window took, so it takes each one once.
  const [takenOpen, setTakenOpen] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // The token status reads `link:` records only, never the scene (FR18).
  const linkedSheets = useMemo(() => linkedSheetIds(records), [records]);
  const characterTabs = characters.map((sheet) => sheetKey(sheet.sheetId));
  // Kept stable between renders, as the focus effect reads it.
  const npcSheets = useMemo(() => npcs.map((sheet) => sheetKey(sheet.sheetId)), [npcs]);

  const editing = useMemo<FieldEditing>(
    () => ({
      sendCommand,
      $rejections: projection.$rejections,
      pauseMs: TIMING.fieldSavePauseMs,
      pageHideFlushes,
      localValues: localFieldValues,
    }),
    [sendCommand, projection],
  );

  const rolling = useMemo<DiceRolling>(
    () => ({
      requestRoll,
      $rollOutcomes: projection.$rollOutcomes,
      localValues: localFieldValues,
    }),
    [requestRoll, projection],
  );

  const firstTab = characterTabs[0] ?? NPC_TAB;
  // A player has character tabs only (UX-DR8).
  const pinnedTabIds = isGm ? [NPC_TAB, SETTINGS_TAB] : [];

  const clearNameFocus = useCallback(() => {
    setFocusNameOf(null);
  }, []);

  const clearActionsFocus = useCallback(() => {
    setFocusActionsOf(null);
  }, []);

  const clearAddNpcFocus = useCallback(() => {
    setFocusAddNpc(false);
  }, []);

  const clearReveal = useCallback(() => {
    setReveal(null);
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

  // A player creates and deletes nothing, so a demotion drops what this window waited for and
  // meant to focus, and a later promotion starts clean, with the gear toggle off.
  const awaitedCreate = isGm ? created : null;
  const awaitedDelete = isGm ? deleting : null;

  if (
    !isGm &&
    (settingsOpen ||
      created !== null ||
      deleting !== null ||
      focusNameOf !== null ||
      focusActionsOf !== null ||
      focusAddNpc)
  ) {
    setSettingsOpen(false);
    setCreated(null);
    setDeleting(null);
    setFocusNameOf(null);
    setFocusActionsOf(null);
    setFocusAddNpc(false);
  }

  const createdTab = awaitedCreate === null ? null : tabOf(awaitedCreate.sheet);
  // The sheet whose name field takes the focus, as this render leaves it.
  let nameFocus = focusNameOf;

  if (awaitedCreate !== null && rejections.has(awaitedCreate.commandId)) {
    setCreated(null);
  } else if (awaitedCreate !== null && createdTab !== null) {
    setCreated(null);

    // A character's tab opens. An NPC lands on its own tab and pulls no GM back to it.
    if (createdTab !== NPC_TAB) {
      shownTab = createdTab;
    }

    if (shownTab === createdTab) {
      setFocusNameOf(awaitedCreate.sheet);
      nameFocus = awaitedCreate.sheet;
    }
  }

  // FR14: "Открыть лист" selects the sheet's tab once the room's data is in, so the first tab of a
  // window that has just opened does not take the selection back. The engine sends only a sheet this
  // role sees. One this window does not list, as after a change on the way, selects nothing, and is
  // still taken, so no other window gets it.
  if (ready && openRequest !== null && openRequest.id !== takenOpen) {
    const sheet = sheetKey(openRequest.sheetId);
    const tab = tabOf(sheet);

    setTakenOpen(openRequest.id);

    if (tab !== null) {
      shownTab = tab;

      // The NPC tab mounts its blocks only with a preset, so with none no block waits to scroll and
      // a later visit does not scroll to it.
      if (preset !== null) {
        setReveal({ sheet, tab, focus: focusInWindow() });
      }

      // A name field on another tab would take the focus away from the opened sheet.
      if (nameFocus !== null && tabOf(nameFocus) !== tab) {
        setFocusNameOf(null);
      }
    }
  }

  // A selected sheet that disappears, or a tab the role does not have, hands the selection to the
  // first tab (UX-DR9).
  if (!characterTabs.includes(shownTab) && !pinnedTabIds.includes(shownTab)) {
    shownTab = firstTab;
  }

  if (shownTab !== selectedTab) {
    setSelectedTab(shownTab);
  }

  // Another tab, a sheet deleted elsewhere, or a role that cannot delete closes the confirmation
  // for good, so returning to the tab does not bring it back.
  if (deleteAsk !== null && (!isGm || tabOf(deleteAsk.sheet) !== shownTab)) {
    setDeleteAsk(null);

    // An NPC deleted elsewhere takes "Отменить" with it, on a tab that stays open.
    if (isGm && deleteAsk.neighbours !== null && tabOf(deleteAsk.sheet) === null) {
      setFocusAfterLoss({ kind: 'npc', neighbours: deleteAsk.neighbours });
    }
  }

  // The pressed "Удалить" is gone with its block. A refused deletion leaves the sheet, so the
  // focus goes back to its "⋯".
  if (awaitedDelete !== null && tabOf(awaitedDelete.sheet) === null) {
    setDeleting(null);
    setFocusAfterLoss(
      awaitedDelete.neighbours === null
        ? { kind: 'tab' }
        : { kind: 'npc', neighbours: awaitedDelete.neighbours },
    );
  } else if (awaitedDelete !== null && rejections.has(awaitedDelete.commandId)) {
    setDeleting(null);
    setFocusAfterLoss({
      kind: 'actions',
      sheet: awaitedDelete.sheet,
      tab: tabOf(awaitedDelete.sheet),
    });
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

  // Taken: the engine drops the request, so a reload or another window does not open it again.
  useEffect(() => {
    if (takenOpen !== null) {
      acknowledgeOpen(takenOpen);
    }
  }, [takenOpen, acknowledgeOpen]);

  // A character's tab scrolls into view in the bar. The NPC tab is pinned and always in view, so
  // the NPC tab scrolls its block instead.
  useEffect(() => {
    if (reveal === null || reveal.tab === NPC_TAB) {
      return;
    }

    setReveal(null);
    revealTab(reveal.tab);

    // The tab switched under the focus, so the focus follows it and the tab is announced.
    if (reveal.focus) {
      focusTab(reveal.tab, { preventScroll: true });
    }
  }, [reveal]);

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
    // The engine refuses an id that the room holds as a sheet, deleted ones included, or that a live
    // record such as an orphan row names, so a collision takes over nothing.
    const sheetId = newSheetId();

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
      roomCopy={roomCopy}
      sendCommand={sendCommand}
      store={projection}
    />
  );

  const layout = ((): ShellLayout => {
    if (!isGm) {
      return playerLayout();
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
                kind="pc"
                playerId={playerId}
                sheetId={sheet.sheetId}
                name={sheet.name}
                tokenLinked={linkedSheets.has(sheet.sheetId)}
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
                  rolling={rolling}
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
                linkedSheets={linkedSheets}
                editing={editing}
                rolling={rolling}
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
                reveal={reveal?.tab === NPC_TAB ? reveal : null}
                onRevealed={clearReveal}
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

  // UX-DR10, UX-DR27: character tabs only, each read-only. Both empty-state texts need a data
  // source, `dataSourceKnown`.
  //
  // Story 2.6: with no data source and no GM, the room copy's outcome says why. A copy of a newer
  // build keeps loading, as its banner already asks for a reload.
  function noSourceContent(): ReactNode {
    if (!ready || sync.gmLink !== 'offline') {
      return loading;
    }

    if (roomCopy.outcome === 'none') {
      return <p>{copy.playerNoGmNoData}</p>;
    }

    if (roomCopy.outcome === 'unreadable') {
      return <p>{copy.roomCopyUnreadable}</p>;
    }

    return loading;
  }

  function playerLayout(): ShellLayout {
    if (ready && preset === null) {
      return {
        kind: 'plain',
        content: dataSourceKnown ? <p>{copy.playerNoPreset}</p> : noSourceContent(),
      };
    }

    // A preset from a partial answer proves no GM said there are no characters.
    if (characters.length === 0) {
      return {
        kind: 'plain',
        content: ready && dataSourceKnown ? <p>{copy.playerNoCharacters}</p> : noSourceContent(),
      };
    }

    return {
      kind: 'tabs',
      selectedTab: shownTab,
      onSelectTab: setSelectedTab,
      scrollingTabs: characters.map((sheet) => ({
        id: sheetKey(sheet.sheetId),
        label: sheet.name,
        mark: owned.has(sheet.sheetId) ? copy.ownMark : undefined,
        content:
          !ready || preset === null ? (
            loading
          ) : (
            <>
              <ReadOnlySheetHeader
                name={sheet.name}
                canEdit={canEdit(records, sheet.sheetId, playerId)}
              />
              <SheetBody
                template={preset.character}
                sheetId={sheet.sheetId}
                records={records}
                editing={null}
                rolling={rolling}
              />
            </>
          ),
      })),
      pinnedTabs: [],
    };
  }

  return <WindowShell layout={layout} banner={bannerFor(notices, sync)} />;
}

// True when the focus is on a control of this window, not on its body or outside it.
function focusInWindow(): boolean {
  const active = document.activeElement;

  return active !== null && active !== document.body && active !== document.documentElement;
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
