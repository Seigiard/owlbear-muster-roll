import type { Diagnostic } from '@/core/ui-messages';
import { copy } from '@/copy';

const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

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
  return timeFormat.format(at);
}
