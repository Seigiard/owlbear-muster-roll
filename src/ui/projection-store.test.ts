import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';

import { createProjectionStore } from './projection-store';

const FIRST: VersionedRecord = { k: 'link:a', d: 's1', c: 1, a: 'conn' };
const SECOND: VersionedRecord = { k: 'link:b', d: 's2', c: 1, a: 'conn' };
const LIVE: SyncState = { state: 'live', firstCatchUpDone: true, role: 'GM' };
const CATCHING_UP: SyncState = { state: 'catching-up', firstCatchUpDone: true, role: 'GM' };

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
    const updated: VersionedRecord = { k: 'link:a', d: 's9', c: 2, a: 'conn' };

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
      before: { state: 'catching-up', firstCatchUpDone: false, role: 'PLAYER' },
      after: LIVE,
    });
  });

  test('shows the pending view over the replica record of its key while catching up', () => {
    // #given
    const store = createProjectionStore();
    const pendingFirst: VersionedRecord = { k: 'link:a', d: 's7', c: 2, a: 'conn' };
    const replicaFirst: VersionedRecord = { k: 'link:a', d: 's3', c: 2, a: 'other' };

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

  test('drops the pending view when a delta says catch-up ended', () => {
    // #given
    const store = createProjectionStore();
    const created: VersionedRecord = { k: 'link:c', d: 's5', c: 1, a: 'conn' };

    store.replaceAll([FIRST], [created], [], CATCHING_UP);

    // #when
    store.applyDelta([], [], [], [], LIVE);

    // #then
    expect([...store.$records.get().values()]).toEqual([FIRST]);
  });

  test('shows the replica record again for a withdrawn pending key, or nothing when it has none', () => {
    // #given
    const store = createProjectionStore();
    const pendingFirst: VersionedRecord = { k: 'link:a', d: 's7', c: 2, a: 'conn' };
    const created: VersionedRecord = { k: 'link:c', d: 's5', c: 1, a: 'conn' };

    store.replaceAll([FIRST], [pendingFirst, created], [], CATCHING_UP);

    // #when
    store.applyDelta([], [], ['link:a', 'link:c'], [], CATCHING_UP);

    // #then
    expect([...store.$records.get().values()]).toEqual([FIRST]);
  });

  test('keeps no pending view from a projection of a live engine', () => {
    // #given
    const store = createProjectionStore();
    const created: VersionedRecord = { k: 'link:c', d: 's5', c: 1, a: 'conn' };

    // #when
    store.replaceAll([FIRST], [created], [], LIVE);

    // #then
    expect([...store.$records.get().values()]).toEqual([FIRST]);
  });

  test('remembers each rejected command by its id, when two land before anyone reads them', () => {
    // #given
    const store = createProjectionStore();

    // #when
    store.setRejection({ t: 'command-rejected', id: 'c1', reason: 'too-large' });
    store.setRejection({ t: 'command-rejected', id: 'c2', reason: 'unknown-field' });

    // #then
    expect([...store.$rejections.get()]).toEqual([
      ['c1', { t: 'command-rejected', id: 'c1', reason: 'too-large' }],
      ['c2', { t: 'command-rejected', id: 'c2', reason: 'unknown-field' }],
    ]);
  });

  test('forgets the oldest rejection past 256', () => {
    // #given
    const store = createProjectionStore();

    // #when
    for (let index = 0; index <= 256; index += 1) {
      store.setRejection({ t: 'command-rejected', id: `c${index}`, reason: 'too-large' });
    }

    // #then
    expect({
      size: store.$rejections.get().size,
      oldest: store.$rejections.get().has('c0'),
      newest: store.$rejections.get().has('c256'),
    }).toEqual({ size: 256, oldest: false, newest: true });
  });
});
