import { describe, expect, test } from 'bun:test';

import { generate } from './generate';

describe('generate', () => {
  test('lists each supported mutation with its source location, function path, normalized node text and nth', async () => {
    // #given
    const source = [
      'const top = enabled;',
      'function outer(left: number, right: number, enabled: boolean) {',
      '  const nested = () => {',
      '    if (left === right && enabled) {',
      '      publish();',
      '      total += 1;',
      '      index++;',
      '      !enabled;',
      '      true;',
      '      false;',
      '    }',
      '    return left + right;',
      '  };',
      '  return nested;',
      '}',
      'const text = "prefix" + top;',
    ].join('\n');

    // #when
    const mutations = await generate('src/replica/example.ts', source);

    // #then
    expect(mutations).toEqual([
      {
        file: 'src/replica/example.ts',
        line: 4,
        fn: 'outer > nested',
        op: 'if→true',
        before: 'left === right && enabled',
        after: 'true',
        start: 118,
        end: 143,
        text: 'left === right && enabled',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 4,
        fn: 'outer > nested',
        op: 'if→false',
        before: 'left === right && enabled',
        after: 'false',
        start: 118,
        end: 143,
        text: 'left === right && enabled',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 4,
        fn: 'outer > nested',
        op: '&&→||',
        before: '&&',
        after: '||',
        start: 133,
        end: 135,
        text: 'left === right && enabled',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 4,
        fn: 'outer > nested',
        op: '===→!==',
        before: '===',
        after: '!==',
        start: 123,
        end: 126,
        text: 'left === right',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 5,
        fn: 'outer > nested',
        op: 'drop statement',
        before: 'publish();',
        after: ';',
        start: 153,
        end: 163,
        text: 'publish();',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 6,
        fn: 'outer > nested',
        op: 'drop assignment',
        before: 'total += 1;',
        after: ';',
        start: 170,
        end: 181,
        text: 'total += 1;',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 7,
        fn: 'outer > nested',
        op: 'drop statement',
        before: 'index++;',
        after: ';',
        start: 188,
        end: 196,
        text: 'index++;',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 8,
        fn: 'outer > nested',
        op: 'drop statement',
        before: '!enabled;',
        after: ';',
        start: 203,
        end: 212,
        text: '!enabled;',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 8,
        fn: 'outer > nested',
        op: 'drop !',
        before: '!enabled',
        after: 'enabled',
        start: 203,
        end: 211,
        text: '!enabled',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 9,
        fn: 'outer > nested',
        op: 'true→false',
        before: 'true',
        after: 'false',
        start: 219,
        end: 223,
        text: 'true',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 10,
        fn: 'outer > nested',
        op: 'false→true',
        before: 'false',
        after: 'true',
        start: 231,
        end: 236,
        text: 'false',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 12,
        fn: 'outer > nested',
        op: '+→-',
        before: '+',
        after: '-',
        start: 260,
        end: 261,
        text: 'left + right',
        nth: 1,
      },
    ]);
  });

  test('keeps duplicate anchors distinct by their source-order nth and mutates identifier addition', async () => {
    // #given
    const source = [
      'function compare(left: number, right: number, text: string) {',
      '  if (left === right) publish();',
      '  if (left === right) publish();',
      '  return text + left;',
      '}',
    ].join('\n');

    // #when
    const mutations = await generate('src/replica/example.ts', source);

    // #then
    expect(mutations.filter(({ op }) => op === '===→!==' || op === '+→-')).toEqual([
      {
        file: 'src/replica/example.ts',
        line: 2,
        fn: 'compare',
        op: '===→!==',
        before: '===',
        after: '!==',
        start: 73,
        end: 76,
        text: 'left === right',
        nth: 1,
      },
      {
        file: 'src/replica/example.ts',
        line: 3,
        fn: 'compare',
        op: '===→!==',
        before: '===',
        after: '!==',
        start: 106,
        end: 109,
        text: 'left === right',
        nth: 2,
      },
      {
        file: 'src/replica/example.ts',
        line: 4,
        fn: 'compare',
        op: '+→-',
        before: '+',
        after: '-',
        start: 142,
        end: 143,
        text: 'text + left',
        nth: 1,
      },
    ]);
  });

  test('swaps every supported non-string binary operator exactly once', async () => {
    // #given
    const source = [
      'function operators(left: number, right: number, text: string) {',
      '  left !== right;',
      '  left < right;',
      '  left <= right;',
      '  left > right;',
      '  left >= right;',
      '  left || right;',
      '  left + right;',
      '  left - right;',
      '  text + left;',
      '}',
    ].join('\n');

    // #when
    const mutations = await generate('src/replica/example.ts', source);

    // #then
    expect(
      mutations
        .filter(({ op }) => op.includes('→') && !op.startsWith('if'))
        .map(({ op, before, after, fn, nth }) => ({ op, before, after, fn, nth })),
    ).toEqual([
      { op: '!==→===', before: '!==', after: '===', fn: 'operators', nth: 1 },
      { op: '<→<=', before: '<', after: '<=', fn: 'operators', nth: 1 },
      { op: '<=→<', before: '<=', after: '<', fn: 'operators', nth: 1 },
      { op: '>→>=', before: '>', after: '>=', fn: 'operators', nth: 1 },
      { op: '>=→>', before: '>=', after: '>', fn: 'operators', nth: 1 },
      { op: '||→&&', before: '||', after: '&&', fn: 'operators', nth: 1 },
      { op: '+→-', before: '+', after: '-', fn: 'operators', nth: 1 },
      { op: '-→+', before: '-', after: '+', fn: 'operators', nth: 1 },
      { op: '+→-', before: '+', after: '-', fn: 'operators', nth: 1 },
    ]);
  });

  test('drops awaited and void calls while retaining their enclosing statement text', async () => {
    // #given
    const source = ['async function notify() {', '  await publish();', '  void clear();', '}'].join(
      '\n',
    );

    // #when
    const mutations = await generate('src/replica/example.ts', source);

    // #then
    expect(
      mutations.map(({ op, before, after, text, fn, nth }) => ({
        op,
        before,
        after,
        text,
        fn,
        nth,
      })),
    ).toEqual([
      {
        op: 'drop statement',
        before: 'await publish();',
        after: ';',
        text: 'await publish();',
        fn: 'notify',
        nth: 1,
      },
      {
        op: 'drop statement',
        before: 'void clear();',
        after: ';',
        text: 'void clear();',
        fn: 'notify',
        nth: 1,
      },
    ]);
  });

  test('uses the full operand as the replacement when dropping a long negation', async () => {
    // #given
    const operand = `value${'x'.repeat(150)}`;
    const source = `function check() { !${operand}; }`;

    // #when
    const mutations = await generate('src/replica/example.ts', source);

    // #then
    expect(mutations.find(({ op }) => op === 'drop !')?.after).toBe(operand);
  });
});
