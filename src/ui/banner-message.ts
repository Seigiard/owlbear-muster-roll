import type { Notice, SyncState } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import type { BannerMessage } from '@/ui/primitives/banner';

// One banner at a time, by the UX-DR24 priority: local save failed, room copy not saved, new
// version, no GM.
export function bannerFor(
  notices: readonly Notice[],
  sync: Pick<SyncState, 'role' | 'firstCatchUpDone' | 'gmLink'>,
): BannerMessage | undefined {
  if (notices.includes('local-save-failed')) {
    return { variant: 'danger', text: copy.localSaveFailed };
  }

  if (notices.includes('room-copy-not-saved')) {
    return { variant: 'danger', text: copy.roomCopyNotSaved };
  }

  if (notices.includes('new-version')) {
    return { variant: 'warning', text: copy.newVersion };
  }

  if (showsNoGm(sync)) {
    return { variant: 'warning', text: copy.noGm };
  }

  return undefined;
}

// AD-6: a GM client never shows it, also alone in the room, because its own edits apply. Before the
// first catch-up ends `offline` means only that nothing was heard yet.
function showsNoGm(sync: Pick<SyncState, 'role' | 'firstCatchUpDone' | 'gmLink'>): boolean {
  return sync.role !== 'GM' && sync.firstCatchUpDone && sync.gmLink === 'offline';
}
