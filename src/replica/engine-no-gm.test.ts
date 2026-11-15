import { describe, expect, spyOn, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { encodeStateRecords } from '@/core/state-records';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { RoomCopyStatus, SyncState } from '@/core/ui-messages';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  copyValue,
  createRoomRig,
  lastRequest,
  pause,
  requestsOf,
  sync,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

// The key of the 2.5 spec, written out by hand.
const KEY = 'app.muster-roll/snapshot';

const INITIAL: Generation = { n: 0, a: '' };
const GHOST = 'ghost-gm';
const PLAYER = 'player-p';

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
      tabs: [{ sections: [{ rows: [[{ kind: 'field', type: 'number', id: 'hp' }]] }] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK = sheet('brok');
const BROK_NAME = nameRow('brok', 'Брок');
const MIRA = sheet('mira');
const BROK_STR: VersionedRecord = { k: 'row:brok:str', d: { str: 12 }, c: 1, a: 'seed' };

// A row of the hidden single sheet "npc", whose sheet id is its template id.
const GOBLIN_HP: VersionedRecord = { k: 'row:npc:hp', d: { hp: 7 }, c: 1, a: 'seed' };

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
  until?: 'loaded' | 'live';
  platform?: (platform: MockPlatform) => MockPlatform;
};

type Client = RigClient;

type Room = RigRoom;

function sheet(id: string): VersionedRecord {
  return { k: `sheet:${id}`, d: { set: 'pc', order: 0 }, c: 1, a: 'seed' };
}

function nameRow(id: string, name: string, c = 1, a = 'seed'): VersionedRecord {
  return { k: `row:${id}:name`, d: { name }, c, a };
}

const roomRig = createRoomRig({
  seeded: [PRESET_RECORD, BROK],
  timing: { catchUpTimeoutMs: 100, stateAnswerDelayMaxMs: 5 },
});

const emptyRig = createRoomRig();

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  return roomRig.startClient(room, connectionId, {
    ...options,
    engine: { random: () => 0 },
  });
}

// A player alone in the room: its start catch-up times out with nobody to answer.
async function playerAlone(room: Room, timing: Partial<Timing> = {}): Promise<Client> {
  return startClient(room, PLAYER, { role: 'PLAYER', seeded: [], timing, until: 'live' });
}

function keysOf(client: Client): string[] {
  return [...client.store.$records.get().keys()].sort();
}

function roomCopy(client: Client): RoomCopyStatus {
  return client.store.$roomCopy.get();
}

function typesFrom(room: Room, from: string): string[] {
  return room.heard.flatMap((message) =>
    message.from === from ? [String(Object(message.data).t)] : [],
  );
}

function stateMessage(r: string, records: readonly VersionedRecord[]): JsonValue {
  return { v: 3, g: INITIAL, t: 'state', r, i: 1, n: 1, records: encodeStateRecords(records) };
}

function commit(records: readonly VersionedRecord[]): JsonValue {
  return { v: 3, g: INITIAL, t: 'commit', records: [...records] };
}

function ping(): JsonValue {
  return { v: 3, g: INITIAL, t: 'ping' };
}

// What a player alone in the room shows once its start catch-up timed out.
const ALONE: Omit<SyncState, 'role'> = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: false,
  gmLink: 'offline',
};

describe('a player alone reads the room copy', () => {
  test('a readable copy: every visible sheet, no record of a hidden single sheet, outcome read, still no GM', async () => {
    // #given
    const room = roomRig.openRoom();

    room.room.setMetadata({
      [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK, BROK_NAME, BROK_STR, GOBLIN_HP]),
    });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({ keys: keysOf(player), outcome: roomCopy(player).outcome, sync: sync(player) }).toEqual(
      {
        keys: ['preset', 'row:brok:name', 'row:brok:str', 'sheet:brok'],
        outcome: 'read',
        sync: { ...ALONE, role: 'PLAYER' },
      },
    );
  });

  test('a readable copy with a preset and no visible sheet: outcome read, the preset only', async () => {
    // #given
    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, GOBLIN_HP]) });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({ keys: keysOf(player), outcome: roomCopy(player).outcome }).toEqual({
      keys: ['preset'],
      outcome: 'read',
    });
  });

  test('a readable copy with no preset: outcome read, no preset', async () => {
    // #given
    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [BROK]) });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({
      preset: keysOf(player).includes('preset'),
      outcome: roomCopy(player).outcome,
    }).toEqual({ preset: false, outcome: 'read' });
  });

  test('no copy: outcome none, nothing held', async () => {
    // #given
    const room = roomRig.openRoom();

    room.room.setMetadata({ 'other.extension/data': 'x' });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({ keys: keysOf(player), outcome: roomCopy(player).outcome }).toEqual({
      keys: [],
      outcome: 'none',
    });
  });

  test('a copy of a newer build: outcome newer, the new-version notice, nothing read', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK], 4) });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({
      keys: keysOf(player),
      outcome: roomCopy(player).outcome,
      notices: player.store.$notices.get(),
    }).toEqual({ keys: [], outcome: 'newer', notices: ['new-version'] });
  });

  test.each([1, 2])(
    'a copy of the older format %i: outcome older, no notice for a player, nothing read',
    async (format) => {
      // #given
      spyOn(console, 'error').mockImplementation(() => undefined);

      const room = roomRig.openRoom();

      room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK], format) });

      // #when
      const player = await playerAlone(room);

      // #then
      expect({
        keys: keysOf(player),
        outcome: roomCopy(player).outcome,
        notices: player.store.$notices.get(),
      }).toEqual({ keys: [], outcome: 'older', notices: [] });
    },
  );

  test('a copy that does not decode: outcome unreadable, no notice for a player', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: { v: 3, data: 'bm90IGRlZmxhdGU=' } });

    // #when
    const player = await playerAlone(room);

    // #then
    expect({
      keys: keysOf(player),
      outcome: roomCopy(player).outcome,
      state: roomCopy(player).state,
      notices: player.store.$notices.get(),
    }).toEqual({ keys: [], outcome: 'unreadable', state: 'none', notices: [] });
  });

  test('before any catch-up read the outcome is unknown', async () => {
    // #given: the window's store before its first projection.
    const rig = emptyRig;
    const store = rig.createClient(rig.openRoom(), 'probe').openWindow().store;

    // #then
    expect(store.$roomCopy.get().outcome).toBeNull();
  });

  test('sends no commit and no edit: only state-request reaches the room, and edits are refused', async () => {
    // #given
    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK]) });

    const player = await playerAlone(room, { gmLinkTimeoutMs: 60 });

    // #when: an edit attempt, and long enough for pings to go out.
    const settled = await Promise.resolve(
      player.window.sendCommand({
        type: 'field-patch',
        sheetId: 'brok',
        target: { kind: 'row', rowId: 'str' },
        fieldId: 'str',
        value: 3,
      }),
    );

    await pause(100);

    // #then
    expect({
      reason: settled.kind === 'refused' ? settled.rejection.reason : settled.kind,
      sentTypes: [...new Set(typesFrom(room, PLAYER))].sort(),
      keys: keysOf(player),
    }).toEqual({
      reason: 'not-allowed',
      sentTypes: ['ping', 'state-request'],
      keys: ['preset', 'sheet:brok'],
    });
  });
});

describe('a GM returns', () => {
  test('the first GM-origin message while live sends a player to catching-up with a new r, and a complete answer brings current data', async () => {
    // #given: the player reads the copy with no GM.
    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK]) });

    const player = await playerAlone(room, { catchUpTimeoutMs: 400 });
    const first = lastRequest(room, PLAYER);

    room.join(GHOST, 'GM');

    // #when
    room.post(GHOST, commit([MIRA]));
    await waitUntil(() => requestsOf(room, PLAYER).length === 2);

    const during = sync(player);
    const renamed = nameRow('brok', 'Брок Смелый', 2, GHOST);

    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD, renamed, MIRA]));
    await waitUntil(() => sync(player).gmAnswered);

    // #then
    expect({
      fresh: lastRequest(room, PLAYER) !== first,
      during: { state: during.state, gmLink: during.gmLink },
      after: sync(player),
      brok: player.store.$records.get().get(renamed.k),
      keys: keysOf(player),
    }).toEqual({
      fresh: true,
      during: { state: 'catching-up', gmLink: 'online' },
      after: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
      brok: renamed,
      keys: ['preset', 'row:brok:name', 'sheet:brok', 'sheet:mira'],
    });
  });

  test('a GM that speaks again after the link went offline starts another catch-up with a new r', async () => {
    // #given: the ghost was heard during the start catch-up, then went quiet past the timeout.
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100, gmLinkTimeoutMs: 150 },
    });

    expect(sync(player).state).toBe('catching-up');
    room.post(GHOST, ping());
    await waitUntil(() => sync(player).gmLink === 'online');
    await waitUntil(() => sync(player).state === 'live');
    await waitUntil(() => sync(player).gmLink === 'offline');

    const before = requestsOf(room, PLAYER);

    // #when
    room.post(GHOST, commit([BROK]));
    await waitUntil(() => requestsOf(room, PLAYER).length === before.length + 1);

    // #then
    expect({
      fresh: !before.includes(lastRequest(room, PLAYER)),
      state: sync(player).state,
    }).toEqual({ fresh: true, state: 'catching-up' });
  });

  test('a GM heard during the start catch-up is asked again with the same r, and no new one', async () => {
    // #given: the start request went out before any GM was there.
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 400 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 1);
    expect(sync(player).state).toBe('catching-up');

    // #when
    room.post(GHOST, commit([PRESET_RECORD]));
    await waitUntil(() => requestsOf(room, PLAYER).length === 2);
    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD, BROK]));
    await waitUntil(() => sync(player).state === 'live');
    // A third request would go out at once.
    await pause(50);

    // #then
    expect({
      nonces: new Set(requestsOf(room, PLAYER)).size,
      requests: requestsOf(room, PLAYER).length,
      sync: sync(player),
    }).toEqual({
      nonces: 1,
      requests: 2,
      sync: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });

  test('a GM joining during a player start catch-up answers it once its own catch-up ends', async () => {
    // #given: the player asks with nobody there, and a silent GM keeps the joining GM catching up.
    const room = roomRig.openRoom();

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 1500 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 1);
    room.join(GHOST, 'GM');

    // #when
    const renamed = nameRow('brok', 'Брок Смелый', 2, 'gm-a');

    await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, BROK, renamed, MIRA],
      timing: { catchUpTimeoutMs: 200 },
    });

    await waitUntil(() => sync(player).gmAnswered);

    // #then
    expect({ keys: keysOf(player), brok: player.store.$records.get().get(renamed.k) }).toEqual({
      keys: ['preset', 'row:brok:name', 'sheet:brok', 'sheet:mira'],
      brok: renamed,
    });
  });

  test('a player gm-return request that reaches a GM still in its start catch-up is answered once that ends', async () => {
    // #given: the player is live with no GM, and a silent GM keeps the joining GM catching up.
    const room = roomRig.openRoom();
    const player = await playerAlone(room, { catchUpTimeoutMs: 1500 });

    room.join(GHOST, 'GM');

    // #when
    const renamed = nameRow('brok', 'Брок Смелый', 2, 'gm-a');

    await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, BROK, renamed, MIRA],
      timing: { catchUpTimeoutMs: 200 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 2);
    await waitUntil(() => sync(player).gmAnswered);

    // #then
    expect({
      keys: keysOf(player),
      brok: player.store.$records.get().get(renamed.k),
      sync: sync(player),
    }).toEqual({
      keys: ['preset', 'row:brok:name', 'sheet:brok', 'sheet:mira'],
      brok: renamed,
      sync: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });

  test('a live GM that hears a new GM tab stays live and asks for nothing', async () => {
    // #given: gm-a is live and alone.
    const room = roomRig.openRoom();
    const gmA = await startClient(room, 'gm-a', { until: 'live' });

    room.join(GHOST, 'GM');

    // #when: the ghost asks for state, as a GM tab that just opened does.
    room.post(GHOST, { v: 3, g: INITIAL, t: 'state-request', r: 'ghost-r' });
    await waitUntil(() =>
      room.heard.some(
        (message) =>
          message.from === 'gm-a' &&
          Object(message.data).t === 'state' &&
          Object(message.data).r === 'ghost-r',
      ),
    );

    // #then
    expect({ requests: requestsOf(room, 'gm-a').length, sync: sync(gmA) }).toEqual({
      requests: 1,
      sync: { ...ALONE, gmLink: 'online', role: 'GM' },
    });
  });

  test('a GM-origin message while the link is online starts no catch-up', async () => {
    // #given: the player heard the ghost answer its start catch-up.
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 400 },
    });

    await waitUntil(() => requestsOf(room, PLAYER).length === 1);
    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD]));
    await waitUntil(() => sync(player).state === 'live');

    // #when
    room.post(GHOST, commit([BROK]));
    await waitUntil(() => player.store.$records.get().has(BROK.k));
    await pause(50);

    // #then
    expect({ requests: requestsOf(room, PLAYER).length, state: sync(player).state }).toEqual({
      requests: 1,
      state: 'live',
    });
  });

  test('a complete answer after the timeout from a GM not heard before counts, and starts no catch-up', async () => {
    // #given
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const player = await playerAlone(room);

    // #when
    room.post(GHOST, stateMessage(lastRequest(room, PLAYER), [PRESET_RECORD]));
    await waitUntil(() => sync(player).gmAnswered);
    await pause(50);

    // #then
    expect({ requests: requestsOf(room, PLAYER).length, sync: sync(player) }).toEqual({
      requests: 1,
      sync: { ...ALONE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });
});

describe('outcomes with nothing to read', () => {
  test('a failed metadata read with no outcome yet shows the copy as unreadable', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = roomRig.openRoom();

    // #when
    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
      platform: (platform) => ({
        ...platform,
        metadata: {
          ...platform.metadata,
          getMetadata: () => Promise.reject(new Error('metadata read failed')),
        },
      }),
    });

    // #then
    expect(roomCopy(player).outcome).toBe('unreadable');
  });

  test('a player that holds records adopts a copy of a higher generation in place of them', async () => {
    // #given: the player holds records of its own generation from a GM commit.
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const player = await startClient(room, PLAYER, {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 200 },
    });

    expect(sync(player).state).toBe('catching-up');
    room.post(GHOST, commit([PRESET_RECORD, BROK]));
    await waitUntil(() => player.store.$records.get().has(BROK.k));
    await waitUntil(() => sync(player).state === 'live');
    room.room.setMetadata({ [KEY]: copyValue({ n: 1, a: 'importer' }, [PRESET_RECORD, MIRA]) });

    // #when
    player.engine.catchUp();
    await waitUntil(() => roomCopy(player).outcome === 'read' && keysOf(player).includes(MIRA.k));

    // #then
    expect(keysOf(player)).toEqual(['preset', 'sheet:mira']);
  });
});
