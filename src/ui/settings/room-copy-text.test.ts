import { describe, expect, test } from 'bun:test';

import type { RoomCopyStatus } from '@/core/ui-messages';

import { roomCopyText } from './room-copy-text';

// The texts of the 2.5 spec, written out by hand.
describe('roomCopyText', () => {
  test.each<[string, RoomCopyStatus, string]>([
    [
      'a saved copy with used and free kB, one decimal after a comma',
      { state: 'saved', usedBytes: 4249, freeBytes: 11251, outcome: null },
      'Сохранена. Занято 4,2 кБ, свободно 11,3 кБ.',
    ],
    [
      'no copy with the free kB',
      { state: 'none', usedBytes: 0, freeBytes: 15500, outcome: null },
      'Не сохранена. Свободно 15,5 кБ.',
    ],
    [
      'a failed copy as the not-saved message',
      { state: 'failed', usedBytes: 4249, freeBytes: 0, outcome: null },
      'Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок.',
    ],
  ])('shows %s', (_name, roomCopy, expected) => {
    // #when
    const text = roomCopyText(roomCopy);

    // #then
    expect(text).toBe(expected);
  });
});
