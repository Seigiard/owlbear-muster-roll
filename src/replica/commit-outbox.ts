import type { JsonValue } from '@/core/json';
import { jsonByteLength, splitBatch } from '@/core/message-size';
import { mergeRecords } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import { commitEnvelope, SYNC_CHANNEL } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { BroadcastOptions } from '@/platform/ports';
import type { SendQueue } from '@/platform/send-queue';

const REMOTE: BroadcastOptions = { destination: 'REMOTE' };

export type CommitOutbox = {
  // Holds the records until the send queue takes the next commit.
  add: (records: readonly VersionedRecord[]) => void;
  // Hands every held record to the queue at once, for a page that is about to close.
  flush: () => void;
  // Sends nothing more, not even a commit already waiting in the queue.
  stop: () => void;
};

// AD-12: pending commits are coalesced by key. A record waits here, not in the queue, so a newer
// record of its key replaces it until the queue takes the commit. A record the queue has already
// taken is not recalled.
export function createCommitOutbox(
  sendQueue: SendQueue,
  generation: () => Generation,
): CommitOutbox {
  const held = new Map<string, VersionedRecord>();
  let scheduled = false;
  let stopped = false;

  // One message of held records, which leave the outbox, or `null` when none is held.
  function nextChunk(): JsonValue | null {
    const envelope = commitEnvelope(generation());
    const envelopeBytes = jsonByteLength(envelope);

    // A record passes the one-message check before it is applied, so this means a broken record.
    for (const record of held.values()) {
      if (!splitBatch([record], envelopeBytes).ok) {
        console.error('Muster Roll dropped a commit record too large for one message', record.k);
        held.delete(record.k);
      }
    }

    const split = splitBatch([...held.values()], envelopeBytes);
    const first = split.ok ? (split.value[0] ?? []) : [];

    for (const record of first) {
      held.delete(record.k);
    }

    return first.length === 0 ? null : { ...envelope, records: first };
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
    sendQueue.enqueueComposed(SYNC_CHANNEL, take, REMOTE).catch((error) => {
      console.error('Muster Roll could not send a commit', error);
    });
  }

  return {
    add: (records) => {
      if (records.length === 0 || stopped) {
        return;
      }

      for (const record of records) {
        const current = held.get(record.k);

        held.set(record.k, current === undefined ? record : mergeRecords(current, record));
      }

      schedule();
    },
    flush: () => {
      for (let message = nextChunk(); message !== null; message = nextChunk()) {
        sendQueue.enqueue(SYNC_CHANNEL, message, REMOTE).catch((error) => {
          console.error('Muster Roll could not send a commit', error);
        });
      }
    },
    stop: () => {
      stopped = true;
      held.clear();
    },
  };
}
