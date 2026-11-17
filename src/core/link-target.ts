import type { JsonValue } from '@/core/json';
import {
  repeatSectionByPath,
  repeatSectionPlace,
  repeatTabById,
  repeatScopeById,
  placedSections,
  type Preset,
  type PresetSection,
  type PresetRow,
  type TemplateLayout,
} from '@/core/preset';
import {
  linkDataSchema,
  blockPathKey,
  parseBlockPathKey,
  repDataSchema,
  type LinkData,
  type VersionedRecord,
} from '@/core/records';
import { renderedTabs } from '@/core/rendered-tabs';
import { resolveSheet, sheetIdSchema, type SheetPolicy } from '@/core/sheets';

// A v4 link names a sheet, an optional sequence of (repeat scope, block id)
// pairs, and the token cell. `instanceId` remains as a derived compatibility
// view for replica code that addresses one block at a time.
export type LinkTarget = {
  sheetId: string;
  instanceId: string | null;
  path?: string[] | null;
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

// Where each live repeat block of the replica is, by `blockIndexKey`.
export type BlockIndex = ReadonlyMap<string, string>;

// The target a `link:` record's data names, or `null` for a tombstone or an id no command could
// write, which would make an open request no window takes.
export function linkTargetOf(d: JsonValue): LinkTarget | null {
  const data = linkDataSchema.safeParse(d);

  if (!data.success || !sheetIdSchema.safeParse(data.data.s).success) {
    return null;
  }

  const path = data.data.path ?? null;
  const instanceId = path === null ? null : (path.at(-1) ?? null);

  return { sheetId: data.data.s, instanceId, path, cellId: data.data.c };
}

// The `link:` record data for a target.
export function linkDataOf(target: LinkTarget): LinkData {
  return target.path === null || target.path === undefined
    ? { s: target.sheetId, c: target.cellId ?? '' }
    : { s: target.sheetId, path: target.path, c: target.cellId ?? '' };
}

// One string per target, so targets can be kept in a set.
export function linkTargetKey(target: LinkTarget): string {
  const path = target.path?.join(':') ?? '';

  return `${target.sheetId}:${path}:${target.cellId ?? ''}`;
}

export function sameLinkTarget(first: LinkTarget, second: LinkTarget): boolean {
  return (
    first.sheetId === second.sheetId &&
    first.instanceId === second.instanceId &&
    first.cellId === second.cellId &&
    JSON.stringify(first.path ?? null) === JSON.stringify(second.path ?? null)
  );
}

// The section id of every live repeat block, by sheet id and instance id. An instance id is unique
// in its sheet, so a link needs no section. When two live records share one, the first key in code
// unit order wins on every client.
export function blockIndex(records: Iterable<VersionedRecord>): BlockIndex {
  const index = new Map<string, string>();
  const keys = new Map<string, string>();

  for (const record of records) {
    const parts = parseBlockPathKey(record.k);

    if (parts === null || !repDataSchema.safeParse(record.d).success) {
      continue;
    }

    const instanceId = parts.path.at(-1);

    if (instanceId === undefined) continue;

    const key = blockIndexKey(parts.sheetId, instanceId);
    const held = keys.get(key);

    if (held === undefined || record.k < held) {
      keys.set(key, record.k);
      index.set(key, parts.path.at(-2) ?? '');
    }
  }

  return index;
}

// The tab that holds a live repeat block of a sheet: the tab of the repeat section its block path
// names. `null` when the block is gone or its section is not in the template.
export function repeatBlockTabIndex(
  records: Iterable<VersionedRecord>,
  layout: TemplateLayout,
  sheetId: string,
  instanceId: string,
): number | null {
  const recordList = [...records];
  const sectionId = blockIndex(recordList).get(blockIndexKey(sheetId, instanceId));
  const place = sectionId === undefined ? null : repeatSectionPlace(layout, sectionId);

  if (sectionId === undefined || place === null) return null;

  const tabRepeat = repeatTabById(layout, sectionId);

  const tabs = renderedTabs(
    layout,
    new Map(recordList.map((record) => [record.k, record] as const)),
    sheetId,
  );

  const index = tabs.findIndex(
    (tab) =>
      tab.sourceIndex === place.place.tabIndex &&
      (tabRepeat === null
        ? tab.block === null
        : tab.block?.scopeId === sectionId && tab.block.instanceId === instanceId),
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
  blocks: BlockIndex = blockIndex(records.values()),
): LiveLinkTarget | null {
  void blocks;
  const policy = resolveSheet(records, preset, target.sheetId);

  if (policy === null) {
    return null;
  }

  if (target.instanceId === null) {
    const cell = tokenCellPlace(policy.template, target.cellId, null);

    return policy.linkable && cell !== null ? { target, policy, section: null, cell } : null;
  }

  const sectionId = target.path?.at(-2);
  const instanceId = target.path?.at(-1);

  if (
    target.path === undefined ||
    target.path === null ||
    target.path.length < 2 ||
    target.path.length % 2 !== 0 ||
    sectionId === undefined ||
    instanceId === undefined ||
    instanceId !== target.instanceId ||
    !isLiveRepeatBlock(records, target.sheetId, target.path)
  ) {
    return null;
  }

  const scopePath = target.path.filter((_part, index) => index % 2 === 0);
  const section = repeatSectionByPath(policy.template, scopePath);

  const cell =
    section === null ? null : tokenCellPlace(policy.template, target.cellId, sectionId, scopePath);

  return section !== null && cell !== null ? { target, policy, section, cell } : null;
}

function isLiveRepeatBlock(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  path: readonly string[],
): boolean {
  if (path.length < 2 || path.length % 2 !== 0) return false;

  for (let length = 2; length <= path.length; length += 2) {
    if (
      !repDataSchema.safeParse(records.get(blockPathKey(sheetId, path.slice(0, length)))?.d).success
    ) {
      return false;
    }
  }

  return true;
}

export function tokenCellPlace(
  template: TemplateLayout,
  cellId: string | undefined,
  repeatSectionId: string | null,
  repeatScopePath?: readonly string[],
): TokenCellPlace | null {
  if (cellId === undefined) {
    return null;
  }

  if (repeatScopePath !== undefined) {
    return tokenCellPlaceAtPath(template, cellId, repeatScopePath);
  }

  if (repeatSectionId !== null) {
    const tab = repeatTabById(template, repeatSectionId);

    if (tab !== null) {
      for (const [sectionIndex, section] of tab.tab.sections.entries()) {
        if (section.repeat !== undefined) continue;

        for (const [rowIndex, row] of section.rows.entries()) {
          if (row.repeat !== undefined) continue;

          if (row.cells.some((cell) => cell.kind === 'token' && cell.id === cellId)) {
            return {
              tabIndex: tab.place.tabIndex,
              sectionIndex,
              rowIndex,
              section,
              row,
            };
          }
        }
      }

      return null;
    }

    const scope = repeatScopeById(template, repeatSectionId);

    if (scope === null) return null;

    const rows =
      scope.row === null
        ? scope.section.rows.filter((row) => row.repeat === undefined)
        : [scope.row];

    const row = rows.find((candidate) =>
      candidate.cells.some((cell) => cell.kind === 'token' && cell.id === cellId),
    );

    if (row !== undefined) {
      return {
        tabIndex: scope.place.tabIndex,
        sectionIndex: scope.place.sectionIndex,
        rowIndex: scope.section.rows.indexOf(row),
        section: scope.section,
        row,
      };
    }

    return null;
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
      if (scopePath.length !== 1 || tab.repeat !== undefined) continue;

      for (const [sectionIndex, section] of tab.sections.entries()) {
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

function blockIndexKey(sheetId: string, instanceId: string): string {
  return `${sheetId}:${instanceId}`;
}
