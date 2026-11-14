import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { copy } from '@/copy';
import { Button } from '@/ui/primitives/button';

type DeleteConfirmationProps = {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// One block for the whole deletion, at the top of the content area. It knows no sheet kind, so the
// NPC tab can ask with it too.
export function DeleteConfirmation({
  name,
  onConfirm,
  onCancel,
}: DeleteConfirmationProps): ReactNode {
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
        {copy.deleteConfirmation(name)}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onPress={onConfirm}>
          {copy.command.delete}
        </Button>
        <Button autoFocus onPress={onCancel}>
          {copy.command.cancel}
        </Button>
      </div>
    </div>
  );
}
