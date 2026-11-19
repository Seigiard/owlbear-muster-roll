import { assembleRecords } from '@/core/merge';
import { fixturePatch } from '../../tests/support/block-fixtures';
import { describe, expect, spyOn, test } from 'bun:test';
import { deflateToBase64 } from '@/core/deflate';
import type { JsonValue } from '@/core/json';
import { Result } from 'better-result';
import {
  encodePreset,
  type Preset,
  type PresetRow,
  type PresetSection,
  type Template,
} from '@/core/preset';
import { NOTHING_ERASED, presetDiff } from '@/core/preset-migrate';
import { cellValues, recordSchema, type VersionedRecord } from '@/core/records';
import type { WireCommand } from '@/core/ui-messages';
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

const NAME_ROW: PresetRow = {
  cells: [{ kind: 'field', type: 'text', id: 'name' }],
};

const ITEMS: PresetSection = {
  repeat: { id: 'item', nameField: 'item' },
  rows: [
    {
      cells: [
        { kind: 'field', type: 'text', id: 'item' },
        { kind: 'field', type: 'number', id: 'qty' },
      ],
    },
  ],
};

// A GM-only single sheet whose repeat blocks a token can link to.
const NPC: Template = {
  id: 'npc',
  title: 'NPC',
  visibility: 'gm',
  tabs: [
    {
      sections: [
        {
          repeat: { id: 'mob', nameField: 'mob' },

          rows: [
            {
              cells: [
                { kind: 'field', type: 'text', id: 'mob' },
                { kind: 'field', type: 'number', id: 'hp' },
                { kind: 'token', id: 'token' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function pcTemplate(sections: PresetSection[]): Template {
  return { id: 'pc', title: 'Персонажи', repeat: { nameField: 'name' }, tabs: [{ sections }] };
}

const PRESET: Preset = {
  v: 4,
  templates: [
    pcTemplate([
      {
        rows: [
          NAME_ROW,
          {
            cells: [
              { kind: 'field', type: 'number', id: 'str' },
              { kind: 'field', type: 'text', id: 'note' },
            ],
          },
        ],
      },
      ITEMS,
    ]),
    NPC,
  ],
};

// The row of `str` is named by `note` now. The repeat section id changes from `item` to `label`,
// so its old blocks are removed rather than relocated.
const MOVED: Preset = {
  v: 4,
  templates: [
    pcTemplate([
      {
        rows: [
          NAME_ROW,
          {
            cells: [
              { kind: 'field', type: 'text', id: 'note' },
              { kind: 'field', type: 'number', id: 'str' },
            ],
          },
        ],
      },
      {
        repeat: { id: 'label', nameField: 'label' },
        rows: [
          {
            cells: [
              { kind: 'field', type: 'text', id: 'label' },
              { kind: 'field', type: 'number', id: 'qty' },
            ],
          },
        ],
      },
    ]),
    NPC,
  ],
};

// Only a label is new, so nothing moves or goes.
const RELABELLED: Preset = {
  v: 4,
  templates: [
    pcTemplate([
      {
        title: 'Сила',
        rows: [
          NAME_ROW,
          {
            cells: [
              { kind: 'field', type: 'number', id: 'str' },
              { kind: 'field', type: 'text', id: 'note' },
            ],
          },
        ],
      },
      ITEMS,
    ]),
    NPC,
  ],
};

// `note` goes from the row of `str`.
const NO_NOTE: Preset = {
  v: 4,
  templates: [
    pcTemplate([
      { rows: [NAME_ROW, { cells: [{ kind: 'field', type: 'number', id: 'str' }] }] },
      ITEMS,
    ]),
    NPC,
  ],
};

// The sheet set goes, with every sheet of it.
const NO_PC: Preset = { v: 4, templates: [NPC] };

// The NPC repeat section is no longer linkable.
const NO_TOKENS: Preset = {
  v: 4,
  templates: [
    PRESET.templates[0] ?? NPC,
    {
      ...NPC,
      tabs: NPC.tabs.map((tab) => ({
        ...tab,
        sections: tab.sections.map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({
            ...row,
            cells: row.cells.filter((cell) => cell.kind !== 'token'),
          })),
        })),
      })),
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };

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

const BASE: readonly VersionedRecord[] = [
  PRESET_RECORD,
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
      d: deflateToBase64(JSON.stringify({ ...PRESET, v: 5 })),
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
  test('keeps GM B’s hp tuple when GM A removes armor after confirming the diff', async () => {
    // #given
    const withArmor = pcTemplate([
      {
        rows: [
          NAME_ROW,
          {
            cells: [
              { kind: 'field', type: 'number', id: 'hp' },
              { kind: 'field', type: 'number', id: 'armor' },
            ],
          },
        ],
      },
    ]);

    const withoutArmor = pcTemplate([
      {
        rows: [NAME_ROW, { cells: [{ kind: 'field', type: 'number', id: 'hp' }] }],
      },
    ]);

    const root: VersionedRecord = {
      k: 'blk:brok',
      d: {
        set: 'pc',
        order: 0,
        cells: { hp: [10, 3, 'seed'], armor: [5, 3, 'seed'] },
      },
      c: 3,
      a: 'seed',
      l: [3, 'seed'],
    };

    const room = roomRig.openRoom();

    const gmA = await startClient(room, 'gm-a', {
      seeded: [
        { k: 'preset', d: encodePreset({ v: 4, templates: [withArmor] }), c: 1, a: 'seed' },
        root,
      ],
    });

    const gmB = await startClient(room, 'gm-b', {
      seeded: [
        { k: 'preset', d: encodePreset({ v: 4, templates: [withArmor] }), c: 1, a: 'seed' },
        root,
      ],
    });

    const diff = requestDiff(gmA, { v: 4, templates: [withoutArmor] });
    await waitUntil(() => result(gmA, diff) !== undefined);

    const found = Object(result(gmA, diff));

    send(gmB, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'hp' },
      fieldId: 'hp',
      value: 20,
    });
    await waitUntil(() => Object(storedRecord(gmA, root.k)?.d).cells.hp?.[1] === 4);

    // #when
    const upload = send(gmA, {
      type: 'preset-upload',
      data: encodePreset({ v: 4, templates: [withoutArmor] }),
      expectedCount: found.count,
      expectedSheets: found.sheets,
      expectedDigest: found.digest,
    });

    await waitUntil(() => result(gmA, upload) !== undefined);

    // #then
    expect(Object(storedRecord(gmA, root.k)?.d).cells.hp).toEqual([20, 4, 'gm-b']);
  });
  test('preserves a root number when a later repeat tab has a same-id text field', async () => {
    // #given
    const preset: Preset = {
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
                { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] },
                { rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] },
              ],
            },
            {
              title: 'Состояния',
              repeat: { id: 'condition', nameField: 'condition_name' },
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'condition_name' },
                        { kind: 'field', type: 'text', id: 'hp' },
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

    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: [
        { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' },
        {
          k: 'blk:brok',
          d: { set: 'pc', order: 0, cells: { hp: [7, 1, 'seed'] } },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: 'blk:brok:condition:c1',
          d: {
            order: 0,
            cells: {
              condition_name: ['Ранен', 1, 'seed'],
              hp: ['критично', 1, 'seed'],
            },
          },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
      ],
    });

    // #when
    const id = send(gm, uploadOf(preset, 0));
    await waitUntil(() => result(gm, id) !== undefined || rejection(gm, id) !== undefined);

    // #then
    expect({
      result: result(gm, id),
      rejection: rejection(gm, id),
      cells: cellValues(Object(storedRecord(gm, 'blk:brok')?.d).cells),
      condition: cellValues(Object(storedRecord(gm, 'blk:brok:condition:c1')?.d).cells),
      commits: heardOf(room, 'gm-a', 'commit').map(keysOf),
    }).toEqual({
      result: { count: 0, sheets: 0 },
      rejection: undefined,
      cells: { hp: 7 },
      condition: { condition_name: 'Ранен', hp: 'критично' },
      commits: [['preset']],
    });
  });
  test('removes only one full-path child scope and counts its exact populated values', async () => {
    // #given
    const nestedPreset: Preset = {
      v: 4,
      templates: [
        {
          id: 'encounter',
          title: 'Encounter',
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
            {
              title: 'Boss',
              repeat: { id: 'boss', nameField: 'boss_name' },
              sections: [
                {
                  rows: [
                    {
                      cells: [
                        { kind: 'field', type: 'text', id: 'boss_name' },
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
                        { kind: 'field', type: 'number', id: 'range' },
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

    const withoutAttacks: Preset = {
      ...nestedPreset,
      templates: nestedPreset.templates.map((template) => ({
        ...template,
        tabs: template.tabs.map((tab, index) =>
          index === 0
            ? {
                ...tab,
                sections: tab.sections.slice(0, 1),
              }
            : tab,
        ),
      })),
    };

    const npcParentKey = 'blk:encounter:npc:n1';
    const npcChildKey = `${npcParentKey}:attack:a1`;
    const bossParentKey = 'blk:encounter:boss:b1';
    const bossChildKey = `${bossParentKey}:attack:a1`;

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
        {
          k: npcParentKey,
          d: {
            order: 0,
            cells: { npc_name: ['Goblin', 1, 'seed'], hp: [7, 1, 'seed'] },
          },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: npcChildKey,
          d: {
            order: 0,
            cells: { attack_name: ['Old bite', 1, 'seed'], damage: [3, 1, 'seed'] },
          },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: bossParentKey,
          d: {
            order: 0,
            cells: { boss_name: ['Dragon', 1, 'seed'], hp: [20, 1, 'seed'] },
          },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        {
          k: bossChildKey,
          d: {
            order: 0,
            cells: { attack_name: ['Breath', 1, 'seed'], range: [30, 1, 'seed'] },
          },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
      ],
    });

    const room = nestedRig.openRoom();

    const gm = await nestedRig.startClient(room, 'gm-a', {
      engine: { editDenied: DENIED },
    });

    const diffId = requestPresetDiff(gm, encodePreset(withoutAttacks));

    await waitUntil(() => result(gm, diffId) !== undefined);
    const confirmation = Object(result(gm, diffId));

    // #when
    const uploadId = send(gm, {
      type: 'preset-upload',
      data: encodePreset(withoutAttacks),
      expectedCount: confirmation.count,
      expectedSheets: confirmation.sheets,
      expectedDigest: confirmation.digest,
    });

    await waitUntil(() => result(gm, uploadId) !== undefined);

    // #then
    expect({
      confirmation: { count: confirmation.count, sheets: confirmation.sheets },
      upload: result(gm, uploadId),
      npcParent: cellValues(Object(storedRecord(gm, npcParentKey)?.d).cells),
      npcChild: storedRecord(gm, npcChildKey)?.d,
      bossParent: cellValues(Object(storedRecord(gm, bossParentKey)?.d).cells),
      bossChild: cellValues(Object(storedRecord(gm, bossChildKey)?.d).cells),
    }).toEqual({
      confirmation: { count: 2, sheets: 0 },
      upload: { count: 2, sheets: 0 },
      npcParent: { npc_name: 'Goblin', hp: 7 },
      npcChild: null,
      bossParent: { boss_name: 'Dragon', hp: 20 },
      bossChild: { attack_name: 'Breath', range: 30 },
    });
  });
  test('an unchanged upload preserves same-named child scopes with their exact fields and versions', async () => {
    // #given
    const fixture = nestedScopesFixture();
    const nestedRig = createRoomRig({ seeded: fixture.records });
    const room = nestedRig.openRoom();

    const gm = await nestedRig.startClient(room, 'gm-a', {
      engine: { editDenied: DENIED },
    });

    const diffId = requestPresetDiff(gm, encodePreset(fixture.preset));
    await waitUntil(() => result(gm, diffId) !== undefined);
    const confirmation = Object(result(gm, diffId));

    // #when
    const uploadId = send(gm, {
      type: 'preset-upload',
      data: encodePreset(fixture.preset),
      expectedCount: confirmation.count,
      expectedSheets: confirmation.sheets,
      expectedDigest: confirmation.digest,
    });

    await waitUntil(() => result(gm, uploadId) !== undefined);

    // #then
    expect({
      confirmation: { count: confirmation.count, sheets: confirmation.sheets },
      upload: result(gm, uploadId),
      npc: storedRecord(gm, fixture.npcChild.k),
      boss: storedRecord(gm, fixture.bossChild.k),
    }).toEqual({
      confirmation: { count: 0, sheets: 0 },
      upload: { count: 0, sheets: 0 },
      npc: fixture.npcChild,
      boss: fixture.bossChild,
    });
  });
  test.each(['removed', 'renamed'] as const)(
    'when an NPC parent scope is %s, removes that parent and its child but keeps the boss path',
    async (change) => {
      // #given
      const fixture = nestedScopesFixture();
      const template = fixture.preset.templates[0];

      if (template === undefined) {
        throw new Error('the nested scope fixture needs an Encounter template');
      }

      const [npcTab, bossTab] = template.tabs;

      if (npcTab === undefined || bossTab === undefined) {
        throw new Error('the nested scope fixture needs NPC and Boss tabs');
      }

      const changedPreset: Preset = {
        ...fixture.preset,
        templates: [
          {
            ...template,
            tabs:
              change === 'removed'
                ? [bossTab]
                : [
                    {
                      ...npcTab,
                      repeat: { id: 'creature', nameField: 'npc_name' },
                    },
                    bossTab,
                  ],
          },
        ],
      };

      const nestedRig = createRoomRig({ seeded: fixture.records });
      const room = nestedRig.openRoom();

      const gm = await nestedRig.startClient(room, 'gm-a', {
        engine: { editDenied: DENIED },
      });

      const diffId = requestPresetDiff(gm, encodePreset(changedPreset));
      await waitUntil(() => result(gm, diffId) !== undefined);
      const confirmation = Object(result(gm, diffId));

      // #when
      const uploadId = send(gm, {
        type: 'preset-upload',
        data: encodePreset(changedPreset),
        expectedCount: confirmation.count,
        expectedSheets: confirmation.sheets,
        expectedDigest: confirmation.digest,
      });

      await waitUntil(() => result(gm, uploadId) !== undefined);

      // #then
      expect({
        confirmation: { count: confirmation.count, sheets: confirmation.sheets },
        upload: result(gm, uploadId),
        root: storedRecord(gm, fixture.root.k),
        npcParent: storedRecord(gm, fixture.npcParent.k)?.d,
        npcChild: storedRecord(gm, fixture.npcChild.k)?.d,
        bossParent: storedRecord(gm, fixture.bossParent.k),
        bossChild: storedRecord(gm, fixture.bossChild.k),
      }).toEqual({
        confirmation: { count: 4, sheets: 0 },
        upload: { count: 4, sheets: 0 },
        root: fixture.root,
        npcParent: null,
        npcChild: null,
        bossParent: fixture.bossParent,
        bossChild: fixture.bossChild,
      });
    },
  );
  test.each([
    {
      scope: 'npc',
      sourceId: 'n1',
    },
    {
      scope: 'boss',
      sourceId: 'b1',
    },
  ] as const)(
    'duplicates the $scope parent with only that path’s same-named child fields',
    async ({ scope, sourceId }) => {
      // #given
      const fixture = nestedScopesFixture();
      const nestedRig = createRoomRig({ seeded: fixture.records });
      const room = nestedRig.openRoom();

      const gm = await nestedRig.startClient(room, 'gm-a', {
        engine: { editDenied: DENIED },
      });

      // #when
      send(gm, {
        type: 'repeat-block-duplicate',
        sheetId: 'encounter',
        sectionId: scope,
        instanceId: sourceId,
        count: 1,
      });
      await waitUntil(() => nestedDuplicate(gm, scope, sourceId) !== null);

      // #then
      const expected: JsonValue =
        scope === 'npc'
          ? {
              parent: { npc_name: 'Goblin 1', hp: 7 },
              child: { attack_name: 'Old bite', damage: 3 },
            }
          : {
              parent: { boss_name: 'Dragon 1', hp: 20 },
              child: { attack_name: 'Breath', range: 30 },
            };

      expect(nestedDuplicate(gm, scope, sourceId)).toEqual(expected);
    },
  );

  test('puts the applied preset in the next room copy', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { timing: { snapshotPauseMs: 10 } });
    // #when
    send(gm, uploadOf(MOVED, 1));
    await pause(50);
    // #then
    const parsed = recordSchema.array().safeParse(roomCopyOf(room)?.records);
    const records = parsed.success ? parsed.data : [];
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
      note: storedRecord(gm, 'blk:brok')?.d,
      gone: [storedRecord(gm, STR_ROW.k)?.d, storedRecord(gm, SWORD.k)?.d],
    }).toEqual({
      result: { count: 1, sheets: 0 },
      commits: [['blk:npc'], ['preset'], ['blk:brok:item:r1']],
      // AD-14: the generation does not change, so the storage keys keep theirs too.
      generations: [GENERATION, GENERATION, GENERATION],
      writes: [storageKey('blk:npc'), storageKey('preset'), storageKey('blk:brok:item:r1')],
      note: { set: 'pc', order: 0, cells: { str: [10, 2, 'seed'] } },
      gone: [{ set: 'pc', order: 0, cells: { str: [10, 2, 'seed'] } }, null],
    });
  });
  test('sends the commits it held before the batch first', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a');
    // #when
    send(gm, strEdit('str', 11));
    const upload = send(gm, uploadOf(RELABELLED, 0));
    await waitUntil(() => result(gm, upload) !== undefined);
    // #then
    expect(heardOf(room, 'gm-a', 'commit').map(keysOf)).toEqual([
      [STR_ROW.k],
      ['blk:npc'],
      ['preset'],
    ]);
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
      key === storageKey('blk:npc')
        ? Result.err({ operation: 'write', reason: 'quota' })
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
        { k: 'blk:anya', d: { set: 'pc', order: 1, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
        {
          k: 'blk:anya',
          d: { order: 0, cells: { str: [12, 1, 'seed'] } },
          c: 1,
          a: 'seed',
          l: [1, 'seed'],
        },
        { k: 'blk:mira', d: { set: 'pc', order: 2, cells: {} }, c: 1, a: 'seed', l: [1, 'seed'] },
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
      'blk:brok',
      'blk:anya',
      'blk:mira',
      STR_ROW.k,
      SWORD.k,
      'blk:anya',
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
    await waitUntil(() => shown(gm, 'blk:anya') !== undefined);

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

    const empty: VersionedRecord = {
      k: 'blk:anya',
      d: { set: 'pc', order: 0, cells: {} },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

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
      sheet: storedRecord(gm, 'blk:anya'),
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
      k: 'blk:npc:mob:m1',
      d: { order: 0, cells: { mob: ['Скелет', 1, 'seed'], hp: [7, 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const gm = await startClient(room, 'gm-a', {
      seeded: [
        ...BASE,
        block,
        {
          k: 'link:t1',
          d: { s: 'npc', path: ['mob', 'm1'], c: 'token' },
          c: 1,
          a: 'seed',
        },
      ],
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
  test('of a GM field writes a versioned armor clear after an interrupted upload', async () => {
    // #given: the preset committed before its migration could clear this old root.
    const withoutArmor = pcTemplate([
      {
        rows: [NAME_ROW, { cells: [{ kind: 'field', type: 'number', id: 'hp' }] }],
      },
    ]);

    const root: VersionedRecord = {
      k: 'blk:brok',
      d: {
        set: 'pc',
        order: 0,
        cells: { hp: [10, 2, 'seed'], armor: [5, 3, 'seed'] },
      },
      c: 3,
      a: 'seed',
      l: [3, 'seed'],
    };

    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: [
        { k: 'preset', d: encodePreset({ v: 4, templates: [withoutArmor] }), c: 2, a: 'gm-a' },
        root,
      ],
    });

    // #when
    send(gm, {
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'hp' },
      fieldId: 'hp',
      value: 20,
    });
    await waitUntil(() => storedRecord(gm, root.k)?.c === 4);
    // #then
    expect(Object(storedRecord(gm, root.k)?.d).cells.armor).toEqual([null, 4, 'gm-a']);
  });
  test('of a GM field strips the values its row no longer has', async () => {
    // #given
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: withRecord(
        fixturePatch(STR_ROW, { str: 10, gone: null, note: null }, STR_ROW.c, STR_ROW.a),
      ),
    });

    // #when
    send(gm, strEdit('str', 11));
    await waitUntil(() => storedRecord(gm, STR_ROW.k)?.c === 3);
    // #then
    expect(storedRecord(gm, STR_ROW.k)?.d).toEqual({
      set: 'pc',
      order: 0,
      cells: {
        str: [11, 3, 'gm-a'],
        gone: [null, 2, 'seed'],
        note: [null, 2, 'seed'],
      },
    });
  });
  test('of a repeat block duplicate holds only the cells its repeat section has', async () => {
    // #given
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', {
      seeded: withRecord(
        fixturePatch(
          SWORD,
          { order: 0, cells: { item: 'Меч 1', qty: 2, gone: 3 } },
          SWORD.c,
          SWORD.a,
        ),
      ),
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
      withRecord(fixturePatch(STR_ROW, { str: 10, gone: 1 }, STR_ROW.c, STR_ROW.a)),
    );

    // #when
    send(player, strEdit('str', 11));
    await waitUntil(() => proposals(room).length === 1);
    // #then
    expect(proposals(room)[0]?.d).toEqual({
      set: 'pc',
      order: 0,
      cells: { str: [11, 3, PLAYER_ID] },
    });
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
      newest: fixturePatch(STR_ROW, { str: 11 }, 5, PLAYER_ID),
      shown: { set: 'pc', order: 0, cells: { str: [11, 5, PLAYER_ID] } },
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
  test('of a field whose row is named anew: stays on the stable root without another proposal', async () => {
    // #given
    const { room, player } = await playerWithSilentGm();
    send(player, strEdit('note', 'устал'));
    await waitUntil(() => proposals(room).length === 1);
    // #when
    answer(room, commit([{ k: 'preset', d: encodePreset(MOVED), c: 2, a: 'gm-a' }]));
    await waitUntil(() => player.store.$replica.get().get('preset')?.c === 2);
    await pause(20);
    // #then
    expect({
      proposals: proposals(room).length,
      newest: proposals(room)[0]?.k,
      data: shown(player, STR_ROW.k)?.d,
      pending: pendingKeys(player),
      notifications: player.platform.shownNotifications(),
    }).toEqual({
      proposals: 1,
      newest: 'blk:brok',
      data: {
        set: 'pc',
        order: 0,
        cells: { str: [10, 2, 'seed'], note: ['устал', 3, PLAYER_ID] },
      },
      pending: ['blk:brok'],
      notifications: [],
    });
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

function nestedScopesFixture() {
  const preset: Preset = {
    v: 4,
    templates: [
      {
        id: 'encounter',
        title: 'Encounter',
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
          {
            title: 'Boss',
            repeat: { id: 'boss', nameField: 'boss_name' },
            sections: [
              {
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'boss_name' },
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
                      { kind: 'field', type: 'number', id: 'range' },
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

  const root: VersionedRecord = {
    k: 'blk:encounter',
    d: { order: 0, cells: {} },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const npcParent: VersionedRecord = {
    k: 'blk:encounter:npc:n1',
    d: {
      order: 0,
      cells: { npc_name: ['Goblin', 1, 'seed'], hp: [7, 1, 'seed'] },
    },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const npcChild: VersionedRecord = {
    k: `${npcParent.k}:attack:a1`,
    d: {
      order: 0,
      cells: { attack_name: ['Old bite', 1, 'seed'], damage: [3, 1, 'seed'] },
    },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const bossParent: VersionedRecord = {
    k: 'blk:encounter:boss:b1',
    d: {
      order: 0,
      cells: { boss_name: ['Dragon', 1, 'seed'], hp: [20, 1, 'seed'] },
    },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const bossChild: VersionedRecord = {
    k: `${bossParent.k}:attack:a1`,
    d: {
      order: 0,
      cells: { attack_name: ['Breath', 1, 'seed'], range: [30, 1, 'seed'] },
    },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const records = [
    { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' },
    root,
    npcParent,
    npcChild,
    bossParent,
    bossChild,
  ] satisfies VersionedRecord[];

  return { preset, records, root, npcParent, npcChild, bossParent, bossChild };
}

function nestedDuplicate(
  client: Client,
  scope: 'npc' | 'boss',
  sourceId: string,
): JsonValue | null {
  const parentPrefix = `blk:encounter:${scope}:`;

  const parent = [...client.store.$records.get().values()].find(
    (record) =>
      record.d !== null &&
      record.k.startsWith(parentPrefix) &&
      record.k.split(':').length === 4 &&
      record.k !== `${parentPrefix}${sourceId}`,
  );

  if (parent === undefined) return null;

  const child = [...client.store.$records.get().values()].find(
    (record) =>
      record.d !== null &&
      record.k.startsWith(`${parent.k}:attack:`) &&
      record.k.split(':').length === 6,
  );

  if (child === undefined) return null;

  return {
    parent: cellValues(Object(parent.d).cells),
    child: cellValues(Object(child.d).cells),
  };
}

async function playerWithSilentGm(seeded: readonly VersionedRecord[] = BASE): Promise<{
  room: Room;
  player: Client;
}> {
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
  return presetDiff(assembleRecords(BASE), PRESET, preset).digest;
}

// An upload confirmed for `expectedCount` values and `expectedSheets` sheets, with the digest of
// what it erases from BASE.
function uploadOf(
  preset: Preset,
  expectedCount: number,
  expectedDigest = digestOf(preset),
  expectedSheets = 0,
): WireCommand {
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
  return { v: 4, g: GENERATION, t: 'commit', records };
}

function reject(
  edit: {
    k: string;
    c: number;
    a: string;
  },
  reason: 'denied' | 'stale',
): JsonValue {
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
    .filter((key) => key.startsWith(storageKey('blk:brok:item:')) && key !== storageKey(SWORD.k))
    .map((key) =>
      cellValues(Object(recordSchema.parse(JSON.parse(client.backing.get(key) ?? 'null')).d).cells),
    );
}

function result(client: Client, id: string): JsonValue | undefined {
  const settled = outcome(client, id);

  return settled?.kind === 'answered' ? settled.answer : undefined;
}
