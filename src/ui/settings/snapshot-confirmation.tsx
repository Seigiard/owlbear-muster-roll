import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';

type SnapshotConfirmationProps = {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
};

// FR13, UX-DR25: one block for the whole import, at the top of the content area, as the delete
// block is. The values the current preset has no place for are named only when there are some. The
// focus starts on "Отменить", and the caller remounts the block to move it there again for a new
// count.
export function SnapshotConfirmation({
  count,
  onConfirm,
  onCancel,
}: SnapshotConfirmationProps): ReactNode {
  const textId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  const text =
    count > 0
      ? `${copy.snapshotImport} ${copy.snapshotImportDropsValues(count)}`
      : copy.snapshotImport;

  return (
    <div
      role="group"
      aria-labelledby={textId}
      onKeyDown={handleKeyDown}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-bar p-2"
    >
      <p id={textId} className="min-w-[0] flex-1 text-text">
        {text}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onPress={onConfirm}>
          {copy.command.loadSnapshot}
        </Button>
        <Button autoFocus onPress={onCancel}>
          {copy.command.cancel}
        </Button>
      </div>
    </div>
  );
}
