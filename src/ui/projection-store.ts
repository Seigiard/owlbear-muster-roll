import { atom, type ReadableAtom } from 'nanostores';

import type { PartyEntry } from '@/core/access';
import { assembleRecords, compareVersions, mergeRecords } from '@/core/merge';
import {
  blockDataSchema,
  cellValues,
  repDataSchema,
  type FieldValue,
  type FieldValues,
  type VersionedRecord,
} from '@/core/records';
import { ROOM_METADATA_BYTE_LIMIT } from '@/core/snapshot';
import type { Notice, RoomCopyStatus, SyncState, WireOpenSheetRequest } from '@/core/ui-messages';

// What a player's edit that waits for a GM's check does to its key (AD-4): a new repeat block, a
// change of field values, or a repeat block's removal.
export type PendingKind = 'add' | 'edit' | 'remove';

export type PendingEntry = {
  kind: PendingKind;
  // The fields an `edit` changes over the applied record, each with its pending value, `null` for a
  // cleared one. An `add` and a `remove` name none, as their mark is the row's. An `edit` can name
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
  // False until the first full projection, so an empty room is not mistaken for one still loading.
  $loaded: ReadableAtom<boolean>;
  $sync: ReadableAtom<SyncState>;
  // AD-8: the room copy as Settings shows it.
  $roomCopy: ReadableAtom<RoomCopyStatus>;
  // FR14: the last sheet or repeat block "Открыть лист" asked this window to show, or `null` before
  // any. The window tells a new request from one it has taken by its id.
  $openRequest: ReadableAtom<WireOpenSheetRequest | null>;
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
  setRoomCopy: (roomCopy: RoomCopyStatus) => void;
  setOpenRequest: (request: WireOpenSheetRequest) => void;
  setParty: (party: readonly PartyEntry[]) => void;
};

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
  const $loaded = atom(false);
  const $sync = atom<SyncState>(UNKNOWN_SYNC);
  const $roomCopy = atom<RoomCopyStatus>(UNKNOWN_ROOM_COPY);
  const $openRequest = atom<WireOpenSheetRequest | null>(null);
  const $party = atom<readonly PartyEntry[]>([]);
  let replica = new Map<string, VersionedRecord>();
  let pendingView = new Map<string, VersionedRecord>();

  function show(notices: readonly Notice[], sync: SyncState): void {
    const shown = new Map(replica);

    for (const [key, record] of pendingView) {
      const applied = replica.get(key);
      shown.set(key, pendingDisplayRecord(applied, record, sync.role !== 'GM'));
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
    $loaded,
    $sync,
    $roomCopy,
    $openRequest,
    $party,
    replaceAll: (records, pending, notices, sync) => {
      replica = assembleRecords(records);
      // A live GM engine sends none. A player's holds its edits that wait for a GM (AD-4).
      pendingView = assembleRecords(pending);
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
        const previous = replica.get(record.k);
        replica.set(record.k, previous === undefined ? record : mergeRecords(previous, record));
      }

      // The engine withdraws each key that leaves its pending view, when catch-up ends too.
      for (const record of pending) {
        const previous = pendingView.get(record.k);
        pendingView.set(
          record.k,
          previous === undefined || compareVersions(previous, record) !== 0
            ? record
            : mergeRecords(previous, record),
        );
      }

      show(notices, sync);
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

// A player's pending view holds only its proposed block fragments (AD-4). Each is read against the
// record the engine has applied to its key.
export function pendingEntries(
  replica: ReadonlyMap<string, VersionedRecord>,
  pendingView: ReadonlyMap<string, VersionedRecord>,
): Map<string, PendingEntry> {
  const entries = new Map<string, PendingEntry>();

  for (const [key, record] of pendingView) {
    const applied = replica.get(key);
    const shown = pendingDisplayRecord(applied, record, true);

    if (key.startsWith('blk:') && key.split(':').length > 2) {
      const after = repDataSchema.safeParse(record.d);
      const before = repDataSchema.safeParse(applied?.d);

      if (!after.success) {
        entries.set(key, { kind: 'remove', fields: new Map(), record: shown, applied });
      } else if (!before.success) {
        entries.set(key, { kind: 'add', fields: new Map(), record: shown, applied });
      } else {
        const fields = pendingFields(cellValues(after.data.cells), Object.keys(after.data.cells));

        entries.set(key, { kind: 'edit', fields, record: shown, applied });
      }
    } else if (key.startsWith('blk:')) {
      const rawAfter = blockDataSchema.safeParse(record.d).data?.cells ?? {};
      const after = cellValues(rawAfter);

      entries.set(key, {
        kind: 'edit',
        fields: pendingFields(after, Object.keys(rawAfter)),
        record: shown,
        applied,
      });
    }
  }

  return entries;
}

function pendingDisplayRecord(
  applied: VersionedRecord | undefined,
  pending: VersionedRecord,
  overlayPendingFields = false,
): VersionedRecord {
  if (!pending.k.startsWith('blk:') || applied === undefined) {
    return pending;
  }

  const merged = mergeRecords(applied, pending);

  if (!overlayPendingFields) {
    return merged;
  }

  const mergedData = blockDataSchema.safeParse(merged.d);
  const pendingData = blockDataSchema.safeParse(pending.d);

  if (!mergedData.success || !pendingData.success) {
    return merged;
  }

  // SAFETY: both block-data parses above prove the merged record carries block data; mergeRecords preserves the shared key and metadata.
  return {
    ...merged,
    d: {
      ...mergedData.data,
      cells: { ...mergedData.data.cells, ...pendingData.data.cells },
    },
  } as VersionedRecord;
}

function pendingFields(
  after: Readonly<FieldValues>,
  fieldIds: readonly string[],
): Map<string, FieldValue | null> {
  const fields = new Map<string, FieldValue | null>();

  for (const fieldId of fieldIds) {
    fields.set(fieldId, after[fieldId] ?? null);
  }

  return fields;
}
