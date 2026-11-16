import { fixturePatch } from '../../tests/support/block-fixtures';
import { expect, test } from 'bun:test';
import { encodePreset, type Preset } from '@/core/preset';
import { NOTHING_ERASED } from '@/core/preset-migrate';
import { blockDataSchema, cellValues, type VersionedRecord } from '@/core/records';
import { createRoomRig, send, shown, storedRecord } from '../../tests/support/room-rig';

const preset: Preset = {
  v: 3,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Party',
      nameField: 'name',
      tabs: [
        {
          sections: [
            {
              rows: [
                [{ kind: 'field', type: 'text', id: 'name' }],
                [
                  { kind: 'field', type: 'number', id: 'str' },
                  { kind: 'field', type: 'check', id: 'tired' },
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
  ],
};

const root: VersionedRecord = {
  k: 'blk:hero',
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
  d: { set: 'pc', order: 0, cells: {} },
};

const block: VersionedRecord = {
  k: 'blk:hero:item:sword',
  c: 1,
  a: 'seed',
  l: [1, 'seed'],
  d: { order: 0, cells: { item: ['Sword', 1, 'seed'] } },
};

const rig = createRoomRig({
  seeded: [{ k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' }, root, block],
  timing: { catchUpTimeoutMs: 100, stateAnswerDelayMaxMs: 0 },
  until: 'live',
});

function values(
  record: VersionedRecord | undefined | null,
): Record<string, string | number | boolean> {
  return cellValues(blockDataSchema.parse(record?.d).cells);
}

test('two GMs preserve exact different fields of one root in both views, storage and reload', async () => {
  // #given
  const room = rig.openRoom();
  const first = await rig.startClient(room, 'gm-a');
  const second = await rig.startClient(room, 'gm-b');
  // #when
  send(first, {
    type: 'field-patch',
    sheetId: 'hero',
    target: { kind: 'row', rowId: 'str' },
    fieldId: 'str',
    value: 12,
  });
  send(second, {
    type: 'field-patch',
    sheetId: 'hero',
    target: { kind: 'row', rowId: 'str' },
    fieldId: 'tired',
    value: false,
  });
  await rig.waitUntil(() =>
    [first, second].every((client) => Object.keys(values(shown(client, root.k))).length === 2),
  );
  first.stop();

  const reloaded = await rig.startClient(room, 'gm-reloaded', {
    backing: first.backing,
    seeded: [],
  });

  // #then
  expect([
    values(shown(second, root.k)),
    values(storedRecord(second, root.k)),
    values(shown(reloaded, root.k)),
    values(storedRecord(reloaded, root.k)),
  ]).toEqual(Array(4).fill({ str: 12, tired: false }));
});

test('concurrent edits to different cells of a repeat block both persist', async () => {
  // #given
  const room = rig.openRoom();
  const first = await rig.startClient(room, 'gm-a');
  const second = await rig.startClient(room, 'gm-b');
  const target = { kind: 'rep', sectionId: 'item', instanceId: 'sword' } as const;
  // #when
  send(first, { type: 'field-patch', sheetId: 'hero', target, fieldId: 'item', value: 'Axe' });
  send(second, { type: 'field-patch', sheetId: 'hero', target, fieldId: 'qty', value: 0 });
  await rig.waitUntil(() =>
    [first, second].every(
      (client) =>
        values(shown(client, block.k)).item === 'Axe' && values(shown(client, block.k)).qty === 0,
    ),
  );
  // #then
  expect([values(storedRecord(first, block.k)), values(storedRecord(second, block.k))]).toEqual([
    { item: 'Axe', qty: 0 },
    { item: 'Axe', qty: 0 },
  ]);
});

test('deleting a block and its link defeats a later higher-counter cell commit', async () => {
  // #given
  const room = rig.openRoom(['token']);

  const first = await rig.startClient(room, 'gm-a', {
    seeded: [
      { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' },
      root,
      block,
      { k: 'link:token', d: { s: 'hero', i: 'sword' }, c: 1, a: 'seed' },
    ],
  });

  room.join('late-gm', 'GM');
  // #when
  send(first, {
    type: 'repeat-block-delete',
    sheetId: 'hero',
    sectionId: 'item',
    instanceId: 'sword',
  });
  await rig.waitUntil(() => shown(first, block.k)?.d === null);
  room.post('late-gm', {
    v: 4,
    g: { n: 0, a: '' },
    t: 'commit',
    records: [
      fixturePatch(block, { order: 0, cells: { qty: [99, 100, 'late-gm'] } }, 100, 'late-gm'),
    ],
  });
  const later = await rig.startClient(room, 'gm-b', { seeded: [] });
  // #then
  expect([
    shown(first, block.k)?.d,
    shown(later, block.k)?.d,
    shown(first, 'link:token')?.d,
    shown(later, 'link:token')?.d,
  ]).toEqual([null, null, null, null]);
});

test('preset relocation A to B to A keeps block identity and values over the prior tombstone', async () => {
  // #given
  const room = rig.openRoom();
  const client = await rig.startClient(room, 'gm-a');

  const moved: Preset = {
    v: 3,
    templates: [
      {
        id: 'pc',
        kind: 'set',
        title: 'Party',
        nameField: 'name',
        tabs: [
          {
            sections: [
              {
                rows: [
                  [{ kind: 'field', type: 'text', id: 'name' }],
                  [
                    { kind: 'field', type: 'number', id: 'str' },
                    { kind: 'field', type: 'check', id: 'tired' },
                  ],
                ],
              },
              {
                repeat: true,
                tokens: true,
                rows: [
                  [
                    { kind: 'field', type: 'number', id: 'qty' },
                    { kind: 'field', type: 'text', id: 'item' },
                  ],
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // #when
  send(client, {
    type: 'preset-upload',
    data: encodePreset(moved),
    expectedCount: 0,
    expectedSheets: 0,
    expectedDigest: NOTHING_ERASED,
  });
  await rig.waitUntil(
    () =>
      shown(client, block.k)?.d === null && shown(client, 'blk:hero:qty:sword')?.d !== undefined,
  );
  send(client, {
    type: 'preset-upload',
    data: encodePreset(preset),
    expectedCount: 0,
    expectedSheets: 0,
    expectedDigest: NOTHING_ERASED,
  });
  await rig.waitUntil(() => shown(client, 'blk:hero:qty:sword')?.d === null);
  // #then
  expect({
    values: values(shown(client, block.k)),
    stored: values(storedRecord(client, block.k)),
    root: shown(client, root.k)?.l,
    identity: shown(client, block.k)?.k,
  }).toEqual({
    values: { item: 'Sword' },
    stored: { item: 'Sword' },
    root: [1, 'seed'],
    identity: 'blk:hero:item:sword',
  });
});

test('a player patch preserves an unrelated GM cell and clears its pending ACK state', async () => {
  // #given
  const room = rig.openRoom();

  const writable: VersionedRecord[] = [
    { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' },
    root,
    { k: 'acl:hero:player', d: { name: 'Player' }, c: 1, a: 'seed' },
  ];

  const gm = await rig.startClient(room, 'gm-a', { seeded: writable });

  const player = await rig.startClient(room, 'player-connection', {
    role: 'PLAYER',
    playerId: 'player',
    seeded: [],
  });

  // #when
  send(gm, {
    type: 'field-patch',
    sheetId: 'hero',
    target: { kind: 'row', rowId: 'name' },
    fieldId: 'name',
    value: 'Brok',
  });
  send(player, {
    type: 'field-patch',
    sheetId: 'hero',
    target: { kind: 'row', rowId: 'str' },
    fieldId: 'str',
    value: 14,
  });
  await rig.waitUntil(
    () =>
      player.store.$pending.get().size === 0 &&
      values(shown(gm, root.k)).str === 14 &&
      values(shown(player, root.k)).name === 'Brok',
  );
  // #then
  expect([
    values(shown(gm, root.k)),
    values(shown(player, root.k)),
    player.store.$pending.get().size,
  ]).toEqual([{ name: 'Brok', str: 14 }, { name: 'Brok', str: 14 }, 0]);
});

test('catch-up replays queued field intents over incoming cells without losing either value', async () => {
  // #given
  const room = rig.openRoom();
  room.join('remote-gm', 'GM');
  const client = await rig.startClient(room, 'gm-a', { until: 'loaded' });
  // #when
  send(client, {
    type: 'field-patch',
    sheetId: 'hero',
    target: { kind: 'row', rowId: 'str' },
    fieldId: 'str',
    value: 14,
  });
  room.post('remote-gm', {
    v: 4,
    g: { n: 0, a: '' },
    t: 'commit',
    records: [
      fixturePatch(
        root,
        { order: 0, set: 'pc', cells: { name: ['Incoming', 8, 'remote-gm'] } },
        8,
        'remote-gm',
      ),
    ],
  });
  await rig.waitUntil(
    () => client.store.$sync.get().state === 'live' && values(shown(client, root.k)).str === 14,
  );
  // #then
  expect(values(storedRecord(client, root.k))).toEqual({ name: 'Incoming', str: 14 });
});
