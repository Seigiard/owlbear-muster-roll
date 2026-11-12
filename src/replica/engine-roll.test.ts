import { describe, expect, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { Timing } from '@/core/timing';
import type { RollOutcome } from '@/core/ui-messages';
import type { MockRoom } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import { createRoomRig, type RigClient, waitUntil } from '@/replica/room-rig';
import { copy } from '@/ui/copy';
import type { RollRequest } from '@/ui/replica-client';

const GHOST = 'ghost-gm';

// The name the party lists for the ghost connection.
const GHOST_NAME = 'Призрак';

// Every 1d20 shows 7: floor(0.3 * 20) + 1.
const SEVEN = (): number => 0.3;

const PRESET: Preset = {
  v: 2,
  templates: [
    {
      id: 'pc',
      kind: 'set',
      title: 'Персонажи',
      nameField: 'name',
      sections: [
        {
          rows: [
            [
              { kind: 'text', text: 'Сила' },
              { kind: 'field', type: 'number', id: 'str' },
              { kind: 'field', type: 'check', id: 'str_tired' },
              { kind: 'dice', formula: '1d20 <= str - 2*str_tired' },
            ],
            [
              { kind: 'text', text: 'Ловкость' },
              { kind: 'field', type: 'number', id: 'dex' },
              { kind: 'dice', formula: '1d20 + dex' },
            ],
            [
              { kind: 'text', text: 'Деление' },
              { kind: 'dice', formula: 'str / (str - str)' },
            ],
          ],
        },
        {
          repeat: true,
          rows: [
            [
              { kind: 'text', text: 'Атака' },
              { kind: 'field', type: 'text', id: 'attack' },
              { kind: 'field', type: 'number', id: 'bonus' },
              { kind: 'dice', formula: '1d20 + bonus' },
            ],
          ],
        },
        {
          rows: [
            [
              { kind: 'text', text: 'Имя' },
              { kind: 'field', type: 'text', id: 'name' },
            ],
          ],
        },
      ],
    },
    {
      id: 'npc',
      kind: 'single',
      title: 'NPC',
      visibility: 'gm',
      sections: [
        {
          rows: [
            [
              { kind: 'text', text: 'Хиты' },
              { kind: 'field', type: 'number', id: 'hp' },
              { kind: 'dice', formula: '1d20 + hp' },
            ],
          ],
        },
      ],
    },
  ],
};

// "Брок" and the unnamed "liza" are sheets of the "pc" set; "npc" is the GM-only single sheet.
const SEEDED: VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:name', d: { name: 'Брок' }, c: 1, a: 'seed' },
  { k: 'row:brok:str', d: { str: 14, str_tired: true }, c: 1, a: 'seed' },
  { k: 'rep:brok:attack:i1', d: { order: 0, cells: { attack: 'Меч', bonus: 3 } }, c: 1, a: 'seed' },
  { k: 'sheet:liza', d: { set: 'pc', order: 1 }, c: 1, a: 'seed' },
  { k: 'row:liza:str', d: { str: 14, str_tired: true }, c: 1, a: 'seed' },
  { k: 'row:npc:hp', d: { hp: 5 }, c: 1, a: 'seed' },
];

const STRENGTH: RollRequest = {
  sheetId: 'brok',
  place: { sectionIndex: 0, rowIndex: 0, cellIndex: 3, instanceId: null },
  shown: {},
};

const DEXTERITY: RollRequest = {
  ...STRENGTH,
  place: { ...STRENGTH.place, rowIndex: 1, cellIndex: 2 },
};

const DIVISION: RollRequest = {
  ...STRENGTH,
  place: { ...STRENGTH.place, rowIndex: 2, cellIndex: 1 },
};

const ATTACK: RollRequest = {
  sheetId: 'brok',
  place: { sectionIndex: 1, rowIndex: 0, cellIndex: 3, instanceId: 'i1' },
  shown: {},
};

const UNNAMED_STRENGTH: RollRequest = { ...STRENGTH, sheetId: 'liza' };

const HIT_POINTS: RollRequest = {
  sheetId: 'npc',
  place: { sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: null },
  shown: {},
};

const STRENGTH_TEXT = 'Мастер: Брок, Сила — 7, успех';

type ClientOptions = { role?: PlayerRole; name?: string; timing?: Partial<Timing> };

type Client = RigClient;

type Room = {
  room: MockRoom;
  // Every roll on the room, by sender.
  rolls: { from: string; data: JsonValue }[];
  post: (from: string, data: JsonValue) => void;
};

const roomRig = createRoomRig({
  seeded: SEEDED,
  timing: { catchUpTimeoutMs: 200, stateAnswerDelayMaxMs: 5 },
  until: 'live',
});

// A connection in the room and not in the party: it hears every roll and speaks for others.
function openRoom(): Room {
  const rigRoom = roomRig.openRoom();

  return {
    room: rigRoom.room,
    get rolls() {
      return rigRoom.heard.flatMap((message) =>
        Object(message.data).t === 'roll' ? [{ from: message.from, data: message.data }] : [],
      );
    },
    post: rigRoom.post,
  };
}

// One client: its background engine and one window. A GM loads the seeded records; a player gets
// them from a GM.
async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  return roomRig.startClient(room.room, connectionId, {
    ...options,
    engine: { random: SEVEN, rollCopy: copy },
  });
}

// Requests a roll from the client's window and waits for the engine's answer.
async function roll(client: Client, request: RollRequest): Promise<RollOutcome> {
  const settled = await Promise.resolve(client.window.requestRoll(request));

  if (settled.kind !== 'answered') {
    throw new Error(`the roll was ${settled.kind}`);
  }

  return settled.answer;
}

function shown(client: Client): string[] {
  return client.platform.shownNotifications();
}

function joinGhost(room: Room, role: PlayerRole): void {
  room.room.join({ id: GHOST, connectionId: GHOST, name: GHOST_NAME, role });
}

// A roll as the room carries it, with the roller name its sender wrote in.
function rollFrom(id: string, sheetName: string, hidden = false, roller = GHOST_NAME): JsonValue {
  return {
    v: 2,
    g: { n: 0, a: '' },
    t: 'roll',
    id,
    sheetId: 'brok',
    hidden,
    roller,
    sheetName,
    cell: 'Сила',
    result: { roll: 3, faces: [3], target: null, targetFaces: [], outcome: null },
  };
}

describe('a roll', () => {
  test('from a GM goes out once with its fields, and every client shows it, the roller included', async () => {
    // #given
    const room = openRoom();
    const gmA = await startClient(room, 'gm-a', { name: 'Мастер' });
    const gmB = await startClient(room, 'gm-b');
    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    // #when
    const outcome = await roll(gmA, STRENGTH);

    await waitUntil(() => [gmA, gmB, player].every((client) => shown(client).length === 1));

    // #then
    expect({
      outcome,
      rolls: room.rolls,
      shown: [gmA, gmB, player].map(shown),
    }).toEqual({
      outcome: { code: 'rolled' },
      rolls: [
        {
          from: 'gm-a',
          data: {
            v: 2,
            g: { n: 0, a: '' },
            t: 'roll',
            id: expect.any(String),
            sheetId: 'brok',
            hidden: false,
            roller: 'Мастер',
            sheetName: 'Брок',
            cell: 'Сила',
            result: { roll: 7, faces: [7], target: 12, targetFaces: [], outcome: 'success' },
          },
        },
      ],
      shown: [[STRENGTH_TEXT], [STRENGTH_TEXT], [STRENGTH_TEXT]],
    });
  });

  test('from a player of a character it cannot edit goes out and shows everywhere', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });
    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    // #when
    const outcome = await roll(player, STRENGTH);

    await waitUntil(() => shown(gm).length === 1);

    // #then
    expect({ outcome, shown: [gm, player].map(shown) }).toEqual({
      outcome: { code: 'rolled' },
      shown: [['Лиза: Брок, Сила — 7, успех'], ['Лиза: Брок, Сила — 7, успех']],
    });
  });

  test('of a repeat block reads its own instance and is named by the row', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });

    // #when
    await roll(gm, ATTACK);

    // #then
    expect(shown(gm)).toEqual(['Мастер: Брок, Атака — 10']);
  });

  test('of a hidden single sheet goes out hidden, named by its title, and shows on GM clients only, though the player receives it', async () => {
    // #given
    const room = openRoom();
    const gmA = await startClient(room, 'gm-a', { name: 'Мастер' });
    const gmB = await startClient(room, 'gm-b');
    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    // #when: the sheet set roll after it is handled after it on every client.
    await roll(gmA, HIT_POINTS);
    await roll(gmA, STRENGTH);
    await waitUntil(() => shown(player).length === 1 && shown(gmB).length === 2);

    // #then
    expect({
      sent: room.rolls.map((one) => {
        const data = Object(one.data);

        return { sheetId: data.sheetId, hidden: data.hidden, sheetName: data.sheetName };
      }),
      shown: [gmA, gmB, player].map(shown),
    }).toEqual({
      sent: [
        { sheetId: 'npc', hidden: true, sheetName: 'NPC' },
        { sheetId: 'brok', hidden: false, sheetName: 'Брок' },
      ],
      shown: [
        ['Мастер: NPC, Хиты — 12', STRENGTH_TEXT],
        ['Мастер: NPC, Хиты — 12', STRENGTH_TEXT],
        [STRENGTH_TEXT],
      ],
    });
  });

  test('of a sheet with an empty name field goes out with an empty name and shows the fallback label', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });
    const other = await startClient(room, 'gm-b');

    // #when
    await roll(gm, UNNAMED_STRENGTH);
    await waitUntil(() => shown(other).length === 1);

    // #then
    expect({
      sheetName: Object(room.rolls[0]?.data).sheetName,
      shown: [gm, other].map(shown),
    }).toEqual({
      sheetName: '',
      shown: [['Мастер: Без имени, Сила — 7, успех'], ['Мастер: Без имени, Сила — 7, успех']],
    });
  });

  test('of a hidden single sheet requested by a player is refused, and nothing is sent or shown', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');
    const player = await startClient(room, 'player', { role: 'PLAYER' });

    // #when
    const outcome = await roll(player, HIT_POINTS);

    await roll(player, STRENGTH);
    await waitUntil(() => shown(gm).length === 1);

    // #then
    expect({ outcome, rolls: room.rolls.length, shown: [gm, player].map(shown) }).toEqual({
      outcome: { code: 'refused' },
      rolls: 1,
      shown: [['player: Брок, Сила — 7, успех'], ['player: Брок, Сила — 7, успех']],
    });
  });

  test('that arrives twice, or comes back to its roller, shows once', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });
    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    await roll(gm, STRENGTH);
    await waitUntil(() => shown(player).length === 1);

    const sent = room.rolls[0]?.data ?? null;

    joinGhost(room, 'GM');

    // #when: the marker after the repeats is handled after them.
    room.post(GHOST, sent);
    room.post(GHOST, sent);
    room.post(GHOST, rollFrom('marker', 'Маркер'));
    await waitUntil(() => shown(gm).length === 2 && shown(player).length === 2);

    // #then
    expect([gm, player].map(shown)).toEqual([
      [STRENGTH_TEXT, 'Призрак: Маркер, Сила — 3'],
      [STRENGTH_TEXT, 'Призрак: Маркер, Сила — 3'],
    ]);
  });

  test('from a sender outside the party shows nothing', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    joinGhost(room, 'PLAYER');

    // #when: the marker from a known player after it is handled after it.
    room.post('stranger', rollFrom('stranger-roll', 'Чужой'));
    room.post(GHOST, rollFrom('marker', 'Маркер'));
    await waitUntil(() => shown(gm).length === 1);

    // #then
    expect(shown(gm)).toEqual(['Призрак: Маркер, Сила — 3']);
  });

  test('marked hidden from a player is dropped as forged, as a player cannot see a hidden sheet', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    joinGhost(room, 'PLAYER');

    // #when: the marker after it is handled after it.
    room.post(GHOST, rollFrom('forged', 'NPC', true));
    room.post(GHOST, rollFrom('marker', 'Маркер'));
    await waitUntil(() => shown(gm).length === 1);

    // #then
    expect(shown(gm)).toEqual(['Призрак: Маркер, Сила — 3']);
  });

  test('shows the name the party lists for its sender, not the one the message carries', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    joinGhost(room, 'PLAYER');

    // #when
    room.post(GHOST, rollFrom('named', 'Брок', false, 'Мастер'));
    await waitUntil(() => shown(gm).length === 1);

    // #then
    expect(shown(gm)).toEqual(['Призрак: Брок, Сила — 3']);
  });

  test('from a player in catch-up goes out and shows', async () => {
    // #given: the only GM left answers no one, so the player stays in catch-up.
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    const player = await startClient(room, 'player', {
      role: 'PLAYER',
      name: 'Лиза',
      timing: { catchUpTimeoutMs: 1500 },
    });

    gm.engine.stop();
    gm.platform.leaveParty();
    joinGhost(room, 'GM');
    player.engine.catchUp();
    await waitUntil(() => player.store.$sync.get().state === 'catching-up');

    // #when
    const outcome = await roll(player, STRENGTH);

    // #then
    expect({
      outcome,
      rolls: room.rolls.length,
      shown: shown(player),
      state: player.store.$sync.get().state,
    }).toEqual({
      outcome: { code: 'rolled' },
      rolls: 1,
      shown: ['Лиза: Брок, Сила — 7, успех'],
      state: 'catching-up',
    });
  });

  test('whose send fails answers failed, and nothing shows', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });

    gm.platform.failNextSends([{ kind: 'failed', reason: 'mock send failure' }]);

    // #when
    const outcome = await roll(gm, STRENGTH);

    // #then
    expect({ outcome, rolls: room.rolls.length, shown: shown(gm) }).toEqual({
      outcome: { code: 'failed' },
      rolls: 0,
      shown: [],
    });
  });
});

describe('a roll that cannot be evaluated', () => {
  test.each<[string, RollRequest, RollOutcome]>([
    [
      'an empty field gives the field error by its label',
      DEXTERITY,
      { code: 'field', field: 'Ловкость' },
    ],
    ['a division by zero gives the arithmetic error', DIVISION, { code: 'arithmetic' }],
    [
      'a referenced field the window shows in an error gives the field error',
      { ...STRENGTH, shown: { str: { kind: 'error' } } },
      { code: 'field', field: 'Сила' },
    ],
  ])('%s, and nothing is sent or shown', async (_name, request, expected) => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });
    const other = await startClient(room, 'gm-b');

    // #when: the good roll after it is handled after it.
    const outcome = await roll(gm, request);

    await roll(gm, STRENGTH);
    await waitUntil(() => shown(other).length === 1);

    // #then
    expect({ outcome, rolls: room.rolls.length, shown: [gm, other].map(shown) }).toEqual({
      outcome: expected,
      rolls: 1,
      shown: [[STRENGTH_TEXT], [STRENGTH_TEXT]],
    });
  });
});

describe('the value a roll uses', () => {
  test('is the text the window shows in a field, over the record', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });

    // #when: str 4 makes the target 2.
    await roll(gm, { ...STRENGTH, shown: { str: { kind: 'text', text: '4' } } });

    // #then
    expect(shown(gm)).toEqual(['Мастер: Брок, Сила — 7, провал']);
  });

  test('is a GM edit still pending in catch-up', async () => {
    // #given: a GM that never answers holds this client in catch-up.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      timing: { catchUpTimeoutMs: 1500 },
    });

    joinGhost(room, 'GM');
    gm.engine.catchUp();
    await waitUntil(() => gm.store.$sync.get().state === 'catching-up');

    // #when
    gm.window.sendCommand({
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 4,
    });

    const outcome = await roll(gm, STRENGTH);

    // #then
    expect({ outcome, shown: shown(gm), state: gm.store.$sync.get().state }).toEqual({
      outcome: { code: 'rolled' },
      shown: ['Мастер: Брок, Сила — 7, провал'],
      state: 'catching-up',
    });
  });
});

describe("the value a player's roll uses", () => {
  test('is its edit still waiting for a GM client', async () => {
    // #given: the player may edit "Брок", and then no GM client answers.
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });
    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    gm.window.sendCommand({
      type: 'acl-set',
      sheetId: 'brok',
      playerId: 'player',
      name: 'Лиза',
      on: true,
    });

    await waitUntil(() => player.store.$records.get().get('acl:brok:player')?.d != null);
    gm.engine.stop();

    // #when: str 4 makes the target 2.
    player.window.sendCommand({
      type: 'field-patch',
      sheetId: 'brok',
      target: { kind: 'row', rowId: 'str' },
      fieldId: 'str',
      value: 4,
    });

    await waitUntil(
      () =>
        JSON.stringify(player.store.$records.get().get('row:brok:str')?.d) ===
        '{"str":4,"str_tired":true}',
    );

    const outcome = await roll(player, STRENGTH);

    // #then
    expect({ outcome, shown: shown(player) }).toEqual({
      outcome: { code: 'rolled' },
      shown: ['Лиза: Брок, Сила — 7, провал'],
    });
  });
});

describe('a roll as state', () => {
  test('leaves the records, the storage and the room metadata as they were', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер' });
    const other = await startClient(room, 'gm-b');

    const before = {
      records: [...gm.store.$records.get().values()],
      stored: gm.backing.keys().map((key) => [key, gm.backing.get(key)]),
      metadata: room.room.getMetadata(),
    };

    // #when
    await roll(gm, STRENGTH);
    await waitUntil(() => shown(other).length === 1);

    // #then
    expect({
      records: [...gm.store.$records.get().values()],
      stored: gm.backing.keys().map((key) => [key, gm.backing.get(key)]),
      metadata: room.room.getMetadata(),
    }).toEqual(before);
  });
});
