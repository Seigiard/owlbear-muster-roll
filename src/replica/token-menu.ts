import type { VersionedRecord } from '@/core/records';
import {
  LINK_PICKER_POPOVER_ID,
  linkPickerUrl,
  liveLinks,
  tokenMenuEntries,
  type TokenMenuAction,
  type TokenMenuEntry,
} from '@/core/token-links';
import type { PlayerRole } from '@/core/visibility';
import type { ContextMenuContext, ContextMenuItem, Platform } from '@/platform/ports';

export const TOKEN_MENU_IDS: Readonly<Record<TokenMenuAction, string>> = {
  link: 'app.muster-roll/link-sheet',
  unlink: 'app.muster-roll/unlink-sheet',
};

const ACTIONS: readonly TokenMenuAction[] = ['link', 'unlink'];

const MENU_ICON = '/icon.svg';

// UX-DR22: a small popover, room for a few sheet names.
const PICKER_WIDTH = 280;

const PICKER_HEIGHT = 360;

// The catalog's item labels, and the notice for an unlink the engine refused. The background page
// passes them, as it does the roll strings.
export type TokenMenuCopy = { linkSheet: string; unlinkSheet: string; unlinkFailed: string };

export type TokenMenu = {
  // Builds the items from these records and this role, and re-creates only those whose filter
  // changed.
  update: (records: ReadonlyMap<string, VersionedRecord>, role: PlayerRole) => void;
  stop: () => void;
};

type TokenMenuPorts = Pick<Platform, 'contextMenu' | 'popover'>;

// AD-10: only the background page owns the token menu. Owlbear filters do not change once an item
// is created, so the items are re-created from the current links and role when either changes.
export function createTokenMenu(
  ports: TokenMenuPorts,
  copy: TokenMenuCopy,
  unlink: (tokenId: string) => void,
): TokenMenu {
  // The filter each item was last created with, as JSON, by action.
  const created = new Map<TokenMenuAction, string>();
  // Items a failed call may have left in Owlbear, as they were or under an older filter. The next
  // update creates or removes them again.
  const stale = new Set<TokenMenuAction>();
  // One port call at a time, so a remove never overtakes the create before it.
  let calls: Promise<void> = Promise.resolve();
  let stopped = false;

  // A rejected call marks its item stale, unless a newer update already changed it. The Owlbear SDK
  // resolves `create` without waiting for the host, so a create the host drops in silence is not
  // seen here: that item stays missing until its filter changes.
  function queue(
    action: TokenMenuAction,
    signature: string | undefined,
    call: () => Promise<void>,
  ): void {
    calls = calls.then(call).catch((error) => {
      console.error('Muster Roll could not change the token menu', error);

      if (created.get(action) === signature) {
        created.delete(action);
        stale.add(action);
      }
    });
  }

  function queueRemove(action: TokenMenuAction): void {
    created.delete(action);
    stale.delete(action);
    queue(action, undefined, () => ports.contextMenu.remove(TOKEN_MENU_IDS[action]));
  }

  function itemOf(entry: TokenMenuEntry): ContextMenuItem {
    const label = entry.action === 'link' ? copy.linkSheet : copy.unlinkSheet;

    return {
      id: TOKEN_MENU_IDS[entry.action],
      icons: [{ icon: MENU_ICON, label, filter: entry.filter }],
      onClick: (context, elementId) => {
        const tokenId = onlyItemId(context);

        if (tokenId === null || stopped) {
          return;
        }

        if (entry.action === 'unlink') {
          unlink(tokenId);

          return;
        }

        // Anchored to the pressed menu entry, which Owlbear shows at the token.
        ports.popover
          .open({
            id: LINK_PICKER_POPOVER_ID,
            url: linkPickerUrl(tokenId),
            width: PICKER_WIDTH,
            height: PICKER_HEIGHT,
            anchorElementId: elementId,
          })
          .catch((error) => {
            console.error('Muster Roll could not open the link picker', error);
          });
      },
    };
  }

  return {
    update: (records, role) => {
      if (stopped) {
        return;
      }

      const entries = new Map(
        tokenMenuEntries(liveLinks(records), role).map((entry) => [entry.action, entry]),
      );

      for (const action of ACTIONS) {
        const entry = entries.get(action);
        const signature = entry === undefined ? undefined : JSON.stringify(entry.filter);

        if (signature === created.get(action) && !stale.has(action)) {
          continue;
        }

        if (entry === undefined || signature === undefined) {
          queueRemove(action);
        } else {
          const item = itemOf(entry);

          created.set(action, signature);
          stale.delete(action);
          // A create still queued when the menu stops is dropped.
          queue(action, signature, () =>
            stopped ? Promise.resolve() : ports.contextMenu.create(item),
          );
        }
      }
    },
    // Takes every item this menu may have left in Owlbear back out, so none stays with a click
    // that does nothing.
    stop: () => {
      stopped = true;

      for (const action of ACTIONS) {
        if (created.has(action) || stale.has(action)) {
          queueRemove(action);
        }
      }
    },
  };
}

// Every item has `max: 1`, so Owlbear calls back with one token. Anything else is ignored.
function onlyItemId(context: ContextMenuContext): string | null {
  const [item] = context.items;

  return context.items.length === 1 && item !== undefined ? item.id : null;
}
