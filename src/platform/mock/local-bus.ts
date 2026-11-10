import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import type { BroadcastEvent, Unsubscribe } from '@/platform/ports';

const PAGE_CHANNEL_PREFIX = 'muster-roll-mock-local:';

const postedMessageSchema = z.object({
  channel: z.string(),
  data: z.json(),
  connectionId: z.string(),
});

type BroadcastListener = (event: BroadcastEvent) => void;

export type LocalBus = {
  post: (channel: string, data: JsonValue, connectionId: string) => void;
  subscribe: (channel: string, listener: BroadcastListener) => Unsubscribe;
};

// One client's LOCAL traffic within one process, as a test sees it across engine and windows.
export function createMemoryBus(): LocalBus {
  const listeners = new Map<string, Set<BroadcastListener>>();

  return {
    post: (channel, data, connectionId) => {
      for (const listener of listeners.get(channel) ?? []) {
        listener({ data: structuredClone(data), connectionId });
      }
    },
    subscribe: (channel, listener) => {
      const set = listeners.get(channel) ?? new Set<BroadcastListener>();

      listeners.set(channel, set);
      set.add(listener);

      return () => {
        set.delete(listener);
      };
    },
  };
}

// Real pages exchange LOCAL over a BroadcastChannel. It skips its sender, so the sender's own
// listeners are called directly: Owlbear also delivers a LOCAL message to its sender. The channel
// is one client's, so LOCAL never reaches another client in the same browser.
export function createPageBus(client: string): LocalBus {
  const local = createMemoryBus();
  let shared: BroadcastChannel | null = null;

  function sharedChannel(): BroadcastChannel {
    if (shared === null) {
      shared = new BroadcastChannel(`${PAGE_CHANNEL_PREFIX}${client}`);
      shared.addEventListener('message', (event: MessageEvent) => {
        const parsed = postedMessageSchema.safeParse(event.data);

        if (parsed.success) {
          local.post(parsed.data.channel, parsed.data.data, parsed.data.connectionId);
        }
      });
    }

    return shared;
  }

  return {
    post: (channel, data, connectionId) => {
      local.post(channel, data, connectionId);
      sharedChannel().postMessage({ channel, data, connectionId });
    },
    subscribe: (channel, listener) => {
      sharedChannel();

      return local.subscribe(channel, listener);
    },
  };
}
