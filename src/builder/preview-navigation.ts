import { openTabIndex, type TemplateLayout } from '@/core/preset';

export type ShownTab = { template: string; tab: number };

export type PreviewNavigationState = ShownTab | null;

export type PreviewNavigationTemplate = TemplateLayout & { uid: string };

export type PreviewNavigationAction = {
  type: 'selection-changed';
  template: PreviewNavigationTemplate | null;
  selectedTab: ShownTab | null;
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

  const tab = openTabIndex(action.template, chosenTab);

  if (state?.template === action.template.uid && state.tab === tab) {
    return state;
  }

  return { template: action.template.uid, tab };
}
