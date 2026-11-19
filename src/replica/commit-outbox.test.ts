import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { JsonValue } from '@/core/json';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import { blockDataSchema, type Cells, type VersionedRecord } from '@/core/records';
import { Result } from 'better-result';
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
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
  wipeTimeoutMs: 60000,
  accessChangeTimeoutMs: 5000,
  linkSetTimeoutMs: 5000,
  rollTimeoutMs: 90000,
  commandTimeoutMs: 15000,
};

const GENERATION = { n: 0, a: '' };

type Sent = {
  channel: string;
  data: JsonValue;
  options: BroadcastOptions;
};

// A queue whose spacing pause holds until the test releases it.
type Rig = {
  queue: SendQueue;
  sent: Sent[];
  reported: string[];
  release: () => void;
};

afterEach(() => {
  mock.restore();
});

function createRig(): Rig {
  const sent: Sent[] = [];
  const pauses: (() => void)[] = [];
  const reported: string[] = [];

  const queue = createSendQueue(
    {
      sendMessage: (channel, data, options) => {
        sent.push({ channel, data, options });

        return Promise.resolve(Result.ok(undefined));
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
    reported,
    release: () => {
      for (const finish of pauses.splice(0)) {
        finish();
      }
    },
  };
}

function createOutbox(rig: Rig, signal = new AbortController().signal) {
  return createCommitOutbox(rig.queue, () => GENERATION, {
    signal,
    report: (failure: { _tag: string }) => rig.reported.push(failure._tag),
  });
}

function row(id: string, c: number, value: string | number = c): VersionedRecord {
  return {
    k: 'blk:brok',
    d: { order: 0, cells: { [id]: [value, c, 'gm-a'] } },
    c,
    a: 'gm-a',
    l: [1, 'seed'],
  };
}

function commit(records: VersionedRecord[]): Sent {
  return {
    channel: SYNC_CHANNEL,
    data: { v: 4, g: GENERATION, t: 'commit', records },
    options: { destination: 'REMOTE' },
  };
}

function cellsOf(records: readonly VersionedRecord[]): Cells {
  return Object.assign(
    {},
    ...records.flatMap((record) => {
      const block = blockDataSchema.safeParse(record.d);

      return block.success ? [block.data.cells] : [];
    }),
  );
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
    const outbox = createOutbox(rig);
    await holdQueue(rig);
    // #when
    outbox.add([row('str', 1)]);
    outbox.add([row('str', 2), row('dex', 1)]);
    await drained(rig);
    // #then
    expect(rig.sent.slice(1)).toEqual([
      commit([
        {
          k: 'blk:brok',
          d: {
            order: 0,
            cells: { str: [2, 2, 'gm-a'], dex: [1, 1, 'gm-a'] },
          },
          c: 2,
          a: 'gm-a',
          l: [1, 'seed'],
        },
      ]),
    ]);
  });
  test('sends records over one message in parts that each fit, and the remainder after the first', async () => {
    // #given: each record is about 4000 bytes, so four do not fit one message.
    const rig = createRig();
    const outbox = createOutbox(rig);
    const records = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 1, 'ы'.repeat(2000)));
    // #when
    outbox.add(records);
    await drained(rig);
    // #then
    const sent = rig.sent.map((one) => Object(one.data).records);
    expect({
      parts: rig.sent.length,
      underLimit: rig.sent.every((one) => jsonByteLength(one.data) < MESSAGE_BYTE_LIMIT),
      cells: cellsOf(sent.flat()),
    }).toEqual({ parts: 2, underLimit: true, cells: cellsOf(records) });
  });
  test('drops and logs only a record too large for one message, and sends the rest', async () => {
    // #given
    const rig = createRig();
    const outbox = createOutbox(rig);
    // #when
    outbox.add([
      row('str', 1),
      {
        k: 'acl:huge:player',
        d: { name: 'x'.repeat(MESSAGE_BYTE_LIMIT) },
        c: 1,
        a: 'gm-a',
      },
      row('dex', 1),
    ]);
    await drained(rig);
    // #then
    expect({ sent: rig.sent, reported: rig.reported }).toEqual({
      sent: [
        commit([
          {
            k: 'blk:brok',
            d: {
              order: 0,
              cells: { str: [1, 1, 'gm-a'], dex: [1, 1, 'gm-a'] },
            },
            c: 1,
            a: 'gm-a',
            l: [1, 'seed'],
          },
        ]),
      ],
      reported: ['record-too-large'],
    });
  });
  test('sends nothing after stop, not even a commit already waiting in the queue', async () => {
    // #given
    const rig = createRig();
    const controller = new AbortController();
    const outbox = createOutbox(rig, controller.signal);
    await holdQueue(rig);
    outbox.add([row('str', 1)]);
    // #when
    controller.abort();
    outbox.add([row('dex', 1)]);
    await drained(rig);
    // #then
    expect(rig.sent.map((one) => one.data)).toEqual(['first']);
  });
  test('drop forgets a commit waiting in the queue, and the outbox still sends what comes after', async () => {
    // #given
    const rig = createRig();
    const outbox = createOutbox(rig);
    await holdQueue(rig);
    outbox.add([row('str', 1)]);
    // #when
    outbox.drop();
    await drained(rig);
    outbox.add([row('dex', 2)]);
    await drained(rig);
    // #then
    expect(rig.sent.map((one) => one.data)).toEqual(['first', commit([row('dex', 2)]).data]);
  });
  test("a newer GM record of a proposed key still carries the player's (k, c, a) in its commit", async () => {
    // #given
    const rig = createRig();
    const outbox = createOutbox(rig);

    const proposed: VersionedRecord = {
      k: 'blk:brok',
      d: { order: 0, cells: { str: [7, 4, 'p-conn'] } },
      c: 4,
      a: 'p-conn',
      l: [1, 'seed'],
    };

    const ack = { k: proposed.k, c: 4, a: 'p-conn' };
    await holdQueue(rig);
    // #when
    outbox.add([proposed], [ack]);
    outbox.add([row('str', 5)]);
    await drained(rig);
    // #then
    expect(rig.sent.slice(1)).toEqual([
      {
        ...commit([row('str', 5)]),
        data: { v: 4, g: GENERATION, t: 'commit', records: [row('str', 5)], acks: [ack] },
      },
    ]);
  });
  test('echoes one proposal answered twice before the commit goes out once', async () => {
    // #given
    const rig = createRig();
    const outbox = createOutbox(rig);

    const proposed: VersionedRecord = {
      k: 'blk:brok',
      d: { order: 0, cells: { str: [7, 4, 'p-conn'] } },
      c: 4,
      a: 'p-conn',
      l: [1, 'seed'],
    };

    const ack = { k: proposed.k, c: 4, a: 'p-conn' };
    await holdQueue(rig);
    // #when
    outbox.add([proposed], [ack]);
    outbox.add([proposed], [ack]);
    await drained(rig);
    // #then
    expect(rig.sent.slice(1).map((one) => Object(one.data).acks)).toEqual([[ack]]);
  });
  test("keeps one ack per author of a key, that author's newest", async () => {
    // #given
    const rig = createRig();
    const outbox = createOutbox(rig);

    const record: VersionedRecord = {
      k: 'blk:brok',
      d: { order: 0, cells: { str: [7, 9, 'gm-a'] } },
      c: 9,
      a: 'gm-a',
      l: [1, 'seed'],
    };

    await holdQueue(rig);
    // #when
    outbox.add([record], [{ k: record.k, c: 4, a: 'p-oly' }]);
    outbox.add([record], [{ k: record.k, c: 6, a: 'p-oly' }]);
    outbox.add([record], [{ k: record.k, c: 5, a: 'p-oly' }]);
    outbox.add([record], [{ k: record.k, c: 2, a: 'p-gena' }]);
    await drained(rig);
    // #then
    expect(rig.sent.slice(1).map((one) => Object(one.data).acks)).toEqual([
      [
        { k: record.k, c: 6, a: 'p-oly' },
        { k: record.k, c: 2, a: 'p-gena' },
      ],
    ]);
  });
  test('sends a record again with the acks that did not fit one message with it', async () => {
    // #given: the record is about 13000 bytes and each ack about 640, so two acks fit with it.
    const rig = createRig();
    const outbox = createOutbox(rig);
    const record = row('big', 1, 'x'.repeat(13000));

    const acks = [0, 1, 2, 3, 4].map((index) => ({
      k: record.k,
      c: 1,
      a: `p${index}${'-'.repeat(600)}`,
    }));

    await holdQueue(rig);
    // #when
    outbox.add([record], acks);
    await drained(rig);
    // #then
    const sent = rig.sent.slice(1).map((one) => Object(one.data));
    expect({
      records: sent.map((data) => data.records),
      acks: sent.map((data) => data.acks),
      fit: rig.sent.every((one) => jsonByteLength(one.data) < MESSAGE_BYTE_LIMIT),
    }).toEqual({
      records: [[record], [record], [record]],
      acks: [acks.slice(0, 2), acks.slice(2, 4), acks.slice(4)],
      fit: true,
    });
  });
  test('puts each ack in the part that carries the record of its key', async () => {
    // #given: each record is about 4000 bytes, so the five need two messages.
    const rig = createRig();
    const outbox = createOutbox(rig);
    const records = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 1, 'ы'.repeat(2000)));
    const lastAck = { k: 'blk:brok', c: 1, a: 'gm-a' };
    await holdQueue(rig);
    // #when
    outbox.add(records, [lastAck]);
    await drained(rig);
    // #then
    expect(
      rig.sent.slice(1).map((one) => ({
        keys: Object(one.data).records.map((record: VersionedRecord) => record.k),
        acks: Object(one.data).acks,
      })),
    ).toEqual([
      { keys: ['blk:brok'], acks: undefined },
      { keys: ['blk:brok'], acks: [lastAck] },
    ]);
  });
  test('flush hands every held record to the queue, so its flushNow sends them at once', async () => {
    // #given: the queue holds, and the records need two messages.
    const rig = createRig();
    const outbox = createOutbox(rig);
    const records = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 1, 'ы'.repeat(2000)));
    await holdQueue(rig);
    outbox.add(records);
    // #when
    outbox.flush();
    rig.queue.flushNow();
    // #then
    expect(cellsOf(rig.sent.slice(1).flatMap((one) => Object(one.data).records))).toEqual(
      cellsOf(records),
    );
  });
});
