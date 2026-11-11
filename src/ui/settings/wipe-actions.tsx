import { useStore } from '@nanostores/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { TIMING } from '@/core/timing';
import type { RejectionReason } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

// AD-9, kept in this window only, so a window that closes, or a GM who leaves Settings, forgets it
// and writes nothing. `asking` shows the block, `wiping` waits for the answer. `ask` counts the
// questions, so a new one remounts the block and its focus goes to "Отменить" again.
type WipeState =
  | { phase: 'idle'; message: string | null; ask: number }
  | { phase: 'asking'; ask: number }
  | { phase: 'wiping'; commandId: string; ask: number };

type WipeActionsOptions = {
  catchingUp: boolean;
  client: Pick<ReplicaClient, 'sendCommand'>;
  store: Pick<ProjectionStore, '$rejections' | '$wipeResults'>;
};

type WipeActionsParts = {
  // The confirmation block, for the top of the content area, or `null` while none is open.
  confirmation: ReactNode;
  // "Очистить всё" with its message under it.
  action: ReactNode;
};

// CAP-31: "Очистить всё" asks one confirmation, then erases all room data in a new generation. It
// works with or without a preset, also in a room whose data has an older format. Cancel, Escape,
// leaving Settings, closing the window and the start of catch-up close the block, and nothing is
// written. During catch-up the button waits, and the replica refuses a wipe as well.
export function useWipeActions({
  catchingUp,
  client,
  store,
}: WipeActionsOptions): WipeActionsParts {
  const [state, setState] = useState<WipeState>({ phase: 'idle', message: null, ask: 0 });
  const rejections = useStore(store.$rejections);
  const results = useStore(store.$wipeResults);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set on confirm: the button waits while the wipe does, so it takes the focus again after.
  const refocus = useRef(false);
  const { sendCommand } = client;
  const waitingId = state.phase === 'wiping' ? state.commandId : null;

  if (catchingUp && state.phase === 'asking') {
    setState({ phase: 'idle', message: null, ask: state.ask });
  }

  if (waitingId !== null) {
    const rejection = rejections.get(waitingId);

    if (rejection !== undefined) {
      setState({ phase: 'idle', message: wipeRejectionText(rejection.reason), ask: state.ask });
    } else if (results.has(waitingId)) {
      setState({ phase: 'idle', message: null, ask: state.ask });
    }
  }

  // With no answer in time the wipe may still have happened, and the room then shows it.
  useEffect(() => {
    if (waitingId === null) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setState((current) =>
        current.phase === 'wiping' && current.commandId === waitingId
          ? { phase: 'idle', message: copy.wipeFailed, ask: current.ask }
          : current,
      );
    }, TIMING.snapshotImportTimeoutMs);

    return () => {
      clearTimeout(timer);
    };
  }, [waitingId]);

  function backToButton(): void {
    buttonRef.current?.focus();
  }

  const confirmation =
    state.phase === 'asking' ? (
      <WipeConfirmation
        key={state.ask}
        onConfirm={() => {
          const sent = sendCommand({ type: 'wipe' });

          refocus.current = true;
          setState(
            sent.ok
              ? { phase: 'wiping', commandId: sent.value, ask: state.ask }
              : { phase: 'idle', message: copy.wipeFailed, ask: state.ask },
          );
          backToButton();
        }}
        onCancel={() => {
          setState({ phase: 'idle', message: null, ask: state.ask });
          backToButton();
        }}
      />
    ) : null;

  const reason = catchingUp || waitingId !== null ? copy.loading : undefined;
  const message = state.phase === 'idle' ? state.message : null;
  const buttonEnabled = reason === undefined;

  // The focus fell to the page while the button waited. It goes back once the button can take it,
  // unless the GM has put it somewhere since.
  useEffect(() => {
    if (state.phase !== 'idle' || !refocus.current || !buttonEnabled) {
      return;
    }

    refocus.current = false;

    if (document.activeElement === null || document.activeElement === document.body) {
      buttonRef.current?.focus();
    }
  }, [state.phase, buttonEnabled]);

  return {
    confirmation,
    action: (
      <div className="flex flex-col items-start gap-1">
        <Button
          ref={buttonRef}
          disabledReason={reason}
          onPress={() => {
            setState((current) => ({ phase: 'asking', ask: current.ask + 1 }));
          }}
        >
          {copy.command.wipe}
        </Button>
        <div aria-live="polite" className="text-label-sm text-danger-text">
          {message}
        </div>
      </div>
    ),
  };
}

// What the window says under "Очистить всё" for a refused wipe.
export function wipeRejectionText(reason: RejectionReason): string {
  switch (reason) {
    case 'not-allowed':
      return copy.wipeNotAllowed;
    case 'catching-up':
      return copy.loading;
    case 'importing':
      return copy.snapshotImporting;
    default:
      return copy.wipeFailed;
  }
}

type WipeConfirmationProps = { onConfirm: () => void; onCancel: () => void };

// UX-DR25: one block for the whole wipe, at the top of the content area, as the delete block is.
// The focus starts on "Отменить".
function WipeConfirmation({ onConfirm, onCancel }: WipeConfirmationProps): ReactNode {
  const textId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={textId}
      onKeyDown={handleKeyDown}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-bar p-2"
    >
      <p id={textId} className="min-w-[0] flex-1 text-text">
        {copy.wipeConfirmation}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onPress={onConfirm}>
          {copy.command.wipe}
        </Button>
        <Button autoFocus onPress={onCancel}>
          {copy.command.cancel}
        </Button>
      </div>
    </div>
  );
}
