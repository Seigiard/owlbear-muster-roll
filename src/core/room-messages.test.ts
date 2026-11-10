import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodeStateRecords } from '@/core/state-records';
import {
  admitRoomMessage,
  aliveMessage,
  generationRelation,
  parseRoomMessage,
  pingMessage,
  stateRequestMessage,
  type GenerationRelation,
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
  test('reads a valid commit', () => {
    // #when
    const parsed = parseRoomMessage(commit());

    // #then
    expect(parsed).toEqual({
      ok: true,
      value: { v: 1, g: { n: 0, a: '' }, t: 'commit', records: [RECORD] },
    });
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
    ['a type with no schema yet', commit({ t: 'roll' })],
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
