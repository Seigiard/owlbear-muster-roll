import { atom, type ReadableAtom } from 'nanostores';

import type { VersionedRecord } from '@/core/records';
import type { CommandRejectedMessage, Notice } from '@/core/ui-messages';

export type ProjectionStore = {
  $records: ReadableAtom<ReadonlyMap<string, VersionedRecord>>;
  $notices: ReadableAtom<readonly Notice[]>;
  // Recent rejections by command id, so two that land before one render both stay readable.
  $rejections: ReadableAtom<ReadonlyMap<string, CommandRejectedMessage>>;
  // False until the first full projection, so an empty room is not mistaken for one still loading.
  $loaded: ReadableAtom<boolean>;
  replaceAll: (records: readonly VersionedRecord[], notices: readonly Notice[]) => void;
  applyDelta: (records: readonly VersionedRecord[], notices: readonly Notice[]) => void;
  setRejection: (rejection: CommandRejectedMessage) => void;
};

// Far more than the commands one window has on their way at once.
const REJECTION_LIMIT = 256;

// The engine orders messages by sequence, so a window replaces records and never compares versions.
export function createProjectionStore(): ProjectionStore {
  const $records = atom<ReadonlyMap<string, VersionedRecord>>(new Map());
  const $notices = atom<readonly Notice[]>([]);
  const $rejections = atom<ReadonlyMap<string, CommandRejectedMessage>>(new Map());
  const $loaded = atom(false);

  return {
    $records,
    $notices,
    $rejections,
    $loaded,
    replaceAll: (records, notices) => {
      $records.set(new Map(records.map((record) => [record.k, record])));
      $notices.set(notices);
      $loaded.set(true);
    },
    applyDelta: (records, notices) => {
      const next = new Map($records.get());

      for (const record of records) {
        next.set(record.k, record);
      }

      $records.set(next);
      $notices.set(notices);
    },
    setRejection: (rejection) => {
      const next = new Map($rejections.get());

      next.set(rejection.id, rejection);

      // A map keeps insertion order, so the first key is the oldest.
      for (const id of next.keys()) {
        if (next.size <= REJECTION_LIMIT) {
          break;
        }

        next.delete(id);
      }

      $rejections.set(next);
    },
  };
}
