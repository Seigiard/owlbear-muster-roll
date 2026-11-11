import type { RollMessage } from '@/core/room-messages';

// Russian digits and separators, at most two decimals, and no sign on a value that rounds to zero.
const NUMBER_FORMAT = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  signDisplay: 'negative',
});

// The copy catalog's roll strings, passed in, so core holds no interface text of its own.
export type RollCopy = {
  roll: (roller: string, sheet: string, cell: string, result: string) => string;
  rollSuccess: string;
  rollFailure: string;
  // The one fallback label of an empty sheet name.
  unnamed: string;
};

// "{roller}: {sheet}, {cell} — {result}". `{result}` is the rolled number, and for a comparison
// also its outcome, as "7, успех". A sheet whose name field is empty is sent as "" and shows the
// fallback label.
export function rollNotificationText(
  roll: Pick<RollMessage, 'roller' | 'sheetName' | 'cell' | 'result'>,
  text: RollCopy,
): string {
  const sheet = roll.sheetName.trim() === '' ? text.unnamed : roll.sheetName;
  const number = formatRollNumber(roll.result.roll);
  const { outcome } = roll.result;

  const result =
    outcome === null
      ? number
      : `${number}, ${outcome === 'success' ? text.rollSuccess : text.rollFailure}`;

  return text.roll(roll.roller, sheet, roll.cell, result);
}

export function formatRollNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}
