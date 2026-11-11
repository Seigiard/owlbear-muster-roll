import { ownersBySheet } from '@/core/merge';
import {
  playerDataSchema,
  playerIdSchema,
  plinkPrefix,
  type VersionedRecord,
} from '@/core/records';
import { SHEET_NAME_MAX_LENGTH, sortSheets, type SheetSummary } from '@/core/sheets';
import type { PlayerRole } from '@/core/visibility';

// One party member as the access panel needs it.
export type PartyEntry = { id: string; name: string; role: PlayerRole };

// One row of the access panel: a player id, its last known name or `null` when none is known, and
// whether it holds write access.
export type AccessRow = { playerId: string; name: string | null; canEdit: boolean };

// The party a window gets holds at most this many player ids, so it never crowds the message.
export const PARTY_LIMIT = 100;

// A player name is kept as a sheet name is: trimmed, and at most this many code points.
export const PLAYER_NAME_MAX_LENGTH = SHEET_NAME_MAX_LENGTH;

// The forms whose records say a player already holds rights on a sheet. Their names stand in for a
// player who is not in the room.
const RIGHTS_FORMS = ['acl', 'plink'] as const;

type RightsForm = (typeof RIGHTS_FORMS)[number];

type HeldRight = { form: RightsForm; playerId: string; name: string };

// Names sort as a Russian reader expects. Equal names keep one order by player id.
const NAMES = new Intl.Collator('ru');

export function aclKey(sheetId: string, playerId: string): string {
  return `acl:${sheetId}:${playerId}`;
}

export function plinkKey(sheetId: string, playerId: string): string {
  return `${plinkPrefix(sheetId)}${playerId}`;
}

// FR19: the ids of the sheets whose owner is this player.
export function ownedSheetIds(
  sheets: readonly Pick<SheetSummary, 'sheetId'>[],
  records: ReadonlyMap<string, VersionedRecord>,
  playerId: string,
): Set<string> {
  const owners = ownersBySheet(records.values());
  const owned = new Set<string>();

  for (const { sheetId } of sheets) {
    if (owners.get(sheetId) === playerId) {
      owned.add(sheetId);
    }
  }

  return owned;
}

// FR19, UX-DR8: the characters a player owns come first, then the rest. Each part is ordered by
// `(order, sheetId)`.
export function ownedFirst<Sheet extends Pick<SheetSummary, 'sheetId' | 'order'>>(
  sheets: readonly Sheet[],
  owned: ReadonlySet<string>,
): Sheet[] {
  const sorted = sortSheets(sheets);

  return [
    ...sorted.filter((sheet) => owned.has(sheet.sheetId)),
    ...sorted.filter((sheet) => !owned.has(sheet.sheetId)),
  ];
}

// Trimmed and cut to `PLAYER_NAME_MAX_LENGTH` code points. A blank name becomes "".
export function playerName(candidate: string): string {
  return Array.from(candidate.trim()).slice(0, PLAYER_NAME_MAX_LENGTH).join('').trim();
}

// FR3: a player may edit a sheet while a live `acl:` record names the sheet and the player.
export function canEdit(
  records: ReadonlyMap<string, VersionedRecord>,
  sheetId: string,
  playerId: string,
): boolean {
  if (!playerIdSchema.safeParse(playerId).success) {
    return false;
  }

  const record = records.get(aclKey(sheetId, playerId));

  return record !== undefined && record.d !== null;
}

// The party as a window gets it: one entry per valid player id, a GM when any of its connections
// is one, the first non-blank name, sorted by id and at most `PARTY_LIMIT` entries.
export function partyEntries(members: readonly PartyEntry[]): PartyEntry[] {
  const byId = new Map<string, PartyEntry>();

  for (const member of members) {
    if (!playerIdSchema.safeParse(member.id).success) {
      continue;
    }

    const known = byId.get(member.id);
    const name = playerName(member.name);

    byId.set(member.id, {
      id: member.id,
      name: known === undefined || known.name === '' ? name : known.name,
      role: known?.role === 'GM' || member.role === 'GM' ? 'GM' : 'PLAYER',
    });
  }

  return [...byId.values()]
    .sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
    .slice(0, PARTY_LIMIT);
}

// UX-DR12: one row per player id, from the players in the room and the players who hold a live
// `acl:` or `plink:` record of the sheet. A player id that the room lists as a GM, or that is this
// client's own, gets no row, also when only records name it. The name is the party's current one,
// else the one in `acl:`, else the one in `plink:`, else unknown.
export function accessRows(
  party: readonly PartyEntry[],
  records: Iterable<VersionedRecord>,
  sheetId: string,
  ownPlayerId: string,
): AccessRow[] {
  const excluded = new Set([ownPlayerId]);
  const roomNames = new Map<string, string>();
  const recordNames = new Map<string, Map<RightsForm, string>>();
  const editors = new Set<string>();

  for (const member of party) {
    if (!playerIdSchema.safeParse(member.id).success) {
      continue;
    }

    if (member.role === 'GM') {
      excluded.add(member.id);
    } else if (!roomNames.has(member.id)) {
      roomNames.set(member.id, member.name);
    }
  }

  for (const record of records) {
    const held = heldRight(record, sheetId);

    if (held === null) {
      continue;
    }

    const names = recordNames.get(held.playerId) ?? new Map<RightsForm, string>();

    names.set(held.form, held.name);
    recordNames.set(held.playerId, names);

    if (held.form === 'acl') {
      editors.add(held.playerId);
    }
  }

  const rows: AccessRow[] = [];

  for (const playerId of new Set([...roomNames.keys(), ...recordNames.keys()])) {
    if (excluded.has(playerId)) {
      continue;
    }

    const names = recordNames.get(playerId);

    const name = [roomNames.get(playerId), names?.get('acl'), names?.get('plink')]
      .map((candidate) => (candidate === undefined ? '' : playerName(candidate)))
      .find((candidate) => candidate !== '');

    rows.push({ playerId, name: name ?? null, canEdit: editors.has(playerId) });
  }

  return rows.sort(byName);
}

// What a row shows for its player: the name, or the id when no name is known.
export function shownName(row: AccessRow): string {
  return row.name ?? row.playerId;
}

// A live `acl:` or `plink:` record of the sheet, read into its form, player id and name.
function heldRight(record: VersionedRecord, sheetId: string): HeldRight | null {
  for (const form of RIGHTS_FORMS) {
    const prefix = `${form}:${sheetId}:`;

    if (!record.k.startsWith(prefix)) {
      continue;
    }

    const playerId = record.k.slice(prefix.length);
    const data = playerDataSchema.safeParse(record.d);

    return data.success && playerIdSchema.safeParse(playerId).success
      ? { form, playerId, name: data.data.name }
      : null;
  }

  return null;
}

function byName(first: AccessRow, second: AccessRow): number {
  const order = NAMES.compare(shownName(first), shownName(second));

  if (order !== 0 || first.playerId === second.playerId) {
    return order;
  }

  return first.playerId < second.playerId ? -1 : 1;
}
