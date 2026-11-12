import { WINDOW_SIZE_LIMITS, type PresetFailure } from '@/core/preset';
import type { RejectionReason } from '@/core/ui-messages';
import { copy } from '@/ui/copy';

export function presetFailureMessage(failure: PresetFailure): string {
  if (failure.code === 'newer-version') {
    return copy.newerFile;
  }

  return copy.badFile(badFileReason(failure));
}

// `catching-up` has no message of its own: the same projection disables the upload with its reason.
// `count-changed` asks again instead.
export function presetRejectionMessage(reason: RejectionReason): string | null {
  if (reason === 'preset-unreadable') {
    return copy.presetUnreadable;
  }

  if (reason === 'write-failed') {
    return copy.presetWriteFailed;
  }

  if (reason === 'not-allowed') {
    return copy.presetNotAllowed;
  }

  if (reason === 'too-large') {
    return copy.badFile(copy.badFileReason.tooLarge);
  }

  if (reason === 'invalid-preset') {
    return copy.badFile(copy.badFileReason.invalidStructure);
  }

  return null;
}

// The reason inside the refusal message, which the builder also shows at the item that fails.
export function badFileReason(failure: Exclude<PresetFailure, { code: 'newer-version' }>): string {
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
    case 'invalid-template-id':
      return reason.invalidTemplateId(failure.detail);
    case 'duplicate-template':
      return reason.duplicateTemplate(failure.detail);
    case 'bad-name-field':
      return reason.badNameField(failure.detail, failure.field);
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
    case 'bad-window':
      return reason.badWindow(WINDOW_SIZE_LIMITS.width, WINDOW_SIZE_LIMITS.height);
    case 'no-options':
      return reason.noOptions(failure.field);
    case 'blank-option':
      return reason.blankOption(failure.field);
    case 'duplicate-option':
      return reason.duplicateOption(failure.detail, failure.field);
    case 'blank-name':
      return reason.blankName(failure.cell, failure.detail);
    case 'long-name':
      return reason.longName(failure.cell, failure.detail);
    case 'bad-die-option':
      return reason.badDieOption(failure.detail, failure.field);
    case 'die-field-as-number':
      return reason.dieFieldAsNumber(failure.detail, failure.field);
    case 'field-not-die':
      return reason.fieldNotDie(failure.detail, failure.field);
    default:
      return unknownFailure(failure);
  }
}

// `tsc` fails here when a failure code has no reason above.
function unknownFailure(failure: never): never {
  throw new Error(`Muster Roll has no reason for the preset failure ${JSON.stringify(failure)}`);
}
