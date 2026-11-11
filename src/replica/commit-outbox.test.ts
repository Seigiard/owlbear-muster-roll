import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import type { VersionedRecord } from '@/core/records';
import { ok } from '@/core/result';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import type { BroadcastOptions } from '@/platform/ports';
import { createSendQueue, type SendQueue } from '@/platform/send-queue';
import { createCommitOutbox } from '@/replica/commit-outbox';

const TIMING: Timing = {
  sendSpacingMs: 50,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 1,
  projectionIncompleteTimeoutMs: 1,
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 4000,
  stateAnswerDelayMinMs: 20,
  stateAnswerDelayMaxMs: 300,
  gmLinkTimeoutMs: 20000,
  // Far past any test, so no room copy is written unless a test asks for one.
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
};

const GENERATION = { n: 0, a: '' };

type Sent = { channel: string; data: JsonValue; options: BroadcastOptions };

// A queue whose spacing pause holds until the test releases it.
type Rig = { queue: SendQueue; sent: Sent[]; release: () => void };

afterEach(() => {
  mock.restore();
});

function createRig(): Rig {
  const sent: Sent[] = [];
  const pauses: (() => void)[] = [];

  const queue = createSendQueue(
    {
      sendMessage: (channel, data, options) => {
        sent.push({ channel, data, options });

        return Promise.resolve(ok(undefined));
      },
    },
    TIMING,
    () =>
      new Promise((resolve) => {
        pauses.push(resolve);
      }),
  );

  return {
    queue,
    sent,
    release: () => {
      for (const finish of pauses.splice(0)) {
        finish();
      }
    },
  };
}

function row(id: string, c: number, value: string | number = c): VersionedRecord {
  return { k: `row:brok:${id}`, d: { [id]: value }, c, a: 'gm-a' };
}

function commit(records: VersionedRecord[]): Sent {
  return {
    channel: SYNC_CHANNEL,
    data: { v: 1, g: GENERATION, t: 'commit', records },
    options: { destination: 'REMOTE' },
  };
}

async function drained(rig: Rig): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    rig.release();
    // Each round lets the queue reach its next pause.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// The queue sends one message at once, then holds in its spacing pause.
async function holdQueue(rig: Rig): Promise<void> {
  await rig.queue.enqueue('ui', 'first', { destination: 'LOCAL' });
}

describe('commit outbox', () => {
  test('sends only the newer record of a key added twice while the commit waits, and keeps the other keys', async () => {
    // #given
    const rig = createRig();
    const outbox = createCommitOutbox(rig.queue, () => GENERATION);

    await holdQueue(rig);

    // #when
    outbox.add([row('str', 1)]);
    outbox.add([row('str', 2), row('dex', 1)]);
    await drained(rig);

    // #then
    expect(rig.sent.slice(1)).toEqual([commit([row('str', 2), row('dex', 1)])]);
  });

  test('sends records over one message in parts that each fit, and the remainder after the first', async () => {
    // #given: each record is about 4000 bytes, so four do not fit one message.
    const rig = createRig();
    const outbox = createCommitOutbox(rig.queue, () => GENERATION);
    const records = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 1, 'ы'.repeat(2000)));

    // #when
    outbox.add(records);
    await drained(rig);

    // #then
    const sent = rig.sent.map((one) => Object(one.data).records);

    expect({
      parts: rig.sent.length,
      underLimit: rig.sent.every((one) => jsonByteLength(one.data) < MESSAGE_BYTE_LIMIT),
      records: sent.flat(),
    }).toEqual({ parts: 2, underLimit: true, records });
  });

  test('drops and logs only a record too large for one message, and sends the rest', async () => {
    // #given
    const rig = createRig();
    const outbox = createCommitOutbox(rig.queue, () => GENERATION);
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);

    // #when
    outbox.add([row('str', 1), row('huge', 1, 'x'.repeat(MESSAGE_BYTE_LIMIT)), row('dex', 1)]);
    await drained(rig);

    // #then
    expect({ sent: rig.sent, logged: errors.mock.calls.length }).toEqual({
      sent: [commit([row('str', 1), row('dex', 1)])],
      logged: 1,
    });
  });

  test('sends nothing after stop, not even a commit already waiting in the queue', async () => {
    // #given
    const rig = createRig();
    const outbox = createCommitOutbox(rig.queue, () => GENERATION);

    await holdQueue(rig);
    outbox.add([row('str', 1)]);

    // #when
    outbox.stop();
    outbox.add([row('dex', 1)]);
    await drained(rig);

    // #then
    expect(rig.sent.map((one) => one.data)).toEqual(['first']);
  });

  test('flush hands every held record to the queue, so its flushNow sends them at once', async () => {
    // #given: the queue holds, and the records need two messages.
    const rig = createRig();
    const outbox = createCommitOutbox(rig.queue, () => GENERATION);
    const records = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 1, 'ы'.repeat(2000)));

    await holdQueue(rig);
    outbox.add(records);

    // #when
    outbox.flush();
    rig.queue.flushNow();

    // #then
    expect(rig.sent.slice(1).flatMap((one) => Object(one.data).records)).toEqual(records);
  });
});
