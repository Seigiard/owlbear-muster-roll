import OBR from '@owlbear-rodeo/sdk';

import type { JsonObject, JsonValue } from '@/core/json';
import { TIMING, type Timing } from '@/core/timing';
import type { PartyMember, Platform, PlayerRole } from '@/platform/ports';

import { createBrowserStorage } from './browser-storage';
import { toSendResult } from './send-result';

// A production build reads only `TIMING`.
export const timing: Timing = TIMING;

export const platform: Platform = {
  onReady: (callback) => {
    OBR.onReady(callback);
  },
  broadcast: {
    sendMessage: (channel, data, options) =>
      toSendResult(() => OBR.broadcast.sendMessage(channel, data, options)),
    onMessage: (channel, callback) =>
      OBR.broadcast.onMessage(channel, (event) => {
        callback({
          // SAFETY: Owlbear delivers only JSON, and core schemas parse the value before use.
          data: event.data as JsonValue,
          connectionId: event.connectionId,
        });
      }),
  },
  metadata: {
    getRoomId: () => OBR.room.id,
    getMetadata: async () => {
      const metadata = await OBR.room.getMetadata();

      // SAFETY: Owlbear stores only JSON, and core schemas parse the values before use.
      return metadata as JsonObject;
    },
    setMetadata: (update) => OBR.room.setMetadata(update),
    onMetadataChange: (callback) =>
      OBR.room.onMetadataChange((metadata) => {
        // SAFETY: Owlbear stores only JSON, and core schemas parse the values before use.
        callback(metadata as JsonObject);
      }),
  },
  party: {
    getPlayers: async () => {
      const players = await OBR.party.getPlayers();

      return players.map(toPartyMember);
    },
    onChange: (callback) =>
      OBR.party.onChange((players) => {
        callback(players.map(toPartyMember));
      }),
  },
  player: {
    getId: () => OBR.player.getId(),
    getConnectionId: () => OBR.player.getConnectionId(),
    getName: () => OBR.player.getName(),
    getRole: () => OBR.player.getRole(),
    onRoleChange: (callback) => {
      let lastRole: PlayerRole | null = null;

      // A player change fires on selection and other changes too, so only a new role calls back.
      return OBR.player.onChange((player) => {
        if (player.role !== lastRole) {
          lastRole = player.role;
          callback();
        }
      });
    },
  },
  storage: createBrowserStorage(() => localStorage),
  contextMenu: {
    create: (item) => OBR.contextMenu.create(item),
    remove: (id) => OBR.contextMenu.remove(id),
  },
  popover: {
    open: (popover) => OBR.popover.open(popover),
    close: (id) => OBR.popover.close(id),
  },
  action: {
    open: () => OBR.action.open(),
  },
  notification: {
    show: (message, variant) => OBR.notification.show(message, variant),
  },
  scene: {
    isReady: () => OBR.scene.isReady(),
    onReadyChange: (callback) => OBR.scene.onReadyChange(callback),
    getItemIds: async () => {
      const items = await OBR.scene.items.getItems();

      return items.map((item) => item.id);
    },
    onItemsChange: (callback) =>
      OBR.scene.items.onChange((items) => {
        callback(items.map((item) => item.id));
      }),
  },
  theme: {
    getTheme: () => OBR.theme.getTheme(),
    onChange: (callback) => OBR.theme.onChange(callback),
  },
};

function toPartyMember(player: PartyMember): PartyMember {
  return {
    id: player.id,
    connectionId: player.connectionId,
    name: player.name,
    role: player.role,
  };
}
