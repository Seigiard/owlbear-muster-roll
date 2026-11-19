import { createComposers, type ComposeContext } from '@/core/compose';
import { newRecordId } from '@/core/ids';
import { mergeRecords } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import type { Command } from '@/core/ui-messages';
import type { VersionMinter } from '@/core/version-minter';

type PreviewComposeResult = {
  snapshot: readonly VersionedRecord[];
  ok: boolean;
};

export function previewCompose(
  snapshot: readonly VersionedRecord[],
  contextRecords: ReadonlyMap<string, VersionedRecord>,
  presetData: string,
  minter: VersionMinter,
  command: Command,
): PreviewComposeResult {
  if (
    command.type !== 'field-patch' &&
    command.type !== 'repeat-block-add' &&
    command.type !== 'repeat-block-delete'
  ) {
    return { snapshot, ok: false };
  }

  const presetRecord: VersionedRecord = {
    k: 'preset',
    d: presetData,
    c: 1,
    a: 'builder',
  };

  const records = new Map(contextRecords);

  records.set(presetRecord.k, presetRecord);

  const context: ComposeContext = {
    records,
    mint: minter.mint,
    newRecordId: (kind) => newRecordId(kind),
    isGmPlayer: () => true,
    mode: 'persisted',
  };

  const composed = createComposers('builder').compose(context, command);

  if (composed.isErr()) {
    return { snapshot, ok: false };
  }

  const next = [...snapshot];

  for (const record of composed.value) {
    const index = next.findIndex((candidate) => candidate.k === record.k);

    if (index === -1) {
      next.push(record);
      continue;
    }

    const existing = next[index];

    if (existing === undefined) {
      next.push(record);
      continue;
    }

    next[index] = mergeRecords(existing, record);
  }

  return { snapshot: next, ok: true };
}
