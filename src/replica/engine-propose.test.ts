import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { inflateSync, strFromU8 } from 'fflate';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import { encodeStateRecords } from '@/core/state-records';
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
  // Far past most tests, so a proposal goes out once unless a test asks for resends.
  proposeResendStartMs: 60000,
  proposeResendMaxMs: 60000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const GENERATION = { n: 0, a: '' };
const DENIED = 'Нет прав на правку';

// The fake player connection of the GM-side tests, and the player id its `acl:` names.
const PLAYER_SOCKET = 'p-socket';
const S = PLAYER_SOCKET;
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

const STR_ROW: VersionedRecord = { k: 'row:brok:str', d: { str: 10 }, c: 2, a: 'seed' };

const SWORD: VersionedRecord = {
  k: 'rep:brok:item:r1',
  d: { order: 0, cells: { item: 'Меч' } },
  c: 1,
  a: 'seed',
};

const REMOVED: VersionedRecord = { k: 'rep:brok:item:r2', d: null, c: 3, a: 'seed' };

// "Брок" is a character "player-a" may edit, "Кира" one it may not, and "Скелет" an NPC.
const BASE: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { kind: 'pc', name: 'Брок', order: 0 }, c: 1, a: 'seed' },
  { k: 'sheet:kira', d: { kind: 'pc', name: 'Кира', order: 1 }, c: 1, a: 'seed' },
  { k: 'sheet:skel', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'seed' },
  { k: `acl:brok:${PLAYER_ID}`, d: { name: 'Оля' }, c: 1, a: 'seed' },
  STR_ROW,
  SWORD,
  REMOVED,
];

type Client = {
  platform: MockPlatform;
  backing: MockStorageBacking;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
};

type Heard = { from: string; data: JsonValue };

type Room = { room: MockRoom; heard: Heard[] };

type ClientOptions = {
  role?: PlayerRole;
  // Changes the engine's platform before it starts, such as to fail its storage reads.
  platform?: (platform: MockPlatform) => MockPlatform;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('a GM client answers a proposal', () => {
  test('with c above the current one: merges it with c and a unchanged and commits it with its echo', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET };

    joinPlayerSocket(room);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #then
    expect({
      sent: heardOf(room, 'gm-a', 'commit'),
      stored: stored(gm, proposed.k),
      shown: shown(gm, proposed.k),
    }).toEqual({
      sent: [commit([proposed], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }])],
      stored: proposed,
      shown: proposed,
    });
  });

  test('identical to the current record, also when sent again: the same commit with its echo', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET };

    joinPlayerSocket(room);
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 2);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'commit'), stored: stored(gm, proposed.k) }).toEqual({
      sent: [
        commit([proposed], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }]),
        commit([proposed], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }]),
      ],
      stored: proposed,
    });
  });

  test("that removes a removed repeat row: commits the existing tombstone with the proposer's echo", async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    joinPlayerSocket(room);

    // #when
    propose(room, { ...REMOVED, c: 1, a: PLAYER_SOCKET });
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'commit'), stored: stored(gm, REMOVED.k) }).toEqual({
      sent: [commit([REMOVED], [{ k: REMOVED.k, c: 1, a: PLAYER_SOCKET }])],
      stored: REMOVED,
    });
  });

  test.each<[string, VersionedRecord]>([
    ['an edit of a sheet with no access', { k: 'row:kira:str', d: { str: 1 }, c: 1, a: S }],
    ['an edit of an NPC', { k: 'row:skel:str', d: { str: 1 }, c: 1, a: S }],
    ['an edit of a removed repeat row', { ...REMOVED, d: { order: 0, cells: {} }, c: 9, a: S }],
    ['a field id absent from the row', { ...STR_ROW, d: { qty: 1 }, c: 3, a: S }],
    ['a value of another JSON type', { ...STR_ROW, d: { str: '11' }, c: 3, a: S }],
    ['a GM key form', { k: 'link:token-1', d: 'brok', c: 1, a: S }],
    ['a removal of a plain row', { ...STR_ROW, d: null, c: 3, a: S }],
    ["an author that is not the sender's", { ...STR_ROW, d: { str: 11 }, c: 3, a: 'gm-b' }],
    ['a c far past the current one', { ...STR_ROW, d: { str: 11 }, c: 2_000_000, a: S }],
    [
      'a record too large for one message',
      { ...STR_ROW, d: { note: 'ы'.repeat(8000) }, c: 3, a: S },
    ],
  ])('of %s: rejects it as denied with its echo and keeps its records', async (_name, record) => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    joinPlayerSocket(room);

    // #when
    propose(room, record);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    expect({
      sent: heardOf(room, 'gm-a', 'reject'),
      commits: heardOf(room, 'gm-a', 'commit'),
      stored: stored(gm, record.k),
    }).toEqual({
      sent: [reject(record, 'denied')],
      commits: [],
      stored: BASE.find((seeded) => seeded.k === record.k) ?? null,
    });
  });

  test('with a c not above the current one: rejects it as stale with the current record', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 2, a: PLAYER_SOCKET };

    joinPlayerSocket(room);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'reject'), stored: stored(gm, STR_ROW.k) }).toEqual({
      sent: [{ ...reject(proposed, 'stale'), current: STR_ROW }],
      stored: STR_ROW,
    });
  });

  test('on two GM clients: both store the same record and both commit its echo', async () => {
    // #given
    const room = openRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    const proposed: VersionedRecord = {
      ...SWORD,
      d: { order: 0, cells: { qty: 2 } },
      c: 4,
      a: PLAYER_SOCKET,
    };

    joinPlayerSocket(room);

    // #when
    propose(room, proposed);

    await waitUntil(
      () =>
        heardOf(room, 'gm-a', 'commit').length === 1 &&
        heardOf(room, 'gm-b', 'commit').length === 1,
    );

    // #then
    const echo = commit([proposed], [{ k: proposed.k, c: 4, a: PLAYER_SOCKET }]);

    expect({
      stored: [stored(gmA, proposed.k), stored(gmB, proposed.k)],
      sent: [heardOf(room, 'gm-a', 'commit'), heardOf(room, 'gm-b', 'commit')],
    }).toEqual({ stored: [proposed, proposed], sent: [[echo], [echo]] });
  });

  test('while catching up: neither commits nor rejects, also after its catch-up ends', async () => {
    // #given: a GM that never answers holds this client in catch-up.
    const room = openRoom();

    room.room.join({ id: 'ghost', connectionId: 'ghost', name: 'ghost', role: 'GM' });

    const gm = await startClient(room, 'gm-a', { awaitLive: false });

    joinPlayerSocket(room);

    // #when
    propose(room, { ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET });
    propose(room, { ...STR_ROW, d: { str: 12 }, c: 1, a: PLAYER_SOCKET });
    const during = gm.store.$sync.get().state;

    await waitUntil(() => gm.store.$sync.get().state === 'live');
    await pause(50);

    // #then
    expect({
      during,
      answers: [...heardOf(room, 'gm-a', 'commit'), ...heardOf(room, 'gm-a', 'reject')],
      stored: stored(gm, STR_ROW.k),
    }).toEqual({ during: 'catching-up', answers: [], stored: STR_ROW });
  });

  test('from a connection the party does not know: drops it with no answer', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    propose(room, { ...STR_ROW, d: { str: 11 }, c: 3, a: 'stranger' }, 'stranger');
    await pause(50);

    // #then
    expect({
      answers: [...heardOf(room, 'gm-a', 'commit'), ...heardOf(room, 'gm-a', 'reject')],
      stored: stored(gm, STR_ROW.k),
    }).toEqual({ answers: [], stored: STR_ROW });
  });

  test('with a stale c whose current record is too large to go back with the answer: denied', async () => {
    // #given: the GM's record and the long connection id fill one message between them.
    const socket = `p-${'x'.repeat(1000)}`;
    const big: VersionedRecord = { ...STR_ROW, d: { str: 10, note: 'ы'.repeat(7000) } };
    const room = openRoom();

    await startClient(room, 'gm-a', { seeded: [...BASE.filter((one) => one.k !== big.k), big] });
    room.room.join({ id: PLAYER_ID, connectionId: socket, name: 'Оля', role: 'PLAYER' });

    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 2, a: socket };

    // #when
    propose(room, proposed, socket);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    expect(heardOf(room, 'gm-a', 'reject')).toEqual([reject(proposed, 'denied')]);
  });

  test('whose storage could not be read: neither commits nor rejects', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = openRoom();

    await startClient(room, 'gm-a', {
      platform: (platform) => {
        platform.setFailingStorageOperations(['read', 'list']);

        return platform;
      },
    });

    joinPlayerSocket(room);

    // #when
    propose(room, { ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET });
    await pause(50);

    // #then
    expect([...heardOf(room, 'gm-a', 'commit'), ...heardOf(room, 'gm-a', 'reject')]).toEqual([]);
  });

  test('of another generation: drops it with no answer', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    joinPlayerSocket(room);

    // #when
    room.room.postRemote(
      SYNC_CHANNEL,
      {
        v: 1,
        g: { n: 1, a: 'other' },
        t: 'propose',
        records: [{ ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET }],
      },
      PLAYER_SOCKET,
    );

    await pause(50);

    // #then
    expect({
      answers: [...heardOf(room, 'gm-a', 'commit'), ...heardOf(room, 'gm-a', 'reject')],
      stored: stored(gm, STR_ROW.k),
    }).toEqual({ answers: [], stored: STR_ROW });
  });

  test('that it commits: writes the room copy after the pause', async () => {
    // #given
    const room = openRoom();

    await startClient(room, 'gm-a', { timing: { snapshotPauseMs: 20 } });
    joinPlayerSocket(room);

    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET };

    // #when
    propose(room, proposed);
    await waitUntil(() => roomCopyRecords(room) !== null);

    // #then
    expect(roomCopyRecords(room)?.find((record) => record.k === STR_ROW.k)).toEqual(proposed);
  });
});

describe("a player's edit", () => {
  test('with access: proposed with c above the record, shown at once and not merged', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    // #when
    const id = send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && shown(player, STR_ROW.k)?.c === 3);

    // #then
    const proposed: VersionedRecord = { k: STR_ROW.k, d: { str: 11 }, c: 3, a: PLAYER_ID };

    expect({
      sent: proposals(room),
      shown: shown(player, STR_ROW.k),
      replica: player.store.$replica.get().get(STR_ROW.k),
      rejection: rejection(player, id),
    }).toEqual({ sent: [proposed], shown: proposed, replica: STR_ROW, rejection: undefined });
  });

  test('of a character with no access: refused as not-allowed and never proposed', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    // #when
    const id = send(player, {
      type: 'field-patch',
      sheetId: 'kira',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 1,
    });

    await waitUntil(() => rejection(player, id) !== undefined);

    // #then
    expect({ reason: rejection(player, id), sent: proposals(room) }).toEqual({
      reason: 'not-allowed',
      sent: [],
    });
  });

  test.each<[string, Command]>([
    ['a rename', { type: 'sheet-rename', sheetId: 'brok', name: 'Я' }],
    ['an access change', { type: 'acl-set', sheetId: 'brok', playerId: 'x', name: '', on: true }],
    ['a sheet delete', { type: 'sheet-delete', sheetId: 'brok' }],
  ])('of another kind, %s: refused as not-allowed', async (_name, command) => {
    // #given
    const { room, player } = await playerWithSilentGm();

    // #when
    const id = send(player, command);
    await waitUntil(() => rejection(player, id) !== undefined);

    // #then
    expect({ reason: rejection(player, id), sent: proposals(room) }).toEqual({
      reason: 'not-allowed',
      sent: [],
    });
  });

  test('twice of one key: one entry, its c raised, both fields shown and in the newest proposal', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);

    // #when
    send(player, strEdit('note', 'устал'));
    await waitUntil(() => proposals(room).length === 2 && shown(player, STR_ROW.k)?.c === 4);

    // #then
    const newest: VersionedRecord = {
      k: STR_ROW.k,
      d: { str: 11, note: 'устал' },
      c: 4,
      a: PLAYER_ID,
    };

    expect({ newest: proposals(room)[1], shown: shown(player, STR_ROW.k) }).toEqual({
      newest,
      shown: newest,
    });
  });

  test('clears on a commit that echoes its (k, c, a), though the record there is a newer GM one', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);

    // #when
    const gmRecord: VersionedRecord = { ...STR_ROW, d: { str: 30 }, c: 4, a: 'gm-a' };

    answer(room, commit([gmRecord], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]));
    await waitUntil(() => shown(player, STR_ROW.k)?.c === 4);

    // #then
    expect({ shown: shown(player, STR_ROW.k), pending: pendingKeys(player) }).toEqual({
      shown: gmRecord,
      pending: [],
    });
  });

  test('clears on a commit of its own record with no echo', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const proposed = proposals(room)[0] ?? STR_ROW;

    // #when
    answer(room, commit([proposed]));
    await waitUntil(() => player.store.$replica.get().get(STR_ROW.k)?.c === 3);

    // #then
    expect({
      replica: player.store.$replica.get().get(STR_ROW.k),
      pending: pendingKeys(player),
    }).toEqual({ replica: proposed, pending: [] });
  });

  test('stays on a commit of an older c, until its own (k, c, a) is answered', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    send(player, strEdit('str', 12));
    await waitUntil(() => proposals(room).length === 2);
    const [older, newest] = proposals(room);

    // #when
    answer(
      room,
      commit(older === undefined ? [] : [older], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]),
    );
    await waitUntil(() => player.store.$replica.get().get(STR_ROW.k)?.c === 3);

    // #then
    expect({ shown: shown(player, STR_ROW.k), pending: pendingKeys(player) }).toEqual({
      shown: newest,
      pending: [STR_ROW.k],
    });
  });

  test('denied: dropped, the value returns, and "Нет прав на правку" shows', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);

    // #when
    await waitUntil(() => shown(player, STR_ROW.k)?.c === 3);
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    await waitUntil(
      () => shown(player, STR_ROW.k)?.c === 2 && player.platform.shownNotifications().length === 1,
    );

    // #then
    expect({
      shown: shown(player, STR_ROW.k),
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ shown: STR_ROW, pending: [], notifications: [DENIED] });
  });

  test('denied for two keys at once: one notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    send(player, swordEdit(3));
    await waitUntil(() => proposals(room).length === 2 && pendingKeys(player).length === 2);

    // #when
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    answer(room, reject({ k: SWORD.k, c: 2, a: PLAYER_ID }, 'denied'));
    await waitUntil(() => pendingKeys(player).length === 0);
    await pause(30);

    // #then
    expect(player.platform.shownNotifications()).toEqual([DENIED]);
  });

  test('ignores a rejection that matches none of its entries', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);

    await waitUntil(() => pendingKeys(player).length === 1);

    // #when
    answer(room, reject({ k: STR_ROW.k, c: 2, a: PLAYER_ID }, 'denied'));
    answer(room, reject({ k: STR_ROW.k, c: 3, a: 'someone-else' }, 'denied'));
    await pause(50);

    // #then
    expect({
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ pending: [STR_ROW.k], notifications: [] });
  });

  test('stale: applies its patch to the current record, takes its c + 1 and proposes again', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const current: VersionedRecord = { ...STR_ROW, d: { str: 20, note: 'ГМ' }, c: 5, a: 'gm-a' };

    // #when
    answer(room, { ...reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale'), current });
    await waitUntil(() => proposals(room).length === 2 && shown(player, STR_ROW.k)?.c === 6);

    // #then
    const again: VersionedRecord = { k: STR_ROW.k, d: { str: 11, note: 'ГМ' }, c: 6, a: PLAYER_ID };

    expect({
      sent: proposals(room)[1],
      shown: shown(player, STR_ROW.k),
      replica: player.store.$replica.get().get(STR_ROW.k),
    }).toEqual({ sent: again, shown: again, replica: current });
  });

  test('stale over a removed row it edits: dropped with "Нет прав на правку"', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, swordEdit(3));
    await waitUntil(() => proposals(room).length === 1);
    const removed: VersionedRecord = { ...SWORD, d: null, c: 6, a: 'gm-a' };

    // #when
    answer(room, { ...reject({ k: SWORD.k, c: 2, a: PLAYER_ID }, 'stale'), current: removed });
    await waitUntil(
      () => player.platform.shownNotifications().length === 1 && shown(player, SWORD.k)?.c === 6,
    );

    // #then
    expect({
      sent: proposals(room).length,
      shown: shown(player, SWORD.k),
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ sent: 1, shown: removed, pending: [], notifications: [DENIED] });
  });

  test('both answered: the commit wins over a later denial, which shows nothing', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const proposed = proposals(room)[0] ?? STR_ROW;

    // #when
    answer(room, commit([proposed], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]));
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    await waitUntil(() => player.store.$replica.get().get(STR_ROW.k)?.c === 3);
    await pause(30);

    // #then
    expect({
      shown: shown(player, STR_ROW.k),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ shown: proposed, notifications: [] });
  });

  test('both answered: a commit after the denial applies the value', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const proposed = proposals(room)[0] ?? STR_ROW;

    // #when
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    answer(room, commit([proposed], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]));
    await waitUntil(() => player.store.$replica.get().get(STR_ROW.k)?.c === 3);

    // #then
    expect({
      shown: shown(player, STR_ROW.k),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ shown: proposed, notifications: [DENIED] });
  });

  test('of two keys: each is answered on its own, and the other stays', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    send(player, swordEdit(3));
    await waitUntil(() => proposals(room).length === 2 && pendingKeys(player).length === 2);
    const strProposal = proposals(room).find((record) => record.k === STR_ROW.k) ?? STR_ROW;

    // #when
    answer(room, commit([strProposal], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]));
    await waitUntil(() => player.store.$replica.get().get(STR_ROW.k)?.c === 3);

    // #then
    expect(pendingKeys(player)).toEqual([SWORD.k]);
  });

  test('with no GM answering: resent under backoff, each time the same (k, c, a)', async () => {
    // #given
    const { room, player } = await playerWithSilentGm({
      proposeResendStartMs: 20,
      proposeResendMaxMs: 40,
      editDeniedQuietMs: 2000,
    });

    // #when
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length >= 3);

    // #then
    const proposed: VersionedRecord = { k: STR_ROW.k, d: { str: 11 }, c: 3, a: PLAYER_ID };

    expect({ sent: proposals(room).slice(0, 3), pending: pendingKeys(player) }).toEqual({
      sent: [proposed, proposed, proposed],
      pending: [STR_ROW.k],
    });
  });

  test('during catch-up: shown at once, and proposed only after catch-up ends, with a fresh c', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    player.engine.catchUp();
    await waitUntil(() => player.store.$sync.get().state === 'catching-up');

    // #when
    send(player, strEdit('str', 11));
    await waitUntil(() => shown(player, STR_ROW.k)?.c === 3);
    const during = { sent: proposals(room).length, shown: shown(player, STR_ROW.k)?.d };

    // A GM edit that the catch-up brings raises the c the edit takes.
    answer(room, commit([{ ...STR_ROW, d: { str: 15 }, c: 7, a: 'gm-a' }]));
    await waitUntil(() => player.store.$sync.get().state === 'live');
    await waitUntil(() => proposals(room).length === 1);

    // #then
    expect({ during, sent: proposals(room) }).toEqual({
      during: { sent: 0, shown: { str: 11 } },
      sent: [{ k: STR_ROW.k, d: { str: 11 }, c: 8, a: PLAYER_ID }],
    });
  });
});

describe("a player's repeat row", () => {
  test('add: one entry holding order and cells, which a field edit of the row joins', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, { type: 'repeat-row-add', sheetId: 'brok', sectionId: 'item', instanceId: 'r9' });
    await waitUntil(() => proposals(room).length === 1);

    // #when
    send(player, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'item', instanceId: 'r9' },
      fieldId: 'qty',
      value: 2,
    });

    await waitUntil(() => proposals(room).length === 2);

    // #then
    expect(proposals(room)).toEqual([
      { k: 'rep:brok:item:r9', d: { order: 1, cells: {} }, c: 1, a: PLAYER_ID },
      { k: 'rep:brok:item:r9', d: { order: 1, cells: { qty: 2 } }, c: 2, a: PLAYER_ID },
    ]);
  });

  test('add on stale: keeps its order and cells over the record the GM holds', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, { type: 'repeat-row-add', sheetId: 'brok', sectionId: 'item', instanceId: 'r9' });
    await waitUntil(() => proposals(room).length === 1);

    const current: VersionedRecord = {
      k: 'rep:brok:item:r9',
      d: { order: 5, cells: { item: 'Щит' } },
      c: 4,
      a: 'gm-a',
    };

    // #when
    answer(room, { ...reject({ k: current.k, c: 1, a: PLAYER_ID }, 'stale'), current });
    await waitUntil(() => proposals(room).length === 2);

    // #then
    expect(proposals(room)[1]).toEqual({
      k: current.k,
      d: { order: 1, cells: {} },
      c: 5,
      a: PLAYER_ID,
    });
  });

  test('remove: d null, and on stale it stays a removal', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, {
      type: 'repeat-row-delete',
      sheetId: 'brok',
      sectionId: 'item',
      instanceId: 'r1',
    });
    await waitUntil(() => proposals(room).length === 1);
    const current: VersionedRecord = { ...SWORD, d: { order: 0, cells: { item: 'Лук' } }, c: 6 };

    // #when
    answer(room, { ...reject({ k: SWORD.k, c: 2, a: PLAYER_ID }, 'stale'), current });
    await waitUntil(() => proposals(room).length === 2);

    // #then
    expect(proposals(room)).toEqual([
      { k: SWORD.k, d: null, c: 2, a: PLAYER_ID },
      { k: SWORD.k, d: null, c: 7, a: PLAYER_ID },
    ]);
  });
});

describe("a player's entry over its lifetime", () => {
  test('shows its patch over a newer GM edit of other fields of its key', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);

    // #when: a GM edit of the note, with no echo of the player's version.
    answer(room, commit([{ ...STR_ROW, d: { str: 10, note: 'ГМ' }, c: 4, a: 'gm-a' }]));
    // A delta can bring the record and the pending view in two parts.
    await waitUntil(
      () =>
        player.store.$replica.get().get(STR_ROW.k)?.c === 4 &&
        Object(shown(player, STR_ROW.k)?.d).note !== undefined,
    );

    // #then
    expect(shown(player, STR_ROW.k)).toEqual({
      k: STR_ROW.k,
      d: { str: 11, note: 'ГМ' },
      c: 3,
      a: PLAYER_ID,
    });
  });

  test('stale with a record that already holds its patch: cleared with no notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    const current: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 5, a: 'gm-a' };

    // #when
    answer(room, { ...reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale'), current });
    await waitUntil(() => shown(player, STR_ROW.k)?.c === 5);
    await pause(30);

    // #then
    expect({
      sent: proposals(room).length,
      shown: shown(player, STR_ROW.k),
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ sent: 1, shown: current, pending: [], notifications: [] });
  });

  test('stale during catch-up: waits for its c until catch-up ends, then goes over that record', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    player.engine.catchUp();
    await waitUntil(() => player.store.$sync.get().state === 'catching-up');

    const current: VersionedRecord = { ...STR_ROW, d: { str: 20 }, c: 5, a: 'gm-a' };

    // #when
    answer(room, { ...reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale'), current });
    await pause(50);
    const during = proposals(room).length;

    await waitUntil(() => player.store.$sync.get().state === 'live');
    await waitUntil(() => proposals(room).length === 2);

    // #then
    expect({ during, sent: proposals(room)[1] }).toEqual({
      during: 1,
      sent: { k: STR_ROW.k, d: { str: 11 }, c: 6, a: PLAYER_ID },
    });
  });

  test('made during catch-up whose access was revoked meanwhile: never proposed, reverted, notified', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    player.engine.catchUp();
    await waitUntil(() => player.store.$sync.get().state === 'catching-up');
    send(player, strEdit('str', 11));
    await waitUntil(() => shown(player, STR_ROW.k)?.c === 3);

    // #when
    answer(room, commit([{ k: `acl:brok:${PLAYER_ID}`, d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => player.store.$sync.get().state === 'live');
    await waitUntil(() => player.platform.shownNotifications().length === 1);

    // #then
    expect({
      sent: proposals(room),
      shown: shown(player, STR_ROW.k),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ sent: [], shown: STR_ROW, notifications: [DENIED] });
  });

  test('of a sheet whose access is revoked while live: dropped at once with the values back and one notification', async () => {
    // #given: no quiet window, so each notification shown is one the engine asked for.
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 0 });

    send(player, strEdit('str', 11));
    send(player, swordEdit(3));
    await waitUntil(() => proposals(room).length === 2 && pendingKeys(player).length === 2);

    // #when: the revoke, then the GM's late denial of an entry it dropped.
    answer(room, commit([{ k: `acl:brok:${PLAYER_ID}`, d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => pendingKeys(player).length === 0);
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    await pause(50);

    // #then
    expect({
      shown: [shown(player, STR_ROW.k), shown(player, SWORD.k)],
      pending: player.store.$pending.get().size,
      notifications: player.platform.shownNotifications(),
    }).toEqual({ shown: [STR_ROW, SWORD], pending: 0, notifications: [DENIED] });
  });

  test("stays when another player's access to its sheet is revoked", async () => {
    // #given
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 0 });

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    // #when
    answer(room, commit([{ k: 'acl:brok:someone-else', d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => player.store.$replica.get().has('acl:brok:someone-else'));
    await pause(30);

    // #then
    expect({
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ pending: [STR_ROW.k], notifications: [] });
  });

  test('of another sheet stays when access to one sheet is revoked, whose entries drop', async () => {
    // #given: the player may edit Кира too.
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 0 });

    answer(room, commit([{ k: `acl:kira:${PLAYER_ID}`, d: { name: 'Оля' }, c: 1, a: 'gm-a' }]));
    await waitUntil(() => player.store.$replica.get().has(`acl:kira:${PLAYER_ID}`));
    send(player, strEdit('str', 11));
    send(player, {
      type: 'field-patch',
      sheetId: 'kira',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 7,
    });
    await waitUntil(() => proposals(room).length === 2 && pendingKeys(player).length === 2);

    // #when
    answer(room, commit([{ k: `acl:kira:${PLAYER_ID}`, d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => pendingKeys(player).length === 1);
    await pause(30);

    // #then
    expect({
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ pending: [STR_ROW.k], notifications: [DENIED] });
  });

  test('of a sheet whose access a state answer revokes during catch-up: dropped with one notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 0 });

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    const asked = heardOf(room, PLAYER_ID, 'state-request').length;

    player.engine.catchUp();
    await waitUntil(() => heardOf(room, PLAYER_ID, 'state-request').length > asked);

    const r = String(Object(heardOf(room, PLAYER_ID, 'state-request').at(-1)).r);

    const revoked = BASE.map((record) =>
      record.k === `acl:brok:${PLAYER_ID}` ? { ...record, d: null, c: 2, a: 'gm-a' } : record,
    );

    // #when
    answer(room, {
      v: 1,
      g: GENERATION,
      t: 'state',
      r,
      i: 1,
      n: 1,
      records: encodeStateRecords(revoked),
    });

    await waitUntil(() => player.store.$sync.get().state === 'live');
    await pause(30);

    // #then
    expect({
      shown: shown(player, STR_ROW.k),
      pending: pendingKeys(player),
      sent: proposals(room).length,
      notifications: player.platform.shownNotifications(),
    }).toEqual({ shown: STR_ROW, pending: [], sent: 1, notifications: [DENIED] });
  });

  test('waiting for its c during catch-up: dropped at the revoke, before catch-up ends', async () => {
    // #given: catch-up waits long for the silent GM.
    const { room, player } = await playerWithSilentGm({
      editDeniedQuietMs: 0,
      catchUpTimeoutMs: 5000,
    });

    player.engine.catchUp();
    await waitUntil(() => player.store.$sync.get().state === 'catching-up');
    send(player, strEdit('str', 11));
    await waitUntil(() => pendingKeys(player).length === 1);

    // #when
    answer(room, commit([{ k: `acl:brok:${PLAYER_ID}`, d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => pendingKeys(player).length === 0);

    // #then
    expect({
      state: player.store.$sync.get().state,
      shown: shown(player, STR_ROW.k),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ state: 'catching-up', shown: STR_ROW, notifications: [DENIED] });
  });

  test('of a sheet the GM deletes: dropped with the notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 0 });

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    // #when
    answer(room, commit([{ k: 'sheet:brok', d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => player.store.$replica.get().get('sheet:brok')?.d === null);
    await pause(30);

    // #then
    expect({
      pending: player.store.$pending.get().size,
      notifications: player.platform.shownNotifications(),
    }).toEqual({ pending: 0, notifications: [DENIED] });
  });

  test('of a repeat row the GM removes: dropped with the notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 0 });

    send(player, swordEdit(3));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    // #when
    answer(room, commit([{ ...SWORD, d: null, c: 5, a: 'gm-a' }]));
    await waitUntil(() => pendingKeys(player).length === 0);
    await pause(30);

    // #then
    expect({
      shown: shown(player, SWORD.k)?.d,
      notifications: player.platform.shownNotifications(),
    }).toEqual({ shown: null, notifications: [DENIED] });
  });

  test('removing a repeat row the GM removes too: dropped with no notification and never resent', async () => {
    // #given: an entry with no answer is resent every 40 ms.
    const { room, player } = await playerWithSilentGm({
      editDeniedQuietMs: 0,
      proposeResendStartMs: 40,
      proposeResendMaxMs: 40,
    });

    send(player, {
      type: 'repeat-row-delete',
      sheetId: 'brok',
      sectionId: 'item',
      instanceId: 'r1',
    });
    await waitUntil(() => proposals(room).length === 1 && player.store.$pending.get().size === 1);

    // #when
    answer(room, commit([{ ...SWORD, d: null, c: 5, a: 'gm-a' }]));
    await waitUntil(() => player.store.$pending.get().size === 0);
    const sent = proposals(room).length;

    await pause(200);

    // #then
    expect({
      resent: proposals(room).length - sent,
      notifications: player.platform.shownNotifications(),
    }).toEqual({ resent: 0, notifications: [] });
  });

  test('stays when a revoke and a re-grant of its access come in one batch', async () => {
    // #given
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 0 });

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    // #when
    answer(
      room,
      commit([
        { k: `acl:brok:${PLAYER_ID}`, d: null, c: 2, a: 'gm-a' },
        { k: `acl:brok:${PLAYER_ID}`, d: { name: 'Оля' }, c: 3, a: 'gm-a' },
      ]),
    );

    await waitUntil(() => player.store.$replica.get().get(`acl:brok:${PLAYER_ID}`)?.c === 3);
    await pause(30);

    // #then
    expect({
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({ pending: [STR_ROW.k], notifications: [] });
  });

  test('is cleared, with its pending view, when the player adopts a higher generation', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    const asked = heardOf(room, PLAYER_ID, 'state-request').length;

    player.engine.catchUp();
    await waitUntil(() => heardOf(room, PLAYER_ID, 'state-request').length > asked);

    const r = String(Object(heardOf(room, PLAYER_ID, 'state-request').at(-1)).r);

    // #when
    answer(room, {
      v: 1,
      g: { n: 1, a: 'gm-a' },
      t: 'state',
      r,
      i: 1,
      n: 1,
      records: encodeStateRecords(BASE),
    });

    await waitUntil(() => player.store.$sync.get().state === 'live');
    await pause(30);

    // #then
    expect({ shown: shown(player, STR_ROW.k), pending: pendingKeys(player) }).toEqual({
      shown: STR_ROW,
      pending: [],
    });
  });

  test('of a player made GM: applies as its own GM edit when catch-up ends and goes out in a commit', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);

    // #when
    player.platform.setRole('GM');
    await waitUntil(() => player.store.$sync.get().state === 'catching-up');
    await waitUntil(() => player.store.$sync.get().state === 'live');
    await waitUntil(() => heardOf(room, PLAYER_ID, 'commit').length === 1);

    // #then
    const applied: VersionedRecord = { k: STR_ROW.k, d: { str: 11 }, c: 4, a: PLAYER_ID };

    expect({
      sent: heardOf(room, PLAYER_ID, 'commit'),
      shown: shown(player, STR_ROW.k),
      pending: pendingKeys(player),
      proposals: proposals(room).length,
    }).toEqual({ sent: [commit([applied])], shown: applied, pending: [], proposals: 1 });
  });

  test('is resent as soon as the GM link comes back, before its backoff', async () => {
    // #given: the GM goes offline after 100 ms of silence.
    const { room, player } = await playerWithSilentGm({ gmLinkTimeoutMs: 100 });

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    await waitUntil(() => player.store.$sync.get().gmLink === 'offline');

    // #when
    answer(room, { v: 1, g: GENERATION, t: 'alive', digest: 0 });
    await waitUntil(() => proposals(room).length === 2);

    // #then
    const proposed: VersionedRecord = { k: STR_ROW.k, d: { str: 11 }, c: 3, a: PLAYER_ID };

    expect(proposals(room)).toEqual([proposed, proposed]);
  });

  test('denied twice further apart than the quiet window: two notifications', async () => {
    // #given
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 30 });

    send(player, strEdit('str', 11));
    send(player, swordEdit(3));
    await waitUntil(() => proposals(room).length === 2 && pendingKeys(player).length === 2);

    // #when
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    await waitUntil(() => player.platform.shownNotifications().length === 1);
    await pause(60);
    answer(room, reject({ k: SWORD.k, c: 2, a: PLAYER_ID }, 'denied'));
    await waitUntil(() => pendingKeys(player).length === 0);
    await pause(30);

    // #then
    expect(player.platform.shownNotifications()).toEqual([DENIED, DENIED]);
  });

  test('denied three times, the second within the window of the first: the third shows again', async () => {
    // #given: a quiet window of 150 ms, and denials about 90 ms apart.
    const { room, player } = await playerWithSilentGm({ editDeniedQuietMs: 150 });

    send(player, strEdit('str', 11));
    send(player, swordEdit(3));
    send(player, { type: 'repeat-row-add', sheetId: 'brok', sectionId: 'item', instanceId: 'r9' });
    await waitUntil(() => proposals(room).length === 3 && pendingKeys(player).length === 3);

    // #when
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    await waitUntil(() => player.platform.shownNotifications().length === 1);
    await pause(90);
    answer(room, reject({ k: SWORD.k, c: 2, a: PLAYER_ID }, 'denied'));
    await waitUntil(() => pendingKeys(player).length === 1);
    await pause(90);
    answer(room, reject({ k: 'rep:brok:item:r9', c: 1, a: PLAYER_ID }, 'denied'));
    await waitUntil(() => pendingKeys(player).length === 0);
    await pause(30);

    // #then
    expect(player.platform.shownNotifications()).toEqual([DENIED, DENIED]);
  });

  test('a stale answer that would grow it past one message: dropped with the notification', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1 && pendingKeys(player).length === 1);

    // Under the limit alone, and over it with the player's longer connection id and `c`.
    const current: VersionedRecord = { ...STR_ROW, d: { str: 20, note: 'ы'.repeat(7211) }, c: 5 };

    // #when
    answer(room, { ...reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale'), current });
    await waitUntil(() => player.platform.shownNotifications().length === 1);

    // #then
    expect({ sent: proposals(room).length, pending: pendingKeys(player) }).toEqual({
      sent: 1,
      pending: [],
    });
  });
});

describe('a player and a GM client together', () => {
  test("apply a player's field edit, row add and row removal on both clients", async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, SWORD.k) !== undefined);

    // #when
    send(player, strEdit('str', 11));
    send(player, { type: 'repeat-row-add', sheetId: 'brok', sectionId: 'item', instanceId: 'r9' });
    send(player, {
      type: 'repeat-row-delete',
      sheetId: 'brok',
      sectionId: 'item',
      instanceId: 'r1',
    });

    await waitUntil(
      () =>
        pendingKeys(player).length === 0 &&
        player.store.$replica.get().get(SWORD.k)?.d === null &&
        player.store.$replica.get().has('rep:brok:item:r9'),
    );

    // #then
    const expected: VersionedRecord[] = [
      { k: STR_ROW.k, d: { str: 11 }, c: 3, a: PLAYER_ID },
      { k: 'rep:brok:item:r9', d: { order: 1, cells: {} }, c: 1, a: PLAYER_ID },
      { k: SWORD.k, d: null, c: 2, a: PLAYER_ID },
    ];

    expect({
      gm: expected.map((record) => stored(gm, record.k)),
      player: expected.map((record) => player.store.$replica.get().get(record.k)),
    }).toEqual({ gm: expected, player: expected });
  });
});

// A GM loads the base and hands it to the player, then stops answering. It stays in the party, so
// the test speaks for it.
async function playerWithSilentGm(
  timing: Partial<Timing> = {},
): Promise<{ room: Room; player: Client }> {
  const room = openRoom();
  const gm = await startClient(room, 'gm-a');
  const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [], timing });

  await waitUntil(() => shown(player, SWORD.k) !== undefined);
  gm.engine.stop();

  return { room, player };
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions & { awaitLive?: boolean } = {},
): Promise<Client> {
  const backing = createBacking();
  const bus = createMemoryBus();
  const role = options.role ?? 'GM';

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: connectionId,
    role,
  };

  const created = createMockPlatform(bus, backing, identity);
  const platform = options.platform?.(created) ?? created;

  for (const record of options.seeded ?? BASE) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  platform.joinParty();

  const timing = { ...TIMING, ...options.timing };

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, timing), {
    timing,
    editDenied: DENIED,
  });

  const store = createProjectionStore();

  const window = startReplicaClient(
    createMockPlatform(bus, backing, identity).broadcast,
    createSendQueue(platform.broadcast, timing),
    store,
    timing,
  );

  cleanups.push(engine.stop, window.stop);

  await waitUntil(
    () =>
      store.$loaded.get() && (options.awaitLive === false || store.$sync.get().state === 'live'),
  );

  return { platform, backing, engine, store, window };
}

// The records of the room copy the GM wrote, or `null` before it wrote one.
function roomCopyRecords(room: Room): VersionedRecord[] | null {
  const value = room.room.getMetadata()['app.muster-roll/snapshot'];

  if (value === undefined) {
    return null;
  }

  const data = String(Object(value).data);
  const content = JSON.parse(strFromU8(inflateSync(new Uint8Array(Buffer.from(data, 'base64')))));

  return recordSchema.array().parse(content.records);
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

function joinPlayerSocket(room: Room): void {
  room.room.join({ id: PLAYER_ID, connectionId: PLAYER_SOCKET, name: 'Оля', role: 'PLAYER' });
}

function propose(room: Room, record: VersionedRecord, from = PLAYER_SOCKET): void {
  room.room.postRemote(
    SYNC_CHANNEL,
    { v: 1, g: GENERATION, t: 'propose', records: [record] },
    from,
  );
}

// A message from the GM client the test speaks for.
function answer(room: Room, data: JsonValue): void {
  room.room.postRemote(SYNC_CHANNEL, data, 'gm-a');
}

function commit(
  records: VersionedRecord[],
  acks?: { k: string; c: number; a: string }[],
): JsonValue {
  return acks === undefined
    ? { v: 1, g: GENERATION, t: 'commit', records }
    : { v: 1, g: GENERATION, t: 'commit', records, acks };
}

function reject(edit: { k: string; c: number; a: string }, reason: 'denied' | 'stale') {
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

function swordEdit(qty: number): Command {
  return {
    type: 'field-patch',
    sheetId: 'brok',
    target: { kind: 'rep', sectionId: 'item', instanceId: 'r1' },
    fieldId: 'qty',
    value: qty,
  };
}

// The messages of one type one client sent to the room, in send order.
function heardOf(room: Room, from: string, t: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === t ? [message.data] : [],
  );
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

  // The store keeps its keys in arrival order, which the tests do not fix.
  const keys = [...client.store.$records.get()].flatMap(([key, record]) =>
    replica.get(key) === record ? [] : [key],
  );

  keys.sort();

  return keys;
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

function shown(client: Client, key: string): VersionedRecord | undefined {
  return client.store.$records.get().get(key);
}

function stored(client: Client, key: string): VersionedRecord | null {
  const text = client.backing.get(`${STORAGE_PREFIX}${key}`);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
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
