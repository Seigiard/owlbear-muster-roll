import { z } from 'zod';

import { PARTY_LIMIT, PLAYER_NAME_MAX_LENGTH, type PartyEntry } from '@/core/access';
import { dicePlaceSchema, shownValueSchema } from '@/core/dice-roll';
import { fieldPatchTargetSchema } from '@/core/field-patch';
import type { JsonValue } from '@/core/json';
import { playerIdSchema, recordSchema } from '@/core/records';
import { err, ok, type Result } from '@/core/result';

export const UI_CHANNEL = 'app.muster-roll/ui';

const idSchema = z.string().min(1).max(64);

const sequenceSchema = z.number().int().nonnegative();

// `new-version` stays until a reload: a newer build is in the room (AD-12).
// `room-copy-not-saved` stays until the next verified room copy write (AD-8).
// `room-copy-older-format` is a GM's: the room copy is of an older format, and it stays until a
// wipe replaces the copy (AD-12, CAP-31).
export const noticeSchema = z.enum([
  'local-save-failed',
  'room-copy-not-saved',
  'room-copy-older-format',
  'new-version',
]);

// What the last catch-up found in the room copy: `read` a copy of this client's generation, merged;
// `none` no copy; `unreadable` a copy that does not decode, one of another generation, or a failed
// read with no outcome known yet; `newer` a copy of a newer build, left unread; `older` a copy of
// an older format, left unread (AD-12). `null` until a catch-up has read the room metadata.
export const roomCopyOutcomeSchema = z
  .enum(['read', 'none', 'unreadable', 'newer', 'older'])
  .nullable();

// AD-8, for Settings: `saved` once a readable room copy of this generation was read or verified,
// `failed` while the not-saved notice is active, otherwise `none`. `usedBytes` is the room copy's
// share of the room metadata JSON, `freeBytes` the limit less all room metadata. A player with no
// GM answer reads its data source from `outcome`.
export const roomCopySchema = z.strictObject({
  state: z.enum(['saved', 'none', 'failed']),
  usedBytes: z.number().int().nonnegative(),
  freeBytes: z.number().int().nonnegative(),
  // A window and a background of adjacent builds still parse each other's parts.
  outcome: roomCopyOutcomeSchema.default(null),
});

// AD-7: `catching-up` or `live`, and whether the first catch-up since the engine started has ended.
export const syncSchema = z.strictObject({
  state: z.enum(['catching-up', 'live']),
  firstCatchUpDone: z.boolean(),
  // True once a catch-up has ended with a complete answer from a GM client: the first one, or a
  // later one when the first ended by timeout. A player with no preset tells "the GM has not set up
  // sheets" from "nobody answered yet" by it.
  gmAnswered: z.boolean(),
  // AD-6: `online` while a GM-origin message arrived within the timeout. Only the engine sets it,
  // never from the party list. It starts `offline`.
  gmLink: z.enum(['online', 'offline']),
  // The engine's role, re-read on every party change, so a window follows a promotion.
  role: z.enum(['GM', 'PLAYER']),
});

// The party as the access panel needs it: one entry per player id, with its name and role, as
// `partyEntries` builds it. Only a GM's engine fills it. The default lets a newer window read the
// parts of an older background, which sends none.
const partySchema = z
  .array(
    z.strictObject({
      id: playerIdSchema,
      name: z.string().refine((name) => Array.from(name).length <= PLAYER_NAME_MAX_LENGTH),
      role: z.enum(['GM', 'PLAYER']),
    }) satisfies z.ZodType<PartyEntry>,
  )
  .max(PARTY_LIMIT)
  .default([]);

const projectionRequestSchema = z.strictObject({
  t: z.literal('projection-request'),
  nonce: idSchema,
});

const projectionSchema = z
  .strictObject({
    t: z.literal('projection'),
    nonce: idSchema,
    engine: idSchema,
    seq: sequenceSchema,
    i: z.number().int().positive(),
    n: z.number().int().positive(),
    records: z.array(recordSchema),
    // The pending view: records as the GM's queued intents would leave them, which stand in for
    // the records of their keys until catch-up ends, and a player's edits waiting for a GM's check
    // (AD-4), which stand in until answered.
    pending: z.array(recordSchema),
    notices: z.array(noticeSchema),
    sync: syncSchema,
    roomCopy: roomCopySchema,
    party: partySchema,
  })
  .refine((part) => part.i <= part.n);

const deltaSchema = z.strictObject({
  t: z.literal('delta'),
  engine: idSchema,
  seq: sequenceSchema,
  records: z.array(recordSchema),
  // Changed records of the pending view. A GM's in `live` carries none.
  pending: z.array(recordSchema),
  // Keys the window drops before it takes this delta's records: keys the pending view no longer
  // changes, as when catch-up ends or a proposal is answered, whose replica record the delta brings
  // again, and keys the role no longer sees.
  withdrawn: z.array(z.string()),
  notices: z.array(noticeSchema),
  sync: syncSchema,
  roomCopy: roomCopySchema,
  party: partySchema,
});

// A command is an intent. Strict objects refuse any message that also carries k, d, c or a. The ids
// are checked by the engine, so a bad one gets a rejection, not silence. The window picks the
// sheetId, so it can select the new tab when the delta arrives. A new sheet has an empty name: a
// rename is a field patch of the name field.
const sheetCreateSchema = z.strictObject({
  type: z.literal('sheet-create'),
  sheetId: z.string(),
  set: z.string(),
});

// A sheet of a sheet set. A single sheet is never deleted.
const sheetDeleteSchema = z.strictObject({
  type: z.literal('sheet-delete'),
  sheetId: z.string(),
});

// CAP-30: the engine picks the new ids and the numbered first field values, so the command carries
// only the source repeat block and the count. The count is any number, so the engine rejects a bad
// one instead of the schema dropping it.
const repeatBlockDuplicateSchema = z.strictObject({
  type: z.literal('repeat-block-duplicate'),
  sheetId: z.string(),
  sectionId: z.string(),
  instanceId: z.string(),
  count: z.number(),
});

// AD-19: a token links to one sheet, or with a repeat-scope path to one repeat block of it, and one
// token cell. A new link replaces the token's old one. The engine checks the token id and target.
const linkSetSchema = z.strictObject({
  type: z.literal('link-set'),
  tokenId: z.string(),
  sheetId: z.string(),
  path: z.array(z.string()).min(2).optional(),
  cellId: z.string(),
});

// Tombstones the token's link. The sheet and the token stay.
const linkClearSchema = z.strictObject({
  type: z.literal('link-clear'),
  tokenId: z.string(),
});

// FR3: turns one player's write access to one sheet of a sheet set on or off. `name` is the
// player's name as the GM's window knows it, kept in the record as the last known name. The engine
// checks the ids and that the sheet is a live sheet of a sheet set.
const aclSetSchema = z.strictObject({
  type: z.literal('acl-set'),
  sheetId: z.string(),
  playerId: z.string(),
  name: z.string(),
  on: z.boolean(),
});

// FR19: picks the one owner of a sheet of a sheet set, or none with `playerId: null`. `name` is the
// player's name as the GM's window knows it, kept in `plink:` and in a new `acl:` as the last known
// name. The engine checks the ids and that the sheet is a live sheet of a sheet set.
const ownerSetSchema = z.strictObject({
  type: z.literal('owner-set'),
  sheetId: z.string(),
  playerId: z.string().nullable(),
  name: z.string(),
});

// The window sends the deflated data, not the JSON, because a preset over the message limit as
// JSON can still fit once deflated. The engine decodes and validates it again.
const presetDataSchema = z.base64().min(1);

// AD-14: a hash of the erased (key, field id) pairs and the deleted sheets, from
// `preset-diff-result`.
const erasedDigestSchema = z.string().regex(/^[0-9a-f]{8}$/);

// AD-14: the count of stored values the upload erases and of the sheets it deletes, as the GM
// confirmed them, or 0 when the diff found none, and the digest of both. The engine runs the diff
// again and refuses with `count-changed` when its own counts are not both 0 and a count or the
// digest differs.
const presetUploadSchema = z.strictObject({
  type: z.literal('preset-upload'),
  data: presetDataSchema,
  expectedCount: z.number().int().nonnegative(),
  expectedSheets: z.number().int().nonnegative(),
  expectedDigest: erasedDigestSchema,
});

// AD-9: the snapshot file, deflated and base64-encoded, and the digest of the values and sheets it
// drops, as the GM confirmed it from `snapshot-check-result`. The engine runs the import again and
// refuses with `count-changed` when its own digest differs.
const snapshotImportSchema = z.strictObject({
  type: z.literal('snapshot-import'),
  data: presetDataSchema,
  expectedDigest: erasedDigestSchema,
});

// One field, one value or a clear as `null`. The value is any JSON, so the engine, which knows
// the field's type, rejects a wrong one instead of the schema dropping it in silence.
const fieldPatchSchema = z.strictObject({
  type: z.literal('field-patch'),
  sheetId: z.string(),
  target: fieldPatchTargetSchema,
  fieldId: z.string(),
  value: z.json(),
});

// The window picks the instanceId, so it can focus the new repeat block when the delta arrives. The
// engine composes the order and the empty cells.
const repeatBlockAddSchema = z.strictObject({
  type: z.literal('repeat-block-add'),
  sheetId: z.string(),
  sectionId: z.string(),
  instanceId: z.string(),
});

// AD-19: the engine also removes the token links of the repeat block.
const repeatBlockDeleteSchema = z.strictObject({
  type: z.literal('repeat-block-delete'),
  sheetId: z.string(),
  sectionId: z.string(),
  instanceId: z.string(),
});

// AD-9, CAP-31: erases all room data in a new generation. The window asks its one confirmation
// first, so the command carries nothing more.
const wipeSchema = z.strictObject({ type: z.literal('wipe') });

const commandIntentSchema = z.discriminatedUnion('type', [
  sheetCreateSchema,
  sheetDeleteSchema,
  repeatBlockDuplicateSchema,
  linkSetSchema,
  linkClearSchema,
  aclSetSchema,
  ownerSetSchema,
  presetUploadSchema,
  snapshotImportSchema,
  fieldPatchSchema,
  repeatBlockAddSchema,
  repeatBlockDeleteSchema,
  wipeSchema,
]);

const commandSchema = z.strictObject({
  t: z.literal('command'),
  id: idSchema,
  command: commandIntentSchema,
});

// AD-14: asks how many stored values the preset would erase. It writes nothing, so it is no command.
// A refusal comes as `command-rejected` with this id.
const presetDiffSchema = z.strictObject({
  t: z.literal('preset-diff'),
  id: idSchema,
  data: presetDataSchema,
});

const countSchema = z.number().int().nonnegative();

// AD-9: asks how many values of the snapshot file the current preset would drop. It writes
// nothing, so it is no command. A refusal comes as `command-rejected` with this id.
const snapshotCheckSchema = z.strictObject({
  t: z.literal('snapshot-check'),
  id: idSchema,
  data: presetDataSchema,
});

// The answer to `snapshot-check`: the count of values and of sheets the import would drop, and
// their digest.
const snapshotCheckResultSchema = z.strictObject({
  t: z.literal('snapshot-check-result'),
  id: idSchema,
  count: countSchema,
  sheets: countSchema,
  digest: erasedDigestSchema,
});

// A `snapshot-import` replaced the room's data.
const snapshotImportedSchema = z.strictObject({
  t: z.literal('snapshot-imported'),
  id: idSchema,
});

// A `wipe` erased the room's data.
const wipedSchema = z.strictObject({
  t: z.literal('wiped'),
  id: idSchema,
});

// A command that changed the replica has no result-specific answer. It is sent after the delta
// carrying the effect, so a window can settle against the records it now holds.
const commandDoneSchema = z.strictObject({
  t: z.literal('command-done'),
  id: idSchema,
});

// The answer to `preset-diff`: the count of stored values the upload would erase and of sheets it
// would delete, and their digest.
const presetDiffResultSchema = z.strictObject({
  t: z.literal('preset-diff-result'),
  id: idSchema,
  count: countSchema,
  sheets: countSchema,
  digest: erasedDigestSchema,
});

// A `preset-upload` wrote its whole batch. `count` is the number of stored values it erased and
// `sheets` the number of sheets it deleted.
const presetUploadedSchema = z.strictObject({
  t: z.literal('preset-uploaded'),
  id: idSchema,
  count: countSchema,
  sheets: countSchema,
});

const plainRejectionSchema = z.strictObject({
  t: z.literal('command-rejected'),
  id: idSchema,
  reason: z.enum([
    'too-large',
    'invalid-preset',
    // AD-14: the stored preset does not decode, as one from a newer build, so no diff can run.
    'preset-unreadable',
    // AD-14: a write of the upload batch failed, so the batch stopped there.
    'write-failed',
    'invalid-sheet-id',
    'sheet-exists',
    'unknown-sheet',
    'deleted-sheet',
    // AD-18: a `sheet-create` whose `set` names no sheet set of the preset.
    'unknown-template',
    'unknown-field',
    'invalid-value',
    'unknown-instance',
    'unchanged',
    'unknown-section',
    'invalid-instance-id',
    'instance-exists',
    // A duplicate count outside 1 to 50, or not whole.
    'invalid-count',
    // A token id no `link:` key can hold.
    'invalid-token-id',
    // A `link-clear` for a token with no link.
    'unknown-link',
    // AD-19: a link target whose template or repeat section is not linkable.
    'not-linkable',
    // A player id no `acl:` or `plink:` key can hold.
    'invalid-player-id',
    // Delete, access and an owner are for a sheet of a sheet set only, never a single sheet.
    'not-sheet-set',
    // A player's write that is not a field or repeat block edit of a sheet it may edit.
    'not-allowed',
    // AD-14: a preset upload, an import or a wipe waits until catch-up ends.
    'catching-up',
    // AD-9: the snapshot file does not parse, or a sheet of it breaks a rule.
    'invalid-snapshot',
    // AD-9: an import needs a preset in the room.
    'preset-required',
    // AD-9: the room's data was replaced while the command waited, so it was dropped.
    'data-replaced',
    // AD-9: a snapshot import runs on this GM client, and nothing writes until its `reset` is out.
    'importing',
  ]),
});

// AD-14: the replica changed since the diff, and the upload would erase other values or delete
// other sheets: `count` and `sheets` of them, with `digest` for the next confirmation.
const countChangedSchema = z.strictObject({
  t: z.literal('command-rejected'),
  id: idSchema,
  reason: z.literal('count-changed'),
  count: countSchema,
  sheets: countSchema,
  digest: erasedDigestSchema,
});

const commandRejectedSchema = z.discriminatedUnion('reason', [
  plainRejectionSchema,
  countChangedSchema,
]);

// AD-13: a roll is no command, as it writes nothing, so a player and a client in catch-up roll too.
// `shown` holds what the window shows in the fields it holds locally, by field id: unsent text, or
// an input error. The engine overlays it on the records and its own pending edits.
const rollRequestSchema = z.strictObject({
  t: z.literal('roll-request'),
  id: idSchema,
  // The bounds of a roll's `sheetId`, so every request that rolls makes a roll a room accepts.
  sheetId: idSchema,
  place: dicePlaceSchema,
  shown: z.record(z.string(), shownValueSchema),
});

// `rolled` went out to the room. `field` and `arithmetic` name what is wrong with the formula.
// `refused` is a place with no dice cell, or a sheet this client cannot roll. `failed` is a roll the
// engine could not send. `waiting-access` is no end: the roll went to the dice extension, which
// holds it until the GM allows Muster Roll (TASK-36), and another outcome for the id follows.
const rollOutcomeSchema = z.strictObject({
  t: z.literal('roll-outcome'),
  id: idSchema,
  outcome: z.discriminatedUnion('code', [
    z.strictObject({ code: z.literal('waiting-access') }),
    z.strictObject({ code: z.literal('rolled') }),
    z.strictObject({ code: z.literal('field'), field: z.string() }),
    z.strictObject({ code: z.literal('arithmetic') }),
    z.strictObject({ code: z.literal('refused') }),
    z.strictObject({ code: z.literal('failed') }),
  ]),
});

// FR14: "Открыть лист" asks a window to show a sheet and its token cell. `path` names the repeat
// block when the cell is inside one. The engine holds the request and sends it again after each
// projection until a window acknowledges its id. A new press replaces it.
const openSheetSchema = z.strictObject({
  t: z.literal('open-sheet'),
  id: idSchema,
  sheetId: idSchema,
  path: z.array(idSchema).min(2).optional(),
  cellId: idSchema,
});

// The window took the request: it selected the sheet's tab, or found no tab to select.
const openSheetAckSchema = z.strictObject({
  t: z.literal('open-sheet-ack'),
  id: idSchema,
});

const windowMessageSchema = z.discriminatedUnion('t', [
  projectionRequestSchema,
  commandSchema,
  presetDiffSchema,
  rollRequestSchema,
  openSheetAckSchema,
  snapshotCheckSchema,
]);

const engineMessageSchema = z.discriminatedUnion('t', [
  projectionSchema,
  deltaSchema,
  commandRejectedSchema,
  rollOutcomeSchema,
  openSheetSchema,
  presetDiffResultSchema,
  presetUploadedSchema,
  snapshotCheckResultSchema,
  snapshotImportedSchema,
  wipedSchema,
  commandDoneSchema,
]);

export type Notice = z.infer<typeof noticeSchema>;

export type SyncState = z.infer<typeof syncSchema>;

export type GmLink = SyncState['gmLink'];

export type RoomCopyStatus = z.infer<typeof roomCopySchema>;

export type RoomCopyOutcome = z.infer<typeof roomCopyOutcomeSchema>;

export type PartyList = z.infer<typeof partySchema>;

export type Command = z.infer<typeof commandIntentSchema>;

export type CommandMessage = z.infer<typeof commandSchema>;

export type CommandRejectedMessage = z.infer<typeof commandRejectedSchema>;

export type PresetDiffMessage = z.infer<typeof presetDiffSchema>;

export type PresetDiffResultMessage = z.infer<typeof presetDiffResultSchema>;

export type PresetUploadedMessage = z.infer<typeof presetUploadedSchema>;

// What the engine answered to a window's preset diff or upload, by its id.
export type PresetResultMessage = PresetDiffResultMessage | PresetUploadedMessage;

export type SnapshotCheckMessage = z.infer<typeof snapshotCheckSchema>;

export type SnapshotCheckResultMessage = z.infer<typeof snapshotCheckResultSchema>;

export type SnapshotImportedMessage = z.infer<typeof snapshotImportedSchema>;

// What the engine answered to a window's snapshot check or import, by its id.
export type SnapshotResultMessage = SnapshotCheckResultMessage | SnapshotImportedMessage;

export type WipedMessage = z.infer<typeof wipedSchema>;

export type CommandDoneMessage = z.infer<typeof commandDoneSchema>;

export type RejectionReason = CommandRejectedMessage['reason'];

export type ProjectionRequestMessage = z.infer<typeof projectionRequestSchema>;

export type RollRequestMessage = z.infer<typeof rollRequestSchema>;

export type RollOutcomeMessage = z.infer<typeof rollOutcomeSchema>;

export type RollOutcome = RollOutcomeMessage['outcome'];

export type OpenSheetMessage = z.infer<typeof openSheetSchema>;

// An open request as the engine holds it and a window keeps it.
export type OpenSheetRequest = Omit<OpenSheetMessage, 't'>;

export type OpenSheetAckMessage = z.infer<typeof openSheetAckSchema>;

export type ProjectionMessage = z.infer<typeof projectionSchema>;

export type DeltaMessage = z.infer<typeof deltaSchema>;

export type WindowMessage = z.infer<typeof windowMessageSchema>;

export type EngineMessage = z.infer<typeof engineMessageSchema>;

export type UiMessageFailure = 'invalid-message';

export function parseWindowMessage(candidate: JsonValue): Result<WindowMessage, UiMessageFailure> {
  const parsed = windowMessageSchema.safeParse(candidate);

  return parsed.success ? ok(parsed.data) : err('invalid-message');
}

export function parseEngineMessage(candidate: JsonValue): Result<EngineMessage, UiMessageFailure> {
  const parsed = engineMessageSchema.safeParse(candidate);

  return parsed.success ? ok(parsed.data) : err('invalid-message');
}
