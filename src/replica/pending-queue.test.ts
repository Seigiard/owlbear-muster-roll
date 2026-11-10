import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import type { Command } from '@/core/ui-messages';
import { createPendingQueue } from '@/replica/pending-queue';

const ROW_STR = { kind: 'row', rowId: 'str' } as const;
const ROW_NOTES = { kind: 'row', rowId: 'notes' } as const;

function patch(target: typeof ROW_STR | typeof ROW_NOTES, fieldId: string, value: JsonValue) {
  return { type: 'field-patch', sheetId: 'brok', target, fieldId, value } satisfies Command;
}

const CREATE: Command = { type: 'sheet-create', sheetId: 'liza', kind: 'pc', name: 'Лиза' };
const RENAME: Command = { type: 'sheet-rename', sheetId: 'liza', name: 'Лиза Смелая' };

describe('pending queue', () => {
  test('holds one entry per record key, and two fields of one row apply together', () => {
    // #given
    const queue = createPendingQueue();

    // #when
    queue.add('c1', patch(ROW_STR, 'str', 12));
    queue.add('c2', patch(ROW_STR, 'str_tired', true));

    // #then
    expect(queue.entries()).toEqual([
      {
        kind: 'patches',
        key: 'row:brok:str',
        patches: [
          { id: 'c1', command: patch(ROW_STR, 'str', 12) },
          { id: 'c2', command: patch(ROW_STR, 'str_tired', true) },
        ],
      },
    ]);
  });

  test('keeps the place of the first patch of a key, and a newer value of a field replaces it', () => {
    // #given
    const queue = createPendingQueue();

    // #when
    queue.add('c1', patch(ROW_STR, 'str', 12));
    queue.add('c2', CREATE);
    queue.add('c3', patch(ROW_NOTES, 'notes', 'Хромает'));
    queue.add('c4', patch(ROW_STR, 'str', 14));
    queue.add('c5', RENAME);

    // #then
    expect(queue.entries()).toEqual([
      {
        kind: 'patches',
        key: 'row:brok:str',
        patches: [{ id: 'c4', command: patch(ROW_STR, 'str', 14) }],
      },
      { kind: 'intent', id: 'c2', command: CREATE },
      {
        kind: 'patches',
        key: 'row:brok:notes',
        patches: [{ id: 'c3', command: patch(ROW_NOTES, 'notes', 'Хромает') }],
      },
      { kind: 'intent', id: 'c5', command: RENAME },
    ]);
  });

  test('hands every entry over in arrival order and is empty after', () => {
    // #given
    const queue = createPendingQueue();

    queue.add('c1', CREATE);
    queue.add('c2', RENAME);

    // #when
    const taken = queue.takeAll();

    // #then
    expect({
      taken: taken.map((entry) => entry.kind === 'intent' && entry.id),
      left: queue.entries(),
    }).toEqual({ taken: ['c1', 'c2'], left: [] });
  });
});
