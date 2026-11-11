import { sameJson } from '@/core/json';
import type { Version } from '@/core/merge';
import {
  fieldValuesSchema,
  repDataSchema,
  type FieldValue,
  type FieldValues,
  type RepData,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { sameEditId, type EditId } from '@/core/room-messages';
import type { Timing } from '@/core/timing';

// What a player's edit of one key does, kept so it can be applied again to a newer record. `fields`
// sets or clears (`null`) field values of a row or a repeat row. `add` is a new repeat row with its
// order and cells. `remove` is a repeat row's removal, `d: null`.
export type ProposalPatch =
  | { kind: 'fields'; values: Readonly<Record<string, FieldValue | null>> }
  | { kind: 'add'; d: RepData }
  | { kind: 'remove' };

// AD-4: one entry per key. `record` is the newest version, the only one sent, or `null` while the
// entry waits for a `c` because it was made during catch-up (AD-7). `sent` says a version went out,
// so an older one can still land in the room.
export type ProposalEntry = {
  k: string;
  patch: ProposalPatch;
  record: VersionedRecord | null;
  sent: boolean;
};

// `gone`: an edit of a repeat row that is removed or unknown. `unchanged`: the record already holds
// what the patch sets. `too-large`: the record would not fit one message, so no GM could answer it.
export type ProposalFailure = 'gone' | 'unchanged' | 'too-large';

export type ProposalQueueOptions = {
  timing: Pick<Timing, 'proposeResendStartMs' | 'proposeResendMaxMs'>;
  // Puts one `propose` of the key in the send queue. `compose` runs when the queue takes it and
  // gives the entry's newest version, or `null` when there is none to send any more. Settles when
  // the send queue is done with it.
  enqueue: (compose: () => VersionedRecord | null) => Promise<void>;
  // Runs `run` after `delay` and returns what cancels it. Tests inject it to read the backoff.
  schedule?: (run: () => void, delay: number) => () => void;
};

export type ProposalQueue = {
  get: (key: string) => ProposalEntry | undefined;
  entries: () => ProposalEntry[];
  // Adds or replaces the entry of its key. A minted one is sent at once, and resent with a backoff
  // that starts again.
  put: (entry: ProposalEntry) => void;
  drop: (key: string) => void;
  clear: () => void;
  // The entry whose newest version is this `(k, c, a)`.
  matching: (edit: EditId) => ProposalEntry | undefined;
  // Sends every minted entry at once and starts each backoff again, as when a GM comes back.
  resendAll: () => void;
};

type Resend = { cancel: () => void; delay: number };

export function createProposalQueue(options: ProposalQueueOptions): ProposalQueue {
  const { timing, enqueue, schedule = scheduleWithTimer } = options;
  const entries = new Map<string, ProposalEntry>();
  const resends = new Map<string, Resend>();
  // Keys with a `propose` in the send queue that has not been composed yet, by the token of that
  // send. A newer version folds into it, so only the newest one goes out. A send whose token is no
  // longer the key's, after a drop or a clear, composes nothing.
  const queued = new Map<string, number>();
  let lastToken = 0;

  function sendNow(key: string): void {
    if (queued.has(key)) {
      return;
    }

    lastToken += 1;

    const token = lastToken;
    let composed = false;

    // A send the queue settles without composing, as a stopped queue does, frees the key.
    const release = (): void => {
      if (!composed && queued.get(key) === token) {
        queued.delete(key);
      }
    };

    queued.set(key, token);
    enqueue(() => {
      composed = true;

      if (queued.get(key) !== token) {
        return null;
      }

      queued.delete(key);

      const entry = entries.get(key);

      if (entry === undefined || entry.record === null) {
        return null;
      }

      entry.sent = true;

      return entry.record;
    }).then(release, (error: Error) => {
      release();
      console.error('Muster Roll could not propose an edit', error);
    });
  }

  function stopResend(key: string): void {
    resends.get(key)?.cancel();
    resends.delete(key);
  }

  // The first resend waits the start delay, and each later one twice the last, up to the max.
  function armResend(key: string, delay: number): void {
    stopResend(key);
    resends.set(key, {
      delay,
      cancel: schedule(() => {
        const entry = entries.get(key);

        if (entry === undefined || entry.record === null) {
          resends.delete(key);

          return;
        }

        sendNow(key);
        armResend(key, Math.min(delay * 2, timing.proposeResendMaxMs));
      }, delay),
    });
  }

  function propose(key: string): void {
    sendNow(key);
    armResend(key, timing.proposeResendStartMs);
  }

  return {
    get: (key) => entries.get(key),
    entries: () => [...entries.values()],
    put: (entry) => {
      entries.set(entry.k, entry);

      if (entry.record === null) {
        stopResend(entry.k);
      } else {
        propose(entry.k);
      }
    },
    drop: (key) => {
      entries.delete(key);
      queued.delete(key);
      stopResend(key);
    },
    clear: () => {
      for (const key of resends.keys()) {
        stopResend(key);
      }

      entries.clear();
      queued.clear();
    },
    matching: (edit) => {
      const entry = entries.get(edit.k);

      return entry !== undefined && entry.record !== null && sameEditId(entry.record, edit)
        ? entry
        : undefined;
    },
    resendAll: () => {
      for (const entry of entries.values()) {
        if (entry.record !== null) {
          propose(entry.k);
        }
      }
    },
  };
}

// A newer edit of a key folds into the patch it already has. A removal replaces anything. Fields go
// into an add's cells, so the new row keeps them, or over the older fields.
export function combinePatches(older: ProposalPatch, newer: ProposalPatch): ProposalPatch {
  if (newer.kind !== 'fields') {
    return newer;
  }

  if (older.kind === 'add') {
    return { kind: 'add', d: { ...older.d, cells: withValues(older.d.cells, newer.values) } };
  }

  if (older.kind === 'fields') {
    return { kind: 'fields', values: { ...older.values, ...newer.values } };
  }

  return newer;
}

// AD-4: the record the patch makes of `base`, the newest record of its key that the player knows,
// with a version from `mint`, which runs only on success. A patch that changes nothing fails with
// `unchanged` unless `force` is set: a version of the entry already went out, and the base's data
// must still win over it. An edit of a removed repeat row fails with `gone`, and the removal of one
// with `unchanged`.
export function proposedRecord(
  key: string,
  patch: ProposalPatch,
  base: VersionedRecord | undefined,
  mint: () => Version,
  force = false,
): Result<VersionedRecord, ProposalFailure> {
  if (patch.kind === 'remove') {
    return base !== undefined && base.d === null
      ? err('unchanged')
      : ok({ k: key, d: null, ...mint() });
  }

  if (key.startsWith('row:')) {
    const before = fieldValuesSchema.safeParse(base?.d).data ?? {};

    // A row has no add, so its patch is always fields.
    const after = patch.kind === 'fields' ? withValues(before, patch.values) : before;

    return !force && sameJson(before, after)
      ? err('unchanged')
      : ok({ k: key, d: after, ...mint() });
  }

  if (base !== undefined && base.d === null) {
    return err('gone');
  }

  const instance = base === undefined ? undefined : repDataSchema.safeParse(base.d).data;

  if (patch.kind === 'add') {
    return !force && instance !== undefined && sameJson(instance, patch.d)
      ? err('unchanged')
      : ok({ k: key, d: patch.d, ...mint() });
  }

  if (instance === undefined) {
    return err('gone');
  }

  const after: RepData = { ...instance, cells: withValues(instance.cells, patch.values) };

  return !force && sameJson(instance, after)
    ? err('unchanged')
    : ok({ k: key, d: after, ...mint() });
}

function withValues(
  values: Readonly<FieldValues>,
  patch: Readonly<Record<string, FieldValue | null>>,
): FieldValues {
  const next: FieldValues = { ...values };

  for (const [fieldId, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[fieldId];
    } else {
      next[fieldId] = value;
    }
  }

  return next;
}

function scheduleWithTimer(run: () => void, delay: number): () => void {
  const timer = setTimeout(run, delay);

  return () => {
    clearTimeout(timer);
  };
}
