import { useCallback, useEffect, useRef, useState } from 'react';
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
import { presetFailureMessage, presetRejectionMessage } from '@/ui/preset-errors';
import { Button } from '@/ui/primitives/button';
import type {
  CommandOutcome,
  CommandOutcomePromise,
  ErasedCounts,
  ReplicaClient,
} from '@/ui/replica-client';
import { PresetConfirmation } from '@/ui/settings/preset-confirmation';

const PRESET_FILE_NAME = 'muster-roll-preset.json';

const ACCEPTED_FILE_TYPES = ['.json', 'application/json'];

// What the window says under the button: a file error or refusal, or the result of an upload. It
// stays until the next attempt.
type UploadMessage = { text: string; tone: 'error' | 'result' };

// AD-14, kept in this window only, so a window that closes forgets it and writes nothing. The new
// preset's data stays here while the GM decides; other windows see nothing until the batch commits.
// `diffing` waits for the counts, `asking` shows the block, `uploading` waits for the batch. `ask`
// counts the questions, so a new count remounts the block and its focus goes to "Отменить" again.
// `loss` names the values and the sheets the GM was asked about, so the upload erases only those.
type UploadState =
  | { phase: 'idle'; message: UploadMessage | null; ask: number }
  | { phase: 'diffing'; data: string; outcome: Promise<CommandOutcome<ErasedCounts>>; ask: number }
  | { phase: 'asking'; data: string; loss: Loss; ask: number }
  | {
      phase: 'uploading';
      data: string;
      outcome: CommandOutcomePromise<{ count: number; sheets: number }>;
      ask: number;
    };

// AD-14: the stored values an upload erases and the sheets it deletes, and their digest.
type Loss = { count: number; sheets: number; digest: string };

// What an answer to a request leads to: a new state, or an upload to send.
type Settled = UploadState | { phase: 'send'; data: string; digest: string; ask: number };

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
  const [state, setState] = useState<UploadState>({ phase: 'idle', message: null, ask: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set on confirm: the button the focus went back to waits, so it takes the focus again after.
  const refocus = useRef(false);
  const { sendCommand, requestPresetDiff } = client;
  const waiting = state.phase === 'diffing' || state.phase === 'uploading';

  if (catchingUp && state.phase === 'asking') {
    setState({ phase: 'idle', message: null, ask: state.ask });
  }

  const upload = useCallback(
    (
      data: string,
      expected: { count: number; sheets: number },
      expectedDigest: string,
      ask: number,
    ): UploadState => {
      const sent = sendCommand({
        type: 'preset-upload',
        data,
        expectedCount: expected.count,
        expectedSheets: expected.sheets,
        expectedDigest,
      });

      return { phase: 'uploading', data, outcome: sent, ask };
    },
    [sendCommand],
  );

  // Resolve the request before starting an upload, so the send never runs inside a state updater.
  useEffect(() => {
    if (!waiting) {
      return;
    }

    const current = state;
    let active = true;

    void current.outcome
      .then((outcome) => {
        if (!active) {
          return;
        }

        const next = settled(current, outcome);

        const replacement =
          next.phase === 'send' ? upload(next.data, NO_LOSS, next.digest, next.ask) : next;

        setState((shown) => (shown === current ? replacement : shown));
      })
      .catch((error) => {
        console.error('Muster Roll could not settle a preset request', error);
      });

    return () => {
      active = false;
    };
  }, [state, upload, waiting]);

  useEffect(() => {
    if (state.phase === 'idle' && refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [state.phase]);

  async function choose(file: File): Promise<void> {
    setState((current) => ({ phase: 'idle', message: null, ask: current.ask }));

    const data = await readPreset(file);

    if (!data.ok) {
      setState((current) => ({
        phase: 'idle',
        message: errorMessage(data.error),
        ask: current.ask,
      }));

      return;
    }

    const requested = requestPresetDiff(data.value);

    setState((current) => ({
      phase: 'diffing',
      data: data.value,
      outcome: requested,
      ask: current.ask,
    }));
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
          refocus.current = true;
          setState(upload(state.data, state.loss, state.loss.digest, state.ask));
          backToButton();
        }}
        onCancel={() => {
          setState({ phase: 'idle', message: null, ask: state.ask });
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
          className={`text-label-sm ${message?.tone === 'result' ? 'text-text' : 'text-danger-text'}`}
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

// What the answer to the diff or the upload leads to.
function settled(
  state: Extract<UploadState, { phase: 'diffing' | 'uploading' }>,
  outcome: CommandOutcome<ErasedCounts | { count: number; sheets: number }>,
): Settled {
  if (outcome.kind === 'timed-out') {
    return { phase: 'idle', message: errorMessage(copy.presetWriteFailed), ask: state.ask };
  }

  if (outcome.kind === 'refused' && outcome.rejection.reason === 'count-changed') {
    return {
      phase: 'asking',
      data: state.data,
      loss: {
        count: outcome.rejection.count,
        sheets: outcome.rejection.sheets,
        digest: outcome.rejection.digest,
      },
      ask: state.ask + 1,
    };
  }

  if (outcome.kind === 'refused') {
    const text = presetRejectionMessage(outcome.rejection.reason);

    return { phase: 'idle', message: text === null ? null : errorMessage(text), ask: state.ask };
  }

  if (outcome.kind === 'answered' && state.phase === 'diffing') {
    const answer = outcome.answer;

    if (answer === undefined || !('digest' in answer)) {
      return { phase: 'idle', message: errorMessage(copy.presetWriteFailed), ask: state.ask };
    }

    return answer.count === 0 && answer.sheets === 0
      ? { phase: 'send', data: state.data, digest: answer.digest, ask: state.ask }
      : {
          phase: 'asking',
          data: state.data,
          loss: {
            count: answer.count,
            sheets: answer.sheets,
            digest: answer.digest,
          },
          ask: state.ask + 1,
        };
  }

  if (outcome.kind === 'answered' && state.phase === 'uploading') {
    return {
      phase: 'idle',
      message: { text: copy.presetUploadRemovesNothing, tone: 'result' },
      ask: state.ask,
    };
  }

  return state;
}

function errorMessage(text: string): UploadMessage {
  return { text, tone: 'error' };
}

function tooLargeText(): string {
  return copy.badFile(copy.badFileReason.tooLarge);
}
