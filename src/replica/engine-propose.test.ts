import { describe, expect, spyOn, test } from 'bun:test';

import { inflateSync, strFromU8 } from 'fflate';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { encodeStateRecords } from '@/core/state-records';
import type { Timing } from '@/core/timing';
import type { Command } from '@/core/ui-messages';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  createRoomRig,
  heardOf,
  outcome,
  pause,
  rejection,
  send,
  shown,
  storedRecord,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '@/replica/room-rig';

const GENERATION = { n: 0, a: '' };
const DENIED = 'Нет прав на правку';

// The fake player connection of the GM-side tests, and the player id its `acl:` names.
const PLAYER_SOCKET = 'p-socket';
const S = PLAYER_SOCKET;
const PLAYER_ID = 'player-a';

// "pc" is a sheet set whose repeat blocks a token can link to. "npc" is a single sheet only GMs
// see, "rules" one players see but do not edit, and "camp" one every player edits.
const PRESET: Preset = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [{ kind: 'field', type: 'text', id: 'name' }],
                [
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'field', type: 'text', id: 'note' },
                ],
              ],
            },
            {
              repeat: true,
              tokens: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'item' },
                  { kind: 'field', type: 'number', id: 'qty' },
                ],
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      players: 'edit',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] }],
    },
    {
      id: 'rules',
      kind: 'single',
      title: 'Правила',
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'text', id: 'rule' }]] }] }],
    },
    {
      id: 'camp',
      kind: 'single',
      title: 'Лагерь',
      players: 'edit',
      tabs: [
        {
          sections: [
            { rows: [[{ kind: 'field', type: 'number', id: 'food' }]] },
            { repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'cart' }]] },
          ],
        },
      ],
    },
  ],
};

const STR_ROW: VersionedRecord = { k: 'row:brok:str', d: { str: 10 }, c: 2, a: 'seed' };

const SWORD: VersionedRecord = {
  k: 'rep:brok:item:r1',
  d: { order: 0, cells: { item: 'Меч' } },
  c: 1,
  a: 'seed',
};

const REMOVED: VersionedRecord = { k: 'rep:brok:item:r2', d: null, c: 3, a: 'seed' };

// "Брок" is a sheet "player-a" may edit, and "Кира" one it may not.
const BASE: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'sheet:kira', d: { set: 'pc', order: 1 }, c: 1, a: 'seed' },
  { k: `acl:brok:${PLAYER_ID}`, d: { name: 'Оля' }, c: 1, a: 'seed' },
  STR_ROW,
  SWORD,
  REMOVED,
];

const roomRig = createRoomRig({
  seeded: BASE,
  timing: { proposeResendStartMs: 60000, proposeResendMaxMs: 60000 },
  until: 'live',
});

type Client = RigClient;

type Room = RigRoom;

type ClientOptions = {
  role?: PlayerRole;
  // Changes the engine's platform before it starts, such as to fail its storage reads.
  platform?: (platform: MockPlatform) => MockPlatform;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
};

describe('a GM client answers a proposal', () => {
  test('with c above the current one: merges it with c and a unchanged and commits it with its echo', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET };

    joinPlayerSocket(room);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #then
    expect({
      sent: heardOf(room, 'gm-a', 'commit'),
      stored: storedRecord(gm, proposed.k),
      shown: shown(gm, proposed.k),
    }).toEqual({
      sent: [commit([proposed], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }])],
      stored: proposed,
      shown: proposed,
    });
  });

  test('identical to the current record, also when sent again: the same commit with its echo', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET };

    joinPlayerSocket(room);
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 2);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'commit'), stored: storedRecord(gm, proposed.k) }).toEqual(
      {
        sent: [
          commit([proposed], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }]),
          commit([proposed], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }]),
        ],
        stored: proposed,
      },
    );
  });

  test("that removes a removed repeat block: commits the existing tombstone with the proposer's echo", async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    joinPlayerSocket(room);

    // #when
    propose(room, { ...REMOVED, c: 1, a: PLAYER_SOCKET });
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'commit'), stored: storedRecord(gm, REMOVED.k) }).toEqual({
      sent: [commit([REMOVED], [{ k: REMOVED.k, c: 1, a: PLAYER_SOCKET }])],
      stored: REMOVED,
    });
  });

  test.each<[string, VersionedRecord]>([
    ['an edit of a sheet with no access', { k: 'row:kira:str', d: { str: 1 }, c: 1, a: S }],
    // AD-4: `players: "edit"` gives no write on a sheet only GMs see.
    ['an edit of a single sheet only GMs see', { k: 'row:npc:str', d: { str: 1 }, c: 1, a: S }],
    [
      'an edit of a single sheet no player edits',
      { k: 'row:rules:rule', d: { rule: 'Я' }, c: 1, a: S },
    ],
    ['an edit of a removed repeat block', { ...REMOVED, d: { order: 0, cells: {} }, c: 9, a: S }],
    ['a value of another JSON type', { ...STR_ROW, d: { str: '11' }, c: 3, a: S }],
    ['a GM key form', { k: 'link:token-1', d: { s: 'brok' }, c: 1, a: S }],
    ['a removal of a plain row', { ...STR_ROW, d: null, c: 3, a: S }],
    ["an author that is not the sender's", { ...STR_ROW, d: { str: 11 }, c: 3, a: 'gm-b' }],
    ['a c far past the current one', { ...STR_ROW, d: { str: 11 }, c: 2_000_000, a: S }],
    [
      'a record too large for one message',
      { ...STR_ROW, d: { note: 'ы'.repeat(8000) }, c: 3, a: S },
    ],
  ])('of %s: rejects it as denied with its echo and keeps its records', async (_name, record) => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    joinPlayerSocket(room);

    // #when
    propose(room, record);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    expect({
      sent: heardOf(room, 'gm-a', 'reject'),
      commits: heardOf(room, 'gm-a', 'commit'),
      stored: storedRecord(gm, record.k),
    }).toEqual({
      sent: [reject(record, 'denied')],
      commits: [],
      stored: BASE.find((seeded) => seeded.k === record.k) ?? null,
    });
  });

  test('of a single sheet every player edits, from a player with no access: commits it', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { k: 'row:camp:food', d: { food: 3 }, c: 1, a: S };

    joinPlayerSocket(room);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'commit'), stored: storedRecord(gm, proposed.k) }).toEqual(
      {
        sent: [commit([proposed], [{ k: proposed.k, c: 1, a: S }])],
        stored: proposed,
      },
    );
  });

  test('that removes a repeat block: tombstones the links to it too, and keeps other links', async () => {
    // #given: AD-19, t1 and t2 link the sword and t3 links the sheet.
    const room = roomRig.openRoom();

    const sheetLink: VersionedRecord = { k: 'link:t3', d: { s: 'brok' }, c: 1, a: 'seed' };

    const links: VersionedRecord[] = [
      { k: 'link:t1', d: { s: 'brok', i: 'r1' }, c: 2, a: 'seed' },
      { k: 'link:t2', d: { s: 'brok', i: 'r1' }, c: 1, a: 'seed' },
      sheetLink,
    ];

    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, ...links] });
    const removal: VersionedRecord = { ...SWORD, d: null, c: 2, a: S };

    joinPlayerSocket(room);

    // #when
    propose(room, removal);
    await waitUntil(() => committedRecords(room, 'gm-a').length === 3);

    // #then
    const tombstones: VersionedRecord[] = [
      { k: 'link:t1', d: null, c: 3, a: 'gm-a' },
      { k: 'link:t2', d: null, c: 2, a: 'gm-a' },
    ];

    expect({
      sent: committedRecords(room, 'gm-a'),
      stored: links.map((link) => storedRecord(gm, link.k)),
    }).toEqual({
      sent: [removal, ...tombstones],
      stored: [...tombstones, sheetLink],
    });
  });

  test('with a c not above the current one: rejects it as stale with the current record', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { ...STR_ROW, d: { str: 11 }, c: 2, a: PLAYER_SOCKET };

    joinPlayerSocket(room);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'reject'), stored: storedRecord(gm, STR_ROW.k) }).toEqual({
      sent: [{ ...reject(proposed, 'stale'), current: STR_ROW }],
      stored: STR_ROW,
    });
  });

  test('with a field id absent from the row: rejects it as stale with the current record', async () => {
    // #given: AD-4, as a player whose preset is older sends it, so it applies its patch again.
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = { ...STR_ROW, d: { qty: 1 }, c: 3, a: PLAYER_SOCKET };

    joinPlayerSocket(room);

    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    expect({ sent: heardOf(room, 'gm-a', 'reject'), stored: storedRecord(gm, STR_ROW.k) }).toEqual({
      sent: [{ ...reject(proposed, 'stale'), current: STR_ROW }],
      stored: STR_ROW,
    });
  });

  test('on two GM clients: both store the same record and both commit its echo', async () => {
    // #given
    const room = roomRig.openRoom();
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
      stored: [storedRecord(gmA, proposed.k), storedRecord(gmB, proposed.k)],
      sent: [heardOf(room, 'gm-a', 'commit'), heardOf(room, 'gm-b', 'commit')],
    }).toEqual({ stored: [proposed, proposed], sent: [[echo], [echo]] });
  });

  test('while catching up: neither commits nor rejects, also after its catch-up ends', async () => {
    // #given: a GM that never answers holds this client in catch-up.
    const room = roomRig.openRoom();

    room.room.join({ id: 'ghost', connectionId: 'ghost', name: 'ghost', role: 'GM' });

    const gm = await startClient(room, 'gm-a', { until: 'loaded' });

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
      stored: storedRecord(gm, STR_ROW.k),
    }).toEqual({ during: 'catching-up', answers: [], stored: STR_ROW });
  });

  test('from a connection the party does not know: drops it with no answer', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    propose(room, { ...STR_ROW, d: { str: 11 }, c: 3, a: 'stranger' }, 'stranger');
    await pause(50);

    // #then
    expect({
      answers: [...heardOf(room, 'gm-a', 'commit'), ...heardOf(room, 'gm-a', 'reject')],
      stored: storedRecord(gm, STR_ROW.k),
    }).toEqual({ answers: [], stored: STR_ROW });
  });

  test('with a stale c whose current record is too large to go back with the answer: denied', async () => {
    // #given: the GM's record and the long connection id fill one message between them.
    const socket = `p-${'x'.repeat(1000)}`;
    const big: VersionedRecord = { ...STR_ROW, d: { str: 10, note: 'ы'.repeat(7000) } };
    const room = roomRig.openRoom();

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

    const room = roomRig.openRoom();

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
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    joinPlayerSocket(room);

    // #when
    room.post(PLAYER_SOCKET, {
      v: 3,
      g: { n: 1, a: 'other' },
      t: 'propose',
      records: [{ ...STR_ROW, d: { str: 11 }, c: 3, a: PLAYER_SOCKET }],
    });

    await pause(50);

    // #then
    expect({
      answers: [...heardOf(room, 'gm-a', 'commit'), ...heardOf(room, 'gm-a', 'reject')],
      stored: storedRecord(gm, STR_ROW.k),
    }).toEqual({ answers: [], stored: STR_ROW });
  });

  test('that it commits: writes the room copy after the pause', async () => {
    // #given
    const room = roomRig.openRoom();

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
  test("answers when pending edits accepts it, and the GM's later reject is no second answer", async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    // #when
    const id = send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    await pause(10);
    const accepted = outcome(player, id);
    answer(room, reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'denied'));
    await pause(10);

    // #then
    expect({
      accepted,
      afterReject: outcome(player, id),
      answers: player.local
        .filter(
          (message) =>
            (Object(message).t === 'command-done' || Object(message).t === 'command-rejected') &&
            Object(message).id === id,
        )
        .map((message) => Object(message).t),
    }).toEqual({
      accepted: { kind: 'answered', answer: undefined },
      afterReject: { kind: 'answered', answer: undefined },
      answers: ['command-done'],
    });
  });

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

  test('of a sheet of a sheet set with no access: refused as not-allowed and never proposed', async () => {
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

describe("a player's entry over its lifetime", () => {
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
      v: 3,
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
    answer(room, { v: 3, g: GENERATION, t: 'alive', digest: 0 });
    await waitUntil(() => proposals(room).length === 2);

    // #then
    const proposed: VersionedRecord = { k: STR_ROW.k, d: { str: 11 }, c: 3, a: PLAYER_ID };

    expect(proposals(room)).toEqual([proposed, proposed]);
  });
});

describe('a player and a GM client together', () => {
  test("apply a player's field edit, repeat block add and repeat block removal on both clients", async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, SWORD.k) !== undefined);

    // #when
    send(player, strEdit('str', 11));
    send(player, {
      type: 'repeat-block-add',
      sheetId: 'brok',
      sectionId: 'item',
      instanceId: 'r9',
    });
    send(player, {
      type: 'repeat-block-delete',
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
      gm: expected.map((record) => storedRecord(gm, record.k)),
      player: expected.map((record) => player.store.$replica.get().get(record.k)),
    }).toEqual({ gm: expected, player: expected });
  });
});

// A GM loads the base and hands it to the player, then stops answering. It stays in the party, so
// the test speaks for it.
async function playerWithSilentGm(
  timing: Partial<Timing> = {},
): Promise<{ room: Room; player: Client }> {
  const room = roomRig.openRoom();
  const gm = await startClient(room, 'gm-a');
  const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [], timing });

  await waitUntil(() => shown(player, SWORD.k) !== undefined);
  gm.engine.stop();

  return { room, player };
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions & { until?: 'loaded' | 'live' } = {},
): Promise<Client> {
  return roomRig.startClient(room, connectionId, {
    ...options,
    until: options.until ?? 'live',
    engine: { editDenied: DENIED },
  });
}

function joinPlayerSocket(room: Room): void {
  room.room.join({ id: PLAYER_ID, connectionId: PLAYER_SOCKET, name: 'Оля', role: 'PLAYER' });
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

function propose(room: Room, record: VersionedRecord, from = PLAYER_SOCKET): void {
  room.post(from, { v: 3, g: GENERATION, t: 'propose', records: [record] });
}

// A message from the GM client the test speaks for.
function answer(room: Room, data: JsonValue): void {
  room.post('gm-a', data);
}

function commit(
  records: VersionedRecord[],
  acks?: { k: string; c: number; a: string }[],
): JsonValue {
  return acks === undefined
    ? { v: 3, g: GENERATION, t: 'commit', records }
    : { v: 3, g: GENERATION, t: 'commit', records, acks };
}

function reject(edit: { k: string; c: number; a: string }, reason: 'denied' | 'stale') {
  return { v: 3, g: GENERATION, t: 'reject', k: edit.k, c: edit.c, a: edit.a, reason };
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

// The records one client sent to the room in commits, in send order.
function committedRecords(room: Room, from: string): VersionedRecord[] {
  return heardOf(room, from, 'commit').flatMap((data) =>
    recordSchema.array().parse(Object(data).records),
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
