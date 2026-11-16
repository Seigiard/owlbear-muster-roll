import { describe, expect, spyOn, test } from 'bun:test';

import { deflateToBase64 } from '@/core/deflate';
import type { JsonValue } from '@/core/json';
import { err } from '@/core/result';
import {
  encodePreset,
  type Preset,
  type PresetCell,
  type PresetSection,
  type Template,
} from '@/core/preset';
import { NOTHING_ERASED, presetDiff } from '@/core/preset-migrate';
import { recordSchema, type VersionedRecord } from '@/core/records';
import type { Command } from '@/core/ui-messages';
import type { Timing } from '@/core/timing';
import type { PlayerRole } from '@/platform/ports';
import {
  createRoomRig,
  refusal,
  heardOf,
  outcome,
  pause,
  rejection,
  requestPresetDiff,
  roomCopyOf,
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
const PLAYER_ID = 'player-a';

const NAME_ROW: PresetCell[] = [{ kind: 'field', type: 'text', id: 'name' }];

const ITEMS: PresetSection = {
  repeat: true,
  rows: [
    [
      { kind: 'field', type: 'text', id: 'item' },
      { kind: 'field', type: 'number', id: 'qty' },
    ],
  ],
};

// A GM-only single sheet whose repeat blocks a token can link to.
const NPC: Template = {
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
};

function pcTemplate(sections: PresetSection[]): Template {
  return { id: 'pc', kind: 'set', title: 'Персонажи', nameField: 'name', tabs: [{ sections }] };
}

const PRESET: Preset = {
  v: 3,
  templates: [
    pcTemplate([
      {
        rows: [
          NAME_ROW,
          [
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'field', type: 'text', id: 'note' },
          ],
        ],
      },
      ITEMS,
    ]),
    NPC,
  ],
};

// The row of `str` is named by `note` now, and the repeat section by `label`, which replaces
// `item`.
const MOVED: Preset = {
  v: 3,
  templates: [
    pcTemplate([
      {
        rows: [
          NAME_ROW,
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
            { kind: 'field', type: 'text', id: 'label' },
            { kind: 'field', type: 'number', id: 'qty' },
          ],
        ],
      },
    ]),
    NPC,
  ],
};

// Only a label is new, so nothing moves or goes.
const RELABELLED: Preset = {
  v: 3,
  templates: [
    pcTemplate([
      {
        title: 'Сила',
        rows: [
          NAME_ROW,
          [
            { kind: 'field', type: 'number', id: 'str' },
            { kind: 'field', type: 'text', id: 'note' },
          ],
        ],
      },
      ITEMS,
    ]),
    NPC,
  ],
};

// `note` goes from the row of `str`.
const NO_NOTE: Preset = {
  v: 3,
  templates: [
    pcTemplate([{ rows: [NAME_ROW, [{ kind: 'field', type: 'number', id: 'str' }]] }, ITEMS]),
    NPC,
  ],
};

// The sheet set goes, with every sheet of it.
const NO_PC: Preset = { v: 3, templates: [NPC] };

// The NPC repeat section is no longer linkable.
const NO_TOKENS: Preset = {
  v: 3,
  templates: [
    PRESET.templates[0] ?? NPC,
    {
      ...NPC,
      tabs: NPC.tabs.map((tab) => ({
        ...tab,
        sections: tab.sections.map(({ tokens: _tokens, ...section }) => section),
      })),
    },
  ],
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
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: `acl:brok:${PLAYER_ID}`, d: { name: 'Оля' }, c: 1, a: 'seed' },
  STR_ROW,
  SWORD,
];

type Client = RigClient;

type Room = RigRoom;

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
  until?: 'loaded' | 'live';
};

const roomRig = createRoomRig({
  seeded: BASE,
  timing: { proposeResendStartMs: 60000, proposeResendMaxMs: 60000 },
  until: 'live',
});

describe('a preset diff', () => {
  test('answers with the count of stored values the preset erases, and writes nothing', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const writesBefore = gm.writes.length;

    // #when
    const id = requestDiff(gm, MOVED);
    await waitUntil(() => result(gm, id) !== undefined);

    // #then
    expect({ result: result(gm, id), writes: gm.writes.length - writesBefore }).toEqual({
      result: { count: 1, sheets: 0, digest: Object(uploadOf(MOVED, 1)).expectedDigest },
      writes: 0,
    });
  });

  test('is refused while the GM client is catching up', async () => {
    // #given: another GM tab that never answers keeps the catch-up open.
    const room = roomRig.openRoom();

    room.join('gm-x', 'GM', 'X');

    const gm = await startClient(room, 'gm-a', { until: 'loaded' });

    // #when
    const diff = requestDiff(gm, MOVED);
    const upload = send(gm, uploadOf(MOVED, 1));

    await waitUntil(() => rejection(gm, diff) !== undefined && rejection(gm, upload) !== undefined);

    // #then
    expect({
      diff: rejection(gm, diff),
      upload: rejection(gm, upload),
      stored: storedRecord(gm, 'preset'),
    }).toEqual({ diff: 'catching-up', upload: 'catching-up', stored: PRESET_RECORD });
  });

  test("is refused to a player's window", async () => {
    // #given
    const room = roomRig.openRoom();

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
      d: deflateToBase64(JSON.stringify({ ...PRESET, v: 4 })),
      c: 1,
      a: 'seed',
    };

    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [...BASE.slice(1), newer] });

    // #when
    const diff = requestDiff(gm, MOVED);
    const upload = send(gm, uploadOf(MOVED, 0));

    await waitUntil(() => rejection(gm, diff) !== undefined && rejection(gm, upload) !== undefined);

    // #then
    expect({
      diff: rejection(gm, diff),
      upload: rejection(gm, upload),
      stored: storedRecord(gm, 'preset'),
    }).toEqual({ diff: 'preset-unreadable', upload: 'preset-unreadable', stored: newer });
  });
});

describe('a preset upload', () => {
  test('puts the applied preset in the next room copy', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { timing: { snapshotPauseMs: 10 } });

    // #when
    send(gm, uploadOf(MOVED, 1));
    await pause(50);

    // #then
    const records = recordSchema.array().parse(roomCopyOf(room)?.records);

    expect(records.find((record) => record.k === 'preset')?.d).toBe(encodePreset(MOVED));
  });

  test('writes and sends new-key rows, then the preset, then tombstones, in that order', async () => {
    // #given
    const room = roomRig.openRoom();
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
      note: storedRecord(gm, 'row:brok:note')?.d,
      label: storedRecord(gm, 'rep:brok:label:r1')?.d,
      gone: [storedRecord(gm, STR_ROW.k)?.d, storedRecord(gm, SWORD.k)?.d],
    }).toEqual({
      result: { count: 1, sheets: 0 },
      commits: [
        ['row:brok:note', 'rep:brok:label:r1'],
        ['preset'],
        ['row:brok:str', 'rep:brok:item:r1'],
      ],
      // AD-14: the generation does not change, so the storage keys keep theirs too.
      generations: [GENERATION, GENERATION, GENERATION],
      writes: [
        storageKey('row:brok:note'),
        storageKey('rep:brok:label:r1'),
        storageKey('preset'),
        storageKey('row:brok:str'),
        storageKey('rep:brok:item:r1'),
      ],
      note: { str: 10 },
      label: { order: 0, cells: {} },
      gone: [null, null],
    });
  });

  test('sends the commits it held before the batch first', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    send(gm, strEdit('str', 11));
    send(gm, uploadOf(RELABELLED, 0));
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 2);

    // #then
    expect(heardOf(room, 'gm-a', 'commit').map(keysOf)).toEqual([[STR_ROW.k], ['preset']]);
  });

  test('refuses a count that changed, with the new count, and writes nothing', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const writesBefore = gm.writes.length;

    // #when
    const id = send(gm, uploadOf(MOVED, 0));
    await waitUntil(() => rejection(gm, id) !== undefined);

    // #then
    expect({
      rejection: refusal(gm, id),
      writes: gm.writes.length - writesBefore,
      commits: heardOf(room, 'gm-a', 'commit'),
    }).toEqual({
      rejection: {
        t: 'command-rejected',
        id,
        reason: 'count-changed',
        count: 1,
        sheets: 0,
        digest: digestOf(MOVED),
      },
      writes: 0,
      commits: [],
    });
  });

  test('refuses an upload that erases other values than the diff, though the count is the same', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    const id = send(gm, uploadOf(MOVED, 1, '00000000'));
    await waitUntil(() => rejection(gm, id) !== undefined);

    // #then
    expect({
      rejection: refusal(gm, id),
      stored: storedRecord(gm, 'preset'),
    }).toEqual({
      rejection: {
        t: 'command-rejected',
        id,
        reason: 'count-changed',
        count: 1,
        sheets: 0,
        digest: digestOf(MOVED),
      },
      stored: PRESET_RECORD,
    });
  });

  test('stops at a failed write and leaves the old preset and keys in place', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const setItem = gm.platform.storage.setItem;

    spyOn(gm.platform.storage, 'setItem').mockImplementation((key, value) =>
      key === storageKey('row:brok:note')
        ? err({ operation: 'write', reason: 'quota' })
        : setItem(key, value),
    );

    // #when
    const id = send(gm, uploadOf(MOVED, 1));
    await waitUntil(() => rejection(gm, id) !== undefined);
    await pause(20);

    // #then
    expect({
      rejection: rejection(gm, id),
      stored: storedRecord(gm, 'preset'),
      old: [storedRecord(gm, STR_ROW.k), storedRecord(gm, SWORD.k)],
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
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');

    // #when
    const id = send(gm, uploadOf(RELABELLED, 3));
    await waitUntil(() => result(gm, id) !== undefined);

    // #then
    expect({ result: result(gm, id), stored: storedRecord(gm, 'preset')?.d }).toEqual({
      result: { count: 0, sheets: 0 },
      stored: encodePreset(RELABELLED),
    });
  });
});

describe('a preset upload that removes a template', () => {
  test('reports the sheets of the sheet set it deletes and, confirmed, tombstones each with its dependents', async () => {
    // #given: three sheets of the set, with str 10, "Меч" and str 12 shown on them.
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: [
        ...BASE,
        { k: 'sheet:anya', d: { set: 'pc', order: 1 }, c: 1, a: 'seed' },
        { k: 'row:anya:str', d: { str: 12 }, c: 1, a: 'seed' },
        { k: 'sheet:mira', d: { set: 'pc', order: 2 }, c: 1, a: 'seed' },
      ],
    });

    const diff = requestDiff(gm, NO_PC);

    await waitUntil(() => result(gm, diff) !== undefined);

    const found = Object(result(gm, diff));

    // #when
    const id = send(gm, {
      type: 'preset-upload',
      data: encodePreset(NO_PC),
      expectedCount: found.count,
      expectedSheets: found.sheets,
      expectedDigest: found.digest,
    });

    await waitUntil(() => result(gm, id) !== undefined);

    // #then
    const gone = [
      'sheet:brok',
      'sheet:anya',
      'sheet:mira',
      STR_ROW.k,
      SWORD.k,
      'row:anya:str',
      `acl:brok:${PLAYER_ID}`,
    ];

    expect({
      diff: [found.count, found.sheets],
      result: result(gm, id),
      gone: gone.map((key) => storedRecord(gm, key)?.d),
    }).toEqual({
      diff: [3, 3],
      result: { count: 3, sheets: 3 },
      gone: gone.map(() => null),
    });
  });

  test('refuses with count-changed when a sheet was added since the diff', async () => {
    // #given: the diff saw one sheet of the set to delete.
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    const diff = requestDiff(gm, NO_PC);

    await waitUntil(() => result(gm, diff) !== undefined);

    const found = Object(result(gm, diff));

    send(gm, { type: 'sheet-create', sheetId: 'anya', set: 'pc' });
    await waitUntil(() => shown(gm, 'sheet:anya') !== undefined);

    // #when
    const id = send(gm, {
      type: 'preset-upload',
      data: encodePreset(NO_PC),
      expectedCount: found.count,
      expectedSheets: found.sheets,
      expectedDigest: found.digest,
    });

    await waitUntil(() => rejection(gm, id) !== undefined);

    // #then: the new digest goes with the new counts, for the next confirmation.
    expect({
      diff: [found.count, found.sheets],
      rejection: refusal(gm, id),
      stored: storedRecord(gm, 'preset'),
    }).toEqual({
      diff: [2, 1],
      rejection: {
        t: 'command-rejected',
        id,
        reason: 'count-changed',
        count: 2,
        sheets: 2,
        digest: expect.not.stringMatching(`^${found.digest}$`),
      },
      stored: PRESET_RECORD,
    });
  });

  test('that deletes only an empty sheet refuses an upload sent as 0 and 0, and deletes nothing', async () => {
    // #given: one sheet of the set, with no values.
    const room = roomRig.openRoom();
    const empty: VersionedRecord = { k: 'sheet:anya', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' };
    const gm = await startClient(room, 'gm-a', { seeded: [PRESET_RECORD, empty] });

    // #when
    const id = send(gm, {
      type: 'preset-upload',
      data: encodePreset(NO_PC),
      expectedCount: 0,
      expectedSheets: 0,
      expectedDigest: NOTHING_ERASED,
    });

    await waitUntil(() => rejection(gm, id) !== undefined);

    // #then
    expect({
      rejection: refusal(gm, id),
      sheet: storedRecord(gm, 'sheet:anya'),
    }).toEqual({
      rejection: {
        t: 'command-rejected',
        id,
        reason: 'count-changed',
        count: 0,
        sheets: 1,
        digest: expect.any(String),
      },
      sheet: empty,
    });
  });

  test('that makes a repeat section unlinkable tombstones its links with no count', async () => {
    // #given: a token linked to a repeat block of the NPC single sheet.
    const room = roomRig.openRoom();

    const block: VersionedRecord = {
      k: 'rep:npc:mob:m1',
      d: { order: 0, cells: { mob: 'Скелет', hp: 7 } },
      c: 1,
      a: 'seed',
    };

    const gm = await startClient(room, 'gm-a', {
      seeded: [...BASE, block, { k: 'link:t1', d: { s: 'npc', i: 'm1' }, c: 1, a: 'seed' }],
    });

    // #when
    const id = send(gm, uploadOf(NO_TOKENS, 0));

    await waitUntil(() => result(gm, id) !== undefined);

    // #then
    expect({
      result: result(gm, id),
      link: storedRecord(gm, 'link:t1')?.d,
      block: storedRecord(gm, block.k),
    }).toEqual({
      result: { count: 0, sheets: 0 },
      link: null,
      block,
    });
  });
});

describe('a write after an upload', () => {
  test('of a GM field strips the values its row no longer has', async () => {
    // #given
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: withRecord({ ...STR_ROW, d: { str: 10, gone: 1, note: 5 } }),
    });

    // #when
    send(gm, strEdit('str', 11));
    await waitUntil(() => storedRecord(gm, STR_ROW.k)?.c === 3);

    // #then
    expect(storedRecord(gm, STR_ROW.k)?.d).toEqual({ str: 11 });
  });

  test('of a repeat block duplicate holds only the cells its repeat section has', async () => {
    // #given
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: withRecord({ ...SWORD, d: { order: 0, cells: { item: 'Меч 1', qty: 2, gone: 3 } } }),
    });

    // #when
    send(gm, {
      type: 'repeat-block-duplicate',
      sheetId: 'brok',
      sectionId: 'item',
      instanceId: 'r1',
      count: 1,
    });
    await waitUntil(() => copiedBlocks(gm).length === 1);

    // #then
    expect(copiedBlocks(gm)).toEqual([{ item: 'Меч 2', qty: 2 }]);
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

  test('of a repeat block removal: follows the block to its new section', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();

    send(player, {
      type: 'repeat-block-delete',
      sheetId: 'brok',
      sectionId: 'item',
      instanceId: 'r1',
    });
    await waitUntil(() => proposals(room).length === 1);

    // #when
    answer(room, commit([{ k: 'rep:brok:label:r1', d: { order: 0, cells: {} }, c: 1, a: 'gm-a' }]));

    answer(room, commit([{ k: 'preset', d: encodePreset(MOVED), c: 2, a: 'gm-a' }]));
    answer(room, commit([{ ...SWORD, d: null, c: 2, a: 'gm-a' }]));
    await waitUntil(() => proposals(room).length === 2);

    // #then
    expect({
      newest: proposals(room)[1]?.k,
      data: proposals(room)[1]?.d,
      notifications: player.platform.shownNotifications(),
    }).toEqual({ newest: 'rep:brok:label:r1', data: null, notifications: [] });
  });

  test('does not show the denied notification from a GM it reached', async () => {
    // #given: a live GM that commits the upload.
    const room = roomRig.openRoom();
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
  const room = roomRig.openRoom();
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
  return roomRig.startClient(room, connectionId, {
    ...options,
    until: options.until ?? 'live',
    engine: { editDenied: DENIED },
  });
}

function withRecord(record: VersionedRecord): VersionedRecord[] {
  return BASE.map((seeded) => (seeded.k === record.k ? record : seeded));
}

// The digest of the values `preset` erases from BASE.
function digestOf(preset: Preset): string {
  return presetDiff(new Map(BASE.map((record) => [record.k, record])), PRESET, preset).digest;
}

// An upload confirmed for `expectedCount` values and `expectedSheets` sheets, with the digest of
// what it erases from BASE.
function uploadOf(
  preset: Preset,
  expectedCount: number,
  expectedDigest = digestOf(preset),
  expectedSheets = 0,
): Command {
  return {
    type: 'preset-upload',
    data: encodePreset(preset),
    expectedCount,
    expectedSheets,
    expectedDigest,
  };
}

function requestDiff(client: Client, preset: Preset): string {
  return requestPresetDiff(client, encodePreset(preset));
}

// A message from the GM client the test speaks for.
function answer(room: Room, data: JsonValue): void {
  room.post('gm-a', data);
}

function commit(records: VersionedRecord[]): JsonValue {
  return { v: 3, g: GENERATION, t: 'commit', records };
}

function reject(edit: { k: string; c: number; a: string }, reason: 'denied' | 'stale'): JsonValue {
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

// The cells of every repeat block of Брок's `item` section the GM stored but SWORD.
function copiedBlocks(client: Client): JsonValue[] {
  return client.backing
    .keys()
    .filter((key) => key.startsWith(storageKey('rep:brok:item:')) && key !== storageKey(SWORD.k))
    .map(
      (key) => Object(recordSchema.parse(JSON.parse(client.backing.get(key) ?? 'null')).d).cells,
    );
}

function result(client: Client, id: string): JsonValue | undefined {
  const settled = outcome(client, id);

  return settled?.kind === 'answered' ? settled.answer : undefined;
}
