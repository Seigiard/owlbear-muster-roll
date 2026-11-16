import { describe, expect, test } from 'bun:test';
import { parseRecord } from './records';

describe('v4 token-cell link records', () => {
  test('accepts a link to a token cell in the sheet root', () => {
    // #given
    const candidate = {
      k: 'link:token-root',
      d: { s: 'inventory', c: 'inventory_token' },
      c: 1,
      a: 'gm-a',
    };

    // #when
    const parsed = parseRecord(candidate);

    // #then
    expect(parsed).toEqual({ ok: true, value: candidate });
  });

  test('accepts a link to a token cell in a repeat block path', () => {
    // #given
    const candidate = {
      k: 'link:token-attack',
      d: { s: 'brok', path: ['attacks', 'a1'], c: 'attack_token' },
      c: 1,
      a: 'gm-a',
    };

    // #when
    const parsed = parseRecord(candidate);

    // #then
    expect(parsed).toEqual({ ok: true, value: candidate });
  });
});
