import { FORMULA_FUNCTION_NAMES, isFieldId } from '@/core/field-id';
import { err, ok, type Result } from '@/core/result';

export const FORMULA_MAX_LENGTH = 200;

const DICE_COUNT_MAX = 100;
const DICE_SIDES_MAX = 1000;

const WHITESPACE = /\s+/y;
const NUMBER = /([0-9]+)(?:[dD]([0-9]+))?/y;
const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const SYMBOL = /<=|>=|[-+*/()<>]/y;
const NAME_CHARACTER = /[A-Za-z0-9_]/;

export type FormulaFunction = (typeof FORMULA_FUNCTION_NAMES)[number];

export type ArithmeticOperator = '+' | '-' | '*' | '/';

export type ComparisonOperator = '<=' | '<' | '>=' | '>';

export type FormulaExpression =
  | { kind: 'integer'; value: number }
  | { kind: 'dice'; count: number; sides: number }
  | { kind: 'field'; id: string }
  | { kind: 'call'; name: FormulaFunction; argument: FormulaExpression }
  | {
      kind: 'binary';
      operator: ArithmeticOperator;
      left: FormulaExpression;
      right: FormulaExpression;
    };

export type FormulaComparison = {
  kind: 'comparison';
  operator: ComparisonOperator;
  left: FormulaExpression;
  right: FormulaExpression;
};

// A comparison can only be the root, so a tree holds at most one.
export type FormulaTree = FormulaExpression | FormulaComparison;

export type FormulaFailure = 'too-long' | 'syntax-error' | 'unknown-function' | 'dice-out-of-range';

type FormulaSymbol = ArithmeticOperator | ComparisonOperator | '(' | ')';

type Token =
  | { kind: 'integer'; value: number }
  | { kind: 'dice'; count: number; sides: number }
  | { kind: 'name'; name: string }
  | { kind: 'symbol'; symbol: FormulaSymbol };

// Grammar:
//   comparison = sum [('<=' | '<' | '>=' | '>') sum]
//   sum        = product (('+' | '-') product)*
//   product    = atom (('*' | '/') atom)*
//   atom       = integer | dice | id | call | '(' sum ')'
//   call       = ('floor' | 'ceil') '(' sum ')'
// Minus is binary only. The parser builds a tree and never evaluates.
export function parseFormula(formula: string): Result<FormulaTree, FormulaFailure> {
  if (formula.length > FORMULA_MAX_LENGTH) {
    return err('too-long');
  }

  try {
    return ok(parseTokens(tokenize(formula)));
  } catch (error) {
    if (error instanceof FormulaError) {
      return err(error.failure);
    }

    throw error;
  }
}

class FormulaError extends Error {
  readonly failure: FormulaFailure;

  constructor(failure: FormulaFailure) {
    super(failure);
    this.failure = failure;
  }
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  function matchAt(pattern: RegExp): RegExpExecArray | null {
    pattern.lastIndex = index;

    const match = pattern.exec(formula);

    if (match !== null) {
      index = pattern.lastIndex;
    }

    return match;
  }

  while (index < formula.length) {
    if (matchAt(WHITESPACE) !== null) {
      continue;
    }

    const number = matchAt(NUMBER);

    if (number !== null) {
      // `1d6x` or `2abc` would otherwise read as two terms with no operator between them.
      if (NAME_CHARACTER.test(formula[index] ?? '')) {
        throw new FormulaError('syntax-error');
      }

      tokens.push(numberToken(number[1] ?? '', number[2]));
      continue;
    }

    const name = matchAt(NAME);

    if (name !== null) {
      tokens.push({ kind: 'name', name: name[0] });
      continue;
    }

    const symbol = matchAt(SYMBOL);

    if (symbol === null) {
      throw new FormulaError('syntax-error');
    }

    tokens.push({ kind: 'symbol', symbol: toSymbol(symbol[0]) });
  }

  return tokens;
}

function numberToken(countDigits: string, sidesDigits: string | undefined): Token {
  const count = Number(countDigits);

  if (sidesDigits === undefined) {
    if (count > Number.MAX_SAFE_INTEGER) {
      throw new FormulaError('syntax-error');
    }

    return { kind: 'integer', value: count };
  }

  const sides = Number(sidesDigits);

  if (count < 1 || count > DICE_COUNT_MAX || sides < 1 || sides > DICE_SIDES_MAX) {
    throw new FormulaError('dice-out-of-range');
  }

  return { kind: 'dice', count, sides };
}

function toSymbol(text: string): FormulaSymbol {
  switch (text) {
    case '+':
    case '-':
    case '*':
    case '/':
    case '(':
    case ')':
    case '<=':
    case '<':
    case '>=':
    case '>':
      return text;
    default:
      throw new FormulaError('syntax-error');
  }
}

function parseTokens(tokens: readonly Token[]): FormulaTree {
  let position = 0;

  function symbolAhead(): FormulaSymbol | null {
    const token = tokens[position];

    return token?.kind === 'symbol' ? token.symbol : null;
  }

  function expectSymbol(symbol: FormulaSymbol): void {
    if (symbolAhead() !== symbol) {
      throw new FormulaError('syntax-error');
    }

    position += 1;
  }

  function comparison(): FormulaTree {
    const left = sum();
    const operator = symbolAhead();

    if (operator === '<=' || operator === '<' || operator === '>=' || operator === '>') {
      position += 1;

      return { kind: 'comparison', operator, left, right: sum() };
    }

    return left;
  }

  function sum(): FormulaExpression {
    let left = product();

    for (let operator = symbolAhead(); operator === '+' || operator === '-';) {
      position += 1;
      left = { kind: 'binary', operator, left, right: product() };
      operator = symbolAhead();
    }

    return left;
  }

  function product(): FormulaExpression {
    let left = atom();

    for (let operator = symbolAhead(); operator === '*' || operator === '/';) {
      position += 1;
      left = { kind: 'binary', operator, left, right: atom() };
      operator = symbolAhead();
    }

    return left;
  }

  function atom(): FormulaExpression {
    const token = tokens[position];

    position += 1;

    if (token?.kind === 'integer' || token?.kind === 'dice') {
      return token;
    }

    if (token?.kind === 'name') {
      return nameAtom(token.name);
    }

    if (token?.kind === 'symbol' && token.symbol === '(') {
      const inner = sum();

      expectSymbol(')');

      return inner;
    }

    throw new FormulaError('syntax-error');
  }

  function nameAtom(name: string): FormulaExpression {
    if (symbolAhead() === '(') {
      const functionName = FORMULA_FUNCTION_NAMES.find((known) => known === name);

      if (functionName === undefined) {
        throw new FormulaError('unknown-function');
      }

      position += 1;

      const argument = sum();

      expectSymbol(')');

      return { kind: 'call', name: functionName, argument };
    }

    // A name no field can carry, such as `d20` or a bare `floor`, is not an id here either.
    if (!isFieldId(name)) {
      throw new FormulaError('syntax-error');
    }

    return { kind: 'field', id: name };
  }

  const tree = comparison();

  // A second comparison or a stray token is left over here.
  if (position !== tokens.length) {
    throw new FormulaError('syntax-error');
  }

  return tree;
}
