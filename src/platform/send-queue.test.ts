import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { err, ok } from '@/core/result';
import type { Timing } from '@/core/timing';
import type { SendFailure, SendResult } from '@/platform/ports';

import { createSendQueue, type Wait } from './send-queue';

const TIMING: Timing = {
  sendSpacingMs: 50,
  rateLimitBackoffStartMs: 250,
  rateLimitBackoffMaxMs: 1000,
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
};

const LOCAL = { destination: 'LOCAL' } as const;

type Rig = {
  sent: JsonValue[];
  waits: number[];
  failures: SendFailure[];
  sendMessage: (channel: string, data: JsonValue) => Promise<SendResult>;
  wait: Wait;
};

function createRig(): Rig {
  const sent: JsonValue[] = [];
  const waits: number[] = [];
  const failures: SendFailure[] = [];

  return {
    sent,
    waits,
    failures,
    sendMessage: (_channel, data) => {
      const failure = failures.shift();

      if (failure !== undefined) {
        return Promise.resolve(err(failure));
      }

      sent.push(data);

      return Promise.resolve(ok(undefined));
    },
    wait: (milliseconds) => {
      waits.push(milliseconds);

      return Promise.resolve();
    },
  };
}

afterEach(() => {
  mock.restore();
});

describe('send queue', () => {
  test('reports a message given up on, one sent after a rate limit, and one sent', async () => {
    // #given
    const rig = createRig();
    const queue = createSendQueue(rig, TIMING, rig.wait);

    spyOn(console, 'error').mockImplementation(() => undefined);
    rig.failures.push({ kind: 'failed', reason: 'down' }, { kind: 'rate-limited' });

    // #when
    const reports = await Promise.all([
      queue.enqueueReported('ui', 1, LOCAL),
      queue.enqueueReported('ui', 2, LOCAL),
      queue.enqueueReported('ui', 3, LOCAL),
    ]);

    // #then: the first meets the failure, and the second waits out the rate limit.
    expect({ reports, sent: rig.sent }).toEqual({ reports: [false, true, true], sent: [2, 3] });
  });

  test('sends in order and spaces each send by the injected value', async () => {
    // #given
    const rig = createRig();
    const queue = createSendQueue(rig, TIMING, rig.wait);

    // #when
    await Promise.all([1, 2, 3].map((value) => queue.enqueue('ui', value, LOCAL)));

    // #then
    expect({ sent: rig.sent, waits: rig.waits }).toEqual({ sent: [1, 2, 3], waits: [50, 50, 50] });
  });

  test('sends one at a time, waiting for the previous send', async () => {
    // #given
    const rig = createRig();
    const started: JsonValue[] = [];
    let finishFirst: (result: SendResult) => void = () => undefined;

    const queue = createSendQueue(
      {
        sendMessage: (_channel, data) => {
          started.push(data);

          return new Promise((resolve) => {
            finishFirst = resolve;
          });
        },
      },
      TIMING,
      rig.wait,
    );

    const first = queue.enqueue('ui', 'first', LOCAL);

    // #when
    void queue.enqueue('ui', 'second', LOCAL);
    await Promise.resolve();
    const startedBeforeFinish = [...started];

    finishFirst(ok(undefined));
    await first;

    // #then
    expect(startedBeforeFinish).toEqual(['first']);
  });

  test('holds a message queued during the pause after the last send until the pause ends', async () => {
    // #given
    const rig = createRig();
    const pauses: (() => void)[] = [];

    const queue = createSendQueue(rig, TIMING, () => {
      return new Promise((resolve) => {
        pauses.push(resolve);
      });
    });

    await queue.enqueue('ui', 'first', LOCAL);

    // #when
    const second = queue.enqueue('ui', 'second', LOCAL);

    await Promise.resolve();

    const sentDuringPause = [...rig.sent];

    for (const finish of pauses) {
      finish();
    }

    await second;

    // #then
    expect({ sentDuringPause, sent: rig.sent }).toEqual({
      sentDuringPause: ['first'],
      sent: ['first', 'second'],
    });
  });

  test('waits with doubling, capped backoff and resends the same message in order', async () => {
    // #given
    const rig = createRig();
    const queue = createSendQueue(rig, TIMING, rig.wait);

    rig.failures.push(
      { kind: 'rate-limited' },
      { kind: 'rate-limited' },
      { kind: 'rate-limited' },
      { kind: 'rate-limited' },
    );

    // #when
    await Promise.all([queue.enqueue('ui', 'a', LOCAL), queue.enqueue('ui', 'b', LOCAL)]);

    // #then
    expect({ sent: rig.sent, waits: rig.waits }).toEqual({
      sent: ['a', 'b'],
      waits: [250, 500, 1000, 1000, 50, 50],
    });
  });

  test('sendNow goes out at once, ahead of the spacing pause and the waiting messages', async () => {
    // #given: the first message is in its spacing pause, and a second one waits behind it.
    const rig = createRig();
    const pauses: (() => void)[] = [];

    const queue = createSendQueue(rig, TIMING, () => {
      return new Promise((resolve) => {
        pauses.push(resolve);
      });
    });

    await queue.enqueue('ui', 'first', LOCAL);

    const waiting = queue.enqueue('ui', 'waiting', LOCAL);

    // #when
    await queue.sendNow('ui', 'urgent', LOCAL);

    const sentBeforePause = [...rig.sent];

    for (const finish of pauses.splice(0)) {
      finish();
    }

    await waiting;

    // #then
    expect({ sentBeforePause, sent: rig.sent }).toEqual({
      sentBeforePause: ['first', 'urgent'],
      sent: ['first', 'urgent', 'waiting'],
    });
  });

  test('sendNow makes one attempt and waits out no rate limit', async () => {
    // #given
    const rig = createRig();
    const queue = createSendQueue(rig, TIMING, rig.wait);

    spyOn(console, 'error').mockImplementation(() => undefined);
    rig.failures.push({ kind: 'rate-limited' });

    // #when
    await queue.sendNow('ui', 'urgent', LOCAL);

    // #then
    expect({ sent: rig.sent, waits: rig.waits }).toEqual({ sent: [], waits: [] });
  });

  test('flushNow sends the message in its backoff and every waiting one in order, once each', async () => {
    // #given: the first message met a rate limit and waits out its backoff, two wait behind it.
    const rig = createRig();
    const backoffs: (() => void)[] = [];

    const queue = createSendQueue(rig, TIMING, () => {
      return new Promise((resolve) => {
        backoffs.push(resolve);
      });
    });

    rig.failures.push({ kind: 'rate-limited' });

    const all = Promise.all([
      queue.enqueue('ui', 'in backoff', LOCAL),
      queue.enqueue('ui', 'second', LOCAL),
      queue.enqueue('ui', 'third', LOCAL),
    ]);

    await Promise.resolve();
    await Promise.resolve();

    // #when
    queue.flushNow();

    const sentAtOnce = [...rig.sent];

    for (const finish of backoffs.splice(0)) {
      finish();
    }

    await all;

    // #then
    expect({ sentAtOnce, sent: rig.sent }).toEqual({
      sentAtOnce: ['in backoff', 'second', 'third'],
      sent: ['in backoff', 'second', 'third'],
    });
  });

  test('logs another send failure and goes on with the next message', async () => {
    // #given
    const rig = createRig();
    const queue = createSendQueue(rig, TIMING, rig.wait);
    const logged: string[] = [];
    const originalError = console.error;

    console.error = (message: string) => {
      logged.push(message);
    };

    rig.failures.push({ kind: 'failed', reason: 'gone' });

    // #when
    await Promise.all([queue.enqueue('ui', 'lost', LOCAL), queue.enqueue('ui', 'kept', LOCAL)]);
    console.error = originalError;

    // #then
    expect({ logged, sent: rig.sent }).toEqual({
      logged: ['Muster Roll could not send a message'],
      sent: ['kept'],
    });
  });

  test('goes on after a port that rejects, against its contract', async () => {
    // #given
    const rig = createRig();
    const originalError = console.error;

    console.error = () => undefined;

    const queue = createSendQueue(
      {
        sendMessage: (channel, data) => {
          return data === 'bad'
            ? Promise.reject(new Error('port broke'))
            : rig.sendMessage(channel, data);
        },
      },
      TIMING,
      rig.wait,
    );

    // #when
    await Promise.all([queue.enqueue('ui', 'bad', LOCAL), queue.enqueue('ui', 'good', LOCAL)]);
    console.error = originalError;

    // #then
    expect(rig.sent).toEqual(['good']);
  });
});

describe('send queue with a composed message', () => {
  test('composes when the queue takes it, so a change made while it waits goes out', async () => {
    // #given: the first message is in its spacing pause, so the composed one waits.
    const rig = createRig();
    const pauses: (() => void)[] = [];
    let latest = 'old';

    const queue = createSendQueue(rig, TIMING, () => {
      return new Promise((resolve) => {
        pauses.push(resolve);
      });
    });

    await queue.enqueue('ui', 'first', LOCAL);

    const composedSend = queue.enqueueComposed('sync', () => latest, LOCAL);

    // #when
    latest = 'new';

    for (const finish of pauses.splice(0)) {
      finish();
    }

    await composedSend;

    // #then
    expect(rig.sent).toEqual(['first', 'new']);
  });

  test('sends nothing and waits no spacing for a composer that returns null', async () => {
    // #given
    const rig = createRig();
    const queue = createSendQueue(rig, TIMING, rig.wait);

    // #when
    await Promise.all([
      queue.enqueueComposed('sync', () => null, LOCAL),
      queue.enqueue('ui', 'after', LOCAL),
    ]);

    // #then
    expect({ sent: rig.sent, waits: rig.waits }).toEqual({ sent: ['after'], waits: [50] });
  });

  test('resends the composed message through a rate limit without composing it again', async () => {
    // #given
    const rig = createRig();
    const queue = createSendQueue(rig, TIMING, rig.wait);
    let composes = 0;

    rig.failures.push({ kind: 'rate-limited' });

    // #when
    await queue.enqueueComposed(
      'sync',
      () => {
        composes += 1;

        return composes;
      },
      LOCAL,
    );

    // #then
    expect({ sent: rig.sent, composes }).toEqual({ sent: [1], composes: 1 });
  });

  test('flushNow composes a waiting message at once', async () => {
    // #given
    const rig = createRig();
    const pauses: (() => void)[] = [];

    const queue = createSendQueue(rig, TIMING, () => {
      return new Promise((resolve) => {
        pauses.push(resolve);
      });
    });

    await queue.enqueue('ui', 'first', LOCAL);

    const composedSend = queue.enqueueComposed('sync', () => 'composed', LOCAL);

    // #when
    queue.flushNow();

    const sentAtOnce = [...rig.sent];

    await composedSend;

    // #then
    expect(sentAtOnce).toEqual(['first', 'composed']);
  });
});
