import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import type { JsonObject, JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { err } from '@/core/result';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { SnapshotFile } from '@/core/snapshot-file';
import { encodeSnapshotFileData } from '@/core/snapshot-import';
import { encodeStateRecords } from '@/core/state-records';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { Command, SyncState } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import { createSendQueue, type Wait } from '@/platform/send-queue';
import { startReplicaEngine, type ReplicaEngine } from '@/replica/engine';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';

const TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 25,
  projectionIncompleteTimeoutMs: 80,
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 150,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 5,
  gmLinkTimeoutMs: 60000,
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 60,
  incompleteRequestMaxMs: 240,
  snapshotImportTimeoutMs: 60000,
};

// The strings and keys of the 5.3 spec, written out by hand.
const DATA_REPLACED = 'Данные комнаты заменены';
const KEY = 'app.muster-roll/snapshot';
const ROOM_PREFIX = 'mr2:mock-room:';
const OLD_PREFIX = 'mr2:mock-room:0::';
const WAIT_LIMIT_MS = 3000;
const POLL_MS = 2;
const INITIAL: Generation = { n: 0, a: '' };
const GHOST = 'ghost-gm';

const PRESET: Preset = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tokens: true,
      sections: [
        {
          rows: [
            [{ kind: 'field', type: 'text', id: 'name' }],
            [{ kind: 'field', type: 'number', id: 'str' }],
            [{ kind: 'field', type: 'text', id: 'notes' }],
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK = sheet('brok');
const BROK_STR: VersionedRecord = { k: 'row:brok:str', d: { str: 10 }, c: 3, a: 'seed' };
const ACL: VersionedRecord = { k: 'acl:brok:player-p', d: { name: 'Лиза' }, c: 2, a: 'seed' };
const PLINK: VersionedRecord = { k: 'plink:brok:player-p', d: { name: 'Лиза' }, c: 2, a: 'seed' };
const OLD_ROOM: readonly VersionedRecord[] = [PRESET_RECORD, BROK, BROK_STR, ACL, PLINK];

// One sheet of the sheet set, the NPC single sheet and a link, with one value the preset has no
// field for.
const FILE: SnapshotFile = {
  v: 2,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'anya',
      set: 'pc',
      order: 0,
      rows: { name: { name: 'Аня' }, str: { str: 12, notes: 'Смелая' }, old: { gone: 'x' } },
      repeats: {},
    },
    { id: 'npc', rows: { hp: { hp: 7 } }, repeats: {} },
  ],
  links: [{ tokenId: 't1', sheetId: 'anya' }],
};

const DATA = encodeSnapshotFileData(FILE);

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  // Raw storage entries next to the seeded records, as another generation left them.
  stored?: Readonly<Record<string, string>>;
  timing?: Partial<Timing>;
  untilLive?: boolean;
  platform?: (platform: MockPlatform) => MockPlatform;
  // The engine's send queue pauses here between sends.
  hold?: Hold;
};

// Holds the engine's send queue in its pause after a send while held, so a commit waits in it.
type Hold = { wait: Wait; hold: () => void; release: () => void };

// Holds every room copy write until it opens, and counts the writes that reached it.
type WriteGate = { calls: number; open: () => void };

type Client = {
  connectionId: string;
  platform: MockPlatform;
  backing: MockStorageBacking;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
};

type Heard = { from: string; data: JsonValue; at: number };

type Room = {
  room: MockRoom;
  heard: Heard[];
  // What happened in the room, in order: `copy` for a room copy write, and each `t` heard.
  events: string[];
  post: (from: string, data: JsonValue) => void;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  mock.restore();

  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function createHold(): Hold {
  let held = false;
  const pauses: (() => void)[] = [];

  return {
    wait: (milliseconds) =>
      new Promise((resolve) => {
        if (held) {
          pauses.push(resolve);
        } else {
          setTimeout(resolve, milliseconds);
        }
      }),
    hold: () => {
      held = true;
    },
    release: () => {
      held = false;

      for (const resume of pauses.splice(0)) {
        resume();
      }
    },
  };
}

function gatedWrites(gate: WriteGate, opened: Promise<void>) {
  return (platform: MockPlatform): MockPlatform => ({
    ...platform,
    metadata: {
      ...platform.metadata,
      setMetadata: async (update) => {
        gate.calls += 1;
        await opened;

        return platform.metadata.setMetadata(update);
      },
    },
  });
}

// A gate, and the promise its writes wait on.
type OpenableGate = { gate: WriteGate; opened: Promise<void> };

function createWriteGate(): OpenableGate {
  let open = (): void => undefined;

  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { gate: { calls: 0, open: () => open() }, opened };
}

// Saves of generation 1 fail after `saved` writes, as in a full storage.
function failingNewGeneration(saved: number): (platform: MockPlatform) => MockPlatform {
  let writes = 0;

  return (platform) => ({
    ...platform,
    storage: {
      ...platform.storage,
      setItem: (key, value) => {
        if (key.startsWith(`${ROOM_PREFIX}1:`)) {
          writes += 1;

          if (writes > saved) {
            return err({ operation: 'write', reason: 'quota' });
          }
        }

        return platform.storage.setItem(key, value);
      },
    },
  });
}

function sheet(id: string, order = 0): VersionedRecord {
  return { k: `sheet:${id}`, d: { set: 'pc', order }, c: 1, a: 'seed' };
}

function copyValue(g: Generation, records: readonly VersionedRecord[], v = 2): JsonObject {
  const deflated = deflateSync(strToU8(JSON.stringify({ g, records })));

  return { v, data: Buffer.from(deflated).toString('base64') };
}

function roomCopyGeneration(room: Room): JsonValue {
  const value = room.room.getMetadata()[KEY];

  if (value === undefined) {
    return null;
  }

  const data = String(Object(value).data);

  return JSON.parse(strFromU8(inflateSync(new Uint8Array(Buffer.from(data, 'base64'))))).g;
}

function createBacking(): MockStorageBacking {
  const entries = new Map<string, string>();

  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
    keys: () => [...entries.keys()],
  };
}

function openRoom(): Room {
  const room = createMemoryRoom();

  const observer = createMockPlatform(createMemoryBus(), createBacking(), {
    room,
    connectionId: 'observer',
    playerId: 'observer',
    name: 'observer',
    role: 'PLAYER',
  });

  const heard: Heard[] = [];
  const events: string[] = [];

  cleanups.push(
    observer.broadcast.onMessage(SYNC_CHANNEL, (event) => {
      heard.push({ from: event.connectionId, data: event.data, at: Date.now() });
      events.push(String(Object(event.data).t));
    }),
    room.onMetadataChange(() => {
      events.push('copy');
    }),
  );

  return {
    room,
    heard,
    events,
    post: (from, data) => {
      observer.sendRemoteAs(from, SYNC_CHANNEL, data);
    },
  };
}

function joinAs(room: Room, connectionId: string, role: PlayerRole): void {
  room.room.join({ id: connectionId, connectionId, name: connectionId, role });
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const backing = createBacking();
  const bus = createMemoryBus();

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role: options.role ?? 'GM',
  };

  const created = createMockPlatform(bus, backing, identity);
  const platform = options.platform?.(created) ?? created;

  for (const record of options.seeded ?? OLD_ROOM) {
    backing.set(`${OLD_PREFIX}${record.k}`, JSON.stringify(record));
  }

  for (const [key, value] of Object.entries(options.stored ?? {})) {
    backing.set(key, value);
  }

  created.joinParty();

  const engineQueue = createSendQueue(platform.broadcast, TIMING, options.hold?.wait);

  const engine = await startReplicaEngine(platform, engineQueue, {
    timing: { ...TIMING, ...options.timing },
    random: () => 0,
    dataReplaced: DATA_REPLACED,
  });

  const store = createProjectionStore();

  const window = startReplicaClient(
    createMockPlatform(bus, backing, identity).broadcast,
    createSendQueue(created.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop);
  await waitUntil(() => store.$loaded.get());

  if (options.untilLive === true) {
    await waitUntil(() => store.$sync.get().state === 'live');
  }

  return { connectionId, platform: created, backing, engine, store, window };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('the condition never became true');
    }

    // Polling is the point here: each round has to let the paced queues run.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function send(client: Client, command: Command): string {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }

  return sent.value;
}

// The check's answer, or the reason it was refused.
async function check(client: Client, data = DATA): Promise<JsonValue> {
  const sent = client.window.requestSnapshotCheck(data);

  if (!sent.ok) {
    throw new Error(`the window refused the check: ${sent.error}`);
  }

  await waitUntil(() => answerOf(client, sent.value) !== null);

  return answerOf(client, sent.value);
}

// The import's answer, or the reason it was refused, with the digest of a check first.
async function importFile(client: Client, digest?: string, data = DATA): Promise<JsonValue> {
  const expected = digest ?? String(Object(await check(client, data)).digest);
  const id = send(client, { type: 'snapshot-import', data, expectedDigest: expected });

  await waitUntil(() => answerOf(client, id) !== null);

  return answerOf(client, id);
}

function answerOf(client: Client, id: string): JsonValue {
  const rejection = client.store.$rejections.get().get(id);

  if (rejection !== undefined) {
    return { ...rejection };
  }

  const result = client.store.$snapshotResults.get().get(id);

  return result === undefined ? null : { ...result };
}

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function shownKeys(client: Client): string[] {
  return [...client.store.$records.get().keys()].sort();
}

function sync(client: Client): SyncState {
  return client.store.$sync.get();
}

function storedKeys(client: Client, prefix = ROOM_PREFIX): string[] {
  return client.backing
    .keys()
    .filter((key) => key.startsWith(prefix))
    .sort();
}

function stored(client: Client, key: string): VersionedRecord | null {
  const text = client.backing.get(key);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
}

function heardOf(room: Room, from: string, t: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === t ? [message.data] : [],
  );
}

function lastRequest(room: Room, from: string): string {
  const request = heardOf(room, from, 'state-request').at(-1);

  if (request === undefined) {
    throw new Error(`${from} has asked for no state`);
  }

  return String(Object(request).r);
}

function stateMessage(
  r: string,
  records: readonly VersionedRecord[],
  g: Generation,
  i = 1,
  n = 1,
): JsonValue {
  return { v: 2, g, t: 'state', r, i, n, records: encodeStateRecords(records) };
}

function newGenerationOf(connectionId: string): Generation {
  return { n: 1, a: connectionId };
}

// The imported records, as the importer writes them.
function importedRecord(connectionId: string, k: string, d: VersionedRecord['d']): VersionedRecord {
  return recordSchema.parse({ k, d, c: 1, a: connectionId });
}

describe('check', () => {
  test('answers the count and digest of dropped values and writes nothing', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const keysBefore = storedKeys(gm);
    const heardBefore = room.heard.length;

    // #when
    const answer = await check(gm);

    // #then
    expect({
      answer,
      keys: storedKeys(gm),
      heard: room.heard.length - heardBefore,
      copy: room.room.getMetadata()[KEY] ?? null,
      brok: shown(gm, BROK.k),
    }).toEqual({
      answer: {
        t: 'snapshot-check-result',
        id: expect.any(String),
        count: 1,
        sheets: 0,
        digest: expect.any(String),
      },
      keys: keysBefore,
      heard: 0,
      copy: null,
      brok: BROK,
    });
  });

  test('refuses a room with no preset', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [BROK], untilLive: true });

    // #when
    const answer = await check(gm);

    // #then
    expect(Object(answer).reason).toBe('preset-required');
  });

  test('refuses data that is no snapshot as a bad file', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    const answer = await check(
      gm,
      encodeSnapshotFileData({ ...FILE, links: [{ tokenId: 't', sheetId: 'x' }] }),
    );

    // #then
    expect(Object(answer).reason).toBe('invalid-snapshot');
  });
});

describe('import', () => {
  test('drops a file sheet of no template of the preset with its values and counts it', async () => {
    // #given: a sheet of a sheet set the preset does not have, holding one value.
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    const data = encodeSnapshotFileData({
      ...FILE,
      sheets: [
        ...FILE.sheets,
        { id: 'ghost', set: 'crew', order: 0, rows: { hp: { hp: 3 } }, repeats: {} },
      ],
    });

    // #when
    const checked = await check(gm, data);

    await importFile(gm, String(Object(checked).digest), data);
    await waitUntil(() => shown(gm, 'sheet:anya') !== undefined);

    // #then: `gone` of Аня and `hp` of the dropped sheet.
    expect({
      counts: [Object(checked).count, Object(checked).sheets],
      ghost: shownKeys(gm).filter((key) => key.includes('ghost')),
    }).toEqual({ counts: [2, 1], ghost: [] });
  });

  test('does not write over a room copy of a newer build, and raises the new-version notice', async () => {
    // #given: the copy appears after catch-up, so only the import reads it.
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const newer = { v: 3, data: 'from a newer build' };

    room.room.setMetadata({ [KEY]: newer });

    // #when
    await importFile(gm);
    await waitUntil(() => gm.store.$notices.get().includes('new-version'));

    // #then
    expect(room.room.getMetadata()[KEY]).toEqual(newer);
  });

  test('writes over a room copy of an older format, and the older-format notice goes', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [], 1) });

    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const before = gm.store.$notices.get();

    // #when
    await importFile(gm);
    await waitUntil(() => Object(room.room.getMetadata()[KEY]).v === 2);
    // The delta with the notices reaches the window after the write.
    await pause(30);

    // #then
    expect({
      before,
      v: Object(room.room.getMetadata()[KEY]).v,
      copy: roomCopyGeneration(room),
      notices: gm.store.$notices.get(),
    }).toEqual({
      before: ['room-copy-older-format'],
      v: 2,
      copy: newGenerationOf('gm-a'),
      notices: [],
    });
  });

  test('saves the new generation, writes its room copy and only then sends reset', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const generation = newGenerationOf('gm-a');
    let savedAtCopy: string[] = [];

    cleanups.push(
      room.room.onMetadataChange(() => {
        savedAtCopy = storedKeys(gm, `${ROOM_PREFIX}1:gm-a:`);
      }),
    );

    // #when
    const answer = await importFile(gm);

    await waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);

    // #then
    expect({
      answer: Object(answer).t,
      events: room.events.filter((event) => event === 'copy' || event === 'reset'),
      savedAtCopy: savedAtCopy.length > 0,
      reset: heardOf(room, 'gm-a', 'reset'),
      copy: roomCopyGeneration(room),
    }).toEqual({
      answer: 'snapshot-imported',
      events: ['copy', 'reset'],
      savedAtCopy: true,
      reset: [{ v: 2, g: generation, t: 'reset' }],
      copy: generation,
    });
  });

  test('replaces the data with records at c: 1, the current preset and the links, with no access or owner', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    await importFile(gm);
    await waitUntil(() => shown(gm, 'sheet:anya') !== undefined);

    // #then
    expect({
      keys: shownKeys(gm),
      preset: shown(gm, 'preset'),
      str: shown(gm, 'row:anya:str'),
      link: shown(gm, 'link:t1'),
    }).toEqual({
      keys: [
        'link:t1',
        'preset',
        'row:anya:name',
        'row:anya:notes',
        'row:anya:str',
        'row:npc:hp',
        'sheet:anya',
      ],
      preset: importedRecord('gm-a', 'preset', PRESET_RECORD.d),
      str: importedRecord('gm-a', 'row:anya:str', { str: 12 }),
      link: importedRecord('gm-a', 'link:t1', { s: 'anya' }),
    });
  });

  test('keeps only the new generation in storage once it is complete', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    await importFile(gm);
    await waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);

    // #then
    expect(storedKeys(gm)).toEqual([
      'mr2:mock-room:1:gm-a:#generation',
      'mr2:mock-room:1:gm-a:link:t1',
      'mr2:mock-room:1:gm-a:preset',
      'mr2:mock-room:1:gm-a:row:anya:name',
      'mr2:mock-room:1:gm-a:row:anya:notes',
      'mr2:mock-room:1:gm-a:row:anya:str',
      'mr2:mock-room:1:gm-a:row:npc:hp',
      'mr2:mock-room:1:gm-a:sheet:anya',
    ]);
  });

  test("removes this room's keys of an older format once complete, and keeps another room's", async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      stored: {
        'mr1:mock-room:0::preset': '{"k":"preset","d":"x","c":1,"a":"seed"}',
        'mr1:mock-room:2:gm-a:#incomplete': '1',
        'mr1:other-room:0::preset': '{"k":"preset","d":"x","c":1,"a":"seed"}',
      },
      untilLive: true,
    });

    // #when
    await importFile(gm);
    await waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);

    // #then
    expect(storedKeys(gm, 'mr1:')).toEqual(['mr1:other-room:0::preset']);
  });

  test('asks again with the new count when the dropped values changed since the check', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });
    const keysBefore = storedKeys(gm);

    // #when
    const answer = await importFile(gm, '00000000');

    // #then
    expect({ answer, keys: storedKeys(gm), resets: heardOf(room, 'gm-a', 'reset') }).toEqual({
      answer: {
        t: 'command-rejected',
        id: expect.any(String),
        reason: 'count-changed',
        count: 1,
        sheets: 0,
        digest: String(Object(await check(gm)).digest),
      },
      keys: keysBefore,
      resets: [],
    });
  });

  test('a failed save stops before the room copy and reset, shows the local-save notice and changes nothing', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    // The marker and two records save, then the storage is full.
    const gm = await startClient(room, 'gm-a', {
      untilLive: true,
      platform: failingNewGeneration(3),
    });

    const keysBefore = storedKeys(gm);
    const digest = String(Object(await check(gm)).digest);

    // #when
    const answer = await importFile(gm, digest);

    await pause(30);

    // #then
    expect({
      reason: Object(answer).reason,
      notices: gm.store.$notices.get(),
      keys: storedKeys(gm),
      brok: shown(gm, BROK.k),
      resets: heardOf(room, 'gm-a', 'reset'),
      copy: room.room.getMetadata()[KEY] ?? null,
    }).toEqual({
      reason: 'write-failed',
      notices: ['local-save-failed'],
      keys: keysBefore,
      brok: BROK,
      resets: [],
      copy: null,
    });
  });

  test('the notice of a failed import save goes with the next record that saves', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      untilLive: true,
      platform: failingNewGeneration(3),
    });

    await importFile(gm);
    await waitUntil(() => gm.store.$notices.get().length === 1);

    // #when
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 16,
    });

    // #then
    await waitUntil(() => gm.store.$notices.get().length === 0);
    expect(Object(stored(gm, `${OLD_PREFIX}${BROK_STR.k}`)?.d).str).toBe(16);
  });

  test('an edit held in the outbox goes out under the old generation, before reset', async () => {
    // #given
    const room = openRoom();
    const hold = createHold();
    const gm = await startClient(room, 'gm-a', { untilLive: true, hold });
    const digest = String(Object(await check(gm)).digest);

    hold.hold();
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 16,
    });
    await waitUntil(() => Object(stored(gm, `${OLD_PREFIX}${BROK_STR.k}`)?.d).str === 16);

    // #when
    send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);
    hold.release();
    await waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);

    // #then
    const messages = room.heard.filter((message) => message.from === 'gm-a');
    const carriesStr = (data: JsonValue): boolean => JSON.stringify(data).includes(BROK_STR.k);
    const commits = messages.filter((message) => Object(message.data).t === 'commit');

    expect({
      generations: commits.filter((one) => carriesStr(one.data)).map((one) => Object(one.data).g),
      beforeReset:
        messages.findIndex((one) => carriesStr(one.data)) <
        messages.findIndex((one) => Object(one.data).t === 'reset'),
    }).toEqual({ generations: [INITIAL], beforeReset: true });
  });

  test('a GM write during the import is refused until reset is out', async () => {
    // #given
    const room = openRoom();
    const { gate, opened } = createWriteGate();

    const gm = await startClient(room, 'gm-a', {
      untilLive: true,
      platform: gatedWrites(gate, opened),
    });

    const digest = String(Object(await check(gm)).digest);
    const imported = send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });

    await waitUntil(() => gate.calls === 1);

    // #when
    const edit = send(gm, {
      type: 'field-patch',
      sheetId: 'anya',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 5,
    });

    await waitUntil(() => answerOf(gm, edit) !== null);
    gate.open();
    await waitUntil(() => answerOf(gm, imported) !== null);

    // #then
    expect({
      edit: Object(answerOf(gm, edit)).reason,
      imported: Object(answerOf(gm, imported)).t,
      commits: heardOf(room, 'gm-a', 'commit').filter(
        (one) => JSON.stringify(Object(one).g) === JSON.stringify(newGenerationOf('gm-a')),
      ),
    }).toEqual({ edit: 'importing', imported: 'snapshot-imported', commits: [] });
  });

  test('a linked token deleted from the scene during the import loses its link once the import ends', async () => {
    // #given: the file links t1, and the open scene holds t1.
    const room = openRoom();
    const { gate, opened } = createWriteGate();

    room.room.setScene({ ready: true, itemIds: ['t1', 'map'], labels: {} }, 'items');

    const gm = await startClient(room, 'gm-a', {
      untilLive: true,
      platform: gatedWrites(gate, opened),
    });

    const digest = String(Object(await check(gm)).digest);
    const imported = send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });

    await waitUntil(() => gate.calls === 1);
    gm.platform.removeSceneItems(['t1']);
    await pause(20);

    const during = shown(gm, 'link:t1')?.d;

    // #when
    gate.open();
    await waitUntil(() => answerOf(gm, imported) !== null);
    await waitUntil(() => shown(gm, 'link:t1')?.d === null);

    // #then
    const prefix = `${ROOM_PREFIX}1:gm-a:`;

    expect({
      during,
      stored: stored(gm, `${prefix}link:t1`),
      rejections: [...gm.store.$rejections.get().keys()],
    }).toEqual({
      during: { s: 'anya' },
      stored: { k: 'link:t1', d: null, c: 2, a: 'gm-a' },
      rejections: [],
    });
  });

  test('an import that finds a copy of a higher generation adopts it, overwrites nothing and sends no reset', async () => {
    // #given: this client missed the change event of that copy.
    const room = openRoom();
    const higher: Generation = { n: 5, a: 'zz' };
    const mira = importedRecord('zz', 'sheet:mira', { set: 'pc', order: 0 });

    const gm = await startClient(room, 'gm-a', {
      untilLive: true,
      platform: (platform) => ({
        ...platform,
        metadata: { ...platform.metadata, onMetadataChange: () => () => undefined },
      }),
    });

    const digest = String(Object(await check(gm)).digest);

    room.room.setMetadata({ [KEY]: copyValue(higher, [PRESET_RECORD, mira]) });

    // #when
    const answer = await importFile(gm, digest);

    await waitUntil(() => shown(gm, mira.k) !== undefined);

    // #then
    expect({
      reason: Object(answer).reason,
      copy: roomCopyGeneration(room),
      resets: heardOf(room, 'gm-a', 'reset'),
      keys: shownKeys(gm),
    }).toEqual({
      reason: 'data-replaced',
      copy: higher,
      resets: [],
      keys: ['preset', 'sheet:mira'],
    });
  });

  test('two imports at once end with every client on the higher one', async () => {
    // #given: both copies wait, so each import read the room before either wrote.
    const room = openRoom();
    const { gate, opened } = createWriteGate();

    const first = await startClient(room, 'gm-a', {
      untilLive: true,
      platform: gatedWrites(gate, opened),
    });

    const second = await startClient(room, 'gm-b', {
      untilLive: true,
      platform: gatedWrites(gate, opened),
    });

    const digest = String(Object(await check(first)).digest);

    // #when
    const ids = [first, second].map((client) =>
      send(client, { type: 'snapshot-import', data: DATA, expectedDigest: digest }),
    );

    await waitUntil(() => gate.calls === 2);
    gate.open();
    await waitUntil(() =>
      ids.every((id, index) => answerOf([first, second][index] ?? first, id) !== null),
    );
    await waitUntil(() =>
      [first, second].every(
        (client) => sync(client).state === 'live' && storedKeys(client, OLD_PREFIX).length === 0,
      ),
    );
    await waitUntil(() => stored(first, `${ROOM_PREFIX}1:gm-b:sheet:anya`) !== null);
    await waitUntil(() => shown(first, 'sheet:anya') !== undefined);

    // #then
    expect({
      first: storedKeys(first).every((key) => key.startsWith(`${ROOM_PREFIX}1:gm-b:`)),
      second: storedKeys(second).every((key) => key.startsWith(`${ROOM_PREFIX}1:gm-b:`)),
      shown: shownKeys(first),
      winner: Object(answerOf(second, ids[1] ?? '')).t,
    }).toEqual({
      first: true,
      second: true,
      shown: shownKeys(second),
      winner: 'snapshot-imported',
    });
  });

  test('a copy over the limit still finishes the import, sends reset, shows the notice and removes the old copy', async () => {
    // #given
    const room = openRoom();

    room.room.setMetadata({
      [KEY]: copyValue(INITIAL, OLD_ROOM),
      'other.extension/data': 'x'.repeat(15200),
    });

    const gm = await startClient(room, 'gm-a', { untilLive: true });

    // #when
    const answer = await importFile(gm);

    await waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    await waitUntil(() => room.room.getMetadata()[KEY] === undefined);
    await waitUntil(() => gm.store.$notices.get().length > 0);

    // #then
    expect({
      answer: Object(answer).t,
      notices: gm.store.$notices.get(),
      roomCopy: gm.store.$roomCopy.get().state,
    }).toEqual({
      answer: 'snapshot-imported',
      notices: ['room-copy-not-saved'],
      roomCopy: 'failed',
    });
  });

  test('a player sees the imported data, read-only and with no owner', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      untilLive: true,
    });

    await waitUntil(() => shown(player, ACL.k) !== undefined);

    // #when
    await importFile(gm);
    await waitUntil(
      () => shown(player, 'sheet:anya') !== undefined && sync(player).state === 'live',
    );

    const id = send(player, {
      type: 'field-patch',
      sheetId: 'anya',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 5,
    });

    await waitUntil(() => player.store.$rejections.get().has(id));

    // #then
    expect({
      keys: shownKeys(player).filter((key) => key.startsWith('acl:') || key.startsWith('plink:')),
      brok: shown(player, BROK.k) ?? null,
      edit: player.store.$rejections.get().get(id)?.reason,
      notified: player.platform.shownNotifications(),
    }).toEqual({ keys: [], brok: null, edit: 'not-allowed', notified: [DATA_REPLACED] });
  });
});

describe('adoption', () => {
  test('a second GM adopts on reset alone: it drops its old data, saves the new and notifies', async () => {
    // #given: the copy cannot be saved, so only reset and catch-up bring the data.
    const room = openRoom();

    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(15400) });

    const importer = await startClient(room, 'gm-a', { untilLive: true });
    const other = await startClient(room, 'gm-b', { untilLive: true });

    // #when
    await importFile(importer);
    await waitUntil(() => shown(other, 'sheet:anya') !== undefined && sync(other).state === 'live');

    // #then
    expect({
      keys: shownKeys(other),
      notified: other.platform.shownNotifications(),
      stored: storedKeys(other).every((key) => key.startsWith(`${ROOM_PREFIX}1:gm-a:`)),
      str: stored(other, `${ROOM_PREFIX}1:gm-a:row:anya:str`),
    }).toEqual({
      keys: shownKeys(importer),
      notified: [DATA_REPLACED],
      stored: true,
      str: importedRecord('gm-a', 'row:anya:str', { str: 12 }),
    });
  });

  test('a GM adopts from another message of a higher generation and drops its waiting intents', async () => {
    // #given: a GM that never answers keeps this client in catch-up with an intent queued.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const gm = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 2000 } });

    const intent = send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 11,
    });

    const generation = newGenerationOf(GHOST);
    const anya = importedRecord(GHOST, 'sheet:anya', { set: 'pc', order: 0 });

    await waitUntil(() => Object(shown(gm, BROK_STR.k)?.d).str === 11);

    const asked = heardOf(room, 'gm-b', 'state-request').length;

    // #when
    room.post(GHOST, { v: 2, g: generation, t: 'alive', digest: 1 });
    await waitUntil(() => gm.store.$rejections.get().has(intent));
    await waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [PRESET_RECORD, anya], generation));
    await waitUntil(() => sync(gm).state === 'live');

    // #then
    expect({
      intent: gm.store.$rejections.get().get(intent)?.reason,
      keys: shownKeys(gm),
      notified: gm.platform.shownNotifications(),
    }).toEqual({
      intent: 'data-replaced',
      keys: ['preset', 'sheet:anya'],
      notified: [DATA_REPLACED],
    });
  });

  test('a live GM adopts a room copy of a higher generation at once', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-b', { untilLive: true });
    const generation = newGenerationOf('gm-a');
    const anya = importedRecord('gm-a', 'sheet:anya', { set: 'pc', order: 0 });

    // #when
    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, anya]) });
    await waitUntil(() => shown(gm, anya.k) !== undefined);
    await waitUntil(() => sync(gm).state === 'live');

    // #then
    expect({
      keys: shownKeys(gm),
      stored: storedKeys(gm),
      notified: gm.platform.shownNotifications(),
    }).toEqual({
      keys: ['preset', 'sheet:anya'],
      stored: [
        'mr2:mock-room:1:gm-a:#generation',
        'mr2:mock-room:1:gm-a:preset',
        'mr2:mock-room:1:gm-a:sheet:anya',
      ],
      notified: [DATA_REPLACED],
    });
  });

  test('while incomplete it keeps its data, writes no copy, answers nothing and asks again with backoff', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');
    joinAs(room, 'asker', 'PLAYER');

    const gm = await startClient(room, 'gm-b', { untilLive: true });
    let copyWrites = 0;

    cleanups.push(
      room.room.onMetadataChange(() => {
        copyWrites += 1;
      }),
    );

    const asked = heardOf(room, 'gm-b', 'state-request').length;

    // #when
    room.post(GHOST, { v: 2, g: newGenerationOf(GHOST), t: 'reset' });
    await waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);

    const started = Date.now();

    room.post('asker', { v: 2, g: INITIAL, t: 'state-request', r: 'asker-r' });
    room.post('asker', { v: 2, g: INITIAL, t: 'ping' });
    gm.engine.pageHidden();
    // Past the catch-up timeout, with requests again after 60, 120, 240 and 240 ms: the cap.
    await waitUntil(() => heardOf(room, 'gm-b', 'state-request').length === asked + 5);

    const waited = Date.now() - started;

    const times = room.heard
      .filter((one) => one.from === 'gm-b' && Object(one.data).t === 'state-request')
      .map((one) => one.at);

    const lastGap = (times.at(-1) ?? 0) - (times.at(-2) ?? 0);

    // #then
    expect({
      sync: sync(gm).state,
      brok: shown(gm, BROK.k),
      stored: stored(gm, `${OLD_PREFIX}${BROK.k}`),
      copyWrites,
      answers: heardOf(room, 'gm-b', 'state').length + heardOf(room, 'gm-b', 'alive').length,
      backedOff: waited >= 60 + 120 + 240 + 240 - 20,
      capped: lastGap >= 240 - 20 && lastGap < 240 * 1.5,
    }).toEqual({
      sync: 'catching-up',
      brok: BROK,
      stored: BROK,
      copyWrites: 0,
      answers: 0,
      backedOff: true,
      capped: true,
    });
  });

  test('a partial answer does not complete it, and all parts of one responder do', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const gm = await startClient(room, 'gm-b', { untilLive: true });
    const generation = newGenerationOf(GHOST);
    const anya = importedRecord(GHOST, 'sheet:anya', { set: 'pc', order: 0 });

    const asked = heardOf(room, 'gm-b', 'state-request').length;

    room.post(GHOST, { v: 2, g: generation, t: 'reset' });
    await waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);

    const r = lastRequest(room, 'gm-b');

    // #when
    room.post(GHOST, stateMessage(r, [PRESET_RECORD], generation, 1, 2));
    await pause(30);

    const partial = {
      sync: sync(gm).state,
      anya: shown(gm, anya.k) ?? null,
      brok: shown(gm, BROK.k),
    };

    room.post(GHOST, stateMessage(r, [anya], generation, 2, 2));
    await waitUntil(() => sync(gm).state === 'live');

    // #then
    expect({ partial, keys: shownKeys(gm), old: storedKeys(gm, OLD_PREFIX) }).toEqual({
      partial: { sync: 'catching-up', anya: null, brok: BROK },
      keys: ['preset', 'sheet:anya'],
      old: [],
    });
  });

  test('a player drops its waiting edits with the notification', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { untilLive: true });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      untilLive: true,
    });

    await waitUntil(() => shown(player, ACL.k) !== undefined);
    gm.engine.stop();
    send(player, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 11,
    });
    await waitUntil(() => player.store.$pending.get().size === 1);

    // #when
    room.post(GHOST, { v: 2, g: newGenerationOf(GHOST), t: 'reset' });
    joinAs(room, GHOST, 'GM');
    room.post(GHOST, { v: 2, g: newGenerationOf(GHOST), t: 'reset' });
    await waitUntil(() => player.store.$pending.get().size === 0);

    // #then
    expect(player.platform.shownNotifications()).toEqual([DATA_REPLACED]);
  });
});

describe('adoption guards', () => {
  test('a commit held in the outbox when adoption starts never goes out under the new generation', async () => {
    // #given
    const room = openRoom();
    const hold = createHold();
    const gm = await startClient(room, 'gm-b', { untilLive: true, hold });
    const anya = importedRecord('gm-a', 'sheet:anya', { set: 'pc', order: 0 });

    hold.hold();
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 15,
    });
    await waitUntil(() => Object(stored(gm, `${OLD_PREFIX}${BROK_STR.k}`)?.d).str === 15);

    // #when
    room.room.setMetadata({ [KEY]: copyValue(newGenerationOf('gm-a'), [PRESET_RECORD, anya]) });
    await waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);
    hold.release();
    await waitUntil(() => sync(gm).state === 'live');
    await pause(30);

    // #then
    expect(
      heardOf(room, 'gm-b', 'commit').filter((one) => JSON.stringify(one).includes(BROK_STR.k)),
    ).toEqual([]);
  });

  test('an adopter whose save fails keeps its old generation, shows the notice and stays incomplete', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();
    const importer = await startClient(room, 'gm-a', { untilLive: true });

    const other = await startClient(room, 'gm-b', {
      untilLive: true,
      platform: failingNewGeneration(1),
    });

    const keysBefore = storedKeys(other);

    // #when
    await importFile(importer);
    await waitUntil(() => other.store.$notices.get().includes('local-save-failed'));
    await pause(30);

    // #then
    expect({
      keys: storedKeys(other),
      sync: sync(other).state,
      brok: shown(other, BROK.k),
    }).toEqual({ keys: keysBefore, sync: 'catching-up', brok: BROK });
  });

  test('a client with no data adopts with no notification', async () => {
    // #given
    const room = openRoom();
    const importer = await startClient(room, 'gm-a', { untilLive: true });

    await importFile(importer);
    await waitUntil(() => roomCopyGeneration(room) !== null);

    // #when
    const fresh = await startClient(room, 'gm-c', { seeded: [], untilLive: true });

    await waitUntil(() => shown(fresh, 'sheet:anya') !== undefined);

    // #then
    expect(fresh.platform.shownNotifications()).toEqual([]);
  });

  test('a commit of the adopted generation during adoption is there once it is complete', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const gm = await startClient(room, 'gm-b', { untilLive: true });
    const generation = newGenerationOf(GHOST);
    const anya = importedRecord(GHOST, 'sheet:anya', { set: 'pc', order: 0 });
    const mira = importedRecord(GHOST, 'sheet:mira', { set: 'pc', order: 1 });
    const asked = heardOf(room, 'gm-b', 'state-request').length;

    room.post(GHOST, { v: 2, g: generation, t: 'reset' });
    await waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);

    // #when
    room.post(GHOST, { v: 2, g: generation, t: 'commit', records: [mira] });
    await pause(20);
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [PRESET_RECORD, anya], generation));
    await waitUntil(() => sync(gm).state === 'live');

    // #then
    expect(shownKeys(gm)).toEqual(['preset', 'sheet:anya', 'sheet:mira']);
  });
});

describe('start', () => {
  test('a generation saved part way is not read and its keys go', async () => {
    // #given
    const room = openRoom();
    const partial = 'mr2:mock-room:1:gm-x:';

    // #when
    const gm = await startClient(room, 'gm-a', {
      stored: {
        [`${partial}#incomplete`]: '1',
        [`${partial}preset`]: JSON.stringify(PRESET_RECORD),
      },
      untilLive: true,
    });

    // #then
    expect({ brok: shown(gm, BROK.k), partial: storedKeys(gm, partial) }).toEqual({
      brok: BROK,
      partial: [],
    });
  });

  test('takes the room copy of a higher generation over its stored one', async () => {
    // #given
    const room = openRoom();
    const generation = newGenerationOf('gm-a');
    const anya = importedRecord('gm-a', 'sheet:anya', { set: 'pc', order: 0 });

    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, anya]) });

    // #when
    const gm = await startClient(room, 'gm-b', { untilLive: true });

    // #then
    expect({ keys: shownKeys(gm), old: storedKeys(gm, OLD_PREFIX) }).toEqual({
      keys: ['preset', 'sheet:anya'],
      old: [],
    });
  });

  test('removes a generation below the highest one that a run left behind', async () => {
    // #given
    const room = openRoom();
    const newer = 'mr2:mock-room:1:gm-a:';
    const anya = importedRecord('gm-a', 'sheet:anya', { set: 'pc', order: 0 });

    // #when
    const gm = await startClient(room, 'gm-b', {
      stored: { [`${newer}${anya.k}`]: JSON.stringify(anya) },
      untilLive: true,
    });

    // #then
    expect(storedKeys(gm)).toEqual([`${newer}${anya.k}`]);
  });

  test('takes its stored generation when it is the highest', async () => {
    // #given
    const room = openRoom();
    const newer = 'mr2:mock-room:2:gm-a:';
    const anya = importedRecord('gm-a', 'sheet:anya', { set: 'pc', order: 0 });

    room.room.setMetadata({ [KEY]: copyValue(newGenerationOf('gm-a'), [PRESET_RECORD]) });

    // #when
    const gm = await startClient(room, 'gm-b', {
      stored: { [`${newer}${anya.k}`]: JSON.stringify(anya) },
      untilLive: true,
    });

    // #then
    expect(shownKeys(gm)).toEqual(['sheet:anya']);
  });
});
