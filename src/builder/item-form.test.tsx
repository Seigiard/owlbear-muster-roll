import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { Preset } from '@/core/preset';

import { createBuilderStore, type BuilderStore } from './builder-store';
import { uidAt } from './document';
import { ItemForm } from './item-form';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const FIELD_PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'hero',
      kind: 'single',
      title: 'Hero',
      tabs: [
        {
          sections: [
            {
              rows: [[{ kind: 'field', type: 'text', id: 'strength' }]],
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

describe('field id keyboard confirmation', () => {
  test.each([
    ['isComposing', { isComposing: true }],
    ['legacy keyCode 229', { keyCode: 229 }],
  ] as const)('ignores Enter with %s and renames with plain Enter', async (_name, signal) => {
    // #given
    const form = await openFieldForm();
    await enterText(form.input, 'agility');

    // #when
    await pressKey(form.input, 'Enter', signal);
    const afterComposition = fieldId(form.store);
    await pressKey(form.input, 'Enter');

    // #then
    expect({ afterComposition, afterPlainEnter: fieldId(form.store) }).toEqual({
      afterComposition: 'strength',
      afterPlainEnter: 'agility',
    });
  });
});

type FieldForm = { input: HTMLInputElement; store: BuilderStore };

async function openFieldForm(): Promise<FieldForm> {
  const store = createBuilderStore(null);

  store.open(FIELD_PRESET, null, 'preset');

  const document = store.$state.get().step.document;
  const selection = uidAt(document, [0, 0, 0, 0, 0]);

  if (selection === null) {
    throw new Error('the field fixture has no field cell');
  }

  const container = documentNode();
  const root = createRoot(container);

  mounted.push(root);
  await act(async () => {
    root.render(
      <ItemForm
        store={store}
        document={document}
        origin={null}
        selection={selection}
        problems={[]}
      />,
    );
  });

  const input = container.querySelector<HTMLInputElement>('input[autocomplete="off"]');

  if (input === null) {
    throw new Error('the public item form has no field id input');
  }

  return { input, store };
}

function documentNode(): HTMLDivElement {
  const container = document.createElement('div');

  document.body.append(container);

  return container;
}

function fieldId(store: BuilderStore): string | null {
  const cell =
    store.$state.get().step.document.templates[0]?.tabs[0]?.sections[0]?.rows[0]?.cells[0];

  return cell?.kind === 'field' ? cell.id : null;
}

async function enterText(input: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    if (descriptor?.set === undefined) {
      throw new Error('the environment has no input value setter');
    }

    descriptor.set.call(input, text);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  });
}

async function pressKey(
  element: HTMLElement,
  key: string,
  signal: { isComposing?: boolean; keyCode?: number } = {},
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
