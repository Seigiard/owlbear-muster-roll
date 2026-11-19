import { Result } from 'better-result';
import { expect, test } from 'bun:test';
import { parseEngineMessage, wireOpenSheetOf } from './ui-messages';

test('parses a cell-target open request with its repeat block address', () => {
  // #given
  const message = {
    t: 'open-sheet',
    id: 'open-1',
    sheetId: 'heroes',
    path: ['attacks', 'attack-1'],
    cellId: 'portrait',
  };

  const untouched = structuredClone(message);

  // #when
  const parsed = parseEngineMessage(message);

  // #then
  expect({ message, parsed }).toEqual({
    message: untouched,
    parsed: Result.ok({
      t: 'open-sheet',
      id: 'open-1',
      block: { sheetId: 'heroes', path: ['attacks', 'attack-1'] },
      cellId: 'portrait',
    }),
  });
});

test('round-trips a cell-target open request without changing its internal form', () => {
  // #given
  const literal = {
    t: 'open-sheet',
    id: 'open-1',
    sheetId: 'heroes',
    path: ['attacks', 'attack-1'],
    cellId: 'portrait',
  };

  // #when
  const parsed = parseEngineMessage(structuredClone(literal));

  if (!parsed.isOk() || parsed.value.t !== 'open-sheet') {
    throw new Error('the wire open-sheet message must parse');
  }

  const internal = structuredClone(parsed.value);
  const wire = wireOpenSheetOf(parsed.value);

  // #then
  expect({ internal: parsed.value, newObject: !Object.is(wire, parsed.value), wire }).toEqual({
    internal,
    newObject: true,
    wire: literal,
  });
});

test('drops an open request whose repeat path has an odd number of segments', () => {
  // #when
  const parsed = parseEngineMessage({
    t: 'open-sheet',
    id: 'open-1',
    sheetId: 'heroes',
    path: ['attacks', 'attack-1', 'detail'],
    cellId: 'portrait',
  });
  // #then

  expect(parsed).toEqual(Result.err('invalid-message'));
});
