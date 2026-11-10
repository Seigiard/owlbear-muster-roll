import { describe, expect, test } from 'bun:test';

import type { VersionedRecord } from '@/core/records';

import { visibleRecords } from './visibility';

const RECORDS: VersionedRecord[] = [
  { k: 'sheet:a', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'conn' },
  { k: 'link:t', d: null, c: 2, a: 'conn' },
];

describe('visibleRecords', () => {
  test.each(['GM', 'PLAYER'] as const)('passes every record through for %s', (role) => {
    // #when
    const visible = visibleRecords(role, RECORDS);

    // #then
    expect(visible).toEqual(RECORDS);
  });
});
