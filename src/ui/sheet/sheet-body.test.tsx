import { afterEach, expect, test } from 'bun:test';
import { createElement, type ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { blockAddress } from '@/core/block-address';
import type { LinkTarget } from '@/core/link-target';
import type { RenderedTab, Template } from '@/core/preset';
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

type RollRequest = Parameters<Props['rolling']['requestRoll']>[0];

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
      block: { sheetId: 'journal', path: ['conditions', expect.any(String)] },
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
      target: { kind: 'rep', block: { sheetId: 'journal', path: ['conditions', 'c1'] } },
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
      block: { sheetId: 'journal', path: ['conditions', 'c1'] },
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

test('a plain row in a repeat tab carries the tab block to its field and dice consumers', async () => {
  // #given
  const requests: RollRequest[] = [];

  const view = await renderSheet(TAB_BLOCK, tabBlockRecords(), 'GM', {
    renderedTab: nestedRenderedTab(),
    requestRoll: async (request) => {
      requests.push(request);

      return { kind: 'answered', answer: { code: 'rolled' } };
    },
  });

  const field = controlNamed(view.container, 'hp');
  const die = buttonNamed(view.container, 'Проверка хитов');

  // #when
  await act(async () => die.click());
  await enterText(field, '9');

  // #then
  expect({ command: view.commands.at(-1), request: requests.at(-1) }).toEqual({
    command: {
      type: 'field-patch',
      sheetId: 'npc',
      target: { kind: 'rep', block: address('npc', ['npc', 'a']) },
      fieldId: 'hp',
      value: 9,
    },
    request: {
      sheetId: 'npc',
      place: {
        tabIndex: 0,
        sectionIndex: 0,
        rowIndex: 0,
        cellIndex: 2,
        instanceId: 'a',
        path: ['npc', 'a'],
      },
      shown: {},
    },
  });
});

test('a nested row carries one address to field, dice and token consumers', async () => {
  // #given
  const requests: RollRequest[] = [];
  const opened: LinkTarget[] = [];

  const view = await renderSheet(NESTED, nestedRecords(), 'GM', {
    requestRoll: async (request) => {
      requests.push(request);

      return { kind: 'answered', answer: { code: 'rolled' } };
    },
    blockTools: {
      linkedTargets: new Set(),
      open: (target) => opened.push(target),
      sendCommand: async () => ({ kind: 'answered', answer: undefined }),
    },
  });

  const field = controlNamed(view.container, 'attack_name');
  const die = buttonNamed(view.container, 'Урон');
  const token = buttonNamed(view.container, copy.command.linkSheet);

  // #when
  await act(async () => die.click());
  await enterText(field, 'Когти');
  await act(async () => token.click());

  // #then
  expect({
    command: view.commands.at(-1),
    request: requests.at(-1),
    target: opened.at(-1),
  }).toEqual({
    command: {
      type: 'field-patch',
      sheetId: 'npc',
      target: { kind: 'rep', block: address('npc', ['npc', 'a', 'attack', 'x']) },
      fieldId: 'attack_name',
      value: 'Когти',
    },
    request: {
      sheetId: 'npc',
      place: {
        tabIndex: 0,
        sectionIndex: 0,
        rowIndex: 1,
        cellIndex: 2,
        instanceId: 'x',
        path: ['npc', 'a', 'attack', 'x'],
      },
      shown: {},
    },
    target: {
      block: address('npc', ['npc', 'a', 'attack', 'x']),
      cellId: 'portrait',
    },
  });
});

test('nested add and delete commands preserve their parent and block addresses', async () => {
  // #given
  const view = await renderSheet(NESTED, nestedRecords());
  const addName = copy.label.addToSection('Противники');
  const parentBlock = groupNamed(view.container, 'Alpha');
  const nestedBlock = groupNamed(parentBlock, 'Клык');
  const nestedAdd = buttonNamed(parentBlock, addName);
  const nestedDelete = buttonNamed(nestedBlock, copy.label.deleteBlock(1));

  const outerAdd = buttonsNamed(view.container, addName).find(
    (button) => !parentBlock.contains(button),
  );

  if (outerAdd === undefined) {
    throw new Error(`the sheet has no outer button named "${addName}"`);
  }

  // #when
  await act(async () => nestedAdd.click());
  await act(async () => nestedDelete.click());

  // #then
  expect({
    commands: view.commands,
    outerAddAfterBlocks: Boolean(
      parentBlock.compareDocumentPosition(outerAdd) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  }).toEqual({
    commands: [
      {
        type: 'repeat-block-add',
        sheetId: 'npc',
        block: {
          sheetId: 'npc',
          path: ['npc', 'a', 'attack', expect.any(String)],
        },
      },
      {
        type: 'repeat-block-delete',
        sheetId: 'npc',
        block: address('npc', ['npc', 'a', 'attack', 'x']),
      },
    ],
    outerAddAfterBlocks: true,
  });
});

test('nested duplicate sends the address of the rendered block unchanged', async () => {
  // #given
  const duplicateCommands: Command[] = [];

  const view = await renderSheet(NESTED, nestedRecords(), 'GM', {
    blockTools: {
      linkedTargets: new Set(),
      open: () => undefined,
      sendCommand: async (command) => {
        duplicateCommands.push(command);

        return { kind: 'answered', answer: undefined };
      },
    },
  });

  // #when
  await act(async () => lastButtonNamed(view.container, copy.label.duplicateBlock(1)).click());
  await act(async () => buttonNamed(view.container, copy.command.confirmDuplicate).click());

  // #then
  expect(duplicateCommands).toEqual([
    {
      type: 'repeat-block-duplicate',
      sheetId: 'npc',
      block: address('npc', ['npc', 'a', 'attack', 'x']),
      count: 1,
    },
  ]);
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

const NESTED: Template = {
  id: 'npc',
  title: 'NPC',
  tabs: [
    {
      title: 'Противники',
      sections: [
        {
          title: 'Противники',
          repeat: { id: 'npc', nameField: 'name' },
          rows: [
            {
              cells: [{ kind: 'field', type: 'text', id: 'name' }],
            },
            {
              repeat: { id: 'attack', nameField: 'attack_name' },
              cells: [
                { kind: 'field', type: 'text', id: 'attack_name' },
                { kind: 'token', id: 'portrait' },
                { kind: 'dice', formula: '1d6', name: 'Урон' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const TAB_BLOCK: Template = {
  id: 'npc',
  title: 'NPC',
  tabs: [
    {
      title: 'Противники',
      repeat: { id: 'npc', nameField: 'name' },
      sections: [
        {
          title: 'Основное',
          rows: [
            {
              cells: [
                { kind: 'field', type: 'number', id: 'hp' },
                { kind: 'text', text: 'Проверка хитов' },
                { kind: 'dice', formula: '1d20 + hp', name: 'Проверка хитов' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

type RenderOptions = {
  renderedTab?: RenderedTab;
  requestRoll?: Props['rolling']['requestRoll'];
  blockTools?: NonNullable<Props['blockTools']>;
};

async function renderSheet(
  template: Template,
  records: ReadonlyMap<string, VersionedRecord>,
  role: 'GM' | 'PLAYER' = 'GM',
  options: RenderOptions = {},
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
    sheetId: template.id,
    openTab: 0,
    renderedTab: options.renderedTab,
    records,
    role,
    editing: {
      sendCommand,
      pauseMs: 0,
      pageHideFlushes: createFieldFlushes(),
      localValues,
    },
    rolling: {
      requestRoll: options.requestRoll ?? requestRoll,
      localValues,
    },
    pending: null,
    blockTools: options.blockTools,
  };

  document.body.append(container);
  mounted.push(root);

  await act(async () => {
    root.render(createElement(SheetBody, props));
  });

  return { container, commands };
}

function nestedRenderedTab(): RenderedTab {
  const tab = TAB_BLOCK.tabs[0];

  if (tab === undefined) throw new Error('fixture must have a tab');

  return {
    sourceIndex: 0,
    tab,
    block: {
      block: address('npc', ['npc', 'a']),
      name: 'Alpha',
    },
  };
}

function tabBlockRecords(): ReadonlyMap<string, VersionedRecord> {
  return new Map<string, VersionedRecord>([
    [
      'blk:npc',
      {
        k: 'blk:npc',
        d: { order: 0, cells: {} },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
    [
      'blk:npc:npc:a',
      {
        k: 'blk:npc:npc:a',
        d: { order: 0, cells: { name: ['Alpha', 1, 'seed'], hp: [7, 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);
}

function nestedRecords(): ReadonlyMap<string, VersionedRecord> {
  return new Map<string, VersionedRecord>([
    [
      'blk:npc',
      {
        k: 'blk:npc',
        d: { order: 0, cells: {} },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
    [
      'blk:npc:npc:a',
      {
        k: 'blk:npc:npc:a',
        d: { order: 0, cells: { name: ['Alpha', 1, 'seed'], hp: [7, 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
    [
      'blk:npc:npc:a:attack:x',
      {
        k: 'blk:npc:npc:a:attack:x',
        d: { order: 0, cells: { attack_name: ['Клык', 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);
}

function address(sheetId: string, path: readonly string[]) {
  const block = blockAddress(sheetId, path);

  if (block === null) throw new Error('fixture must be a block address');

  return block;
}

function controlNamed(
  container: HTMLElement,
  name: string,
): HTMLInputElement | HTMLTextAreaElement {
  const control = [...container.querySelectorAll('textarea, input')].find(
    (candidate) => candidate.getAttribute('aria-label') === name,
  );

  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    throw new Error(`the sheet has no text control named "${name}"`);
  }

  return control;
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement {
  const button = buttonsNamed(container, name)[0];

  if (button === undefined) {
    throw new Error(`the sheet has no button named "${name}"`);
  }

  return button;
}

function groupNamed(container: HTMLElement, name: string): HTMLElement {
  const group = [
    ...container.querySelectorAll<HTMLElement>('[role="group"], fieldset[aria-label]'),
  ].find((candidate) => candidate.getAttribute('aria-label') === name);

  if (group === undefined) {
    throw new Error(`the sheet has no group named "${name}"`);
  }

  return group;
}

function lastButtonNamed(container: HTMLElement, name: string): HTMLButtonElement {
  const button = buttonsNamed(container, name).at(-1);

  if (button === undefined) {
    throw new Error(`the sheet has no button named "${name}"`);
  }

  return button;
}

function buttonsNamed(container: HTMLElement, name: string): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter(
    (candidate) =>
      candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name,
  );
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
