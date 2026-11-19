import { acceptedFieldValue, targetFields, type FieldPatchTarget } from '@/core/field-patch';
import { blockIdOf, parseBlockKey, sectionIdOf, type BlockAddress } from '@/core/block-address';
import { compareCells, ownersBySheet } from '@/core/merge';
import { plainRowIdOf, repeatTabById, type Preset } from '@/core/preset';
import {
  blockDataSchema,
  playerDataSchema,
  playerIdSchema,
  plinkPrefix,
  type VersionedRecord,
} from '@/core/records';
import { resolveSheet, sortSheets, type SheetPolicy, type SheetSummary } from '@/core/sheets';
import { fieldTargetShownTo, type PlayerRole } from '@/core/visibility';

// One party member as the access panel needs it.
export type PartyEntry = { id: string; name: string; role: PlayerRole };

// One row of the access panel: a player id, its last known name or `null` when none is known, and
// whether it holds write access.
export type AccessRow = { playerId: string; name: string | null; canEdit: boolean };

// The party a window gets holds at most this many player ids, so it never crowds the message.
export const PARTY_LIMIT = 100;

// A player name is kept trimmed, and at most this many code points.
export const PLAYER_NAME_MAX_LENGTH = 100;

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

// FR19, UX-DR8: the sheets a player owns come first, then the rest. Each part is ordered by
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

export type PlayerEditTarget =
  | { kind: 'row'; rowId: string }
  | { kind: 'rep'; block: BlockAddress; fieldId?: string };

// AD-4, one edit check: this three-argument form answers only the player's sheet-level right. Field
// checks use playerMayEditField, which requires an explicit row or repeat-section target so the
// target tab is judged too.
export function playerMayEdit(
  policy: SheetPolicy,
  records: ReadonlyMap<string, VersionedRecord>,
  playerId: string,
): boolean {
  const writable =
    policy.write === 'players-edit' ||
    (policy.write === 'per-player' && canEdit(records, policy.sheetId, playerId));

  return writable;
}

// AD-4: the target is explicit because a field is either a plain row or a repeat section. The
// player's sheet right and the target tab are judged together here.
export function playerMayEditField(
  policy: SheetPolicy,
  records: ReadonlyMap<string, VersionedRecord>,
  playerId: string,
  target: PlayerEditTarget,
): boolean {
  return (
    playerMayEdit(policy, records, playerId) &&
    fieldTargetShownTo('PLAYER', policy.template, target)
  );
}

// AD-4: the most a proposal's `c` may run ahead of the current record's. A higher one would leave
// the key with a counter no later mint can pass within the safe integers.
export const PROPOSE_C_MAX_STEP = 1_000_000;

// The proposer as the gate knows it: its player id, and `author`, the `a` its connection mints with.
export type ProposalSender = { playerId: string; author: string };

// What a proposal is checked against: the GM client's records and the preset they hold, decoded.
export type ProposalContext = {
  records: ReadonlyMap<string, VersionedRecord>;
  preset: Preset | null;
};

// AD-4: what a GM client does with a player's proposal. `commit` merges the proposed record
// unchanged and commits it. `commit-existing` commits `record`, the GM's own, in its place. Both
// echo the proposer's `(k, c, a)`. `stale` answers with `current`.
export type ProposalVerdict =
  | { kind: 'commit' }
  | { kind: 'commit-existing'; record: VersionedRecord }
  | { kind: 'denied' }
  | { kind: 'stale'; current: VersionedRecord };

// `unknown-field`: the record passes every check but one: it sets a field id its row or repeat
// block does not have, as a player whose preset is older sends it.
type ProposalJudgement = 'allowed' | 'denied' | 'unknown-field';

// FR3, AD-4: the checks of a player's record that read no version. `proposalJudgement` tells why a
// record fails. The GM client runs it on a proposal, and the player's own client before it queues
// an edit.
export function proposalAllowed(
  context: ProposalContext,
  playerId: string,
  record: VersionedRecord,
): boolean {
  return proposalJudgement(context, playerId, record) === 'allowed';
}

// AD-4, in this order: the checks of `proposalAllowed`, an `a` that is the sender's own and a `c`
// at most `PROPOSE_C_MAX_STEP` above the current one; a key with no current record is committed
// only when it passes them all, and a new repeat block only with an instance id no other section
// of its sheet holds (AD-2); a record identical to the current one is committed; a removal of a
// removed repeat block commits the existing tombstone; an edit of a removed repeat block is denied;
// a field id the template does not have answers stale with the current record, so the player
// applies its patch to it; then a `c` above the current one is committed and any other is stale.
// So an identical proposal from a player with no access is denied. The proposed `d` is never
// rewritten.
export function checkProposal(
  context: ProposalContext,
  sender: ProposalSender,
  record: VersionedRecord,
): ProposalVerdict {
  const current = context.records.get(record.k);
  const judgement = proposalJudgement(context, sender.playerId, record);

  if (
    record.a !== sender.author ||
    record.c > (current?.c ?? 0) + PROPOSE_C_MAX_STEP ||
    judgement === 'denied'
  ) {
    return { kind: 'denied' };
  }

  // With no current record there is nothing to answer stale with. AD-2: a new repeat block takes no
  // instance id that another section of its sheet holds, live or removed.
  if (current === undefined) {
    return judgement === 'allowed' && !instanceHeldElsewhere(context.records, record.k)
      ? { kind: 'commit' }
      : { kind: 'denied' };
  }

  if (current.d === null) {
    return record.d === null ? { kind: 'commit-existing', record: current } : { kind: 'denied' };
  }

  if (record.l?.[0] !== current.l?.[0] || record.l?.[1] !== current.l?.[1])
    return { kind: 'denied' };

  if (judgement === 'unknown-field') {
    return { kind: 'stale', current };
  }

  if (record.d === null) return { kind: 'commit' };
  const proposed = blockDataSchema.parse(record.d);
  const held = blockDataSchema.parse(current.d);

  const alreadyHeld = Object.entries(proposed.cells).every(([id, cell]) => {
    const old = held.cells[id];

    return old !== undefined && compareCells(cell, old) === 0;
  });

  if (alreadyHeld) return { kind: 'commit-existing', record: current };

  const stale = Object.entries(proposed.cells).some(([id, cell]) => {
    const old = held.cells[id];

    return old !== undefined && compareCells(cell, old) !== 0 && cell[1] <= old[1];
  });

  return stale ? { kind: 'stale', current } : { kind: 'commit' };
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

// AD-4, AD-18: the key is a block of a sheet whose template is visible and whose target row or
// repeat section is on a tab players see. A sheet of a sheet set must be live, and the player must
// hold a live `acl:` of it. A single sheet must be player-editable. Only cells the proposal changes
// against the current block are judged, so an unrelated value left by an older preset cannot deny
// the edit. `d: null` is a repeat block's removal only.
function proposalJudgement(
  context: ProposalContext,
  playerId: string,
  record: VersionedRecord,
): ProposalJudgement {
  if (!record.k.startsWith('blk:')) return 'denied';
  const block = parseBlockKey(record.k);

  if (block === null) return 'denied';

  const sheetId = block.sheetId;
  const repeat = repeatTargetOf(record.k);

  if (repeat === null && block.path.length !== 0) return 'denied';
  const policy = resolveSheet(context.records, context.preset, sheetId);

  if (policy === null || !playerMayEdit(policy, context.records, playerId)) return 'denied';
  const current = context.records.get(record.k);

  const repeatTab =
    repeat === null || repeat.path.length !== 2
      ? null
      : repeatTabById(policy.template, sectionIdOf(repeat) ?? '');

  if (record.d === null) {
    return repeat !== null &&
      repeatTab === null &&
      playerMayEditField(policy, context.records, playerId, { kind: 'rep', block: repeat })
      ? 'allowed'
      : 'denied';
  }

  const data = blockDataSchema.safeParse(record.d).data;

  if (data === undefined) return 'denied';
  const before = blockDataSchema.safeParse(current?.d).data;

  if (before !== undefined && (before.order !== data.order || before.set !== data.set))
    return 'denied';

  if (
    current === undefined &&
    (repeat === null ||
      repeatTab !== null ||
      data.set !== undefined ||
      record.l === undefined ||
      record.l[0] > record.c ||
      record.l?.[1] !== record.a)
  )
    return 'denied';

  if (
    repeat !== null &&
    !playerMayEditField(policy, context.records, playerId, { kind: 'rep', block: repeat })
  )
    return 'denied';
  let verdict: ProposalJudgement = 'allowed';

  for (const [id, cell] of Object.entries(data.cells)) {
    const held = before?.cells[id];

    if (held !== undefined && compareCells(cell, held) === 0) continue;

    if (cell[1] !== record.c || cell[2] !== record.a) return 'denied';
    const rowId = repeat === null ? plainRowIdOf(policy.template, id) : null;

    const target: PlayerEditTarget =
      repeat === null
        ? { kind: 'row', rowId: rowId ?? '' }
        : { kind: 'rep', block: repeat, fieldId: id };

    const fieldTarget: FieldPatchTarget =
      repeat === null ? { kind: 'row', rowId: rowId ?? '' } : { kind: 'rep', block: repeat };

    const field = targetFields(policy.template, fieldTarget)?.find((item) => item.id === id);

    if (field === undefined) verdict = 'unknown-field';
    else if (
      !playerMayEditField(policy, context.records, playerId, target) ||
      !acceptedFieldValue(field, cell[0]).isOk()
    )
      return 'denied';
  }

  return verdict;
}

// True when `key` names a repeat block whose instance id the same sheet holds under another
// section, as a live repeat block or a tombstone.
function instanceHeldElsewhere(
  records: ReadonlyMap<string, VersionedRecord>,
  key: string,
): boolean {
  const block = repeatTargetOf(key);

  if (block === null) {
    return false;
  }

  for (const other of records.keys()) {
    const held = repeatTargetOf(other);

    if (
      held !== null &&
      held.sheetId === block.sheetId &&
      blockIdOf(held) === blockIdOf(block) &&
      sectionIdOf(held) !== sectionIdOf(block)
    ) {
      return true;
    }
  }

  return false;
}

function repeatTargetOf(key: string): BlockAddress | null {
  const parsed = parseBlockKey(key);

  return parsed === null || parsed.path.length === 0 ? null : parsed;
}

function byName(first: AccessRow, second: AccessRow): number {
  const order = NAMES.compare(shownName(first), shownName(second));

  if (order !== 0 || first.playerId === second.playerId) {
    return order;
  }

  return first.playerId < second.playerId ? -1 : 1;
}
