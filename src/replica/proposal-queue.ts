import { acceptedFieldValue } from '@/core/field-patch';
import {
  blockIdOf,
  blockKeyOf,
  childAddress,
  parentOf,
  parseBlockKey,
  scopePathOf,
  sectionIdOf,
  type BlockAddress,
} from '@/core/block-address';
import { sameJson } from '@/core/json';
import type { Version } from '@/core/merge';
import type { TemplateLayout } from '@/core/preset';
import { keptCells, templateScopes, type PresetMoves } from '@/core/preset-migrate';
import {
  blockDataSchema,
  versionCells,
  type FieldValue,
  type RepData,
  type Lifecycle,
  type VersionedRecord,
} from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { sameEditId, type EditId } from '@/core/room-messages';
import type { Timing } from '@/core/timing';

// What a player's edit of one key does, kept so it can be applied again to a newer record. `fields`
// sets or clears (`null`) field values of a row or a repeat block. `add` is a new repeat block with
// its order and cells. `remove` is a repeat block's removal, `d: null`.
export type ProposalPatch =
  | { kind: 'fields'; values: Readonly<Record<string, FieldValue | null>> }
  | { kind: 'add'; d: RepData }
  | { kind: 'remove' };

// AD-4: one entry per key. `record` is the newest version, the only one sent, or `null` while the
// entry waits for a `c` because it was made during catch-up (AD-7). `sent` says a version went out,
// so an older one can still land in the room.
export type ProposalEntry = {
  k: string;
  l?: Lifecycle;
  patch: ProposalPatch;
  record: VersionedRecord | null;
  sent: boolean;
};

// `gone`: an edit of a repeat block that is removed or unknown. `unchanged`: the record already
// holds what the patch sets. `too-large`: the record would not fit one message, so no GM could
// answer it.
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
  // Replaces the entry of its key and sends it on the running backoff, not at once.
  hold: (entry: ProposalEntry) => void;
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
    hold: (entry) => {
      entries.set(entry.k, entry);

      if (entry.record === null) {
        stopResend(entry.k);
      } else if (!resends.has(entry.k)) {
        armResend(entry.k, timing.proposeResendStartMs);
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
    return {
      kind: 'add',
      d: { ...older.d, cells: { ...older.d.cells, ...versionCells(newer.values, 1, 'pending') } },
    };
  }

  if (older.kind === 'fields') {
    return { kind: 'fields', values: { ...older.values, ...newer.values } };
  }

  return newer;
}

// AD-4: the record the patch makes of `base`, the newest record of its key that the player knows,
// with a version from `mint`, which runs only on success. A patch that changes nothing fails with
// `unchanged` unless `force` is set: a version of the entry already went out, and the base's data
// must still win over it. An edit of a removed repeat block fails with `gone`, and the removal of
// one with `unchanged`.
export function proposedRecord(
  key: string,
  patch: ProposalPatch,
  base: VersionedRecord | undefined,
  mint: () => Version,
  force = false,
  lifecycle?: Lifecycle,
): Result<VersionedRecord, ProposalFailure> {
  if (patch.kind === 'remove') {
    if (base !== undefined && base.d === null) return err('unchanged');
    const version = mint();

    return ok({ k: key, d: null, l: base?.l ?? lifecycle ?? [version.c, version.a], ...version });
  }

  if (base !== undefined && base.d === null) {
    return err('gone');
  }

  const instance = blockDataSchema.safeParse(base?.d).data;

  if (patch.kind === 'add') {
    if (!force && instance !== undefined && sameJson(instance, patch.d)) return err('unchanged');
    const version = mint();

    return ok({
      k: key,
      ...version,
      l: base?.l ?? lifecycle ?? [version.c, version.a],
      d: {
        ...patch.d,
        cells: Object.fromEntries(
          Object.entries(patch.d.cells).map(([id, [value]]) => [id, [value, version.c, version.a]]),
        ),
      },
    });
  }

  const parsedKey = parseBlockKey(key);

  if (instance === undefined && (parsedKey === null || parsedKey.path.length !== 0)) {
    return err('gone');
  }

  if (
    !force &&
    Object.entries(patch.values).every(
      ([id, value]) => (instance?.cells[id]?.[0] ?? null) === value,
    )
  )
    return err('unchanged');
  const version = mint();

  return ok({
    k: key,
    ...version,
    l: base?.l ?? [version.c, version.a],
    d: { ...(instance ?? { order: 0 }), cells: versionCells(patch.values, version.c, version.a) },
  });
}

// AD-14: the patch with only the fields the template has in the row or repeat block of `key`, each
// value of its field's type or a clear. The same patch when nothing goes, and `null` when nothing
// is left: a row or repeat section the template no longer has, or field values that all went.
export function strippedPatch(
  key: string,
  patch: ProposalPatch,
  template: TemplateLayout,
): ProposalPatch | null {
  const parsed = parseBlockKey(key);
  const scopes = templateScopes(template);

  const fields =
    parsed === null || parsed.path.length === 0
      ? [...scopes.rowFields.values()].map((entry) => entry.field)
      : (scopes.sectionsByPath.get(scopePathKey(parsed)) ?? null);

  if (fields === null) {
    return null;
  }

  if (patch.kind === 'remove') {
    return patch;
  }

  if (patch.kind === 'add') {
    const cells = keptCells(patch.d.cells, fields);

    return sameJson(cells, patch.d.cells) ? patch : { kind: 'add', d: { ...patch.d, cells } };
  }

  const entries = Object.entries(patch.values).filter(([fieldId, value]) => {
    const field = fields.find((cell) => cell.id === fieldId);

    return field !== undefined && acceptedFieldValue(field, value).ok;
  });

  if (entries.length === 0) {
    return null;
  }

  return entries.length === Object.keys(patch.values).length
    ? patch
    : { kind: 'fields', values: Object.fromEntries(entries) };
}

// AD-14: the patch of `key` under the keys a new preset gives it. A row's field values go to the
// new rows that hold their ids, so one patch can split; a value with no new row goes. A repeat
// block's patch, a removal too, goes to the new section of its section. Empty when nothing maps.
export function movedPatches(
  key: string,
  patch: ProposalPatch,
  moves: PresetMoves,
): { k: string; patch: ProposalPatch }[] {
  const parsed = parseBlockKey(key);

  if (parsed !== null && parsed.path.length > 0) {
    const sectionId = sectionIdOf(parsed);
    const instanceId = blockIdOf(parsed);
    const parent = parentOf(parsed);
    const target = sectionId === null ? null : moves.sectionOf(sectionId, parsed);

    return target === null || instanceId === null || parent === null
      ? []
      : [
          {
            k: blockKeyOf(childAddress(parent, target, instanceId)),
            patch,
          },
        ];
  }

  if (patch.kind !== 'fields') {
    return [{ k: key, patch }];
  }

  const byRow = new Map<string, Record<string, FieldValue | null>>();

  for (const [fieldId, value] of Object.entries(patch.values)) {
    const rowId = moves.rowOf(fieldId);

    if (rowId !== null) {
      byRow.set(rowId, { ...byRow.get(rowId), [fieldId]: value });
    }
  }

  const values: Record<string, FieldValue | null> = {};

  for (const fields of byRow.values()) Object.assign(values, fields);

  return Object.keys(values).length === 0
    ? []
    : [{ k: parsed === null ? key : blockKeyOf(parsed), patch: { kind: 'fields', values } }];
}

function scopePathKey(block: BlockAddress): string {
  return scopePathOf(block).join(':');
}

function scheduleWithTimer(run: () => void, delay: number): () => void {
  const timer = setTimeout(run, delay);

  return () => {
    clearTimeout(timer);
  };
}
