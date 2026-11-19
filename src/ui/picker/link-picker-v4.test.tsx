import { afterEach, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sheetRootAddress } from '@/core/block-address';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { Command, SyncState } from '@/core/ui-messages';
import type { Bounds } from '@/platform/ports';
import { createProjectionStore } from '@/ui/projection-store';
import { TokenCellPicker } from './link-picker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const TARGET = { block: sheetRootAddress('shared'), cellId: 'portrait' };

const SYNC: SyncState = {
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
      id: 'shared',
      title: 'Общий лист',
      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'token', id: 'portrait' },
                    { kind: 'token', id: 'camp' },
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

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }

  document.body.innerHTML = '';
});

test('orders scene tokens by viewport first and linked state second', async () => {
  // #given
  const picker = await openPicker();

  // #when
  const choices = listedChoices(picker.container);

  // #then
  expect(choices).toEqual([
    { name: 'near-free', linked: false },
    { name: 'far-free', linked: false },
    { name: 'near-linked', linked: true },
    { name: 'near-other-linked', linked: true },
    { name: 'far-linked', linked: true },
  ]);
});

test('reassigns selected tokens and selectively unlinks only selected links to this cell', async () => {
  // #given
  const picker = await openPicker();

  // #when
  await choose(picker.container, 'near-other-linked');
  await choose(picker.container, 'near-linked');
  await press(picker.container, 'Привязать лист…');

  const linkedCommands = [...picker.commands];
  picker.commands.length = 0;

  await press(picker.container, 'Отвязать лист');

  // #then
  expect({ linkedCommands, unlinkedCommands: picker.commands }).toEqual({
    linkedCommands: [
      {
        type: 'link-set',
        tokenId: 'near-other-linked',
        sheetId: 'shared',
        block: TARGET.block,
        cellId: 'portrait',
      },
      {
        type: 'link-set',
        tokenId: 'near-linked',
        sheetId: 'shared',
        block: TARGET.block,
        cellId: 'portrait',
      },
    ],
    unlinkedCommands: [{ type: 'link-clear', tokenId: 'near-linked' }],
  });
});

async function openPicker() {
  const store = createProjectionStore();
  const commands: Command[] = [];
  const container = document.createElement('div');
  const root = createRoot(container);

  const records: VersionedRecord[] = [
    { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
    { k: 'link:near-linked', d: { s: 'shared', c: 'portrait' }, c: 1, a: 'seed' },
    { k: 'link:far-linked', d: { s: 'shared', c: 'portrait' }, c: 1, a: 'seed' },
    { k: 'link:near-other-linked', d: { s: 'shared', c: 'camp' }, c: 1, a: 'seed' },
  ];

  document.body.append(container);
  mounted.push(root);
  store.replaceAll(records, [], [], SYNC);

  await act(async () => {
    root.render(
      <TokenCellPicker
        target={TARGET}
        store={store}
        sendCommand={(command) => {
          commands.push(command);

          return Promise.resolve({ kind: 'answered', answer: undefined });
        }}
        scene={{
          getItemIds: async () => [
            'far-linked',
            'near-free',
            'near-linked',
            'far-free',
            'near-other-linked',
          ],
          getItemBounds: async () =>
            new Map([
              ['near-free', bounds(1)],
              ['near-linked', bounds(2)],
              ['near-other-linked', bounds(3)],
              ['far-free', bounds(100)],
              ['far-linked', bounds(101)],
            ]),
        }}
        viewport={{ getBounds: async () => bounds(0, 10) }}
        onLinked={async () => undefined}
      />,
    );
  });
  await settle();

  return { container, commands };
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

function listedChoices(container: HTMLElement): { name: string; linked: boolean }[] {
  return [...container.querySelectorAll('li label')].map((label) => ({
    name: label.querySelector('span:first-of-type')?.textContent ?? '',
    linked: label.textContent.includes('Привязан к '),
  }));
}

async function choose(container: HTMLElement, name: string): Promise<void> {
  const label = [...container.querySelectorAll('label')].find((node) =>
    node.textContent.includes(name),
  );

  const input = label?.querySelector('input');

  if (input === null || input === undefined) {
    throw new Error(`No token choice ${name}`);
  }

  await act(async () => input.click());
}

async function press(container: HTMLElement, name: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === name,
  );

  if (button === undefined) {
    throw new Error(`No button ${name}`);
  }

  await act(async () => button.click());
  await settle();
}

async function settle(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
}
