import { playerMayEdit, proposalAllowed, type ProposalContext } from '@/core/access';
import { parseBlockKey, sectionIdOf, type BlockAddress } from '@/core/block-address';
import { createFragmentAssembler, GM_FRAGMENT_ASSEMBLER_LIMITS } from '@/core/fragment-assembler';
import { counterAbove, mergeRecords, type Version } from '@/core/merge';
import { recordFitsOneMessage } from '@/core/message-size';
import { plainRowIdOf, repeatTabById, type Preset, type Template } from '@/core/preset';
import { presetMoves, stripToTemplate, type PresetMoves } from '@/core/preset-migrate';
import { dependentSheetId, resolveSheet } from '@/core/sheets';
import {
  blockDataSchema,
  cellValues,
  repDataSchema,
  type FieldValue,
  type VersionedRecord,
} from '@/core/records';
import { Result } from 'better-result';
import { type EditId, type RejectMessage } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import { type Command, type RejectionReason } from '@/core/ui-messages';
import {
  combinePatches,
  createProposalQueue,
  movedPatches,
  proposedRecord,
  strippedPatch,
  type ProposalEntry,
  type ProposalFailure,
  type ProposalPatch,
  type ProposalQueueOptions,
} from '@/replica/proposal-queue';

type InternalPlayerEditCommand = Extract<
  Command,
  { type: 'field-patch' | 'repeat-block-add' | 'repeat-block-delete' }
>;

export type PlayerEditCommand =
  | Extract<Command, { type: 'field-patch' }>
  | Extract<Command, { type: 'repeat-block-add' }>
  | Extract<Command, { type: 'repeat-block-delete' }>;

type FieldPatchCommandTarget = Extract<Command, { type: 'field-patch' }>['target'];

export type Denial = { notify: boolean };

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
  schedule?: ProposalQueueOptions['schedule'];
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

  const proposals = createProposalQueue({
    timing: options.timing,
    enqueue: options.enqueue,
    schedule: options.schedule,
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

    const patch = patchOf(command, record);
    const existing = proposals.get(record.k);

    const entry: ProposalEntry = {
      k: record.k,
      l: existing?.l ?? record.l,
      patch: existing === undefined ? patch : combinePatches(existing.patch, patch),
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

      return { ...denial(true), merge: null };
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

      if (deniesEdit(failure)) {
        // The GM holds a `c` at least as high as this entry's, so no older version of it can win, and
        // a patch the GM's record already holds needs nothing more.
        return { ...denial(true), merge: message.current };
      }
    }

    return { notify: false, merge: message.current };
  }

  // AD-7: the edits made during catch-up take their `c` now, over the records it brought, and only
  // then are proposed. One that the player may no longer make, or that edits a removed row, is
  // dropped with the notification.
  function caughtUp(): Denial {
    let denied = false;

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
        denied ||= !made.isOk() ? deniesEdit(made.error) : true;
      }
    }

    return denial(denied);
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
    let denied = false;

    for (const found of proposals.entries()) {
      const moves =
        before === null || context.preset === null
          ? null
          : templateMoves(currentRecords, before, context.preset, found.k);

      const parts = moves === null ? null : movedPatches(found.k, found.patch, moves);

      if (parts === null || (parts.length === 1 && parts[0]?.k === found.k)) {
        denied = recheckProposal(found, context, false) || denied;
        continue;
      }

      proposals.drop(found.k);

      for (const part of parts) {
        const existing = proposals.get(part.k);

        const patch =
          existing === undefined ? part.patch : combinePatches(part.patch, existing.patch);

        const entry: ProposalEntry = {
          k: part.k,
          l: existing?.l ?? found.l,
          patch,
          record: found.record === null ? null : (existing?.record ?? found.record),
          sent: existing?.sent ?? false,
        };

        denied = recheckProposal(entry, context, true) || denied;
      }
    }

    return denial(denied);
  }

  function gmBack(): void {
    proposals.resendAll();
  }

  function drain(): PlayerEditCommand[] {
    const commands = proposals
      .entries()
      .flatMap((entry) =>
        commandsOf(entry, templateOfKey(records(), presetOf(records().get('preset')), entry.k)),
      );

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
  ): Result<VersionedRecord, ProposalFailure> {
    const highest = Math.max(base?.c ?? 0, entry.record?.c ?? 0);

    const made = proposedRecord(
      entry.k,
      entry.patch,
      base,
      () => mint(entry.k, highest),
      force,
      entry.l,
    );

    if (!made.isOk()) {
      return made;
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
    const made = proposedRecord(
      entry.k,
      entry.patch,
      base,
      () =>
        entry.record === null
          ? { c: (base?.c ?? 0) + 1, a: options.connectionId }
          : { c: entry.record.c, a: entry.record.a },
      true,
      entry.l,
    );

    return made.isOk() ? strippedProposal(made.value) : null;
  }

  // AD-14: the entry loses the fields its sheet's template no longer has in its row or repeat
  // block, in silence. An entry with nothing left drops in silence too, and one that lost fields or
  // moved goes out again, so the GM never answers its older version. True when a drop needs the
  // denied notification.
  function recheckProposal(
    found: ProposalEntry,
    context: ProposalContext,
    moved: boolean,
  ): boolean {
    const template = templateOfKey(records(), context.preset, found.k);
    const patch = template === null ? found.patch : strippedPatch(found.k, found.patch, template);

    if (patch === null) {
      proposals.drop(found.k);

      return false;
    }

    const entry = patch === found.patch ? found : { ...found, patch };

    // The version is a placeholder: no check of `proposalAllowed` reads it.
    const made = proposedRecord(
      entry.k,
      entry.patch,
      records().get(entry.k),
      () => ({ c: 1, a: options.connectionId }),
      true,
    );

    if (!made.isOk() || !proposalAllowed(context, options.playerId, made.value)) {
      proposals.drop(entry.k);

      return made.isOk() || deniesEdit(made.error);
    }

    if (entry === found && !moved) {
      return false;
    }

    if (entry.record === null) {
      proposals.put(entry);

      return false;
    }

    return deniesEdit(proposeEntry(entry, records().get(entry.k), entry.sent));
  }

  // UX-DR29: one notification for `denied` answers that arrive close together, such as one revoke
  // refusing several keys. Only a shown one starts the quiet window, so a steady trickle of denials
  // still shows one notification per window.
  function denial(required: boolean): Denial {
    if (!required) {
      return { notify: false };
    }

    const current = now();

    if (current - lastDeniedAt < options.timing.editDeniedQuietMs) {
      return { notify: false };
    }

    lastDeniedAt = current;

    return { notify: true };
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

// A failure the player hears of as "Нет прав на правку": its edit cannot go to a GM client at all.
function deniesEdit(failure: ProposalFailure | null): boolean {
  return failure === 'gone' || failure === 'too-large';
}

// The patch an edit makes, read from the record it composed: a field's value as the composer
// accepted it, a new repeat block with its order and cells, or a removal.
function patchOf(command: InternalPlayerEditCommand, record: VersionedRecord): ProposalPatch {
  if (command.type === 'repeat-block-delete') {
    return { kind: 'remove' };
  }

  const block = repDataSchema.parse(record.d);

  if (command.type === 'repeat-block-add') {
    return { kind: 'add', d: block };
  }

  const values = block.cells;
  const fieldId = command.type === 'field-patch' ? command.fieldId : '';

  return { kind: 'fields', values: { [fieldId]: values[fieldId]?.[0] ?? null } };
}

// The commands that make a player's entry again as a GM's own edit: a removal, or a new repeat
// block and then its cells, or the fields it sets and clears.
function commandsOf(entry: ProposalEntry, template: Template | null): InternalPlayerEditCommand[] {
  const parsed = parseBlockKey(entry.k);

  if (parsed === null) {
    return [];
  }

  const sectionId = sectionIdOf(parsed);
  const sheetId = parsed.sheetId;

  const target: FieldPatchCommandTarget =
    sectionId === null ? { kind: 'row', rowId: '' } : repeatTarget(parsed);

  const fieldPatches = (
    values: Readonly<Record<string, FieldValue | null>>,
  ): InternalPlayerEditCommand[] =>
    Object.entries(values).map(([fieldId, value]) => ({
      type: 'field-patch',
      sheetId,
      target:
        target.kind === 'row'
          ? {
              kind: 'row',
              rowId: template === null ? fieldId : (plainRowIdOf(template, fieldId) ?? fieldId),
            }
          : target,
      fieldId,
      value,
    }));

  switch (entry.patch.kind) {
    case 'remove': {
      const command: Extract<InternalPlayerEditCommand, { type: 'repeat-block-delete' }> = {
        type: 'repeat-block-delete',
        sheetId,
        block: parsed,
      };

      return [command];
    }

    case 'add': {
      const command: Extract<InternalPlayerEditCommand, { type: 'repeat-block-add' }> = {
        type: 'repeat-block-add',
        sheetId,
        block: parsed,
      };

      return [command, ...fieldPatches(cellValues(entry.patch.d.cells))];
    }

    case 'fields':
      return fieldPatches(entry.patch.values);
    default:
      return unknownPatch(entry.patch);
  }
}

function repeatTarget(block: BlockAddress): FieldPatchCommandTarget {
  return { kind: 'rep', block };
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

// `tsc` fails here when a proposal patch has no case above.
function unknownPatch(patch: never): never {
  throw new Error(`Muster Roll has no case for the proposal patch ${JSON.stringify(patch)}`);
}
