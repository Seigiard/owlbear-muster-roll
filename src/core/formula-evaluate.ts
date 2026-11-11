import type {
  ArithmeticOperator,
  ComparisonOperator,
  FormulaExpression,
  FormulaTree,
} from '@/core/formula';
import { parseNumberInput } from '@/core/number-input';
import {
  firstFieldId,
  resolveFieldReference,
  type PresetCell,
  type PresetFieldCell,
  type PresetTemplate,
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

// A value in [0, 1), as `Math.random` returns. A face out of range is clamped to [1, sides].
export type RandomSource = () => number;

// The values of the sheet's `row:` record named by `rowId`.
export type SheetRowValues = (rowId: string) => FieldValues;

// Walks the Story 1.5 tree in order, left before right, so dice faces come out in tree order. The
// first failure stops the walk, and the faces rolled so far are discarded.
export function evaluateFormula(
  tree: FormulaTree,
  lookup: FieldLookup,
  random: RandomSource,
): Result<RollResult, EvaluationFailure> {
  const faces: number[] = [];
  const targetFaces: number[] = [];
  let sideFaces = faces;

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
      const face = clampFace(Math.floor(random() * sides) + 1, sides);

      sideFaces.push(face);
      total += face;
    }

    return total;
  }

  if (tree.kind !== 'comparison') {
    const roll = evaluate(tree);

    return roll.ok
      ? ok({ roll: roll.value, faces, target: null, targetFaces, outcome: null })
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
    faces,
    target: target.value,
    targetFaces,
    outcome: holds ? 'success' : 'failure',
  });
}

// The lookup for a dice cell in the row at `from`. `sheetRow` reads rows of the same sheet only, so
// an id never crosses characters. An id resolves through `resolveFieldReference`: same row first,
// then the sheet's non-repeat scope. A repeat row has no `row:` record, so its caller passes the
// instance's values as `ownRow`; without them its own fields read as empty. A non-repeat row reads
// its own `row:` record through `sheetRow`.
export function formulaFieldLookup(
  template: PresetTemplate,
  from: TemplateRowPlace,
  sheetRow: SheetRowValues,
  ownRow?: FieldValues,
): FieldLookup {
  const section = template.sections[from.sectionIndex];
  const row = section?.rows[from.rowIndex];
  const rowId = row === undefined ? null : firstFieldId(row);

  const ownValues =
    ownRow ?? (section?.repeat === true || rowId === null ? NO_VALUES : sheetRow(rowId));

  return (id) => {
    const reference = resolveFieldReference(template, from, id);

    if (reference === null) {
      return null;
    }

    const cell =
      reference.scope === 'row'
        ? fieldIn(row, id)
        : fieldIn(sheetScopeRow(template, reference.rowId), id);

    if (cell === null) {
      return null;
    }

    const values = reference.scope === 'row' ? ownValues : sheetRow(reference.rowId);

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

// A source outside [0, 1) would give a face of 0 or sides + 1, and NaN no face at all.
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

function sheetScopeRow(template: PresetTemplate, rowId: string): readonly PresetCell[] | undefined {
  return template.sections
    .filter((section) => section.repeat !== true)
    .flatMap((section) => section.rows)
    .find((row) => firstFieldId(row) === rowId);
}

function fieldIn(row: readonly PresetCell[] | undefined, id: string): PresetFieldCell | null {
  const cell = row?.find((candidate) => candidate.kind === 'field' && candidate.id === id);

  return cell?.kind === 'field' ? cell : null;
}
