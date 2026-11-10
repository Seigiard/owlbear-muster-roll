import { useId } from 'react';
import type { ReactNode } from 'react';

import type { Preset } from '@/core/preset';
import { copy } from '@/ui/copy';
import { PresetDownload, PresetUpload, uploadDisabledReason } from '@/ui/preset-actions';
import type { ProjectionStore } from '@/ui/projection-store';
import type { ReplicaClient } from '@/ui/replica-client';

type SettingsViewProps = {
  preset: Preset | null;
  sheetsExist: boolean;
  catchingUp: boolean;
  sendCommand: ReplicaClient['sendCommand'];
  store: Pick<ProjectionStore, '$rejections'>;
};

// Sections come in the order Пресет, Снимок, Копия в комнате. Later stories add the other two.
// In each section the upload action comes first and is the primary one.
export function SettingsView({
  preset,
  sheetsExist,
  catchingUp,
  sendCommand,
  store,
}: SettingsViewProps): ReactNode {
  const headingId = useId();

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
    </div>
  );
}
