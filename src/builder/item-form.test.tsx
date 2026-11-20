import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parsePresetFile, type Preset, type PresetSection } from '@/core/preset';
import { createBuilderStore, type BuilderStore, type DraftStorage } from './builder-store';
import { moveItem, removeItem, toPreset, uidAt, WINDOW_UID } from './document';
import { ItemForm } from './item-form';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const FIELD_PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'hero',
      title: 'Hero',
      tabs: [
        {
          sections: [
            {
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'strength' }] }],
            },
          ],
        },
      ],
    },
  ],
};

const REPEAT_PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'crew',
      title: 'Экипаж',
      tabs: [
        {
          title: 'Бой',
          sections: [
            {
              title: 'Атаки',
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'field', type: 'text', id: 'nickname' },
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

const LOADED_REPEAT_PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'crew',
      title: 'Экипаж',
      tabs: [
        {
          sections: [
            {
              title: 'Атаки',
              repeat: { id: 'attacks', nameField: 'name' },
              rows: [
                {
                  cells: [{ kind: 'field', type: 'text', id: 'name' }],
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

class MemoryStorage implements DraftStorage {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

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

describe('repeat id keyboard confirmation', () => {
  const preset: Preset = {
    v: 4,
    templates: [
      {
        id: 'encounter',
        title: 'Encounter',
        tabs: [
          {
            title: 'NPCs',
            repeat: { id: 'npc', nameField: 'npc_name' },
            sections: [
              { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'npc_name' }] }] },
              {
                title: 'Attacks',
                repeat: { id: 'attack', nameField: 'attack_name' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'attack_name' }] }],
              },
            ],
          },
          {
            title: 'Bosses',
            repeat: { id: 'boss', nameField: 'boss_name' },
            sections: [
              { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'boss_name' }] }] },
              {
                repeat: { id: 'loot', nameField: 'item_name' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item_name' }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  test.each([
    ['enclosing tab', [0, 0, 1], 'npc', { id: 'attack', nameField: 'attack_name' }],
    ['nested section', [0, 0], 'attack', { id: 'npc', nameField: 'npc_name' }],
  ] as const)(
    'refuses the id of the %s but commits an id used in a separate branch',
    async (_name, path, conflict, original) => {
      // #given
      const form = await openForm(preset, path, null);
      const input = inputControl(form.container, 'Id');

      // #when
      await enterText(input, conflict);
      await pressKey(input, 'Enter');

      const refused = {
        repeat: repeatAt(form.store, path),
        invalid: input.getAttribute('aria-invalid'),
        message: liveMessages(form.container).join(' '),
      };

      await enterText(input, 'loot');
      await pressKey(input, 'Enter');

      // #then
      expect({
        refused,
        corrected: repeatAt(form.store, path),
        messages: liveMessages(form.container),
      }).toEqual({
        refused: { repeat: original, invalid: 'true', message: expect.stringContaining(conflict) },
        corrected: { id: 'loot', nameField: original.nameField },
        messages: [],
      });
    },
  );
});

describe('v4 node forms', () => {
  test.each([
    [
      'template',
      [0],
      {
        repeat: { nameField: 'nickname' },
        controls: [
          'Id:input:text',
          'Заголовок:input:text',
          'Игроки могут править:input:checkbox',
          'Повторяемая:input:checkbox',
          'Поле имени:select',
          'Видят:select',
        ],
      },
    ],
    [
      'tab',
      [0, 0],
      {
        repeat: { id: 'boy', nameField: 'nickname' },
        controls: [
          'Id:input:text',
          'Заголовок:input:text',
          'Повторяемая:input:checkbox',
          'Поле имени:select',
          'Видят:select',
        ],
      },
    ],
    [
      'section',
      [0, 0, 0],
      {
        repeat: { id: 'ataki', nameField: 'nickname' },
        controls: [
          'Id:input:text',
          'Заголовок:input:text',
          'Колонки:input:text',
          'Повторяемая:input:checkbox',
          'Поле имени:select',
          'Ширина:select',
          'Видят:select',
        ],
      },
    ],
    [
      'row',
      [0, 0, 0, 0],
      {
        repeat: { id: 'stroka_1', nameField: 'nickname' },
        controls: [
          'Id:input:text',
          'Повторяемая:input:checkbox',
          'Поле имени:select',
          'Видят:select',
        ],
      },
    ],
  ] as const)(
    'adds and edits repeat through the %s form with the applicable registry controls',
    async (_kind, path, expected) => {
      // #given
      const form = await openForm(REPEAT_PRESET, path, null);

      // #when
      const actual = await capture(async () => {
        await changeCheck(inputControl(form.container, 'Повторяемая'), true);
        await form.rerender();
        const nameField = selectControl(form.container, 'Поле имени');
        const choices = Array.from(nameField.options, (option) => option.value);
        await choose(nameField, 'nickname');

        return {
          controls: formControls(form.container),
          choices,
          repeat: repeatAt(form.store, path),
        };
      });

      // #then
      expect(actual).toEqual({
        result: {
          controls: new Set(expected.controls),
          choices: ['name', 'nickname'],
          repeat: expected.repeat,
        },
      });
    },
  );

  test('suggests a distinct repeat id from a repeated section with the same title', async () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'crew',
          title: 'Экипаж',
          tabs: [
            {
              sections: [
                {
                  title: 'Атаки',
                  repeat: { id: 'ataki', nameField: 'first' },
                  rows: [
                    {
                      cells: [{ kind: 'field', type: 'text', id: 'first' }],
                    },
                  ],
                },
                {
                  title: 'Атаки',
                  rows: [
                    {
                      cells: [{ kind: 'field', type: 'text', id: 'second' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const path = [0, 0, 1] as const;
    const form = await openForm(preset, path, null);

    // #when
    const actual = await capture(async () => {
      await changeCheck(inputControl(form.container, 'Повторяемая'), true);

      return repeatAt(form.store, path);
    });

    // #then
    expect(actual).toEqual({
      result: { id: 'ataki_2', nameField: 'second' },
    });
  });

  test('suggests unique repeat ids across plain containers in one parent repeat path', async () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'crew',
          title: 'Экипаж',
          tabs: [
            {
              title: 'Первая команда',
              sections: [
                {
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'first_row_name' }] }],
                },
                {
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'second_row_name' }] }],
                },
                {
                  title: 'Атаки',
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'first_attack' }] }],
                },
              ],
            },
            {
              title: 'Вторая команда',
              sections: [
                {
                  title: 'Атаки',
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'second_attack' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const first = await openForm(preset, [0, 0, 0, 0], null);

    // #when
    await changeCheck(inputControl(first.container, 'Повторяемая'), true);
    const second = await openForm(preset, [0, 0, 1, 0], null, first.store);
    await changeCheck(inputControl(second.container, 'Повторяемая'), true);
    const third = await openForm(preset, [0, 0, 2], null, first.store);
    await changeCheck(inputControl(third.container, 'Повторяемая'), true);
    const fourth = await openForm(preset, [0, 1, 0], null, first.store);
    await changeCheck(inputControl(fourth.container, 'Повторяемая'), true);
    const result = toPreset(first.store.$state.get().step.document);

    // #then
    expect({
      ids: [
        result.templates[0]?.tabs[0]?.sections[0]?.rows[0]?.repeat?.id,
        result.templates[0]?.tabs[0]?.sections[1]?.rows[0]?.repeat?.id,
        result.templates[0]?.tabs[0]?.sections[2]?.repeat?.id,
        result.templates[0]?.tabs[1]?.sections[0]?.repeat?.id,
      ],
      presetAccepted: parsePresetFile(JSON.stringify(result)).isOk(),
    }).toEqual({
      ids: ['stroka_1', 'stroka_1_2', 'ataki', 'ataki_2'],
      presetAccepted: true,
    });
  });

  test('uses a tab text field when repeat is enabled', async () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'crew',
          title: 'Экипаж',
          tabs: [
            {
              title: 'Pets',
              sections: [
                {
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'pet_name' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const form = await openForm(preset, [0, 0], null);

    // #when
    await changeCheck(inputControl(form.container, 'Повторяемая'), true);
    const result = toPreset(form.store.$state.get().step.document);

    // #then
    expect({
      repeat: result.templates[0]?.tabs[0]?.repeat,
      presetAccepted: parsePresetFile(JSON.stringify(result)).isOk(),
    }).toEqual({
      repeat: { id: 'pets', nameField: 'pet_name' },
      presetAccepted: true,
    });
  });

  test('offers a template only text fields outside repeat tabs', async () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'crew',
          title: 'Экипаж',
          repeat: { nameField: 'root_name' },
          tabs: [
            {
              sections: [
                {
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'root_name' }] }],
                },
              ],
            },
            {
              repeat: { id: 'npcs', nameField: 'npc_name' },
              sections: [
                {
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'npc_name' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const form = await openForm(preset, [0], null);

    // #when
    const choices = Array.from(
      selectControl(form.container, 'Поле имени').options,
      (option) => option.value,
    );

    // #then
    expect(choices).toEqual(['root_name']);
  });

  test('shows and rewrites a token id through the token form', async () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'crew',
          title: 'Экипаж',
          tabs: [
            {
              sections: [
                {
                  rows: [{ cells: [{ kind: 'token', id: 'portrait' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const form = await openForm(preset, [0, 0, 0, 0, 0], null);
    const id = inputControl(form.container, 'Id');

    // #when
    await enterText(id, 'miniature');
    await pressKey(id, 'Enter');

    // #then
    expect(toPreset(form.store.$state.get().step.document).templates[0]?.tabs[0]?.sections).toEqual(
      [
        {
          rows: [{ cells: [{ kind: 'token', id: 'miniature' }] }],
        },
      ],
    );
  });
});

describe('loaded repeat warnings', () => {
  test.each([
    ['changes its id', 'id'],
    ['turns repeat off', 'off'],
  ] as const)(
    'warns that room blocks will be erased when a loaded scope %s',
    async (_name, edit) => {
      // #given
      const loaded = await openForm(LOADED_REPEAT_PRESET, [0, 0, 0], LOADED_REPEAT_PRESET);
      const draft = await openForm(LOADED_REPEAT_PRESET, [0, 0, 0], null);
      const unrelated = await openForm(LOADED_REPEAT_PRESET, [0, 0, 0], LOADED_REPEAT_PRESET);

      // #when
      const actual = await capture(async () => {
        await editRepeat(loaded, edit);
        await editRepeat(draft, edit);
        await choose(selectControl(unrelated.container, 'Ширина'), '1/2');
        await unrelated.rerender();

        return {
          loaded: liveMessages(loaded.container),
          draft: liveMessages(draft.container),
          unrelatedLoadedEdit: liveMessages(unrelated.container),
        };
      });

      // #then
      expect(actual).toEqual({
        result: {
          loaded: ['Блоки «attacks» в комнате будут стёрты при загрузке пресета.'],
          draft: [],
          unrelatedLoadedEdit: [],
        },
      });
    },
  );

  test('keeps the warning with a loaded repeat after a preceding section is removed', async () => {
    // #given
    const preset = loadedSectionsPreset();
    const form = await openForm(preset, [0, 0, 1], preset);
    const preceding = requiredUid(form.store, [0, 0, 0]);
    form.store.edit((document) => removeItem(document, preceding));
    await form.rerender();

    // #when
    await editRepeat(form, 'id');

    // #then
    expect(liveMessages(form.container)).toEqual([
      'Блоки «attacks» в комнате будут стёрты при загрузке пресета.',
    ]);
  });

  test('does not warn when an unchanged loaded repeat section is reordered', async () => {
    // #given
    const preset = loadedSectionsPreset(true);
    const form = await openForm(preset, [0, 0, 1], preset);
    const selected = requiredUid(form.store, [0, 0, 1]);
    const first = requiredUid(form.store, [0, 0, 0]);

    // #when
    form.store.edit((document) =>
      moveItem(document, selected, { place: 'before', sibling: first }),
    );
    await form.rerender();
    const afterMove = liveMessages(form.container);
    await editRepeat(form, 'id');

    // #then
    expect({
      afterMove,
      afterEdit: liveMessages(form.container),
    }).toEqual({
      afterMove: [],
      afterEdit: ['Блоки «attacks» в комнате будут стёрты при загрузке пресета.'],
    });
  });

  test('restores the loaded repeat warning after a preceding section was removed', async () => {
    // #given
    const preset = loadedSectionsPreset();
    const storage = new MemoryStorage();
    const first = createBuilderStore(storage);
    first.open(preset, preset, 'crew');
    first.edit((document) => removeItem(document, requiredUid(first, [0, 0, 0])));

    // #when
    const restored = createBuilderStore(storage);
    const form = await openStoredForm(restored, [0, 0, 0]);
    const unchanged = liveMessages(form.container);
    await editRepeat(form, 'id');

    // #then
    expect({
      unchanged,
      afterEdit: liveMessages(form.container),
    }).toEqual({
      unchanged: [],
      afterEdit: ['Блоки «attacks» в комнате будут стёрты при загрузке пресета.'],
    });
  });

  test('restores the warning identity of a loaded repeat after sections were reordered', async () => {
    // #given
    const preset = loadedSectionsPreset(true);
    const storage = new MemoryStorage();
    const first = createBuilderStore(storage);
    first.open(preset, preset, 'crew');
    const notes = requiredUid(first, [0, 0, 0]);
    const attacks = requiredUid(first, [0, 0, 1]);
    first.edit((document) => moveItem(document, attacks, { place: 'before', sibling: notes }));

    // #when
    const restored = createBuilderStore(storage);
    const form = await openStoredForm(restored, [0, 0, 0]);
    const unchanged = liveMessages(form.container);
    await editRepeat(form, 'id');

    // #then
    expect({
      unchanged,
      afterEdit: liveMessages(form.container),
    }).toEqual({
      unchanged: [],
      afterEdit: ['Блоки «attacks» в комнате будут стёрты при загрузке пресета.'],
    });
  });

  test('keeps loaded repeat warning identity when custom window size is turned off', async () => {
    // #given
    const preset: Preset = {
      ...loadedSectionsPreset(),
      window: { width: 900, height: 700 },
    };

    const store = createBuilderStore(new MemoryStorage());
    store.open(preset, preset, 'crew');
    const windowForm = await openStoredSelection(store, WINDOW_UID);

    // #when
    await changeCheck(inputControl(windowForm.container, 'Свой размер окна'), false);
    const form = await openStoredForm(store, [0, 0, 1]);
    const unchanged = liveMessages(form.container);
    await editRepeat(form, 'id');

    // #then
    expect({
      unchanged,
      afterEdit: liveMessages(form.container),
    }).toEqual({
      unchanged: [],
      afterEdit: ['Блоки «attacks» в комнате будут стёрты при загрузке пресета.'],
    });
  });

  test.each([
    ['changes its id', 'id'],
    ['turns repeat off', 'off'],
  ] as const)(
    'warns that room blocks will be erased when a loaded repeat template %s',
    async (_name, edit) => {
      // #given
      const preset: Preset = {
        v: 4,
        templates: [
          {
            id: 'crew',
            title: 'Экипаж',
            repeat: { nameField: 'name' },
            tabs: [
              {
                sections: [
                  {
                    rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const form = await openForm(preset, [0], preset);

      // #when
      await editRepeat(form, edit);

      // #then
      expect(liveMessages(form.container)).toEqual([
        'Блоки «crew» в комнате будут стёрты при загрузке пресета.',
      ]);
    },
  );
});

type FieldForm = {
  input: HTMLInputElement;
  store: BuilderStore;
};

async function openFieldForm(): Promise<FieldForm> {
  const form = await openForm(FIELD_PRESET, [0, 0, 0, 0, 0], null);
  const input = form.container.querySelector<HTMLInputElement>('input[autocomplete="off"]');

  if (input === null) {
    throw new Error('the public item form has no field id input');
  }

  return { input, store: form.store };
}

type OpenForm = {
  container: HTMLDivElement;
  rerender: () => Promise<void>;
  store: BuilderStore;
};

async function openForm(
  preset: Preset,
  path: readonly number[],
  origin: Preset | null,
  existingStore?: BuilderStore,
): Promise<OpenForm> {
  const store = existingStore ?? createBuilderStore(null);

  if (existingStore === undefined) {
    store.open(preset, origin, 'preset');
  }

  const selection = uidAt(store.$state.get().step.document, path);

  if (selection === null) {
    throw new Error(`the form fixture has no item at ${path.join('.')}`);
  }

  return openSelection(store, selection, origin);
}

async function openStoredForm(store: BuilderStore, path: readonly number[]): Promise<OpenForm> {
  const selection = uidAt(store.$state.get().step.document, path);

  if (selection === null) {
    throw new Error(`the restored form fixture has no item at ${path.join('.')}`);
  }

  return openStoredSelection(store, selection);
}

async function openStoredSelection(store: BuilderStore, selection: string): Promise<OpenForm> {
  return openSelection(store, selection, store.$state.get().step.origin);
}

async function openSelection(
  store: BuilderStore,
  selection: string,
  origin: Preset | null,
): Promise<OpenForm> {
  const container = documentNode();
  const root = createRoot(container);
  mounted.push(root);

  const rerender = async (): Promise<void> => {
    await act(async () => {
      root.render(
        <ItemForm
          store={store}
          document={store.$state.get().step.document}
          origin={origin}
          selection={selection}
          problems={[]}
        />,
      );
    });
  };

  await rerender();

  return { container, rerender, store };
}

function loadedSectionsPreset(bothRepeat = false): Preset {
  const first: PresetSection = {
    title: 'Заметки',
    rows: [{ cells: [{ kind: 'field', type: 'text', id: 'note' }] }],
  };

  if (bothRepeat) {
    first.repeat = { id: 'notes', nameField: 'note' };
  }

  return {
    v: 4,
    templates: [
      {
        id: 'crew',
        title: 'Экипаж',
        tabs: [
          {
            sections: [
              first,
              {
                title: 'Атаки',
                repeat: { id: 'attacks', nameField: 'attack' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'attack' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function requiredUid(store: BuilderStore, path: readonly number[]): string {
  const found = uidAt(store.$state.get().step.document, path);

  if (found === null) {
    throw new Error(`the form fixture has no item at ${path.join('.')}`);
  }

  return found;
}

function documentNode(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.append(container);

  return container;
}

function labeledControl(container: HTMLElement, label: string): HTMLElement | null {
  const owner = Array.from(container.querySelectorAll('label')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  return owner?.control ?? null;
}

function inputControl(container: HTMLElement, label: string): HTMLInputElement {
  const found = labeledControl(container, label);

  if (!(found instanceof HTMLInputElement)) {
    throw new Error(`the public item form has no "${label}" input`);
  }

  return found;
}

function selectControl(container: HTMLElement, label: string): HTMLSelectElement {
  const found = labeledControl(container, label);

  if (!(found instanceof HTMLSelectElement)) {
    throw new Error(`the public item form has no "${label}" select`);
  }

  return found;
}

function formControls(container: HTMLElement): Set<string> {
  const controls = Array.from(container.querySelectorAll('label')).flatMap((label) => {
    const owned = label.control;

    if (!(owned instanceof HTMLInputElement || owned instanceof HTMLSelectElement)) {
      return [];
    }

    const kind = owned instanceof HTMLSelectElement ? 'select' : `input:${owned.type}`;

    return [`${label.textContent?.trim() ?? ''}:${kind}`];
  });

  return new Set(controls);
}

type RepeatValue = { id: string; nameField: string } | { nameField: string } | undefined;

function repeatAt(store: BuilderStore, path: readonly number[]): RepeatValue {
  const preset = toPreset(store.$state.get().step.document);
  const template = preset.templates[path[0] ?? -1];

  if (path.length === 1) {
    return template?.repeat;
  }

  const tab = template?.tabs[path[1] ?? -1];

  if (path.length === 2) {
    return tab?.repeat;
  }

  const section = tab?.sections[path[2] ?? -1];

  if (path.length === 3) {
    return section?.repeat;
  }

  return section?.rows[path[3] ?? -1]?.repeat;
}

function liveMessages(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[aria-live]'))
    .map((region) => region.textContent?.trim() ?? '')
    .filter((message) => message !== '');
}

function fieldId(store: BuilderStore): string | null {
  const cell =
    store.$state.get().step.document.templates[0]?.tabs[0]?.sections[0]?.rows[0]?.cells[0];

  return cell?.kind === 'field' ? cell.id : null;
}

async function changeCheck(input: HTMLInputElement, checked: boolean): Promise<void> {
  await act(async () => {
    if (input.checked !== checked) {
      input.click();
    }
  });
}

async function choose(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function editRepeat(form: OpenForm, edit: 'id' | 'off'): Promise<void> {
  if (edit === 'id') {
    const id = inputControl(form.container, 'Id');
    await enterText(id, 'moves');
    await pressKey(id, 'Enter');
  } else {
    await changeCheck(inputControl(form.container, 'Повторяемая'), false);
  }

  await form.rerender();
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

async function capture<Result>(
  operation: () => Promise<Result>,
): Promise<{ result: Result } | { threw: string }> {
  try {
    return { result: await operation() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}
