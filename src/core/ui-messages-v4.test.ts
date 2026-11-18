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

  // #when
  const parsed = parseEngineMessage(message);

  // #then
  expect(parsed).toEqual({
    ok: true,
    value: {
      t: 'open-sheet',
      id: 'open-1',
      block: { sheetId: 'heroes', path: ['attacks', 'attack-1'] },
      cellId: 'portrait',
    },
  });
});

test('round-trips a cell-target open request with its repeat path', () => {
  // #given
  const message = {
    t: 'open-sheet',
    id: 'open-1',
    sheetId: 'heroes',
    path: ['attacks', 'attack-1'],
    cellId: 'portrait',
  };
  // #when

  const parsed = parseEngineMessage(message);

  if (!parsed.ok || parsed.value.t !== 'open-sheet') {
    throw new Error('the wire open-sheet message must parse');
  }

  const wire = wireOpenSheetOf(parsed.value);
  // #then
  expect(wire).toEqual(message);
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

  expect(parsed).toEqual({ ok: false, error: 'invalid-message' });
});
