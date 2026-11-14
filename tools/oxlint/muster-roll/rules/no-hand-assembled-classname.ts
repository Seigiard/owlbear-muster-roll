import { defineRule, type ESTree } from '@oxlint/plugins';

function unwrapParentheses(node: ESTree.Expression): ESTree.Expression {
  let current = node;

  while (current.type === 'ParenthesizedExpression') {
    current = current.expression;
  }

  return current;
}

function isHandAssembledClassName(node: ESTree.Expression): boolean {
  const expression = unwrapParentheses(node);

  if (expression.type === 'TemplateLiteral') {
    return expression.expressions.length > 0;
  }

  if (expression.type === 'BinaryExpression') {
    return expression.operator === '+';
  }

  if (expression.type === 'ConditionalExpression') {
    return true;
  }

  if (expression.type === 'LogicalExpression') {
    return expression.operator === '&&';
  }

  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    !expression.callee.computed &&
    expression.callee.property.type === 'Identifier' &&
    expression.callee.property.name === 'join'
  );
}

/** Keep className conditionals in clsx or cva instead of assembling strings in JSX. */
export const noHandAssembledClassNameRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow direct className expressions that assemble conditional class strings.',
    },
    messages: {
      avoid:
        'Build conditional className values with clsx or cva instead of assembling them directly.',
    },
  },
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name.type !== 'JSXIdentifier' ||
          node.name.name !== 'className' ||
          node.value?.type !== 'JSXExpressionContainer' ||
          node.value.expression.type === 'JSXEmptyExpression'
        ) {
          return;
        }

        if (isHandAssembledClassName(node.value.expression)) {
          context.report({ node: node.value.expression, messageId: 'avoid' });
        }
      },
    };
  },
});
