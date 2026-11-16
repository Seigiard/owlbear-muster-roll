import { afterEach, expect, test } from 'bun:test';
import { createElement, type ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { Template } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { Command } from '@/core/ui-messages';
import { copy } from '@/copy';

import { SheetBody } from './sheet-body';
import { createLocalFieldValues } from './local-field-values';
import { createFieldFlushes } from './use-field-edit';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Props = ComponentProps<typeof SheetBody>;

const mounted: Root[] = [];

const requestRoll: Props['rolling']['requestRoll'] = async () => ({
  kind: 'answered',
  answer: { code: 'refused' },
});

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }

  document.body.innerHTML = '';
});

test('renders repeat-row add as a scoped block command', async () => {
  // #given
  const view = await renderSheet(REPEAT_ROW, rootRecords());

  // #when
  const button = [...view.container.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === copy.label.addToSection('Состояния'),
  );

  if (button instanceof HTMLButtonElement) {
    await act(async () => button.click());
  }

  // #then
  expect({
    addLabel: button?.getAttribute('aria-label') ?? null,
    command: view.commands[0] ?? null,
  }).toEqual({
    addLabel: 'Добавить в «Состояния»',
    command: {
      type: 'repeat-block-add',
      sheetId: 'journal',
      sectionId: 'conditions',
      instanceId: expect.any(String),
    },
  });
});

test('renders and edits a repeat-row value in its descendant block scope', async () => {
  // #given
  const view = await renderSheet(REPEAT_ROW, repeatRecords());

  const control = [...view.container.querySelectorAll('textarea, input')].find(
    (candidate) => candidate.getAttribute('aria-label') === 'name',
  );

  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    throw new Error('the repeat-row text field named "name" is missing');
  }

  const initial = control.value;

  // #when
  await enterText(control, 'Ослеплён');

  // #then
  expect({
    initial,
    command: view.commands.at(-1) ?? null,
  }).toEqual({
    initial: 'Отравлен',
    command: {
      type: 'field-patch',
      sheetId: 'journal',
      target: { kind: 'rep', sectionId: 'conditions', instanceId: 'c1' },
      fieldId: 'name',
      value: 'Ослеплён',
    },
  });
});

test('renders repeat-row remove as a scoped block command', async () => {
  // #given
  const view = await renderSheet(REPEAT_ROW, repeatRecords());

  // #when
  const button = [...view.container.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === copy.label.deleteBlock(1),
  );

  if (button instanceof HTMLButtonElement) {
    await act(async () => button.click());
  }

  // #then
  expect({
    removeLabel: button?.getAttribute('aria-label') ?? null,
    command: view.commands[0] ?? null,
  }).toEqual({
    removeLabel: 'Удалить блок 1',
    command: {
      type: 'repeat-block-delete',
      sheetId: 'journal',
      sectionId: 'conditions',
      instanceId: 'c1',
    },
  });
});

test('filters hidden sections and rows for a player while preserving original target indexes', async () => {
  // #given
  const records = new Map<string, VersionedRecord>([
    [
      'blk:journal',
      {
        k: 'blk:journal',
        d: {
          order: 0,
          cells: {
            secret: ['GM only', 1, 'seed'],
            hidden_row: ['Row secret', 1, 'seed'],
            public: ['Visible', 1, 'seed'],
          },
        },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);

  // #when
  const player = await renderSheet(VISIBILITY, records, 'PLAYER');
  const gm = await renderSheet(VISIBILITY, records, 'GM');

  // #then
  expect({ player: summarize(player.container), gm: summarize(gm.container) }).toEqual({
    player: {
      text: 'ОткрытоVisible',
      sectionIndexes: ['1'],
      rowIndexes: ['1'],
    },
    gm: {
      text: 'СекретыGM onlyGM onlyОткрытоRow secretRow secretVisible',
      sectionIndexes: ['0', '1'],
      rowIndexes: ['0', '0', '1'],
    },
  });
});

const REPEAT_ROW: Template = {
  id: 'journal',
  title: 'Журнал',
  tabs: [
    {
      sections: [
        {
          title: 'Состояния',
          rows: [
            {
              repeat: { id: 'conditions', nameField: 'name' },
              cells: [
                { kind: 'field', type: 'text', id: 'name' },
                { kind: 'field', type: 'number', id: 'severity' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const VISIBILITY: Template = {
  id: 'journal',
  title: 'Журнал',
  tabs: [
    {
      sections: [
        {
          title: 'Секреты',
          visibility: 'gm',
          rows: [
            {
              cells: [
                { kind: 'text', text: 'GM only' },
                { kind: 'field', type: 'text', id: 'secret' },
              ],
            },
          ],
        },
        {
          title: 'Открыто',
          rows: [
            {
              visibility: 'gm',
              cells: [
                { kind: 'text', text: 'Row secret' },
                { kind: 'field', type: 'text', id: 'hidden_row' },
              ],
            },
            { cells: [{ kind: 'field', type: 'text', id: 'public' }] },
          ],
        },
      ],
    },
  ],
};

async function renderSheet(
  template: Template,
  records: ReadonlyMap<string, VersionedRecord>,
  role: 'GM' | 'PLAYER' = 'GM',
): Promise<{ container: HTMLElement; commands: Command[] }> {
  const commands: Command[] = [];
  const localValues = createLocalFieldValues();
  const container = document.createElement('div');
  const root = createRoot(container);

  // SAFETY: this harness sends only commands whose successful answer is `undefined`.
  const sendCommand = ((command: Command) => {
    commands.push(command);

    return Promise.resolve({ kind: 'answered', answer: undefined });
  }) as NonNullable<Props['editing']>['sendCommand'];

  const props: Props & { role: 'GM' | 'PLAYER' } = {
    template,
    sheetId: 'journal',
    openTab: 0,
    records,
    role,
    editing: {
      sendCommand,
      pauseMs: 0,
      pageHideFlushes: createFieldFlushes(),
      localValues,
    },
    rolling: {
      requestRoll,
      localValues,
    },
    pending: null,
  };

  document.body.append(container);
  mounted.push(root);

  await act(async () => {
    root.render(createElement(SheetBody, props));
  });

  return { container, commands };
}

function summarize(container: HTMLElement) {
  return {
    text: container.textContent,
    sectionIndexes: [...container.querySelectorAll('[data-section]')].map((node) =>
      node.getAttribute('data-section-index'),
    ),
    rowIndexes: [...container.querySelectorAll('[data-row]')].map((node) =>
      node.getAttribute('data-row-index'),
    ),
  };
}

async function enterText(
  control: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): Promise<void> {
  await act(async () => {
    const prototype =
      control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor?.set === undefined) {
      throw new Error('the environment has no text control value setter');
    }

    control.focus();
    descriptor.set.call(control, text);
    control.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    control.blur();
  });
}

function rootRecords(): ReadonlyMap<string, VersionedRecord> {
  return new Map([
    [
      'blk:journal',
      {
        k: 'blk:journal',
        d: { order: 0, cells: {} },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);
}

function repeatRecords(): ReadonlyMap<string, VersionedRecord> {
  return new Map([
    ...rootRecords(),
    [
      'blk:journal:conditions:c1',
      {
        k: 'blk:journal:conditions:c1',
        d: {
          order: 0,
          cells: { name: ['Отравлен', 1, 'seed'], severity: [2, 1, 'seed'] },
        },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);
}
