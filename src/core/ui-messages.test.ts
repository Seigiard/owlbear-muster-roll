import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';

import {
  parseEngineMessage,
  parseWindowMessage,
  UI_CHANNEL,
  type Command,
  type EngineMessage,
  type WindowMessage,
} from './ui-messages';

const SHEET_CREATE: Command = { type: 'sheet-create', kind: 'pc', name: 'Брок' };

describe('UI_CHANNEL', () => {
  test('is the channel of AD-10', () => {
    // #then
    expect(UI_CHANNEL).toBe('app.muster-roll/ui');
  });
});

describe('parseWindowMessage', () => {
  test('accepts a projection request with a nonce', () => {
    // #when
    const parsed = parseWindowMessage({ t: 'projection-request', nonce: 'n1' });

    // #then
    expect(parsed).toEqual({ ok: true, value: { t: 'projection-request', nonce: 'n1' } });
  });

  test('accepts a sheet-create command', () => {
    // #given
    const message: WindowMessage = { t: 'command', id: 'c1', command: SHEET_CREATE };

    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: true, value: message });
  });

  test.each([
    ['k', { k: 'sheet:a' }],
    ['d', { d: { kind: 'pc', name: 'x', order: 0 } }],
    ['c', { c: 1 }],
    ['a', { a: 'conn' }],
  ])('refuses a command intent holding %s', (_field, extra) => {
    // #when
    const parsed = parseWindowMessage({
      t: 'command',
      id: 'c1',
      command: { ...SHEET_CREATE, ...extra },
    });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test.each([
    ['k', { k: 'sheet:a' }],
    ['d', { d: null }],
    ['c', { c: 1 }],
    ['a', { a: 'conn' }],
  ])('refuses a command message holding %s beside its intent', (_field, extra) => {
    // #when
    const parsed = parseWindowMessage({ t: 'command', id: 'c1', command: SHEET_CREATE, ...extra });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test('accepts a preset-upload command carrying base64 data', () => {
    // #given
    const message: WindowMessage = {
      t: 'command',
      id: 'c1',
      command: { type: 'preset-upload', data: 'eJyrVipTsjKsBQAIkwIe' },
    };

    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: true, value: message });
  });

  test.each<[string, JsonValue]>([
    ['data that is not base64', { type: 'preset-upload', data: '{"v":1}' }],
    ['empty data', { type: 'preset-upload', data: '' }],
    ['no data', { type: 'preset-upload' }],
    ['a whole record beside its data', { type: 'preset-upload', data: 'AAAA', k: 'preset' }],
  ])('refuses a preset-upload command with %s', (_name, command) => {
    // #when
    const parsed = parseWindowMessage({ t: 'command', id: 'c1', command });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test('refuses a command of an unknown type', () => {
    // #when
    const parsed = parseWindowMessage({ t: 'command', id: 'c1', command: { type: 'other' } });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test('refuses a request without a nonce', () => {
    // #when
    const parsed = parseWindowMessage({ t: 'projection-request' });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test.each<[string, JsonValue]>([
    ['text', 'hello'],
    ['null', null],
    ['a message for windows', { t: 'delta', engine: 'e', seq: 1, records: [], notices: [] }],
  ])('refuses %s', (_name, message) => {
    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });
});

describe('parseEngineMessage', () => {
  test.each(['too-large', 'invalid-preset', 'sheets-exist'])(
    'accepts a rejection for the reason %s',
    (reason) => {
      // #when
      const parsed = parseEngineMessage({ t: 'command-rejected', id: 'c1', reason });

      // #then
      expect(parsed).toEqual({ ok: true, value: { t: 'command-rejected', id: 'c1', reason } });
    },
  );

  test('refuses a rejection for an unknown reason', () => {
    // #when
    const parsed = parseEngineMessage({ t: 'command-rejected', id: 'c1', reason: 'other' });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  const PROJECTION: EngineMessage = {
    t: 'projection',
    nonce: 'n1',
    engine: 'e1',
    seq: 4,
    i: 1,
    n: 2,
    records: [{ k: 'link:t', d: 's', c: 1, a: 'conn' }],
    notices: ['local-save-failed'],
  };

  test('accepts a projection part', () => {
    // #when
    const parsed = parseEngineMessage(PROJECTION);

    // #then
    expect(parsed).toEqual({ ok: true, value: PROJECTION });
  });

  test('refuses a part numbered above its total', () => {
    // #when
    const parsed = parseEngineMessage({ ...PROJECTION, i: 3 });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test('refuses a projection holding an invalid record', () => {
    // #when
    const parsed = parseEngineMessage({
      ...PROJECTION,
      records: [{ k: 'link:t', d: 's', c: 0, a: 'conn' }],
    });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test('accepts a delta and a rejected command', () => {
    // #given
    const delta: EngineMessage = { t: 'delta', engine: 'e1', seq: 5, records: [], notices: [] };
    const rejected: EngineMessage = { t: 'command-rejected', id: 'c1', reason: 'too-large' };

    // #when
    const parsed = [parseEngineMessage(delta), parseEngineMessage(rejected)];

    // #then
    expect(parsed).toEqual([
      { ok: true, value: delta },
      { ok: true, value: rejected },
    ]);
  });
});
