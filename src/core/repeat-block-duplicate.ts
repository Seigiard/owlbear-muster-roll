import { z } from 'zod';

import { sectionFields, type PresetSection } from '@/core/preset';
import type { FieldValue, FieldValues } from '@/core/records';
import { Result } from 'better-result';

// A value a `text` field holds. A field whose type changed can leave a value of another type.
const textValueSchema = z.string().min(1);

export const DUPLICATE_COUNT_MIN = 1;

export const DUPLICATE_COUNT_MAX = 50;

// A name that ends in a space and digits. The base is greedy, so "Скелет 1 2" has the base
// "Скелет 1" and the number 2.
const NUMBERED_NAME = /^(.+) (\d+)$/;

const DIGITS = /^\d+$/;

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// The longest name a duplicate gives a repeat block, in code points.
const BLOCK_NAME_MAX_LENGTH = 100;

export type DuplicateCountFailure = 'invalid-count';

// A number too long to fit a name even with no base, which only a name longer than the limit can
// lead to.
export type DuplicateNameFailure = 'name-too-long';

type NumberedName = { base: string; number: bigint };

// CAP-30: the cells of `count` duplicates of the repeat block `source`, in order. Every value is
// copied as is. When the section's explicit repeat.nameField is a `text` field with a value, each
// copy numbers it by `duplicateNames` over the configured nameField values of `siblings`.
export function duplicateBlockCells(
  section: PresetSection,
  source: FieldValues,
  siblings: readonly FieldValues[],
  count: number,
): Result<FieldValues[], DuplicateNameFailure> {
  const nameId = section.repeat?.nameField ?? null;

  const nameField =
    nameId === null ? null : (sectionFields(section).find((field) => field.id === nameId) ?? null);

  const value = nameId === null ? null : textValue(source[nameId]);

  if (nameId === null || nameField === null || nameField.type !== 'text' || value === null) {
    return Result.ok(Array.from({ length: count }, () => ({ ...source })));
  }

  const existing = siblings.flatMap((cells) => {
    const name = textValue(cells[nameId]);

    return name === null ? [] : [name];
  });

  const names = duplicateNames(value, existing, count);

  return names.isOk()
    ? Result.ok(names.value.map((name) => ({ ...source, [nameId]: name })))
    : names;
}

// UX-DR20: the source name without its trailing number, then the highest number any repeat block of
// that exact base carries, the source's own included, + 1. A source with no number and no numbered
// namesake starts at 1. A number can have more digits than a double holds, so it is a bigint. A
// number whose name a repeat block already has is skipped: a shortened base never counts as the
// base, so its names would come back.
export function duplicateNames(
  sourceName: string,
  existingNames: readonly string[],
  count: number,
): Result<string[], DuplicateNameFailure> {
  const base = numberedName(sourceName)?.base ?? sourceName.trimEnd();
  const taken = new Set(existingNames);
  let highest = 0n;

  for (const name of [sourceName, ...existingNames]) {
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
      return Result.err('name-too-long');
    }

    if (!taken.has(name)) {
      names.push(name);
    }
  }

  return Result.ok(names);
}

// Only a whole number in digits counts, so "1.5", "1e1" and "+3" are refused. Spaces around it are
// dropped, as the field shows nothing of them.
export function parseDuplicateCount(text: string): Result<number, DuplicateCountFailure> {
  const trimmed = text.trim();

  if (!DIGITS.test(trimmed)) {
    return Result.err('invalid-count');
  }

  const count = Number(trimmed);

  return isDuplicateCount(count) ? Result.ok(count) : Result.err('invalid-count');
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
// limit counts code points, and the base is cut between graphemes, so no letter loses its accent.
function fittedName(base: string, number: string): string | null {
  const numberLength = Array.from(number).length;

  if (numberLength > BLOCK_NAME_MAX_LENGTH) {
    return null;
  }

  const room = BLOCK_NAME_MAX_LENGTH - numberLength - 1;
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

function textValue(value: FieldValue | undefined): string | null {
  return textValueSchema.safeParse(value).data ?? null;
}
