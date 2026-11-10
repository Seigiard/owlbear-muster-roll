import { useStore } from '@nanostores/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { FileTrigger } from 'react-aria-components';

import {
  encodePreset,
  formatPresetFile,
  parsePresetFile,
  PRESET_FILE_BYTE_LIMIT,
  type Preset,
} from '@/core/preset';
import type { CommandRejectedMessage } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { downloadJsonFile } from '@/ui/download';
import { presetFailureMessage, presetRejectionMessage } from '@/ui/preset-errors';
import { Button } from '@/ui/primitives/button';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

const PRESET_FILE_NAME = 'muster-roll-preset.json';

const ACCEPTED_FILE_TYPES = ['.json', 'application/json'];

// A file error stays until the next attempt. The command id ties a later rejection to this attempt.
type UploadAttempt = { error: string | null; commandId: string | null };

const NO_ATTEMPT: UploadAttempt = { error: null, commandId: null };

type PresetUploadProps = {
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections'>;
  disabledReason?: string;
};

export function PresetUpload({ sendCommand, store, disabledReason }: PresetUploadProps): ReactNode {
  const [attempt, setAttempt] = useState<UploadAttempt>(NO_ATTEMPT);
  const rejections = useStore(store.$rejections);
  const rejection = attempt.commandId === null ? undefined : rejections.get(attempt.commandId);
  const message = attempt.error ?? rejectionMessageFor(attempt, rejection);

  async function upload(file: File): Promise<void> {
    setAttempt(NO_ATTEMPT);
    setAttempt(await sendPreset(file, sendCommand));
  }

  const button = (
    <Button variant="primary" disabledReason={disabledReason}>
      {copy.command.loadPreset}
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-1">
      {disabledReason === undefined ? (
        <FileTrigger
          acceptedFileTypes={ACCEPTED_FILE_TYPES}
          onSelect={(files) => {
            const file = files?.[0];

            if (file !== undefined) {
              upload(file).catch((error) => {
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
      <div aria-live="polite" className="text-label-sm text-danger-text">
        {message}
      </div>
    </div>
  );
}

// UX-DR30: during catch-up the upload waits, and the replica refuses it as well.
export function uploadDisabledReason(
  catchingUp: boolean,
  sheetsExist: boolean,
): string | undefined {
  if (catchingUp) {
    return copy.loading;
  }

  return sheetsExist ? copy.presetLocked : undefined;
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

async function sendPreset(
  file: File,
  sendCommand: ReplicaClient['sendCommand'],
): Promise<UploadAttempt> {
  const tooLarge = copy.badFile(copy.badFileReason.tooLarge);

  // Checked before reading, so a huge file is never read into the window.
  if (file.size > PRESET_FILE_BYTE_LIMIT) {
    return { error: tooLarge, commandId: null };
  }

  let text: string;

  // A file the browser cannot read cannot be JSON either.
  try {
    text = await file.text();
  } catch {
    return { error: copy.badFile(copy.badFileReason.notJson), commandId: null };
  }

  const parsed = parsePresetFile(text);

  if (!parsed.ok) {
    return { error: presetFailureMessage(parsed.error), commandId: null };
  }

  const sent = sendCommand({ type: 'preset-upload', data: encodePreset(parsed.value) });

  return sent.ok ? { error: null, commandId: sent.value } : { error: tooLarge, commandId: null };
}

function rejectionMessageFor(
  attempt: UploadAttempt,
  rejection: CommandRejectedMessage | undefined,
): string | null {
  if (rejection === undefined || rejection.id !== attempt.commandId) {
    return null;
  }

  return presetRejectionMessage(rejection.reason);
}
