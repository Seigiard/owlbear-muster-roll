import { describe, expect, test } from 'bun:test';

import type { PresetCell, PresetSection, Template } from '@/core/preset';

import { fieldFormulaCount, formulaNames, renameFieldId } from './formula-rename';

const FIRST_CELL = { sectionIndex: 0, rowIndex: 0, cellIndex: 0 };

function field(id: string): PresetCell {
  return { kind: 'field', type: 'number', id };
}

function dice(formula: string): PresetCell {
  return { kind: 'dice', formula };
}

function single(sections: PresetSection[]): Template {
  return { id: 'npc', kind: 'single', title: 'NPC', sections };
}

function formulas(template: Template): string[] {
  return template.sections.flatMap((section) =>
    section.rows.flatMap((row) =>
      row.flatMap((cell) => (cell.kind === 'dice' ? [cell.formula] : [])),
    ),
  );
}

describe('renameFieldId', () => {
  test('rewrites the id by whole word and counts the formulas that changed', () => {
    // #given
    const template = single([
      {
        rows: [
          [field('str'), field('str_tired'), dice('1d20 <= str - 2*str_tired')],
          [dice('1d6+str+str')],
          [dice('1d20')],
        ],
      },
    ]);

    // #when
    const renamed = renameFieldId(template, FIRST_CELL, 'str', 'strength');

    // #then
    expect(renamed.formulas).toBe(2);
    expect(formulas(renamed.template)).toEqual([
      '1d20 <= strength - 2*str_tired',
      '1d6+strength+strength',
      '1d20',
    ]);
    expect(renamed.template.sections[0]?.rows[0]?.[0]).toEqual(field('strength'));
  });

  test('leaves a dice term and a number glued to letters alone', () => {
    // #given
    const template = single([{ rows: [[field('d'), dice('1d20 + d + 2d')]] }]);

    // #when
    const renamed = renameFieldId(template, FIRST_CELL, 'd', 'dex');

    // #then
    expect(formulas(renamed.template)).toEqual(['1d20 + dex + 2d']);
  });

  test('renames in a repeat section only the formulas whose row resolves to the renamed field', () => {
    // #given
    const template = single([
      { rows: [[field('bonus'), dice('1d20+bonus')]] },
      { repeat: true, rows: [[field('item'), field('bonus')], [dice('1d6+bonus')]] },
      { repeat: true, rows: [[field('spell'), dice('1d8+bonus')]] },
    ]);

    // #when
    const renamed = renameFieldId(
      template,
      { sectionIndex: 1, rowIndex: 0, cellIndex: 1 },
      'bonus',
      'item_bonus',
    );

    // #then
    expect(renamed.formulas).toBe(1);
    expect(formulas(renamed.template)).toEqual(['1d20+bonus', '1d6+item_bonus', '1d8+bonus']);
  });

  test('renames every formula that reaches a field outside repeat sections, but not one a repeat block shadows', () => {
    // #given
    const template = single([
      { rows: [[field('bonus'), dice('1d20+bonus')]] },
      { repeat: true, rows: [[field('item'), field('bonus'), dice('1d6+bonus')]] },
      { repeat: true, rows: [[field('spell'), dice('1d8+bonus')]] },
    ]);

    // #when
    const renamed = renameFieldId(template, FIRST_CELL, 'bonus', 'attack');

    // #then
    expect(renamed.formulas).toBe(2);
    expect(formulas(renamed.template)).toEqual(['1d20+attack', '1d6+bonus', '1d8+attack']);
  });

  test('a second field of one id renames no formula, because formulas read the first', () => {
    // #given
    const template = single([{ rows: [[field('hp'), dice('1d6+hp')], [field('hp')]] }]);

    // #when
    const renamed = renameFieldId(
      template,
      { sectionIndex: 0, rowIndex: 1, cellIndex: 0 },
      'hp',
      'hp_max',
    );

    // #then
    expect(renamed.formulas).toBe(0);
    expect(formulas(renamed.template)).toEqual(['1d6+hp']);
  });

  test("a sheet set's name field follows its field", () => {
    // #given
    const template: Template = {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'name' }]] }],
    };

    // #when
    const renamed = renameFieldId(template, FIRST_CELL, 'name', 'imya');

    // #then
    expect(renamed.template).toEqual({
      ...template,
      nameField: 'imya',
      sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'imya' }]] }],
    });
  });

  test('changes nothing when the cell is not the field it names', () => {
    // #given
    const template = single([{ rows: [[field('hp'), dice('hp')]] }]);

    // #when
    const renamed = renameFieldId(
      template,
      { sectionIndex: 0, rowIndex: 0, cellIndex: 1 },
      'hp',
      'x',
    );

    // #then
    expect(renamed).toEqual({ template, formulas: 0 });
  });
});

describe('fieldFormulaCount', () => {
  test('counts the formulas that resolve to the field', () => {
    // #given
    const template = single([
      { rows: [[field('str'), dice('1d20<=str')], [dice('str_tired')]] },
      { repeat: true, rows: [[field('str'), dice('str')]] },
    ]);

    // #when
    const count = fieldFormulaCount(template, FIRST_CELL);

    // #then
    expect(count).toBe(1);
  });
});

describe('formulaNames', () => {
  test.each<[string, string, boolean]>([
    ['1d20+str', 'str', true],
    ['1d20+str_tired', 'str', false],
    ['1d20', 'd20', false],
  ])('in %p finds %p: %p', (formula, id, expected) => {
    // #when
    const names = formulaNames(formula, id);

    // #then
    expect(names).toBe(expected);
  });
});
