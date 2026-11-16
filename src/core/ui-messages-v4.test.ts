import { expect, test } from 'bun:test';
import { parseEngineMessage, type EngineMessage } from './ui-messages';

test('accepts a cell-target open request with its repeat path', () => {
  // #given
  const message: EngineMessage = {
    t: 'open-sheet',
    id: 'open-1',
    sheetId: 'heroes',
    path: ['attacks', 'attack-1'],
    cellId: 'portrait',
  };

  // #when
  const parsed = parseEngineMessage(message);

  // #then
  expect(parsed).toEqual({ ok: true, value: message });
});
