import { useStore } from '@nanostores/react';
import { useEffect, useId, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { accessRows, aclKey, canEdit, shownName, type AccessRow } from '@/core/access';
import type { VersionedRecord } from '@/core/records';
import { ACCESS_CHANGE_TIMEOUT_MS } from '@/core/timing';
import { copy } from '@/ui/copy';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

type AccessPanelProps = {
  // The id the "Доступ" chip names in `aria-controls`.
  id: string;
  sheetId: string;
  // This client's own player id, which gets no row.
  ownPlayerId: string;
  store: Pick<ProjectionStore, '$records' | '$party' | '$rejections'>;
  sendCommand: ReplicaClient['sendCommand'];
  // `Esc` in the panel. The header closes it and gives the focus back to the chip.
  onClose: () => void;
};

// The latest change sent for one player. `before` is the version of the `acl:` record when it went,
// so only a record written after it can answer it. Its command id ties a rejection to it.
type SentChange = { on: boolean; commandId: string; before: string; sentAt: number };

// UX-DR12: inline under the character header. One row per player id with "Может править". A change
// goes at once. The guest note always shows.
export function AccessPanel({
  id,
  sheetId,
  ownPlayerId,
  store,
  sendCommand,
  onClose,
}: AccessPanelProps): ReactNode {
  const records = useStore(store.$records);
  const party = useStore(store.$party);
  const rejections = useStore(store.$rejections);

  const rows = useMemo(
    () => accessRows(party, records.values(), sheetId, ownPlayerId),
    [party, records, sheetId, ownPlayerId],
  );

  // By player id, so the checkbox shows the new state before the records bring it back.
  const [sent, setSent] = useState<ReadonlyMap<string, SentChange>>(new Map());
  // A change was refused, could not be sent, or got no answer.
  const [failed, setFailed] = useState(false);

  // A change ends when a rejection names its own command id, or when an `acl:` record written after
  // it shows its state. An earlier change of the same player answers nothing, so its record does
  // not end a later one.
  const refused = [...sent].filter(([, change]) => rejections.has(change.commandId));

  const answered = [...sent].filter(
    ([playerId, change]) =>
      versionOf(records.get(aclKey(sheetId, playerId))) !== change.before &&
      canEdit(records, sheetId, playerId) === change.on,
  );

  if (refused.length > 0 || answered.length > 0) {
    const next = new Map(sent);

    for (const [playerId] of [...refused, ...answered]) {
      next.delete(playerId);
    }

    setSent(next);

    if (refused.length > 0) {
      setFailed(true);
    }
  }

  // A change that is not answered in time is dropped, so the checkbox shows the records again.
  useEffect(() => {
    const timers = [...sent].map(([playerId, change]) =>
      setTimeout(
        () => {
          setSent((current) => {
            if (current.get(playerId)?.commandId !== change.commandId) {
              return current;
            }

            const next = new Map(current);

            next.delete(playerId);

            return next;
          });
          setFailed(true);
        },
        Math.max(0, change.sentAt + ACCESS_CHANGE_TIMEOUT_MS - Date.now()),
      ),
    );

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [sent]);

  function change(row: AccessRow, on: boolean): void {
    const result = sendCommand({
      type: 'acl-set',
      sheetId,
      playerId: row.playerId,
      // An unknown name is stored as "", never as the id.
      name: row.name ?? '',
      on,
    });

    if (!result.ok) {
      setFailed(true);

      return;
    }

    setFailed(false);

    const before = versionOf(records.get(aclKey(sheetId, row.playerId)));

    setSent((current) =>
      new Map(current).set(row.playerId, {
        on,
        commandId: result.value,
        before,
        sentAt: Date.now(),
      }),
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <section
      id={id}
      aria-label={copy.place.access}
      className="mb-3 flex flex-col gap-2 rounded-md border border-line bg-surface-bar p-2 text-body text-text"
      onKeyDown={handleKeyDown}
    >
      {rows.length === 0 ? (
        <p>{copy.noPlayers}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <AccessRowItem
              key={row.playerId}
              row={row}
              checked={sent.get(row.playerId)?.on ?? row.canEdit}
              onChange={(on) => {
                change(row, on);
              }}
            />
          ))}
        </ul>
      )}
      <p role="status" className="text-label-sm text-danger-text">
        {failed ? copy.aclFailed : ''}
      </p>
      <p className="text-label-sm text-text-muted">{copy.guestNote}</p>
    </section>
  );
}

type AccessRowItemProps = { row: AccessRow; checked: boolean; onChange: (on: boolean) => void };

// The group and the checkbox both take the player's name, so each "Может править" says whose it is.
function AccessRowItem({ row, checked, onChange }: AccessRowItemProps): ReactNode {
  const nameId = useId();
  const name = shownName(row);

  return (
    <li>
      <div
        role="group"
        aria-labelledby={nameId}
        className="flex flex-wrap items-center justify-between gap-x-3"
      >
        <span id={nameId} className="min-w-[0] [overflow-wrap:anywhere]">
          {name}
        </span>
        <label className="touch-target inline-flex shrink-0 items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            aria-label={copy.label.mayEditFor(name)}
            checked={checked}
            onChange={(event) => {
              onChange(event.target.checked);
            }}
          />
          {copy.label.mayEdit}
        </label>
      </div>
    </li>
  );
}

// A record's version as one string, or "" for no record.
function versionOf(record: VersionedRecord | undefined): string {
  return record === undefined ? '' : `${record.c}:${record.a}`;
}
