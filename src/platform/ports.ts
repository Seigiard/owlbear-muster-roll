import type { JsonObject, JsonValue } from '@/core/json';
import type { Result } from '@/core/result';
import type { PlayerRole } from '@/core/visibility';

export type Unsubscribe = () => void;

export type { PlayerRole };

export type BroadcastDestination = 'LOCAL' | 'REMOTE';

export type BroadcastOptions = { destination: BroadcastDestination };

export type BroadcastEvent = { data: JsonValue; connectionId: string };

// Only the adapter knows how Owlbear reports these. A send never rejects.
export type SendFailure = { kind: 'rate-limited' } | { kind: 'failed'; reason: string };

export type SendResult = Result<void, SendFailure>;

export type BroadcastPort = {
  sendMessage: (channel: string, data: JsonValue, options: BroadcastOptions) => Promise<SendResult>;
  onMessage: (channel: string, callback: (event: BroadcastEvent) => void) => Unsubscribe;
};

// An undefined value removes the key, as in OBR.room.setMetadata.
export type MetadataUpdate = { [key: string]: JsonValue | undefined };

export type MetadataPort = {
  getRoomId: () => string;
  getMetadata: () => Promise<JsonObject>;
  setMetadata: (update: MetadataUpdate) => Promise<void>;
  onMetadataChange: (callback: (metadata: JsonObject) => void) => Unsubscribe;
};

export type PartyMember = {
  id: string;
  connectionId: string;
  name: string;
  role: PlayerRole;
};

export type PartyPort = {
  getPlayers: () => Promise<PartyMember[]>;
  onChange: (callback: (players: PartyMember[]) => void) => Unsubscribe;
};

export type PlayerPort = {
  getId: () => Promise<string>;
  getConnectionId: () => Promise<string>;
  getName: () => Promise<string>;
  getRole: () => Promise<PlayerRole>;
  // Fires when this client's own role may have changed. The caller reads the role again.
  onRoleChange: (callback: () => void) => Unsubscribe;
};

// CAP-32: this client's own selection on the map, as item ids. Owlbear keeps one per player
// connection, and every page of the client shares it.
export type SelectionPort = {
  getSelection: () => Promise<string[]>;
  // Calls back with the whole selection each time it changes, and only then.
  onChange: (callback: (itemIds: string[]) => void) => Unsubscribe;
  // Adds the items to the selection and keeps what is selected already. An empty list does nothing.
  select: (itemIds: string[]) => Promise<void>;
  // Takes the items out of the selection and keeps the rest. An empty list does nothing.
  deselect: (itemIds: string[]) => Promise<void>;
};

export type StorageOperation = 'read' | 'write' | 'remove' | 'list';

export type StorageFailure = { operation: StorageOperation; reason: string };

// Synchronous, because one step reads, merges and sets a persisted record.
// A quota or access error is an expected failure, so it comes back as a result.
export type StoragePort = {
  getItem: (key: string) => Result<string | null, StorageFailure>;
  setItem: (key: string, value: string) => Result<void, StorageFailure>;
  removeItem: (key: string) => Result<void, StorageFailure>;
  keys: () => Result<string[], StorageFailure>;
};

export type ContextMenuKeyFilter = {
  key: string | string[];
  value: JsonValue | undefined;
  operator?: '==' | '!=';
  coordinator?: '&&' | '||';
};

// `every` must hold for every selected item, `some` for at least one, as in the SDK.
export type ContextMenuIconFilter = {
  min?: number;
  max?: number;
  roles?: PlayerRole[];
  every?: ContextMenuKeyFilter[];
  some?: ContextMenuKeyFilter[];
};

export type ContextMenuIcon = {
  icon: string;
  label: string;
  filter?: ContextMenuIconFilter;
};

export type ContextMenuContext = { items: { id: string }[] };

export type ContextMenuItem = {
  id: string;
  icons: ContextMenuIcon[];
  onClick?: (context: ContextMenuContext, elementId: string) => void;
};

export type ContextMenuPort = {
  create: (item: ContextMenuItem) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export type Popover = {
  id: string;
  url: string;
  width: number;
  height: number;
  anchorElementId?: string;
};

export type PopoverPort = {
  open: (popover: Popover) => Promise<void>;
  close: (id: string) => Promise<void>;
};

export type ActionPort = {
  open: () => Promise<void>;
  // Sets the action window size in px, for this client only. It applies while the window is open
  // too, and to the next open. A failure can leave one dimension applied; the caller's retry sets
  // both.
  setSize: (width: number, height: number) => Promise<void>;
};

export type NotificationVariant = 'DEFAULT' | 'ERROR' | 'INFO' | 'SUCCESS' | 'WARNING';

export type NotificationPort = {
  show: (message: string, variant?: NotificationVariant) => Promise<string>;
};

// The scene the room has open: its item ids, and the label of one item. Owlbear reports the scene
// not ready while no scene is open and while it changes to another one.
export type ScenePort = {
  isReady: () => Promise<boolean>;
  onReadyChange: (callback: (ready: boolean) => void) => Unsubscribe;
  getItemIds: () => Promise<string[]>;
  // Every item id of the scene after each item update. Owlbear calls back on any update, a drag
  // included, so the same list can come again and again.
  onItemsChange: (callback: (itemIds: string[]) => void) => Unsubscribe;
  // The text label Owlbear shows under one item: "" for an item with an empty label, `null` for an
  // item that is missing or has no label text. Only the link picker of a GM client calls the label
  // methods.
  getItemLabel: (itemId: string) => Promise<string | null>;
  // Sets the label of one item and keeps every other field of it. Rejects for an item that is
  // missing or has no label text.
  setItemLabel: (itemId: string, label: string) => Promise<void>;
};

export type Theme = {
  mode: 'DARK' | 'LIGHT';
  primary: { main: string; contrastText: string };
  background: { default: string; paper: string };
  text: { primary: string; secondary: string };
};

export type ThemePort = {
  getTheme: () => Promise<Theme>;
  onChange: (callback: (theme: Theme) => void) => Unsubscribe;
};

export type Platform = {
  onReady: (callback: () => void) => void;
  broadcast: BroadcastPort;
  metadata: MetadataPort;
  party: PartyPort;
  player: PlayerPort;
  selection: SelectionPort;
  storage: StoragePort;
  contextMenu: ContextMenuPort;
  popover: PopoverPort;
  action: ActionPort;
  notification: NotificationPort;
  scene: ScenePort;
  theme: ThemePort;
};
