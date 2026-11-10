import { readFileSync } from 'node:fs';

import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { deflateSync, strToU8 } from 'fflate';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import { SYNC_CHANNEL } from '@/core/room-messages';
// The side-effect-free part of the mock: its URL params and naming rules, never the platform.
// oxlint-disable-next-line no-restricted-imports
import {
  CATCH_UP_TIMEOUT_PARAM,
  CLIENT_PARAM,
  DEVICE_PARAM,
  deviceStoragePrefix,
  GM_LINK_TIMEOUT_PARAM,
  MOCK_ROOM_ID,
  mockConnectionId,
  NAME_PARAM,
  PARTY_CHANNEL_PREFIX,
  PARTY_STORAGE_PREFIX,
  PLAYER_PARAM,
  ROLE_PARAM,
} from '@/platform/mock/client-params';

// The mock room's storage before any import: generation 0 with no author.
export const STORAGE_PREFIX = `mr1:${MOCK_ROOM_ID}:0::`;

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

// The mock's URL params for one client of the room. An empty client is the default one.
export type ClientParams = {
  client?: string;
  player?: string;
  role?: 'GM' | 'PLAYER';
  name?: string;
  device?: string;
  // The background's catch-up timeout, shorter or longer than the 4 s of `TIMING`.
  catchUpTimeoutMs?: number;
  // The background's GM link timeout, shorter than the 20 s of `TIMING`.
  gmLinkTimeoutMs?: number;
};

// One client: its background page and one window, which share a connection id.
export type RoomClient = { window: Page; background: Page; connectionId: string };

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
  await page.goto('/index.html');
  await seedStorage(page, records, presetText);

  const background = await openBackground(context);

  await expect(page.getByRole('button', { name: ADD })).toBeVisible();

  return background;
}

// Seeds the preset and the records into the storage of one device, before its background starts.
export async function seedStorage(
  page: Page,
  records: readonly StoredRecord[],
  presetText = EXAMPLE_PRESET_TEXT,
  device = '',
): Promise<void> {
  const prefix = `${deviceStoragePrefix(device)}${STORAGE_PREFIX}`;

  const entries: (readonly [string, string])[] = [
    [`${prefix}preset`, presetRecord(presetText)],
    ...records.map((one) => [`${prefix}${one.k}`, JSON.stringify(one)] as const),
  ];

  await page.evaluate((seeded) => {
    for (const [key, value] of seeded) {
      localStorage.setItem(key, value);
    }
  }, entries);
}

export function connectionIdOf(params: ClientParams): string {
  return mockConnectionId(params.client ?? '');
}

// Opens the window of a client. Its background is opened apart, so a test can seed storage first.
export async function openClientWindow(
  context: BrowserContext,
  params: ClientParams = {},
): Promise<Page> {
  const window = await context.newPage();

  await window.goto(`/index.html${clientQuery(params)}`);

  return window;
}

export async function openClientBackground(
  context: BrowserContext,
  params: ClientParams = {},
): Promise<Page> {
  return openBackground(context, `/background.html${clientQuery(params)}`);
}

// GM clients in one browser, so they share the storage seeded once. Each window shows its sheets.
export async function openGmClients(
  context: BrowserContext,
  records: readonly StoredRecord[],
  presetText: string,
  ...clients: ClientParams[]
): Promise<RoomClient[]> {
  const windows: Page[] = [];

  for (const params of clients) {
    // Every window opens before any background, so the seed below is what each background reads.
    // oxlint-disable-next-line no-await-in-loop
    windows.push(await openClientWindow(context, params));
  }

  const [first] = windows;

  if (first === undefined) {
    throw new Error('openGmClients needs at least one client');
  }

  await seedStorage(first, records, presetText);

  const opened: RoomClient[] = [];

  for (const [index, params] of clients.entries()) {
    const window = windows[index];

    if (window === undefined) {
      throw new Error('a client lost its window');
    }

    // oxlint-disable-next-line no-await-in-loop
    const background = await openClientBackground(context, params);

    // oxlint-disable-next-line no-await-in-loop
    await expect(window.getByRole('button', { name: ADD })).toBeVisible();
    opened.push({ window, background, connectionId: connectionIdOf(params) });
  }

  return opened;
}

// Puts a raw REMOTE message on the room as the given connection sent it, so every other client
// hears it.
export async function postRemote(
  page: Page,
  connectionId: string,
  message: JsonValue,
): Promise<void> {
  await page.evaluate(
    ([channel, sender, text]) => {
      // SAFETY: the text is the JSON.stringify of a JsonValue, one line below.
      const data = JSON.parse(text) as JsonValue;

      window.mockPlatform.sendRemoteAs(sender, channel, data);
    },
    [SYNC_CHANNEL, connectionId, JSON.stringify(message)] as const,
  );
}

// Lists a connection in the room's party with no page behind it, so it never answers. A GM listed
// this way keeps every other GM client waiting for an answer until its catch-up times out.
export async function addPartyMember(
  page: Page,
  connectionId: string,
  role: 'GM' | 'PLAYER',
): Promise<void> {
  await page.evaluate(
    ([key, channel, member]) => {
      const party: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');

      localStorage.setItem(key, JSON.stringify([...(Array.isArray(party) ? party : []), member]));
      new BroadcastChannel(channel).postMessage('changed');
    },
    [
      `${PARTY_STORAGE_PREFIX}${MOCK_ROOM_ID}`,
      `${PARTY_CHANNEL_PREFIX}${MOCK_ROOM_ID}`,
      { id: connectionId, connectionId, name: connectionId, role },
    ] as const,
  );
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

// The keys one device holds, with its device prefix taken off.
export async function deviceKeys(page: Page, device: string): Promise<string[]> {
  const prefix = deviceStoragePrefix(device);

  return page.evaluate(
    (start) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(start))
        .map((key) => key.slice(start.length)),
    prefix,
  );
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

function clientQuery(params: ClientParams): string {
  const query = new URLSearchParams();

  for (const [name, value] of [
    [CLIENT_PARAM, params.client],
    [PLAYER_PARAM, params.player],
    [ROLE_PARAM, params.role],
    [NAME_PARAM, params.name],
    [DEVICE_PARAM, params.device],
    [CATCH_UP_TIMEOUT_PARAM, params.catchUpTimeoutMs?.toString()],
    [GM_LINK_TIMEOUT_PARAM, params.gmLinkTimeoutMs?.toString()],
  ] as const) {
    if (value !== undefined) {
      query.set(name, value);
    }
  }

  const text = query.toString();

  return text === '' ? '' : `?${text}`;
}
