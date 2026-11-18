import type { JsonValue } from '@/core/json';
import {
  blockAddress,
  blockIdOf,
  isLiveBlock,
  scopePathOf,
  sectionIdOf,
  sheetRootAddress,
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

type AddressLinkTarget = {
  block: BlockAddress;
  cellId?: string;
};

type LegacyLinkTarget = {
  block?: any;
  sheetId: string;
  instanceId: string | null;
  path?: readonly string[] | null;
  cellId?: string;
};

export type LinkTarget = AddressLinkTarget | LegacyLinkTarget;

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

  const block =
    data.data.path === undefined
      ? sheetRootAddress(data.data.s)
      : { sheetId: data.data.s, path: data.data.path };

  return { block, cellId: data.data.c };
}

// The `link:` record data for a target.
export function linkDataOf(target: LinkTarget): LinkData {
  const block = blockOfLinkTarget(target);
  const { sheetId, path } = block;

  return path.length === 0
    ? { s: sheetId, c: targetCellId(target) ?? '' }
    : { s: sheetId, path: [...path], c: targetCellId(target) ?? '' };
}

// One string per target, so targets can be kept in a set.
export function linkTargetKey(target: LinkTarget): string {
  const block = blockOfLinkTarget(target);

  return `${block.sheetId}:${block.path.join(':')}:${targetCellId(target) ?? ''}`;
}

export function sameLinkTarget(first: LinkTarget, second: LinkTarget): boolean {
  if (!('block' in first) && !('block' in second)) {
    return (
      first.sheetId === second.sheetId &&
      first.instanceId === second.instanceId &&
      first.cellId === second.cellId &&
      JSON.stringify(first.path ?? null) === JSON.stringify(second.path ?? null)
    );
  }

  return (
    sameBlock(blockOfLinkTarget(first), blockOfLinkTarget(second)) &&
    targetCellId(first) === targetCellId(second)
  );
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
  const block = blockOfLinkTarget(target);
  const policy = resolveSheet(records, preset, block.sheetId);

  if (policy === null) {
    return null;
  }

  if (block.path.length === 0) {
    const cell = tokenCellPlace(policy.template, targetCellId(target), null);

    return policy.linkable && cell !== null ? { target, policy, section: null, cell } : null;
  }

  if (sectionIdOf(block) === null || blockIdOf(block) === null || !isLiveBlock(records, block)) {
    return null;
  }

  const scopePath = scopePathOf(block);
  const section = repeatSectionByPath(policy.template, scopePath);

  const cell =
    section === null ? null : tokenCellPlace(policy.template, targetCellId(target), scopePath);

  return section !== null && cell !== null ? { target, policy, section, cell } : null;
}

export function blockOfLinkTarget(target: LinkTarget): BlockAddress {
  return 'block' in target
    ? target.block
    : (blockAddress(target.sheetId, target.path ?? []) ?? sheetRootAddress(target.sheetId));
}

function targetCellId(target: LinkTarget): string | undefined {
  return target.cellId;
}

function sameBlock(first: BlockAddress, second: BlockAddress): boolean {
  return (
    first.sheetId === second.sheetId &&
    first.path.length === second.path.length &&
    first.path.every((segment, index) => second.path[index] === segment)
  );
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
  const [tabScopeId, childScopeId, rowScopeId] = scopePath;

  for (const [tabIndex, tab] of template.tabs.entries()) {
    if (tab.repeat?.id !== tabScopeId) {
      if ((scopePath.length !== 1 && scopePath.length !== 2) || tab.repeat !== undefined) continue;

      for (const [sectionIndex, section] of tab.sections.entries()) {
        if (section.repeat?.id === tabScopeId && scopePath.length === 2) {
          const row = section.rows.find(
            (candidate) => candidate.repeat?.id === childScopeId && rowHasToken(candidate, cellId),
          );

          if (row !== undefined) {
            return { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
          }

          continue;
        }

        if (section.repeat?.id !== tabScopeId) {
          const row = section.rows.find((candidate) => candidate.repeat?.id === tabScopeId);

          if (row !== undefined && rowHasToken(row, cellId)) {
            return { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
          }

          continue;
        }

        const row = section.rows.find(
          (candidate) => candidate.repeat === undefined && rowHasToken(candidate, cellId),
        );

        if (row !== undefined) {
          return { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
        }
      }

      continue;
    }

    if (scopePath.length === 1) {
      for (const [sectionIndex, section] of tab.sections.entries()) {
        if (section.repeat !== undefined) continue;

        const row = section.rows.find(
          (candidate) => candidate.repeat === undefined && rowHasToken(candidate, cellId),
        );

        if (row !== undefined) {
          return { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
        }
      }

      return null;
    }

    for (const [sectionIndex, section] of tab.sections.entries()) {
      if (section.repeat?.id === childScopeId) {
        if (scopePath.length === 2) {
          const row = section.rows.find(
            (candidate) => candidate.repeat === undefined && rowHasToken(candidate, cellId),
          );

          return row === undefined
            ? null
            : { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
        }

        const row = section.rows.find(
          (candidate) => candidate.repeat?.id === rowScopeId && rowHasToken(candidate, cellId),
        );

        return row === undefined
          ? null
          : { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
      }

      if (childScopeId !== undefined && section.repeat === undefined && scopePath.length === 2) {
        const row = section.rows.find(
          (candidate) => candidate.repeat?.id === childScopeId && rowHasToken(candidate, cellId),
        );

        if (row !== undefined) {
          return { tabIndex, sectionIndex, rowIndex: section.rows.indexOf(row), section, row };
        }
      }
    }
  }

  return null;
}

function rowHasToken(row: PresetRow, cellId: string): boolean {
  return row.cells.some((cell) => cell.kind === 'token' && cell.id === cellId);
}
