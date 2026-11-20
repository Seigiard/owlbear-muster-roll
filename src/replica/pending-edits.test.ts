import { Result } from 'better-result';
import { assembleRecords, mergeRecords } from '@/core/merge';
import { blockAddress } from '@/core/block-address';
import { fixturePatch } from '../../tests/support/block-fixtures';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import { decodePreset, encodePreset, type Preset } from '@/core/preset';
import { presetDataSchema, type FieldValue, type VersionedRecord } from '@/core/records';
import type { RejectMessage } from '@/core/room-messages';
import type { Command, RejectionReason } from '@/core/ui-messages';
import { createComposers } from '@/core/compose';
import {
  createPendingEdits,
  type PendingEdits,
  type PlayerEditCommand,
} from '@/replica/pending-edits';

const PLAYER = 'player-a';
const CONNECTION = 'player-connection';

const PARITY_PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'camp',
      title: 'Camp',
      players: 'edit',
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'food' },
                    { kind: 'field', type: 'number', id: 'water' },
                  ],
                },
              ],
            },
            {
              repeat: { id: 'gear', nameField: 'name' },
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                {
                  repeat: { id: 'part', nameField: 'part_name' },
                  cells: [{ kind: 'field', type: 'text', id: 'part_name' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const PARITY_RECORDS: VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PARITY_PRESET), c: 1, a: 'seed' },
  fixtureRecord('blk:camp', { order: 0, cells: { food: 1, water: 1 } }, 1, 'seed'),
];

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Characters',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'str' },
                    { kind: 'field', type: 'text', id: 'note' },
                  ],
                },
              ],
            },
            {
              repeat: { id: 'item', nameField: 'item' },
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'item' },
                    { kind: 'field', type: 'number', id: 'qty' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'camp',

      title: 'Camp',
      players: 'edit',
      tabs: [
        { sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'food' }] }] }] },
      ],
    },
    {
      id: 'rules',

      title: 'Rules',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'rule' }] }] }] }],
    },
  ],
};

const STR: VersionedRecord = {
  k: 'blk:brok',
  d: { set: 'pc', order: 0, cells: { str: [10, 2, 'seed'] } },
  c: 2,
  a: 'seed',
  l: [1, 'seed'],
};

const SWORD: VersionedRecord = {
  k: 'blk:brok:item:sword',
  d: { order: 0, cells: { item: ['Sword', 1, 'seed'] } },
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
};

const BASE: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'blk:camp', d: { order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
  { k: `acl:brok:${PLAYER}`, d: { name: 'Player' }, c: 1, a: 'seed' },
  STR,
  SWORD,
];

const HIDDEN_PRESET: Preset = {
  ...PRESET,
  templates: [
    ...PRESET.templates,
    {
      id: 'hidden',

      title: 'Hidden',
      visibility: 'gm',
      players: 'edit',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'str' }] }] }] }],
    },
  ],
};

type Scheduled = {
  run: () => void;
  delay: number;
  cancelled: boolean;
};

type Harness = {
  pending: PendingEdits;
  records: Map<string, VersionedRecord>;
  sent: VersionedRecord[];
  scheduled: Scheduled[];
  setCatchingUp: (value: boolean) => void;
  setNow: (value: number) => void;
};

describe('pending edits', () => {
  test('held sibling additions keep their original order after a GM sibling arrives', () => {
    // #given
    const harness = createHarness({ records: PARITY_RECORDS, catchingUp: true });

    const first = {
      type: 'repeat-block-add',
      sheetId: 'camp',
      block: { sheetId: 'camp', path: ['gear', 'a'] },
    } satisfies PlayerEditCommand;

    const second = {
      type: 'repeat-block-add',
      sheetId: 'camp',
      block: { sheetId: 'camp', path: ['gear', 'b'] },
    } satisfies PlayerEditCommand;

    harness.pending.edit(first, pendingView(harness));
    harness.pending.edit(second, pendingView(harness));
    const view = pendingView(harness);
    harness.records.set('blk:camp:gear:gm', {
      k: 'blk:camp:gear:gm',
      d: { order: 9, cells: {} },
      c: 2,
      a: 'gm',
      l: [2, 'gm'],
    });
    harness.setCatchingUp(false);
    // #when
    harness.pending.caughtUp();
    // #then
    expect({
      view: [view.get('blk:camp:gear:a')?.d, view.get('blk:camp:gear:b')?.d],
      sent: harness.sent.map((record) => record.d),
    }).toEqual({
      view: [
        { order: 0, cells: {} },
        { order: 1, cells: {} },
      ],
      sent: [
        { order: 0, cells: {} },
        { order: 1, cells: {} },
      ],
    });
  });
  test('a held nested addition appears under its pending parent', () => {
    // #given
    const harness = createHarness({ records: PARITY_RECORDS, catchingUp: true });

    const parent = {
      type: 'repeat-block-add',
      sheetId: 'camp',
      block: { sheetId: 'camp', path: ['gear', 'a'] },
    } satisfies PlayerEditCommand;

    const child = {
      type: 'repeat-block-add',
      sheetId: 'camp',
      block: { sheetId: 'camp', path: ['gear', 'a', 'part', 'b'] },
    } satisfies PlayerEditCommand;

    harness.pending.edit(parent, pendingView(harness));
    harness.pending.edit(child, pendingView(harness));
    // #when
    const view = pendingView(harness);
    // #then
    expect(view.get('blk:camp:gear:a:part:b')).toEqual({
      k: 'blk:camp:gear:a:part:b',
      d: { order: 0, cells: {} },
      c: 1,
      a: CONNECTION,
      l: [1, CONNECTION],
    });
  });
  test('a preset type change resends only the still-valid pending field', () => {
    // #given
    const harness = createHarness({ records: PARITY_RECORDS });
    const target = { kind: 'row', rowId: 'food' } as const;
    harness.pending.edit(field('food', 2, 'camp', target), pendingView(harness));
    harness.pending.edit(field('water', 2, 'camp', target), pendingView(harness));
    const before = harness.records.get('preset');

    const changed: Preset = {
      v: 4,
      templates: [
        {
          id: 'camp',
          title: 'Camp',
          players: 'edit',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    { cells: [{ kind: 'field', type: 'text', id: 'water' }] },
                    { cells: [{ kind: 'field', type: 'number', id: 'food' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    harness.records.set('preset', { k: 'preset', d: encodePreset(changed), c: 2, a: 'gm' });
    // #when
    harness.pending.recordsChanged(before);
    // #then
    expect(harness.sent.at(-1)).toEqual({
      k: 'blk:camp',
      d: { order: 0, cells: { food: [2, 4, CONNECTION] } },
      c: 4,
      a: CONNECTION,
      l: [1, 'seed'],
    });
  });
  test('edit with access sends a stripped version above the known counter', () => {
    // #given
    const harness = createHarness({
      records: BASE.map((record) =>
        record.k === STR.k
          ? fixturePatch(record, { str: 10, gone: 'x' }, record.c, record.a)
          : record,
      ),
    });

    // #when
    const result = harness.pending.edit(field('str', 11), harness.records);
    // #then
    expect({ result, sent: harness.sent }).toEqual({
      result: Result.ok({ notify: false }),
      sent: [
        {
          k: 'blk:brok',
          d: { set: 'pc', order: 0, cells: { str: [11, 3, 'player-connection'] } },
          c: 3,
          a: 'player-connection',
          l: [1, 'seed'],
        },
      ],
    });
  });
  test.each<[string, Command, readonly VersionedRecord[], RejectionReason]>([
    ['another command kind', { type: 'sheet-delete', sheetId: 'brok' }, BASE, 'not-allowed'],
    [
      'a sheet set without access',
      field('str', 11, 'kira'),
      [
        ...BASE,
        { k: 'blk:kira', d: { set: 'pc', order: 1, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
      ],
      'not-allowed',
    ],
    ['a single sheet players cannot edit', field('rule', 'no', 'rules'), BASE, 'not-allowed'],
    ['a composer error', field('str', 'eleven'), BASE, 'invalid-value'],
  ])(
    'edit refused for %s returns its reason and sends nothing',
    (_name, command, records, reason) => {
      // #given
      const harness = createHarness({ records });
      // #when
      const result = harness.pending.edit(command, harness.records);
      // #then
      expect({ result, sent: harness.sent }).toEqual({
        result: Result.err(reason),
        sent: [],
      });
    },
  );
  test('a player-editable single sheet sends without an acl record', () => {
    // #given
    const harness = createHarness();

    // #when
    const result = harness.pending.edit(
      field('food', 3, 'camp', { kind: 'row', rowId: 'food' }),
      harness.records,
    );

    // #then
    expect({ result, sent: harness.sent }).toEqual({
      result: Result.ok({ notify: false }),
      sent: [
        {
          k: 'blk:camp',
          d: { order: 0, cells: { food: [3, 2, CONNECTION] } },
          c: 2,
          a: CONNECTION,
          l: [1, 'seed'],
        },
      ],
    });
  });
  test('the preflight refuses a hidden player-editable sheet before it reaches a GM', () => {
    // #given
    const harness = createHarness({
      records: withPreset(BASE, HIDDEN_PRESET),
    });

    // #when
    const result = harness.pending.edit(field('str', 11, 'hidden'), harness.records);
    // #then
    expect({ result, sent: harness.sent }).toEqual({
      result: Result.err('not-allowed'),
      sent: [],
    });
  });
  test('a second edit of one key combines its patches and replaces the sent version', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    // #when
    harness.pending.edit(field('note', 'tired'), harness.records);
    // #then
    expect({ sent: harness.sent, size: harness.pending.size() }).toEqual({
      sent: [pcRecord({ str: 11 }, 3), pcRecord({ str: 11, note: 'tired' }, 4)],
      size: 1,
    });
  });
  test('the combined proposal sets one field and clears another', () => {
    // #given
    const harness = createHarness({
      records: BASE.map((record) =>
        record.k === STR.k ? fixturePatch(record, { str: 10, note: 'x' }, 2, 'seed') : record,
      ),
    });

    harness.pending.edit(field('str', 11), harness.records);
    // #when
    harness.pending.edit(field('note', null), harness.records);
    // #then
    expect(harness.sent).toEqual([pcRecord({ str: 11 }, 3), pcRecord({ str: 11, note: null }, 4)]);
  });
  test('an edit during catch-up overlays at once and sends above caught-up records', () => {
    // #given
    const harness = createHarness({ catchingUp: true });
    harness.pending.edit(field('str', 11), harness.records);
    const overlay = new Map(harness.records);
    // #when
    harness.pending.overlay(overlay);
    mergeInto(harness.records, fixturePatch(STR, { str: 15 }, 7, 'gm'));
    harness.setCatchingUp(false);
    const result = harness.pending.caughtUp();
    // #then
    expect({ overlay: overlay.get(STR.k), result, sent: harness.sent }).toEqual({
      overlay: pcRecord({ str: 11 }, 3),
      result: { notify: false },
      sent: [pcRecord({ str: 11 }, 8)],
    });
  });
  test('an edit too large for a room message returns the composer error and sends nothing', () => {
    // #given
    const harness = createHarness();
    // #when
    const result = harness.pending.edit(field('note', 'ы'.repeat(8000)), harness.records);
    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: Result.err('too-large'),
      sent: [],
      size: 0,
    });
  });
  test('an edit whose replica repeat block was removed drops and notifies', () => {
    // #given
    const harness = createHarness({
      records: BASE.map((record) =>
        record.k === SWORD.k ? fixturePatch(record, null, 2, record.a) : record,
      ),
    });

    const view = new Map(harness.records);
    view.set(SWORD.k, SWORD);

    // #when
    const result = harness.pending.edit(
      field('qty', 2, 'brok', {
        kind: 'rep',
        block: { sheetId: 'brok', path: ['item', 'sword'] },
      }),
      view,
    );

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: Result.ok({ notify: true, cause: 'gone' }),
      sent: [],
      size: 0,
    });
  });
  test('overlay keeps a sent version over a newer base', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    const overlay = new Map(harness.records);
    overlay.set(STR.k, fixturePatch(STR, { str: 10, note: 'GM' }, 4, 'gm'));
    // #when
    harness.pending.overlay(overlay);
    // #then
    expect(overlay.get(STR.k)).toEqual({
      k: STR.k,
      d: {
        set: 'pc',
        order: 0,
        cells: { str: [11, 3, CONNECTION], note: ['GM', 4, 'gm'] },
      },
      c: 3,
      a: CONNECTION,
      l: [1, 'seed'],
    });
  });
  test('overlay puts a waiting patch over a newer base', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.setCatchingUp(true);
    harness.pending.edit(field('note', 'pending'), harness.records);
    const overlay = new Map(harness.records);
    overlay.set(STR.k, fixturePatch(STR, { str: 10, note: 'GM' }, 4, 'gm'));
    // #when
    harness.pending.overlay(overlay);
    // #then
    expect(overlay.get(STR.k)).toEqual(pcRecord({ str: 11, note: 'pending' }, 5));
  });
  test('overlay does not show an edit that makes no record', () => {
    // #given
    const harness = createHarness();
    const view = new Map(harness.records);
    // #when
    const result = harness.pending.edit(field('str', 10), view);
    harness.pending.overlay(view);
    // #then
    expect({ result, record: view.get(STR.k), size: harness.pending.size() }).toEqual({
      result: Result.err('unchanged'),
      record: STR,
      size: 0,
    });
  });
  test('restoring a sent edit to its base value sends the restored value at a newer counter', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    // #when
    harness.pending.edit(field('str', 10), pendingView(harness));
    // #then
    expect(harness.sent).toEqual([pcRecord({ str: 11 }, 3), pcRecord({ str: 10 }, 4)]);
  });
  test('an answer clears only its matching edit, while an older answer leaves it', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.pending.edit(field('food', 3, 'camp', { kind: 'row', rowId: 'food' }), harness.records);
    // #when
    const older = harness.pending.answered([{ k: STR.k, c: 2, a: CONNECTION }]);
    const matching = harness.pending.answered([{ k: STR.k, c: 3, a: CONNECTION }]);
    const overlay = pendingView(harness);
    // #then
    expect({
      older,
      matching,
      size: harness.pending.size(),
      remaining: overlay.get('blk:camp'),
    }).toEqual({
      older: false,
      matching: true,
      size: 1,
      remaining: {
        k: 'blk:camp',
        d: { order: 0, cells: { food: [3, 2, CONNECTION] } },
        c: 2,
        a: CONNECTION,
        l: [1, 'seed'],
      },
    });
  });
  test('a rejection with no matching edit changes nothing', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    // #when
    const result = harness.pending.rejected(reject({ k: STR.k, c: 2, a: CONNECTION }, 'denied'));
    // #then
    expect({ result, size: harness.pending.size(), sent: harness.sent }).toEqual({
      result: null,
      size: 1,
      sent: [pcRecord({ str: 11 }, 3)],
    });
  });
  test('a denied rejection drops the edit and shows one notification', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    // #when
    const result = harness.pending.rejected(reject({ k: STR.k, c: 3, a: CONNECTION }, 'denied'));
    // #then
    expect({ result, size: harness.pending.size() }).toEqual({
      result: { notify: true, cause: 'denied', merge: null },
      size: 0,
    });
  });
  test.each<
    [
      string,
      VersionedRecord,
      {
        merge: VersionedRecord | null;
        notify: boolean;
        cause?: 'gone' | 'too-large' | 'denied';
      },
      VersionedRecord[],
    ]
  >([
    [
      'rebases stale above on the known record merged with the current record',
      fixturePatch(STR, { note: 'GM' }, 5, 'gm'),
      { merge: fixturePatch(STR, { note: 'GM' }, 5, 'gm'), notify: false },
      [pcRecord({ str: 11 }, 6)],
    ],
    [
      'drops stale above when the current record already has the patch',
      fixturePatch(STR, { str: 11 }, 5, 'gm'),
      { merge: fixturePatch(STR, { str: 11 }, 5, 'gm'), notify: false },
      [],
    ],
    [
      'drops stale above when the current repeat block was removed',
      fixturePatch(SWORD, null, 5, 'gm'),
      { merge: fixturePatch(SWORD, null, 5, 'gm'), notify: true, cause: 'gone' },
      [],
    ],
  ])('%s', (_name, current, expected, resent) => {
    // #given
    const harness = createHarness();

    const command =
      current.k === SWORD.k
        ? field('qty', 2, 'brok', {
            kind: 'rep',
            block: { sheetId: 'brok', path: ['item', 'sword'] },
          })
        : field('str', 11);

    harness.pending.edit(command, harness.records);
    const before = harness.sent.length;

    // #when
    const result = harness.pending.rejected(
      reject({ k: current.k, c: current.k === SWORD.k ? 2 : 3, a: CONNECTION }, 'stale', current),
    );

    // #then
    expect({ result, resent: harness.sent.slice(before), size: harness.pending.size() }).toEqual({
      result: expected,
      resent,
      size: resent.length === 0 ? 0 : 1,
    });
  });
  test('a stale answer below the edit holds its rebuilt version for backoff', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);

    // #when
    const result = harness.pending.rejected(
      reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', STR),
    );

    // #then
    expect({
      result,
      sent: harness.sent,
      scheduled: harness.scheduled.map(({ delay }) => delay),
    }).toEqual({
      result: { notify: false, merge: STR },
      sent: [pcRecord({ str: 11 }, 3)],
      scheduled: [20],
    });
  });
  test('a stale answer with a huge unchanged cell resends only the changed cell', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    const current = fixturePatch(STR, { str: 20, note: 'ы'.repeat(8000) }, 5, 'gm');

    // #when
    const result = harness.pending.rejected(
      reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
    );

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: false, merge: current },
      sent: [pcRecord({ str: 11 }, 3), pcRecord({ str: 11 }, 6)],
      size: 1,
    });
  });
  test('caught-up returns too-large when a waiting edit no longer fits over the GM record', () => {
    // #given
    const harness = createHarness({ catchingUp: true });
    harness.pending.edit(add('new'), harness.records);
    harness.records.set('blk:brok:item:new', {
      k: 'blk:brok:item:new',
      d: { order: 5, cells: { item: ['Shield', 5, 'gm'] } },
      c: 5,
      a: 'gm',
      l: [1, 'g'.repeat(15000)],
    });
    harness.setCatchingUp(false);

    // #when
    const result = harness.pending.caughtUp();

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: true, cause: 'too-large' },
      sent: [],
      size: 0,
    });
  });
  test('a stale answer below the edit rebuilds over the newest known record, not only the answer', () => {
    // #given
    const known = fixturePatch(STR, { str: 10, note: 'known' }, 7, 'gm-known');

    const harness = createHarness({
      records: BASE.map((record) => (record.k === STR.k ? known : record)),
    });

    harness.pending.edit(field('str', 11), harness.records);
    const current = fixturePatch(STR, { str: 20 }, 6, 'gm-answer');

    // #when
    const result = harness.pending.rejected(
      reject({ k: STR.k, c: 8, a: CONNECTION }, 'stale', current),
    );

    harness.scheduled.at(-1)?.run();
    // #then
    expect({ result, sent: harness.sent }).toEqual({
      result: { notify: false, merge: current },
      sent: [pcRecord({ str: 11 }, 8), pcRecord({ str: 11 }, 9)],
    });
  });
  test('a stale rejection during catch-up waits and mints above its current record on exit', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.setCatchingUp(true);
    const current = fixturePatch(STR, { str: 20 }, 5, 'gm');

    // #when
    const rejected = harness.pending.rejected(
      reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
    );

    const duringCatchUp = [...harness.sent];
    mergeInto(harness.records, current);
    harness.setCatchingUp(false);
    const caughtUp = harness.pending.caughtUp();
    // #then
    expect({ rejected, duringCatchUp, caughtUp, sent: harness.sent }).toEqual({
      rejected: { notify: false, merge: current },
      duringCatchUp: [pcRecord({ str: 11 }, 3)],
      caughtUp: { notify: false },
      sent: [pcRecord({ str: 11 }, 3), pcRecord({ str: 11 }, 6)],
    });
  });
  test('a 33-part stale reply completes without a player part cap', () => {
    // #given

    const harness = createHarness();
    const current = fixturePatch(STR, { str: 20 }, 5, 'gm');

    harness.pending.edit(field('str', 11), harness.records);
    // #when

    const results = Array.from({ length: 33 }, (_, index) =>
      harness.pending.rejected({
        ...reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
        i: index + 1,
        n: 33,
      }),
    );
    // #then

    expect({ results, sent: harness.sent }).toEqual({
      results: [...Array.from({ length: 32 }, () => null), { notify: false, merge: current }],
      sent: [pcRecord({ str: 11 }, 3), pcRecord({ str: 11 }, 6)],
    });
  });
  test('stale reply limits drop oversized and expired replies before a later two-part reply completes', () => {
    // #given

    const harness = createHarness();
    const current = fixturePatch(STR, { str: 20 }, 5, 'gm');
    const oversized = fixturePatch(STR, { note: 'x'.repeat(480_000) }, 5, 'gm');

    harness.pending.edit(field('str', 11), harness.records);
    // #when

    const oversizedFirst = harness.pending.rejected({
      ...reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', oversized),
      i: 1,
      n: 2,
    });

    const oversizedSecond = harness.pending.rejected({
      ...reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', oversized),
      i: 2,
      n: 2,
    });

    const expiredFirst = harness.pending.rejected({
      ...reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
      i: 1,
      n: 2,
    });

    harness.setNow(60_000);

    const expiredSecond = harness.pending.rejected({
      ...reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
      i: 2,
      n: 2,
    });

    harness.setNow(120_000);

    const recoveredFirst = harness.pending.rejected({
      ...reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
      i: 1,
      n: 2,
    });

    const recoveredSecond = harness.pending.rejected({
      ...reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
      i: 2,
      n: 2,
    });
    // #then

    expect({
      results: [
        oversizedFirst,
        oversizedSecond,
        expiredFirst,
        expiredSecond,
        recoveredFirst,
        recoveredSecond,
      ],
      sent: harness.sent,
    }).toEqual({
      results: [null, null, null, null, null, { notify: false, merge: current }],
      sent: [pcRecord({ str: 11 }, 3), pcRecord({ str: 11 }, 6)],
    });
  });
  test('caught-up drops a waiting edit whose access was revoked and notifies', () => {
    // #given
    const harness = createHarness({ catchingUp: true });
    harness.pending.edit(field('str', 11), harness.records);
    harness.records.set(`acl:brok:${PLAYER}`, { k: `acl:brok:${PLAYER}`, d: null, c: 2, a: 'gm' });
    // #when
    const result = harness.pending.caughtUp();
    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: true, cause: 'denied' },
      sent: [],
      size: 0,
    });
  });
  test('a stale repeat block addition keeps its order and cells', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(add('new'), harness.records);
    harness.pending.edit(
      field('qty', 2, 'brok', {
        kind: 'rep',
        block: { sheetId: 'brok', path: ['item', 'new'] },
      }),
      pendingView(harness),
    );

    const current: VersionedRecord = {
      k: 'blk:brok:item:new',
      d: { order: 5, cells: { item: ['Shield', 5, 'gm'] } },
      c: 5,
      a: 'gm',
      l: [1, 'seed'],
    };

    // #when
    harness.pending.rejected(reject({ k: current.k, c: 2, a: CONNECTION }, 'stale', current));
    // #then
    expect(harness.sent).toEqual([
      {
        k: 'blk:brok:item:new',
        d: { order: 1, cells: {} },
        c: 1,
        a: CONNECTION,
        l: [1, CONNECTION],
      },
      {
        k: 'blk:brok:item:new',
        d: { order: 1, cells: { qty: [2, 2, CONNECTION] } },
        c: 2,
        a: CONNECTION,
        l: [1, CONNECTION],
      },
      {
        k: 'blk:brok:item:new',
        d: { order: 1, cells: { qty: [2, 6, CONNECTION] } },
        c: 6,
        a: CONNECTION,
        l: [1, 'seed'],
      },
    ]);
  });
  test('a stale repeat block removal stays a removal', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(remove('sword'), harness.records);
    // #when
    harness.pending.rejected(
      reject({ k: SWORD.k, c: 2, a: CONNECTION }, 'stale', { ...SWORD, c: 5, a: 'gm' }),
    );
    // #then
    expect(harness.sent).toEqual([
      fixtureRecord(SWORD.k, null, 2, CONNECTION),
      fixtureRecord(SWORD.k, null, 6, CONNECTION),
    ]);
  });
  test('a pending creation and its later field edit share a lifecycle', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(add('new'), harness.records);
    // #when
    harness.pending.edit(
      field('item', 'Sword', 'brok', {
        kind: 'rep',
        block: { sheetId: 'brok', path: ['item', 'new'] },
      }),
      pendingView(harness),
    );
    const [creation, updated] = harness.sent;

    if (creation === undefined || updated === undefined) throw new Error('missing proposals');
    const merged = mergeRecords(creation, updated);
    // #then
    expect(merged).toEqual({
      k: 'blk:brok:item:new',
      d: { order: 1, cells: { item: ['Sword', 2, CONNECTION] } },
      c: 2,
      a: CONNECTION,
      l: [1, CONNECTION],
    });
  });
  test('deleting a pending creation defeats its delayed creation proposal', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(add('new'), harness.records);
    // #when
    harness.pending.edit(remove('new'), pendingView(harness));
    const [creation, removal] = harness.sent;

    if (creation === undefined || removal === undefined) throw new Error('missing proposals');
    const merged = mergeRecords(removal, creation);
    // #then
    expect({ lifecycle: merged.l, data: merged.d }).toEqual({
      lifecycle: [1, CONNECTION],
      data: null,
    });
  });
  test('an unrelated commit keeps a pending creation cancellation for GM return', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(add('new'), harness.records);
    harness.pending.edit(remove('new'), pendingView(harness));
    harness.records.set('blk:camp', {
      k: 'blk:camp',
      d: { order: 0, cells: { food: [3, 2, 'gm'] } },
      c: 2,
      a: 'gm',
      l: [1, 'seed'],
    });
    const before = harness.sent.length;

    // #when
    harness.pending.recordsChanged(undefined);
    harness.pending.gmBack();

    // #then
    expect(harness.sent.slice(before)).toEqual([
      { k: 'blk:brok:item:new', d: null, c: 2, a: CONNECTION, l: [1, CONNECTION] },
    ]);
  });
  test.each<
    [
      string,
      (harness: Harness) => void,
      {
        notify: boolean;
        cause?: 'gone' | 'too-large' | 'denied';
        size: number;
      },
    ]
  >([
    [
      'its own revoked access',
      (harness) =>
        harness.records.set(`acl:brok:${PLAYER}`, {
          k: `acl:brok:${PLAYER}`,
          d: null,
          c: 2,
          a: 'gm',
        }),
      { notify: true, cause: 'denied', size: 0 },
    ],
    [
      'a deleted sheet',
      (harness) =>
        harness.records.set('blk:brok', { k: 'blk:brok', d: null, c: 2, a: 'gm', l: [1, 'seed'] }),
      { notify: true, cause: 'denied', size: 0 },
    ],
    [
      'another player revoked',
      (harness) =>
        harness.records.set('acl:brok:other', { k: 'acl:brok:other', d: null, c: 2, a: 'gm' }),
      { notify: false, size: 1 },
    ],
  ])(
    'records change drops %s only when the pending edit is no longer allowed',
    (_name, change, expected) => {
      // #given
      const harness = createHarness();
      harness.pending.edit(field('str', 11), harness.records);
      change(harness);
      // #when
      const result = harness.pending.recordsChanged(undefined);
      // #then
      expect({ result, size: harness.pending.size() }).toEqual({
        result:
          expected.cause === undefined
            ? { notify: expected.notify }
            : { notify: expected.notify, cause: expected.cause },
        size: expected.size,
      });
    },
  );
  test('records change drops a removed repeat block silently', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(remove('sword'), harness.records);
    harness.records.set(SWORD.k, fixturePatch(SWORD, null, 2, 'gm'));
    // #when
    const result = harness.pending.recordsChanged(undefined);
    // #then
    expect({ result, size: harness.pending.size() }).toEqual({
      result: { notify: false },
      size: 0,
    });
  });
  test('records change drops a pending repeat block edit with a notification', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(
      field('qty', 2, 'brok', {
        kind: 'rep',
        block: { sheetId: 'brok', path: ['item', 'sword'] },
      }),
      harness.records,
    );
    harness.records.set(SWORD.k, fixturePatch(SWORD, null, 2, 'gm'));
    // #when
    const result = harness.pending.recordsChanged(undefined);
    // #then
    expect({ result, size: harness.pending.size() }).toEqual({
      result: { notify: true, cause: 'gone' },
      size: 0,
    });
  });
  test('records change drops a waiting edit at a revoke before catch-up ends', () => {
    // #given
    const harness = createHarness({ catchingUp: true });
    harness.pending.edit(field('str', 11), harness.records);
    harness.records.set(`acl:brok:${PLAYER}`, { k: `acl:brok:${PLAYER}`, d: null, c: 2, a: 'gm' });
    // #when
    const result = harness.pending.recordsChanged(undefined);
    // #then
    expect({ result, size: harness.pending.size() }).toEqual({
      result: { notify: true, cause: 'denied' },
      size: 0,
    });
  });
  test('records change keeps another sheet entry when one sheet access is revoked', () => {
    // #given
    const harness = createHarness({
      records: [
        ...BASE,
        { k: 'blk:kira', d: { set: 'pc', order: 1, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
        { k: `acl:kira:${PLAYER}`, d: { name: 'Player' }, c: 1, a: 'seed' },
      ],
    });

    harness.pending.edit(field('str', 11), harness.records);
    harness.pending.edit(field('str', 7, 'kira'), harness.records);
    harness.records.set(`acl:kira:${PLAYER}`, { k: `acl:kira:${PLAYER}`, d: null, c: 2, a: 'gm' });
    // #when
    const result = harness.pending.recordsChanged(undefined);
    const remaining = pendingView(harness).get(STR.k);
    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size(), remaining }).toEqual({
      result: { notify: true, cause: 'denied' },
      sent: [
        pcRecord({ str: 11 }, 3),
        {
          k: 'blk:kira',
          d: { set: 'pc', order: 1, cells: { str: [7, 2, CONNECTION] } },
          c: 2,
          a: CONNECTION,
          l: [1, 'seed'],
        },
      ],
      size: 1,
      remaining: pcRecord({ str: 11 }, 3),
    });
  });
  test('a preset change strips removed fields and sends the kept entry again', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.pending.edit(field('note', 'removed'), harness.records);
    const before = harness.records.get('preset');

    const changed: Preset = {
      ...PRESET,
      templates: [
        {
          ...PRESET.templates[0]!,
          tabs: [
            {
              sections: [
                {
                  rows: [
                    { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                    { cells: [{ kind: 'field', type: 'number', id: 'str' }] },
                  ],
                },
              ],
            },
          ],
        },
        ...PRESET.templates.slice(1),
      ],
    };

    harness.records.set('preset', { k: 'preset', d: encodePreset(changed), c: 2, a: 'gm' });
    // #when
    const result = harness.pending.recordsChanged(before);
    // #then
    expect({ result, sent: harness.sent.slice(2), size: harness.pending.size() }).toEqual({
      result: { notify: false },
      sent: [pcRecord({ str: 11 }, 5)],
      size: 1,
    });
  });
  test('a preset change drops a repeat entry whose section was removed without a notification', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(remove('sword'), harness.records);
    const before = harness.records.get('preset');

    const changed: Preset = {
      ...PRESET,
      templates: [
        {
          ...PRESET.templates[0]!,
          tabs: [{ sections: [PRESET.templates[0]!.tabs[0]!.sections[0]!] }],
        },
        ...PRESET.templates.slice(1),
      ],
    };

    harness.records.set('preset', { k: 'preset', d: encodePreset(changed), c: 2, a: 'gm' });
    // #when
    const result = harness.pending.recordsChanged(before);
    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: false },
      sent: [fixtureRecord(SWORD.k, null, 2, CONNECTION)],
      size: 0,
    });
  });
  test('a preset row move keeps a plain-field entry on the stable root key', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('note', 'tired'), harness.records);
    const before = harness.records.get('preset');
    const moved = movedPreset();
    harness.records.set('preset', { k: 'preset', d: encodePreset(moved), c: 2, a: 'gm' });
    // #when
    const result = harness.pending.recordsChanged(before);
    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: false },
      sent: [pcRecord({ note: 'tired' }, 3)],
      size: 1,
    });
  });
  test('a preset change drops an entry with only removed fields without a notification', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('note', 'tired'), harness.records);
    const before = harness.records.get('preset');
    harness.records.set('preset', { k: 'preset', d: encodePreset(noNotePreset()), c: 2, a: 'gm' });
    // #when
    const result = harness.pending.recordsChanged(before);
    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: false },
      sent: [pcRecord({ note: 'tired' }, 3)],
      size: 0,
    });
  });
  test('the quiet window notifies only after its fake time has passed', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.pending.edit(
      field('qty', 2, 'brok', {
        kind: 'rep',
        block: { sheetId: 'brok', path: ['item', 'sword'] },
      }),
      harness.records,
    );
    harness.pending.edit(add('new'), harness.records);
    // #when
    const first = harness.pending.rejected(reject({ k: STR.k, c: 3, a: CONNECTION }, 'denied'));
    harness.setNow(19);
    const second = harness.pending.rejected(reject({ k: SWORD.k, c: 2, a: CONNECTION }, 'denied'));
    harness.setNow(20);

    const third = harness.pending.rejected(
      reject({ k: 'blk:brok:item:new', c: 1, a: CONNECTION }, 'denied'),
    );

    // #then
    expect({ first, second, third }).toEqual({
      first: { notify: true, cause: 'denied', merge: null },
      second: { notify: false, merge: null },
      third: { notify: true, cause: 'denied', merge: null },
    });
  });
  test('a GM return resends minted edits and backoff resends the same edit with doubling delays', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    // #when
    harness.pending.gmBack();
    const second = harness.scheduled.at(-1);
    second?.run();
    // #then
    expect({ sent: harness.sent, delays: activeDelays(harness) }).toEqual({
      sent: [pcRecord({ str: 11 }, 3), pcRecord({ str: 11 }, 3), pcRecord({ str: 11 }, 3)],
      delays: [40],
    });
  });
  test('a GM return leaves a waiting edit unsent', () => {
    // #given
    const harness = createHarness({ catchingUp: true });
    harness.pending.edit(field('str', 11), harness.records);
    // #when
    harness.pending.gmBack();
    // #then
    expect({ sent: harness.sent, size: harness.pending.size() }).toEqual({ sent: [], size: 1 });
  });
  test('drain returns removal, add then cells and fields in entry order', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(remove('sword'), harness.records);
    harness.pending.edit(add('new'), harness.records);
    harness.pending.edit(
      field('qty', 2, 'brok', {
        kind: 'rep',
        block: { sheetId: 'brok', path: ['item', 'new'] },
      }),
      pendingView(harness),
    );
    harness.pending.edit(field('str', 11), harness.records);
    // #when
    const drained = harness.pending.drain();
    // #then
    expect({ drained, size: harness.pending.size(), sent: harness.sent.length }).toEqual({
      drained: [
        remove('sword'),
        add('new'),
        field('qty', 2, 'brok', {
          kind: 'rep',
          block: { sheetId: 'brok', path: ['item', 'new'] },
        }),
        field('str', 11),
      ],
      size: 0,
      sent: 4,
    });
  });
  test('clear empties pending edits and stops their resends', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    const resend = harness.scheduled.at(-1);
    // #when
    harness.pending.clear();
    resend?.run();
    // #then
    expect({ size: harness.pending.size(), sent: harness.sent }).toEqual({
      size: 0,
      sent: [pcRecord({ str: 11 }, 3)],
    });
  });
});

function createHarness(
  options: {
    records?: readonly VersionedRecord[];
    catchingUp?: boolean;
  } = {},
): Harness {
  const records = assembleRecords(options.records ?? BASE);
  const sent: VersionedRecord[] = [];
  const scheduled: Scheduled[] = [];
  let catchingUp = options.catchingUp ?? false;
  let now = 0;
  const composers = createComposers(CONNECTION);

  const pending = createPendingEdits({
    timing: { proposeResendStartMs: 20, proposeResendMaxMs: 40, editDeniedQuietMs: 20 },
    playerId: PLAYER,
    connectionId: CONNECTION,
    records: () => records,
    catchingUp: () => catchingUp,
    presetOf: (record) => {
      const data = presetDataSchema.safeParse(record?.d);

      if (!data.success) {
        return null;
      }

      const decoded = decodePreset(data.data);

      return decoded.isOk() ? decoded.value : null;
    },
    compose: (view, command) =>
      composers.compose(
        {
          records: view,
          mint: (key, highestKnownCounter) => ({ c: highestKnownCounter + 1, a: CONNECTION }),
          newRecordId: (_kind, role) => role,
          isGmPlayer: () => false,
          mode: 'pending',
        },
        command,
      ),
    mint: (_key, highestKnownCounter) => ({ c: highestKnownCounter + 1, a: CONNECTION }),
    now: () => now,
    enqueue: (compose) => {
      const record = compose();

      if (record !== null) {
        sent.push(record);
      }

      return Promise.resolve();
    },
    signal: new AbortController().signal,
    schedule: (_signal, delay, run) => {
      const scheduledEntry = { run, delay, cancelled: false };
      scheduled.push(scheduledEntry);

      return () => {
        scheduledEntry.cancelled = true;
      };
    },
  });

  return {
    pending,
    records,
    sent,
    scheduled,
    setCatchingUp: (value) => {
      catchingUp = value;
    },
    setNow: (value) => {
      now = value;
    },
  };
}

function pendingView(harness: Harness): Map<string, VersionedRecord> {
  const view = new Map(harness.records);
  harness.pending.overlay(view);

  return view;
}

function pcRecord(values: Readonly<Record<string, FieldValue | null>>, c: number): VersionedRecord {
  return fixtureRecord(STR.k, { set: 'pc', order: 0, cells: values }, c, CONNECTION);
}

function mergeInto(records: Map<string, VersionedRecord>, record: VersionedRecord): void {
  const current = records.get(record.k);
  records.set(record.k, current === undefined ? record : mergeRecords(current, record));
}

function activeDelays(harness: Harness): number[] {
  return harness.scheduled.filter((scheduled) => !scheduled.cancelled).map(({ delay }) => delay);
}

function withPreset(records: readonly VersionedRecord[], preset: Preset): VersionedRecord[] {
  return records.map((record) =>
    record.k === 'preset'
      ? { k: 'preset', d: encodePreset(preset), c: record.c, a: record.a }
      : record,
  );
}

function noNotePreset(): Preset {
  return {
    ...PRESET,
    templates: [
      {
        ...PRESET.templates[0]!,
        tabs: [
          {
            sections: [
              {
                rows: [
                  { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                  { cells: [{ kind: 'field', type: 'number', id: 'str' }] },
                ],
              },
              PRESET.templates[0]!.tabs[0]!.sections[1]!,
            ],
          },
        ],
      },
      ...PRESET.templates.slice(1),
    ],
  };
}

function movedPreset(): Preset {
  return {
    ...PRESET,
    templates: [
      {
        ...PRESET.templates[0]!,
        tabs: [
          {
            sections: [
              {
                rows: [
                  { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'note' },
                      { kind: 'field', type: 'number', id: 'str' },
                    ],
                  },
                ],
              },
              {
                repeat: { id: 'label', nameField: 'label' },
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'label' },
                      { kind: 'field', type: 'number', id: 'qty' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      ...PRESET.templates.slice(1),
    ],
  };
}

function field(
  fieldId: string,
  value: string | number | null,
  sheetId = 'brok',
  target:
    | {
        kind: 'row';
        rowId: string;
      }
    | {
        kind: 'rep';
        block: NonNullable<ReturnType<typeof blockAddress>>;
      } = { kind: 'row', rowId: 'str' },
): Extract<
  Command,
  {
    type: 'field-patch';
  }
> {
  return { type: 'field-patch', sheetId, target, fieldId, value };
}

function add(instanceId: string): Extract<
  PlayerEditCommand,
  {
    type: 'repeat-block-add';
  }
> {
  return {
    type: 'repeat-block-add',
    sheetId: 'brok',
    block: { sheetId: 'brok', path: ['item', instanceId] },
  };
}

function remove(instanceId: string): Extract<
  PlayerEditCommand,
  {
    type: 'repeat-block-delete';
  }
> {
  return {
    type: 'repeat-block-delete',
    sheetId: 'brok',
    block: { sheetId: 'brok', path: ['item', instanceId] },
  };
}

function reject(
  edit: {
    k: string;
    c: number;
    a: string;
  },
  reason: 'denied' | 'stale',
  current?: VersionedRecord,
): RejectMessage {
  const message = {
    v: 4,
    g: { n: 0, a: '' },
    t: 'reject',
    ...edit,
    reason,
  } satisfies RejectMessage;

  if (current !== undefined) {
    return { ...message, current };
  }

  return message;
}
