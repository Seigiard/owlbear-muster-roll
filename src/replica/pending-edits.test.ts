import { describe, expect, test } from 'bun:test';

import { decodePreset, encodePreset, type Preset } from '@/core/preset';
import { presetDataSchema, type VersionedRecord } from '@/core/records';
import type { RejectMessage } from '@/core/room-messages';
import type { Command, RejectionReason } from '@/core/ui-messages';
import { createComposers } from '@/replica/composers';
import {
  createPendingEdits,
  type PendingEdits,
  type PlayerEditCommand,
} from '@/replica/pending-edits';

const PLAYER = 'player-a';
const CONNECTION = 'player-connection';

const PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Characters',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [{ kind: 'field', type: 'text', id: 'name' }],
                [
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'field', type: 'text', id: 'note' },
                ],
              ],
            },
            {
              repeat: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'item' },
                  { kind: 'field', type: 'number', id: 'qty' },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'camp',
      kind: 'single',
      title: 'Camp',
      players: 'edit',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'food' }]] }] }],
    },
    {
      id: 'rules',
      kind: 'single',
      title: 'Rules',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'rule' }]] }] }],
    },
  ],
};

const STR: VersionedRecord = { k: 'row:brok:str', d: { str: 10 }, c: 2, a: 'seed' };

const SWORD: VersionedRecord = {
  k: 'rep:brok:item:sword',
  d: { order: 0, cells: { item: 'Sword' } },
  c: 1,
  a: 'seed',
};

const BASE: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
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
      kind: 'single',
      title: 'Hidden',
      visibility: 'gm',
      players: 'edit',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] }],
    },
  ],
};

type Scheduled = { run: () => void; delay: number; cancelled: boolean };

type Harness = {
  pending: PendingEdits;
  records: Map<string, VersionedRecord>;
  sent: VersionedRecord[];
  scheduled: Scheduled[];
  setCatchingUp: (value: boolean) => void;
  setNow: (value: number) => void;
};

describe('pending edits', () => {
  test('edit with access sends a stripped version above the known counter', () => {
    // #given
    const harness = createHarness({
      records: BASE.map((record) =>
        record.k === STR.k ? { ...record, d: { str: 10, gone: 'x' } } : record,
      ),
    });

    // #when
    const result = harness.pending.edit(field('str', 11), harness.records);

    // #then
    expect({ result, sent: harness.sent }).toEqual({
      result: { ok: true, value: { notify: false } },
      sent: [{ k: 'row:brok:str', d: { str: 11 }, c: 3, a: 'player-connection' }],
    });
  });

  test.each<[string, Command, readonly VersionedRecord[], RejectionReason]>([
    ['another command kind', { type: 'sheet-delete', sheetId: 'brok' }, BASE, 'not-allowed'],
    [
      'a sheet set without access',
      field('str', 11, 'kira'),
      [...BASE, { k: 'sheet:kira', d: { set: 'pc', order: 1 }, c: 1, a: 'seed' }],
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
        result: { ok: false, error: reason },
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
      result: { ok: true, value: { notify: false } },
      sent: [{ k: 'row:camp:food', d: { food: 3 }, c: 1, a: CONNECTION }],
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
      result: { ok: false, error: 'not-allowed' },
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
      sent: [
        { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
        { k: STR.k, d: { str: 11, note: 'tired' }, c: 4, a: CONNECTION },
      ],
      size: 1,
    });
  });

  test('an edit during catch-up overlays at once and sends above caught-up records', () => {
    // #given
    const harness = createHarness({ catchingUp: true });
    harness.pending.edit(field('str', 11), harness.records);
    const overlay = new Map(harness.records);

    // #when
    harness.pending.overlay(overlay);
    harness.records.set(STR.k, { ...STR, d: { str: 15 }, c: 7, a: 'gm' });
    harness.setCatchingUp(false);
    const result = harness.pending.caughtUp();

    // #then
    expect({ overlay: overlay.get(STR.k), result, sent: harness.sent }).toEqual({
      overlay: { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
      result: { notify: false },
      sent: [{ k: STR.k, d: { str: 11 }, c: 8, a: CONNECTION }],
    });
  });

  test('an edit too large for a room message returns the composer error and sends nothing', () => {
    // #given
    const harness = createHarness();

    // #when
    const result = harness.pending.edit(field('note', 'ы'.repeat(8000)), harness.records);

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { ok: false, error: 'too-large' },
      sent: [],
      size: 0,
    });
  });

  test('an edit whose replica repeat block was removed drops and notifies', () => {
    // #given
    const harness = createHarness({
      records: BASE.map((record) => (record.k === SWORD.k ? { ...record, d: null, c: 2 } : record)),
    });

    const view = new Map(harness.records);
    view.set(SWORD.k, SWORD);

    // #when
    const result = harness.pending.edit(
      field('qty', 2, 'brok', { kind: 'rep', sectionId: 'item', instanceId: 'sword' }),
      view,
    );

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { ok: true, value: { notify: true } },
      sent: [],
      size: 0,
    });
  });

  test('overlay keeps a sent version over a newer base', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    const overlay = new Map(harness.records);
    overlay.set(STR.k, { ...STR, d: { str: 10, note: 'GM' }, c: 4, a: 'gm' });

    // #when
    harness.pending.overlay(overlay);

    // #then
    expect(overlay.get(STR.k)).toEqual({
      k: STR.k,
      d: { str: 11, note: 'GM' },
      c: 3,
      a: CONNECTION,
    });
  });

  test('overlay puts a waiting patch over a newer base', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.setCatchingUp(true);
    harness.pending.edit(field('note', 'pending'), harness.records);
    const overlay = new Map(harness.records);
    overlay.set(STR.k, { ...STR, d: { str: 10, note: 'GM' }, c: 4, a: 'gm' });

    // #when
    harness.pending.overlay(overlay);

    // #then
    expect(overlay.get(STR.k)).toEqual({
      k: STR.k,
      d: { str: 11, note: 'pending' },
      c: 5,
      a: CONNECTION,
    });
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
      result: { ok: false, error: 'unchanged' },
      record: STR,
      size: 0,
    });
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
      remaining: overlay.get('row:camp:food'),
    }).toEqual({
      older: false,
      matching: true,
      size: 1,
      remaining: { k: 'row:camp:food', d: { food: 3 }, c: 1, a: CONNECTION },
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
      sent: [{ k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION }],
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
      result: { notify: true, merge: null },
      size: 0,
    });
  });

  test.each<
    [string, VersionedRecord, { merge: VersionedRecord | null; notify: boolean }, VersionedRecord[]]
  >([
    [
      'rebases stale above on the known record merged with the current record',
      { ...STR, d: { note: 'GM' }, c: 5, a: 'gm' },
      { merge: { ...STR, d: { note: 'GM' }, c: 5, a: 'gm' }, notify: false },
      [{ k: STR.k, d: { str: 11, note: 'GM' }, c: 6, a: CONNECTION }],
    ],
    [
      'drops stale above when the current record already has the patch',
      { ...STR, d: { str: 11 }, c: 5, a: 'gm' },
      { merge: { ...STR, d: { str: 11 }, c: 5, a: 'gm' }, notify: false },
      [],
    ],
    [
      'drops stale above when the current repeat block was removed',
      { ...SWORD, d: null, c: 5, a: 'gm' },
      { merge: { ...SWORD, d: null, c: 5, a: 'gm' }, notify: true },
      [],
    ],
  ])('%s', (_name, current, expected, resent) => {
    // #given
    const harness = createHarness();

    const command =
      current.k === SWORD.k
        ? field('qty', 2, 'brok', { kind: 'rep', sectionId: 'item', instanceId: 'sword' })
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
      sent: [{ k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION }],
      scheduled: [20],
    });
  });

  test('a stale answer whose rebased version is too large drops and notifies', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    const current = { ...STR, d: { str: 20, note: 'ы'.repeat(8000) }, c: 5, a: 'gm' };

    // #when
    const result = harness.pending.rejected(
      reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
    );

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: true, merge: current },
      sent: [{ k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION }],
      size: 0,
    });
  });

  test('a stale answer below the edit rebuilds over the newest known record, not only the answer', () => {
    // #given
    const known = { ...STR, d: { str: 10, note: 'known' }, c: 7, a: 'gm-known' };

    const harness = createHarness({
      records: BASE.map((record) => (record.k === STR.k ? known : record)),
    });

    harness.pending.edit(field('str', 11), harness.records);

    const current = { ...STR, d: { str: 20 }, c: 6, a: 'gm-answer' };

    // #when
    const result = harness.pending.rejected(
      reject({ k: STR.k, c: 8, a: CONNECTION }, 'stale', current),
    );

    harness.scheduled.at(-1)?.run();

    // #then
    expect({ result, sent: harness.sent }).toEqual({
      result: { notify: false, merge: current },
      sent: [
        { k: STR.k, d: { str: 11, note: 'known' }, c: 8, a: CONNECTION },
        { k: STR.k, d: { str: 11, note: 'known' }, c: 9, a: CONNECTION },
      ],
    });
  });

  test('a stale rejection during catch-up waits and mints above its current record on exit', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.setCatchingUp(true);
    const current = { ...STR, d: { str: 20 }, c: 5, a: 'gm' };

    // #when
    const rejected = harness.pending.rejected(
      reject({ k: STR.k, c: 3, a: CONNECTION }, 'stale', current),
    );

    const duringCatchUp = [...harness.sent];

    harness.records.set(STR.k, current);
    harness.setCatchingUp(false);
    const caughtUp = harness.pending.caughtUp();

    // #then
    expect({ rejected, duringCatchUp, caughtUp, sent: harness.sent }).toEqual({
      rejected: { notify: false, merge: current },
      duringCatchUp: [{ k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION }],
      caughtUp: { notify: false },
      sent: [
        { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
        { k: STR.k, d: { str: 11 }, c: 6, a: CONNECTION },
      ],
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
      result: { notify: true },
      sent: [],
      size: 0,
    });
  });

  test('a stale repeat block addition keeps its order and cells', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(add('new'), harness.records);
    harness.pending.edit(
      field('qty', 2, 'brok', { kind: 'rep', sectionId: 'item', instanceId: 'new' }),
      pendingView(harness),
    );

    const current: VersionedRecord = {
      k: 'rep:brok:item:new',
      d: { order: 5, cells: { item: 'Shield' } },
      c: 5,
      a: 'gm',
    };

    // #when
    harness.pending.rejected(reject({ k: current.k, c: 2, a: CONNECTION }, 'stale', current));

    // #then
    expect(harness.sent).toEqual([
      { k: 'rep:brok:item:new', d: { order: 1, cells: {} }, c: 1, a: CONNECTION },
      { k: 'rep:brok:item:new', d: { order: 1, cells: { qty: 2 } }, c: 2, a: CONNECTION },
      { k: 'rep:brok:item:new', d: { order: 1, cells: { qty: 2 } }, c: 6, a: CONNECTION },
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
      { k: SWORD.k, d: null, c: 2, a: CONNECTION },
      { k: SWORD.k, d: null, c: 6, a: CONNECTION },
    ]);
  });

  test.each<[string, (harness: Harness) => void, { notify: boolean; size: number }]>([
    [
      'its own revoked access',
      (harness) =>
        harness.records.set(`acl:brok:${PLAYER}`, {
          k: `acl:brok:${PLAYER}`,
          d: null,
          c: 2,
          a: 'gm',
        }),
      { notify: true, size: 0 },
    ],
    [
      'a deleted sheet',
      (harness) => harness.records.set('sheet:brok', { k: 'sheet:brok', d: null, c: 2, a: 'gm' }),
      { notify: true, size: 0 },
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
        result: { notify: expected.notify },
        size: expected.size,
      });
    },
  );

  test('records change drops a removed repeat block silently', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(remove('sword'), harness.records);
    harness.records.set(SWORD.k, { ...SWORD, d: null, c: 2, a: 'gm' });

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
      field('qty', 2, 'brok', { kind: 'rep', sectionId: 'item', instanceId: 'sword' }),
      harness.records,
    );
    harness.records.set(SWORD.k, { ...SWORD, d: null, c: 2, a: 'gm' });

    // #when
    const result = harness.pending.recordsChanged(undefined);

    // #then
    expect({ result, size: harness.pending.size() }).toEqual({ result: { notify: true }, size: 0 });
  });

  test('records change drops a waiting edit at a revoke before catch-up ends', () => {
    // #given
    const harness = createHarness({ catchingUp: true });
    harness.pending.edit(field('str', 11), harness.records);
    harness.records.set(`acl:brok:${PLAYER}`, { k: `acl:brok:${PLAYER}`, d: null, c: 2, a: 'gm' });

    // #when
    const result = harness.pending.recordsChanged(undefined);

    // #then
    expect({ result, size: harness.pending.size() }).toEqual({ result: { notify: true }, size: 0 });
  });

  test('records change keeps another sheet entry when one sheet access is revoked', () => {
    // #given
    const harness = createHarness({
      records: [
        ...BASE,
        { k: 'sheet:kira', d: { set: 'pc', order: 1 }, c: 1, a: 'seed' },
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
      result: { notify: true },
      sent: [
        { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
        { k: 'row:kira:str', d: { str: 7 }, c: 1, a: CONNECTION },
      ],
      size: 1,
      remaining: { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
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
                    [{ kind: 'field', type: 'text', id: 'name' }],
                    [{ kind: 'field', type: 'number', id: 'str' }],
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
      sent: [{ k: STR.k, d: { str: 11 }, c: 5, a: CONNECTION }],
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
      sent: [{ k: SWORD.k, d: null, c: 2, a: CONNECTION }],
      size: 0,
    });
  });

  test('a preset change moves a row entry to its new key and sends it again', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('note', 'tired'), harness.records);
    const before = harness.records.get('preset');
    const moved = movedPreset();
    harness.records.set('preset', { k: 'preset', d: encodePreset(moved), c: 2, a: 'gm' });
    harness.records.set('row:brok:note', { k: 'row:brok:note', d: { str: 10 }, c: 1, a: 'gm' });
    harness.records.set(STR.k, { ...STR, d: null, c: 3, a: 'gm' });

    // #when
    const result = harness.pending.recordsChanged(before);

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: false },
      sent: [
        { k: STR.k, d: { str: 10, note: 'tired' }, c: 3, a: CONNECTION },
        { k: 'row:brok:note', d: { str: 10, note: 'tired' }, c: 4, a: CONNECTION },
      ],
      size: 1,
    });
  });

  test('a preset change moves a repeat block removal to its new section', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(remove('sword'), harness.records);
    const before = harness.records.get('preset');
    harness.records.set('preset', { k: 'preset', d: encodePreset(movedPreset()), c: 2, a: 'gm' });
    harness.records.set('rep:brok:label:sword', {
      k: 'rep:brok:label:sword',
      d: { order: 0, cells: {} },
      c: 1,
      a: 'gm',
    });
    harness.records.set(SWORD.k, { ...SWORD, d: null, c: 2, a: 'gm' });

    // #when
    const result = harness.pending.recordsChanged(before);

    // #then
    expect({ result, sent: harness.sent, size: harness.pending.size() }).toEqual({
      result: { notify: false },
      sent: [
        { k: SWORD.k, d: null, c: 2, a: CONNECTION },
        { k: 'rep:brok:label:sword', d: null, c: 3, a: CONNECTION },
      ],
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
      sent: [{ k: STR.k, d: { str: 10, note: 'tired' }, c: 3, a: CONNECTION }],
      size: 0,
    });
  });

  test('the quiet window notifies only after its fake time has passed', () => {
    // #given
    const harness = createHarness();
    harness.pending.edit(field('str', 11), harness.records);
    harness.pending.edit(
      field('qty', 2, 'brok', { kind: 'rep', sectionId: 'item', instanceId: 'sword' }),
      harness.records,
    );
    harness.pending.edit(add('new'), harness.records);

    // #when
    const first = harness.pending.rejected(reject({ k: STR.k, c: 3, a: CONNECTION }, 'denied'));
    harness.setNow(19);
    const second = harness.pending.rejected(reject({ k: SWORD.k, c: 2, a: CONNECTION }, 'denied'));
    harness.setNow(20);

    const third = harness.pending.rejected(
      reject({ k: 'rep:brok:item:new', c: 1, a: CONNECTION }, 'denied'),
    );

    // #then
    expect({ first, second, third }).toEqual({
      first: { notify: true, merge: null },
      second: { notify: false, merge: null },
      third: { notify: true, merge: null },
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
      sent: [
        { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
        { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
        { k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION },
      ],
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
      field('qty', 2, 'brok', { kind: 'rep', sectionId: 'item', instanceId: 'new' }),
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
        field('qty', 2, 'brok', { kind: 'rep', sectionId: 'item', instanceId: 'new' }),
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
      sent: [{ k: STR.k, d: { str: 11 }, c: 3, a: CONNECTION }],
    });
  });
});

function createHarness(
  options: {
    records?: readonly VersionedRecord[];
    catchingUp?: boolean;
  } = {},
): Harness {
  const records = new Map((options.records ?? BASE).map((record) => [record.k, record]));
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

      return decoded.ok ? decoded.value : null;
    },
    compose: (view, command) =>
      composers.compose(
        {
          records: view,
          mint: (key, highestKnownCounter) => ({ c: highestKnownCounter + 1, a: CONNECTION }),
          newRecordId: (_kind, role) => role,
          isGmPlayer: () => false,
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
    schedule: (run, delay) => {
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
                  [{ kind: 'field', type: 'text', id: 'name' }],
                  [{ kind: 'field', type: 'number', id: 'str' }],
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
                  [{ kind: 'field', type: 'text', id: 'name' }],
                  [
                    { kind: 'field', type: 'text', id: 'note' },
                    { kind: 'field', type: 'number', id: 'str' },
                  ],
                ],
              },
              {
                repeat: true,
                rows: [
                  [
                    { kind: 'field', type: 'text', id: 'label' },
                    { kind: 'field', type: 'number', id: 'qty' },
                  ],
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
  value: string | number,
  sheetId = 'brok',
  target:
    | { kind: 'row'; rowId: string }
    | { kind: 'rep'; sectionId: string; instanceId: string } = { kind: 'row', rowId: 'str' },
): Extract<Command, { type: 'field-patch' }> {
  return { type: 'field-patch', sheetId, target, fieldId, value };
}

function add(instanceId: string): Extract<PlayerEditCommand, { type: 'repeat-block-add' }> {
  return { type: 'repeat-block-add', sheetId: 'brok', sectionId: 'item', instanceId };
}

function remove(instanceId: string): Extract<PlayerEditCommand, { type: 'repeat-block-delete' }> {
  return { type: 'repeat-block-delete', sheetId: 'brok', sectionId: 'item', instanceId };
}

function reject(
  edit: { k: string; c: number; a: string },
  reason: 'denied' | 'stale',
  current?: VersionedRecord,
): RejectMessage {
  const message = {
    v: 3,
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
