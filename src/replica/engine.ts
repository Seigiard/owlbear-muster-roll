import { nanoid } from 'nanoid';

import { createBoundedIdSet } from '@/core/bounded-id-set';
import {
  acceptedFieldValue,
  findPatchField,
  isRepeatSectionId,
  patchedRecord,
  patchedRecordFits,
  patchRecordKey,
} from '@/core/field-patch';
import { jsonByteLength, recordFitsOneMessage, splitBatch } from '@/core/message-size';
import { mergeRecords } from '@/core/merge';
import { decodePreset, encodePreset, type Preset, type PresetTemplate } from '@/core/preset';
import {
  hasLiveSheet,
  presetDataSchema,
  repDataSchema,
  repKeyPrefix,
  sheetDataSchema,
  type SheetData,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import {
  admitRoomMessage,
  generationRelation,
  parseRoomMessage,
  SYNC_CHANNEL,
  type RoomMessage,
} from '@/core/room-messages';
import { isSheetDependent, parseSheetName, sheetIdSchema, sheetKey } from '@/core/sheets';
import {
  parseWindowMessage,
  UI_CHANNEL,
  type Command,
  type CommandMessage,
  type DeltaMessage,
  type EngineMessage,
  type Notice,
  type ProjectionMessage,
  type RejectionReason,
} from '@/core/ui-messages';
import { INITIAL_GENERATION, type Generation } from '@/core/storage-key';
import { visibleRecords, type PlayerRole } from '@/core/visibility';
import type { BroadcastEvent, BroadcastOptions, Platform } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import { createCommitOutbox } from '@/replica/commit-outbox';
import { createPartyRoster } from '@/replica/party-roster';
import { createRecordStore, type RecordStore } from '@/replica/record-store';
import { createVersionMinter } from '@/replica/version-minter';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

// Enough for any burst of echoes, small enough to keep nothing forever.
const RECENT_COMMAND_ID_LIMIT = 256;

// Sits in the problem set, and no write clears it: a reload has to read the storage again.
const UNREADABLE_STORAGE_MARK = '(unreadable)';

export type ReplicaEnginePlatform = Pick<
  Platform,
  'broadcast' | 'metadata' | 'party' | 'player' | 'storage'
>;

export type ReplicaEngine = {
  stop: () => void;
  // Sends every waiting message at once, held commits included, for a page that is about to close.
  flushNow: () => void;
};

type Persistence = { store: RecordStore; generation: Generation };

type Persisted = { record: VersionedRecord; saved: boolean };

// The preset decoded from the `d` it came from, so a run of patches decodes it once.
type DecodedPreset = { d: string; preset: Preset | null };

type LoadedReplica = {
  records: VersionedRecord[];
  problemKeys: Set<string>;
  persistence: Persistence | null;
};

export async function startReplicaEngine(
  platform: ReplicaEnginePlatform,
  sendQueue: SendQueue,
  newId: () => string = nanoid,
): Promise<ReplicaEngine> {
  const [role, connectionId] = await Promise.all([
    platform.player.getRole(),
    platform.player.getConnectionId(),
  ]);

  const loaded = loadReplica(platform, role);
  const replica = new Map<string, VersionedRecord>();
  const problemKeys = loaded.problemKeys;
  const engineId = newId();
  const minter = createVersionMinter(connectionId);
  const recentCommandIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);
  const answeringNonces = new Set<string>();
  // A player client has no room copy yet (Story 2.5), so it stays at the initial generation.
  const ownGeneration = loaded.persistence?.generation ?? INITIAL_GENERATION;
  const outbox = createCommitOutbox(sendQueue, () => ownGeneration);
  const roster = createPartyRoster(platform.party);
  let sequence = 0;
  let decodedPreset: DecodedPreset | null = null;
  // AD-12: once a newer build has spoken in the room, the banner stays until a reload.
  let newerVersionSeen = false;
  let stopped = false;

  for (const record of loaded.records) {
    merge(record);
  }

  function merge(record: VersionedRecord): VersionedRecord {
    const current = replica.get(record.k);
    const winner = current === undefined ? record : mergeRecords(current, record);

    replica.set(winner.k, winner);

    return winner;
  }

  function currentNotices(): Notice[] {
    const notices: Notice[] = problemKeys.size === 0 ? [] : ['local-save-failed'];

    if (newerVersionSeen) {
      notices.push('new-version');
    }

    return notices;
  }

  function send(message: EngineMessage): Promise<void> {
    return sendQueue.enqueue(UI_CHANNEL, message, LOCAL);
  }

  function sendProjection(nonce: string): void {
    // A window repeats its request until the first part arrives, so one already answered
    // and still in the queue must not be answered twice.
    if (answeringNonces.has(nonce)) {
      return;
    }

    const records = visibleRecords(role, [...replica.values()]);
    const notices = currentNotices();

    const envelope: ProjectionMessage = {
      t: 'projection',
      nonce,
      engine: engineId,
      seq: sequence,
      i: Math.max(records.length, 1),
      n: Math.max(records.length, 1),
      records: [],
      notices,
    };

    const split = splitBatch(records, jsonByteLength(envelope));

    if (!split.ok) {
      console.error('Muster Roll could not split a projection', split.error);

      return;
    }

    answeringNonces.add(nonce);

    const sends = split.value.map((part, index) =>
      send({ ...envelope, i: index + 1, n: split.value.length, records: part }),
    );

    Promise.all(sends)
      .then(() => {
        answeringNonces.delete(nonce);
      })
      .catch((error) => {
        console.error('Muster Roll could not send a projection', error);
      });
  }

  function emitDelta(records: VersionedRecord[]): void {
    const visible = visibleRecords(role, records);
    const notices = currentNotices();

    const envelope: DeltaMessage = {
      t: 'delta',
      engine: engineId,
      seq: sequence + Math.max(visible.length, 1),
      records: [],
      notices,
    };

    const split = splitBatch(visible, jsonByteLength(envelope));

    if (!split.ok) {
      console.error('Muster Roll could not split a delta', split.error);

      return;
    }

    for (const part of split.value) {
      sequence += 1;
      send({ ...envelope, seq: sequence, records: part }).catch((error) => {
        console.error('Muster Roll could not send a delta', error);
      });
    }
  }

  function persist(record: VersionedRecord): Persisted {
    if (loaded.persistence === null) {
      return { record, saved: true };
    }

    const { store, generation } = loaded.persistence;
    const written = store.write(generation, record);

    if (written.ok) {
      problemKeys.delete(record.k);

      return { record: written.value, saved: true };
    }

    console.error('Muster Roll could not save a record', written.error);
    problemKeys.add(record.k);

    return { record, saved: false };
  }

  function composeSheetCreate(
    command: Extract<Command, { type: 'sheet-create' }>,
  ): Result<VersionedRecord, RejectionReason> {
    if (!sheetIdSchema.safeParse(command.sheetId).success) {
      return err('invalid-sheet-id');
    }

    const k = sheetKey(command.sheetId);

    // A tombstone counts too: a deleted sheet's id must never come back.
    if (replica.has(k)) {
      return err('sheet-exists');
    }

    const name = parseSheetName(command.name);

    if (!name.ok) {
      return err('invalid-name');
    }

    return mintedSheet(k, 0, {
      kind: command.kind,
      name: name.value,
      order: nextOrder(command.kind),
    });
  }

  function composeSheetRename(
    command: Extract<Command, { type: 'sheet-rename' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const current = liveSheetRecord(command.sheetId);

    if (!current.ok) {
      return current;
    }

    const sheet = sheetDataSchema.safeParse(current.value.d);

    if (!sheet.success) {
      return err('unknown-sheet');
    }

    const name = parseSheetName(command.name);

    if (!name.ok) {
      return err('invalid-name');
    }

    return mintedSheet(current.value.k, current.value.c, { ...sheet.data, name: name.value });
  }

  // The sheet and every record that depends on it go in one batch. Storage gets the whole batch
  // before any send, and the sheet tombstone goes last, so a write that fails part way leaves a live
  // sheet the GM can delete again. The kind is not checked: an NPC goes the same way.
  function composeSheetDelete(
    command: Extract<Command, { type: 'sheet-delete' }>,
  ): Result<VersionedRecord[], RejectionReason> {
    const current = liveSheetRecord(command.sheetId);

    if (!current.ok) {
      return current;
    }

    const doomed: VersionedRecord[] = [];

    for (const [key, record] of replica) {
      // A tombstone already says deleted, and writing it again would only add a version.
      if (record.d !== null && isSheetDependent(key, record, command.sheetId)) {
        doomed.push(record);
      }
    }

    doomed.push(current.value);

    return ok(doomed.map((record) => tombstone(record)));
  }

  function liveSheetRecord(sheetId: string): Result<VersionedRecord, RejectionReason> {
    if (!sheetIdSchema.safeParse(sheetId).success) {
      return err('invalid-sheet-id');
    }

    const current = replica.get(sheetKey(sheetId));

    if (current === undefined) {
      return err('unknown-sheet');
    }

    return current.d === null ? err('deleted-sheet') : ok(current);
  }

  function tombstone(record: VersionedRecord): VersionedRecord {
    const { c, a } = minter.mint(record.k, record.c);

    return { ...record, d: null, c, a };
  }

  function mintedSheet(
    k: string,
    highestKnownCounter: number,
    d: SheetData,
  ): Result<VersionedRecord, RejectionReason> {
    const { c, a } = minter.mint(k, highestKnownCounter);
    const record: VersionedRecord = { k, d, c, a };

    return recordFitsOneMessage(record) ? ok(record) : err('too-large');
  }

  function compose(command: Command): Result<VersionedRecord[], RejectionReason> {
    switch (command.type) {
      case 'sheet-create':
        return listOf(composeSheetCreate(command));
      case 'sheet-rename':
        return listOf(composeSheetRename(command));
      case 'sheet-delete':
        return composeSheetDelete(command);
      case 'preset-upload':
        return listOf(composePresetUpload(command));
      case 'field-patch':
        return listOf(composeFieldPatch(command));
      case 'repeat-row-add':
        return listOf(composeRepeatRowAdd(command));
      case 'repeat-row-delete':
        return listOf(composeRepeatRowDelete(command));
      default:
        return unknownCommand(command);
    }
  }

  function composePresetUpload(
    command: Extract<Command, { type: 'preset-upload' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const preset = decodePreset(command.data);

    if (!preset.ok) {
      return err('invalid-preset');
    }

    // Composed from the validated preset, so the record never holds what the window sent as is.
    const d = encodePreset(preset.value);

    // Measured at the largest counter a version can reach, so the check needs no mint.
    if (!recordFitsOneMessage({ k: 'preset', d, c: Number.MAX_SAFE_INTEGER, a: connectionId })) {
      return err('too-large');
    }

    // Temporary until Story 5.1 brings the AD-14 diff: a preset change must not orphan values.
    if (hasLiveSheet(replica.values())) {
      return err('sheets-exist');
    }

    const { c, a } = minter.mint('preset', replica.get('preset')?.c ?? 0);

    return ok({ k: 'preset', d, c, a });
  }

  // The field must be in the targeted row of the sheet's own template, and the value of its type.
  // The patch merges into the record as it is now, so a field another window just saved stays.
  function composeFieldPatch(
    command: Extract<Command, { type: 'field-patch' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const template = sheetTemplate(command.sheetId, 'unknown-field');

    if (!template.ok) {
      return template;
    }

    const field = findPatchField(template.value, command.target, command.fieldId);

    if (field === null) {
      return err('unknown-field');
    }

    const value = acceptedFieldValue(field, command.value);

    if (!value.ok) {
      return value;
    }

    const existing = replica.get(patchRecordKey(command.sheetId, command.target));

    const patched = patchedRecord(
      command.sheetId,
      command.target,
      existing,
      command.fieldId,
      value.value,
    );

    if (!patched.ok) {
      return patched;
    }

    if (!patchedRecordFits(patched.value)) {
      return err('too-large');
    }

    const { c, a } = minter.mint(patched.value.k, existing?.c ?? 0);

    return ok({ ...patched.value, c, a });
  }

  // A new row goes after every row this sheet has in the section. The id is the window's, so a
  // tombstone's id counts as taken: a deleted row must never come back.
  function composeRepeatRowAdd(
    command: Extract<Command, { type: 'repeat-row-add' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const section = repeatSection(command);

    if (!section.ok) {
      return section;
    }

    if (!sheetIdSchema.safeParse(command.instanceId).success) {
      return err('invalid-instance-id');
    }

    const k = repKey(command);

    if (replica.has(k)) {
      return err('instance-exists');
    }

    const { c, a } = minter.mint(k, 0);
    const record: VersionedRecord = { k, d: { order: nextRowOrder(command), cells: {} }, c, a };

    return recordFitsOneMessage(record) ? ok(record) : err('too-large');
  }

  function composeRepeatRowDelete(
    command: Extract<Command, { type: 'repeat-row-delete' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const section = repeatSection(command);

    if (!section.ok) {
      return section;
    }

    const current = replica.get(repKey(command));

    return current === undefined || current.d === null
      ? err('unknown-instance')
      : ok(tombstone(current));
  }

  // The sheet must be live and the section a repeat section of the sheet's own template.
  function repeatSection(command: {
    sheetId: string;
    sectionId: string;
  }): Result<null, RejectionReason> {
    const template = sheetTemplate(command.sheetId, 'unknown-section');

    if (!template.ok) {
      return template;
    }

    return isRepeatSectionId(template.value, command.sectionId) ? ok(null) : err('unknown-section');
  }

  // `noPreset` names the rejection for a sheet whose template cannot be known yet.
  function sheetTemplate(
    sheetId: string,
    noPreset: RejectionReason,
  ): Result<PresetTemplate, RejectionReason> {
    const current = liveSheetRecord(sheetId);

    if (!current.ok) {
      return current;
    }

    const sheet = sheetDataSchema.safeParse(current.value.d);
    const preset = currentPreset();

    if (!sheet.success) {
      return err('unknown-sheet');
    }

    if (preset === null) {
      return err(noPreset);
    }

    return ok(sheet.data.kind === 'pc' ? preset.character : preset.npc);
  }

  // A tombstone holds no order, so only live rows count.
  function nextRowOrder(command: { sheetId: string; sectionId: string }): number {
    const prefix = repKeyPrefix(command.sheetId, command.sectionId);
    let highest = -1;

    for (const record of replica.values()) {
      if (record.k.startsWith(prefix)) {
        const row = repDataSchema.safeParse(record.d);

        if (row.success) {
          highest = Math.max(highest, row.data.order);
        }
      }
    }

    return highest + 1;
  }

  function currentPreset(): Preset | null {
    const data = presetDataSchema.safeParse(replica.get('preset')?.d);

    if (!data.success) {
      return null;
    }

    if (decodedPreset?.d !== data.data) {
      const decoded = decodePreset(data.data);

      decodedPreset = { d: data.data, preset: decoded.ok ? decoded.value : null };
    }

    return decodedPreset.preset;
  }

  function nextOrder(kind: 'pc' | 'npc'): number {
    let highest = -1;

    for (const record of replica.values()) {
      if (record.k.startsWith('sheet:')) {
        const sheet = sheetDataSchema.safeParse(record.d);

        if (sheet.success && sheet.data.kind === kind) {
          highest = Math.max(highest, sheet.data.order);
        }
      }
    }

    return highest + 1;
  }

  function handleCommand(message: CommandMessage): void {
    if (recentCommandIds.has(message.id)) {
      return;
    }

    recentCommandIds.add(message.id);

    // Every command writes. A player's own record would beat later GM edits of its key in merge.
    const composed: Result<VersionedRecord[], RejectionReason> =
      role === 'GM' ? compose(message.command) : err('not-allowed');

    if (!composed.ok) {
      send({ t: 'command-rejected', id: message.id, reason: composed.error }).catch((error) => {
        console.error('Muster Roll could not reject a command', error);
      });

      return;
    }

    // A batch is saved in order and stops at its first failed write. The failed record and the
    // ones after it are not applied, so a retry of the command reaches them again. A single record
    // keeps its value after a failed write, and the notice asks the GM for a snapshot.
    const isBatch = composed.value.length > 1;
    const applied: VersionedRecord[] = [];

    for (const record of composed.value) {
      const persisted = persist(record);

      if (!persisted.saved && isBatch) {
        break;
      }

      applied.push(merge(persisted.record));
    }

    // Sent even when empty, so the window still learns of the notice.
    emitDelta(applied);

    // AD-4: a GM edit goes to the room after it is merged and persisted. A GM whose storage could
    // not be read minted without the saved state, so its records stay in this client.
    if (loaded.persistence !== null) {
      outbox.add(applied);
    }
  }

  // A GM client persists each record that changes its replica. A player client persists nothing.
  // A remote commit is never sent on again.
  function receiveCommit(records: readonly VersionedRecord[]): void {
    const noticesBefore = currentNotices().join();
    const changed: VersionedRecord[] = [];

    for (const record of records) {
      // A record this large could never reach a window, as with one read from storage.
      if (!recordFitsOneMessage(record)) {
        console.error('Muster Roll dropped a remote record too large for one message', record.k);
        continue;
      }

      const before = replica.get(record.k);
      let winner = merge(record);

      if (winner !== before) {
        // The store can hold a newer record from another tab of this browser.
        winner = merge(persist(winner).record);
        changed.push(winner);
      }
    }

    if (changed.length > 0 || currentNotices().join() !== noticesBefore) {
      emitDelta(changed);
    }
  }

  function raiseNewerVersion(): void {
    if (newerVersionSeen) {
      return;
    }

    newerVersionSeen = true;
    emitDelta([]);
  }

  // AD-5: `v`, then the schema, then the gate, and only then a handler.
  async function handleRoomMessage(event: BroadcastEvent): Promise<void> {
    const parsed = parseRoomMessage(event.data);

    if (!parsed.ok) {
      if (parsed.error === 'newer-version') {
        raiseNewerVersion();
      }

      return;
    }

    const sender = await roster.senderOf(event.connectionId);
    const relation = generationRelation(parsed.value.g, ownGeneration);

    if (stopped || !admitRoomMessage(parsed.value.t, sender?.role ?? null, relation)) {
      return;
    }

    dispatchRoomMessage(parsed.value);
  }

  function dispatchRoomMessage(message: RoomMessage): void {
    switch (message.t) {
      case 'commit':
        receiveCommit(message.records);
        break;
      default:
        unknownRoomMessage(message.t);
    }
  }

  // One message at a time in arrival order, so a sender lookup never lets a later message overtake.
  let roomMessages: Promise<void> = Promise.resolve();

  const unsubscribeRoom = platform.broadcast.onMessage(SYNC_CHANNEL, (event) => {
    roomMessages = roomMessages
      .then(() => handleRoomMessage(event))
      .catch((error) => {
        console.error('Muster Roll could not handle a room message', error);
      });
  });

  const unsubscribeUi = platform.broadcast.onMessage(UI_CHANNEL, (event) => {
    // Echoes of the engine's own messages fail this schema and stop here.
    const parsed = parseWindowMessage(event.data);

    if (!parsed.ok) {
      return;
    }

    if (parsed.value.t === 'projection-request') {
      sendProjection(parsed.value.nonce);
    } else {
      handleCommand(parsed.value);
    }
  });

  return {
    stop: () => {
      stopped = true;
      unsubscribeUi();
      unsubscribeRoom();
      roster.stop();
      outbox.stop();
    },
    flushNow: () => {
      outbox.flush();
      sendQueue.flushNow();
    },
  };
}

function repKey(command: { sheetId: string; sectionId: string; instanceId: string }): string {
  const { sheetId, sectionId, instanceId } = command;

  return patchRecordKey(sheetId, { kind: 'rep', sectionId, instanceId });
}

function listOf<Value, Failure>(result: Result<Value, Failure>): Result<Value[], Failure> {
  return result.ok ? ok([result.value]) : result;
}

// `tsc` fails here when a command type has no composer above.
function unknownCommand(command: never): never {
  throw new Error(`Muster Roll has no composer for the command ${JSON.stringify(command)}`);
}

// `tsc` fails here when a parsed room message has no handler above.
function unknownRoomMessage(t: never): never {
  throw new Error(`Muster Roll has no handler for the room message ${String(t)}`);
}

function loadReplica(platform: ReplicaEnginePlatform, role: PlayerRole): LoadedReplica {
  // AD-11: a player client has no persistence at all.
  if (role !== 'GM') {
    return { records: [], problemKeys: new Set(), persistence: null };
  }

  const store = createRecordStore(platform.storage, platform.metadata.getRoomId());
  const highest = store.readHighestGeneration();

  if (!highest.ok) {
    console.error('Muster Roll could not read the saved records', highest.error);

    // Without the saved records a write would pick the wrong generation or reuse an order.
    return { records: [], problemKeys: new Set([UNREADABLE_STORAGE_MARK]), persistence: null };
  }

  const generation = highest.value;
  const load = store.loadGeneration(generation);

  if (!load.ok) {
    console.error('Muster Roll could not read the saved records', load.error);

    return { records: [], problemKeys: new Set([UNREADABLE_STORAGE_MARK]), persistence: null };
  }

  const records: VersionedRecord[] = [];
  const problemKeys = new Set(load.value.corruptKeys);

  for (const record of load.value.records) {
    // A record too large for a message could never reach a window, so it counts as corrupt.
    if (recordFitsOneMessage(record)) {
      records.push(record);
    } else {
      problemKeys.add(record.k);
    }
  }

  return { records, problemKeys, persistence: { store, generation } };
}
