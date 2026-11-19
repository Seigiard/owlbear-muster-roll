import { useStore } from '@nanostores/react';
import { useMemo } from 'react';

import { decodePreset, type Preset } from '@/core/preset';
import { presetDataSchema, type VersionedRecord } from '@/core/records';
import { liveLinks } from '@/core/token-links';
import type { LiveLinkTarget } from '@/core/link-target';
import type { PlayerRole } from '@/core/visibility';
import { visibleRecordMap } from '@/core/visibility';
import type { ProjectionStore } from '@/ui/projection-store';

export type WindowView = {
  role: PlayerRole;
  preset: Preset | null;
  records: ReadonlyMap<string, VersionedRecord>;
  links: ReadonlyMap<string, LiveLinkTarget>;
};

type WindowViewStore = Pick<ProjectionStore, '$loaded' | '$records' | '$sync'>;

export function useWindowView(store: WindowViewStore, initialRole: PlayerRole): WindowView {
  const loaded = useStore(store.$loaded);
  const records = useStore(store.$records);
  const sync = useStore(store.$sync);
  const role = loaded ? sync.role : initialRole;
  const presetData = presetDataOf(records);
  const preset = useMemo(() => decodedPreset(presetData), [presetData]);

  return useMemo(() => windowViewOf(role, preset, records), [role, preset, records]);
}

export function windowViewOf(
  role: PlayerRole,
  preset: Preset | null,
  records: ReadonlyMap<string, VersionedRecord>,
): WindowView {
  const visible = visibleRecordMap(role, preset, records);

  return { role, preset, records: visible, links: liveLinks(visible, preset) };
}

function presetDataOf(records: ReadonlyMap<string, VersionedRecord>): string | null {
  const data = presetDataSchema.safeParse(records.get('preset')?.d);

  return data.success ? data.data : null;
}

// The engine validates before it stores, so a preset that does not decode counts as none.
function decodedPreset(data: string | null): Preset | null {
  if (data === null) {
    return null;
  }

  const decoded = decodePreset(data);

  return decoded.isOk() ? decoded.value : null;
}
