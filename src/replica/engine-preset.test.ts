import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { deflateToBase64 } from '@/core/deflate';
import type { JsonValue } from '@/core/json';
import { err } from '@/core/result';
import { encodePreset, type Preset } from '@/core/preset';
import { presetDiff } from '@/core/preset-migrate';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Timing } from '@/core/timing';
import type { Command } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
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
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 400,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 0,
  // Far past any test, so no ping goes out and no GM goes offline unless a test asks for it.
  gmLinkTimeoutMs: 60000,
  // Far past any test, so no room copy is written unless a test asks for one.
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  // Far past any test, so a proposal goes out once unless a test asks for resends.
  proposeResendStartMs: 60000,
  proposeResendMaxMs: 60000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const GENERATION = { n: 0, a: '' };
const DENIED = 'Нет прав на правку';
const PLAYER_ID = 'player-a';

const PRESET: Preset = {
  v: 1,
  character: {
    sections: [
      {
        rows: [
          [
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'field', type: 'text', id: 'note' },
          ],
        ],
      },
      {
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'item' },
            { kind: 'field', type: 'number', id: 'qty' },
          ],
        ],
      },
    ],
  },
  npc: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] },
};

// The row is named by `note` now, and the repeat section by `name`, which replaces `item`.
const MOVED: Preset = {
  ...PRESET,
  character: {
    sections: [
      {
        rows: [
          [
            { kind: 'field', type: 'text', id: 'note' },
            { kind: 'field', type: 'number', id: 'str' },
          ],
        ],
      },
      {
        repeat: true,
        rows: [
          [
            { kind: 'field', type: 'text', id: 'name' },
            { kind: 'field', type: 'number', id: 'qty' },
          ],
        ],
      },
    ],
  },
};

// Only a label is new, so nothing moves or goes.
const RELABELLED: Preset = {
  ...PRESET,
  character: {
    sections: [
      {
        title: 'Сила',
        rows: PRESET.character.sections[0]?.rows ?? [],
      },
      PRESET.character.sections[1] ?? { rows: [] },
    ],
  },
};

// `note` goes from the row of `str`.
const NO_NOTE: Preset = {
  ...PRESET,
  character: {
    sections: [
      { rows: [[{ kind: 'field', type: 'number', id: 'str' }]] },
      PRESET.character.sections[1] ?? { rows: [] },
    ],
  },
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const STR_ROW: VersionedRecord = { k: 'row:brok:str', d: { str: 10 }, c: 2, a: 'seed' };

const SWORD: VersionedRecord = {
  k: 'rep:brok:item:r1',
  d: { order: 0, cells: { item: 'Меч' } },
  c: 1,
  a: 'seed',
};

const BASE: readonly VersionedRecord[] = [
  PRESET_RECORD,
  { k: 'sheet:brok', d: { kind: 'pc', name: 'Брок', order: 0 }, c: 1, a: 'seed' },
  { k: 'sheet:skel', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'seed' },
  { k: `acl:brok:${PLAYER_ID}`, d: { name: 'Оля' }, c: 1, a: 'seed' },
  STR_ROW,
  SWORD,
];

type Client = {
  platform: MockPlatform;
  backing: MockStorageBacking;
  // Every key the storage set, in order.
  writes: string[];
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
};

type Heard = { from: string; data: JsonValue };

type Room = { room: MockRoom; heard: Heard[] };

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  awaitLive?: boolean;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('a preset diff', () => {
  test('answers with the count of stored values the preset erases, and writes nothing', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const writesBefore = gm.writes.length;

    // #when
    const id = requestDiff(gm, MOVED);
    await waitUntil(() => result(gm, id) !== undefined);

    // #then
    expect({ result: result(gm, id), writes: gm.writes.length - writesBefore }).toEqual({
      result: {
        t: 'preset-diff-result',
        id,
        count: 1,
        digest: Object(uploadOf(MOVED, 1)).expectedDigest,
      },
      writes: 0,
    });
  });

  test('is refused while the GM client is catching up', async () => {
    // #given: another GM tab that never answers keeps the catch-up open.
    const room = openRoom();

    room.room.join({ id: 'gm-x', connectionId: 'gm-x', name: 'X', role: 'GM' });

    const gm = await startClient(room, 'gm-a', { awaitLive: false });

    // #when
    const diff = requestDiff(gm, MOVED);
    const upload = send(gm, uploadOf(MOVED, 1));

    await waitUntil(() => rejection(gm, diff) !== undefined && rejection(gm, upload) !== undefined);

    // #then
    expect({
      diff: rejection(gm, diff),
      upload: rejection(gm, upload),
      stored: stored(gm, 'preset'),
    }).toEqual({ diff: 'catching-up', upload: 'catching-up', stored: PRESET_RECORD });
  });

  test("is refused to a player's window", async () => {
    // #given
    const room = openRoom();

    await startClient(room, 'gm-a');

    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });

    // #when
    const id = requestDiff(player, MOVED);
    await waitUntil(() => rejection(player, id) !== undefined);

    // #then
    expect(rejection(player, id)).toBe('not-allowed');
  });

  test('is refused when the stored preset does not decode', async () => {
    // #given: a preset a newer build wrote.
    const newer: VersionedRecord = {
      k: 'preset',
      d: deflateToBase64(JSON.stringify({ ...PRESET, v: 2 })),
      c: 1,
      a: 'seed',
    };

    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE.slice(1), newer] });

    // #when
    const diff = requestDiff(gm, MOVED);
    const upload = send(gm, uploadOf(MOVED, 0));

    await waitUntil(() => rejection(gm, diff) !== undefined && rejection(gm, upload) !== undefined);

    // #then
    expect({
      diff: rejection(gm, diff),
      upload: rejection(gm, upload),
      stored: stored(gm, 'preset'),
    }).toEqual({ diff: 'preset-unreadable', upload: 'preset-unreadable', stored: newer });
  });
});

describe('a preset upload', () => {
  test('writes and sends new-key rows, then the preset, then tombstones, in that order', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const writesBefore = gm.writes.length;

    // #when
    const id = send(gm, uploadOf(MOVED, 1));
    await waitUntil(
      () => result(gm, id) !== undefined && heardOf(room, 'gm-a', 'commit').length === 3,
    );

    // #then
    expect({
      result: result(gm, id),
      commits: heardOf(room, 'gm-a', 'commit').map(keysOf),
      generations: heardOf(room, 'gm-a', 'commit').map((data) => Object(data).g),
      writes: gm.writes.slice(writesBefore),
      note: stored(gm, 'row:brok:note')?.d,
      name: stored(gm, 'rep:brok:name:r1')?.d,
      gone: [stored(gm, STR_ROW.k)?.d, stored(gm, SWORD.k)?.d],
    }).toEqual({
      result: { t: 'preset-uploaded', id, count: 1 },
      commits: [
        ['row:brok:note', 'rep:brok:name:r1'],
        ['preset'],
        ['row:brok:str', 'rep:brok:item:r1'],
      ],
      // AD-14: the generation does not change, so the storage keys keep theirs too.
      generations: [GENERATION, GENERATION, GENERATION],
      writes: [
        `${STORAGE_PREFIX}row:brok:note`,
        `${STORAGE_PREFIX}rep:brok:name:r1`,
        `${STORAGE_PREFIX}preset`,
        `${STORAGE_PREFIX}row:brok:str`,
        `${STORAGE_PREFIX}rep:brok:item:r1`,
      ],
      note: { str: 10 },
      name: { order: 0, cells: {} },
      gone: [null, null],
    });
  });

  test('sends the commits it held before the batch first', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    send(gm, { type: 'sheet-rename', sheetId: 'brok', name: 'Брок Второй' });
    send(gm, uploadOf(RELABELLED, 0));
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 2);

    // #then
    expect(heardOf(room, 'gm-a', 'commit').map(keysOf)).toEqual([['sheet:brok'], ['preset']]);
  });

  test('refuses a count that changed, with the new count, and writes nothing', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const writesBefore = gm.writes.length;

    // #when
    const id = send(gm, uploadOf(MOVED, 0));
    await waitUntil(() => rejection(gm, id) !== undefined);

    // #then
    expect({
      rejection: gm.store.$rejections.get().get(id),
      writes: gm.writes.length - writesBefore,
      commits: heardOf(room, 'gm-a', 'commit'),
    }).toEqual({
      rejection: {
        t: 'command-rejected',
        id,
        reason: 'count-changed',
        count: 1,
        digest: digestOf(MOVED),
      },
      writes: 0,
      commits: [],
    });
  });

  test('refuses an upload that erases other values than the diff, though the count is the same', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    const id = send(gm, uploadOf(MOVED, 1, '00000000'));
    await waitUntil(() => rejection(gm, id) !== undefined);

    // #then
    expect({
      rejection: gm.store.$rejections.get().get(id),
      stored: stored(gm, 'preset'),
    }).toEqual({
      rejection: {
        t: 'command-rejected',
        id,
        reason: 'count-changed',
        count: 1,
        digest: digestOf(MOVED),
      },
      stored: PRESET_RECORD,
    });
  });

  test('stops at a failed write and leaves the old preset and keys in place', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const setItem = gm.platform.storage.setItem;

    const failing = spyOn(gm.platform.storage, 'setItem').mockImplementation((key, value) =>
      key === `${STORAGE_PREFIX}row:brok:note`
        ? err({ operation: 'write', reason: 'quota' })
        : setItem(key, value),
    );

    cleanups.push(() => failing.mockRestore());

    // #when
    const id = send(gm, uploadOf(MOVED, 1));
    await waitUntil(() => rejection(gm, id) !== undefined);
    await pause(20);

    // #then
    expect({
      rejection: rejection(gm, id),
      stored: stored(gm, 'preset'),
      old: [stored(gm, STR_ROW.k), stored(gm, SWORD.k)],
      commits: heardOf(room, 'gm-a', 'commit').map(keysOf),
      result: result(gm, id),
    }).toEqual({
      rejection: 'write-failed',
      stored: PRESET_RECORD,
      old: [STR_ROW, SWORD],
      commits: [],
      result: undefined,
    });
  });

  test('applies a confirmed upload whose count is 0 now', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    const id = send(gm, uploadOf(RELABELLED, 3));
    await waitUntil(() => result(gm, id) !== undefined);

    // #then
    expect({ result: result(gm, id), stored: stored(gm, 'preset')?.d }).toEqual({
      result: { t: 'preset-uploaded', id, count: 0 },
      stored: encodePreset(RELABELLED),
    });
  });
});

describe('a write after an upload', () => {
  test('of a GM field strips the values its row no longer has', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: withRecord({ ...STR_ROW, d: { str: 10, gone: 1, note: 5 } }),
    });

    // #when
    send(gm, strEdit('str', 11));
    await waitUntil(() => stored(gm, STR_ROW.k)?.c === 3);

    // #then
    expect(stored(gm, STR_ROW.k)?.d).toEqual({ str: 11 });
  });

  test('of an NPC copy holds only what the NPC template has', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'row:skel:str', d: { str: 5, gone: 2 }, c: 1, a: 'seed' }],
    });

    // #when
    send(gm, { type: 'sheet-duplicate', sheetId: 'skel', count: 1 });
    await waitUntil(() => copiedRows(gm).length === 1);

    // #then
    expect(copiedRows(gm)).toEqual([{ str: 5 }]);
  });

  test('of an NPC copy leaves out rows and sections the NPC template lacks', async () => {
    // #given: the NPC template has the str row and a repeat section of item and qty.
    const npcPreset: Preset = {
      ...PRESET,
      npc: {
        sections: [
          { rows: [[{ kind: 'field', type: 'number', id: 'str' }]] },
          PRESET.character.sections[1] ?? { rows: [] },
        ],
      },
    };

    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: [
        { ...PRESET_RECORD, d: encodePreset(npcPreset) },
        ...BASE.slice(1),
        { k: 'row:skel:str', d: { str: 5 }, c: 1, a: 'seed' },
        { k: 'row:skel:gone', d: { gone: 1 }, c: 1, a: 'seed' },
        { k: 'rep:skel:spell:x1', d: { order: 0, cells: { spell: 'Огонь' } }, c: 1, a: 'seed' },
        {
          k: 'rep:skel:item:y1',
          d: { order: 0, cells: { item: 'Нож', extra: 3 } },
          c: 1,
          a: 'seed',
        },
      ],
    });

    const before = new Set(gm.backing.keys());

    // #when
    send(gm, { type: 'sheet-duplicate', sheetId: 'skel', count: 1 });
    await waitUntil(() =>
      gm.backing.keys().some((key) => !before.has(key) && key.includes(':rep:')),
    );

    // #then
    const copied = gm.backing
      .keys()
      .filter((key) => !before.has(key) && !key.includes(':sheet:'))
      .sort()
      .map((key) => recordSchema.parse(JSON.parse(gm.backing.get(key) ?? 'null')))
      .map((record) => [record.k.split(':')[0], record.k.split(':')[2], record.d]);

    expect(copied).toEqual([
      ['rep', 'item', { order: 0, cells: { item: 'Нож' } }],
      ['row', 'str', { str: 5 }],
    ]);
  });

  test("of a player's proposal strips the values its row no longer has", async () => {
    // #given
    const { room, player } = await playerWithSilentGm(
      withRecord({ ...STR_ROW, d: { str: 10, gone: 1 } }),
    );

    // #when
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);

    // #then
    expect(proposals(room)[0]?.d).toEqual({ str: 11 });
  });
});

describe("a player's pending edit when the preset changes", () => {
  test('of only a removed field: dropped with no notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('note', 'устал'));
    await waitUntil(() => proposals(room).length === 1);

    // #when
    answer(room, commit([{ k: 'preset', d: encodePreset(NO_NOTE), c: 2, a: 'gm-a' }]));
    await waitUntil(() => player.store.$replica.get().get('preset')?.c === 2);
    await pause(20);

    // #then
    expect({
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
      proposals: proposals(room).length,
    }).toEqual({ pending: [], notifications: [], proposals: 1 });
  });

  test('of a removed and a kept field: the removed one goes, and the rest is proposed again', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    send(player, strEdit('note', 'устал'));
    await waitUntil(() => proposals(room).length === 2);

    // #when
    answer(room, commit([{ k: 'preset', d: encodePreset(NO_NOTE), c: 2, a: 'gm-a' }]));
    await waitUntil(
      () => proposals(room).length === 3 && player.store.$replica.get().get('preset')?.c === 2,
    );

    await waitUntil(() => shown(player, STR_ROW.k)?.c === 5);

    // #then
    expect({
      newest: proposals(room)[2],
      shown: shown(player, STR_ROW.k)?.d,
      notifications: player.platform.shownNotifications(),
    }).toEqual({
      newest: { k: STR_ROW.k, d: { str: 11 }, c: 5, a: PLAYER_ID },
      shown: { str: 11 },
      notifications: [],
    });
  });

  test('whose older version the GM denies after the change: no notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    send(player, strEdit('note', 'устал'));
    await waitUntil(() => proposals(room).length === 2);
    answer(room, commit([{ k: 'preset', d: encodePreset(NO_NOTE), c: 2, a: 'gm-a' }]));
    await waitUntil(() => proposals(room).length === 3);

    // #when
    answer(room, reject({ k: STR_ROW.k, c: 4, a: PLAYER_ID }, 'denied'));
    await pause(20);

    // #then
    expect({
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ pending: [STR_ROW.k], notifications: [] });
  });

  test('of a field whose row is named anew: moves to the new key and goes out again', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('note', 'устал'));
    await waitUntil(() => proposals(room).length === 1);

    // #when: the GM's batch for MOVED, in its three commits.
    answer(room, commit([{ k: 'row:brok:note', d: { str: 10 }, c: 1, a: 'gm-a' }]));
    answer(room, commit([{ k: 'preset', d: encodePreset(MOVED), c: 2, a: 'gm-a' }]));
    answer(room, commit([{ ...STR_ROW, d: null, c: 3, a: 'gm-a' }]));
    await waitUntil(() => proposals(room).length === 2 && shown(player, STR_ROW.k)?.d === null);

    // #then
    expect({
      newest: proposals(room)[1]?.k,
      data: proposals(room)[1]?.d,
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({
      newest: 'row:brok:note',
      data: { str: 10, note: 'устал' },
      pending: ['row:brok:note'],
      notifications: [],
    });
  });

  test('of a repeat row removal: follows the row to its new section', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, {
      type: 'repeat-row-delete',
      sheetId: 'brok',
      sectionId: 'item',
      instanceId: 'r1',
    });
    await waitUntil(() => proposals(room).length === 1);

    // #when
    answer(room, commit([{ k: 'rep:brok:name:r1', d: { order: 0, cells: {} }, c: 1, a: 'gm-a' }]));

    answer(room, commit([{ k: 'preset', d: encodePreset(MOVED), c: 2, a: 'gm-a' }]));
    answer(room, commit([{ ...SWORD, d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => proposals(room).length === 2);

    // #then
    expect({
      newest: proposals(room)[1]?.k,
      data: proposals(room)[1]?.d,
      notifications: player.platform.shownNotifications(),
    }).toEqual({ newest: 'rep:brok:name:r1', data: null, notifications: [] });
  });

  test('does not show the denied notification from a GM it reached', async () => {
    // #given: a live GM that commits the upload.
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });

    await waitUntil(() => shown(player, STR_ROW.k) !== undefined);

    // #when
    send(gm, uploadOf(NO_NOTE, 0));
    send(player, strEdit('note', 'устал'));
    await waitUntil(() => player.store.$replica.get().get('preset')?.a === 'gm-a');
    await pause(50);

    // #then
    expect({
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ pending: [], notifications: [] });
  });
});

async function playerWithSilentGm(
  seeded: readonly VersionedRecord[] = BASE,
): Promise<{ room: Room; player: Client }> {
  const room = openRoom();
  const gm = await startClient(room, 'gm-a', { seeded });
  const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });

  await waitUntil(() => shown(player, SWORD.k) !== undefined);
  gm.engine.stop();

  return { room, player };
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const writes: string[] = [];
  const backing = createBacking(writes);
  const bus = createMemoryBus();
  const role = options.role ?? 'GM';

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role,
  };

  const platform = createMockPlatform(bus, backing, identity);

  for (const record of options.seeded ?? BASE) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  writes.length = 0;
  platform.joinParty();

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: TIMING,
    editDenied: DENIED,
  });

  const store = createProjectionStore();

  const window = startReplicaClient(
    createMockPlatform(bus, backing, identity).broadcast,
    createSendQueue(platform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop);

  await waitUntil(
    () =>
      store.$loaded.get() && (options.awaitLive === false || store.$sync.get().state === 'live'),
  );

  return { platform, backing, writes, engine, store, window };
}

function openRoom(): Room {
  const room = createMemoryRoom();
  const heard: Heard[] = [];

  cleanups.push(
    room.onRemote(SYNC_CHANNEL, 'observer', (event) => {
      heard.push({ from: event.connectionId, data: event.data });
    }),
  );

  return { room, heard };
}

function withRecord(record: VersionedRecord): VersionedRecord[] {
  return BASE.map((seeded) => (seeded.k === record.k ? record : seeded));
}

// The digest of the values `preset` erases from BASE.
function digestOf(preset: Preset): string {
  return presetDiff(new Map(BASE.map((record) => [record.k, record])), PRESET, preset).digest;
}

// An upload confirmed for `expectedCount` values, with the digest of what it erases from BASE.
function uploadOf(
  preset: Preset,
  expectedCount: number,
  expectedDigest = digestOf(preset),
): Command {
  return { type: 'preset-upload', data: encodePreset(preset), expectedCount, expectedDigest };
}

function requestDiff(client: Client, preset: Preset): string {
  const sent = client.window.requestPresetDiff(encodePreset(preset));

  if (!sent.ok) {
    throw new Error(`the window refused the diff: ${sent.error}`);
  }

  return sent.value;
}

// A message from the GM client the test speaks for.
function answer(room: Room, data: JsonValue): void {
  room.room.postRemote(SYNC_CHANNEL, data, 'gm-a');
}

function commit(records: VersionedRecord[]): JsonValue {
  return { v: 1, g: GENERATION, t: 'commit', records };
}

function reject(edit: { k: string; c: number; a: string }, reason: 'denied' | 'stale'): JsonValue {
  return { v: 1, g: GENERATION, t: 'reject', k: edit.k, c: edit.c, a: edit.a, reason };
}

function strEdit(fieldId: string, value: JsonValue): Command {
  return {
    type: 'field-patch',
    sheetId: 'brok',
    target: { kind: 'row', rowId: 'str' },
    fieldId,
    value,
  };
}

// The messages of one type one client sent to the room, in send order.
function heardOf(room: Room, from: string, t: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === t ? [message.data] : [],
  );
}

// The keys of the records one commit carries, in order.
function keysOf(data: JsonValue): string[] {
  return recordSchema
    .array()
    .parse(Object(data).records)
    .map((record) => record.k);
}

// The record of each `propose` the player sent, in send order.
function proposals(room: Room): VersionedRecord[] {
  return heardOf(room, PLAYER_ID, 'propose').map((data) =>
    recordSchema.parse(Object(data).records[0]),
  );
}

// The keys whose window record is the pending view's, not the replica's.
function pendingKeys(client: Client): string[] {
  const replica = client.store.$replica.get();

  const keys = [...client.store.$records.get()].flatMap(([key, record]) =>
    replica.get(key) === record ? [] : [key],
  );

  keys.sort();

  return keys;
}

// The `row:` data of every NPC copy of "Скелет" the GM stored.
function copiedRows(client: Client): JsonValue[] {
  return client.backing
    .keys()
    .filter(
      (key) =>
        key.startsWith(`${STORAGE_PREFIX}row:`) &&
        key.endsWith(':str') &&
        key !== `${STORAGE_PREFIX}row:skel:str` &&
        key !== `${STORAGE_PREFIX}${STR_ROW.k}`,
    )
    .map((key) => recordSchema.parse(JSON.parse(client.backing.get(key) ?? 'null')).d);
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('the condition never became true');
    }

    // Polling is the point here: each round has to let the paced queues run.
    // oxlint-disable-next-line no-await-in-loop
    await pause(POLL_MS);
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function send(client: Client, command: Command): string {
  const sent = client.window.sendCommand(command);

  if (!sent.ok) {
    throw new Error(`the window refused the command: ${sent.error}`);
  }

  return sent.value;
}

function rejection(client: Client, id: string): string | undefined {
  return client.store.$rejections.get().get(id)?.reason;
}

function result(client: Client, id: string): JsonValue | undefined {
  return client.store.$presetResults.get().get(id);
}

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function stored(client: Client, key: string): VersionedRecord | null {
  const text = client.backing.get(`${STORAGE_PREFIX}${key}`);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
}

function createBacking(writes: string[]): MockStorageBacking {
  const entries = new Map<string, string>();

  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      writes.push(key);
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
    keys: () => [...entries.keys()],
  };
}
