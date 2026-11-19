import { Result } from 'better-result';
import { beforeEach, describe, expect, test } from 'bun:test';
import { StorageFailure } from '@/platform/ports';
import { createBrowserStorage } from './browser-storage';

const QUOTA_ERROR = new DOMException('quota exceeded', 'QuotaExceededError');

function storageThrowing(error: DOMException): Storage {
  const fail = (): never => {
    throw error;
  };

  return {
    get length(): number {
      throw error;
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe('browser storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  test('reads back a written value', () => {
    // #given
    const storage = createBrowserStorage(() => localStorage);
    storage.setItem('key', 'value');
    // #when
    const read = storage.getItem('key');
    // #then
    expect(read).toEqual(Result.ok('value'));
  });
  test('reads an absent key as null', () => {
    // #given
    const storage = createBrowserStorage(() => localStorage);
    // #when
    const read = storage.getItem('absent');
    // #then
    expect(read).toEqual(Result.ok(null));
  });
  test('removes a key', () => {
    // #given
    const storage = createBrowserStorage(() => localStorage);
    storage.setItem('key', 'value');
    // #when
    storage.removeItem('key');
    // #then
    expect(localStorage.getItem('key')).toBeNull();
  });
  test('lists the stored keys', () => {
    // #given
    const storage = createBrowserStorage(() => localStorage);
    storage.setItem('first', '1');
    storage.setItem('second', '2');
    // #when
    const keys = storage.keys();
    // #then
    expect(keys).toEqual(Result.ok(['first', 'second']));
  });
  test('returns a failure when a write throws a quota error', () => {
    // #given
    const storage = createBrowserStorage(() => storageThrowing(QUOTA_ERROR));
    // #when
    const written = storage.setItem('key', 'value');
    // #then
    expect(written).toEqual(
      Result.err(
        new StorageFailure({ operation: 'write', reason: 'QuotaExceededError: quota exceeded' }),
      ),
    );
  });
  test('returns a failure when a read throws', () => {
    // #given
    const storage = createBrowserStorage(() => storageThrowing(QUOTA_ERROR));
    // #when
    const read = storage.getItem('key');
    // #then
    expect(read).toEqual(
      Result.err(
        new StorageFailure({ operation: 'read', reason: 'QuotaExceededError: quota exceeded' }),
      ),
    );
  });
  test('returns a failure when a remove throws', () => {
    // #given
    const storage = createBrowserStorage(() => storageThrowing(QUOTA_ERROR));
    // #when
    const removed = storage.removeItem('key');
    // #then
    expect(removed).toEqual(
      Result.err(
        new StorageFailure({ operation: 'remove', reason: 'QuotaExceededError: quota exceeded' }),
      ),
    );
  });
  test('returns a failure when listing throws', () => {
    // #given
    const storage = createBrowserStorage(() => storageThrowing(QUOTA_ERROR));
    // #when
    const keys = storage.keys();
    // #then
    expect(keys).toEqual(
      Result.err(
        new StorageFailure({ operation: 'list', reason: 'QuotaExceededError: quota exceeded' }),
      ),
    );
  });
  test('returns a failure when reaching localStorage itself throws', () => {
    // #given
    const denied = new DOMException('access denied', 'SecurityError');

    const storage = createBrowserStorage(() => {
      throw denied;
    });

    // #when
    const read = storage.getItem('key');
    // #then
    expect(read).toEqual(
      Result.err(new StorageFailure({ operation: 'read', reason: 'SecurityError: access denied' })),
    );
  });
});
