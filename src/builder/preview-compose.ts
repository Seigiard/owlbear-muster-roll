import type { VersionedRecord } from '@/core/records';
import type { Command } from '@/core/ui-messages';
import type { VersionMinter } from '@/core/version-minter';

type PreviewComposeResult = {
  snapshot: readonly VersionedRecord[];
  ok: boolean;
};

export function previewCompose(
  snapshot: readonly VersionedRecord[],
  _contextRecords: ReadonlyMap<string, VersionedRecord>,
  _presetData: string,
  _minter: VersionMinter,
  _command: Command,
): PreviewComposeResult {
  return { snapshot, ok: false };
}
