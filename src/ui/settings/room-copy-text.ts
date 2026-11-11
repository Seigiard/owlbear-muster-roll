import type { RoomCopyStatus } from '@/core/ui-messages';
import { copy } from '@/ui/copy';

// UX-DR23: what Settings says about the room copy.
export function roomCopyText(roomCopy: RoomCopyStatus): string {
  if (roomCopy.state === 'failed') {
    return copy.roomCopyNotSaved;
  }

  if (roomCopy.state === 'none') {
    return copy.roomCopyNone(kilobytes(roomCopy.freeBytes));
  }

  return copy.roomCopySaved(kilobytes(roomCopy.usedBytes), kilobytes(roomCopy.freeBytes));
}

// Kilobytes of 1000 bytes, with one decimal after a comma, as Russian writes them.
function kilobytes(bytes: number): string {
  return (bytes / 1000).toFixed(1).replace('.', ',');
}
