import { fixturePatch } from '../../tests/support/block-fixtures';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, spyOn, test } from 'bun:test';
import { inflateSync, strFromU8 } from 'fflate';
import type { JsonValue } from '@/core/json';
import { jsonByteLength } from '@/core/message-size';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { encodeStateRecords } from '@/core/state-records';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type WireCommand } from '@/core/ui-messages';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import type { Wait } from '@/platform/send-queue';
import {
  copyValue,
  createRoomRig,
  heardOf,
  outcome,
  pause,
  rejection,
  send,
  shown,
  storageKey,
  storedRecord,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

const GENERATION = { n: 0, a: '' };
const DENIED = 'Нет прав на правку';

// The fake player connection of the GM-side tests, and the player id its `acl:` names.
const PLAYER_SOCKET = 'p-socket';
const S = PLAYER_SOCKET;
const PLAYER_ID = 'player-a';

// "pc" is a sheet set whose repeat blocks a token can link to. "npc" is a single sheet only GMs
// see, "rules" one players see but do not edit, and "camp" one every player edits.
const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',
      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [
        {
          title: 'Основное',
          sections: [
            {
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'str' },
                    { kind: 'field', type: 'text', id: 'note' },
                  ],
                },
              ],
            },
            {
              repeat: { id: 'item', nameField: 'item' },

              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'item' },
                    { kind: 'field', type: 'number', id: 'qty' },
                    { kind: 'token', id: 'token' },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: 'Задания',
          repeat: { id: 'quest', nameField: 'quest' },
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'quest' },
                    { kind: 'token', id: 'token' },
                  ],
                },
              ],
            },
            {
              visibility: 'gm',
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'secret' }] }],
            },
          ],
        },
        {
          title: 'Заметки мастера',
          visibility: 'gm',
          sections: [
            { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'secret' }] }] },
            {
              repeat: { id: 'secret_item', nameField: 'secret_item' },
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'secret_item' }] }],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',

      title: 'NPC',
      visibility: 'gm',
      players: 'edit',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'str' }] }] }] }],
    },
    {
      id: 'rules',

      title: 'Правила',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'rule' }] }] }] }],
    },
    {
      id: 'camp',

      title: 'Лагерь',
      players: 'edit',
      tabs: [
        {
          sections: [
            { rows: [{ cells: [{ kind: 'field', type: 'number', id: 'food' }] }] },
            {
              repeat: { id: 'cart', nameField: 'cart' },
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'cart' }] }],
            },
          ],
        },
      ],
    },
  ],
};

const STR_ROW: VersionedRecord = {
  k: 'blk:brok',
  d: { set: 'pc', order: 0, cells: { str: [10, 2, 'seed'] } },
  c: 2,
  a: 'seed',
  l: [1, 'seed'],
};

const SWORD: VersionedRecord = {
  k: 'blk:brok:item:r1',
  d: { order: 0, cells: { item: ['Меч', 1, 'seed'] } },
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
};

const REMOVED: VersionedRecord = {
  k: 'blk:brok:item:r2',
  d: null,
  c: 3,
  a: 'seed',
  l: [1, 'seed'],
};

// "Брок" is a sheet "player-a" may edit, and "Кира" one it may not.
const BASE: readonly VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'blk:kira', d: { set: 'pc', order: 1, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
  { k: 'blk:npc', d: { order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
  { k: 'blk:rules', d: { order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
  { k: 'blk:camp', d: { order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
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
  sendWait?: Wait;
};

describe('a GM client answers a proposal', () => {
  test('with c above the current one: merges it with c and a unchanged and commits it with its echo', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
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
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
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
  test('an idempotent proposal does not owe an unchanged room-copy write', async () => {
    // #given
    const room = roomRig.openRoom();
    let metadataWrites = 0;
    let rejectMetadata = false;

    const gm = await startClient(room, 'gm-a', {
      timing: { snapshotPauseMs: 10 },
      platform: (platform) => {
        const metadata = platform.metadata;

        return {
          ...platform,
          metadata: {
            ...metadata,
            setMetadata: (update) => {
              if (!rejectMetadata) {
                return metadata.setMetadata(update);
              }

              metadataWrites += 1;

              return Promise.reject(new Error('metadata write failed'));
            },
          },
        };
      },
    });

    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
    joinPlayerSocket(room);
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);
    await pause(30);
    rejectMetadata = true;
    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 2);
    await pause(50);
    // #then
    expect({ metadataWrites, notices: gm.store.$notices.get() }).toEqual({
      metadataWrites: 0,
      notices: [],
    });
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
  test('a repeat tombstone with no links does not owe an unchanged room-copy write', async () => {
    // #given
    const room = roomRig.openRoom();
    // The room copy already holds what the GM stores, so only the step under test could owe a write.
    room.room.setMetadata({ 'app.muster-roll/snapshot': copyValue({ n: 0, a: '' }, BASE) });
    let metadataWrites = 0;

    const gm = await startClient(room, 'gm-a', {
      timing: { snapshotPauseMs: 10 },
      platform: (platform) => ({
        ...platform,
        metadata: {
          ...platform.metadata,
          setMetadata: () => {
            metadataWrites += 1;

            return Promise.reject(new Error('metadata write failed'));
          },
        },
      }),
    });

    joinPlayerSocket(room);
    // #when
    propose(room, { ...REMOVED, c: 1, a: PLAYER_SOCKET });
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);
    await pause(50);
    // #then
    expect({ metadataWrites, notices: gm.store.$notices.get() }).toEqual({
      metadataWrites: 0,
      notices: [],
    });
  });
  test.each([
    {
      name: 'immediately publishes links removed by an existing repeat tombstone',
      snapshotPauseMs: 60000,
      observationPauseMs: 0,
      copied: undefined,
    },
    {
      name: 'persists links removed by an existing repeat tombstone in the room copy',
      snapshotPauseMs: 10,
      observationPauseMs: 50,
      copied: { k: 'link:late', d: null, c: 2, a: 'gm-a' },
    },
  ])('$name', async ({ snapshotPauseMs, observationPauseMs, copied }) => {
    // #given
    const room = roomRig.openRoom();

    const link: VersionedRecord = {
      k: 'link:late',
      d: { s: 'brok', path: ['item', 'r2'], c: 'token' },
      c: 1,
      a: 'seed',
    };

    const gm = await startClient(room, 'gm-a', {
      seeded: [...BASE, link],
      timing: { snapshotPauseMs },
    });

    joinPlayerSocket(room);
    // #when
    propose(room, { ...REMOVED, c: 1, a: PLAYER_SOCKET });
    await waitUntil(() => committedRecords(room, 'gm-a').some((record) => record.k === REMOVED.k));
    await pause(observationPauseMs);
    // #then
    expect({
      sent: committedRecords(room, 'gm-a'),
      stored: storedRecord(gm, link.k),
      shown: shown(gm, link.k),
      copied: roomCopyRecords(room)?.find((record) => record.k === link.k),
    }).toEqual({
      sent: [REMOVED, { k: link.k, d: null, c: 2, a: 'gm-a' }],
      stored: { k: link.k, d: null, c: 2, a: 'gm-a' },
      shown: { k: link.k, d: null, c: 2, a: 'gm-a' },
      copied,
    });
  });
  test.each<[string, VersionedRecord]>([
    [
      'an edit of a sheet with no access',
      { k: 'blk:kira', d: { order: 0, cells: { str: [1, 1, S] } }, c: 1, a: S, l: [1, 'seed'] },
    ],
    [
      'a row field on a hidden tab of a visible sheet with access',
      {
        k: 'blk:brok',
        d: { order: 0, cells: { secret: ['Лич', 1, S] } },
        c: 1,
        a: S,
        l: [1, 'seed'],
      },
    ],
    [
      'a repeat field on a hidden tab of a visible sheet with access',
      {
        k: 'blk:brok:secret_item:s1',
        d: { order: 0, cells: { secret_item: ['Ключ', 1, S] } },
        c: 1,
        a: S,
        l: [1, 'seed'],
      },
    ],
    // AD-4: `players: "edit"` gives no write on a sheet only GMs see.
    [
      'an edit of a single sheet only GMs see',
      { k: 'blk:npc', d: { order: 0, cells: { str: [1, 1, S] } }, c: 1, a: S, l: [1, 'seed'] },
    ],
    [
      'an edit of a single sheet no player edits',
      { k: 'blk:rules', d: { order: 0, cells: { rule: ['Я', 1, S] } }, c: 1, a: S, l: [1, 'seed'] },
    ],
    ['an edit of a removed repeat block', fixturePatch(REMOVED, { order: 0, cells: {} }, 9, S)],
    ['a value of another JSON type', fixturePatch(STR_ROW, { str: '11' }, 3, S)],
    ['a GM key form', { k: 'link:token-1', d: { s: 'brok', c: 'token' }, c: 1, a: S }],
    ['a removal of a plain row', fixturePatch(STR_ROW, null, 3, S)],
    ["an author that is not the sender's", fixturePatch(STR_ROW, { str: 11 }, 3, 'gm-b')],
    ['a c far past the current one', fixturePatch(STR_ROW, { str: 11 }, 2000000, S)],
    ['a record too large for one message', fixturePatch(STR_ROW, { note: 'ы'.repeat(8000) }, 3, S)],
  ])('of %s: rejects it as denied with its echo and keeps its records', async (_name, record) => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    joinPlayerSocket(room);
    // #when
    propose(room, record);
    await waitUntil(
      () => heardOf(room, 'gm-a', 'reject').length + heardOf(room, 'gm-a', 'commit').length === 1,
    );
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
  test('from a player that creates a repeat-tab block: rejects it without a commit, GM record, or room copy', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { timing: { snapshotPauseMs: 10 } });

    const proposed: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: { order: 0, cells: { quest: ['Найти меч', 1, PLAYER_SOCKET] } },
      c: 1,
      a: PLAYER_SOCKET,
      l: [1, PLAYER_SOCKET],
    };

    joinPlayerSocket(room);
    // #when
    propose(room, proposed);
    await waitUntil(
      () => heardOf(room, 'gm-a', 'reject').length + heardOf(room, 'gm-a', 'commit').length === 1,
    );
    await pause(30);
    // #then
    expect({
      rejected: heardOf(room, 'gm-a', 'reject'),
      commits: heardOf(room, 'gm-a', 'commit'),
      stored: storedRecord(gm, proposed.k),
      copied: roomCopyRecords(room)?.find((record) => record.k === proposed.k),
    }).toEqual({
      rejected: [reject(proposed, 'denied')],
      commits: [],
      stored: null,
      copied: undefined,
    });
  });
  test('from a player that changes a GM-only source-section field in a visible repeat tab: rejects it and keeps the block', async () => {
    // #given
    const block: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: {
        order: 0,
        cells: { quest: ['Найти меч', 1, 'seed'], secret: ['Лич', 1, 'seed'] },
      },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const proposed = fixturePatch(block, { secret: 'Ключ' }, 2, PLAYER_SOCKET);
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, block] });
    joinPlayerSocket(room);
    // #when
    propose(room, proposed);
    await waitUntil(
      () => heardOf(room, 'gm-a', 'reject').length + heardOf(room, 'gm-a', 'commit').length === 1,
    );
    // #then
    expect({
      rejected: heardOf(room, 'gm-a', 'reject'),
      commits: heardOf(room, 'gm-a', 'commit'),
      stored: storedRecord(gm, block.k),
    }).toEqual({
      rejected: [reject(proposed, 'denied')],
      commits: [],
      stored: block,
    });
  });
  test('accepts a visible nested field under the second same-named child scope', async () => {
    // #given
    const fixture = nestedAccessFixture({ hiddenNpc: true });
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: fixture.records });
    const proposed = fixturePatch(fixture.bossChild, { attack_name: 'Bite' }, 2, PLAYER_SOCKET);
    joinPlayerSocket(room);

    // #when
    propose(room, proposed);
    await waitUntil(
      () => heardOf(room, 'gm-a', 'commit').length + heardOf(room, 'gm-a', 'reject').length === 1,
    );

    // #then
    expect({
      commits: heardOf(room, 'gm-a', 'commit'),
      rejected: heardOf(room, 'gm-a', 'reject'),
      child: storedRecord(gm, fixture.bossChild.k),
      parent: storedRecord(gm, fixture.bossParent.k),
      hiddenSibling: storedRecord(gm, fixture.npcParent.k),
    }).toEqual({
      commits: [commit([proposed], [{ k: proposed.k, c: 2, a: PLAYER_SOCKET }])],
      rejected: [],
      child: proposed,
      parent: fixture.bossParent,
      hiddenSibling: fixture.npcParent,
    });
  });
  test('from a player that deletes a repeat-tab block: rejects it and preserves its token link', async () => {
    // #given
    const block: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: { order: 0, cells: { quest: ['Найти меч', 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const link: VersionedRecord = {
      k: 'link:quest-token',
      d: { s: 'brok', path: ['quest', 'q1'], c: 'token' },
      c: 1,
      a: 'seed',
    };

    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, block, link] });
    const proposed = fixturePatch(block, null, 2, PLAYER_SOCKET);

    joinPlayerSocket(room);
    // #when
    propose(room, proposed);
    await waitUntil(
      () => heardOf(room, 'gm-a', 'reject').length + heardOf(room, 'gm-a', 'commit').length === 1,
    );
    // #then
    expect({
      rejected: heardOf(room, 'gm-a', 'reject'),
      commits: heardOf(room, 'gm-a', 'commit'),
      stored: [storedRecord(gm, block.k), storedRecord(gm, link.k)],
    }).toEqual({
      rejected: [reject(proposed, 'denied')],
      commits: [],
      stored: [block, link],
    });
  });
  test('of a single sheet every player edits, from a player with no access: commits it', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    const proposed: VersionedRecord = {
      k: 'blk:camp',
      d: { order: 0, cells: { food: [3, 2, S] } },
      c: 2,
      a: S,
      l: [1, 'seed'],
    };

    joinPlayerSocket(room);
    // #when
    propose(room, proposed);
    await waitUntil(
      () => heardOf(room, 'gm-a', 'commit').length + heardOf(room, 'gm-a', 'reject').length === 1,
    );
    // #then
    expect({
      sent: heardOf(room, 'gm-a', 'commit'),
      rejected: heardOf(room, 'gm-a', 'reject'),
      stored: storedRecord(gm, proposed.k),
    }).toEqual({
      sent: [commit([proposed], [{ k: proposed.k, c: 2, a: S }])],
      rejected: [],
      stored: proposed,
    });
  });
  test('that removes a repeat block: tombstones the links to it too, and keeps other links', async () => {
    // #given: AD-19, t1 and t2 link the sword and t3 links the sheet.
    const room = roomRig.openRoom();

    const sheetLink: VersionedRecord = {
      k: 'link:t3',
      d: { s: 'brok', c: 'token' },
      c: 1,
      a: 'seed',
    };

    const links: VersionedRecord[] = [
      {
        k: 'link:t1',
        d: { s: 'brok', path: ['item', 'r1'], c: 'token' },
        c: 2,
        a: 'seed',
      },
      {
        k: 'link:t2',
        d: { s: 'brok', path: ['item', 'r1'], c: 'token' },
        c: 1,
        a: 'seed',
      },
      sheetLink,
    ];

    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, ...links] });
    const removal: VersionedRecord = fixturePatch(SWORD, null, 2, S);
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
  test('that removes a nested repeat block: tombstones the link to that block', async () => {
    // #given
    const nestedPreset: Preset = {
      v: 4,
      templates: [
        {
          id: 'encounter',
          title: 'Encounter',
          players: 'edit',
          tabs: [
            {
              repeat: { id: 'npc', nameField: 'npc_name' },
              sections: [
                { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'npc_name' }] }] },
                {
                  repeat: { id: 'atk', nameField: 'attack_name' },
                  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'attack_name' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const child: VersionedRecord = {
      k: 'blk:encounter:npc:a:atk:x',
      d: { order: 0, cells: { attack_name: ['Claw', 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const link: VersionedRecord = {
      k: 'link:child',
      d: { s: 'encounter', path: ['npc', 'a', 'atk', 'x'], c: 'token' },
      c: 1,
      a: 'seed',
    };

    const nestedRig = createRoomRig({
      seeded: [
        { k: 'preset', d: encodePreset(nestedPreset), c: 1, a: 'seed' },
        { k: 'blk:encounter', d: { order: 0, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
        {
          k: 'blk:encounter:npc:a',
          d: { order: 0, cells: { npc_name: ['A', 1, 'seed'] } },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        child,
        link,
      ],
      until: 'live',
    });

    const room = nestedRig.openRoom();
    const gm = await nestedRig.startClient(room, 'gm-a');
    const removal: VersionedRecord = { ...child, d: null, c: 2, a: PLAYER_SOCKET };
    joinPlayerSocket(room);

    // #when
    propose(room, removal);
    await nestedRig.waitUntil(() => committedRecords(room, 'gm-a').length === 2);

    // #then
    expect({
      sent: committedRecords(room, 'gm-a'),
      stored: storedRecord(gm, link.k),
    }).toEqual({
      sent: [removal, { k: 'link:child', d: null, c: 2, a: 'gm-a' }],
      stored: { k: 'link:child', d: null, c: 2, a: 'gm-a' },
    });
  });
  test('sent again after a later GM edit of its field: commits the GM record with its echo, not stale', async () => {
    // #given: the GM committed the proposal, its commit never reached the player, and the GM then
    // edited the same field.
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
    joinPlayerSocket(room);
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);
    send(gm, strEdit('str', 15));
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 2);
    const later = fixturePatch(STR_ROW, { str: 15 }, 4, 'gm-a');
    // #when: the player's resend timer sends the same proposal.
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 3);
    await pause(20);
    // #then
    expect({
      answer: heardOf(room, 'gm-a', 'commit').at(-1),
      rejects: heardOf(room, 'gm-a', 'reject'),
      stored: storedRecord(gm, proposed.k),
    }).toEqual({
      answer: commit([later], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }]),
      rejects: [],
      stored: later,
    });
  });
  test('already held when proposed, then sent again after a later GM edit: commits the GM record with its echo', async () => {
    // #given: the GM already held the proposed record, so it answered commit-existing; its commit
    // never reached the player, and the GM then edited the same field.
    const room = roomRig.openRoom();
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);

    const gm = await startClient(room, 'gm-a', {
      seeded: BASE.map((record) => (record.k === proposed.k ? proposed : record)),
    });

    joinPlayerSocket(room);
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);
    send(gm, strEdit('str', 15));
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 2);
    const later = fixturePatch(STR_ROW, { str: 15 }, 4, 'gm-a');
    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 3);
    // #then
    expect({
      answer: heardOf(room, 'gm-a', 'commit').at(-1),
      rejects: heardOf(room, 'gm-a', 'reject'),
    }).toEqual({
      answer: commit([later], [{ k: proposed.k, c: 3, a: PLAYER_SOCKET }]),
      rejects: [],
    });
  });
  test('with a c not above the current one: rejects it as stale with the current record', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 2, PLAYER_SOCKET);
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
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { qty: 1 }, 3, PLAYER_SOCKET);
    joinPlayerSocket(room);
    // #when
    propose(room, proposed);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    const current = fixtureRecord(
      STR_ROW.k,
      { set: 'pc', order: 0, cells: {} },
      STR_ROW.c,
      STR_ROW.a,
    );

    expect({ sent: heardOf(room, 'gm-a', 'reject'), stored: storedRecord(gm, STR_ROW.k) }).toEqual({
      sent: [{ ...reject(proposed, 'stale'), current }],
      stored: STR_ROW,
    });
  });
  test('re-proposes only the edited field and retains the GM tuple when a large stale read-back arrives in two fragments', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const current = fixturePatch(STR_ROW, { str: 20, note: 'ы'.repeat(7000) }, 5, 'gm-a');
    const first = fixturePatch(current, { str: 20 }, current.c, current.a);
    const second = fixturePatch(current, { note: 'ы'.repeat(7000) }, current.c, current.a);
    // #when
    answer(room, {
      ...reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale'),
      current: first,
      i: 1,
      n: 2,
    });
    answer(room, {
      ...reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale'),
      current: second,
      i: 2,
      n: 2,
    });
    await pause(30);
    // #then
    expect({
      sent: proposals(room).slice(1),
      shown: shown(player, STR_ROW.k),
      pending: pendingKeys(player),
    }).toEqual({
      sent: [fixturePatch(STR_ROW, { str: 11 }, 6, PLAYER_ID)],
      shown: {
        k: STR_ROW.k,
        d: {
          set: 'pc',
          order: 0,
          cells: {
            str: [11, 6, PLAYER_ID],
            note: ['ы'.repeat(7000), 5, 'gm-a'],
          },
        },
        c: 6,
        a: PLAYER_ID,
        l: [1, 'seed'],
      },
      pending: [STR_ROW.k],
    });
  });
  test('does not acknowledge or persist a proposal with more than 32 fragments, then accepts a control proposal', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
    const control = fixturePatch(SWORD, { qty: 2 }, 2, PLAYER_SOCKET);
    const acceptedControl = fixturePatch(SWORD, { item: 'Меч', qty: 2 }, 2, PLAYER_SOCKET);
    joinPlayerSocket(room);
    // #when

    for (let i = 1; i <= 33; i += 1) {
      proposeFragment(room, proposed, i, 33);
    }

    await pause(50);
    propose(room, control);
    await waitUntil(() =>
      committedRecords(room, 'gm-a').some(
        (record) => record.k === control.k && record.c === control.c && record.a === control.a,
      ),
    );
    // #then
    expect({
      commits: heardOf(room, 'gm-a', 'commit'),
      stored: [storedRecord(gm, proposed.k), storedRecord(gm, control.k)],
    }).toEqual({
      commits: [commit([acceptedControl], [{ k: control.k, c: control.c, a: control.a }])],
      stored: [STR_ROW, acceptedControl],
    });
  });
  test('evicts the oldest of 33 incomplete proposals before a later part completes it, then accepts a control proposal', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const oldest = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
    const control = fixturePatch(SWORD, { qty: 2 }, 2, PLAYER_SOCKET);
    const acceptedControl = fixturePatch(SWORD, { item: 'Меч', qty: 2 }, 2, PLAYER_SOCKET);
    joinPlayerSocket(room);
    // #when

    for (let counter = oldest.c; counter < oldest.c + 33; counter += 1) {
      proposeFragment(room, { ...oldest, c: counter }, 1, 2);
    }

    proposeFragment(room, oldest, 2, 2);
    await pause(50);
    propose(room, control);
    await waitUntil(() =>
      committedRecords(room, 'gm-a').some(
        (record) => record.k === control.k && record.c === control.c && record.a === control.a,
      ),
    );
    // #then
    expect({
      commits: heardOf(room, 'gm-a', 'commit'),
      stored: [storedRecord(gm, oldest.k), storedRecord(gm, control.k)],
    }).toEqual({
      commits: [commit([acceptedControl], [{ k: control.k, c: control.c, a: control.a }])],
      stored: [STR_ROW, acceptedControl],
    });
  });
  test('expires an incomplete proposal when its second part arrives after 60 seconds, then accepts a control proposal', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const proposed = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
    const control = fixturePatch(SWORD, { qty: 2 }, 2, PLAYER_SOCKET);
    const acceptedControl = fixturePatch(SWORD, { item: 'Меч', qty: 2 }, 2, PLAYER_SOCKET);
    let now = 1_000;
    const clock = spyOn(Date, 'now').mockImplementation(() => now);
    joinPlayerSocket(room);
    // #when

    try {
      proposeFragment(room, proposed, 1, 2);
      await pause(20);
      now += 60_001;
      proposeFragment(room, proposed, 2, 2);
      await pause(20);
      propose(room, control);
      await waitUntil(() =>
        committedRecords(room, 'gm-a').some(
          (record) => record.k === control.k && record.c === control.c && record.a === control.a,
        ),
      );
      // #then
      expect({
        commits: heardOf(room, 'gm-a', 'commit'),
        stored: [storedRecord(gm, proposed.k), storedRecord(gm, control.k)],
      }).toEqual({
        commits: [commit([acceptedControl], [{ k: control.k, c: control.c, a: control.a }])],
        stored: [STR_ROW, acceptedControl],
      });
    } finally {
      clock.mockRestore();
    }
  });
  test('does not persist or acknowledge a duplicate partial proposal before a forbidden second part, then accepts a control proposal', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const edit = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
    const forbidden = fixturePatch(STR_ROW, { secret: 'Лич' }, edit.c, edit.a);
    const control = fixturePatch(SWORD, { qty: 2 }, 2, PLAYER_SOCKET);
    const acceptedControl = fixturePatch(SWORD, { item: 'Меч', qty: 2 }, 2, PLAYER_SOCKET);
    joinPlayerSocket(room);
    // #when
    proposeFragment(room, edit, 1, 2);
    proposeFragment(room, edit, 1, 2);
    await pause(20);

    const beforeCompletion = {
      commits: heardOf(room, 'gm-a', 'commit'),
      rejects: heardOf(room, 'gm-a', 'reject'),
      stored: storedRecord(gm, edit.k),
    };

    proposeFragment(room, forbidden, 2, 2);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);
    propose(room, control);
    await waitUntil(() =>
      committedRecords(room, 'gm-a').some(
        (record) => record.k === control.k && record.c === control.c && record.a === control.a,
      ),
    );
    // #then
    expect({
      beforeCompletion,
      afterCompletion: {
        commits: heardOf(room, 'gm-a', 'commit'),
        rejects: heardOf(room, 'gm-a', 'reject'),
        stored: [storedRecord(gm, edit.k), storedRecord(gm, control.k)],
      },
    }).toEqual({
      beforeCompletion: { commits: [], rejects: [], stored: STR_ROW },
      afterCompletion: {
        commits: [commit([acceptedControl], [{ k: control.k, c: control.c, a: control.a }])],
        rejects: [reject(edit, 'denied')],
        stored: [STR_ROW, acceptedControl],
      },
    });
  });
  test('on two GM clients: both store the same record and both commit its echo', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a');
    const gmB = await startClient(room, 'gm-b');

    const proposed: VersionedRecord = fixturePatch(
      SWORD,
      { order: 0, cells: { item: 'Меч', qty: 2 } },
      4,
      PLAYER_SOCKET,
    );

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
    propose(room, fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET));
    propose(room, fixturePatch(STR_ROW, { str: 12 }, 1, PLAYER_SOCKET));
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
    propose(room, fixturePatch(STR_ROW, { str: 11 }, 3, 'stranger'), 'stranger');
    await pause(50);
    // #then
    expect({
      answers: [...heardOf(room, 'gm-a', 'commit'), ...heardOf(room, 'gm-a', 'reject')],
      stored: storedRecord(gm, STR_ROW.k),
    }).toEqual({ answers: [], stored: STR_ROW });
  });
  test('with a stale c whose full current record is large: returns only the proposed cells', async () => {
    // #given: the unrelated note would make a full stale answer too large.
    const socket = `p-${'x'.repeat(1000)}`;

    const big: VersionedRecord = fixturePatch(
      STR_ROW,
      { str: 10, note: 'ы'.repeat(7000) },
      STR_ROW.c,
      STR_ROW.a,
    );

    const room = roomRig.openRoom();
    await startClient(room, 'gm-a', { seeded: [...BASE.filter((one) => one.k !== big.k), big] });
    room.room.join({ id: PLAYER_ID, connectionId: socket, name: 'Оля', role: 'PLAYER' });
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 2, socket);
    // #when
    propose(room, proposed, socket);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length === 1);

    // #then
    const current = fixtureRecord(
      STR_ROW.k,
      { set: 'pc', order: 0, cells: { str: 10 } },
      STR_ROW.c,
      STR_ROW.a,
    );

    expect(heardOf(room, 'gm-a', 'reject')).toEqual([{ ...reject(proposed, 'stale'), current }]);
  });
  test('with a supported oversized stale read-back: emits stale fragments instead of denied', async () => {
    // #given

    const name = randomText(0x5eed);
    const note = randomText(0xbeef);
    const current = fixturePatch(STR_ROW, { str: Number.MAX_SAFE_INTEGER, name, note }, 3, 'gm-a');
    const proposed = fixturePatch(STR_ROW, { str: 11, name, note }, 2, PLAYER_SOCKET);
    const first = fixturePatch(current, { str: Number.MAX_SAFE_INTEGER, name });
    const second = fixturePatch(current, { note });
    const room = roomRig.openRoom();
    await startClient(room, 'gm-a', {
      seeded: [...BASE.filter((one) => one.k !== current.k), current],
    });
    joinPlayerSocket(room);
    // #when
    proposeFragment(room, fixturePatch(proposed, { str: 11 }), 1, 3);
    proposeFragment(room, fixturePatch(proposed, { name }), 2, 3);
    proposeFragment(room, fixturePatch(proposed, { note }), 3, 3);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length >= 1);
    await pause(30);
    // #then
    const ingress = heardOf(room, PLAYER_SOCKET, 'propose');
    const replies = heardOf(room, 'gm-a', 'reject');
    const fullReply = { ...reject(proposed, 'stale'), current };

    expect({
      fullReplyAtLeast15_000Bytes: jsonByteLength(fullReply) >= 15_000,
      ingressBelow15_000Bytes: ingress.every((fragment) => jsonByteLength(fragment) < 15_000),
      repliesBelow15_000Bytes: replies.every((fragment) => jsonByteLength(fragment) < 15_000),
      replies,
    }).toEqual({
      fullReplyAtLeast15_000Bytes: true,
      ingressBelow15_000Bytes: true,
      repliesBelow15_000Bytes: true,
      replies: [
        { ...reject(proposed, 'stale'), current: first, i: 1, n: 2 },
        { ...reject(proposed, 'stale'), current: second, i: 2, n: 2 },
      ],
    });
  });
  test('a tightly packed numbered stale read-back reaches the player and rebases its pending edit', async () => {
    // #given
    const densePreset = structuredClone(PRESET);
    densePreset.templates[0]!.tabs[0]!.sections[0]!.rows[0]!.cells.push({
      kind: 'field',
      type: 'text',
      id: 'bio',
    });

    const denseBase: VersionedRecord[] = BASE.map((record): VersionedRecord =>
      record.k === 'preset'
        ? { k: 'preset', d: encodePreset(densePreset), c: record.c, a: record.a }
        : record,
    );

    const remoteText = {
      name: 'a'.repeat(7_300),
      note: 'b'.repeat(7_448),
      bio: 'c'.repeat(7_300),
    };

    const current = fixturePatch(STR_ROW, { str: 20, ...remoteText }, 5, 'gm-a');
    const staleProposal = fixturePatch(STR_ROW, { str: 11, ...remoteText }, 3, PLAYER_ID);
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: denseBase });

    const player = await startClient(room, PLAYER_ID, {
      role: 'PLAYER',
      seeded: [],
    });

    await waitUntil(() => shown(player, STR_ROW.k) !== undefined);
    gm.engine.stop();
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    gm.backing.set(storageKey(current.k), JSON.stringify(current));
    await gm.startEngine();
    await waitUntil(() => gm.store.$sync.get().state === 'live');

    // #when
    proposeFragment(room, fixturePatch(staleProposal, { str: 11 }), 1, 4, PLAYER_ID);
    proposeFragment(room, fixturePatch(staleProposal, { name: remoteText.name }), 2, 4, PLAYER_ID);
    proposeFragment(room, fixturePatch(staleProposal, { note: remoteText.note }), 3, 4, PLAYER_ID);
    proposeFragment(room, fixturePatch(staleProposal, { bio: remoteText.bio }), 4, 4, PLAYER_ID);
    await waitUntil(() => heardOf(room, 'gm-a', 'reject').length >= 1);
    await pause(50);

    // #then
    const replies = heardOf(room, 'gm-a', 'reject');
    const again = fixturePatch(STR_ROW, { str: 11 }, 6, PLAYER_ID);

    const shownAgain: VersionedRecord = {
      k: STR_ROW.k,
      d: {
        set: 'pc',
        order: 0,
        cells: {
          str: [11, 6, PLAYER_ID],
          name: [remoteText.name, 5, 'gm-a'],
          note: [remoteText.note, 5, 'gm-a'],
          bio: [remoteText.bio, 5, 'gm-a'],
        },
      },
      c: 6,
      a: PLAYER_ID,
      l: [1, 'seed'],
    };

    expect({
      replyFits: replies.map((reply) => jsonByteLength(reply) < 15_000),
      rebased: proposals(room).filter((record) => record.c === 6),
      shown: shown(player, STR_ROW.k),
      pending: pendingKeys(player),
    }).toEqual({
      replyFits: [true, true],
      rebased: [again],
      shown: shownAgain,
      pending: [],
    });
  });
  test('whose storage could not be read: neither commits nor rejects', async () => {
    // #given
    const room = roomRig.openRoom();
    await startClient(room, 'gm-a', {
      platform: (platform) => {
        platform.setFailingStorageOperations(['read', 'list']);

        return platform;
      },
    });
    joinPlayerSocket(room);
    // #when
    propose(room, fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET));
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
      v: 4,
      g: { n: 1, a: 'other' },
      t: 'propose',
      records: [fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET)],
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
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_SOCKET);
    // #when
    propose(room, proposed);
    await waitUntil(() => roomCopyRecords(room) !== null);
    // #then
    expect(roomCopyRecords(room)?.find((record) => record.k === STR_ROW.k)).toEqual(proposed);
  });
});

describe("a player's edit", () => {
  test('a lost acknowledgement does not let a later note overwrite a GM edit', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    let dropped = 0;

    const player = await startClient(room, PLAYER_ID, {
      role: 'PLAYER',
      seeded: [],
      timing: { proposeResendStartMs: 500, proposeResendMaxMs: 500 },
      platform: (platform) => ({
        ...platform,
        broadcast: {
          ...platform.broadcast,
          onMessage: (channel, callback) =>
            platform.broadcast.onMessage(channel, (event) => {
              const data = Object(event.data);

              if (
                dropped === 0 &&
                data.t === 'commit' &&
                Array.isArray(data.acks) &&
                data.acks.some((ack: { a?: string }) => ack.a === PLAYER_ID)
              ) {
                dropped += 1;

                return;
              }

              callback(event);
            }),
        },
      }),
    });

    await waitUntil(() => shown(player, STR_ROW.k) !== undefined);
    send(player, strEdit('str', 11));
    await waitUntil(() => dropped === 1);
    send(gm, strEdit('str', 15));
    await waitUntil(
      () => Object(player.store.$replica.get().get(STR_ROW.k)?.d).cells?.str?.[0] === 15,
    );
    const beforeLaterEdit = [...proposals(room)];

    // #when
    send(player, strEdit('note', 'tired'));
    await waitUntil(() => Object(shown(player, STR_ROW.k)?.d).cells?.note?.[0] === 'tired');
    await waitUntil(
      () =>
        Object(storedRecord(gm, STR_ROW.k)?.d).cells?.note?.[0] === 'tired' &&
        Object(player.store.$replica.get().get(STR_ROW.k)?.d).cells?.note?.[0] === 'tired',
    );

    // #then
    expect({
      dropped,
      beforeLaterEdit,
      gm: Object(storedRecord(gm, STR_ROW.k)?.d).cells,
      player: Object(player.store.$replica.get().get(STR_ROW.k)?.d).cells,
    }).toEqual({
      dropped: 1,
      beforeLaterEdit: [fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_ID)],
      gm: { str: [15, 4, 'gm-a'], note: ['tired', 5, PLAYER_ID] },
      player: { str: [15, 4, 'gm-a'], note: ['tired', 5, PLAYER_ID] },
    });
  });
  test('a paced proposal cancelled while still a player sends no null record', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    let held = false;
    let release = (): void => undefined;

    const sendWait: Wait = (milliseconds) =>
      held
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : pause(milliseconds);

    const player = await startClient(room, PLAYER_ID, {
      role: 'PLAYER',
      seeded: [],
      sendWait,
    });

    await waitUntil(() => shown(player, SWORD.k) !== undefined);
    gm.engine.stop();
    held = true;
    send(player, strEdit('str', 11));
    await waitUntil(() => heardOf(room, PLAYER_ID, 'propose').length === 1);
    await player.platform.broadcast.sendMessage(
      UI_CHANNEL,
      { t: 'command', id: 'queued-sword', command: swordEdit(3) },
      { destination: 'LOCAL' },
    );

    const accepted: VersionedRecord = fixturePatch(
      SWORD,
      { order: 0, cells: { item: 'Меч', qty: 3 } },
      2,
      PLAYER_ID,
    );

    // #when
    answer(room, commit([accepted], [{ k: accepted.k, c: accepted.c, a: accepted.a }]));
    await pause(20);
    held = false;
    release();
    await pause(30);
    // #then
    expect({
      role: player.store.$sync.get().role,
      sent: heardOf(room, PLAYER_ID, 'propose'),
    }).toEqual({
      role: 'PLAYER',
      sent: [
        {
          v: 4,
          g: GENERATION,
          t: 'propose',
          i: 1,
          n: 1,
          records: [fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_ID)],
        },
      ],
    });
  });
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
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_ID);
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
    const gmRecord: VersionedRecord = fixturePatch(STR_ROW, { str: 30 }, 4, 'gm-a');
    answer(room, commit([gmRecord], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]));
    await waitUntil(() => shown(player, STR_ROW.k)?.c === 4);
    // #then
    expect({ shown: shown(player, STR_ROW.k), pending: pendingKeys(player) }).toEqual({
      shown: gmRecord,
      pending: [],
    });
  });
  test('a later field is proposed above the newer record carried by the first acknowledgement', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const later = send(player, strEdit('note', 'tired'));
    await waitUntil(() => outcome(player, later) !== undefined);

    // #when
    const gmRecord = fixturePatch(STR_ROW, { str: 15, note: 'GM' }, 7, 'gm-a');
    answer(room, commit([gmRecord], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]));
    await waitUntil(
      () => player.store.$replica.get().get(STR_ROW.k)?.c === 7 && proposals(room).length >= 2,
    );

    // #then
    expect(proposals(room).at(-1)).toEqual(fixturePatch(STR_ROW, { note: 'tired' }, 8, PLAYER_ID));
  });
  test('a stale answer to the first proposal preserves both player edits', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const later = send(player, strEdit('note', 'tired'));
    await waitUntil(() => outcome(player, later) !== undefined);

    // #when
    const current = fixturePatch(STR_ROW, { str: 15 }, 5, 'gm-a');
    answer(room, { ...Object(reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale')), current });
    await pause(50);

    // #then
    expect({
      replica: player.store.$replica.get().get(STR_ROW.k),
      proposal: proposals(room).at(-1),
    }).toEqual({
      replica: current,
      proposal: fixturePatch(STR_ROW, { str: 11, note: 'tired' }, 6, PLAYER_ID),
    });
  });
  test('an acknowledgement during catch-up keeps the later value visible and waits to send', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    const later = send(player, strEdit('note', 'tired'));
    await waitUntil(() => outcome(player, later) !== undefined);
    player.engine.catchUp();
    await waitUntil(() => player.store.$sync.get().state === 'catching-up');

    // #when
    const gmRecord = fixturePatch(STR_ROW, { str: 15, note: 'GM' }, 7, 'gm-a');
    answer(room, commit([gmRecord], [{ k: STR_ROW.k, c: 3, a: PLAYER_ID }]));
    await waitUntil(() => player.store.$replica.get().get(STR_ROW.k)?.c === 7);

    const during = {
      sent: proposals(room),
      note: Object(shown(player, STR_ROW.k)?.d).cells?.note?.[0],
    };

    await waitUntil(() => player.store.$sync.get().state === 'live');
    await pause(20);

    // #then
    expect({ during, last: proposals(room).at(-1) }).toEqual({
      during: { sent: [fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_ID)], note: 'tired' },
      last: fixturePatch(STR_ROW, { note: 'tired' }, 8, PLAYER_ID),
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
    const current: VersionedRecord = fixturePatch(STR_ROW, { str: 20, note: 'ГМ' }, 5, 'gm-a');
    // #when
    answer(room, { ...reject({ k: STR_ROW.k, c: 3, a: PLAYER_ID }, 'stale'), current });
    await waitUntil(() => proposals(room).length === 2 && shown(player, STR_ROW.k)?.c === 6);
    // #then
    const again: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 6, PLAYER_ID);

    const shownAgain: VersionedRecord = {
      k: STR_ROW.k,
      d: {
        set: 'pc',
        order: 0,
        cells: {
          str: [11, 6, PLAYER_ID],
          note: ['ГМ', 5, 'gm-a'],
        },
      },
      c: 6,
      a: PLAYER_ID,
      l: [1, 'seed'],
    };

    expect({
      sent: proposals(room)[1],
      shown: shown(player, STR_ROW.k),
      replica: player.store.$replica.get().get(STR_ROW.k),
    }).toEqual({ sent: again, shown: shownAgain, replica: current });
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
    answer(room, commit([fixturePatch(STR_ROW, { str: 15 }, 7, 'gm-a')]));
    await waitUntil(() => player.store.$sync.get().state === 'live');
    await waitUntil(() => proposals(room).length === 1);
    // #then
    expect({ during, sent: proposals(room) }).toEqual({
      during: {
        sent: 0,
        shown: { set: 'pc', order: 0, cells: { str: [11, 3, PLAYER_ID] } },
      },
      sent: [fixturePatch(STR_ROW, { str: 11 }, 8, PLAYER_ID)],
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
      v: 4,
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
    const applied: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 4, PLAYER_ID);
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
    answer(room, { v: 4, g: GENERATION, t: 'alive', digest: 0 });
    await waitUntil(() => proposals(room).length === 2);
    // #then
    const proposed: VersionedRecord = fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_ID);
    expect(proposals(room)).toEqual([proposed, proposed]);
  });
});

describe('a player and a GM client together', () => {
  test('commits a permitted nested field edit to its child without changing its parent or sibling', async () => {
    // #given
    const nestedPreset: Preset = {
      v: 4,
      templates: [
        {
          id: 'encounter',
          title: 'Encounter',
          players: 'edit',
          tabs: [
            {
              title: 'NPC',
              repeat: { id: 'npc', nameField: 'npc_name' },
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'npc_name' },
                        { kind: 'field', type: 'number', id: 'hp' },
                      ],
                    },
                  ],
                },
                {
                  repeat: { id: 'attack', nameField: 'attack_name' },
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'attack_name' },
                        { kind: 'field', type: 'number', id: 'damage' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const parent: VersionedRecord = {
      k: 'blk:encounter:npc:goblin',
      d: { order: 0, cells: { npc_name: ['Goblin', 1, 'seed'], hp: [7, 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const child: VersionedRecord = {
      k: `${parent.k}:attack:claw`,
      d: {
        order: 0,
        cells: { attack_name: ['Claw', 1, 'seed'], damage: [3, 1, 'seed'] },
      },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const sibling: VersionedRecord = {
      k: `${parent.k}:attack:bow`,
      d: {
        order: 1,
        cells: { attack_name: ['Bow', 1, 'seed'], damage: [4, 1, 'seed'] },
      },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const nestedRig = createRoomRig({
      seeded: [
        { k: 'preset', d: encodePreset(nestedPreset), c: 1, a: 'seed' },
        {
          k: 'blk:encounter',
          d: { order: 0, cells: {} },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        parent,
        child,
        sibling,
      ],
    });

    const room = nestedRig.openRoom();

    const gm = await nestedRig.startClient(room, 'gm-a', {
      engine: { editDenied: DENIED },
    });

    const player = await nestedRig.startClient(room, PLAYER_ID, {
      role: 'PLAYER',
      playerId: PLAYER_ID,
      seeded: [],
      engine: { editDenied: DENIED },
    });

    await waitUntil(() => shown(player, child.k) !== undefined);

    // #when
    const commandId = send(player, {
      type: 'field-patch',
      sheetId: 'encounter',
      target: {
        kind: 'rep',
        sectionId: 'attack',
        instanceId: 'claw',
        path: ['npc', 'goblin', 'attack', 'claw'],
      },
      fieldId: 'attack_name',
      value: 'Bite',
    });

    await waitUntil(
      () => rejection(player, commandId) !== undefined || storedRecord(gm, child.k)?.c === 2,
    );

    // #then
    expect({
      rejection: rejection(player, commandId),
      child: storedRecord(gm, child.k),
      parent: storedRecord(gm, parent.k),
      sibling: storedRecord(gm, sibling.k),
      pending: player.store.$pending.get().size,
    }).toEqual({
      rejection: undefined,
      child: {
        ...child,
        d: {
          order: 0,
          cells: {
            attack_name: ['Bite', 2, PLAYER_ID],
            damage: [3, 1, 'seed'],
          },
        },
        c: 2,
        a: PLAYER_ID,
      },
      parent,
      sibling,
      pending: 0,
    });
  });

  test('refuses a player command for a GM-only source-section field in a visible repeat tab', async () => {
    // #given
    const block: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: {
        order: 0,
        cells: { quest: ['Найти меч', 1, 'seed'], secret: ['Лич', 1, 'seed'] },
      },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, block] });
    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, block.k) !== undefined);
    // #when

    const id = send(player, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'quest', instanceId: 'q1' },
      fieldId: 'secret',
      value: 'Ключ',
    });

    await waitUntil(() => rejection(player, id) !== undefined || proposals(room).length === 1);
    // #then
    expect({
      reason: rejection(player, id),
      proposed: proposals(room),
      stored: storedRecord(gm, block.k),
    }).toEqual({
      reason: 'not-allowed',
      proposed: [],
      stored: block,
    });
  });
  test('keeps a visible player field and a GM-only source-section field editable in a visible repeat tab', async () => {
    // #given
    const block: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: {
        order: 0,
        cells: { quest: ['Найти меч', 1, 'seed'], secret: ['Лич', 1, 'seed'] },
      },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, block] });
    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });
    const playerEdit = fixturePatch(block, { quest: 'Найти щит' }, 2, PLAYER_ID);

    const gmEdit = fixturePatch(
      block,
      { quest: ['Найти щит', 2, PLAYER_ID], secret: 'Ключ' },
      3,
      'gm-a',
    );

    await waitUntil(() => shown(player, block.k) !== undefined);
    // #when

    const playerCommandId = send(player, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'quest', instanceId: 'q1' },
      fieldId: 'quest',
      value: 'Найти щит',
    });

    await pause(10);

    const gmCommandId = send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'quest', instanceId: 'q1' },
      fieldId: 'secret',
      value: 'Ключ',
    });

    await pause(10);
    // #then
    expect({
      player: {
        outcome: outcome(player, playerCommandId),
        reason: rejection(player, playerCommandId),
        proposal: proposals(room),
      },
      gm: outcome(gm, gmCommandId),
      stored: storedRecord(gm, block.k),
    }).toEqual({
      player: {
        outcome: { kind: 'answered', answer: undefined },
        reason: undefined,
        proposal: [playerEdit],
      },
      gm: { kind: 'answered', answer: undefined },
      stored: gmEdit,
    });
  });
  test('commits a player field edit to an existing visible repeat-tab block at the receiving GM', async () => {
    // #given
    const repeatTab: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: { order: 0, cells: { quest: ['Найти меч', 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, repeatTab] });
    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });
    const edited = fixturePatch(repeatTab, { quest: 'Найти щит' }, 2, PLAYER_ID);

    await waitUntil(() => shown(player, repeatTab.k) !== undefined);
    // #when
    send(player, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'rep', sectionId: 'quest', instanceId: 'q1' },
      fieldId: 'quest',
      value: 'Найти щит',
    });
    await waitUntil(() => storedRecord(gm, repeatTab.k)?.c === edited.c);
    // #then
    expect({
      committed: heardOf(room, 'gm-a', 'commit'),
      stored: storedRecord(gm, repeatTab.k),
    }).toEqual({
      committed: [commit([edited], [{ k: edited.k, c: edited.c, a: edited.a }])],
      stored: edited,
    });
  });
  test('commits a visible field edit from the player while the GM creates a repeat-tab block', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, PLAYER_ID, { role: 'PLAYER', seeded: [] });

    const repeatTab: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: { order: 0, cells: {} },
      c: 1,
      a: 'gm-a',
      l: [1, 'gm-a'],
    };

    await waitUntil(() => shown(player, SWORD.k) !== undefined);
    // #when
    send(player, strEdit('str', 11));
    send(gm, {
      type: 'repeat-block-add',
      sheetId: 'brok',
      sectionId: 'quest',
      instanceId: 'q1',
    });
    await waitUntil(
      () =>
        storedRecord(gm, STR_ROW.k)?.c === 3 && storedRecord(gm, repeatTab.k)?.c === repeatTab.c,
    );
    // #then
    expect({
      field: storedRecord(gm, STR_ROW.k),
      lifecycle: storedRecord(gm, repeatTab.k),
    }).toEqual({
      field: fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_ID),
      lifecycle: repeatTab,
    });
  });
  test('allows the GM to delete a repeat-tab block through its public command', async () => {
    // #given
    const block: VersionedRecord = {
      k: 'blk:brok:quest:q1',
      d: { order: 0, cells: { quest: ['Найти меч', 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE, block] });
    const removed = fixtureRecord(block.k, null, 2, 'gm-a');

    // #when
    send(gm, {
      type: 'repeat-block-delete',
      sheetId: 'brok',
      sectionId: 'quest',
      instanceId: 'q1',
    });
    await waitUntil(() => storedRecord(gm, block.k)?.d === null);
    // #then
    expect(storedRecord(gm, block.k)).toEqual(removed);
  });
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
        player.store.$replica.get().has('blk:brok:item:r9'),
    );

    // #then
    const expected: VersionedRecord[] = [
      fixturePatch(STR_ROW, { str: 11 }, 3, PLAYER_ID),
      {
        k: 'blk:brok:item:r9',
        d: { order: 1, cells: {} },
        c: 1,
        a: PLAYER_ID,
        l: [1, PLAYER_ID],
      },
      fixtureRecord(SWORD.k, null, 2, PLAYER_ID),
    ];

    expect({
      gm: expected.map((record) => storedRecord(gm, record.k)),
      player: expected.map((record) => player.store.$replica.get().get(record.k)),
    }).toEqual({ gm: expected, player: expected });
  });
});

function nestedAccessFixture({
  hiddenNpc = false,
}: {
  hiddenNpc?: boolean;
} = {}) {
  const repeatTab = (id: 'npc' | 'boss', visibility?: 'gm') => ({
    title: id === 'npc' ? 'NPC' : 'Boss',
    visibility,
    repeat: { id, nameField: `${id}_name` },
    sections: [
      {
        rows: [
          {
            cells: [{ kind: 'field' as const, type: 'text' as const, id: `${id}_name` }],
          },
        ],
      },
      {
        repeat: { id: 'attack', nameField: 'attack_name' },
        rows: [
          {
            cells: [{ kind: 'field' as const, type: 'text' as const, id: 'attack_name' }],
          },
        ],
      },
    ],
  });

  const preset: Preset = {
    v: 4,
    templates: [
      {
        id: 'encounter',
        title: 'Encounter',
        players: 'edit',
        tabs: [repeatTab('npc', hiddenNpc ? 'gm' : undefined), repeatTab('boss')],
      },
    ],
  };

  const root: VersionedRecord = {
    k: 'blk:encounter',
    d: { order: 0, cells: {} },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const npcParent: VersionedRecord = {
    k: 'blk:encounter:npc:n1',
    d: { order: 0, cells: { npc_name: ['Goblin', 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const bossParent: VersionedRecord = {
    k: 'blk:encounter:boss:b1',
    d: { order: 0, cells: { boss_name: ['Dragon', 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const bossChild: VersionedRecord = {
    k: `${bossParent.k}:attack:a1`,
    d: { order: 0, cells: { attack_name: ['Claw', 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  return {
    records: [
      { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' },
      root,
      npcParent,
      bossParent,
      bossChild,
    ] satisfies VersionedRecord[],
    npcParent,
    bossParent,
    bossChild,
  };
}

// A GM loads the base and hands it to the player, then stops answering. It stays in the party, so
// the test speaks for it.
async function playerWithSilentGm(timing: Partial<Timing> = {}): Promise<{
  room: Room;
  player: Client;
}> {
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
  options: ClientOptions & {
    until?: 'loaded' | 'live';
  } = {},
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
  room.post(from, { v: 4, g: GENERATION, t: 'propose', i: 1, n: 1, records: [record] });
}

function proposeFragment(
  room: Room,
  record: VersionedRecord,
  i: number,
  n: number,
  from = PLAYER_SOCKET,
): void {
  room.post(from, { v: 4, g: GENERATION, t: 'propose', i, n, records: [record] });
}

function randomText(initialSeed: number): string {
  let seed = initialSeed;

  return Array.from({ length: 7_300 }, () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;

    return String.fromCharCode(33 + (seed % 90));
  }).join('');
}

// A message from the GM client the test speaks for.
function answer(room: Room, data: JsonValue): void {
  room.post('gm-a', data);
}

function commit(
  records: VersionedRecord[],
  acks?: {
    k: string;
    c: number;
    a: string;
  }[],
): JsonValue {
  return acks === undefined
    ? { v: 4, g: GENERATION, t: 'commit', records }
    : { v: 4, g: GENERATION, t: 'commit', records, acks };
}

function reject(
  edit: {
    k: string;
    c: number;
    a: string;
  },
  reason: 'denied' | 'stale',
) {
  return { v: 4, g: GENERATION, t: 'reject', k: edit.k, c: edit.c, a: edit.a, reason };
}

function strEdit(fieldId: string, value: JsonValue): WireCommand {
  return {
    type: 'field-patch',
    sheetId: 'brok',
    target: { kind: 'row', rowId: 'str' },
    fieldId,
    value,
  };
}

function swordEdit(qty: number): WireCommand {
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
