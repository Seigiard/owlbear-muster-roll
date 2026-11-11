import { atom, type ReadableAtom } from 'nanostores';

import type { SyncState } from '@/core/ui-messages';

import type { PendingEntry } from './projection-store';

// One thing that carries a mark: a changed field, or a whole record. `value` is its pending value
// as JSON, so a newer version of it starts its delay again. `immediate` marks it with no delay.
export type MarkUnit = { value: string; immediate: boolean };

// When each unit took its pending value, on the window's clock, and the units whose mark shows. A
// shown mark stays while its value does, so a GM that comes back does not hide it again.
export type MarkState = {
  since: ReadonlyMap<string, { value: string; start: number }>;
  marked: ReadonlySet<string>;
};

export const NO_MARKS: MarkState = { since: new Map(), marked: new Set() };

export type PendingMarksOptions = {
  $pending: ReadableAtom<ReadonlyMap<string, PendingEntry>>;
  $sync: ReadableAtom<SyncState>;
  delayMs: number;
  // Tests inject the clock and the timer.
  now?: () => number;
  schedule?: (run: () => void, delay: number) => () => void;
};

export type PendingMarks = {
  // UX-DR3: the units, by `recordUnit` and `fieldUnit`, whose "Ожидает" shows.
  $marked: ReadableAtom<ReadonlySet<string>>;
  stop: () => void;
};

// The unit of a whole record: a new or removed repeat row, or an edit whose changed fields show in
// no field of its row, as one edited back to the applied value.
export function recordUnit(key: string): string {
  return key;
}

// Keys and field ids hold no line break, so a field's unit never equals a record's.
export function fieldUnit(key: string, fieldId: string): string {
  return `${key}\n${fieldId}`;
}

// The record key a unit belongs to.
export function unitKey(unit: string): string {
  const end = unit.indexOf('\n');

  return end === -1 ? unit : unit.slice(0, end);
}

// Every pending record is a unit, and so is every field an edit changes. A removal is marked at
// once: its row already shows dimmed and disabled, so it must say why.
export function pendingUnits(entries: ReadonlyMap<string, PendingEntry>): Map<string, MarkUnit> {
  const units = new Map<string, MarkUnit>();

  for (const [key, entry] of entries) {
    units.set(recordUnit(key), {
      value: JSON.stringify(entry.record.d),
      immediate: entry.kind === 'remove',
    });

    for (const [fieldId, value] of entry.fields) {
      units.set(fieldUnit(key, fieldId), { value: JSON.stringify(value), immediate: false });
    }
  }

  return units;
}

// UX-DR3: a unit's mark shows once its value has waited `delayMs`, at once for a removal, and at
// once while no GM answers. A unit that leaves or changes first shows none for that value.
export function nextMarkState(
  previous: MarkState,
  units: ReadonlyMap<string, MarkUnit>,
  now: number,
  noGm: boolean,
  delayMs: number,
): MarkState {
  const since = new Map<string, { value: string; start: number }>();
  const marked = new Set<string>();

  for (const [id, unit] of units) {
    const before = previous.since.get(id);
    const same = before !== undefined && before.value === unit.value;
    const start = same ? before.start : now;

    since.set(id, { value: unit.value, start });

    if (noGm || unit.immediate || (same && previous.marked.has(id)) || now - start >= delayMs) {
      marked.add(id);
    }
  }

  return { since, marked };
}

// The earliest time a unit not marked yet is due its mark, or `null` when none waits.
export function nextMarkDeadline(state: MarkState, delayMs: number): number | null {
  let deadline: number | null = null;

  for (const [id, { start }] of state.since) {
    if (!state.marked.has(id)) {
      deadline = deadline === null ? start + delayMs : Math.min(deadline, start + delayMs);
    }
  }

  return deadline;
}

// The window runs this timer, not the background, so a hidden background page holds no mark back.
// "No GM" is what the banner says: before the first catch-up ends, `offline` means only that
// nothing was heard yet.
export function createPendingMarks(options: PendingMarksOptions): PendingMarks {
  const { $pending, $sync, delayMs, now = () => performance.now(), schedule = withTimer } = options;
  const $marked = atom<ReadonlySet<string>>(new Set());
  let state = NO_MARKS;
  let cancel: (() => void) | null = null;

  function update(): void {
    cancel?.();
    cancel = null;

    const sync = $sync.get();
    const at = now();
    const noGm = sync.firstCatchUpDone && sync.gmLink === 'offline';

    state =
      sync.role === 'GM'
        ? NO_MARKS
        : nextMarkState(state, pendingUnits($pending.get()), at, noGm, delayMs);

    if (!sameIds(state.marked, $marked.get())) {
      $marked.set(state.marked);
    }

    const deadline = nextMarkDeadline(state, delayMs);

    if (deadline !== null) {
      cancel = schedule(update, Math.max(0, deadline - at));
    }
  }

  const unsubscribePending = $pending.listen(update);
  const unsubscribeSync = $sync.listen(update);

  update();

  return {
    $marked,
    stop: () => {
      cancel?.();
      cancel = null;
      unsubscribePending();
      unsubscribeSync();
    },
  };
}

function sameIds(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
  return first.size === second.size && [...first].every((id) => second.has(id));
}

function withTimer(run: () => void, delay: number): () => void {
  const timer = setTimeout(run, delay);

  return () => {
    clearTimeout(timer);
  };
}
