import { atom, type ReadableAtom } from 'nanostores';

import type { VersionedRecord } from '@/core/records';
import type { CommandRejectedMessage, Notice } from '@/core/ui-messages';

export type ProjectionStore = {
  $records: ReadableAtom<ReadonlyMap<string, VersionedRecord>>;
  $notices: ReadableAtom<readonly Notice[]>;
  $rejection: ReadableAtom<CommandRejectedMessage | null>;
  // False until the first full projection, so an empty room is not mistaken for one still loading.
  $loaded: ReadableAtom<boolean>;
  replaceAll: (records: readonly VersionedRecord[], notices: readonly Notice[]) => void;
  applyDelta: (records: readonly VersionedRecord[], notices: readonly Notice[]) => void;
  setRejection: (rejection: CommandRejectedMessage) => void;
};

// The engine orders messages by sequence, so a window replaces records and never compares versions.
export function createProjectionStore(): ProjectionStore {
  const $records = atom<ReadonlyMap<string, VersionedRecord>>(new Map());
  const $notices = atom<readonly Notice[]>([]);
  const $rejection = atom<CommandRejectedMessage | null>(null);
  const $loaded = atom(false);

  return {
    $records,
    $notices,
    $rejection,
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
      $rejection.set(rejection);
    },
  };
}
