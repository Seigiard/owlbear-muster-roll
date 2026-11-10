import { nanoid } from 'nanoid';

import { createBoundedIdSet } from '@/core/bounded-id-set';
import { jsonByteLength, recordFitsOneMessage, splitBatch } from '@/core/message-size';
import { mergeRecords } from '@/core/merge';
import { decodePreset, encodePreset } from '@/core/preset';
import { hasLiveSheet, sheetDataSchema, type VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
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
import type { Generation } from '@/core/storage-key';
import { visibleRecords, type PlayerRole } from '@/core/visibility';
import type { BroadcastOptions, Platform, Unsubscribe } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';
import { createRecordStore, type RecordStore } from '@/replica/record-store';
import { createVersionMinter } from '@/replica/version-minter';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

// Enough for any burst of echoes, small enough to keep nothing forever.
const RECENT_COMMAND_ID_LIMIT = 256;

// Sits in the problem set, and no write clears it: a reload has to read the storage again.
const UNREADABLE_STORAGE_MARK = '(unreadable)';

export type ReplicaEnginePlatform = Pick<Platform, 'broadcast' | 'metadata' | 'player' | 'storage'>;

export type ReplicaEngine = { stop: () => void };

type Persistence = { store: RecordStore; generation: Generation };

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
  let sequence = 0;

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
    return problemKeys.size === 0 ? [] : ['local-save-failed'];
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

  function persist(record: VersionedRecord): VersionedRecord {
    if (loaded.persistence === null) {
      return record;
    }

    const { store, generation } = loaded.persistence;
    const written = store.write(generation, record);

    if (written.ok) {
      problemKeys.delete(record.k);

      return written.value;
    }

    console.error('Muster Roll could not save a record', written.error);
    problemKeys.add(record.k);

    return record;
  }

  function composeSheetCreate(
    command: Extract<Command, { type: 'sheet-create' }>,
  ): Result<VersionedRecord, RejectionReason> {
    const k = `sheet:${newId()}`;
    const { c, a } = minter.mint(k, replica.get(k)?.c ?? 0);

    const record: VersionedRecord = {
      k,
      d: { kind: command.kind, name: command.name, order: nextOrder(command.kind) },
      c,
      a,
    };

    return recordFitsOneMessage(record) ? ok(record) : err('too-large');
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

    const command = message.command;

    const composed =
      command.type === 'sheet-create' ? composeSheetCreate(command) : composePresetUpload(command);

    if (!composed.ok) {
      send({ t: 'command-rejected', id: message.id, reason: composed.error }).catch((error) => {
        console.error('Muster Roll could not reject a command', error);
      });

      return;
    }

    const applied = merge(persist(composed.value));

    emitDelta([applied]);
  }

  const unsubscribe: Unsubscribe = platform.broadcast.onMessage(UI_CHANNEL, (event) => {
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

  return { stop: unsubscribe };
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
