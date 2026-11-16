import { describe, expect, test } from 'bun:test';
import { toSendResult } from './send-result';

type Cyclic = {
  self?: Cyclic;
};

describe('toSendResult', () => {
  test('reports a resolved send as ok', async () => {
    // #when
    const result = await toSendResult(() => Promise.resolve());
    // #then
    expect(result).toEqual({ ok: true, value: undefined });
  });
  test('reports the Owlbear RateLimitHit rejection as rate-limited', async () => {
    // #given
    const rejection = { error: { name: 'RateLimitHit', message: 'slow down' } };
    // #when
    const result = await toSendResult(() => Promise.reject(rejection));
    // #then
    expect(result).toEqual({ ok: false, error: { kind: 'rate-limited' } });
  });
  test('reports another Owlbear rejection as a failure', async () => {
    // #given
    const rejection = { error: { name: 'Forbidden' } };
    // #when
    const result = await toSendResult(() => Promise.reject(rejection));
    // #then
    expect(result).toEqual({
      ok: false,
      error: { kind: 'failed', reason: '{"error":{"name":"Forbidden"}}' },
    });
  });
  test('describes an undefined rejection', async () => {
    // #when
    const result = await toSendResult(() => Promise.reject(undefined));
    // #then
    expect(result).toEqual({ ok: false, error: { kind: 'failed', reason: 'undefined' } });
  });
  test('describes a cyclic rejection without throwing', async () => {
    // #given
    const cyclic: Cyclic = {};
    cyclic.self = cyclic;
    // #when
    const result = await toSendResult(() => Promise.reject(cyclic));
    // #then
    expect(result).toEqual({ ok: false, error: { kind: 'failed', reason: '[object Object]' } });
  });
  test('describes a BigInt rejection without throwing', async () => {
    // #when
    const result = await toSendResult(() => Promise.reject(12n));
    // #then
    expect(result).toEqual({ ok: false, error: { kind: 'failed', reason: '12' } });
  });
  test('reports a thrown Error as a failure', async () => {
    // #when
    const result = await toSendResult(() => Promise.reject(new Error('gone')));
    // #then
    expect(result).toEqual({ ok: false, error: { kind: 'failed', reason: 'Error: gone' } });
  });
});
