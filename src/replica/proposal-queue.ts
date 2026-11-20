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
import type { PendingCommand } from '@/core/compose';
import type { Version } from '@/core/merge';
import type { Template } from '@/core/preset';
import { templateScopes, type PresetMoves } from '@/core/preset-migrate';
import type { Lifecycle, VersionedRecord } from '@/core/records';
import { sameEditId, type EditId } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import { ProposeDroppedFailure, type FailureReporter } from '@/replica/failures';
import type { Schedule } from '@/platform/ports';

export type ProposalCommand = PendingCommand;

// AD-4: one entry per key. `record` is the fixed newest wire version, or `null` during catch-up
// (AD-7). `order` reserves an accepted repeat add's order across replay; `l` preserves its life.
// `sent` says an older version can still land in the room.
export type ProposalEntry = {
  k: string;
  l?: Lifecycle;
  order?: number;
  // Commands represented by the current wire record. Once sent, later commands stay separate
  // until this exact version is answered.
  commands: ProposalCommand[];
  laterCommands?: ProposalCommand[];
  viewVersion?: Version;
  record: VersionedRecord | null;
  sent: boolean;
};

// `gone`: replay was refused for a reason other than unchanged or too-large. `unchanged`: the
// record already holds what the commands set. `too-large`: the record cannot fit one message.
export type ProposalFailure = 'gone' | 'unchanged' | 'too-large';

export type ProposalQueueOptions = {
  timing: Pick<Timing, 'proposeResendStartMs' | 'proposeResendMaxMs'>;
  // Puts one `propose` of the key in the send queue. `compose` runs when the queue takes it and
  // gives the entry's newest version, or `null` when there is none to send any more. Settles when
  // the send queue is done with it.
  enqueue: (compose: () => VersionedRecord | null) => Promise<void>;
  // Runs `run` after `delay` and returns what cancels it. Tests inject it to read the backoff.
  signal: AbortSignal;
  schedule: Schedule;
  report?: FailureReporter;
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
  const { timing, enqueue, schedule, signal } = options;
  const report = options.report ?? (() => undefined);
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
      report(new ProposeDroppedFailure({ key, reason: String(error) }));
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
      cancel: schedule(signal, delay, () => {
        const entry = entries.get(key);

        if (entry === undefined || entry.record === null) {
          resends.delete(key);

          return;
        }

        sendNow(key);
        armResend(key, Math.min(delay * 2, timing.proposeResendMaxMs));
      }),
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

// A newer edit of a key replaces an older command for the same field. A delete replaces everything
// before it, and fields stay after a pending repeat-block add.
export function combineCommands(
  older: readonly ProposalCommand[],
  newer: ProposalCommand,
): ProposalCommand[] {
  if (newer.type === 'repeat-block-delete') {
    return [newer];
  }

  const commands =
    newer.type === 'repeat-block-add'
      ? [newer, ...older.filter((command) => command.type === 'field-patch')]
      : older.filter((command) => command.type !== 'repeat-block-delete');

  if (newer.type !== 'field-patch') {
    return commands;
  }

  const previous = commands.findIndex(
    (command) => command.type === 'field-patch' && command.fieldId === newer.fieldId,
  );

  if (previous < 0) {
    return [...commands, newer];
  }

  return commands.map((command, index) => (index === previous ? newer : command));
}

// AD-14: commands that still target fields and repeat scopes in the current template. Root field
// commands also take the row id their field now belongs to.
export function strippedCommands(
  key: string,
  commands: readonly ProposalCommand[],
  template: Template,
): ProposalCommand[] | null {
  const parsed = parseBlockKey(key);
  const scopes = templateScopes(template);

  if (parsed === null) {
    return null;
  }

  const root = parsed.path.length === 0;

  const fields = root
    ? [...scopes.rowFields.values()].map((entry) => entry.field)
    : (scopes.sectionsByPath.get(scopePathKey(parsed)) ?? null);

  if (fields === null) {
    return null;
  }

  const kept: ProposalCommand[] = [];

  for (const command of commands) {
    if (command.type === 'repeat-block-add' || command.type === 'repeat-block-delete') {
      if (blockKeyOf(command.block) === key && !root) kept.push(command);
      continue;
    }

    if (command.type !== 'field-patch') {
      continue;
    }

    const field = fields.find((candidate) => candidate.id === command.fieldId);

    if (field === undefined || !acceptedFieldValue(field, command.value).isOk()) {
      continue;
    }

    if (!root || command.target.kind !== 'row') {
      kept.push(command);
      continue;
    }

    const rowId = scopes.rowFields.get(command.fieldId)?.rowId;

    if (rowId !== undefined) {
      kept.push(
        command.target.kind === 'row' && command.target.rowId === rowId
          ? command
          : { ...command, target: { kind: 'row', rowId } },
      );
    }
  }

  return kept.length === 0 ? null : kept;
}

// AD-14: retarget commands to the keys and rows the new template assigns them. A field removed by
// the preset has no destination.
export function movedCommands(
  key: string,
  commands: readonly ProposalCommand[],
  moves: PresetMoves,
): { k: string; commands: ProposalCommand[] }[] {
  const parsed = parseBlockKey(key);

  if (parsed !== null && parsed.path.length > 0) {
    const sectionId = sectionIdOf(parsed);
    const instanceId = blockIdOf(parsed);
    const parent = parentOf(parsed);
    const target = sectionId === null ? null : moves.sectionOf(sectionId, parsed);

    if (target === null || instanceId === null || parent === null) {
      return [];
    }

    const block = childAddress(parent, target, instanceId);
    const moved: ProposalCommand[] = [];

    for (const command of commands) {
      if (command.type === 'field-patch' && command.target.kind === 'rep') {
        moved.push({ ...command, target: { kind: 'rep', block } });
        continue;
      }

      if (command.type === 'repeat-block-add' || command.type === 'repeat-block-delete') {
        moved.push({ ...command, block });
        continue;
      }

      moved.push(command);
    }

    return moved.length === 0
      ? []
      : [
          {
            k: blockKeyOf(block),
            commands: moved,
          },
        ];
  }

  const moved: ProposalCommand[] = [];

  for (const command of commands) {
    if (command.type !== 'field-patch') {
      moved.push(command);
      continue;
    }

    const rowId = moves.rowOf(command.fieldId);

    if (rowId !== null) {
      moved.push({ ...command, target: { kind: 'row', rowId } });
    }
  }

  return moved.length === 0 ? [] : [{ k: key, commands: moved }];
}

function scopePathKey(block: BlockAddress): string {
  return scopePathOf(block).join(':');
}
