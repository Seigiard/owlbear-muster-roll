import { useId } from 'react';
import type { ReactNode } from 'react';

import type { Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { RoomCopyStatus } from '@/core/ui-messages';
import { copy } from '@/ui/copy';
import { PresetDownload, uploadDisabledReason, usePresetUpload } from '@/ui/preset-actions';
import { SECONDARY_BUTTON_CLASS } from '@/ui/primitives/button';
import type { ReplicaClient } from '@/ui/replica-client';
import { roomCopyText } from '@/ui/settings/room-copy-text';
import { useSnapshotActions } from '@/ui/settings/snapshot-actions';
import { useWipeActions } from '@/ui/settings/wipe-actions';

// CAP-21: the preset builder, on the same origin as the window.
const BUILDER_PATH = '/builder.html';

type SettingsViewProps = {
  // The window's records, which "Скачать снимок" writes to the file.
  records: ReadonlyMap<string, VersionedRecord>;
  preset: Preset | null;
  catchingUp: boolean;
  roomCopy: RoomCopyStatus;
  client: Pick<ReplicaClient, 'sendCommand' | 'requestPresetDiff' | 'requestSnapshotCheck'>;
};

// Sections come in the order Пресет, Снимок, Копия в комнате, Очистка. In each section the first
// action is the primary one: the upload under Пресет, the download under Снимок. A confirmation
// block comes before every section, at the top of the content area, and closes when the GM leaves
// Settings.
export function SettingsView({
  records,
  preset,
  catchingUp,
  roomCopy,
  client,
}: SettingsViewProps): ReactNode {
  const headingId = useId();
  const snapshotHeadingId = useId();
  const roomCopyHeadingId = useId();
  const wipeHeadingId = useId();
  const builderHintId = useId();

  const { confirmation, upload } = usePresetUpload({
    client,
    catchingUp,
    disabledReason: uploadDisabledReason(catchingUp),
  });

  const snapshot = useSnapshotActions({ records, preset, catchingUp, client });
  const wipe = useWipeActions({ catchingUp, client });

  return (
    <div className="flex flex-col gap-4">
      {confirmation}
      {snapshot.confirmation}
      {wipe.confirmation}
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <h2 id={headingId} className="text-section-heading">
          {copy.section.preset}
        </h2>
        <div className="flex flex-wrap items-start gap-2">
          {upload}
          <PresetDownload preset={preset} catchingUp={catchingUp} />
        </div>
        <div className="flex flex-col items-start gap-1">
          {/* AD-20: a plain link. The builder and the room exchange a preset by file only. */}
          <a
            href={BUILDER_PATH}
            target="_blank"
            rel="noopener"
            aria-describedby={builderHintId}
            className={SECONDARY_BUTTON_CLASS}
          >
            {copy.builder.settingsLink}
          </a>
          <span id={builderHintId} className="text-label-sm text-text-muted">
            {copy.builder.settingsHint}
          </span>
        </div>
      </section>
      <section aria-labelledby={snapshotHeadingId} className="flex flex-col gap-2">
        <h2 id={snapshotHeadingId} className="text-section-heading">
          {copy.section.snapshot}
        </h2>
        <div className="flex flex-wrap items-start gap-2">{snapshot.actions}</div>
      </section>
      <section aria-labelledby={roomCopyHeadingId} className="flex flex-col gap-2">
        <h2 id={roomCopyHeadingId} className="text-section-heading">
          {copy.section.roomCopy}
        </h2>
        <p>{roomCopyText(roomCopy)}</p>
      </section>
      <section aria-labelledby={wipeHeadingId} className="flex flex-col gap-2">
        <h2 id={wipeHeadingId} className="text-section-heading">
          {copy.section.wipe}
        </h2>
        <div className="flex flex-wrap items-start gap-2">{wipe.action}</div>
      </section>
    </div>
  );
}
