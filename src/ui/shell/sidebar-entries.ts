import { ownedFirst, ownedSheetIds } from '@/core/access';
import type { Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { copy } from '@/copy';
import {
  isSheetSet,
  liveSheets,
  resolveSheet,
  sheetKey,
  sheetName,
  sheetPolicy,
  type SheetPolicy,
} from '@/core/sheets';
import { templateShownTo, visibleSheets, type PlayerRole } from '@/core/visibility';

// One sheet listed by the window sidebar. The policy is kept here because the selected sheet's
// content uses the same resolved template as the navigation model.
export type SidebarSheet = {
  id: string;
  sheetId: string;
  policy: SheetPolicy;
  name: string;
  owned: boolean;
  selectedOnMap: boolean;
  sample?: boolean;
  templateUid?: string;
};

export type SidebarGroup = {
  kind: 'group';
  id: string;
  title: string;
  sheets: readonly SidebarSheet[];
  canAdd: boolean;
};

export type SidebarSingle = { kind: 'single'; sheet: SidebarSheet };

export type SidebarSection = SidebarGroup | SidebarSingle;

export type SidebarEntries = { sections: readonly SidebarSection[] };

export function sidebarSheetId(entries: SidebarEntries, id: string): string | null {
  for (const section of entries.sections) {
    const sheet =
      section.kind === 'single'
        ? section.sheet.id === id
          ? section.sheet
          : undefined
        : section.sheets.find((entry) => entry.id === id);

    if (sheet !== undefined) {
      return sheet.sheetId;
    }
  }

  return null;
}

// The one ordered navigation model for sheets. Groups and singles stay interleaved in preset order;
// ownership changes order only inside its own group.
export function sidebarEntries(
  role: PlayerRole,
  preset: Preset | null,
  records: ReadonlyMap<string, VersionedRecord>,
  playerId: string,
  selectedSheetIds: ReadonlySet<string> = new Set(),
): SidebarEntries {
  const sections: SidebarSection[] = [];

  for (const visible of visibleSheets(role, preset, records)) {
    if (visible.kind === 'single') {
      const sheet = sidebarSheet(records, preset, visible.template.id, false, selectedSheetIds);

      if (sheet !== null) {
        sections.push({ kind: 'single', sheet });
      }

      continue;
    }

    const owned =
      role === 'GM' ? new Set<string>() : ownedSheetIds(visible.sheets, records, playerId);

    const ordered = role === 'GM' ? visible.sheets : ownedFirst(visible.sheets, owned);

    const sheets = ordered.flatMap((sheet) => {
      const entry = sidebarSheet(
        records,
        preset,
        sheet.sheetId,
        owned.has(sheet.sheetId),
        selectedSheetIds,
      );

      return entry === null ? [] : [entry];
    });

    // A player does not get an empty group heading. A GM does, so the add button has a home.
    if (role === 'PLAYER' && sheets.length === 0) {
      continue;
    }

    sections.push({
      kind: 'group',
      id: visible.template.id,
      title: visible.template.title,
      sheets,
      canAdd: role === 'GM',
    });
  }

  return { sections };
}

// The sheet-set identity is the group key. A single sheet uses its template id as both ids.
function sidebarSheet(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  sheetId: string,
  owned: boolean,
  selectedSheetIds: ReadonlySet<string> = new Set(),
): SidebarSheet | null {
  const policy = resolveSheet(records, preset, sheetId);

  return policy === null
    ? null
    : {
        id: sheetKey(sheetId),
        sheetId,
        policy,
        name: sheetName(records, preset, sheetId) ?? '',
        owned,
        selectedOnMap: selectedSheetIds.has(sheetId),
      };
}

// Used by the standalone and builder previews, where each preview sheet is already known and no
// room visibility or ownership rules apply. It still goes through this module so those pages keep
// the window's ordering and grouping rule.
export function previewSidebarEntries(
  templates: readonly { template: Preset['templates'][number]; sheetId: string; name: string }[],
): SidebarEntries {
  const sections: SidebarSection[] = [];

  for (const { template, sheetId, name } of templates) {
    const policy: SheetPolicy = {
      sheetId,
      template,
      hidden: false,
      write: 'none',
      nameField: null,
      linkable: false,
    };

    const sheet: SidebarSheet = {
      id: sheetKey(sheetId),
      sheetId,
      policy,
      name,
      owned: false,
      selectedOnMap: false,
    };

    if (isSheetSet(template)) {
      sections.push({
        kind: 'group',
        id: template.id,
        title: template.title,
        sheets: [sheet],
        canAdd: false,
      });
    } else {
      sections.push({ kind: 'single', sheet });
    }
  }

  return { sections };
}

// The builder uses the same grouping and ordering as the room window, but supplies a pale sample
// entry while a sheet set has no real sheets.
export function builderSidebarEntries(
  preset: Preset,
  records: ReadonlyMap<string, VersionedRecord>,
  templateUids: readonly string[],
  role: PlayerRole = 'GM',
): SidebarEntries {
  const sections: SidebarSection[] = [];
  // An empty snapshot gets one stable sample tab instead of one duplicate per empty sheet set.
  let emptySampleShown = false;

  for (const [templateIndex, template] of preset.templates.entries()) {
    if (!templateShownTo(role, template)) {
      continue;
    }

    const templateUid = templateUids[templateIndex] ?? template.id;
    const ownerPreset = { ...preset, templates: [template] };

    if (isSheetSet(template)) {
      const sheets = liveSheets(records.values(), ownerPreset, template.id)
        .map((sheet) => builderSidebarSheet(records, ownerPreset, templateUid, sheet.sheetId))
        .filter((sheet): sheet is SidebarSheet => sheet !== null);

      if (role === 'PLAYER' && sheets.length === 0) {
        continue;
      }

      if (sheets.length === 0 && records.size === 0 && emptySampleShown) {
        continue;
      }

      if (sheets.length === 0 && records.size === 0) {
        emptySampleShown = true;
      }

      sections.push({
        kind: 'group',
        id: template.id,
        title: template.title,
        sheets: sheets.length === 0 ? [sampleSheet(template, templateUid)] : sheets,
        canAdd: role === 'GM',
      });
    } else {
      const sheet = builderSidebarSheet(records, ownerPreset, templateUid, template.id);

      if (sheet !== null) {
        sections.push({ kind: 'single', sheet });
      }
    }
  }

  return { sections };
}

export function builderSidebarEntryId(templateUid: string, sheetId: string): string {
  return `builder-sheet:${templateUid}:${sheetId}`;
}

function builderSidebarSheet(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset,
  templateUid: string,
  sheetId: string,
): SidebarSheet | null {
  const sheet = sidebarSheet(records, preset, sheetId, false);

  return sheet === null
    ? null
    : {
        ...sheet,
        id: builderSidebarEntryId(templateUid, sheetId),
        templateUid,
      };
}

function sampleSheet(
  template: Extract<Preset['templates'][number], { kind: 'set' }>,
  templateUid: string,
): SidebarSheet {
  return {
    id: builderSidebarEntryId(templateUid, template.id),
    sheetId: template.id,
    policy: sheetPolicy(template, template.id),
    name: copy.builder.previewSample,
    owned: false,
    selectedOnMap: false,
    sample: true,
    templateUid,
  };
}
