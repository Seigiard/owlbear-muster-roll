import { z } from 'zod';

import type { JsonObject, JsonValue } from '@/core/json';
import type { BroadcastEvent, MetadataUpdate, PartyMember, Unsubscribe } from '@/platform/ports';

import {
  METADATA_CHANNEL_PREFIX,
  METADATA_STORAGE_PREFIX,
  PARTY_CHANNEL_PREFIX,
  PARTY_STORAGE_PREFIX,
} from './client-params';
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

const metadataSchema = z.record(z.string(), z.json());

// Owlbear keeps 16 kB of room metadata. It reports success for a write past that and drops it.
const METADATA_BYTE_LIMIT = 16 * 1024;

type RemoteListener = (event: BroadcastEvent) => void;

type MetadataListener = (metadata: JsonObject) => void;

// What every client of one room shares: REMOTE delivery, the party and the room metadata.
export type MockRoom = {
  // Reaches every client but the one with this connection id, as Owlbear never echoes REMOTE.
  postRemote: (channel: string, data: JsonValue, connectionId: string) => void;
  onRemote: (channel: string, receiver: string, listener: RemoteListener) => Unsubscribe;
  members: () => PartyMember[];
  join: (member: PartyMember) => void;
  leave: (connectionId: string) => void;
  onPartyChange: (listener: () => void) => Unsubscribe;
  getMetadata: () => JsonObject;
  // An undefined value removes the key, as in OBR.room.setMetadata. Every client's listeners hear
  // the change, the writer's own included.
  setMetadata: (update: MetadataUpdate) => void;
  onMetadataChange: (listener: MetadataListener) => Unsubscribe;
};

// Several clients in one process, as unit tests build them.
export function createMemoryRoom(): MockRoom {
  const remote = createMemoryBus();
  const partyListeners = new Set<() => void>();
  const metadataListeners = new Set<MetadataListener>();
  let members: PartyMember[] = [];
  let metadata: JsonObject = {};

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
    getMetadata: () => structuredClone(metadata),
    setMetadata: (update) => {
      const next = updatedMetadata(metadata, update);

      if (next === null) {
        return;
      }

      metadata = next;

      for (const listener of metadataListeners) {
        listener(structuredClone(metadata));
      }
    },
    onMetadataChange: (listener) => subscribe(metadataListeners, listener),
  };
}

// Real pages of every client in one browser. REMOTE goes over a BroadcastChannel per room. The
// party and the room metadata live in localStorage, outside every device's namespace, and a
// BroadcastChannel each tells the other pages they changed.
export function createPageRoom(roomId: string): MockRoom {
  const remote = createMemoryBus();
  const partyListeners = new Set<() => void>();
  const metadataListeners = new Set<MetadataListener>();
  const partyKey = `${PARTY_STORAGE_PREFIX}${roomId}`;
  const metadataKey = `${METADATA_STORAGE_PREFIX}${roomId}`;
  let remoteChannel: BroadcastChannel | null = null;
  let partyChannel: BroadcastChannel | null = null;
  let metadataChannel: BroadcastChannel | null = null;

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

  function sharedMetadata(): BroadcastChannel {
    if (metadataChannel === null) {
      metadataChannel = new BroadcastChannel(`${METADATA_CHANNEL_PREFIX}${roomId}`);
      metadataChannel.addEventListener('message', notifyMetadata);
    }

    return metadataChannel;
  }

  function notifyMetadata(): void {
    for (const listener of metadataListeners) {
      listener(readMetadata());
    }
  }

  function readMetadata(): JsonObject {
    try {
      const parsed = metadataSchema.safeParse(
        JSON.parse(localStorage.getItem(metadataKey) ?? '{}'),
      );

      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
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
    getMetadata: readMetadata,
    setMetadata: (update) => {
      const next = updatedMetadata(readMetadata(), update);

      if (next === null) {
        return;
      }

      localStorage.setItem(metadataKey, JSON.stringify(next));
      sharedMetadata().postMessage('changed');
      notifyMetadata();
    },
    onMetadataChange: (listener) => {
      sharedMetadata();

      return subscribe(metadataListeners, listener);
    },
  };
}

// `null` for a result past the limit, which the room drops in silence.
function updatedMetadata(metadata: JsonObject, update: MetadataUpdate): JsonObject | null {
  const next: JsonObject = structuredClone(metadata);

  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = structuredClone(value);
    }
  }

  return new TextEncoder().encode(JSON.stringify(next)).length > METADATA_BYTE_LIMIT ? null : next;
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

function subscribe<Listener>(listeners: Set<Listener>, listener: Listener): Unsubscribe {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
