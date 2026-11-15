import { openTabIndex, type TemplateLayout } from '@/core/preset';
import type { SidebarEntries, SidebarSheet } from '@/ui/shell/sidebar-entries';

export type ShownTab = { template: string; tab: number };

export type PreviewNavigationState = ShownTab | null;

export type PreviewNavigationTemplate = TemplateLayout & { uid: string };

export type PreviewNavigationAction = {
  type: 'selection-changed';
  template: PreviewNavigationTemplate | null;
  selectedTab: ShownTab | null;
  tabShown?: (index: number) => boolean;
};

export type PreviewSheetNavigationState = string | null;

export type PreviewSheetNavigationAction =
  | { type: 'sheet-selected'; sheetId: string }
  | {
      type: 'template-changed';
      templateUid: string | null;
      entries: SidebarEntries;
    };

// AD-23: show the selected item's tab when it belongs to the shown template; otherwise keep the
// template's current tab and let openTabIndex provide the first-tab fallback.
export function previewNavigationReducer(
  state: PreviewNavigationState,
  action: PreviewNavigationAction,
): PreviewNavigationState {
  if (action.template === null) {
    return state;
  }

  const chosenTab =
    action.selectedTab?.template === action.template.uid
      ? action.selectedTab.tab
      : state?.template === action.template.uid
        ? state.tab
        : undefined;

  const shownTab =
    action.tabShown === undefined
      ? openTabIndex(action.template, chosenTab)
      : openTabIndex(action.template, chosenTab, action.tabShown);

  const tab = shownTab ?? 0;

  if (state?.template === action.template.uid && state.tab === tab) {
    return state;
  }

  return { template: action.template.uid, tab };
}

// AD-23: keep the selected sheet while the selected template remains in its group. On a template
// change, use that group's current sheet or its first sheet; a sidebar click always wins directly.
export function previewSheetNavigationReducer(
  state: PreviewSheetNavigationState,
  action: PreviewSheetNavigationAction,
): PreviewSheetNavigationState {
  if (action.type === 'sheet-selected') {
    return action.sheetId;
  }

  if (action.templateUid === null) {
    return state;
  }

  const candidates = sheetsOf(action.entries).filter(
    (sheet) => sheet.templateUid === action.templateUid,
  );

  return candidates.some((sheet) => sheet.sheetId === state)
    ? state
    : (candidates[0]?.sheetId ?? state);
}

export function selectedSidebarSheet(
  entries: SidebarEntries,
  templateUid: string | null,
  shownSheetId: string | null,
): SidebarSheet | null {
  if (templateUid === null) {
    return null;
  }

  const candidates = sheetsOf(entries).filter((sheet) => sheet.templateUid === templateUid);

  return candidates.find((sheet) => sheet.sheetId === shownSheetId) ?? candidates[0] ?? null;
}

export function findSidebarSheet(entries: SidebarEntries, id: string): SidebarSheet | null {
  return sheetsOf(entries).find((sheet) => sheet.id === id) ?? null;
}

function sheetsOf(entries: SidebarEntries): SidebarSheet[] {
  return entries.sections.flatMap((section) =>
    section.kind === 'single' ? [section.sheet] : section.sheets,
  );
}
