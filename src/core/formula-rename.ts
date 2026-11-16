import { isFieldId } from '@/core/field-id';
import {
  placedSections,
  resolveFieldReference,
  sectionAt,
  type PresetCell,
  type Template,
  type TemplateLayout,
  type TemplateRowPlace,
  type TemplateSectionPlace,
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
// not the field `oldId` changes nothing. A `newId` that is no valid id, or that the field's scope
// already holds, renames the field alone: a formula rewritten to it could not be renamed back.
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

  const rewrites = isFieldId(newId) && !scopeHolds(template, newId, place);
  let formulas = 0;

  const tabs = template.tabs.map((tab, tabIndex) => ({
    ...tab,
    sections: tab.sections.map((section, sectionIndex) => ({
      ...section,
      rows: section.rows.map((row, rowIndex) => {
        const from = { tabIndex, sectionIndex, rowIndex };
        const reaches = resolvesToField(template, from, oldId, place);

        return {
          ...row,
          cells: row.cells.map((other, cellIndex): PresetCell => {
            if (samePlace({ ...from, cellIndex }, place)) {
              return { ...cell, id: newId };
            }

            if (other.kind !== 'dice' || !reaches || !rewrites) {
              return other;
            }

            const formula = replaceWord(other.formula, oldId, newId);

            if (formula === null) {
              return other;
            }

            formulas += 1;

            return { ...other, formula };
          }),
        };
      }),
    })),
  }));

  const namesSheets =
    template.repeat !== undefined &&
    template.repeat.nameField === oldId &&
    isFirstHolder(template, oldId, place, false);

  const renamed: Template =
    template.repeat !== undefined
      ? {
          ...template,
          repeat: {
            ...template.repeat,
            nameField: namesSheets ? newId : template.repeat.nameField,
          },
          tabs,
        }
      : { ...template, tabs };

  return { template: renamed, formulas };
}

// How many formulas of the template resolve to the field at `place` and name it.
export function fieldFormulaCount(template: TemplateLayout, place: TemplateCellPlace): number {
  const cell = cellAt(template, place);

  if (cell?.kind !== 'field') {
    return 0;
  }

  let count = 0;

  placedSections(template).forEach(({ place: sectionPlace, section }) => {
    section.rows.forEach((row, rowIndex) => {
      if (!resolvesToField(template, { ...sectionPlace, rowIndex }, cell.id, place)) {
        return;
      }

      for (const other of row.cells) {
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
  return sectionAt(layout, place)?.rows[place.rowIndex]?.cells[place.cellIndex];
}

function sameSection(a: TemplateSectionPlace, b: TemplateSectionPlace): boolean {
  return a.tabIndex === b.tabIndex && a.sectionIndex === b.sectionIndex;
}

function samePlace(a: TemplateCellPlace, b: TemplateCellPlace): boolean {
  return sameSection(a, b) && a.rowIndex === b.rowIndex && a.cellIndex === b.cellIndex;
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
    return sameSection(from, field) && isFirstHolder(layout, id, field, true);
  }

  return isFirstHolder(layout, id, field, false);
}

// Whether a field of `field`'s scope is `id`: its own repeat section, or every section that does not
// repeat.
function scopeHolds(layout: TemplateLayout, id: string, field: TemplateCellPlace): boolean {
  const block = sectionAt(layout, field)?.repeat !== undefined;

  return placedSections(layout).some(
    ({ place, section }) =>
      (block ? sameSection(place, field) : section.repeat === undefined) &&
      section.rows.some((row) => row.cells.some((cell) => cell.kind === 'field' && cell.id === id)),
  );
}

// Whether `field` is the first field `id` of its scope: of its own repeat section when `block`,
// otherwise of every section that does not repeat.
function isFirstHolder(
  layout: TemplateLayout,
  id: string,
  field: TemplateCellPlace,
  block: boolean,
): boolean {
  const own = sectionAt(layout, field);

  if (own === null || (own.repeat !== undefined) !== block) {
    return false;
  }

  for (const { place, section } of placedSections(layout)) {
    const inScope = block ? sameSection(place, field) : section.repeat === undefined;

    if (!inScope) {
      continue;
    }

    for (const [rowIndex, row] of section.rows.entries()) {
      const cellIndex = row.cells.findIndex((cell) => cell.kind === 'field' && cell.id === id);

      if (cellIndex !== -1) {
        return samePlace({ ...place, rowIndex, cellIndex }, field);
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
