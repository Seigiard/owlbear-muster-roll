import { expect, test } from 'bun:test';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { pickerGroups } from '@/core/token-links';

test('labels an unnamed sheet-set sheet with its template title', () => {
  const preset: Preset = {
    v: 4,
    templates: [
      {
        id: 'heroes',
        title: 'Герои',
        repeat: { nameField: 'sheet_name' },
        tabs: [
          {
            sections: [
              {
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'sheet_name' },
                      { kind: 'token', id: 'portrait' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const records = new Map<string, VersionedRecord>([
    ['preset', { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' }],
    [
      'blk:h1',
      {
        k: 'blk:h1',
        d: { set: 'heroes', order: 0, cells: { sheet_name: [null, 1, 'seed'] } },
        c: 1,
        a: 'seed',
        l: [1, 'seed'],
      },
    ],
  ]);

  expect(pickerGroups(records, preset)[0]?.targets[0]?.label).toBe('Герои');
});
