import type {
  ArithmeticOperator,
  ComparisonOperator,
  FormulaExpression,
  FormulaTree,
} from '@/core/formula';
import { parseNumberInput } from '@/core/number-input';
import {
  plainRow,
  resolveFieldReference,
  repeatSectionAt,
  sectionAt,
  type PresetCell,
  type PresetFieldCell,
  type PresetRow,
  type TemplateLayout,
  type TemplateRowPlace,
} from '@/core/preset';
import type { FieldValue } from '@/core/records';
import { err, ok, type Result } from '@/core/result';
import { isChecked, valueText, type FieldValues } from '@/core/sheet-values';

const NO_VALUES: FieldValues = new Map();

// The comparison's left side is the roll and its right side the target. With no comparison the
// whole tree is the roll, `target` and `outcome` are `null` and `targetFaces` is empty. `faces` are
// the dice of the roll side, `targetFaces` those of the target side, each in tree order.
export type RollResult = {
  roll: number;
  faces: number[];
  target: number | null;
  targetFaces: number[];
  outcome: 'success' | 'failure' | null;
};

// `field` names an id that is unknown, out of scope, empty or not a number. `arithmetic` is a
// division by zero or a step that is not finite or not a safe integer in size, and names no field.
export type EvaluationFailure = { code: 'field'; fieldId: string } | { code: 'arithmetic' };

// The number an id stands for, or `null` when it gives the field error.
export type FieldLookup = (id: string) => number | null;

// The number of sides chosen by a dice-choice field, or `null` for an unknown, empty, non-die or
// differently typed value. A stale value that is still a die size remains usable.
export type DiceFieldLookup = (id: string) => number | null;

// A value in [0, 1), as `Math.random` returns.
export type RandomSource = () => number;

// The face one die of `sides` shows. The evaluator clamps a face out of range to [1, sides].
export type FaceSource = (sides: number) => number;

// One `NdM` of a formula.
export type DiceTerm = { count: number; sides: number };

// The face one die of `sides` shows.
export type DieFace = { sides: number; face: number };

// The values of the plain row named by `rowId`, read from the sheet's root block.
export type SheetRowValues = (rowId: string) => FieldValues;

// Walks the Story 1.5 tree in order, left before right, so dice faces come out in tree order. The
// first failure stops the walk, and the faces rolled so far are discarded.
export function evaluateFormula(
  tree: FormulaTree,
  lookup: FieldLookup,
  faces: FaceSource = randomFaces(Math.random),
): Result<RollResult, EvaluationFailure> {
  const rollFaces: number[] = [];
  const targetFaces: number[] = [];
  let sideFaces = rollFaces;

  // Past the safe range a number is inexact, so it is refused like Infinity.
  function evaluate(expression: FormulaExpression): Result<number, EvaluationFailure> {
    const value = evaluateStep(expression);

    if (
      value.ok &&
      (!Number.isFinite(value.value) || Math.abs(value.value) > Number.MAX_SAFE_INTEGER)
    ) {
      return err({ code: 'arithmetic' });
    }

    return value;
  }

  function evaluateStep(expression: FormulaExpression): Result<number, EvaluationFailure> {
    if (expression.kind === 'integer') {
      return ok(expression.value);
    }

    if (expression.kind === 'dice') {
      return ok(rollDice(expression.count, expression.sides));
    }

    if (expression.kind === 'field') {
      const value = lookup(expression.id);

      return value === null ? err({ code: 'field', fieldId: expression.id }) : ok(value);
    }

    if (expression.kind === 'dice-field') {
      return err({ code: 'field', fieldId: expression.id });
    }

    if (expression.kind === 'call') {
      const argument = evaluate(expression.argument);

      if (!argument.ok) {
        return argument;
      }

      return ok(
        expression.name === 'floor' ? Math.floor(argument.value) : Math.ceil(argument.value),
      );
    }

    const left = evaluate(expression.left);

    if (!left.ok) {
      return left;
    }

    const right = evaluate(expression.right);

    if (!right.ok) {
      return right;
    }

    return arithmetic(expression.operator, left.value, right.value);
  }

  function rollDice(count: number, sides: number): number {
    let total = 0;

    for (let index = 0; index < count; index += 1) {
      const face = clampFace(faces(sides), sides);

      sideFaces.push(face);
      total += face;
    }

    return total;
  }

  if (tree.kind !== 'comparison') {
    const roll = evaluate(tree);

    return roll.ok
      ? ok({ roll: roll.value, faces: rollFaces, target: null, targetFaces, outcome: null })
      : roll;
  }

  const roll = evaluate(tree.left);

  if (!roll.ok) {
    return roll;
  }

  sideFaces = targetFaces;

  const target = evaluate(tree.right);

  if (!target.ok) {
    return target;
  }

  const holds = compare(tree.operator, roll.value, target.value);

  return ok({
    roll: roll.value,
    faces: rollFaces,
    target: target.value,
    targetFaces,
    outcome: holds ? 'success' : 'failure',
  });
}

// Each face is `floor(random() * sides) + 1`.
export function randomFaces(random: RandomSource): FaceSource {
  return (sides) => Math.floor(random() * sides) + 1;
}

// The listed faces in order, one per die, each for a die of its `sides`. A die of other sides, or
// one past the end of the list, throws: the caller builds the list from `formulaDiceTerms`, so
// either means a broken caller, not a bad formula.
export function listedFaces(faces: readonly DieFace[]): FaceSource {
  let index = 0;

  return (sides) => {
    const die = faces[index];

    if (die?.sides !== sides) {
      throw new Error(`Listed face ${index + 1} is not for a d${sides}`);
    }

    index += 1;

    return die.face;
  };
}

// The `NdM` terms of a formula, both sides of a comparison, in the order the evaluator rolls them.
export function formulaDiceTerms(tree: FormulaTree): DiceTerm[] {
  const terms: DiceTerm[] = [];

  function walk(expression: FormulaTree): void {
    switch (expression.kind) {
      case 'dice':
        terms.push({ count: expression.count, sides: expression.sides });

        return;
      case 'call':
        walk(expression.argument);

        return;
      case 'binary':
      case 'comparison':
        walk(expression.left);
        walk(expression.right);

        return;
      case 'integer':
      case 'field':
      case 'dice-field':
        return;
      default:
        expression satisfies never;
    }
  }

  walk(tree);

  return terms;
}

// The dice-choice lookup for a dice cell in the row at `from`. It uses the same repeat-block-first
// scope as `formulaFieldLookup`, but accepts only a field of type `dice-choice` and a value d1..d1000.
export function formulaDiceFieldLookup(
  layout: TemplateLayout,
  from: TemplateRowPlace,
  sheetRow: SheetRowValues,
  ownBlock: FieldValues = NO_VALUES,
): DiceFieldLookup {
  const section = sectionAt(layout, from);
  const repeatSection = repeatSectionAt(layout, from);

  return (id) => {
    const reference = resolveFieldReference(layout, from, id);

    if (reference === null || section === null) {
      return null;
    }

    const cell =
      reference.scope === 'block'
        ? fieldInRows(repeatSection?.rows ?? [], id)
        : fieldInCells(plainRow(layout, reference.rowId) ?? [], id);

    if (cell === null || cell.type !== 'dice-choice') {
      return null;
    }

    const values = reference.scope === 'block' ? ownBlock : sheetRow(reference.rowId);

    return diceChoiceSides(valueText(values.get(id)));
  };
}

// Replaces every dice-choice node with a literal dice node before terms are listed or the tree is
// evaluated. Unknown, empty and non-die values stay roll-time field errors; a stale die-size value
// is resolved and rolled even when it is no longer one of the field's options.
export function resolveFormulaDiceFields(
  tree: FormulaTree,
  lookup: DiceFieldLookup,
): Result<FormulaTree, Extract<EvaluationFailure, { code: 'field' }>> {
  function resolveExpression(
    expression: FormulaExpression,
  ): Result<FormulaExpression, Extract<EvaluationFailure, { code: 'field' }>> {
    if (expression.kind === 'dice-field') {
      const sides = lookup(expression.id);

      return sides === null
        ? err({ code: 'field', fieldId: expression.id })
        : ok({ kind: 'dice', count: expression.count, sides });
    }

    if (
      expression.kind === 'integer' ||
      expression.kind === 'dice' ||
      expression.kind === 'field'
    ) {
      return ok(expression);
    }

    if (expression.kind === 'call') {
      const argument = resolveExpression(expression.argument);

      return argument.ok ? ok({ ...expression, argument: argument.value }) : argument;
    }

    const left = resolveExpression(expression.left);

    if (!left.ok) {
      return left;
    }

    const right = resolveExpression(expression.right);

    return right.ok ? ok({ ...expression, left: left.value, right: right.value }) : right;
  }

  if (tree.kind === 'comparison') {
    const left = resolveExpression(tree.left);

    if (!left.ok) {
      return left;
    }

    const right = resolveExpression(tree.right);

    return right.ok ? ok({ ...tree, left: left.value, right: right.value }) : right;
  }

  return resolveExpression(tree);
}

// The lookup for a dice cell in the row at `from`. `sheetRow` reads rows of the same sheet only, so
// an id never crosses sheets. An id resolves through `resolveFieldReference`: the cell's own repeat
// block first, then the sheet's non-repeat scope. The caller passes repeat values as `ownBlock`;
// without them the repeat block's own fields read as empty.
export function formulaFieldLookup(
  layout: TemplateLayout,
  from: TemplateRowPlace,
  sheetRow: SheetRowValues,
  ownBlock: FieldValues = NO_VALUES,
): FieldLookup {
  const section = sectionAt(layout, from);
  const repeatSection = repeatSectionAt(layout, from);

  return (id) => {
    const reference = resolveFieldReference(layout, from, id);

    if (reference === null || section === null) {
      return null;
    }

    const cell =
      reference.scope === 'block'
        ? fieldInRows(repeatSection?.rows ?? [], id)
        : fieldInCells(plainRow(layout, reference.rowId) ?? [], id);

    if (cell === null) {
      return null;
    }

    const values = reference.scope === 'block' ? ownBlock : sheetRow(reference.rowId);

    return fieldNumber(cell, values.get(id));
  };
}

// A `check` field is never empty: only `true` counts as 1. A `number` or `text` field counts only
// when the Story 1.9 parser accepts the whole text the field shows, so a value of another type, as a
// field whose type changed leaves it, counts as it reads. An empty text parses to `null`, which is
// the empty-field error.
function fieldNumber(cell: PresetFieldCell, value: FieldValue | undefined): number | null {
  if (cell.type === 'check') {
    return isChecked(value) ? 1 : 0;
  }

  const parsed = parseNumberInput(valueText(value));

  return parsed.ok ? parsed.value : null;
}

function diceChoiceSides(value: string): number | null {
  const match = /^d([1-9][0-9]{0,2}|1000)$/.exec(value);

  return match === null ? null : Number(match[1]);
}

function arithmetic(
  operator: ArithmeticOperator,
  left: number,
  right: number,
): Result<number, EvaluationFailure> {
  if (operator === '+') {
    return ok(left + right);
  }

  if (operator === '-') {
    return ok(left - right);
  }

  if (operator === '*') {
    return ok(left * right);
  }

  return right === 0 ? err({ code: 'arithmetic' }) : ok(left / right);
}

// A random source outside [0, 1) would give a face of 0 or sides + 1, and NaN no face at all.
function clampFace(face: number, sides: number): number {
  return Number.isFinite(face) ? Math.min(Math.max(face, 1), sides) : 1;
}

function compare(operator: ComparisonOperator, roll: number, target: number): boolean {
  if (operator === '<=') {
    return roll <= target;
  }

  if (operator === '<') {
    return roll < target;
  }

  if (operator === '>=') {
    return roll >= target;
  }

  return roll > target;
}

function fieldInRows(rows: readonly PresetRow[], id: string): PresetFieldCell | null {
  for (const row of rows) {
    const cell = fieldInCells(row.cells, id);

    if (cell !== null) {
      return cell;
    }
  }

  return null;
}

function fieldInCells(cells: readonly PresetCell[], id: string): PresetFieldCell | null {
  const cell = cells.find((candidate) => candidate.kind === 'field' && candidate.id === id);

  return cell?.kind === 'field' ? cell : null;
}
