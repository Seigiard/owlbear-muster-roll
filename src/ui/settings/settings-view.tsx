import { useId } from 'react';
import type { ReactNode } from 'react';

import type { Preset } from '@/core/preset';
import type { RoomCopyStatus } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { PresetDownload, uploadDisabledReason, usePresetUpload } from '@/ui/preset-actions';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';
import { roomCopyText } from '@/ui/settings/room-copy-text';

type SettingsViewProps = {
  preset: Preset | null;
  catchingUp: boolean;
  roomCopy: RoomCopyStatus;
  client: Pick<ReplicaClient, 'sendCommand' | 'requestPresetDiff'>;
  store: Pick<ProjectionStore, '$rejections' | '$presetResults'>;
};

// Sections come in the order Пресет, Снимок, Копия в комнате. Story 5.2 adds Снимок.
// In each section the upload action comes first and is the primary one. A confirmation block
// comes before every section, at the top of the content area.
export function SettingsView({
  preset,
  catchingUp,
  roomCopy,
  client,
  store,
}: SettingsViewProps): ReactNode {
  const headingId = useId();
  const roomCopyHeadingId = useId();

  const { confirmation, upload } = usePresetUpload({
    client,
    store,
    catchingUp,
    disabledReason: uploadDisabledReason(catchingUp),
  });

  return (
    <div className="flex flex-col gap-4">
      {confirmation}
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <h2 id={headingId} className="text-section-heading">
          {copy.section.preset}
        </h2>
        <div className="flex flex-wrap items-start gap-2">
          {upload}
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
