import { describe, expect, test } from 'bun:test';

import { deflateToBase64 } from '@/core/deflate';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import type { VersionedRecord } from '@/core/records';
import { parseRoomMessage } from '@/core/room-messages';
import { decodeStateRecords, encodeStateRecords, stateAnswer } from '@/core/state-records';

const GENERATION = { n: 3, a: 'imp' };

const BROK: VersionedRecord = {
  k: 'sheet:brok',
  d: { set: 'pc', order: 0 },
  c: 2,
  a: 'gm-a',
};

const GONE: VersionedRecord = { k: 'row:brok:str', d: null, c: 4, a: 'gm-b' };

// Letters with no pattern deflate hardly at all, so their size after encoding is known in advance.
function noise(length: number, seed: number): string {
  let state = seed;
  let text = '';

  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    text += String.fromCharCode(0x4e00 + (state % 20000));
  }

  return text;
}

function notes(id: string, length: number, seed: number): VersionedRecord {
  return { k: `row:${id}:notes`, d: { notes: noise(length, seed) }, c: 1, a: 'gm-a' };
}

describe('state records', () => {
  test('come back from their encoding as they were, tombstones included', () => {
    // #when
    const decoded = decodeStateRecords(encodeStateRecords([BROK, GONE]));

    // #then
    expect(decoded).toEqual({ ok: true, value: [BROK, GONE] });
  });

  test.each([
    ['text that is not base64', 'not base64!'],
    ['bytes that are not deflated', btoa('plain')],
    ['deflated text that is not JSON', deflateToBase64('{')],
    ['a record that fails its schema', deflateToBase64(JSON.stringify([{ ...BROK, c: 0 }]))],
    ['an object instead of a list', deflateToBase64(JSON.stringify(BROK))],
  ])('refuse %s', (_name, data) => {
    // #when
    const decoded = decodeStateRecords(data);

    // #then
    expect(decoded).toEqual({ ok: false, error: 'invalid-records' });
  });
});

describe('stateAnswer', () => {
  test('answers a room with no records with one message, so the asker can count it complete', () => {
    // #when
    const answer = stateAnswer(GENERATION, 'r1', []);

    // #then
    expect({
      messages: answer.messages.map((message) => ({
        ...message,
        records: decodeStateRecords(message.records),
      })),
      skipped: answer.skipped,
    }).toEqual({
      messages: [
        { v: 2, g: GENERATION, t: 'state', r: 'r1', i: 1, n: 1, records: { ok: true, value: [] } },
      ],
      skipped: [],
    });
  });

  test('splits records that do not deflate under the limit into numbered parts, each under it', () => {
    // #given: each record is about 18000 bytes of JSON and stays near that size once encoded.
    const records = ['a', 'b', 'c', 'd'].map((id, index) => notes(id, 6000, index + 1));

    // #when
    const answer = stateAnswer(GENERATION, 'r1', records);

    // #then
    const decoded = answer.messages.flatMap((message) => {
      const part = decodeStateRecords(message.records);

      return part.ok ? part.value : [];
    });

    expect({
      count: answer.messages.length > 1,
      numbering: answer.messages.map((message) => [message.i, message.n]),
      underLimit: answer.messages.every((message) => jsonByteLength(message) < MESSAGE_BYTE_LIMIT),
      parse: answer.messages.every((message) => parseRoomMessage(message).ok),
      echo: answer.messages.every((message) => message.r === 'r1' && message.g === GENERATION),
      records: decoded,
      skipped: answer.skipped,
    }).toEqual({
      count: true,
      numbering: answer.messages.map((_message, index) => [index + 1, answer.messages.length]),
      underLimit: true,
      parse: true,
      echo: true,
      records,
      skipped: [],
    });
  });

  test('packs records that deflate well into fewer messages than their JSON size needs', () => {
    // #given: about 60000 bytes of JSON in repeated text.
    const records = Array.from({ length: 200 }, (_unused, index): VersionedRecord => {
      return {
        k: `row:brok:r${index}`,
        d: { notes: 'Хромает на левую ногу. '.repeat(6) },
        c: 1,
        a: 'gm',
      };
    });

    // #when
    const answer = stateAnswer(GENERATION, 'r1', records);

    // #then
    expect({
      json: jsonByteLength(records) > MESSAGE_BYTE_LIMIT * 2,
      messages: answer.messages.length,
    }).toEqual({ json: true, messages: 1 });
  });

  test('leaves out a record too large for one message even alone, and names its key', () => {
    // #given
    const huge = notes('huge', 12000, 7);

    // #when
    const answer = stateAnswer(GENERATION, 'r1', [BROK, huge, GONE]);

    // #then
    const decoded = answer.messages.flatMap((message) => {
      const part = decodeStateRecords(message.records);

      return part.ok ? part.value : [];
    });

    expect({
      records: decoded,
      underLimit: answer.messages.every((message) => jsonByteLength(message) < MESSAGE_BYTE_LIMIT),
      skipped: answer.skipped,
    }).toEqual({ records: [BROK, GONE], underLimit: true, skipped: [huge.k] });
  });
});
