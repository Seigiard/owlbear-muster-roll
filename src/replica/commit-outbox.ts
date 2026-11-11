import type { JsonValue } from '@/core/json';
import { jsonByteLength, splitBatch } from '@/core/message-size';
import { mergeRecords } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import { commitEnvelope, SYNC_CHANNEL, type EditId } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { BroadcastOptions } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';

const REMOTE: BroadcastOptions = { destination: 'REMOTE' };

// One held record with the acks of its key, as a part measures it.
type CommitItem = [VersionedRecord, EditId[]];

export type CommitOutbox = {
  // Holds the records until the send queue takes the next commit. `acks` are the `(k, c, a)` of
  // player proposals these records answer; each goes with the record of its key.
  add: (records: readonly VersionedRecord[], acks?: readonly EditId[]) => void;
  // Hands every held record to the queue at once, for a page that is about to close.
  flush: () => void;
  // Sends nothing more, not even a commit already waiting in the queue.
  stop: () => void;
  // AD-9: forgets every held record and ack, so a commit waiting in the queue sends nothing. The
  // queue composes it with the generation of the moment it sends, which a replaced room changed.
  drop: () => void;
  // True while a record is held here or a commit is in the send queue and not yet sent.
  hasUnsent: () => boolean;
};

// AD-12: pending commits are coalesced by key. A record waits here, not in the queue, so a newer
// record of its key replaces it until the queue takes the commit. A record the queue has already
// taken is not recalled. AD-4: an ack stays with its key, so a commit whose record a newer GM edit
// replaced still echoes the player's `(k, c, a)` and clears the player's entry.
export function createCommitOutbox(
  sendQueue: SendQueue,
  generation: () => Generation,
): CommitOutbox {
  const held = new Map<string, VersionedRecord>();
  const heldAcks = new Map<string, EditId[]>();
  let scheduled = false;
  let stopped = false;
  // Commit sends the queue has not settled yet.
  let unsentSends = 0;

  function track(send: Promise<void>): void {
    unsentSends += 1;
    send
      .catch((error) => {
        console.error('Muster Roll could not send a commit', error);
      })
      .finally(() => {
        unsentSends -= 1;
      });
  }

  // One message of held records, which leave the outbox, or `null` when none is held.
  function nextChunk(): JsonValue | null {
    const envelope = commitEnvelope(generation());
    // Measured with the `acks` key, which a part that answers proposals adds.
    const envelopeBytes = jsonByteLength({ ...envelope, acks: [] });

    const items: CommitItem[] = [];
    // The acks of a key that do not fit one message with its record. The record goes again with
    // them in a later part, as a record merges any number of times.
    const leftover = new Map<string, EditId[]>();

    for (const record of held.values()) {
      const keyAcks = heldAcks.get(record.k) ?? [];
      const fitting = fittingAcks(record, keyAcks, envelopeBytes);

      // A record passes the one-message check before it is applied, so this means a broken one.
      if (fitting === null) {
        console.error('Muster Roll dropped a commit record too large for one message', record.k);
        held.delete(record.k);
        heldAcks.delete(record.k);
        continue;
      }

      items.push([record, keyAcks.slice(0, fitting)]);

      if (fitting < keyAcks.length) {
        leftover.set(record.k, keyAcks.slice(fitting));
      }
    }

    // Measured with the acks of each record's key, so a part with its acks stays under the limit.
    const split = splitBatch(items, envelopeBytes);
    const first = split.ok ? (split.value[0] ?? []) : [];
    const records = first.map(([record]) => record);
    const acks = first.flatMap(([, keyAcks]) => keyAcks);

    for (const record of records) {
      const rest = leftover.get(record.k);

      if (rest === undefined) {
        held.delete(record.k);
        heldAcks.delete(record.k);
      } else {
        heldAcks.set(record.k, rest);
      }
    }

    if (records.length === 0) {
      return null;
    }

    return acks.length === 0 ? { ...envelope, records } : { ...envelope, records, acks };
  }

  // Records over the limit of one message wait for the next take.
  function take(): JsonValue | null {
    scheduled = false;

    if (stopped) {
      return null;
    }

    const message = nextChunk();

    if (held.size > 0) {
      schedule();
    }

    return message;
  }

  function schedule(): void {
    if (scheduled || stopped) {
      return;
    }

    scheduled = true;
    track(sendQueue.enqueueComposed(SYNC_CHANNEL, take, REMOTE));
  }

  return {
    add: (records, acks = []) => {
      if (records.length === 0 || stopped) {
        return;
      }

      for (const record of records) {
        const current = held.get(record.k);

        held.set(record.k, current === undefined ? record : mergeRecords(current, record));
      }

      for (const ack of acks) {
        // An ack with no record of its key here would never go out.
        if (held.has(ack.k)) {
          heldAcks.set(ack.k, withAck(heldAcks.get(ack.k) ?? [], ack));
        }
      }

      schedule();
    },
    flush: () => {
      for (let message = nextChunk(); message !== null; message = nextChunk()) {
        track(sendQueue.enqueue(SYNC_CHANNEL, message, REMOTE));
      }
    },
    stop: () => {
      stopped = true;
      held.clear();
      heldAcks.clear();
    },
    drop: () => {
      held.clear();
      heldAcks.clear();
    },
    hasUnsent: () => held.size > 0 || unsentSends > 0,
  };
}

// One ack per author of a key: a player's entry clears only on the echo of its newest version, so an
// older one from the same author is never needed again.
function withAck(keyAcks: readonly EditId[], ack: EditId): EditId[] {
  const known = keyAcks.find((held) => held.a === ack.a);

  if (known === undefined) {
    return [...keyAcks, ack];
  }

  return known.c < ack.c ? keyAcks.map((held) => (held === known ? ack : held)) : [...keyAcks];
}

// How many of the acks fit one message with the record, the first ones first, or `null` when the
// record alone does not fit.
function fittingAcks(
  record: VersionedRecord,
  acks: readonly EditId[],
  envelopeBytes: number,
): number | null {
  for (let count = acks.length; count >= 0; count -= 1) {
    const item: CommitItem = [record, acks.slice(0, count)];

    if (splitBatch([item], envelopeBytes).ok) {
      return count;
    }
  }

  return null;
}
