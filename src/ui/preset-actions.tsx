import clsx from 'clsx';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { FileTrigger } from 'react-aria-components';

import {
  encodePreset,
  formatPresetFile,
  parsePresetFile,
  PRESET_FILE_BYTE_LIMIT,
  type Preset,
} from '@/core/preset';
import { err, ok, type Result } from '@/core/result';
import { copy } from '@/ui/copy';
import { downloadJsonFile } from '@/ui/download';
import { presetFailureMessage } from '@/ui/preset-errors';
import { Button } from '@/ui/primitives/button';
import type { ReplicaClient } from '@/ui/replica-client';
import {
  initialUploadState,
  presetUploadReducer,
  type UploadState,
} from '@/ui/preset-upload-reducer';
import { PresetConfirmation } from '@/ui/settings/preset-confirmation';

const PRESET_FILE_NAME = 'muster-roll-preset.json';

const ACCEPTED_FILE_TYPES = ['.json', 'application/json'];

const NO_LOSS = { count: 0, sheets: 0 } as const;

type PresetUploadOptions = {
  client: Pick<ReplicaClient, 'sendCommand' | 'requestPresetDiff'>;
  catchingUp: boolean;
  disabledReason?: string;
};

type PresetUploadParts = {
  // The confirmation block, for the top of the content area, or `null` while none is open.
  confirmation: ReactNode;
  // "Загрузить пресет" with its message under it.
  upload: ReactNode;
};

// FR8, AD-14: a file goes through the window's checks, then the replica counts the stored values it
// would erase and the sheets it would delete. With none it is uploaded at once. With some, one
// block asks first. On confirm the replica counts again: new counts above 0 ask again, and counts
// of 0 take the path that erases nothing. "Формат листов изменён." shows after either upload.
// Catch-up closes the block, and nothing is written. While a request waits the button waits too;
// with no answer in time it gives up, and a late answer is ignored.
export function usePresetUpload({
  client,
  catchingUp,
  disabledReason,
}: PresetUploadOptions): PresetUploadParts {
  const [state, dispatch] = useReducer(presetUploadReducer, initialUploadState);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set on confirm: the button the focus went back to waits, so it takes the focus again after.
  const refocus = useRef(false);
  // The zero-loss state is rendered before this effect sends its command. Keep its identity so
  // Strict Mode effect replay cannot send the same preset twice.
  const sentZeroLoss = useRef<Extract<UploadState, { phase: 'send' }> | null>(null);
  const { sendCommand, requestPresetDiff } = client;

  const waiting =
    state.phase === 'diffing' || state.phase === 'send' || state.phase === 'uploading';

  if (catchingUp && state.phase === 'asking') {
    dispatch({ type: 'catch-up-started' });
  }

  const sendUpload = useCallback(
    (data: string, expected: { count: number; sheets: number }, expectedDigest: string) =>
      sendCommand({
        type: 'preset-upload',
        data,
        expectedCount: expected.count,
        expectedSheets: expected.sheets,
        expectedDigest,
      }),
    [sendCommand],
  );

  // Resolve the request before starting an upload, so the send never runs inside a state updater.
  useEffect(() => {
    if (state.phase !== 'diffing' && state.phase !== 'uploading') {
      return;
    }

    const current = state;
    let active = true;

    void current.outcome
      .then((outcome) => {
        if (!active) {
          return;
        }

        dispatch({ type: 'outcome', request: current.outcome, result: outcome });
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a preset request', error);
      });

    return () => {
      active = false;
    };
  }, [state, waiting]);

  useEffect(() => {
    if (state.phase !== 'send') {
      sentZeroLoss.current = null;

      return;
    }

    if (sentZeroLoss.current === state) {
      return;
    }

    const current = state;
    sentZeroLoss.current = current;
    dispatch({
      type: 'send-started',
      outcome: sendUpload(current.data, NO_LOSS, current.digest),
    });
  }, [sendUpload, state]);

  useEffect(() => {
    if (state.phase === 'idle' && refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [state.phase]);

  async function choose(file: File): Promise<void> {
    dispatch({ type: 'reset' });

    const data = await readPreset(file);

    if (!data.ok) {
      dispatch({ type: 'file-error', message: data.error });

      return;
    }

    const requested = requestPresetDiff(data.value);

    dispatch({ type: 'diff-requested', data: data.value, outcome: requested });
  }

  function backToButton(): void {
    buttonRef.current?.focus();
  }

  const confirmation =
    state.phase === 'asking' ? (
      <PresetConfirmation
        key={state.ask}
        count={state.loss.count}
        sheets={state.loss.sheets}
        onConfirm={() => {
          const sent = sendUpload(state.data, state.loss, state.loss.digest);

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

  const waitingReason = waiting ? copy.loading : undefined;
  const reason = disabledReason ?? waitingReason;

  const button = (
    <Button ref={buttonRef} variant="primary" disabledReason={reason}>
      {copy.command.loadPreset}
    </Button>
  );

  const message = state.phase === 'idle' ? state.message : null;

  return {
    confirmation,
    upload: (
      <div className="flex flex-col items-start gap-1">
        {reason === undefined ? (
          <FileTrigger
            acceptedFileTypes={ACCEPTED_FILE_TYPES}
            onSelect={(files) => {
              const file = files?.[0];

              if (file !== undefined) {
                choose(file).catch((error) => {
                  console.error('Muster Roll could not upload a preset', error);
                });
              }
            }}
          >
            {button}
          </FileTrigger>
        ) : (
          button
        )}
        <div
          aria-live="polite"
          className={clsx('text-label-sm', {
            'text-text': message?.tone === 'result',
            'text-danger-text': message?.tone !== 'result',
          })}
        >
          {message?.text}
        </div>
      </div>
    ),
  };
}

// The upload alone, for a window with no preset: its block, if one opens, comes first.
export function PresetUpload(props: PresetUploadOptions): ReactNode {
  const { confirmation, upload } = usePresetUpload(props);

  return (
    <>
      {confirmation}
      {upload}
    </>
  );
}

// UX-DR30: during catch-up the upload waits, and the replica refuses it as well.
export function uploadDisabledReason(catchingUp: boolean): string | undefined {
  return catchingUp ? copy.loading : undefined;
}

type PresetDownloadProps = { preset: Preset | null; catchingUp: boolean };

export function PresetDownload({ preset, catchingUp }: PresetDownloadProps): ReactNode {
  if (catchingUp) {
    return <Button disabledReason={copy.loading}>{copy.command.downloadPreset}</Button>;
  }

  if (preset === null) {
    return <Button disabledReason={copy.presetRequired}>{copy.command.downloadPreset}</Button>;
  }

  return (
    <Button
      onPress={() => {
        downloadJsonFile(PRESET_FILE_NAME, formatPresetFile(preset));
      }}
    >
      {copy.command.downloadPreset}
    </Button>
  );
}

// The window's own checks of the file, then its data as the replica takes it.
async function readPreset(file: File): Promise<Result<string, string>> {
  // Checked before reading, so a huge file is never read into the window.
  if (file.size > PRESET_FILE_BYTE_LIMIT) {
    return err(tooLargeText());
  }

  let text: string;

  // A file the browser cannot read cannot be JSON either.
  try {
    text = await file.text();
  } catch {
    return err(copy.badFile(copy.badFileReason.notJson));
  }

  const parsed = parsePresetFile(text);

  return parsed.ok ? ok(encodePreset(parsed.value)) : err(presetFailureMessage(parsed.error));
}

function tooLargeText(): string {
  return copy.badFile(copy.badFileReason.tooLarge);
}
