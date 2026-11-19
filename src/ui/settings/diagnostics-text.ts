import type { Diagnostic } from '@/core/ui-messages';
import { copy } from '@/copy';

const twoDigits = (value: number): string => String(value).padStart(2, '0');

export function diagnosticsText(
  diagnostics: readonly Diagnostic[],
  formatTime: (at: number) => string,
): string[] {
  return diagnostics.reduceRight<string[]>((entries, { at, tag, detail }) => {
    entries.push(
      [formatTime(at), tag, detail]
        .filter((part) => part !== undefined)
        .join(copy.diagnostics.separator),
    );

    return entries;
  }, []);
}

export function formatDiagnosticTime(at: number): string {
  const date = new Date(at);

  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}
