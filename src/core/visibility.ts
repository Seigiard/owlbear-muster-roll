import type { VersionedRecord } from '@/core/records';

export type PlayerRole = 'GM' | 'PLAYER';

// Pass-through until player rules exist: Story 2.3 narrows what a player sees.
export function visibleRecords(
  _role: PlayerRole,
  records: readonly VersionedRecord[],
): VersionedRecord[] {
  return [...records];
}
