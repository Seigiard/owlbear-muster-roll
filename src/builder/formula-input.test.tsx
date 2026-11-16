import { afterEach, describe, expect, test } from 'bun:test';
import { act, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FormulaInput } from './formula-input';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Root[] = [];

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }

  document.body.innerHTML = '';
});

describe('formula completion keyboard confirmation', () => {
  test.each([
    ['Enter', 'isComposing', { isComposing: true }],
    ['Enter', 'legacy keyCode 229', { keyCode: 229 }],
    ['Tab', 'isComposing', { isComposing: true }],
    ['Tab', 'legacy keyCode 229', { keyCode: 229 }],
  ] as const)(
    'ignores %s with %s and inserts the completion with the plain key',
    async (key, _name, signal) => {
      // #given
      const formula = await openFormula();
      await enterText(formula.input, 'st');
      // #when
      await pressKey(formula.input, key, signal);
      const afterComposition = [...formula.values];
      await pressKey(formula.input, key);
      // #then
      expect({ afterComposition, afterPlainKey: formula.values }).toEqual({
        afterComposition: ['st'],
        afterPlainKey: ['st', 'strength'],
      });
    },
  );
});

type FormulaHarnessProps = {
  values: string[];
};

function FormulaHarness({ values }: FormulaHarnessProps): ReactNode {
  const [value, setValue] = useState('');

  return (
    <FormulaInput
      id="formula"
      value={value}
      fieldIds={['strength']}
      describedBy={undefined}
      invalid={false}
      onChange={(next) => {
        values.push(next);
        setValue(next);
      }}
      onBlur={() => undefined}
    />
  );
}

type FormulaHarness = {
  input: HTMLInputElement;
  values: string[];
};

async function openFormula(): Promise<FormulaHarness> {
  const container = document.createElement('div');
  const root = createRoot(container);
  const values: string[] = [];
  document.body.append(container);
  mounted.push(root);
  await act(async () => {
    root.render(<FormulaHarness values={values} />);
  });
  const input = container.querySelector('input');

  if (input === null) {
    throw new Error('the formula form has no input');
  }

  return { input, values };
}

async function enterText(input: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    if (descriptor?.set === undefined) {
      throw new Error('the environment has no input value setter');
    }

    descriptor.set.call(input, text);
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  });
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
