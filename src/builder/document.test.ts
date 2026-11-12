import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parsePresetFile, type Preset } from '@/core/preset';

import {
  acceptsDrop,
  addCell,
  addRow,
  addSection,
  addTemplate,
  ancestorUids,
  EMPTY_DOCUMENT,
  findCell,
  fromPreset,
  moveItem,
  removeItem,
  renameField,
  toPreset,
  treeOrder,
  uidAt,
  updateCell,
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
      v: 2,
      templates: [
        {
          id: 'inventory',
          kind: 'single',
          title: 'Инвентарь',
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Броня' },
                  {
                    kind: 'field',
                    type: 'select',
                    id: 'armor',
                    options: ['Без доспеха', 'Кожаная'],
                  },
                ],
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
      v: 2,
      templates: [
        {
          id: 'inventory',
          kind: 'single',
          title: 'Инвентарь',
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Броня' },
                  {
                    kind: 'field',
                    type: 'select',
                    id: 'armor',
                    options: ['Без доспеха', 'Кожаная'],
                  },
                ],
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
      v: 2,
      templates: [
        {
          id: 'weapons',
          kind: 'single',
          title: 'Оружие',
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Урон' },
                  {
                    kind: 'field',
                    type: 'dice-choice',
                    id: 'weapon_die',
                    options: ['d4', 'd6', 'd8'],
                  },
                ],
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
      v: 2,
      templates: [
        {
          id: 'pc',
          kind: 'single',
          title: 'Лист',
          sections: [
            {
              rows: [
                [
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
      v: 2,
      templates: [
        {
          id: 'pc',
          kind: 'single',
          title: 'Лист',
          sections: [
            {
              rows: [
                [
                  {
                    kind: 'field',
                    type: 'number',
                    id: 'hp',
                    name: '  ',
                  },
                ],
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
        uid: uid(document, 0, 0, 0, 0),
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
        kind: 'set',
        title: 'Набор',
        nameField: 'imya',
        sections: [
          {
            rows: [
              [
                { kind: 'text', text: 'Имя' },
                { kind: 'field', type: 'text', id: 'imya' },
              ],
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
    const section = uid(document, 0, 0);

    document = applied(addRow(document, section)).document;

    const row = uid(document, 0, 0, 0);

    document = applied(addCell(document, row, 'text')).document;

    const label = uid(document, 0, 0, 0, 0);

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

    document = applied(addRow(document, uid(document, 0, 0))).document;

    const row = uid(document, 0, 0, 0);

    document = applied(addCell(document, row, 'field')).document;

    // #when
    const added = applied(addCell(document, row, 'field'));

    // #then
    expect(findCell(added.document, added.changed)).toMatchObject({ id: 'field_2' });
  });
});

describe('moveItem', () => {
  test('moves a row out of a repeat section into another section, uids kept', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'inv',
          kind: 'single',
          title: 'Инвентарь',
          sections: [
            { rows: [] },
            {
              repeat: true,
              rows: [
                [{ kind: 'field', type: 'text', id: 'item' }],
                [{ kind: 'field', type: 'number', id: 'money' }],
              ],
            },
          ],
        },
      ],
    });

    const money = uid(document, 0, 1, 1);

    // #when
    const moved = applied(
      moveItem(document, money, { place: 'into', parent: uid(document, 0, 0) }),
    );

    // #then
    expect(moved.changed).toBe(money);
    expect(uidAt(moved.document, [0, 0, 0])).toBe(money);
    expect(toPreset(moved.document).templates[0]?.sections).toEqual([
      { rows: [[{ kind: 'field', type: 'number', id: 'money' }]] },
      { repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'item' }]] },
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
    expect(acceptsDrop(document, 'cell', { place: 'before', sibling: uid(document, 0, 0) })).toBe(
      false,
    );
    expect(acceptsDrop(document, 'template', { place: 'into', parent: null })).toBe(true);
    expect(
      moveItem(document, uid(document, 0, 0, 0), { place: 'into', parent: uid(document, 0) }),
    ).toBeNull();
  });
});

describe('removeItem', () => {
  test('removes an item, and its container becomes the changed item', () => {
    // #given
    const document = fromPreset(D20);
    const cell = uid(document, 0, 0, 0, 0);

    // #when
    const removed = applied(removeItem(document, cell));

    // #then
    expect(removed.changed).toBe(uid(document, 0, 0, 0));
    expect(toPreset(removed.document).templates[0]?.sections[0]?.rows[0]).toEqual(
      D20.templates[0]?.sections[0]?.rows[0]?.slice(1),
    );
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
          kind: 'set',
          title: 'Экипаж',
          nameField: 'name',
          sections: [
            {
              rows: [
                [{ kind: 'field', type: 'text', id: 'name' }],
                [
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'field', type: 'number', id: 'str_tired' },
                  { kind: 'dice', formula: '1d20 <= str - 2*str_tired' },
                ],
              ],
            },
          ],
        },
      ],
    });

    const order = treeOrder(document);

    // #when
    const renamed = renameField(document, uid(document, 0, 0, 1, 0), 'strength');

    // #then
    expect(renamed?.formulas).toBe(1);
    expect(treeOrder(renamed?.document ?? EMPTY_DOCUMENT)).toEqual(order);
    expect(
      toPreset(renamed?.document ?? EMPTY_DOCUMENT).templates[0]?.sections[0]?.rows[1],
    ).toEqual([
      { kind: 'field', type: 'number', id: 'strength' },
      { kind: 'field', type: 'number', id: 'str_tired' },
      { kind: 'dice', formula: '1d20 <= strength - 2*str_tired' },
    ]);

    // #when
    const name = renameField(document, uid(document, 0, 0, 0, 0), 'imya');

    // #then
    expect(name?.document.templates[0]).toMatchObject({ nameField: 'imya' });
  });
});

describe('withTemplateKind', () => {
  test('a single sheet that becomes a sheet set is named by its first text field', () => {
    // #given
    const document = fromPreset({
      templates: [
        {
          id: 'npc',
          kind: 'single',
          title: 'NPC',
          players: 'edit',
          sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'who' }]] }],
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
    expect(set).toMatchObject({ kind: 'set', nameField: 'who' });
    expect(set).not.toHaveProperty('players');
    expect(back).not.toHaveProperty('nameField');
  });
});

describe('ancestorUids', () => {
  test('lists the item, then its containers up to its template', () => {
    // #given
    const document = fromPreset(D20);

    // #when
    const chain = ancestorUids(document, uid(document, 0, 1, 0, 0));

    // #then
    expect(chain).toEqual([
      uid(document, 0, 1, 0, 0),
      uid(document, 0, 1, 0),
      uid(document, 0, 1),
      uid(document, 0),
    ]);
  });
});

describe('addSection', () => {
  test('adds an empty section at the end of its template', () => {
    // #given
    const document = fromPreset(D20);

    // #when
    const added = applied(addSection(document, uid(document, 0)));

    // #then
    expect(toPreset(added.document).templates[0]?.sections.at(-1)).toEqual({ rows: [] });
  });
});
