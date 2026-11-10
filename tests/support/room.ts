import { readFileSync } from 'node:fs';

import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { deflateSync, strToU8 } from 'fflate';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';

// The mock room's storage before any import: generation 0 with no author.
export const STORAGE_PREFIX = 'mr1:mock-room:0::';

export const EXAMPLE_PRESET_TEXT = readFileSync(
  new URL('../../docs/example-preset.json', import.meta.url),
  'utf8',
);

const ADD = 'Добавить персонажа';

const CHANNEL = 'app.muster-roll/ui';

// A command id `afterSettling` sends, so a watched window can tell its probes from real commands.
const PROBE_PREFIX = 'probe-';

// What `storedData` reads for a key with no record, so a tombstone's `null` cannot pass for one.
export const ABSENT = '(absent)';

export const storedRecordSchema = z.object({
  k: z.string(),
  d: z.json(),
  c: z.number(),
  a: z.string(),
});

export type StoredRecord = { k: string; d: JsonValue; c: number; a: string };

// Records by key, so a comparison does not depend on the order the storage lists its keys in.
export type Keyed = Record<string, StoredRecord>;

export type SeenCommand = { id: string; type: string };

declare global {
  interface Window {
    seenCommands: SeenCommand[];
    rejectedCommandIds: string[];
  }
}

let probes = 0;

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

export async function storedData(page: Page, key: string): Promise<JsonValue> {
  const text = await page.evaluate(
    (storageKey) => localStorage.getItem(storageKey),
    `${STORAGE_PREFIX}${key}`,
  );

  return text === null ? ABSENT : storedRecordSchema.parse(JSON.parse(text)).d;
}

// Every stored record whose key starts with `prefix`, in no set order. The empty prefix reads every
// record, the preset included.
export async function storedRecords(page: Page, prefix = ''): Promise<StoredRecord[]> {
  const texts = await page.evaluate(
    (start) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(start))
        .map((key) => localStorage.getItem(key) ?? 'null'),
    `${STORAGE_PREFIX}${prefix}`,
  );

  return texts.map((text) => storedRecordSchema.parse(JSON.parse(text)));
}

export function keyed(records: readonly StoredRecord[]): Keyed {
  return Object.fromEntries(records.map((one) => [one.k, one]));
}

// Commands from every window reach this one too, as all windows share the LOCAL bus.
export async function watchCommands(page: Page): Promise<void> {
  await page.evaluate(
    ([channel, probePrefix]) => {
      window.seenCommands = [];
      window.rejectedCommandIds = [];

      window.mockPlatform.broadcast.onMessage(channel, (event) => {
        const message = Object(event.data);
        const id = String(message.id);

        if (message.t === 'command' && !id.startsWith(probePrefix)) {
          window.seenCommands.push({ id, type: String(Object(message.command).type) });
        } else if (message.t === 'command-rejected') {
          window.rejectedCommandIds.push(id);
        }
      });
    },
    [CHANNEL, PROBE_PREFIX] as const,
  );
}

// The background answers in order, so once it rejects a probe sent now, every command that reached
// it before the probe has been handled and its records saved. Needs `watchCommands` first. The
// stored records leave out the preset.
export async function afterSettling(page: Page): Promise<{ commands: string[]; stored: Keyed }> {
  probes += 1;

  const probe = `${PROBE_PREFIX}${probes}`;

  await page.evaluate(
    ([channel, id]) => {
      void window.mockPlatform.broadcast.sendMessage(
        channel,
        { t: 'command', id, command: { type: 'sheet-delete', sheetId: 'probe' } },
        { destination: 'LOCAL' },
      );
    },
    [CHANNEL, probe] as const,
  );
  await expect
    .poll(() => page.evaluate((id) => window.rejectedCommandIds.includes(id), probe))
    .toBe(true);

  const seen = await page.evaluate(() => window.seenCommands);
  const stored = (await storedRecords(page)).filter((one) => one.k !== 'preset');

  return { commands: seen.map((command) => command.type), stored: keyed(stored) };
}
