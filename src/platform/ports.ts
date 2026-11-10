import type { JsonObject, JsonValue } from '@/core/json';
import type { Result } from '@/core/result';

export type Unsubscribe = () => void;

export type PlayerRole = 'GM' | 'PLAYER';

export type BroadcastDestination = 'LOCAL' | 'REMOTE';

export type BroadcastOptions = { destination: BroadcastDestination };

export type BroadcastEvent = { data: JsonValue; connectionId: string };

export type BroadcastPort = {
  sendMessage: (channel: string, data: JsonValue, options: BroadcastOptions) => Promise<void>;
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

export type ContextMenuIconFilter = {
  max?: number;
  roles?: PlayerRole[];
  every?: ContextMenuKeyFilter[];
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
};

export type NotificationVariant = 'DEFAULT' | 'ERROR' | 'INFO' | 'SUCCESS' | 'WARNING';

export type NotificationPort = {
  show: (message: string, variant?: NotificationVariant) => Promise<string>;
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
  storage: StoragePort;
  contextMenu: ContextMenuPort;
  popover: PopoverPort;
  action: ActionPort;
  notification: NotificationPort;
  theme: ThemePort;
};
