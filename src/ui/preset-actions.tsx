import { useStore } from '@nanostores/react';
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
import { TIMING } from '@/core/timing';
import type { CommandRejectedMessage, PresetResultMessage } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { downloadJsonFile } from '@/ui/download';
import { presetFailureMessage, presetRejectionMessage } from '@/ui/preset-errors';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';
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
  | { phase: 'diffing'; data: string; requestId: string; ask: number }
  | { phase: 'asking'; data: string; loss: Loss; ask: number }
  | { phase: 'uploading'; data: string; commandId: string; ask: number };

// AD-14: the stored values an upload erases and the sheets it deletes, and their digest.
type Loss = { count: number; sheets: number; digest: string };

// What an answer to a request leads to: a new state, or an upload to send.
type Settled = UploadState | { phase: 'send'; data: string; digest: string; ask: number };

const NO_LOSS = { count: 0, sheets: 0 } as const;

type PresetUploadOptions = {
  client: Pick<ReplicaClient, 'sendCommand' | 'requestPresetDiff'>;
  store: Pick<ProjectionStore, '$rejections' | '$presetResults'>;
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
  store,
  catchingUp,
  disabledReason,
}: PresetUploadOptions): PresetUploadParts {
  const [state, setState] = useState<UploadState>({ phase: 'idle', message: null, ask: 0 });
  const rejections = useStore(store.$rejections);
  const results = useStore(store.$presetResults);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The ids whose answer was taken or given up on, so no answer settles a request twice.
  const settledIds = useRef(new Set<string>());
  // Set on confirm: the button the focus went back to waits, so it takes the focus again after.
  const refocus = useRef(false);
  const { sendCommand, requestPresetDiff } = client;
  const waitingId = requestIdOf(state);

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

      return sent.ok
        ? { phase: 'uploading', data, commandId: sent.value, ask }
        : { phase: 'idle', message: errorMessage(tooLargeText()), ask };
    },
    [sendCommand],
  );

  // The send happens here, once per request id, never while a state is computed.
  useEffect(() => {
    if (state.phase !== 'diffing' && state.phase !== 'uploading') {
      return;
    }

    const id = state.phase === 'diffing' ? state.requestId : state.commandId;

    if (settledIds.current.has(id)) {
      return;
    }

    const next = settled(state, rejections.get(id), results.get(id));

    if (next === state) {
      return;
    }

    settledIds.current.add(id);
    setState(next.phase === 'send' ? upload(next.data, NO_LOSS, next.digest, next.ask) : next);
  }, [state, rejections, results, upload]);

  useEffect(() => {
    if (waitingId === null) {
      return undefined;
    }

    const timer = setTimeout(() => {
      settledIds.current.add(waitingId);
      setState((current) =>
        requestIdOf(current) === waitingId
          ? { phase: 'idle', message: errorMessage(copy.presetWriteFailed), ask: current.ask }
          : current,
      );
    }, TIMING.presetRequestTimeoutMs);

    return () => {
      clearTimeout(timer);
    };
  }, [waitingId]);

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

    setState((current) =>
      requested.ok
        ? { phase: 'diffing', data: data.value, requestId: requested.value, ask: current.ask }
        : { phase: 'idle', message: errorMessage(tooLargeText()), ask: current.ask },
    );
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

  const waitingReason = waitingId === null ? undefined : copy.loading;
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

// The id of the request the window waits on, or `null`.
function requestIdOf(state: UploadState): string | null {
  if (state.phase === 'diffing') {
    return state.requestId;
  }

  return state.phase === 'uploading' ? state.commandId : null;
}

// What the answer to the diff or the upload leads to, or `state` itself while none has come.
function settled(
  state: Extract<UploadState, { phase: 'diffing' | 'uploading' }>,
  rejection: CommandRejectedMessage | undefined,
  result: PresetResultMessage | undefined,
): Settled {
  if (rejection?.reason === 'count-changed') {
    return {
      phase: 'asking',
      data: state.data,
      loss: { count: rejection.count, sheets: rejection.sheets, digest: rejection.digest },
      ask: state.ask + 1,
    };
  }

  if (rejection !== undefined) {
    const text = presetRejectionMessage(rejection.reason);

    return { phase: 'idle', message: text === null ? null : errorMessage(text), ask: state.ask };
  }

  if (result?.t === 'preset-diff-result' && state.phase === 'diffing') {
    return result.count === 0 && result.sheets === 0
      ? { phase: 'send', data: state.data, digest: result.digest, ask: state.ask }
      : {
          phase: 'asking',
          data: state.data,
          loss: { count: result.count, sheets: result.sheets, digest: result.digest },
          ask: state.ask + 1,
        };
  }

  if (result?.t === 'preset-uploaded') {
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
