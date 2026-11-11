import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import type { StorageFailure, StorageOperation, StoragePort } from '@/platform/ports';
import { createRecordStore } from '@/replica/record-store';

const GENERATION = { n: 2, a: 'x' };
const STORAGE_KEY = 'mr1:r:2:x:link:t';

function link(c: number, d = 's1'): VersionedRecord {
  return { k: 'link:t', d, c, a: 'conn' };
}

type FakeStorage = {
  port: StoragePort;
  entries: Map<string, string>;
  failing: Set<StorageOperation>;
  attemptedWrites: string[];
};

function failure(operation: StorageOperation): Result<never, StorageFailure> {
  return err({ operation, reason: 'fake failure' });
}

function createFakeStorage(): FakeStorage {
  const entries = new Map<string, string>();
  const failing = new Set<StorageOperation>();
  const attemptedWrites: string[] = [];

  return {
    entries,
    failing,
    attemptedWrites,
    port: {
      getItem: (key) => (failing.has('read') ? failure('read') : ok(entries.get(key) ?? null)),
      setItem: (key, value) => {
        attemptedWrites.push(key);

        if (failing.has('write')) {
          return failure('write');
        }

        entries.set(key, value);

        return ok(undefined);
      },
      removeItem: (key) => {
        if (failing.has('remove')) {
          return failure('remove');
        }

        entries.delete(key);

        return ok(undefined);
      },
      keys: () => (failing.has('list') ? failure('list') : ok([...entries.keys()])),
    },
  };
}

describe('record store write', () => {
  test('stores the record as JSON under the AD-11 key', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    // #when
    store.write(GENERATION, link(1));

    // #then
    expect([...storage.entries]).toEqual([
      [STORAGE_KEY, '{"k":"link:t","d":"s1","c":1,"a":"conn"}'],
    ]);
  });

  test('replaces a stored record with a newer one', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set(STORAGE_KEY, '{"k":"link:t","d":"old","c":3,"a":"conn"}');

    // #when
    const written = createRecordStore(storage.port, 'r').write(GENERATION, link(4, 'new'));

    // #then
    expect({ written, stored: storage.entries.get(STORAGE_KEY) }).toEqual({
      written: ok(link(4, 'new')),
      stored: '{"k":"link:t","d":"new","c":4,"a":"conn"}',
    });
  });

  test('keeps the newer stored record when a stale tab writes a lower version', () => {
    // #given
    const storage = createFakeStorage();
    const freshTab = createRecordStore(storage.port, 'r');
    const staleTab = createRecordStore(storage.port, 'r');

    freshTab.write(GENERATION, link(5, 'fresh'));

    // #when
    const written = staleTab.write(GENERATION, link(3, 'stale'));

    // #then
    expect({ written, stored: storage.entries.get(STORAGE_KEY) }).toEqual({
      written: ok(link(5, 'fresh')),
      stored: '{"k":"link:t","d":"fresh","c":5,"a":"conn"}',
    });
  });

  test('reports success for a stale write while storage is full, as it writes nothing', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    store.write(GENERATION, link(5));
    storage.failing.add('write');

    // #when
    const written = store.write(GENERATION, link(3));

    // #then
    expect(written).toEqual(ok(link(5)));
  });

  test('keeps a stored tombstone when a lower-version write carries data', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set(STORAGE_KEY, '{"k":"link:t","d":null,"c":6,"a":"conn"}');

    // #when
    const written = createRecordStore(storage.port, 'r').write(GENERATION, link(5));

    // #then
    expect({ written, stored: storage.entries.get(STORAGE_KEY) }).toEqual({
      written: ok({ k: 'link:t', d: null, c: 6, a: 'conn' }),
      stored: '{"k":"link:t","d":null,"c":6,"a":"conn"}',
    });
  });

  test('makes no write for an identical re-write while storage is full', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    store.write(GENERATION, link(5));
    storage.failing.add('write');

    // #when
    const written = store.write(GENERATION, link(5));

    // #then
    expect({ written, attemptedWrites: storage.attemptedWrites }).toEqual({
      written: ok(link(5)),
      attemptedWrites: [STORAGE_KEY],
    });
  });

  test('refuses a record the read path would refuse and leaves the store empty', () => {
    // #given
    const storage = createFakeStorage();

    // #when
    const written = createRecordStore(storage.port, 'r').write(GENERATION, {
      k: 'row:s:r',
      d: { x: '' },
      c: 1,
      a: 'conn',
    });

    // #then
    expect({
      written,
      size: storage.entries.size,
      attemptedWrites: storage.attemptedWrites,
    }).toEqual({ written: err('invalid-record'), size: 0, attemptedWrites: [] });
  });

  test.each([
    ['text that is not JSON', '{not json'],
    ['JSON that is not a record', '{"k":"link:t","d":"s","c":0,"a":"conn"}'],
    ['a record of another key', '{"k":"link:other","d":"s","c":99,"a":"conn"}'],
  ])('writes the incoming record over %s', (_name, corrupt) => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set(STORAGE_KEY, corrupt);

    // #when
    createRecordStore(storage.port, 'r').write(GENERATION, link(1));

    // #then
    expect(storage.entries.get(STORAGE_KEY)).toBe('{"k":"link:t","d":"s1","c":1,"a":"conn"}');
  });

  test('returns a failure when the write fails', () => {
    // #given
    const storage = createFakeStorage();

    storage.failing.add('write');

    // #when
    const written = createRecordStore(storage.port, 'r').write(GENERATION, link(1));

    // #then
    expect(written).toEqual(err({ operation: 'write', reason: 'fake failure' }));
  });

  test('returns a failure and writes nothing when the read fails', () => {
    // #given
    const storage = createFakeStorage();

    storage.failing.add('read');

    // #when
    const written = createRecordStore(storage.port, 'r').write(GENERATION, link(1));

    // #then
    expect({ written, size: storage.entries.size }).toEqual({
      written: err({ operation: 'read', reason: 'fake failure' }),
      size: 0,
    });
  });

  test('returns a failure for a room id that cannot form a key', () => {
    // #given
    const storage = createFakeStorage();

    // #when
    const written = createRecordStore(storage.port, 'a:b').write(GENERATION, link(1));

    // #then
    expect({ written, size: storage.entries.size }).toEqual({
      written: err('invalid-storage-key'),
      size: 0,
    });
  });
});

describe('record store loadGeneration', () => {
  test('returns only the records of this room and generation', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:r:2:x:link:t', '{"k":"link:t","d":"mine","c":1,"a":"conn"}');
    storage.entries.set('mr1:r:1:x:link:t', '{"k":"link:t","d":"older","c":1,"a":"conn"}');
    storage.entries.set('mr1:r:2:y:link:t', '{"k":"link:t","d":"author","c":1,"a":"conn"}');
    storage.entries.set('mr1:other:2:x:link:t', '{"k":"link:t","d":"room","c":1,"a":"conn"}');
    storage.entries.set('unrelated', 'value');

    // #when
    const loaded = createRecordStore(storage.port, 'r').loadGeneration(GENERATION);

    // #then
    expect(loaded).toEqual(
      ok({ records: [{ k: 'link:t', d: 'mine', c: 1, a: 'conn' }], corruptKeys: [] }),
    );
  });

  test('returns a tombstone', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set(STORAGE_KEY, '{"k":"link:t","d":null,"c":6,"a":"conn"}');

    // #when
    const loaded = createRecordStore(storage.port, 'r').loadGeneration(GENERATION);

    // #then
    expect(loaded).toEqual(
      ok({ records: [{ k: 'link:t', d: null, c: 6, a: 'conn' }], corruptKeys: [] }),
    );
  });

  test('skips a corrupt value and keeps the valid records', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:r:2:x:link:bad', '{not json');
    storage.entries.set('mr1:r:2:x:link:t', '{"k":"link:t","d":"s1","c":1,"a":"conn"}');

    // #when
    const loaded = createRecordStore(storage.port, 'r').loadGeneration(GENERATION);

    // #then
    expect(loaded).toEqual(ok({ records: [link(1)], corruptKeys: ['link:bad'] }));
  });

  test('does not report a corrupt value of another generation', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:r:1:x:link:bad', '{not json');

    // #when
    const loaded = createRecordStore(storage.port, 'r').loadGeneration(GENERATION);

    // #then
    expect(loaded).toEqual(ok({ records: [], corruptKeys: [] }));
  });

  test('reports a record filed under another key as corrupt', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set(STORAGE_KEY, '{"k":"link:other","d":"s","c":9,"a":"conn"}');

    // #when
    const loaded = createRecordStore(storage.port, 'r').loadGeneration(GENERATION);

    // #then
    expect(loaded).toEqual(ok({ records: [], corruptKeys: ['link:t'] }));
  });

  test('returns a failure when listing keys fails', () => {
    // #given
    const storage = createFakeStorage();

    storage.failing.add('list');

    // #when
    const loaded = createRecordStore(storage.port, 'r').loadGeneration(GENERATION);

    // #then
    expect(loaded).toEqual(err({ operation: 'list', reason: 'fake failure' }));
  });

  test('returns a failure, not a partial load, when a read fails', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set(STORAGE_KEY, '{"k":"link:t","d":"s1","c":1,"a":"conn"}');
    storage.failing.add('read');

    // #when
    const loaded = createRecordStore(storage.port, 'r').loadGeneration(GENERATION);

    // #then
    expect(loaded).toEqual(err({ operation: 'read', reason: 'fake failure' }));
  });
});

describe('record store readHighestGeneration', () => {
  test('returns the initial generation when the room has no record', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:other:5:x:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');

    // #when
    const generation = createRecordStore(storage.port, 'r').readHighestGeneration();

    // #then
    expect(generation).toEqual(ok({ n: 0, a: '' }));
  });

  test('returns the highest stored generation and ignores other rooms', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:r:1:b:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');
    storage.entries.set('mr1:r:2:a:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');
    storage.entries.set('mr1:other:9:z:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');

    // #when
    const generation = createRecordStore(storage.port, 'r').readHighestGeneration();

    // #then
    expect(generation).toEqual(ok({ n: 2, a: 'a' }));
  });

  test('breaks a generation tie by author', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:r:2:b:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');
    storage.entries.set('mr1:r:2:a:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');

    // #when
    const generation = createRecordStore(storage.port, 'r').readHighestGeneration();

    // #then
    expect(generation).toEqual(ok({ n: 2, a: 'b' }));
  });

  test('counts a generation that holds only tombstones', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:r:1:a:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');
    storage.entries.set('mr1:r:7:a:link:t', '{"k":"link:t","d":null,"c":6,"a":"conn"}');

    // #when
    const generation = createRecordStore(storage.port, 'r').readHighestGeneration();

    // #then
    expect(generation).toEqual(ok({ n: 7, a: 'a' }));
  });

  test('does not count a generation that holds only corrupt values', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set('mr1:r:1:a:link:t', '{"k":"link:t","d":"s","c":1,"a":"conn"}');
    storage.entries.set('mr1:r:7:a:link:t', '{not json');

    // #when
    const generation = createRecordStore(storage.port, 'r').readHighestGeneration();

    // #then
    expect(generation).toEqual(ok({ n: 1, a: 'a' }));
  });

  test('returns a failure when listing keys fails', () => {
    // #given
    const storage = createFakeStorage();

    storage.failing.add('list');

    // #when
    const generation = createRecordStore(storage.port, 'r').readHighestGeneration();

    // #then
    expect(generation).toEqual(err({ operation: 'list', reason: 'fake failure' }));
  });

  test('returns a failure when a read fails', () => {
    // #given
    const storage = createFakeStorage();

    storage.entries.set(STORAGE_KEY, '{"k":"link:t","d":"s1","c":1,"a":"conn"}');
    storage.failing.add('read');

    // #when
    const generation = createRecordStore(storage.port, 'r').readHighestGeneration();

    // #then
    expect(generation).toEqual(err({ operation: 'read', reason: 'fake failure' }));
  });
});

describe('record store generations', () => {
  const RECORD = '{"k":"link:t","d":"s","c":1,"a":"conn"}';

  test('does not read a generation with the incomplete marker as the highest', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    storage.entries.set('mr1:r:1:a:link:t', RECORD);
    storage.entries.set('mr1:r:2:b:link:t', RECORD);
    store.markIncomplete({ n: 2, a: 'b' });

    // #when
    const generation = store.readHighestGeneration();

    // #then
    expect(generation).toEqual(ok({ n: 1, a: 'a' }));
  });

  test('reads a generation again once it is marked complete', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    storage.entries.set('mr1:r:2:b:link:t', RECORD);
    store.markIncomplete({ n: 2, a: 'b' });

    // #when
    store.markComplete({ n: 2, a: 'b' });

    // #then
    expect({
      generation: store.readHighestGeneration(),
      keys: [...storage.entries.keys()],
    }).toEqual({ generation: ok({ n: 2, a: 'b' }), keys: ['mr1:r:2:b:link:t'] });
  });

  test('removes every key of an incomplete generation of this room, and nothing else', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    storage.entries.set('mr1:r:1:a:link:t', RECORD);
    storage.entries.set('mr1:r:2:b:link:t', RECORD);
    storage.entries.set('mr1:other:2:b:link:t', RECORD);
    storage.entries.set('mr1:other:2:b:#incomplete', '1');
    store.markIncomplete({ n: 2, a: 'b' });

    // #when
    store.removeIncomplete();

    // #then
    expect([...storage.entries.keys()].sort()).toEqual([
      'mr1:other:2:b:#incomplete',
      'mr1:other:2:b:link:t',
      'mr1:r:1:a:link:t',
    ]);
  });

  test('removes the generations below one, with their markers, and keeps that one and others', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    storage.entries.set('mr1:r:0::link:t', RECORD);
    storage.entries.set('mr1:r:1:a:link:t', RECORD);
    storage.entries.set('mr1:r:1:a:#incomplete', '1');
    storage.entries.set('mr1:r:2:b:link:t', RECORD);
    storage.entries.set('mr1:other:0::link:t', RECORD);

    // #when
    store.removeGenerationsBelow({ n: 2, a: 'b' });

    // #then
    expect([...storage.entries.keys()].sort()).toEqual(['mr1:other:0::link:t', 'mr1:r:2:b:link:t']);
  });

  test('removes one generation with its marker', () => {
    // #given
    const storage = createFakeStorage();
    const store = createRecordStore(storage.port, 'r');

    storage.entries.set('mr1:r:0::link:t', RECORD);
    storage.entries.set('mr1:r:2:b:link:t', RECORD);
    store.markIncomplete({ n: 2, a: 'b' });

    // #when
    store.removeGeneration({ n: 2, a: 'b' });

    // #then
    expect([...storage.entries.keys()]).toEqual(['mr1:r:0::link:t']);
  });
});
