import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import { atom } from 'nanostores';
import type { FieldValue, VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';
import {
  createPendingMarks,
  fieldUnit,
  NO_MARKS,
  nextMarkDeadline,
  nextMarkState,
  pendingUnits,
  recordUnit,
  type MarkUnit,
} from './pending-marks';
import type { PendingEntry } from './projection-store';
import { rowPending } from './sheet/pending-mark';

const DELAY = 1000;
const KEY = 'blk:a';

const PLAYER: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'PLAYER',
};

describe('the units of pending entries', () => {
  test('makes a unit of each record and each field an edit changes; only a removal is immediate', () => {
    // #given
    const entries = new Map([
      [KEY, edit({ str: 11, dex: 2 })],
      ['blk:a:i:r1', remove('blk:a:i:r1')],
    ]);

    // #when
    const units = pendingUnits(entries);
    // #then
    expect([...units]).toEqual([
      [
        recordUnit(KEY),
        {
          value: '{"order":0,"cells":{"str":[11,2,"p"],"dex":[2,2,"p"]}}',
          immediate: false,
        },
      ],
      [fieldUnit(KEY, 'str'), { value: '11', immediate: false }],
      [fieldUnit(KEY, 'dex'), { value: '2', immediate: false }],
      [recordUnit('blk:a:i:r1'), { value: 'null', immediate: true }],
    ]);
  });
  test('an edited field does not mark another row that shares the root block key', () => {
    // #given
    const pending = {
      entries: new Map([[KEY, edit({ str: 11 })]]),
      marked: new Set([recordUnit(KEY), fieldUnit(KEY, 'str')]),
    };

    // #when
    const otherRow = rowPending(pending, KEY, new Set(['dex']), false);
    // #then
    expect(otherRow).toEqual({ removed: false, rowMarked: false, markedFields: new Set() });
  });
});

describe('the mark state of pending units', () => {
  test('marks a unit only once its value has waited the delay', () => {
    // #given
    const first = nextMarkState(NO_MARKS, units(['u', '1']), 0, false, DELAY);
    // #when
    const early = nextMarkState(first, units(['u', '1']), 999, false, DELAY);
    const due = nextMarkState(early, units(['u', '1']), 1000, false, DELAY);
    // #then
    expect([[...first.marked], [...early.marked], [...due.marked]]).toEqual([[], [], ['u']]);
  });
  test('starts the delay again when the value of a unit changes, also after its mark showed', () => {
    // #given
    const first = nextMarkState(NO_MARKS, units(['u', '1']), 0, false, DELAY);
    const shown = nextMarkState(first, units(['u', '1']), 1000, false, DELAY);
    // #when
    const typed = nextMarkState(shown, units(['u', '12']), 1500, false, DELAY);
    const due = nextMarkState(typed, units(['u', '12']), 2500, false, DELAY);
    // #then
    expect([[...shown.marked], [...typed.marked], [...due.marked]]).toEqual([['u'], [], ['u']]);
  });
  test('gives a second unit its own delay', () => {
    // #given
    const first = nextMarkState(NO_MARKS, units(['str', '1']), 0, false, DELAY);
    // #when
    const both = nextMarkState(first, units(['str', '1'], ['dex', '2']), 1000, false, DELAY);
    // #then
    expect([...both.marked]).toEqual(['str']);
  });
  test('marks an immediate unit at once', () => {
    // #when
    const state = nextMarkState(
      NO_MARKS,
      new Map([['u', { value: 'null', immediate: true }]]),
      0,
      false,
      DELAY,
    );

    // #then
    expect([...state.marked]).toEqual(['u']);
  });
  test('marks a unit at once while no GM answers', () => {
    // #when
    const state = nextMarkState(NO_MARKS, units(['u', '1']), 0, true, DELAY);
    // #then
    expect([...state.marked]).toEqual(['u']);
  });
  test('keeps a shown mark when the GM comes back, until its unit leaves', () => {
    // #given
    const offline = nextMarkState(NO_MARKS, units(['u', '1']), 0, true, DELAY);
    // #when
    const online = nextMarkState(offline, units(['u', '1']), 10, false, DELAY);
    const answered = nextMarkState(online, new Map(), 20, false, DELAY);
    // #then
    expect([[...online.marked], [...answered.marked], answered.since.size]).toEqual([['u'], [], 0]);
  });
  test('is due next at the earliest unmarked unit, and at no time once all are marked', () => {
    // #given
    const first = nextMarkState(NO_MARKS, units(['a', '1']), 100, false, DELAY);
    const both = nextMarkState(first, units(['a', '1'], ['b', '1']), 400, false, DELAY);
    const all = nextMarkState(both, units(['a', '1'], ['b', '1']), 1400, false, DELAY);
    // #then
    expect([nextMarkDeadline(both, DELAY), nextMarkDeadline(all, DELAY)]).toEqual([1100, null]);
  });
});

describe('the pending marks of a window', () => {
  test('shows a mark after the delay with no answer, and drops it with no wait when answered', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map());
    const marks = createPendingMarks({ $pending, $sync: atom(PLAYER), delayMs: DELAY, ...clock });
    $pending.set(new Map([[KEY, edit({ str: 11 })]]));
    const before = [...marks.$marked.get()];
    // #when
    clock.advance(DELAY);
    const after = [...marks.$marked.get()].sort();
    $pending.set(new Map());
    // #then
    expect({ before, after, answered: [...marks.$marked.get()] }).toEqual({
      before: [],
      after: [fieldUnit(KEY, 'str'), recordUnit(KEY)].sort(),
      answered: [],
    });
    marks.stop();
  });
  test('never shows the mark of an entry answered within the delay', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map());
    const marks = createPendingMarks({ $pending, $sync: atom(PLAYER), delayMs: DELAY, ...clock });
    const seen: string[][] = [];
    marks.$marked.listen((marked) => {
      seen.push([...marked]);
    });
    $pending.set(new Map([[KEY, edit({ str: 11 })]]));
    clock.advance(DELAY - 1);
    // #when
    $pending.set(new Map());
    clock.advance(DELAY);
    // #then
    expect({ seen, timers: clock.waiting() }).toEqual({ seen: [], timers: 0 });
    marks.stop();
  });
  test('marks a second field edited a second later only after its own delay', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map([[KEY, edit({ str: 11 })]]));
    const marks = createPendingMarks({ $pending, $sync: atom(PLAYER), delayMs: DELAY, ...clock });
    clock.advance(DELAY);
    // #when
    $pending.set(new Map([[KEY, edit({ str: 11, dex: 2 })]]));
    const atOnce = marks.$marked.get().has(fieldUnit(KEY, 'dex'));
    clock.advance(DELAY);
    // #then
    expect({ atOnce, later: marks.$marked.get().has(fieldUnit(KEY, 'dex')) }).toEqual({
      atOnce: false,
      later: true,
    });
    marks.stop();
  });
  test('shows the mark at once when the GM link is offline after the first catch-up', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map());
    const $sync = atom<SyncState>({ ...PLAYER, gmLink: 'offline' });
    const marks = createPendingMarks({ $pending, $sync, delayMs: DELAY, ...clock });
    // #when
    $pending.set(new Map([[KEY, edit({ str: 11 })]]));
    // #then
    expect(marks.$marked.get().has(fieldUnit(KEY, 'str'))).toBe(true);
    marks.stop();
  });
  test('waits the delay while the first catch-up runs, as no GM was missed yet', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map());

    const $sync = atom<SyncState>({
      ...PLAYER,
      state: 'catching-up',
      firstCatchUpDone: false,
      gmLink: 'offline',
    });

    const marks = createPendingMarks({ $pending, $sync, delayMs: DELAY, ...clock });
    // #when
    $pending.set(new Map([[KEY, edit({ str: 11 })]]));
    // #then
    expect([...marks.$marked.get()]).toEqual([]);
    marks.stop();
  });
  test('shows the mark at once when the GM link goes offline during the delay', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map([[KEY, edit({ str: 11 })]]));
    const $sync = atom(PLAYER);
    const marks = createPendingMarks({ $pending, $sync, delayMs: DELAY, ...clock });
    clock.advance(100);
    // #when
    $sync.set({ ...PLAYER, gmLink: 'offline' });
    // #then
    expect(marks.$marked.get().has(fieldUnit(KEY, 'str'))).toBe(true);
    marks.stop();
  });
  test('shows no mark for a GM, even past the delay', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map([[KEY, edit({ str: 11 })]]));
    const $sync = atom<SyncState>({ ...PLAYER, gmLink: 'offline', role: 'GM' });
    const marks = createPendingMarks({ $pending, $sync, delayMs: DELAY, ...clock });
    // #when
    clock.advance(DELAY * 2);
    // #then
    expect([...marks.$marked.get()]).toEqual([]);
    marks.stop();
  });
  test('drops its marks on a change of role to GM, and starts every delay again after it', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map([[KEY, edit({ str: 11 })]]));
    const $sync = atom(PLAYER);
    const marks = createPendingMarks({ $pending, $sync, delayMs: DELAY, ...clock });
    clock.advance(DELAY);
    // #when
    $sync.set({ ...PLAYER, role: 'GM' });
    const asGm = [...marks.$marked.get()];
    $sync.set(PLAYER);
    const back = [...marks.$marked.get()];
    // #then
    expect({ asGm, back }).toEqual({ asGm: [], back: [] });
    marks.stop();
  });
  test('stop() cancels its timer and follows no further change', () => {
    // #given
    const clock = createClock();
    const $pending = atom<ReadonlyMap<string, PendingEntry>>(new Map([[KEY, edit({ str: 11 })]]));
    const marks = createPendingMarks({ $pending, $sync: atom(PLAYER), delayMs: DELAY, ...clock });
    const waitingBefore = clock.waiting();
    // #when
    marks.stop();
    $pending.set(new Map([['blk:a', edit({ dex: 1 })]]));
    clock.advance(DELAY * 2);
    // #then
    expect({ waitingBefore, waiting: clock.waiting(), marked: [...marks.$marked.get()] }).toEqual({
      waitingBefore: 1,
      waiting: 0,
      marked: [],
    });
  });
});

// Units that wait for their delay, by id and value.
function units(...entries: [string, string][]): Map<string, MarkUnit> {
  return new Map(entries.map(([id, value]) => [id, { value, immediate: false }]));
}

// An edit of `KEY` whose every value differs from the applied record, which holds none.
function edit(values: Record<string, FieldValue>): PendingEntry {
  const record: VersionedRecord = fixtureRecord(KEY, values, 2, 'p');

  return { kind: 'edit', fields: new Map(Object.entries(values)), record, applied: undefined };
}

function remove(key: string): PendingEntry {
  const record: VersionedRecord = fixtureRecord(key, null, 2, 'p');

  return { kind: 'remove', fields: new Map(), record, applied: undefined };
}

// A clock that moves only when the test advances it, and runs the timers due by then.
type FakeClock = {
  now: () => number;
  schedule: (run: () => void, delay: number) => () => void;
  advance: (milliseconds: number) => void;
  waiting: () => number;
};

function createClock(): FakeClock {
  let time = 0;

  let timers: {
    at: number;
    run: () => void;
  }[] = [];

  return {
    now: () => time,
    schedule: (run, delay) => {
      const timer = { at: time + delay, run };
      timers.push(timer);

      return () => {
        timers = timers.filter((one) => one !== timer);
      };
    },
    advance: (milliseconds) => {
      time += milliseconds;
      const due = timers.filter((timer) => timer.at <= time);
      timers = timers.filter((timer) => timer.at > time);

      for (const timer of due) {
        timer.run();
      }
    },
    waiting: () => timers.length,
  };
}
