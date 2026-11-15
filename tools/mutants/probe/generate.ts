import { resolve } from 'node:path';

import { API } from 'typescript/unstable/async';
import {
  isArrowFunction,
  isAwaitExpression,
  isBinaryExpression,
  isCallExpression,
  isExpressionStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIfStatement,
  isMethodDeclaration,
  isNoSubstitutionTemplateLiteral,
  isPostfixUnaryExpression,
  isPrefixUnaryExpression,
  isPropertyAssignment,
  isStringLiteral,
  isTemplateExpression,
  isVariableDeclaration,
  isVoidExpression,
  SyntaxKind,
  type Expression,
  type Node,
  type SourceFile,
} from 'typescript/unstable/ast';

export type Mutation = {
  file: string;
  line: number;
  fn: string;
  op: string;
  before: string;
  after: string;
  start: number;
  end: number;
  text: string;
  nth: number;
};

const swaps: Partial<Record<SyntaxKind, string>> = {
  [SyntaxKind.EqualsEqualsEqualsToken]: '!==',
  [SyntaxKind.ExclamationEqualsEqualsToken]: '===',
  [SyntaxKind.LessThanToken]: '<=',
  [SyntaxKind.LessThanEqualsToken]: '<',
  [SyntaxKind.GreaterThanToken]: '>=',
  [SyntaxKind.GreaterThanEqualsToken]: '>',
  [SyntaxKind.AmpersandAmpersandToken]: '||',
  [SyntaxKind.BarBarToken]: '&&',
  [SyntaxKind.PlusToken]: '-',
  [SyntaxKind.MinusToken]: '+',
};

export async function generate(file: string, source: string): Promise<Mutation[]> {
  const sourceFile = await parseSourceFile(file, source);
  const mutations: Mutation[] = [];

  const add = (node: Node, op: string, start: number, end: number, replacement: string): void => {
    const before = source.slice(start, end);
    const text = normalize(source.slice(node.getStart(), node.getEnd()));

    mutations.push({
      file,
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      fn: functionPath(node),
      op,
      before: before.slice(0, 120),
      after: replacement,
      start,
      end,
      text,
      nth: 0,
    });
  };

  const visit = (node: Node): void => {
    if (isBinaryExpression(node)) {
      const replacement = swaps[node.operatorToken.kind];

      const isStringLiteralOperand = (expression: Expression): boolean =>
        isStringLiteral(expression) ||
        isTemplateExpression(expression) ||
        isNoSubstitutionTemplateLiteral(expression);

      if (
        replacement !== undefined &&
        !(
          (replacement === '-' || replacement === '+') &&
          (isStringLiteralOperand(node.left) || isStringLiteralOperand(node.right))
        )
      ) {
        add(
          node,
          `${node.operatorToken.getText()}→${replacement}`,
          node.operatorToken.getStart(),
          node.operatorToken.getEnd(),
          replacement,
        );
      }
    }

    if (isPrefixUnaryExpression(node) && node.operator === SyntaxKind.ExclamationToken) {
      add(node, 'drop !', node.getStart(), node.getEnd(), node.operand.getText());
    }

    if (node.kind === SyntaxKind.TrueKeyword) {
      add(node, 'true→false', node.getStart(), node.getEnd(), 'false');
    }

    if (node.kind === SyntaxKind.FalseKeyword) {
      add(node, 'false→true', node.getStart(), node.getEnd(), 'true');
    }

    if (isIfStatement(node)) {
      add(node.expression, 'if→true', node.expression.getStart(), node.expression.getEnd(), 'true');
      add(
        node.expression,
        'if→false',
        node.expression.getStart(),
        node.expression.getEnd(),
        'false',
      );
    }

    if (isExpressionStatement(node)) {
      let expression = node.expression;

      if (isAwaitExpression(expression) || isVoidExpression(expression)) {
        expression = expression.expression;
      }

      const isAssignment =
        isBinaryExpression(expression) &&
        expression.operatorToken.kind >= SyntaxKind.FirstAssignment &&
        expression.operatorToken.kind <= SyntaxKind.LastAssignment;

      if (
        isCallExpression(expression) ||
        isAssignment ||
        isPostfixUnaryExpression(expression) ||
        isPrefixUnaryExpression(expression)
      ) {
        add(
          node,
          isAssignment ? 'drop assignment' : 'drop statement',
          node.getStart(),
          node.getEnd(),
          ';',
        );
      }
    }

    node.forEachChild(visit);
  };

  visit(sourceFile);

  const unique = new Map<string, Mutation>();

  for (const mutation of mutations) {
    const key = `${mutation.start}:${mutation.end}:${mutation.after}`;

    if (!unique.has(key)) {
      unique.set(key, mutation);
    }
  }

  const nthByAnchor = new Map<string, number>();

  return [...unique.values()].map((mutation) => {
    const key = [mutation.file, mutation.fn, mutation.op, mutation.text].join('\0');
    const nth = (nthByAnchor.get(key) ?? 0) + 1;
    nthByAnchor.set(key, nth);

    return { ...mutation, nth };
  });
}

function functionPath(node: Node): string {
  const names: string[] = [];

  for (let current = node.parent; current; current = current.parent) {
    if ((isFunctionDeclaration(current) || isMethodDeclaration(current)) && current.name) {
      names.unshift(current.name.getText());
    } else if ((isArrowFunction(current) || isFunctionExpression(current)) && current.parent) {
      const parent = current.parent;

      if (isVariableDeclaration(parent) || isPropertyAssignment(parent)) {
        names.unshift(parent.name.getText());
      }
    }
  }

  return names.join(' > ') || '<module>';
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function parseSourceFile(file: string, source: string): Promise<SourceFile> {
  const absoluteFile = resolve(file);

  const api = new API({
    cwd: process.cwd(),
    fs: {
      fileExists(fileName) {
        return resolve(fileName) === absoluteFile ? true : undefined;
      },
      readFile(fileName) {
        return resolve(fileName) === absoluteFile ? source : undefined;
      },
    },
  });

  let snapshot;

  try {
    snapshot = await api.updateSnapshot({ openFiles: [absoluteFile] });
    const project = await snapshot.getDefaultProjectForFile(absoluteFile);
    const sourceFile = await project?.program.getSourceFile(absoluteFile);

    if (sourceFile === undefined) {
      throw new Error(`TypeScript could not parse ${file}.`);
    }

    return sourceFile;
  } finally {
    await snapshot?.dispose();
    await api.close();
  }
}
