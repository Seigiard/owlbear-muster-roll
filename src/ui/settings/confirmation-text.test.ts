import { describe, expect, test } from 'bun:test';
import { presetConfirmationText } from './preset-confirmation';
import { snapshotConfirmationText } from './snapshot-confirmation';

describe('presetConfirmationText', () => {
  test.each<[string, number, number, string]>([
    ['values only', 3, 0, 'Значения удалённых полей будут стёрты: 3. Загрузить пресет?'],
    ['sheets only', 0, 2, 'Листы будут удалены: 2. Загрузить пресет?'],
    [
      'values and sheets',
      3,
      2,
      'Значения удалённых полей будут стёрты: 3. Листы будут удалены: 2. Загрузить пресет?',
    ],
  ])('%s', (_name, count, sheets, expected) => {
    // #then
    expect(presetConfirmationText(count, sheets)).toBe(expected);
  });
});

describe('snapshotConfirmationText', () => {
  const IMPORT =
    'Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?';

  test.each<[string, number, number, string]>([
    ['nothing dropped', 0, 0, IMPORT],
    ['values dropped', 3, 0, `${IMPORT} Не войдут значения удалённых полей: 3.`],
    ['sheets dropped', 0, 2, `${IMPORT} Не войдут листы: 2.`],
    [
      'values and sheets dropped',
      3,
      2,
      `${IMPORT} Не войдут значения удалённых полей: 3. Не войдут листы: 2.`,
    ],
  ])('%s', (_name, count, sheets, expected) => {
    // #then
    expect(snapshotConfirmationText(count, sheets)).toBe(expected);
  });
});
