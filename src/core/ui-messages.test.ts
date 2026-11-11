import { describe, expect, test } from 'bun:test';

import type { FieldPatchTarget } from '@/core/field-patch';
import type { JsonValue } from '@/core/json';

import {
  parseEngineMessage,
  parseWindowMessage,
  UI_CHANNEL,
  type Command,
  type EngineMessage,
  type RollOutcome,
  type RoomCopyStatus,
  type SyncState,
  type WindowMessage,
} from './ui-messages';

const LIVE: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: false,
  gmLink: 'offline',
  role: 'GM',
};

const NO_COPY: RoomCopyStatus = { state: 'none', usedBytes: 0, freeBytes: 15500, outcome: null };

const SHEET_CREATE: Command = { type: 'sheet-create', sheetId: 's1', kind: 'pc', name: 'Брок' };

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

  test('accepts a sheet-rename command', () => {
    // #given
    const message: WindowMessage = {
      t: 'command',
      id: 'c1',
      command: { type: 'sheet-rename', sheetId: 's1', name: 'Лиза' },
    };

    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: true, value: message });
  });

  test.each<[string, JsonValue]>([
    ['a create with no sheetId', { type: 'sheet-create', kind: 'pc', name: 'Брок' }],
    ['a rename with no sheetId', { type: 'sheet-rename', name: 'Брок' }],
    ['a rename with no name', { type: 'sheet-rename', sheetId: 's1' }],
    [
      'a rename that also holds a kind',
      { type: 'sheet-rename', sheetId: 's1', name: 'x', kind: 'pc' },
    ],
    ['a rename holding d', { type: 'sheet-rename', sheetId: 's1', name: 'x', d: null }],
  ])('refuses %s', (_name, command) => {
    // #when
    const parsed = parseWindowMessage({ t: 'command', id: 'c1', command });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test('accepts a sheet-delete command that names only the sheet', () => {
    // #given
    const message: WindowMessage = {
      t: 'command',
      id: 'c1',
      command: { type: 'sheet-delete', sheetId: 's1' },
    };

    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: true, value: message });
  });

  test.each<[string, JsonValue]>([
    ['no sheetId', { type: 'sheet-delete' }],
    ['a kind beside the sheetId', { type: 'sheet-delete', sheetId: 's1', kind: 'pc' }],
    ['d beside the sheetId', { type: 'sheet-delete', sheetId: 's1', d: null }],
    ['the keys to delete', { type: 'sheet-delete', sheetId: 's1', keys: ['row:s1:a'] }],
  ])('refuses a sheet-delete command with %s', (_name, command) => {
    // #when
    const parsed = parseWindowMessage({ t: 'command', id: 'c1', command });

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

  test.each<[string, FieldPatchTarget, JsonValue]>([
    ['a row field', { kind: 'row', rowId: 'str' }, 12],
    ['a repeat instance field', { kind: 'rep', sectionId: 'attack', instanceId: 'i1' }, 'Меч'],
    ['a clear', { kind: 'row', rowId: 'str' }, null],
    ['a value of any JSON type, for the engine to check', { kind: 'row', rowId: 'str' }, [1]],
  ])('accepts a field-patch command for %s', (_name, target, value) => {
    // #given
    const message: WindowMessage = {
      t: 'command',
      id: 'c1',
      command: { type: 'field-patch', sheetId: 's1', target, fieldId: 'str', value },
    };

    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: true, value: message });
  });

  test.each<[string, JsonValue]>([
    [
      'no value',
      { type: 'field-patch', sheetId: 's1', target: { kind: 'row', rowId: 'str' }, fieldId: 'str' },
    ],
    ['no target', { type: 'field-patch', sheetId: 's1', fieldId: 'str', value: 1 }],
    [
      'a target of another kind',
      { type: 'field-patch', sheetId: 's1', target: { kind: 'sheet' }, fieldId: 'str', value: 1 },
    ],
    [
      'a repeat target with no instance',
      {
        type: 'field-patch',
        sheetId: 's1',
        target: { kind: 'rep', sectionId: 'attack' },
        fieldId: 'attack',
        value: 'x',
      },
    ],
    [
      'a whole record data beside the value',
      {
        type: 'field-patch',
        sheetId: 's1',
        target: { kind: 'row', rowId: 'str' },
        fieldId: 'str',
        value: 1,
        d: { str: 1 },
      },
    ],
    [
      'a version beside the value',
      {
        type: 'field-patch',
        sheetId: 's1',
        target: { kind: 'row', rowId: 'str' },
        fieldId: 'str',
        value: 1,
        c: 9,
      },
    ],
  ])('refuses a field-patch command with %s', (_name, command) => {
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

  const ROLL_REQUEST = {
    t: 'roll-request',
    id: 'r1',
    sheetId: 'brok',
    place: { sectionIndex: 1, rowIndex: 0, cellIndex: 3, instanceId: 'i1' },
    shown: { bonus: { kind: 'text', text: '5' }, str: { kind: 'error' } },
  } satisfies WindowMessage;

  test('accepts a roll request with the place of its cell and the shown values', () => {
    // #when
    const parsed = parseWindowMessage(ROLL_REQUEST);

    // #then
    expect(parsed).toEqual({ ok: true, value: ROLL_REQUEST });
  });

  test.each<[string, JsonValue]>([
    ['a record key', { ...ROLL_REQUEST, k: 'row:brok:str' }],
    ['a negative cell index', { ...ROLL_REQUEST, place: { ...ROLL_REQUEST.place, cellIndex: -1 } }],
    [
      'a place with no instance',
      { ...ROLL_REQUEST, place: { sectionIndex: 0, rowIndex: 0, cellIndex: 1 } },
    ],
    ['a shown value of an unknown kind', { ...ROLL_REQUEST, shown: { str: { kind: 'number' } } }],
    [
      'no shown values',
      { t: 'roll-request', id: 'r1', sheetId: 'brok', place: ROLL_REQUEST.place },
    ],
    ['an empty sheet id', { ...ROLL_REQUEST, sheetId: '' }],
    ['a sheet id longer than a roll takes', { ...ROLL_REQUEST, sheetId: 'x'.repeat(65) }],
  ])('refuses a roll request with %s', (_name, message) => {
    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

  test('accepts a roll request on a sheet and an instance whose ids are as long as an id can be', () => {
    // #given: a sheet or a repeat row id is at most 64 characters.
    const longest = 'x'.repeat(64);

    const message = {
      ...ROLL_REQUEST,
      sheetId: longest,
      place: { ...ROLL_REQUEST.place, instanceId: longest },
    } satisfies WindowMessage;

    // #when
    const parsed = parseWindowMessage(message);

    // #then
    expect(parsed).toEqual({ ok: true, value: message });
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
  test.each([
    'too-large',
    'invalid-preset',
    'sheets-exist',
    'invalid-sheet-id',
    'sheet-exists',
    'unknown-sheet',
    'deleted-sheet',
    'invalid-name',
  ])('accepts a rejection for the reason %s', (reason) => {
    // #when
    const parsed = parseEngineMessage({ t: 'command-rejected', id: 'c1', reason });

    // #then
    expect(parsed).toEqual({ ok: true, value: { t: 'command-rejected', id: 'c1', reason } });
  });

  test.each<[string, RollOutcome]>([
    ['rolled', { code: 'rolled' }],
    ['a field error with its field', { code: 'field', field: 'Сила' }],
    ['an arithmetic error', { code: 'arithmetic' }],
    ['a refusal', { code: 'refused' }],
    ['a send that failed', { code: 'failed' }],
  ])('accepts a roll outcome of %s', (_name, outcome) => {
    // #given
    const message: EngineMessage = { t: 'roll-outcome', id: 'r1', outcome };

    // #when
    const parsed = parseEngineMessage(message);

    // #then
    expect(parsed).toEqual({ ok: true, value: message });
  });

  test('refuses a field error that names no field', () => {
    // #when
    const parsed = parseEngineMessage({ t: 'roll-outcome', id: 'r1', outcome: { code: 'field' } });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });

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
    pending: [{ k: 'link:u', d: 's', c: 2, a: 'conn' }],
    notices: ['local-save-failed'],
    sync: {
      state: 'catching-up',
      firstCatchUpDone: false,
      gmAnswered: false,
      gmLink: 'offline',
      role: 'GM',
    },
    roomCopy: NO_COPY,
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

  test('accepts the catching-up rejection and refuses a part with no sync state', () => {
    // #given
    const { sync: _sync, ...withoutSync } = PROJECTION;

    // #when
    const parsed = [
      parseEngineMessage({ t: 'command-rejected', id: 'c1', reason: 'catching-up' }).ok,
      parseEngineMessage(withoutSync).ok,
      parseEngineMessage({ ...PROJECTION, sync: { ...LIVE, state: 'paused' } }).ok,
      parseEngineMessage({ ...PROJECTION, sync: { ...LIVE, role: 'OWNER' } }).ok,
    ];

    // #then
    expect(parsed).toEqual([true, false, false, false]);
  });

  test('accepts a delta and a rejected command', () => {
    // #given
    const delta: EngineMessage = {
      t: 'delta',
      engine: 'e1',
      seq: 5,
      records: [],
      pending: [],
      withdrawn: [],
      notices: [],
      sync: LIVE,
      roomCopy: NO_COPY,
    };

    const rejected: EngineMessage = { t: 'command-rejected', id: 'c1', reason: 'too-large' };

    // #when
    const parsed = [parseEngineMessage(delta), parseEngineMessage(rejected)];

    // #then
    expect(parsed).toEqual([
      { ok: true, value: delta },
      { ok: true, value: rejected },
    ]);
  });

  test('accepts a delta carrying the new-version notice and refuses an unknown notice', () => {
    // #given
    const delta: EngineMessage = {
      t: 'delta',
      engine: 'e1',
      seq: 6,
      records: [],
      pending: [],
      withdrawn: [],
      notices: ['local-save-failed', 'new-version'],
      sync: LIVE,
      roomCopy: NO_COPY,
    };

    // #when
    const parsed = [
      parseEngineMessage(delta),
      parseEngineMessage({ ...delta, notices: ['no-gm-yet'] }),
    ];

    // #then
    expect(parsed).toEqual([
      { ok: true, value: delta },
      { ok: false, error: 'invalid-message' },
    ]);
  });

  test('accepts a delta carrying the room-copy notice and a failed room copy', () => {
    // #given
    const delta: EngineMessage = {
      t: 'delta',
      engine: 'e1',
      seq: 7,
      records: [],
      pending: [],
      withdrawn: [],
      notices: ['room-copy-not-saved'],
      sync: LIVE,
      roomCopy: { state: 'failed', usedBytes: 4200, freeBytes: 0, outcome: null },
    };

    // #when
    const parsed = parseEngineMessage(delta);

    // #then
    expect(parsed).toEqual({ ok: true, value: delta });
  });

  test('refuses a part with no room copy status or with an unknown room copy state', () => {
    // #given
    const { roomCopy: _roomCopy, ...withoutRoomCopy } = PROJECTION;

    // #when
    const parsed = [
      parseEngineMessage(withoutRoomCopy).ok,
      parseEngineMessage({ ...PROJECTION, roomCopy: { ...NO_COPY, state: 'stale' } }).ok,
      parseEngineMessage({ ...PROJECTION, roomCopy: { ...NO_COPY, freeBytes: -1 } }).ok,
    ];

    // #then
    expect(parsed).toEqual([false, false, false]);
  });

  test('carries every room copy outcome a player reads, refuses an unknown one, and reads a missing one as null', () => {
    // #given
    const { outcome: _outcome, ...withoutOutcome } = NO_COPY;
    const outcomes = [null, 'read', 'none', 'unreadable', 'newer', 'stale'] as const;

    // #when
    const parsed = outcomes.map(
      (outcome) => parseEngineMessage({ ...PROJECTION, roomCopy: { ...NO_COPY, outcome } }).ok,
    );

    const older = parseEngineMessage({ ...PROJECTION, roomCopy: withoutOutcome });

    // #then
    expect({
      parsed,
      older: older.ok && older.value.t === 'projection' ? older.value.roomCopy : null,
    }).toEqual({ parsed: [true, true, true, true, true, false], older: NO_COPY });
  });
});
