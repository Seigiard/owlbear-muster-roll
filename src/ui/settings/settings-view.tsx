import { useId } from 'react';
import type { ReactNode } from 'react';

import type { Preset } from '@/core/preset';
import type { RoomCopyStatus } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { PresetDownload, PresetUpload, uploadDisabledReason } from '@/ui/preset-actions';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';
import { roomCopyText } from '@/ui/settings/room-copy-text';

type SettingsViewProps = {
  preset: Preset | null;
  sheetsExist: boolean;
  catchingUp: boolean;
  roomCopy: RoomCopyStatus;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections'>;
};

// Sections come in the order Пресет, Снимок, Копия в комнате. Story 5.2 adds Снимок.
// In each section the upload action comes first and is the primary one.
export function SettingsView({
  preset,
  sheetsExist,
  catchingUp,
  roomCopy,
  sendCommand,
  store,
}: SettingsViewProps): ReactNode {
  const headingId = useId();
  const roomCopyHeadingId = useId();

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <h2 id={headingId} className="text-section-heading">
          {copy.section.preset}
        </h2>
        <div className="flex flex-wrap items-start gap-2">
          <PresetUpload
            sendCommand={sendCommand}
            store={store}
            disabledReason={uploadDisabledReason(catchingUp, sheetsExist)}
          />
          <PresetDownload preset={preset} catchingUp={catchingUp} />
        </div>
      </section>
      <section aria-labelledby={roomCopyHeadingId} className="flex flex-col gap-2">
        <h2 id={roomCopyHeadingId} className="text-section-heading">
          {copy.section.roomCopy}
        </h2>
        <p>{roomCopyText(roomCopy)}</p>
      </section>
    </div>
  );
}
