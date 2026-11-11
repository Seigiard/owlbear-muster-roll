import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { TIMING } from '@/core/timing';
import type { CommandRejectedMessage, SnapshotResultMessage } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { downloadJsonFile } from '@/ui/download';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';
import { SnapshotConfirmation } from '@/ui/settings/snapshot-confirmation';
import { fileFailureText, snapshotRejectionText } from '@/ui/settings/snapshot-text';

const ACCEPTED_FILE_TYPES = ['.json', 'application/json'];

// AD-9, kept in this window only, so a window that closes, or a GM who leaves Settings, forgets it
// and writes nothing. `checking` waits for the count, `asking` shows the block, `importing` waits
// for the import. `ask` counts the questions, so a new count remounts the block and its focus goes
// to "Отменить" again. `digest` names the values and the sheets the GM was told about, so the
// import drops only those.
type ImportState =
  | { phase: 'idle'; message: string | null; ask: number }
  | { phase: 'checking'; data: string; requestId: string; ask: number }
  | { phase: 'asking'; data: string; count: number; sheets: number; digest: string; ask: number }
  | { phase: 'importing'; data: string; commandId: string; ask: number };

type SnapshotActionsOptions = {
  records: ReadonlyMap<string, VersionedRecord>;
  preset: Preset | null;
  catchingUp: boolean;
  client: Pick<ReplicaClient, 'sendCommand' | 'requestSnapshotCheck'>;
  store: Pick<ProjectionStore, '$rejections' | '$snapshotResults'>;
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
  store,
}: SnapshotActionsOptions): SnapshotActionsParts {
  const [state, setState] = useState<ImportState>({ phase: 'idle', message: null, ask: 0 });
  const rejections = useStore(store.$rejections);
  const results = useStore(store.$snapshotResults);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The ids whose answer was taken or given up on, so no answer settles a request twice.
  const settledIds = useRef(new Set<string>());
  // An import the window gave up on. It may still succeed, and then its message goes.
  const abandonedId = useRef<string | null>(null);
  const refocus = useRef(false);
  const { sendCommand, requestSnapshotCheck } = client;
  const waitingId = requestIdOf(state);

  if (catchingUp && state.phase === 'asking') {
    refocus.current = true;
    setState({ phase: 'idle', message: null, ask: state.ask });
  }

  const startImport = useCallback(
    (data: string, expectedDigest: string, ask: number): ImportState => {
      const sent = sendCommand({ type: 'snapshot-import', data, expectedDigest });

      return sent.ok
        ? { phase: 'importing', data, commandId: sent.value, ask }
        : { phase: 'idle', message: copy.badFile(copy.badFileReason.tooLarge), ask };
    },
    [sendCommand],
  );

  useEffect(() => {
    if (state.phase !== 'checking' && state.phase !== 'importing') {
      return;
    }

    const id = state.phase === 'checking' ? state.requestId : state.commandId;

    if (settledIds.current.has(id)) {
      return;
    }

    const next = settled(state, rejections.get(id), results.get(id));

    if (next !== state) {
      settledIds.current.add(id);
      setState(next);
    }
  }, [state, rejections, results]);

  const importWait = state.phase === 'importing';

  useEffect(() => {
    if (waitingId === null) {
      return undefined;
    }

    const timer = setTimeout(
      () => {
        settledIds.current.add(waitingId);

        if (importWait) {
          abandonedId.current = waitingId;
        }

        setState((current) =>
          requestIdOf(current) === waitingId
            ? {
                phase: 'idle',
                message: importWait ? copy.snapshotImportNoAnswer : copy.snapshotImportFailed,
                ask: current.ask,
              }
            : current,
        );
      },
      importWait ? TIMING.snapshotImportTimeoutMs : TIMING.presetRequestTimeoutMs,
    );

    return () => {
      clearTimeout(timer);
    };
  }, [waitingId, importWait]);

  // A late answer of an import given up on: it did replace the room, so the warning goes.
  useEffect(() => {
    const id = abandonedId.current;

    if (id === null || results.get(id)?.t !== 'snapshot-imported') {
      return;
    }

    abandonedId.current = null;
    setState((current) =>
      current.phase === 'idle' && current.message === copy.snapshotImportNoAnswer
        ? { phase: 'idle', message: null, ask: current.ask }
        : current,
    );
  }, [results]);

  async function choose(file: File): Promise<void> {
    setState((current) => ({ phase: 'idle', message: null, ask: current.ask }));

    const data = await readSnapshotFile(file);

    if (!data.ok) {
      setState((current) => ({ phase: 'idle', message: data.error, ask: current.ask }));

      return;
    }

    const requested = requestSnapshotCheck(data.value);

    setState((current) =>
      requested.ok
        ? { phase: 'checking', data: data.value, requestId: requested.value, ask: current.ask }
        : { phase: 'idle', message: copy.badFile(copy.badFileReason.tooLarge), ask: current.ask },
    );
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
          refocus.current = true;
          setState(startImport(state.data, state.digest, state.ask));
          backToButton();
        }}
        onCancel={() => {
          setState({ phase: 'idle', message: null, ask: state.ask });
          backToButton();
        }}
      />
    ) : null;

  const reason = snapshotDisabledReason(preset, catchingUp);
  // The download needs the preset, and its reason says so.
  const downloadPreset = reason === undefined ? preset : null;
  const importReason = reason ?? (waitingId === null ? undefined : copy.loading);
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

// The id of the request the window waits on, or `null`.
function requestIdOf(state: ImportState): string | null {
  if (state.phase === 'checking') {
    return state.requestId;
  }

  return state.phase === 'importing' ? state.commandId : null;
}

// What the answer to the check or the import leads to, or `state` itself while none has come.
function settled(
  state: Extract<ImportState, { phase: 'checking' | 'importing' }>,
  rejection: CommandRejectedMessage | undefined,
  result: SnapshotResultMessage | undefined,
): ImportState {
  if (rejection?.reason === 'count-changed') {
    return {
      phase: 'asking',
      data: state.data,
      count: rejection.count,
      sheets: rejection.sheets,
      digest: rejection.digest,
      ask: state.ask + 1,
    };
  }

  if (rejection !== undefined) {
    return { phase: 'idle', message: snapshotRejectionText(rejection.reason), ask: state.ask };
  }

  if (result?.t === 'snapshot-check-result' && state.phase === 'checking') {
    return {
      phase: 'asking',
      data: state.data,
      count: result.count,
      sheets: result.sheets,
      digest: result.digest,
      ask: state.ask + 1,
    };
  }

  if (result?.t === 'snapshot-imported') {
    return { phase: 'idle', message: null, ask: state.ask };
  }

  return state;
}
