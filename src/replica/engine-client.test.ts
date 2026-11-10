import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { z } from 'zod';

import type { JsonValue } from '@/core/json';
import { jsonByteLength, MESSAGE_BYTE_LIMIT } from '@/core/message-size';
import { encodePreset, parsePresetFile, type Preset } from '@/core/preset';
import { presetDataSchema, recordSchema, type VersionedRecord } from '@/core/records';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type Command } from '@/core/ui-messages';
import { createMemoryBus, createMockPlatform, type MockPlatform } from '@/platform/current';
import type { PlayerRole, SendResult } from '@/platform/ports';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine, type ReplicaEngine } from '@/replica/engine';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient } from '@/ui/replica-client';

const TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 25,
  projectionIncompleteTimeoutMs: 80,
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';

const EXAMPLE_PRESET_TEXT = readFileSync(
  join(import.meta.dir, '../../docs/example-preset.json'),
  'utf8',
);

const LOCAL = { destination: 'LOCAL' } as const;
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;

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
  bus: ReturnType<typeof createMemoryBus>;
  platform: MockPlatform;
  wire: WireMessage[];
};

type WindowView = { client: ReplicaClient; store: ProjectionStore };

type Aftermath = { records: VersionedRecord[]; deltas: number };

const cleanups: (() => void)[] = [];

let generatedIds = 0;

afterEach(() => {
  mock.restore();

  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function silenceErrors(): void {
  spyOn(console, 'error').mockImplementation(() => undefined);
}

function createRig(role: PlayerRole = 'GM'): Rig {
  const bus = createMemoryBus();
  const platform = createMockPlatform(bus);
  const wire: WireMessage[] = [];

  platform.setRole(role);
  // SAFETY: the test reads only messages the code under test put on the wire.
  platform.broadcast.onMessage(UI_CHANNEL, (event) => wire.push(event.data as WireMessage));

  return { bus, platform, wire };
}

function ids(...values: string[]): () => string {
  return () => {
    generatedIds += 1;

    return values.shift() ?? `generated-${generatedIds}`;
  };
}

async function startEngine(rig: Rig, newId?: () => string): Promise<ReplicaEngine> {
  const engine = await startReplicaEngine(
    rig.platform,
    createSendQueue(rig.platform.broadcast, TIMING),
    newId,
  );

  cleanups.push(engine.stop);

  return engine;
}

function openWindow(rig: Rig, newId?: () => string): WindowView {
  const platform = createMockPlatform(rig.bus);
  const store = createProjectionStore();

  const client = startReplicaClient(
    platform.broadcast,
    createSendQueue(platform.broadcast, TIMING),
    store,
    TIMING,
    newId,
  );

  cleanups.push(client.stop);

  return { client, store };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('the condition never became true');
    }

    // Polling is the point here: each round has to let the paced queue run.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function post(rig: Rig, message: JsonValue): Promise<SendResult> {
  return rig.platform.broadcast.sendMessage(UI_CHANNEL, message, LOCAL);
}

function seed(rig: Rig, key: string, value: string): void {
  rig.platform.storage.setItem(`${STORAGE_PREFIX}${key}`, value);
}

function sheet(id: string, name = id, c = 1): VersionedRecord {
  return { k: `sheet:${id}`, d: { kind: 'pc', name, order: 0 }, c, a: 'mock-connection' };
}

function recordsOf(store: ProjectionStore): VersionedRecord[] {
  return [...store.$records.get().values()];
}

function namesOf(store: ProjectionStore): string[] {
  return recordsOf(store).map((record) => {
    const data = record.d;

    return data !== null && !Array.isArray(data) && Object.hasOwn(Object(data), 'name')
      ? String(Object(data).name)
      : '';
  });
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
  await pause(TIMING.projectionRequestRepeatMs);

  return view;
}

async function rejectionOf(view: WindowView, command: Command): Promise<string | undefined> {
  const sent = view.client.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command before sending it: ${sent.error}`);
  }

  await waitUntil(() => view.store.$rejection.get()?.id === sent.value);

  return view.store.$rejection.get()?.reason;
}

// What a rejected command must leave: the window's records and no delta at all.
function unchanged(rig: Rig, view: WindowView): Aftermath {
  return { records: recordsOf(view.store), deltas: deltas(rig).length };
}

describe('GM start', () => {
  test('puts every persisted record of the current generation in the replica', async () => {
    // #given
    const rig = createRig();

    seed(rig, 'sheet:a', JSON.stringify(sheet('a', 'Брок')));
    seed(rig, 'sheet:b', JSON.stringify(sheet('b', 'Лиза')));
    rig.platform.storage.setItem('mr1:other-room:0::sheet:c', JSON.stringify(sheet('c', 'Чужой')));

    await startEngine(rig);

    // #when
    const view = await openAndLoad(rig);

    // #then
    expect(namesOf(view.store)).toEqual(['Брок', 'Лиза']);
  });

  test('loads only the highest generation', async () => {
    // #given
    const rig = createRig();

    rig.platform.storage.setItem('mr1:mock-room:1:x:sheet:new', JSON.stringify(sheet('new')));
    seed(rig, 'sheet:old', JSON.stringify(sheet('old')));
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

    seed(rig, 'sheet:good', JSON.stringify(sheet('good')));
    seed(rig, 'sheet:bad', '{not json');
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

    seed(rig, 'sheet:bad', '{not json');
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'bad', kind: 'pc', name: 'Новый' });
    await waitUntil(() => deltas(rig).length === 1);
    await pause(5);

    // #then
    expect({
      notices: view.store.$notices.get(),
      stored: rig.platform.storage.getItem(`${STORAGE_PREFIX}sheet:bad`),
    }).toEqual({
      notices: [],
      stored: {
        ok: true,
        value:
          '{"k":"sheet:bad","d":{"kind":"pc","name":"Новый","order":0},"c":1,"a":"mock-connection"}',
      },
    });
  });
});

describe('stored record too large for one message', () => {
  test('is skipped, a valid record still loads and the notice shows', async () => {
    // #given
    const rig = createRig();

    seed(rig, 'sheet:big', JSON.stringify(sheet('big', 'x'.repeat(14900))));
    seed(rig, 'sheet:good', JSON.stringify(sheet('good')));
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
  test('never calls setItem, even after a command is applied', async () => {
    // #given
    const rig = createRig('PLAYER');
    const setItem = spyOn(rig.platform.storage, 'setItem');

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
    await waitUntil(() => recordsOf(view.store).length === 1);

    // #then
    expect({ calls: setItem.mock.calls.length, names: namesOf(view.store) }).toEqual({
      calls: 0,
      names: ['Брок'],
    });
  });
});

describe('open window', () => {
  test('receives a full projection echoing its nonce, then deltas', async () => {
    // #given
    const rig = createRig();

    seed(rig, 'sheet:a', JSON.stringify(sheet('a')));
    await startEngine(rig);

    const view = openWindow(rig, ids('nonce-1'));

    await waitUntil(() => recordsOf(view.store).length === 1);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'skel', kind: 'npc', name: 'Скелет' });
    await waitUntil(() => recordsOf(view.store).length === 2);

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
      records: [sheet('x')],
      notices: [],
    });

    // #then
    expect(recordsOf(view.store)).toEqual([]);
  });

  test('repeats its request until the first part arrives, for a window before the background', async () => {
    // #given
    const rig = createRig();
    const view = openWindow(rig);

    seed(rig, 'sheet:a', JSON.stringify(sheet('a')));
    await waitUntil(() => requests(rig).length >= 3);

    // #when
    await startEngine(rig);
    await waitUntil(() => recordsOf(view.store).length === 1);
    await pause(TIMING.projectionRequestRepeatMs * 2);

    const settled = requests(rig).length;

    await pause(TIMING.projectionRequestRepeatMs * 4);

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
      records: [sheet('x')],
      notices: [],
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

    const part = { t: 'projection', nonce: 'slow', engine: 'e', seq: 0, n: 3, notices: [] };

    // #when: the parts arrive 60 ms apart, each inside the 80 ms timeout.
    await post(rig, { ...part, i: 1, records: [sheet('a')] });
    await pause(60);
    await post(rig, { ...part, i: 2, records: [sheet('b')] });
    await pause(60);

    // #then
    expect(requests(rig).at(-1)?.nonce).toBe('slow');
  });
});

describe('repeated requests', () => {
  test('answers a repeat once while the first answer is still queued', async () => {
    // #given
    const rig = createRig();
    let openGate: () => void = () => undefined;

    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    const engine = await startReplicaEngine(
      rig.platform,
      createSendQueue(
        {
          sendMessage: async (channel, data, options) => {
            await gate;

            return rig.platform.broadcast.sendMessage(channel, data, options);
          },
        },
        TIMING,
      ),
    );

    cleanups.push(engine.stop);

    // #when
    await post(rig, { t: 'projection-request', nonce: 'same' });
    await post(rig, { t: 'projection-request', nonce: 'same' });
    openGate();
    await waitUntil(() => rig.wire.some((message) => message.t === 'projection'));
    await pause(TIMING.projectionRequestRepeatMs);

    // #then
    expect(rig.wire.filter((message) => message.t === 'projection').length).toBe(1);
  });

  test('delivers a request once while it waits under a rate limit across repeats', async () => {
    // #given: two 40 ms backoffs cover three repeat intervals of 25 ms.
    const rig = createRig();
    const platform = createMockPlatform(rig.bus);
    const slowBackoff = { ...TIMING, rateLimitBackoffStartMs: 40, rateLimitBackoffMaxMs: 40 };

    await startEngine(rig);
    platform.failNextSends([{ kind: 'rate-limited' }, { kind: 'rate-limited' }]);

    // #when
    const client = startReplicaClient(
      platform.broadcast,
      createSendQueue(platform.broadcast, slowBackoff),
      createProjectionStore(),
      TIMING,
    );

    cleanups.push(client.stop);
    await waitUntil(() => rig.wire.some((message) => message.t === 'projection'));
    await pause(TIMING.projectionRequestRepeatMs * 2);

    // #then
    expect(requests(rig).length).toBe(1);
  });
});

describe('split projection', () => {
  const part = { t: 'projection', nonce: 'split', engine: 'e', seq: 5, n: 2, notices: [] };

  test('buffers deltas until the set is complete and applies them in order', async () => {
    // #given
    const rig = createRig();
    const view = await openSplitWindow(rig);

    // #when
    await post(rig, { ...part, i: 1, records: [sheet('a')] });
    await post(rig, { t: 'delta', engine: 'e', seq: 6, records: [sheet('b')], notices: [] });

    const whileIncomplete = recordsOf(view.store);

    await post(rig, { ...part, i: 2, records: [sheet('c')] });

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

    await post(rig, { ...part, i: 1, records: [sheet('a')] });
    await post(rig, { t: 'delta', engine: 'e', seq: 5, records: [sheet('old')], notices: [] });

    // #when
    await post(rig, { ...part, i: 2, records: [sheet('c')] });

    // #then
    expect(namesOf(view.store)).toEqual(['a', 'c']);
  });

  test('assembles parts that arrive out of order in their own order', async () => {
    // #given
    const rig = createRig();
    const view = await openSplitWindow(rig);

    // #when
    await post(rig, { ...part, i: 2, records: [sheet('z')] });
    await post(rig, { ...part, i: 1, records: [sheet('a')] });

    // #then
    expect(namesOf(view.store)).toEqual(['a', 'z']);
  });

  test('asks for a new projection when a buffered delta skips a sequence number', async () => {
    // #given
    const rig = createRig();
    const view = openWindow(rig, ids('split', 'after-gap'));

    await waitUntil(() => requests(rig).length >= 1);
    await post(rig, { ...part, i: 1, records: [sheet('a')] });
    await post(rig, { t: 'delta', engine: 'e', seq: 7, records: [sheet('gap')], notices: [] });

    // #when
    await post(rig, { ...part, i: 2, records: [sheet('c')] });
    await waitUntil(() => requests(rig).at(-1)?.nonce === 'after-gap');

    // #then
    expect(namesOf(view.store)).toEqual(['a', 'c']);
  });

  test('counts the envelope, so records that nearly fill a part stay under 15000 bytes', async () => {
    // #given: two records of 7475 bytes, 14951 with their comma, so no envelope fits beside them.
    const rig = createRig();
    const name = 'x'.repeat(7475 - jsonByteLength(sheet('a', '')));

    seed(rig, 'sheet:a', JSON.stringify(sheet('a', name)));
    seed(rig, 'sheet:b', JSON.stringify(sheet('b', name)));
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
      seed(rig, `sheet:${id}`, JSON.stringify(sheet(id, 'ы'.repeat(2000))));
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
    });

    // #when
    await post(rig, { t: 'delta', engine: 'e', seq: 5, records: [], notices: [] });
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
      records: [sheet('kept')],
      notices: [],
    });

    const requestsAfterLoad = requests(rig).length;

    // #when
    await post(rig, { t: 'delta', engine: 'e', seq: 3, records: [sheet('dup')], notices: [] });
    await pause(TIMING.projectionRequestRepeatMs * 4);

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
  test('makes the replica compose d, mint c and emit a delta', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'skel', kind: 'npc', name: 'Скелет' });
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    expect(deltas(rig)[0]?.records).toEqual([
      { k: 'sheet:skel', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'mock-connection' },
    ]);
  });

  test('gives each new sheet of a kind the next order', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'b', kind: 'pc', name: 'Брок' });
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'l', kind: 'pc', name: 'Лиза' });
    view.client.sendCommand({ type: 'sheet-create', sheetId: 's', kind: 'npc', name: 'Скелет' });
    await waitUntil(() => deltas(rig).length === 3);

    // #then
    expect(deltas(rig).map((message) => message.records?.[0]?.d)).toEqual([
      { kind: 'pc', name: 'Брок', order: 0 },
      { kind: 'pc', name: 'Лиза', order: 1 },
      { kind: 'npc', name: 'Скелет', order: 0 },
    ]);
  });

  test('persists the new record for the GM', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'made', kind: 'pc', name: 'Брок' });
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    expect(rig.platform.storage.getItem(`${STORAGE_PREFIX}sheet:made`)).toEqual({
      ok: true,
      value:
        '{"k":"sheet:made","d":{"kind":"pc","name":"Брок","order":0},"c":1,"a":"mock-connection"}',
    });
  });

  test.each([
    ['k', { k: 'sheet:z' }],
    ['d', { d: { kind: 'pc', name: 'x', order: 0 } }],
    ['c', { c: 9 }],
    ['a', { a: 'conn' }],
  ])(
    'has no effect and does not throw when it holds a whole-record field %s',
    async (_f, extra) => {
      // #given
      const rig = createRig();

      await startEngine(rig);

      const view = await openAndLoad(rig);

      // #when
      await post(rig, {
        t: 'command',
        id: 'whole',
        command: { type: 'sheet-create', sheetId: 'whole', kind: 'pc', name: 'x', ...extra },
      });
      await pause(10);

      // #then
      expect({ records: recordsOf(view.store), deltas: deltas(rig).length }).toEqual({
        records: [],
        deltas: 0,
      });
    },
  );

  test('has one effect when one command id is delivered twice', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    const message = {
      t: 'command',
      id: 'once',
      command: { type: 'sheet-create', sheetId: 'once', kind: 'pc', name: 'x' },
    };

    // #when
    await post(rig, message);
    await post(rig, message);
    await pause(10);

    // #then
    expect({ records: recordsOf(view.store).length, deltas: deltas(rig).length }).toEqual({
      records: 1,
      deltas: 1,
    });
  });

  test('ignores an echo of the window-bound messages it sent itself', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    view.client.sendCommand({ type: 'sheet-create', sheetId: 'x', kind: 'pc', name: 'x' });
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

    await startEngine(rig);

    const first = await openAndLoad(rig);

    first.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
    await waitUntil(() => recordsOf(first.store).length === 1);
    first.client.stop();

    // #when
    const second = await openAndLoad(rig);

    // #then
    expect(recordsOf(second.store)).toEqual(recordsOf(first.store));
  });

  test('shows the same records after the background restarts over the same storage', async () => {
    // #given
    const rig = createRig();
    const engine = await startEngine(rig);
    const first = await openAndLoad(rig);

    first.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
    await waitUntil(() => recordsOf(first.store).length === 1);
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
    const engine = await startEngine(rig, ids('engine-1'));
    const view = await openAndLoad(rig);

    view.client.sendCommand({ type: 'sheet-create', sheetId: 'before', kind: 'pc', name: 'До' });
    await waitUntil(() => recordsOf(view.store).length === 1);
    engine.stop();

    await startEngine(rig, ids('engine-2'));

    const requestsBefore = requests(rig).length;

    // #when: the restarted engine counts from 1 again, so its delta must not look old.
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'after', kind: 'pc', name: 'После' });
    await waitUntil(() => requests(rig).length > requestsBefore);
    await waitUntil(() => recordsOf(view.store).length === 2);

    // #then
    expect(new Set(namesOf(view.store))).toEqual(new Set(['До', 'После']));
  });
});

describe('send queue through the engine', () => {
  test('waits out a rate limit on the way to a window and keeps the message', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    rig.platform.failNextSends([{ kind: 'rate-limited' }, { kind: 'rate-limited' }]);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
    await waitUntil(() => recordsOf(view.store).length === 1);

    // #then
    expect(namesOf(view.store)).toEqual(['Брок']);
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
    const sent = view.client.sendCommand({
      type: 'sheet-create',
      sheetId: 'long',
      kind: 'pc',
      name: 'ы'.repeat(8000),
    });

    await pause(10);

    // #then
    expect({ sent, newMessages: rig.wire.length - before }).toEqual({
      sent: { ok: false, error: 'too-large' },
      newMessages: 0,
    });
  });
});

describe('sheet-create', () => {
  test('stores the name without its surrounding spaces under the key of the sent id', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({
      type: 'sheet-create',
      sheetId: 'b-1_X',
      kind: 'pc',
      name: '  Брок ',
    });
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    expect(rig.platform.storage.getItem(`${STORAGE_PREFIX}sheet:b-1_X`)).toEqual({
      ok: true,
      value:
        '{"k":"sheet:b-1_X","d":{"kind":"pc","name":"Брок","order":0},"c":1,"a":"mock-connection"}',
    });
  });

  test('rejects an id whose sheet exists and leaves that sheet as it was', async () => {
    // #given
    const rig = createRig();

    seed(rig, 'sheet:taken', JSON.stringify(sheet('taken', 'Брок')));
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-create',
      sheetId: 'taken',
      kind: 'pc',
      name: 'Лиза',
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'sheet-exists',
      unchanged: { records: [sheet('taken', 'Брок')], deltas: 0 },
    });
  });

  test('rejects the id of a deleted sheet, so a tombstone never comes back', async () => {
    // #given
    const rig = createRig();
    const tombstone: VersionedRecord = { k: 'sheet:gone', d: null, c: 2, a: 'other' };

    seed(rig, 'sheet:gone', JSON.stringify(tombstone));
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-create',
      sheetId: 'gone',
      kind: 'pc',
      name: 'Брок',
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'sheet-exists',
      unchanged: { records: [tombstone], deltas: 0 },
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

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-create',
      sheetId,
      kind: 'pc',
      name: 'Брок',
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'invalid-sheet-id',
      unchanged: { records: [], deltas: 0 },
    });
  });

  test.each([
    ['empty', ''],
    ['only spaces', ' \t '],
    ['101 characters', 'ы'.repeat(101)],
  ])('rejects a name that is %s and stores nothing', async (_name, name) => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-create',
      sheetId: 'brok',
      kind: 'pc',
      name,
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'invalid-name',
      unchanged: { records: [], deltas: 0 },
    });
  });

  test('keeps applying commands after a rejection', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    await rejectionOf(view, { type: 'sheet-create', sheetId: 'a:b', kind: 'pc', name: 'Брок' });

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    expect(namesOf(view.store)).toEqual(['Брок']);
  });

  test('does not show another window a rejection it did not cause', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const sender = await openAndLoad(rig);
    const other = await openAndLoad(rig);

    // #when
    await rejectionOf(sender, { type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: ' ' });

    // #then
    expect(other.store.$rejection.get()).toBeNull();
  });
});

describe('sheet-rename', () => {
  test('changes the name, keeps the kind and the order, and persists it', async () => {
    // #given
    const rig = createRig();

    seed(
      rig,
      'sheet:brok',
      JSON.stringify({ k: 'sheet:brok', d: { kind: 'npc', name: 'Брок', order: 4 }, c: 3, a: 'z' }),
    );
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'sheet-rename', sheetId: 'brok', name: '  Лиза ' });
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    expect({
      window: recordsOf(view.store),
      stored: rig.platform.storage.getItem(`${STORAGE_PREFIX}sheet:brok`),
    }).toEqual({
      window: [
        { k: 'sheet:brok', d: { kind: 'npc', name: 'Лиза', order: 4 }, c: 4, a: 'mock-connection' },
      ],
      stored: {
        ok: true,
        value:
          '{"k":"sheet:brok","d":{"kind":"npc","name":"Лиза","order":4},"c":4,"a":"mock-connection"}',
      },
    });
  });

  test('rejects a sheet that does not exist and stores nothing', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-rename',
      sheetId: 'nobody',
      name: 'Брок',
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'unknown-sheet',
      unchanged: { records: [], deltas: 0 },
    });
  });

  test('rejects an id outside the nanoid alphabet before it looks for the sheet', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-rename',
      sheetId: 'a:b',
      name: 'Брок',
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'invalid-sheet-id',
      unchanged: { records: [], deltas: 0 },
    });
  });

  test('rejects a deleted sheet and keeps its tombstone', async () => {
    // #given
    const rig = createRig();
    const tombstone: VersionedRecord = { k: 'sheet:gone', d: null, c: 2, a: 'other' };

    seed(rig, 'sheet:gone', JSON.stringify(tombstone));
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, {
      type: 'sheet-rename',
      sheetId: 'gone',
      name: 'Брок',
    });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'deleted-sheet',
      unchanged: { records: [tombstone], deltas: 0 },
    });
  });

  test.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['101 characters', 'ы'.repeat(101)],
  ])('rejects a name that is %s and keeps the old one', async (_name, name) => {
    // #given
    const rig = createRig();

    seed(rig, 'sheet:brok', JSON.stringify(sheet('brok', 'Брок')));
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const rejection = await rejectionOf(view, { type: 'sheet-rename', sheetId: 'brok', name });

    // #then
    expect({ rejection, unchanged: unchanged(rig, view) }).toEqual({
      rejection: 'invalid-name',
      unchanged: { records: [sheet('brok', 'Брок')], deltas: 0 },
    });
  });
});

describe('write failure', () => {
  test('keeps the value in the replica and raises the notice', async () => {
    // #given
    const rig = createRig();
    silenceErrors();
    await startEngine(rig);

    const view = await openAndLoad(rig);

    rig.platform.setFailingStorageOperations(['write']);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
    await waitUntil(() => recordsOf(view.store).length === 1);

    // #then
    expect({ names: namesOf(view.store), notices: view.store.$notices.get() }).toEqual({
      names: ['Брок'],
      notices: ['local-save-failed'],
    });
  });

  test('clears the notice when the same key later writes', async () => {
    // #given
    const rig = createRig();
    silenceErrors();
    await startEngine(rig);

    const view = await openAndLoad(rig);

    rig.platform.setFailingStorageOperations(['write']);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'flaky', kind: 'pc', name: 'Первая' });
    await waitUntil(() => view.store.$notices.get().length === 1);
    rig.platform.setFailingStorageOperations([]);

    // #when
    view.client.sendCommand({ type: 'sheet-rename', sheetId: 'flaky', name: 'Вторая' });
    await waitUntil(() => view.store.$notices.get().length === 0);

    // #then
    expect(rig.platform.storage.getItem(`${STORAGE_PREFIX}sheet:flaky`)).toEqual({
      ok: true,
      value:
        '{"k":"sheet:flaky","d":{"kind":"pc","name":"Вторая","order":0},"c":2,"a":"mock-connection"}',
    });
  });

  test('keeps the notice while another failed or corrupt key remains', async () => {
    // #given
    const rig = createRig();
    silenceErrors();
    seed(rig, 'sheet:bad', '{not json');
    await startEngine(rig);

    const view = await openAndLoad(rig);

    rig.platform.setFailingStorageOperations(['write']);
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'flaky', kind: 'pc', name: 'Первая' });
    await waitUntil(() => recordsOf(view.store).length === 1);
    rig.platform.setFailingStorageOperations([]);

    // #when
    view.client.sendCommand({ type: 'sheet-rename', sheetId: 'flaky', name: 'Вторая' });
    await waitUntil(() => deltas(rig).length === 2);
    await pause(5);

    // #then
    expect(view.store.$notices.get()).toEqual(['local-save-failed']);
  });

  // The failure ends before the command, or `store.write` would refuse on its own read.
  test.each(['read', 'list'] as const)(
    'keeps the notice and writes nothing after a %s failure at start',
    async (operation) => {
      // #given
      const rig = createRig();

      silenceErrors();
      seed(rig, 'sheet:saved', JSON.stringify(sheet('saved')));
      rig.platform.setFailingStorageOperations([operation]);

      const setItem = spyOn(rig.platform.storage, 'setItem');

      await startEngine(rig);

      const view = await openAndLoad(rig);

      rig.platform.setFailingStorageOperations([]);

      // #when
      view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });
      await waitUntil(() => deltas(rig).length === 1);
      await pause(5);

      // #then
      expect({
        notices: view.store.$notices.get(),
        calls: setItem.mock.calls.length,
      }).toEqual({ notices: ['local-save-failed'], calls: 0 });
    },
  );
});

describe('preset upload', () => {
  test('stores the preset deflated and base64-encoded and sends it to the window', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'preset-upload', data: encodePreset(examplePreset()) });
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

    first.client.sendCommand({ type: 'preset-upload', data: encodePreset(examplePreset()) });
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
    const replacement: Preset = { v: 1, character: { sections: [] }, npc: { sections: [] } };

    view.client.sendCommand({ type: 'preset-upload', data: encodePreset(examplePreset()) });
    await waitUntil(() => deltas(rig).length === 1);

    // #when
    view.client.sendCommand({ type: 'preset-upload', data: encodePreset(replacement) });
    await waitUntil(() => deltas(rig).length === 2);

    // #then
    expect(storedPreset(rig)).toEqual({
      c: 2,
      a: 'mock-connection',
      preset: { v: 1, character: { sections: [] }, npc: { sections: [] } },
    });
  });

  test.each([
    ['bytes that are not deflated', btoa('plain text')],
    [
      'a preset that repeats an id, which the window would have refused',
      deflatedJson({
        v: 1,
        character: {
          sections: [{ rows: [[numberField('str'), numberField('str')]] }],
        },
        npc: { sections: [] },
      }),
    ],
    ['a newer preset', deflatedJson({ v: 2, character: { sections: [] }, npc: { sections: [] } })],
  ])('validates again and rejects %s, storing nothing', async (_name, data) => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    const sent = view.client.sendCommand({ type: 'preset-upload', data });

    await waitUntil(() => view.store.$rejection.get() !== null);

    // #then
    expect({
      rejection: view.store.$rejection.get(),
      records: recordsOf(view.store),
      deltas: deltas(rig).length,
      stored: rig.platform.storage.keys(),
    }).toEqual({
      rejection: { t: 'command-rejected', id: sent.ok ? sent.value : '', reason: 'invalid-preset' },
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
    const sent = view.client.sendCommand({ type: 'preset-upload', data });

    await waitUntil(() => view.store.$rejection.get() !== null);

    // #then
    expect({
      sent: sent.ok,
      rejection: view.store.$rejection.get()?.reason,
      stored: rig.platform.storage.keys(),
    }).toEqual({ sent: true, rejection: 'too-large', stored: { ok: true, value: [] } });
  });

  test('rejects an upload while a sheet exists and leaves the preset as it was', async () => {
    // #given
    const rig = createRig();

    seed(rig, 'sheet:saved', JSON.stringify(sheet('saved')));
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'preset-upload', data: encodePreset(examplePreset()) });
    await waitUntil(() => view.store.$rejection.get() !== null);

    // #then
    expect({
      reason: view.store.$rejection.get()?.reason,
      preset: view.store.$records.get().has('preset'),
      stored: rig.platform.storage.getItem(`${STORAGE_PREFIX}preset`),
    }).toEqual({ reason: 'sheets-exist', preset: false, stored: { ok: true, value: null } });
  });

  test('accepts an upload when the only sheet is deleted', async () => {
    // #given
    const rig = createRig();

    seed(rig, 'sheet:gone', JSON.stringify({ k: 'sheet:gone', d: null, c: 2, a: 'other' }));
    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'preset-upload', data: encodePreset(examplePreset()) });
    await waitUntil(() => deltas(rig).length === 1);

    // #then
    expect(storedPreset(rig)?.preset).toEqual(JSON.parse(EXAMPLE_PRESET_TEXT));
  });

  test('rejects an upload that a sheet-create reaches the replica before', async () => {
    // #given
    const rig = createRig();

    await startEngine(rig);

    const view = await openAndLoad(rig);

    // #when
    view.client.sendCommand({ type: 'sheet-create', sheetId: 'brok', kind: 'pc', name: 'Брок' });

    const upload = view.client.sendCommand({
      type: 'preset-upload',
      data: encodePreset(examplePreset()),
    });

    await waitUntil(() => view.store.$rejection.get() !== null);

    // #then
    expect({
      rejection: view.store.$rejection.get(),
      preset: view.store.$records.get().has('preset'),
    }).toEqual({
      rejection: {
        t: 'command-rejected',
        id: upload.ok ? upload.value : '',
        reason: 'sheets-exist',
      },
      preset: false,
    });
  });
});

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

function storedPreset(rig: Rig): { c: number; a: string; preset: JsonValue } | null {
  const text = rig.platform.storage.getItem(`${STORAGE_PREFIX}preset`);

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
      v: 1,
      character: { sections: [{ rows: [[{ kind: 'text', text: label }]] }] },
      npc: { sections: [] },
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
