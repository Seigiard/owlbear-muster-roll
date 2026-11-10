import type { JsonValue } from '@/core/json';
import type { Timing } from '@/core/timing';
import type { BroadcastOptions, BroadcastPort } from '@/platform/ports';

export type Wait = (milliseconds: number) => Promise<void>;

export type SendQueue = {
  // Resolves once this message was sent or given up on. It never rejects.
  enqueue: (channel: string, data: JsonValue, options: BroadcastOptions) => Promise<void>;
  // Calls `compose` when the queue takes the message, so a caller can fold later changes into a
  // message that is still waiting. `null` sends nothing. Resolves as `enqueue` does.
  enqueueComposed: (
    channel: string,
    compose: () => JsonValue | null,
    options: BroadcastOptions,
  ) => Promise<void>;
  // Sends at once, ahead of the spacing pause and of every waiting message, with one attempt and
  // no backoff, because a closing page cannot outlive one. Resolves as `enqueue` does.
  sendNow: (channel: string, data: JsonValue, options: BroadcastOptions) => Promise<void>;
  // Sends the message in its backoff and every waiting one at once, in order, one attempt each,
  // for a page that is about to close. Call it before `sendNow`, so a newer value goes last.
  flushNow: () => void;
};

type Message = { channel: string; data: JsonValue; options: BroadcastOptions };

type Composer = () => JsonValue | null;

// `flushed` stops the drain from sending a message again that `flushNow` already sent.
type QueuedSend = {
  channel: string;
  compose: Composer;
  options: BroadcastOptions;
  settle: () => void;
  flushed: boolean;
};

// The message the drain composed and is sending now, until it is answered.
type InFlight = { item: QueuedSend; message: Message };

export function createSendQueue(
  broadcast: Pick<BroadcastPort, 'sendMessage'>,
  timing: Timing,
  wait: Wait = waitWithTimer,
): SendQueue {
  const queued: QueuedSend[] = [];
  let draining = false;
  let inFlight: InFlight | null = null;

  async function sendUntilAnswered({ item, message }: InFlight): Promise<void> {
    let backoff = timing.rateLimitBackoffStartMs;

    while (!item.flushed) {
      const result = await broadcast.sendMessage(message.channel, message.data, message.options);

      if (result.ok) {
        return;
      }

      if (result.error.kind !== 'rate-limited') {
        console.error('Muster Roll could not send a message', result.error);

        return;
      }

      await wait(backoff);
      backoff = Math.min(backoff * 2, timing.rateLimitBackoffMaxMs);
    }
  }

  async function drain(): Promise<void> {
    draining = true;

    // The pause after the last send stays inside the loop, so a message queued
    // right after it is spaced too.
    for (let item = queued.shift(); item !== undefined; item = queued.shift()) {
      const message = composed(item);

      // Nothing to send needs no spacing either.
      if (message === null) {
        item.settle();
        continue;
      }

      inFlight = { item, message };

      try {
        await sendUntilAnswered(inFlight);
      } catch (error) {
        console.error('Muster Roll could not send a message', error);
      }

      inFlight = null;
      item.settle();
      await wait(timing.sendSpacingMs);
    }

    draining = false;
  }

  async function sendOnce(item: Message): Promise<void> {
    try {
      const result = await broadcast.sendMessage(item.channel, item.data, item.options);

      if (!result.ok) {
        console.error('Muster Roll could not send a message', result.error);
      }
    } catch (error) {
      console.error('Muster Roll could not send a message', error);
    }
  }

  function push(channel: string, compose: Composer, options: BroadcastOptions): Promise<void> {
    return new Promise((resolve) => {
      queued.push({ channel, compose, options, settle: resolve, flushed: false });

      if (!draining) {
        drain().catch((error) => {
          draining = false;
          console.error('Muster Roll stopped sending messages', error);
        });
      }
    });
  }

  return {
    sendNow: (channel, data, options) => sendOnce({ channel, data, options }),
    flushNow: () => {
      const sends: InFlight[] = inFlight === null || inFlight.item.flushed ? [] : [inFlight];

      for (const item of queued.splice(0)) {
        const message = composed(item);

        if (message === null) {
          item.settle();
        } else {
          sends.push({ item, message });
        }
      }

      // Every send starts before the first answer, so all leave while the page still exists.
      for (const { item, message } of sends) {
        item.flushed = true;
        sendOnce(message)
          .then(item.settle)
          .catch((error) => {
            console.error('Muster Roll could not send a message', error);
          });
      }
    },
    enqueue: (channel, data, options) => push(channel, () => data, options),
    enqueueComposed: push,
  };
}

// A composer that throws sends nothing, like one that returns `null`.
function composed(item: QueuedSend): Message | null {
  try {
    const data = item.compose();

    return data === null ? null : { channel: item.channel, data, options: item.options };
  } catch (error) {
    console.error('Muster Roll could not compose a message', error);

    return null;
  }
}

function waitWithTimer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
