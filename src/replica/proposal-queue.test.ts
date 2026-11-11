import { describe, expect, spyOn, test } from 'bun:test';

import type { Version } from '@/core/merge';
import type { PresetTemplate } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import {
  combinePatches,
  createProposalQueue,
  proposedRecord,
  strippedPatch,
  type ProposalEntry,
  type ProposalQueue,
} from '@/replica/proposal-queue';

// A queue whose sends and resend timers the test runs by hand.
type Rig = {
  queue: ProposalQueue;
  // Every compose the queue handed over, in order, until the test runs it.
  composes: (() => VersionedRecord | null)[];
  // Settles the send of each compose handed over, in the same order: as sent, or as failed.
  settles: { resolve: () => void; reject: (error: Error) => void }[];
  // The armed resends, oldest first, with the delay each asked for.
  timers: { run: () => void; delay: number; cancelled: boolean }[];
};

const MINT = (): Version => ({ c: 9, a: 'p-conn' });

function createRig(): Rig {
  const composes: Rig['composes'] = [];
  const settles: Rig['settles'] = [];
  const timers: Rig['timers'] = [];

  const queue = createProposalQueue({
    timing: { proposeResendStartMs: 2000, proposeResendMaxMs: 30000 },
    enqueue: (compose) => {
      composes.push(compose);

      return new Promise((resolve, reject) => {
        settles.push({ resolve, reject });
      });
    },
    schedule: (run, delay) => {
      const timer = { run, delay, cancelled: false };

      timers.push(timer);

      return () => {
        timer.cancelled = true;
      };
    },
  });

  return { queue, composes, settles, timers };
}

function entry(k: string, c: number | null, str = c ?? 0): ProposalEntry {
  return {
    k,
    patch: { kind: 'fields', values: { str } },
    record: c === null ? null : { k, d: { str }, c, a: 'p-conn' },
    sent: false,
  };
}

// Runs every compose handed over so far, as the send queue does when it takes them.
function sendAll(rig: Rig): (VersionedRecord | null)[] {
  return rig.composes.splice(0).map((compose) => compose());
}

// Runs the newest armed resend that is still armed.
function fireResend(rig: Rig): number {
  const armed = rig.timers.filter((one) => !one.cancelled);
  const timer = armed[armed.length - 1];

  if (timer === undefined) {
    throw new Error('no resend is armed');
  }

  timer.cancelled = true;
  timer.run();

  return timer.delay;
}

describe('proposal queue', () => {
  test('sends only the newest version of a key put twice before the send queue takes it', () => {
    // #given
    const rig = createRig();

    // #when
    rig.queue.put(entry('row:brok:str', 1));
    rig.queue.put(entry('row:brok:str', 2));

    // #then
    expect(sendAll(rig)).toEqual([{ k: 'row:brok:str', d: { str: 2 }, c: 2, a: 'p-conn' }]);
  });

  test('resends after 2000 ms, then twice as long each time, up to 30000 ms', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    sendAll(rig);

    // #when
    const delays = Array.from({ length: 7 }, () => {
      const delay = fireResend(rig);

      sendAll(rig);

      return delay;
    });

    // #then
    expect(delays).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  test('a newer version starts the backoff again at 2000 ms', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    fireResend(rig);
    fireResend(rig);

    // #when
    rig.queue.put(entry('row:brok:str', 2));

    // #then
    expect(rig.timers.filter((timer) => !timer.cancelled).map((timer) => timer.delay)).toEqual([
      2000,
    ]);
  });

  test('sends and resends two keys independently', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    rig.queue.put(entry('row:brok:dex', 1));
    sendAll(rig);

    // #when
    fireResend(rig);

    // #then
    expect(sendAll(rig).map((record) => record?.k)).toEqual(['row:brok:dex']);
  });

  test('sends nothing for an entry that waits for its c, nor for one dropped before the take', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    rig.queue.put(entry('row:brok:str', null));
    rig.queue.put(entry('row:brok:dex', 1));
    rig.queue.drop('row:brok:dex');

    // #when
    const sent = sendAll(rig);

    // #then
    expect({ sent, armed: rig.timers.filter((timer) => !timer.cancelled).length }).toEqual({
      sent: [null, null],
      armed: 0,
    });
  });

  test('a key dropped and put again before the take sends its new version once', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    rig.queue.drop('row:brok:str');

    // #when
    rig.queue.put(entry('row:brok:str', 2));

    // #then
    expect(sendAll(rig)).toEqual([null, { k: 'row:brok:str', d: { str: 2 }, c: 2, a: 'p-conn' }]);
  });

  test('a cleared queue sends a key put again after the clear', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    rig.queue.clear();

    // #when
    rig.queue.put(entry('row:brok:str', 2));

    // #then
    expect(sendAll(rig)).toEqual([null, { k: 'row:brok:str', d: { str: 2 }, c: 2, a: 'p-conn' }]);
  });

  test.each<[string, (settle: Rig['settles'][number]) => void]>([
    ['fails', (settle) => settle.reject(new Error('stopped'))],
    ['settles with nothing composed', (settle) => settle.resolve()],
  ])('a send that %s frees its key for the next version', async (_name, settle) => {
    // #given
    const rig = createRig();
    const errors = spyOn(console, 'error').mockImplementation(() => {});

    rig.queue.put(entry('row:brok:str', 1));
    rig.composes.splice(0);

    const [first] = rig.settles;

    if (first !== undefined) {
      settle(first);
    }

    await Promise.resolve();

    // #when
    rig.queue.put(entry('row:brok:str', 2));
    errors.mockRestore();

    // #then
    expect(sendAll(rig)).toEqual([{ k: 'row:brok:str', d: { str: 2 }, c: 2, a: 'p-conn' }]);
  });

  test('matches only the (k, c, a) of the newest version of an entry', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    rig.queue.put(entry('row:brok:str', 2));

    // #when
    const matched = [
      rig.queue.matching({ k: 'row:brok:str', c: 1, a: 'p-conn' }),
      rig.queue.matching({ k: 'row:brok:str', c: 2, a: 'other' }),
      rig.queue.matching({ k: 'row:brok:str', c: 2, a: 'p-conn' })?.record?.c,
    ];

    // #then
    expect(matched).toEqual([undefined, undefined, 2]);
  });

  test('marks an entry sent once the send queue takes a version of it', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));

    // #when
    const before = rig.queue.get('row:brok:str')?.sent;

    sendAll(rig);

    // #then
    expect([before, rig.queue.get('row:brok:str')?.sent]).toEqual([false, true]);
  });

  test('resendAll sends every minted entry at once and starts its backoff again', () => {
    // #given
    const rig = createRig();

    rig.queue.put(entry('row:brok:str', 1));
    rig.queue.put(entry('row:brok:dex', null));
    sendAll(rig);
    fireResend(rig);
    sendAll(rig);

    // #when
    rig.queue.resendAll();

    // #then
    expect({
      sent: sendAll(rig).map((record) => record?.k),
      armed: rig.timers.filter((timer) => !timer.cancelled).map((timer) => timer.delay),
    }).toEqual({ sent: ['row:brok:str'], armed: [2000] });
  });
});

describe('combinePatches', () => {
  test('puts a field edit into the cells of a new row, which keeps its order', () => {
    // #when
    const combined = combinePatches(
      { kind: 'add', d: { order: 3, cells: { item: 'Меч' } } },
      { kind: 'fields', values: { qty: 2, item: null } },
    );

    // #then
    expect(combined).toEqual({ kind: 'add', d: { order: 3, cells: { qty: 2 } } });
  });

  test('keeps every field of two edits, the newer value winning', () => {
    // #when
    const combined = combinePatches(
      { kind: 'fields', values: { str: 1, dex: 2 } },
      { kind: 'fields', values: { str: 5 } },
    );

    // #then
    expect(combined).toEqual({ kind: 'fields', values: { str: 5, dex: 2 } });
  });

  test('a removal replaces a new row and a field edit', () => {
    // #when
    const combined = [
      combinePatches({ kind: 'add', d: { order: 0, cells: {} } }, { kind: 'remove' }),
      combinePatches({ kind: 'fields', values: { qty: 1 } }, { kind: 'remove' }),
    ];

    // #then
    expect(combined).toEqual([{ kind: 'remove' }, { kind: 'remove' }]);
  });
});

describe('proposedRecord', () => {
  const ROW: VersionedRecord = { k: 'row:brok:str', d: { str: 5, note: 'x' }, c: 3, a: 'gm' };

  const REP: VersionedRecord = {
    k: 'rep:brok:item:r1',
    d: { order: 2, cells: { item: 'Меч' } },
    c: 3,
    a: 'gm',
  };

  const REMOVED: VersionedRecord = { k: 'rep:brok:item:r1', d: null, c: 4, a: 'gm' };

  test('sets and clears fields of the row over its newest record', () => {
    // #when
    const made = proposedRecord(
      ROW.k,
      { kind: 'fields', values: { str: 6, note: null } },
      ROW,
      MINT,
    );

    // #then
    expect(made).toEqual({ ok: true, value: { k: ROW.k, d: { str: 6 }, c: 9, a: 'p-conn' } });
  });

  test('starts a row with no record empty', () => {
    // #when
    const made = proposedRecord(ROW.k, { kind: 'fields', values: { str: 1 } }, undefined, MINT);

    // #then
    expect(made).toEqual({ ok: true, value: { k: ROW.k, d: { str: 1 }, c: 9, a: 'p-conn' } });
  });

  test('refuses a patch the record already holds, unless forced', () => {
    // #when
    const made = [
      proposedRecord(ROW.k, { kind: 'fields', values: { str: 5 } }, ROW, MINT),
      proposedRecord(ROW.k, { kind: 'fields', values: { str: 5 } }, ROW, MINT, true),
    ];

    // #then
    expect(made).toEqual([
      { ok: false, error: 'unchanged' },
      { ok: true, value: { k: ROW.k, d: { str: 5, note: 'x' }, c: 9, a: 'p-conn' } },
    ]);
  });

  test('edits the cells of a live repeat row and keeps its order', () => {
    // #when
    const made = proposedRecord(REP.k, { kind: 'fields', values: { qty: 2 } }, REP, MINT);

    // #then
    expect(made).toEqual({
      ok: true,
      value: { k: REP.k, d: { order: 2, cells: { item: 'Меч', qty: 2 } }, c: 9, a: 'p-conn' },
    });
  });

  test('a new row keeps its own order and cells over a live record of its key', () => {
    // #when
    const made = proposedRecord(
      REP.k,
      { kind: 'add', d: { order: 7, cells: { qty: 1 } } },
      REP,
      MINT,
    );

    // #then
    expect(made).toEqual({
      ok: true,
      value: { k: REP.k, d: { order: 7, cells: { qty: 1 } }, c: 9, a: 'p-conn' },
    });
  });

  test('a removal stays a removal over a live row, and over no record', () => {
    // #when
    const made = [
      proposedRecord(REP.k, { kind: 'remove' }, REP, MINT),
      proposedRecord(REP.k, { kind: 'remove' }, undefined, MINT),
    ];

    // #then
    expect(made).toEqual([
      { ok: true, value: { k: REP.k, d: null, c: 9, a: 'p-conn' } },
      { ok: true, value: { k: REP.k, d: null, c: 9, a: 'p-conn' } },
    ]);
  });

  test('an edit or a new row over a removed repeat row is gone, and its removal unchanged', () => {
    // #when
    const made = [
      proposedRecord(REP.k, { kind: 'fields', values: { qty: 2 } }, REMOVED, MINT, true),
      proposedRecord(REP.k, { kind: 'add', d: { order: 0, cells: {} } }, REMOVED, MINT, true),
      proposedRecord(REP.k, { kind: 'fields', values: { qty: 2 } }, undefined, MINT),
      proposedRecord(REP.k, { kind: 'remove' }, REMOVED, MINT, true),
    ];

    // #then
    expect(made).toEqual([
      { ok: false, error: 'gone' },
      { ok: false, error: 'gone' },
      { ok: false, error: 'gone' },
      { ok: false, error: 'unchanged' },
    ]);
  });
});

describe('strippedPatch', () => {
  const TEMPLATE: PresetTemplate = {
    sections: [
      {
        rows: [
          [
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'field', type: 'check', id: 'str_tired' },
          ],
        ],
      },
      {
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'attack' },
            { kind: 'field', type: 'number', id: 'bonus' },
          ],
        ],
      },
    ],
  };

  test('returns the same patch when the template has every field', () => {
    // #given
    const patch = { kind: 'fields', values: { str: 3, str_tired: null } } as const;

    // #then
    expect(strippedPatch('row:brok:str', patch, TEMPLATE)).toBe(patch);
  });

  test('drops the fields the row no longer has, and values of another type', () => {
    // #when
    const stripped = strippedPatch(
      'row:brok:str',
      { kind: 'fields', values: { str: 3, str_tired: 'yes', gone: 1 } },
      TEMPLATE,
    );

    // #then
    expect(stripped).toEqual({ kind: 'fields', values: { str: 3 } });
  });

  test.each<[string, string, Parameters<typeof strippedPatch>[1]]>([
    ['only removed fields', 'row:brok:str', { kind: 'fields', values: { gone: 1 } }],
    ['a row the template no longer has', 'row:brok:gone', { kind: 'fields', values: { gone: 1 } }],
    ['a removal in a section that is gone', 'rep:brok:spell:i1', { kind: 'remove' }],
    [
      'a new row in a section that is gone',
      'rep:brok:spell:i1',
      { kind: 'add', d: { order: 0, cells: {} } },
    ],
  ])('leaves nothing of %s', (_name, key, patch) => {
    // #then
    expect(strippedPatch(key, patch, TEMPLATE)).toBeNull();
  });

  test('keeps a new repeat row with only the cells its section has', () => {
    // #when
    const stripped = strippedPatch(
      'rep:brok:attack:i1',
      { kind: 'add', d: { order: 2, cells: { attack: 'Меч', range: 30 } } },
      TEMPLATE,
    );

    // #then
    expect(stripped).toEqual({ kind: 'add', d: { order: 2, cells: { attack: 'Меч' } } });
  });
});
