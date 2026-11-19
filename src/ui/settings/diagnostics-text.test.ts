import { describe, expect, test } from 'bun:test';

import type { Diagnostic } from '@/core/ui-messages';
import { diagnosticsText } from './diagnostics-text';

describe('diagnosticsText', () => {
  test('shows the newest diagnostic first with its time, tag and optional detail', () => {
    // #given
    const diagnostics = [
      { at: 1, tag: 'StorageFailure', detail: 'write failed' },
      { at: 2, tag: 'PartyReadFailure' },
    ];

    const formatTime = (at: number): string => (at === 1 ? '08:02:03' : '14:03:27');

    // #when
    const entries = diagnosticsText(diagnostics, formatTime);

    // #then
    expect(entries).toEqual([
      '14:03:27 · PartyReadFailure',
      '08:02:03 · StorageFailure · write failed',
    ]);
  });

  test('shows no entries for an empty diagnostic list', () => {
    // #given
    const diagnostics: Diagnostic[] = [];
    const formatTime = (): string => '08:02:03';

    // #when
    const entries = diagnosticsText(diagnostics, formatTime);

    // #then
    expect(entries).toEqual([]);
  });
});
