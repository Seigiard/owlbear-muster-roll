import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { FieldValues, VersionedRecord } from '@/core/records';
import { encodeStateRecords } from '@/core/state-records';
import type { Timing } from '@/core/timing';
import { UI_CHANNEL, type Command } from '@/core/ui-messages';
import type { PlayerRole } from '@/platform/ports';
import type { ReplicaEngineOptions } from '@/replica/engine';
import {
  createRoomRig,
  heardOf,
  lastRequest,
  rejection,
  send,
  shown,
  storageKey,
  storedKeys,
  storedRecord,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

const GHOST = 'ghost-gm';

// "npc" holds the NPCs as repeat blocks of two rows, and a repeat section whose first field is a
// number. "pc" is a sheet set with a repeat section of its own, and "camp" a single sheet every
// player edits.
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
            { rows: [[{ kind: 'field', type: 'text', id: 'name' }]] },
            {
              repeat: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'attack' },
                  { kind: 'field', type: 'number', id: 'bonus' },
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
      tabs: [
        {
          sections: [
            { rows: [[{ kind: 'field', type: 'text', id: 'notes' }]] },
            {
              repeat: true,
              tokens: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'mob' },
                  { kind: 'field', type: 'number', id: 'hp' },
                ],
                [
                  { kind: 'field', type: 'check', id: 'elite' },
                  { kind: 'field', type: 'text', id: 'tactics' },
                ],
              ],
            },
            { repeat: true, rows: [[{ kind: 'field', type: 'number', id: 'gold' }]] },
          ],
        },
      ],
    },
    {
      id: 'camp',
      kind: 'single',
      title: 'Лагерь',
      players: 'edit',
      tabs: [
        { sections: [{ repeat: true, rows: [[{ kind: 'field', type: 'text', id: 'cart' }]] }] },
      ],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

// The NPC "Скелет 1" with a token link, another NPC at order 4, a removed one, a block of another
// section at order 9 the NPC order must not follow, a sheet of the sheet set with a repeat block,
// and a repeat block of the sheet every player edits.
const SOURCE: readonly VersionedRecord[] = [
  block('npc', 'mob', 'sk1', 0, { mob: 'Скелет 1', hp: 7, elite: true }, 3),
  block('npc', 'mob', 'gob', 4, { mob: 'Гоблин', hp: 5 }),
  { k: 'rep:npc:mob:dead', d: null, c: 2, a: 'seed' },
  block('npc', 'gold', 'g1', 9, { gold: 30 }),
  { k: 'link:token1', d: { s: 'npc', i: 'sk1' }, c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:name', d: { name: 'Брок' }, c: 1, a: 'seed' },
  block('brok', 'attack', 'a1', 0, { attack: 'Меч', bonus: 2 }),
  block('camp', 'cart', 'c1', 0, { cart: 'Телега' }),
];

// The keys seeded into its storage, so the copies are what else it shows.
type Client = RigClient;

type Room = RigRoom;

type ClientOptions = {
  role?: PlayerRole;
  engine?: ReplicaEngineOptions;
  seeded?: readonly VersionedRecord[];
  // Stored records that fail the record schema, so the engine skips them at start.
  entries?: Readonly<Record<string, string>>;
  timing?: Partial<Timing>;
};

// One copy as the test reads it: its section and data, its instance id and version aside.
type Copy = { section: string; d: JsonValue };

describe('repeat-block-duplicate', () => {
  test('writes nine copies of "Скелет 1", "Скелет 2" to "Скелет 10", after the last repeat block of its section, with its values', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('npc', 'mob', 'sk1', 9));
    await waitUntil(() => addedRecords(client).length === 9);

    // #then
    expect(copiesOf(client)).toEqual(
      Array.from({ length: 9 }, (_unused, index) => ({
        section: 'mob',
        d: { order: index + 5, cells: { mob: `Скелет ${index + 2}`, hp: 7, elite: true } },
      })),
    );
  });

  test('puts every copy under a new 8-character instance id of the same sheet and section, at c: 1 by this connection, with no link', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('npc', 'mob', 'sk1', 3));
    await waitUntil(() => addedRecords(client).length === 3);

    // #then: TASK-37 AC 1, the length written out by hand.
    const added = addedRecords(client);
    const instanceIds = added.map(lastKeySegment);

    expect({
      prefixes: [...new Set(added.map((one) => one.k.split(':').slice(0, 3).join(':')))],
      versions: [...new Set(added.map((one) => `${one.c}/${one.a}`))],
      instanceIds: new Set(instanceIds).size,
      malformed: instanceIds.filter((id) => !/^[A-Za-z0-9_-]{8}$/.test(id)),
      links: [...shownRecords(client).keys()].filter((key) => key.startsWith('link:')),
    }).toEqual({
      prefixes: ['rep:npc:mob'],
      versions: ['1/gm-a'],
      instanceIds: 3,
      malformed: [],
      links: ['link:token1'],
    });
  });

  test('leaves the source repeat block and its link as they were', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('npc', 'mob', 'sk1', 3));
    await waitUntil(() => addedRecords(client).length === 3);

    // #then
    expect(SOURCE.map((one) => storedRecord(client, one.k))).toEqual([...SOURCE]);
  });

  test('sends the copies to the room in commits, which another GM client merges and persists', async () => {
    // #given
    const room = roomRig.openRoom();
    const first = await startClient(room, 'gm-a');
    const second = await startClient(room, 'gm-b');

    // #when
    send(first, duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => addedRecords(second).length === 2);

    // #then
    const keys = addedRecords(first).map((one) => one.k);

    expect({
      shown: keys.map((key) => shown(second, key)),
      stored: keys.map((key) => storedRecord(second, key)),
    }).toEqual({
      shown: addedRecords(first),
      stored: addedRecords(first),
    });
  });

  test('numbers copies of an unnumbered source from 1 and leaves its name', async () => {
    // #given
    const room = roomRig.openRoom();
    const source = block('npc', 'mob', 'sk1', 0, { mob: 'Скелет' });
    const client = await startClient(room, 'gm-a', { seeded: [PRESET_RECORD, source] });

    // #when
    send(client, duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => addedRecords(client).length === 2);

    // #then
    expect({ names: namesOf(client), source: shown(client, source.k) }).toEqual({
      names: ['Скелет 1', 'Скелет 2'],
      source,
    });
  });

  test('numbers after the highest live repeat block of the same base in the same section of the same sheet', async () => {
    // #given: a higher namesake, and higher numbers on a removed block, another base and another
    // sheet.
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [
        PRESET_RECORD,
        block('npc', 'mob', 'sk1', 0, { mob: 'Скелет 1' }),
        block('npc', 'mob', 'high', 1, { mob: 'Скелет 7' }),
        { k: 'rep:npc:mob:gone', d: null, c: 2, a: 'seed' },
        block('npc', 'mob', 'archer', 2, { mob: 'Скелет-лучник 30' }),
        { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
        block('brok', 'attack', 'a1', 0, { attack: 'Скелет 20' }),
      ],
    });

    // #when
    send(client, duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => addedRecords(client).length === 2);

    // #then
    expect(namesOf(client)).toEqual(['Скелет 8', 'Скелет 9']);
  });

  test('copies a repeat block whose first field is not text with its values as they are', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('npc', 'gold', 'g1', 2));
    await waitUntil(() => addedRecords(client).length === 2);

    // #then
    expect(copiesOf(client)).toEqual([
      { section: 'gold', d: { order: 10, cells: { gold: 30 } } },
      { section: 'gold', d: { order: 11, cells: { gold: 30 } } },
    ]);
  });

  test('duplicates a repeat block of a sheet of a sheet set', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('brok', 'attack', 'a1', 1));
    await waitUntil(() => addedRecords(client).length === 1);

    // #then
    expect({
      sheet: addedRecords(client).map((one) => one.k.split(':')[1]),
      copies: copiesOf(client),
    }).toEqual({
      sheet: ['brok'],
      copies: [{ section: 'attack', d: { order: 1, cells: { attack: 'Меч 1', bonus: 2 } } }],
    });
  });

  test('an edit of one copy changes no other copy and not the source', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a');

    send(client, duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => addedRecords(client).length === 2);

    const [edited = '', other = ''] = addedRecords(client)
      .sort((first, second) => Object(first.d).order - Object(second.d).order)
      .map((one) => one.k);

    // #when
    send(client, {
      type: 'field-patch',
      sheetId: 'npc',
      target: { kind: 'rep', sectionId: 'mob', instanceId: lastKeySegment({ k: edited }) },
      fieldId: 'hp',
      value: 1,
    });
    await waitUntil(() => Object(shown(client, edited)?.d).cells?.hp === 1);

    // #then
    expect([edited, other, 'rep:npc:mob:sk1'].map((key) => shown(client, key)?.d)).toEqual([
      { order: 5, cells: { mob: 'Скелет 2', hp: 1, elite: true } },
      { order: 6, cells: { mob: 'Скелет 3', hp: 7, elite: true } },
      { order: 0, cells: { mob: 'Скелет 1', hp: 7, elite: true } },
    ]);
  });

  test.each([
    ['a count of 0', duplicate('npc', 'mob', 'sk1', 0), 'invalid-count'],
    ['a count of 51', duplicate('npc', 'mob', 'sk1', 51), 'invalid-count'],
    ['a fractional count', duplicate('npc', 'mob', 'sk1', 2.5), 'invalid-count'],
    ['a removed repeat block', duplicate('npc', 'mob', 'dead', 1), 'unknown-instance'],
    [
      'a repeat block that does not exist',
      duplicate('npc', 'mob', 'nobody', 1),
      'unknown-instance',
    ],
    ['a repeat block of another section', duplicate('npc', 'mob', 'g1', 1), 'unknown-instance'],
    ['a section that does not repeat', duplicate('npc', 'notes', 'sk1', 1), 'unknown-section'],
    ['a section the template lacks', duplicate('npc', 'nope', 'sk1', 1), 'unknown-section'],
    ['a deleted sheet', duplicate('gone', 'attack', 'a1', 1), 'deleted-sheet'],
    ['a sheet that does not exist', duplicate('nobody', 'attack', 'a1', 1), 'unknown-sheet'],
    ['an id outside the nanoid alphabet', duplicate('a:b', 'attack', 'a1', 1), 'invalid-sheet-id'],
    ['a sheet record that fails its schema', duplicate('bad', 'attack', 'a1', 1), 'unknown-sheet'],
    [
      'a name whose number cannot fit the name limit',
      duplicate('npc', 'mob', 'long', 1),
      'invalid-value',
    ],
  ])('rejects %s and writes nothing', async (_name, command, reason) => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [
        ...base(),
        { k: 'sheet:gone', d: null, c: 2, a: 'seed' },
        // A value past the limit, as a record holds any value: its next number has 101 digits.
        block('npc', 'mob', 'long', 9, { mob: `Скелет ${'9'.repeat(100)}` }),
      ],
      entries: {
        [storageKey('sheet:bad')]: JSON.stringify({
          k: 'sheet:bad',
          d: { kind: 'pc', name: 'Битый' },
          c: 1,
          a: 'seed',
        }),
      },
    });

    const before = storedKeys(client);

    // #when
    const id = send(client, command);

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({
      reason: rejection(client, id),
      stored: storedKeys(client),
      commits: heardOf(room, 'gm-a', 'commit'),
    }).toEqual({ reason, stored: before, commits: [] });
  });

  test.each<[string, VersionedRecord]>([
    ['a removed repeat block of the section', { k: 'rep:npc:mob:dead', d: null, c: 2, a: 'seed' }],
    ['a repeat block of another section of the sheet', block('npc', 'gold', 'g1', 9, { gold: 30 })],
  ])(
    'draws an instance id that %s holds again and writes the copy under the next free one',
    async (_name, taken) => {
      // #given: AD-2, an instance id is unique in its sheet across sections, tombstones included.
      const room = roomRig.openRoom();
      const ids = [lastKeySegment(taken), 'fresh'];

      const client = await startClient(room, 'gm-a', {
        engine: { newRecordId: () => ids.shift() ?? 'spent' },
      });

      // #when
      send(client, duplicate('npc', 'mob', 'sk1', 1));
      await waitUntil(() => addedRecords(client).length === 1);

      // #then
      expect({ keys: newKeys(client), taken: storedRecord(client, taken.k) }).toEqual({
        keys: ['rep:npc:mob:fresh'],
        taken,
      });
    },
  );

  test('refuses two copies when every draw gives one instance id and writes nothing', async () => {
    // #given: no record holds the id, so only the first copy of this batch takes it.
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { engine: { newRecordId: () => 'twin' } });
    const before = storedKeys(client);

    // #when
    const id = send(client, duplicate('npc', 'mob', 'sk1', 2));

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({ reason: rejection(client, id), stored: storedKeys(client) }).toEqual({
      reason: 'instance-exists',
      stored: before,
    });
  });

  test('sends fifty copies through the send queue to another GM client whole', async () => {
    // #given: copies too large together for one message.
    const room = roomRig.openRoom();
    const seeded = [PRESET_RECORD, block('npc', 'mob', 'sk1', 0, { tactics: 'х'.repeat(1000) })];
    const first = await startClient(room, 'gm-a', { seeded });
    const second = await startClient(room, 'gm-b', { seeded });

    // #when
    send(first, duplicate('npc', 'mob', 'sk1', 50));
    await waitUntil(() => addedRecords(second).length === 50);

    // #then
    expect({
      commits: heardOf(room, 'gm-a', 'commit').length > 1,
      second: addedRecords(second),
    }).toEqual({ commits: true, second: addedRecords(first) });
  });

  test('a player client is refused as not allowed, also on a sheet every player edits, and writes nothing', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'player-a', { role: 'PLAYER' });

    // #when
    const id = send(client, duplicate('camp', 'cart', 'c1', 2));

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({ reason: rejection(client, id), added: newKeys(client) }).toEqual({
      reason: 'not-allowed',
      added: [],
    });
  });

  test('a namesake that arrives during catch-up numbers the copies after it on exit, under the keys shown', async () => {
    // #given
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });

    send(client, duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => addedRecords(client).length === 2);

    const shownKeys = newKeys(client);
    const arrived = block('npc', 'mob', 'i9', 7, { mob: 'Скелет 5' }, 1, GHOST);

    // #when
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), [arrived]));
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length > 0);

    // #then
    expect({
      keys: newKeys(client).filter((key) => key !== arrived.k),
      stored: shownKeys.map((key) => storedRecord(client, key)?.c),
      copies: shownKeys.map((key) => shown(client, key)?.d).sort(byOrder),
    }).toEqual({
      keys: shownKeys,
      stored: [1, 1],
      copies: [
        { order: 8, cells: { mob: 'Скелет 6', hp: 7, elite: true } },
        { order: 9, cells: { mob: 'Скелет 7', hp: 7, elite: true } },
      ],
    });
  });

  test('during catch-up the copies show at once, wait unsaved, and are written under the same keys on exit', async () => {
    // #given: a GM that never answers holds this client in catch-up.
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });

    // #when
    send(client, duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => addedRecords(client).length === 2);

    const during = {
      keys: newKeys(client),
      names: namesOf(client),
      stored: newKeys(client).map((key) => storedRecord(client, key)),
      commits: heardOf(room, 'gm-a', 'commit').length,
    };

    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length > 0);

    // #then
    expect({
      during,
      after: {
        keys: newKeys(client),
        stored: newKeys(client).map((key) => storedRecord(client, key)?.c),
      },
    }).toEqual({
      during: {
        keys: during.keys,
        names: ['Скелет 2', 'Скелет 3'],
        stored: during.keys.map(() => null),
        commits: 0,
      },
      after: { keys: during.keys, stored: during.keys.map(() => 1) },
    });
  });

  test('during catch-up the copies take 8-character instance ids', async () => {
    // #given: a GM that never answers holds this client in catch-up.
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });

    // #when
    send(client, duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => addedRecords(client).length === 2);

    // #then: TASK-37 AC 1, the length written out by hand.
    expect(
      addedRecords(client)
        .map(lastKeySegment)
        .filter((id) => !/^[A-Za-z0-9_-]{8}$/.test(id)),
    ).toEqual([]);
  });

  test('a refused duplicate retry after command-id eviction draws a fresh record id', async () => {
    // #given
    const room = roomRig.openRoom();
    const draws = ['old-free', ...Array.from({ length: 6 }, () => 'gob'), 'fresh'];

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 60000 },
      engine: { newRecordId: () => draws.shift() ?? 'spent' },
    });

    await commandWithId(client, 'retry', duplicate('npc', 'mob', 'sk1', 2));
    await waitUntil(() => rejection(client, 'retry') === 'instance-exists');
    await evictCommandId(client, 'refusal');

    // #when
    await commandWithId(client, 'retry', duplicate('npc', 'mob', 'sk1', 1));
    await commandWithId(client, 'after-retry', duplicate('npc', 'mob', 'missing', 1));
    await waitUntil(() => rejection(client, 'after-retry') === 'unknown-instance');

    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => client.store.$sync.get().state === 'live');

    // #then
    expect(addedRecords(client).map((record) => record.k)).toEqual(['rep:npc:mob:fresh']);
  });

  test('a replayed duplicate retry after command-id eviction does not reuse occupied cached draws', async () => {
    // #given
    const room = roomRig.openRoom();
    const draws = [...Array.from({ length: 5 }, () => 'gob'), 'old-free', 'fresh'];

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 60000 },
      engine: { newRecordId: () => draws.shift() ?? 'spent' },
    });

    await commandWithId(client, 'retry', duplicate('npc', 'mob', 'sk1', 1));
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await waitUntil(() => storedRecord(client, 'rep:npc:mob:old-free') !== null);

    client.engine.catchUp();
    await waitUntil(() => client.store.$sync.get().state === 'catching-up');
    await evictCommandId(client, 'replay');

    // #when
    await commandWithId(client, 'retry', duplicate('npc', 'mob', 'sk1', 1));
    await commandWithId(client, 'after-retry', duplicate('npc', 'mob', 'missing', 1));
    await waitUntil(() => rejection(client, 'after-retry') === 'unknown-instance');

    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => client.store.$sync.get().state === 'live');

    // #then
    expect(addedRecords(client).map((record) => record.k)).toEqual([
      'rep:npc:mob:fresh',
      'rep:npc:mob:old-free',
    ]);
  });

  test('a duplicate retry after generation replacement draws its identity in the new generation', async () => {
    // #given
    const room = roomRig.openRoom();
    const higher = { n: 1, a: GHOST };
    const draws = ['old-free', 'fresh'];

    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 60000 },
      engine: { newRecordId: () => draws.shift() ?? 'spent' },
    });

    await commandWithId(client, 'retry', duplicate('npc', 'mob', 'sk1', 1));
    room.post(GHOST, { v: 3, g: higher, t: 'reset' });
    await waitUntil(() => rejection(client, 'retry') === 'data-replaced');
    await evictCommandId(client, 'replacement');

    // #when
    await commandWithId(client, 'retry', duplicate('npc', 'mob', 'sk1', 1));
    await commandWithId(client, 'after-retry', duplicate('npc', 'mob', 'missing', 1));
    await waitUntil(() => rejection(client, 'after-retry') === 'unknown-instance');

    const during = addedRecords(client).map((record) => record.k);

    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), base(), higher));
    await waitUntil(() => client.store.$sync.get().state === 'live');

    // #then
    expect(during).toEqual(['rep:npc:mob:fresh']);
  });
});

function block(
  sheetId: string,
  sectionId: string,
  instanceId: string,
  order: number,
  cells: FieldValues,
  c = 1,
  a = 'seed',
): VersionedRecord {
  return { k: `rep:${sheetId}:${sectionId}:${instanceId}`, d: { order, cells }, c, a };
}

function base(): VersionedRecord[] {
  return [PRESET_RECORD, ...SOURCE];
}

function duplicate(sheetId: string, sectionId: string, instanceId: string, count: number): Command {
  return { type: 'repeat-block-duplicate', sheetId, sectionId, instanceId, count };
}

const roomRig = createRoomRig({ seeded: [PRESET_RECORD, ...SOURCE], until: 'live' });

// A GM client waits until it is live, unless a GM that never answers holds it in catch-up.
async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  return roomRig.startClient(room, connectionId, {
    ...options,
    until: options.timing?.catchUpTimeoutMs === undefined ? 'live' : 'loaded',
  });
}

// The window's records, with the pending view standing in for the records of its keys.
function shownRecords(client: Client): ReadonlyMap<string, VersionedRecord> {
  return client.store.$records.get();
}

// Shown repeat blocks the test did not seed: the copies.
function addedRecords(client: Client): VersionedRecord[] {
  return [...shownRecords(client).values()]
    .filter((one) => one.k.startsWith('rep:') && !client.seeded.has(one.k))
    .sort((first, second) => (first.k < second.k ? -1 : 1));
}

function newKeys(client: Client): string[] {
  return addedRecords(client).map((one) => one.k);
}

// The copies in their order.
function copiesOf(client: Client): Copy[] {
  return addedRecords(client)
    .map((one) => ({ section: one.k.split(':')[2] ?? '', d: one.d }))
    .sort((first, second) => byOrder(first.d, second.d));
}

// The first field values of the NPC copies, in their order.
function namesOf(client: Client): string[] {
  return copiesOf(client).map((copy) => String(Object(copy.d).cells?.mob));
}

function byOrder(first: JsonValue | undefined, second: JsonValue | undefined): number {
  return Object(first).order - Object(second).order;
}

function lastKeySegment(record: Pick<VersionedRecord, 'k'>): string {
  return record.k.split(':').at(-1) ?? '';
}

async function commandWithId(client: Client, id: string, command: Command): Promise<void> {
  await client.platform.broadcast.sendMessage(
    UI_CHANNEL,
    { t: 'command', id, command },
    { destination: 'LOCAL' },
  );
}

async function evictCommandId(client: Client, prefix: string): Promise<void> {
  for (let index = 0; index < 256; index += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await commandWithId(client, `${prefix}-${index}`, duplicate('npc', 'mob', 'missing', 1));
  }

  await waitUntil(() => rejection(client, `${prefix}-255`) === 'unknown-instance');
}

function stateMessage(
  r: string,
  records: readonly VersionedRecord[],
  g = { n: 0, a: '' },
): JsonValue {
  return {
    v: 3,
    g,
    t: 'state',
    r,
    i: 1,
    n: 1,
    records: encodeStateRecords(records),
  };
}
