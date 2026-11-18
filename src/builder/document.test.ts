import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parsePresetFile,
  type Preset,
  type PresetRow,
  type PresetSection,
  type PresetTab,
} from '@/core/preset';
import {
  acceptsDrop,
  addCell,
  addRow,
  addSection,
  addTab,
  addTemplate,
  ancestorUids,
  EMPTY_DOCUMENT,
  findCell,
  formulaFieldIds,
  fromPreset,
  moveItem,
  nameFieldCandidates,
  removeItem,
  renameField,
  scopeFieldIds,
  toPreset,
  treeOrder,
  uidAt,
  updateCell,
  updateTab,
  withTemplateKind,
  WINDOW_UID,
  type BuilderDocument,
  type DocumentEdit,
} from './document';
import { builderProblems } from './problems';

const EXAMPLE = readPreset(join(import.meta.dir, '../../docs/example-preset.json'));
const D20 = readPreset(join(import.meta.dir, '../../tests/fixtures/presets/d20.json'));

function readPreset(path: string): Preset {
  const parsed = parsePresetFile(readFileSync(path, 'utf8'));

  if (!parsed.ok) {
    throw new Error(`${path} is no preset`);
  }

  return parsed.value;
}

function applied(edit: DocumentEdit | null): DocumentEdit {
  if (edit === null) {
    throw new Error('The edit changed nothing');
  }

  return edit;
}

function uid(document: BuilderDocument, ...path: number[]): string {
  const found = uidAt(document, path);

  if (found === null) {
    throw new Error(`No item at ${path.join('.')}`);
  }

  return found;
}

describe('fromPreset and toPreset', () => {
  test.each([
    ['the example', EXAMPLE],
    ['d20', D20],
  ])('give back %s as it was', (_name, preset) => {
    // #when
    const back = toPreset(fromPreset(preset));
    // #then
    expect(back).toEqual(preset);
    expect(JSON.stringify(back)).not.toContain('uid');
  });
  test('keeps a select field and its options through the builder document', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'inventory',

          title: 'Инвентарь',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'text', text: 'Броня' },
                        {
                          kind: 'field',
                          type: 'select',
                          id: 'armor',
                          options: ['Без доспеха', 'Кожаная'],
                        },
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

    // #when
    const back = toPreset(fromPreset(preset));
    const actual: unknown = back;
    // #then
    expect(actual).toEqual({
      v: 4,
      templates: [
        {
          id: 'inventory',
          title: 'Инвентарь',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'text', text: 'Броня' },
                        {
                          kind: 'field',
                          type: 'select',
                          id: 'armor',
                          options: ['Без доспеха', 'Кожаная'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });
  test('keeps a dice-choice field and its options through the builder document', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'weapons',

          title: 'Оружие',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'text', text: 'Урон' },
                        {
                          kind: 'field',
                          type: 'dice-choice',
                          id: 'weapon_die',
                          options: ['d4', 'd6', 'd8'],
                        },
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

    // #when
    const back = toPreset(fromPreset(preset));
    // #then
    expect(back).toEqual(preset);
  });
  test('keeps field and dice cell names through the builder document', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'pc',

          title: 'Лист',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        {
                          kind: 'field',
                          type: 'number',
                          id: 'hp_max',
                          name: 'HP, максимум',
                        },
                        {
                          kind: 'dice',
                          formula: '1d20 <= hp_max',
                          name: 'Спасбросок HP',
                        },
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

    // #when
    const back = toPreset(fromPreset(preset));
    // #then
    expect(back).toEqual(preset);
  });
  test('puts a blank field name problem on that field in the builder', () => {
    // #given
    const preset: Preset = {
      v: 4,
      templates: [
        {
          id: 'pc',

          title: 'Лист',
          tabs: [
            {
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        {
                          kind: 'field',
                          type: 'number',
                          id: 'hp',
                          name: '  ',
                        },
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

    const document = fromPreset(preset);
    // #when
    const problems = builderProblems(document);
    const actual: unknown = problems;
    // #then
    expect(actual).toEqual([
      {
        uid: uid(document, 0, 0, 0, 0, 0),
        failure: { code: 'blank-name', detail: 'hp', cell: 'field' },
      },
    ]);
  });
});

describe('addTemplate', () => {
  test('a new sheet set passes the checks, named by a text field from its label', () => {
    // #when
    const { document, changed } = addTemplate(EMPTY_DOCUMENT, 'set');
    // #then
    expect(toPreset(document).templates).toEqual([
      {
        id: 'nabor',
        title: 'Набор',
        repeat: { nameField: 'imya' },
        tabs: [
          {
            sections: [
              {
                rows: [
                  {
                    cells: [
                      { kind: 'text', text: 'Имя' },
                      { kind: 'field', type: 'text', id: 'imya' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(changed).toBe(uid(document, 0));
    expect(builderProblems(document)).toEqual([]);
  });
  test('a second template takes a unique id', () => {
    // #given
    const first = addTemplate(EMPTY_DOCUMENT, 'single').document;
    // #when
    const { document } = addTemplate(first, 'single');
    // #then
    expect(document.templates.map((template) => template.id)).toEqual([
      'odinochnyy_list',
      'odinochnyy_list_2',
    ]);
    expect(builderProblems(document)).toEqual([]);
  });
});

describe('addCell', () => {
  test('a field after the label "Сила" takes the id sila, and keeps it when the label changes', () => {
    // #given
    let document = addTemplate(EMPTY_DOCUMENT, 'single').document;
    const section = uid(document, 0, 0, 0);
    document = applied(addRow(document, section)).document;
    const row = uid(document, 0, 0, 0, 0);
    document = applied(addCell(document, row, 'text')).document;
    const label = uid(document, 0, 0, 0, 0, 0);
    document = applied(
      updateCell(document, label, (cell) => ({ ...cell, kind: 'text', text: 'Сила' })),
    ).document;
    // #when
    const added = applied(addCell(document, row, 'field'));

    const relabeled = applied(
      updateCell(added.document, label, (cell) => ({ ...cell, kind: 'text', text: 'Ловкость' })),
    ).document;

    // #then
    expect(findCell(added.document, added.changed)).toMatchObject({ kind: 'field', id: 'sila' });
    expect(findCell(relabeled, added.changed)).toMatchObject({ kind: 'field', id: 'sila' });
  });
  test('a field with no label before it is field, unique in its scope', () => {
    // #given
    let document = addTemplate(EMPTY_DOCUMENT, 'single').document;
    document = applied(addRow(document, uid(document, 0, 0, 0))).document;
    const row = uid(document, 0, 0, 0, 0);
    document = applied(addCell(document, row, 'field')).document;
    // #when
    const added = applied(addCell(document, row, 'field'));
    // #then
    expect(findCell(added.document, added.changed)).toMatchObject({ id: 'field_2' });
  });
  test('token ids are unique beside other token ids in their scope', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'crew',
          title: 'Экипаж',
          tabs: [
            {
              sections: [
                {
                  rows: [{ cells: [{ kind: 'token', id: 'token' }] }],
                },
              ],
            },
          ],
        },
      ],
    });

    const row = uid(document, 0, 0, 0, 0);

    // #when
    const second = applied(addCell(document, row, 'token'));
    const third = applied(addCell(second.document, row, 'token'));

    // #then
    expect(toPreset(third.document).templates[0]?.tabs[0]?.sections[0]?.rows[0]?.cells).toEqual([
      { kind: 'token', id: 'token' },
      { kind: 'token', id: 'token_2' },
      { kind: 'token', id: 'token_3' },
    ]);
  });
});

describe('moveItem', () => {
  test('moves a row out of a repeat section into another section, uids kept', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'inv',

          title: 'Инвентарь',
          tabs: [
            {
              sections: [
                { rows: [] },
                {
                  repeat: { id: 'item', nameField: 'item' },
                  rows: [
                    { cells: [{ kind: 'field', type: 'text', id: 'item' }] },
                    { cells: [{ kind: 'field', type: 'number', id: 'money' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const money = uid(document, 0, 0, 1, 1);

    // #when
    const moved = applied(
      moveItem(document, money, { place: 'into', parent: uid(document, 0, 0, 0) }),
    );

    // #then
    expect(moved.changed).toBe(money);
    expect(uidAt(moved.document, [0, 0, 0, 0])).toBe(money);
    expect(toPreset(moved.document).templates[0]?.tabs[0]?.sections).toEqual([
      { rows: [{ cells: [{ kind: 'field', type: 'number', id: 'money' }] }] },
      {
        repeat: { id: 'item', nameField: 'item' },
        rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item' }] }],
      },
    ]);
  });
  test('moves a template before another', () => {
    // #given
    const document = fromPreset(D20);
    const last = uid(document, D20.templates.length - 1);
    // #when
    const moved = applied(moveItem(document, last, { place: 'before', sibling: uid(document, 0) }));
    // #then
    expect(moved.document.templates.map((template) => template.id)).toEqual([
      'gm_notes',
      'pc',
      'npc',
      'inventory',
      'journal',
    ]);
  });
  test('refuses a drop into a container of another kind', () => {
    // #given
    const document = fromPreset(D20);
    // #then
    expect(acceptsDrop(document, 'row', { place: 'into', parent: uid(document, 0) })).toBe(false);
    expect(
      acceptsDrop(document, 'cell', { place: 'before', sibling: uid(document, 0, 0, 0) }),
    ).toBe(false);
    expect(acceptsDrop(document, 'template', { place: 'into', parent: null })).toBe(true);
    expect(
      moveItem(document, uid(document, 0, 0, 0, 0), { place: 'into', parent: uid(document, 0) }),
    ).toBeNull();
  });
});

describe('removeItem', () => {
  test('removes an item, and its container becomes the changed item', () => {
    // #given
    const document = fromPreset(D20);
    const cell = uid(document, 0, 0, 0, 0, 0);
    // #when
    const removed = applied(removeItem(document, cell));
    // #then
    expect(removed.changed).toBe(uid(document, 0, 0, 0, 0));
    const sourceRow = D20.templates[0]?.tabs[0]?.sections[0]?.rows[0];

    if (sourceRow === undefined) throw new Error('Expected the d20 fixture to have its first row');
    expect(toPreset(removed.document).templates[0]?.tabs[0]?.sections[0]?.rows[0]).toEqual({
      ...sourceRow,
      cells: sourceRow.cells.slice(1),
    });
  });
  test('cannot remove the window', () => {
    // #then
    expect(removeItem(fromPreset(D20), WINDOW_UID)).toBeNull();
  });
});

describe('renameField', () => {
  test('rewrites the formulas, follows the name field and keeps every uid', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'pc',

          title: 'Экипаж',
          repeat: { nameField: 'name' },
          tabs: [
            {
              sections: [
                {
                  rows: [
                    { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                    {
                      cells: [
                        { kind: 'field', type: 'number', id: 'str' },
                        { kind: 'field', type: 'number', id: 'str_tired' },
                        { kind: 'dice', formula: '1d20 <= str - 2*str_tired' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const order = treeOrder(document);
    // #when
    const renamed = renameField(document, uid(document, 0, 0, 0, 1, 0), 'strength');
    // #then
    expect(renamed?.formulas).toBe(1);
    expect(treeOrder(renamed?.document ?? EMPTY_DOCUMENT)).toEqual(order);
    expect(
      toPreset(renamed?.document ?? EMPTY_DOCUMENT).templates[0]?.tabs[0]?.sections[0]?.rows[1],
    ).toEqual({
      cells: [
        { kind: 'field', type: 'number', id: 'strength' },
        { kind: 'field', type: 'number', id: 'str_tired' },
        { kind: 'dice', formula: '1d20 <= strength - 2*str_tired' },
      ],
    });
    // #when
    const name = renameField(document, uid(document, 0, 0, 0, 0, 0), 'imya');
    // #then
    expect(name?.document.templates[0]).toMatchObject({ repeat: { nameField: 'imya' } });
  });

  test.each(['tab', 'section', 'row'] as const)(
    'keeps a renamed field as the %s repeat name field in a valid preset',
    (scope) => {
      // #given
      const document = fromPreset(repeatNameFieldPreset(scope));

      // #when
      const renamed = renameField(document, uid(document, 0, 0, 0, 0, 0), 'label');
      const preset = toPreset(renamed?.document ?? EMPTY_DOCUMENT);
      const tab = preset.templates[0]?.tabs[0];
      const section = tab?.sections[0];

      const repeat =
        scope === 'tab'
          ? tab?.repeat
          : scope === 'section'
            ? section?.repeat
            : section?.rows[0]?.repeat;

      // #then
      expect({
        nameField: repeat?.nameField,
        presetAccepted: parsePresetFile(JSON.stringify(preset)).ok,
      }).toEqual({
        nameField: 'label',
        presetAccepted: true,
      });
    },
  );
});

function repeatNameFieldPreset(scope: 'tab' | 'section' | 'row'): Preset {
  const repeat = { id: 'entries', nameField: 'name' };

  const row: PresetRow = {
    cells: [{ kind: 'field', type: 'text', id: 'name' }],
  };

  const section: PresetSection = { rows: [row] };

  const tab: PresetTab = { sections: [section] };

  if (scope === 'tab') tab.repeat = repeat;

  if (scope === 'section') section.repeat = repeat;

  if (scope === 'row') row.repeat = repeat;

  return { v: 4, templates: [{ id: 'notes', title: 'Заметки', tabs: [tab] }] };
}

describe('withTemplateKind', () => {
  test('a single sheet that becomes a sheet set is named by its first text field', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'npc',

          title: 'NPC',
          players: 'edit',
          tabs: [
            { sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'who' }] }] }] },
          ],
        },
      ],
    });

    const template = document.templates[0];

    if (template === undefined) {
      throw new Error('No template');
    }

    // #when
    const set = withTemplateKind(template, 'set');
    const back = withTemplateKind(set, 'single');
    // #then
    expect(set).toMatchObject({ repeat: { nameField: 'who' } });
    expect(set).not.toHaveProperty('players');
    expect(back).not.toHaveProperty('repeat');
  });
});

describe('ancestorUids', () => {
  test('lists the item, then its containers up to its template', () => {
    // #given
    const document = fromPreset(D20);
    // #when
    const chain = ancestorUids(document, uid(document, 0, 0, 1, 0, 0));
    // #then
    expect(chain).toEqual([
      uid(document, 0, 0, 1, 0, 0),
      uid(document, 0, 0, 1, 0),
      uid(document, 0, 0, 1),
      uid(document, 0, 0),
      uid(document, 0),
    ]);
  });
});

describe('addSection', () => {
  test('adds an empty section at the end of its template', () => {
    // #given
    const document = fromPreset(D20);
    // #when
    const added = applied(addSection(document, uid(document, 0, 0)));
    // #then
    expect(toPreset(added.document).templates[0]?.tabs[0]?.sections.at(-1)).toEqual({ rows: [] });
  });
});

describe('addTab', () => {
  test('adds an empty untitled tab at the end of its template, and the tree shows the tab level', () => {
    // #given
    const document = fromPreset(D20);
    const template = uid(document, 0);
    // #when
    const added = applied(addTab(document, template));
    // #then
    const tabs = toPreset(added.document).templates[0]?.tabs;
    expect(tabs?.length).toBe(2);
    expect(tabs?.[1]).toEqual({ sections: [] });
    expect(uidAt(added.document, [0, 1])).toBe(added.changed);
    expect(ancestorUids(added.document, added.changed)).toEqual([added.changed, template]);
  });
  test('moves a section into the new tab, and the file keeps every section on its tab', () => {
    // #given
    const document = fromPreset(D20);
    const added = applied(addTab(document, uid(document, 0)));
    const first = uid(added.document, 0, 0);

    const named = applied(
      updateTab(added.document, first, (tab) => ({ ...tab, title: 'Основное' })),
    );

    const titled = applied(
      updateTab(named.document, added.changed, (tab) => ({ ...tab, title: 'Бой' })),
    );

    const section = uid(titled.document, 0, 0, 1);

    // #when
    const moved = applied(
      moveItem(titled.document, section, { place: 'into', parent: added.changed }),
    );

    // #then
    const parsed = parsePresetFile(JSON.stringify(toPreset(moved.document)));
    const tabs = parsed.ok ? parsed.value.templates[0]?.tabs : null;
    expect(uidAt(moved.document, [0, 1, 0])).toBe(section);
    expect(tabs?.map((tab) => tab.title)).toEqual(['Основное', 'Бой']);
    expect(tabs?.[1]?.sections.map((one) => one.title)).toEqual(['Характеристики']);
    expect(tabs?.[0]?.sections.map((one) => one.title)).toEqual(['Персонаж', 'Хиты', 'Атаки']);
  });
  test('takes a section into a tab only, and a tab into a template only', () => {
    // #given
    const document = fromPreset(D20);
    // #then
    expect(acceptsDrop(document, 'section', { place: 'into', parent: uid(document, 0, 0) })).toBe(
      true,
    );
    expect(acceptsDrop(document, 'section', { place: 'into', parent: uid(document, 0) })).toBe(
      false,
    );
    expect(acceptsDrop(document, 'tab', { place: 'into', parent: uid(document, 1) })).toBe(true);
    expect(acceptsDrop(document, 'tab', { place: 'into', parent: uid(document, 0, 0) })).toBe(
      false,
    );
  });
});

describe('field ids across tabs', () => {
  // CAP-34: "name" and "str" sit on tab 1; tab 2 holds the text field "nick" and a repeat section.
  const document = fromPreset({
    templates: [
      {
        id: 'pc',

        title: 'Экипаж',
        repeat: { nameField: 'name' },
        tabs: [
          {
            title: 'Основное',
            sections: [
              {
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'name' },
                      { kind: 'field', type: 'number', id: 'str' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            title: 'Бой',
            sections: [
              { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'nick' }] }] },
              {
                repeat: { id: 'item', nameField: 'item' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item' }] }],
              },
            ],
          },
        ],
      },
    ],
  });

  const template = document.templates[0];
  test('the scope of a section on tab 2 holds the fields of tab 1', () => {
    // #when
    const ids = template === undefined ? null : scopeFieldIds(template, { tab: 1, section: 0 });
    // #then
    expect(ids).toEqual(new Set(['name', 'str', 'nick']));
  });
  test('a formula in a repeat section on tab 2 reads its own fields, then the fields of every tab', () => {
    // #when
    const ids = template === undefined ? null : formulaFieldIds(template, { tab: 1, section: 1 });
    // #then
    expect(ids).toEqual(['item', 'name', 'str', 'nick']);
  });
  test('the name field candidates take a text field on tab 2', () => {
    // #when
    const ids = template === undefined ? null : nameFieldCandidates(template);
    // #then
    expect(ids).toEqual(['name', 'nick']);
  });
});
