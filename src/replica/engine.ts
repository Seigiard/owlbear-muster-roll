import { nanoid } from 'nanoid';

import { createBoundedIdSet } from '@/core/bounded-id-set';
import { recordDigest } from '@/core/digest';
import type { JsonObject } from '@/core/json';
import { jsonByteLength, recordFitsOneMessage, splitBatch } from '@/core/message-size';
import { compareGenerations, mergeRecords, type Version } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import {
  admitRoomMessage,
  aliveMessage,
  generationRelation,
  parseRoomMessage,
  pingMessage,
  stateRequestMessage,
  SYNC_CHANNEL,
  type AliveMessage,
  type GenerationRelation,
  type RoomMessage,
  type StateMessage,
} from '@/core/room-messages';
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
import { INITIAL_GENERATION, type Generation } from '@/core/storage-key';
import { TIMING, type Timing } from '@/core/timing';
import {
  parseWindowMessage,
  UI_CHANNEL,
  type Command,
  type CommandMessage,
  type DeltaMessage,
  type EngineMessage,
  type GmLink,
  type Notice,
  type ProjectionMessage,
  type RejectionReason,
  type RoomCopyStatus,
  type SyncState,
} from '@/core/ui-messages';
import { visibleRecords, type PlayerRole } from '@/core/visibility';
import type { BroadcastEvent, BroadcastOptions, PartyMember, Platform } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import { createCommitOutbox } from '@/replica/commit-outbox';
import { createComposers, type ComposeContext } from '@/replica/composers';
import { createPartyRoster } from '@/replica/party-roster';
import { createPendingQueue, type PendingEntry } from '@/replica/pending-queue';
import { createRecordStore, type RecordStore } from '@/replica/record-store';
import { createVersionMinter } from '@/replica/version-minter';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

const REMOTE: BroadcastOptions = { destination: 'REMOTE' };

// Enough for any burst of echoes, small enough to keep nothing forever.
const RECENT_COMMAND_ID_LIMIT = 256;

// Far more catch-up nonces than a room sends while one answer is on its way.
const RECENT_NONCE_LIMIT = 256;

// Sits in the problem set, and no write clears it: a reload has to read the storage again.
const UNREADABLE_STORAGE_MARK = '(unreadable)';

export type ReplicaEnginePlatform = Pick<
  Platform,
  'broadcast' | 'metadata' | 'party' | 'player' | 'storage'
>;

export type EngineTiming = Pick<
  Timing,
  | 'catchUpTimeoutMs'
  | 'stateAnswerDelayMinMs'
  | 'stateAnswerDelayMaxMs'
  | 'gmLinkTimeoutMs'
  | 'snapshotPauseMs'
  | 'snapshotJitterMs'
>;

// Tests inject the timing, the ids and the random answer delay and room copy jitter.
export type ReplicaEngineOptions = {
  timing?: EngineTiming;
  newId?: () => string;
  random?: () => number;
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

type CatchUpTrigger = 'start' | 'return' | 'role' | 'generation' | 'drift';

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

export async function startReplicaEngine(
  platform: ReplicaEnginePlatform,
  sendQueue: SendQueue,
  options: ReplicaEngineOptions = {},
): Promise<ReplicaEngine> {
  const timing = options.timing ?? TIMING;
  const newId = options.newId ?? nanoid;
  const random = options.random ?? Math.random;

  const [startRole, connectionId] = await Promise.all([
    platform.player.getRole(),
    platform.player.getConnectionId(),
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
  const answeringNonces = new Set<string>();
  const pending = createPendingQueue();
  // AD-5: re-read on every party change, and a change enters catch-up.
  let role = startRole;
  let persistence = loaded.persistence;
  // A player client has no room copy yet (Story 2.5). It takes a higher generation from a `state`
  // that answers its own request.
  let ownGeneration = persistence?.generation ?? INITIAL_GENERATION;
  let highestSeenGeneration = ownGeneration;
  const outbox = createCommitOutbox(sendQueue, () => ownGeneration);
  const roster = createPartyRoster(platform.party);
  let sequence = 0;
  // AD-12: once a newer build has spoken in the room, the banner stays until a reload.
  let newerVersionSeen = false;
  let stopped = false;

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
  let roleReads = 0;
  // A window ignores deltas until its first projection, so none is worth sending before one.
  let projectionSent = false;
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

  for (const record of loaded.records) {
    merge(record);
  }

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

  function reject(id: string, reason: RejectionReason): void {
    send({ t: 'command-rejected', id, reason }).catch((error) => {
      console.error('Muster Roll could not reject a command', error);
    });
  }

  function sendProjection(nonce: string): void {
    // A window repeats its request until the first part arrives, so one already answered
    // and still in the queue must not be answered twice.
    if (answeringNonces.has(nonce)) {
      return;
    }

    const shownRecords = sync.state === 'live' ? [] : [...shownPending.values()];
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

      return { record: written.value, saved: true };
    }

    console.error('Muster Roll could not save a record', written.error);
    problemKeys.add(record.k);

    return { record, saved: false };
  }

  function liveContext(): ComposeContext {
    return { records: replica, mint: minter.mint };
  }

  // Mints nothing: a version of the pending view never reaches the room or the storage.
  function dryContext(records: ReadonlyMap<string, VersionedRecord>): ComposeContext {
    return {
      records,
      mint: (_key, highestKnownCounter): Version => ({
        c: highestKnownCounter + 1,
        a: connectionId,
      }),
    };
  }

  // A batch is saved in order and stops at its first failed write. The failed record and the ones
  // after it are not applied, so a retry of the command reaches them again. A single record keeps
  // its value after a failed write, and the notice asks the GM for a snapshot.
  function apply(records: readonly VersionedRecord[]): VersionedRecord[] {
    const isBatch = records.length > 1;
    const applied: VersionedRecord[] = [];

    for (const record of records) {
      const persisted = persist(record);

      if (!persisted.saved && isBatch) {
        break;
      }

      applied.push(merge(persisted.record));
    }

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

    // Every command writes. A player's own record would beat later GM edits of its key in merge.
    if (role !== 'GM') {
      reject(message.id, 'not-allowed');

      return;
    }

    if (sync.state === 'catching-up') {
      queueIntent(message.id, message.command);

      return;
    }

    const composed = composers.compose(liveContext(), message.command);

    if (!composed.ok) {
      reject(message.id, composed.error);

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

  // AD-7: an intent made during catch-up waits and takes `c` on exit. It is checked now against the
  // pending view, so a refusal comes at once.
  function queueIntent(id: string, command: Command): void {
    if (command.type === 'preset-upload') {
      reject(id, 'catching-up');

      return;
    }

    const dry = composers.compose(dryContext(pendingView()), command);

    if (!dry.ok) {
      reject(id, dry.error);

      return;
    }

    pending.add(id, command);
    emitDelta([]);
  }

  // The replica with every pending intent applied by the same composers, minting nothing.
  function pendingView(): Map<string, VersionedRecord> {
    const view = new Map(replica);
    const context = dryContext(view);

    for (const entry of pending.entries()) {
      for (const record of composedEntry(context, entry)) {
        view.set(record.k, record);
      }
    }

    return view;
  }

  function composedEntry(context: ComposeContext, entry: PendingEntry): VersionedRecord[] {
    if (entry.kind === 'intent') {
      const composed = composers.compose(context, entry.command);

      return composed.ok ? composed.value : [];
    }

    const { record } = composers.composePatches(context, entry.patches);

    return record === null ? [] : [record];
  }

  // The pending view records the windows do not have yet, and the keys the view no longer
  // changes, which the windows withdraw so the replica's record shows again. In `live` the
  // windows drop the whole view.
  function pendingViewChanges(): PendingChanges {
    if (sync.state === 'live') {
      shownPending = new Map();

      return { records: [], withdrawn: [] };
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
        const composed = composers.compose(liveContext(), entry.command);

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

    return changed;
  }

  // AD-7 entry. A start, a role change and a higher generation always ask with a new `r` and drop
  // the answers to the old one. A return while catching up keeps `r`, and asks again only when
  // nothing has answered it yet. Resolves once a GM client knows whether it is alone.
  function enterCatchUp(trigger: CatchUpTrigger): Promise<void> {
    if (stopped) {
      return Promise.resolve();
    }

    const keepsNonce = trigger === 'return' && sync.state === 'catching-up' && ownNonce !== null;
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
      requestState(nonce);
    }

    if (role === 'GM') {
      await leaveIfAlone(nonce);
    }
  }

  // AD-7 and AD-9: a copy of this client's generation merges. A client that holds no record takes
  // the copy's higher generation, as at start it takes the highest one it knows. A lower one, or a
  // higher one over held records, is left alone. `null` is a failed read, which proves nothing.
  function mergeRoomCopy(metadata: JsonObject | null): void {
    if (metadata === null) {
      return;
    }

    const read = readSnapshot(metadata);

    if (!read.ok) {
      console.error('Muster Roll could not read the room copy', read.error);
      unreadableRoomCopy(metadata, read.error);

      return;
    }

    const copy = read.value;

    if (copy === null) {
      noteRoomCopy(metadata, false);

      return;
    }

    // A GM client that holds no record has nothing of its own generation to lose, so it takes the
    // copy's, as AD-9 has every client take the highest generation it knows at start: a GM on a
    // new device after an import loads that way. `receiveState` keeps a GM's generation, because a
    // `state` can reach a GM that holds records, and full adoption with its pending queue is Epic 5.
    if (compareGenerations(copy.g, ownGeneration) > 0 && replica.size === 0) {
      adoptGeneration(copy.g);
    }

    const sameGeneration = compareGenerations(copy.g, ownGeneration) === 0;

    noteRoomCopy(metadata, sameGeneration);

    if (sameGeneration) {
      receiveRecords(copy.records);
    }
  }

  // Only a client that holds no record comes here, so nothing of the old generation is left to
  // drop. A GM client persists under the new one from now on.
  function adoptGeneration(generation: Generation): void {
    ownGeneration = generation;
    highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);
    forgetDigests();

    if (persistence !== null) {
      persistence = { ...persistence, generation };
    }
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
    return !stopped && role === 'GM' && persistence !== null && sync.state === 'live';
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

    try {
      await runRoomCopyWrite();
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
        catchUpToCopyGeneration(copy.g);

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
      catchUpToCopyGeneration(check.value.g);

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

  // AD-8 step 1: a copy of a higher generation is neither merged nor overwritten. Every sighting
  // enters catch-up, also of a generation seen before, so the GM does not stay live skipping writes.
  function catchUpToCopyGeneration(generation: Generation): void {
    highestSeenGeneration = higherGeneration(highestSeenGeneration, generation);
    forgetDigests();
    void enterCatchUp('generation');
  }

  // A GM raises the not-saved notice for a copy it cannot read; a newer build's copy also raises
  // the new-version notice. A player shows nothing here (Story 2.6).
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

  // Another GM's write or another extension's data changes what Settings shows. Nothing merges here.
  function followMetadata(metadata: JsonObject): void {
    const read = readSnapshot(metadata);
    const copy = read.ok ? read.value : null;

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

    return { state, usedBytes: roomCopyUsed, freeBytes: roomCopyFree };
  }

  function requestState(nonce: string): void {
    sendQueue
      .enqueue(SYNC_CHANNEL, stateRequestMessage(ownGeneration, nonce), REMOTE)
      .catch((error) => {
        console.error('Muster Roll could not ask for the room state', error);
      });
  }

  function armCatchUpTimeout(): void {
    clearTimeout(catchUpTimer);

    const nonce = ownNonce;

    catchUpTimer = setTimeout(() => {
      if (!stopped && sync.state === 'catching-up' && ownNonce === nonce) {
        leaveCatchUp('unanswered');
      }
    }, timing.catchUpTimeoutMs);
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

    if (!players.some((player) => player.role === 'GM')) {
      leaveCatchUp('unanswered');
    }
  }

  // `responder` is the GM client whose complete answer ended the catch-up.
  function leaveCatchUp(exit: CatchUpExit, responder?: string): void {
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
    shownPending = new Map();

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

    // Sent in `live`, so the windows drop the pending view in the same step.
    if (projectionSent || changed.length > 0) {
      emitDelta(changed);
    }

    sendCommits(replayed);

    // AD-8: a write owed from before, or the edits that waited, go into the room copy now.
    if (roomCopyOwed || replayed.length > 0) {
      scheduleRoomCopy();
    }
  }

  // A GM client persists each record that changes its replica. A player client persists nothing.
  // A remote record is never sent on again.
  function receiveRecords(records: readonly VersionedRecord[]): VersionedRecord[] {
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

    return changed;
  }

  // AD-7 answer: a GM client that is live and can vouch for its records answers after a random
  // delay, unless an answer to `r` shows up first.
  function receiveStateRequest(r: string): void {
    // A request again for one `r` means the asker got no complete answer, so earlier answers no
    // longer count.
    answeredNonces.delete(r);

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
  function canAnswer(): boolean {
    return (
      role === 'GM' && persistence !== null && (sync.state === 'live' || catchUpTrigger === 'drift')
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
      // A GM client keeps its generation until Epic 5 brings full adoption.
      if (!adoptsGeneration(message)) {
        return;
      }

      ownGeneration = message.g;
      forgetDigests();
      highestSeenGeneration = higherGeneration(highestSeenGeneration, message.g);
    } else {
      // Only a readable answer of this generation makes this client's own answer needless.
      answeredNonces.add(message.r);
      clearTimeout(answerTimers.get(message.r));
      answerTimers.delete(message.r);
    }

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
    if (message.r !== lastNonce) {
      return;
    }

    const held = answers.get(sender);
    const answer = held?.n === message.n ? held : { n: message.n, parts: new Set<number>() };

    answer.parts.add(message.i);
    answers.set(sender, answer);

    if (answer.parts.size !== answer.n) {
      return;
    }

    if (sync.state === 'catching-up') {
      leaveCatchUp('answered', sender);
    } else if (!sync.gmAnswered) {
      sync = { ...sync, gmAnswered: true };
      emitDelta([]);
    }
  }

  // A player holds no persisted data, so it takes the generation of the answer to its own request.
  function adoptsGeneration(message: RoomMessage): boolean {
    return (
      message.t === 'state' &&
      role !== 'GM' &&
      sync.state === 'catching-up' &&
      message.r === ownNonce
    );
  }

  function noteHigherGeneration(generation: Generation): void {
    if (compareGenerations(generation, highestSeenGeneration) <= 0) {
      return;
    }

    highestSeenGeneration = generation;
    forgetDigests();
    void enterCatchUp('generation');
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
    role = next;
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

    void enterCatchUp('role');
  }

  // AD-6: a GM-origin message puts off both the ping and the offline mark by the whole timeout.
  function hearGm(): void {
    watchGmSilence();
    setGmLink('online');
  }

  function watchGmSilence(): void {
    clearTimeout(pingTimer);
    clearTimeout(gmSilenceTimer);

    if (stopped) {
      return;
    }

    pingTimer = setTimeout(pingWhileSilent, pingDelay());
    gmSilenceTimer = setTimeout(() => {
      setGmLink('offline');
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

  function setGmLink(next: GmLink): void {
    if (stopped || gmLink === next) {
      return;
    }

    gmLink = next;

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

    // AD-7: a GM that speaks from a higher generation sends this client back to catch-up.
    if (relation === 'higher' && sender?.role === 'GM' && !adoptsGeneration(message)) {
      noteHigherGeneration(message.g);
    }

    if (!admitRoomMessage(message.t, sender?.role ?? null, relation)) {
      return;
    }

    // AD-6: any admitted message from a GM sender shows that a GM client answers.
    if (sender?.role === 'GM') {
      hearGm();
    }

    dispatchRoomMessage(message, event.connectionId, relation);
  }

  function dispatchRoomMessage(
    message: RoomMessage,
    sender: string,
    relation: GenerationRelation,
  ): void {
    switch (message.t) {
      case 'commit':
        // AD-8: another GM's edit changed the replica, so this GM writes too. The jitter keeps
        // GM clients from writing together.
        if (receiveRecords(message.records).length > 0) {
          scheduleRoomCopy();
        }

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
      clearTimeout(pingTimer);
      clearTimeout(gmSilenceTimer);

      for (const timer of answerTimers.values()) {
        clearTimeout(timer);
      }

      answerTimers.clear();
      unsubscribeUi();
      unsubscribeRoom();
      unsubscribeParty();
      unsubscribeRole();
      unsubscribeMetadata();
      roster.stop();
      outbox.stop();
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
      void enterCatchUp('return');
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
