import { Result } from 'better-result';

// A sign, then digits with an optional fraction, or a fraction alone. A comma is a decimal point,
// so `1,5` reads as typed in Russian. No exponent: `1e3` is refused, so `1e999` never reaches
// Infinity by that road.
const NUMBER_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

export type NumberInputFailure = 'not-a-number';

// The one parser of a `number` field's text. `null` means clear: only an empty text clears, and
// spaces only are refused, as the GM typed something that is not a number.
export function parseNumberInput(text: string): Result<number | null, NumberInputFailure> {
  if (text === '') {
    return Result.ok(null);
  }

  const trimmed = text.trim();

  if (!NUMBER_PATTERN.test(trimmed)) {
    return Result.err('not-a-number');
  }

  const value = Number(trimmed.replace(',', '.'));

  // Enough digits still overflow to Infinity, which JSON cannot carry.
  return Number.isFinite(value) ? Result.ok(value) : Result.err('not-a-number');
}
