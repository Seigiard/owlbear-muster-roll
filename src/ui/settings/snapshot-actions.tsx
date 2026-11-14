import { useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { FileTrigger } from 'react-aria-components';

import type { Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { encodeSnapshotFile, formatSnapshotFile, snapshotFileName } from '@/core/snapshot-file';
import {
  encodeSnapshotFileData,
  parseSnapshotFile,
  SNAPSHOT_FILE_BYTE_LIMIT,
} from '@/core/snapshot-import';
import { copy } from '@/copy';
import { downloadJsonFile } from '@/ui/download';
import { Button } from '@/ui/primitives/button';
import type { ReplicaClient } from '@/ui/replica-client';
import { SnapshotConfirmation } from '@/ui/settings/snapshot-confirmation';
import { initialSnapshotState, snapshotReducer } from '@/ui/settings/snapshot-actions-reducer';
import { fileFailureText } from '@/ui/settings/snapshot-text';

const ACCEPTED_FILE_TYPES = ['.json', 'application/json'];

type SnapshotActionsOptions = {
  records: ReadonlyMap<string, VersionedRecord>;
  preset: Preset | null;
  catchingUp: boolean;
  client: Pick<ReplicaClient, 'sendCommand' | 'requestSnapshotCheck'>;
};

type SnapshotActionsParts = {
  // The confirmation block, for the top of the content area, or `null` while none is open.
  confirmation: ReactNode;
  // "Скачать снимок" and "Загрузить снимок" with its message under it.
  actions: ReactNode;
};

// FR13, UX-DR23, UX-DR25, UX-DR30: "Скачать снимок" writes the file from the records this window
// holds and sends nothing to the replica. "Загрузить снимок" checks the file in the window, then
// the replica counts the values and the sheets the current preset would drop, and one block asks
// before anything is written. On confirm the replica counts again, and a different count asks
// again. Cancel, Escape, leaving Settings, closing the window and the start of catch-up close the
// block, and nothing is written. Both buttons wait during catch-up and need a preset.
export function useSnapshotActions({
  records,
  preset,
  catchingUp,
  client,
}: SnapshotActionsOptions): SnapshotActionsParts {
  const [state, dispatch] = useReducer(snapshotReducer, initialSnapshotState);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const { sendCommand, requestSnapshotCheck } = client;
  const waiting = state.phase === 'checking' || state.phase === 'importing';

  if (catchingUp && state.phase === 'asking') {
    refocus.current = true;
    dispatch({ type: 'catch-up-started' });
  }

  useEffect(() => {
    if (!waiting) {
      return;
    }

    const current = state;

    void current.outcome
      .then((outcome) => {
        dispatch({ type: 'outcome', state: current, request: current.outcome, result: outcome });
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a snapshot request', error);
      });
  }, [state, waiting]);

  async function choose(file: File): Promise<void> {
    dispatch({ type: 'reset' });

    const data = await readSnapshotFile(file);

    if (!data.ok) {
      dispatch({ type: 'file-error', message: data.error });

      return;
    }

    const requested = requestSnapshotCheck(data.value);

    dispatch({ type: 'check-requested', data: data.value, outcome: requested });
  }

  function backToButton(): void {
    buttonRef.current?.focus();
  }

  const confirmation =
    state.phase === 'asking' ? (
      <SnapshotConfirmation
        key={state.ask}
        count={state.count}
        sheets={state.sheets}
        onConfirm={() => {
          const sent = sendCommand({
            type: 'snapshot-import',
            data: state.data,
            expectedDigest: state.digest,
          });

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

  const reason = snapshotDisabledReason(preset, catchingUp);
  // The download needs the preset, and its reason says so.
  const downloadPreset = reason === undefined ? preset : null;
  const importReason = reason ?? (waiting ? copy.loading : undefined);
  const buttonEnabled = importReason === undefined;

  // The block closed while the button was disabled, so the focus fell to the page. It goes back
  // once the button can take it, unless the GM has put it somewhere since.
  useEffect(() => {
    if (state.phase !== 'idle' || !refocus.current || !buttonEnabled) {
      return;
    }

    refocus.current = false;

    if (document.activeElement === null || document.activeElement === document.body) {
      buttonRef.current?.focus();
    }
  }, [state.phase, buttonEnabled]);

  const importButton = (
    <Button ref={buttonRef} disabledReason={importReason}>
      {copy.command.loadSnapshot}
    </Button>
  );

  const message = state.phase === 'idle' ? state.message : null;

  return {
    confirmation,
    actions: (
      <>
        <Button
          variant="primary"
          disabledReason={reason}
          onPress={() => {
            if (downloadPreset === null) {
              return;
            }

            downloadJsonFile(
              snapshotFileName(new Date()),
              formatSnapshotFile(encodeSnapshotFile(records, downloadPreset)),
            );
          }}
        >
          {copy.command.downloadSnapshot}
        </Button>
        <div className="flex flex-col items-start gap-1">
          {importReason === undefined ? (
            <FileTrigger
              acceptedFileTypes={ACCEPTED_FILE_TYPES}
              onSelect={(files) => {
                const file = files?.[0];

                if (file !== undefined) {
                  choose(file).catch((error) => {
                    console.error('Muster Roll could not load a snapshot', error);
                  });
                }
              }}
            >
              {importButton}
            </FileTrigger>
          ) : (
            importButton
          )}
          <div aria-live="polite" className="text-label-sm text-danger-text">
            {message}
          </div>
        </div>
      </>
    ),
  };
}

// Catch-up comes first, as for the preset download.
function snapshotDisabledReason(preset: Preset | null, catchingUp: boolean): string | undefined {
  if (catchingUp) {
    return copy.loading;
  }

  return preset === null ? copy.presetRequired : undefined;
}

// The window's own checks of the file, then its data as the replica takes it.
async function readSnapshotFile(file: File): Promise<Result<string, string>> {
  // Checked before reading, so a huge file is never read into the window.
  if (file.size > SNAPSHOT_FILE_BYTE_LIMIT) {
    return err(copy.badFile(copy.badFileReason.tooLarge));
  }

  let text: string;

  // A file the browser cannot read cannot be JSON either.
  try {
    text = await file.text();
  } catch {
    return err(copy.badFile(copy.badFileReason.notJson));
  }

  const parsed = parseSnapshotFile(text);

  return parsed.ok ? ok(encodeSnapshotFileData(parsed.value)) : err(fileFailureText(parsed.error));
}
