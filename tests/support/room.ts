import { readFileSync } from 'node:fs';

import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { deflateSync, strToU8 } from 'fflate';

import type { JsonValue } from '@/core/json';

// The mock room's storage before any import: generation 0 with no author.
export const STORAGE_PREFIX = 'mr1:mock-room:0::';

export const EXAMPLE_PRESET_TEXT = readFileSync(
  new URL('../../docs/example-preset.json', import.meta.url),
  'utf8',
);

const ADD = 'Добавить персонажа';

export type StoredRecord = { k: string; d: JsonValue; c: number; a: string };

export type SeededSheet = { id: string; name: string; order: number };

// A seeded record has the author "seed". A tombstone is minted by the background, as the mock's
// own connection.
export function record(k: string, d: JsonValue, c = 1): StoredRecord {
  return { k, d, c, a: d === null ? 'mock-connection' : 'seed' };
}

export function sheetRecord(sheet: SeededSheet): StoredRecord {
  return record(`sheet:${sheet.id}`, { kind: 'pc', name: sheet.name, order: sheet.order });
}

// The stored `preset` record for a preset file's text, as the background keeps it.
export function presetRecord(text: string): string {
  const d = Buffer.from(deflateSync(strToU8(JSON.stringify(JSON.parse(text))))).toString('base64');

  return JSON.stringify({ k: 'preset', d, c: 1, a: 'mock-connection' });
}

export async function openBackground(
  context: BrowserContext,
  path = '/background.html',
): Promise<Page> {
  const background = await context.newPage();

  await background.goto(path, { waitUntil: 'networkidle' });

  return background;
}

// The window loads first, so the storage it seeds is what the background reads at start.
export async function openRoom(
  page: Page,
  context: BrowserContext,
  records: readonly StoredRecord[] = [],
  presetText = EXAMPLE_PRESET_TEXT,
): Promise<Page> {
  const entries: (readonly [string, string])[] = [
    [`${STORAGE_PREFIX}preset`, presetRecord(presetText)],
    ...records.map((one) => [`${STORAGE_PREFIX}${one.k}`, JSON.stringify(one)] as const),
  ];

  await page.goto('/index.html');
  await page.evaluate((seeded) => {
    for (const [key, value] of seeded) {
      localStorage.setItem(key, value);
    }
  }, entries);

  const background = await openBackground(context);

  await expect(page.getByRole('button', { name: ADD })).toBeVisible();

  return background;
}
