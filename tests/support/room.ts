import { fixtureRecord } from './block-fixtures';
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { deflateSync, strToU8 } from 'fflate';
import type { JsonValue } from '@/core/json';
import { assembleRecords } from '@/core/merge';
import { parsePresetFile } from '@/core/preset';
import { blockDataSchema, recordSchema, type Cell, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
// The side-effect-free part of the mock: its URL params and naming rules, never the platform.
// oxlint-disable-next-line no-restricted-imports
import {
  CATCH_UP_TIMEOUT_PARAM,
  CLIENT_PARAM,
  DEVICE_PARAM,
  deviceStoragePrefix,
  DICE_ACCESS_PARAM,
  DICE_FACES_PARAM,
  GM_LINK_TIMEOUT_PARAM,
  MOCK_ROOM_ID,
  mockConnectionId,
  NAME_PARAM,
  PARTY_CHANNEL_PREFIX,
  PARTY_STORAGE_PREFIX,
  PLAYER_PARAM,
  ROLE_PARAM,
  SNAPSHOT_JITTER_PARAM,
  SNAPSHOT_PAUSE_PARAM,
  type FakeDiceAccess,
} from '@/platform/mock/client-params';

// The mock room's storage before any import: generation 0 with no author.
export const STORAGE_PREFIX = `mr4:${MOCK_ROOM_ID}:0::`;

export const EXAMPLE_PRESET_TEXT = readFileSync(
  new URL('../../docs/example-preset.json', import.meta.url),
  'utf8',
);

// The "+" of the example preset's sheet set "Персонажи", which shows once a GM window has a preset.
export const ADD = 'Добавить: Персонажи';
const CHANNEL = 'app.muster-roll/ui';
const ROOM_STORAGE_PREFIX = 'mr4:';

// A command id `afterSettling` sends, so a watched window can tell its probes from real commands.
const PROBE_PREFIX = 'probe-';

// What `storedData` reads for a key with no record, so a tombstone's `null` cannot pass for one.
export const ABSENT = '(absent)';
export const storedRecordSchema = recordSchema;

export type StoredRecord = VersionedRecord;

export type StorageGeneration = {
  n: number;
  a: string;
};

export type StorageKeyParts = {
  generation: StorageGeneration;
  recordKey: string;
};

// Records by key, so a comparison does not depend on the order the storage lists its keys in.
export type Keyed = Record<string, StoredRecord>;

export type SeenCommand = {
  id: string;
  type: string;
};

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
  // The background's room copy pause and jitter, shorter than the 3 s and 2 s of `TIMING`.
  snapshotPauseMs?: number;
  snapshotJitterMs?: number;
  // The background runs a fake dice extension that answers every die with these faces.
  diceFaces?: number[];
  // The GM's answer for Muster Roll that the fake dice extension starts with.
  diceAccess?: FakeDiceAccess;
};

// One client: its background page and one window, which share a connection id.
export type RoomClient = {
  window: Page;
  background: Page;
  connectionId: string;
};

declare global {
  interface Window {
    seenCommands: SeenCommand[];
    rejectedCommandIds: string[];
  }
}

let probes = 0;

// A sheet of a sheet set. `set` is the sheet set's template id, `pc` in the example preset, and
// `name` is the value of its name field, `name` in every fixture.
export type SeededSheet = {
  id: string;
  name: string;
  order: number;
  set?: string;
};

// A seeded record has the author "seed". A tombstone is minted by the background, as the mock's
// own connection.
export function record(k: string, d: JsonValue, c = 1): StoredRecord {
  return fixtureRecord(k, d, c, d === null ? 'mock-connection' : 'seed');
}

// AD-2: the root block record of a sheet of a sheet set.
export function sheetRecord(sheet: SeededSheet): StoredRecord {
  return record(`blk:${sheet.id}`, { set: sheet.set ?? 'pc', order: sheet.order });
}

// One assembled root record, with the name field cell when it has a value.
export function sheetRecords(sheet: SeededSheet): StoredRecord[] {
  return [
    record(`blk:${sheet.id}`, {
      set: sheet.set ?? 'pc',
      order: sheet.order,
      cells: sheet.name === '' ? {} : { name: sheet.name },
    }),
  ];
}

// A sheet of the example preset's sheet set "Персонажи".
export function pcSheet(id: string, name: string, order: number): StoredRecord[] {
  return sheetRecords({ id, name, order });
}

// AD-2: one repeat block of a sheet, every field of every row of its section in `cells`.
export function repRecord(
  sheetId: string,
  sectionId: string,
  instanceId: string,
  order: number,
  cells: Record<string, JsonValue>,
): StoredRecord {
  return record(`blk:${sheetId}:${sectionId}:${instanceId}`, { order, cells });
}

// One NPC of the example preset: a repeat block of the single sheet "NPC", section "Противники".
export function npcBlock(
  instanceId: string,
  name: string,
  order: number,
  cells: Record<string, JsonValue> = {},
): StoredRecord {
  return repRecord('npc', 'npc_name', instanceId, order, { npc_name: name, ...cells });
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
  await writeStorageEntries(page, [
    [`${prefix}preset`, presetRecord(presetText)],
    ...recordEntries(materializedRecords(records, presetText), prefix),
  ]);
}

export function materializedRecords(
  records: readonly StoredRecord[],
  presetText = EXAMPLE_PRESET_TEXT,
): StoredRecord[] {
  const preset = parsePresetFile(presetText);

  const singleRoots = preset.ok
    ? preset.value.templates.flatMap((template) =>
        template.repeat === undefined
          ? [record(`blk:${template.id}`, { order: 0, cells: {} })]
          : [],
      )
    : [];

  return [...assembleRecords([...singleRoots, ...records]).values()];
}

// Seeds records under generation 0 without adding a preset.
export async function seedRecords(
  page: Page,
  records: readonly StoredRecord[],
  device = '',
): Promise<void> {
  const prefix = `${deviceStoragePrefix(device)}${STORAGE_PREFIX}`;
  await writeStorageEntries(page, recordEntries(records, prefix));
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
// this way keeps every other GM client waiting for an answer until its catch-up times out. The
// player id and the name are the connection id unless `as` names them.
export async function addPartyMember(
  page: Page,
  connectionId: string,
  role: 'GM' | 'PLAYER',
  as: {
    id?: string;
    name?: string;
  } = {},
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
      { id: as.id ?? connectionId, connectionId, name: as.name ?? connectionId, role },
    ] as const,
  );
}

export async function storedData(page: Page, key: string): Promise<JsonValue> {
  const text = await page.evaluate(
    (storageEntryKey) => localStorage.getItem(storageEntryKey),
    storageKeyForPage(page, key),
  );

  return text === null ? ABSENT : storedRecordSchema.parse(JSON.parse(text)).d;
}

export async function storedCell(page: Page, key: string, fieldId: string): Promise<Cell | string> {
  const data = await storedData(page, key);

  if (data === ABSENT) return ABSENT;

  return blockDataSchema.parse(data).cells[fieldId] ?? ABSENT;
}

// Every stored record whose key starts with `prefix`, in no set order. The empty prefix reads every
// record, the preset included.
export async function storedRecords(page: Page, prefix = ''): Promise<StoredRecord[]> {
  const texts = await page.evaluate(
    (start) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(start))
        .map((key) => localStorage.getItem(key) ?? 'null'),
    storageKeyForPage(page, prefix),
  );

  return texts.map((text) => storedRecordSchema.parse(JSON.parse(text)));
}

// Builds a record's room storage key under a generation, defaulting to generation 0.
export function storageKey(key: string, generation: StorageGeneration = { n: 0, a: '' }): string {
  return `mr4:${MOCK_ROOM_ID}:${generation.n}:${generation.a}:${key}`;
}

// Reads every room storage key on this page's device, across all room ids.
export async function roomKeys(page: Page): Promise<string[]> {
  const device = new URL(page.url()).searchParams.get(DEVICE_PARAM) ?? '';
  const devicePrefix = deviceStoragePrefix(device);

  return page.evaluate(
    ({ devicePrefix: currentDevicePrefix, roomPrefix }) =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith(`${currentDevicePrefix}${roomPrefix}`))
        .map((key) => key.slice(currentDevicePrefix.length)),
    { devicePrefix, roomPrefix: ROOM_STORAGE_PREFIX },
  );
}

// Splits a room storage key into its generation and record key.
export function storageKeyParts(key: string): StorageKeyParts {
  const match = /^mr4:([^:]+):(\d+):([^:]*):(.*)$/.exec(key);

  if (match === null) {
    throw new Error(`not a room storage key: ${key}`);
  }

  return {
    generation: { n: Number(match[2]), a: match[3] ?? '' },
    recordKey: match[4] ?? '',
  };
}

// Tells whether a mock room storage key belongs to a generation.
export function isStorageKeyInGeneration(key: string, generation: StorageGeneration): boolean {
  return key.startsWith(storageKey('', generation));
}

function recordEntries(
  records: readonly StoredRecord[],
  prefix: string,
): (readonly [string, string])[] {
  return [...assembleRecords(records).values()].map(
    (one) => [`${prefix}${one.k}`, JSON.stringify(one)] as const,
  );
}

async function writeStorageEntries(
  page: Page,
  entries: readonly (readonly [string, string])[],
): Promise<void> {
  await page.evaluate((seeded) => {
    for (const [key, value] of seeded) {
      localStorage.setItem(key, value);
    }
  }, entries);
}

function storageKeyForPage(page: Page, key: string): string {
  const device = new URL(page.url()).searchParams.get(DEVICE_PARAM) ?? '';

  return `${deviceStoragePrefix(device)}${STORAGE_PREFIX}${key}`;
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
export async function afterSettling(page: Page): Promise<{
  commands: string[];
  stored: Keyed;
}> {
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

// The engine's own answer to a projection request: its sync state.
export async function syncRead(page: Page): Promise<{
  state: string;
  answered: boolean;
}> {
  return page.evaluate(
    (channel) =>
      new Promise<{
        state: string;
        answered: boolean;
      }>((resolve) => {
        const nonce = `read-${Date.now()}`;

        const stop = window.mockPlatform.broadcast.onMessage(channel, (event) => {
          const message = Object(event.data);

          if (message.t !== 'projection' || message.nonce !== nonce || message.i !== message.n) {
            return;
          }

          stop();
          resolve({
            state: String(message.sync.state),
            answered: Boolean(message.sync.gmAnswered),
          });
        });

        void window.mockPlatform.broadcast.sendMessage(
          channel,
          { t: 'projection-request', nonce },
          { destination: 'LOCAL' },
        );
      }),
    CHANNEL,
  );
}

// The mock's URL params of a client as a query string, "" for the default client.
export function clientQuery(params: ClientParams): string {
  const query = new URLSearchParams();

  for (const [name, value] of [
    [CLIENT_PARAM, params.client],
    [PLAYER_PARAM, params.player],
    [ROLE_PARAM, params.role],
    [NAME_PARAM, params.name],
    [DEVICE_PARAM, params.device],
    [CATCH_UP_TIMEOUT_PARAM, params.catchUpTimeoutMs?.toString()],
    [GM_LINK_TIMEOUT_PARAM, params.gmLinkTimeoutMs?.toString()],
    [SNAPSHOT_PAUSE_PARAM, params.snapshotPauseMs?.toString()],
    [SNAPSHOT_JITTER_PARAM, params.snapshotJitterMs?.toString()],
    [DICE_FACES_PARAM, params.diceFaces?.join(',')],
    [DICE_ACCESS_PARAM, params.diceAccess],
  ] as const) {
    if (value !== undefined) {
      query.set(name, value);
    }
  }

  const text = query.toString();

  return text === '' ? '' : `?${text}`;
}

// CAP-32: replaces one client's map selection, as a click or a drag on the map would. `page` is any
// page of that client, as its pages share the selection.
export async function selectOnMap(page: Page, itemIds: readonly string[]): Promise<void> {
  await page.evaluate(
    (ids) => {
      window.mockPlatform.setMapSelection(ids);
    },
    [...itemIds],
  );
}

// The map selection of the client `page` belongs to, sorted.
export async function mapSelection(page: Page): Promise<string[]> {
  const itemIds = await page.evaluate(() => window.mockPlatform.selection.getSelection());

  return [...itemIds].sort();
}

// Puts items on the room's open scene, which every client shares.
export async function putOnScene(page: Page, itemIds: readonly string[]): Promise<void> {
  await page.evaluate(
    (ids) => {
      window.mockPlatform.addSceneItems(ids);
    },
    [...itemIds],
  );
}
