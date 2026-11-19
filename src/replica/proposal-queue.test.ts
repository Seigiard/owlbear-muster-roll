import { Result } from 'better-result';
import { fixtureCells, fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import { mergeRecords, type Version } from '@/core/merge';
import type { TemplateLayout } from '@/core/preset';
import { presetMoves } from '@/core/preset-migrate';
import { blockDataSchema, cellValues, type VersionedRecord } from '@/core/records';
import {
  combinePatches,
  createProposalQueue,
  movedPatches,
  proposedRecord,
  strippedPatch,
  type ProposalPatch,
  type ProposalEntry,
  type ProposalQueue,
} from '@/replica/proposal-queue';

// A queue whose sends and resend timers the test runs by hand.
type Rig = {
  queue: ProposalQueue;
  // Every compose the queue handed over, in order, until the test runs it.
  composes: (() => VersionedRecord | null)[];
  // Settles the send of each compose handed over, in the same order: as sent, or as failed.
  settles: {
    resolve: () => void;
    reject: (error: Error) => void;
  }[];
  // The armed resends, oldest first, with the delay each asked for.
  timers: {
    run: () => void;
    delay: number;
    cancelled: boolean;
  }[];
  reported: string[];
};

const MINT = (): Version => ({ c: 9, a: 'p-conn' });

function createRig(): Rig {
  const composes: Rig['composes'] = [];
  const settles: Rig['settles'] = [];
  const timers: Rig['timers'] = [];
  const reported: string[] = [];

  const queue = createProposalQueue({
    timing: { proposeResendStartMs: 2000, proposeResendMaxMs: 30000 },
    enqueue: (compose) => {
      composes.push(compose);

      return new Promise((resolve, reject) => {
        settles.push({ resolve, reject });
      });
    },
    signal: new AbortController().signal,
    schedule: (_signal, delay, run) => {
      const timer = { run, delay, cancelled: false };
      timers.push(timer);

      return () => {
        timer.cancelled = true;
      };
    },
    report: (failure: { _tag: string }) => reported.push(failure._tag),
  });

  return { queue, composes, settles, timers, reported };
}

function entry(k: string, c: number | null, str = c ?? 0): ProposalEntry {
  return {
    k,
    patch: { kind: 'fields', values: { str } },
    record: c === null ? null : fixtureRecord(k, { str }, c, 'p-conn'),
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
    rig.queue.put(entry('blk:brok', 1));
    rig.queue.put(entry('blk:brok', 2));
    // #then
    expect(sendAll(rig)).toEqual([
      {
        k: 'blk:brok',
        d: { order: 0, cells: { str: [2, 2, 'p-conn'] } },
        c: 2,
        a: 'p-conn',
        l: [1, 'seed'],
      },
    ]);
  });
  test('resends after 2000 ms, then twice as long each time, up to 30000 ms', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
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
  test('a held version sends nothing at once and goes out on the running backoff', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    sendAll(rig);
    fireResend(rig);
    sendAll(rig);
    // #when
    rig.queue.hold(entry('blk:brok', 2));
    const atOnce = sendAll(rig);
    const delay = fireResend(rig);
    // #then
    expect({ atOnce, delay, resent: sendAll(rig) }).toEqual({
      atOnce: [],
      delay: 4000,
      resent: [
        {
          k: 'blk:brok',
          d: { order: 0, cells: { str: [2, 2, 'p-conn'] } },
          c: 2,
          a: 'p-conn',
          l: [1, 'seed'],
        },
      ],
    });
  });
  test('a newer version starts the backoff again at 2000 ms', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    fireResend(rig);
    fireResend(rig);
    // #when
    rig.queue.put(entry('blk:brok', 2));
    // #then
    expect(rig.timers.filter((timer) => !timer.cancelled).map((timer) => timer.delay)).toEqual([
      2000,
    ]);
  });
  test('sends and resends two keys independently', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    rig.queue.put(entry('blk:brok:item:r1', 1));
    sendAll(rig);
    // #when
    fireResend(rig);
    // #then
    expect(sendAll(rig).map((record) => record?.k)).toEqual(['blk:brok:item:r1']);
  });
  test('sends nothing for an entry that waits for its c, nor for one dropped before the take', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', null));
    rig.queue.put(entry('blk:brok:item:r1', 1));
    rig.queue.drop('blk:brok:item:r1');
    // #when
    const sent = sendAll(rig);
    // #then
    expect({ sent, armed: rig.timers.filter((timer) => !timer.cancelled).length }).toEqual({
      sent: [null],
      armed: 0,
    });
  });
  test('a key dropped and put again before the take sends its new version once', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    rig.queue.drop('blk:brok');
    // #when
    rig.queue.put(entry('blk:brok', 2));
    // #then
    expect(sendAll(rig)).toEqual([
      null,
      {
        k: 'blk:brok',
        d: { order: 0, cells: { str: [2, 2, 'p-conn'] } },
        c: 2,
        a: 'p-conn',
        l: [1, 'seed'],
      },
    ]);
  });
  test('a cleared queue sends a key put again after the clear', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    rig.queue.clear();
    // #when
    rig.queue.put(entry('blk:brok', 2));
    // #then
    expect(sendAll(rig)).toEqual([
      null,
      {
        k: 'blk:brok',
        d: { order: 0, cells: { str: [2, 2, 'p-conn'] } },
        c: 2,
        a: 'p-conn',
        l: [1, 'seed'],
      },
    ]);
  });
  test.each<[string, (settle: Rig['settles'][number]) => void, string[]]>([
    ['fails', (settle) => settle.reject(new Error('stopped')), ['propose-dropped']],
    ['settles with nothing composed', (settle) => settle.resolve(), []],
  ])(
    'a send that %s frees its key for the next version',
    async (_name, settle, expectedReported) => {
      // #given
      const rig = createRig();
      rig.queue.put(entry('blk:brok', 1));
      rig.composes.splice(0);
      const [first] = rig.settles;

      if (first !== undefined) {
        settle(first);
      }

      await Promise.resolve();
      // #when
      rig.queue.put(entry('blk:brok', 2));
      // #then
      expect({ sent: sendAll(rig), reported: rig.reported }).toEqual({
        sent: [
          {
            k: 'blk:brok',
            d: { order: 0, cells: { str: [2, 2, 'p-conn'] } },
            c: 2,
            a: 'p-conn',
            l: [1, 'seed'],
          },
        ],
        reported: expectedReported,
      });
    },
  );
  test('matches only the (k, c, a) of the newest version of an entry', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    rig.queue.put(entry('blk:brok', 2));

    // #when
    const matched = [
      rig.queue.matching({ k: 'blk:brok', c: 1, a: 'p-conn' }),
      rig.queue.matching({ k: 'blk:brok', c: 2, a: 'other' }),
      rig.queue.matching({ k: 'blk:brok', c: 2, a: 'p-conn' })?.record?.c,
    ];

    // #then
    expect(matched).toEqual([undefined, undefined, 2]);
  });
  test('marks an entry sent once the send queue takes a version of it', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    // #when
    const before = rig.queue.get('blk:brok')?.sent;
    sendAll(rig);
    // #then
    expect([before, rig.queue.get('blk:brok')?.sent]).toEqual([false, true]);
  });
  test('resendAll sends every minted entry at once and starts its backoff again', () => {
    // #given
    const rig = createRig();
    rig.queue.put(entry('blk:brok', 1));
    rig.queue.put(entry('blk:brok:item:r1', 1));
    sendAll(rig);
    fireResend(rig);
    sendAll(rig);
    // #when
    rig.queue.resendAll();
    // #then
    expect({
      sent: sendAll(rig).map((record) => record?.k),
      armed: rig.timers.filter((timer) => !timer.cancelled).map((timer) => timer.delay),
    }).toEqual({
      sent: ['blk:brok', 'blk:brok:item:r1'],
      armed: [2000, 2000],
    });
  });
});

describe('proposed repeat blocks', () => {
  const key = 'blk:hero:item:new';
  const lifecycle: [number, string] = [1, 'player'];

  function made(patch: ProposalPatch, counter: number): VersionedRecord {
    const result = proposedRecord(
      key,
      patch,
      undefined,
      () => ({ c: counter, a: 'player' }),
      true,
      lifecycle,
    );

    if (!result.isOk()) throw new Error(result.error);

    return result.value;
  }

  test('a resent creation with new cells keeps its lifecycle independent of its proposal counter', () => {
    // #given
    const first = made({ kind: 'add', d: { order: 0, cells: {} } }, 1);

    const second = made(
      { kind: 'add', d: { order: 0, cells: { item: ['Sword', 2, 'player'] } } },
      2,
    );
    // #when

    const merged = mergeRecords(first, second);
    // #then
    expect({
      lifecycle: merged.l,
      proposalCounter: merged.c,
      values: cellValues(blockDataSchema.parse(merged.d).cells),
    }).toEqual({
      lifecycle: [1, 'player'],
      proposalCounter: 2,
      values: { item: 'Sword' },
    });
  });

  test('deleting a pending creation defeats its delayed creation proposal', () => {
    // #given
    const creation = made({ kind: 'add', d: { order: 0, cells: {} } }, 1);
    const removal = made({ kind: 'remove' }, 2);
    // #when
    const merged = mergeRecords(removal, creation);
    // #then
    expect({ lifecycle: merged.l, data: merged.d }).toEqual({
      lifecycle: [1, 'player'],
      data: null,
    });
  });
});

describe('combinePatches', () => {
  test('puts a field edit into the cells of a new row, which keeps its order', () => {
    // #when
    const combined = combinePatches(
      { kind: 'add', d: { order: 3, cells: fixtureCells({ item: 'Меч' }, 1, 'pending') } },
      { kind: 'fields', values: { qty: 2, item: null } },
    );

    // #then
    expect(combined).toEqual({
      kind: 'add',
      d: {
        order: 3,
        cells: { item: [null, 1, 'pending'], qty: [2, 1, 'pending'] },
      },
    });
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

describe('movedPatches', () => {
  test('keeps pending edits under every unchanged repeat scope', () => {
    // #given
    const template: TemplateLayout = {
      tabs: [
        {
          repeat: { id: 'npc', nameField: 'npc_name' },
          sections: [
            {
              rows: [
                {
                  cells: [{ kind: 'field', type: 'text', id: 'npc_name' }],
                },
              ],
            },
            {
              repeat: { id: 'atk', nameField: 'attack_name' },
              rows: [
                {
                  cells: [{ kind: 'field', type: 'text', id: 'attack_name' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const patch: ProposalPatch = { kind: 'fields', values: { npc_name: 'Skeleton' } };
    const moves = presetMoves(template, template);

    // #when
    const moved = [
      movedPatches('blk:s:npc:a', patch, moves),
      movedPatches('blk:s:npc:a:atk:x', patch, moves),
    ];

    // #then
    expect(moved).toEqual([[{ k: 'blk:s:npc:a', patch }], [{ k: 'blk:s:npc:a:atk:x', patch }]]);
  });
});

describe('proposedRecord', () => {
  const ROW: VersionedRecord = {
    k: 'blk:brok',
    d: { order: 0, cells: { str: [5, 3, 'gm'], note: ['x', 3, 'gm'] } },
    c: 3,
    a: 'gm',
    l: [1, 'seed'],
  };

  const REP: VersionedRecord = {
    k: 'blk:brok:item:r1',
    d: { order: 2, cells: { item: ['Меч', 3, 'gm'] } },
    c: 3,
    a: 'gm',
    l: [1, 'seed'],
  };

  const REMOVED: VersionedRecord = {
    k: 'blk:brok:item:r1',
    d: null,
    c: 4,
    a: 'gm',
    l: [1, 'seed'],
  };

  test('sets and clears fields of the row over its newest record', () => {
    // #when
    const made = proposedRecord(
      ROW.k,
      { kind: 'fields', values: { str: 6, note: null } },
      ROW,
      MINT,
    );

    // #then
    expect(made).toEqual(
      Result.ok({
        k: ROW.k,
        d: {
          order: 0,
          cells: { str: [6, 9, 'p-conn'], note: [null, 9, 'p-conn'] },
        },
        c: 9,
        a: 'p-conn',
        l: [1, 'seed'],
      }),
    );
  });
  test('starts a row with no record empty', () => {
    // #when
    const made = proposedRecord(ROW.k, { kind: 'fields', values: { str: 1 } }, undefined, MINT);
    // #then
    expect(made).toEqual(
      Result.ok({
        k: ROW.k,
        d: { order: 0, cells: { str: [1, 9, 'p-conn'] } },
        c: 9,
        a: 'p-conn',
        l: [9, 'p-conn'],
      }),
    );
  });
  test('refuses a patch the record already holds, unless forced', () => {
    // #when
    const made = [
      proposedRecord(ROW.k, { kind: 'fields', values: { str: 5 } }, ROW, MINT),
      proposedRecord(ROW.k, { kind: 'fields', values: { str: 5 } }, ROW, MINT, true),
    ];

    // #then
    expect(made).toEqual([
      Result.err('unchanged'),
      Result.ok({
        k: ROW.k,
        d: { order: 0, cells: { str: [5, 9, 'p-conn'] } },
        c: 9,
        a: 'p-conn',
        l: [1, 'seed'],
      }),
    ]);
  });
  test('edits the cells of a live repeat row and keeps its order', () => {
    // #when
    const made = proposedRecord(REP.k, { kind: 'fields', values: { qty: 2 } }, REP, MINT);
    // #then
    expect(made).toEqual(
      Result.ok({
        k: REP.k,
        d: { order: 2, cells: { qty: [2, 9, 'p-conn'] } },
        c: 9,
        a: 'p-conn',
        l: [1, 'seed'],
      }),
    );
  });
  test('a new row keeps its own order and cells over a live record of its key', () => {
    // #when
    const made = proposedRecord(
      REP.k,
      { kind: 'add', d: { order: 7, cells: fixtureCells({ qty: 1 }) } },
      REP,
      MINT,
    );

    // #then
    expect(made).toEqual(
      Result.ok(fixtureRecord(REP.k, { order: 7, cells: { qty: 1 } }, 9, 'p-conn')),
    );
  });
  test('a removal stays a removal over a live row, and over no record', () => {
    // #when
    const made = [
      proposedRecord(REP.k, { kind: 'remove' }, REP, MINT),
      proposedRecord(REP.k, { kind: 'remove' }, undefined, MINT),
    ];

    // #then
    expect(made).toEqual([
      Result.ok(fixtureRecord(REP.k, null, 9, 'p-conn')),
      Result.ok({
        k: REP.k,
        d: null,
        c: 9,
        a: 'p-conn',
        l: [9, 'p-conn'],
      }),
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
      Result.err('gone'),
      Result.err('gone'),
      Result.err('gone'),
      Result.err('unchanged'),
    ]);
  });
});

describe('strippedPatch', () => {
  const TEMPLATE: TemplateLayout = {
    tabs: [
      {
        sections: [
          {
            rows: [
              {
                cells: [
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'field', type: 'check', id: 'str_tired' },
                ],
              },
            ],
          },
          {
            repeat: { id: 'attack', nameField: 'attack' },
            rows: [
              {
                cells: [
                  { kind: 'field', type: 'text', id: 'attack' },
                  { kind: 'field', type: 'number', id: 'bonus' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  test('returns the same patch when the template has every field', () => {
    // #given
    const patch = { kind: 'fields', values: { str: 3, str_tired: null } } as const;
    // #then
    expect(strippedPatch('blk:brok', patch, TEMPLATE)).toBe(patch);
  });
  test('keeps a root number proposal when a repeat tab has a same-id text field', () => {
    // #given
    const template: TemplateLayout = {
      tabs: [
        {
          title: 'Основное',
          sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }],
        },
        {
          title: 'Состояния',
          repeat: { id: 'condition', nameField: 'condition_name' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'condition_name' },
                    { kind: 'field', type: 'text', id: 'hp' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const patch = { kind: 'fields', values: { hp: 8 } } as const;

    // #when
    const stripped = strippedPatch('blk:brok', patch, template);

    // #then
    expect(stripped).toBe(patch);
  });
  test('drops the fields the row no longer has, and values of another type', () => {
    // #when
    const stripped = strippedPatch(
      'blk:brok',
      { kind: 'fields', values: { str: 3, str_tired: 'yes', gone: 1 } },
      TEMPLATE,
    );

    // #then
    expect(stripped).toEqual({ kind: 'fields', values: { str: 3 } });
  });
  test.each<[string, string, Parameters<typeof strippedPatch>[1]]>([
    ['only removed fields', 'blk:brok', { kind: 'fields', values: { gone: 1 } }],
    ['a row the template no longer has', 'blk:brok', { kind: 'fields', values: { gone: 1 } }],
    ['a removal in a section that is gone', 'blk:brok:spell:i1', { kind: 'remove' }],
    [
      'a new row in a section that is gone',
      'blk:brok:spell:i1',
      { kind: 'add', d: { order: 0, cells: {} } },
    ],
  ])('leaves nothing of %s', (_name, key, patch) => {
    // #then
    expect(strippedPatch(key, patch, TEMPLATE)).toBeNull();
  });
  test('keeps a new repeat row with only the cells its section has', () => {
    // #when
    const stripped = strippedPatch(
      'blk:brok:attack:i1',
      {
        kind: 'add',
        d: { order: 2, cells: fixtureCells({ attack: 'Меч', range: 30 }) },
      },
      TEMPLATE,
    );

    // #then
    expect(stripped).toEqual({
      kind: 'add',
      d: { order: 2, cells: { attack: ['Меч', 1, 'seed'] } },
    });
  });
});
