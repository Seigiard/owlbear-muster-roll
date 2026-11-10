import type { JsonValue } from '@/core/json';
import type { Timing } from '@/core/timing';
import type { BroadcastOptions, BroadcastPort } from '@/platform/ports';

export type Wait = (milliseconds: number) => Promise<void>;

export type SendQueue = {
  // Resolves once this message was sent or given up on. It never rejects.
  enqueue: (channel: string, data: JsonValue, options: BroadcastOptions) => Promise<void>;
};

type QueuedSend = {
  channel: string;
  data: JsonValue;
  options: BroadcastOptions;
  settle: () => void;
};

export function createSendQueue(
  broadcast: Pick<BroadcastPort, 'sendMessage'>,
  timing: Timing,
  wait: Wait = waitWithTimer,
): SendQueue {
  const queued: QueuedSend[] = [];
  let draining = false;

  async function sendUntilAnswered(item: QueuedSend): Promise<void> {
    let backoff = timing.rateLimitBackoffStartMs;

    for (;;) {
      const result = await broadcast.sendMessage(item.channel, item.data, item.options);

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
      try {
        await sendUntilAnswered(item);
      } catch (error) {
        console.error('Muster Roll could not send a message', error);
      }

      item.settle();
      await wait(timing.sendSpacingMs);
    }

    draining = false;
  }

  return {
    enqueue: (channel, data, options) =>
      new Promise((resolve) => {
        queued.push({ channel, data, options, settle: resolve });

        if (!draining) {
          drain().catch((error) => {
            draining = false;
            console.error('Muster Roll stopped sending messages', error);
          });
        }
      }),
  };
}

function waitWithTimer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
