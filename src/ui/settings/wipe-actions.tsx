import { useEffect, useId, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { copy } from '@/copy';
import { Button } from '@/ui/primitives/button';
import type { ReplicaClient } from '@/ui/replica-client';

import { initialWipeState, wipeReducer } from './wipe-actions-reducer';

export { wipeRejectionText } from './wipe-actions-reducer';

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
  const [state, dispatch] = useReducer(wipeReducer, initialWipeState);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set on confirm: the button waits while the wipe does, so it takes the focus again after.
  const refocus = useRef(false);
  const { sendCommand } = client;
  const waiting = state.phase === 'wiping';

  // The catch-up state this render last saw, so its end clears a message that only held during it.
  const [seenCatchingUp, setSeenCatchingUp] = useState(catchingUp);

  if (catchingUp && state.phase === 'asking') {
    dispatch({ type: 'catch-up-started' });
  }

  if (catchingUp !== seenCatchingUp) {
    setSeenCatchingUp(catchingUp);

    if (!catchingUp && state.phase === 'idle' && state.untilCatchUpEnds) {
      dispatch({ type: 'catch-up-ended' });
    }
  }

  useEffect(() => {
    if (!waiting) {
      return;
    }

    const current = state;

    void current.outcome
      .then((outcome) => {
        dispatch({ type: 'outcome', request: current.outcome, result: outcome });
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
          dispatch({ type: 'confirm', outcome: sent });
          backToButton();
        }}
        onCancel={() => {
          dispatch({ type: 'cancel' });
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
            dispatch({ type: 'ask', catchingUp });
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

type WipeConfirmationProps = { onConfirm: () => void; onCancel: () => void };

// UX-DR25: one block for the whole wipe, at the top of the content area, as the delete block is.
// The focus starts on "Отменить".
function WipeConfirmation({ onConfirm, onCancel }: WipeConfirmationProps): ReactNode {
  const textId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLFieldSetElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape cancels from any focused control in this confirmation.
    <fieldset
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
        <Button focusOnMount onPress={onCancel}>
          {copy.command.cancel}
        </Button>
      </div>
    </fieldset>
  );
}
