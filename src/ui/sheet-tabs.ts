import { canEdit, ownedSheetIds } from '@/core/access';
import type { Preset, SheetSetTemplate } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { resolveSheet, sheetKey, sheetName, type SheetPolicy } from '@/core/sheets';
import { visibleSheets, type PlayerRole } from '@/core/visibility';

// One sheet as its tab shows it. `id` is the tab's id, the `sheet:` key form of the sheet id, which
// a single sheet's template id takes too, so no tab id equals another.
export type SheetTab = {
  id: string;
  sheetId: string;
  policy: SheetPolicy;
  // The sheet's name as `core` names it, "" for an empty one.
  name: string;
  // The player owns this sheet of a sheet set (FR19).
  owned: boolean;
};

// One item of the tab bar: a sheet's tab, or the "+" of a sheet set after its last sheet.
export type TabEntry = { kind: 'sheet'; tab: SheetTab } | { kind: 'add'; set: SheetSetTemplate };

// UX: one list in preset order. A sheet set shows its sheets in their order, then its "+" for the
// GM. A single sheet shows one tab. A player sees only visible templates, and the player's own
// sheets come first, each part keeping its order.
export function tabEntries(
  role: PlayerRole,
  preset: Preset | null,
  records: ReadonlyMap<string, VersionedRecord>,
  playerId: string,
): TabEntry[] {
  const entries: TabEntry[] = [];

  const push = (sheetId: string, owned: boolean): void => {
    const tab = tabOf(records, preset, sheetId, owned);

    if (tab !== null) {
      entries.push({ kind: 'sheet', tab });
    }
  };

  for (const visible of visibleSheets(role, preset, records)) {
    if (visible.kind === 'single') {
      push(visible.template.id, false);

      continue;
    }

    const owned =
      role === 'GM' ? new Set<string>() : ownedSheetIds(visible.sheets, records, playerId);

    for (const sheet of visible.sheets) {
      push(sheet.sheetId, owned.has(sheet.sheetId));
    }

    if (role === 'GM') {
      entries.push({ kind: 'add', set: visible.template });
    }
  }

  return [
    ...entries.filter((entry) => entry.kind === 'sheet' && entry.tab.owned),
    ...entries.filter((entry) => entry.kind !== 'sheet' || !entry.tab.owned),
  ];
}

// The sheet tabs of the entries, in their order.
export function sheetTabs(entries: readonly TabEntry[]): SheetTab[] {
  return entries.flatMap((entry) => (entry.kind === 'sheet' ? [entry.tab] : []));
}

// AD-4: whether a player may edit a sheet. A sheet of a sheet set takes the player's live `acl:`,
// and a single sheet the template's `players: edit`. A hidden template takes no player edit.
export function playerMayEdit(
  policy: SheetPolicy,
  records: ReadonlyMap<string, VersionedRecord>,
  playerId: string,
): boolean {
  if (policy.write === 'players-edit') {
    return true;
  }

  return policy.write === 'per-player' && canEdit(records, policy.sheetId, playerId);
}

// AD-18: the one resolver gives the sheet's policy. `null` for a sheet no template owns.
function tabOf(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  sheetId: string,
  owned: boolean,
): SheetTab | null {
  const policy = resolveSheet(records, preset, sheetId);

  return policy === null
    ? null
    : {
        id: sheetKey(sheetId),
        sheetId,
        policy,
        name: sheetName(records, preset, sheetId) ?? '',
        owned,
      };
}
