import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';

type PresetConfirmationProps = {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
};

// FR8, UX-DR25: one block for the whole upload, at the top of the content area, as the delete
// block is. The focus starts on "Отменить", and the caller remounts the block to move it there
// again for a new count.
export function PresetConfirmation({
  count,
  onConfirm,
  onCancel,
}: PresetConfirmationProps): ReactNode {
  const textId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={textId}
      onKeyDown={handleKeyDown}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-bar p-2"
    >
      <p id={textId} className="min-w-[0] flex-1 text-text">
        {copy.presetUploadRemovesValues(count)}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onPress={onConfirm}>
          {copy.command.loadPreset}
        </Button>
        <Button autoFocus onPress={onCancel}>
          {copy.command.cancel}
        </Button>
      </div>
    </div>
  );
}
