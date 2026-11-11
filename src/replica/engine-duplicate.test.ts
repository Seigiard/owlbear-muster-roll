import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { RecordIdKind } from '@/core/ids';
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
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';
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
  // Far past any test, so no ping goes out unless a test asks for one.
  gmLinkTimeoutMs: 60000,
  // Far past any test, so no room copy is written unless a test asks for one.
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;
const GHOST = 'ghost-gm';

const PRESET: Preset = {
  v: 1,
  character: { sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'str' }]] }] },
  npc: {
    sections: [
      {
        rows: [
          [
            { kind: 'field', type: 'number', id: 'ac' },
            { kind: 'field', type: 'number', id: 'hp' },
          ],
          [{ kind: 'field', type: 'check', id: 'elite' }],
        ],
      },
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
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

// "Скелет 1" with values in two rows, two live repeat rows, a deleted one, and every record form
// a copy must not take: a token link, access and a player link.
const SOURCE: readonly VersionedRecord[] = [
  npc('skel', 'Скелет 1', 0, 3),
  { k: 'row:skel:ac', d: { ac: 13, hp: 7 }, c: 4, a: 'seed' },
  { k: 'row:skel:elite', d: { elite: true }, c: 2, a: 'seed' },
  { k: 'rep:skel:attack:i1', d: { order: 0, cells: { attack: 'Меч', bonus: 2 } }, c: 5, a: 'seed' },
  { k: 'rep:skel:attack:i2', d: { order: 1, cells: { attack: 'Лук' } }, c: 1, a: 'seed' },
  { k: 'rep:skel:attack:i0', d: null, c: 2, a: 'seed' },
  { k: 'link:token1', d: 'skel', c: 1, a: 'seed' },
  { k: 'acl:skel:p1', d: { name: 'Оля' }, c: 1, a: 'seed' },
  { k: 'plink:skel:p1', d: { name: 'Оля' }, c: 1, a: 'seed' },
];

// What every copy of SOURCE holds, by key form, with the copy's ids taken out.
const COPIED_VALUES: Copy['values'] = [
  { form: 'rep:attack', d: { order: 0, cells: { attack: 'Меч', bonus: 2 } } },
  { form: 'rep:attack', d: { order: 1, cells: { attack: 'Лук' } } },
  { form: 'row:ac', d: { ac: 13, hp: 7 } },
  { form: 'row:elite', d: { elite: true } },
];

type Client = {
  connectionId: string;
  // The keys seeded into its storage, so the copies are what else it shows.
  seeded: ReadonlySet<string>;
  backing: MockStorageBacking;
  store: ProjectionStore;
  window: ReplicaClient;
};

type Heard = { from: string; data: JsonValue };

type Room = { room: MockRoom; heard: Heard[]; post: (from: string, data: JsonValue) => void };

type ClientOptions = {
  role?: PlayerRole;
  newRecordId?: (kind: RecordIdKind) => string;
  seeded?: readonly VersionedRecord[];
  // Stored records that fail the record schema, so the engine skips them at start.
  corrupt?: readonly JsonValue[];
  timing?: Partial<Timing>;
};

// One copy as the test reads it: its sheet data and its value records, keys and versions aside.
type Copy = { sheet: JsonValue; values: { form: string; d: JsonValue }[] };

const cleanups: (() => void)[] = [];

afterEach(() => {
  mock.restore();

  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('sheet-duplicate', () => {
  test('writes nine copies of "Скелет 1", "Скелет 2" to "Скелет 10", after the last NPC, with its live rows and repeat rows', async () => {
    // #given: another NPC at order 4, and a character at order 9 the NPC order must not follow.
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...base(), npc('gob', 'Гоблин', 4), pc('brok', 'Брок', 9)],
    });

    // #when
    send(client, duplicate('skel', 9));
    await waitUntil(() => newSheetKeys(client).length === 9);

    // #then
    expect(copiesOf(client)).toEqual(
      Array.from({ length: 9 }, (_unused, index) => ({
        sheet: { kind: 'npc', name: `Скелет ${index + 2}`, order: index + 5 },
        values: COPIED_VALUES,
      })),
    );
  });

  test('puts every copy under its own new sheet and instance ids, at c: 1 by this connection, with no link, acl or plink', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(client).length === 2);

    // #then
    const added = addedRecords(client);
    const instanceIds = added.filter((one) => one.k.startsWith('rep:')).map(lastKeySegment);

    expect({
      count: added.length,
      versions: [...new Set(added.map((one) => `${one.c}/${one.a}`))],
      forms: [...new Set(added.map((one) => one.k.split(':')[0] ?? ''))].sort((first, second) =>
        first < second ? -1 : 1,
      ),
      sheetIds: new Set(added.map(sheetIdOf)).size,
      instanceIds: new Set(instanceIds).size,
      reusedInstanceIds: instanceIds.filter((id) => ['i0', 'i1', 'i2'].includes(id)),
    }).toEqual({
      count: 10,
      versions: ['1/gm-a'],
      forms: ['rep', 'row', 'sheet'],
      sheetIds: 2,
      instanceIds: 4,
      reusedInstanceIds: [],
    });
  });

  test('leaves the source and its link, acl and plink records as they were', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('skel', 3));
    await waitUntil(() => newSheetKeys(client).length === 3);

    // #then
    expect(SOURCE.map((one) => stored(client, one.k))).toEqual([...SOURCE]);
  });

  test('sends the copies to the room in commits, which another GM client merges and persists', async () => {
    // #given
    const room = openRoom();
    const first = await startClient(room, 'gm-a');
    const second = await startClient(room, 'gm-b');

    // #when
    send(first, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(second).length === 2);

    // #then
    const keys = addedRecords(first).map((one) => one.k);

    expect({
      shown: keys.map((key) => shown(second, key)),
      stored: keys.map((key) => stored(second, key)),
    }).toEqual({
      shown: addedRecords(first),
      stored: addedRecords(first),
    });
  });

  test('numbers copies of an unnumbered source from 1 and leaves its name', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, npc('skel', 'Скелет', 0)],
    });

    // #when
    send(client, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(client).length === 2);

    // #then
    expect({
      names: copiesOf(client).map((copy) => Object(copy.sheet).name),
      source: shown(client, 'sheet:skel')?.d,
    }).toEqual({
      names: ['Скелет 1', 'Скелет 2'],
      source: { kind: 'npc', name: 'Скелет', order: 0 },
    });
  });

  test('numbers after the highest live NPC of the same base only', async () => {
    // #given: a higher NPC, and higher numbers on a character, a deleted NPC and another base.
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [
        PRESET_RECORD,
        npc('skel', 'Скелет 1', 0),
        npc('high', 'Скелет 7', 1),
        pc('char', 'Скелет 20', 2),
        { k: 'sheet:gone', d: null, c: 2, a: 'seed' },
        npc('archer', 'Скелет-лучник 30', 3),
      ],
    });

    // #when
    send(client, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(client).length === 2);

    // #then
    expect(copiesOf(client).map((copy) => Object(copy.sheet).name)).toEqual([
      'Скелет 8',
      'Скелет 9',
    ]);
  });

  test('an edit of one copy changes no other copy and not the source', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    send(client, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(client).length === 2);

    const [edited, other] = sheetIdsByOrder(client);
    const editedRep = repKeysOf(client, edited)[0] ?? '';

    // #when
    send(client, {
      type: 'field-patch',
      sheetId: edited ?? '',
      target: { kind: 'row', rowId: 'ac' },
      fieldId: 'hp',
      value: 1,
    });
    send(client, {
      type: 'field-patch',
      sheetId: edited ?? '',
      target: { kind: 'rep', sectionId: 'attack', instanceId: lastKeySegment({ k: editedRep }) },
      fieldId: 'attack',
      value: 'Топор',
    });
    await waitUntil(() => Object(shown(client, editedRep)?.d).cells?.attack === 'Топор');
    await waitUntil(() => Object(shown(client, `row:${edited}:ac`)?.d).hp === 1);

    // #then
    const rowsOf = (sheetId: string | undefined): JsonValue[] =>
      [`row:${sheetId}:ac`, ...repKeysOf(client, sheetId)].map(
        (key) => shown(client, key)?.d ?? null,
      );

    expect({ edited: rowsOf(edited), other: rowsOf(other), source: rowsOf('skel') }).toEqual({
      edited: [
        { ac: 13, hp: 1 },
        { order: 0, cells: { attack: 'Топор', bonus: 2 } },
        { order: 1, cells: { attack: 'Лук' } },
      ],
      other: [
        { ac: 13, hp: 7 },
        { order: 0, cells: { attack: 'Меч', bonus: 2 } },
        { order: 1, cells: { attack: 'Лук' } },
      ],
      source: [
        { ac: 13, hp: 7 },
        { order: 0, cells: { attack: 'Меч', bonus: 2 } },
        { order: 1, cells: { attack: 'Лук' } },
      ],
    });
  });

  test.each([
    ['a count of 0', duplicate('skel', 0), 'invalid-count'],
    ['a count of 51', duplicate('skel', 51), 'invalid-count'],
    ['a fractional count', duplicate('skel', 2.5), 'invalid-count'],
    ['a character', duplicate('brok', 1), 'not-npc'],
    ['a deleted NPC', duplicate('gone', 1), 'deleted-sheet'],
    ['a sheet that does not exist', duplicate('nobody', 1), 'unknown-sheet'],
    ['an id outside the nanoid alphabet', duplicate('a:b', 1), 'invalid-sheet-id'],
    ['a sheet record that fails its schema', duplicate('bad', 1), 'unknown-sheet'],
    ['a name whose number cannot fit the name limit', duplicate('long', 1), 'invalid-name'],
  ])('rejects %s and writes nothing', async (_name, command, reason) => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [
        ...base(),
        pc('brok', 'Брок', 0),
        { k: 'sheet:gone', d: null, c: 2, a: 'seed' },
        // A name past the limit, as a record holds any name: its next number has 101 digits.
        npc('long', `Скелет ${'9'.repeat(100)}`, 9),
      ],
      corrupt: [{ k: 'sheet:bad', d: { kind: 'npc', name: 'Битый' }, c: 1, a: 'seed' }],
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

  test('rejects a new sheet id that is already taken and writes nothing', async () => {
    // #given: every id the engine makes is the id of a live NPC.
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [...base(), npc('gob', 'Гоблин', 4)],
      newRecordId: () => 'gob',
    });

    const before = storedKeys(client);

    // #when
    const id = send(client, duplicate('skel', 1));

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({ reason: rejection(client, id), stored: storedKeys(client) }).toEqual({
      reason: 'sheet-exists',
      stored: before,
    });
  });

  test('gives every copy a 12-character sheet id and 8-character instance ids of the URL-safe alphabet', async () => {
    // #given
    const room = openRoom();
    const client = await startClient(room, 'gm-a');

    // #when
    send(client, duplicate('skel', 3));
    await waitUntil(() => newSheetKeys(client).length === 3);

    // #then: TASK-37 AC 1, the lengths written out by hand.
    const added = addedRecords(client);

    expect({
      sheetIds: added.map(sheetIdOf).filter((id) => !/^[A-Za-z0-9_-]{12}$/.test(id)),
      instanceIds: added
        .filter((one) => one.k.startsWith('rep:'))
        .map(lastKeySegment)
        .filter((id) => !/^[A-Za-z0-9_-]{8}$/.test(id)),
      reps: added.filter((one) => one.k.startsWith('rep:')).length,
    }).toEqual({ sheetIds: [], instanceIds: [], reps: 6 });
  });

  test('draws a taken sheet id again and writes the copy under the next free one', async () => {
    // #given: the first sheet id drawn is the id of a live NPC.
    const room = openRoom();
    const sheetIds = ['gob', 'fresh'];

    const client = await startClient(room, 'gm-a', {
      seeded: [...base(), npc('gob', 'Гоблин', 4)],
      newRecordId: (kind) => (kind === 'sheet' ? (sheetIds.shift() ?? 'spent') : newInstance()),
    });

    // #when
    send(client, duplicate('skel', 1));
    await waitUntil(() => newSheetKeys(client).length === 1);

    // #then
    expect({ sheets: newSheetKeys(client), gob: stored(client, 'sheet:gob') }).toEqual({
      sheets: ['sheet:fresh'],
      gob: npc('gob', 'Гоблин', 4),
    });
  });

  test('refuses two copies of an NPC with no values when every draw gives one sheet id', async () => {
    // #given: no record holds the id, so only the first copy of this batch takes it.
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, npc('bare', 'Зомби', 0)],
      newRecordId: () => 'twin',
    });

    const before = storedKeys(client);

    // #when
    const id = send(client, duplicate('bare', 2));

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({ reason: rejection(client, id), stored: storedKeys(client) }).toEqual({
      reason: 'sheet-exists',
      stored: before,
    });
  });

  test('refuses a copy whose two repeat rows draw one instance id every time and writes nothing', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'gm-a', {
      newRecordId: (kind) => (kind === 'sheet' ? 'copy' : 'same'),
    });

    const before = storedKeys(client);

    // #when
    const id = send(client, duplicate('skel', 1));

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({ reason: rejection(client, id), stored: storedKeys(client) }).toEqual({
      reason: 'instance-exists',
      stored: before,
    });
  });

  test('refuses an instance id whose rep: key under the new sheet id is a tombstone', async () => {
    // #given: an NPC with one repeat row, and a deleted row under the drawn sheet id. A tombstone
    // takes no sheet over, so only the instance check can find it.
    const room = openRoom();
    const dead: VersionedRecord = { k: 'rep:fresh:attack:dead', d: null, c: 4, a: 'seed' };

    const row: VersionedRecord = {
      k: 'rep:solo:attack:a1',
      d: { order: 0, cells: {} },
      c: 1,
      a: 'seed',
    };

    const client = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, npc('solo', 'Упырь', 0), row, dead],
      newRecordId: (kind) => (kind === 'sheet' ? 'fresh' : 'dead'),
    });

    const before = storedKeys(client);

    // #when
    const id = send(client, duplicate('solo', 1));

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({
      reason: rejection(client, id),
      stored: storedKeys(client),
      dead: stored(client, dead.k),
    }).toEqual({ reason: 'instance-exists', stored: before, dead });
  });

  test.each<[string, VersionedRecord]>([
    ['a row the source also has', { k: 'row:lone:ac', d: { ac: 9 }, c: 6, a: 'seed' }],
    ['a row the source lacks', { k: 'row:lone:other', d: { other: 1 }, c: 6, a: 'seed' }],
    ['a repeat row', { k: 'rep:lone:attack:zz', d: { order: 0, cells: {} }, c: 6, a: 'seed' }],
  ])(
    'refuses a sheet id that only an orphan holds, %s, and writes nothing',
    async (_name, orphan) => {
      // #given: a record whose sheet record never arrived, as a write that failed part way leaves it.
      const room = openRoom();

      const client = await startClient(room, 'gm-a', {
        seeded: [...base(), orphan],
        newRecordId: (kind) => (kind === 'sheet' ? 'lone' : newInstance()),
      });

      const before = storedKeys(client);

      // #when
      const id = send(client, duplicate('skel', 1));

      await waitUntil(() => rejection(client, id) !== undefined);

      // #then
      expect({
        reason: rejection(client, id),
        stored: storedKeys(client),
        orphan: stored(client, orphan.k),
      }).toEqual({ reason: 'sheet-exists', stored: before, orphan });
    },
  );

  test('sends fifty copies through the send queue to another GM client whole', async () => {
    // #given
    const room = openRoom();
    const first = await startClient(room, 'gm-a');
    const second = await startClient(room, 'gm-b');

    // #when
    send(first, duplicate('skel', 50));
    await waitUntil(() => addedRecords(second).length === 250);

    // #then
    expect({
      commits: heardOf(room, 'gm-a', 'commit').length > 1,
      second: addedRecords(second),
    }).toEqual({ commits: true, second: addedRecords(first) });
  });

  test('a player client is refused as not allowed and writes nothing', async () => {
    // #given
    const room = openRoom();

    const client = await startClient(room, 'player-a', { role: 'PLAYER' });

    // #when
    const id = send(client, duplicate('skel', 2));

    await waitUntil(() => rejection(client, id) !== undefined);

    // #then
    expect({ reason: rejection(client, id), sheets: newSheetKeys(client) }).toEqual({
      reason: 'not-allowed',
      sheets: [],
    });
  });

  test('a source repeat row that arrives during catch-up leaves the copies under the sheet keys shown', async () => {
    // #given
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });

    send(client, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(client).length === 2);

    const shownKeys = newSheetKeys(client);

    const arrived: VersionedRecord = {
      k: 'rep:skel:attack:i9',
      d: { order: 2, cells: { attack: 'Копьё' } },
      c: 1,
      a: GHOST,
    };

    // #when
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), [arrived]));
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length > 0);

    // #then
    expect({
      sheets: newSheetKeys(client),
      stored: shownKeys.map((key) => stored(client, key) !== null),
      rows: sheetIdsByOrder(client).map((sheetId) => repKeysOf(client, sheetId).length),
    }).toEqual({ sheets: shownKeys, stored: [true, true], rows: [3, 3] });
  });

  test('during catch-up the copies show at once, wait unsaved, and are written under the same keys on exit', async () => {
    // #given: a GM that never answers holds this client in catch-up.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });

    // #when
    send(client, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(client).length === 2);

    const during = {
      keys: newKeys(client),
      names: copiesOf(client).map((copy) => Object(copy.sheet).name),
      stored: newKeys(client).map((key) => stored(client, key)),
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
        stored: newKeys(client).map((key) => stored(client, key)?.c),
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

  test('during catch-up the copies take 12-character sheet ids and 8-character instance ids', async () => {
    // #given: a GM that never answers holds this client in catch-up.
    const room = openRoom();

    joinAs(room, GHOST, 'GM');

    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });

    // #when
    send(client, duplicate('skel', 2));
    await waitUntil(() => newSheetKeys(client).length === 2);

    // #then: TASK-37 AC 1, the lengths written out by hand.
    const added = addedRecords(client);

    expect({
      sheetIds: added.map(sheetIdOf).filter((id) => !/^[A-Za-z0-9_-]{12}$/.test(id)),
      instanceIds: added
        .filter((one) => one.k.startsWith('rep:'))
        .map(lastKeySegment)
        .filter((id) => !/^[A-Za-z0-9_-]{8}$/.test(id)),
      reps: added.filter((one) => one.k.startsWith('rep:')).length,
    }).toEqual({ sheetIds: [], instanceIds: [], reps: 4 });
  });
});

function npc(id: string, name: string, order: number, c = 1): VersionedRecord {
  return { k: `sheet:${id}`, d: { kind: 'npc', name, order }, c, a: 'seed' };
}

function pc(id: string, name: string, order: number): VersionedRecord {
  return { k: `sheet:${id}`, d: { kind: 'pc', name, order }, c: 1, a: 'seed' };
}

function base(): VersionedRecord[] {
  return [PRESET_RECORD, ...SOURCE];
}

// Distinct instance ids, for a test that fixes only the sheet ids.
let instanceCount = 0;

function newInstance(): string {
  instanceCount += 1;

  return `inst${String(instanceCount)}`;
}

function duplicate(sheetId: string, count: number): Command {
  return { type: 'sheet-duplicate', sheetId, count };
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

  cleanups.push(
    observer.broadcast.onMessage(SYNC_CHANNEL, (event) => {
      heard.push({ from: event.connectionId, data: event.data });
    }),
  );

  return {
    room,
    heard,
    post: (from, data) => {
      observer.sendRemoteAs(from, SYNC_CHANNEL, data);
    },
  };
}

function joinAs(room: Room, connectionId: string, role: PlayerRole): void {
  room.room.join({ id: connectionId, connectionId, name: connectionId, role });
}

// A GM client waits until it is live, unless a GM that never answers holds it in catch-up.
async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
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

  const platform = createMockPlatform(bus, backing, identity);

  const seeded = options.seeded ?? base();

  for (const record of [...seeded, ...(options.corrupt ?? [])]) {
    backing.set(`${STORAGE_PREFIX}${String(Object(record).k)}`, JSON.stringify(record));
  }

  platform.joinParty();

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: { ...TIMING, ...options.timing },
    newRecordId: options.newRecordId,
  });

  const store = createProjectionStore();

  const window = startReplicaClient(
    createMockPlatform(bus, backing, identity).broadcast,
    createSendQueue(platform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop);
  await waitUntil(() => store.$loaded.get());

  if (options.timing?.catchUpTimeoutMs === undefined) {
    await waitUntil(() => store.$sync.get().state === 'live');
  }

  return { connectionId, seeded: new Set(seeded.map((one) => one.k)), backing, store, window };
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

// The window's records, with the pending view standing in for the records of its keys.
function shownRecords(client: Client): ReadonlyMap<string, VersionedRecord> {
  return client.store.$records.get();
}

function shown(client: Client, key: string): VersionedRecord | undefined {
  return shownRecords(client).get(key);
}

function stored(client: Client, key: string): VersionedRecord | null {
  const text = client.backing.get(`${STORAGE_PREFIX}${key}`);

  return text === null ? null : recordSchema.parse(JSON.parse(text));
}

function storedKeys(client: Client): string[] {
  return client.backing.keys().sort();
}

// Shown records the test did not seed: the copies.
function addedRecords(client: Client): VersionedRecord[] {
  return [...shownRecords(client).values()]
    .filter((one) => !client.seeded.has(one.k))
    .sort((first, second) => (first.k < second.k ? -1 : 1));
}

function newKeys(client: Client): string[] {
  return addedRecords(client).map((one) => one.k);
}

function newSheetKeys(client: Client): string[] {
  return newKeys(client).filter((key) => key.startsWith('sheet:'));
}

// The copies' sheet ids in their NPC order.
function sheetIdsByOrder(client: Client): string[] {
  return addedRecords(client)
    .filter((one) => one.k.startsWith('sheet:'))
    .sort((first, second) => Object(first.d).order - Object(second.d).order)
    .map(sheetIdOf);
}

// One copy's repeat row keys, in their row order.
function repKeysOf(client: Client, sheetId: string | undefined): string[] {
  return [...shownRecords(client).values()]
    .filter((one) => one.k.startsWith(`rep:${sheetId}:`) && one.d !== null)
    .sort((first, second) => Object(first.d).order - Object(second.d).order)
    .map((one) => one.k);
}

function copiesOf(client: Client): Copy[] {
  return sheetIdsByOrder(client).map((sheetId) => ({
    sheet: shown(client, `sheet:${sheetId}`)?.d ?? null,
    values: addedRecords(client)
      .filter((one) => sheetIdOf(one) === sheetId && !one.k.startsWith('sheet:'))
      .map((one) => ({ form: formOf(one.k), d: one.d }))
      .sort((first, second) =>
        `${first.form}${JSON.stringify(first.d)}` < `${second.form}${JSON.stringify(second.d)}`
          ? -1
          : 1,
      ),
  }));
}

// `row:{rowId}` or `rep:{sectionId}`: a value key with its sheet and instance ids taken out.
function formOf(key: string): string {
  const [form = '', , part = ''] = key.split(':');

  return `${form}:${part}`;
}

function sheetIdOf(record: Pick<VersionedRecord, 'k'>): string {
  return record.k.split(':')[1] ?? '';
}

function lastKeySegment(record: Pick<VersionedRecord, 'k'>): string {
  return record.k.split(':').at(-1) ?? '';
}

function heardOf(room: Room, from: string, t: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === t ? [message.data] : [],
  );
}

function lastRequest(room: Room, from: string): string {
  const nonce = heardOf(room, from, 'state-request')
    .map((message) => String(Object(message).r))
    .at(-1);

  if (nonce === undefined) {
    throw new Error(`${from} has asked for no state`);
  }

  return nonce;
}

function stateMessage(r: string, records: readonly VersionedRecord[]): JsonValue {
  return {
    v: 1,
    g: { n: 0, a: '' },
    t: 'state',
    r,
    i: 1,
    n: 1,
    records: encodeStateRecords(records),
  };
}
