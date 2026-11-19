import { blockAddress, sameAddress, type BlockAddress } from '@/core/block-address';
import type { WireOpenSheetRequest } from '@/core/ui-messages';
import type { CommandOutcome } from '@/ui/replica-client';

export const SETTINGS_TAB = 'settings';

export type PresetState = 'unknown' | 'absent' | 'present';

export type NavigationDeleteAsk = { sheet: string; request: number };

export type NavigationBlockReveal = {
  sheet: string;
  block: BlockAddress | null;
  cellId: string;
  focus: boolean;
};

export type NavigationFocusAfterLoss =
  | { kind: 'tab' }
  | { kind: 'actions'; sheet: string; tab: string | null };

export type NavigationTabReveal = { tab: string; focus: boolean };

export type TemplateTabSelection =
  | number
  | {
      sourceIndex: number;
      block: BlockAddress | null;
    };

export type NavigationState = {
  selectedTab: string;
  chosenTemplateTabs: ReadonlyMap<string, TemplateTabSelection>;
  seenPresetState: PresetState;
  created: string | null;
  deleting: string | null;
  deleteAsk: NavigationDeleteAsk | null;
  takenOpen: string | null;
  blockReveal: NavigationBlockReveal | null;
  focusNameOf: string | null;
  focusActionsOf: string | null;
  focusAfterLoss: NavigationFocusAfterLoss | null;
  tabReveal: NavigationTabReveal | null;
};

export type NavigationEvent =
  | { type: 'projection'; isGm: boolean; tabIds: readonly string[]; presetState: PresetState }
  | { type: 'select-sidebar-entry'; id: string; listed: boolean }
  | {
      type: 'select-template-tab';
      sheet: string;
      index: number;
      tab?: TemplateTabSelection;
      visible: boolean;
    }
  | { type: 'create-sent'; sheet: string; isGm: boolean; presetState: PresetState }
  | { type: 'create-outcome'; sheet: string; outcome: CommandOutcome<undefined> }
  | { type: 'ask-delete'; sheet: string; isGm: boolean; isSheetSet: boolean }
  | { type: 'cancel-delete'; sheet: string }
  | { type: 'confirm-delete'; sheet: string; isGm: boolean; isSheetSet: boolean }
  | {
      type: 'delete-outcome';
      sheet: string;
      outcome: CommandOutcome<undefined>;
      tab: string | null;
    }
  | {
      type: 'open-request';
      request: WireOpenSheetRequest;
      focusInWindow: boolean;
      sheet: string | null;
      blockTab: number | null;
      cellTab: number | null;
      tab?: TemplateTabSelection;
      ready: boolean;
    }
  | { type: 'name-focused'; sheet: string }
  | { type: 'actions-focused'; sheet: string }
  | { type: 'focus-actions'; sheet: string }
  | { type: 'block-revealed'; sheet: string; block: BlockAddress | null }
  | { type: 'tab-revealed' }
  | { type: 'focus-loss-handled' };

export const initialState: NavigationState = {
  selectedTab: SETTINGS_TAB,
  chosenTemplateTabs: new Map(),
  seenPresetState: 'unknown',
  created: null,
  deleting: null,
  deleteAsk: null,
  takenOpen: null,
  blockReveal: null,
  focusNameOf: null,
  focusActionsOf: null,
  focusAfterLoss: null,
  tabReveal: null,
};

export function transition(state: NavigationState, event: NavigationEvent): NavigationState {
  switch (event.type) {
    case 'projection':
      return projectionTransition(state, event);
    case 'select-sidebar-entry':
      return event.listed
        ? {
            ...state,
            selectedTab: event.id,
            deleteAsk: state.deleteAsk?.sheet === event.id ? state.deleteAsk : null,
            blockReveal: state.blockReveal?.sheet === event.id ? state.blockReveal : null,
          }
        : state;
    case 'select-template-tab':
      return event.visible
        ? {
            ...state,
            chosenTemplateTabs: new Map(state.chosenTemplateTabs).set(
              event.sheet,
              event.tab ?? event.index,
            ),
          }
        : state;
    case 'create-sent':
      return event.isGm && event.presetState === 'present'
        ? { ...state, created: event.sheet, deleteAsk: null }
        : state;
    case 'create-outcome':
      return state.created === event.sheet && event.outcome.kind !== 'answered'
        ? { ...state, created: null }
        : state;
    case 'ask-delete':
      return event.isGm && event.isSheetSet && state.selectedTab === event.sheet
        ? {
            ...state,
            deleteAsk: { sheet: event.sheet, request: (state.deleteAsk?.request ?? 0) + 1 },
          }
        : state;
    case 'cancel-delete':
      return state.deleteAsk?.sheet === event.sheet
        ? { ...state, deleteAsk: null, focusActionsOf: event.sheet }
        : state;
    case 'confirm-delete':
      return event.isGm && event.isSheetSet && state.deleteAsk?.sheet === event.sheet
        ? { ...state, deleteAsk: null, deleting: event.sheet }
        : state;
    case 'delete-outcome':
      return deleteOutcomeTransition(state, event);
    case 'open-request':
      return openRequestTransition(state, event);
    case 'name-focused':
      return state.focusNameOf === event.sheet ? { ...state, focusNameOf: null } : state;
    case 'actions-focused':
      return state.focusActionsOf === event.sheet ? { ...state, focusActionsOf: null } : state;
    case 'focus-actions':
      return state.focusActionsOf === event.sheet
        ? state
        : { ...state, focusActionsOf: event.sheet };
    case 'block-revealed':
      return state.blockReveal?.sheet === event.sheet &&
        sameBlock(state.blockReveal.block, event.block)
        ? { ...state, blockReveal: null }
        : state;
    case 'tab-revealed':
      return state.tabReveal === null ? state : { ...state, tabReveal: null };
    case 'focus-loss-handled':
      return state.focusAfterLoss === null ? state : { ...state, focusAfterLoss: null };
    default:
      return assertNever(event);
  }
}

function projectionTransition(
  state: NavigationState,
  event: Extract<NavigationEvent, { type: 'projection' }>,
): NavigationState {
  let next = state;

  if (event.presetState !== state.seenPresetState) {
    next = { ...next, seenPresetState: event.presetState };

    if (state.seenPresetState === 'absent' && event.presetState === 'present') {
      // The arrival of a first preset selects Settings, so the GM sees the result.
      next = { ...next, selectedTab: SETTINGS_TAB };
    } else if (event.presetState === 'present') {
      next = { ...next, selectedTab: event.tabIds[0] ?? SETTINGS_TAB };
    }
  }

  // A player creates and deletes nothing, so a demotion drops what this window waited for and
  // meant to focus, and a later promotion starts clean.
  if (
    !event.isGm &&
    (next.created !== null ||
      next.deleting !== null ||
      next.deleteAsk !== null ||
      next.focusNameOf !== null ||
      next.focusActionsOf !== null ||
      next.focusAfterLoss !== null)
  ) {
    next = {
      ...next,
      created: null,
      deleting: null,
      deleteAsk: null,
      focusNameOf: null,
      focusActionsOf: null,
      focusAfterLoss: null,
    };
  }

  if (event.isGm && next.created !== null && event.tabIds.includes(next.created)) {
    next = {
      ...next,
      selectedTab: next.created,
      created: null,
      focusNameOf: next.created,
    };
  }

  if (
    !event.tabIds.includes(next.selectedTab) &&
    !(event.isGm && next.selectedTab === SETTINGS_TAB)
  ) {
    next = { ...next, selectedTab: event.tabIds[0] ?? SETTINGS_TAB };
  }

  if (next.blockReveal !== null && next.blockReveal.sheet !== next.selectedTab) {
    next = { ...next, blockReveal: null };
  }

  if (
    next.deleteAsk !== null &&
    (!event.isGm ||
      next.deleteAsk.sheet !== next.selectedTab ||
      !event.tabIds.includes(next.deleteAsk.sheet))
  ) {
    next = { ...next, deleteAsk: null };
  }

  if (event.isGm && next.deleting !== null && !event.tabIds.includes(next.deleting)) {
    next = { ...next, deleting: null, focusAfterLoss: { kind: 'tab' } };
  }

  return next;
}

function deleteOutcomeTransition(
  state: NavigationState,
  event: Extract<NavigationEvent, { type: 'delete-outcome' }>,
): NavigationState {
  if (state.deleting !== event.sheet || event.outcome.kind === 'answered') {
    return state;
  }

  return {
    ...state,
    deleting: null,
    focusAfterLoss:
      event.tab === null
        ? state.focusAfterLoss
        : { kind: 'actions', sheet: event.sheet, tab: event.tab },
  };
}

function openRequestTransition(
  state: NavigationState,
  event: Extract<NavigationEvent, { type: 'open-request' }>,
): NavigationState {
  if (!event.ready || state.takenOpen === event.request.id) {
    return state;
  }

  if (event.sheet === null) {
    // A request this window does not list is still taken, so no other window gets it.
    return { ...state, takenOpen: event.request.id };
  }

  const block = blockAddress(event.request.sheetId, event.request.path ?? []);

  const blockReveal = {
    sheet: event.sheet,
    block: block === null || block.path.length === 0 ? null : block,
    cellId: event.request.cellId,
    focus: event.focusInWindow,
  };

  const nextFocusName =
    state.focusNameOf !== null && state.focusNameOf !== event.sheet ? null : state.focusNameOf;

  return {
    ...state,
    takenOpen: event.request.id,
    selectedTab: event.sheet,
    blockReveal,
    tabReveal: { tab: event.sheet, focus: false },
    chosenTemplateTabs:
      event.tab !== undefined
        ? new Map(state.chosenTemplateTabs).set(event.sheet, event.tab)
        : (event.blockTab ?? event.cellTab) === null
          ? state.chosenTemplateTabs
          : new Map(state.chosenTemplateTabs).set(
              event.sheet,
              event.blockTab ?? event.cellTab ?? 0,
            ),
    // Another tab, a sheet deleted elsewhere, or a role that cannot delete closes the confirmation
    // for good, so returning to the tab does not bring it back.
    deleteAsk: state.deleteAsk?.sheet === event.sheet ? state.deleteAsk : null,
    focusNameOf: nextFocusName,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unknown navigation event: ${JSON.stringify(value)}`);
}

function sameBlock(first: BlockAddress | null, second: BlockAddress | null): boolean {
  if (first === null || second === null) {
    return first === second;
  }

  return sameAddress(first, second);
}
