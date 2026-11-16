/**
 * The v4 tree registry is the single description of container depth.
 *
 * Keeping this table separate from zod makes traversal, Builder operations and
 * diagnostics use the same vocabulary. A node may only contain the child kind
 * listed here; cells are leaves.
 */
export type PresetNodeKind =
  | 'preset'
  | 'template'
  | 'tab'
  | 'section'
  | 'row'
  | 'cell'
  | 'cell-text'
  | 'cell-field-text'
  | 'cell-field-number'
  | 'cell-field-check'
  | 'cell-field-select'
  | 'cell-field-dice-choice'
  | 'cell-dice'
  | 'cell-token';

export type PresetRegistryEntry = {
  keys: readonly string[];
  child: PresetNodeKind | null;
};

export const PRESET_REGISTRY: Readonly<Record<PresetNodeKind, PresetRegistryEntry>> = {
  preset: { keys: ['v', 'window', 'templates'], child: 'template' },
  template: { keys: ['id', 'title', 'visibility', 'repeat', 'players', 'tabs'], child: 'tab' },
  tab: { keys: ['title', 'visibility', 'repeat', 'sections'], child: 'section' },
  section: { keys: ['title', 'width', 'columns', 'visibility', 'repeat', 'rows'], child: 'row' },
  row: { keys: ['visibility', 'repeat', 'cells'], child: 'cell' },
  cell: { keys: ['kind'], child: null },
  'cell-text': { keys: ['kind', 'text'], child: null },
  'cell-field-text': { keys: ['kind', 'type', 'id', 'name'], child: null },
  'cell-field-number': { keys: ['kind', 'type', 'id', 'name'], child: null },
  'cell-field-check': { keys: ['kind', 'type', 'id', 'name'], child: null },
  'cell-field-select': { keys: ['kind', 'type', 'id', 'name', 'options'], child: null },
  'cell-field-dice-choice': { keys: ['kind', 'type', 'id', 'name', 'options'], child: null },
  'cell-dice': { keys: ['kind', 'formula', 'name'], child: null },
  'cell-token': { keys: ['kind', 'id'], child: null },
};

export function presetChildKind(kind: PresetNodeKind): PresetNodeKind | null {
  return PRESET_REGISTRY[kind].child;
}

export function presetKeys(kind: PresetNodeKind): readonly string[] {
  return PRESET_REGISTRY[kind].keys;
}
