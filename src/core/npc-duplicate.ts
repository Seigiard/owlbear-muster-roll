import { err, ok, type Result } from '@/core/result';
import { SHEET_NAME_MAX_LENGTH } from '@/core/sheets';

export const DUPLICATE_COUNT_MIN = 1;

export const DUPLICATE_COUNT_MAX = 50;

// A name that ends in a space and digits. The base is greedy, so "Скелет 1 2" has the base
// "Скелет 1" and the number 2.
const NUMBERED_NAME = /^(.+) (\d+)$/;

const DIGITS = /^\d+$/;

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export type DuplicateCountFailure = 'invalid-count';

// A number too long to fit a name even with no base, which only a name longer than the limit
// can lead to.
export type DuplicateNameFailure = 'name-too-long';

type NumberedName = { base: string; number: bigint };

// UX-DR20: the source name without its trailing number, then the highest number any live NPC of
// that exact base carries, the source's own included, + 1. A source with no number and no numbered
// namesake starts at 1. A number can have more digits than a double holds, so it is a bigint. A
// number whose name a live NPC already has is skipped: a shortened base never counts as the base,
// so its names would come back.
export function duplicateNames(
  sourceName: string,
  existingNpcNames: readonly string[],
  count: number,
): Result<string[], DuplicateNameFailure> {
  const base = numberedName(sourceName)?.base ?? sourceName.trimEnd();
  const taken = new Set(existingNpcNames);
  let highest = 0n;

  for (const name of [sourceName, ...existingNpcNames]) {
    const numbered = numberedName(name);

    if (numbered !== null && numbered.base === base && numbered.number > highest) {
      highest = numbered.number;
    }
  }

  const names: string[] = [];

  // Ends: each round adds a name or skips one of the finitely many taken names.
  for (let number = highest + 1n; names.length < count; number += 1n) {
    const name = fittedName(base, number.toString());

    if (name === null) {
      return err('name-too-long');
    }

    if (!taken.has(name)) {
      names.push(name);
    }
  }

  return ok(names);
}

// Only a whole number in digits counts, so "1.5", "1e1" and "+3" are refused. Spaces around it
// are dropped, as the field shows nothing of them.
export function parseDuplicateCount(text: string): Result<number, DuplicateCountFailure> {
  const trimmed = text.trim();

  if (!DIGITS.test(trimmed)) {
    return err('invalid-count');
  }

  const count = Number(trimmed);

  return isDuplicateCount(count) ? ok(count) : err('invalid-count');
}

export function isDuplicateCount(count: number): boolean {
  return Number.isInteger(count) && count >= DUPLICATE_COUNT_MIN && count <= DUPLICATE_COUNT_MAX;
}

// The base drops the spaces before the number, so "Скелет  1" and "Скелет 5" share one base.
function numberedName(name: string): NumberedName | null {
  const match = NUMBERED_NAME.exec(name);

  if (match === null) {
    return null;
  }

  const [, base = '', digits = ''] = match;

  return { base: base.trimEnd(), number: BigInt(digits) };
}

// The number always stays whole, so the base gives way when the name would pass the limit. The
// limit counts code points, as `parseSheetName` does, and the base is cut between graphemes, so no
// letter loses its accent.
function fittedName(base: string, number: string): string | null {
  const numberLength = Array.from(number).length;

  if (numberLength > SHEET_NAME_MAX_LENGTH) {
    return null;
  }

  const room = SHEET_NAME_MAX_LENGTH - numberLength - 1;
  let shortened = '';
  let length = 0;

  for (const { segment } of GRAPHEMES.segment(base)) {
    length += Array.from(segment).length;

    if (length > room) {
      break;
    }

    shortened += segment;
  }

  const kept = shortened.trimEnd();

  return kept === '' ? number : `${kept} ${number}`;
}
