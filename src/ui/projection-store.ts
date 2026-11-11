import { atom, type ReadableAtom } from 'nanostores';

import type { VersionedRecord } from '@/core/records';
import { ROOM_METADATA_BYTE_LIMIT } from '@/core/snapshot';
import type {
  CommandRejectedMessage,
  Notice,
  RollOutcomeMessage,
  RoomCopyStatus,
  SyncState,
} from '@/core/ui-messages';

export type ProjectionStore = {
  // The replica as the window shows it: the pending view stands in for the records of its keys.
  $records: ReadableAtom<ReadonlyMap<string, VersionedRecord>>;
  $notices: ReadableAtom<readonly Notice[]>;
  // Recent rejections by command id, so two that land before one render both stay readable.
  $rejections: ReadableAtom<ReadonlyMap<string, CommandRejectedMessage>>;
  // Recent outcomes of this window's roll requests, by request id.
  $rollOutcomes: ReadableAtom<ReadonlyMap<string, RollOutcomeMessage>>;
  // False until the first full projection, so an empty room is not mistaken for one still loading.
  $loaded: ReadableAtom<boolean>;
  $sync: ReadableAtom<SyncState>;
  // AD-8: the room copy as Settings shows it.
  $roomCopy: ReadableAtom<RoomCopyStatus>;
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
  setRoomCopy: (roomCopy: RoomCopyStatus) => void;
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
  const $notices = atom<readonly Notice[]>([]);
  const $rejections = atom<ReadonlyMap<string, CommandRejectedMessage>>(new Map());
  const $rollOutcomes = atom<ReadonlyMap<string, RollOutcomeMessage>>(new Map());
  const $loaded = atom(false);
  const $sync = atom<SyncState>(UNKNOWN_SYNC);
  const $roomCopy = atom<RoomCopyStatus>(UNKNOWN_ROOM_COPY);
  let replica = new Map<string, VersionedRecord>();
  let pendingView = new Map<string, VersionedRecord>();

  function show(notices: readonly Notice[], sync: SyncState): void {
    const shown = new Map(replica);

    for (const [key, record] of pendingView) {
      shown.set(key, record);
    }

    $records.set(shown);
    $notices.set(notices);
    $sync.set(sync);
  }

  return {
    $records,
    $notices,
    $rejections,
    $rollOutcomes,
    $loaded,
    $sync,
    $roomCopy,
    replaceAll: (records, pending, notices, sync) => {
      replica = new Map(records.map((record) => [record.k, record]));
      // A live engine has no pending view.
      pendingView =
        sync.state === 'live' ? new Map() : new Map(pending.map((record) => [record.k, record]));
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

      // The engine drops its pending view when catch-up ends, and so does the window.
      if (sync.state === 'live') {
        pendingView = new Map();
      } else {
        for (const record of pending) {
          pendingView.set(record.k, record);
        }
      }

      show(notices, sync);
    },
    setRejection: (rejection) => {
      $rejections.set(withRecent($rejections.get(), rejection.id, rejection));
    },
    setRollOutcome: (outcome) => {
      $rollOutcomes.set(withRecent($rollOutcomes.get(), outcome.id, outcome));
    },
    setRoomCopy: (roomCopy) => {
      $roomCopy.set(roomCopy);
    },
  };
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
