import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { playerMayEdit, playerMayEditField } from '@/core/access';
import {
  blockAddress,
  childAddress,
  sameAddress,
  scopePathOf,
  sheetRootAddress,
  type BlockAddress,
} from '@/core/block-address';
import { newInstanceId, newSheetId } from '@/core/ids';
import { openTabIndex, type RenderedTab, type SheetSetTemplate } from '@/core/preset';
import { renderedTabs as renderTabs, sameRenderedTab } from '@/core/rendered-tabs';
import { isSheetSet, sheetKey } from '@/core/sheets';
import { TIMING } from '@/core/timing';
import {
  linkTargetKey,
  repeatBlockTabIndex,
  tokenCellPlace,
  type LinkTarget,
} from '@/core/link-target';
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
import { copy } from '@/copy';
import { watchMapSelection, type MapSelection } from '@/ui/map-selection';
import { createPendingMarks, type PendingMarks } from '@/ui/pending-marks';
import { PresetUpload, uploadDisabledReason } from '@/ui/preset-actions';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';
import { initialState, SETTINGS_TAB, transition, type TemplateTabSelection } from '@/ui/navigation';
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
  templateTabKey,
  templateTabLabel,
  type WindowFrameLayout,
} from '@/ui/shell/window-frame';
import type { ShellTab } from '@/ui/shell/tab-bar';
import { WindowFrame } from '@/ui/shell/window-frame';
import { followTheme } from '@/ui/theme';
import { useWindowView } from '@/ui/window-view';
import { LINK_PICKER_POPOVER_ID, tokenCellPickerUrl } from '@/core/token-links';

import './main.css';

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
    const [initialRoleResult, playerId] = await Promise.all([
      platform.player.getRole(),
      platform.player.getId(),
      followTheme(platform.theme, document.documentElement),
    ]);

    if (!initialRoleResult.isOk()) {
      throw initialRoleResult.error;
    }

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
        initialRole={initialRoleResult.value}
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
  const diagnostics = useStore(projection.$diagnostics);
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
  const presetState = !ready ? 'unknown' : preset === null ? 'absent' : 'present';
  const [navigation, dispatch] = useReducer(transition, initialState);

  const [creatingBlock, setCreatingBlock] = useState<{
    sheet: string;
    block: BlockAddress;
  } | null>(null);

  // CAP-34, AD-26: the template tab this window chose on each sheet, by the sheet's tab id. It is
  // client UI state: it never enters a record, a message or a snapshot.
  const {
    selectedTab,
    chosenTemplateTabs,
    deleteAsk,
    focusNameOf,
    focusActionsOf,
    focusAfterLoss,
    takenOpen,
    tabReveal,
    blockReveal,
  } = navigation;

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

  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

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
    [sendCommand],
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
    [requestRoll],
  );

  const blockTools = useMemo<BlockTools>(
    () => ({
      sendCommand: (command) => sendCommand(command),
      linkedTargets,
      open: (target) => {
        void platform.popover
          .open({
            id: LINK_PICKER_POPOVER_ID,
            url: tokenCellPickerUrl(target),
            width: 320,
            height: 420,
          })
          .catch((error) => {
            console.error('Muster Roll could not open the token-cell picker', error);
          });
      },
    }),
    [sendCommand, linkedTargets],
  );

  // A projection effect keeps reducer state aligned with the facts needed by navigation. The
  // selected sidebar entry remains derived here when the role no longer lists it.
  useEffect(() => {
    dispatch({ type: 'projection', isGm, tabIds, presetState });
  }, [isGm, presetState, tabIds]);

  const firstTab = tabIds[0] ?? SETTINGS_TAB;
  const pinnedTabIds = isGm ? [SETTINGS_TAB] : [];
  let shownTab = selectedTab;

  // A selected sheet that disappears, or a tab the role does not have, hands the selection to the
  // first tab (UX-DR9).
  if (!tabIds.includes(shownTab) && !pinnedTabIds.includes(shownTab)) {
    shownTab = firstTab;
  }

  function visibleTemplateTabs(tab: SidebarSheet): RenderedTab[] {
    return renderTabs(tab.policy.template, records, tab.sheetId).filter((candidate) =>
      tabShownTo(role, tab.policy.template, candidate.sourceIndex),
    );
  }

  const clearNameFocus = useCallback(() => {
    if (focusNameOf !== null) {
      dispatch({ type: 'name-focused', sheet: focusNameOf });
    }
  }, [focusNameOf]);

  const clearActionsFocus = useCallback(() => {
    if (focusActionsOf !== null) {
      dispatch({ type: 'actions-focused', sheet: focusActionsOf });
    }
  }, [focusActionsOf]);

  const clearBlockReveal = useCallback(() => {
    if (blockReveal !== null) {
      dispatch({
        type: 'block-revealed',
        sheet: blockReveal.sheet,
        block: blockReveal.block,
      });
    }
  }, [blockReveal]);

  // FR14: an open request is reduced from the visible tab and repeat block calculated by the
  // renderer. The reducer stores only the resulting navigation intent.
  useEffect(() => {
    if (!ready || openRequest === null || openRequest.id === takenOpen) {
      return;
    }

    const sheet = sheetKey(openRequest.sheetId);
    const tab = tabIds.includes(sheet) ? sheet : null;

    const template =
      tab === null ? undefined : tabs.find((listed) => listed.id === tab)?.policy.template;

    const block = blockAddress(openRequest.sheetId, openRequest.path ?? []);

    const blockTab =
      block === null || template === undefined || block.path.length === 0
        ? null
        : repeatBlockTabIndex(records.values(), template, block);

    const listed = tab === null ? undefined : tabs.find((candidate) => candidate.id === tab);

    const visible =
      listed === undefined
        ? []
        : renderTabs(listed.policy.template, records, listed.sheetId).filter((candidate) =>
            tabShownTo(role, listed.policy.template, candidate.sourceIndex),
          );

    const rendered =
      template === undefined ? [] : renderTabs(template, records, openRequest.sheetId);

    const sourceCellTab =
      template === undefined
        ? null
        : (tokenCellPlace(
            template,
            openRequest.cellId,
            openRequest.path === undefined ? null : block === null ? null : scopePathOf(block),
          )?.tabIndex ?? null);

    const sourceCellIndex =
      sourceCellTab === null
        ? -1
        : visible.findIndex((candidate) => candidate.sourceIndex === sourceCellTab);

    const cellTab = sourceCellIndex === -1 ? null : sourceCellIndex;

    const blockRendered = blockTab === null ? null : (rendered[blockTab] ?? null);

    const blockVisible =
      blockRendered === null
        ? null
        : (visible.find((candidate) => sameRenderedTab(candidate, blockRendered)) ?? null);

    const cellVisible =
      sourceCellTab === null
        ? null
        : (visible.find((candidate) => candidate.sourceIndex === sourceCellTab) ?? null);

    const openedTab = blockVisible ?? cellVisible;

    dispatch({
      type: 'open-request',
      request: openRequest,
      focusInWindow: focusInWindow(),
      sheet: tab,
      blockTab,
      cellTab,
      tab:
        openedTab === null
          ? undefined
          : {
              sourceIndex: openedTab.sourceIndex,
              block: openedTab.block?.block ?? null,
            },
      ready,
    });
  }, [openRequest, preset, ready, records, role, tabIds, tabs, takenOpen]);

  // Taken: the engine drops the request, so a reload or another window does not open it again.
  useEffect(() => {
    if (takenOpen !== null) {
      acknowledgeOpen(takenOpen);
    }
  }, [acknowledgeOpen, takenOpen]);

  // Applied only to focus that fell to the page body, and only on the tab that lost it, so a
  // target set elsewhere never grabs the focus on a later visit.
  useEffect(() => {
    if (focusAfterLoss === null) {
      return;
    }

    const active = document.activeElement;

    if (active === null || active === document.body || active === document.documentElement) {
      if (focusAfterLoss.kind === 'tab') {
        focusSidebarEntry(shownTab);
      } else if (focusAfterLoss.tab === shownTab) {
        dispatch({ type: 'focus-actions', sheet: focusAfterLoss.sheet });
      }
    }

    dispatch({ type: 'focus-loss-handled' });
  }, [focusAfterLoss, shownTab]);

  // An opened sheet's tab scrolls into view in the bar.
  useEffect(() => {
    if (tabReveal === null) {
      return;
    }

    revealSidebarEntry(tabReveal.tab);

    // The tab switched under the focus, so the focus follows it and the tab is announced.
    if (tabReveal.focus) {
      focusSidebarEntry(tabReveal.tab, { preventScroll: true });
    }

    dispatch({ type: 'tab-revealed' });
  }, [tabReveal]);

  // AD-26: the chosen tab stays while this role sees it; otherwise the first tab this role sees, else
  // none.
  function openTemplateTab(tab: SidebarSheet): { index: number; tab: RenderedTab } | null {
    const visible = visibleTemplateTabs(tab);
    const chosen = chosenTemplateTabs.get(tab.id);

    const chosenIndex = isLegacyTemplateTabSelection(chosen)
      ? chosen
      : chosen === undefined
        ? undefined
        : visible.findIndex((candidate) => sameTemplateTabSelection(candidate, chosen));

    const fallbackIndex =
      chosen !== undefined && !isLegacyTemplateTabSelection(chosen) && chosenIndex === -1
        ? visible.findIndex((candidate) => candidate.sourceIndex === chosen.sourceIndex)
        : chosenIndex;

    const index = openTabIndex(tab.policy.template, fallbackIndex, undefined, visible);

    return index === null || visible[index] === undefined ? null : { index, tab: visible[index] };
  }

  function isLegacyTemplateTabSelection(
    value: ReturnType<typeof chosenTemplateTabs.get>,
  ): value is number {
    return Number.isInteger(value);
  }

  function templateTabHasSelection(tab: SidebarSheet, rendered: RenderedTab): boolean {
    const targetTabs = renderTabs(tab.policy.template, records, tab.sheetId);

    return [...links.values()].some((live) => {
      if (
        live.target.block.sheetId !== tab.sheetId ||
        live.target.block.path.length === 0 ||
        !mapMarks.targets.has(linkTargetKey(live.target))
      ) {
        return false;
      }

      const targetIndex = repeatBlockTabIndex(
        records.values(),
        tab.policy.template,
        live.target.block,
      );

      const targetTab = targetIndex === null ? undefined : targetTabs[targetIndex];

      return targetTab !== undefined && sameRenderedTab(targetTab, rendered);
    });
  }

  function addTabBlock(tab: SidebarSheet, scopeId: string): void {
    if (!isGm) return;

    const instanceId = newInstanceId();

    const block = childAddress(sheetRootAddress(tab.sheetId), scopeId, instanceId);
    setCreatingBlock({ sheet: tab.id, block });

    void sendCommand({
      type: 'repeat-block-add',
      sheetId: tab.sheetId,
      block,
    })
      .then((outcome) => {
        if (outcome.kind !== 'answered') setCreatingBlock(null);
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a tab block creation', error);
        setCreatingBlock(null);
      });
  }

  useEffect(() => {
    if (creatingBlock === null) return;

    const tab = tabs.find((candidate) => candidate.id === creatingBlock.sheet);

    if (tab === undefined) return;

    const visible = renderTabs(tab.policy.template, records, tab.sheetId).filter((candidate) =>
      tabShownTo(role, tab.policy.template, candidate.sourceIndex),
    );

    const index = visible.findIndex(
      (candidate) =>
        candidate.block !== null && sameAddress(candidate.block.block, creatingBlock.block),
    );

    const created = index === -1 ? undefined : visible[index];

    if (created === undefined) return;

    dispatch({
      type: 'select-template-tab',
      sheet: tab.id,
      index,
      tab: {
        sourceIndex: created.sourceIndex,
        block: created.block?.block ?? null,
      },
      visible: true,
    });
    // oxlint-disable-next-line react/set-state-in-effect -- Clear the pending marker only after rendered records expose the new tab.
    setCreatingBlock(null);
  }, [creatingBlock, records, role, tabs]);

  function askDelete(tab: SidebarSheet): void {
    // A new request remounts the block, so a repeated "Удалить" takes the focus again.
    dispatch({
      type: 'ask-delete',
      sheet: tab.id,
      isGm,
      isSheetSet: isSheetSet(tab.policy.template),
    });
  }

  function cancelDelete(sheet: string): void {
    dispatch({ type: 'cancel-delete', sheet });
  }

  function confirmDelete(tab: SidebarSheet): void {
    const sheetSet = isSheetSet(tab.policy.template);

    if (!isGm || !sheetSet || deleteAsk?.sheet !== tab.id) {
      return;
    }

    const sheet = tab.id;
    // Closed at once, so a second press sends no second command.
    dispatch({ type: 'confirm-delete', sheet, isGm, isSheetSet: sheetSet });

    void sendCommand({ type: 'sheet-delete', sheetId: tab.sheetId })
      .then((outcome) => {
        dispatch({
          type: 'delete-outcome',
          sheet,
          outcome,
          tab: tabIds.includes(sheet) ? sheet : null,
        });
      })
      .catch((error) => {
        console.error('Muster Roll could not settle sheet deletion', error);
      });
  }

  // CAP-17: a new sheet of the sheet set, with an empty name.
  function addSheet(set: SheetSetTemplate): void {
    // The engine refuses an id that the room holds as a sheet, deleted ones included, that a live
    // record such as an orphan row names, or that is a template id, so a collision takes over
    // nothing.
    const sheetId = newSheetId();
    const sheet = sheetKey(sheetId);

    dispatch({ type: 'create-sent', sheet, isGm, presetState });

    void sendCommand({ type: 'sheet-create', sheetId, set: set.id })
      .then((outcome) => {
        dispatch({ type: 'create-outcome', sheet, outcome });
      })
      .catch((error) => {
        console.error('Muster Roll could not settle sheet creation', error);
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
  // visible, and "Удалить". A template with token cells shows its token status.
  function gmSheetParts(
    tab: SidebarSheet,
    openTab: number | null,
    renderedTab: RenderedTab | null,
  ): SheetFrameParts {
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
              onDelete: ofSet
                ? () => {
                    askDelete(tab);
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
          renderedTab={renderedTab}
          records={records}
          editing={editing}
          rolling={rolling}
          pending={null}
          role="GM" // oxlint-disable-line jsx-a11y/aria-role -- This is the application's viewer role, not an ARIA role.
          blockTools={blockTools}
          tabBlockEditing={editing}
          reveal={blockReveal?.sheet === tab.id ? blockReveal : null}
          onRevealed={clearBlockReveal}
        />
      ),
    };
  }

  // FR3: a live `acl:`, or a player-editable single sheet, makes the fields editable and shows the
  // repeat block controls. Each edit waits for a GM client's check (AD-4), and the pending view
  // shows it meanwhile.
  function playerSheetParts(
    tab: SidebarSheet,
    openTab: number | null,
    renderedTab: RenderedTab | null,
  ): SheetFrameParts {
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
          renderedTab={renderedTab}
          records={records}
          editing={mayEdit ? editing : null}
          rolling={rolling}
          pending={pendingBySheet.get(tab.sheetId) ?? null}
          role="PLAYER" // oxlint-disable-line jsx-a11y/aria-role -- This is the application's viewer role, not an ARIA role.
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
      diagnostics={diagnostics}
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
    const opened = sheet === null ? null : openTemplateTab(sheet);
    const openTab = opened?.tab.sourceIndex ?? null;
    const visibleTabs = sheet === null ? [] : visibleTemplateTabs(sheet);

    const visibleRepeatTabs =
      sheet === null
        ? []
        : sheet.policy.template.tabs
            .filter(
              (candidate, sourceIndex) =>
                candidate.repeat !== undefined &&
                tabShownTo(role, sheet.policy.template, sourceIndex),
            )
            .filter(
              (candidate, index, all) =>
                all.findIndex((other) => other.repeat?.id === candidate.repeat?.id) === index,
            );

    const shellTabs: ShellTab[] = [
      ...(sheet === null
        ? []
        : visibleTabs.map((rendered, index): ShellTab => {
            return {
              id: templateTabKey(rendered),
              label:
                rendered.block === null
                  ? templateTabLabel(rendered.tab.title)
                  : rendered.block.name === ''
                    ? copy.unnamedBlock(rendered.blockIndex ?? index + 1)
                    : rendered.block.name,
              selectedOnMap: templateTabHasSelection(sheet, rendered),
              dataTabIndex: index,
              sourceTabIndex: rendered.sourceIndex,
            };
          })),
      ...(isGm
        ? visibleRepeatTabs.map((candidate): ShellTab => ({
            id: `template-tab-add:${candidate.repeat?.id ?? ''}`,
            label: copy.addTab,
            addScopeId: candidate.repeat?.id ?? '',
            addScopeTitle:
              visibleRepeatTabs.length > 1 ? templateTabLabel(candidate.title) : undefined,
          }))
        : []),
    ];

    const sheetParts =
      sheet === null || !ready || preset === null
        ? null
        : contentFor(sheet, openTab, opened?.tab ?? null);

    const chosen = sheet === null ? undefined : chosenTemplateTabs.get(sheet.id);

    const contentSourceIndex =
      chosen !== undefined && !isLegacyTemplateTabSelection(chosen)
        ? chosen.sourceIndex
        : (opened?.tab.sourceIndex ?? null);

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
        dispatch({
          type: 'select-sidebar-entry',
          id,
          listed: (isGm && id === SETTINGS_TAB) || tabIds.includes(id),
        });
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
      selectedTab: opened === null ? null : templateTabKey(opened.tab),
      contentKey: `${shownTab}:source-${contentSourceIndex ?? 'none'}`,
      onSelectTab: (id) => {
        const addScopeId = id.startsWith('template-tab-add:')
          ? id.slice('template-tab-add:'.length)
          : null;

        if (addScopeId !== null && addScopeId !== '') {
          if (sheet !== null) addTabBlock(sheet, addScopeId);

          return;
        }

        const selected = visibleTabs.find((candidate) => templateTabKey(candidate) === id);

        if (sheet !== null && selected !== undefined) {
          dispatch({
            type: 'select-template-tab',
            sheet: sheet.id,
            index: visibleTabs.indexOf(selected),
            tab: {
              sourceIndex: selected.sourceIndex,
              block: selected.block?.block ?? null,
            },
            visible: true,
          });
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

function sameTemplateTabSelection(
  rendered: RenderedTab,
  selection: Exclude<TemplateTabSelection, number>,
): boolean {
  return (
    rendered.sourceIndex === selection.sourceIndex &&
    (rendered.block === null
      ? selection.block === null
      : selection.block !== null && sameAddress(rendered.block.block, selection.block))
  );
}
