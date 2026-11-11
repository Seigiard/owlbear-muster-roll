import type { ReactNode } from 'react';

import type { Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { encodeSnapshotFile, formatSnapshotFile, snapshotFileName } from '@/core/snapshot-file';
import { copy } from '@/ui/copy';
import { downloadJsonFile } from '@/ui/download';
import { Button } from '@/ui/primitives/button';

type SnapshotActionsProps = {
  records: ReadonlyMap<string, VersionedRecord>;
  preset: Preset | null;
  catchingUp: boolean;
};

// FR13, UX-DR23, UX-DR30: "Скачать снимок" writes the file from the records this window holds and
// sends nothing to the replica. Both buttons wait during catch-up and need a preset.
export function SnapshotActions({ records, preset, catchingUp }: SnapshotActionsProps): ReactNode {
  const reason = snapshotDisabledReason(preset, catchingUp);

  return (
    <>
      <Button
        variant="primary"
        disabledReason={reason}
        onPress={() => {
          downloadJsonFile(
            snapshotFileName(new Date()),
            formatSnapshotFile(encodeSnapshotFile(records)),
          );
        }}
      >
        {copy.command.downloadSnapshot}
      </Button>
      {/* Story 5.3 builds the import and shows it always. Until then only its disabled states show. */}
      {reason === undefined ? null : (
        <Button disabledReason={reason}>{copy.command.loadSnapshot}</Button>
      )}
    </>
  );
}

// Catch-up comes first, as for the preset download.
function snapshotDisabledReason(preset: Preset | null, catchingUp: boolean): string | undefined {
  if (catchingUp) {
    return copy.loading;
  }

  return preset === null ? copy.presetRequired : undefined;
}
