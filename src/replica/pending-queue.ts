import { fieldPatchTargetOf } from '@/core/block-address';
import { patchRecordKey } from '@/core/field-patch';
import type { Command } from '@/core/ui-messages';
import type { FieldPatchCommand, IdentifiedPatch } from '@/replica/composers';

// AD-7: one GM intent made during catch-up, in arrival order. Field patches of one record key share
// one entry, which keeps the place of the first.
export type PendingEntry =
  | { kind: 'intent'; id: string; command: Exclude<Command, FieldPatchCommand> }
  | { kind: 'patches'; key: string; patches: IdentifiedPatch[] };

export type PendingQueue = {
  add: (id: string, command: Command) => void;
  entries: () => readonly PendingEntry[];
  // Hands every entry over in arrival order and empties the queue.
  takeAll: () => PendingEntry[];
};

export function createPendingQueue(): PendingQueue {
  let entries: PendingEntry[] = [];

  function addPatch(id: string, command: FieldPatchCommand): void {
    const target =
      command.target.kind === 'row'
        ? command.target
        : fieldPatchTargetOf(command.sheetId, command.target);

    const key = target === null ? `invalid:${id}` : patchRecordKey(command.sheetId, target);
    const entry = entries.find((pending) => pending.kind === 'patches' && pending.key === key);

    if (entry?.kind !== 'patches') {
      entries.push({ kind: 'patches', key, patches: [{ id, command }] });

      return;
    }

    // A newer value of one field takes the place of the older one, so the entry holds one patch
    // per field.
    const index = entry.patches.findIndex((patch) => patch.command.fieldId === command.fieldId);

    if (index === -1) {
      entry.patches.push({ id, command });
    } else {
      entry.patches[index] = { id, command };
    }
  }

  return {
    add: (id, command) => {
      if (command.type === 'field-patch') {
        addPatch(id, command);
      } else {
        entries.push({ kind: 'intent', id, command });
      }
    },
    entries: () => entries,
    takeAll: () => {
      const taken = entries;

      entries = [];

      return taken;
    },
  };
}
