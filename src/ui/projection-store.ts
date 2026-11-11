import { atom, type ReadableAtom } from 'nanostores';

import type { PartyEntry } from '@/core/access';
import {
  fieldValuesSchema,
  repDataSchema,
  type FieldValue,
  type FieldValues,
  type VersionedRecord,
} from '@/core/records';
import { ROOM_METADATA_BYTE_LIMIT } from '@/core/snapshot';
import type {
  CommandRejectedMessage,
  Notice,
  OpenSheetRequest,
  PresetResultMessage,
  RollOutcomeMessage,
  RoomCopyStatus,
  SnapshotResultMessage,
  SyncState,
  WipedMessage,
} from '@/core/ui-messages';

// What a player's edit that waits for a GM's check does to its key (AD-4): a new repeat block, a
// change of field values, or a repeat block's removal.
export type PendingKind = 'add' | 'edit' | 'remove';

export type PendingEntry = {
  kind: PendingKind;
  // The fields an `edit` changes over the applied record, each with its pending value, `null` for
  // a cleared one. An `add` and a `remove` name none, as their mark is the row's. An `edit` can name
  // none too, as when a value was edited back to the applied one.
  fields: ReadonlyMap<string, FieldValue | null>;
  // The record the window shows for the key: the newest version of the edit.
  record: VersionedRecord;
  // The record the engine has applied, which a removed repeat block keeps showing until a GM
  // answers.
  applied: VersionedRecord | undefined;
};

export type ProjectionStore = {
  // The replica as the window shows it: the pending view stands in for the records of its keys.
  $records: ReadableAtom<ReadonlyMap<string, VersionedRecord>>;
  // The replica alone, with no pending view: what the engine has applied.
  $replica: ReadableAtom<ReadonlyMap<string, VersionedRecord>>;
  // UX-DR28: a player's edits that wait for a GM's check, by key. A GM's is always empty: its edits
  // never wait, and its catch-up queue is no proposal.
  $pending: ReadableAtom<ReadonlyMap<string, PendingEntry>>;
  $notices: ReadableAtom<readonly Notice[]>;
  // Recent rejections by command id, so two that land before one render both stay readable.
  $rejections: ReadableAtom<ReadonlyMap<string, CommandRejectedMessage>>;
  // Recent outcomes of this window's roll requests, by request id.
  $rollOutcomes: ReadableAtom<ReadonlyMap<string, RollOutcomeMessage>>;
  // AD-14: recent answers to this window's preset diffs and uploads, by their id.
  $presetResults: ReadableAtom<ReadonlyMap<string, PresetResultMessage>>;
  // AD-9: recent answers to this window's snapshot checks and imports, by their id.
  $snapshotResults: ReadableAtom<ReadonlyMap<string, SnapshotResultMessage>>;
  // AD-9, CAP-31: recent answers to this window's wipes, by their id.
  $wipeResults: ReadableAtom<ReadonlyMap<string, WipedMessage>>;
  // False until the first full projection, so an empty room is not mistaken for one still loading.
  $loaded: ReadableAtom<boolean>;
  $sync: ReadableAtom<SyncState>;
  // AD-8: the room copy as Settings shows it.
  $roomCopy: ReadableAtom<RoomCopyStatus>;
  // FR14: the last sheet or repeat block "Открыть лист" asked this window to show, or `null` before
  // any. The window tells a new request from one it has taken by its id.
  $openRequest: ReadableAtom<OpenSheetRequest | null>;
  // UX-DR12: the party as the engine last read it, for a GM's access panel. A player's is empty.
  $party: ReadableAtom<readonly PartyEntry[]>;
  replaceAll: (
    records: readonly VersionedRecord[],
    pending: readonly VersionedRecord[],
    notices: readonly Notice[],
    sync: SyncState,
  ) => void;
  applyDelta: (
    records: readonly VersionedRecord[],
    pending: readonly VersionedRecord[],
    withdrawn: readonly string[],
    notices: readonly Notice[],
    sync: SyncState,
  ) => void;
  setRejection: (rejection: CommandRejectedMessage) => void;
  setRollOutcome: (outcome: RollOutcomeMessage) => void;
  setPresetResult: (result: PresetResultMessage) => void;
  setSnapshotResult: (result: SnapshotResultMessage) => void;
  setWipeResult: (result: WipedMessage) => void;
  setRoomCopy: (roomCopy: RoomCopyStatus) => void;
  setOpenRequest: (request: OpenSheetRequest) => void;
  setParty: (party: readonly PartyEntry[]) => void;
};

// Far more than the commands or rolls one window has on their way at once.
const RECENT_REPLY_LIMIT = 256;

// What a window assumes before its first projection: the first catch-up has not ended, and the
// role allows the least.
const UNKNOWN_SYNC: SyncState = {
  state: 'catching-up',
  firstCatchUpDone: false,
  gmAnswered: false,
  gmLink: 'offline',
  role: 'PLAYER',
};

// Nothing read yet: no room copy, and all the room metadata space free.
const UNKNOWN_ROOM_COPY: RoomCopyStatus = {
  state: 'none',
  usedBytes: 0,
  freeBytes: ROOM_METADATA_BYTE_LIMIT,
  outcome: null,
};

// The engine orders messages by sequence, so a window replaces records and never compares versions.
export function createProjectionStore(): ProjectionStore {
  const $records = atom<ReadonlyMap<string, VersionedRecord>>(new Map());
  const $replica = atom<ReadonlyMap<string, VersionedRecord>>(new Map());
  const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map());
  const $notices = atom<readonly Notice[]>([]);
  const $rejections = atom<ReadonlyMap<string, CommandRejectedMessage>>(new Map());
  const $rollOutcomes = atom<ReadonlyMap<string, RollOutcomeMessage>>(new Map());
  const $presetResults = atom<ReadonlyMap<string, PresetResultMessage>>(new Map());
  const $snapshotResults = atom<ReadonlyMap<string, SnapshotResultMessage>>(new Map());
  const $wipeResults = atom<ReadonlyMap<string, WipedMessage>>(new Map());
  const $loaded = atom(false);
  const $sync = atom<SyncState>(UNKNOWN_SYNC);
  const $roomCopy = atom<RoomCopyStatus>(UNKNOWN_ROOM_COPY);
  const $openRequest = atom<OpenSheetRequest | null>(null);
  const $party = atom<readonly PartyEntry[]>([]);
  let replica = new Map<string, VersionedRecord>();
  let pendingView = new Map<string, VersionedRecord>();

  function show(notices: readonly Notice[], sync: SyncState): void {
    const shown = new Map(replica);

    for (const [key, record] of pendingView) {
      shown.set(key, record);
    }

    $records.set(shown);
    $replica.set(new Map(replica));
    $pending.set(sync.role === 'GM' ? new Map() : pendingEntries(replica, pendingView));
    $notices.set(notices);
    $sync.set(sync);
  }

  return {
    $records,
    $replica,
    $pending,
    $notices,
    $rejections,
    $rollOutcomes,
    $presetResults,
    $snapshotResults,
    $wipeResults,
    $loaded,
    $sync,
    $roomCopy,
    $openRequest,
    $party,
    replaceAll: (records, pending, notices, sync) => {
      replica = new Map(records.map((record) => [record.k, record]));
      // A live GM engine sends none. A player's holds its edits that wait for a GM (AD-4).
      pendingView = new Map(pending.map((record) => [record.k, record]));
      show(notices, sync);
      $loaded.set(true);
    },
    applyDelta: (records, pending, withdrawn, notices, sync) => {
      // Dropped first, so a record the same delta brings again stays.
      for (const key of withdrawn) {
        replica.delete(key);
        pendingView.delete(key);
      }

      for (const record of records) {
        replica.set(record.k, record);
      }

      // The engine withdraws each key that leaves its pending view, when catch-up ends too.
      for (const record of pending) {
        pendingView.set(record.k, record);
      }

      show(notices, sync);
    },
    setRejection: (rejection) => {
      $rejections.set(withRecent($rejections.get(), rejection.id, rejection));
    },
    setRollOutcome: (outcome) => {
      $rollOutcomes.set(withRecent($rollOutcomes.get(), outcome.id, outcome));
    },
    setPresetResult: (result) => {
      $presetResults.set(withRecent($presetResults.get(), result.id, result));
    },
    setSnapshotResult: (result) => {
      $snapshotResults.set(withRecent($snapshotResults.get(), result.id, result));
    },
    setWipeResult: (result) => {
      $wipeResults.set(withRecent($wipeResults.get(), result.id, result));
    },
    setRoomCopy: (roomCopy) => {
      $roomCopy.set(roomCopy);
    },
    setOpenRequest: (request) => {
      $openRequest.set(request);
    },
    setParty: (party) => {
      // Every delta carries the party, so an unchanged one keeps its value and wakes no view.
      if (JSON.stringify(party) !== JSON.stringify($party.get())) {
        $party.set(party);
      }
    },
  };
}

// A player's pending view holds only its proposals, of `row:` and `rep:` keys (AD-4). Each is read
// against the record the engine has applied to its key.
export function pendingEntries(
  replica: ReadonlyMap<string, VersionedRecord>,
  pendingView: ReadonlyMap<string, VersionedRecord>,
): Map<string, PendingEntry> {
  const entries = new Map<string, PendingEntry>();

  for (const [key, record] of pendingView) {
    const applied = replica.get(key);

    if (key.startsWith('rep:')) {
      const after = repDataSchema.safeParse(record.d);
      const before = repDataSchema.safeParse(applied?.d);

      if (!after.success) {
        entries.set(key, { kind: 'remove', fields: new Map(), record, applied });
      } else if (!before.success) {
        entries.set(key, { kind: 'add', fields: new Map(), record, applied });
      } else {
        const fields = changedFields(before.data.cells, after.data.cells);

        entries.set(key, { kind: 'edit', fields, record, applied });
      }
    } else if (key.startsWith('row:')) {
      const after = fieldValuesSchema.safeParse(record.d).data ?? {};
      const before = fieldValuesSchema.safeParse(applied?.d).data ?? {};

      entries.set(key, { kind: 'edit', fields: changedFields(before, after), record, applied });
    }
  }

  return entries;
}

// Field values are JSON scalars, so `!==` compares them.
function changedFields(
  before: Readonly<FieldValues>,
  after: Readonly<FieldValues>,
): Map<string, FieldValue | null> {
  const fields = new Map<string, FieldValue | null>();

  for (const fieldId of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[fieldId] !== after[fieldId]) {
      fields.set(fieldId, after[fieldId] ?? null);
    }
  }

  return fields;
}

// A copy with `value` set, holding the newest entries only. A map keeps insertion order, so the
// first key is the oldest.
function withRecent<Value>(
  map: ReadonlyMap<string, Value>,
  id: string,
  value: Value,
): ReadonlyMap<string, Value> {
  const next = new Map(map);

  next.set(id, value);

  for (const key of next.keys()) {
    if (next.size <= RECENT_REPLY_LIMIT) {
      break;
    }

    next.delete(key);
  }

  return next;
}
