import {
  formatPresetFile,
  parsePresetFile,
  presetProblems,
  WINDOW_SIZE_LIMITS,
  type PresetFailure,
  type WindowSize,
} from '@/core/preset';
import { copy } from '@/ui/copy';
import { badFileReason } from '@/ui/preset-errors';

import {
  PRESET_UID,
  toPreset,
  treeOrder,
  uidAt,
  WINDOW_UID,
  type BuilderDocument,
} from './document';

// AD-22: one problem of the draft, at the item it names. The failure is the upload's own, so its
// message is the upload's reason.
export type BuilderProblem = { uid: string; failure: PresetFailure };

// Every problem of the document, in tree order: the window first, then each template with its
// items, and "no templates" last, where the tree's add items for templates sit. The upload's checks
// give all but the two structure problems a form can make: a window out of range and no templates.
export function builderProblems(document: BuilderDocument): BuilderProblem[] {
  const problems: BuilderProblem[] = [];

  if (document.window !== undefined && !windowInRange(document.window)) {
    problems.push({ uid: WINDOW_UID, failure: { code: 'bad-window' } });
  }

  const order = new Map(treeOrder(document).map((uid, index) => [uid, index]));

  const rules = presetProblems(toPreset(document)).flatMap((problem) => {
    const uid = uidAt(document, problem.path);

    return uid === null ? [] : [{ uid, failure: problem.failure }];
  });

  // A stable sort, so problems of one item keep the upload's order.
  rules.sort((first, second) => (order.get(first.uid) ?? 0) - (order.get(second.uid) ?? 0));
  problems.push(...rules);

  if (document.templates.length === 0) {
    problems.push({ uid: PRESET_UID, failure: { code: 'invalid-structure' } });
  }

  return problems;
}

// The message a problem shows at its item: the reason of the upload's refusal message.
export function problemReason(failure: PresetFailure): string {
  return failure.code === 'newer-version' ? copy.newerFile : badFileReason(failure);
}

// The file "Скачать пресет" gives, or `null` while the upload would refuse it.
export function downloadText(document: BuilderDocument): string | null {
  const text = formatPresetFile(toPreset(document));

  return parsePresetFile(text).ok ? text : null;
}

function windowInRange(window: WindowSize): boolean {
  const { width, height } = WINDOW_SIZE_LIMITS;

  return (
    Number.isInteger(window.width) &&
    Number.isInteger(window.height) &&
    window.width >= width.min &&
    window.width <= width.max &&
    window.height >= height.min &&
    window.height <= height.max
  );
}
