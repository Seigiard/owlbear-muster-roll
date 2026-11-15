import { describe, expect, test } from 'bun:test';

import {
  anchorKey,
  compare,
  formatReport,
  loadBaseline,
  parseBaseline,
  type BaselineEntry,
  type ProbeRow,
} from './baseline';

const mutation = {
  file: 'src/replica/example.ts',
  line: 4,
  fn: 'sample',
  op: '===→!==',
  before: '===',
  after: '!==',
  start: 20,
  end: 23,
  text: 'left === right',
  nth: 1,
};

describe('anchorKey', () => {
  test('uses source identity rather than line number or replacement text', () => {
    // #given
    const movedMutation = { ...mutation, line: 400, after: '===' };

    // #when
    const key = anchorKey(movedMutation);

    // #then
    expect(key).toBe(
      ['src/replica/example.ts', 'sample', '===→!==', 'left === right', '1'].join('\0'),
    );
  });
});

describe('compare', () => {
  test('reports only unmatched survivors, unmatched timeouts and gone anchors', () => {
    // #given
    const baseline: BaselineEntry[] = [
      { ...mutation, verdict: 'equivalent', reason: 'The values are already equal.' },
      {
        ...mutation,
        text: 'unused === guard',
        nth: 1,
        verdict: 'unreachable',
        reason: 'No caller can reach this state.',
      },
    ];

    const rows: ProbeRow[] = [
      { ...mutation, result: 'killed' },
      { ...mutation, text: 'new survivor', result: 'survived' },
      { ...mutation, text: 'new timeout', result: 'timeout' },
    ];

    // #when
    const result = compare(rows, baseline);

    // #then
    expect(result).toEqual({
      newSurvivors: [{ ...mutation, text: 'new survivor', result: 'survived' }],
      newTimeouts: [{ ...mutation, text: 'new timeout', result: 'timeout' }],
      missing: [
        {
          ...mutation,
          text: 'unused === guard',
          nth: 1,
          verdict: 'unreachable',
          reason: 'No caller can reach this state.',
        },
      ],
    });
  });

  test('does not report a baseline survivor as missing after it becomes killed', () => {
    // #given
    const baseline: BaselineEntry[] = [
      { ...mutation, verdict: 'equivalent', reason: 'The values are already equal.' },
    ];

    const rows: ProbeRow[] = [{ ...mutation, result: 'killed' }];

    // #when
    const result = compare(rows, baseline);

    // #then
    expect(result).toEqual({ newSurvivors: [], newTimeouts: [], missing: [] });
  });

  test('reports a survivor with a different nth as new', () => {
    // #given
    const baseline: BaselineEntry[] = [
      { ...mutation, verdict: 'equivalent', reason: 'The values are already equal.' },
    ];

    const rows: ProbeRow[] = [{ ...mutation, nth: 2, result: 'survived' }];

    // #when
    const result = compare(rows, baseline);

    // #then
    expect(result).toEqual({
      newSurvivors: [{ ...mutation, nth: 2, result: 'survived' }],
      newTimeouts: [],
      missing: [{ ...mutation, verdict: 'equivalent', reason: 'The values are already equal.' }],
    });
  });

  test('reports rows whose matching anchor has the other baseline verdict as new', () => {
    // #given
    const baseline: BaselineEntry[] = [
      { ...mutation, verdict: 'timeout', reason: 'The unit test exceeds its limit.' },
      {
        ...mutation,
        text: 'times out as survivor',
        verdict: 'equivalent',
        reason: 'The changed branch is equivalent.',
      },
    ];

    const rows: ProbeRow[] = [
      { ...mutation, result: 'survived' },
      { ...mutation, text: 'times out as survivor', result: 'timeout' },
    ];

    // #when
    const result = compare(rows, baseline);

    // #then
    expect(result).toEqual({
      newSurvivors: [{ ...mutation, result: 'survived' }],
      newTimeouts: [{ ...mutation, text: 'times out as survivor', result: 'timeout' }],
      missing: [],
    });
  });
});

describe('parseBaseline', () => {
  test('rejects duplicate anchors, unknown verdicts and empty reasons', () => {
    // #given
    const invalidBaselines = [
      [
        { ...mutation, verdict: 'equivalent', reason: 'Known equivalent.' },
        { ...mutation, verdict: 'unreachable', reason: 'Duplicate anchor.' },
      ],
      [{ ...mutation, verdict: 'unknown', reason: 'Not an accepted verdict.' }],
      [{ ...mutation, verdict: 'timeout', reason: '' }],
    ];

    // #when
    const messages = invalidBaselines.map((value) => {
      try {
        parseBaseline(value);

        return 'accepted';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });

    // #then
    expect(messages).toEqual([
      `Duplicate baseline anchor: ${[
        'src/replica/example.ts',
        'sample',
        '===→!==',
        'left === right',
        '1',
      ].join('\0')}`,
      'Invalid baseline verdict: unknown',
      'Baseline reason must not be empty',
    ]);
  });

  test('loads the checked-in baseline fixture', async () => {
    // #given
    const path = new URL('./fixtures/baseline-valid.json', import.meta.url).pathname;

    // #when
    const baseline = await loadBaseline(path);

    // #then
    expect(baseline).toEqual([
      {
        file: 'src/replica/example.ts',
        fn: 'sample',
        op: '===→!==',
        text: 'left === right',
        nth: 1,
        verdict: 'equivalent',
        reason: 'The caller already checks the same values.',
      },
    ]);
  });

  test('loads 65 survivor entries and 3 timeout entries from the committed baseline', async () => {
    // #given
    const path = new URL('../probe-baseline.json', import.meta.url).pathname;

    // #when
    const baseline = await loadBaseline(path);

    // #then
    expect({
      survivors: baseline.filter(({ verdict }) => verdict !== 'timeout').length,
      timeouts: baseline.filter(({ verdict }) => verdict === 'timeout').length,
    }).toEqual({ survivors: 65, timeouts: 3 });
  });
});

describe('formatReport', () => {
  test('prints the required fields for each new result and every missing anchor', () => {
    // #given
    const comparison = {
      newSurvivors: [{ ...mutation, result: 'survived' as const }],
      newTimeouts: [{ ...mutation, text: 'retry()', result: 'timeout' as const }],
      missing: [
        {
          ...mutation,
          text: 'unused === guard',
          nth: 2,
          verdict: 'unreachable' as const,
          reason: 'No caller can reach this state.',
        },
      ],
    };

    // #when
    const report = formatReport(comparison);

    // #then
    expect(report).toBe(
      [
        'New survivors:',
        'src/replica/example.ts:4 sample ===→!== === -> !== [anchor: left === right #1]',
        'New timeouts:',
        'src/replica/example.ts:4 sample ===→!== === -> !== [anchor: retry() #1]',
        'Missing baseline entries:',
        'src/replica/example.ts sample ===→!== unused === guard #2',
      ].join('\n'),
    );
  });
});
