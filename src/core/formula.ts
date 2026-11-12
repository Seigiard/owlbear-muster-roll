import { FORMULA_FUNCTION_NAMES, isFieldId } from '@/core/field-id';
import { err, ok, type Result } from '@/core/result';

export const FORMULA_MAX_LENGTH = 200;

const DICE_COUNT_MAX = 100;
const DICE_SIDES_MAX = 1000;

const WHITESPACE = /\s+/y;
const DICE_FIELD = /([0-9]+)[dD]\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/y;
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
  | { kind: 'dice-field'; count: number; id: string }
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

type TokenSpan = { start: number; end: number };

type Token =
  | ({ kind: 'integer'; value: number } & TokenSpan)
  | ({ kind: 'dice'; count: number; sides: number } & TokenSpan)
  | ({ kind: 'dice-field'; count: number; id: string } & TokenSpan)
  | ({ kind: 'name'; name: string } & TokenSpan)
  | ({ kind: 'symbol'; symbol: FormulaSymbol } & TokenSpan);

// Grammar:
//   comparison = sum [('<=' | '<' | '>=' | '>') sum]
//   sum        = product (('+' | '-') product)*
//   product    = atom (('*' | '/') atom)*
//   atom       = integer | dice | Nd(id) | id | call | '(' sum ')'
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

// Writes each parsed Nd(id) token as the literal die selected for that id, while preserving all
// other source text. The caller resolves every token before calling this function.
export function writeDiceFields(formula: string, resolve: (id: string) => number): string {
  const tokens = tokenize(formula);
  let written = '';
  let sourceIndex = 0;

  for (const token of tokens) {
    if (token.kind !== 'dice-field') {
      continue;
    }

    written += formula.slice(sourceIndex, token.start);
    written += `${token.count}d${resolve(token.id)}`;
    sourceIndex = token.end;
  }

  return written + formula.slice(sourceIndex);
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

    const diceFieldStart = index;
    const diceField = matchAt(DICE_FIELD);

    if (diceField !== null) {
      if (NAME_CHARACTER.test(formula[index] ?? '')) {
        throw new FormulaError('syntax-error');
      }

      tokens.push(diceFieldToken(diceField[1] ?? '', diceField[2] ?? '', diceFieldStart, index));
      continue;
    }

    const numberStart = index;
    const number = matchAt(NUMBER);

    if (number !== null) {
      // `1d6x` or `2abc` would otherwise read as two terms with no operator between them.
      if (NAME_CHARACTER.test(formula[index] ?? '')) {
        throw new FormulaError('syntax-error');
      }

      tokens.push(numberToken(number[1] ?? '', number[2], numberStart, index));
      continue;
    }

    const nameStart = index;
    const name = matchAt(NAME);

    if (name !== null) {
      tokens.push({ kind: 'name', name: name[0], start: nameStart, end: index });
      continue;
    }

    const symbolStart = index;
    const symbol = matchAt(SYMBOL);

    if (symbol === null) {
      throw new FormulaError('syntax-error');
    }

    tokens.push({ kind: 'symbol', symbol: toSymbol(symbol[0]), start: symbolStart, end: index });
  }

  return tokens;
}

function numberToken(
  countDigits: string,
  sidesDigits: string | undefined,
  start: number,
  end: number,
): Token {
  const count = Number(countDigits);

  if (sidesDigits === undefined) {
    if (count > Number.MAX_SAFE_INTEGER) {
      throw new FormulaError('syntax-error');
    }

    return { kind: 'integer', value: count, start, end };
  }

  const sides = Number(sidesDigits);

  if (count < 1 || count > DICE_COUNT_MAX || sides < 1 || sides > DICE_SIDES_MAX) {
    throw new FormulaError('dice-out-of-range');
  }

  return { kind: 'dice', count, sides, start, end };
}

function diceFieldToken(countDigits: string, id: string, start: number, end: number): Token {
  const count = Number(countDigits);

  if (count < 1 || count > DICE_COUNT_MAX) {
    throw new FormulaError('dice-out-of-range');
  }

  if (!isFieldId(id)) {
    throw new FormulaError('syntax-error');
  }

  return { kind: 'dice-field', count, id, start, end };
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

    if (token?.kind === 'integer') {
      return { kind: 'integer', value: token.value };
    }

    if (token?.kind === 'dice') {
      return { kind: 'dice', count: token.count, sides: token.sides };
    }

    if (token?.kind === 'dice-field') {
      return { kind: 'dice-field', count: token.count, id: token.id };
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
