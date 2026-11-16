export type PreviewEditingState = string | null;

export type PreviewEditingAction =
  | { type: 'cell-clicked'; uid: string; selected: boolean; editable: boolean }
  | { type: 'enter-pressed'; uid: string; editable: boolean }
  | { type: 'selection-changed'; uid: string | null }
  | { type: 'escape-pressed' };

export function previewEditingReducer(
  state: PreviewEditingState,
  action: PreviewEditingAction,
): PreviewEditingState {
  switch (action.type) {
    case 'cell-clicked':
      return action.selected && action.editable ? action.uid : null;
    case 'enter-pressed':
      return action.editable ? action.uid : state;
    case 'selection-changed':
      return state === action.uid ? state : null;
    case 'escape-pressed':
      return null;
    default:
      return state;
  }
}
