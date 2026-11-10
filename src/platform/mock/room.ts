import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import type { BroadcastEvent, PartyMember, Unsubscribe } from '@/platform/ports';

import { PARTY_CHANNEL_PREFIX, PARTY_STORAGE_PREFIX } from './client-params';
import { createMemoryBus, type LocalBus } from './local-bus';

const REMOTE_CHANNEL_PREFIX = 'muster-roll-mock-remote:';

const remotePostSchema = z.object({
  channel: z.string(),
  data: z.json(),
  connectionId: z.string(),
});

const partySchema = z.array(
  z.object({
    id: z.string(),
    connectionId: z.string(),
    name: z.string(),
    role: z.enum(['GM', 'PLAYER']),
  }),
);

type RemoteListener = (event: BroadcastEvent) => void;

// What every client of one room shares: REMOTE delivery and the party.
export type MockRoom = {
  // Reaches every client but the one with this connection id, as Owlbear never echoes REMOTE.
  postRemote: (channel: string, data: JsonValue, connectionId: string) => void;
  onRemote: (channel: string, receiver: string, listener: RemoteListener) => Unsubscribe;
  members: () => PartyMember[];
  join: (member: PartyMember) => void;
  leave: (connectionId: string) => void;
  onPartyChange: (listener: () => void) => Unsubscribe;
};

// Several clients in one process, as unit tests build them.
export function createMemoryRoom(): MockRoom {
  const remote = createMemoryBus();
  const partyListeners = new Set<() => void>();
  let members: PartyMember[] = [];

  function changeParty(next: PartyMember[]): void {
    members = next;

    for (const listener of partyListeners) {
      listener();
    }
  }

  return {
    postRemote: (channel, data, connectionId) => {
      remote.post(channel, data, connectionId);
    },
    onRemote: (channel, receiver, listener) => onRemoteFrom(remote, channel, receiver, listener),
    members: () => structuredClone(members),
    join: (member) => {
      changeParty([...withoutConnection(members, member.connectionId), { ...member }]);
    },
    leave: (connectionId) => {
      changeParty(withoutConnection(members, connectionId));
    },
    onPartyChange: (listener) => subscribe(partyListeners, listener),
  };
}

// Real pages of every client in one browser. REMOTE goes over a BroadcastChannel per room. The
// party lives in localStorage, and a BroadcastChannel tells the other pages it changed.
export function createPageRoom(roomId: string): MockRoom {
  const remote = createMemoryBus();
  const partyListeners = new Set<() => void>();
  const partyKey = `${PARTY_STORAGE_PREFIX}${roomId}`;
  let remoteChannel: BroadcastChannel | null = null;
  let partyChannel: BroadcastChannel | null = null;

  function sharedRemote(): BroadcastChannel {
    if (remoteChannel === null) {
      remoteChannel = new BroadcastChannel(`${REMOTE_CHANNEL_PREFIX}${roomId}`);
      remoteChannel.addEventListener('message', (event: MessageEvent) => {
        const parsed = remotePostSchema.safeParse(event.data);

        if (parsed.success) {
          remote.post(parsed.data.channel, parsed.data.data, parsed.data.connectionId);
        }
      });
    }

    return remoteChannel;
  }

  function sharedParty(): BroadcastChannel {
    if (partyChannel === null) {
      partyChannel = new BroadcastChannel(`${PARTY_CHANNEL_PREFIX}${roomId}`);
      partyChannel.addEventListener('message', notifyParty);
    }

    return partyChannel;
  }

  function notifyParty(): void {
    for (const listener of partyListeners) {
      listener();
    }
  }

  function readParty(): PartyMember[] {
    try {
      const parsed = partySchema.safeParse(JSON.parse(localStorage.getItem(partyKey) ?? '[]'));

      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }

  // A BroadcastChannel skips its sender, so this page's own listeners are called directly.
  function writeParty(next: PartyMember[]): void {
    localStorage.setItem(partyKey, JSON.stringify(next));
    sharedParty().postMessage('changed');
    notifyParty();
  }

  return {
    postRemote: (channel, data, connectionId) => {
      remote.post(channel, data, connectionId);
      sharedRemote().postMessage({ channel, data, connectionId });
    },
    onRemote: (channel, receiver, listener) => {
      sharedRemote();

      return onRemoteFrom(remote, channel, receiver, listener);
    },
    members: readParty,
    join: (member) => {
      writeParty([...withoutConnection(readParty(), member.connectionId), { ...member }]);
    },
    leave: (connectionId) => {
      writeParty(withoutConnection(readParty(), connectionId));
    },
    onPartyChange: (listener) => {
      sharedParty();

      return subscribe(partyListeners, listener);
    },
  };
}

function onRemoteFrom(
  remote: LocalBus,
  channel: string,
  receiver: string,
  listener: RemoteListener,
): Unsubscribe {
  return remote.subscribe(channel, (event) => {
    if (event.connectionId !== receiver) {
      listener(event);
    }
  });
}

function withoutConnection(members: readonly PartyMember[], connectionId: string): PartyMember[] {
  return members.filter((member) => member.connectionId !== connectionId);
}

function subscribe(listeners: Set<() => void>, listener: () => void): Unsubscribe {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
