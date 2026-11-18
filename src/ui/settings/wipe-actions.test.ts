import { describe, expect, test } from 'bun:test';
import type { RejectionReason } from '@/core/ui-messages';
import { wipeRejectionText } from './wipe-actions';

describe('wipeRejectionText', () => {
  test.each<[RejectionReason, string]>([
    ['not-allowed', 'Очищать может только мастер.'],
    ['catching-up', 'Загрузка…'],
    ['importing', 'Идёт загрузка снимка. Очистить можно после неё.'],
    ['data-replaced', 'Данные комнаты уже заменены.'],
    ['write-failed', 'Не удалось очистить. Попробуйте ещё раз.'],
    // Any reason no case names falls back to the failed wipe.
    ['too-large', 'Не удалось очистить. Попробуйте ещё раз.'],
  ])('%s', (reason, expected) => {
    // #then
    expect(wipeRejectionText(reason)).toBe(expected);
  });
});
