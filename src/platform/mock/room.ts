import { z } from 'zod';

import type { JsonObject, JsonValue } from '@/core/json';
import type { BroadcastEvent, MetadataUpdate, PartyMember, Unsubscribe } from '@/platform/ports';

import {
  METADATA_CHANNEL_PREFIX,
  METADATA_STORAGE_PREFIX,
  PARTY_CHANNEL_PREFIX,
  PARTY_STORAGE_PREFIX,
  SCENE_CHANNEL_PREFIX,
  SCENE_STORAGE_PREFIX,
  SELECTION_CHANNEL_PREFIX,
  SELECTION_STORAGE_PREFIX,
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

const sceneSchema = z.object({
  ready: z.boolean(),
  itemIds: z.array(z.string()),
  labels: z.record(z.string(), z.string().nullable()),
});

const sceneChangeSchema = z.object({ kind: z.enum(['ready', 'items']), scene: sceneSchema });

const selectionSchema = z.array(z.string());

const selectionChangeSchema = z.object({ connectionId: z.string(), itemIds: selectionSchema });

// A room opens with a ready scene that holds no item, so a test that never touches the scene sees
// no removal.
const INITIAL_SCENE: MockScene = { ready: true, itemIds: [], labels: {} };

// Owlbear keeps 16 kB of room metadata. It reports success for a write past that and drops it.
const METADATA_BYTE_LIMIT = 16 * 1024;

type RemoteListener = (event: BroadcastEvent) => void;

type MetadataListener = (metadata: JsonObject) => void;

// The scene the room has open: whether it is ready, its item ids in order, and the text label of
// each item that has one. An item with no entry has an empty label, and one with `null` has no label
// text, as a shape. A label lives in its item, so an item that leaves the scene and comes back, as
// on a scene switch or an undo, keeps it.
export type MockScene = {
  ready: boolean;
  itemIds: string[];
  labels: Record<string, string | null>;
};

// What Owlbear reports about one change: readiness, or the item list. It reports both even when
// they did not change.
export type MockSceneChange = 'ready' | 'items';

type SceneListener = (scene: MockScene, change: MockSceneChange) => void;

type SelectionListener = (itemIds: string[]) => void;

// What every client of one room shares: REMOTE delivery, the party, the room metadata and the scene,
// and each client's own map selection, which only that client's pages read and change.
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
  // One scene for the whole room, as Owlbear shows every client the scene the GM opened.
  getScene: () => MockScene;
  // Every client's listeners hear the change, the writer's own included, in the order it was made.
  setScene: (scene: MockScene, change: MockSceneChange) => void;
  onSceneChange: (listener: SceneListener) => Unsubscribe;
  // The map selection of one client, which only that client's pages read and change. A client that
  // never selected anything has an empty one.
  getSelection: (connectionId: string) => string[];
  // Every listener of that client hears the change, the writer's own page included.
  setSelection: (connectionId: string, itemIds: string[]) => void;
  onSelectionChange: (connectionId: string, listener: SelectionListener) => Unsubscribe;
};

// Several clients in one process, as unit tests build them.
export function createMemoryRoom(): MockRoom {
  const remote = createMemoryBus();
  const partyListeners = new Set<() => void>();
  const metadataListeners = new Set<MetadataListener>();
  const sceneListeners = new Set<SceneListener>();
  const selections = new Map<string, string[]>();
  const selectionListeners = new Map<string, Set<SelectionListener>>();
  let members: PartyMember[] = [];
  let metadata: JsonObject = {};
  let scene: MockScene = structuredClone(INITIAL_SCENE);

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
    getScene: () => structuredClone(scene),
    setScene: (next, change) => {
      scene = structuredClone(next);

      for (const listener of sceneListeners) {
        listener(structuredClone(scene), change);
      }
    },
    onSceneChange: (listener) => subscribe(sceneListeners, listener),
    getSelection: (connectionId) => [...(selections.get(connectionId) ?? [])],
    setSelection: (connectionId, itemIds) => {
      selections.set(connectionId, [...itemIds]);

      for (const listener of selectionListeners.get(connectionId) ?? []) {
        listener([...itemIds]);
      }
    },
    onSelectionChange: (connectionId, listener) =>
      subscribe(listenersOf(selectionListeners, connectionId), listener),
  };
}

// Real pages of every client in one browser. REMOTE goes over a BroadcastChannel per room. The
// party, the room metadata and the scene live in localStorage, outside every device's namespace,
// and a BroadcastChannel each tells the other pages they changed. A scene change carries the scene
// after it, so each page hears every step in order, even when several steps were made before the
// first message arrived.
export function createPageRoom(roomId: string): MockRoom {
  const remote = createMemoryBus();
  const partyListeners = new Set<() => void>();
  const metadataListeners = new Set<MetadataListener>();
  const sceneListeners = new Set<SceneListener>();
  const selectionListeners = new Map<string, Set<SelectionListener>>();
  const partyKey = `${PARTY_STORAGE_PREFIX}${roomId}`;
  const metadataKey = `${METADATA_STORAGE_PREFIX}${roomId}`;
  const sceneKey = `${SCENE_STORAGE_PREFIX}${roomId}`;
  let remoteChannel: BroadcastChannel | null = null;
  let partyChannel: BroadcastChannel | null = null;
  let metadataChannel: BroadcastChannel | null = null;
  let sceneChannel: BroadcastChannel | null = null;
  let selectionChannel: BroadcastChannel | null = null;

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

  function sharedScene(): BroadcastChannel {
    if (sceneChannel === null) {
      sceneChannel = new BroadcastChannel(`${SCENE_CHANNEL_PREFIX}${roomId}`);
      sceneChannel.addEventListener('message', (event: MessageEvent) => {
        const parsed = sceneChangeSchema.safeParse(event.data);

        if (parsed.success) {
          notifyScene(parsed.data.scene, parsed.data.kind);
        }
      });
    }

    return sceneChannel;
  }

  function notifyScene(scene: MockScene, change: MockSceneChange): void {
    for (const listener of sceneListeners) {
      listener(structuredClone(scene), change);
    }
  }

  function readScene(): MockScene {
    try {
      const text = localStorage.getItem(sceneKey);
      const parsed = text === null ? null : sceneSchema.safeParse(JSON.parse(text));

      return parsed?.success === true ? parsed.data : structuredClone(INITIAL_SCENE);
    } catch {
      return structuredClone(INITIAL_SCENE);
    }
  }

  function selectionKey(connectionId: string): string {
    return `${SELECTION_STORAGE_PREFIX}${roomId}:${connectionId}`;
  }

  function sharedSelection(): BroadcastChannel {
    if (selectionChannel === null) {
      selectionChannel = new BroadcastChannel(`${SELECTION_CHANNEL_PREFIX}${roomId}`);
      selectionChannel.addEventListener('message', (event: MessageEvent) => {
        const parsed = selectionChangeSchema.safeParse(event.data);

        if (parsed.success) {
          notifySelection(parsed.data.connectionId, parsed.data.itemIds);
        }
      });
    }

    return selectionChannel;
  }

  function notifySelection(connectionId: string, itemIds: string[]): void {
    for (const listener of selectionListeners.get(connectionId) ?? []) {
      listener([...itemIds]);
    }
  }

  function readSelection(connectionId: string): string[] {
    try {
      const parsed = selectionSchema.safeParse(
        JSON.parse(localStorage.getItem(selectionKey(connectionId)) ?? '[]'),
      );

      return parsed.success ? parsed.data : [];
    } catch {
      return [];
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
    getScene: readScene,
    setScene: (next, change) => {
      const scene = structuredClone(next);

      // The message carries the scene, so a failed write only leaves later readers behind.
      try {
        localStorage.setItem(sceneKey, JSON.stringify(scene));
      } catch (error) {
        console.error('Muster Roll mock could not store the scene', error);
      }

      sharedScene().postMessage({ kind: change, scene });
      notifyScene(scene, change);
    },
    onSceneChange: (listener) => {
      sharedScene();

      return subscribe(sceneListeners, listener);
    },
    getSelection: readSelection,
    setSelection: (connectionId, itemIds) => {
      localStorage.setItem(selectionKey(connectionId), JSON.stringify(itemIds));
      sharedSelection().postMessage({ connectionId, itemIds });
      notifySelection(connectionId, itemIds);
    },
    onSelectionChange: (connectionId, listener) => {
      sharedSelection();

      return subscribe(listenersOf(selectionListeners, connectionId), listener);
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

function listenersOf<Listener>(
  listeners: Map<string, Set<Listener>>,
  connectionId: string,
): Set<Listener> {
  const existing = listeners.get(connectionId);

  if (existing !== undefined) {
    return existing;
  }

  const created = new Set<Listener>();

  listeners.set(connectionId, created);

  return created;
}

function subscribe<Listener>(listeners: Set<Listener>, listener: Listener): Unsubscribe {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
