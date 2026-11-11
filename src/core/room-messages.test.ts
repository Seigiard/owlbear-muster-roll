import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodeStateRecords } from '@/core/state-records';
import {
  admitRoomMessage,
  aliveMessage,
  generationRelation,
  parseRoomMessage,
  pingMessage,
  proposeMessage,
  rejectMessage,
  rollMessage,
  stateRequestMessage,
  type GenerationRelation,
  type RollMessage,
  type RoomMessageType,
  type SenderRole,
} from '@/core/room-messages';

const TYPES: RoomMessageType[] = [
  'commit',
  'propose',
  'reject',
  'ping',
  'alive',
  'state-request',
  'state',
  'reset',
  'roll',
];

const SENDERS: SenderRole[] = ['GM', 'PLAYER', null];

const RELATIONS: GenerationRelation[] = ['lower', 'equal', 'higher'];

// AD-5 written out by hand, one admitted combination per line. Everything else is dropped.
const ADMITTED = new Set([
  'commit GM equal',
  'reject GM equal',
  'state GM equal',
  'state GM higher',
  'reset GM higher',
  'alive GM lower',
  'alive GM equal',
  'alive GM higher',
  'propose GM equal',
  'propose PLAYER equal',
  'ping GM lower',
  'ping GM equal',
  'ping GM higher',
  'ping PLAYER lower',
  'ping PLAYER equal',
  'ping PLAYER higher',
  'state-request GM lower',
  'state-request GM equal',
  'state-request GM higher',
  'state-request PLAYER lower',
  'state-request PLAYER equal',
  'state-request PLAYER higher',
  'roll GM lower',
  'roll GM equal',
  'roll GM higher',
  'roll PLAYER lower',
  'roll PLAYER equal',
  'roll PLAYER higher',
]);

const CASES = TYPES.flatMap((t) =>
  SENDERS.flatMap((sender) => RELATIONS.map((relation) => [t, sender, relation] as const)),
);

const RECORD = { k: 'sheet:a', d: { kind: 'pc', name: 'Брок', order: 0 }, c: 1, a: 'gm-a' };

function commit(overrides: { [key: string]: JsonValue } = {}): JsonValue {
  return { v: 1, g: { n: 0, a: '' }, t: 'commit', records: [RECORD], ...overrides };
}

const ROW = { k: 'row:brok:str', d: { str: 5 }, c: 2, a: 'p-conn' };

function propose(overrides: { [key: string]: JsonValue } = {}): JsonValue {
  return { v: 1, g: { n: 0, a: '' }, t: 'propose', records: [ROW], ...overrides };
}

function reject(overrides: { [key: string]: JsonValue } = {}): JsonValue {
  return {
    v: 1,
    g: { n: 0, a: '' },
    t: 'reject',
    k: ROW.k,
    c: 2,
    a: 'p-conn',
    reason: 'denied',
    ...overrides,
  };
}

const ROLL: RollMessage = {
  v: 1,
  g: { n: 0, a: '' },
  t: 'roll',
  id: 'r1',
  sheetId: 'brok',
  kind: 'pc',
  roller: 'Лиза',
  sheetName: 'Брок',
  cell: 'Сила',
  result: { roll: 7, faces: [7], target: 12, targetFaces: [], outcome: 'success' },
};

function roll(overrides: { [key: string]: JsonValue } = {}): JsonValue {
  return { ...ROLL, ...overrides };
}

function state(overrides: { [key: string]: JsonValue } = {}): JsonValue {
  return {
    v: 1,
    g: { n: 0, a: '' },
    t: 'state',
    r: 'r1',
    i: 1,
    n: 1,
    records: encodeStateRecords([RECORD]),
    ...overrides,
  };
}

describe('admitRoomMessage', () => {
  test.each(CASES)('%s from %s with a %s generation follows the AD-5 table', (t, sender, rel) => {
    // #when
    const admitted = admitRoomMessage(t, sender, rel);

    // #then
    expect(admitted).toBe(ADMITTED.has(`${t} ${sender} ${rel}`));
  });
});

describe('parseRoomMessage', () => {
  test('reads a valid commit with no acks as one with none', () => {
    // #when
    const parsed = parseRoomMessage(commit());

    // #then
    expect(parsed).toEqual({
      ok: true,
      value: { v: 1, g: { n: 0, a: '' }, t: 'commit', records: [RECORD], acks: [] },
    });
  });

  test('reads a commit that echoes the (k, c, a) of the proposals it answers', () => {
    // #given
    const acks = [{ k: 'row:brok:str', c: 4, a: 'p-conn' }];

    // #when
    const parsed = parseRoomMessage(commit({ acks }));

    // #then
    expect(parsed).toEqual({
      ok: true,
      value: { v: 1, g: { n: 0, a: '' }, t: 'commit', records: [RECORD], acks },
    });
  });

  test('builds a propose of one record that parses back as itself', () => {
    // #given
    const built = proposeMessage({ n: 1, a: 'x' }, ROW);

    // #when
    const parsed = parseRoomMessage(built);

    // #then
    expect(parsed).toEqual({
      ok: true,
      value: { v: 1, g: { n: 1, a: 'x' }, t: 'propose', records: [ROW] },
    });
  });

  test('builds a denied reject with no record and a stale one with the current record', () => {
    // #given
    const edit = { k: ROW.k, c: 2, a: 'p-conn' };
    const current = { ...ROW, c: 5, a: 'gm-a' };

    // #when
    const parsed = [
      parseRoomMessage(rejectMessage({ n: 0, a: '' }, edit, { reason: 'denied' })),
      parseRoomMessage(rejectMessage({ n: 0, a: '' }, edit, { reason: 'stale', current })),
    ];

    // #then
    expect(parsed).toEqual([
      { ok: true, value: { v: 1, g: { n: 0, a: '' }, t: 'reject', ...edit, reason: 'denied' } },
      {
        ok: true,
        value: { v: 1, g: { n: 0, a: '' }, t: 'reject', ...edit, reason: 'stale', current },
      },
    ]);
  });

  test('reads a state-request and a state part', () => {
    // #given
    const request = { v: 1, g: { n: 2, a: 'x' }, t: 'state-request', r: 'r1' };

    // #when
    const parsed = [parseRoomMessage(request), parseRoomMessage(state({ i: 2, n: 3 }))];

    // #then
    expect(parsed).toMatchObject([
      { ok: true, value: request },
      { ok: true, value: { t: 'state', r: 'r1', i: 2, n: 3 } },
    ]);
  });

  test('builds a state-request that parses back as itself', () => {
    // #when
    const request = stateRequestMessage({ n: 0, a: '' }, 'nonce-1');

    // #then
    expect(parseRoomMessage(request)).toEqual({ ok: true, value: request });
  });

  test('reads a ping and an alive with its digest', () => {
    // #given
    const ping = { v: 1, g: { n: 0, a: '' }, t: 'ping' } as const;
    const alive = { v: 1, g: { n: 3, a: 'y' }, t: 'alive', digest: 4294967295 } as const;

    // #when
    const parsed = [parseRoomMessage(ping), parseRoomMessage(alive)];

    // #then
    expect(parsed).toEqual([
      { ok: true, value: ping },
      { ok: true, value: alive },
    ]);
  });

  test('builds a ping and an alive that parse back as themselves', () => {
    // #when
    const built = [pingMessage({ n: 1, a: 'x' }), aliveMessage({ n: 1, a: 'x' }, 0)];

    // #then
    expect(built.map((message) => parseRoomMessage(message))).toEqual([
      { ok: true, value: { v: 1, g: { n: 1, a: 'x' }, t: 'ping' } },
      { ok: true, value: { v: 1, g: { n: 1, a: 'x' }, t: 'alive', digest: 0 } },
    ]);
  });

  test('reads a roll with its sheet, names, cell and result', () => {
    // #when
    const parsed = parseRoomMessage(ROLL);

    // #then
    expect(parsed).toEqual({ ok: true, value: ROLL });
  });

  test('builds a roll that parses back as itself', () => {
    // #given
    const built = rollMessage(
      { n: 2, a: 'gm' },
      {
        id: 'r2',
        sheetId: 'skel',
        kind: 'npc',
        roller: 'Мастер',
        sheetName: 'Скелет',
        cell: '2d6',
        result: { roll: 2.5, faces: [2, 3], target: null, targetFaces: [], outcome: null },
      },
    );

    // #when
    const parsed = parseRoomMessage(built);

    // #then
    expect(parsed).toEqual({ ok: true, value: built });
  });

  test('reports a higher v before it looks at the rest of the message', () => {
    // #when
    const parsed = parseRoomMessage({ v: 2, t: 'something-new', anything: [1, 2] });

    // #then
    expect(parsed).toEqual({ ok: false, error: 'newer-version' });
  });

  test('reports a lower v even for a message that is otherwise a valid commit', () => {
    // #when
    const parsed = parseRoomMessage(commit({ v: 0 }));

    // #then
    expect(parsed).toEqual({ ok: false, error: 'older-version' });
  });

  test.each<[string, JsonValue]>([
    ['no v', { g: { n: 0, a: '' }, t: 'commit', records: [RECORD] }],
    ['a v that is not an integer', commit({ v: '1' })],
    ['not an object', 'commit'],
    ['a record that fails its schema', commit({ records: [{ ...RECORD, c: 0 }] })],
    ['no records', commit({ records: [] })],
    ['no generation', { v: 1, t: 'commit', records: [RECORD] }],
    ['an extra key', commit({ extra: true })],
    ['a roll with the shape of a commit', commit({ t: 'roll' })],
    ['a roll with no id', roll({ id: '' })],
    ['a roll of an unknown kind', roll({ kind: 'token' })],
    ['a roll with no result', roll({ result: null })],
    [
      'a roll whose face is 0',
      roll({ result: { roll: 0, faces: [0], target: null, targetFaces: [], outcome: null } }),
    ],
    [
      'a roll with an unknown outcome',
      roll({ result: { roll: 7, faces: [7], target: 12, targetFaces: [], outcome: 'maybe' } }),
    ],
    ['a roll with an extra key', roll({ records: [] })],
    ['a ping with an extra key', commit({ t: 'ping' })],
    ['an alive with no digest', { v: 1, g: { n: 0, a: '' }, t: 'alive' }],
    ['an alive with a negative digest', { v: 1, g: { n: 0, a: '' }, t: 'alive', digest: -1 }],
    [
      'an alive with a digest past 32 bits',
      { v: 1, g: { n: 0, a: '' }, t: 'alive', digest: 4294967296 },
    ],
    ['an alive with a fractional digest', { v: 1, g: { n: 0, a: '' }, t: 'alive', digest: 1.5 }],
    ['a state-request with no nonce', { v: 1, g: { n: 0, a: '' }, t: 'state-request' }],
    [
      'a state-request with an empty nonce',
      { v: 1, g: { n: 0, a: '' }, t: 'state-request', r: '' },
    ],
    ['a state part numbered above its total', state({ i: 3, n: 2 })],
    ['a state part numbered 0', state({ i: 0 })],
    ['a state whose records are not base64', state({ records: 'not base64!' })],
    [
      'a state with no nonce',
      { v: 1, g: { n: 0, a: '' }, t: 'state', i: 1, n: 1, records: encodeStateRecords([RECORD]) },
    ],
    ['an unknown type', commit({ t: 'shout' })],
    ['an ack with c 0', commit({ acks: [{ k: 'row:brok:str', c: 0, a: 'p' }] })],
    ['an ack with no author', commit({ acks: [{ k: 'row:brok:str', c: 1, a: '' }] })],
    ['a propose of no record', propose({ records: [] })],
    ['a propose of two records', propose({ records: [ROW, ROW] })],
    ['a propose with acks', propose({ acks: [] })],
    ['a stale reject with no current record', reject({ reason: 'stale' })],
    [
      'a stale reject whose current record is of another key',
      reject({ reason: 'stale', current: RECORD }),
    ],
    ['a denied reject that carries a record', reject({ current: ROW })],
    ['a reject of an unknown reason', reject({ reason: 'busy' })],
    ['a reject with c 0', reject({ c: 0 })],
  ])('drops a message with the right v and %s', (_name, candidate) => {
    // #when
    const parsed = parseRoomMessage(candidate);

    // #then
    expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
  });
});

describe('generationRelation', () => {
  test.each<[string, { n: number; a: string }, GenerationRelation]>([
    ['the same generation', { n: 1, a: 'x' }, 'equal'],
    ['a higher counter', { n: 2, a: 'a' }, 'higher'],
    ['a lower counter', { n: 0, a: 'z' }, 'lower'],
    ['the same counter and a higher author', { n: 1, a: 'y' }, 'higher'],
    ['the same counter and a lower author', { n: 1, a: 'w' }, 'lower'],
  ])('compares %s with the own generation', (_name, message, relation) => {
    // #when
    const compared = generationRelation(message, { n: 1, a: 'x' });

    // #then
    expect(compared).toBe(relation);
  });
});
