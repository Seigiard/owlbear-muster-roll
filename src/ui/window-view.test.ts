import { afterEach, describe, expect, test } from 'bun:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { useWindowView, type WindowView, windowViewOf } from '@/ui/window-view';

const PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'party',
      kind: 'set',
      title: 'Party',
      nameField: 'name',
      tokens: true,
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }] }],
    },
    {
      id: 'secret',
      kind: 'single',
      title: 'Secret',
      visibility: 'gm',
      tokens: true,
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'note' }]] }] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'gm' };
const HERO = record('sheet:hero', { set: 'party', order: 0 });
const HERO_NAME = record('row:hero:name', { name: 'Ada' });
const HERO_LINK = record('link:token-hero', { s: 'hero' });
const SECRET = record('row:secret:note', { note: 'GM only' });
const SECRET_LINK = record('link:token-secret', { s: 'secret' });

const GM_SYNC: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'GM',
};

const PLAYER_SYNC: SyncState = { ...GM_SYNC, role: 'PLAYER' };

const cleanups: Array<() => void> = [];

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('window view', () => {
  test('shows every record to a GM', () => {
    // #given
    const records = new Map(
      [PRESET_RECORD, HERO, HERO_NAME, HERO_LINK, SECRET, SECRET_LINK].map((entry) => [
        entry.k,
        entry,
      ]),
    );

    // #when
    const view = windowViewOf('GM', PRESET, records);

    // #then
    expect([...view.records.keys()]).toEqual([
      'preset',
      'sheet:hero',
      'row:hero:name',
      'link:token-hero',
      'row:secret:note',
      'link:token-secret',
    ]);
  });

  test('shows a player visible sheets and their live links only', () => {
    // #given
    const records = new Map(
      [PRESET_RECORD, HERO, HERO_NAME, HERO_LINK, SECRET, SECRET_LINK].map((entry) => [
        entry.k,
        entry,
      ]),
    );

    // #when
    const view = windowViewOf('PLAYER', PRESET, records);

    // #then
    expect({ keys: [...view.records.keys()], links: [...view.links.keys()] }).toEqual({
      keys: ['preset', 'sheet:hero', 'row:hero:name', 'link:token-hero'],
      links: ['token-hero'],
    });
  });

  test('treats a preset that cannot decode as no preset', async () => {
    // #given
    const store = createProjectionStore();
    store.replaceAll(
      [{ k: 'preset', d: 'eJw=', c: 1, a: 'gm' }, HERO, HERO_NAME],
      [],
      [],
      PLAYER_SYNC,
    );
    const mounted = await mountWindowView(store, 'PLAYER');

    // #when
    const view = mounted.current();

    // #then
    expect({ preset: view.preset, keys: [...view.records.keys()] }).toEqual({
      preset: null,
      keys: ['preset'],
    });
  });

  test('uses the initial role before the first projection', async () => {
    // #given
    const mounted = await mountWindowView(createProjectionStore(), 'GM');

    // #when
    const view = mounted.current();

    // #then
    expect(view.role).toBe('GM');
  });

  test('keeps the decoded preset object when the preset string is unchanged', async () => {
    // #given
    const store = createProjectionStore();
    store.replaceAll([PRESET_RECORD], [], [], GM_SYNC);
    const mounted = await mountWindowView(store, 'GM');
    const before = mounted.current().preset;

    // #when
    await act(async () => {
      store.applyDelta([HERO], [], [], [], GM_SYNC);
    });

    // #then
    expect({
      templates: mounted.current().preset?.templates.map((template) => template.id),
      isSameObject: mounted.current().preset === before,
    }).toEqual({ templates: ['party', 'secret'], isSameObject: true });
  });
});

async function mountWindowView(
  store: ProjectionStore,
  initialRole: 'GM' | 'PLAYER',
): Promise<MountedWindowView> {
  let view: WindowView | null = null;
  const container = document.createElement('div');
  const root = createRoot(container);

  function Probe(): null {
    view = useWindowView(store, initialRole);

    return null;
  }

  await act(async () => {
    root.render(createElement(Probe));
  });

  const mounted = { current: () => view ?? failToRender() };
  cleanups.push(() => {
    act(() => {
      root.unmount();
    });
  });

  return mounted;
}

type MountedWindowView = { current: () => WindowView };

function failToRender(): never {
  throw new Error('window view did not render');
}

function record(k: string, d: VersionedRecord['d'], c = 1, a = 'gm'): VersionedRecord {
  // SAFETY: fixtures use only valid record key and data combinations.
  return { k, d, c, a } as VersionedRecord;
}
