import { afterEach, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';
import { createProjectionStore } from '@/ui/projection-store';
import { TokenCellPicker } from './link-picker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'shared',
      title: 'Общий лист',
      tabs: [
        {
          sections: [{ rows: [{ cells: [{ kind: 'token', id: 'portrait' }] }] }],
        },
      ],
    },
  ],
};

const SYNC: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'GM',
};

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }
});

test('a failed viewport read still lists every scene token with globally unlinked tokens first', async () => {
  // #given
  const store = createProjectionStore();
  const container = document.createElement('div');
  const root = createRoot(container);

  const records: VersionedRecord[] = [
    record('preset', encodePreset(PRESET)),
    record('link:linked-b', { s: 'shared', c: 'portrait' }),
    record('link:linked-a', { s: 'shared', c: 'portrait' }),
  ];

  mounted.push(root);
  store.replaceAll(records, [], [], SYNC);

  // #when
  await act(async () => {
    root.render(
      <TokenCellPicker
        target={{ sheetId: 'shared', instanceId: null, cellId: 'portrait' }}
        store={store}
        sendCommand={async () => ({ kind: 'answered', answer: undefined })}
        scene={{
          getItemIds: async () => ['linked-b', 'free-a', 'linked-a', 'free-b'],
          getItemBounds: async () => new Map(),
        }}
        viewport={{ getBounds: async () => Promise.reject(new Error('viewport unavailable')) }}
        onLinked={async () => undefined}
      />,
    );
  });
  await settle();

  // #then
  expect(listed(container)).toEqual([
    { name: 'free-a', linked: false },
    { name: 'free-b', linked: false },
    { name: 'linked-b', linked: true },
    { name: 'linked-a', linked: true },
  ]);
});

function listed(container: HTMLElement): { name: string; linked: boolean }[] {
  return [...container.querySelectorAll('li label')].map((label) => ({
    name: label.querySelector('span:first-of-type')?.textContent ?? '',
    linked: label.textContent.includes('Токен привязан'),
  }));
}

function record(k: string, d: VersionedRecord['d']): VersionedRecord {
  return recordSchema.parse({ k, d, c: 1, a: 'seed' });
}

async function settle(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
}
