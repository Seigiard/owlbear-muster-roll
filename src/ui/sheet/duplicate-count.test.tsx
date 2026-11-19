import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { VersionedRecord } from '@/core/records';
import type { Command, SyncState } from '@/core/ui-messages';
import { copy } from '@/copy';
import { createProjectionStore } from '@/ui/projection-store';
import { DuplicateCount } from './duplicate-count';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const LIVE: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
  role: 'GM',
};

const SOURCE: VersionedRecord = {
  k: 'blk:npc:name:source',
  d: { order: 0, cells: {} },
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
};

const mounted: Root[] = [];

type DuplicateOutcome =
  | {
      kind: 'answered';
      answer: undefined;
    }
  | {
      kind: 'refused';
      rejection: {
        t: 'command-rejected';
        id: string;
        reason: 'invalid-count';
      };
    }
  | {
      kind: 'timed-out';
    };

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }

  document.body.innerHTML = '';
});

describe('duplicate count outcomes', () => {
  test("another client's empty repeat block does not answer a duplicate of an empty source", async () => {
    // #given
    const store = createProjectionStore();
    const container = document.createElement('div');
    const root = createRoot(container);
    let done = 0;
    let answer: (() => void) | undefined;
    document.body.append(container);
    mounted.push(root);
    store.replaceAll([SOURCE], [], [], LIVE);
    await act(async () => {
      root.render(
        <DuplicateCount
          sheetId="npc"
          sectionId="name"
          instanceId="source"
          sendCommand={() =>
            new Promise<DuplicateOutcome>((resolve) => {
              answer = () => resolve({ kind: 'answered', answer: undefined });
            })
          }
          focusRequest={0}
          onDone={() => {
            done += 1;
          }}
          onCancel={() => undefined}
        />,
      );
    });
    // #when
    await act(async () => {
      confirmButton(container).click();
    });
    await act(async () => {
      store.applyDelta(
        [{ k: 'blk:npc:name:other', d: { order: 1, cells: {} }, c: 1, a: 'other', l: [1, 'seed'] }],
        [],
        [],
        [],
        LIVE,
      );
    });
    const afterOther = done;
    await act(async () => answer?.());
    // #then
    expect({ afterOther, afterAnswer: done }).toEqual({ afterOther: 0, afterAnswer: 1 });
  });
  test.each([
    [
      'refused',
      {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: 'duplicate-own', reason: 'invalid-count' },
      },
    ],
    ['timed out', { kind: 'timed-out' }],
  ] as const)('a duplicate that is %s stays open and shows the failure', async (_name, outcome) => {
    // #given
    const container = document.createElement('div');
    const root = createRoot(container);
    let done = 0;
    document.body.append(container);
    mounted.push(root);
    await act(async () => {
      root.render(
        <DuplicateCount
          sheetId="npc"
          sectionId="name"
          instanceId="source"
          sendCommand={() => Promise.resolve(outcome)}
          focusRequest={0}
          onDone={() => {
            done += 1;
          }}
          onCancel={() => undefined}
        />,
      );
    });
    // #when
    await act(async () => {
      confirmButton(container).click();
    });
    // #then
    expect({ done, text: container.textContent?.includes(copy.duplicateFailed) }).toEqual({
      done: 0,
      text: true,
    });
  });
});

describe('duplicate count keyboard confirmation', () => {
  test.each([
    ['isComposing', { isComposing: true }],
    ['legacy keyCode 229', { keyCode: 229 }],
  ] as const)('ignores Enter with %s and confirms with plain Enter', async (_name, signal) => {
    // #given
    const form = await openDuplicateCount();
    // #when
    await pressKey(form.input, 'Enter', signal);
    const afterComposition = [...form.commands];
    await pressKey(form.input, 'Enter');
    // #then
    expect({ afterComposition, afterPlainEnter: form.commands }).toEqual({
      afterComposition: [],
      afterPlainEnter: [
        {
          type: 'repeat-block-duplicate',
          sheetId: 'npc',
          block: { sheetId: 'npc', path: ['name', 'source'] },
          count: 1,
        },
      ],
    });
  });
});

type DuplicateForm = {
  input: HTMLInputElement;
  commands: Extract<
    Command,
    {
      type: 'repeat-block-duplicate';
    }
  >[];
};

async function openDuplicateCount(): Promise<DuplicateForm> {
  const container = document.createElement('div');
  const root = createRoot(container);
  const commands: DuplicateForm['commands'] = [];
  document.body.append(container);
  mounted.push(root);
  await act(async () => {
    root.render(
      <DuplicateCount
        sheetId="npc"
        sectionId="name"
        instanceId="source"
        sendCommand={(command) => {
          commands.push(command);

          return Promise.resolve({ kind: 'answered', answer: undefined });
        }}
        focusRequest={0}
        onDone={() => undefined}
        onCancel={() => undefined}
      />,
    );
  });
  const input = container.querySelector('input');

  if (input === null) {
    throw new Error('the duplicate form has no count input');
  }

  return { input, commands };
}

async function pressKey(
  element: HTMLElement,
  key: string,
  signal: {
    isComposing?: boolean;
    keyCode?: number;
  } = {},
): Promise<void> {
  await act(async () => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      isComposing: signal.isComposing,
      key,
    });

    if (signal.keyCode !== undefined) {
      Object.defineProperty(event, 'keyCode', { value: signal.keyCode });
    }

    element.dispatchEvent(event);
  });
}

function confirmButton(container: HTMLElement): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((one) =>
    one.textContent.includes('Дублировать'),
  );

  if (button === undefined) {
    throw new Error('the duplicate form has no confirm button');
  }

  return button;
}
