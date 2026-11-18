import { afterEach, expect, test } from 'bun:test';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { Command, SyncState } from '@/core/ui-messages';
import { copy } from '@/copy';
import type { Bounds } from '@/platform/ports';
import { createProjectionStore } from '@/ui/projection-store';
import { createRoomRig } from '../../../tests/support/room-rig';

import { LinkPicker, TokenCellPicker } from './link-picker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const LIVE: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'GM',
};

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'crew',
      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [
        {
          sections: [
            {
              title: 'Персонаж',
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'portrait' },
                    { kind: 'token', id: 'mount' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const RECORDS: VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  {
    k: 'blk:brok',
    d: { set: 'crew', order: 0, cells: { name: ['Брок', 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  },
];

const mounted: Root[] = [];
const outcomeRig = createRoomRig({ seeded: RECORDS, until: 'live' });
const timeoutRig = createRoomRig({ timing: { commandTimeoutMs: 5, linkSetTimeoutMs: 5 } });

type ReverseSend = ComponentProps<typeof TokenCellPicker>['sendCommand'];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }

  document.body.innerHTML = '';
});

test('distinguishes equal forward-picker groups by token cell without changing the offered label', async () => {
  // #given
  const container = document.createElement('div');
  const root = createRoot(container);
  const store = createProjectionStore();
  store.replaceAll(RECORDS, [], [], LIVE);
  document.body.append(container);
  mounted.push(root);

  // #when
  await act(async () => {
    root.render(
      <LinkPicker
        tokenId="token"
        store={store}
        sendCommand={async () => ({ kind: 'answered', answer: undefined })}
        scene={{ getItemLabel: async () => '', setItemLabel: async () => undefined }}
        notification={{ show: async () => 'notice' }}
        onLinked={async () => undefined}
      />,
    );
  });
  await settle();

  const groups = [...container.querySelectorAll('section')].map((section) => ({
    name: section.getAttribute('aria-label'),
    choice: section.querySelector('button')?.textContent?.trim(),
    accessibleChoice: section.querySelector('button')?.getAttribute('aria-label'),
  }));

  // #then
  expect(groups).toEqual([
    { name: 'Персонаж — portrait', choice: 'Брок', accessibleChoice: 'Брок, portrait' },
    { name: 'Персонаж — mount', choice: 'Брок', accessibleChoice: 'Брок, mount' },
  ]);
});

test('keeps the reverse picker open and announces a refused real command batch', async () => {
  // #given
  const room = outcomeRig.openRoom();
  const gm = await outcomeRig.startClient(room, 'gm-a');
  const closed: string[] = [];

  const picker = await renderReversePicker({
    target: { sheetId: 'brok', instanceId: null, cellId: 'removed-cell' },
    store: gm.store,
    sendCommand: gm.window.sendCommand,
    ids: ['free', 'second-free'],
    onLinked: async () => {
      closed.push('closed');
    },
  });

  await choose(picker, 'free');
  await choose(picker, 'second-free');

  // #when
  await press(picker, copy.command.linkSheet);
  await settle(20);

  // #then
  expect({
    closed,
    live: picker.querySelector('[aria-live]')?.textContent,
    selected: [...picker.querySelectorAll<HTMLInputElement>('input:checked')].length,
  }).toEqual({ closed: [], live: copy.linkFailed, selected: 2 });
});

test('keeps the reverse picker open and announces a timed-out real command', async () => {
  // #given
  const room = timeoutRig.openRoom();
  const orphan = timeoutRig.createClient(room, 'gm-timeout');
  orphan.openWindow();
  const store = createProjectionStore();
  store.replaceAll(RECORDS, [], [], LIVE);
  const closed: string[] = [];

  const picker = await renderReversePicker({
    target: { sheetId: 'brok', instanceId: null, cellId: 'portrait' },
    store,
    sendCommand: orphan.window.sendCommand,
    ids: ['free'],
    onLinked: async () => {
      closed.push('closed');
    },
  });

  await choose(picker, 'free');

  // #when
  await press(picker, copy.command.linkSheet);
  await settle(20);

  // #then
  expect({
    closed,
    live: picker.querySelector('[aria-live]')?.textContent,
    selected: [...picker.querySelectorAll<HTMLInputElement>('input:checked')].length,
  }).toEqual({ closed: [], live: copy.linkFailed, selected: 1 });
});

test('marks current-cell and elsewhere links separately and unlinks only current-cell selections', async () => {
  // #given
  const commands: Command[] = [];

  const picker = await reversePicker(async (command) => {
    commands.push(command);

    return { kind: 'answered', answer: undefined };
  });

  // #when
  await choose(picker, 'current');
  await choose(picker, 'elsewhere');
  await press(picker, copy.command.unlinkSheet);

  const statuses = Object.fromEntries(
    [...picker.querySelectorAll('li label')].map((label) => [
      label.querySelector('span')?.textContent,
      label.querySelector('span:last-child')?.textContent,
    ]),
  );

  // #then
  expect({ statuses, commands }).toEqual({
    statuses: {
      current: 'Привязан к этой ячейке',
      elsewhere: 'Привязан к другой ячейке',
      free: 'free',
    },
    commands: [{ type: 'link-clear', tokenId: 'current' }],
  });
});

test('keeps the reverse picker open when a real unlink becomes stale and is refused', async () => {
  // #given
  const room = outcomeRig.openRoom();

  const link: VersionedRecord = {
    k: 'link:current',
    d: { s: 'brok', c: 'portrait' },
    c: 1,
    a: 'seed',
  };

  const gm = await outcomeRig.startClient(room, 'gm-unlink', { seeded: [...RECORDS, link] });
  const closed: string[] = [];

  // SAFETY: both command variants have the same `undefined` answer in the real client.
  const staleUnlink = (async (command: Extract<Command, { type: 'link-set' | 'link-clear' }>) => {
    if (command.type === 'link-clear') {
      await gm.window.sendCommand(command);
    }

    return gm.window.sendCommand(command);
  }) as ReverseSend;

  const picker = await renderReversePicker({
    target: { sheetId: 'brok', instanceId: null, cellId: 'portrait' },
    store: gm.store,
    sendCommand: staleUnlink,
    ids: ['current'],
    onLinked: async () => {
      closed.push('closed');
    },
  });

  await choose(picker, 'current');

  // #when
  await press(picker, copy.command.unlinkSheet);

  // #then
  expect({
    closed,
    live: picker.querySelector('[aria-live]')?.textContent,
    selected: [...picker.querySelectorAll<HTMLInputElement>('input:checked')].length,
  }).toEqual({ closed: [], live: copy.linkFailed, selected: 1 });
});

async function reversePicker(
  sendCommand: ReverseSend,
  onLinked: () => Promise<void> = async () => undefined,
): Promise<HTMLElement> {
  const store = createProjectionStore();

  const records: VersionedRecord[] = [
    ...RECORDS,
    { k: 'link:current', d: { s: 'brok', c: 'portrait' }, c: 1, a: 'seed' },
    { k: 'link:elsewhere', d: { s: 'brok', c: 'mount' }, c: 1, a: 'seed' },
  ];

  store.replaceAll(records, [], [], LIVE);

  return renderReversePicker({
    target: { sheetId: 'brok', instanceId: null, cellId: 'portrait' },
    store,
    sendCommand,
    ids: ['current', 'elsewhere', 'free'],
    onLinked,
  });
}

async function renderReversePicker({
  target,
  store,
  sendCommand,
  ids,
  onLinked,
}: {
  target: { sheetId: string; instanceId: null; cellId: string };
  store: ReturnType<typeof createProjectionStore>;
  sendCommand: ReverseSend;
  ids: string[];
  onLinked: () => Promise<void>;
}): Promise<HTMLElement> {
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.append(container);
  mounted.push(root);

  await act(async () => {
    root.render(
      <TokenCellPicker
        target={target}
        store={store}
        sendCommand={sendCommand}
        scene={{
          getItemIds: async () => ids,
          getItemBounds: async () => new Map(ids.map((id, index) => [id, bounds(index + 1)])),
        }}
        viewport={{ getBounds: async () => bounds(0, 10) }}
        onLinked={onLinked}
      />,
    );
  });
  await settle();

  return container;
}

function bounds(minimum: number, maximum = minimum + 1): Bounds {
  return {
    min: { x: minimum, y: minimum },
    max: { x: maximum, y: maximum },
    width: maximum - minimum,
    height: maximum - minimum,
    center: { x: (minimum + maximum) / 2, y: (minimum + maximum) / 2 },
  };
}

async function choose(container: HTMLElement, name: string): Promise<void> {
  const label = [...container.querySelectorAll('label')].find((node) =>
    node.textContent.includes(name),
  );

  const input = label?.querySelector('input');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`No token choice ${name}`);
  }

  await act(async () => input.click());
}

async function press(container: HTMLElement, name: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === name,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`No button ${name}`);
  }

  await act(async () => button.click());
  await settle();
}

async function settle(milliseconds = 0): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }),
  );
}
