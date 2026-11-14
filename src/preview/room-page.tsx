import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { parsePresetFile, windowSizeOf, type WindowSize } from '@/core/preset';
import { buildStorageKey, INITIAL_GENERATION } from '@/core/storage-key';
import { presetFailureMessage } from '@/ui/preset-errors';
import { applyTheme } from '@/ui/theme';
// The side-effect-free part of the mock: the room id is used to address the host page's storage.
// oxlint-disable-next-line no-restricted-imports
import {
  CLIENT_PARAM,
  DEVICE_PARAM,
  MOCK_ROOM_ID,
  PLAYER_PARAM,
  ROLE_PARAM,
} from '@/platform/mock/client-params';

import { addressSearch, readAddress, type PreviewAddress } from './address';
import type { PresetListEntry } from './protocol';
import { CONTROL_CLASS, type ListState, usePresetList } from './preset-list';
import { roomSeed } from './room-seed';
import { PREVIEW_THEMES } from './themes';

const PLAYER_QUERY = new URLSearchParams([
  [CLIENT_PARAM, 'p'],
  [ROLE_PARAM, 'PLAYER'],
  [PLAYER_PARAM, 'lisa'],
  [DEVICE_PARAM, 'p'],
]);

export function RoomPage(): ReactNode {
  const [address, setAddress] = useState(() => readAddress(window.location.search));
  const [framesMounted, setFramesMounted] = useState(false);
  const list = usePresetList(import.meta.hot);
  const presetSelectId = 'room-preset';

  useEffect(() => {
    applyTheme(PREVIEW_THEMES[address.theme], document.documentElement);
  }, [address.theme]);

  const entries = list.kind === 'loaded' ? list.entries : [];
  const chosen = entries.find((entry) => entry.key === address.preset) ?? entries[0];

  const parsed = useMemo(
    () => (chosen?.text === null || chosen === undefined ? null : parsePresetFile(chosen.text)),
    [chosen],
  );

  useEffect(() => {
    setFramesMounted(false);
  }, [chosen?.key]);

  useEffect(() => {
    if (
      framesMounted ||
      parsed === null ||
      !parsed.ok ||
      chosen === undefined ||
      chosen.text === null
    ) {
      return;
    }

    const presetKey = storageKeyForPreset();

    if (localStorage.getItem(presetKey) === null) {
      const seeded = roomSeed(chosen.text);

      if (!seeded.ok) {
        return;
      }

      for (const [key, value] of seeded.value) {
        localStorage.setItem(key, value);
      }
    }

    setFramesMounted(true);
  }, [chosen, framesMounted, parsed]);

  function change(next: PreviewAddress): void {
    window.history.replaceState(null, '', `${window.location.pathname}${addressSearch(next)}`);
    setAddress(next);
  }

  function reset(): void {
    localStorage.clear();
    setFramesMounted(false);
  }

  function choosePreset(key: string): void {
    change({ ...address, preset: key });
    reset();
  }

  return (
    <main className="min-h-dvh bg-surface-bar p-4 text-body text-text">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={presetSelectId}>Preset</label>
          <select
            id={presetSelectId}
            className={CONTROL_CLASS}
            value={chosen?.key ?? ''}
            disabled={chosen === undefined}
            onChange={(event) => {
              choosePreset(event.target.value);
            }}
          >
            {entries.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.launch ? `${entry.label} (launch file)` : entry.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            role="switch"
            className="accent-accent"
            checked={address.theme === 'light'}
            onChange={(event) => {
              change({ ...address, theme: event.target.checked ? 'light' : 'dark' });
            }}
          />
          Light theme
        </label>
        <button type="button" className={CONTROL_CLASS} onClick={reset}>
          Reset
        </button>
      </div>
      <RoomBody
        list={list}
        chosen={chosen}
        parsed={parsed}
        address={address}
        framesMounted={framesMounted}
      />
    </main>
  );
}

function RoomBody({
  list,
  chosen,
  parsed,
  address,
  framesMounted,
}: {
  list: ListState;
  chosen: PresetListEntry | undefined;
  parsed: ReturnType<typeof parsePresetFile> | null;
  address: PreviewAddress;
  framesMounted: boolean;
}): ReactNode {
  if (list.kind === 'loading') {
    return <p className="text-text-muted">Loading…</p>;
  }

  if (list.kind === 'failed') {
    return <p role="alert">The dev server did not give the preset list.</p>;
  }

  if (chosen === undefined) {
    return <p>No preset file found.</p>;
  }

  if (chosen.text === null) {
    return <p role="alert">Cannot read {chosen.label}.</p>;
  }

  if (parsed === null) {
    return <p>No preset file found.</p>;
  }

  if (!parsed.ok) {
    return (
      <p role="alert" className="text-danger-text">
        {presetFailureMessage(parsed.error)}
      </p>
    );
  }

  if (!framesMounted) {
    return <p className="text-text-muted">Loading room…</p>;
  }

  return <RoomFrames size={windowSizeOf(parsed.value)} theme={address.theme} />;
}

function RoomFrames({
  size,
  theme,
}: {
  size: WindowSize;
  theme: PreviewAddress['theme'];
}): ReactNode {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <ClientFrame label="GM window" query="" size={size} theme={theme} />
      <ClientFrame
        label="Player window"
        query={`?${PLAYER_QUERY.toString()}`}
        size={size}
        theme={theme}
      />
    </div>
  );
}

function ClientFrame({
  label,
  query,
  size,
  theme,
}: {
  label: string;
  query: string;
  size: WindowSize;
  theme: PreviewAddress['theme'];
}): ReactNode {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current?.contentWindow;

    frame?.setMockTheme?.(PREVIEW_THEMES[theme]);
  }, [theme]);

  return (
    <figure className="flex shrink-0 flex-col gap-1">
      <figcaption className="text-label-sm text-text-muted">
        {label}, {size.width} × {size.height} px
      </figcaption>
      <iframe
        title={`${label} background`}
        src={`/background.html${query}`}
        className="hidden"
        aria-hidden="true"
      />
      <iframe
        title={label}
        src={`/index.html${query}`}
        ref={frameRef}
        width={size.width}
        height={size.height}
        className="rounded-window border-0"
        onLoad={() => {
          frameRef.current?.contentWindow?.setMockTheme?.(PREVIEW_THEMES[theme]);
        }}
      />
    </figure>
  );
}

function storageKeyForPreset(): string {
  const key = buildStorageKey(MOCK_ROOM_ID, INITIAL_GENERATION, 'preset');

  if (!key.ok) {
    throw new Error('mock room preset key is invalid');
  }

  return key.value;
}
