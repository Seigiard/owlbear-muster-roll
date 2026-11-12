import {
  resolveFieldReference,
  type PresetCell,
  type Template,
  type TemplateLayout,
  type TemplateRowPlace,
} from '@/core/preset';

// CAP-25, AD-24: a field id rename and the formulas that follow it.

// A cell of a template by position.
export type TemplateCellPlace = TemplateRowPlace & { cellIndex: number };

// The template after the rename, and how many formulas changed.
export type FieldRename = { template: Template; formulas: number };

const DIGIT = /[0-9]/;

const NAME_START = /[A-Za-z_]/;

const NAME_CHARACTER = /[A-Za-z0-9_]/;

// Renames the field at `place` from `oldId` to `newId`. Every formula whose row resolves `oldId` to
// that field, as `resolveFieldReference` resolves it, has the id rewritten by whole word, so `str`
// leaves `str_tired` alone. A sheet set's name field follows its field. A cell at `place` that is
// not the field `oldId` changes nothing.
export function renameFieldId(
  template: Template,
  place: TemplateCellPlace,
  oldId: string,
  newId: string,
): FieldRename {
  const cell = cellAt(template, place);

  if (cell?.kind !== 'field' || cell.id !== oldId || oldId === newId) {
    return { template, formulas: 0 };
  }

  let formulas = 0;

  const sections = template.sections.map((section, sectionIndex) => ({
    ...section,
    rows: section.rows.map((row, rowIndex) => {
      const from = { sectionIndex, rowIndex };
      const reaches = resolvesToField(template, from, oldId, place);

      return row.map((other, cellIndex): PresetCell => {
        if (
          sectionIndex === place.sectionIndex &&
          rowIndex === place.rowIndex &&
          cellIndex === place.cellIndex
        ) {
          return { ...cell, id: newId };
        }

        if (other.kind !== 'dice' || !reaches) {
          return other;
        }

        const formula = replaceWord(other.formula, oldId, newId);

        if (formula === null) {
          return other;
        }

        formulas += 1;

        return { ...other, formula };
      });
    }),
  }));

  const namesSheets =
    template.kind === 'set' &&
    template.nameField === oldId &&
    isFirstHolder(template, oldId, place, false);

  const renamed: Template =
    template.kind === 'set'
      ? { ...template, nameField: namesSheets ? newId : template.nameField, sections }
      : { ...template, sections };

  return { template: renamed, formulas };
}

// How many formulas of the template resolve to the field at `place` and name it.
export function fieldFormulaCount(template: TemplateLayout, place: TemplateCellPlace): number {
  const cell = cellAt(template, place);

  if (cell?.kind !== 'field') {
    return 0;
  }

  let count = 0;

  template.sections.forEach((section, sectionIndex) => {
    section.rows.forEach((row, rowIndex) => {
      if (!resolvesToField(template, { sectionIndex, rowIndex }, cell.id, place)) {
        return;
      }

      for (const other of row) {
        if (other.kind === 'dice' && formulaNames(other.formula, cell.id)) {
          count += 1;
        }
      }
    });
  });

  return count;
}

// Whether `formula` names `id` as a whole word.
export function formulaNames(formula: string, id: string): boolean {
  return replaceWord(formula, id, id) !== null;
}

function cellAt(layout: TemplateLayout, place: TemplateCellPlace): PresetCell | undefined {
  return layout.sections[place.sectionIndex]?.rows[place.rowIndex]?.[place.cellIndex];
}

// Whether a formula in the row at `from` reads `id` from the field at `field`. The parser reads the
// first field of that id in scope: in the row's own repeat section, then outside repeat sections.
function resolvesToField(
  layout: TemplateLayout,
  from: TemplateRowPlace,
  id: string,
  field: TemplateCellPlace,
): boolean {
  const reference = resolveFieldReference(layout, from, id);

  if (reference === null) {
    return false;
  }

  if (reference.scope === 'block') {
    return from.sectionIndex === field.sectionIndex && isFirstHolder(layout, id, field, true);
  }

  return isFirstHolder(layout, id, field, false);
}

// Whether `field` is the first field `id` of its scope: of its own repeat section when `block`,
// otherwise of every section that does not repeat.
function isFirstHolder(
  layout: TemplateLayout,
  id: string,
  field: TemplateCellPlace,
  block: boolean,
): boolean {
  const own = layout.sections[field.sectionIndex];

  if (own === undefined || (own.repeat === true) !== block) {
    return false;
  }

  for (const [sectionIndex, section] of layout.sections.entries()) {
    const inScope = block ? sectionIndex === field.sectionIndex : section.repeat !== true;

    if (!inScope) {
      continue;
    }

    for (const [rowIndex, row] of section.rows.entries()) {
      const cellIndex = row.findIndex((cell) => cell.kind === 'field' && cell.id === id);

      if (cellIndex !== -1) {
        return (
          sectionIndex === field.sectionIndex &&
          rowIndex === field.rowIndex &&
          cellIndex === field.cellIndex
        );
      }
    }
  }

  return false;
}

// `formula` with every whole-word `oldId` written as `newId`, or `null` when it names none. Words
// are read as the formula parser reads them: a number with its dice part and any letters glued to
// it, as `1d20`, is never a name.
function replaceWord(formula: string, oldId: string, newId: string): string | null {
  let result = '';
  let found = false;
  let index = 0;

  while (index < formula.length) {
    const character = formula[index] ?? '';

    if (DIGIT.test(character) || NAME_START.test(character)) {
      let end = index + 1;

      while (end < formula.length && NAME_CHARACTER.test(formula[end] ?? '')) {
        end += 1;
      }

      const word = formula.slice(index, end);

      if (NAME_START.test(character) && word === oldId) {
        result += newId;
        found = true;
      } else {
        result += word;
      }

      index = end;
      continue;
    }

    result += character;
    index += 1;
  }

  return found ? result : null;
}
