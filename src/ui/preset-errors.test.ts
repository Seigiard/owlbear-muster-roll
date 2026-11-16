import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { PresetFailure } from '@/core/preset';
import { presetFailureMessage, presetRejectionMessage } from './preset-errors';

describe('presetFailureMessage', () => {
  test.each<[PresetFailure, string]>([
    [{ code: 'not-json' }, 'Файл не подошёл: это не JSON. Ничего не изменено.'],
    [{ code: 'invalid-structure' }, 'Файл не подошёл: неверная структура. Ничего не изменено.'],
    [
      { code: 'unsupported-version' },
      'Файл не подошёл: неподдерживаемая версия формата. Ничего не изменено.',
    ],
    [
      { code: 'invalid-id', detail: 'd20' },
      'Файл не подошёл: недопустимый id поля «d20». Ничего не изменено.',
    ],
    [
      { code: 'duplicate-id', detail: 'str' },
      'Файл не подошёл: поле «str» повторяется. Ничего не изменено.',
    ],
    [
      { code: 'bad-repeat' },
      'Файл не подошёл: в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем. Ничего не изменено.',
    ],
    [
      { code: 'untitled-tab', detail: 'pc' },
      'Файл не подошёл: в листе «pc» больше одной вкладки, и у вкладки нет заголовка. Ничего не изменено.',
    ],
    [
      { code: 'invalid-template-id', detail: 'd6' },
      'Файл не подошёл: недопустимый id листа «d6». Ничего не изменено.',
    ],
    [
      { code: 'duplicate-template', detail: 'npc' },
      'Файл не подошёл: лист «npc» повторяется. Ничего не изменено.',
    ],
    [
      { code: 'bad-name-field', detail: 'pc', field: 'hp' },
      'Файл не подошёл: в наборе «pc» нет текстового поля «hp» вне повторяемых секций. Ничего не изменено.',
    ],
    [
      { code: 'duplicate-section', detail: 'item' },
      'Файл не подошёл: две повторяемые секции с id «item». Ничего не изменено.',
    ],
    [
      { code: 'row-too-wide' },
      'Файл не подошёл: в строке больше ячеек, чем колонок. Ничего не изменено.',
    ],
    [
      { code: 'bad-formula', detail: '1d0' },
      'Файл не подошёл: ошибка в формуле «1d0». Ничего не изменено.',
    ],
    [{ code: 'too-large' }, 'Файл не подошёл: файл слишком большой. Ничего не изменено.'],
    [
      { code: 'bad-window' },
      'Файл не подошёл: в window нужны только width и height, целые числа: ширина от 480 до 1440 px, высота от 360 до 1080 px. Ничего не изменено.',
    ],
    [{ code: 'newer-version' }, 'Файл из более новой версии. Перезагрузите страницу.'],
  ])('gives %j its message', (failure, message) => {
    // #when
    const text = presetFailureMessage(failure);
    // #then
    expect(text).toBe(message);
  });
  test.each([
    [
      { code: 'bad-die-option', detail: '8', field: 'weapon_die' },
      'Файл не подошёл: вариант «8» в поле «weapon_die» не кубик вида d6. Ничего не изменено.',
    ],
    [
      {
        code: 'die-field-as-number',
        detail: '1d20 + weapon_die',
        field: 'weapon_die',
      },
      'Файл не подошёл: в формуле «1d20 + weapon_die» поле «weapon_die» — выбор кубика, бросайте его как 1d(weapon_die). Ничего не изменено.',
    ],
    [
      { code: 'field-not-die', detail: '1d(bonus)', field: 'bonus' },
      'Файл не подошёл: в формуле «1d(bonus)» поле «bonus» не выбор кубика. Ничего не изменено.',
    ],
  ] as const)('gives the dice-choice failure %j its exact message', (failure, message) => {
    // #when
    // SAFETY: the table supplies the exact future PresetFailure variants from the approved spec.
    const presetFailure = z.unknown().parse(failure) as PresetFailure;

    const actual = (() => {
      try {
        return presetFailureMessage(presetFailure);
      } catch (error) {
        return { threw: error instanceof Error ? error.message : String(error) };
      }
    })();

    // #then
    expect(actual).toBe(message);
  });
  test.each<[PresetFailure, string]>([
    [
      { code: 'blank-name', detail: 'hp', cell: 'field' },
      'Файл не подошёл: пустое название у поля «hp». Ничего не изменено.',
    ],
    [
      { code: 'blank-name', detail: '1d20', cell: 'dice' },
      'Файл не подошёл: пустое название у кубика «1d20». Ничего не изменено.',
    ],
    [
      { code: 'long-name', detail: 'hp', cell: 'field' },
      'Файл не подошёл: название поля «hp» длиннее 60 символов. Ничего не изменено.',
    ],
    [
      { code: 'long-name', detail: '1d20', cell: 'dice' },
      'Файл не подошёл: название кубика «1d20» длиннее 60 символов. Ничего не изменено.',
    ],
  ] as const)('gives the cell-name failure %j its exact message', (failure, message) => {
    // #when
    const actual = (() => {
      try {
        return presetFailureMessage(failure);
      } catch (error) {
        return { threw: error instanceof Error ? error.message : String(error) };
      }
    })();

    // #then
    expect(actual).toBe(message);
  });
});

describe('presetRejectionMessage', () => {
  test.each([
    ['too-large', 'Файл не подошёл: файл слишком большой. Ничего не изменено.'],
    ['invalid-preset', 'Файл не подошёл: неверная структура. Ничего не изменено.'],
  ] as const)('gives the engine reason %s its bad file message', (reason, message) => {
    // #when
    const text = presetRejectionMessage(reason);
    // #then
    expect(text).toBe(message);
  });
  test('leaves catching-up to the disabled reason of the upload', () => {
    // #when
    const text = presetRejectionMessage('catching-up');
    // #then
    expect(text).toBeNull();
  });
  test('says an unreadable stored preset needs a newer build', () => {
    // #when
    const text = presetRejectionMessage('preset-unreadable');
    // #then
    expect(text).toBe('Сохранённый пресет не читается. Обновите расширение.');
  });
  test.each([
    ['write-failed', 'Не удалось сохранить пресет. Попробуйте ещё раз.'],
    ['not-allowed', 'Загружать пресет может только мастер.'],
  ] as const)('gives the engine reason %s its own message', (reason, message) => {
    // #when
    const text = presetRejectionMessage(reason);
    // #then
    expect(text).toBe(message);
  });
});
