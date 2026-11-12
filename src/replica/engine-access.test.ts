import { describe, expect, test } from 'bun:test';

import type { PartyEntry } from '@/core/access';
import { ownerOf } from '@/core/merge';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import {
  createRoomRig,
  rejection,
  send,
  shown,
  storedRecord,
  waitUntil,
  type RigClient,
  type RigRoom,
} from '@/replica/room-rig';

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
                [{ kind: 'field', type: 'number', id: 'str' }],
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
            {
              repeat: true,
              tokens: true,
              rows: [
                [
                  { kind: 'field', type: 'text', id: 'mob' },
                  { kind: 'field', type: 'number', id: 'hp' },
                ],
              ],
            },
          ],
        },
      ],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

// "Брок" is a live sheet of the sheet set "pc", "npc" a single sheet, and "Лиза" was deleted.
const BASE: readonly VersionedRecord[] = [
  PRESET_RECORD,
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:name', d: { name: 'Брок' }, c: 1, a: 'seed' },
  { k: 'sheet:liza', d: null, c: 2, a: 'seed' },
];

type Client = RigClient;

type Room = RigRoom;

describe('acl-set', () => {
  test('grants access: acl:{sheetId}:{playerId} holds the name at c: 1 by this connection, saved and sent', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await roomRig.startClient(room, 'gm-a');

    // #when
    send(client, { type: 'acl-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля', on: true });
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    const expected: VersionedRecord = { k: 'acl:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'gm-a' };

    expect({
      shown: shown(client, 'acl:brok:p-oly'),
      stored: storedRecord(client, 'acl:brok:p-oly'),
      sent: committed(room, 'gm-a'),
    }).toEqual({ shown: expected, stored: expected, sent: [expected] });
  });

  test('revokes access: the acl: record is tombstoned, saved and sent', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await roomRig.startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'acl:brok:p-oly', d: { name: 'Оля' }, c: 3, a: 'seed' }],
    });

    // #when
    send(client, { type: 'acl-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля', on: false });
    await waitUntil(() => committed(room, 'gm-a').length === 1);

    // #then
    const expected: VersionedRecord = { k: 'acl:brok:p-oly', d: null, c: 4, a: 'gm-a' };

    expect({
      shown: shown(client, 'acl:brok:p-oly'),
      stored: storedRecord(client, 'acl:brok:p-oly'),
      sent: committed(room, 'gm-a'),
    }).toEqual({ shown: expected, stored: expected, sent: [expected] });
  });

  test('grants again over a tombstone with the name of the moment', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await roomRig.startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'acl:brok:p-oly', d: null, c: 5, a: 'seed' }],
    });

    // #when
    send(client, { type: 'acl-set', sheetId: 'brok', playerId: 'p-oly', name: 'Ольга', on: true });
    await waitUntil(() => shown(client, 'acl:brok:p-oly')?.d !== null);

    // #then
    expect(storedRecord(client, 'acl:brok:p-oly')).toEqual({
      k: 'acl:brok:p-oly',
      d: { name: 'Ольга' },
      c: 6,
      a: 'gm-a',
    });
  });

  for (const [label, name, expected] of [
    ['trims the name', '  Оля  ', 'Оля'],
    ['cuts the name at 100 code points', `${'😀'.repeat(120)}`, '😀'.repeat(100)],
    ['stores "" for a blank name', '   ', ''],
  ] as const) {
    test(`${label} it stores`, async () => {
      // #given
      const room = roomRig.openRoom();
      const client = await roomRig.startClient(room, 'gm-a');

      // #when
      send(client, { type: 'acl-set', sheetId: 'brok', playerId: 'p-oly', name, on: true });
      await waitUntil(() => shown(client, 'acl:brok:p-oly') !== undefined);

      // #then
      expect(storedRecord(client, 'acl:brok:p-oly')?.d).toEqual({ name: expected });
    });
  }

  for (const [label, seeded, on] of [
    ['a grant that is already live with that name', { name: 'Оля' }, true],
    ['a revoke with no live record', null, false],
  ] as const) {
    test(`refuses ${label} with "unchanged" and writes nothing`, async () => {
      // #given
      const room = roomRig.openRoom();
      const before: VersionedRecord = { k: 'acl:brok:p-oly', d: seeded, c: 2, a: 'seed' };
      const client = await roomRig.startClient(room, 'gm-a', { seeded: [...BASE, before] });

      // #when
      const id = send(client, {
        type: 'acl-set',
        sheetId: 'brok',
        playerId: 'p-oly',
        name: 'Оля',
        on,
      });

      await waitUntil(() => rejection(client, id) !== undefined);

      // #then
      expect({
        reason: rejection(client, id),
        stored: storedRecord(client, 'acl:brok:p-oly'),
      }).toEqual({
        reason: 'unchanged',
        stored: before,
      });
    });
  }

  for (const [sheetId, playerId, reason] of [
    ['npc', 'p-oly', 'not-sheet-set'],
    ['liza', 'p-oly', 'deleted-sheet'],
    ['nobody', 'p-oly', 'unknown-sheet'],
    ['bad:id', 'p-oly', 'invalid-sheet-id'],
    ['brok', 'a:b', 'invalid-player-id'],
    ['brok', '', 'invalid-player-id'],
  ] as const) {
    test(`refuses sheet "${sheetId}" and player "${playerId}" with "${reason}" and writes nothing`, async () => {
      // #given
      const room = roomRig.openRoom();
      const client = await roomRig.startClient(room, 'gm-a');

      // #when
      const id = send(client, { type: 'acl-set', sheetId, playerId, name: 'Оля', on: true });
      await waitUntil(() => rejection(client, id) !== undefined);

      // #then
      expect({
        reason: rejection(client, id),
        acl: [...client.store.$records.get().keys()].filter((key) => key.startsWith('acl:')),
        sent: committed(room, 'gm-a'),
      }).toEqual({ reason, acl: [], sent: [] });
    });
  }

  test('refuses a player with "not-allowed" and writes nothing', async () => {
    // #given
    const room = roomRig.openRoom();
    await roomRig.startClient(room, 'gm-a');
    const player = await roomRig.startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, 'sheet:brok') !== undefined);

    // #when
    const id = send(player, {
      type: 'acl-set',
      sheetId: 'brok',
      playerId: 'player-a',
      name: 'player-a',
      on: true,
    });

    await waitUntil(() => rejection(player, id) !== undefined);

    // #then
    expect({
      reason: rejection(player, id),
      shown: shown(player, 'acl:brok:player-a'),
      sent: committed(room, 'player-a'),
    }).toEqual({ reason: 'not-allowed', shown: undefined, sent: [] });
  });

  test('reaches a player, whose window then holds its live acl:, and the revoke takes it back', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmClient = await roomRig.startClient(room, 'gm-a');
    const player = await roomRig.startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, 'sheet:brok') !== undefined);

    // #when
    send(gmClient, {
      type: 'acl-set',
      sheetId: 'brok',
      playerId: 'player-a',
      name: 'player-a',
      on: true,
    });
    await waitUntil(() => shown(player, 'acl:brok:player-a')?.d != null);
    const granted = shown(player, 'acl:brok:player-a')?.d;

    send(gmClient, {
      type: 'acl-set',
      sheetId: 'brok',
      playerId: 'player-a',
      name: 'player-a',
      on: false,
    });
    await waitUntil(() => shown(player, 'acl:brok:player-a')?.d === null);

    // #then
    expect(granted).toEqual({ name: 'player-a' });
  });

  test('a sheet delete tombstones the acl: records the command wrote', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await roomRig.startClient(room, 'gm-a');

    send(client, { type: 'acl-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля', on: true });
    send(client, { type: 'acl-set', sheetId: 'brok', playerId: 'p-gena', name: 'Гена', on: true });
    await waitUntil(() => shown(client, 'acl:brok:p-gena') !== undefined);

    // #when
    send(client, { type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => shown(client, 'sheet:brok')?.d === null);

    // #then
    expect([
      storedRecord(client, 'acl:brok:p-oly'),
      storedRecord(client, 'acl:brok:p-gena'),
    ]).toEqual([
      { k: 'acl:brok:p-oly', d: null, c: 2, a: 'gm-a' },
      { k: 'acl:brok:p-gena', d: null, c: 2, a: 'gm-a' },
    ]);
  });
});

describe('owner-set', () => {
  test('picks an owner: acl: then plink: hold the name, in one commit, saved and shown', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await roomRig.startClient(room, 'gm-a');

    // #when
    send(client, { type: 'owner-set', sheetId: 'brok', playerId: 'p-oly', name: ' Оля ' });
    await waitUntil(() => commits(room, 'gm-a').length === 1);

    // #then
    const acl: VersionedRecord = { k: 'acl:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'gm-a' };
    const plink: VersionedRecord = { k: 'plink:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'gm-a' };

    expect({
      sent: commits(room, 'gm-a'),
      stored: [storedRecord(client, acl.k), storedRecord(client, plink.k)],
      owner: ownerOf(client.store.$records.get().values(), 'brok'),
    }).toEqual({ sent: [[acl, plink]], stored: [acl, plink], owner: 'p-oly' });
  });

  test("a new owner tombstones the previous owner's plink: and leaves the previous acl: alone", async () => {
    // #given
    const room = roomRig.openRoom();
    const aclA: VersionedRecord = { k: 'acl:brok:p-oly', d: { name: 'Оля' }, c: 3, a: 'seed' };

    const client = await roomRig.startClient(room, 'gm-a', {
      seeded: [...BASE, aclA, { k: 'plink:brok:p-oly', d: { name: 'Оля' }, c: 2, a: 'seed' }],
    });

    // #when
    send(client, { type: 'owner-set', sheetId: 'brok', playerId: 'p-gena', name: 'Гена' });
    await waitUntil(() => commits(room, 'gm-a').length === 1);

    // #then
    expect({
      sent: commits(room, 'gm-a'),
      aclA: storedRecord(client, 'acl:brok:p-oly'),
      owner: ownerOf(client.store.$records.get().values(), 'brok'),
    }).toEqual({
      sent: [
        [
          { k: 'acl:brok:p-gena', d: { name: 'Гена' }, c: 1, a: 'gm-a' },
          { k: 'plink:brok:p-oly', d: null, c: 3, a: 'gm-a' },
          { k: 'plink:brok:p-gena', d: { name: 'Гена' }, c: 1, a: 'gm-a' },
        ],
      ],
      aclA,
      owner: 'p-gena',
    });
  });

  test('writes no acl: for an owner whose acl: is already live, and keeps it as it was', async () => {
    // #given
    const room = roomRig.openRoom();
    const acl: VersionedRecord = { k: 'acl:brok:p-oly', d: { name: 'Оля' }, c: 4, a: 'seed' };

    const client = await roomRig.startClient(room, 'gm-a', { seeded: [...BASE, acl] });

    // #when
    send(client, { type: 'owner-set', sheetId: 'brok', playerId: 'p-oly', name: 'Ольга' });
    await waitUntil(() => commits(room, 'gm-a').length === 1);

    // #then
    expect({ sent: commits(room, 'gm-a'), acl: storedRecord(client, acl.k) }).toEqual({
      sent: [[{ k: 'plink:brok:p-oly', d: { name: 'Ольга' }, c: 1, a: 'gm-a' }]],
      acl,
    });
  });

  test('writes acl: again over its tombstone, as picking an owner turns editing on', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await roomRig.startClient(room, 'gm-a', {
      seeded: [...BASE, { k: 'acl:brok:p-oly', d: null, c: 6, a: 'seed' }],
    });

    // #when
    send(client, { type: 'owner-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля' });
    await waitUntil(() => commits(room, 'gm-a').length === 1);

    // #then
    expect(storedRecord(client, 'acl:brok:p-oly')).toEqual({
      k: 'acl:brok:p-oly',
      d: { name: 'Оля' },
      c: 7,
      a: 'gm-a',
    });
  });

  test('"Никто" tombstones every live plink: of the sheet and leaves acl: as it was', async () => {
    // #given
    const room = roomRig.openRoom();
    const acl: VersionedRecord = { k: 'acl:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'seed' };

    const client = await roomRig.startClient(room, 'gm-a', {
      seeded: [
        ...BASE,
        acl,
        { k: 'plink:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'seed' },
        { k: 'plink:brok:p-gena', d: { name: 'Гена' }, c: 2, a: 'seed' },
        { k: 'plink:brok:p-vova', d: null, c: 5, a: 'seed' },
        { k: 'plink:kira:p-oly', d: { name: 'Оля' }, c: 1, a: 'seed' },
      ],
    });

    // #when
    send(client, { type: 'owner-set', sheetId: 'brok', playerId: null, name: '' });
    await waitUntil(() => commits(room, 'gm-a').length === 1);

    // #then
    expect({
      sent: sortedByKey(commits(room, 'gm-a')[0] ?? []),
      acl: storedRecord(client, acl.k),
      owner: ownerOf(client.store.$records.get().values(), 'brok'),
    }).toEqual({
      sent: [
        { k: 'plink:brok:p-gena', d: null, c: 3, a: 'gm-a' },
        { k: 'plink:brok:p-oly', d: null, c: 2, a: 'gm-a' },
      ],
      acl,
      owner: null,
    });
  });

  for (const [label, seeded, playerId] of [
    ['"Никто" with no live plink:', [], null],
    [
      'the owner picked again',
      [
        { k: 'acl:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'seed' },
        // A live link keeps its name, so a pick under a newer name changes nothing either.
        { k: 'plink:brok:p-oly', d: { name: 'Оля старое' }, c: 1, a: 'seed' },
      ],
      'p-oly',
    ],
  ] as const) {
    test(`refuses ${label} with "unchanged" and writes nothing`, async () => {
      // #given
      const room = roomRig.openRoom();
      const client = await roomRig.startClient(room, 'gm-a', { seeded: [...BASE, ...seeded] });

      // #when
      const id = send(client, { type: 'owner-set', sheetId: 'brok', playerId, name: 'Оля' });
      await waitUntil(() => rejection(client, id) !== undefined);

      // #then
      expect({ reason: rejection(client, id), sent: commits(room, 'gm-a') }).toEqual({
        reason: 'unchanged',
        sent: [],
      });
    });
  }

  for (const [sheetId, playerId, reason] of [
    ['npc', 'p-oly', 'not-sheet-set'],
    ['npc', null, 'not-sheet-set'],
    ['liza', 'p-oly', 'deleted-sheet'],
    ['nobody', 'p-oly', 'unknown-sheet'],
    ['bad:id', 'p-oly', 'invalid-sheet-id'],
    ['brok', 'a:b', 'invalid-player-id'],
    ['brok', '', 'invalid-player-id'],
  ] as const) {
    test(`refuses sheet "${sheetId}" and player ${JSON.stringify(playerId)} with "${reason}" and writes nothing`, async () => {
      // #given
      const room = roomRig.openRoom();
      const client = await roomRig.startClient(room, 'gm-a');

      // #when
      const id = send(client, { type: 'owner-set', sheetId, playerId, name: 'Оля' });
      await waitUntil(() => rejection(client, id) !== undefined);

      // #then
      expect({ reason: rejection(client, id), sent: commits(room, 'gm-a') }).toEqual({
        reason,
        sent: [],
      });
    });
  }

  test('refuses a player with "not-allowed" and writes nothing', async () => {
    // #given
    const room = roomRig.openRoom();
    await roomRig.startClient(room, 'gm-a');
    const player = await roomRig.startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, 'sheet:brok') !== undefined);

    // #when
    const id = send(player, {
      type: 'owner-set',
      sheetId: 'brok',
      playerId: 'player-a',
      name: 'player-a',
    });

    await waitUntil(() => rejection(player, id) !== undefined);

    // #then
    expect({
      reason: rejection(player, id),
      shown: shown(player, 'plink:brok:player-a'),
      sent: commits(room, 'player-a'),
    }).toEqual({ reason: 'not-allowed', shown: undefined, sent: [] });
  });

  test('clearing "Может править" for the owner tombstones acl: only, and the owner stays', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await roomRig.startClient(room, 'gm-a');

    send(client, { type: 'owner-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля' });
    await waitUntil(() => shown(client, 'plink:brok:p-oly') !== undefined);

    // #when
    send(client, { type: 'acl-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля', on: false });
    await waitUntil(() => shown(client, 'acl:brok:p-oly')?.d === null);

    // #then
    expect({
      plink: storedRecord(client, 'plink:brok:p-oly'),
      owner: ownerOf(client.store.$records.get().values(), 'brok'),
    }).toEqual({
      plink: { k: 'plink:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'gm-a' },
      owner: 'p-oly',
    });
  });

  test('with two live plink: records, the next pick tombstones both', async () => {
    // #given: two GM clients picked at once, and the merge kept both.
    const room = roomRig.openRoom();

    const client = await roomRig.startClient(room, 'gm-a', {
      seeded: [
        ...BASE,
        { k: 'plink:brok:p-oly', d: { name: 'Оля' }, c: 1, a: 'gm-b' },
        { k: 'plink:brok:p-gena', d: { name: 'Гена' }, c: 1, a: 'gm-c' },
      ],
    });

    const before = ownerOf(client.store.$records.get().values(), 'brok');

    // #when
    send(client, { type: 'owner-set', sheetId: 'brok', playerId: 'p-vova', name: 'Вова' });
    await waitUntil(() => commits(room, 'gm-a').length === 1);

    // #then
    expect({
      before,
      plinks: sortedByKey(
        [...client.store.$records.get().values()].filter((record) =>
          record.k.startsWith('plink:brok:'),
        ),
      ).map((record) => [record.k, record.d]),
      after: ownerOf(client.store.$records.get().values(), 'brok'),
    }).toEqual({
      before: 'p-gena',
      plinks: [
        ['plink:brok:p-gena', null],
        ['plink:brok:p-oly', null],
        ['plink:brok:p-vova', { name: 'Вова' }],
      ],
      after: 'p-vova',
    });
  });

  test('two GM clients that pick different owners at once end with one owner on every client', async () => {
    // #given
    const room = roomRig.openRoom();
    const gmA = await roomRig.startClient(room, 'gm-a');
    const gmB = await roomRig.startClient(room, 'gm-b');
    const player = await roomRig.startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, 'sheet:brok') !== undefined);

    // #when
    send(gmA, { type: 'owner-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля' });
    send(gmB, { type: 'owner-set', sheetId: 'brok', playerId: 'p-gena', name: 'Гена' });

    const keys = ['plink:brok:p-oly', 'plink:brok:p-gena'];

    // Settled: every client holds both keys at the same versions.
    await waitUntil(() =>
      [gmB, player].every((client) =>
        keys.every(
          (key) =>
            shown(gmA, key) !== undefined &&
            JSON.stringify(shown(client, key)) === JSON.stringify(shown(gmA, key)),
        ),
      ),
    );

    // #then: the expected owner is read from the stored records, by `(c, a)` and then by key.
    const live = keys.flatMap((key) => {
      const record = storedRecord(gmA, key);

      return record === null || record.d === null ? [] : [record];
    });

    const highest = live.reduce<VersionedRecord | null>(
      (best, record) =>
        best === null ||
        record.c > best.c ||
        (record.c === best.c && (record.a > best.a || (record.a === best.a && record.k > best.k)))
          ? record
          : best,
      null,
    );

    const owners = [gmA, gmB, player].map((client) =>
      ownerOf(client.store.$records.get().values(), 'brok'),
    );

    const expected = highest === null ? null : highest.k.slice('plink:brok:'.length);

    expect(expected).not.toBeNull();
    expect(owners).toEqual([expected, expected, expected]);
  });

  for (const [label, playerId] of [
    ['a player id the party lists as a GM', 'gm-b'],
    ["this client's own player id", 'gm-a'],
  ] as const) {
    test(`refuses ${label} as owner with "invalid-player-id" and writes nothing`, async () => {
      // #given
      const room = roomRig.openRoom();
      room.join('gm-b', 'GM', 'Мастер');
      const client = await roomRig.startClient(room, 'gm-a');
      await waitUntil(() => client.store.$party.get().length === 1);

      // #when
      const id = send(client, { type: 'owner-set', sheetId: 'brok', playerId, name: 'Мастер' });
      await waitUntil(() => rejection(client, id) !== undefined);

      // #then
      expect({ reason: rejection(client, id), sent: commits(room, 'gm-a') }).toEqual({
        reason: 'invalid-player-id',
        sent: [],
      });
    });
  }

  test('a sheet delete tombstones the plink: records the command wrote', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await roomRig.startClient(room, 'gm-a');

    send(client, { type: 'owner-set', sheetId: 'brok', playerId: 'p-oly', name: 'Оля' });
    await waitUntil(() => shown(client, 'plink:brok:p-oly') !== undefined);

    // #when
    send(client, { type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => shown(client, 'sheet:brok')?.d === null);

    // #then
    expect([
      storedRecord(client, 'plink:brok:p-oly'),
      storedRecord(client, 'acl:brok:p-oly'),
    ]).toEqual([
      { k: 'plink:brok:p-oly', d: null, c: 2, a: 'gm-a' },
      { k: 'acl:brok:p-oly', d: null, c: 2, a: 'gm-a' },
    ]);
  });
});

describe('party in the projection', () => {
  test('gives a GM window every other party member with player id, name and role', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join('p-oly', 'PLAYER', 'Оля');
    room.join('gm-b', 'GM', 'Мастер');

    // #when
    const client = await roomRig.startClient(room, 'gm-a');

    // #then
    await waitUntil(() => client.store.$party.get().length === 2);
    expect(sortedParty(client)).toEqual([
      { id: 'gm-b', name: 'Мастер', role: 'GM' },
      { id: 'p-oly', name: 'Оля', role: 'PLAYER' },
    ]);
  });

  test('follows a player who joins and leaves while the window is open', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await roomRig.startClient(room, 'gm-a');

    // #when
    room.join('p-oly', 'PLAYER', 'Оля');
    await waitUntil(() => client.store.$party.get().length === 1);
    const joined = sortedParty(client);

    room.room.leave('p-oly');
    await waitUntil(() => client.store.$party.get().length === 0);

    // #then
    expect(joined).toEqual([{ id: 'p-oly', name: 'Оля', role: 'PLAYER' }]);
  });

  test('gives a player window no party', async () => {
    // #given
    const room = roomRig.openRoom();
    await roomRig.startClient(room, 'gm-a');
    room.join('p-oly', 'PLAYER', 'Оля');

    // #when
    const player = await roomRig.startClient(room, 'player-a', { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(player, 'sheet:brok') !== undefined);

    // #then
    expect(player.store.$party.get()).toEqual([]);
  });
});

const roomRig = createRoomRig({ seeded: BASE });

function sortedParty(client: Client): PartyEntry[] {
  return [...client.store.$party.get()].sort((first, second) =>
    first.id < second.id ? -1 : first.id > second.id ? 1 : 0,
  );
}

// The records one client sent to the room in commits, in send order.
function committed(room: Room, from: string): VersionedRecord[] {
  return room.heard.flatMap((message) => {
    const data = Object(message.data);

    return message.from === from && data.t === 'commit'
      ? recordSchema.array().parse(data.records)
      : [];
  });
}

// The records of each commit one client sent to the room, one list per message, in send order.
function commits(room: Room, from: string): VersionedRecord[][] {
  return room.heard.flatMap((message) => {
    const data = Object(message.data);

    return message.from === from && data.t === 'commit'
      ? [recordSchema.array().parse(data.records)]
      : [];
  });
}

function sortedByKey(records: readonly VersionedRecord[]): VersionedRecord[] {
  return [...records].sort((first, second) =>
    first.k < second.k ? -1 : first.k > second.k ? 1 : 0,
  );
}
