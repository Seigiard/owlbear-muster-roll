import { describe, expect, test } from 'bun:test';
import type { RejectionReason } from '@/core/ui-messages';
import { snapshotRejectionText } from '@/ui/settings/snapshot-text';

// The strings of the 5.3 review, written out by hand.
describe('snapshotRejectionText', () => {
  test.each([
    ['not-allowed', 'Загружать снимок может только мастер.'],
    ['catching-up', 'Загрузка…'],
    ['importing', 'Идёт загрузка снимка…'],
    ['data-replaced', 'Данные комнаты уже заменены.'],
    ['write-failed', 'Не удалось загрузить снимок. Попробуйте ещё раз.'],
    ['invalid-snapshot', 'Файл не подошёл: неверная структура. Ничего не изменено.'],
    ['preset-required', 'Сначала загрузите пресет.'],
    // A reason the import never sends still says that it failed.
    ['unknown-field', 'Не удалось загрузить снимок. Попробуйте ещё раз.'],
  ] satisfies [RejectionReason, string][])('says what %s means', (reason, text) => {
    // #when
    const shown = snapshotRejectionText(reason);
    // #then
    expect(shown).toBe(text);
  });
});
