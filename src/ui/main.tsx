import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { playerMayEdit, playerMayEditField } from '@/core/access';
import { newSheetId } from '@/core/ids';
import { openTabIndex, type SheetSetTemplate } from '@/core/preset';
import { isSheetSet, sheetKey } from '@/core/sheets';
import { TIMING } from '@/core/timing';
import { linkTargetKey, repeatBlockTabIndex, type LinkTarget } from '@/core/link-target';
import {
  selectionMarks,
  selectionStep,
  tokensByTarget,
  type SelectionStep,
} from '@/core/token-selection';
import { tabShownTo, type PlayerRole } from '@/core/visibility';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { bannerFor } from '@/ui/banner-message';
import { copy } from '@/ui/copy';
import { watchMapSelection, type MapSelection } from '@/ui/map-selection';
import { createPendingMarks, type PendingMarks } from '@/ui/pending-marks';
import { PresetUpload, uploadDisabledReason } from '@/ui/preset-actions';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import {
  startReplicaClient,
  type CommandOutcomePromise,
  type ReplicaClient,
} from '@/ui/replica-client';
import { SettingsView } from '@/ui/settings/settings-view';
import { DeleteConfirmation } from '@/ui/sheet/delete-confirmation';
import type { DiceRolling } from '@/ui/sheet/dice-button';
import { createLocalFieldValues } from '@/ui/sheet/local-field-values';
import { MapSelectionContext, type MapSelectionView } from '@/ui/sheet/map-toggle';
import { sheetPendingOf, type SheetPending } from '@/ui/sheet/pending-mark';
import type { BlockTools } from '@/ui/sheet/preset-section';
import { SheetBody } from '@/ui/sheet/sheet-body';
import { SheetHeader } from '@/ui/sheet/sheet-header';
import { createFieldFlushes, type FieldEditing } from '@/ui/sheet/use-field-edit';
import { sidebarEntries, type SidebarEntries, type SidebarSheet } from '@/ui/shell/sidebar-entries';
import {
  focusSidebarEntry,
  revealSidebarEntry,
  templateIndexFromKey,
  templateTabKey,
  templateTabLabel,
  type WindowFrameLayout,
} from '@/ui/shell/window-frame';
import type { ShellTab } from '@/ui/shell/tab-bar';
import { WindowFrame } from '@/ui/shell/window-frame';
import { followTheme } from '@/ui/theme';
import { useWindowView } from '@/ui/window-view';

import './main.css';

const SETTINGS_TAB = 'settings';

type PresetState = 'unknown' | 'absent' | 'present';

// A sheet is named by its tab id, the `sheet:` key form of its id. The outcome stops waiting when
// the engine refuses or times out the creation.
type CreatedSheet = { sheet: string; outcome: CommandOutcomePromise<undefined> };

type DeleteAsk = { sheet: string; request: number };

// The outcome stops waiting when the engine refuses or times out the deletion.
type DeletingSheet = { sheet: string; outcome: CommandOutcomePromise<undefined> };

// FR14: the tab "Открыть лист" selected. It scrolls into view in the bar once, and takes the focus
// when the focus was in the window and no repeat block takes it.
type TabReveal = { tab: string; focus: boolean };

// FR14: the repeat block "Открыть лист" asked for, on the tab of `sheet`. Its sheet's body scrolls
// it into view once.
type BlockRevealRequest = { sheet: string; instanceId: string; focus: boolean };

// Where the focus goes once the control that held it is gone: the selected tab, or the "⋯" of a
// sheet whose deletion failed.
type FocusAfterLoss = { kind: 'tab' } | { kind: 'actions'; sheet: string; tab: string | null };

type WindowRootProps = {
  // The window's own read, shown until the first projection brings the engine's role.
  initialRole: PlayerRole;
  // This client's player id, which a player's write access names (FR3).
  playerId: string;
  store: ProjectionStore;
  // UX-DR3: which of a player's waiting edits show "Ожидает" by now.
  pendingMarks: PendingMarks;
  // CAP-32: this client's map selection and the items of the open scene.
  mapSelection: MapSelection;
  sendCommand: ReplicaClient['sendCommand'];
  requestPresetDiff: ReplicaClient['requestPresetDiff'];
  requestSnapshotCheck: ReplicaClient['requestSnapshotCheck'];
  requestRoll: ReplicaClient['requestRoll'];
  acknowledgeOpen: ReplicaClient['acknowledgeOpen'];
};

type SheetFrameParts = { header: ReactNode; body: ReactNode };

const container = document.getElementById('root');

if (container === null) {
  throw new Error('index.html has no #root element');
}

const root = createRoot(container);
const store = createProjectionStore();

const pendingMarks = createPendingMarks({
  $pending: store.$pending,
  $sync: store.$sync,
  delayMs: TIMING.pendingMarkDelayMs,
});

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

    const mapSelection = watchMapSelection(platform.selection, platform.scene);

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
        pendingMarks={pendingMarks}
        mapSelection={mapSelection}
        sendCommand={client.sendCommand}
        requestPresetDiff={client.requestPresetDiff}
        requestSnapshotCheck={client.requestSnapshotCheck}
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
  pendingMarks: marks,
  mapSelection,
  sendCommand,
  requestPresetDiff,
  requestSnapshotCheck,
  requestRoll,
  acknowledgeOpen,
}: WindowRootProps): ReactNode {
  const notices = useStore(projection.$notices);
  const loaded = useStore(projection.$loaded);
  const sync = useStore(projection.$sync);
  const roomCopy = useStore(projection.$roomCopy);
  const { role, preset, records, links } = useWindowView(projection, initialRole);
  const isGm = role === 'GM';

  const pendingEntries = useStore(projection.$pending);
  const marked = useStore(marks.$marked);
  const openRequest = useStore(projection.$openRequest);

  // AD-7: until the first catch-up ends, no data counts as the room's. The sidebar shows what is
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
  const [selectedTab, setSelectedTab] = useState(SETTINGS_TAB);
  // A sheet this window created, until its record arrives and its tab can open.
  const [created, setCreated] = useState<CreatedSheet | null>(null);
  const [focusNameOf, setFocusNameOf] = useState<string | null>(null);
  // The open confirmation. Kept in memory only, so a window that closes forgets it and deletes
  // nothing.
  const [deleteAsk, setDeleteAsk] = useState<DeleteAsk | null>(null);
  const [focusActionsOf, setFocusActionsOf] = useState<string | null>(null);
  // A sheet this window has confirmed the deletion of, until it is gone or the deletion fails.
  const [deleting, setDeleting] = useState<DeletingSheet | null>(null);
  const [focusAfterLoss, setFocusAfterLoss] = useState<FocusAfterLoss | null>(null);
  // The id of the last open request this window took, so it takes each one once.
  const [takenOpen, setTakenOpen] = useState<string | null>(null);
  const [tabReveal, setTabReveal] = useState<TabReveal | null>(null);
  const [blockReveal, setBlockReveal] = useState<BlockRevealRequest | null>(null);

  // CAP-34, AD-26: the template tab this window chose on each sheet, by the sheet's tab id. It is
  // client UI state: it never enters a record, a message or a snapshot.
  const [chosenTemplateTabs, setChosenTemplateTabs] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );

  const targetTokens = useMemo(() => tokensByTarget(links), [links]);
  const linkedTargets = useMemo(() => new Set(targetTokens.keys()), [targetTokens]);
  const mapSelected = useStore(mapSelection.$selection);
  const sceneItems = useStore(mapSelection.$sceneItems);
  // CAP-32: the marks follow this client's own selection through the links this role sees.
  const mapMarks = useMemo(() => selectionMarks(links, mapSelected), [links, mapSelected]);

  const sidebar = useMemo<SidebarEntries>(
    () => sidebarEntries(role, preset, records, playerId, mapMarks.sheetIds),
    [role, preset, records, playerId, mapMarks.sheetIds],
  );

  const tabs = useMemo(
    () =>
      sidebar.sections.flatMap((section) =>
        section.kind === 'single' ? [section.sheet] : [...section.sheets],
      ),
    [sidebar],
  );

  const tabIds = tabs.map((tab) => tab.id);

  // UX-DR28: each sheet gets only its own waiting edits and marks.
  const pendingBySheet = useMemo(() => {
    const pending: SheetPending = { entries: pendingEntries, marked };

    return new Map(tabs.map((tab) => [tab.sheetId, sheetPendingOf(pending, tab.sheetId)]));
  }, [pendingEntries, marked, tabs]);

  const mapView = useMemo<MapSelectionView>(
    () => ({
      marked: mapMarks.targets,
      // Selecting tokens from the window is GM-only.
      selector: isGm
        ? {
            stepFor: (target: LinkTarget) =>
              selectionStep(targetTokens.get(linkTargetKey(target)) ?? [], sceneItems, mapSelected),
            take: (step: SelectionStep) => {
              const write =
                step.kind === 'select'
                  ? platform.selection.select(step.tokenIds)
                  : platform.selection.deselect(step.tokenIds);

              write.catch((error) => {
                console.error('Muster Roll could not change the map selection', error);
              });
            },
          }
        : null,
    }),
    [mapMarks, isGm, targetTokens, sceneItems, mapSelected],
  );

  const editing = useMemo<FieldEditing>(
    () => ({
      sendCommand,
      pauseMs: TIMING.fieldSavePauseMs,
      pageHideFlushes,
      localValues: localFieldValues,
    }),
    [sendCommand, projection],
  );

  const presetClient = useMemo(
    () => ({ sendCommand, requestPresetDiff, requestSnapshotCheck }),
    [sendCommand, requestPresetDiff, requestSnapshotCheck],
  );

  const rolling = useMemo<DiceRolling>(
    () => ({
      requestRoll,
      localValues: localFieldValues,
    }),
    [requestRoll, projection],
  );

  const blockTools = useMemo<BlockTools>(
    () => ({
      sendCommand: (command) => sendCommand(command),
      linkedTargets,
    }),
    [sendCommand, linkedTargets],
  );

  // A GM with no sheet lands on Settings. A player with none has no sidebar entry.
  const firstTab = tabIds[0] ?? SETTINGS_TAB;
  const pinnedTabIds = isGm ? [SETTINGS_TAB] : [];

  const clearNameFocus = useCallback(() => {
    setFocusNameOf(null);
  }, []);

  const clearActionsFocus = useCallback(() => {
    setFocusActionsOf(null);
  }, []);

  const clearBlockReveal = useCallback(() => {
    setBlockReveal(null);
  }, []);

  // The sidebar entry that shows a sheet, or `null` for a sheet that is not listed. Every sheet has
  // its own entry.
  function tabOf(sheet: string): string | null {
    return tabIds.includes(sheet) ? sheet : null;
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
  // meant to focus, and a later promotion starts clean.
  const awaitedCreate = isGm ? created : null;
  const awaitedDelete = isGm ? deleting : null;

  useEffect(() => {
    if (created === null) {
      return;
    }

    let active = true;

    void created.outcome
      .then((outcome) => {
        if (active && outcome.kind !== 'answered') {
          setCreated(null);
        }
      })
      .catch((error) => {
        console.error('Muster Roll could not settle sheet creation', error);
      });

    return () => {
      active = false;
    };
  }, [created]);

  useEffect(() => {
    if (deleting === null) {
      return;
    }

    let active = true;

    void deleting.outcome
      .then((outcome) => {
        if (active && outcome.kind !== 'answered') {
          setDeleting(null);
          setFocusAfterLoss({ kind: 'actions', sheet: deleting.sheet, tab: tabOf(deleting.sheet) });
        }
      })
      .catch((error) => {
        console.error('Muster Roll could not settle sheet deletion', error);
      });

    return () => {
      active = false;
    };
  }, [deleting]);

  if (
    !isGm &&
    (created !== null || deleting !== null || focusNameOf !== null || focusActionsOf !== null)
  ) {
    setCreated(null);
    setDeleting(null);
    setFocusNameOf(null);
    setFocusActionsOf(null);
  }

  // The sheet whose name takes the focus, as this render leaves it.
  let nameFocus = focusNameOf;

  if (awaitedCreate !== null && tabOf(awaitedCreate.sheet) !== null) {
    // UX: a new sheet's tab opens and its name takes the focus.
    setCreated(null);
    shownTab = awaitedCreate.sheet;
    setFocusNameOf(awaitedCreate.sheet);
    nameFocus = awaitedCreate.sheet;
  }

  // FR14: "Открыть лист" selects the sheet's tab once the room's data is in, so the first tab of a
  // window that has just opened does not take the selection back. The engine sends only a target
  // this role sees. One this window does not list, as after a change on the way, selects nothing,
  // and is still taken, so no other window gets it.
  if (ready && openRequest !== null && openRequest.id !== takenOpen) {
    const sheet = sheetKey(openRequest.sheetId);
    const tab = tabOf(sheet);
    const focus = focusInWindow();

    setTakenOpen(openRequest.id);

    if (tab !== null) {
      shownTab = tab;

      // A repeat block takes the focus itself, once its sheet's body has it. With no preset no
      // body mounts, so no repeat block waits to scroll and a later visit does not scroll to it.
      const block =
        openRequest.instanceId === null || preset === null ? null : openRequest.instanceId;

      setTabReveal({ tab, focus: focus && block === null });
      setBlockReveal(block === null ? null : { sheet, instanceId: block, focus });

      // A repeat block opens on the template tab that holds its repeat section.
      const template = tabs.find((listed) => listed.id === tab)?.policy.template;

      const blockTab =
        block === null || template === undefined
          ? null
          : repeatBlockTabIndex(records.values(), template, openRequest.sheetId, block);

      if (blockTab !== null) {
        chooseTemplateTab(tab, blockTab);
      }

      // A name on another tab would take the focus away from the opened sheet.
      if (nameFocus !== null && nameFocus !== tab) {
        setFocusNameOf(null);
      }
    }
  }

  // A selected sheet that disappears, or a tab the role does not have, hands the selection to the
  // first tab (UX-DR9).
  if (!tabIds.includes(shownTab) && !pinnedTabIds.includes(shownTab)) {
    shownTab = firstTab;
  }

  if (shownTab !== selectedTab) {
    setSelectedTab(shownTab);
  }

  // A repeat block waits for its own tab only, so a later visit does not scroll to it.
  if (blockReveal !== null && blockReveal.sheet !== shownTab) {
    setBlockReveal(null);
  }

  // Another tab, a sheet deleted elsewhere, or a role that cannot delete closes the confirmation
  // for good, so returning to the tab does not bring it back.
  if (deleteAsk !== null && (!isGm || tabOf(deleteAsk.sheet) !== shownTab)) {
    setDeleteAsk(null);
  }

  // The pressed "Удалить" is gone with its tab. A refused deletion leaves the sheet, so the focus
  // goes back to its "⋯".
  if (awaitedDelete !== null && tabOf(awaitedDelete.sheet) === null) {
    setDeleting(null);
    setFocusAfterLoss({ kind: 'tab' });
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
      focusSidebarEntry(shownTab);
    } else if (focusAfterLoss.tab === shownTab) {
      setFocusActionsOf(focusAfterLoss.sheet);
    }
  }, [focusAfterLoss, shownTab]);

  // Taken: the engine drops the request, so a reload or another window does not open it again.
  useEffect(() => {
    if (takenOpen !== null) {
      acknowledgeOpen(takenOpen);
    }
  }, [takenOpen, acknowledgeOpen]);

  // An opened sheet's tab scrolls into view in the bar.
  useEffect(() => {
    if (tabReveal === null) {
      return;
    }

    setTabReveal(null);
    revealSidebarEntry(tabReveal.tab);

    // The tab switched under the focus, so the focus follows it and the tab is announced.
    if (tabReveal.focus) {
      focusSidebarEntry(tabReveal.tab, { preventScroll: true });
    }
  }, [tabReveal]);

  function chooseTemplateTab(sheet: string, index: number): void {
    setChosenTemplateTabs((current) => new Map(current).set(sheet, index));
  }

  // AD-26: the chosen tab stays while this role sees it; otherwise the first tab this role sees, else
  // none.
  function visibleTemplateTabIndexes(tab: SidebarSheet): number[] {
    return tab.policy.template.tabs.flatMap((_tab, index) =>
      tabShownTo(role, tab.policy.template, index) ? [index] : [],
    );
  }

  function openTemplateTab(tab: SidebarSheet): number | null {
    return openTabIndex(tab.policy.template, chosenTemplateTabs.get(tab.id), (index) =>
      tabShownTo(role, tab.policy.template, index),
    );
  }

  function templateTabHasSelection(tab: SidebarSheet, index: number): boolean {
    return [...links.values()].some(
      (live) =>
        live.target.sheetId === tab.sheetId &&
        live.target.instanceId !== null &&
        mapMarks.targets.has(linkTargetKey(live.target)) &&
        repeatBlockTabIndex(
          records.values(),
          tab.policy.template,
          tab.sheetId,
          live.target.instanceId,
        ) === index,
    );
  }

  function askDelete(sheet: string): void {
    // A new request remounts the block, so a repeated "Удалить" takes the focus again.
    setDeleteAsk((current) => ({ sheet, request: (current?.request ?? 0) + 1 }));
  }

  function cancelDelete(sheet: string): void {
    setDeleteAsk(null);
    setFocusActionsOf(sheet);
  }

  function confirmDelete(tab: SidebarSheet): void {
    // Closed at once, so a second press sends no second command.
    setDeleteAsk(null);

    setDeleting({
      sheet: tab.id,
      outcome: sendCommand({ type: 'sheet-delete', sheetId: tab.sheetId }),
    });
  }

  // CAP-17: a new sheet of the sheet set, with an empty name.
  function addSheet(set: SheetSetTemplate): void {
    // The engine refuses an id that the room holds as a sheet, deleted ones included, that a live
    // record such as an orphan row names, or that is a template id, so a collision takes over
    // nothing.
    const sheetId = newSheetId();

    // The GM has moved on from the open confirmation.
    setDeleteAsk(null);

    setCreated({
      sheet: sheetKey(sheetId),
      outcome: sendCommand({ type: 'sheet-create', sheetId, set: set.id }),
    });
  }

  // The open confirmation, when it asks about `tab`.
  function confirmationFor(tab: SidebarSheet): ReactNode {
    if (deleteAsk?.sheet !== tab.id) {
      return null;
    }

    return (
      <DeleteConfirmation
        key={deleteAsk.request}
        name={tab.name === '' ? copy.unnamed : tab.name}
        onConfirm={() => {
          confirmDelete(tab);
        }}
        onCancel={() => {
          cancelDelete(tab.id);
        }}
      />
    );
  }

  const loading = <p>{copy.loading}</p>;

  // A GM edits every sheet. A sheet of a sheet set has the access panel when its template is
  // visible, and "Удалить". A linkable template shows its token status.
  function gmSheetParts(tab: SidebarSheet, openTab: number | null): SheetFrameParts {
    const { policy } = tab;
    const ofSet = isSheetSet(policy.template);

    return {
      header: (
        <>
          {confirmationFor(tab)}
          <SheetHeader
            key={tab.id}
            sheetId={tab.sheetId}
            name={tab.name}
            nameField={policy.nameField}
            records={records}
            editing={editing}
            status={null}
            gm={{
              playerId,
              access: ofSet && !policy.hidden,
              tokenLinked: policy.linkable ? linkedTargets.has(tab.sheetId) : null,
              onDelete: ofSet
                ? () => {
                    askDelete(tab.id);
                  }
                : null,
              focusActions: focusActionsOf === tab.id,
              onActionsFocused: clearActionsFocus,
              sendCommand,
              store: projection,
            }}
            focusName={focusNameOf === tab.id}
            onNameFocused={clearNameFocus}
          />
        </>
      ),
      body: (
        <SheetBody
          template={policy.template}
          sheetId={tab.sheetId}
          openTab={openTab}
          records={records}
          editing={editing}
          rolling={rolling}
          pending={null}
          blockTools={blockTools}
          reveal={blockReveal?.sheet === tab.id ? blockReveal : null}
          onRevealed={clearBlockReveal}
        />
      ),
    };
  }

  // FR3: a live `acl:`, or a player-editable single sheet, makes the fields editable and shows the
  // repeat block controls. Each edit waits for a GM client's check (AD-4), and the pending view
  // shows it meanwhile.
  function playerSheetParts(tab: SidebarSheet, openTab: number | null): SheetFrameParts {
    const mayEdit = playerMayEdit(tab.policy, records, playerId);

    const headerMayEdit =
      tab.policy.nameField !== null &&
      playerMayEditField(tab.policy, records, playerId, {
        kind: 'row',
        rowId: tab.policy.nameField.rowId,
      });

    return {
      header: (
        <SheetHeader
          key={tab.id}
          sheetId={tab.sheetId}
          name={tab.name}
          nameField={tab.policy.nameField}
          records={records}
          editing={headerMayEdit ? editing : null}
          status={mayEdit ? 'can-edit' : 'read-only'}
          gm={null}
          focusName={false}
          onNameFocused={clearNameFocus}
        />
      ),
      body: (
        <SheetBody
          template={tab.policy.template}
          sheetId={tab.sheetId}
          openTab={openTab}
          records={records}
          editing={mayEdit ? editing : null}
          rolling={rolling}
          pending={pendingBySheet.get(tab.sheetId) ?? null}
          reveal={blockReveal?.sheet === tab.id ? blockReveal : null}
          onRevealed={clearBlockReveal}
        />
      ),
    };
  }

  const settings = (
    <SettingsView
      records={records}
      preset={preset}
      catchingUp={catchingUp}
      roomCopy={roomCopy}
      client={presetClient}
    />
  );

  // UX-DR10, UX-DR27: the visible tabs, each read-only unless the player may edit it. Both
  // empty-state texts need a data source, `dataSourceKnown`.
  //
  // Story 2.6: with no data source and no GM, the room copy's outcome says why. A copy of a newer
  // build keeps loading, as its banner already asks for a reload. A copy of an older format is one
  // this build does not read (AD-12).
  function noSourceContent(): ReactNode {
    if (!ready || sync.gmLink !== 'offline') {
      return loading;
    }

    if (roomCopy.outcome === 'none') {
      return <p>{copy.playerNoGmNoData}</p>;
    }

    if (roomCopy.outcome === 'unreadable' || roomCopy.outcome === 'older') {
      return <p>{copy.roomCopyUnreadable}</p>;
    }

    return loading;
  }

  function frameLayout(): WindowFrameLayout {
    const sheet = tabs.find((tab) => tab.id === shownTab) ?? null;
    const settingsSelected = isGm && shownTab === SETTINGS_TAB;
    const contentFor = isGm ? gmSheetParts : playerSheetParts;
    const openTab = sheet === null ? null : openTemplateTab(sheet);
    const visibleIndexes = sheet === null ? [] : visibleTemplateTabIndexes(sheet);

    const shellTabs: ShellTab[] =
      sheet === null
        ? []
        : visibleIndexes.map((index) => {
            const templateTab = sheet.policy.template.tabs[index];

            return {
              id: templateTabKey(index),
              label: templateTabLabel(templateTab?.title),
              selectedOnMap: templateTabHasSelection(sheet, index),
            };
          });

    const sheetParts =
      sheet === null || !ready || preset === null ? null : contentFor(sheet, openTab);

    let content: ReactNode;

    if (settingsSelected) {
      content = presetState === 'unknown' ? loading : settings;
    } else if (sheet !== null) {
      content = sheetParts?.body ?? loading;
    } else if (isGm) {
      content =
        presetState === 'absent' ? (
          <PresetUpload
            client={presetClient}
            catchingUp={catchingUp}
            disabledReason={uploadDisabledReason(catchingUp)}
          />
        ) : (
          settings
        );
    } else if (ready && preset === null) {
      content = dataSourceKnown ? <p>{copy.playerNoPreset}</p> : noSourceContent();
    } else {
      content =
        tabs.length === 0 && ready && dataSourceKnown ? (
          <p>{copy.playerNoSheets}</p>
        ) : (
          noSourceContent()
        );
    }

    return {
      sidebar,
      selectedSidebarEntry: shownTab,
      onSelectSidebarEntry: (id) => {
        setSelectedTab(id === SETTINGS_TAB ? SETTINGS_TAB : id);
      },
      onAddSidebarEntry:
        isGm && presetState === 'present'
          ? (setId) => {
              const set = preset?.templates.find(
                (template): template is SheetSetTemplate =>
                  template.id === setId && isSheetSet(template),
              );

              if (set !== undefined) {
                addSheet(set);
              }
            }
          : undefined,
      settings: isGm
        ? {
            id: SETTINGS_TAB,
            label: copy.place.settings,
            accessibleName: copy.place.settings,
          }
        : undefined,
      tabs: shellTabs,
      selectedTab: openTab === null ? null : templateTabKey(openTab),
      onSelectTab: (id) => {
        const index = templateIndexFromKey(id);

        if (sheet !== null && index !== null && tabShownTo(role, sheet.policy.template, index)) {
          chooseTemplateTab(sheet.id, index);
        }
      },
      panelLabel: sheet === null ? undefined : sheet.name === '' ? copy.unnamed : sheet.name,
      header: sheetParts?.header,
      content,
    };
  }

  return (
    <MapSelectionContext value={mapView}>
      <WindowFrame layout={frameLayout()} banner={bannerFor(notices, sync)} />
    </MapSelectionContext>
  );
}

// True when the focus is on a control of this window, not on its body or outside it.
function focusInWindow(): boolean {
  const active = document.activeElement;

  return active !== null && active !== document.body && active !== document.documentElement;
}
