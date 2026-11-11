import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';

import type { SheetSummary } from '@/core/sheets';
import { linkedSheetIds, linkKey, pickerOrder, tokenIdSchema } from '@/core/token-links';
import { visibleRecordMap, visibleSheets } from '@/core/visibility';
import { copy } from '@/ui/copy';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

// A pick with neither its link nor a rejection by then counts as failed.
const PICK_TIMEOUT_MS = 5000;

type LinkPickerProps = {
  tokenId: string;
  store: Pick<ProjectionStore, '$loaded' | '$records' | '$rejections' | '$replica' | '$sync'>;
  sendCommand: ReplicaClient['sendCommand'];
  // The link is in the replica. Rejects when the popover could not close.
  onLinked: () => Promise<void>;
};

// The sent pick. The command id ties a rejection to it.
type Sent = { commandId: string; sheetId: string };

// UX-DR22: the sheets a token can link to, characters first, then NPCs, and in each group the
// sheets with no token first. A pick stays on screen until its link is in the replica, so a refused
// one, such as for a sheet deleted meanwhile, shows a message here instead of closing the picker.
export function LinkPicker({ tokenId, store, sendCommand, onLinked }: LinkPickerProps): ReactNode {
  const loaded = useStore(store.$loaded);
  const sync = useStore(store.$sync);
  const allRecords = useStore(store.$records);
  const replica = useStore(store.$replica);
  const rejections = useStore(store.$rejections);
  const [sent, setSent] = useState<Sent | null>(null);
  const [failed, setFailed] = useState(false);
  const validToken = tokenIdSchema.safeParse(tokenId).success;
  const records = useMemo(() => visibleRecordMap(sync.role, allRecords), [sync.role, allRecords]);

  const { characters, npcs } = useMemo(
    () => pickerOrder(visibleSheets(sync.role, records.values()), records),
    [sync.role, records],
  );

  const linked = useMemo(() => linkedSheetIds(records), [records]);

  if (sent !== null && rejections.has(sent.commandId)) {
    setSent(null);
    setFailed(true);
  }

  // A pending view can still be refused when catch-up ends, so only the replica counts.
  const arrived = sent !== null && replica.get(linkKey(tokenId))?.d === sent.sheetId;

  useEffect(() => {
    if (!arrived) {
      return;
    }

    onLinked().catch((error) => {
      console.error('Muster Roll could not close the link picker', error);
      setSent(null);
    });
  }, [arrived, onLinked]);

  useEffect(() => {
    if (sent === null) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setSent(null);
      setFailed(true);
    }, PICK_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [sent]);

  function pick(sheet: SheetSummary): void {
    if (sent !== null) {
      return;
    }

    const result = sendCommand({ type: 'link-set', tokenId, sheetId: sheet.sheetId });

    if (result.ok) {
      setSent({ commandId: result.value, sheetId: sheet.sheetId });
      setFailed(false);
    } else {
      setFailed(true);
    }
  }

  function list(sheets: readonly SheetSummary[]): ReactNode {
    return (
      <ul className="flex flex-col gap-1">
        {sheets.map((sheet) => (
          <li key={sheet.sheetId}>
            <AriaButton
              isDisabled={sent !== null}
              onPress={() => {
                pick(sheet);
              }}
              className="touch-target flex w-full items-center gap-2 rounded-sm px-3 text-left text-text data-disabled:opacity-50 data-hovered:bg-surface-tab data-pressed:bg-surface-tab"
            >
              <span className="min-w-[0] flex-1 [overflow-wrap:anywhere]">{sheet.name}</span>
              {linked.has(sheet.sheetId) ? (
                <>
                  {/* Keeps the name and the status apart in the accessible name. */}
                  <span className="sr-only">, </span>
                  <span className="shrink-0 text-label-sm text-text-muted">
                    {copy.status.tokenLinked}
                  </span>
                </>
              ) : null}
            </AriaButton>
          </li>
        ))}
      </ul>
    );
  }

  function content(): ReactNode {
    // No `link:` key can hold this token, so nothing could be picked for it.
    if (!validToken) {
      return null;
    }

    // AD-7: until the first catch-up ends, no list counts as the room's.
    if (!loaded || !sync.firstCatchUpDone) {
      return <p>{copy.loading}</p>;
    }

    // Only a GM links tokens (UX-DR21).
    if (sync.role !== 'GM') {
      return null;
    }

    if (characters.length === 0 && npcs.length === 0) {
      return <p>{copy.noSheetsToLink}</p>;
    }

    return (
      <div aria-busy={sent !== null} className="flex flex-col gap-2">
        {list(characters)}
        {npcs.length === 0 ? null : (
          <section aria-label={copy.place.npc} className="flex flex-col gap-1">
            <h2 className="px-3 text-label-sm text-text-muted">{copy.place.npc}</h2>
            {list(npcs)}
          </section>
        )}
      </div>
    );
  }

  return (
    <main className="flex h-dvh flex-col gap-2 overflow-auto rounded-lg bg-surface p-2 text-body text-text">
      {content()}
      <p aria-live="polite" className="text-label-sm text-danger-text empty:hidden">
        {failed || !validToken ? copy.linkFailed : null}
      </p>
    </main>
  );
}
