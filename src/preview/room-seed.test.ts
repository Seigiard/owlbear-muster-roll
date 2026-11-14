import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { inflateFromBase64 } from '@/core/deflate';
import { parsePresetFile } from '@/core/preset';
import { parseStoredRecord } from '@/core/records';
import { previewSheets } from '@/preview/sample-records';
import { parseStorageKey } from '@/core/storage-key';

import { roomSeed } from './room-seed';

const PRESET_TEXT = JSON.stringify({
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Characters',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Name' },
                  { kind: 'field', type: 'text', id: 'name' },
                ],
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('roomSeed', () => {
  test('does not create entries for a preset that fails to parse', () => {
    // #given
    const invalid = 'not json';

    // #when
    const seeded = roomSeed(invalid);

    // #then
    expect(seeded).toEqual({ ok: false, error: { code: 'not-json' } });
  });

  test('creates a preset record and every sample record under generation zero', () => {
    // #given
    const parsed = parsePresetFile(PRESET_TEXT);

    if (!parsed.ok) {
      throw new Error(`test preset failed to parse: ${parsed.error.code}`);
    }

    const expected = previewSheets(parsed.value, 'sample');

    // #when
    const seeded = roomSeed(PRESET_TEXT);

    // #then
    expect(seeded.ok).toBe(true);

    if (!seeded.ok) {
      return;
    }

    const records = seeded.value.map(([key, value]) => {
      const parts = parseStorageKey(key);

      expect(parts.ok).toBe(true);

      if (!parts.ok) {
        throw new Error('room seed returned an invalid storage key');
      }

      const record = parseStoredRecord(value, parts.value.key);

      expect(record.ok).toBe(true);

      if (!record.ok) {
        throw new Error('room seed returned an invalid stored record');
      }

      return record.value;
    });

    const presetRecord = records.find((record) => record.k === 'preset');

    expect(presetRecord).toBeDefined();

    if (presetRecord === undefined || presetRecord.k !== 'preset') {
      return;
    }

    const inflated = inflateFromBase64(z.string().parse(presetRecord.d), 1024 * 1024);

    expect(inflated).toEqual({ ok: true, value: JSON.stringify(parsed.value) });
    expect(records.filter((record) => record.k !== 'preset')).toEqual([
      ...expected.records.values(),
    ]);
  });
});
