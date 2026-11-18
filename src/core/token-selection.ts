import { linkTargetKey, type LiveLinkTarget } from '@/core/link-target';

// CAP-32: what one client's map selection marks in its window: the sheet of every target a selected
// token's live link names, and the `linkTargetKey` of each such target, a repeat block included.
export type SelectionMarks = { sheetIds: ReadonlySet<string>; targets: ReadonlySet<string> };

// One press of "Выделить на карте": add the target's tokens on the open scene to the map selection,
// or take them out of it when every one of them is already selected.
export type SelectionStep = { kind: 'select' | 'deselect'; tokenIds: string[] };

// `links` are the live links of the records the role sees, so a token linked to a hidden template
// marks nothing for a player. A selected item with no live link marks nothing.
export function selectionMarks(
  links: ReadonlyMap<string, LiveLinkTarget>,
  selection: Iterable<string>,
): SelectionMarks {
  const sheetIds = new Set<string>();
  const targets = new Set<string>();

  for (const itemId of selection) {
    const live = links.get(itemId);

    if (live !== undefined) {
      sheetIds.add(live.target.block.sheetId);
      targets.add(linkTargetKey(live.target));
    }
  }

  return { sheetIds, targets };
}

// The token ids each target's live links name, by `linkTargetKey`, each list sorted.
export function tokensByTarget(links: ReadonlyMap<string, LiveLinkTarget>): Map<string, string[]> {
  const tokens = new Map<string, string[]>();

  for (const [tokenId, live] of links) {
    const key = linkTargetKey(live.target);

    tokens.set(key, [...(tokens.get(key) ?? []), tokenId]);
  }

  for (const list of tokens.values()) {
    list.sort();
  }

  return tokens;
}

// The step a press takes for a target's linked tokens. A token that is not on the open scene is
// skipped, and with none on it no step exists, so no control offers one.
export function selectionStep(
  tokenIds: readonly string[],
  sceneItemIds: ReadonlySet<string>,
  selection: ReadonlySet<string>,
): SelectionStep | null {
  const onScene = tokenIds.filter((tokenId) => sceneItemIds.has(tokenId));

  if (onScene.length === 0) {
    return null;
  }

  return {
    kind: onScene.every((tokenId) => selection.has(tokenId)) ? 'deselect' : 'select',
    tokenIds: onScene,
  };
}

// True when two item id lists hold the same ids, in any order and with repeats ignored.
export function sameItemIds(first: readonly string[], second: readonly string[]): boolean {
  const firstSet = new Set(first);
  const secondSet = new Set(second);

  return firstSet.size === secondSet.size && [...firstSet].every((id) => secondSet.has(id));
}
