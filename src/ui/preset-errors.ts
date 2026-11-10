import type { PresetFailure } from '@/core/preset';
import type { RejectionReason } from '@/core/ui-messages';
import { copy } from '@/ui/copy';

export function presetFailureMessage(failure: PresetFailure): string {
  if (failure.code === 'newer-version') {
    return copy.newerFile;
  }

  return copy.badFile(badFileReason(failure));
}

// `sheets-exist` has no message of its own: the same projection disables the upload with its reason.
export function presetRejectionMessage(reason: RejectionReason): string | null {
  if (reason === 'too-large') {
    return copy.badFile(copy.badFileReason.tooLarge);
  }

  if (reason === 'invalid-preset') {
    return copy.badFile(copy.badFileReason.invalidStructure);
  }

  return null;
}

function badFileReason(failure: Exclude<PresetFailure, { code: 'newer-version' }>): string {
  const reason = copy.badFileReason;

  switch (failure.code) {
    case 'too-large':
      return reason.tooLarge;
    case 'not-json':
      return reason.notJson;
    case 'unsupported-version':
      return reason.unsupportedVersion;
    case 'invalid-structure':
      return reason.invalidStructure;
    case 'invalid-id':
      return reason.invalidFieldId(failure.detail);
    case 'duplicate-id':
      return reason.duplicateFieldId(failure.detail);
    case 'bad-repeat':
      return reason.badRepeat;
    case 'duplicate-section':
      return reason.duplicateSection(failure.detail);
    case 'row-too-wide':
      return reason.rowTooWide;
    case 'bad-formula':
      return reason.badFormula(failure.detail);
    default:
      return unknownFailure(failure);
  }
}

// `tsc` fails here when a failure code has no reason above.
function unknownFailure(failure: never): never {
  throw new Error(`Muster Roll has no reason for the preset failure ${JSON.stringify(failure)}`);
}
