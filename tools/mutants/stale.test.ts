import { describe, expect, test } from 'bun:test';

import { describeStale } from './stale';

const source = [
  'function gate() {',
  '  if (ready) {',
  '    publish();',
  '  }',
  '  if (ready) {',
  '    publish();',
  '  }',
  '}',
].join('\n');

describe('describeStale', () => {
  test('lists the line of every match when the anchor is not unique', () => {
    // #given
    const find = '  if (ready) {\n    publish();\n';

    // #when
    const message = describeStale(source, find);

    // #then
    expect(message).toBe('anchor matches 2 times, at lines 2, 5');
  });

  test('names the first anchor line that no longer exists', () => {
    // #given
    const find = '  if (ready) {\n    publishAll();\n  }\n';

    // #when
    const message = describeStale(source, find);

    // #then
    expect(message).toBe('anchor not found; its line 2 is gone: publishAll();');
  });

  test('says so when every anchor line exists but the block does not', () => {
    // #given
    const find = '    publish();\n  if (ready) {\n';

    // #when
    const message = describeStale(source, find);

    // #then
    expect(message).toBe('anchor not found; each of its lines exists, but not as one block');
  });
});
