import { blockDataSchema, type VersionedRecord } from '@/core/records';
import { mergeRecords } from '@/core/merge';
import type {
  Command,
  CommandMessage,
  EngineMessage,
  PresetDiffMessage,
  RejectionReason,
} from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';
import type { ComposeContext, Composers } from '@/core/compose';
import type { PendingEdits } from '@/replica/pending-edits';
import type { PendingEntry, PendingQueue } from '@/replica/pending-queue';
import type { RecordIdKind } from '@/core/ids';

export type CommandRouteContext = {
  role: PlayerRole;
  importing: boolean;
  live: boolean;
};

export type CommandRoute =
  | { kind: 'player' }
  | { kind: 'reject'; reason: RejectionReason }
  | { kind: 'queue' }
  | { kind: 'compose' }
  | { kind: 'preset-upload' }
  | { kind: 'snapshot-import' }
  | { kind: 'wipe' };

export function decideCommandRoute(
  context: CommandRouteContext,
  command: Pick<Command, 'type'>,
): CommandRoute {
  if (context.role !== 'GM') {
    return { kind: 'player' };
  }

  if (context.importing) {
    // AD-9: until the importer's `reset` is out, no commit of the new generation may reach the room.
    return { kind: 'reject', reason: 'importing' };
  }

  if (!context.live) {
    return isCatchUpRejected(command.type)
      ? { kind: 'reject', reason: 'catching-up' }
      : { kind: 'queue' };
  }

  switch (command.type) {
    case 'preset-upload':
      return { kind: 'preset-upload' };
    case 'snapshot-import':
      return { kind: 'snapshot-import' };
    case 'wipe':
      return { kind: 'wipe' };
    default:
      return { kind: 'compose' };
  }
}

export type PresetDiffRoute = { kind: 'reject'; reason: RejectionReason } | { kind: 'preset-diff' };

export function decidePresetDiffRoute(context: CommandRouteContext): PresetDiffRoute {
  if (context.role !== 'GM') {
    return { kind: 'reject', reason: 'not-allowed' };
  }

  return context.live ? { kind: 'preset-diff' } : { kind: 'reject', reason: 'catching-up' };
}

export type PresetBatchResult<RecordValue> = {
  applied: RecordValue[];
  complete: boolean;
};

export function runPresetBatch<RecordValue>(
  groups: readonly (readonly RecordValue[])[],
  apply: (group: readonly RecordValue[]) => readonly RecordValue[],
): PresetBatchResult<RecordValue> {
  const applied: RecordValue[] = [];

  for (const group of groups) {
    const written = apply(group);

    applied.push(...written);

    if (written.length < group.length) {
      return { applied, complete: false };
    }
  }

  return { applied, complete: true };
}

export type ReplayedPending = {
  applied: VersionedRecord[];
  completed: string[];
};

export type CommandRoutingPorts = {
  role: () => PlayerRole;
  importing: () => boolean;
  live: () => boolean;
  acceptCommand: (id: string) => boolean;
  composers: Pick<
    Composers,
    'compose' | 'composePatches' | 'composePresetUpload' | 'presetDiffResult'
  >;
  records: () => ReadonlyMap<string, VersionedRecord>;
  liveContext: () => ComposeContext;
  dryContext: (records: ReadonlyMap<string, VersionedRecord>) => ComposeContext;
  newRecordId: (kind: RecordIdKind) => string;
  pending: Pick<PendingQueue, 'add' | 'entries' | 'takeAll'>;
  pendingEdits: Pick<PendingEdits, 'edit' | 'overlay'>;
  apply: (records: readonly VersionedRecord[], stopsOnFailure?: boolean) => VersionedRecord[];
  reject: (
    id: string,
    reason: RejectionReason,
    changed?: { count: number; sheets: number; digest: string },
  ) => void;
  commandDone: (id: string) => void;
  notifyDenied: () => void;
  publish: () => void;
  hasPersistence: () => boolean;
  flushOutbox: () => void;
  addCommits: (records: readonly VersionedRecord[]) => void;
  roomCopyEdited: () => void;
  importFromSnapshot: (
    id: string,
    command: Extract<Command, { type: 'snapshot-import' }>,
  ) => Promise<void>;
  wipe: (id: string) => Promise<void>;
  reply: (message: EngineMessage) => void;
};

export type CommandRouting = {
  handleCommand: (message: CommandMessage) => void;
  runCommand: (id: string, command: Command) => void;
  handlePresetDiff: (message: PresetDiffMessage) => void;
  pendingView: () => Map<string, VersionedRecord>;
  pendingViewRecords: () => Map<string, VersionedRecord>;
  replayPending: () => ReplayedPending;
  clearPendingIds: () => void;
};

export function createCommandRouting(ports: CommandRoutingPorts): CommandRouting {
  const pendingIds = new Map<string, Map<string, string>>();

  function pendingIdsOf(intentId: string): ComposeContext['newRecordId'] {
    return (kind, role) => {
      let ids = pendingIds.get(intentId);

      if (ids === undefined) {
        ids = new Map();
        pendingIds.set(intentId, ids);
      }

      const id = ids.get(role) ?? ports.newRecordId(kind);

      ids.set(role, id);

      return id;
    };
  }

  function handleCommand(message: CommandMessage): void {
    if (ports.acceptCommand(message.id)) {
      runCommand(message.id, message.command);
    }
  }

  function runCommand(id: string, command: Command): void {
    // AD-4: a player never merges its own edit, which would beat later GM edits of its key. Its
    // field and repeat block edits wait for a GM client's check. Nothing else is a player's to
    // write.
    const route = decideCommandRoute(
      {
        role: ports.role(),
        importing: ports.importing(),
        live: ports.live(),
      },
      command,
    );

    switch (route.kind) {
      case 'player':
        handlePlayerCommand(id, command);

        return;
      case 'reject':
        ports.reject(id, route.reason);

        return;
      case 'queue':
        queueIntent(id, command);

        return;
      case 'compose':
        composeCommand(id, command);

        return;
      case 'preset-upload':
        if (command.type === 'preset-upload') {
          uploadPreset(id, command);
        }

        return;
      case 'snapshot-import':
        if (command.type === 'snapshot-import') {
          void ports.importFromSnapshot(id, command).catch((error) => {
            console.error('Muster Roll could not import a snapshot', error);
          });
        }

        return;
      case 'wipe':
        if (command.type === 'wipe') {
          void ports.wipe(id).catch((error) => {
            console.error('Muster Roll could not wipe the room', error);
          });
        }

        return;
    }
  }

  // AD-14: a window asks how many stored values a preset would erase before it asks the GM. A GM
  // client that is live answers with one diff over its full replica. The answer writes nothing.
  function handlePresetDiff(message: PresetDiffMessage): void {
    if (!ports.acceptCommand(message.id)) {
      return;
    }

    const route = decidePresetDiffRoute({
      role: ports.role(),
      importing: ports.importing(),
      live: ports.live(),
    });

    if (route.kind === 'reject') {
      ports.reject(message.id, route.reason);

      return;
    }

    const diff = ports.composers.presetDiffResult(ports.liveContext(), message.data);

    if (!diff.isOk()) {
      ports.reject(message.id, diff.error);

      return;
    }

    ports.reply({ t: 'preset-diff-result', id: message.id, ...diff.value });
  }

  function composeCommand(id: string, command: Command): void {
    const composed = ports.composers.compose(ports.liveContext(), command);

    if (!composed.isOk()) {
      ports.reject(id, composed.error);

      return;
    }

    const applied = ports.apply(composed.value);

    // A notice change reaches the window even when the command applied nothing.
    ports.publish();
    ports.commandDone(id);
    ports.addCommits(applied);

    if (applied.length > 0) {
      ports.roomCopyEdited();
    }
  }

  // AD-14: the diff runs again over the replica as it is now. The commits held so far go out
  // first, then each group of the batch is saved and sent as commits of its own, in order: rows
  // under new keys, `preset`, then tombstones of old keys and stripped rows. A failed write stops
  // the batch there, so a closure or a failure at any point leaves values readable under one of
  // the two presets. The generation does not change.
  function uploadPreset(id: string, command: Extract<Command, { type: 'preset-upload' }>): void {
    const batch = ports.composers.composePresetUpload(ports.liveContext(), command);

    if (!batch.isOk()) {
      ports.reject(id, batch.error.reason, batch.error.changed);

      return;
    }

    if (ports.hasPersistence()) {
      ports.flushOutbox();
    }

    const result = runPresetBatch(batch.value.groups, (group) => {
      const written = ports.apply(group, true);

      if (ports.hasPersistence() && written.length > 0) {
        ports.addCommits(written);
        ports.flushOutbox();
      }

      return written;
    });

    ports.publish();

    if (result.applied.length > 0) {
      ports.roomCopyEdited();
    }

    if (!result.complete) {
      ports.reject(id, 'write-failed');

      return;
    }

    ports.reply({
      t: 'preset-uploaded',
      id,
      count: batch.value.count,
      sheets: batch.value.sheets,
    });
  }

  // AD-4: the pending-edits module checks and queues a player's edit. The engine reports only the
  // immediate command rejection or the notification the module returns.
  function handlePlayerCommand(id: string, command: Command): void {
    const result = ports.pendingEdits.edit(command, pendingView());

    if (!result.isOk()) {
      ports.reject(id, result.error);

      return;
    }

    if (result.value.notify) {
      ports.notifyDenied();
    }

    ports.publish();
    ports.commandDone(id);
  }

  // AD-7: an intent made during catch-up waits and takes `c` on exit. It is checked now against the
  // pending view, so a refusal comes at once.
  function queueIntent(id: string, command: Command): void {
    const dry = ports.composers.compose(
      { ...ports.dryContext(pendingView()), newRecordId: pendingIdsOf(id) },
      command,
    );

    if (!dry.isOk()) {
      pendingIds.delete(id);
      ports.reject(id, dry.error);

      return;
    }

    ports.pending.add(id, command);
    ports.publish();
  }

  // The replica with every pending intent applied by the same composers, minting nothing, and every
  // proposal of a player's edit over it (AD-4): the newest version sent, or one that waits for its
  // `c`, as its patch makes it of the record it will be applied to.
  function pendingView(): Map<string, VersionedRecord> {
    const view = new Map(ports.records());
    const context = ports.dryContext(view);

    for (const entry of ports.pending.entries()) {
      for (const record of composedEntry(context, entry)) {
        const previous = view.get(record.k);
        view.set(record.k, previous === undefined ? record : mergeRecords(previous, record));
      }
    }

    ports.pendingEdits.overlay(view);

    return view;
  }

  function composedEntry(context: ComposeContext, entry: PendingEntry): VersionedRecord[] {
    if (entry.kind === 'intent') {
      const composed = ports.composers.compose(
        { ...context, newRecordId: pendingIdsOf(entry.id) },
        entry.command,
      );

      return composed.isOk() ? composed.value : [];
    }

    const { record } = ports.composers.composePatches(context, entry.patches);

    return record === null ? [] : [record];
  }

  // The publisher compares this pending view with what windows hold. Keys equal to the replica are
  // omitted, so a pending record never masks an applied record without a visible change.
  function pendingViewRecords(): Map<string, VersionedRecord> {
    const view = pendingView();

    return new Map(
      [...view].flatMap(([key, record]) => {
        const applied = ports.records().get(key);

        return record === applied ? [] : [[key, pendingRecord(record, applied)]];
      }),
    );
  }

  // AD-7 replay: every pending intent runs for real in arrival order. A refusal now goes to the
  // window with the command id it came with.
  function replayQueuedPending(): ReplayedPending {
    const applied: VersionedRecord[] = [];
    const completed: string[] = [];

    for (const entry of ports.pending.takeAll()) {
      const ids = entry.kind === 'intent' ? [entry.id] : entry.patches.map((patch) => patch.id);

      if (ports.role() !== 'GM') {
        for (const id of ids) {
          ports.reject(id, 'not-allowed');
        }
      } else if (entry.kind === 'intent') {
        const composed = ports.composers.compose(
          { ...ports.liveContext(), newRecordId: pendingIdsOf(entry.id) },
          entry.command,
        );

        if (composed.isOk()) {
          applied.push(...ports.apply(composed.value));
          completed.push(entry.id);
        } else {
          ports.reject(entry.id, composed.error);
        }
      } else {
        const { record, refusals } = ports.composers.composePatches(
          ports.liveContext(),
          entry.patches,
        );

        const refused = new Set(refusals.map((refusal) => refusal.id));

        for (const refusal of refusals) {
          ports.reject(refusal.id, refusal.reason);
        }

        if (record !== null) {
          applied.push(...ports.apply([record]));
        }

        completed.push(
          ...entry.patches.flatMap((patch) => (refused.has(patch.id) ? [] : [patch.id])),
        );
      }
    }

    pendingIds.clear();

    return { applied, completed };
  }

  function clearPendingIds(): void {
    pendingIds.clear();
  }

  return {
    handleCommand,
    runCommand,
    handlePresetDiff,
    pendingView,
    pendingViewRecords,
    replayPending: replayQueuedPending,
    clearPendingIds,
  };
}

function pendingRecord(
  record: VersionedRecord,
  applied: VersionedRecord | undefined,
): VersionedRecord {
  const shown = blockDataSchema.safeParse(record.d);
  const base = blockDataSchema.safeParse(applied?.d);

  if (!shown.success || !base.success) return record;

  const cells = Object.fromEntries(
    Object.entries(shown.data.cells).filter(
      ([id, cell]) => JSON.stringify(cell) !== JSON.stringify(base.data.cells[id]),
    ),
  );

  return {
    k: record.k,
    c: record.c,
    a: record.a,
    l: record.l ?? [record.c, record.a],
    d: { ...shown.data, cells },
  };
}

function isCatchUpRejected(commandType: Command['type']): boolean {
  return (
    commandType === 'preset-upload' || commandType === 'snapshot-import' || commandType === 'wipe'
  );
}
