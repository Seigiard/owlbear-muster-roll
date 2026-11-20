import { fixtureSnapshotCells, fixtureSnapshotBlocks } from '../../tests/support/block-fixtures';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import { inflateSync, strFromU8 } from 'fflate';
import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { blockDataSchema, recordSchema, type VersionedRecord } from '@/core/records';
import { Result } from 'better-result';
import type { SnapshotFile } from '@/core/snapshot-file';
import { encodeSnapshotFileData } from '@/core/snapshot-import';
import { encodeStateRecords } from '@/core/state-records';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import type { Wait } from '@/platform/send-queue';
import {
  copyValue,
  createRoomRig,
  heardOf,
  lastRequest,
  outcome,
  pause,
  rejection,
  send,
  shown,
  storedRecord,
  storageKey,
  sync,
  type RigClient,
  type RigOutcome,
  type RigRoom,
} from '../../tests/support/room-rig';

// The strings and keys of the 5.3 spec, written out by hand.
const DATA_REPLACED = 'Данные комнаты заменены';
const KEY = 'app.muster-roll/snapshot';
const OLD_PREFIX = storageKey('', { n: 0, a: '' });
const INITIAL: Generation = { n: 0, a: '' };
const FORMAT_ONE_GENERIC = storageKey('', INITIAL, { format: 1 }).slice(0, 4);
const CURRENT_ROOM_PREFIX = `${storageKey('', INITIAL).split(':').slice(0, 2).join(':')}:`;
const GHOST = 'ghost-gm';

const PRESET: Preset = {
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
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'token' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'number', id: 'str' }] },
                { cells: [{ kind: 'field', type: 'text', id: 'notes' }] },
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
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK = sheet('brok');

const BROK_STR: VersionedRecord = {
  k: 'blk:brok',
  d: { set: 'pc', order: 0, cells: { str: [10, 3, 'seed'] } },
  c: 3,
  a: 'seed',
  l: [1, 'seed'],
};

const ACL: VersionedRecord = { k: 'acl:brok:player-p', d: { name: 'Лиза' }, c: 2, a: 'seed' };
const PLINK: VersionedRecord = { k: 'plink:brok:player-p', d: { name: 'Лиза' }, c: 2, a: 'seed' };
const OLD_ROOM: readonly VersionedRecord[] = [PRESET_RECORD, BROK_STR, ACL, PLINK];

// One sheet of the sheet set, the NPC single sheet and a link, with one value the preset has no
// field for.
const FILE: SnapshotFile = {
  v: 4,
  type: 'muster-roll/snapshot',
  sheets: [
    {
      id: 'anya',
      set: 'pc',
      order: 0,
      cells: fixtureSnapshotCells({
        name: { name: 'Аня' },
        str: { str: 12, notes: 'Смелая' },
        old: { gone: 'x' },
      }),
      blocks: fixtureSnapshotBlocks({}),
    },
    {
      id: 'npc',
      cells: fixtureSnapshotCells({ hp: { hp: 7 } }),
      blocks: fixtureSnapshotBlocks({}),
    },
  ],
  links: [{ tokenId: 't1', sheetId: 'anya', cellId: 'token' }],
};

const DATA = encodeSnapshotFileData(FILE);

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  // Raw storage entries next to the seeded records, as another generation left them.
  entries?: Readonly<Record<string, string>>;
  timing?: Partial<Timing>;
  until?: 'loaded' | 'live';
  platform?: (platform: MockPlatform) => MockPlatform;
  // The engine's send queue pauses here between sends.
  hold?: Hold;
};

// Holds the engine's send queue in its pause after a send while held, so a commit waits in it.
type Hold = {
  wait: Wait;
  hold: () => void;
  release: () => void;
};

// Holds every room copy write until it opens, and counts the writes that reached it.
type WriteGate = {
  calls: number;
  open: () => void;
};

type Client = RigClient;

type Room = RigRoom;

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
type OpenableGate = {
  gate: WriteGate;
  opened: Promise<void>;
};

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
        if (key.startsWith(storageKey('', { n: 1, a: '' }).replace('::', ':'))) {
          writes += 1;

          if (writes > saved) {
            return Result.err({ operation: 'write', reason: 'quota' });
          }
        }

        return platform.storage.setItem(key, value);
      },
    },
  });
}

function sheet(id: string, order = 0): VersionedRecord {
  return { k: `blk:${id}`, d: { set: 'pc', order, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] };
}

function roomCopyGeneration(room: Room): JsonValue {
  const value = room.room.getMetadata()[KEY];

  if (value === undefined) {
    return null;
  }

  const data = String(Object(value).data);

  return JSON.parse(strFromU8(inflateSync(new Uint8Array(Buffer.from(data, 'base64'))))).g;
}

const roomRig = createRoomRig({
  waitLimitMs: 3000,
  seeded: OLD_ROOM,
  timing: {
    catchUpTimeoutMs: 150,
    stateAnswerDelayMaxMs: 5,
    incompleteRequestStartMs: 60,
    incompleteRequestMaxMs: 240,
  },
});

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  return roomRig.startClient(room, connectionId, {
    ...options,
    engine: { random: () => 0, dataReplaced: DATA_REPLACED },
    sendWait: options.hold?.wait,
  });
}

// The check's answer, or the reason it was refused.
async function check(client: Client, data = DATA): Promise<JsonValue> {
  return answerValue(await Promise.resolve(client.window.requestSnapshotCheck(data)));
}

// The import's answer, or the reason it was refused, with the digest of a check first.
async function importFile(client: Client, digest?: string, data = DATA): Promise<JsonValue> {
  const expected = digest ?? String(Object(await check(client, data)).digest);
  const id = send(client, { type: 'snapshot-import', data, expectedDigest: expected });
  await roomRig.waitUntil(() => outcome(client, id) !== undefined);

  return answerValue(outcome(client, id));
}

function answerValue(settled: RigOutcome | undefined): JsonValue {
  if (settled === undefined) {
    throw new Error('the window returned no command outcome');
  }

  if (settled.kind === 'answered') {
    return settled.answer ?? { kind: 'answered' };
  }

  if (settled.kind === 'refused') {
    return settled.rejection;
  }

  return { kind: 'timed-out' };
}

function shownKeys(client: Client): string[] {
  return [...client.store.$records.get().keys()].sort();
}

function storedKeys(client: Client, prefix = CURRENT_ROOM_PREFIX): string[] {
  return client.backing
    .keys()
    .filter((key) => key.startsWith(prefix))
    .sort();
}

function stateMessage(
  r: string,
  records: readonly VersionedRecord[],
  g: Generation,
  i = 1,
  n = 1,
): JsonValue {
  return { v: 4, g, t: 'state', r, i, n, records: encodeStateRecords(records) };
}

function newGenerationOf(connectionId: string): Generation {
  return { n: 1, a: connectionId };
}

// The imported records, as the importer writes them.
function importedRecord(connectionId: string, k: string, d: JsonValue): VersionedRecord {
  const record = fixtureRecord(k, d, 1, connectionId);

  return recordSchema.parse(
    k.startsWith('blk:') ? { ...record, l: [1, connectionId] } : { k, d, c: 1, a: connectionId },
  );
}

describe('check', () => {
  test('answers the count and digest of dropped values and writes nothing', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });
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
      answer: { count: 1, sheets: 0, digest: expect.any(String) },
      keys: keysBefore,
      heard: 0,
      copy: null,
      brok: BROK_STR,
    });
  });
  test('refuses a room with no preset', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [BROK], until: 'live' });
    // #when
    const answer = await check(gm);
    // #then
    expect(Object(answer).reason).toBe('preset-required');
  });
  test('refuses data that is no snapshot as a bad file', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });

    // #when
    const answer = await check(
      gm,
      encodeSnapshotFileData({
        ...FILE,
        links: [{ tokenId: 't', sheetId: 'x', cellId: '' }],
      }),
    );

    // #then
    expect(Object(answer).reason).toBe('invalid-snapshot');
  });
  test('refuses a snapshot placement whose record cannot fit one message', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });

    const data = encodeSnapshotFileData({
      ...FILE,
      sheets: [
        {
          id: 'huge',
          set: 'pc',
          order: 0,
          cells: fixtureSnapshotCells({ name: { name: 'x'.repeat(14900) } }),
          blocks: fixtureSnapshotBlocks({}),
        },
      ],
      links: [],
    });

    // #when
    const answer = await check(gm, data);
    // #then
    expect(answer).toMatchObject({ reason: 'too-large' });
  });
  test('refuses a snapshot check when the current preset record cannot be decoded', async () => {
    // #given
    const room = roomRig.openRoom();
    const unreadable: VersionedRecord = { ...PRESET_RECORD, d: btoa('not deflate') };

    const gm = await startClient(room, 'gm-a', {
      seeded: [unreadable, BROK],
      until: 'live',
    });

    // #when
    void gm.window.requestSnapshotCheck(DATA).catch(() => undefined);
    const id = gm.mintedIds.at(-1);
    await pause(50);
    // #then
    expect(
      gm.local.find(
        (message) => Object(message).id === id && Object(message).t === 'command-rejected',
      ),
    ).toMatchObject({ reason: 'preset-unreadable' });
  });
});

describe('import', () => {
  test('refuses a generation above the safe counter without changing the save notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const highest = { n: Number.MAX_SAFE_INTEGER, a: 'old' };

    const gm = await startClient(room, 'gm-a', {
      entries: {
        [storageKey('preset', highest)]: JSON.stringify(PRESET_RECORD),
        [storageKey(BROK.k, highest)]: JSON.stringify(BROK),
      },
      seeded: [],
      until: 'live',
    });

    // #when
    const digest = String(Object(await check(gm)).digest);
    const id = send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await pause(100);

    // #then
    const terminal = gm.local.filter(
      (message) =>
        Object(message).id === id &&
        (Object(message).t === 'command-rejected' || Object(message).t === 'snapshot-imported'),
    );

    expect({
      reason: Object(terminal[0]).reason,
      notices: gm.store.$notices.get(),
      resets: heardOf(room, 'gm-a', 'reset'),
      terminal: terminal.map((message) => Object(message).t),
    }).toEqual({
      reason: 'write-failed',
      notices: [],
      resets: [],
      terminal: ['command-rejected'],
    });
  });
  test('gives no terminal import result when the engine stops during the room-copy write', async () => {
    // #given
    const room = roomRig.openRoom();
    const { gate, opened } = createWriteGate();

    const gm = await startClient(room, 'gm-a', {
      until: 'live',
      platform: gatedWrites(gate, opened),
    });

    const digest = String(Object(await check(gm)).digest);
    const id = send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await roomRig.waitUntil(() => gate.calls === 1);
    // #when
    gm.engine.stop();
    gate.open();
    await pause(30);
    // #then
    expect(
      gm.local.filter(
        (message) =>
          Object(message).id === id &&
          (Object(message).t === 'command-rejected' || Object(message).t === 'snapshot-imported'),
      ),
    ).toEqual([]);
  });
  test('an importer that closes during its room-copy write names no new generation, and a player stays on the old one', async () => {
    // #given: an importer whose room-copy write waits and whose ping timer fires every 40 ms, a
    // live player, and a player who asks it.
    const room = roomRig.openRoom();
    const { gate, opened } = createWriteGate();

    const gm = await startClient(room, 'gm-a', {
      until: 'live',
      platform: gatedWrites(gate, opened),
      timing: { gmLinkTimeoutMs: 80 },
    });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
    });

    room.join('asker', 'PLAYER');
    const digest = String(Object(await check(gm)).digest);
    send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await roomRig.waitUntil(() => gate.calls === 1);
    const heard = room.heard.length;
    // #when: the asker pings and asks for state during the write, then the importer's page closes.
    room.post('asker', { v: 4, g: INITIAL, t: 'ping' });
    room.post('asker', { v: 4, g: INITIAL, t: 'state-request', r: 'asker-1' });
    await pause(100);
    gm.engine.stop();
    await pause(100);
    // #then
    expect({
      announced: room.heard
        .slice(heard)
        .filter((message) => message.from === 'gm-a' && Object(Object(message.data).g).n === 1)
        .map((message) => Object(message.data).t),
      player: sync(player).state,
      keys: shownKeys(player),
    }).toEqual({
      announced: [],
      player: 'live',
      keys: ['acl:brok:player-p', 'blk:brok', 'plink:brok:player-p', 'preset'],
    });
  });
  test('an importer answers a ping and a state request again once its room copy is written', async () => {
    // #given: an importer whose room-copy write waits, and a player who asks it.
    const room = roomRig.openRoom();
    const { gate, opened } = createWriteGate();

    const gm = await startClient(room, 'gm-a', {
      until: 'live',
      platform: gatedWrites(gate, opened),
    });

    room.join('asker', 'PLAYER');
    const digest = String(Object(await check(gm)).digest);
    send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await roomRig.waitUntil(() => gate.calls === 1);
    // #when: the copy is written and the reset is out, then the asker pings and asks for state.
    gate.open();
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    const generation = newGenerationOf('gm-a');
    room.post('asker', { v: 4, g: generation, t: 'ping' });
    room.post('asker', { v: 4, g: generation, t: 'state-request', r: 'asker-1' });
    await roomRig.waitUntil(
      () => heardOf(room, 'gm-a', 'alive').length > 0 && heardOf(room, 'gm-a', 'state').length > 0,
    );
    // #then
    expect({
      alive: Object(heardOf(room, 'gm-a', 'alive').at(-1)).g,
      state: Object(heardOf(room, 'gm-a', 'state').at(-1)).g,
    }).toEqual({ alive: generation, state: generation });
  });
  test('clears old digest mismatch evidence when a local import replaces the generation', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const gm = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 100, gmLinkTimeoutMs: 20 },
      until: 'live',
    });

    room.post(GHOST, { v: 4, g: INITIAL, t: 'alive', digest: 0 });
    await pause(11);
    // #when
    await importFile(gm);
    await pause(11);
    room.post(GHOST, { v: 4, g: newGenerationOf('gm-a'), t: 'alive', digest: 0 });
    await pause(20);
    // #then
    expect(sync(gm).state).toBe('live');
  });
  test('answers a ping with the replacement replica digest after import', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    room.post(GHOST, { v: 4, g: INITIAL, t: 'ping' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'alive').length === 1);
    // #when
    await importFile(gm);
    room.post(GHOST, { v: 4, g: newGenerationOf('gm-a'), t: 'ping' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'alive').length === 2);
    // #then
    expect(heardOf(room, 'gm-a', 'alive').map((message) => Object(message).digest)).toEqual([
      1098523264, 1362206446,
    ]);
  });
  test('answers a ping with the empty replica digest after a wipe', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    room.post(GHOST, { v: 4, g: INITIAL, t: 'ping' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'alive').length === 1);
    // #when
    const id = send(gm, { type: 'wipe' });
    await roomRig.waitUntil(() => outcome(gm, id) !== undefined);
    room.post(GHOST, { v: 4, g: newGenerationOf('gm-a'), t: 'ping' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'alive').length === 2);
    // #then
    expect(heardOf(room, 'gm-a', 'alive').map((message) => Object(message).digest)).toEqual([
      1098523264, 0,
    ]);
  });
  test('drops a file sheet of no template of the preset with its values and counts it', async () => {
    // #given: a sheet of a sheet set the preset does not have, holding one value.
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });

    const data = encodeSnapshotFileData({
      ...FILE,
      sheets: [
        ...FILE.sheets,
        {
          id: 'ghost',
          set: 'crew',
          order: 0,
          cells: fixtureSnapshotCells({ hp: { hp: 3 } }),
          blocks: fixtureSnapshotBlocks({}),
        },
      ],
    });

    // #when
    const checked = await check(gm, data);
    await importFile(gm, String(Object(checked).digest), data);
    await roomRig.waitUntil(() => shown(gm, 'blk:anya') !== undefined);
    // #then: `gone` of Аня and `hp` of the dropped sheet.
    expect({
      counts: [Object(checked).count, Object(checked).sheets],
      ghost: shownKeys(gm).filter((key) => key.includes('ghost')),
    }).toEqual({ counts: [2, 1], ghost: [] });
  });
  test('does not write over a room copy of a newer build, and raises the new-version notice', async () => {
    // #given: the copy appears after catch-up, so only the import reads it.
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    const newer = { v: 5, data: 'from a newer build' };
    room.room.setMetadata({ [KEY]: newer });
    // #when
    await importFile(gm);
    await roomRig.waitUntil(() => gm.store.$notices.get().includes('new-version'));
    // #then
    expect(room.room.getMetadata()[KEY]).toEqual(newer);
  });
  test('writes over a room copy of an older format, and the older-format notice goes', async () => {
    // #given
    const room = roomRig.openRoom();
    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [], 1) });
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    const before = gm.store.$notices.get();
    // #when
    await importFile(gm);
    await roomRig.waitUntil(() => Object(room.room.getMetadata()[KEY]).v === 4);
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
      v: 4,
      copy: newGenerationOf('gm-a'),
      notices: [],
    });
  });
  test('saves the new generation, writes its room copy and only then sends reset', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    const generation = newGenerationOf('gm-a');
    let savedAtCopy: string[] = [];
    roomRig.cleanup(
      room.room.onMetadataChange(() => {
        savedAtCopy = storedKeys(gm, storageKey('', { n: 1, a: 'gm-a' }));
      }),
    );
    // #when
    const answer = await importFile(gm);
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    // #then
    expect({
      answer: Object(answer).kind,
      events: room.events.filter((event) => event === 'copy' || event === 'reset'),
      savedAtCopy: savedAtCopy.length > 0,
      reset: heardOf(room, 'gm-a', 'reset'),
      copy: roomCopyGeneration(room),
    }).toEqual({
      answer: 'answered',
      events: ['copy', 'reset'],
      savedAtCopy: true,
      reset: [{ v: 4, g: generation, t: 'reset' }],
      copy: generation,
    });
  });
  test('replaces the data with records at c: 1, the current preset and the links, with no access or owner', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    await importFile(gm);
    await roomRig.waitUntil(() => shown(gm, 'blk:anya') !== undefined);
    // #then
    expect({
      keys: shownKeys(gm),
      preset: shown(gm, 'preset'),
      str: shown(gm, 'blk:anya'),
      link: shown(gm, 'link:t1'),
    }).toEqual({
      keys: ['blk:anya', 'blk:npc', 'link:t1', 'preset'],
      preset: importedRecord('gm-a', 'preset', PRESET_RECORD.d),
      str: importedRecord('gm-a', 'blk:anya', {
        set: 'pc',
        order: 0,
        cells: { name: 'Аня', str: 12, notes: 'Смелая' },
      }),
      link: importedRecord('gm-a', 'link:t1', { s: 'anya', c: 'token' }),
    });
  });
  test('keeps only the new generation in storage once it is complete', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    await importFile(gm);
    await roomRig.waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);
    // #then
    expect(storedKeys(gm)).toEqual([
      storageKey('#generation', { n: 1, a: 'gm-a' }),
      storageKey('blk:anya', { n: 1, a: 'gm-a' }),
      storageKey('blk:npc', { n: 1, a: 'gm-a' }),
      storageKey('link:t1', { n: 1, a: 'gm-a' }),
      storageKey('preset', { n: 1, a: 'gm-a' }),
    ]);
  });
  test("removes this room's keys of an older format once complete, and keeps another room's", async () => {
    // #given
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      entries: {
        [storageKey('preset', INITIAL, { format: 1 })]: '{"k":"preset","d":"x","c":1,"a":"seed"}',
        [storageKey('#incomplete', { n: 2, a: 'gm-a' }, { format: 1 })]: '1',
        [storageKey('preset', INITIAL, { roomId: 'other-room', format: 1 })]:
          '{"k":"preset","d":"x","c":1,"a":"seed"}',
      },
      until: 'live',
    });

    // #when
    await importFile(gm);
    await roomRig.waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);
    // #then
    expect(storedKeys(gm, FORMAT_ONE_GENERIC)).toEqual([
      storageKey('preset', INITIAL, { roomId: 'other-room', format: 1 }),
    ]);
  });
  test('asks again with the new count when the dropped values changed since the check', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });
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
    const room = roomRig.openRoom();

    // The marker and two records save, then the storage is full.
    const gm = await startClient(room, 'gm-a', {
      until: 'live',
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
      brok: BROK_STR,
      resets: [],
      copy: null,
    });
  });
  test('the notice of a failed import save goes with the next record that saves', async () => {
    // #given
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      until: 'live',
      platform: failingNewGeneration(3),
    });

    await importFile(gm);
    await roomRig.waitUntil(() => gm.store.$notices.get().length === 1);
    // #when
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 16,
    });
    // #then
    await roomRig.waitUntil(() => gm.store.$notices.get().length === 0);
    expect(blockDataSchema.parse(storedRecord(gm, BROK_STR.k, INITIAL)?.d).cells.str?.[0]).toBe(16);
  });
  test('an edit held in the outbox goes out under the old generation, before reset', async () => {
    // #given
    const room = roomRig.openRoom();
    const hold = createHold();
    const gm = await startClient(room, 'gm-a', { until: 'live', hold });
    const digest = String(Object(await check(gm)).digest);
    hold.hold();
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 16,
    });
    await roomRig.waitUntil(
      () =>
        blockDataSchema.safeParse(storedRecord(gm, BROK_STR.k, INITIAL)?.d).data?.cells.str?.[0] ===
        16,
    );
    // #when
    send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await roomRig.waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);
    hold.release();
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
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
    const room = roomRig.openRoom();
    const { gate, opened } = createWriteGate();

    const gm = await startClient(room, 'gm-a', {
      until: 'live',
      platform: gatedWrites(gate, opened),
    });

    const digest = String(Object(await check(gm)).digest);
    const imported = send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await roomRig.waitUntil(() => gate.calls === 1);

    // #when
    const edit = send(gm, {
      type: 'field-patch',
      sheetId: 'anya',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 5,
    });

    await roomRig.waitUntil(() => outcome(gm, edit) !== undefined);
    gate.open();
    await roomRig.waitUntil(() => outcome(gm, imported) !== undefined);
    // #then
    expect({
      edit: rejection(gm, edit),
      imported: outcome(gm, imported)?.kind,
      commits: heardOf(room, 'gm-a', 'commit').filter(
        (one) => JSON.stringify(Object(one).g) === JSON.stringify(newGenerationOf('gm-a')),
      ),
    }).toEqual({ edit: 'importing', imported: 'answered', commits: [] });
  });
  test('a linked token deleted from the scene during the import loses its link once the import ends', async () => {
    // #given: the file links t1, and the open scene holds t1.
    const room = roomRig.openRoom();
    const { gate, opened } = createWriteGate();
    room.room.setScene({ ready: true, itemIds: ['t1', 'map'], labels: {} }, 'items');

    const gm = await startClient(room, 'gm-a', {
      until: 'live',
      platform: gatedWrites(gate, opened),
    });

    const digest = String(Object(await check(gm)).digest);
    const imported = send(gm, { type: 'snapshot-import', data: DATA, expectedDigest: digest });
    await roomRig.waitUntil(() => gate.calls === 1);
    gm.platform.removeSceneItems(['t1']);
    await pause(20);
    const during = shown(gm, 'link:t1')?.d;
    // #when
    gate.open();
    await roomRig.waitUntil(() => outcome(gm, imported) !== undefined);
    await roomRig.waitUntil(() => shown(gm, 'link:t1')?.d === null);
    // #then
    expect({
      during,
      stored: storedRecord(gm, 'link:t1', { n: 1, a: 'gm-a' }),
      rejections: gm.local.filter((message) => Object(message).t === 'command-rejected'),
    }).toEqual({
      during: { s: 'anya', c: 'token' },
      stored: { k: 'link:t1', d: null, c: 2, a: 'gm-a' },
      rejections: [],
    });
  });
  test('an import that finds a copy of a higher generation adopts it, overwrites nothing and sends no reset', async () => {
    // #given: this client missed the change event of that copy.
    const room = roomRig.openRoom();
    const higher: Generation = { n: 5, a: 'zz' };
    const mira = importedRecord('zz', 'blk:mira', { set: 'pc', order: 0 });

    const gm = await startClient(room, 'gm-a', {
      until: 'live',
      platform: (platform) => ({
        ...platform,
        metadata: { ...platform.metadata, onMetadataChange: () => () => undefined },
      }),
    });

    const digest = String(Object(await check(gm)).digest);
    room.room.setMetadata({ [KEY]: copyValue(higher, [PRESET_RECORD, mira]) });
    // #when
    const answer = await importFile(gm, digest);
    await roomRig.waitUntil(() => shown(gm, mira.k) !== undefined);
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
      keys: ['blk:mira', 'preset'],
    });
  });
  test('two imports at once end with every client on the higher one', async () => {
    // #given: both copies wait, so each import read the room before either wrote.
    const room = roomRig.openRoom();
    const { gate, opened } = createWriteGate();

    const first = await startClient(room, 'gm-a', {
      until: 'live',
      platform: gatedWrites(gate, opened),
    });

    const second = await startClient(room, 'gm-b', {
      until: 'live',
      platform: gatedWrites(gate, opened),
    });

    const digest = String(Object(await check(first)).digest);

    // #when
    const ids = [first, second].map((client) =>
      send(client, { type: 'snapshot-import', data: DATA, expectedDigest: digest }),
    );

    await roomRig.waitUntil(() => gate.calls === 2);
    gate.open();
    await roomRig.waitUntil(() =>
      ids.every((id, index) => outcome([first, second][index] ?? first, id) !== undefined),
    );
    await roomRig.waitUntil(() =>
      [first, second].every(
        (client) => sync(client).state === 'live' && storedKeys(client, OLD_PREFIX).length === 0,
      ),
    );
    await roomRig.waitUntil(() => storedRecord(first, 'blk:anya', { n: 1, a: 'gm-b' }) !== null);
    await roomRig.waitUntil(() => shown(first, 'blk:anya') !== undefined);
    // #then
    expect({
      first: storedKeys(first).every((key) => key.startsWith(storageKey('', { n: 1, a: 'gm-b' }))),
      second: storedKeys(second).every((key) =>
        key.startsWith(storageKey('', { n: 1, a: 'gm-b' })),
      ),
      shown: shownKeys(first),
      winner: outcome(second, ids[1] ?? '')?.kind,
    }).toEqual({
      first: true,
      second: true,
      shown: shownKeys(second),
      winner: 'answered',
    });
  });
  test('a copy over the limit still finishes the import, sends reset, shows the notice and removes the old copy', async () => {
    // #given
    const room = roomRig.openRoom();
    room.room.setMetadata({
      [KEY]: copyValue(INITIAL, OLD_ROOM),
      'other.extension/data': 'x'.repeat(15200),
    });
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    const answer = await importFile(gm);
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    await roomRig.waitUntil(() => room.room.getMetadata()[KEY] === undefined);
    await roomRig.waitUntil(() => gm.store.$notices.get().length > 0);
    // #then
    expect({
      answer: Object(answer).kind,
      notices: gm.store.$notices.get(),
      roomCopy: gm.store.$roomCopy.get().state,
    }).toEqual({
      answer: 'answered',
      notices: ['room-copy-not-saved'],
      roomCopy: 'failed',
    });
  });
  test('a player sees the imported data, read-only and with no owner', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
    });

    await roomRig.waitUntil(() => shown(player, ACL.k) !== undefined);
    // #when
    await importFile(gm);
    await roomRig.waitUntil(
      () => shown(player, 'blk:anya') !== undefined && sync(player).state === 'live',
    );

    const id = send(player, {
      type: 'field-patch',
      sheetId: 'anya',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 5,
    });

    await roomRig.waitUntil(() => outcome(player, id) !== undefined);
    // #then
    expect({
      keys: shownKeys(player).filter((key) => key.startsWith('acl:') || key.startsWith('plink:')),
      brok: shown(player, BROK.k) ?? null,
      edit: rejection(player, id),
      notified: player.platform.shownNotifications(),
    }).toEqual({ keys: [], brok: null, edit: 'not-allowed', notified: [DATA_REPLACED] });
  });
});

describe('adoption', () => {
  test('leaves catch-up on its deadline after a room copy completes adoption', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const gm = await startClient(room, 'gm-b', {
      timing: { catchUpTimeoutMs: 50, incompleteRequestStartMs: 1000 },
      until: 'live',
    });

    // #when
    room.room.setMetadata({
      [KEY]: copyValue(newGenerationOf('gm-a'), [
        PRESET_RECORD,
        importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 }),
      ]),
    });
    await roomRig.waitUntil(() => sync(gm).state === 'catching-up');
    const during = sync(gm).state;
    await pause(100);
    // #then
    expect({ during, after: sync(gm).state }).toEqual({
      during: 'catching-up',
      after: 'live',
    });
  });
  test('does not stage a lower room copy into an adoption already targeting a higher generation', async () => {
    // #given
    const room = roomRig.openRoom();
    const lower: Generation = { n: 1, a: GHOST };
    const higher: Generation = { n: 2, a: GHOST };
    const mira = importedRecord(GHOST, 'blk:mira', { set: 'pc', order: 0 });
    const anya = importedRecord(GHOST, 'blk:anya', { set: 'pc', order: 1 });
    room.join(GHOST, 'GM');
    const gm = await startClient(room, 'gm-b', { until: 'live' });
    const asked = heardOf(room, 'gm-b', 'state-request').length;
    room.post(GHOST, { v: 4, g: higher, t: 'reset' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);
    room.room.setMetadata({ [KEY]: copyValue(lower, [PRESET_RECORD, mira]) });
    await pause(30);
    // #when
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [PRESET_RECORD, anya], higher));
    await roomRig.waitUntil(() => sync(gm).state === 'live');
    // #then
    expect(shownKeys(gm)).toEqual(['blk:anya', 'preset']);
  });
  test('does not save an oversized record from a compressed higher-generation room copy', async () => {
    // #given
    const room = roomRig.openRoom();
    const generation = newGenerationOf('gm-a');

    const huge: VersionedRecord = {
      k: 'blk:brok',
      d: { order: 0, cells: { name: ['x'.repeat(14900), 1, 'gm-a'] } },
      c: 1,
      a: 'gm-a',
      l: [1, 'seed'],
    };

    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, BROK, huge]) });

    // #when
    const gm = roomRig.createClient(room, 'gm-b', {
      engine: { random: () => 0, dataReplaced: DATA_REPLACED },
    });

    await gm.startEngine();
    await pause(100);
    // #then
    expect(JSON.parse(gm.backing.get(storageKey(huge.k, generation)) ?? 'null')).toEqual(BROK);
  });
  test('persists the next edit under the generation adopted from the room copy', async () => {
    // #given
    const room = roomRig.openRoom();
    const generation = newGenerationOf('gm-a');
    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, BROK]) });
    const gm = await startClient(room, 'gm-b', { until: 'live' });
    // #when
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 19,
    });
    await pause(50);
    // #then
    expect({
      adopted: storedRecord(gm, BROK_STR.k, generation),
      old: storedRecord(gm, BROK_STR.k, INITIAL) ?? null,
    }).toEqual({
      adopted: fixtureRecord(BROK_STR.k, { set: 'pc', order: 0, cells: { str: 19 } }, 2, 'gm-b'),
      old: null,
    });
  });
  test('a second GM adopts on reset alone: it drops its old data, saves the new and notifies', async () => {
    // #given: the copy cannot be saved, so only reset and catch-up bring the data.
    const room = roomRig.openRoom();
    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(15400) });
    const importer = await startClient(room, 'gm-a', { until: 'live' });
    const other = await startClient(room, 'gm-b', { until: 'live' });
    // #when
    await importFile(importer);
    await roomRig.waitUntil(
      () => shown(other, 'blk:anya') !== undefined && sync(other).state === 'live',
    );
    // #then
    expect({
      keys: shownKeys(other),
      notified: other.platform.shownNotifications(),
      stored: storedKeys(other).every((key) => key.startsWith(storageKey('', { n: 1, a: 'gm-a' }))),
      str: storedRecord(other, 'blk:anya', { n: 1, a: 'gm-a' }),
    }).toEqual({
      keys: shownKeys(importer),
      notified: [DATA_REPLACED],
      stored: true,
      str: importedRecord('gm-a', 'blk:anya', {
        set: 'pc',
        order: 0,
        cells: { name: 'Аня', str: 12, notes: 'Смелая' },
      }),
    });
  });
  test('a GM adopts from another message of a higher generation and drops its waiting intents', async () => {
    // #given: a GM that never answers keeps this client in catch-up with an intent queued.
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const gm = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 2000 } });

    const intent = send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 11,
    });

    const generation = newGenerationOf(GHOST);
    const anya = importedRecord(GHOST, 'blk:anya', { set: 'pc', order: 0 });
    await roomRig.waitUntil(
      () => blockDataSchema.safeParse(shown(gm, BROK_STR.k)?.d).data?.cells.str?.[0] === 11,
    );
    const asked = heardOf(room, 'gm-b', 'state-request').length;
    // #when
    room.post(GHOST, { v: 4, g: generation, t: 'alive', digest: 1 });
    await roomRig.waitUntil(() => outcome(gm, intent) !== undefined);
    await roomRig.waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [PRESET_RECORD, anya], generation));
    await roomRig.waitUntil(() => sync(gm).state === 'live');
    // #then
    expect({
      intent: rejection(gm, intent),
      outcome: outcome(gm, intent),
      answers: gm.local.filter(
        (message) => Object(message).t === 'command-rejected' && Object(message).id === intent,
      ).length,
      keys: shownKeys(gm),
      notified: gm.platform.shownNotifications(),
    }).toEqual({
      intent: 'data-replaced',
      outcome: {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: intent, reason: 'data-replaced' },
      },
      answers: 1,
      keys: ['blk:anya', 'preset'],
      notified: [DATA_REPLACED],
    });
  });
  test('an adopting client keeps its request when a GM of a still higher generation answers it', async () => {
    // #given: the client adopts the ghost's first import and asks for its state.
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const gm = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 2000 } });
    room.post(GHOST, { v: 4, g: newGenerationOf(GHOST), t: 'alive', digest: 1 });
    await roomRig.waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > 1);
    const asked = heardOf(room, 'gm-b', 'state-request').length;
    const second: Generation = { n: 2, a: GHOST };
    const anya = importedRecord(GHOST, 'blk:anya', { set: 'pc', order: 0 });
    // #when: the ghost imports again and answers that request from the second import.
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [PRESET_RECORD, anya], second));
    await roomRig.waitUntil(
      () => sync(gm).state === 'live' || heardOf(room, 'gm-b', 'state-request').length > asked,
    );
    // #then
    expect({
      state: sync(gm).state,
      requests: heardOf(room, 'gm-b', 'state-request').length - asked,
      keys: shownKeys(gm),
      stored: storedKeys(gm),
    }).toEqual({
      state: 'live',
      requests: 0,
      keys: ['blk:anya', 'preset'],
      stored: [
        storageKey('#generation', second),
        storageKey('blk:anya', second),
        storageKey('preset', second),
      ],
    });
  });
  test('a live GM adopts a room copy of a higher generation at once', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-b', { until: 'live' });
    const generation = newGenerationOf('gm-a');
    const anya = importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 });
    // #when
    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, anya]) });
    await roomRig.waitUntil(() => shown(gm, anya.k) !== undefined);
    await roomRig.waitUntil(() => sync(gm).state === 'live');
    // #then
    expect({
      keys: shownKeys(gm),
      stored: storedKeys(gm),
      notified: gm.platform.shownNotifications(),
    }).toEqual({
      keys: ['blk:anya', 'preset'],
      stored: [
        storageKey('#generation', { n: 1, a: 'gm-a' }),
        storageKey('blk:anya', { n: 1, a: 'gm-a' }),
        storageKey('preset', { n: 1, a: 'gm-a' }),
      ],
      notified: [DATA_REPLACED],
    });
  });
  test('a generation replacement starts a fresh window projection stream', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-b', { until: 'live' });

    const before = new Set(
      gm.local
        .filter((message) => Object(message).t === 'projection' || Object(message).t === 'delta')
        .map((message) => String(Object(message).engine)),
    );

    // #when
    room.room.setMetadata({
      [KEY]: copyValue(newGenerationOf('gm-a'), [
        PRESET_RECORD,
        importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 }),
      ]),
    });
    await roomRig.waitUntil(() => shown(gm, 'blk:anya') !== undefined);

    const after = new Set(
      gm.local
        .filter((message) => Object(message).t === 'projection' || Object(message).t === 'delta')
        .map((message) => String(Object(message).engine)),
    );

    // #then
    expect({ before: before.size, after: after.size }).toEqual({ before: 1, after: 2 });
  });
  test('while incomplete it keeps its data, writes no copy, answers nothing and asks again with backoff', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    room.join('asker', 'PLAYER');
    const gm = await startClient(room, 'gm-b', { until: 'live' });
    let copyWrites = 0;
    roomRig.cleanup(
      room.room.onMetadataChange(() => {
        copyWrites += 1;
      }),
    );
    const asked = heardOf(room, 'gm-b', 'state-request').length;
    // #when
    room.post(GHOST, { v: 4, g: newGenerationOf(GHOST), t: 'reset' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);
    const started = Date.now();
    room.post('asker', { v: 4, g: INITIAL, t: 'state-request', r: 'asker-r' });
    room.post('asker', { v: 4, g: INITIAL, t: 'ping' });
    gm.engine.pageHidden();
    // Past the catch-up timeout, with requests again after 60, 120, 240 and 240 ms: the cap.
    await roomRig.waitUntil(() => heardOf(room, 'gm-b', 'state-request').length === asked + 5);
    const waited = Date.now() - started;

    const times = room.heard
      .filter((one) => one.from === 'gm-b' && Object(one.data).t === 'state-request')
      .map((one) => one.at);

    const lastGap = (times.at(-1) ?? 0) - (times.at(-2) ?? 0);
    // #then
    expect({
      sync: sync(gm).state,
      brok: shown(gm, BROK.k),
      stored: storedRecord(gm, BROK.k, INITIAL),
      copyWrites,
      answers: heardOf(room, 'gm-b', 'state').length + heardOf(room, 'gm-b', 'alive').length,
      backedOff: waited >= 60 + 120 + 240 + 240 - 20,
      capped: lastGap >= 240 - 20 && lastGap < 240 * 1.5,
    }).toEqual({
      sync: 'catching-up',
      brok: BROK_STR,
      stored: BROK_STR,
      copyWrites: 0,
      answers: 0,
      backedOff: true,
      capped: true,
    });
  });
  test('a partial answer does not complete it, and all parts of one responder do', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const gm = await startClient(room, 'gm-b', { until: 'live' });
    const generation = newGenerationOf(GHOST);
    const anya = importedRecord(GHOST, 'blk:anya', { set: 'pc', order: 0 });
    const asked = heardOf(room, 'gm-b', 'state-request').length;
    room.post(GHOST, { v: 4, g: generation, t: 'reset' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);
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
    await roomRig.waitUntil(() => sync(gm).state === 'live');
    // #then
    expect({ partial, keys: shownKeys(gm), old: storedKeys(gm, OLD_PREFIX) }).toEqual({
      partial: { sync: 'catching-up', anya: null, brok: BROK_STR },
      keys: ['blk:anya', 'preset'],
      old: [],
    });
  });
  test('a player drops its waiting edits with the notification', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
    });

    await roomRig.waitUntil(() => shown(player, ACL.k) !== undefined);
    gm.engine.stop();
    send(player, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 11,
    });
    await roomRig.waitUntil(() => player.store.$pending.get().size === 1);
    // #when
    room.post(GHOST, { v: 4, g: newGenerationOf(GHOST), t: 'reset' });
    room.join(GHOST, 'GM');
    room.post(GHOST, { v: 4, g: newGenerationOf(GHOST), t: 'reset' });
    await roomRig.waitUntil(() => player.store.$pending.get().size === 0);
    // #then
    expect(player.platform.shownNotifications()).toEqual([DATA_REPLACED]);
  });
});

describe('adoption guards', () => {
  test('keeps an unreadable-storage notice when a player-style adoption replaces the replica', async () => {
    // #given
    const room = roomRig.openRoom();
    const generation = newGenerationOf('gm-a');
    const anya = importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 });

    const gm = await startClient(room, 'gm-b', {
      platform: (platform) => {
        platform.setFailingStorageOperations(['list']);

        return platform;
      },
      until: 'live',
    });

    gm.platform.setFailingStorageOperations([]);
    // #when
    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, anya]) });
    await roomRig.waitUntil(() => shown(gm, anya.k) !== undefined);
    // #then
    expect(gm.store.$notices.get()).toEqual(['local-save-failed']);
  });
  test('clears an obsolete corrupt-record notice when a higher generation replaces the replica', async () => {
    // #given
    const room = roomRig.openRoom();
    const generation = newGenerationOf('gm-a');
    const anya = importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 });

    const gm = await startClient(room, 'gm-b', {
      entries: { [storageKey('blk:bad')]: '{not json' },
      until: 'live',
    });

    expect(gm.store.$notices.get()).toEqual(['local-save-failed']);
    // #when
    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, anya]) });
    await roomRig.waitUntil(() => shown(gm, anya.k) !== undefined);
    // #then
    expect(gm.store.$notices.get()).toEqual([]);
  });
  test('a commit held in the outbox when adoption starts never goes out under the new generation', async () => {
    // #given
    const room = roomRig.openRoom();
    const hold = createHold();
    const gm = await startClient(room, 'gm-b', { until: 'live', hold });
    const anya = importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 });
    hold.hold();
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 15,
    });
    await roomRig.waitUntil(
      () =>
        blockDataSchema.safeParse(storedRecord(gm, BROK_STR.k, INITIAL)?.d).data?.cells.str?.[0] ===
        15,
    );
    // #when
    room.room.setMetadata({ [KEY]: copyValue(newGenerationOf('gm-a'), [PRESET_RECORD, anya]) });
    await roomRig.waitUntil(() => storedKeys(gm, OLD_PREFIX).length === 0);
    hold.release();
    await roomRig.waitUntil(() => sync(gm).state === 'live');
    await pause(30);
    // #then
    expect(
      heardOf(room, 'gm-b', 'commit').filter((one) => JSON.stringify(one).includes(BROK_STR.k)),
    ).toEqual([]);
  });
  test('an adopter whose save fails keeps its old generation, shows the notice and stays incomplete', async () => {
    // #given
    const room = roomRig.openRoom();
    const importer = await startClient(room, 'gm-a', { until: 'live' });

    const other = await startClient(room, 'gm-b', {
      until: 'live',
      platform: failingNewGeneration(1),
    });

    const keysBefore = storedKeys(other);
    // #when
    await importFile(importer);
    await roomRig.waitUntil(() => other.store.$notices.get().includes('local-save-failed'));
    await pause(30);
    // #then
    expect({
      keys: storedKeys(other),
      sync: sync(other).state,
      brok: shown(other, BROK.k),
    }).toEqual({ keys: keysBefore, sync: 'catching-up', brok: BROK_STR });
  });
  test('a client with no data adopts with no notification', async () => {
    // #given
    const room = roomRig.openRoom();
    const importer = await startClient(room, 'gm-a', { until: 'live' });
    await importFile(importer);
    await roomRig.waitUntil(() => roomCopyGeneration(room) !== null);
    // #when
    const fresh = await startClient(room, 'gm-c', { seeded: [], until: 'live' });
    await roomRig.waitUntil(() => shown(fresh, 'blk:anya') !== undefined);
    // #then
    expect(fresh.platform.shownNotifications()).toEqual([]);
  });
  test('a commit of the adopted generation during adoption is there once it is complete', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const gm = await startClient(room, 'gm-b', { until: 'live' });
    const generation = newGenerationOf(GHOST);
    const anya = importedRecord(GHOST, 'blk:anya', { set: 'pc', order: 0 });
    const mira = importedRecord(GHOST, 'blk:mira', { set: 'pc', order: 1 });
    const asked = heardOf(room, 'gm-b', 'state-request').length;
    room.post(GHOST, { v: 4, g: generation, t: 'reset' });
    await roomRig.waitUntil(() => heardOf(room, 'gm-b', 'state-request').length > asked);
    // #when
    room.post(GHOST, { v: 4, g: generation, t: 'commit', records: [mira] });
    await pause(20);
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [PRESET_RECORD, anya], generation));
    await roomRig.waitUntil(() => sync(gm).state === 'live');
    // #then
    expect(shownKeys(gm)).toEqual(['blk:anya', 'blk:mira', 'preset']);
  });
});

describe('start', () => {
  test('a generation saved part way is not read and its keys go', async () => {
    // #given
    const room = roomRig.openRoom();
    const partial = storageKey('', { n: 1, a: 'gm-x' });

    // #when
    const gm = await startClient(room, 'gm-a', {
      entries: {
        [`${partial}#incomplete`]: '1',
        [`${partial}preset`]: JSON.stringify(PRESET_RECORD),
      },
      until: 'live',
    });

    // #then
    expect({ brok: shown(gm, BROK.k), partial: storedKeys(gm, partial) }).toEqual({
      brok: BROK_STR,
      partial: [],
    });
  });
  test('takes the room copy of a higher generation over its stored one', async () => {
    // #given
    const room = roomRig.openRoom();
    const generation = newGenerationOf('gm-a');
    const anya = importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 });
    room.room.setMetadata({ [KEY]: copyValue(generation, [PRESET_RECORD, anya]) });
    // #when
    const gm = await startClient(room, 'gm-b', { until: 'live' });
    // #then
    expect({ keys: shownKeys(gm), old: storedKeys(gm, OLD_PREFIX) }).toEqual({
      keys: ['blk:anya', 'preset'],
      old: [],
    });
  });
  test('removes a generation below the highest one that a run left behind', async () => {
    // #given
    const room = roomRig.openRoom();
    const newer = storageKey('', { n: 1, a: 'gm-a' });
    const anya = importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 });

    // #when
    const gm = await startClient(room, 'gm-b', {
      entries: { [`${newer}${anya.k}`]: JSON.stringify(anya) },
      until: 'live',
    });

    // #then
    expect(storedKeys(gm)).toEqual([`${newer}${anya.k}`]);
  });
  test('takes its stored generation when it is the highest', async () => {
    // #given
    const room = roomRig.openRoom();
    const newer = storageKey('', { n: 2, a: 'gm-a' });
    const anya = importedRecord('gm-a', 'blk:anya', { set: 'pc', order: 0 });
    room.room.setMetadata({ [KEY]: copyValue(newGenerationOf('gm-a'), [PRESET_RECORD]) });

    // #when
    const gm = await startClient(room, 'gm-b', {
      entries: { [`${newer}${anya.k}`]: JSON.stringify(anya) },
      until: 'live',
    });

    // #then
    expect(shownKeys(gm)).toEqual(['blk:anya']);
  });
});
