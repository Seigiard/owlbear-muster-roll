import { describe, expect, test } from 'bun:test';

import { SETTINGS_TAB, transition } from './navigation';

type NavigationState = Parameters<typeof transition>[0];

type NavigationEvent = Parameters<typeof transition>[1];

describe('transition', () => {
  test('selects listed sidebar entries and ignores entries absent from the projection', () => {
    // #given
    const state = readyState();

    // #when
    const selected = transition(state, {
      type: 'select-sidebar-entry',
      id: 'sheet:rival',
      listed: true,
    });

    const ignored = transition(selected, {
      type: 'select-sidebar-entry',
      id: 'missing',
      listed: false,
    });

    // #then
    expect(ignored.selectedTab).toBe('sheet:rival');
  });

  test('selects the first listed tab when an unknown preset becomes present', () => {
    // #given
    const state = stateWith({ seenPresetState: 'unknown' });

    // #when
    const projected = transition(state, {
      type: 'projection',
      isGm: true,
      tabIds: ['sheet:hero', 'sheet:rival'],
      presetState: 'present',
    });

    // #then
    expect(projected.selectedTab).toBe('sheet:hero');
  });

  test('keeps Settings when an unknown preset becomes present without listed tabs', () => {
    // #given
    const state = stateWith({ seenPresetState: 'unknown' });

    // #when
    const projected = transition(state, {
      type: 'projection',
      isGm: true,
      tabIds: [],
      presetState: 'present',
    });

    // #then
    expect(projected.selectedTab).toBe(SETTINGS_TAB);
  });

  test('remembers a policy-visible template tab and ignores a hidden tab', () => {
    // #given
    const state = readyState();

    // #when
    const chosen = reduce(state, [
      { type: 'select-template-tab', sheet: 'sheet:hero', index: 1, visible: true },
      { type: 'select-template-tab', sheet: 'sheet:hero', index: 2, visible: false },
    ]);

    // #then
    expect(chosen.chosenTemplateTabs).toEqual(new Map([['sheet:hero', 1]]));
  });

  test('records a sent creation', () => {
    // #given
    const state = readyState();

    // #when
    const created = transition(state, {
      type: 'create-sent',
      sheet: 'sheet:new',
      isGm: true,
      presetState: 'present',
    });

    // #then
    expect(created.created).toBe('sheet:new');
  });

  test('settles only the matching failed create outcome', () => {
    // #given
    const state = transition(readyState(), {
      type: 'create-sent',
      sheet: 'sheet:new',
      isGm: true,
      presetState: 'present',
    });

    // #when
    const stale = transition(state, {
      type: 'create-outcome',
      sheet: 'sheet:other',
      outcome: { kind: 'timed-out' },
    });

    const settled = transition(stale, {
      type: 'create-outcome',
      sheet: 'sheet:new',
      outcome: { kind: 'timed-out' },
    });

    // #then
    expect({ stale: stale.created, settled: settled.created }).toEqual({
      stale: 'sheet:new',
      settled: null,
    });
  });

  test('keeps a created sheet after its matching answered outcome', () => {
    // #given
    const state = stateWith({ created: 'sheet:new' });

    // #when
    const answered = transition(state, {
      type: 'create-outcome',
      sheet: 'sheet:new',
      outcome: { kind: 'answered', answer: undefined },
    });

    // #then
    expect(answered.created).toBe('sheet:new');
  });

  test('closes an open delete confirmation when a new sheet is sent', () => {
    // #given
    const state = stateWith({ deleteAsk: { sheet: 'sheet:hero', request: 1 } });

    // #when
    const created = transition(state, {
      type: 'create-sent',
      sheet: 'sheet:new',
      isGm: true,
      presetState: 'present',
    });

    // #then
    expect({ created: created.created, deleteAsk: created.deleteAsk }).toEqual({
      created: 'sheet:new',
      deleteAsk: null,
    });
  });

  test('selects and focuses a created sheet when its projection entry arrives', () => {
    // #given
    const state = transition(readyState(), {
      type: 'create-sent',
      sheet: 'sheet:new',
      isGm: true,
      presetState: 'present',
    });

    // #when
    const arrived = transition(state, {
      type: 'projection',
      isGm: true,
      tabIds: ['sheet:hero', 'sheet:rival', 'sheet:new'],
      presetState: 'present',
    });

    // #then
    expect({
      selected: arrived.selectedTab,
      created: arrived.created,
      focus: arrived.focusNameOf,
    }).toEqual({
      selected: 'sheet:new',
      created: null,
      focus: 'sheet:new',
    });
  });

  test('confirms one selected sheet deletion and ignores a stale outcome', () => {
    // #given
    const state = reduce(readyState(), [
      { type: 'select-sidebar-entry', id: 'sheet:hero', listed: true },
      { type: 'ask-delete', sheet: 'sheet:hero', isGm: true, isSheetSet: true },
      { type: 'confirm-delete', sheet: 'sheet:hero', isGm: true, isSheetSet: true },
    ]);

    // #when
    const stale = transition(state, {
      type: 'delete-outcome',
      sheet: 'sheet:rival',
      outcome: { kind: 'timed-out' },
      tab: 'sheet:rival',
    });

    // #then
    expect({ deleting: stale.deleting, deleteAsk: stale.deleteAsk }).toEqual({
      deleting: 'sheet:hero',
      deleteAsk: null,
    });
  });

  test('increments the delete confirmation request when the same sheet is asked again', () => {
    // #given
    const state = stateWith({ selectedTab: 'sheet:hero' });

    const asked = transition(state, {
      type: 'ask-delete',
      sheet: 'sheet:hero',
      isGm: true,
      isSheetSet: true,
    });

    // #when
    const repeated = transition(asked, {
      type: 'ask-delete',
      sheet: 'sheet:hero',
      isGm: true,
      isSheetSet: true,
    });

    // #then
    expect(repeated.deleteAsk).toEqual({ sheet: 'sheet:hero', request: 2 });
  });

  test('records a delete in flight and closes its confirmation', () => {
    // #given
    const state = stateWith({
      selectedTab: 'sheet:hero',
      deleteAsk: { sheet: 'sheet:hero', request: 1 },
    });

    // #when
    const confirmed = transition(state, {
      type: 'confirm-delete',
      sheet: 'sheet:hero',
      isGm: true,
      isSheetSet: true,
    });

    // #then
    expect({ deleting: confirmed.deleting, deleteAsk: confirmed.deleteAsk }).toEqual({
      deleting: 'sheet:hero',
      deleteAsk: null,
    });
  });

  test('cancels a matching delete confirmation and returns focus to its actions', () => {
    // #given
    const state = reduce(readyState(), [
      { type: 'select-sidebar-entry', id: 'sheet:hero', listed: true },
      { type: 'ask-delete', sheet: 'sheet:hero', isGm: true, isSheetSet: true },
    ]);

    // #when
    const cancelled = transition(state, { type: 'cancel-delete', sheet: 'sheet:hero' });

    // #then
    expect({ deleteAsk: cancelled.deleteAsk, focusActionsOf: cancelled.focusActionsOf }).toEqual({
      deleteAsk: null,
      focusActionsOf: 'sheet:hero',
    });
  });

  test('settles a deleted sheet on disappearance and records focus recovery', () => {
    // #given
    const state = stateWith({ deleting: 'sheet:hero', selectedTab: 'sheet:hero' });

    // #when
    const disappeared = transition(state, {
      type: 'projection',
      isGm: true,
      tabIds: ['sheet:rival'],
      presetState: 'present',
    });

    // #then
    expect({ deleting: disappeared.deleting, focusAfterLoss: disappeared.focusAfterLoss }).toEqual({
      deleting: null,
      focusAfterLoss: { kind: 'tab' },
    });
  });

  test('restores deleted sheet actions after its matching failed outcome', () => {
    // #given
    const state = stateWith({ deleting: 'sheet:hero', selectedTab: 'sheet:hero' });

    // #when
    const failed = transition(state, {
      type: 'delete-outcome',
      sheet: 'sheet:hero',
      outcome: { kind: 'timed-out' },
      tab: 'sheet:hero',
    });

    const focused = transition(failed, { type: 'focus-actions', sheet: 'sheet:hero' });

    // #then
    expect({ deleting: focused.deleting, focusActionsOf: focused.focusActionsOf }).toEqual({
      deleting: null,
      focusActionsOf: 'sheet:hero',
    });
  });

  test('closes a delete confirmation when another sheet opens without a preset block', () => {
    // #given
    const state = stateWith({
      selectedTab: 'sheet:hero',
      deleteAsk: { sheet: 'sheet:hero', request: 1 },
      seenPresetState: 'absent',
    });

    // #when
    const opened = transition(state, {
      type: 'open-request',
      request: { id: 'open-rival', sheetId: 'rival', instanceId: 'contact' },
      focusInWindow: false,
      tab: 'sheet:rival',
      blockTab: null,
      block: null,
      ready: true,
    });

    const returned = transition(opened, {
      type: 'select-sidebar-entry',
      id: 'sheet:hero',
      listed: true,
    });

    // #then
    expect(returned.deleteAsk).toBeNull();
  });

  test('clears GM-only work on a player projection', () => {
    // #given
    const state = stateWith({
      created: 'sheet:new',
      deleting: 'sheet:hero',
      deleteAsk: { sheet: 'sheet:hero', request: 1 },
      focusNameOf: 'sheet:new',
      focusActionsOf: 'sheet:hero',
      focusAfterLoss: { kind: 'tab' },
    });

    // #when
    const player = transition(state, {
      type: 'projection',
      isGm: false,
      tabIds: ['sheet:hero'],
      presetState: 'present',
    });

    // #then
    expect({
      created: player.created,
      deleting: player.deleting,
      deleteAsk: player.deleteAsk,
      focusNameOf: player.focusNameOf,
      focusActionsOf: player.focusActionsOf,
      focusAfterLoss: player.focusAfterLoss,
    }).toEqual({
      created: null,
      deleting: null,
      deleteAsk: null,
      focusNameOf: null,
      focusActionsOf: null,
      focusAfterLoss: null,
    });
  });

  test('returns the same state for an unchanged player projection', () => {
    // #given
    const state = stateWith({ selectedTab: 'sheet:hero' });

    // #when
    const projected = transition(state, {
      type: 'projection',
      isGm: false,
      tabIds: ['sheet:hero'],
      presetState: 'present',
    });

    // #then
    expect(projected).toBe(state);
  });

  test('returns the same state for an unchanged GM projection', () => {
    // #given
    const state = stateWith({ selectedTab: 'sheet:hero' });

    // #when
    const projected = transition(state, {
      type: 'projection',
      isGm: true,
      tabIds: ['sheet:hero'],
      presetState: 'present',
    });

    // #then
    expect(projected).toBe(state);
  });

  test('takes a ready open request, reveals its tab, and keeps its repeat block target', () => {
    // #given
    const state = readyState();

    // #when
    const opened = transition(state, {
      type: 'open-request',
      request: { id: 'open-hero', sheetId: 'hero', instanceId: 'contact' },
      focusInWindow: true,
      tab: 'sheet:hero',
      blockTab: 1,
      block: 'contact',
      ready: true,
    });

    const replayed = transition(opened, {
      type: 'open-request',
      request: { id: 'open-hero', sheetId: 'rival', instanceId: null },
      focusInWindow: false,
      tab: 'sheet:rival',
      blockTab: null,
      block: null,
      ready: true,
    });

    // #then
    expect({
      selected: replayed.selectedTab,
      takenOpen: replayed.takenOpen,
      blockReveal: replayed.blockReveal,
      tabReveal: replayed.tabReveal,
    }).toEqual({
      selected: 'sheet:hero',
      takenOpen: 'open-hero',
      blockReveal: { sheet: 'sheet:hero', instanceId: 'contact', focus: true },
      tabReveal: { tab: 'sheet:hero', focus: false },
    });
  });

  test('opens a repeat block on its template tab and clears another sheet name focus', () => {
    // #given
    const state = stateWith({ focusNameOf: 'sheet:rival' });

    // #when
    const opened = transition(state, {
      type: 'open-request',
      request: { id: 'open-hero', sheetId: 'hero', instanceId: 'contact' },
      focusInWindow: true,
      tab: 'sheet:hero',
      blockTab: 1,
      block: 'contact',
      ready: true,
    });

    // #then
    expect({ chosen: opened.chosenTemplateTabs, focusNameOf: opened.focusNameOf }).toEqual({
      chosen: new Map([['sheet:hero', 1]]),
      focusNameOf: null,
    });
  });

  test('remembers preset arrival and clears transient state for tabs no longer shown', () => {
    // #given
    const state = stateWith({
      selectedTab: 'sheet:hero',
      seenPresetState: 'absent',
      deleteAsk: { sheet: 'sheet:hero', request: 1 },
      blockReveal: { sheet: 'sheet:hero', instanceId: 'contact', focus: true },
    });

    // #when
    const projected = transition(state, {
      type: 'projection',
      isGm: true,
      tabIds: ['sheet:rival'],
      presetState: 'present',
    });

    // #then
    expect({
      selected: projected.selectedTab,
      seenPresetState: projected.seenPresetState,
      deleteAsk: projected.deleteAsk,
      blockReveal: projected.blockReveal,
    }).toEqual({
      selected: SETTINGS_TAB,
      seenPresetState: 'present',
      deleteAsk: null,
      blockReveal: null,
    });
  });

  test('clears focus and reveal fields only for their matching completion events', () => {
    // #given
    const state = stateWith({
      focusNameOf: 'sheet:hero',
      focusActionsOf: 'sheet:rival',
      blockReveal: { sheet: 'sheet:hero', instanceId: 'contact', focus: true },
      tabReveal: { tab: 'sheet:hero', focus: true },
      focusAfterLoss: { kind: 'actions', sheet: 'sheet:rival', tab: 'sheet:rival' },
    });

    // #when
    const unmatched = reduce(state, [
      { type: 'name-focused', sheet: 'sheet:rival' },
      { type: 'actions-focused', sheet: 'sheet:hero' },
      { type: 'block-revealed', sheet: 'sheet:hero', instanceId: 'other' },
    ]);

    const cleared = reduce(unmatched, [
      { type: 'name-focused', sheet: 'sheet:hero' },
      { type: 'actions-focused', sheet: 'sheet:rival' },
      { type: 'block-revealed', sheet: 'sheet:hero', instanceId: 'contact' },
      { type: 'tab-revealed' },
      { type: 'focus-loss-handled' },
    ]);

    // #then
    expect({
      unmatched: {
        focusNameOf: unmatched.focusNameOf,
        focusActionsOf: unmatched.focusActionsOf,
        blockReveal: unmatched.blockReveal,
      },
      cleared: {
        focusNameOf: cleared.focusNameOf,
        focusActionsOf: cleared.focusActionsOf,
        blockReveal: cleared.blockReveal,
        tabReveal: cleared.tabReveal,
        focusAfterLoss: cleared.focusAfterLoss,
      },
    }).toEqual({
      unmatched: {
        focusNameOf: 'sheet:hero',
        focusActionsOf: 'sheet:rival',
        blockReveal: { sheet: 'sheet:hero', instanceId: 'contact', focus: true },
      },
      cleared: {
        focusNameOf: null,
        focusActionsOf: null,
        blockReveal: null,
        tabReveal: null,
        focusAfterLoss: null,
      },
    });
  });
});

function readyState(): NavigationState {
  return stateWith();
}

function stateWith(overrides: Partial<NavigationState> = {}): NavigationState {
  return {
    selectedTab: SETTINGS_TAB,
    chosenTemplateTabs: new Map(),
    seenPresetState: 'present',
    created: null,
    deleting: null,
    deleteAsk: null,
    takenOpen: null,
    blockReveal: null,
    focusNameOf: null,
    focusActionsOf: null,
    focusAfterLoss: null,
    tabReveal: null,
    ...overrides,
  };
}

function reduce(state: NavigationState, events: readonly NavigationEvent[]): NavigationState {
  return events.reduce(transition, state);
}
