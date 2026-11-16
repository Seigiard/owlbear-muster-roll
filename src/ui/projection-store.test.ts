import { fixturePatch } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import { mergeRecords } from '@/core/merge';
import type { VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';
import { createProjectionStore } from './projection-store';

const FIRST: VersionedRecord = { k: 'link:a', d: { s: 's1' }, c: 1, a: 'conn' };
const SECOND: VersionedRecord = { k: 'link:b', d: { s: 's2' }, c: 1, a: 'conn' };

const LIVE: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: false,
  gmLink: 'offline',
  role: 'GM',
};

const PLAYER_LIVE: SyncState = { ...LIVE, gmLink: 'online', role: 'PLAYER' };

const STR_ROW: VersionedRecord = {
  k: 'blk:brok',
  d: { order: 0, cells: { str: [10, 2, 'gm'], note: ['а', 2, 'gm'] } },
  c: 2,
  a: 'gm',
  l: [1, 'seed'],
};

const SWORD: VersionedRecord = {
  k: 'blk:brok:item:r1',
  d: { order: 0, cells: {} },
  c: 1,
  a: 'gm',
  l: [1, 'seed'],
};

const CATCHING_UP: SyncState = {
  state: 'catching-up',
  firstCatchUpDone: true,
  gmAnswered: false,
  gmLink: 'offline',
  role: 'GM',
};

describe('projection store', () => {
  test('replaces all records and notices from a projection', () => {
    // #given
    const store = createProjectionStore();
    store.replaceAll([FIRST], [], ['local-save-failed'], LIVE);
    // #when
    store.replaceAll([SECOND], [], [], LIVE);
    // #then
    expect({
      records: [...store.$records.get().values()],
      notices: store.$notices.get(),
    }).toEqual({ records: [SECOND], notices: [] });
  });
  test('applies a delta over existing records and takes its notices', () => {
    // #given
    const store = createProjectionStore();
    const updated: VersionedRecord = { k: 'link:a', d: { s: 's9' }, c: 2, a: 'conn' };
    store.replaceAll([FIRST, SECOND], [], [], LIVE);
    // #when
    store.applyDelta([updated], [], [], ['local-save-failed'], LIVE);
    // #then
    expect({
      records: [...store.$records.get().values()],
      notices: store.$notices.get(),
    }).toEqual({ records: [updated, SECOND], notices: ['local-save-failed'] });
  });
  test('is not loaded before the first projection, even after a delta', () => {
    // #given
    const store = createProjectionStore();
    // #when
    store.applyDelta([FIRST], [], [], [], LIVE);
    // #then
    expect(store.$loaded.get()).toBe(false);
  });
  test('is loaded once a projection replaces all records, even an empty one', () => {
    // #given
    const store = createProjectionStore();
    // #when
    store.replaceAll([], [], [], LIVE);
    // #then
    expect(store.$loaded.get()).toBe(true);
  });
  test('starts with the first catch-up not ended, and takes the sync state of a projection', () => {
    // #given
    const store = createProjectionStore();
    const before = store.$sync.get();
    // #when
    store.replaceAll([], [], [], LIVE);
    // #then
    expect({ before, after: store.$sync.get() }).toEqual({
      before: {
        state: 'catching-up',
        firstCatchUpDone: false,
        gmAnswered: false,
        gmLink: 'offline',
        role: 'PLAYER',
      },
      after: LIVE,
    });
  });
  test('shows the pending view over the replica record of its key while catching up', () => {
    // #given
    const store = createProjectionStore();
    const pendingFirst: VersionedRecord = { k: 'link:a', d: { s: 's7' }, c: 2, a: 'conn' };
    const replicaFirst: VersionedRecord = { k: 'link:a', d: { s: 's3' }, c: 2, a: 'other' };
    store.replaceAll([FIRST, SECOND], [], [], CATCHING_UP);
    // #when
    store.applyDelta([], [pendingFirst], [], [], CATCHING_UP);
    const pendingShown = store.$records.get().get('link:a');
    store.applyDelta([replicaFirst], [], [], [], CATCHING_UP);
    // #then
    expect({ pendingShown, stillPending: store.$records.get().get('link:a') }).toEqual({
      pendingShown: pendingFirst,
      stillPending: pendingFirst,
    });
  });
  test('keeps a pending view record through a live delta until the engine withdraws its key', () => {
    // #given
    const store = createProjectionStore();
    const proposed: VersionedRecord = { k: 'link:c', d: { s: 's5' }, c: 1, a: 'conn' };
    store.replaceAll([FIRST], [proposed], [], CATCHING_UP);
    // #when
    store.applyDelta([], [], [], [], LIVE);
    // #then
    expect([...store.$records.get().values()]).toEqual([FIRST, proposed]);
  });
  test('shows the replica record a delta brings again for a withdrawn pending key, or nothing', () => {
    // #given
    const store = createProjectionStore();
    const pendingFirst: VersionedRecord = { k: 'link:a', d: { s: 's7' }, c: 2, a: 'conn' };
    const created: VersionedRecord = { k: 'link:c', d: { s: 's5' }, c: 1, a: 'conn' };
    store.replaceAll([FIRST], [pendingFirst, created], [], CATCHING_UP);
    // #when
    store.applyDelta([FIRST], [], ['link:a', 'link:c'], [], CATCHING_UP);
    // #then
    expect([...store.$records.get().values()]).toEqual([FIRST]);
  });
  test('drops a withdrawn key from the replica, also while live', () => {
    // #given
    const store = createProjectionStore();
    store.replaceAll([FIRST, SECOND], [], [], LIVE);
    // #when
    store.applyDelta([], [], ['link:a'], [], LIVE);
    // #then
    expect([...store.$records.get().values()]).toEqual([SECOND]);
  });
  test("shows a live player's pending edits from a projection over the replica", () => {
    // #given
    const store = createProjectionStore();
    const proposed: VersionedRecord = { k: 'link:a', d: { s: 's9' }, c: 2, a: 'conn' };
    // #when
    store.replaceAll([FIRST, SECOND], [proposed], [], LIVE);
    // #then
    expect({
      shown: [...store.$records.get().values()],
      replica: store.$replica.get().get('link:a'),
    }).toEqual({
      shown: [proposed, SECOND],
      replica: FIRST,
    });
  });
});

describe("projection store's pending entries", () => {
  test("names a player's field edit by the fields it changes over the applied record, with their values", () => {
    // #given
    const store = createProjectionStore();
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11, hp: 3 }, 3, 'p');
    // #when
    store.replaceAll([STR_ROW], [proposed], [], PLAYER_LIVE);
    // #then
    const entry = store.$pending.get().get(STR_ROW.k);
    expect({
      kind: entry?.kind,
      fields: [...(entry?.fields ?? [])].sort(([first], [second]) => first.localeCompare(second)),
    }).toEqual({
      kind: 'edit',
      fields: [
        ['hp', 3],
        ['str', 11],
      ],
    });
  });
  test('keeps a root clear pending mark and unrelated applied cells in the shown record', () => {
    // #given
    const store = createProjectionStore();
    const cleared = fixturePatch(STR_ROW, { note: null }, 3, 'p');
    // #when
    store.replaceAll([STR_ROW], [cleared], [], PLAYER_LIVE);
    // #then
    const entry = store.$pending.get().get(STR_ROW.k);
    expect({
      fields: [...(entry?.fields ?? [])],
      shown: store.$records.get().get(STR_ROW.k),
    }).toEqual({
      fields: [['note', null]],
      shown: mergeRecords(STR_ROW, cleared),
    });
  });
  test('names a new repeat row an add, and a repeat row a removal turns to a tombstone a remove', () => {
    // #given
    const store = createProjectionStore();

    const added: VersionedRecord = {
      k: 'blk:brok:item:r9',
      d: { order: 1, cells: {} },
      c: 1,
      a: 'p',
      l: [1, 'seed'],
    };

    const removed: VersionedRecord = fixturePatch(SWORD, null, 2, 'p');
    // #when
    store.replaceAll([SWORD], [added, removed], [], PLAYER_LIVE);
    // #then
    expect(
      [...store.$pending.get()].map(([key, entry]) => [key, entry.kind, entry.applied]),
    ).toEqual([
      [added.k, 'add', undefined],
      [SWORD.k, 'remove', SWORD],
    ]);
  });
  test('names a cell edit of a repeat row an edit of that cell', () => {
    // #given
    const store = createProjectionStore();
    const proposed: VersionedRecord = fixturePatch(SWORD, { order: 0, cells: { qty: 2 } }, 2, 'p');
    // #when
    store.replaceAll([SWORD], [proposed], [], PLAYER_LIVE);
    // #then
    const entry = store.$pending.get().get(SWORD.k);
    expect({ kind: entry?.kind, fields: [...(entry?.fields ?? [])] }).toEqual({
      kind: 'edit',
      fields: [['qty', 2]],
    });
  });
  test('keeps the touched field when an edit returns to the applied value', () => {
    // #given
    const store = createProjectionStore();

    const proposed: VersionedRecord = {
      ...STR_ROW,
      d: { order: 0, cells: { str: [10, 4, 'p'] } },
      c: 4,
      a: 'p',
    };

    // #when
    store.replaceAll([STR_ROW], [proposed], [], PLAYER_LIVE);
    // #then
    const entry = store.$pending.get().get(STR_ROW.k);
    expect({
      kind: entry?.kind,
      fields: [...(entry?.fields ?? [])],
      record: entry?.record,
    }).toEqual({
      kind: 'edit',
      fields: [['str', 10]],
      record: mergeRecords(STR_ROW, proposed),
    });
  });
  test('drops an entry once the engine withdraws its key', () => {
    // #given
    const store = createProjectionStore();
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, 'p');
    store.replaceAll([STR_ROW], [proposed], [], PLAYER_LIVE);
    // #when
    store.applyDelta([proposed], [], [STR_ROW.k], [], PLAYER_LIVE);
    // #then
    expect([...store.$pending.get().keys()]).toEqual([]);
  });
  test("holds none for a GM, whose catch-up queue is no player's edit", () => {
    // #given
    const store = createProjectionStore();
    const queued: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, 'gm');
    // #when
    store.replaceAll([STR_ROW], [queued], [], CATCHING_UP);
    // #then
    expect({
      shown: store.$records.get().get(STR_ROW.k),
      pending: store.$pending.get().size,
    }).toEqual({ shown: mergeRecords(STR_ROW, queued), pending: 0 });
  });
});
