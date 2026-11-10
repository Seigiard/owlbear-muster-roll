import OBR from '@owlbear-rodeo/sdk';

import type { JsonObject, JsonValue } from '@/core/json';
import type { PartyMember, Platform } from '@/platform/ports';

import { createBrowserStorage } from './browser-storage';

export const platform: Platform = {
  onReady: (callback) => {
    OBR.onReady(callback);
  },
  broadcast: {
    sendMessage: (channel, data, options) => OBR.broadcast.sendMessage(channel, data, options),
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
