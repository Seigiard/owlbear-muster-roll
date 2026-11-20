import type { JsonValue } from '@/core/json';
import {
  blockAddress,
  blockIdOf,
  isLiveBlock,
  sameAddress,
  scopePathOf,
  sectionIdOf,
  type BlockAddress,
} from '@/core/block-address';
import {
  repeatSectionByPath,
  repeatScopeByPath,
  repeatTabById,
  placedSections,
  type Preset,
  type PresetSection,
  type PresetRow,
  type TemplateLayout,
} from '@/core/preset';
import { linkDataSchema, type LinkData, type VersionedRecord } from '@/core/records';
import { renderedTabs } from '@/core/rendered-tabs';
import { resolveSheet, sheetIdSchema, type SheetPolicy } from '@/core/sheets';

export type LinkTarget = {
  block: BlockAddress;
  cellId?: string;
};

// A target a live link may name: its sheet's policy, and for a repeat block its section.
export type LiveLinkTarget = {
  target: LinkTarget;
  policy: SheetPolicy;
  section: PresetSection | null;
  cell: TokenCellPlace;
};

export type TokenCellPlace = {
  tabIndex: number;
  sectionIndex: number;
  rowIndex: number;
  section: PresetSection;
  row: PresetRow;
};

// The target a `link:` record's data names, or `null` for a tombstone or an id no command could
// write, which would make an open request no window takes.
export function linkTargetOf(d: JsonValue): LinkTarget | null {
  const data = linkDataSchema.safeParse(d);

  if (!data.success || !sheetIdSchema.safeParse(data.data.s).success) {
    return null;
  }

  const block = blockAddress(data.data.s, data.data.path ?? []);

  return block === null ? null : { block, cellId: data.data.c };
}

// The `link:` record data for a target.
export function linkDataOf(target: LinkTarget): LinkData {
  const { sheetId, path } = target.block;

  return path.length === 0
    ? { s: sheetId, c: target.cellId ?? '' }
    : { s: sheetId, path: [...path], c: target.cellId ?? '' };
}

// One string per target, so targets can be kept in a set.
export function linkTargetKey(target: LinkTarget): string {
  return `${target.block.sheetId}:${target.block.path.join(':')}:${target.cellId ?? ''}`;
}

export function sameLinkTarget(first: LinkTarget, second: LinkTarget): boolean {
  return sameAddress(first.block, second.block) && first.cellId === second.cellId;
}

// The tab that holds a live repeat block of a sheet: the tab of the repeat section its block path
// names. `null` when the block is gone or its section is not in the template.
export function repeatBlockTabIndex(
  records: Iterable<VersionedRecord>,
  layout: TemplateLayout,
  target: BlockAddress,
): number | null {
  const recordList = [...records];
  const scopePath = scopePathOf(target);
  const sectionId = sectionIdOf(target);
  const instanceId = blockIdOf(target);
  const scoped = repeatScopeByPath(layout, scopePath);
  const place = scoped === null ? null : { place: scoped.place };

  if (
    sectionId === null ||
    instanceId === null ||
    place === null ||
    !isLiveBlock(new Map(recordList.map((record) => [record.k, record])), target)
  ) {
    return null;
  }

  const tabRepeat = repeatTabById(layout, sectionId);

  const tab = layout.tabs[place.place.tabIndex];
  const tabInstanceId = tab?.repeat?.id === scopePath[0] ? (target.path[1] ?? null) : null;

  const tabs = renderedTabs(
    layout,
    new Map(recordList.map((record) => [record.k, record] as const)),
    target.sheetId,
  );

  const index = tabs.findIndex(
    (renderedTab) =>
      renderedTab.sourceIndex === place.place.tabIndex &&
      (tabRepeat === null
        ? tabInstanceId === null
          ? renderedTab.block === null
          : renderedTab.block?.block.path[0] === scopePath[0] &&
            renderedTab.block?.block.path[1] === tabInstanceId
        : renderedTab.block?.block.path[0] === sectionId &&
          renderedTab.block?.block.path[1] === (tabInstanceId ?? instanceId)),
  );

  return index === -1 ? null : index;
}

// AD-19: a link is live only while its sheet is live, its repeat block is live when it names one,
// and the template, for a sheet link, or the repeat section, for a repeat block link, is linkable.
// `null`: the link is inert, and every view and the token menu treat it as no link.
export function liveLinkTarget(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  target: LinkTarget,
): LiveLinkTarget | null {
  const block = target.block;
  const policy = resolveSheet(records, preset, block.sheetId);

  if (policy === null) {
    return null;
  }

  if (block.path.length === 0) {
    const cell = tokenCellPlace(policy.template, target.cellId, null);

    return policy.linkable && cell !== null ? { target, policy, section: null, cell } : null;
  }

  if (sectionIdOf(block) === null || blockIdOf(block) === null || !isLiveBlock(records, block)) {
    return null;
  }

  const scopePath = scopePathOf(block);
  const section = repeatSectionByPath(policy.template, scopePath);

  const cell = section === null ? null : tokenCellPlace(policy.template, target.cellId, scopePath);

  return section !== null && cell !== null ? { target, policy, section, cell } : null;
}

export function tokenCellPlace(
  template: TemplateLayout,
  cellId: string | undefined,
  repeatScopePath: readonly string[] | null,
): TokenCellPlace | null {
  if (cellId === undefined) {
    return null;
  }

  if (repeatScopePath !== null) {
    return tokenCellPlaceAtPath(template, cellId, repeatScopePath);
  }

  for (const { place, section } of placedSections(template)) {
    if (template.tabs[place.tabIndex]?.repeat !== undefined) continue;

    if (section.repeat !== undefined) continue;

    for (const [rowIndex, row] of section.rows.entries()) {
      if (row.repeat !== undefined) continue;

      if (row.cells.some((cell) => cell.kind === 'token' && cell.id === cellId)) {
        return {
          tabIndex: place.tabIndex,
          sectionIndex: place.sectionIndex,
          rowIndex,
          section,
          row,
        };
      }
    }
  }

  return null;
}

function tokenCellPlaceAtPath(
  template: TemplateLayout,
  cellId: string,
  scopePath: readonly string[],
): TokenCellPlace | null {
  const scope = repeatScopeByPath(template, scopePath);

  if (scope === null) return null;

  const { tabIndex } = scope.place;

  if (scope.row !== null) {
    return rowHasToken(scope.row, cellId)
      ? {
          tabIndex,
          sectionIndex: scope.place.sectionIndex,
          rowIndex: scope.section.rows.indexOf(scope.row),
          section: scope.section,
          row: scope.row,
        }
      : null;
  }

  const tab = template.tabs[tabIndex];

  // A repeat tab's scope spans its plain sections; a repeat section's scope is that section.
  const sections =
    scopePath.length === 1 && tab?.repeat !== undefined
      ? [...tab.sections.entries()].filter(([, section]) => section.repeat === undefined)
      : [[scope.place.sectionIndex, scope.section] as const];

  for (const [sectionIndex, section] of sections) {
    const row = section.rows.find(
      (candidate) => candidate.repeat === undefined && rowHasToken(candidate, cellId),
    );

    if (row !== undefined) {
      return { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
    }
  }

  return null;
}

function rowHasToken(row: PresetRow, cellId: string): boolean {
  return row.cells.some((cell) => cell.kind === 'token' && cell.id === cellId);
}
