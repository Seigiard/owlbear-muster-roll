import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { Template, TemplateLayout } from '@/core/preset';
import { presetMoves } from '@/core/preset-migrate';
import { type VersionedRecord } from '@/core/records';
import {
  combineCommands,
  createProposalQueue,
  movedCommands,
  strippedCommands,
  type ProposalCommand,
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
    commands: [rootField('str', str)],
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

const itemBlock = { sheetId: 'brok', path: ['item', 'new'] };

const addItem = {
  type: 'repeat-block-add',
  sheetId: 'brok',
  block: itemBlock,
} satisfies ProposalCommand;

const deleteItem = {
  type: 'repeat-block-delete',
  sheetId: 'brok',
  block: itemBlock,
} satisfies ProposalCommand;

function rootField(fieldId: string, value: string | number | boolean | null): ProposalCommand {
  return {
    type: 'field-patch',
    sheetId: 'brok',
    target: { kind: 'row', rowId: 'str' },
    fieldId,
    value,
  };
}

function itemField(fieldId: string, value: string | number | boolean | null): ProposalCommand {
  return {
    type: 'field-patch',
    sheetId: 'brok',
    target: { kind: 'rep', block: itemBlock },
    fieldId,
    value,
  };
}

describe('combineCommands', () => {
  test('keeps an add before its fields and the newest value of each field', () => {
    // #given
    const commands = [addItem, itemField('item', 'Меч')];

    // #when
    const combined = combineCommands(
      combineCommands(commands, itemField('qty', 2)),
      itemField('item', null),
    );

    // #then
    expect(combined).toEqual([addItem, itemField('item', null), itemField('qty', 2)]);
  });
  test('keeps every field of two edits, the newer value winning', () => {
    // #given
    const commands = [rootField('str', 1), rootField('dex', 2)];
    // #when
    const combined = combineCommands(commands, rootField('str', 5));
    // #then
    expect(combined).toEqual([rootField('str', 5), rootField('dex', 2)]);
  });
  test('a removal replaces a new row and a field edit', () => {
    // #when
    const combined = [
      combineCommands([addItem], deleteItem),
      combineCommands([itemField('qty', 1)], deleteItem),
    ];

    // #then
    expect(combined).toEqual([[deleteItem], [deleteItem]]);
  });
});

describe('movedCommands', () => {
  test('keeps pending edits under every unchanged repeat scope', () => {
    // #given
    const template: TemplateLayout = {
      tabs: [
        {
          repeat: { id: 'npc', nameField: 'npc_name' },
          sections: [
            { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'npc_name' }] }] },
            {
              repeat: { id: 'atk', nameField: 'attack_name' },
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'attack_name' }] }],
            },
          ],
        },
      ],
    };

    const npc: ProposalCommand = {
      type: 'field-patch',
      sheetId: 's',
      target: { kind: 'rep', block: { sheetId: 's', path: ['npc', 'a'] } },
      fieldId: 'npc_name',
      value: 'Skeleton',
    };

    const attack: ProposalCommand = {
      type: 'field-patch',
      sheetId: 's',
      target: { kind: 'rep', block: { sheetId: 's', path: ['npc', 'a', 'atk', 'x'] } },
      fieldId: 'npc_name',
      value: 'Skeleton',
    };

    const moves = presetMoves(template, template);

    // #when
    const moved = [
      movedCommands('blk:s:npc:a', [npc], moves),
      movedCommands('blk:s:npc:a:atk:x', [attack], moves),
    ];

    // #then
    expect(moved).toEqual([
      [{ k: 'blk:s:npc:a', commands: [npc] }],
      [{ k: 'blk:s:npc:a:atk:x', commands: [attack] }],
    ]);
  });
});

describe('strippedCommands', () => {
  const TEMPLATE: Template = {
    id: 'brok',
    title: 'Brok',
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
            repeat: { id: 'item', nameField: 'attack' },
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

  test('keeps every valid field', () => {
    // #given
    const commands = [rootField('str', 3), rootField('str_tired', null)];
    // #when
    const stripped = strippedCommands('blk:brok', commands, TEMPLATE);
    // #then
    expect(stripped).toEqual(commands);
  });
  test('keeps a root number proposal when a repeat tab has a same-id text field', () => {
    // #given
    const template: Template = {
      id: 'brok',
      title: 'Brok',
      tabs: [
        { sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] },
        {
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

    const command: ProposalCommand = {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'hp' },
      fieldId: 'hp',
      value: 8,
    };

    // #when
    const stripped = strippedCommands('blk:brok', [command], template);
    // #then
    expect(stripped).toEqual([command]);
  });
  test('drops the fields the row no longer has, and values of another type', () => {
    // #when
    const stripped = strippedCommands(
      'blk:brok',
      [rootField('str', 3), rootField('str_tired', 'yes'), rootField('gone', 1)],
      TEMPLATE,
    );

    // #then
    expect(stripped).toEqual([rootField('str', 3)]);
  });
  test.each<[string, string, ProposalCommand[]]>([
    ['only removed fields', 'blk:brok', [rootField('gone', 1)]],
    ['a row the template no longer has', 'blk:brok', [rootField('gone', 1)]],
    [
      'a removal in a section that is gone',
      'blk:brok:spell:i1',
      [
        {
          type: 'repeat-block-delete',
          sheetId: 'brok',
          block: { sheetId: 'brok', path: ['spell', 'i1'] },
        },
      ],
    ],
    [
      'a new row in a section that is gone',
      'blk:brok:spell:i1',
      [
        {
          type: 'repeat-block-add',
          sheetId: 'brok',
          block: { sheetId: 'brok', path: ['spell', 'i1'] },
        },
      ],
    ],
  ])('leaves nothing of %s', (_name, key, commands) => {
    // #when
    const stripped = strippedCommands(key, commands, TEMPLATE);
    // #then
    expect(stripped).toBeNull();
  });
  test('keeps a new repeat row with only the cells its section has', () => {
    // #when
    const stripped = strippedCommands(
      'blk:brok:item:new',
      [addItem, itemField('attack', 'Меч'), itemField('range', 30)],
      TEMPLATE,
    );

    // #then
    expect(stripped).toEqual([addItem, itemField('attack', 'Меч')]);
  });
});
