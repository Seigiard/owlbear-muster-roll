import { z } from 'zod';

import type { Mutation } from './generate';

export type ProbeResult = 'killed' | 'survived' | 'timeout';

export type ProbeRow = Mutation & { result: ProbeResult };

export type BaselineEntry = Pick<Mutation, 'file' | 'fn' | 'op' | 'text' | 'nth'> & {
  verdict: 'equivalent' | 'unreachable' | 'timeout';
  reason: string;
};

export type BaselineInput = Pick<Mutation, 'file' | 'fn' | 'op' | 'text' | 'nth'> & {
  verdict: string;
  reason: string;
};

export type Comparison = {
  newSurvivors: ProbeRow[];
  newTimeouts: ProbeRow[];
  missing: BaselineEntry[];
};

type Anchor = Pick<Mutation, 'file' | 'fn' | 'op' | 'text' | 'nth'>;

const baselineInputSchema = z.object({
  file: z.string().min(1),
  fn: z.string().min(1),
  op: z.string().min(1),
  text: z.string().min(1),
  nth: z.number().int().positive(),
  verdict: z.string(),
  reason: z.string(),
});

export function anchorKey(entry: Anchor): string {
  return [entry.file, entry.fn, entry.op, entry.text, entry.nth].join('\0');
}

export function compare(rows: ProbeRow[], baseline: BaselineEntry[]): Comparison {
  const baselineByKey = new Map(baseline.map((entry) => [anchorKey(entry), entry]));
  const generatedKeys = new Set(rows.map(anchorKey));

  return {
    newSurvivors: rows.filter((row) => {
      const entry = baselineByKey.get(anchorKey(row));

      return (
        row.result === 'survived' &&
        entry?.verdict !== 'equivalent' &&
        entry?.verdict !== 'unreachable'
      );
    }),
    newTimeouts: rows.filter((row) => {
      const entry = baselineByKey.get(anchorKey(row));

      return row.result === 'timeout' && entry?.verdict !== 'timeout';
    }),
    missing: baseline.filter((entry) => !generatedKeys.has(anchorKey(entry))),
  };
}

export function formatReport(comparison: Comparison): string {
  const lines = ['New survivors:'];

  lines.push(
    ...comparison.newSurvivors.map(
      ({ file, line, fn, op, before, after, text, nth }) =>
        `${file}:${line} ${fn} ${op} ${before} -> ${after} [anchor: ${text} #${nth}]`,
    ),
  );

  lines.push('New timeouts:');
  lines.push(
    ...comparison.newTimeouts.map(
      ({ file, line, fn, op, before, after, text, nth }) =>
        `${file}:${line} ${fn} ${op} ${before} -> ${after} [anchor: ${text} #${nth}]`,
    ),
  );

  lines.push('Missing baseline entries:');
  lines.push(
    ...comparison.missing.map(
      ({ file, fn, op, text, nth }) => `${file} ${fn} ${op} ${text} #${nth}`,
    ),
  );

  return lines.join('\n');
}

export function parseBaseline(entries: readonly unknown[]): BaselineEntry[] {
  const parsed: BaselineEntry[] = [];
  const keys = new Set<string>();

  for (const input of entries) {
    const entry = baselineInputSchema.parse(input);

    if (
      entry.verdict !== 'equivalent' &&
      entry.verdict !== 'unreachable' &&
      entry.verdict !== 'timeout'
    ) {
      throw new Error(`Invalid baseline verdict: ${entry.verdict}`);
    }

    if (entry.reason.trim().length === 0) {
      throw new Error('Baseline reason must not be empty');
    }

    const normalized: BaselineEntry = {
      file: entry.file,
      fn: entry.fn,
      op: entry.op,
      text: entry.text,
      nth: entry.nth,
      verdict: entry.verdict,
      reason: entry.reason,
    };

    const key = anchorKey(normalized);

    if (keys.has(key)) {
      throw new Error(`Duplicate baseline anchor: ${key}`);
    }

    keys.add(key);
    parsed.push(normalized);
  }

  return parsed;
}

export async function loadBaseline(path: string): Promise<BaselineEntry[]> {
  const entries: unknown = await Bun.file(path).json();

  if (!Array.isArray(entries)) {
    throw new Error('Baseline must be an array');
  }

  return parseBaseline(entries);
}
