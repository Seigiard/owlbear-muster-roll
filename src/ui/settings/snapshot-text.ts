import type { SnapshotFileFailure } from '@/core/snapshot-import';
import type { RejectionReason } from '@/core/ui-messages';
import { copy } from '@/ui/copy';

// What the window says under "Загрузить снимок" for a file it refused, or for a refused check or
// import.
export function fileFailureText(failure: SnapshotFileFailure): string {
  const reason = copy.badFileReason;

  switch (failure) {
    case 'newer-version':
      return copy.newerFile;
    case 'too-large':
      return copy.badFile(reason.tooLarge);
    case 'not-json':
      return copy.badFile(reason.notJson);
    case 'unsupported-version':
      return copy.badFile(reason.unsupportedVersion);
    case 'not-snapshot':
      return copy.badFile(reason.notSnapshot);
    case 'invalid-structure':
      return copy.badFile(reason.invalidStructure);
    default:
      return unknownFailure(failure);
  }
}

// `count-changed` asks again instead of showing a message. A reason no case names is a failed import.
export function snapshotRejectionText(reason: RejectionReason): string {
  switch (reason) {
    case 'invalid-snapshot':
      return copy.badFile(copy.badFileReason.invalidStructure);
    case 'too-large':
      return copy.badFile(copy.badFileReason.tooLarge);
    case 'preset-required':
      return copy.presetRequired;
    case 'preset-unreadable':
      return copy.presetUnreadable;
    case 'not-allowed':
      return copy.snapshotNotAllowed;
    case 'catching-up':
      return copy.loading;
    case 'importing':
      return copy.snapshotImporting;
    case 'data-replaced':
      return copy.snapshotDataReplaced;
    default:
      return copy.snapshotImportFailed;
  }
}

// `tsc` fails here when a failure code has no text above.
function unknownFailure(failure: never): never {
  throw new Error(`Muster Roll has no text for the snapshot file failure ${String(failure)}`);
}
