import { useEffect, useState } from 'react';

import {
  PRESET_LIST_PATH,
  PRESETS_CHANGED_EVENT,
  presetListSchema,
  type PresetListEntry,
} from './protocol';

export type ListState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'loaded'; entries: readonly PresetListEntry[] };

export const CONTROL_CLASS = 'touch-target rounded-sm border border-line bg-surface px-2 text-text';

// The list loads once, and again on each change the dev server reports. An older answer that lands
// after a newer one is dropped.
export function usePresetList(hot: ImportMeta['hot']): ListState {
  const [state, setState] = useState<ListState>(initialPresetList);

  useEffect(() => {
    let latest = 0;
    let active = true;

    const load = (): void => {
      latest += 1;
      const request = latest;

      void fetchPresetList().then((next) => {
        if (active && request === latest) {
          setState(next);
        }
      });
    };

    load();
    hot?.on(PRESETS_CHANGED_EVENT, load);

    return () => {
      active = false;
      hot?.off(PRESETS_CHANGED_EVENT, load);
    };
  }, [hot]);

  return state;
}

export async function fetchPresetList(): Promise<ListState> {
  try {
    const response = await fetch(PRESET_LIST_PATH, { cache: 'no-store' });

    if (!response.ok) {
      return { kind: 'failed' };
    }

    const parsed = presetListSchema.safeParse(await response.json());

    return parsed.success ? { kind: 'loaded', entries: parsed.data } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

export function initialPresetList(): ListState {
  try {
    const request = new XMLHttpRequest();

    request.open('GET', PRESET_LIST_PATH, false);
    request.send();

    if (request.status < 200 || request.status >= 300) {
      return { kind: 'failed' };
    }

    const responseBody: unknown = JSON.parse(request.responseText);
    const parsed = presetListSchema.safeParse(responseBody);

    return parsed.success ? { kind: 'loaded', entries: parsed.data } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}
