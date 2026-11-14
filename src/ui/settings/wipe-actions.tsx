import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import type { RejectionReason } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { Button } from '@/ui/primitives/button';
import type { CommandOutcomePromise, ReplicaClient } from '@/ui/replica-client';

// AD-9, kept in this window only, so a window that closes, or a GM who leaves Settings, forgets it
// and writes nothing. `asking` shows the block, `wiping` waits for the answer. `ask` counts the
// questions, so a new one remounts the block and its focus goes to "Отменить" again.
// `untilCatchUpEnds` marks a message that holds only while catch-up runs, so its end clears it.
type WipeState =
  | { phase: 'idle'; message: string | null; untilCatchUpEnds?: boolean; ask: number }
  | { phase: 'asking'; ask: number }
  | { phase: 'wiping'; outcome: CommandOutcomePromise<undefined>; ask: number };

type WipeActionsOptions = {
  catchingUp: boolean;
  client: Pick<ReplicaClient, 'sendCommand'>;
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
export function useWipeActions({ catchingUp, client }: WipeActionsOptions): WipeActionsParts {
  const [state, setState] = useState<WipeState>({ phase: 'idle', message: null, ask: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set on confirm: the button waits while the wipe does, so it takes the focus again after.
  const refocus = useRef(false);
  const { sendCommand } = client;
  const waiting = state.phase === 'wiping';

  // The catch-up state this render last saw, so its end clears a message that only held during it.
  const [seenCatchingUp, setSeenCatchingUp] = useState(catchingUp);

  if (catchingUp && state.phase === 'asking') {
    setState({ phase: 'idle', message: null, ask: state.ask });
  }

  if (catchingUp !== seenCatchingUp) {
    setSeenCatchingUp(catchingUp);

    if (!catchingUp && state.phase === 'idle' && state.untilCatchUpEnds) {
      setState({ phase: 'idle', message: null, ask: state.ask });
    }
  }

  useEffect(() => {
    if (!waiting) {
      return;
    }

    const current = state;

    void current.outcome
      .then((outcome) => {
        setState((shown) => {
          if (shown !== current) {
            return shown;
          }

          if (outcome.kind === 'answered') {
            return { phase: 'idle', message: null, ask: current.ask };
          }

          if (outcome.kind === 'timed-out') {
            return { phase: 'idle', message: copy.wipeFailed, ask: current.ask };
          }

          return {
            phase: 'idle',
            message: wipeRejectionText(outcome.rejection.reason),
            untilCatchUpEnds: outcome.rejection.reason === 'catching-up',
            ask: current.ask,
          };
        });
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a wipe', error);
      });
  }, [state, waiting]);

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
          setState({ phase: 'wiping', outcome: sent, ask: state.ask });
          backToButton();
        }}
        onCancel={() => {
          setState({ phase: 'idle', message: null, ask: state.ask });
          backToButton();
        }}
      />
    ) : null;

  const reason = catchingUp || waiting ? copy.loading : undefined;
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

// What the window says under "Очистить всё" for a refused wipe. A reason no case names, such as a
// failed write, is a failed wipe.
export function wipeRejectionText(reason: RejectionReason): string {
  switch (reason) {
    case 'not-allowed':
      return copy.wipeNotAllowed;
    case 'catching-up':
      return copy.loading;
    case 'importing':
      return copy.wipeAfterImport;
    case 'data-replaced':
      return copy.snapshotDataReplaced;
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
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface-raised p-2"
    >
      <p id={textId} className="min-w-0 flex-1 text-text">
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
