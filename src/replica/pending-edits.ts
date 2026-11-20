import { playerMayEdit, proposalAllowed, type ProposalContext } from '@/core/access';
import { parseBlockKey, sectionIdOf } from '@/core/block-address';
import { createComposers } from '@/core/compose';
import { createFragmentAssembler, GM_FRAGMENT_ASSEMBLER_LIMITS } from '@/core/fragment-assembler';
import { counterAbove, mergeRecords, type Version } from '@/core/merge';
import { recordFitsOneMessage } from '@/core/message-size';
import { repeatTabById, type Preset, type Template } from '@/core/preset';
import { presetMoves, stripToTemplate, type PresetMoves } from '@/core/preset-migrate';
import { dependentSheetId, resolveSheet } from '@/core/sheets';
import { blockDataSchema, type VersionedRecord } from '@/core/records';
import { Result } from 'better-result';
import { type EditId, type RejectMessage } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import { type Command, type RejectionReason } from '@/core/ui-messages';
import type { FailureReporter } from '@/replica/failures';
import {
  combineCommands,
  createProposalQueue,
  movedCommands,
  strippedCommands,
  type ProposalEntry,
  type ProposalCommand,
  type ProposalFailure,
  type ProposalQueueOptions,
} from '@/replica/proposal-queue';

type InternalPlayerEditCommand = ProposalCommand;

export type PlayerEditCommand = ProposalCommand;

export type DenialCause = 'gone' | 'too-large' | 'denied';

export type Denial = { notify: false } | { notify: true; cause?: DenialCause };

type PendingEditsOptions = {
  timing: Pick<Timing, 'proposeResendStartMs' | 'proposeResendMaxMs' | 'editDeniedQuietMs'>;
  playerId: string;
  connectionId: string;
  records: () => ReadonlyMap<string, VersionedRecord>;
  catchingUp: () => boolean;
  presetOf: (record: VersionedRecord | undefined) => Preset | null;
  compose: (
    view: ReadonlyMap<string, VersionedRecord>,
    command: Command,
  ) => Result<VersionedRecord[], RejectionReason>;
  mint: (key: string, highestKnownCounter: number) => Version;
  now: () => number;
  enqueue: ProposalQueueOptions['enqueue'];
  signal: AbortSignal;
  schedule: ProposalQueueOptions['schedule'];
  report?: FailureReporter;
};

export type PendingEdits = {
  edit: (
    command: Command,
    view: ReadonlyMap<string, VersionedRecord>,
  ) => Result<Denial, RejectionReason>;
  overlay: (view: Map<string, VersionedRecord>) => void;
  answered: (edits: readonly EditId[]) => boolean;
  rejected: (message: RejectMessage) => (Denial & { merge: VersionedRecord | null }) | null;
  caughtUp: () => Denial;
  recordsChanged: (presetBefore: VersionedRecord | undefined) => Denial;
  gmBack: () => void;
  size: () => number;
  drain: () => PlayerEditCommand[];
  clear: () => void;
};

export function createPendingEdits(options: PendingEditsOptions): PendingEdits {
  const { records, catchingUp, presetOf, compose, mint, now } = options;
  const proposalComposers = createComposers(options.connectionId);

  const proposals = createProposalQueue({
    timing: options.timing,
    enqueue: options.enqueue,
    schedule: options.schedule,
    signal: options.signal,
    report: options.report,
  });

  const staleRejects = createFragmentAssembler({
    ...GM_FRAGMENT_ASSEMBLER_LIMITS,
    maxParts: Infinity,
  });

  let lastDeniedAt = Number.NEGATIVE_INFINITY;

  const contextOf = (view: ReadonlyMap<string, VersionedRecord>): ProposalContext =>
    proposalContext(view, presetOf);

  // AD-4: a player's edit of a field or a repeat block becomes the entry of its key in the proposal
  // queue. It is checked now against what the windows show, with the checks a GM client runs that
  // read no version, so a refusal comes at once. Made during catch-up, it waits for its `c`.
  function edit(
    command: Command,
    view: ReadonlyMap<string, VersionedRecord>,
  ): Result<Denial, RejectionReason> {
    if (!isPlayerEdit(command)) {
      return Result.err('not-allowed');
    }

    // No access refuses before the field is checked, so a read-only sheet says why.
    const policy = resolveSheet(view, presetOf(view.get('preset')), command.sheetId);

    if (policy === null || !playerMayEdit(policy, view, options.playerId)) {
      return Result.err('not-allowed');
    }

    if (
      (command.type === 'repeat-block-add' || command.type === 'repeat-block-delete') &&
      repeatTabById(policy.template, sectionIdOf(command.block) ?? '') !== null
    ) {
      return Result.err('not-allowed');
    }

    const composed = compose(view, command);

    if (!composed.isOk()) {
      return Result.err(composed.error);
    }

    const [record] = composed.value;

    if (record === undefined || !proposalAllowed(contextOf(view), options.playerId, record)) {
      return Result.err('not-allowed');
    }

    const existing = proposals.get(record.k);

    const entry: ProposalEntry = {
      k: record.k,
      l: existing?.l ?? record.l,
      commands: existing === undefined ? [command] : combineCommands(existing.commands, command),
      record: existing?.record ?? null,
      sent: existing?.sent ?? false,
    };

    if (catchingUp()) {
      // AD-7: no version goes out until catch-up ends, the older one included.
      proposals.put({ ...entry, record: null });
    } else {
      // The row was removed by a commit the windows do not show yet, or the edit grew too large.
      const failure = proposeEntry(entry, records().get(entry.k), entry.sent);

      return Result.ok(denial(deniesEdit(failure)));
    }

    return Result.ok({ notify: false });
  }

  function overlay(view: Map<string, VersionedRecord>): void {
    // Built over the newest record of its key, so a GM edit of other fields that came after the
    // entry's version still shows. A sent version keeps its own `(c, a)`.
    for (const entry of proposals.entries()) {
      const shown = waitingRecord(entry, view.get(entry.k));

      if (shown !== null) {
        const base = blockDataSchema.safeParse(view.get(entry.k)?.d).data;
        const data = blockDataSchema.safeParse(shown.d).data;

        view.set(
          entry.k,
          data === undefined
            ? shown
            : {
                ...shown,
                l: shown.l ?? [shown.c, shown.a],
                d: { ...data, cells: { ...base?.cells, ...data.cells } },
              },
        );
      }
    }
  }

  // AD-4: a player's entry clears on an ack or a record that names its own `(k, c, a)`. A commit of
  // an older version of the key leaves it. Returns whether any entry cleared.
  function answered(edits: readonly EditId[]): boolean {
    let cleared = false;

    for (const editId of edits) {
      const entry = proposals.matching(editId);

      if (entry !== undefined) {
        proposals.drop(entry.k);
        cleared = true;
      }
    }

    return cleared;
  }

  // AD-4: only a rejection of this client's newest version of a key counts. `denied` drops the
  // entry, so the value returns. `stale` applies the patch to the GM's record, takes a `c` above it
  // and proposes again with the backoff started over; an edit of a row the GM holds removed is
  // dropped as denied, and a patch the record already holds ends there. A stale answer over a
  // record below the rejected version is about a field the GM's template lacks, not the version:
  // the GM would answer the same at once, so the new version waits for the running backoff, and the
  // preset that reaches one side in the meantime ends it.
  function rejected(message: RejectMessage): (Denial & { merge: VersionedRecord | null }) | null {
    const complete = completeStaleReject(message);

    if (complete === null) {
      return null;
    }

    message = complete;
    const entry = proposals.matching(message);

    if (entry === undefined) {
      return null;
    }

    if (message.reason === 'denied' || message.current === undefined) {
      proposals.drop(entry.k);

      return {
        ...denial(message.reason === 'denied' ? 'denied' : 'gone'),
        merge: null,
      };
    }

    const known = records().get(entry.k);
    const base = known === undefined ? message.current : mergeRecords(known, message.current);

    if (catchingUp()) {
      // AD-7: no version goes out until catch-up ends, which takes the entry's `c` over what it
      // brought, the GM's record merged below included.
      proposals.put({ ...entry, record: null });
    } else {
      const failure = proposeEntry(
        entry,
        base,
        false,
        entry.record !== null && counterAbove(entry.record, message.current),
      );

      const cause = deniesEdit(failure);

      if (cause !== null) {
        // The GM holds a `c` at least as high as this entry's, so no older version of it can win, and
        // a patch the GM's record already holds needs nothing more.
        return { ...denial(cause), merge: message.current };
      }
    }

    return { notify: false, merge: message.current };
  }

  // AD-7: the edits made during catch-up take their `c` now, over the records it brought, and only
  // then are proposed. One that the player may no longer make, or that edits a removed row, is
  // dropped with the notification.
  function caughtUp(): Denial {
    let cause: DenialCause | null = null;

    for (const entry of proposals.entries()) {
      if (entry.record !== null) {
        continue;
      }

      const base = records().get(entry.k);
      const made = rebuiltRecord(entry, base, entry.sent);

      if (made.isOk() && proposalAllowed(contextOf(records()), options.playerId, made.value)) {
        proposals.put({ ...entry, record: made.value });
      } else {
        proposals.drop(entry.k);
        const nextCause = !made.isOk() ? recheckFailureCause(entry.k, made.error) : 'denied';
        cause ??= nextCause;
      }
    }

    return denial(cause);
  }

  // UX-DR29: once the records change, an entry the player may no longer make waits for no GM: its
  // access was revoked, its sheet deleted or hidden, or the repeat block it edits removed. It is
  // checked against the replica after the whole batch, so a revoke and a re-grant in one batch drop
  // nothing. The values return in the same delta, and one notification covers every drop. A removal
  // of a repeat block that is gone already got what it asked for, so it drops with no notification.
  // AD-14: after a preset change each entry first moves to the keys the new form of its sheet's
  // template gives its values, as the GM's migration moves the rows: an entry with nothing that
  // maps drops in silence.
  function recordsChanged(presetBefore: VersionedRecord | undefined): Denial {
    const currentRecords = records();
    const context = contextOf(currentRecords);
    const before = presetBefore === currentRecords.get('preset') ? null : presetOf(presetBefore);
    let cause: DenialCause | null = null;

    for (const found of proposals.entries()) {
      const moves =
        before === null || context.preset === null
          ? null
          : templateMoves(currentRecords, before, context.preset, found.k);

      const parts = moves === null ? null : movedCommands(found.k, found.commands, moves);

      if (
        parts !== null &&
        parts.length === 1 &&
        parts[0]?.k === found.k &&
        onlyRowTargetsMoved(found.commands, parts[0].commands)
      ) {
        const nextCause = recheckProposal(
          { ...found, commands: parts[0].commands },
          context,
          false,
          true,
        );

        cause ??= nextCause;
        continue;
      }

      if (parts === null || (parts.length === 1 && parts[0]?.k === found.k)) {
        const nextCause = recheckProposal(found, context, false);
        cause ??= nextCause;
        continue;
      }

      proposals.drop(found.k);

      for (const part of parts) {
        const existing = proposals.get(part.k);

        const commands =
          existing === undefined
            ? part.commands
            : part.commands.reduce(
                (combined, command) => combineCommands(combined, command),
                existing.commands,
              );

        const entry: ProposalEntry = {
          k: part.k,
          l: existing?.l ?? found.l,
          commands,
          record: found.record === null ? null : (existing?.record ?? found.record),
          sent: existing?.sent ?? false,
        };

        const nextCause = recheckProposal(entry, context, true);
        cause ??= nextCause;
      }
    }

    return denial(cause);
  }

  function gmBack(): void {
    proposals.resendAll();
  }

  function drain(): PlayerEditCommand[] {
    const commands = proposals.entries().flatMap((entry) => entry.commands);

    proposals.clear();
    staleRejects.clear();

    return commands;
  }

  function clear(): void {
    proposals.clear();
    staleRejects.clear();
  }

  function completeStaleReject(message: RejectMessage): RejectMessage | null {
    if (
      message.reason !== 'stale' ||
      message.current === undefined ||
      message.i === undefined ||
      message.n === undefined ||
      message.n === 1
    ) {
      return message;
    }

    const key = JSON.stringify([message.k, message.c, message.a]);

    const outcome = staleRejects.add(
      key,
      { i: message.i, n: message.n, record: message.current },
      now(),
    );

    let current: VersionedRecord;

    switch (outcome.kind) {
      case 'complete':
        current = outcome.record;
        break;
      case 'waiting':
      case 'ignored':
      case 'dropped':
        return null;
      default: {
        const exhaustive: never = outcome;

        return exhaustive;
      }
    }

    const { i: _i, n: _n, current: _fragment, ...withoutFragment } = message;

    return { ...withoutFragment, current };
  }

  // The newest version of an entry over `base`, the newest record of its key this client knows,
  // with `c` above every one it knows of the key, its own included, put into the queue and sent.
  // `force` sends a patch that changes nothing on `base`: after a version of the entry went out, an
  // edit back to the base's data must still beat it. Returns why nothing went out. `held`: the new
  // version goes out on the entry's running backoff, not at once.
  function proposeEntry(
    entry: ProposalEntry,
    base: VersionedRecord | undefined,
    force: boolean,
    held = false,
  ): ProposalFailure | null {
    const made = rebuiltRecord(entry, base, force);

    if (!made.isOk()) {
      proposals.drop(entry.k);

      return made.error;
    }

    if (held) {
      proposals.hold({ ...entry, record: made.value });
    } else {
      proposals.put({ ...entry, record: made.value });
    }

    return null;
  }

  function rebuiltRecord(
    entry: ProposalEntry,
    base: VersionedRecord | undefined,
    force: boolean,
    mintVersion = true,
    fixedVersion?: Version,
  ): Result<VersionedRecord, ProposalFailure> {
    const preset = presetOf(records().get('preset'));
    const template = templateOfKey(records(), preset, entry.k);

    const commands =
      template === null ? entry.commands : strippedCommands(entry.k, entry.commands, template);

    if (commands === null || commands.length === 0) {
      return Result.err('unchanged');
    }

    const view = new Map(records());

    for (const pending of proposals.entries()) {
      if (pending.k !== entry.k && pending.record !== null) {
        view.set(pending.k, pending.record);
      }
    }

    if (base !== undefined) {
      view.set(entry.k, base);
    } else {
      view.delete(entry.k);
    }

    const made = proposalComposers.composePending(
      {
        records: view,
        mint: mintVersion
          ? mint
          : (_key, highestKnownCounter) => ({
              c: highestKnownCounter + 1,
              a: options.connectionId,
            }),
        newRecordId: (_kind, role) => role,
        isGmPlayer: () => false,
        mode: 'pending',
      },
      entry.k,
      commands,
      entry.record,
      force,
      fixedVersion,
      entry.l,
    );

    if (!made.isOk()) {
      return Result.err(proposalFailure(made.error));
    }

    const stripped = strippedProposal(made.value);

    return recordFitsOneMessage(stripped) ? Result.ok(stripped) : Result.err('too-large');
  }

  // AD-14: a player's version keeps no value the template of its sheet no longer has in its row or
  // repeat block, so a value an older preset left in the base never goes out with it.
  function strippedProposal(record: VersionedRecord): VersionedRecord {
    const template = templateOfKey(records(), presetOf(records().get('preset')), record.k);

    return template === null ? record : stripToTemplate(record, template);
  }

  function waitingRecord(
    entry: ProposalEntry,
    base: VersionedRecord | undefined,
  ): VersionedRecord | null {
    const version = entry.record ?? {
      c: (base?.c ?? 0) + 1,
      a: options.connectionId,
    };

    const made = rebuiltRecord(entry, base, true, false, version);

    return made.isOk() ? made.value : null;
  }

  // AD-14: the entry loses the fields its sheet's template no longer has in its row or repeat
  // block, in silence. An entry with nothing left drops in silence too, and one that lost fields or
  // moved goes out again, so the GM never answers its older version. True when a drop needs the
  // denied notification.
  function recheckProposal(
    found: ProposalEntry,
    context: ProposalContext,
    moved: boolean,
    preserveRecord = false,
  ): DenialCause | null {
    const template = templateOfKey(records(), context.preset, found.k);

    const commands =
      template === null ? found.commands : strippedCommands(found.k, found.commands, template);

    if (commands === null || commands.length === 0) {
      proposals.drop(found.k);

      return null;
    }

    const unchangedCommands =
      commands.length === found.commands.length &&
      commands.every((command, index) => command === found.commands[index]);

    const entry = unchangedCommands ? found : { ...found, commands };

    const made = rebuiltRecord(entry, records().get(entry.k), true, false);

    if (!made.isOk() || !proposalAllowed(context, options.playerId, made.value)) {
      proposals.drop(entry.k);

      if (!made.isOk()) {
        return recheckFailureCause(found.k, made.error);
      }

      return 'denied';
    }

    if (entry === found && !moved) {
      if (preserveRecord) {
        proposals.hold(entry);
      }

      return null;
    }

    if (preserveRecord && entry.record !== null) {
      proposals.hold(entry);

      return null;
    }

    if (entry.record === null) {
      proposals.put(entry);

      return null;
    }

    return deniesEdit(proposeEntry(entry, records().get(entry.k), entry.sent));
  }

  // UX-DR29: one notification for `denied` answers that arrive close together, such as one revoke
  // refusing several keys. Only a shown one starts the quiet window, so a steady trickle of denials
  // still shows one notification per window.
  function denial(cause: DenialCause | null): Denial {
    if (cause === null) {
      return { notify: false };
    }

    const current = now();

    if (current - lastDeniedAt < options.timing.editDeniedQuietMs) {
      return { notify: false };
    }

    lastDeniedAt = current;

    return { notify: true, cause };
  }

  return {
    edit,
    overlay,
    answered,
    rejected,
    caughtUp,
    recordsChanged,
    gmBack,
    size: () => proposals.entries().length,
    drain,
    clear,
  };
}

function proposalContext(
  records: ReadonlyMap<string, VersionedRecord>,
  presetOf: PendingEditsOptions['presetOf'],
): ProposalContext {
  return { records, preset: presetOf(records.get('preset')) };
}

// A failure that ends the edit with a notice: its edit cannot go to a GM client at all. The cause
// picks the text, "Правка слишком большая" for too-large and "Нет прав на правку" otherwise.
function deniesEdit(failure: ProposalFailure | null): DenialCause | null {
  if (failure === 'gone' || failure === 'too-large') {
    return failure;
  }

  return null;
}

function recheckFailureCause(key: string, failure: ProposalFailure): DenialCause | null {
  if (failure !== 'gone') {
    return deniesEdit(failure);
  }

  return parseBlockKey(key)?.path.length === 0 ? 'denied' : 'gone';
}

function onlyRowTargetsMoved(
  before: readonly ProposalCommand[],
  after: readonly ProposalCommand[],
): boolean {
  if (before.length === 0 || before.length !== after.length) {
    return false;
  }

  let moved = false;

  return (
    before.every((previous, index) => {
      const next = after[index];

      if (
        previous.type !== 'field-patch' ||
        next?.type !== 'field-patch' ||
        previous.sheetId !== next.sheetId ||
        previous.fieldId !== next.fieldId ||
        previous.value !== next.value ||
        previous.target.kind !== 'row' ||
        next.target.kind !== 'row'
      ) {
        return false;
      }

      moved ||= previous.target.rowId !== next.target.rowId;

      return true;
    }) && moved
  );
}

// AD-14: where a block's values go when its sheet's template changes from its form in `before` to
// its form in `after`. A template matches by its `id` and repeat status. `null` when either preset
// has no template for the sheet, or the template changed its id or repeat status.
function templateMoves(
  records: ReadonlyMap<string, VersionedRecord>,
  before: Preset,
  after: Preset,
  key: string,
): PresetMoves | null {
  const old = templateOfKey(records, before, key);
  const current = templateOfKey(records, after, key);

  return old === null ||
    current === null ||
    old.id !== current.id ||
    (old.repeat !== undefined) !== (current.repeat !== undefined)
    ? null
    : presetMoves(old, current);
}

// AD-18: the template of the sheet a block key belongs to, or `null` when no template owns it.
function templateOfKey(
  records: ReadonlyMap<string, VersionedRecord>,
  preset: Preset | null,
  key: string,
): Template | null {
  const sheetId = dependentSheetId(key, { d: null });

  return sheetId === null ? null : (resolveSheet(records, preset, sheetId)?.template ?? null);
}

function isPlayerEdit(command: Command): command is InternalPlayerEditCommand {
  return (
    command.type === 'field-patch' ||
    command.type === 'repeat-block-add' ||
    command.type === 'repeat-block-delete'
  );
}

function proposalFailure(reason: RejectionReason): ProposalFailure {
  switch (reason) {
    case 'too-large':
      return 'too-large';
    case 'unchanged':
      return 'unchanged';
    case 'unknown-instance':
    case 'deleted-sheet':
    case 'unknown-sheet':
    case 'unknown-section':
      return 'gone';
    default:
      return 'gone';
  }
}
