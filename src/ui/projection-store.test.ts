import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';

import { createProjectionStore } from './projection-store';

const FIRST: VersionedRecord = { k: 'link:a', d: 's1', c: 1, a: 'conn' };
const SECOND: VersionedRecord = { k: 'link:b', d: 's2', c: 1, a: 'conn' };

describe('projection store', () => {
  test('replaces all records and notices from a projection', () => {
    // #given
    const store = createProjectionStore();

    store.replaceAll([FIRST], ['local-save-failed']);

    // #when
    store.replaceAll([SECOND], []);

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

    store.replaceAll([FIRST, SECOND], []);

    // #when
    store.applyDelta([updated], ['local-save-failed']);

    // #then
    expect({
      records: [...store.$records.get().values()],
      notices: store.$notices.get(),
    }).toEqual({ records: [updated, SECOND], notices: ['local-save-failed'] });
  });

  test('remembers a rejected command', () => {
    // #given
    const store = createProjectionStore();

    // #when
    store.setRejection({ t: 'command-rejected', id: 'c1', reason: 'too-large' });

    // #then
    expect(store.$rejection.get()).toEqual({
      t: 'command-rejected',
      id: 'c1',
      reason: 'too-large',
    });
  });
});
