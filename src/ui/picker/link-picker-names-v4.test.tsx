import { afterEach, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { SyncState } from '@/core/ui-messages';
import { createProjectionStore } from '@/ui/projection-store';
import { LinkPicker } from './link-picker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

  document.body.innerHTML = '';
});

test('labels a token by the nearest nonblank block, section, sheet or template name', async () => {
  // #given
  const cases = [
    blockCase('Удар', 'Атаки'),
    blockCase('', 'Атаки'),
    rootSetCase('Ада'),
    rootSingleCase(),
  ];

  // #when
  const labels: string[] = [];

  for (const fixture of cases) {
    // oxlint-disable-next-line no-await-in-loop
    labels.push(await linkedLabel(fixture));
  }

  // #then
  expect(labels).toEqual(['Удар', 'Атаки', 'Ада', 'Инвентарь']);
});

type PickerFixture = {
  preset: Preset;
  records: VersionedRecord[];
};

function blockCase(blockName: string, sectionTitle: string): PickerFixture {
  return {
    preset: {
      v: 4,
      templates: [
        {
          id: 'bestiary',
          title: 'Бестиарий',
          tabs: [
            {
              sections: [
                {
                  title: sectionTitle,
                  repeat: { id: 'attacks', nameField: 'name' },
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'name' },
                        { kind: 'token', id: 'portrait' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    records: [
      blockRecord('blk:bestiary', { order: 0, cells: {} }),
      blockRecord('blk:bestiary:attacks:a1', {
        order: 0,
        cells: blockName === '' ? {} : { name: [blockName, 1, 'seed'] },
      }),
    ],
  };
}

function rootSetCase(sheetName: string): PickerFixture {
  return {
    preset: {
      v: 4,
      templates: [
        {
          id: 'heroes',
          title: 'Герои',
          repeat: { nameField: 'sheet_name' },
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'sheet_name' },
                        { kind: 'token', id: 'portrait' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    records: [
      blockRecord('blk:h1', {
        set: 'heroes',
        order: 0,
        cells: { sheet_name: [sheetName, 1, 'seed'] },
      }),
    ],
  };
}

function rootSingleCase(): PickerFixture {
  return {
    preset: {
      v: 4,
      templates: [
        {
          id: 'inventory',
          title: 'Инвентарь',
          tabs: [
            {
              sections: [{ rows: [{ cells: [{ kind: 'token', id: 'portrait' }] }] }],
            },
          ],
        },
      ],
    },
    records: [blockRecord('blk:inventory', { order: 0, cells: {} })],
  };
}

async function linkedLabel(fixture: PickerFixture): Promise<string> {
  const store = createProjectionStore();
  const container = document.createElement('div');
  const root = createRoot(container);
  const writes: string[] = [];

  document.body.append(container);
  mounted.push(root);
  store.replaceAll(
    [record('preset', encodePreset(fixture.preset)), ...fixture.records],
    [],
    [],
    SYNC,
  );

  await act(async () => {
    root.render(
      <LinkPicker
        tokenId="token"
        store={store}
        sendCommand={async () => ({ kind: 'answered', answer: undefined })}
        scene={{
          getItemLabel: async () => '',
          setItemLabel: async (_id, label) => {
            writes.push(label);
          },
        }}
        notification={{ show: async () => 'notice' }}
        onLinked={async () => undefined}
      />,
    );
  });
  await settle();

  const button = container.querySelector('section button');

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('the picker rendered no target');
  }

  await act(async () => button.click());
  const commandTarget = targetOf(fixture);

  await act(async () => {
    store.applyDelta([record('link:token', commandTarget)], [], [], [], SYNC);
  });
  await settle();

  return writes[0] ?? '(no label)';
}

function targetOf(fixture: PickerFixture) {
  const repeated = fixture.records.find((item) => item.k.includes(':attacks:'));

  return repeated === undefined
    ? {
        s: fixture.preset.templates[0]?.repeat === undefined ? 'inventory' : 'h1',
        c: 'portrait',
      }
    : { s: 'bestiary', path: ['attacks', 'a1'], c: 'portrait' };
}

function record(k: string, d: VersionedRecord['d']): VersionedRecord {
  return { k, d, c: 1, a: 'seed' };
}

function blockRecord(
  k: string,
  d: Extract<VersionedRecord, { k: `blk:${string}` }>['d'],
): VersionedRecord {
  // SAFETY: every caller supplies a blk key and block data with its required lifecycle.
  return { k, d, c: 1, a: 'seed', l: [1, 'seed'] } as VersionedRecord;
}

async function settle(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
}
