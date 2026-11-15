import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { copy } from '@/copy';
import { Button } from '@/ui/primitives/button';

type PresetConfirmationProps = {
  // The stored values the upload erases, and the sheets it deletes.
  count: number;
  sheets: number;
  onConfirm: () => void;
  onCancel: () => void;
};

// FR8, UX-DR25: one block for the whole upload, at the top of the content area, as the delete
// block is. It names the erased values and the deleted sheets, each only when there are some. The
// focus starts on "Отменить", and the caller remounts the block to move it there again for a new
// count.
export function PresetConfirmation({
  count,
  sheets,
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
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface-raised p-2"
    >
      <p id={textId} className="min-w-0 flex-1 text-text">
        {presetConfirmationText(count, sheets)}
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

// AD-14: one message from the parts that apply, then the question.
export function presetConfirmationText(count: number, sheets: number): string {
  return [
    count > 0 ? copy.presetUploadErasesValues(count) : null,
    sheets > 0 ? copy.presetUploadDeletesSheets(sheets) : null,
    copy.presetUploadQuestion,
  ]
    .filter((part) => part !== null)
    .join(' ');
}
