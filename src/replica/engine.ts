import { nanoid } from 'nanoid';

import {
  canEdit,
  checkProposal,
  partyEntries,
  proposalAllowed,
  type PartyEntry,
  type ProposalContext,
} from '@/core/access';
import { createBoundedIdSet } from '@/core/bounded-id-set';
import { dicePlusDice, dicePlusTarget } from '@/core/dice-plus';
import { prepareDiceRoll, type DiceRollFailure, type PreparedDiceRoll } from '@/core/dice-roll';
import { recordDigest } from '@/core/digest';
import { newRecordId, type RecordIdKind } from '@/core/ids';
import type { JsonObject } from '@/core/json';
import {
  fitsOneMessage,
  jsonByteLength,
  recordFitsOneMessage,
  splitBatch,
} from '@/core/message-size';
import type { FieldPatchTarget } from '@/core/field-patch';
import { compareGenerations, mergeRecords, type Version } from '@/core/merge';
import { listedFaces, randomFaces, type FaceSource } from '@/core/formula-evaluate';
import { decodePreset, windowSizeOf, type Preset } from '@/core/preset';
import { NOTHING_ERASED, presetMoves, stripToTemplate } from '@/core/preset-migrate';
import {
  fieldValuesSchema,
  presetDataSchema,
  repDataSchema,
  sheetDataSchema,
  type FieldValue,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { rollNotificationText, type RollCopy } from '@/core/roll-text';
import {
  admitRoomMessage,
  aliveMessage,
  editIdOf,
  generationRelation,
  parseRoomMessage,
  pingMessage,
  proposeMessage,
  rejectMessage,
  resetMessage,
  rollMessage,
  stateRequestMessage,
  SYNC_CHANNEL,
  type AliveMessage,
  type CommitMessage,
  type GenerationRelation,
  type ProposeMessage,
  type RejectMessage,
  type RollContent,
  type RollMessage,
  type RoomMessage,
  type StateMessage,
} from '@/core/room-messages';
import { sheetKey } from '@/core/sheets';
import {
  decodeSnapshotFileData,
  importSnapshot,
  type SnapshotImport,
} from '@/core/snapshot-import';
import { liveSheetShownTo, openTarget, tokensToUnlink } from '@/core/token-links';
import {
  encodeSnapshot,
  readBackHolds,
  readSnapshot,
  ROOM_METADATA_BYTE_LIMIT,
  roomCopyUsage,
  roomMetadataBytes,
  SNAPSHOT_KEY,
  type Snapshot,
  type SnapshotFailure,
  type SnapshotValue,
} from '@/core/snapshot';
import { decodeStateRecords, stateAnswer } from '@/core/state-records';
import { generationSchema, INITIAL_GENERATION, type Generation } from '@/core/storage-key';
import {
  DICE_EXTENSION_TIMING,
  TIMING,
  type DiceExtensionTiming,
  type Timing,
} from '@/core/timing';
import {
  parseWindowMessage,
  UI_CHANNEL,
  type Command,
  type CommandMessage,
  type DeltaMessage,
  type EngineMessage,
  type GmLink,
  type Notice,
  type OpenSheetRequest,
  type PresetDiffMessage,
  type ProjectionMessage,
  type RejectionReason,
  type RollOutcome,
  type RollRequestMessage,
  type RoomCopyOutcome,
  type RoomCopyStatus,
  type SnapshotCheckMessage,
  type SyncState,
} from '@/core/ui-messages';
import { rollShownTo, visibleRecords, type PlayerRole } from '@/core/visibility';
import type { BroadcastEvent, BroadcastOptions, PartyMember, Platform } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import { createCommitOutbox } from '@/replica/commit-outbox';
import { createComposers, type ComposeContext } from '@/replica/composers';
import { createDiceExtension } from '@/replica/dice-extension';
import { createPartyRoster, type RoomSender } from '@/replica/party-roster';
import { createPendingQueue, type PendingEntry } from '@/replica/pending-queue';
import {
  combinePatches,
  createProposalQueue,
  movedPatches,
  proposedRecord,
  strippedPatch,
  type ProposalEntry,
  type ProposalFailure,
  type ProposalPatch,
} from '@/replica/proposal-queue';
import { createRecordStore, type RecordStore } from '@/replica/record-store';
import { watchSceneRemovals, type SceneWatch } from '@/replica/scene-watch';
import { createTokenMenu, type TokenMenuCopy } from '@/replica/token-menu';
import { createVersionMinter } from '@/replica/version-minter';
import { createWindowSizer } from '@/replica/window-size';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

const REMOTE: BroadcastOptions = { destination: 'REMOTE' };

// Enough for any burst of echoes, small enough to keep nothing forever.
const RECENT_COMMAND_ID_LIMIT = 256;

// Far more catch-up nonces than a room sends while one answer is on its way.
const RECENT_NONCE_LIMIT = 256;

// Far more tokens than one session deletes while a link to one of them can still arrive.
const DELETED_TOKEN_LIMIT = 1024;

// Far more rolls than reach a client while one of them can still arrive twice.
const RECENT_ROLL_ID_LIMIT = 256;

// Sits in the problem set, and no write clears it: a reload has to read the storage again.
const UNREADABLE_STORAGE_MARK = '(unreadable)';

// AD-9: a new generation whose save failed. Its keys name no record of the generation kept, so the
// mark goes with the next record saved, or when the replica is replaced.
const GENERATION_SAVE_MARK = '(generation-save)';

export type ReplicaEnginePlatform = Pick<
  Platform,
  | 'action'
  | 'broadcast'
  | 'contextMenu'
  | 'metadata'
  | 'notification'
  | 'party'
  | 'player'
  | 'popover'
  | 'scene'
  | 'storage'
>;

export type EngineTiming = Pick<
  Timing,
  | 'catchUpTimeoutMs'
  | 'stateAnswerDelayMinMs'
  | 'stateAnswerDelayMaxMs'
  | 'gmLinkTimeoutMs'
  | 'snapshotPauseMs'
  | 'snapshotJitterMs'
  | 'openRequestTtlMs'
  | 'proposeResendStartMs'
  | 'proposeResendMaxMs'
  | 'editDeniedQuietMs'
  | 'incompleteRequestStartMs'
  | 'incompleteRequestMaxMs'
>;

// Tests inject the timing, the ids, and the random source of the answer delay, the room copy
// jitter and the dice. `newId` makes the engine's own ids, such as nonces; `newRecordId` makes the
// sheet and instance ids of the records a command makes, such as an NPC copy's.
export type ReplicaEngineOptions = {
  timing?: EngineTiming;
  newId?: () => string;
  newRecordId?: (kind: RecordIdKind) => string;
  random?: () => number;
  // TASK-36: the dice extension's waits.
  diceTiming?: DiceExtensionTiming;
  // The copy catalog's roll strings. The background page passes them; with none, no roll shows.
  rollCopy?: RollCopy;
  // The copy catalog's token menu labels. The background page passes them; with none, no token
  // menu is made.
  menuCopy?: TokenMenuCopy;
  // UX-DR29: the copy catalog's "Нет прав на правку". The background page passes it; with none, a
  // denied edit shows no notification.
  editDenied?: string;
  // UX-DR31: the copy catalog's "Данные комнаты заменены". The background page passes it; with
  // none, an adopted generation shows no notification.
  dataReplaced?: string;
};

export type ReplicaEngine = {
  stop: () => void;
  // Sends every waiting message at once, held commits included, for a page that is about to close.
  flushNow: () => void;
  // AD-7: the page became visible, resumed, or came back online.
  catchUp: () => void;
  // AD-8: the page became hidden, so a GM client writes the room copy at once. A hidden tab's
  // timers may not run.
  pageHidden: () => void;
};

type Persistence = { store: RecordStore; generation: Generation };

type Persisted = { record: VersionedRecord; saved: boolean };

type LoadedReplica = {
  records: VersionedRecord[];
  problemKeys: Set<string>;
  persistence: Persistence | null;
};

// The messages one responder has sent for this client's own `r`, by `i`.
type AnswerParts = { n: number; parts: Set<number> };

// `page-return`: the page became visible, resumed or came back online. `gm-return`: a player heard
// a GM-origin message after `gmLink` was offline, while live (Story 2.6).
type CatchUpTrigger = 'start' | 'page-return' | 'role' | 'generation' | 'drift' | 'gm-return';

// The engine's own catch-up state. Windows get it with `gmLink` and the engine's role.
type CatchUpState = Omit<SyncState, 'role' | 'gmLink'>;

// AD-7: this many `alive` in a row from one GM client with a digest unlike this client's own start
// a catch-up. One alone can be a commit still on its way.
const DRIFT_ALIVE_COUNT = 2;

// One sender's differing digests counted in a row, and when the last one counted.
type DigestMismatches = { count: number; at: number };

// How a catch-up ended: with all parts of one answer, or with none (timeout, alone, closing page).
type CatchUpExit = 'answered' | 'unanswered';

// A delta or projection part: records of the replica, or records of the pending view.
type Part = { records: VersionedRecord[]; pending: VersionedRecord[] };

type PendingChanges = { records: VersionedRecord[]; withdrawn: string[] };

// What one delta carries: replica records, pending view records, and keys the windows drop.
type DeltaContent = Part & { withdrawn: string[] };

// A roll evaluated in this client, before it has an id and the roller's name.
type EvaluatedRoll = Omit<RollContent, 'id' | 'roller'>;

// A dice cell of one sheet, read at the request, waiting for its faces.
type PreparedRoll = Pick<EvaluatedRoll, 'sheetId' | 'kind' | 'sheetName'> & {
  dice: PreparedDiceRoll;
};

// Who a shown roll came from: this client, or a party member the gate admitted.
type RollSender = Pick<RoomSender, 'role' | 'name'>;

// The decoded preset, kept while the `preset` record keeps its version.
type DecodedPreset = { c: number; a: string; preset: Preset };

// The commands a player with access sends as proposals (AD-4).
type PlayerEditCommand = Extract<
  Command,
  { type: 'field-patch' | 'repeat-row-add' | 'repeat-row-delete' }
>;

export async function startReplicaEngine(
  platform: ReplicaEnginePlatform,
  sendQueue: SendQueue,
  options: ReplicaEngineOptions = {},
): Promise<ReplicaEngine> {
  const timing = options.timing ?? TIMING;
  const newId = options.newId ?? nanoid;
  const newRecordIdOf = options.newRecordId ?? newRecordId;
  const random = options.random ?? Math.random;

  const [startRole, connectionId, ownPlayerId] = await Promise.all([
    platform.player.getRole(),
    platform.player.getConnectionId(),
    platform.player.getId(),
  ]);

  const loaded = loadReplica(platform, startRole);
  const replica = new Map<string, VersionedRecord>();
  const problemKeys = loaded.problemKeys;
  // Names the stream of projections and deltas. A role change starts a new stream, so every window
  // asks for a fresh projection: visibility changes the record set, and a delta cannot take a
  // record out of a window.
  let engineId = newId();
  const minter = createVersionMinter(connectionId);
  const composers = createComposers(connectionId);
  const recentCommandIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);
  // AD-13: every roll this client has shown or dropped, its own included.
  const recentRollIds = createBoundedIdSet(RECENT_ROLL_ID_LIMIT);
  const recentRollRequestIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);
  let decodedPreset: DecodedPreset | null = null;
  // TASK-33: the window follows the size of the `preset` record. `sizedFor` names the version the
  // size was last taken from, "" for no preset. It is null before the first size and after a failed
  // one, so the next replica change asks again.
  let sizedFor: string | null = null;

  const windowSizer = createWindowSizer(platform.action, () => {
    sizedFor = null;
  });

  const answeringNonces = new Set<string>();
  const pending = createPendingQueue();
  // The ids each pending intent has made so far, by command id and then by role, until the queue
  // is replayed.
  const pendingIds = new Map<string, Map<string, string>>();
  // AD-5: re-read on every party change, and a change enters catch-up.
  let role = startRole;
  let persistence = loaded.persistence;
  // A player client has no room copy yet (Story 2.5). It takes a higher generation from a `state`
  // that answers its own request.
  let ownGeneration = persistence?.generation ?? INITIAL_GENERATION;
  let highestSeenGeneration = ownGeneration;
  const outbox = createCommitOutbox(sendQueue, () => ownGeneration);

  // AD-4: a player's edits, one entry per key, until a GM client answers each. Only the newest
  // version of an entry is composed into the `propose` the queue takes.
  const proposals = createProposalQueue({
    timing,
    enqueue: (compose) =>
      sendQueue.enqueueComposed(
        SYNC_CHANNEL,
        () => {
          const record = compose();

          return record === null || stopped || role === 'GM'
            ? null
            : proposeMessage(ownGeneration, record);
        },
        REMOTE,
      ),
  });

  // UX-DR29: when "Нет прав на правку" last showed, on the monotonic clock.
  let lastDeniedAt = Number.NEGATIVE_INFINITY;
  let sequence = 0;
  // AD-12: once a newer build has spoken in the room, the banner stays until a reload.
  let newerVersionSeen = false;
  let stopped = false;

  // AD-10: the background owns the token menu. "Отвязать лист" runs as a GM command of this
  // engine, so it goes through the same checks, catch-up queue, storage and send as a window's.
  // No window owns the id of a command the menu issues, so this page shows its rejection.
  const menuCommandIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);

  // TASK-36: the dice extension of this client, if one answers. It probes at start.
  const diceExtension = createDiceExtension(
    platform.broadcast,
    sendQueue,
    options.diceTiming ?? DICE_EXTENSION_TIMING,
    newId,
  );

  diceExtension.start();

  const tokenMenu =
    options.menuCopy === undefined
      ? null
      : createTokenMenu(platform, options.menuCopy, {
          unlink: (tokenId) => {
            const id = newId();

            menuCommandIds.add(id);
            handleCommand({ t: 'command', id, command: { type: 'link-clear', tokenId } });
          },
          open: openFromToken,
        });

  // TASK-39: a GM client watches the open scene and clears the link of a token deleted from it,
  // through the same GM command path as "Отвязать лист". A player client never reads the scene.
  let sceneWatch: SceneWatch | null = null;
  // The ids of those commands. A refused clear is silent, because the token is gone and no GM could
  // act on a message about it. The token stays in `deletedTokens`, so the next check tries again.
  const sceneCommandIds = createBoundedIdSet(RECENT_COMMAND_ID_LIMIT);
  // Item ids this GM client saw deleted from the open scene, oldest first, until the item shows in
  // the scene again. A link to one of them is cleared whenever this client is live and not
  // importing: one that waited out a catch-up or an import, and one that another GM client wrote
  // after the deletion.
  const deletedTokens = new Set<string>();

  // FR14: the sheet "Открыть лист" asked for, until a window acknowledges it. A newer press
  // replaces it. It is dropped once this role cannot see the sheet, the sheet is gone, Owlbear
  // refuses to open the window, or it outlives its lifetime.
  let heldOpen: OpenSheetRequest | null = null;
  // Read against the clock, not a timer, as a hidden tab's timers may not run.
  let heldOpenUntil = 0;

  // AD-7 catch-up. `ownNonce` is set only while catching up.
  let sync: CatchUpState = {
    state: 'catching-up',
    firstCatchUpDone: false,
    gmAnswered: false,
  };

  let ownNonce: string | null = null;
  // The last `r` this client asked with. A complete answer to it that comes after a timeout still
  // shows that a GM client answered.
  let lastNonce: string | null = null;
  let answers = new Map<string, AnswerParts>();
  // True once any `state` for `ownNonce` arrived, so a re-entry need not ask again.
  let answerSeen = false;
  let catchUpTimer: ReturnType<typeof setTimeout> | undefined;
  // AD-11: a client that became GM persists every held record when its catch-up ends.
  let persistAllOnExit = false;
  // The pending view by key, as the windows last got it.
  let shownPending = new Map<string, VersionedRecord>();
  // Answers waiting for their random delay, by the asker's `r`.
  const answerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Every `r` this client has seen an answer to, or answered itself, since its last request.
  const answeredNonces = createBoundedIdSet(RECENT_NONCE_LIMIT);
  // Requests a GM client heard while it could not answer, oldest first. It answers the ones still
  // unanswered when its catch-up ends, as nobody asks again: a player whose request reached a GM
  // tab that was opening would otherwise never get its state.
  const heldRequests = new Set<string>();
  // The `r` of the last `state-request` sent, so a GM that comes online can be asked again.
  let sentNonce: string | null = null;
  // A player's `gm-return` request waits a random part of the answer delay, so players that heard
  // one GM do not ask in one burst.
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let roleReads = 0;
  // A window ignores deltas until its first projection, so none is worth sending before one.
  let projectionSent = false;
  // The party as the windows last got it, as JSON, so a party change that changes nothing they show
  // sends no delta.
  let shownParty = '[]';
  // Made after `stopped` and `projectionSent`, which its callback reads.
  const roster = createPartyRoster(platform.party, followParty);
  // AD-6: only the engine sets it, from GM-origin messages the gate admits, never from the party.
  // Any admitted GM message counts, also one from a GM that is itself catching up, as the 2.4 spec
  // chooses: such a client still responds.
  let gmLink: GmLink = 'offline';
  let pingTimer: ReturnType<typeof setTimeout> | undefined;
  let gmSilenceTimer: ReturnType<typeof setTimeout> | undefined;
  // AD-7 drift, by GM connection id: the last digest each one sent in `alive`, how many of its
  // `alive` in a row differed from this client's own digest, and the digest this client ignores
  // from it because its complete answer ended a catch-up while that was its last digest.
  const lastAliveDigests = new Map<string, number>();
  const digestMismatches = new Map<string, DigestMismatches>();
  const ignoredDigests = new Map<string, number>();
  // The GM whose drift started the current catch-up, while that catch-up lasts.
  let driftStarter: string | null = null;
  let catchUpTrigger: CatchUpTrigger = 'start';
  // The digest of the replica, until the replica changes.
  let cachedDigest: number | null = null;
  // A player's windows hold the replica records visible when they were last sent. Each delta sends
  // the records that became visible and withdraws the keys that no longer are.
  let sentVisible = new Set<string>();
  // AD-8 room copy. The notice stays until the next verified write.
  let roomCopyNotSaved = false;
  // A readable room copy of this client's generation was last read or written.
  let roomCopyExists = false;
  let roomCopyUsed = 0;
  let roomCopyFree = ROOM_METADATA_BYTE_LIMIT;
  // What the last catch-up found in the room copy. A player with no GM answer shows data by it.
  let roomCopyOutcome: RoomCopyOutcome = null;
  // A write was skipped or stopped, or triggered during catch-up, so catch-up's end schedules one.
  let roomCopyOwed = false;
  let roomCopyTimer: ReturnType<typeof setTimeout> | undefined;
  // One write at a time, so an older copy never lands after a newer one. A trigger during a write
  // runs it once more after.
  let roomCopyWriting = false;
  let roomCopyRerun = false;
  // Counts `resume` and visibility changes. A write stops when one falls between its read and its
  // write.
  let pageChanges = 0;
  // The write in flight, so an import's write waits for it and never lands before an older copy.
  let roomCopyRun: Promise<void> = Promise.resolve();
  // AD-9: the higher generation this client adopts, until it is complete. Its records gather in
  // `incoming`, apart from the replica, which keeps the old data shown and saved until then.
  let adoptTarget: Generation | null = null;
  let incoming = new Map<string, VersionedRecord>();
  // The wait before the next `state-request` of an incomplete generation, doubled after each.
  let incompleteRetryMs = timing.incompleteRequestStartMs;
  // True while this client's own import writes the room copy and sends `reset`.
  let importing = false;

  for (const record of loaded.records) {
    merge(record);
  }

  // TASK-33: a saved preset sizes the window before the first catch-up ends.
  followWindowSize();

  function merge(record: VersionedRecord): VersionedRecord {
    const current = replica.get(record.k);
    const winner = current === undefined ? record : mergeRecords(current, record);

    replica.set(winner.k, winner);
    cachedDigest = null;

    return winner;
  }

  function currentNotices(): Notice[] {
    const notices: Notice[] = problemKeys.size === 0 ? [] : ['local-save-failed'];

    if (roomCopyNotSaved) {
      notices.push('room-copy-not-saved');
    }

    if (newerVersionSeen) {
      notices.push('new-version');
    }

    return notices;
  }

  function send(message: EngineMessage): Promise<void> {
    return sendQueue.enqueue(UI_CHANNEL, message, LOCAL);
  }

  // `changed` goes with `count-changed` only.
  function reject(
    id: string,
    reason: RejectionReason,
    changed: { count: number; digest: string } = { count: 0, digest: NOTHING_ERASED },
  ): void {
    if (sceneCommandIds.has(id)) {
      return;
    }

    if (menuCommandIds.has(id) && options.menuCopy !== undefined) {
      platform.notification.show(options.menuCopy.unlinkFailed, 'ERROR').catch((error) => {
        console.error('Muster Roll could not show a refused unlink', error);
      });
    }

    const message: EngineMessage =
      reason === 'count-changed'
        ? { t: 'command-rejected', id, reason, ...changed }
        : { t: 'command-rejected', id, reason };

    send(message).catch((error) => {
      console.error('Muster Roll could not reject a command', error);
    });
  }

  function sendProjection(nonce: string): void {
    // A window repeats its request until the first part arrives, so one already answered
    // and still in the queue must not be answered twice.
    if (answeringNonces.has(nonce)) {
      return;
    }

    const shownRecords = [...shownPending.values()];
    // GM visibility is the identity, so a GM builds no view to judge kinds by.
    const known = role === 'GM' ? [] : shownView();
    const records = visibleRecords(role, [...replica.values()], known);
    const pendingRecords = visibleRecords(role, shownRecords, known);
    const largestCount = records.length + pendingRecords.length + 1;

    const envelope: ProjectionMessage = {
      t: 'projection',
      nonce,
      engine: engineId,
      seq: sequence,
      i: largestCount,
      n: largestCount,
      records: [],
      pending: [],
      notices: currentNotices(),
      sync: { ...sync, gmLink, role },
      roomCopy: roomCopyStatus(),
      party: windowParty(),
    };

    const parts = splitParts(records, pendingRecords, jsonByteLength(envelope));

    if (parts === null) {
      console.error('Muster Roll could not split a projection');

      return;
    }

    answeringNonces.add(nonce);
    projectionSent = true;
    sentVisible = role === 'GM' ? new Set() : new Set(records.map((record) => record.k));

    const sends = parts.map((part, index) =>
      send({ ...envelope, i: index + 1, n: parts.length, ...part }),
    );

    Promise.all(sends)
      .then(() => {
        answeringNonces.delete(nonce);
      })
      .catch((error) => {
        console.error('Muster Roll could not send a projection', error);
      });

    // A window that just connected may be the one Owlbear opened for the request. It goes after the
    // projection in the same queue, so the window holds the sheet when the request arrives.
    deliverOpen();
  }

  // UX-DR21: a press on a token whose sheet this role cannot see opens nothing. Owlbear's filter
  // already hides such an item, but a press can race a link or role change.
  function openFromToken(tokenId: string): void {
    if (stopped) {
      return;
    }

    const sheetId = openTarget(replica, tokenId, role);

    if (sheetId === null) {
      return;
    }

    const id = newId();

    heldOpen = { id, sheetId };
    heldOpenUntil = Date.now() + timing.openRequestTtlMs;
    // No window opens for it, so a window opened by hand later does not jump to it.
    platform.action.open().catch((error) => {
      console.error('Muster Roll could not open its window', error);
      dropOpen(id);
    });
    // An open window takes it at once. A closed one asks for a projection when it opens.
    deliverOpen();
  }

  // Sent to every window. The first to acknowledge it ends the request, so a window that reloads or
  // connects later never gets it again.
  function deliverOpen(): void {
    dropStaleOpen();

    if (heldOpen === null) {
      return;
    }

    send({ t: 'open-sheet', ...heldOpen }).catch((error) => {
      console.error('Muster Roll could not ask a window to open a sheet', error);
    });
  }

  function dropStaleOpen(): void {
    if (
      heldOpen !== null &&
      (Date.now() >= heldOpenUntil || !liveSheetShownTo(replica, heldOpen.sheetId, role))
    ) {
      heldOpen = null;
    }
  }

  function dropOpen(id: string): void {
    if (heldOpen?.id === id) {
      heldOpen = null;
    }
  }

  // The records as the windows show them: the replica, with the pending view over it. A sheet's
  // kind is read from here, so a row is judged by its sheet even when the sheet is not in the batch.
  function shownView(): VersionedRecord[] {
    const view = new Map(replica);

    for (const [key, record] of shownPending) {
      view.set(key, record);
    }

    return [...view.values()];
  }

  function emitDelta(records: readonly VersionedRecord[]): void {
    const changes = pendingViewChanges();
    const content = role === 'GM' ? gmDelta(records, changes) : playerDelta(records, changes);

    const envelope: DeltaMessage = {
      t: 'delta',
      engine: engineId,
      seq: sequence + content.records.length + content.pending.length + 1,
      records: [],
      pending: [],
      withdrawn: content.withdrawn,
      notices: currentNotices(),
      sync: { ...sync, gmLink, role },
      roomCopy: roomCopyStatus(),
      party: windowParty(),
    };

    const parts = splitParts(content.records, content.pending, jsonByteLength(envelope));

    if (parts === null) {
      console.error('Muster Roll could not split a delta');

      return;
    }

    for (const [index, part] of parts.entries()) {
      sequence += 1;

      // A window drops the withdrawn keys before it takes the records, so only the first part
      // withdraws: a later one would drop records an earlier part brought.
      const withdrawn = index === 0 ? content.withdrawn : [];

      send({ ...envelope, seq: sequence, withdrawn, ...part }).catch((error) => {
        console.error('Muster Roll could not send a delta', error);
      });
    }
  }

  // UX-DR12: only a GM's access panel lists the party, so a player's windows get none.
  function windowParty(): PartyEntry[] {
    const party = role === 'GM' ? partyEntries(roster.entries()) : [];

    shownParty = JSON.stringify(party);

    return party;
  }

  // A party change reaches a GM's windows at once, so the access panel lists who is in the room.
  function followParty(): void {
    if (stopped || !projectionSent || role !== 'GM') {
      return;
    }

    if (JSON.stringify(partyEntries(roster.entries())) !== shownParty) {
      emitDelta([]);
    }
  }

  // AD-2: the menu follows every change of the replica or the role, once the first catch-up has
  // brought the room's links. It reads the replica, not the pending view, so a queued link shows
  // in the menu when it applies. Records that change nothing leave the filters as they were.
  function refreshTokenMenu(): void {
    if (tokenMenu !== null && !stopped && sync.firstCatchUpDone) {
      tokenMenu.update(replica, role);
    }
  }

  // TASK-33: every client sizes the window from the preset it holds, once it holds one or its first
  // catch-up found none. A size is taken once per version of the `preset` record. A preset this
  // build cannot read, as one a newer build wrote, keeps the current size.
  function followWindowSize(): void {
    const record = replica.get('preset');

    if (stopped || (record === undefined && !sync.firstCatchUpDone)) {
      return;
    }

    const version = record === undefined ? '' : `${record.c}:${record.a}`;

    if (version === sizedFor) {
      return;
    }

    sizedFor = version;

    const preset = presetOf(record);

    if (record !== undefined && preset === null) {
      return;
    }

    windowSizer.apply(windowSizeOf(preset));
  }

  // The replica changed: the token menu and the window size follow it.
  function followReplica(): void {
    refreshTokenMenu();
    followWindowSize();
  }

  // Only a GM client watches the scene. A fresh watch has seen no item, so a role change never counts
  // the tokens already gone as deleted.
  function followScene(): void {
    if (role === 'GM' && !stopped) {
      sceneWatch ??= watchSceneRemovals(platform.scene, {
        removed: unlinkRemoved,
        present: forgetPresent,
      });

      return;
    }

    sceneWatch?.stop();
    sceneWatch = null;
    deletedTokens.clear();
  }

  function unlinkRemoved(itemIds: readonly string[]): void {
    if (stopped || role !== 'GM') {
      return;
    }

    for (const itemId of itemIds) {
      deletedTokens.delete(itemId);
      deletedTokens.add(itemId);
    }

    // The oldest go first, so a long session keeps a bounded list.
    for (const oldest of deletedTokens) {
      if (deletedTokens.size <= DELETED_TOKEN_LIMIT) {
        break;
      }

      deletedTokens.delete(oldest);
    }

    clearDeletedLinks();
  }

  // An item back in the scene, as after an Owlbear undo, is not deleted, so the GM can link it again.
  function forgetPresent(itemIds: ReadonlySet<string>): void {
    for (const tokenId of deletedTokens) {
      if (itemIds.has(tokenId)) {
        deletedTokens.delete(tokenId);
      }
    }
  }

  // The live links of deleted tokens, once this GM client is live and not importing. One
  // `link-clear` per token, each with an id no window owns. Engine-made, so its id stays out of
  // `recentCommandIds`, which only guards against window repeats.
  function clearDeletedLinks(): void {
    if (stopped || role !== 'GM' || sync.state === 'catching-up' || importing) {
      return;
    }

    for (const tokenId of tokensToUnlink(deletedTokens, replica)) {
      const id = newId();

      sceneCommandIds.add(id);
      runCommand(id, { type: 'link-clear', tokenId });
    }
  }

  // A window drops a withdrawn key from its replica too, so a key that leaves the pending view comes
  // with the replica's record again.
  function gmDelta(records: readonly VersionedRecord[], changes: PendingChanges): DeltaContent {
    const sent = new Map(records.map((record) => [record.k, record]));

    for (const key of changes.withdrawn) {
      const record = replica.get(key);

      if (record !== undefined) {
        sent.set(key, record);
      }
    }

    return { records: [...sent.values()], pending: changes.records, withdrawn: changes.withdrawn };
  }

  // A record can become visible or stop being visible without changing itself: a character's rows
  // when its sheet arrives, a link that now points to an NPC. So a player's delta compares the whole
  // visible set with the one the windows hold.
  function playerDelta(records: readonly VersionedRecord[], changes: PendingChanges): DeltaContent {
    const known = shownView();

    const visibleNow = new Map(
      visibleRecords(role, [...replica.values()], known).map((record) => [record.k, record]),
    );

    const sent = new Map<string, VersionedRecord>();

    for (const key of [...records.map((record) => record.k), ...changes.withdrawn]) {
      const record = visibleNow.get(key);

      if (record !== undefined) {
        sent.set(key, record);
      }
    }

    // Before the first projection no window holds anything to compare with.
    if (projectionSent) {
      for (const [key, record] of visibleNow) {
        if (!sentVisible.has(key)) {
          sent.set(key, record);
        }
      }
    }

    const gone = projectionSent ? [...sentVisible].filter((key) => !visibleNow.has(key)) : [];

    sentVisible = new Set(visibleNow.keys());

    return {
      records: [...sent.values()],
      pending: visibleRecords(role, changes.records, known),
      withdrawn: [...new Set([...changes.withdrawn, ...gone])],
    };
  }

  function persist(record: VersionedRecord): Persisted {
    if (persistence === null) {
      return { record, saved: true };
    }

    const { store, generation } = persistence;
    const written = store.write(generation, record);

    if (written.ok) {
      problemKeys.delete(record.k);
      problemKeys.delete(GENERATION_SAVE_MARK);

      return { record: written.value, saved: true };
    }

    console.error('Muster Roll could not save a record', written.error);
    problemKeys.add(record.k);

    return { record, saved: false };
  }

  function liveContext(): ComposeContext {
    return { records: replica, mint: minter.mint, newRecordId: newRecordIdOf, isGmPlayer };
  }

  // FR19: a GM owns no character, so neither this client's player id nor one the party lists as a
  // GM takes an owner link.
  function isGmPlayer(playerId: string): boolean {
    return (
      playerId === ownPlayerId ||
      roster.entries().some((member) => member.id === playerId && member.role === 'GM')
    );
  }

  // Mints nothing: a version of the pending view never reaches the room or the storage.
  function dryContext(records: ReadonlyMap<string, VersionedRecord>): ComposeContext {
    return {
      records,
      mint: (_key, highestKnownCounter): Version => ({
        c: highestKnownCounter + 1,
        a: connectionId,
      }),
      newRecordId: newRecordIdOf,
      isGmPlayer,
    };
  }

  // A pending intent composes again for every pending view and once more on replay. One role of
  // one command gets one id each time, so the view keeps its keys and the replay writes the keys
  // the windows already show, even when records arrive in between.
  function pendingIdsOf(commandId: string): ComposeContext['newRecordId'] {
    return (kind, role) => {
      let ids = pendingIds.get(commandId);

      if (ids === undefined) {
        ids = new Map();
        pendingIds.set(commandId, ids);
      }

      const id = ids.get(role) ?? newRecordIdOf(kind);

      ids.set(role, id);

      return id;
    };
  }

  // A batch is saved in order and stops at its first failed write. The failed record and the ones
  // after it are not applied, so a retry of the command reaches them again. A single record keeps
  // its value after a failed write, and the notice asks the GM for a snapshot, unless it is part of
  // a batch the caller splits.
  function apply(
    records: readonly VersionedRecord[],
    stopsOnFailure = records.length > 1,
  ): VersionedRecord[] {
    const applied: VersionedRecord[] = [];

    for (const record of records) {
      const persisted = persist(record);

      if (!persisted.saved && stopsOnFailure) {
        break;
      }

      applied.push(merge(persisted.record));
    }

    followReplica();

    return applied;
  }

  // AD-4: a GM edit goes to the room after it is merged, persisted and shown. A GM whose storage
  // could not be read minted without the saved state, so its records stay in this client.
  function sendCommits(applied: readonly VersionedRecord[]): void {
    if (persistence !== null) {
      outbox.add(applied);
    }
  }

  function handleCommand(message: CommandMessage): void {
    if (recentCommandIds.has(message.id)) {
      return;
    }

    recentCommandIds.add(message.id);
    runCommand(message.id, message.command);
  }

  function runCommand(id: string, command: Command): void {
    // AD-4: a player never merges its own edit, which would beat later GM edits of its key. Its
    // field and repeat row edits wait for a GM client's check. Nothing else is a player's to write.
    if (role !== 'GM') {
      handlePlayerCommand(id, command);

      return;
    }

    // AD-9: until the importer's `reset` is out, no commit of the new generation may reach the room.
    if (importing) {
      reject(id, 'importing');

      return;
    }

    if (sync.state === 'catching-up') {
      queueIntent(id, command);

      return;
    }

    if (command.type === 'preset-upload') {
      uploadPreset(id, command);

      return;
    }

    if (command.type === 'snapshot-import') {
      void importFromSnapshot(id, command);

      return;
    }

    const composed = composers.compose(liveContext(), command);

    if (!composed.ok) {
      reject(id, composed.error);

      return;
    }

    const applied = apply(composed.value);

    // Sent even when empty, so the window still learns of the notice.
    emitDelta(applied);
    sendCommits(applied);

    if (applied.length > 0) {
      scheduleRoomCopy();
    }
  }

  // AD-14: a window asks how many stored values a preset would erase before it asks the GM. A GM
  // client that is live answers with one diff over its full replica. The answer writes nothing.
  function handlePresetDiff(message: PresetDiffMessage): void {
    if (recentCommandIds.has(message.id)) {
      return;
    }

    recentCommandIds.add(message.id);

    if (role !== 'GM') {
      reject(message.id, 'not-allowed');

      return;
    }

    if (sync.state === 'catching-up') {
      reject(message.id, 'catching-up');

      return;
    }

    const diff = composers.presetDiffResult(liveContext(), message.data);

    if (!diff.ok) {
      reject(message.id, diff.error);

      return;
    }

    send({ t: 'preset-diff-result', id: message.id, ...diff.value }).catch((error) => {
      console.error('Muster Roll could not answer a preset diff', error);
    });
  }

  // AD-14: the diff runs again over the replica as it is now. The commits held so far go out
  // first, then each group of the batch is saved and sent as commits of its own, in order: rows
  // under new keys, `preset`, then tombstones of old keys and stripped rows. A failed write stops
  // the batch there, so a closure or a failure at any point leaves values readable under one of
  // the two presets. The generation does not change.
  function uploadPreset(id: string, command: Extract<Command, { type: 'preset-upload' }>): void {
    const batch = composers.composePresetUpload(liveContext(), command);

    if (!batch.ok) {
      reject(id, batch.error.reason, batch.error.changed);

      return;
    }

    if (persistence !== null) {
      outbox.flush();
    }

    const applied: VersionedRecord[] = [];
    let complete = true;

    for (const group of batch.value.groups) {
      const written = apply(group, true);

      applied.push(...written);

      if (persistence !== null && written.length > 0) {
        outbox.add(written);
        outbox.flush();
      }

      if (written.length < group.length) {
        complete = false;
        break;
      }
    }

    emitDelta(applied);

    if (applied.length > 0) {
      scheduleRoomCopy();
    }

    if (!complete) {
      reject(id, 'write-failed');

      return;
    }

    send({ t: 'preset-uploaded', id, count: batch.value.count }).catch((error) => {
      console.error('Muster Roll could not report a preset upload', error);
    });
  }

  // AD-9: a window asks how many values of a snapshot file the current preset would drop before it
  // asks the GM. A live GM client answers from its replica. The answer writes nothing.
  function handleSnapshotCheck(message: SnapshotCheckMessage): void {
    if (recentCommandIds.has(message.id)) {
      return;
    }

    recentCommandIds.add(message.id);

    if (role !== 'GM') {
      reject(message.id, 'not-allowed');

      return;
    }

    if (importing) {
      reject(message.id, 'importing');

      return;
    }

    if (sync.state === 'catching-up') {
      reject(message.id, 'catching-up');

      return;
    }

    // A GM client whose storage could not be read cannot save a new generation.
    if (persistence === null) {
      reject(message.id, 'write-failed');

      return;
    }

    const planned = planImport(message.data);

    if (!planned.ok) {
      reject(message.id, planned.error);

      return;
    }

    const { count, digest } = planned.value;

    send({ t: 'snapshot-check-result', id: message.id, count, digest }).catch((error) => {
      console.error('Muster Roll could not answer a snapshot check', error);
    });
  }

  // AD-9: the file read again and placed over the current preset. An import needs a preset.
  function planImport(data: string): Result<SnapshotImport, RejectionReason> {
    const file = decodeSnapshotFileData(data);

    if (!file.ok) {
      return err(file.error === 'too-large' ? 'too-large' : 'invalid-snapshot');
    }

    const stored = replica.get('preset');
    const presetData = presetDataSchema.safeParse(stored?.d);

    if (!presetData.success) {
      return err('preset-required');
    }

    const preset = presetOf(stored);

    if (preset === null) {
      return err('preset-unreadable');
    }

    const imported = importSnapshot(file.value, { preset, data: presetData.data }, connectionId);

    if (!imported.ok) {
      return err(imported.error === 'too-large' ? 'too-large' : 'invalid-snapshot');
    }

    return imported;
  }

  // AD-9: the confirmed import runs the placement again: values it drops other than the confirmed
  // ones ask again. The importer takes a generation above every one it knows, saves it, writes the
  // room copy, and only then sends `reset`. A failed save stops before the copy and `reset`, and the
  // part saved goes, so nothing changes. A copy that cannot be saved does not stop the import.
  async function importFromSnapshot(
    id: string,
    command: Extract<Command, { type: 'snapshot-import' }>,
  ): Promise<void> {
    if (importing) {
      reject(id, 'importing');

      return;
    }

    if (persistence === null) {
      reject(id, 'write-failed');

      return;
    }

    const planned = planImport(command.data);

    if (!planned.ok) {
      reject(id, planned.error);

      return;
    }

    const { records, count, digest } = planned.value;

    if (digest !== command.expectedDigest) {
      reject(id, 'count-changed', { count, digest });

      return;
    }

    const generation: Generation = {
      n: Math.max(ownGeneration.n, highestSeenGeneration.n) + 1,
      a: connectionId,
    };

    if (!generationSchema.safeParse(generation).success) {
      reject(id, 'write-failed');

      return;
    }

    // The commits held so far belong to the old generation, so they go out under it.
    outbox.flush();

    const { store } = persistence;

    if (!saveGeneration(store, generation, records)) {
      const removed = store.removeGeneration(generation);

      if (!removed.ok) {
        console.error('Muster Roll could not remove a part saved import', removed.error);
      }

      emitDelta([]);
      reject(id, 'write-failed');

      return;
    }

    importing = true;
    persistence = { store, generation };
    replaceReplica(generation, records);
    // Live, so no intent waits. A GM has no proposals.
    proposals.clear();
    emitDelta([]);

    try {
      await writeImportCopy(generation);

      if (stopped) {
        return;
      }

      // Another import of a higher generation won while the copy was written: this one is
      // replaced, and its `reset` would only send the room after a generation already gone.
      if (importSuperseded(generation)) {
        reject(id, 'data-replaced');

        return;
      }

      sendQueue.enqueue(SYNC_CHANNEL, resetMessage(generation), REMOTE).catch((error) => {
        console.error('Muster Roll could not send the reset', error);
      });

      const removed = store.removeGenerationsBelow(generation);

      if (!removed.ok) {
        console.error('Muster Roll could not remove the replaced records', removed.error);
      }
    } finally {
      importing = false;
      // Deletions that waited out the import, whether it finished, stopped or was replaced.
      clearDeletedLinks();
    }

    send({ t: 'snapshot-imported', id }).catch((error) => {
      console.error('Muster Roll could not report a snapshot import', error);
    });
  }

  // True once this client stopped, or left the generation it imports for a higher one.
  function importSuperseded(generation: Generation): boolean {
    return stopped || adoptTarget !== null || compareGenerations(ownGeneration, generation) !== 0;
  }

  // AD-9: the incomplete marker first, then every record, then the marker off. A failed write
  // leaves the marker, so a start never reads the part that was written, and raises the
  // local-save notice.
  function saveGeneration(
    store: RecordStore,
    generation: Generation,
    records: readonly VersionedRecord[],
  ): boolean {
    const marked = store.markIncomplete(generation);

    if (!marked.ok) {
      console.error('Muster Roll could not mark a new generation', marked.error);
      problemKeys.add(GENERATION_SAVE_MARK);

      return false;
    }

    for (const record of records) {
      const written = store.write(generation, record);

      if (!written.ok) {
        console.error('Muster Roll could not save a record of a new generation', written.error);
        problemKeys.add(GENERATION_SAVE_MARK);

        return false;
      }
    }

    const complete = store.markComplete(generation);

    if (!complete.ok) {
      console.error('Muster Roll could not mark a new generation complete', complete.error);
      problemKeys.add(GENERATION_SAVE_MARK);

      return false;
    }

    return true;
  }

  // The replica becomes the new generation's records. The windows get a new stream, as a delta
  // cannot take the old records out of them: each asks for a fresh projection.
  function replaceReplica(generation: Generation, records: readonly VersionedRecord[]): void {
    ownGeneration = generation;
    highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);
    replica.clear();
    cachedDigest = null;
    decodedPreset = null;

    // The keys that failed to save were the old generation's. Unreadable storage stays unreadable.
    for (const key of problemKeys) {
      if (key !== UNREADABLE_STORAGE_MARK) {
        problemKeys.delete(key);
      }
    }

    for (const record of records) {
      merge(record);
    }

    forgetDigests();
    engineId = newId();
    sequence = 0;
    dropStaleOpen();
    followReplica();
  }

  // AD-9: the importer's room copy of the new generation. One that does not fit or fails its
  // read-back raises the not-saved notice, and a copy of a lower generation goes from the room, so
  // a player with no GM does not read the replaced data. It waits for a write in flight, which
  // could land an older copy after it.
  async function writeImportCopy(generation: Generation): Promise<void> {
    while (roomCopyWriting) {
      await roomCopyRun;
    }

    const before = roomCopySignature();

    roomCopyWriting = true;

    try {
      const verified = await importCopyVerified(generation);

      if (importSuperseded(generation)) {
        return;
      }

      if (verified !== null) {
        roomCopyOwed = false;
        roomCopyNotSaved = false;
        noteRoomCopy(verified, true, before);

        return;
      }

      roomCopyNotSaved = true;
      roomCopyOwed = true;
      await removeLowerCopy(generation, before);
    } finally {
      roomCopyWriting = false;
    }

    if (roomCopyRerun) {
      roomCopyRerun = false;
      void writeRoomCopy();
    }
  }

  // The read-back metadata of a verified write, or `null`.
  async function importCopyVerified(generation: Generation): Promise<JsonObject | null> {
    const metadata = await readMetadata(platform);

    if (metadata === null || importSuperseded(generation)) {
      return null;
    }

    // A copy of a higher generation is another import that won: it is adopted, not overwritten.
    if (adoptedHigherCopy(metadata, generation)) {
      return null;
    }

    const written: Snapshot = { g: generation, records: [...replica.values()] };
    const value = encodeSnapshot(written.g, written.records);

    if (!value.ok || roomMetadataBytes(metadata, value.value) > ROOM_METADATA_BYTE_LIMIT) {
      return null;
    }

    try {
      await platform.metadata.setMetadata({ [SNAPSHOT_KEY]: value.value });
    } catch (error) {
      console.error('Muster Roll could not write the room copy', error);

      return null;
    }

    const readBack = await readMetadata(platform);

    if (
      readBack === null ||
      importSuperseded(generation) ||
      adoptedHigherCopy(readBack, generation)
    ) {
      return null;
    }

    const check = readSnapshot(readBack);

    return check.ok && readBackHolds(written, check.value) ? readBack : null;
  }

  // Adopts a room copy of a generation above `generation`, and says whether there was one.
  function adoptedHigherCopy(metadata: JsonObject, generation: Generation): boolean {
    const read = readSnapshot(metadata);

    if (!read.ok || read.value === null || compareGenerations(read.value.g, generation) <= 0) {
      return false;
    }

    adoptFromCopy(read.value);

    return true;
  }

  // A copy this build cannot read stays: it may be a newer build's.
  async function removeLowerCopy(generation: Generation, before: string): Promise<void> {
    const metadata = await readMetadata(platform);

    if (metadata === null || importSuperseded(generation)) {
      emitRoomCopyChange(before);

      return;
    }

    const read = readSnapshot(metadata);

    if (!read.ok || read.value === null || compareGenerations(read.value.g, generation) >= 0) {
      noteRoomCopy(metadata, false, before);

      return;
    }

    try {
      await platform.metadata.setMetadata({ [SNAPSHOT_KEY]: undefined });
    } catch (error) {
      console.error('Muster Roll could not remove the replaced room copy', error);
    }

    const after = await readMetadata(platform);

    if (after === null || stopped) {
      emitRoomCopyChange(before);

      return;
    }

    noteRoomCopy(after, false, before);
  }

  // AD-4: a player's edit of a field or a repeat row becomes the entry of its key in the proposal
  // queue. It is checked now against what the windows show, with the checks a GM client runs that
  // read no version, so a refusal comes at once. Made during catch-up, it waits for its `c`.
  function handlePlayerCommand(id: string, command: Command): void {
    if (!isPlayerEdit(command)) {
      reject(id, 'not-allowed');

      return;
    }

    const view = pendingView();

    // No access refuses before the field is checked, so a read-only sheet says why.
    if (!canEdit(view, command.sheetId, ownPlayerId)) {
      reject(id, 'not-allowed');

      return;
    }

    const composed = composers.compose(dryContext(view), command);

    if (!composed.ok) {
      reject(id, composed.error);

      return;
    }

    const [record] = composed.value;

    if (record === undefined || !proposalAllowed(proposalContext(view), ownPlayerId, record)) {
      reject(id, 'not-allowed');

      return;
    }

    const patch = patchOf(command, record);
    const existing = proposals.get(record.k);

    const entry: ProposalEntry = {
      k: record.k,
      patch: existing === undefined ? patch : combinePatches(existing.patch, patch),
      record: existing?.record ?? null,
      sent: existing?.sent ?? false,
    };

    if (sync.state === 'catching-up') {
      // AD-7: no version goes out until catch-up ends, the older one included.
      proposals.put({ ...entry, record: null });
    } else if (deniesEdit(proposeEntry(entry, replica.get(entry.k), entry.sent))) {
      // The row was removed by a commit the windows do not show yet, or the edit grew too large.
      notifyDenied();
    }

    emitDelta([]);
  }

  // The newest version of an entry over `base`, the newest record of its key this client knows,
  // with `c` above every one it knows of the key, its own included, put into the queue and sent.
  // `force` sends a patch that changes nothing on `base`: after a version of the entry went out, an
  // edit back to the base's data must still beat it. Returns why nothing went out.
  function proposeEntry(
    entry: ProposalEntry,
    base: VersionedRecord | undefined,
    force: boolean,
  ): ProposalFailure | null {
    const made = rebuiltRecord(entry, base, force);

    if (!made.ok) {
      proposals.drop(entry.k);

      return made.error;
    }

    proposals.put({ ...entry, record: made.value });

    return null;
  }

  function rebuiltRecord(
    entry: ProposalEntry,
    base: VersionedRecord | undefined,
    force: boolean,
  ): Result<VersionedRecord, ProposalFailure> {
    const highest = Math.max(base?.c ?? 0, entry.record?.c ?? 0);

    const made = proposedRecord(
      entry.k,
      entry.patch,
      base,
      () => minter.mint(entry.k, highest),
      force,
    );

    if (!made.ok) {
      return made;
    }

    const stripped = strippedProposal(made.value);

    return recordFitsOneMessage(stripped) ? ok(stripped) : err('too-large');
  }

  // AD-14: a player's version keeps no value the character template no longer has in its row, so a
  // value an older preset left in the base never goes out with it.
  function strippedProposal(record: VersionedRecord): VersionedRecord {
    const preset = presetOf(replica.get('preset'));

    return preset === null ? record : stripToTemplate(record, preset.character);
  }

  // AD-7: the edits made during catch-up take their `c` now, over the records it brought, and only
  // then are proposed. One that the player may no longer make, or that edits a removed row, is
  // dropped with the notification.
  function proposeWaiting(): void {
    let denied = false;

    for (const entry of proposals.entries()) {
      if (entry.record !== null) {
        continue;
      }

      const base = replica.get(entry.k);
      const made = rebuiltRecord(entry, base, entry.sent);

      if (made.ok && proposalAllowed(proposalContext(replica), ownPlayerId, made.value)) {
        proposals.put({ ...entry, record: made.value });
      } else {
        proposals.drop(entry.k);
        denied ||= !made.ok ? deniesEdit(made.error) : true;
      }
    }

    if (denied) {
      notifyDenied();
    }
  }

  function proposalContext(records: ReadonlyMap<string, VersionedRecord>): ProposalContext {
    return { records, preset: presetOf(records.get('preset')) };
  }

  // AD-4: a GM client that is live and can vouch for its records checks a player's proposal in
  // `core/access`. It merges a passed record unchanged and commits it, or the existing tombstone for
  // a removal of a removed row, echoing the proposer's `(k, c, a)` either way; or it rejects with
  // that echo. A GM in catch-up neither commits nor rejects: the player resends.
  // `sender` is the connection the gate heard it from: the `a` that connection mints with.
  function receiveProposal(
    message: ProposeMessage,
    sender: string,
    member: RoomSender | null,
  ): void {
    if (role !== 'GM' || sync.state !== 'live' || persistence === null || member === null) {
      return;
    }

    const [record] = message.records;

    if (record === undefined) {
      return;
    }

    const edit = editIdOf(record);

    // No GM client could commit it, so the player hears now rather than resending forever.
    if (!recordFitsOneMessage(record)) {
      sendRoom(rejectMessage(ownGeneration, edit, { reason: 'denied' }));

      return;
    }

    const verdict = checkProposal(
      proposalContext(replica),
      { playerId: member.playerId, author: sender },
      record,
    );

    switch (verdict.kind) {
      case 'commit': {
        const before = replica.get(record.k);
        const applied = apply([record]);
        const winner = replica.get(record.k) ?? record;

        if (winner !== before) {
          emitDelta(applied);
          scheduleRoomCopy();
        }

        outbox.add([winner], [edit]);

        break;
      }

      case 'commit-existing':
        outbox.add([verdict.record], [edit]);
        break;
      case 'denied':
        sendRoom(rejectMessage(ownGeneration, edit, { reason: 'denied' }));
        break;
      case 'stale': {
        const stale = rejectMessage(ownGeneration, edit, {
          reason: 'stale',
          current: verdict.current,
        });

        // A current record too large to go with the answer leaves the player nothing to rebase on.
        sendRoom(
          fitsOneMessage(stale) ? stale : rejectMessage(ownGeneration, edit, { reason: 'denied' }),
        );

        break;
      }

      default:
        unknownVerdict(verdict);
    }
  }

  function sendRoom(message: RejectMessage): void {
    if (!fitsOneMessage(message)) {
      console.error('Muster Roll built a rejection too large for one message', message.k);

      return;
    }

    sendQueue.enqueue(SYNC_CHANNEL, message, REMOTE).catch((error) => {
      console.error('Muster Roll could not answer a proposal', error);
    });
  }

  // AD-4: a player's entry clears on an ack or a record that names its own `(k, c, a)`. A commit of
  // an older version of the key leaves it. Returns whether any entry cleared.
  function clearAnswered(message: CommitMessage): boolean {
    if (role === 'GM') {
      return false;
    }

    let cleared = false;

    for (const edit of [...message.acks, ...message.records.map(editIdOf)]) {
      const entry = proposals.matching(edit);

      if (entry !== undefined) {
        proposals.drop(entry.k);
        cleared = true;
      }
    }

    return cleared;
  }

  // AD-4: only a rejection of this client's newest version of a key counts. `denied` drops the
  // entry, so the value returns. `stale` applies the patch to the GM's record, takes a `c` above it
  // and proposes again with the backoff started over; an edit of a row the GM holds removed is
  // dropped as denied, and a patch the record already holds ends there.
  function receiveReject(message: RejectMessage): void {
    const entry = role === 'GM' ? undefined : proposals.matching(message);

    if (entry === undefined) {
      return;
    }

    if (message.reason === 'denied' || message.current === undefined) {
      proposals.drop(entry.k);
      notifyDenied();
      emitDelta([]);

      return;
    }

    const known = replica.get(entry.k);
    const base = known === undefined ? message.current : mergeRecords(known, message.current);

    if (sync.state === 'catching-up') {
      // AD-7: no version goes out until catch-up ends, which takes the entry's `c` over what it
      // brought, the GM's record merged below included.
      proposals.put({ ...entry, record: null });
    } else if (deniesEdit(proposeEntry(entry, base, false))) {
      // The GM holds a `c` at least as high as this entry's, so no older version of it can win, and
      // a patch the GM's record already holds needs nothing more.
      notifyDenied();
    }

    // The GM's record merges too: it is newer than this client's.
    if (receiveRecords([message.current]).length === 0) {
      emitDelta([]);
    }
  }

  // UX-DR29: one notification for `denied` answers that arrive close together, such as one revoke
  // refusing several keys. Only a shown one starts the quiet window, so a steady trickle of denials
  // still shows one notification per window.
  function notifyDenied(): void {
    const now = performance.now();

    if (now - lastDeniedAt < timing.editDeniedQuietMs || options.editDenied === undefined) {
      return;
    }

    lastDeniedAt = now;

    platform.notification.show(options.editDenied, 'ERROR').catch((error) => {
      console.error('Muster Roll could not show a denied edit', error);
    });
  }

  // AD-13: the roller's replica evaluates once, from the values its windows show: the replica with
  // its pending edits, and the window's own unsent text and input errors over them. A roll writes
  // nothing, so a player and a client in catch-up roll too. The values are read at the request. A
  // local roll comes first: a field error, or an arithmetic error with its faces, sends nothing
  // anywhere, and it stands in when the dice extension gives no faces (TASK-36). Other faces from
  // the extension can still give an arithmetic error, after its dice showed.
  function handleRollRequest(message: RollRequestMessage): void {
    if (recentRollRequestIds.has(message.id)) {
      return;
    }

    recentRollRequestIds.add(message.id);

    const prepared = prepareRoll(message);

    if (!prepared.ok) {
      replyRoll(message.id, prepared.error);

      return;
    }

    const local = evaluatedWith(prepared.value, randomFaces(random));

    if (!local.ok) {
      replyRoll(message.id, local.error);

      return;
    }

    void rollWithDice(message.id, prepared.value, local.value);
  }

  function prepareRoll(message: RollRequestMessage): Result<PreparedRoll, RollOutcome> {
    const view = pendingView();
    const sheet = sheetDataSchema.safeParse(view.get(sheetKey(message.sheetId))?.d);

    // A player never rolls an NPC, as it never sees one.
    if (!sheet.success || !rollShownTo(role, sheet.data.kind)) {
      return err({ code: 'refused' });
    }

    const preset = presetOf(view.get('preset'));

    if (preset === null) {
      return err({ code: 'refused' });
    }

    const { kind, name } = sheet.data;

    const dice = prepareDiceRoll(
      kind === 'pc' ? preset.character : preset.npc,
      view,
      message.sheetId,
      message.place,
      new Map(Object.entries(message.shown)),
    );

    if (!dice.ok) {
      return err(rollFailure(dice.error));
    }

    return ok({ sheetId: message.sheetId, kind, sheetName: name, dice: dice.value });
  }

  // TASK-36: the faces come from the dice extension of this client when it is ready and can roll
  // every term, and the 3D dice show to the clients that see the notification. With no extension,
  // an error, a result that does not match, or no result in time, the local roll goes out.
  async function rollWithDice(
    requestId: string,
    prepared: PreparedRoll,
    local: EvaluatedRoll,
  ): Promise<void> {
    let roller: string;

    try {
      roller = await platform.player.getName();
    } catch (error) {
      console.error('Muster Roll could not read the player name for a roll', error);
      replyRoll(requestId, { code: 'failed' });

      return;
    }

    const dice = dicePlusDice(prepared.dice.terms);
    const ready = dice !== null && !stopped && (await diceExtension.ready());

    // The role can change while the name is read or the probe answers. `sendRoll` refuses such a
    // roll, and no dice show for it.
    if (dice === null || !ready || stopped || !rollShownTo(role, prepared.kind)) {
      await sendRoll(requestId, local, roller);

      return;
    }

    const faces = await diceExtension.roll({
      terms: prepared.dice.terms,
      notation: dice.notation,
      playerId: ownPlayerId,
      playerName: roller,
      rollTarget: dicePlusTarget(prepared.kind),
    });

    // A stopped page sends nothing more, and its wait was no failure of the extension.
    if (stopped) {
      return;
    }

    if (!faces.ok) {
      if (faces.error.code === 'stopped') {
        return;
      }

      console.error(
        'Muster Roll rolled locally, as the dice extension gave no faces:',
        faces.error.reason,
      );
      await sendRoll(requestId, local, roller);

      return;
    }

    // The extension's faces are the roll, and its dice already showed, so no local roll follows
    // them, even when they give an arithmetic error.
    let evaluated: Result<EvaluatedRoll, RollOutcome>;

    try {
      evaluated = evaluatedWith(prepared, listedFaces(faces.value));
    } catch (error) {
      console.error('Muster Roll could not apply the dice extension faces', error);
      replyRoll(requestId, { code: 'failed' });

      return;
    }

    if (!evaluated.ok) {
      replyRoll(requestId, evaluated.error);

      return;
    }

    await sendRoll(requestId, evaluated.value, roller);
  }

  // Decoded again only when the record's version changes, not on every press.
  function presetOf(record: VersionedRecord | undefined): Preset | null {
    if (record === undefined) {
      return null;
    }

    if (decodedPreset?.c === record.c && decodedPreset.a === record.a) {
      return decodedPreset.preset;
    }

    const data = presetDataSchema.safeParse(record.d);
    const decoded = data.success ? decodePreset(data.data) : null;

    if (decoded === null || !decoded.ok) {
      return null;
    }

    decodedPreset = { c: record.c, a: record.a, preset: decoded.value };

    return decoded.value;
  }

  // The roller's name is read at roll time. `REMOTE` does not echo to the sender, so this client
  // shows its own roll through the same id check as a received one, once the room has it.
  async function sendRoll(
    requestId: string,
    evaluated: EvaluatedRoll,
    roller: string,
  ): Promise<void> {
    if (stopped) {
      return;
    }

    // The role can change while the name is read or the dice roll.
    if (!rollShownTo(role, evaluated.kind)) {
      replyRoll(requestId, { code: 'refused' });

      return;
    }

    const message = rollMessage(ownGeneration, { id: newId(), roller, ...evaluated });

    // A roll a receiver would drop, or one too large to send, never goes out.
    if (!parseRoomMessage(message).ok || !fitsOneMessage(message)) {
      console.error('Muster Roll built a roll the room would not take');
      replyRoll(requestId, { code: 'failed' });

      return;
    }

    const sent = await sendQueue.enqueueReported(SYNC_CHANNEL, message, REMOTE);

    if (stopped) {
      return;
    }

    if (!sent) {
      replyRoll(requestId, { code: 'failed' });

      return;
    }

    receiveRoll(message, { role, name: roller });
    replyRoll(requestId, { code: 'rolled' });
  }

  function replyRoll(id: string, outcome: RollOutcome): void {
    send({ t: 'roll-outcome', id, outcome }).catch((error) => {
      console.error('Muster Roll could not answer a roll request', error);
    });
  }

  // AD-13: a roll shows once per id, and a player shows only a character's. Only this background
  // page shows it, so it shows with the window closed. It never enters the replica. A player
  // cannot see an NPC, so an NPC roll from a player is forged, and the name shown is the one the
  // party lists for the sender.
  function receiveRoll(message: RollMessage, sender: RollSender): void {
    if (recentRollIds.has(message.id)) {
      return;
    }

    recentRollIds.add(message.id);

    const forged = sender.role !== 'GM' && message.kind === 'npc';

    if (forged || !rollShownTo(role, message.kind) || options.rollCopy === undefined) {
      return;
    }

    const roller = sender.name === '' ? message.roller : sender.name;
    const text = rollNotificationText({ ...message, roller }, options.rollCopy);

    platform.notification.show(text).catch((error) => {
      console.error('Muster Roll could not show a roll', error);
    });
  }

  // AD-7: an intent made during catch-up waits and takes `c` on exit. It is checked now against the
  // pending view, so a refusal comes at once.
  function queueIntent(id: string, command: Command): void {
    if (command.type === 'preset-upload' || command.type === 'snapshot-import') {
      reject(id, 'catching-up');

      return;
    }

    const dry = composers.compose(
      { ...dryContext(pendingView()), newRecordId: pendingIdsOf(id) },
      command,
    );

    if (!dry.ok) {
      pendingIds.delete(id);
      reject(id, dry.error);

      return;
    }

    pending.add(id, command);
    emitDelta([]);
  }

  // The replica with every pending intent applied by the same composers, minting nothing, and every
  // proposal of a player's edit over it (AD-4): the newest version sent, or one that waits for its
  // `c`, as its patch makes it of the record it will be applied to.
  function pendingView(): Map<string, VersionedRecord> {
    const view = new Map(replica);
    const context = dryContext(view);

    for (const entry of pending.entries()) {
      for (const record of composedEntry(context, entry)) {
        view.set(record.k, record);
      }
    }

    // Built over the newest record of its key, so a GM edit of other fields that came after the
    // entry's version still shows. A sent version keeps its own `(c, a)`.
    for (const entry of proposals.entries()) {
      const shown = waitingRecord(entry, view.get(entry.k));

      if (shown !== null) {
        view.set(
          entry.k,
          entry.record === null ? shown : { ...shown, c: entry.record.c, a: entry.record.a },
        );
      }
    }

    return view;
  }

  function waitingRecord(
    entry: ProposalEntry,
    base: VersionedRecord | undefined,
  ): VersionedRecord | null {
    const made = proposedRecord(
      entry.k,
      entry.patch,
      base,
      () => ({ c: (base?.c ?? 0) + 1, a: connectionId }),
      true,
    );

    return made.ok ? strippedProposal(made.value) : null;
  }

  function composedEntry(context: ComposeContext, entry: PendingEntry): VersionedRecord[] {
    if (entry.kind === 'intent') {
      const composed = composers.compose(
        { ...context, newRecordId: pendingIdsOf(entry.id) },
        entry.command,
      );

      return composed.ok ? composed.value : [];
    }

    const { record } = composers.composePatches(context, entry.patches);

    return record === null ? [] : [record];
  }

  // The pending view records the windows do not have yet, and the keys the view no longer
  // changes, which the windows withdraw so the replica's record shows again: when catch-up ends,
  // and when a player's proposal is answered.
  function pendingViewChanges(): PendingChanges {
    if (pending.entries().length === 0 && proposals.entries().length === 0) {
      const withdrawn = [...shownPending.keys()];

      shownPending = new Map();

      return { records: [], withdrawn };
    }

    const next = new Map<string, VersionedRecord>();
    const records: VersionedRecord[] = [];

    for (const [key, record] of pendingView()) {
      if (record !== replica.get(key)) {
        const shown = shownPending.get(key);

        next.set(key, record);

        if (shown === undefined || JSON.stringify(shown) !== JSON.stringify(record)) {
          records.push(record);
        }
      }
    }

    const withdrawn = [...shownPending.keys()].filter((key) => !next.has(key));

    shownPending = next;

    return { records, withdrawn };
  }

  // AD-7 replay: every pending intent runs for real in arrival order. A refusal now goes to the
  // window with the command id it came with.
  function replayPending(): VersionedRecord[] {
    const applied: VersionedRecord[] = [];

    for (const entry of pending.takeAll()) {
      const ids = entry.kind === 'intent' ? [entry.id] : entry.patches.map((patch) => patch.id);

      if (role !== 'GM') {
        for (const id of ids) {
          reject(id, 'not-allowed');
        }
      } else if (entry.kind === 'intent') {
        const composed = composers.compose(
          { ...liveContext(), newRecordId: pendingIdsOf(entry.id) },
          entry.command,
        );

        if (composed.ok) {
          applied.push(...apply(composed.value));
        } else {
          reject(entry.id, composed.error);
        }
      } else {
        const { record, refusals } = composers.composePatches(liveContext(), entry.patches);

        for (const refusal of refusals) {
          reject(refusal.id, refusal.reason);
        }

        if (record !== null) {
          applied.push(...apply([record]));
        }
      }
    }

    pendingIds.clear();

    return applied;
  }

  // A GM client merges what it and the other tabs of its browser saved. A player persists nothing.
  function mergePersisted(): VersionedRecord[] {
    if (persistence === null || role !== 'GM') {
      return [];
    }

    const load = persistence.store.loadGeneration(persistence.generation);

    if (!load.ok) {
      console.error('Muster Roll could not read the saved records', load.error);

      return [];
    }

    for (const key of load.value.corruptKeys) {
      problemKeys.add(key);
    }

    const changed: VersionedRecord[] = [];

    for (const record of load.value.records) {
      // A record too large for a message could never reach a window, so it counts as corrupt.
      if (!recordFitsOneMessage(record)) {
        problemKeys.add(record.k);
        continue;
      }

      const before = replica.get(record.k);
      const winner = merge(record);

      if (winner !== before) {
        changed.push(winner);
      }
    }

    followReplica();

    return changed;
  }

  // AD-7 entry. A start, a role change and a higher generation always ask with a new `r` and drop
  // the answers to the old one. A return while catching up keeps `r`, and asks again only when
  // nothing has answered it yet. Resolves once a GM client knows whether it is alone.
  function enterCatchUp(trigger: CatchUpTrigger): Promise<void> {
    if (stopped) {
      return Promise.resolve();
    }

    const keepsNonce =
      trigger === 'page-return' && sync.state === 'catching-up' && ownNonce !== null;

    const changed = trigger === 'start' ? [] : mergePersisted();

    if (keepsNonce && ownNonce !== null) {
      if (changed.length > 0) {
        emitDelta(changed);
      }

      // The timeout keeps running from the first request, so returns cannot put the exit off.
      return askAfterRoomCopy(ownNonce, false);
    }

    const nonce = newId();

    sync = { ...sync, state: 'catching-up' };
    ownNonce = nonce;
    lastNonce = nonce;
    answers = new Map();
    answerSeen = false;
    catchUpTrigger = trigger;
    // A catch-up brings full state, so differences counted before it no longer say anything.
    digestMismatches.clear();

    if (trigger !== 'drift') {
      driftStarter = null;
    }

    if (trigger !== 'start') {
      emitDelta(changed);
    }

    // Armed before the room copy read, so a read that never ends cannot hold catch-up open.
    armCatchUpTimeout();

    return askAfterRoomCopy(nonce, true);
  }

  // AD-7: the room copy merges after the persisted records and before the request. An alone GM
  // client so holds it before it leaves with no wait. `fresh` is a new `r`; a kept one is asked
  // again only when nothing has answered it during the read either.
  async function askAfterRoomCopy(nonce: string, fresh: boolean): Promise<void> {
    const read = await readMetadata(platform);

    if (stopped) {
      return;
    }

    // Merge is idempotent, so a copy read while an answer ended catch-up still merges.
    mergeRoomCopy(read);

    if (ownNonce !== nonce) {
      return;
    }

    if (fresh || !answerSeen) {
      ask(nonce);
    }

    if (role === 'GM') {
      await leaveIfAlone(nonce);
    }
  }

  // AD-7 and AD-9: a copy of this client's generation merges. A copy of a higher generation is
  // adopted, as at start a client takes the highest one it knows. A lower one is left alone. `null`
  // is a failed read, which proves nothing.
  function mergeRoomCopy(metadata: JsonObject | null): void {
    const before = roomCopySignature();

    if (metadata === null) {
      // A player alone would load forever with no outcome; a known one stays.
      roomCopyOutcome ??= 'unreadable';
      emitRoomCopyChange(before);

      return;
    }

    mergeReadRoomCopy(metadata);
    // The windows learn the outcome even when nothing else they show changed.
    emitRoomCopyChange(before);
  }

  function mergeReadRoomCopy(metadata: JsonObject): void {
    const read = readSnapshot(metadata);

    if (!read.ok) {
      console.error('Muster Roll could not read the room copy', read.error);
      roomCopyOutcome = read.error === 'newer-version' ? 'newer' : 'unreadable';
      unreadableRoomCopy(metadata, read.error);

      return;
    }

    const copy = read.value;

    if (copy === null) {
      roomCopyOutcome = 'none';
      noteRoomCopy(metadata, false);

      return;
    }

    // AD-9: a copy of a higher generation is adopted, and as it decodes it completes that
    // generation at once: a client that starts after an import takes the highest generation of its
    // storage and the copy.
    if (compareGenerations(copy.g, ownGeneration) > 0) {
      adoptFromCopy(copy);
    }

    const sameGeneration = compareGenerations(copy.g, ownGeneration) === 0;

    // Set before the records merge, so the delta that brings them carries it: a window never sees
    // `read` without the records read.
    // A copy of another generation is there but cannot be read as this client's data.
    roomCopyOutcome = sameGeneration ? 'read' : 'unreadable';

    if (sameGeneration) {
      receiveRecords(copy.records);
    }

    noteRoomCopy(metadata, sameGeneration);
  }

  // AD-8: the edits paused. Each edit puts the write off again by the whole pause.
  function scheduleRoomCopy(): void {
    clearTimeout(roomCopyTimer);

    if (stopped || role !== 'GM') {
      return;
    }

    const delay = timing.snapshotPauseMs + random() * timing.snapshotJitterMs;

    roomCopyTimer = setTimeout(() => {
      void writeRoomCopy();
    }, delay);
  }

  // AD-8: only a live GM client that can vouch for its records writes, as only such a client
  // answers a `state-request`. Checked again after every await.
  function canWriteRoomCopy(): boolean {
    return (
      !stopped &&
      role === 'GM' &&
      persistence !== null &&
      sync.state === 'live' &&
      adoptTarget === null
    );
  }

  // AD-8: read, merge, encode, measure, write and read back. Any run that does not end in a
  // verified write leaves the write owed, so catch-up's end or the next trigger tries again.
  async function writeRoomCopy(): Promise<void> {
    clearTimeout(roomCopyTimer);
    roomCopyOwed = true;

    if (roomCopyWriting) {
      roomCopyRerun = true;

      return;
    }

    if (!canWriteRoomCopy()) {
      return;
    }

    roomCopyWriting = true;

    const run = runRoomCopyWrite();

    roomCopyRun = run.catch(() => undefined);

    try {
      await run;
    } finally {
      roomCopyWriting = false;
    }

    if (roomCopyRerun) {
      roomCopyRerun = false;
      await writeRoomCopy();
    }
  }

  async function runRoomCopyWrite(): Promise<void> {
    const changesAtRead = pageChanges;
    const metadata = await readMetadata(platform);

    // Step 2: a `resume` or a visibility change during the read stops the write.
    if (!canWriteRoomCopy() || pageChanges !== changesAtRead) {
      return;
    }

    if (metadata === null) {
      failRoomCopy(null);

      return;
    }

    const read = readSnapshot(metadata);

    // Step 1: a copy this build cannot read is never overwritten.
    if (!read.ok) {
      console.error('Muster Roll could not read the room copy', read.error);
      unreadableRoomCopy(metadata, read.error);

      return;
    }

    const copy = read.value;

    if (copy !== null) {
      const relation = compareGenerations(copy.g, ownGeneration);

      if (relation > 0) {
        adoptFromCopy(copy);

        return;
      }

      // A lower generation is not merged, and the write below replaces it.
      if (relation === 0) {
        receiveRecords(copy.records);
      }
    }

    const written: Snapshot = { g: ownGeneration, records: [...replica.values()] };
    const value = encodeSnapshot(written.g, written.records);

    // Step 4: over the limit the previous copy stays.
    if (!value.ok || roomMetadataBytes(metadata, value.value) > ROOM_METADATA_BYTE_LIMIT) {
      failRoomCopy(metadata);

      return;
    }

    await verifyRoomCopyWrite(written, value.value);
  }

  // Step 5: Owlbear reports success for a write it drops, so only the read-back counts.
  async function verifyRoomCopyWrite(written: Snapshot, value: SnapshotValue): Promise<void> {
    try {
      await platform.metadata.setMetadata({ [SNAPSHOT_KEY]: value });
    } catch (error) {
      console.error('Muster Roll could not write the room copy', error);

      if (canWriteRoomCopy()) {
        failRoomCopy(null);
      }

      return;
    }

    if (!canWriteRoomCopy()) {
      return;
    }

    const readBack = await readMetadata(platform);

    if (!canWriteRoomCopy()) {
      return;
    }

    if (readBack === null) {
      failRoomCopy(null);

      return;
    }

    const check = readSnapshot(readBack);

    // A copy of a higher generation holds none of this client's records, so it is not saved.
    if (check.ok && check.value !== null && compareGenerations(check.value.g, written.g) > 0) {
      adoptFromCopy(check.value);

      return;
    }

    if (!check.ok || !readBackHolds(written, check.value)) {
      failRoomCopy(readBack);

      return;
    }

    const before = roomCopySignature();

    roomCopyOwed = false;
    roomCopyNotSaved = false;
    noteRoomCopy(readBack, true, before);
  }

  // AD-9 and gap 12: any client that reads a room copy of a higher generation adopts it, and a
  // decoded copy of the generation it adopts completes it at once. A copy of a generation lower
  // than the one it adopts already is left alone.
  function adoptFromCopy(copy: Snapshot): void {
    seeGeneration(copy.g, sync.state === 'catching-up');

    if (adoptTarget !== null && compareGenerations(copy.g, adoptTarget) === 0) {
      stage(copy.records);
      completeAdoption(true);
    }
  }

  // AD-9: a generation above this client's own, and above the one it adopts, starts adoption. Its
  // pending queue, the GM intents and the player entries alike, drops with the notification, and
  // catch-up runs. The replica keeps the old data until the new generation is complete.
  // `keepNonce`: the message that shows it answers this client's current request, so the catch-up
  // in progress keeps its `r` and takes that answer.
  function seeGeneration(generation: Generation, keepNonce: boolean): void {
    highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);

    if (compareGenerations(generation, adoptTarget ?? ownGeneration) <= 0) {
      return;
    }

    // A client that showed nothing yet, as a player that just joined, has nothing replaced.
    const hadData =
      replica.size > 0 ||
      adoptTarget !== null ||
      pending.entries().length > 0 ||
      proposals.entries().length > 0;

    adoptTarget = generation;
    incoming = new Map();
    incompleteRetryMs = timing.incompleteRequestStartMs;
    // A held commit composes with the generation of the moment it sends, so it would carry old
    // records into the new generation.
    outbox.drop();
    dropPendingWork();
    forgetDigests();

    if (hadData) {
      notifyDataReplaced();
    }

    if (keepNonce && sync.state === 'catching-up' && ownNonce !== null) {
      catchUpTrigger = 'generation';
      // Answers of the old generation end nothing now.
      answers = new Map();
      emitDelta([]);

      return;
    }

    void enterCatchUp('generation');
  }

  // UX-DR31: the intents made against the replaced data go, each refused to its window, and so do a
  // player's edits.
  function dropPendingWork(): void {
    for (const entry of pending.takeAll()) {
      const ids = entry.kind === 'intent' ? [entry.id] : entry.patches.map((patch) => patch.id);

      for (const id of ids) {
        reject(id, 'data-replaced');
      }
    }

    pendingIds.clear();
    proposals.clear();
  }

  function notifyDataReplaced(): void {
    if (options.dataReplaced === undefined) {
      return;
    }

    platform.notification.show(options.dataReplaced).catch((error) => {
      console.error('Muster Roll could not show that the room data was replaced', error);
    });
  }

  // Records of the generation this client adopts, kept apart from the replica until it is
  // complete. Every one is complete, so any number of them merge.
  function stage(records: readonly VersionedRecord[]): void {
    for (const record of records) {
      if (!recordFitsOneMessage(record)) {
        console.error('Muster Roll dropped a remote record too large for one message', record.k);
        continue;
      }

      const current = incoming.get(record.k);

      incoming.set(record.k, current === undefined ? record : mergeRecords(current, record));
    }
  }

  // AD-9: the new generation is complete. A GM client saves it under the new generation first and
  // deletes the old one only once that save is complete. A save that fails keeps the old one and
  // raises the local-save notice. Catch-up then goes on by the usual rules.
  // `fromCopy`: the room copy completed it, so a copy of this generation is in the room. A save
  // that fails removes the part saved, keeps the old generation in storage and in the replica, and
  // leaves the adoption open, so the next answer or copy tries again.
  function completeAdoption(fromCopy = false): void {
    const generation = adoptTarget;

    if (generation === null) {
      return;
    }

    const records = [...incoming.values()];

    if (persistence !== null) {
      const { store } = persistence;

      if (!saveGeneration(store, generation, records)) {
        const removed = store.removeGeneration(generation);

        if (!removed.ok) {
          console.error('Muster Roll could not remove a part saved generation', removed.error);
        }

        emitDelta([]);

        return;
      }

      persistence = { store, generation };

      const removed = store.removeGenerationsBelow(generation);

      if (!removed.ok) {
        console.error('Muster Roll could not remove the replaced records', removed.error);
      }
    }

    adoptTarget = null;
    incoming = new Map();
    incompleteRetryMs = timing.incompleteRequestStartMs;
    replaceReplica(generation, records);
    // A copy read before was of the old generation.
    roomCopyExists = fromCopy;

    if (sync.state === 'catching-up') {
      armCatchUpTimeout();
    }

    emitDelta([]);
  }

  // A GM raises the not-saved notice for a copy it cannot read; a newer build's copy also raises
  // the new-version notice. A player shows the catch-up outcome instead (Story 2.6).
  function unreadableRoomCopy(metadata: JsonObject, failure: SnapshotFailure): void {
    if (failure === 'newer-version') {
      raiseNewerVersion();
    }

    if (role === 'GM') {
      failRoomCopy(metadata);
    } else {
      noteRoomCopy(metadata, false);
    }
  }

  // `null` keeps the sizes last read.
  function failRoomCopy(metadata: JsonObject | null): void {
    const before = roomCopySignature();

    roomCopyNotSaved = true;
    roomCopyOwed = true;

    if (metadata === null) {
      emitRoomCopyChange(before);
    } else {
      noteRoomCopy(metadata, roomCopyExists, before);
    }
  }

  // Another GM's write or another extension's data changes what Settings shows. A copy of this
  // generation does not merge here. A copy of a higher generation is adopted (gap 12), as an
  // importer writes it before its `reset`.
  function followMetadata(metadata: JsonObject): void {
    if (stopped) {
      return;
    }

    const read = readSnapshot(metadata);
    const copy = read.ok ? read.value : null;

    if (copy !== null && compareGenerations(copy.g, ownGeneration) > 0) {
      adoptFromCopy(copy);
    }

    noteRoomCopy(metadata, copy !== null && compareGenerations(copy.g, ownGeneration) === 0);
  }

  // Takes the sizes from the metadata just read, and tells the windows when anything they show
  // changed.
  function noteRoomCopy(metadata: JsonObject, exists: boolean, before = roomCopySignature()): void {
    const usage = roomCopyUsage(metadata);

    roomCopyExists = exists;
    roomCopyUsed = usage.usedBytes;
    roomCopyFree = usage.freeBytes;
    emitRoomCopyChange(before);
  }

  function emitRoomCopyChange(before: string): void {
    if (projectionSent && roomCopySignature() !== before) {
      emitDelta([]);
    }
  }

  function roomCopySignature(): string {
    return JSON.stringify([roomCopyStatus(), currentNotices()]);
  }

  function roomCopyStatus(): RoomCopyStatus {
    const state = roomCopyNotSaved ? 'failed' : roomCopyExists ? 'saved' : 'none';

    return { state, usedBytes: roomCopyUsed, freeBytes: roomCopyFree, outcome: roomCopyOutcome };
  }

  // Story 2.6: every player heard the same GM, so a `gm-return` request waits a random part of the
  // answer delay.
  function ask(nonce: string): void {
    if (catchUpTrigger !== 'gm-return') {
      requestState(nonce);

      return;
    }

    clearTimeout(requestTimer);
    requestTimer = setTimeout(() => {
      if (!stopped && ownNonce === nonce) {
        requestState(nonce);
      }
    }, random() * timing.stateAnswerDelayMaxMs);
  }

  function requestState(nonce: string): void {
    sentNonce = nonce;
    sendQueue
      .enqueue(SYNC_CHANNEL, stateRequestMessage(ownGeneration, nonce), REMOTE)
      .catch((error) => {
        console.error('Muster Roll could not ask for the room state', error);
      });
  }

  // AD-9: while the generation this client adopts is incomplete, the timeout does not end
  // catch-up. It reads the room copy and asks again, after a wait that doubles up to the max.
  function armCatchUpTimeout(): void {
    clearTimeout(catchUpTimer);

    const nonce = ownNonce;

    // The jitter keeps the clients that saw one `reset` from asking together.
    const delay =
      adoptTarget === null
        ? timing.catchUpTimeoutMs
        : incompleteRetryMs - (random() * incompleteRetryMs) / 4;

    catchUpTimer = setTimeout(() => {
      if (stopped || sync.state !== 'catching-up' || ownNonce !== nonce || nonce === null) {
        return;
      }

      if (adoptTarget === null) {
        leaveCatchUp('unanswered');

        return;
      }

      incompleteRetryMs = Math.min(incompleteRetryMs * 2, timing.incompleteRequestMaxMs);
      armCatchUpTimeout();
      void askAfterRoomCopy(nonce, true);
    }, delay);
  }

  // AD-7: a GM client whose confirmed party read shows no other GM connection has nobody to wait
  // for. A failed read proves nothing, so the client waits for answers or the timeout.
  async function leaveIfAlone(nonce: string): Promise<void> {
    let players: PartyMember[];

    try {
      players = await platform.party.getPlayers();
    } catch (error) {
      console.error('Muster Roll could not read the party', error);

      return;
    }

    if (stopped || sync.state !== 'catching-up' || ownNonce !== nonce || role !== 'GM') {
      return;
    }

    // AD-9: an incomplete generation waits for a GM client or its room copy, alone or not.
    if (adoptTarget !== null) {
      return;
    }

    if (!players.some((player) => player.role === 'GM')) {
      leaveCatchUp('unanswered');
    }
  }

  // `responder` is the GM client whose complete answer ended the catch-up. AD-9: a client whose new
  // generation is incomplete stays.
  function leaveCatchUp(exit: CatchUpExit, responder?: string): void {
    if (adoptTarget !== null) {
      return;
    }

    clearTimeout(catchUpTimer);

    // AD-7: a lagging GM keeps its digest after it answered, so comparing it again would loop. A
    // timeout exit proves nothing about any GM's records and starts no ignore.
    // The GM whose drift started the catch-up is ignored too: when another GM answered, a lagging
    // starter would otherwise start one catch-up after another.
    if (exit === 'answered') {
      for (const gm of [responder, driftStarter]) {
        const digest = gm === undefined || gm === null ? undefined : lastAliveDigests.get(gm);

        if (gm !== undefined && gm !== null && digest !== undefined) {
          ignoredDigests.set(gm, digest);
        }
      }
    }

    driftStarter = null;

    sync = {
      state: 'live',
      firstCatchUpDone: true,
      gmAnswered: sync.gmAnswered || exit === 'answered',
    };
    ownNonce = null;

    const changed: VersionedRecord[] = [];

    if (persistAllOnExit) {
      persistAllOnExit = false;

      for (const record of replica.values()) {
        // The store can hold a newer record from another tab of this browser.
        const winner = merge(persist(record).record);

        if (winner !== record) {
          changed.push(winner);
        }
      }
    }

    const replayed = replayPending();

    changed.push(...replayed);
    proposeWaiting();

    // Sent in `live`, so the windows drop the pending view in the same step. With no window yet,
    // the view is still brought up to date, as the first projection sends it.
    if (projectionSent || changed.length > 0) {
      emitDelta(changed);
    } else {
      pendingViewChanges();
    }

    sendCommits(replayed);
    // The first catch-up's end allows the menu and a size with no preset, and it merged what this
    // client had loaded.
    followReplica();
    answerHeldRequests();
    clearDeletedLinks();

    // AD-8: a write owed from before, or the edits that waited, go into the room copy now.
    if (roomCopyOwed || replayed.length > 0) {
      scheduleRoomCopy();
    }
  }

  // A GM client persists each record that changes its replica. A player client persists nothing.
  // A remote record is never sent on again.
  function receiveRecords(records: readonly VersionedRecord[]): VersionedRecord[] {
    const noticesBefore = currentNotices().join();
    const presetBefore = replica.get('preset');
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

    if (changed.length > 0) {
      followReplica();
      dropDisallowed(presetBefore);
    }

    if (changed.length > 0 || currentNotices().join() !== noticesBefore) {
      emitDelta(changed);
    }

    // Another GM client may link a token this client saw deleted.
    if (changed.length > 0) {
      clearDeletedLinks();
    }

    return changed;
  }

  // UX-DR29: once the records change, an entry the player may no longer make waits for no GM: its
  // access was revoked, its sheet deleted or made an NPC, or the repeat row it edits removed. It is
  // checked against the replica after the whole batch, so a revoke and a re-grant in one batch drop
  // nothing. The values return in the same delta, and one notification covers every drop. A removal
  // of a row that is gone already got what it asked for, so it drops with no notification.
  // AD-14: after a preset change each entry first moves to the keys the new preset gives its
  // values, as the GM's migration moves the rows: an entry with nothing that maps drops in silence.
  function dropDisallowed(presetBefore: VersionedRecord | undefined): void {
    if (role === 'GM') {
      return;
    }

    const context = proposalContext(replica);
    const before = presetBefore === replica.get('preset') ? null : presetOf(presetBefore);

    const moves =
      before === null || context.preset === null
        ? null
        : presetMoves(before.character, context.preset.character);

    let denied = false;

    for (const found of proposals.entries()) {
      const parts = moves === null ? null : movedPatches(found.k, found.patch, moves);

      if (parts === null || (parts.length === 1 && parts[0]?.k === found.k)) {
        denied = recheckProposal(found, context, false) || denied;
        continue;
      }

      proposals.drop(found.k);

      for (const part of parts) {
        const existing = proposals.get(part.k);

        const patch =
          existing?.patch.kind === 'fields' && part.patch.kind === 'fields'
            ? {
                kind: 'fields' as const,
                values: { ...part.patch.values, ...existing.patch.values },
              }
            : (existing?.patch ?? part.patch);

        const entry: ProposalEntry = {
          k: part.k,
          patch,
          record: found.record === null ? null : (existing?.record ?? found.record),
          sent: existing?.sent ?? false,
        };

        denied = recheckProposal(entry, context, true) || denied;
      }
    }

    if (denied) {
      notifyDenied();
    }
  }

  // AD-14: the entry loses the fields the current preset no longer has in its row, in silence. An
  // entry with nothing left drops in silence too, and one that lost fields or moved goes out again,
  // so the GM never answers its older version. True when a drop needs the denied notification.
  function recheckProposal(
    found: ProposalEntry,
    context: ProposalContext,
    moved: boolean,
  ): boolean {
    const patch =
      context.preset === null
        ? found.patch
        : strippedPatch(found.k, found.patch, context.preset.character);

    if (patch === null) {
      proposals.drop(found.k);

      return false;
    }

    const entry = patch === found.patch ? found : { ...found, patch };

    // The version is a placeholder: no check of `proposalAllowed` reads it.
    const made = proposedRecord(
      entry.k,
      entry.patch,
      replica.get(entry.k),
      () => ({ c: 1, a: connectionId }),
      true,
    );

    if (!made.ok || !proposalAllowed(context, ownPlayerId, made.value)) {
      proposals.drop(entry.k);

      return made.ok || deniesEdit(made.error);
    }

    if (entry === found && !moved) {
      return false;
    }

    if (entry.record === null) {
      proposals.put(entry);

      return false;
    }

    return deniesEdit(proposeEntry(entry, replica.get(entry.k), entry.sent));
  }

  // AD-7 answer: a GM client that is live and can vouch for its records answers after a random
  // delay, unless an answer to `r` shows up first.
  function receiveStateRequest(r: string): void {
    // A request again for one `r` means the asker got no complete answer, so earlier answers no
    // longer count.
    answeredNonces.delete(r);

    if (role === 'GM' && !canAnswer()) {
      holdRequest(r);

      return;
    }

    scheduleAnswer(r);
  }

  function holdRequest(r: string): void {
    heldRequests.delete(r);
    heldRequests.add(r);

    for (const oldest of heldRequests) {
      if (heldRequests.size <= RECENT_NONCE_LIMIT) {
        break;
      }

      heldRequests.delete(oldest);
    }
  }

  // Through the same delay and suppression as a fresh request: an answer seen meanwhile wins.
  function answerHeldRequests(): void {
    const held = [...heldRequests];

    heldRequests.clear();

    for (const r of held) {
      if (!answeredNonces.has(r)) {
        scheduleAnswer(r);
      }
    }
  }

  function scheduleAnswer(r: string): void {
    if (!canAnswer() || answerTimers.has(r)) {
      return;
    }

    const span = Math.max(0, timing.stateAnswerDelayMaxMs - timing.stateAnswerDelayMinMs);
    const delay = timing.stateAnswerDelayMinMs + random() * span;

    answerTimers.set(
      r,
      setTimeout(() => {
        answerTimers.delete(r);
        answerState(r);
      }, delay),
    );
  }

  // A GM whose storage could not be read keeps its records to itself, as with commits.
  // A catch-up for drift only pulls state, so a GM in one still answers. Two GMs that drift from each
  // other would otherwise both wait and time out, again and again.
  // AD-9: a client whose new generation is incomplete answers nothing.
  function canAnswer(): boolean {
    return (
      role === 'GM' &&
      persistence !== null &&
      adoptTarget === null &&
      (sync.state === 'live' || catchUpTrigger === 'drift')
    );
  }

  function ownDigest(): number {
    cachedDigest ??= recordDigest(replica.values());

    return cachedDigest;
  }

  function forgetDigests(): void {
    lastAliveDigests.clear();
    digestMismatches.clear();
    ignoredDigests.clear();
    driftStarter = null;
  }

  // Connections that left the party will never send `alive` again.
  function forgetLeftConnections(players: readonly PartyMember[]): void {
    const present = new Set(players.map((player) => player.connectionId));

    for (const map of [lastAliveDigests, digestMismatches, ignoredDigests]) {
      for (const connection of map.keys()) {
        if (!present.has(connection)) {
          map.delete(connection);
        }
      }
    }
  }

  function answerState(r: string): void {
    if (stopped || !canAnswer() || answeredNonces.has(r)) {
      return;
    }

    answeredNonces.add(r);

    const answer = stateAnswer(ownGeneration, r, [...replica.values()]);

    for (const key of answer.skipped) {
      console.error('Muster Roll left out a record too large for one state message', key);
    }

    for (const message of answer.messages) {
      sendQueue.enqueue(SYNC_CHANNEL, message, REMOTE).catch((error) => {
        console.error('Muster Roll could not send the room state', error);
      });
    }
  }

  function receiveState(message: StateMessage, sender: string, relation: GenerationRelation): void {
    const records = decodeStateRecords(message.records);

    if (!records.ok) {
      console.error('Muster Roll dropped a state message it could not read');

      return;
    }

    if (relation === 'higher') {
      // AD-9: the gate started adoption already. Only the generation adopted gathers, apart from
      // the replica, and only its answers complete it.
      if (adoptTarget === null || compareGenerations(message.g, adoptTarget) !== 0) {
        return;
      }

      if (message.r === ownNonce) {
        answerSeen = true;
      }

      stage(records.value);
      countAnswerPart(message, sender);

      return;
    }

    // Only a readable answer of this generation makes this client's own answer needless.
    answeredNonces.add(message.r);
    clearTimeout(answerTimers.get(message.r));
    answerTimers.delete(message.r);

    if (message.r === ownNonce) {
      answerSeen = true;
    }

    // Every `state` merges whenever it arrives, in any state.
    receiveRecords(records.value);
    countAnswerPart(message, sender);
  }

  // A partial answer counts as no answer: only all `n` messages of one responder end catch-up.
  // The parts of the last own `r` still count after a timeout, so a late complete answer shows
  // that a GM client answered.
  function countAnswerPart(message: StateMessage, sender: string): void {
    // AD-9: while a generation is adopted, only its answers count.
    if (
      message.r !== lastNonce ||
      (adoptTarget !== null && compareGenerations(message.g, adoptTarget) !== 0)
    ) {
      return;
    }

    const held = answers.get(sender);
    const answer = held?.n === message.n ? held : { n: message.n, parts: new Set<number>() };

    answer.parts.add(message.i);
    answers.set(sender, answer);

    if (answer.parts.size !== answer.n) {
      return;
    }

    completeAdoption();

    if (sync.state === 'catching-up') {
      leaveCatchUp('answered', sender);
    } else if (!sync.gmAnswered) {
      sync = { ...sync, gmAnswered: true };
      emitDelta([]);
    }
  }

  async function rereadRole(): Promise<void> {
    roleReads += 1;

    const read = roleReads;
    let next: PlayerRole;

    try {
      next = await platform.player.getRole();
    } catch (error) {
      console.error('Muster Roll could not read its role', error);

      return;
    }

    if (stopped || read !== roleReads || next === role) {
      return;
    }

    changeRole(next);
  }

  function changeRole(next: PlayerRole): void {
    // A GM proposes nothing, so a promoted player's edits become its own GM edits below.
    const promoted = next === 'GM' ? proposals.entries() : [];

    role = next;
    proposals.clear();
    refreshTokenMenu();
    followScene();
    forgetDigests();
    // A new stream: the catch-up entry below sends a delta, and each window that gets it from a
    // new engine id asks for a projection of the records the new role sees.
    engineId = newId();
    sequence = 0;
    persistAllOnExit = false;
    persistence = null;
    // Only a GM client writes the room copy, so a demoted one drops what it owed and its notice.
    clearTimeout(roomCopyTimer);
    roomCopyOwed = false;
    roomCopyNotSaved = false;

    if (next === 'GM') {
      // As at start: the highest generation of this client and of what the storage holds.
      const store = createRecordStore(platform.storage, platform.metadata.getRoomId());
      const stored = store.readHighestGeneration();
      const generation = stored.ok ? higherGeneration(ownGeneration, stored.value) : ownGeneration;
      const probe = stored.ok ? store.loadGeneration(generation) : stored;

      if (probe.ok) {
        ownGeneration = generation;
        highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);
        persistence = { store, generation };
        persistAllOnExit = true;
      } else {
        console.error('Muster Roll could not read the saved records', probe.error);
        problemKeys.add(UNREADABLE_STORAGE_MARK);
      }
    }

    // AD-7: they wait in the GM's catch-up queue as intents and apply when it ends. No window knows
    // their ids, so a refusal then reaches none.
    for (const entry of promoted) {
      for (const command of commandsOf(entry)) {
        pending.add(newId(), command);
      }
    }

    void enterCatchUp('role');
  }

  // AD-6: a GM-origin message puts off both the ping and the offline mark by the whole timeout.
  // `answersOwn` is a `state` for this client's last `r`: it counts as an answer, so it starts no
  // GM-return catch-up, which would drop that `r`.
  function hearGm(answersOwn: boolean): void {
    watchGmSilence();
    setGmLink('online', answersOwn);
  }

  function watchGmSilence(): void {
    clearTimeout(pingTimer);
    clearTimeout(gmSilenceTimer);

    if (stopped) {
      return;
    }

    pingTimer = setTimeout(pingWhileSilent, pingDelay());
    gmSilenceTimer = setTimeout(() => {
      setGmLink('offline', false);
    }, timing.gmLinkTimeoutMs);
  }

  // Repeats every half timeout until a GM-origin message arrives. Only the answer keeps a GM
  // online, so a hidden GM tab whose own timers stall still counts as online (NFR11).
  function pingWhileSilent(): void {
    if (stopped) {
      return;
    }

    sendQueue.enqueue(SYNC_CHANNEL, pingMessage(ownGeneration), REMOTE).catch((error) => {
      console.error('Muster Roll could not ping the GM clients', error);
    });
    pingTimer = setTimeout(pingWhileSilent, pingDelay());
  }

  // Half the timeout and a random part of a quarter more, so clients that heard one GM message
  // together do not ping together and draw a burst of `alive`.
  function pingDelay(): number {
    return timing.gmLinkTimeoutMs / 2 + (random() * timing.gmLinkTimeoutMs) / 4;
  }

  // Story 2.6: a GM that speaks after `gmLink` was offline may hold newer data than a player, so a
  // live player catches up with a new `r`. A GM client does not: it would wait out the timeout with
  // its edits pending whenever another GM tab opens. A client still catching up asks again with the
  // same `r` if nothing answered it, as its request may have gone out before that GM was there.
  function setGmLink(next: GmLink, answersOwn: boolean): void {
    if (stopped || gmLink === next) {
      return;
    }

    gmLink = next;

    // A GM is back, so the edits that waited for one go out now, not after their backoff.
    if (next === 'online' && role !== 'GM') {
      proposals.resendAll();
    }

    if (next === 'online' && !answersOwn && role !== 'GM' && sync.state === 'live') {
      // Its entry sends the delta that carries the new link.
      void enterCatchUp('gm-return');

      return;
    }

    if (
      next === 'online' &&
      !answersOwn &&
      sync.state === 'catching-up' &&
      ownNonce !== null &&
      sentNonce === ownNonce &&
      !answerSeen
    ) {
      requestState(ownNonce);
    }

    if (projectionSent) {
      emitDelta([]);
    }
  }

  // AD-6: a GM client answers on receipt, with no timer of its own. It answers only when it could
  // answer a `state-request` too, so its digest stands for records it would send.
  function receivePing(): void {
    if (!canAnswer() || sync.state !== 'live') {
      return;
    }

    const alive = aliveMessage(ownGeneration, ownDigest());

    sendQueue.enqueue(SYNC_CHANNEL, alive, REMOTE).catch((error) => {
      console.error('Muster Roll could not answer a ping', error);
    });
  }

  // AD-7 drift. Only a digest of this client's own generation compares, and only while live: a
  // client in catch-up is about to get full state anyway.
  function receiveAlive(message: AliveMessage, sender: string, relation: GenerationRelation): void {
    if (relation !== 'equal') {
      return;
    }

    lastAliveDigests.set(sender, message.digest);

    // A GM's own commits still on their way would show as a difference.
    if (sync.state !== 'live' || (role === 'GM' && outbox.hasUnsent())) {
      return;
    }

    const ignored = ignoredDigests.get(sender);

    if (ignored === message.digest) {
      return;
    }

    ignoredDigests.delete(sender);

    if (message.digest === ownDigest()) {
      digestMismatches.delete(sender);

      return;
    }

    // Every client answers one ping, so `alive` comes in bursts. A burst counts once, and a commit
    // in flight has time to land before a second difference counts.
    const now = Date.now();
    const counted = digestMismatches.get(sender);

    if (counted !== undefined && now - counted.at < timing.gmLinkTimeoutMs / 2) {
      return;
    }

    const count = (counted?.count ?? 0) + 1;

    if (count < DRIFT_ALIVE_COUNT) {
      digestMismatches.set(sender, { count, at: now });

      return;
    }

    driftStarter = sender;
    void enterCatchUp('drift');
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

    const message = parsed.value;
    const sender = await roster.senderOf(event.connectionId);

    if (stopped) {
      return;
    }

    const relation = generationRelation(message.g, ownGeneration);

    // AD-5 and AD-9: a GM that speaks from a higher generation, by `reset` or any other message,
    // starts adoption. An answer to this client's own request keeps that request.
    if (relation === 'higher' && sender?.role === 'GM') {
      seeGeneration(message.g, message.t === 'state' && message.r === ownNonce);

      // The gate takes a commit of its own generation only, so one of the generation adopted
      // gathers here, or it would be lost until the next drift check.
      if (
        message.t === 'commit' &&
        adoptTarget !== null &&
        compareGenerations(message.g, adoptTarget) === 0
      ) {
        stage(message.records);
      }
    }

    if (!admitRoomMessage(message.t, sender?.role ?? null, relation)) {
      return;
    }

    // AD-6: any admitted message from a GM sender shows that a GM client answers.
    if (sender?.role === 'GM') {
      hearGm(message.t === 'state' && message.r === lastNonce);
    }

    dispatchRoomMessage(message, event.connectionId, sender, relation);
  }

  // `member` is the party member behind `sender`, which the gate requires for every admitted type.
  function dispatchRoomMessage(
    message: RoomMessage,
    sender: string,
    member: RoomSender | null,
    relation: GenerationRelation,
  ): void {
    switch (message.t) {
      case 'commit': {
        const cleared = clearAnswered(message);

        // AD-8: another GM's edit changed the replica, so this GM writes too. The jitter keeps
        // GM clients from writing together.
        if (receiveRecords(message.records).length > 0) {
          scheduleRoomCopy();
        } else if (cleared) {
          emitDelta([]);
        }

        break;
      }

      case 'propose':
        receiveProposal(message, sender, member);
        break;
      case 'reject':
        receiveReject(message);
        break;
      case 'state-request':
        receiveStateRequest(message.r);
        break;
      case 'state':
        receiveState(message, sender, relation);
        break;
      case 'ping':
        receivePing();
        break;
      case 'alive':
        receiveAlive(message, sender, relation);
        break;
      case 'roll':
        if (member !== null) {
          receiveRoll(message, member);
        }

        break;
      // AD-9: the gate admits only a higher generation from a GM, which started adoption above.
      case 'reset':
        break;
      default:
        unknownRoomMessage(message);
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
    } else if (parsed.value.t === 'preset-diff') {
      handlePresetDiff(parsed.value);
    } else if (parsed.value.t === 'roll-request') {
      handleRollRequest(parsed.value);
    } else if (parsed.value.t === 'open-sheet-ack') {
      dropOpen(parsed.value.id);
    } else if (parsed.value.t === 'snapshot-check') {
      handleSnapshotCheck(parsed.value);
    } else {
      handleCommand(parsed.value);
    }
  });

  const unsubscribeParty = platform.party.onChange((players) => {
    forgetLeftConnections(players);
    void rereadRole();
  });

  const unsubscribeRole = platform.player.onRoleChange(() => {
    void rereadRole();
  });

  const unsubscribeMetadata = platform.metadata.onMetadataChange(followMetadata);

  followScene();

  const started = enterCatchUp('start');

  watchGmSilence();
  // An alone GM is live when the engine resolves. A metadata or party read that never ends holds
  // the engine back no longer than the catch-up timeout, which by then ended catch-up.
  await settledWithin(started, timing.catchUpTimeoutMs);

  return {
    stop: () => {
      stopped = true;
      clearTimeout(catchUpTimer);
      clearTimeout(roomCopyTimer);
      clearTimeout(requestTimer);
      clearTimeout(pingTimer);
      clearTimeout(gmSilenceTimer);

      for (const timer of answerTimers.values()) {
        clearTimeout(timer);
      }

      answerTimers.clear();
      proposals.clear();
      unsubscribeUi();
      unsubscribeRoom();
      unsubscribeParty();
      unsubscribeRole();
      unsubscribeMetadata();
      roster.stop();
      outbox.stop();
      tokenMenu?.stop();
      diceExtension.stop();
      followScene();
    },
    flushNow: () => {
      // A closing page cannot wait for catch-up, so the intents it holds apply and go out now.
      if (sync.state === 'catching-up' && pending.entries().length > 0) {
        leaveCatchUp('unanswered');
      }

      outbox.flush();
      sendQueue.flushNow();
    },
    catchUp: () => {
      pageChanges += 1;
      void enterCatchUp('page-return');
    },
    pageHidden: () => {
      pageChanges += 1;
      void writeRoomCopy();
    },
  };
}

// Records first, then the pending view, each split under the message limit. `null` when a record
// cannot fit one message.
function splitParts(
  records: readonly VersionedRecord[],
  pendingView: readonly VersionedRecord[],
  envelopeBytes: number,
): Part[] | null {
  const recordParts = splitBatch(records, envelopeBytes);
  const pendingParts = pendingView.length === 0 ? null : splitBatch(pendingView, envelopeBytes);

  if (!recordParts.ok || (pendingParts !== null && !pendingParts.ok)) {
    return null;
  }

  return [
    ...recordParts.value.map((part) => ({ records: part, pending: [] })),
    ...(pendingParts?.value ?? []).map((part) => ({ records: [], pending: part })),
  ];
}

// Resolves when `work` settles or after `milliseconds`, whichever comes first, and never rejects.
async function settledWithin(work: Promise<void>, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, milliseconds);
  });

  try {
    await Promise.race([work, deadline]);
  } catch (error) {
    console.error('Muster Roll could not start its catch-up', error);
  } finally {
    clearTimeout(timer);
  }
}

// A failed read is logged and comes back as `null`, so a caller never waits on a rejection.
async function readMetadata(platform: ReplicaEnginePlatform): Promise<JsonObject | null> {
  try {
    return await platform.metadata.getMetadata();
  } catch (error) {
    console.error('Muster Roll could not read the room metadata', error);

    return null;
  }
}

function higherGeneration(first: Generation, second: Generation): Generation {
  return compareGenerations(first, second) >= 0 ? first : second;
}

function isPlayerEdit(command: Command): command is PlayerEditCommand {
  return (
    command.type === 'field-patch' ||
    command.type === 'repeat-row-add' ||
    command.type === 'repeat-row-delete'
  );
}

// The patch an edit makes, read from the record it composed: a field's value as the composer
// accepted it, a new row with its order and cells, or a removal.
function patchOf(command: PlayerEditCommand, record: VersionedRecord): ProposalPatch {
  if (command.type === 'repeat-row-delete') {
    return { kind: 'remove' };
  }

  const repeatRow = record.k.startsWith('rep:') ? repDataSchema.parse(record.d) : null;

  if (command.type === 'repeat-row-add' && repeatRow !== null) {
    return { kind: 'add', d: repeatRow };
  }

  const values = repeatRow === null ? fieldValuesSchema.parse(record.d) : repeatRow.cells;
  const fieldId = command.type === 'field-patch' ? command.fieldId : '';

  return { kind: 'fields', values: { [fieldId]: values[fieldId] ?? null } };
}

// The commands that make a player's entry again as a GM's own edit: a removal, or a new row and
// then its cells, or the fields it sets and clears.
function commandsOf(entry: ProposalEntry): PlayerEditCommand[] {
  const [form, sheetId = '', id = '', instanceId = ''] = entry.k.split(':');

  const target: FieldPatchTarget =
    form === 'rep' ? { kind: 'rep', sectionId: id, instanceId } : { kind: 'row', rowId: id };

  const fieldPatches = (values: Readonly<Record<string, FieldValue | null>>): PlayerEditCommand[] =>
    Object.entries(values).map(([fieldId, value]) => ({
      type: 'field-patch',
      sheetId,
      target,
      fieldId,
      value,
    }));

  switch (entry.patch.kind) {
    case 'remove':
      return [{ type: 'repeat-row-delete', sheetId, sectionId: id, instanceId }];
    case 'add':
      return [
        { type: 'repeat-row-add', sheetId, sectionId: id, instanceId },
        ...fieldPatches(entry.patch.d.cells),
      ];
    case 'fields':
      return fieldPatches(entry.patch.values);
    default:
      return unknownPatch(entry.patch);
  }
}

// `tsc` fails here when a proposal patch has no case above.
function unknownPatch(patch: never): never {
  throw new Error(`Muster Roll has no case for the proposal patch ${JSON.stringify(patch)}`);
}

// A failure the player hears of as "Нет прав на правку": its edit cannot go to a GM client at all.
function deniesEdit(failure: ProposalFailure | null): boolean {
  return failure === 'gone' || failure === 'too-large';
}

// `tsc` fails here when a proposal verdict has no case above.
function unknownVerdict(verdict: never): never {
  throw new Error(`Muster Roll has no case for the proposal verdict ${JSON.stringify(verdict)}`);
}

// `tsc` fails here when a parsed room message has no handler above.
function unknownRoomMessage(message: never): never {
  throw new Error(`Muster Roll has no handler for the room message ${JSON.stringify(message)}`);
}

function loadReplica(platform: ReplicaEnginePlatform, role: PlayerRole): LoadedReplica {
  // AD-11: a player client has no persistence at all.
  if (role !== 'GM') {
    return { records: [], problemKeys: new Set(), persistence: null };
  }

  const store = createRecordStore(platform.storage, platform.metadata.getRoomId());
  // AD-9: a generation whose save stopped part way is no data.
  const removed = store.removeIncomplete();

  if (!removed.ok) {
    console.error('Muster Roll could not remove an incomplete generation', removed.error);
  }

  const highest = store.readHighestGeneration();

  if (!highest.ok) {
    console.error('Muster Roll could not read the saved records', highest.error);

    // Without the saved records a write would pick the wrong generation or reuse an order.
    return { records: [], problemKeys: new Set([UNREADABLE_STORAGE_MARK]), persistence: null };
  }

  const generation = highest.value;
  // AD-9: a run that stopped after it saved a new generation may have left the old one behind.
  const below = store.removeGenerationsBelow(generation);

  if (!below.ok) {
    console.error('Muster Roll could not remove a replaced generation', below.error);
  }

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

// A dice cell that is gone is refused; a field or arithmetic failure goes to the window as it is.
function rollFailure(failure: DiceRollFailure): RollOutcome {
  return failure.code === 'not-dice' ? { code: 'refused' } : failure;
}

// The roll of a prepared dice cell with these faces, as the room message carries it.
function evaluatedWith(
  prepared: PreparedRoll,
  faces: FaceSource,
): Result<EvaluatedRoll, RollOutcome> {
  const rolled = prepared.dice.roll(faces);

  if (!rolled.ok) {
    return err(rollFailure(rolled.error));
  }

  return ok({
    sheetId: prepared.sheetId,
    kind: prepared.kind,
    sheetName: prepared.sheetName,
    cell: prepared.dice.cell,
    result: rolled.value,
  });
}
