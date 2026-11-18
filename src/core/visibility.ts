import { linkTargetOf, liveLinkTarget, type LiveLinkTarget } from '@/core/link-target';
import type { DicePlace } from '@/core/dice-roll';
import {
  firstFieldId,
  placedSections,
  repeatSectionPlace,
  repeatScopeByPath,
  type Preset,
  type Template,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import {
  dependentSheetId,
  isDependentKey,
  isSheetSet,
  liveSheets,
  resolveSheet,
  type SheetSummary,
} from '@/core/sheets';

export type PlayerRole = 'GM' | 'PLAYER';

type FieldVisibilityTarget =
  | { kind: 'row'; rowId: string }
  | { kind: 'rep'; sectionId: string; fieldId?: string; path?: readonly string[] };

// One template as the sidebar lists it: a sheet set with its live sheets, or a single sheet, whose
// sheet id is its template id.
export type VisibleTemplate =
  | { kind: 'set'; template: Template; sheets: SheetSummary[] }
  | { kind: 'single'; template: Template };

// The templates a role sees, in preset order.
export type VisibleSheets = VisibleTemplate[];

// CAP-2: a GM sees every template, a player only those with `visibility` other than "gm".
export function templateShownTo(role: PlayerRole, template: Template): boolean {
  return role === 'GM' || template.visibility !== 'gm';
}

// AD-18: visibility narrows from the template to a tab. A GM sees every tab; a player sees a tab
// only when both its template and the tab are visible.
export function tabShownTo(role: PlayerRole, template: Template, tabIndex: number): boolean {
  const tab = template.tabs[tabIndex];

  return (
    tab !== undefined &&
    templateShownTo(role, template) &&
    (role === 'GM' || tab.visibility !== 'gm')
  );
}

export function sectionShownTo(
  role: PlayerRole,
  template: Template,
  tabIndex: number,
  sectionIndex: number,
): boolean {
  const section = template.tabs[tabIndex]?.sections[sectionIndex];

  return (
    section !== undefined &&
    tabShownTo(role, template, tabIndex) &&
    (role === 'GM' || section.visibility !== 'gm')
  );
}

export function rowShownTo(
  role: PlayerRole,
  template: Template,
  tabIndex: number,
  sectionIndex: number,
  rowIndex: number,
): boolean {
  const section = template.tabs[tabIndex]?.sections[sectionIndex];
  const row = section?.rows[rowIndex];

  return (
    row !== undefined &&
    sectionShownTo(role, template, tabIndex, sectionIndex) &&
    (role === 'GM' || row.visibility !== 'gm')
  );
}

// A dice cell inherits visibility from its template, tab, section and row. The place is already
// checked by the roll parser, so an invalid layout position is not shown to a player.
export function rollTargetShownTo(
  role: PlayerRole,
  template: Template,
  place: Pick<DicePlace, 'tabIndex' | 'sectionIndex' | 'rowIndex'>,
): boolean {
  if (role === 'GM') {
    return true;
  }

  const tab = template.tabs[place.tabIndex];
  const section = tab?.sections[place.sectionIndex];
  const row = section?.rows[place.rowIndex];

  return (
    row !== undefined &&
    section !== undefined &&
    tabShownTo(role, template, place.tabIndex) &&
    section.visibility !== 'gm' &&
    row.visibility !== 'gm'
  );
}

// AD-4 and AD-18: a field target belongs to one tab, so the same visibility rule can guard every
// field in its row or repeat block.
export function fieldTargetShownTo(
  role: PlayerRole,
  template: Template,
  target: FieldVisibilityTarget,
): boolean {
  const tabIndex = fieldTargetTabIndex(template, target);

  return tabIndex !== null && tabShownTo(role, template, tabIndex);
}

// AD-19: a sheet link is governed by its template; a repeat-block link is also governed by the tab
// that holds its repeat section.
export function linkTargetShownTo(role: PlayerRole, live: LiveLinkTarget): boolean {
  if (!templateShownTo(role, live.policy.template)) {
    return false;
  }

  if (live.section === null) {
    return (
      tabShownTo(role, live.policy.template, live.cell.tabIndex) &&
      (role === 'GM' ||
        (live.cell.section.visibility !== 'gm' && live.cell.row.visibility !== 'gm'))
    );
  }

  return (
    tabShownTo(role, live.policy.template, live.cell.tabIndex) &&
    (role === 'GM' || (live.cell.section.visibility !== 'gm' && live.cell.row.visibility !== 'gm'))
  );
}

// True while a template owns `sheetId` and this role sees that template.
export function sheetShownTo(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  sheetId: string,
  role: PlayerRole,
): boolean {
  const policy = resolveSheet(records, preset, sheetId);

  return policy !== null && templateShownTo(role, policy.template);
}

// The Visibility convention: a GM sees every record. A player sees the preset, the sheets of
// visible templates with their dependents, and live links to them. With no decoded preset a player
// sees only the `preset` record. Hiding is at the interface only: a player client still holds and
// merges hidden records. Each record is judged against `known`, so a row that comes before its
// sheet, or a link to a hidden sheet, stays hidden. A sheet tombstone stays: its sheet set cannot
// be told, and it shows nothing by itself.
export function visibleRecords(
  role: PlayerRole,
  preset: Preset | null,
  records: readonly VersionedRecord[],
  known: ReadonlyMap<string, VersionedRecord> = new Map(
    records.map((record) => [record.k, record]),
  ),
): VersionedRecord[] {
  if (role === 'GM') {
    return [...records];
  }

  if (preset === null) {
    return records.filter((record) => record.k === 'preset');
  }

  return records.filter((record) => {
    if (record.k.startsWith('blk:') && record.k.split(':').length === 2) {
      return record.d === null || sheetShownTo(known, preset, record.k.slice('blk:'.length), role);
    }

    if (record.k.startsWith('link:')) {
      const target = linkTargetOf(record.d);
      const live = target === null ? null : liveLinkTarget(known, preset, target);

      return live !== null && linkTargetShownTo(role, live);
    }

    if (!isDependentKey(record.k)) {
      return true;
    }

    const sheetId = dependentSheetId(record.k, record);

    return sheetId !== null && sheetShownTo(known, preset, sheetId, role);
  });
}

// The window's records as a role sees them. A GM sees every record, so its map comes back as is.
export function visibleRecordMap(
  role: PlayerRole,
  preset: Preset | null,
  records: ReadonlyMap<string, VersionedRecord>,
): ReadonlyMap<string, VersionedRecord> {
  if (role === 'GM') {
    return records;
  }

  return new Map(
    visibleRecords(role, preset, [...records.values()], records).map((record) => [
      record.k,
      record,
    ]),
  );
}

// The only way a view lists sheets, so no view filters by template or role on its own. Templates
// come in preset order, and a sheet set's sheets by `(order, sheetId)`.
export function visibleSheets(
  role: PlayerRole,
  preset: Preset | null,
  records: ReadonlyMap<string, VersionedRecord>,
): VisibleSheets {
  if (preset === null) {
    return [];
  }

  return preset.templates.flatMap((template): VisibleTemplate[] => {
    if (!templateShownTo(role, template)) {
      return [];
    }

    return isSheetSet(template)
      ? [{ kind: 'set', template, sheets: liveSheets(records.values(), preset, template.id) }]
      : [{ kind: 'single', template }];
  });
}

// AD-13: a player shows only a roll from a visible sheet. It still receives a hidden one.
export function rollShownTo(role: PlayerRole, hidden: boolean): boolean {
  return role === 'GM' || !hidden;
}

function fieldTargetTabIndex(template: Template, target: FieldVisibilityTarget): number | null {
  if (target.kind === 'rep') {
    const scoped =
      target.path === undefined
        ? null
        : repeatScopeByPath(
            template,
            target.path.filter((_part, index) => index % 2 === 0),
          );

    const repeated =
      scoped === null
        ? repeatSectionPlace(template, target.sectionId)
        : { place: scoped.place, section: scoped.section };

    if (repeated === null) {
      return null;
    }

    const { section, place } = repeated;

    if (target.fieldId === undefined) {
      return section.visibility === 'gm' || scoped?.row?.visibility === 'gm'
        ? null
        : place.tabIndex;
    }

    if (scoped?.row !== null && scoped?.row !== undefined) {
      return scoped.row.visibility === 'gm' ||
        section.visibility === 'gm' ||
        !scoped.row.cells.some((cell) => cell.kind === 'field' && cell.id === target.fieldId)
        ? null
        : place.tabIndex;
    }

    // A repeat tab projects its plain rows into one synthetic section, so recover the source
    // section before authorizing a field.
    if (template.tabs[place.tabIndex]?.repeat?.id === target.sectionId) {
      const source = template.tabs[place.tabIndex]?.sections
        .filter((candidate) => candidate.repeat === undefined)
        .flatMap((candidate) =>
          candidate.rows
            .filter((row) => row.repeat === undefined)
            .map((row) => ({ row, section: candidate })),
        )
        .find(({ row }) =>
          row.cells.some((cell) => cell.kind === 'field' && cell.id === target.fieldId),
        );

      return source === undefined ||
        source.row.visibility === 'gm' ||
        source.section.visibility === 'gm'
        ? null
        : place.tabIndex;
    }

    const row = section.rows.find((candidate) =>
      candidate.cells.some((cell) => cell.kind === 'field' && cell.id === target.fieldId),
    );

    return row === undefined || row.visibility === 'gm' || section.visibility === 'gm'
      ? null
      : place.tabIndex;
  }

  for (const { place, section } of placedSections(template)) {
    if (section.repeat === undefined) {
      const row = section.rows.find((item) => firstFieldId(item) === target.rowId);

      if (row !== undefined && row.visibility !== 'gm' && section.visibility !== 'gm') {
        return place.tabIndex;
      }
    }
  }

  return null;
}
