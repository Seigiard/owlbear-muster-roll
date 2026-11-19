import OBR from '@owlbear-rodeo/sdk';

import type { JsonObject, JsonValue } from '@/core/json';
import { TIMING, type Timing } from '@/core/timing';
import { sameItemIds } from '@/core/token-selection';
import { Result } from 'better-result';
import {
  MetadataFailure,
  NotificationFailure,
  PartyReadFailure,
  PlayerReadFailure,
  type Bounds,
  type PartyMember,
  type Platform,
  type PlayerRole,
} from '@/platform/ports';

import { createBrowserStorage } from './browser-storage';
import { itemLabel, writeItemLabel } from './item-label';
import { toSendResult } from './send-result';

// A production build reads only `TIMING`.
export const timing: Timing = TIMING;

export const platform: Platform = {
  onReady: (callback) => {
    OBR.onReady(callback);
  },
  broadcast: {
    sendMessage: (channel, data, options) =>
      toSendResult(() => OBR.broadcast.sendMessage(channel, data, options), channel),
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
      const metadata = await Result.tryPromise({
        try: () => OBR.room.getMetadata(),
        catch: (cause) => new MetadataFailure({ operation: 'read', reason: String(cause) }),
      });

      return metadata.isOk()
        ? // SAFETY: Owlbear metadata is a JSON object by the SDK contract.
          Result.ok(metadata.value as JsonObject)
        : metadata;
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
      const players = await Result.tryPromise({
        try: () => OBR.party.getPlayers(),
        catch: (cause) => new PartyReadFailure({ reason: String(cause) }),
      });

      return players.isOk() ? Result.ok(players.value.map(toPartyMember)) : players;
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
    getRole: () =>
      Result.tryPromise({
        try: () => OBR.player.getRole(),
        catch: (cause) => new PlayerReadFailure({ field: 'role', reason: String(cause) }),
      }),
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
  selection: {
    getSelection: async () => (await OBR.player.getSelection()) ?? [],
    onChange: (callback) => {
      let last: string[] | null = null;

      // A player change fires on role, name and other changes too, so only a new selection calls
      // back. Owlbear reports no selection as `undefined`.
      return OBR.player.onChange((player) => {
        const next = player.selection ?? [];

        if (last === null || !sameItemIds(last, next)) {
          last = [...next];
          callback([...next]);
        }
      });
    },
    // `replace: false` adds to what the player has selected, as simple-hp-tracker does.
    select: async (itemIds) => {
      if (itemIds.length > 0) {
        await OBR.player.select(itemIds, false);
      }
    },
    // No list would deselect every item, so an empty one sends nothing.
    deselect: async (itemIds) => {
      if (itemIds.length > 0) {
        await OBR.player.deselect(itemIds);
      }
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
    setSize: async (width, height) => {
      await Promise.all([OBR.action.setWidth(width), OBR.action.setHeight(height)]);
    },
  },
  notification: {
    show: (message, variant) =>
      Result.tryPromise({
        try: () => OBR.notification.show(message, variant),
        catch: (cause) => new NotificationFailure({ reason: String(cause) }),
      }),
  },
  scene: {
    isReady: () => OBR.scene.isReady(),
    onReadyChange: (callback) => OBR.scene.onReadyChange(callback),
    getItemIds: async () => {
      const items = await OBR.scene.items.getItems();

      return items.map((item) => item.id);
    },
    getTokenIds: async () => {
      const items = await OBR.scene.items.getItems((item) => item.layer === 'CHARACTER');

      return items.map((item) => item.id);
    },
    onItemsChange: (callback) =>
      OBR.scene.items.onChange((items) => {
        callback(items.map((item) => item.id));
      }),
    getItemBounds: async (itemIds) => {
      const entries = await Promise.all(
        itemIds.map(
          async (itemId) => [itemId, await OBR.scene.items.getItemBounds([itemId])] as const,
        ),
      );

      return new Map<string, Bounds>(entries);
    },
    getItemLabel: async (itemId) => itemLabel(await OBR.scene.items.getItems([itemId]), itemId),
    setItemLabel: async (itemId, label) => {
      // Only a GM labels tokens through Muster Roll.
      if ((await OBR.player.getRole()) !== 'GM') {
        throw new Error('Only a GM sets a token label');
      }

      // The SDK runs the draft update here, before it resolves. A draft update cannot reject, so an
      // item that is missing, or has no label text, by then rejects after it.
      let written = false;

      await OBR.scene.items.updateItems([itemId], (drafts) => {
        for (const draft of drafts) {
          if (draft.id === itemId && writeItemLabel(draft, label)) {
            written = true;
          }
        }
      });

      if (!written) {
        throw new Error(`Owlbear item ${itemId} is missing or has no label`);
      }
    },
  },
  viewport: {
    getBounds: async () => {
      const [width, height] = await Promise.all([
        OBR.viewport.getWidth(),
        OBR.viewport.getHeight(),
      ]);

      const [topLeft, bottomRight] = await Promise.all([
        OBR.viewport.inverseTransformPoint({ x: 0, y: 0 }),
        OBR.viewport.inverseTransformPoint({ x: width, y: height }),
      ]);

      const min = {
        x: Math.min(topLeft.x, bottomRight.x),
        y: Math.min(topLeft.y, bottomRight.y),
      };

      const max = {
        x: Math.max(topLeft.x, bottomRight.x),
        y: Math.max(topLeft.y, bottomRight.y),
      };

      return {
        min,
        max,
        width: max.x - min.x,
        height: max.y - min.y,
        center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 },
      };
    },
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
