import { fixtureSnapshotCells, fixtureSnapshotBlocks } from '../../tests/support/block-fixtures';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';
import type { JsonValue } from '@/core/json';
import { assembleRecords } from '@/core/merge';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import { encodePreset, parsePresetFile, type Preset } from '@/core/preset';
import {
  blockDataSchema,
  presetDataSchema,
  recordSchema,
  type VersionedRecord,
} from '@/core/records';
import { err } from '@/core/result';
import type { SnapshotFile } from '@/core/snapshot-file';
import { encodeSnapshotFileData } from '@/core/snapshot-import';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type Command } from '@/core/ui-messages';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole, SendResult } from '@/platform/ports';
import type { ReplicaEngine } from '@/replica/engine';
import {
  createRoomRig,
  pause,
  RIG_TIMING,
  storageKey,
  type RigClient,
  type RigPage,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

// Two sheet sets, so a new sheet's order counts only its own set, and a hidden single sheet.
const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] }] }],
    },
    {
      id: 'ally',

      title: 'Союзники',
      repeat: { nameField: 'name' },
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] }] }],
    },
    {
      id: 'npc',

      title: 'NPC',
      visibility: 'gm',
      tabs: [
        {
          sections: [
            {
              repeat: { id: 'label', nameField: 'label' },
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'label' }] }],
            },
          ],
        },
      ],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'z' };

const EXAMPLE_PRESET_TEXT = readFileSync(
  join(import.meta.dir, '../../docs/example-preset.json'),
  'utf8',
);

const LOCAL = { destination: 'LOCAL' } as const;

const LIVE_SYNC = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: false,
  gmLink: 'offline',
  role: 'GM',
} as const;

// What an engine that has read no room copy sends.
const NO_ROOM_COPY = { state: 'none', usedBytes: 0, freeBytes: 15500, outcome: null } as const;

type WireMessage = {
  t: string;
  nonce?: string;
  engine?: string;
  seq?: number;
  i?: number;
  n?: number;
  id?: string;
  reason?: string;
  records?: VersionedRecord[];
  notices?: string[];
};

type Rig = {
  client: RigClient;
  platform: MockPlatform;
  room: RigRoom;
  wire: WireMessage[];
};

type WindowView = {
  client: RigPage['window'];
  store: RigPage['store'];
};

type Aftermath = {
  records: VersionedRecord[];
  deltas: number;
};

let generatedIds = 0;
const roomRig = createRoomRig({ timing: { catchUpTimeoutMs: 200 } });

function silenceErrors(): void {
  spyOn(console, 'error').mockImplementation(() => undefined);
}

function createRig(
  role: PlayerRole = 'GM',
  platform?: (platform: MockPlatform) => MockPlatform,
  timing?: Partial<Timing>,
): Rig {
  const room = roomRig.openRoom();
  const client = roomRig.createClient(room, 'mock-connection', { role, platform, timing });

  return {
    client,
    platform: client.platform,
    room,
    get wire() {
      // SAFETY: the test reads only messages the code under test put on the UI channel.
      return client.local as WireMessage[];
    },
  };
}

function ids(...values: string[]): () => string {
  return () => {
    generatedIds += 1;

    return values.shift() ?? `generated-${generatedIds}`;
  };
}

async function startEngine(rig: Rig, newId?: () => string): Promise<ReplicaEngine> {
  await rig.client.startEngine(newId === undefined ? undefined : { engine: { newId } });

  return rig.client.engine;
}

function openWindow(rig: Rig, newId?: () => string): WindowView {
  const page: RigPage = rig.client.openWindow({ newId });

  return { client: page.window, store: page.store };
}

function post(rig: Rig, message: JsonValue): Promise<SendResult> {
  return rig.platform.broadcast.sendMessage(UI_CHANNEL, message, LOCAL);
}

function seed(rig: Rig, key: string, value: string): void {
  rig.platform.storage.setItem(storageKey(key), value);
}

function sheet(id: string, c = 1): VersionedRecord {
  return {
    k: `blk:${id}`,
    d: { set: 'pc', order: 0, cells: {} },
    c,
    a: 'mock-connection',
    l: [1, 'seed'],
  };
}

// The name field row of a sheet. With no sheet beside it, it serves any test that needs a record
// with a label of its own.
function nameRow(id: string, name = id): VersionedRecord {
  return {
    k: `blk:${id}`,
    d: { set: 'pc', order: 0, cells: { name: [name, 1, 'mock-connection'] } },
    c: 1,
    a: 'mock-connection',
    l: [1, 'seed'],
  };
}

function seedRecords(rig: Rig, ...records: VersionedRecord[]): void {
  for (const record of records) {
    seed(rig, record.k, JSON.stringify(record));
  }
}

function byKey(records: readonly VersionedRecord[]): VersionedRecord[] {
  return [...records].sort((first, second) => (first.k < second.k ? -1 : 1));
}

// Every record the GM's storage holds now, read back through the mock's own key list.
function storedRecords(rig: Rig): VersionedRecord[] {
  const keys = rig.platform.storage.keys();

  if (!keys.ok) {
    throw new Error('the mock storage could not list its keys');
  }

  return keys.value
    .filter((key) => key.startsWith(storageKey('')))
    .map((key) => {
      const text = rig.platform.storage.getItem(key);

      return recordSchema.parse(JSON.parse(text.ok && text.value !== null ? text.value : 'null'));
    });
}

function recordsOf(store: RigPage['store']): VersionedRecord[] {
  return [...store.$records.get().values()];
}

// The names the window holds, in the order its records arrived. Records with no name are skipped.
function namesOf(store: RigPage['store']): string[] {
  return recordsOf(store).flatMap((record) => {
    const block = blockDataSchema.safeParse(record.d);

    if (!block.success) return [];
    const name = z.string().safeParse(block.data.cells.name?.[0]);

    return name.success ? [name.data] : [];
  });
}

function keysOf(store: RigPage['store']): string[] {
  return recordsOf(store)
    .map((record) => record.k)
    .sort();
}

function requests(rig: Rig): WireMessage[] {
  return rig.wire.filter((message) => message.t === 'projection-request');
}

function deltas(rig: Rig): WireMessage[] {
  return rig.wire.filter((message) => message.t === 'delta');
}

async function openAndLoad(rig: Rig): Promise<WindowView> {
  generatedIds += 1;
  const nonce = `window-${generatedIds}`;
  const view = openWindow(rig, ids(nonce));
  await waitUntil(() =>
    rig.wire.some(
      (message) => message.t === 'projection' && message.nonce === nonce && message.i === message.n,
    ),
  );
  // Lets the window's own listener run, and lets a repeat that was already queued go out.
  await pause(RIG_TIMING.projectionRequestRepeatMs);

  return view;
}

async function rejectionOf(view: WindowView, command: Command): Promise<string | undefined> {
  const settled = await Promise.resolve(view.client.sendCommand(command));

  return settled.kind === 'refused' ? settled.rejection.reason : undefined;
}

// What a rejected command must leave: the window's records and no delta at all.
function unchanged(rig: Rig, view: WindowView): Aftermath {
  return { records: byKey(recordsOf(view.store)), deltas: deltas(rig).length };
}

describe('command id ownership', () => {
  test('answers a repeated raw window command id once', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);

    const message = {
      t: 'command',
      id: 'repeat-command',
      command: { type: 'sheet-create', sheetId: 'ada', set: 'pc' },
    } as const;

    // #when
    await post(rig, message);
    await post(rig, message);
    await waitUntil(
      () =>
        rig.wire.filter(
          (candidate) =>
            candidate.id === message.id &&
            (candidate.t === 'command-done' || candidate.t === 'command-rejected'),
        ).length > 0,
    );
    await pause(20);
    // #then
    expect(
      rig.wire
        .filter(
          (candidate) =>
            candidate.id === message.id &&
            (candidate.t === 'command-done' || candidate.t === 'command-rejected'),
        )
        .map(({ t, id, reason }) => ({ t, id, reason })),
    ).toEqual([{ t: 'command-done', id: 'repeat-command', reason: undefined }]);
  });
  test('ignores local commands and room commits after stop', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    rig.room.join('gm-b', 'GM');
    const engine = await startEngine(rig);
    engine.stop();
    const localBefore = rig.wire.length;
    // #when
    await post(rig, {
      t: 'command',
      id: 'after-stop',
      command: { type: 'sheet-create', sheetId: 'late', set: 'pc' },
    });
    rig.room.post('gm-b', {
      v: 4,
      g: { n: 0, a: '' },
      t: 'commit',
      records: [
        {
          k: 'blk:late',
          d: { order: 0, cells: { name: ['Late', 1, 'gm-b'] } },
          c: 1,
          a: 'gm-b',
          l: [1, 'seed'],
        },
      ],
    });
    await pause(20);
    // #then
    expect({
      engineMessagesAfterStop: rig.wire
        .slice(localBefore)
        .filter((message) => message.t !== 'command'),
      stored: storedRecords(rig).map((record) => record.k),
    }).toEqual({ engineMessagesAfterStop: [], stored: ['preset'] });
  });
  test('does not release a held commit after stop', async () => {
    // #given
    const rig = createRig('GM', undefined, { sendSpacingMs: 80 });
    seedRecords(rig, PRESET_RECORD);
    const engine = await startEngine(rig);
    const view = await openAndLoad(rig);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'late', set: 'pc' });
    await waitUntil(() => recordsOf(view.store).some((record) => record.k === 'blk:late'));
    // #when
    engine.stop();
    await pause(250);
    // #then
    expect(rig.room.heard.filter((message) => Object(message.data).t === 'commit')).toEqual([]);
  });
  test('flushNow sends a held commit before its save pause ends', async () => {
    // #given
    const rig = createRig('GM', undefined, { fieldSavePauseMs: 1000, sendSpacingMs: 1000 });
    seedRecords(rig, PRESET_RECORD);
    const engine = await startEngine(rig);
    const view = await openAndLoad(rig);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'now', set: 'pc' });
    await waitUntil(() => recordsOf(view.store).some((record) => record.k === 'blk:now'));
    // #when
    engine.flushNow();
    await pause(30);
    // #then
    expect(
      rig.room.heard
        .filter((message) => Object(message.data).t === 'commit')
        .flatMap((message) => Object(message.data).records)
        .map((record) => Object(record).k),
    ).toEqual(['blk:now']);
  });
});

test('engine startup waits for the initial catch-up deadline when a room-copy read never settles', async () => {
  // #given
  const room = roomRig.openRoom();

  const client = roomRig.createClient(room, 'gm-a', {
    timing: { catchUpTimeoutMs: 80 },
    platform: (platform) => ({
      ...platform,
      metadata: {
        ...platform.metadata,
        getMetadata: () => new Promise(() => undefined),
      },
    }),
  });

  let resolved = false;

  const started = client.startEngine().then(() => {
    resolved = true;
  });

  // #when
  await pause(20);
  const early = resolved;
  await started;
  // #then
  expect({ early, final: resolved }).toEqual({ early: false, final: true });
});

describe('GM start', () => {
  test('puts every persisted record of the current generation in the replica', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, sheet('a'), nameRow('a', 'Брок'), sheet('b'), nameRow('b', 'Лиза'));
    rig.platform.storage.setItem(
      storageKey('blk:c', { n: 0, a: '' }, { roomId: 'other-room' }),
      JSON.stringify(sheet('c')),
    );
    await startEngine(rig);
    // #when
    const view = await openAndLoad(rig);
    // #then
    expect(byKey(recordsOf(view.store))).toEqual([nameRow('a', 'Брок'), nameRow('b', 'Лиза')]);
  });
  test('loads only the highest generation', async () => {
    // #given
    const rig = createRig();
    rig.platform.storage.setItem(
      storageKey('blk:new', { n: 1, a: 'x' }),
      JSON.stringify(sheet('new')),
    );
    seed(rig, 'blk:old', JSON.stringify(sheet('old')));
    await startEngine(rig);
    // #when
    const view = await openAndLoad(rig);
    // #then
    expect(recordsOf(view.store)).toEqual([sheet('new')]);
  });
});

describe('corrupt stored record', () => {
  test('is skipped and raises the local-save notice', async () => {
    // #given
    const rig = createRig();
    seed(rig, 'blk:good', JSON.stringify(sheet('good')));
    seed(rig, 'blk:bad', '{not json');
    await startEngine(rig);
    // #when
    const view = await openAndLoad(rig);
    // #then
    expect({
      records: recordsOf(view.store),
      notices: view.store.$notices.get(),
    }).toEqual({ records: [sheet('good')], notices: ['local-save-failed'] });
  });
  test('counts as absent and clears the notice when that key is next written', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    seed(rig, 'blk:bad', '{not json');
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'bad', set: 'pc' });
    await waitUntil(() => deltas(rig).length === 1);
    await pause(5);
    // #then
    expect({
      notices: view.store.$notices.get(),
      stored: rig.platform.storage.getItem(storageKey('blk:bad')),
    }).toEqual({
      notices: [],
      stored: {
        ok: true,
        value:
          '{"k":"blk:bad","d":{"order":0,"set":"pc","cells":{}},"c":1,"a":"mock-connection","l":[1,"mock-connection"]}',
      },
    });
  });
});

describe('stored record too large for one message', () => {
  test('is skipped, a valid record still loads and the notice shows', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, nameRow('big', 'x'.repeat(14900)));
    seed(rig, 'blk:good', JSON.stringify(sheet('good')));
    await startEngine(rig);
    // #when
    const view = await openAndLoad(rig);
    // #then
    expect({
      records: recordsOf(view.store),
      notices: view.store.$notices.get(),
    }).toEqual({ records: [sheet('good')], notices: ['local-save-failed'] });
  });
});

describe('player start', () => {
  test('refuses a write command as not allowed and never calls setItem', async () => {
    // #given
    const rig = createRig('PLAYER');
    const setItem = spyOn(rig.platform.storage, 'setItem');
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const reason = await rejectionOf(view, { type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    // #then
    expect({ reason, calls: setItem.mock.calls.length, records: recordsOf(view.store) }).toEqual({
      reason: 'not-allowed',
      calls: 0,
      records: [],
    });
  });
});

describe('open window', () => {
  test('receives a full projection echoing its nonce, then deltas', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD, sheet('a'));
    await startEngine(rig);
    const view = openWindow(rig, ids('nonce-1'));
    await waitUntil(() => recordsOf(view.store).length === 2);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'b', set: 'pc' });
    await waitUntil(() => recordsOf(view.store).length === 3);
    // #then
    expect({
      projection: rig.wire.filter((message) => message.t === 'projection').map((m) => m.nonce),
      deltaSeqs: deltas(rig).map((message) => message.seq),
    }).toEqual({ projection: ['nonce-1'], deltaSeqs: [1] });
  });
  test('ignores a projection for another window', async () => {
    // #given
    const rig = createRig();
    const view = openWindow(rig, ids('mine'));
    await waitUntil(() => requests(rig).length === 1);
    // #when
    await post(rig, {
      t: 'projection',
      nonce: 'foreign',
      engine: 'e',
      seq: 0,
      i: 1,
      n: 1,
      records: [nameRow('x')],
      notices: [],
      pending: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    // #then
    expect(recordsOf(view.store)).toEqual([]);
  });
  test('repeats its request until the first part arrives, for a window before the background', async () => {
    // #given
    const rig = createRig();
    const view = openWindow(rig);
    seedRecords(rig, sheet('a'));
    await waitUntil(() => requests(rig).length >= 3);
    // #when
    await startEngine(rig);
    await waitUntil(() => recordsOf(view.store).length === 1);
    await pause(RIG_TIMING.projectionRequestRepeatMs * 2);
    const settled = requests(rig).length;
    await pause(RIG_TIMING.projectionRequestRepeatMs * 4);
    // #then
    expect({ records: recordsOf(view.store), requests: requests(rig).length - settled }).toEqual({
      records: [sheet('a')],
      requests: 0,
    });
  });
  test('uses one nonce for all repeats of a request', async () => {
    // #given
    const rig = createRig();
    openWindow(rig, ids('steady'));
    // #when
    await waitUntil(() => requests(rig).length >= 3);
    // #then
    expect(new Set(requests(rig).map((message) => message.nonce))).toEqual(new Set(['steady']));
  });
  test('restarts with a new nonce after the timeout when some parts never arrive', async () => {
    // #given
    const rig = createRig();
    const view = openWindow(rig, ids('first-try', 'second-try'));
    await waitUntil(() => requests(rig).length >= 1);
    await post(rig, {
      t: 'projection',
      nonce: 'first-try',
      engine: 'e',
      seq: 0,
      i: 1,
      n: 2,
      records: [nameRow('x')],
      notices: [],
      pending: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    // #when
    await waitUntil(() => requests(rig).at(-1)?.nonce === 'second-try');
    // #then
    expect(recordsOf(view.store)).toEqual([]);
  });
  test('keeps waiting while an incomplete set still makes progress', async () => {
    // #given
    const rig = createRig();
    openWindow(rig, ids('slow'));
    await waitUntil(() => requests(rig).length >= 1);

    const part = {
      t: 'projection',
      nonce: 'slow',
      engine: 'e',
      seq: 0,
      n: 3,
      notices: [],
      pending: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    };

    // #when: the parts arrive 60 ms apart, each inside the 80 ms timeout.
    await post(rig, { ...part, i: 1, records: [nameRow('a')] });
    await pause(60);
    await post(rig, { ...part, i: 2, records: [nameRow('b')] });
    await pause(60);
    // #then
    expect(requests(rig).at(-1)?.nonce).toBe('slow');
  });
});

describe('repeated requests', () => {
  test('delivers a request once while it waits under a rate limit across repeats', async () => {
    // #given: two 40 ms backoffs cover three repeat intervals of 25 ms.
    const rig = createRig();
    await startEngine(rig);
    // #when
    rig.client.openWindow({
      queueTiming: { rateLimitBackoffStartMs: 40, rateLimitBackoffMaxMs: 40 },
      beforeStart: (platform) =>
        platform.failNextSends([{ kind: 'rate-limited' }, { kind: 'rate-limited' }]),
    });
    await waitUntil(() => rig.wire.some((message) => message.t === 'projection'));
    await pause(RIG_TIMING.projectionRequestRepeatMs * 2);
    // #then
    expect(requests(rig).length).toBe(1);
  });
});

describe('split projection', () => {
  const part = {
    t: 'projection',
    nonce: 'split',
    engine: 'e',
    seq: 5,
    n: 2,
    notices: [],
    pending: [],
    sync: LIVE_SYNC,
    roomCopy: NO_ROOM_COPY,
  };

  test('buffers deltas until the set is complete and applies them in order', async () => {
    // #given
    const rig = createRig();
    const view = await openSplitWindow(rig);
    // #when
    await post(rig, { ...part, i: 1, records: [nameRow('a')] });
    await post(rig, {
      t: 'delta',
      engine: 'e',
      seq: 6,
      records: [nameRow('b')],
      notices: [],
      pending: [],
      withdrawn: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    const whileIncomplete = recordsOf(view.store);
    await post(rig, { ...part, i: 2, records: [nameRow('c')] });
    // #then
    expect({ whileIncomplete, names: namesOf(view.store) }).toEqual({
      whileIncomplete: [],
      names: ['a', 'c', 'b'],
    });
  });
  test('ignores a buffered delta older than the projection', async () => {
    // #given
    const rig = createRig();
    const view = await openSplitWindow(rig);
    await post(rig, { ...part, i: 1, records: [nameRow('a')] });
    await post(rig, {
      t: 'delta',
      engine: 'e',
      seq: 5,
      records: [nameRow('old')],
      notices: [],
      pending: [],
      withdrawn: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    // #when
    await post(rig, { ...part, i: 2, records: [nameRow('c')] });
    // #then
    expect(namesOf(view.store)).toEqual(['a', 'c']);
  });
  test('assembles parts that arrive out of order in their own order', async () => {
    // #given
    const rig = createRig();
    const view = await openSplitWindow(rig);
    // #when
    await post(rig, { ...part, i: 2, records: [nameRow('z')] });
    await post(rig, { ...part, i: 1, records: [nameRow('a')] });
    // #then
    expect(namesOf(view.store)).toEqual(['a', 'z']);
  });
  test('asks for a new projection when a buffered delta skips a sequence number', async () => {
    // #given
    const rig = createRig();
    const view = openWindow(rig, ids('split', 'after-gap'));
    await waitUntil(() => requests(rig).length >= 1);
    await post(rig, { ...part, i: 1, records: [nameRow('a')] });
    await post(rig, {
      t: 'delta',
      engine: 'e',
      seq: 7,
      records: [nameRow('gap')],
      notices: [],
      pending: [],
      withdrawn: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    // #when
    await post(rig, { ...part, i: 2, records: [nameRow('c')] });
    await waitUntil(() => requests(rig).at(-1)?.nonce === 'after-gap');
    // #then
    expect(namesOf(view.store)).toEqual(['a', 'c']);
  });
  test('counts the envelope, so records that nearly fill a part stay under 15000 bytes', async () => {
    // #given: two records of 7475 bytes, 14951 with their comma, so no envelope fits beside them.
    const rig = createRig();
    const name = 'x'.repeat(7475 - jsonByteLength(nameRow('a', '')));
    seedRecords(rig, nameRow('a', name), nameRow('b', name));
    await startEngine(rig);
    // #when
    const view = await openAndLoad(rig);
    const parts = rig.wire.filter((message) => message.t === 'projection');
    // #then
    expect({
      records: recordsOf(view.store).length,
      indexes: parts.map((message) => [message.i, message.n]),
      underLimit: parts.every((message) => jsonByteLength(message) < 15000),
    }).toEqual({
      records: 2,
      indexes: [
        [1, 2],
        [2, 2],
      ],
      underLimit: true,
    });
  });
  test('sends a large store as parts each under 15000 bytes with i, n and a sequence', async () => {
    // #given
    const rig = createRig();

    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      seedRecords(rig, nameRow(id, 'ы'.repeat(2000)));
    }

    await startEngine(rig);
    // #when
    const view = await openAndLoad(rig);
    const parts = rig.wire.filter((message) => message.t === 'projection');
    // #then
    expect({
      records: recordsOf(view.store).length,
      indexes: parts.map((message) => [message.i, message.n]),
      sameSeq: new Set(parts.map((message) => message.seq)).size,
      underLimit: parts.every((message) => jsonByteLength(message) < 15000),
    }).toEqual({
      records: 6,
      indexes: [
        [1, 2],
        [2, 2],
      ],
      sameSeq: 1,
      underLimit: true,
    });
  });
});

async function openSplitWindow(rig: Rig): Promise<WindowView> {
  const view = openWindow(rig, ids('split'));
  await waitUntil(() => requests(rig).length >= 1);

  return view;
}

describe('sequence gap', () => {
  test('makes the window request a new projection', async () => {
    // #given
    const rig = createRig();
    openWindow(rig, ids('before-gap', 'after-gap'));
    await waitUntil(() => requests(rig).length >= 1);
    await post(rig, {
      t: 'projection',
      nonce: 'before-gap',
      engine: 'e',
      seq: 3,
      i: 1,
      n: 1,
      records: [],
      notices: [],
      pending: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    // #when
    await post(rig, {
      t: 'delta',
      engine: 'e',
      seq: 5,
      records: [],
      notices: [],
      pending: [],
      withdrawn: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    await waitUntil(() => requests(rig).at(-1)?.nonce === 'after-gap');
    // #then
    expect(requests(rig).at(-1)?.t).toBe('projection-request');
  });
  test('leaves a live window alone for a delta that is not news', async () => {
    // #given
    const rig = createRig();
    const view = openWindow(rig, ids('steady'));
    await waitUntil(() => requests(rig).length >= 1);
    await post(rig, {
      t: 'projection',
      nonce: 'steady',
      engine: 'e',
      seq: 3,
      i: 1,
      n: 1,
      records: [nameRow('kept')],
      notices: [],
      pending: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    const requestsAfterLoad = requests(rig).length;
    // #when
    await post(rig, {
      t: 'delta',
      engine: 'e',
      seq: 3,
      records: [nameRow('dup')],
      notices: [],
      pending: [],
      withdrawn: [],
      sync: LIVE_SYNC,
      roomCopy: NO_ROOM_COPY,
    });
    await pause(RIG_TIMING.projectionRequestRepeatMs * 4);
    // #then
    expect({ names: namesOf(view.store), extra: requests(rig).length - requestsAfterLoad }).toEqual(
      {
        names: ['kept'],
        extra: 0,
      },
    );
  });
});

describe('command', () => {
  test('answers a live GM command after the delta that carries its effect', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);

    // #when
    const outcome = Promise.resolve(
      view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' }),
    );

    await waitUntil(() => deltas(rig).length === 1);
    await pause(10);
    // #then
    expect({
      sequence: rig.wire
        .filter((message) => message.t === 'delta' || message.t === 'command-done')
        .map((message) => message.t),
      outcome: await outcome,
    }).toEqual({
      sequence: ['delta', 'command-done'],
      outcome: { kind: 'answered', answer: undefined },
    });
  });
  test('makes the replica compose d, mint c and emit a delta', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(deltas(rig)[0]?.records).toEqual([
      {
        k: 'blk:brok',
        d: { set: 'pc', order: 0, cells: {} },
        c: 1,
        a: 'mock-connection',
        l: [1, 'mock-connection'],
      },
    ]);
  });
  test('gives each new sheet of a sheet set the next order of that set', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'b', set: 'pc' });
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'l', set: 'pc' });
    view.client.sendCommand({ type: 'sheet-create', sheetId: 's', set: 'ally' });
    await waitUntil(() => deltas(rig).length === 3);
    // #then
    expect(deltas(rig).map((message) => message.records?.[0]?.d)).toEqual([
      { set: 'pc', order: 0, cells: {} },
      { set: 'pc', order: 1, cells: {} },
      { set: 'ally', order: 0, cells: {} },
    ]);
  });
  test('persists the new record for the GM', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'made', set: 'pc' });
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(rig.platform.storage.getItem(storageKey('blk:made'))).toEqual({
      ok: true,
      value:
        '{"k":"blk:made","d":{"order":0,"set":"pc","cells":{}},"c":1,"a":"mock-connection","l":[1,"mock-connection"]}',
    });
  });
  test.each([
    ['k', { k: 'blk:z' }],
    ['d', { d: { set: 'pc', order: 0 } }],
    ['c', { c: 9 }],
    ['a', { a: 'conn' }],
  ])(
    'has no effect and does not throw when it holds a whole-record field %s',
    async (_f, extra) => {
      // #given: a preset, so the command would create a sheet without the extra field.
      const rig = createRig();
      seedRecords(rig, PRESET_RECORD);
      await startEngine(rig);
      const view = await openAndLoad(rig);
      // #when
      await post(rig, {
        t: 'command',
        id: 'whole',
        command: { type: 'sheet-create', sheetId: 'whole', set: 'pc', ...extra },
      });
      await pause(10);
      // #then
      expect({ records: recordsOf(view.store), deltas: deltas(rig).length }).toEqual({
        records: [PRESET_RECORD],
        deltas: 0,
      });
    },
  );
  test('has one effect when one command id is delivered twice', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);

    const message = {
      t: 'command',
      id: 'once',
      command: { type: 'sheet-create', sheetId: 'once', set: 'pc' },
    };

    // #when
    await post(rig, message);
    await post(rig, message);
    await pause(10);
    // #then
    expect({ keys: keysOf(view.store), deltas: deltas(rig).length }).toEqual({
      keys: ['blk:once', 'preset'],
      deltas: 1,
    });
  });
  test('ignores an echo of the window-bound messages it sent itself', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'x', set: 'pc' });
    await waitUntil(() => deltas(rig).length === 1);
    const before = rig.wire.length;
    // #when: every engine message on the wire is delivered back to the engine again.
    await post(rig, rig.wire.find((message) => message.t === 'delta') ?? null);
    await pause(10);
    // #then
    expect(rig.wire.length).toBe(before + 1);
  });
});

describe('window lifecycle', () => {
  test('shows the same records when a window is closed and opened again', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const first = await openAndLoad(rig);
    first.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => recordsOf(first.store).length === 2);
    first.client.stop();
    // #when
    const second = await openAndLoad(rig);
    // #then
    expect(recordsOf(second.store)).toEqual(recordsOf(first.store));
  });
  test('shows the same records after the background restarts over the same storage', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    const engine = await startEngine(rig);
    const first = await openAndLoad(rig);
    first.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => recordsOf(first.store).length === 2);
    engine.stop();
    first.client.stop();
    // #when
    await startEngine(rig);
    const second = await openAndLoad(rig);
    // #then
    expect(recordsOf(second.store)).toEqual(recordsOf(first.store));
  });
  test('re-requests a projection when a restarted engine starts sending deltas', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    const engine = await startEngine(rig, ids('engine-1'));
    const view = await openAndLoad(rig);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'before', set: 'pc' });
    await waitUntil(() => recordsOf(view.store).length === 2);
    engine.stop();
    await startEngine(rig, ids('engine-2'));
    const requestsBefore = requests(rig).length;
    // #when: the restarted engine counts from 1 again, so its delta must not look old.
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'after', set: 'pc' });
    await waitUntil(() => requests(rig).length > requestsBefore);
    await waitUntil(() => recordsOf(view.store).length === 3);
    // #then
    expect(keysOf(view.store)).toEqual(['blk:after', 'blk:before', 'preset']);
  });
  test('re-requests a projection when a new engine replaces its replica before projecting', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD, sheet('before'));
    const engine = await startEngine(rig, ids('engine-1'));
    const view = await openAndLoad(rig);
    engine.stop();

    const replacement: SnapshotFile = {
      v: 4,
      type: 'muster-roll/snapshot',
      sheets: [
        {
          id: 'after',
          set: 'pc',
          order: 0,
          cells: fixtureSnapshotCells({ name: { name: 'После' } }),
          blocks: fixtureSnapshotBlocks({}),
        },
      ],
      links: [],
    };

    const data = encodeSnapshotFileData(replacement);
    await startEngine(rig, ids('engine-2', 'engine-3'));
    const check = await view.client.requestSnapshotCheck(data);

    if (check.kind !== 'answered') {
      throw new Error('the replacement snapshot check must answer');
    }

    const requestsBefore = requests(rig).length;
    // #when: the new engine replaces its replica after the old window received engine-1's projection.
    view.client.sendCommand({ type: 'snapshot-import', data, expectedDigest: check.answer.digest });
    await waitUntil(() => requests(rig).length > requestsBefore);
    await waitUntil(() => keysOf(view.store).length === 3);
    // #then
    expect({
      requests: requests(rig).length - requestsBefore,
      records: keysOf(view.store),
    }).toEqual({ requests: 1, records: ['blk:after', 'blk:npc', 'preset'] });
  });
});

describe('send queue through the engine', () => {
  test('waits out a rate limit on the way to a window and keeps the message', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    rig.platform.failNextSends([{ kind: 'rate-limited' }, { kind: 'rate-limited' }]);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => recordsOf(view.store).length === 2);
    // #then
    expect(view.store.$records.get().get('blk:brok')?.d).toEqual({
      set: 'pc',
      order: 0,
      cells: {},
    });
  });
});

describe('record too large', () => {
  test('refuses at the window a command that cannot fit one message and sends nothing', async () => {
    // #given
    const rig = createRig();
    await startEngine(rig);
    const view = await openAndLoad(rig);
    const before = rig.wire.length;

    // #when
    const sent = await Promise.resolve(
      view.client.sendCommand({
        type: 'field-patch',
        sheetId: 'long',
        target: { kind: 'row', rowId: 'name' },
        fieldId: 'name',
        value: 'ы'.repeat(8000),
      }),
    );

    await pause(10);
    const mintedId = rig.client.mintedIds.at(-1) ?? 'missing-command-id';
    // #then
    expect({ sent, newMessages: rig.wire.length - before }).toEqual({
      sent: {
        kind: 'refused',
        rejection: {
          t: 'command-rejected',
          id: mintedId,
          reason: 'too-large',
        },
      },
      newMessages: 0,
    });
  });
});

describe('sheet-create', () => {
  test('stores the sheet under the key of the sent id, in the sheet set it names', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'b-1_X', set: 'ally' });
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(rig.platform.storage.getItem(storageKey('blk:b-1_X'))).toEqual({
      ok: true,
      value:
        '{"k":"blk:b-1_X","d":{"order":0,"set":"ally","cells":{}},"c":1,"a":"mock-connection","l":[1,"mock-connection"]}',
    });
  });
  test('rejects an id whose sheet exists and leaves that sheet as it was', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD, sheet('taken'), nameRow('taken', 'Брок'));
    await startEngine(rig);
    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-create',
      sheetId: 'taken',
      set: 'ally',
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'sheet-exists',
      unchanged: {
        records: byKey([PRESET_RECORD, nameRow('taken', 'Брок')]),
        deltas: 0,
      },
    });
  });
  test('rejects an id that only a live orphan row names, so the new sheet does not take it over', async () => {
    // #given: a row whose sheet record never arrived, as a write that failed part way leaves it.
    const rig = createRig();

    const orphan: VersionedRecord = {
      k: 'blk:lone',
      d: { order: 0, cells: { name: ['Брок', 3, 'other'] } },
      c: 3,
      a: 'other',
      l: [1, 'seed'],
    };

    seedRecords(rig, PRESET_RECORD, orphan);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, { type: 'sheet-create', sheetId: 'lone', set: 'pc' });
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'sheet-exists',
      unchanged: { records: byKey([PRESET_RECORD, orphan]), deltas: 0 },
    });
  });
  test('rejects the id of a deleted sheet, so a tombstone never comes back', async () => {
    // #given
    const rig = createRig();
    const tombstone: VersionedRecord = { k: 'blk:gone', d: null, c: 2, a: 'other', l: [1, 'seed'] };
    seedRecords(rig, PRESET_RECORD, tombstone);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, { type: 'sheet-create', sheetId: 'gone', set: 'pc' });
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'sheet-exists',
      unchanged: { records: byKey([PRESET_RECORD, tombstone]), deltas: 0 },
    });
  });
  // AD-18: a sheet id equal to a template id is that template's single sheet or nothing.
  test.each([
    ['a single sheet', 'npc'],
    ['a sheet set', 'ally'],
  ])('rejects the id of %s, so no sheet of a set takes it', async (_name, sheetId) => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, { type: 'sheet-create', sheetId, set: 'pc' });
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'sheet-exists',
      unchanged: { records: [PRESET_RECORD], deltas: 0 },
    });
  });
  test.each([
    ['empty', ''],
    ['holding a colon', 'a:b'],
    ['holding a space', 'a b'],
    ['holding a letter outside the nanoid alphabet', 'лист'],
    ['longer than 64 characters', 'a'.repeat(65)],
  ])('rejects an id that is %s and stores nothing', async (_name, sheetId) => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, { type: 'sheet-create', sheetId, set: 'pc' });
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'invalid-sheet-id',
      unchanged: { records: [PRESET_RECORD], deltas: 0 },
    });
  });
  // AD-18: only a sheet set of the preset takes new sheets.
  test.each<[string, string, VersionedRecord[]]>([
    ['a template the preset does not hold', 'ghost', [PRESET_RECORD]],
    ['a single sheet', 'npc', [PRESET_RECORD]],
    ['a sheet set while no preset is loaded', 'pc', []],
  ])('rejects a set that names %s and stores nothing', async (_name, set, records) => {
    // #given
    const rig = createRig();
    seedRecords(rig, ...records);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, { type: 'sheet-create', sheetId: 'brok', set });
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'unknown-template',
      unchanged: { records, deltas: 0 },
    });
  });
  test('keeps applying commands after a rejection', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    await rejectionOf(view, { type: 'sheet-create', sheetId: 'a:b', set: 'pc' });
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(keysOf(view.store)).toEqual(['blk:brok', 'preset']);
  });
});

describe('sheet-delete', () => {
  test('tombstones the sheet and all five dependent forms in one delta, and nothing else', async () => {
    // #given: the target "brok", a second sheet "liza" with records of every form, and a preset.
    const rig = createRig();

    const kept: VersionedRecord[] = [
      PRESET_RECORD,
      {
        k: 'blk:liza',
        d: { set: 'pc', order: 1, cells: { str: [9, 1, 'z'] } },
        c: 1,
        a: 'z',
        l: [1, 'seed'],
      },
      {
        k: 'blk:liza:items:i2',
        d: { order: 0, cells: { item: ['Лук', 1, 'z'] } },
        c: 1,
        a: 'z',
        l: [1, 'seed'],
      },
      { k: 'acl:liza:p1', d: { name: 'Оля' }, c: 1, a: 'z' },
      { k: 'plink:liza:p1', d: { name: 'Оля' }, c: 1, a: 'z' },
      { k: 'link:token2', d: { s: 'liza', c: 'token' }, c: 1, a: 'z' },
    ];

    // Links to the sheet and to one of its repeat blocks both depend on it.
    const target: VersionedRecord[] = [
      {
        k: 'blk:brok',
        d: { set: 'pc', order: 0, cells: { str: [3, 2, 'z'] } },
        c: 3,
        a: 'z',
        l: [1, 'seed'],
      },
      {
        k: 'blk:brok:items:i1',
        d: { order: 0, cells: { item: ['Меч', 1, 'z'] } },
        c: 1,
        a: 'z',
        l: [1, 'seed'],
      },
      { k: 'acl:brok:p1', d: { name: 'Оля' }, c: 4, a: 'z' },
      { k: 'plink:brok:p1', d: { name: 'Оля' }, c: 1, a: 'z' },
      { k: 'link:token1', d: { s: 'brok', c: 'token' }, c: 5, a: 'z' },
      {
        k: 'link:token3',
        d: { s: 'brok', path: ['item', 'i1'], c: 'token' },
        c: 1,
        a: 'z',
      },
    ];

    for (const record of [...kept, ...target]) {
      seed(rig, record.k, JSON.stringify(record));
    }

    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => deltas(rig).length === 1);
    await pause(5);

    // #then
    const tombstones: VersionedRecord[] = [
      { k: 'acl:brok:p1', d: null, c: 5, a: 'mock-connection' },
      { k: 'link:token1', d: null, c: 6, a: 'mock-connection' },
      { k: 'link:token3', d: null, c: 2, a: 'mock-connection' },
      { k: 'plink:brok:p1', d: null, c: 2, a: 'mock-connection' },
      { k: 'blk:brok:items:i1', d: null, c: 2, a: 'mock-connection', l: [1, 'seed'] },
      { k: 'blk:brok', d: null, c: 4, a: 'mock-connection', l: [1, 'seed'] },
    ];

    expect({
      deltas: deltas(rig).map((delta) => byKey(delta.records ?? [])),
      window: byKey(recordsOf(view.store)),
      stored: byKey(storedRecords(rig)),
    }).toEqual({
      deltas: [byKey(tombstones)],
      window: byKey([...kept, ...tombstones]),
      stored: byKey([...kept, ...tombstones]),
    });
  });
  test('does not write again a dependent that is already a tombstone', async () => {
    // #given
    const rig = createRig();

    const oldTombstone: VersionedRecord = {
      k: 'blk:brok:items:i1',
      d: null,
      c: 7,
      a: 'other',
      l: [1, 'seed'],
    };

    seedRecords(rig, sheet('brok'), oldTombstone);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect({
      delta: deltas(rig)[0]?.records,
      stored: rig.platform.storage.getItem(storageKey('blk:brok')),
    }).toEqual({
      delta: [{ k: 'blk:brok', d: null, c: 2, a: 'mock-connection', l: [1, 'seed'] }],
      stored: {
        ok: true,
        value: JSON.stringify({
          k: 'blk:brok',
          d: null,
          c: 2,
          a: 'mock-connection',
          l: [1, 'seed'],
        }),
      },
    });
  });
  test('keeps the sheet deleted after the background restarts over the same storage', async () => {
    // #given
    const rig = createRig();
    seedRecords(rig, {
      k: 'blk:brok',
      d: { set: 'pc', order: 0, cells: { str: [3, 1, 'z'] } },
      c: 1,
      a: 'z',
      l: [1, 'seed'],
    });
    const engine = await startEngine(rig);
    const first = await openAndLoad(rig);
    first.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => deltas(rig).length === 1);
    engine.stop();
    first.client.stop();
    // #when
    await startEngine(rig);
    const second = await openAndLoad(rig);
    // #then
    expect(byKey(recordsOf(second.store))).toEqual([
      { k: 'blk:brok', d: null, c: 2, a: 'mock-connection', l: [1, 'seed'] },
    ]);
  });
  test.each([
    ['an id outside the nanoid alphabet', 'a:b', 'invalid-sheet-id'],
    ['an empty id', '', 'invalid-sheet-id'],
    ['a sheet that does not exist', 'nobody', 'unknown-sheet'],
    ['a sheet that is already deleted', 'gone', 'deleted-sheet'],
    // A single sheet is never deleted, even one with values.
    ['a single sheet', 'npc', 'not-sheet-set'],
  ])('rejects %s and changes nothing', async (_name, sheetId, reason) => {
    // #given: a live sheet with a row, a deleted one, and a single sheet with a repeat block.
    const rig = createRig();

    const seeded: VersionedRecord[] = [
      PRESET_RECORD,
      {
        k: 'blk:brok',
        d: { set: 'pc', order: 0, cells: { str: [3, 1, 'z'] } },
        c: 1,
        a: 'z',
        l: [1, 'seed'],
      },
      { k: 'blk:gone', d: null, c: 2, a: 'other', l: [1, 'seed'] },
      {
        k: 'blk:npc:label:s1',
        d: { order: 0, cells: { label: ['Скелет 1', 1, 'z'] } },
        c: 1,
        a: 'z',
        l: [1, 'seed'],
      },
    ];

    for (const record of seeded) {
      seed(rig, record.k, JSON.stringify(record));
    }

    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, { type: 'sheet-delete', sheetId });
    // #then
    expect({
      rejection,
      window: byKey(recordsOf(view.store)),
      stored: byKey(storedRecords(rig)),
      deltas: deltas(rig).length,
    }).toEqual({ rejection: reason, window: byKey(seeded), stored: byKey(seeded), deltas: 0 });
  });
  test('leaves the sheet live when a dependent fails to save, so a second delete reaches it', async () => {
    // #given
    const rig = createRig();
    const setItem = rig.platform.storage.setItem;
    silenceErrors();

    for (const record of [
      {
        k: 'blk:brok',
        d: { set: 'pc', order: 0, cells: { str: [3, 1, 'z'] } },
        c: 1,
        a: 'z',
        l: [1, 'seed'],
      },
      { k: 'acl:brok:p1', d: { name: 'Оля' }, c: 1, a: 'z' },
    ]) {
      seed(rig, record.k, JSON.stringify(record));
    }

    const engine = await startEngine(rig);
    const first = await openAndLoad(rig);

    const failing = spyOn(rig.platform.storage, 'setItem').mockImplementation((key, value) =>
      key === storageKey('acl:brok:p1')
        ? err({ operation: 'write', reason: 'quota' })
        : setItem(key, value),
    );

    first.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => deltas(rig).length === 1);
    failing.mockRestore();
    engine.stop();
    first.client.stop();
    await startEngine(rig);
    const second = await openAndLoad(rig);
    const reloaded = second.store.$records.get().get('blk:brok')?.d;
    // #when
    second.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => second.store.$records.get().get('blk:brok')?.d === null);
    // #then
    expect({
      reloaded,
      stored: byKey(storedRecords(rig)).map((record) => [record.k, record.d]),
    }).toEqual({
      reloaded: { set: 'pc', order: 0, cells: { str: [3, 1, 'z'] } },
      stored: [
        ['acl:brok:p1', null],
        ['blk:brok', null],
      ],
    });
  });
  test('splits a delete over the message limit into parts in sequence that all arrive', async () => {
    // #given: enough descendant blocks exist that their tombstones need more than one delta.
    const rig = createRig();

    const blockKeys = Array.from(
      { length: 300 },
      (_, index) => `blk:brok:attack:i${String(index).padStart(3, '0')}`,
    );

    seedRecords(rig, sheet('brok'));

    for (const k of blockKeys) {
      seed(rig, k, JSON.stringify(fixtureRecord(k, { order: 0, cells: {} }, 1, 'z')));
    }

    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => recordsOf(view.store).every((record) => record.d === null));
    // #then
    const parts = deltas(rig);
    expect({
      seqs: parts.map((part) => part.seq),
      underLimit: parts.every((part) => jsonByteLength(part) < MESSAGE_BYTE_LIMIT),
      window: byKey(recordsOf(view.store)),
    }).toEqual({
      seqs: [1, 2],
      underLimit: true,
      window: byKey([
        { k: 'blk:brok', d: null, c: 2, a: 'mock-connection', l: [1, 'seed'] },
        ...blockKeys.map((k) => fixtureRecord(k, null, 2, 'mock-connection')),
      ]),
    });
  });
  test('raises the notice when a tombstone cannot be saved and still removes the sheet', async () => {
    // #given
    const rig = createRig();
    silenceErrors();
    seedRecords(rig, sheet('brok'));
    await startEngine(rig);
    const view = await openAndLoad(rig);
    rig.platform.setFailingStorageOperations(['write']);
    // #when
    view.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => deltas(rig).length === 1);
    await pause(5);
    // #then
    expect({ window: recordsOf(view.store), notices: view.store.$notices.get() }).toEqual({
      window: [{ k: 'blk:brok', d: null, c: 2, a: 'mock-connection', l: [1, 'seed'] }],
      notices: ['local-save-failed'],
    });
  });
});

describe('write failure', () => {
  test('keeps the value in the replica and raises the notice', async () => {
    // #given
    const rig = createRig();
    silenceErrors();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    rig.platform.setFailingStorageOperations(['write']);
    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => recordsOf(view.store).length === 2);
    // #then
    expect({
      sheet: view.store.$records.get().get('blk:brok')?.d,
      notices: view.store.$notices.get(),
    }).toEqual({
      sheet: { set: 'pc', order: 0, cells: {} },
      notices: ['local-save-failed'],
    });
  });
  test('clears the notice when the same key later writes', async () => {
    // #given
    const rig = createRig();
    silenceErrors();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);
    rig.platform.setFailingStorageOperations(['write']);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'flaky', set: 'pc' });
    await waitUntil(() => view.store.$notices.get().length === 1);
    rig.platform.setFailingStorageOperations([]);
    // #when
    view.client.sendCommand({ type: 'sheet-delete', sheetId: 'flaky' });
    await waitUntil(() => view.store.$notices.get().length === 0);
    // #then
    expect(rig.platform.storage.getItem(storageKey('blk:flaky'))).toEqual({
      ok: true,
      value: '{"k":"blk:flaky","d":null,"c":2,"a":"mock-connection","l":[1,"mock-connection"]}',
    });
  });
  test('keeps the notice while another failed or corrupt key remains', async () => {
    // #given
    const rig = createRig();
    silenceErrors();
    seedRecords(rig, PRESET_RECORD);
    seed(rig, 'blk:bad', '{not json');
    await startEngine(rig);
    const view = await openAndLoad(rig);
    rig.platform.setFailingStorageOperations(['write']);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'flaky', set: 'pc' });
    await waitUntil(() => recordsOf(view.store).length === 2);
    rig.platform.setFailingStorageOperations([]);
    // #when
    view.client.sendCommand({ type: 'sheet-delete', sheetId: 'flaky' });
    await waitUntil(() => deltas(rig).length === 2);
    await pause(5);
    // #then
    expect(view.store.$notices.get()).toEqual(['local-save-failed']);
  });
  // The failure ends before the command, or `store.write` would refuse on its own read. The command
  // is a preset upload, as the failed read leaves no preset for a sheet to need.
  test.each(['read', 'list'] as const)(
    'keeps the notice and writes nothing after a %s failure at start',
    async (operation) => {
      // #given
      const rig = createRig();
      silenceErrors();
      seedRecords(rig, PRESET_RECORD, sheet('saved'));
      rig.platform.setFailingStorageOperations([operation]);
      const setItem = spyOn(rig.platform.storage, 'setItem');
      await startEngine(rig);
      const view = await openAndLoad(rig);
      rig.platform.setFailingStorageOperations([]);
      // #when
      view.client.sendCommand(upload(PRESET));
      await waitUntil(() => deltas(rig).length === 1);
      await pause(5);
      // #then
      expect({
        notices: view.store.$notices.get(),
        calls: setItem.mock.calls.length,
      }).toEqual({ notices: ['local-save-failed'], calls: 0 });
    },
  );
  test('starts with an empty read-only replica when the highest-generation read alone fails', async () => {
    // #given
    let keyReads = 0;

    const rig = createRig('GM', (platform) => ({
      ...platform,
      storage: {
        ...platform.storage,
        keys: () => {
          keyReads += 1;

          return keyReads === 3
            ? err({ operation: 'list', reason: 'highest generation unavailable' })
            : platform.storage.keys();
        },
      },
    }));

    silenceErrors();
    seedRecords(rig, PRESET_RECORD);
    // #when
    const [startup] = await Promise.allSettled([startEngine(rig)]);
    const view = startup.status === 'fulfilled' ? await openAndLoad(rig) : undefined;
    // #then
    expect({
      startup: startup.status,
      records: view === undefined ? null : recordsOf(view.store),
      notices: view === undefined ? null : view.store.$notices.get(),
    }).toEqual({ startup: 'fulfilled', records: [], notices: ['local-save-failed'] });
  });
});

describe('preset upload', () => {
  test('stores the preset deflated and base64-encoded and sends it to the window', async () => {
    // #given
    const rig = createRig();
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    view.client.sendCommand(upload(examplePreset()));
    await waitUntil(() => view.store.$records.get().has('preset'));
    // #then
    expect({
      stored: storedPreset(rig),
      projected: presetJsonOf(view.store.$records.get().get('preset')),
    }).toEqual({
      stored: { c: 1, a: 'mock-connection', preset: JSON.parse(EXAMPLE_PRESET_TEXT) },
      projected: JSON.parse(EXAMPLE_PRESET_TEXT),
    });
  });
  test('keeps the preset for a window opened after the background restarts', async () => {
    // #given
    const rig = createRig();
    const engine = await startEngine(rig);
    const first = await openAndLoad(rig);
    first.client.sendCommand(upload(examplePreset()));
    await waitUntil(() => first.store.$records.get().has('preset'));
    engine.stop();
    first.client.stop();
    // #when
    await startEngine(rig);
    const second = await openAndLoad(rig);
    // #then
    expect(presetJsonOf(second.store.$records.get().get('preset'))).toEqual(
      JSON.parse(EXAMPLE_PRESET_TEXT),
    );
  });
  test('replaces an earlier preset while no sheet exists', async () => {
    // #given
    const rig = createRig();
    await startEngine(rig);
    const view = await openAndLoad(rig);
    view.client.sendCommand(upload(examplePreset()));
    await waitUntil(() => deltas(rig).length === 1);
    // #when
    view.client.sendCommand(upload(PRESET));
    await waitUntil(() => deltas(rig).length === 2);
    // #then
    expect(storedPreset(rig)).toEqual({ c: 2, a: 'mock-connection', preset: PRESET });
  });
  test.each([
    ['bytes that are not deflated', btoa('plain text')],
    [
      'a preset that repeats an id, which the window would have refused',
      deflatedJson({
        v: 3,
        templates: [
          {
            id: 'pc',
            kind: 'set',
            title: 'Персонажи',
            nameField: 'name',
            tabs: [
              {
                sections: [{ rows: [[textField('name'), numberField('str'), numberField('str')]] }],
              },
            ],
          },
        ],
      }),
    ],
    [
      'a preset of the older format',
      deflatedJson({
        v: 1,
        character: { tabs: [{ sections: [] }] },
        npc: { tabs: [{ sections: [] }] },
      }),
    ],
    ['a newer preset', deflatedJson({ ...PRESET, v: 5 })],
  ])('validates again and rejects %s, storing nothing', async (_name, data) => {
    // #given
    const rig = createRig();
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const outcome = await Promise.resolve(view.client.sendCommand({ ...upload(PRESET), data }));
    // #then
    expect({
      outcome,
      records: recordsOf(view.store),
      deltas: deltas(rig).length,
      stored: rig.platform.storage.keys(),
    }).toEqual({
      outcome: {
        kind: 'refused',
        rejection: {
          t: 'command-rejected',
          id: expect.any(String),
          reason: 'invalid-preset',
        },
      },
      records: [],
      deltas: 0,
      stored: { ok: true, value: [] },
    });
  });
  test('rejects a preset whose record cannot fit one message and stores nothing', async () => {
    // #given
    const rig = createRig();
    await startEngine(rig);
    const view = await openAndLoad(rig);
    const data = incompressiblePresetData();
    // #when
    const outcome = await Promise.resolve(view.client.sendCommand({ ...upload(PRESET), data }));
    // #then
    expect({
      kind: outcome.kind,
      rejection: outcome.kind === 'refused' ? outcome.rejection.reason : null,
      stored: rig.platform.storage.keys(),
    }).toEqual({ kind: 'refused', rejection: 'too-large', stored: { ok: true, value: [] } });
  });
  test('accepts an upload while a sheet exists', async () => {
    // #given
    const rig = createRig();
    seed(rig, 'blk:saved', JSON.stringify(sheet('saved')));
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const outcome = await Promise.resolve(view.client.sendCommand(upload(examplePreset())));
    await waitUntil(() => view.store.$records.get().has('preset'));
    // #then
    expect({
      outcome,
      stored: storedPreset(rig)?.preset,
    }).toEqual({
      outcome: { kind: 'answered', answer: { count: 0, sheets: 0 } },
      stored: JSON.parse(EXAMPLE_PRESET_TEXT),
    });
  });
  test('accepts an upload when the only sheet is deleted', async () => {
    // #given
    const rig = createRig();
    seed(
      rig,
      'blk:gone',
      JSON.stringify({ k: 'blk:gone', d: null, c: 2, a: 'other', l: [1, 'seed'] }),
    );
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const outcome = Promise.resolve(view.client.sendCommand(upload(examplePreset())));
    await waitUntil(() => deltas(rig).length === 1);
    await outcome;
    // #then
    expect(storedPreset(rig)?.preset).toEqual(JSON.parse(EXAMPLE_PRESET_TEXT));
  });
  test('accepts an upload that a sheet-create reaches the replica before', async () => {
    // #given: the example preset keeps the sheet set "pc", so the new empty sheet loses nothing.
    const rig = createRig();
    seedRecords(rig, PRESET_RECORD);
    await startEngine(rig);
    const view = await openAndLoad(rig);

    // #when
    const created = Promise.resolve(
      view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', set: 'pc' }),
    );

    const uploaded = Promise.resolve(view.client.sendCommand(upload(examplePreset())));
    await waitUntil(() => view.store.$records.get().has('preset'));
    // #then
    expect({
      outcomes: await Promise.all([created, uploaded]),
      sheet: view.store.$records.get().has('blk:brok'),
    }).toEqual({
      outcomes: [
        { kind: 'answered', answer: undefined },
        { kind: 'answered', answer: { count: 0, sheets: 0 } },
      ],
      sheet: true,
    });
  });
});

describe('field-patch', () => {
  const ROW_STR = { kind: 'row', rowId: 'str' } as const;
  const ATTACK_I1 = { kind: 'rep', sectionId: 'attack', instanceId: 'i1' } as const;

  // A sheet set with its name field, a plain row, a text row and a repeat section, and a single
  // sheet with a template of its own.
  const PATCH_PRESET: Preset = {
    v: 4,
    templates: [
      {
        id: 'pc',

        title: 'Персонажи',
        repeat: { nameField: 'name' },
        tabs: [
          {
            sections: [
              {
                rows: [
                  { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                  {
                    cells: [
                      { kind: 'text', text: 'Сила' },
                      { kind: 'field', type: 'number', id: 'str' },
                      { kind: 'field', type: 'check', id: 'str_tired' },
                    ],
                  },
                  { cells: [{ kind: 'field', type: 'text', id: 'notes' }] },
                ],
              },
              {
                repeat: { id: 'attack', nameField: 'attack' },
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'attack' },
                      { kind: 'field', type: 'number', id: 'bonus' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'npc',

        title: 'NPC',
        visibility: 'gm',
        tabs: [
          { sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] },
        ],
      },
    ],
  };

  async function patchRig(...records: VersionedRecord[]): Promise<{
    rig: Rig;
    view: WindowView;
  }> {
    const rig = createRig();
    seed(
      rig,
      'preset',
      JSON.stringify({ k: 'preset', d: encodePreset(PATCH_PRESET), c: 1, a: 'z' }),
    );
    seedRecords(rig, ...assembleRecords([sheet('brok'), ...records]).values());
    await startEngine(rig);

    return { rig, view: await openAndLoad(rig) };
  }

  function patch(
    target: Extract<
      Command,
      {
        type: 'field-patch';
      }
    >['target'],
    fieldId: string,
    value: JsonValue,
    sheetId = 'brok',
  ): Command {
    return { type: 'field-patch', sheetId, target, fieldId, value };
  }

  function stored(rig: Rig, key: string): JsonValue {
    const text = rig.platform.storage.getItem(storageKey(key));

    return text.ok && text.value !== null ? z.json().parse(JSON.parse(text.value)) : null;
  }

  test('merges a number into the row record as a JSON number, keeps its other fields and persists it', async () => {
    // #given
    const { rig, view } = await patchRig({
      k: 'blk:brok',
      d: { order: 0, cells: { str: [9, 4, 'z'], str_tired: [true, 4, 'z'] } },
      c: 4,
      a: 'z',
      l: [1, 'seed'],
    });

    // #when
    view.client.sendCommand(patch(ROW_STR, 'str', 12));
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    const expected: VersionedRecord = {
      k: 'blk:brok',
      d: {
        set: 'pc',
        order: 0,
        cells: { str: [12, 5, 'mock-connection'], str_tired: [true, 4, 'z'] },
      },
      c: 5,
      a: 'mock-connection',
      l: [1, 'seed'],
    };

    expect({
      window: view.store.$records.get().get('blk:brok'),
      stored: stored(rig, 'blk:brok'),
    }).toEqual({ window: expected, stored: expected });
  });
  test('starts an absent row record empty and stores false for an unchecked box', async () => {
    // #given
    const { rig, view } = await patchRig();
    // #when
    view.client.sendCommand(patch(ROW_STR, 'str_tired', false));
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(stored(rig, 'blk:brok')).toEqual({
      k: 'blk:brok',
      d: { set: 'pc', order: 0, cells: { str_tired: [false, 2, 'mock-connection'] } },
      c: 2,
      a: 'mock-connection',
      l: [1, 'seed'],
    });
  });
  test('stores a text value as typed, line breaks included', async () => {
    // #given
    const { rig, view } = await patchRig();
    // #when
    view.client.sendCommand(patch({ kind: 'row', rowId: 'notes' }, 'notes', ' abc\nдва '));
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(view.store.$records.get().get('blk:brok')?.d).toEqual({
      set: 'pc',
      order: 0,
      cells: { notes: [' abc\nдва ', 2, 'mock-connection'] },
    });
  });
  test('retains a versioned null for a cleared field', async () => {
    // #given
    const { rig, view } = await patchRig({
      k: 'blk:brok',
      d: { order: 0, cells: { str: [9, 1, 'z'], str_tired: [true, 1, 'z'] } },
      c: 1,
      a: 'z',
      l: [1, 'seed'],
    });

    // #when
    view.client.sendCommand(patch(ROW_STR, 'str', null));
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(stored(rig, 'blk:brok')).toEqual({
      k: 'blk:brok',
      d: {
        set: 'pc',
        order: 0,
        cells: {
          str: [null, 2, 'mock-connection'],
          str_tired: [true, 1, 'z'],
        },
      },
      c: 2,
      a: 'mock-connection',
      l: [1, 'seed'],
    });
  });
  test('saves a field of an existing repeat instance into its cells and keeps its order', async () => {
    // #given
    const { rig, view } = await patchRig({
      k: 'blk:brok:attack:i1',
      d: { order: 3, cells: { attack: ['Меч', 1, 'z'] } },
      c: 1,
      a: 'z',
      l: [1, 'seed'],
    });

    // #when
    view.client.sendCommand(patch(ATTACK_I1, 'bonus', 2));
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(stored(rig, 'blk:brok:attack:i1')).toEqual({
      k: 'blk:brok:attack:i1',
      d: {
        order: 3,
        cells: { attack: ['Меч', 1, 'z'], bonus: [2, 2, 'mock-connection'] },
      },
      c: 2,
      a: 'mock-connection',
      l: [1, 'seed'],
    });
  });
  // Sheet names convention: a sheet of a sheet set is renamed by a patch of its name field.
  test('renames a sheet of a sheet set by a patch of its name field and persists it', async () => {
    // #given
    const { rig, view } = await patchRig({
      k: 'blk:brok',
      d: { order: 0, cells: { name: ['Брок', 3, 'z'] } },
      c: 3,
      a: 'z',
      l: [1, 'seed'],
    });

    // #when
    view.client.sendCommand(patch({ kind: 'row', rowId: 'name' }, 'name', 'Лиза'));
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    const expected: VersionedRecord = {
      k: 'blk:brok',
      d: { set: 'pc', order: 0, cells: { name: ['Лиза', 4, 'mock-connection'] } },
      c: 4,
      a: 'mock-connection',
      l: [1, 'seed'],
    };

    expect({
      window: view.store.$records.get().get('blk:brok'),
      stored: stored(rig, 'blk:brok'),
      sheet: view.store.$records.get().get('blk:brok'),
    }).toEqual({ window: expected, stored: expected, sheet: expected });
  });
  // AD-18: a single sheet's id is its template id, and its root block carries no `set`.
  test("reads the single sheet's own template for a single sheet", async () => {
    // #given
    const { rig, view } = await patchRig();
    // #when
    view.client.sendCommand(patch({ kind: 'row', rowId: 'hp' }, 'hp', 7, 'npc'));
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(view.store.$records.get().get('blk:npc')?.d).toEqual({
      order: 0,
      cells: { hp: [7, 1, 'mock-connection'] },
    });
  });
  test.each<[string, string, Command, VersionedRecord[]]>([
    ['an unknown sheet', 'unknown-sheet', patch(ROW_STR, 'str', 1, 'nobody'), []],
    [
      'a deleted sheet',
      'deleted-sheet',
      patch(ROW_STR, 'str', 1, 'gone'),
      [{ k: 'blk:gone', d: null, c: 2, a: 'z', l: [1, 'seed'] }],
    ],
    [
      'a sheet id outside the nanoid alphabet',
      'invalid-sheet-id',
      patch(ROW_STR, 'str', 1, 'a:b'),
      [],
    ],
    ['a field of another row', 'unknown-field', patch(ROW_STR, 'notes', 'x'), []],
    ['a field not in the preset', 'unknown-field', patch(ROW_STR, 'dex', 1), []],
    ['a sheet set field on a single sheet', 'unknown-field', patch(ROW_STR, 'str', 1, 'npc'), []],
    [
      'a sheet whose sheet set the preset does not hold',
      'unknown-sheet',
      patch(ROW_STR, 'str', 1, 'ghost'),
      [{ k: 'blk:ghost', d: { set: 'gone', order: 0, cells: {} }, c: 1, a: 'z', l: [1, 'seed'] }],
    ],
    ['a string for a number field', 'invalid-value', patch(ROW_STR, 'str', '12'), []],
    ['a number for a check field', 'invalid-value', patch(ROW_STR, 'str_tired', 1), []],
    [
      'an empty string for a text field',
      'invalid-value',
      patch({ kind: 'row', rowId: 'notes' }, 'notes', ''),
      [],
    ],
    [
      'an object for a text field',
      'invalid-value',
      patch({ kind: 'row', rowId: 'notes' }, 'notes', { a: 1 }),
      [],
    ],
    ['an unknown instance', 'unknown-instance', patch(ATTACK_I1, 'bonus', 2), []],
    [
      'a deleted instance',
      'unknown-instance',
      patch(ATTACK_I1, 'bonus', 2),
      [{ k: 'blk:brok:attack:i1', d: null, c: 2, a: 'z', l: [1, 'seed'] }],
    ],
    [
      'a clear of an absent key',
      'unchanged',
      patch(ROW_STR, 'str', null),
      [
        {
          k: 'blk:brok',
          d: { order: 0, cells: { str_tired: [true, 1, 'z'] } },
          c: 1,
          a: 'z',
          l: [1, 'seed'],
        },
      ],
    ],
    [
      'a record that would not fit one message',
      'too-large',
      patch({ kind: 'row', rowId: 'notes' }, 'notes', 'ы'.repeat(7400)),
      [],
    ],
  ])('rejects %s and changes nothing', async (_name, reason, command, records) => {
    // #given
    const { rig, view } = await patchRig(...records);
    const before = recordsOf(view.store);
    // #when
    const rejection = await rejectionOf(view, command);
    // #then
    expect({ rejection, records: recordsOf(view.store), deltas: deltas(rig).length }).toEqual({
      rejection: reason,
      records: before,
      deltas: 0,
    });
  });
  test('reads the preset uploaded after an earlier patch', async () => {
    // #given: a patch under the first preset, then the only sheet deleted so a new preset can load.
    const { view } = await patchRig();
    view.client.sendCommand(patch(ROW_STR, 'str', 1));
    view.client.sendCommand({ type: 'sheet-delete', sheetId: 'brok' });
    view.client.sendCommand(
      upload({
        v: 4,
        templates: [
          {
            id: 'pc',

            title: 'Персонажи',
            repeat: { nameField: 'name' },
            tabs: [
              {
                sections: [
                  {
                    rows: [
                      { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                      {
                        cells: [
                          { kind: 'field', type: 'number', id: 'str' },
                          { kind: 'field', type: 'number', id: 'dex' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'liza', set: 'pc' });
    await waitUntil(() => view.store.$records.get().has('blk:liza'));
    // #when
    view.client.sendCommand(patch(ROW_STR, 'dex', 5, 'liza'));
    await waitUntil(() => view.store.$records.get().has('blk:liza'));

    const removed = await rejectionOf(
      view,
      patch({ kind: 'row', rowId: 'notes' }, 'notes', 'x', 'liza'),
    );

    // #then
    expect({ added: view.store.$records.get().get('blk:liza')?.d, removed }).toEqual({
      added: {
        set: 'pc',
        order: 0,
        cells: { dex: [5, 2, 'mock-connection'] },
      },
      removed: 'unknown-field',
    });
  });
  test('rejects a patch while no preset is loaded', async () => {
    // #given
    const rig = createRig();
    seed(rig, 'blk:brok', JSON.stringify(sheet('brok')));
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, patch(ROW_STR, 'str', 1));
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'unknown-field',
      unchanged: { records: [sheet('brok')], deltas: 0 },
    });
  });
});

describe('repeat blocks', () => {
  // Two repeat sections, so a block of one never counts for the other, and a single sheet with
  // none.
  const ROWS_PRESET: Preset = {
    v: 4,
    templates: [
      {
        id: 'pc',

        title: 'Персонажи',
        repeat: { nameField: 'name' },
        tabs: [
          {
            sections: [
              {
                rows: [
                  { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                  { cells: [{ kind: 'field', type: 'number', id: 'str' }] },
                ],
              },
              {
                repeat: { id: 'attack', nameField: 'attack' },
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'attack' },
                      { kind: 'field', type: 'number', id: 'bonus' },
                    ],
                  },
                ],
              },
              {
                repeat: { id: 'item', nameField: 'item' },
                rows: [{ cells: [{ kind: 'field', type: 'text', id: 'item' }] }],
              },
            ],
          },
        ],
      },
      {
        id: 'npc',

        title: 'NPC',
        visibility: 'gm',
        tabs: [
          { sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] },
        ],
      },
    ],
  };

  async function rowsRig(...records: VersionedRecord[]): Promise<{
    rig: Rig;
    engine: ReplicaEngine;
    view: WindowView;
  }> {
    const rig = createRig();
    seed(
      rig,
      'preset',
      JSON.stringify({ k: 'preset', d: encodePreset(ROWS_PRESET), c: 1, a: 'z' }),
    );
    seedRecords(rig, sheet('brok'), sheet('liza'), ...records);
    const engine = await startEngine(rig);

    return { rig, engine, view: await openAndLoad(rig) };
  }

  test('adds a row with the sent id, order 0 and empty cells, and persists it', async () => {
    // #given
    const { rig, view } = await rowsRig();
    // #when
    view.client.sendCommand(addRow('r1'));
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    const expected: VersionedRecord = {
      k: 'blk:brok:attack:r1',
      d: { order: 0, cells: {} },
      c: 1,
      a: 'mock-connection',
      l: [1, 'mock-connection'],
    };

    expect({
      window: view.store.$records.get().get('blk:brok:attack:r1'),
      stored: storedRecord(rig, 'blk:brok:attack:r1'),
    }).toEqual({ window: expected, stored: expected });
  });
  test("puts a new row above the section's highest order, counting no other section or sheet", async () => {
    // #given
    const { rig, view } = await rowsRig(
      rep('blk:brok:attack:a', 3),
      rep('blk:brok:attack:b', 7),
      rep('blk:brok:item:c', 40),
      rep('blk:liza:attack:d', 50),
    );

    // #when
    view.client.sendCommand(addRow('r1'));
    await waitUntil(() => deltas(rig).length === 1);
    // #then
    expect(view.store.$records.get().get('blk:brok:attack:r1')?.d).toEqual({ order: 8, cells: {} });
  });
  test("leaves the other character's rows as they were", async () => {
    // #given
    const { rig, view } = await rowsRig(rep('blk:liza:attack:d', 0, { attack: 'Лук' }));
    // #when
    view.client.sendCommand(addRow('r1'));
    view.client.sendCommand(addRow('r2'));
    await waitUntil(() => deltas(rig).length === 2);
    // #then
    expect(
      byKey(recordsOf(view.store).filter((one) => one.k.startsWith('blk:'))).map((one) => one.k),
    ).toEqual([
      'blk:brok',
      'blk:brok:attack:r1',
      'blk:brok:attack:r2',
      'blk:liza',
      'blk:liza:attack:d',
    ]);
  });
  test('tombstones the deleted row and leaves the others', async () => {
    // #given
    const { rig, view } = await rowsRig(
      rep('blk:brok:attack:a', 0, { attack: 'Меч' }),
      rep('blk:brok:attack:b', 1, { attack: 'Нож' }),
    );

    // #when
    view.client.sendCommand(deleteRow('a'));
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    const tombstone: VersionedRecord = {
      k: 'blk:brok:attack:a',
      d: null,
      c: 2,
      a: 'mock-connection',
      l: [1, 'seed'],
    };

    expect({
      window: view.store.$records.get().get('blk:brok:attack:a'),
      stored: storedRecord(rig, 'blk:brok:attack:a'),
      other: view.store.$records.get().get('blk:brok:attack:b'),
    }).toEqual({
      window: tombstone,
      stored: tombstone,
      other: rep('blk:brok:attack:b', 1, { attack: 'Нож' }),
    });
  });
  test('puts a row added after the last one was deleted after every live row', async () => {
    // #given: "A0" sorts before "a" by id, so only its order can put it last.
    const { rig, view } = await rowsRig(rep('blk:brok:attack:a', 0), rep('blk:brok:attack:b', 1));
    view.client.sendCommand(deleteRow('b'));
    // #when
    view.client.sendCommand(addRow('A0'));
    await waitUntil(() => deltas(rig).length === 2);
    // #then
    expect(view.store.$records.get().get('blk:brok:attack:A0')?.d).toEqual({ order: 1, cells: {} });
  });
  test('saves fields of an added block and retains a versioned null for a clear', async () => {
    // #given
    const { rig, view } = await rowsRig(rep('blk:brok:attack:a', 4));
    view.client.sendCommand(addRow('r1'));
    // #when
    view.client.sendCommand({
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'attack', instanceId: 'r1' },
      fieldId: 'bonus',
      value: 2,
    });
    view.client.sendCommand({
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'attack', instanceId: 'r1' },
      fieldId: 'attack',
      value: 'Топор',
    });
    view.client.sendCommand({
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'attack', instanceId: 'r1' },
      fieldId: 'bonus',
      value: null,
    });
    await waitUntil(() => deltas(rig).length === 4);
    // #then
    expect(storedRecord(rig, 'blk:brok:attack:r1')).toEqual({
      k: 'blk:brok:attack:r1',
      d: {
        order: 5,
        cells: {
          attack: ['Топор', 3, 'mock-connection'],
          bonus: [null, 4, 'mock-connection'],
        },
      },
      c: 4,
      a: 'mock-connection',
      l: [1, 'mock-connection'],
    });
  });
  test('shows the same rows after the background restarts over the same storage', async () => {
    // #given
    const { rig, engine, view } = await rowsRig(rep('blk:brok:attack:a', 0));
    view.client.sendCommand(addRow('r1'));
    view.client.sendCommand(addRow('r2'));
    view.client.sendCommand(deleteRow('a'));
    view.client.sendCommand(deleteRow('r1'));
    await waitUntil(() => deltas(rig).length === 4);
    engine.stop();
    view.client.stop();
    // #when
    await startEngine(rig);
    const second = await openAndLoad(rig);
    // #then
    expect(byKey(recordsOf(second.store).filter((one) => one.k.startsWith('blk:')))).toEqual([
      sheet('brok'),
      { k: 'blk:brok:attack:a', d: null, c: 2, a: 'mock-connection', l: [1, 'seed'] },
      {
        k: 'blk:brok:attack:r1',
        d: null,
        c: 2,
        a: 'mock-connection',
        l: [1, 'mock-connection'],
      },
      {
        k: 'blk:brok:attack:r2',
        d: { order: 2, cells: {} },
        c: 1,
        a: 'mock-connection',
        l: [1, 'mock-connection'],
      },
      sheet('liza'),
    ]);
  });
  test.each<[string, string, Command, VersionedRecord[]]>([
    ['an add to an unknown sheet', 'unknown-sheet', addRow('r1', 'nobody'), []],
    [
      'an add to a deleted sheet',
      'deleted-sheet',
      addRow('r1', 'gone'),
      [{ k: 'blk:gone', d: null, c: 2, a: 'z', l: [1, 'seed'] }],
    ],
    [
      'an add to a sheet id outside the nanoid alphabet',
      'invalid-sheet-id',
      addRow('r1', 'a:b'),
      [],
    ],
    ['an add to a plain row', 'unknown-section', addRow('r1', 'brok', 'str'), []],
    [
      'an add to a field that does not name its section',
      'unknown-section',
      addRow('r1', 'brok', 'bonus'),
      [],
    ],
    ['an add to a section not in the preset', 'unknown-section', addRow('r1', 'brok', 'spell'), []],
    ['an add to a sheet set section on a single sheet', 'unknown-section', addRow('r1', 'npc'), []],
    [
      'an add with the id of a live row',
      'instance-exists',
      addRow('a'),
      [rep('blk:brok:attack:a', 0)],
    ],
    [
      'an add with the id of a deleted row',
      'instance-exists',
      addRow('a'),
      [{ k: 'blk:brok:attack:a', d: null, c: 2, a: 'z', l: [1, 'seed'] }],
    ],
    // AD-2: an instance id is unique within its sheet, across sections, so a link names one block.
    [
      'an add with the id of a block in another section of the sheet',
      'instance-exists',
      addRow('a'),
      [rep('blk:brok:item:a', 0)],
    ],
    ['an add with an id outside the nanoid alphabet', 'invalid-instance-id', addRow('a:b'), []],
    ['an add with an empty id', 'invalid-instance-id', addRow(''), []],
    ['a delete on an unknown sheet', 'unknown-sheet', deleteRow('a', 'nobody'), []],
    [
      'a delete on a deleted sheet',
      'deleted-sheet',
      deleteRow('a', 'gone'),
      [{ k: 'blk:gone', d: null, c: 2, a: 'z', l: [1, 'seed'] }],
    ],
    [
      'a delete on a sheet id outside the nanoid alphabet',
      'invalid-sheet-id',
      deleteRow('a', 'a:b'),
      [],
    ],
    [
      'a delete in a sheet set section on a single sheet',
      'unknown-section',
      deleteRow('a', 'npc'),
      [rep('blk:npc:attack:a', 0)],
    ],
    ['a delete in a plain row', 'unknown-section', deleteRow('a', 'brok', 'str'), []],
    ['a delete of an unknown row', 'unknown-instance', deleteRow('a'), []],
    [
      'a delete of a deleted row',
      'unknown-instance',
      deleteRow('a'),
      [{ k: 'blk:brok:attack:a', d: null, c: 2, a: 'z', l: [1, 'seed'] }],
    ],
    [
      "a delete of another sheet's row",
      'unknown-instance',
      deleteRow('d'),
      [rep('blk:liza:attack:d', 0)],
    ],
    [
      'a delete of a row of another section',
      'unknown-instance',
      deleteRow('c'),
      [rep('blk:brok:item:c', 0)],
    ],
  ])('rejects %s and changes nothing', async (_name, reason, command, records) => {
    // #given
    const { rig, view } = await rowsRig(...records);
    const before = byKey(recordsOf(view.store));
    // #when
    const rejection = await rejectionOf(view, command);
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: reason,
      unchanged: { records: before, deltas: 0 },
    });
  });
  test('rejects an add while no preset is loaded', async () => {
    // #given
    const rig = createRig();
    seed(rig, 'blk:brok', JSON.stringify(sheet('brok')));
    await startEngine(rig);
    const view = await openAndLoad(rig);
    // #when
    const rejection = await rejectionOf(view, addRow('r1'));
    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'unknown-section',
      unchanged: { records: [sheet('brok')], deltas: 0 },
    });
  });
});

function addRow(instanceId: string, sheetId = 'brok', sectionId = 'attack'): Command {
  return { type: 'repeat-block-add', sheetId, sectionId, instanceId };
}

function deleteRow(instanceId: string, sheetId = 'brok', sectionId = 'attack'): Command {
  return { type: 'repeat-block-delete', sheetId, sectionId, instanceId };
}

function rep(
  key: string,
  order: number,
  cells: Record<string, string | number> = {},
): VersionedRecord {
  return fixtureRecord(key, { order, cells }, 1, 'z');
}

function storedRecord(rig: Rig, key: string): VersionedRecord | null {
  return storedRecords(rig).find((one) => one.k === key) ?? null;
}

function examplePreset(): Preset {
  const parsed = parsePresetFile(EXAMPLE_PRESET_TEXT);

  if (!parsed.ok) {
    throw new Error('the committed example preset must parse');
  }

  return parsed.value;
}

function numberField(id: string): JsonValue {
  return { kind: 'field', type: 'number', id };
}

function textField(id: string): JsonValue {
  return { kind: 'field', type: 'text', id };
}

// An upload the GM confirmed with nothing to erase: no value and no sheet lost.
function upload(preset: Preset): Extract<
  Command,
  {
    type: 'preset-upload';
  }
> {
  return {
    type: 'preset-upload',
    data: encodePreset(preset),
    expectedCount: 0,
    expectedSheets: 0,
    expectedDigest: '811c9dc5',
  };
}

function deflatedJson(value: JsonValue): string {
  return Buffer.from(deflateSync(strToU8(JSON.stringify(value)))).toString('base64');
}

function presetJsonOf(record: VersionedRecord | undefined): JsonValue {
  const data = presetDataSchema.safeParse(record?.d);

  return data.success ? inflatedJson(data.data) : null;
}

function inflatedJson(data: string): JsonValue {
  return z.json().parse(JSON.parse(strFromU8(inflateSync(Buffer.from(data, 'base64')))));
}

function storedPreset(rig: Rig): {
  c: number;
  a: string;
  preset: JsonValue;
} | null {
  const text = rig.platform.storage.getItem(storageKey('preset'));

  if (!text.ok || text.value === null) {
    return null;
  }

  const record = recordSchema.parse(JSON.parse(text.value));

  return { c: record.c, a: record.a, preset: presetJsonOf(record) };
}

// Random labels barely deflate, so the data lands where the command still fits one message and
// the record, with its envelope reserve, does not.
function incompressiblePresetData(): string {
  let state = 7;
  let label = '';

  const nextCharacter = (): string => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;

    return (
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'[(state >>> 16) % 64] ?? 'x'
    );
  };

  for (;;) {
    label += Array.from({ length: 50 }, nextCharacter).join('');

    const data = encodePreset({
      v: 4,
      templates: [
        {
          id: 'pc',

          title: 'Персонажи',
          repeat: { nameField: 'name' },
          tabs: [
            {
              sections: [
                {
                  rows: [
                    { cells: [{ kind: 'text', text: label }] },
                    { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    // The command, with its envelope of about 85 bytes, still fits one message. The record, with
    // the largest counter and the 512-byte reserve, does not.
    if (data.length >= MESSAGE_BYTE_LIMIT - 400) {
      if (data.length > MESSAGE_BYTE_LIMIT - 200) {
        throw new Error(`the preset data overshot its window: ${data.length}`);
      }

      return data;
    }
  }
}
