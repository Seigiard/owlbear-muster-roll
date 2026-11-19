import { Result } from 'better-result';
import { fixturePatch } from '../../tests/support/block-fixtures';
import { describe, expect, test } from 'bun:test';
import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { recordSchema, type VersionedRecord } from '@/core/records';
import { decodeStateRecords, encodeStateRecords } from '@/core/state-records';
import { generationMarkerKey, type Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { WireCommand, SyncState } from '@/core/ui-messages';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  createRoomRig,
  heardOf,
  lastRequest,
  outcome,
  pause,
  rejection,
  requestsOf,
  send,
  shown,
  storageKey,
  storedRecord,
  sync,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

const INITIAL: Generation = { n: 0, a: '' };
const ROW_STR = { kind: 'row', rowId: 'str' } as const;
const ROW_NOTES = { kind: 'row', rowId: 'notes' } as const;
const ROW_NAME = { kind: 'row', rowId: 'name' } as const;
const GHOST = 'ghost-gm';
const ASKER = 'asker';

// "pc" is the visible sheet set, "npc" a hidden single sheet and "mon" a hidden sheet set.
const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Персонажи',
      repeat: { nameField: 'name' },

      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'text', id: 'name' },
                    { kind: 'token', id: 'token' },
                  ],
                },
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'str' },
                    { kind: 'field', type: 'check', id: 'str_tired' },
                  ],
                },
                { cells: [{ kind: 'field', type: 'text', id: 'notes' }] },
              ],
            },
            {
              repeat: { id: 'attack', nameField: 'attack' },
              rows: [{ cells: [{ kind: 'field', type: 'text', id: 'attack' }] }],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',

      title: 'NPC',
      visibility: 'gm',

      tabs: [
        {
          sections: [
            {
              rows: [
                {
                  cells: [
                    { kind: 'field', type: 'number', id: 'hp' },
                    { kind: 'token', id: 'token' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'mon',

      title: 'Монстры',
      repeat: { nameField: 'title' },
      visibility: 'gm',
      tabs: [
        {
          sections: [
            {
              rows: [
                { cells: [{ kind: 'field', type: 'text', id: 'title' }] },
                { cells: [{ kind: 'field', type: 'number', id: 'mhp' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK = sheet('brok');

const LIVE: SyncState = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: false,
  gmLink: 'offline',
  role: 'GM',
};

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
  random?: () => number;
  // Wait until the client is live before the test goes on.
  until?: 'loaded' | 'live';
  platform?: (platform: MockPlatform) => MockPlatform;
};

type Client = RigClient;

// A connection in the room that hears every REMOTE message and posts as any connection.
type Room = RigRoom;

function sheet(id: string, c = 1, a = 'seed'): VersionedRecord {
  return { k: `blk:${id}`, d: { set: 'pc', order: 0, cells: {} }, c, a, l: [1, 'seed'] };
}

const roomRig = createRoomRig({
  seeded: [PRESET_RECORD, BROK],
  timing: { catchUpTimeoutMs: 400, stateAnswerDelayMaxMs: 5 },
});

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  return roomRig.startClient(room, connectionId, {
    ...options,
    engine: { random: options.random },
  });
}

function patch(target: typeof ROW_STR | typeof ROW_NOTES, fieldId: string, value: JsonValue) {
  return { type: 'field-patch', sheetId: 'brok', target, fieldId, value } satisfies WireCommand;
}

function stateMessage(
  r: string,
  records: readonly VersionedRecord[],
  i = 1,
  n = 1,
  g: Generation = INITIAL,
): JsonValue {
  return { v: 4, g, t: 'state', r, i, n, records: encodeStateRecords(records) };
}

function commit(records: VersionedRecord[], g: Generation = INITIAL): JsonValue {
  return { v: 4, g, t: 'commit', records };
}

// A GM client in `catching-up` after its first catch-up: it was alone, then a GM that never answers
// joined, and the page came back.
async function catchingUpAgain(room: Room, connectionId: string): Promise<Client> {
  const client = await startClient(room, connectionId, {
    timing: { catchUpTimeoutMs: 1500 },
    until: 'live',
  });

  room.join(GHOST, 'GM');
  client.engine.catchUp();
  await waitUntil(
    () => sync(client).state === 'catching-up' && requestsOf(room, connectionId).length === 2,
  );

  return client;
}

describe('start', () => {
  test('flushNow without queued intents leaves ordinary catch-up held until its GM answer', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    const request = lastRequest(room, 'gm-a');
    // #when
    client.engine.flushNow();
    await pause(20);
    const during = sync(client).state;
    room.post(GHOST, stateMessage(request, []));
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect({ during, after: sync(client).state }).toEqual({ during: 'catching-up', after: 'live' });
  });
  test('a GM client enters catching-up with its persisted records and asks with a nonce', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    // #when
    const client = await startClient(room, 'gm-b');
    await waitUntil(() => requestsOf(room, 'gm-b').length === 1);
    // #then
    expect({
      sync: sync(client),
      brok: shown(client, BROK.k),
      request: heardOf(room, 'gm-b', 'state-request'),
    }).toEqual({
      sync: {
        state: 'catching-up',
        firstCatchUpDone: false,
        gmAnswered: false,
        gmLink: 'offline',
        role: 'GM',
      },
      brok: BROK,
      request: [{ v: 4, g: INITIAL, t: 'state-request', r: lastRequest(room, 'gm-b') }],
    });
  });
  test('a GM client whose party read shows no other GM leaves at once, with no timeout wait', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join('player-p', 'PLAYER');
    // #when
    const started = Date.now();
    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });
    // #then
    expect({ sync: sync(client), quick: Date.now() - started < 500 }).toEqual({
      sync: LIVE,
      quick: true,
    });
  });
  test('a GM client whose party read fails waits for answers, then the timeout', async () => {
    // #given
    const room = roomRig.openRoom();

    const failingParty = (platform: MockPlatform): MockPlatform => ({
      ...platform,
      party: { ...platform.party, getPlayers: () => Promise.reject(new Error('no party')) },
    });

    // #when
    const client = await startClient(room, 'gm-a', { platform: failingParty });
    const before = sync(client);
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect({ before, after: sync(client) }).toEqual({
      before: {
        state: 'catching-up',
        firstCatchUpDone: false,
        gmAnswered: false,
        gmLink: 'offline',
        role: 'GM',
      },
      after: LIVE,
    });
  });
  test('a late GM client gets the records of a live GM client and persists them', async () => {
    // #given
    const room = roomRig.openRoom();
    const liza = sheet('liza', 3, 'gm-a');
    await startClient(room, 'gm-a', { seeded: [PRESET_RECORD, BROK, liza], until: 'live' });
    // #when
    const late = await startClient(room, 'gm-b', { seeded: [], until: 'live' });
    // #then
    expect({
      shown: [shown(late, BROK.k), shown(late, liza.k), shown(late, 'preset')],
      stored: [storedRecord(late, BROK.k), storedRecord(late, liza.k)],
    }).toEqual({ shown: [BROK, liza, PRESET_RECORD], stored: [BROK, liza] });
  });
});

describe('engine catch-up decisions', () => {
  test('answers two remote nonces after their independent delays', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join('asker-a', 'PLAYER');
    room.join('asker-b', 'PLAYER');
    await startClient(room, 'gm-a', {
      timing: { stateAnswerDelayMinMs: 30, stateAnswerDelayMaxMs: 30 },
      until: 'live',
    });
    // #when
    room.post('asker-a', { v: 4, g: INITIAL, t: 'state-request', r: 'r-a' });
    room.post('asker-b', { v: 4, g: INITIAL, t: 'state-request', r: 'r-b' });
    await pause(80);
    // #then
    expect(
      heardOf(room, 'gm-a', 'state')
        .map((message) => Object(message).r)
        .sort((left, right) => String(left).localeCompare(String(right))),
    ).toEqual(['r-a', 'r-b']);
  });
  test('advertises a fresh digest after a remote commit changes the replica', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    await startClient(room, 'gm-a', { until: 'live' });
    room.post(GHOST, { v: 4, g: INITIAL, t: 'ping' });
    await waitUntil(() => heardOf(room, 'gm-a', 'alive').length === 1);
    const changed: VersionedRecord = { ...BROK, c: 2, a: GHOST };
    // #when
    room.post(GHOST, commit([changed]));
    room.post(GHOST, { v: 4, g: INITIAL, t: 'ping' });
    await waitUntil(() => heardOf(room, 'gm-a', 'alive').length === 2);
    // #then
    expect(heardOf(room, 'gm-a', 'alive').map((message) => Object(message).digest)).toEqual([
      1850085591, 2443697511,
    ]);
  });
  test('surfaces persisted corruption discovered on a later catch-up', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    client.backing.set(storageKey('blk:bad'), '{not json');
    // #when
    client.engine.catchUp();
    await pause(30);
    // #then
    expect(client.store.$notices.get()).toEqual(['local-save-failed']);
  });
  test('skips an oversized persisted record and reports it on a later catch-up', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });

    const huge: VersionedRecord = {
      k: 'blk:brok',
      d: { order: 0, cells: { name: ['x'.repeat(14900), 2, 'other-tab'] } },
      c: 2,
      a: 'other-tab',
      l: [1, 'seed'],
    };

    client.backing.set(storageKey(huge.k), JSON.stringify(huge));
    // #when
    client.engine.catchUp();
    await pause(30);
    // #then
    expect({
      shown: shown(client, huge.k) ?? null,
      notices: client.store.$notices.get(),
    }).toEqual({ shown: BROK, notices: ['local-save-failed'] });
  });
  test('still enters catch-up when the persisted generation cannot be read again', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    client.platform.setFailingStorageOperations(['list']);
    // #when
    expect(() => client.engine.catchUp()).not.toThrow();
    await waitUntil(() => sync(client).state === 'catching-up');
    const during = sync(client).state;
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect({ during, after: sync(client).state }).toEqual({ during: 'catching-up', after: 'live' });
  });
  test('a GM without readable persistence can re-enter catch-up', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      platform: (platform) => {
        platform.setFailingStorageOperations(['list']);

        return platform;
      },
      until: 'live',
    });

    // #when
    let thrown: string | null = null;

    try {
      client.engine.catchUp();
    } catch (error) {
      thrown = error instanceof Error ? error.message : 'unknown error';
    }

    // #then
    expect({
      thrown,
      notices: client.store.$notices.get(),
    }).toEqual({
      thrown: null,
      notices: ['local-save-failed'],
    });
  });
  test('publishes catch-up entry before pending room and party reads settle', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 200 },
      until: 'live',
    });

    const never = new Promise<never>(() => undefined);
    client.platform.metadata.getMetadata = () => never;
    client.platform.party.getPlayers = () => never;
    // #when
    client.engine.catchUp();
    await pause(20);
    // #then
    expect(sync(client).state).toBe('catching-up');
  });
  test('forgets digest mismatches when a GM connection leaves the party', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 100, gmLinkTimeoutMs: 20 },
      until: 'live',
    });

    room.post(GHOST, { v: 4, g: INITIAL, t: 'alive', digest: 0 });
    await pause(11);
    room.room.leave(GHOST);
    room.join(GHOST, 'GM');
    await pause(11);
    // #when
    room.post(GHOST, { v: 4, g: INITIAL, t: 'alive', digest: 0 });
    await pause(20);
    // #then
    expect(sync(client).state).toBe('live');
  });
});

describe('answer', () => {
  test('a live GM answers after a delay in its range with numbered state parts of all its records', async () => {
    // #given
    const room = roomRig.openRoom();
    const gone: VersionedRecord = { k: 'blk:brok', d: null, c: 2, a: 'gm-a', l: [1, 'seed'] };
    await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, gone],
      timing: { stateAnswerDelayMinMs: 60, stateAnswerDelayMaxMs: 100 },
      random: () => 0.5,
      until: 'live',
    });
    room.join(ASKER, 'PLAYER');
    // #when
    const asked = Date.now();
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    await waitUntil(() => heardOf(room, 'gm-a', 'state').length > 0);
    // #then
    const answer = heardOf(room, 'gm-a', 'state').map((message) => Object(message));
    expect({
      waited: Date.now() - asked >= 80,
      parts: answer.map((message) => [message.r, message.i, message.n]),
      records: decodeStateRecords(String(answer[0]?.records)),
    }).toEqual({
      waited: true,
      parts: [['r-asker', 1, 1]],
      records: Result.ok([PRESET_RECORD, gone]),
    });
  });
  test('a live GM sends nothing when another answer to the same nonce arrives during its delay', async () => {
    // #given
    const room = roomRig.openRoom();
    await startClient(room, 'gm-a', {
      timing: { stateAnswerDelayMinMs: 80, stateAnswerDelayMaxMs: 80 },
      until: 'live',
    });
    room.join(ASKER, 'PLAYER');
    room.join(GHOST, 'GM');
    // #when
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    room.post(GHOST, stateMessage('r-asker', [BROK]));
    await pause(200);
    // #then
    expect(heardOf(room, 'gm-a', 'state')).toEqual([]);
  });
  test('a GM client in catching-up does not answer', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    room.join(ASKER, 'PLAYER');
    const client = await startClient(room, 'gm-b');
    // #when
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    await pause(100);
    // #then
    expect({ sync: sync(client).state, answers: heardOf(room, 'gm-b', 'state') }).toEqual({
      sync: 'catching-up',
      answers: [],
    });
  });
  test('a player client does not answer', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(ASKER, 'PLAYER');
    await startClient(room, 'player-p', { role: 'PLAYER', seeded: [], until: 'live' });
    // #when
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    await pause(100);
    // #then
    expect(heardOf(room, 'player-p', 'state')).toEqual([]);
  });
  test('a GM client whose storage reads failed at start does not answer', async () => {
    // #given
    const room = roomRig.openRoom();

    const failingReads = (platform: MockPlatform): MockPlatform => {
      platform.setFailingStorageOperations(['read', 'list']);

      return platform;
    };

    await startClient(room, 'gm-a', { platform: failingReads, until: 'live' });
    room.join(ASKER, 'PLAYER');
    // #when
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    await pause(100);
    // #then
    expect(heardOf(room, 'gm-a', 'state')).toEqual([]);
  });
  test('a state that cannot be read does not stop a live GM from answering', async () => {
    // #given
    const room = roomRig.openRoom();
    await startClient(room, 'gm-a', {
      timing: { stateAnswerDelayMinMs: 60, stateAnswerDelayMaxMs: 60 },
      until: 'live',
    });
    room.join(ASKER, 'PLAYER');
    room.join(GHOST, 'GM');
    // #when
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    room.post(GHOST, {
      v: 4,
      g: INITIAL,
      t: 'state',
      r: 'r-asker',
      i: 1,
      n: 1,
      records: btoa('plain text'),
    });
    await waitUntil(() => heardOf(room, 'gm-a', 'state').length > 0);
    // #then
    expect(heardOf(room, 'gm-a', 'state').map((message) => Object(message).r)).toEqual(['r-asker']);
  });
  test('a request again for one nonce is answered again, as the asker missed the first answer', async () => {
    // #given
    const room = roomRig.openRoom();
    await startClient(room, 'gm-a', { until: 'live' });
    room.join(ASKER, 'PLAYER');
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    await waitUntil(() => heardOf(room, 'gm-a', 'state').length === 1);
    // #when
    room.post(ASKER, { v: 4, g: INITIAL, t: 'state-request', r: 'r-asker' });
    await waitUntil(() => heardOf(room, 'gm-a', 'state').length === 2);
    // #then
    expect(heardOf(room, 'gm-a', 'state').map((message) => Object(message).r)).toEqual([
      'r-asker',
      'r-asker',
    ]);
  });
});

describe('exit', () => {
  test('a partial answer is merged, and catch-up ends only when all n parts of one responder are in', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    room.join('ghost-gm-2', 'GM');
    const client = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 1500 } });
    const r = lastRequest(room, 'gm-b');
    const liza = sheet('liza', 1, GHOST);
    const nika = sheet('nika', 1, 'ghost-gm-2');
    // #when
    room.post(GHOST, stateMessage(r, [liza], 1, 2));
    room.post('ghost-gm-2', stateMessage(r, [nika], 2, 2));
    room.post(GHOST, stateMessage(r, [liza], 1, 2));
    await waitUntil(() => shown(client, nika.k) !== undefined);
    const partial = { sync: sync(client).state, liza: shown(client, liza.k) };
    room.post(GHOST, stateMessage(r, [], 2, 2));
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect(partial).toEqual({ sync: 'catching-up', liza });
  });
  test('a client with no complete answer leaves catching-up on the timeout', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const started = Date.now();
    const client = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 150 } });
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [], 1, 2));
    // #when
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect({ sync: sync(client), waited: Date.now() - started >= 150 }).toEqual({
      sync: { ...LIVE, gmLink: 'online' },
      waited: true,
    });
  });
  test('a state for an old nonce, or one that comes while live, is still merged', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join('player-p', 'PLAYER');
    const client = await startClient(room, 'gm-a', { until: 'live' });
    room.join(GHOST, 'GM');
    const liza = sheet('liza', 1, GHOST);
    // #when
    room.post(GHOST, stateMessage('someone-elses-nonce', [liza], 1, 3));
    await waitUntil(() => shown(client, liza.k) !== undefined);
    // #then
    expect({
      shown: shown(client, liza.k),
      stored: storedRecord(client, liza.k),
      sync: sync(client),
    }).toEqual({ shown: liza, stored: liza, sync: { ...LIVE, gmLink: 'online' } });
  });
});

describe('re-entry', () => {
  test('a return while live asks again with a new nonce', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    const first = lastRequest(room, 'gm-a');
    room.join(GHOST, 'GM');
    // #when
    client.engine.catchUp();
    await waitUntil(() => requestsOf(room, 'gm-a').length === 2);
    // #then
    expect({ fresh: lastRequest(room, 'gm-a') !== first, sync: sync(client) }).toEqual({
      fresh: true,
      sync: {
        state: 'catching-up',
        firstCatchUpDone: true,
        gmAnswered: false,
        gmLink: 'offline',
        role: 'GM',
      },
    });
  });
  test('a return while catching up keeps the nonce, and asks again only while nothing answered it', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    const r = lastRequest(room, 'gm-a');
    const asked = requestsOf(room, 'gm-a').length;
    // #when
    client.engine.catchUp();
    await waitUntil(() => requestsOf(room, 'gm-a').length === asked + 1);
    room.post(GHOST, stateMessage(r, [sheet('liza', 1, GHOST)], 1, 2));
    await waitUntil(() => shown(client, 'blk:liza') !== undefined);
    client.engine.catchUp();
    await pause(50);
    // #then
    expect({
      nonces: requestsOf(room, 'gm-a').slice(-2),
      count: requestsOf(room, 'gm-a').length,
      sync: sync(client).state,
    }).toEqual({ nonces: [r, r], count: asked + 1, sync: 'catching-up' });
  });
  test('returns while catching up do not put the timeout off', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 300 },
      until: 'live',
    });

    room.join(GHOST, 'GM');
    // #when
    const started = Date.now();
    client.engine.catchUp();
    await pause(100);
    client.engine.catchUp();
    await pause(100);
    client.engine.catchUp();
    await waitUntil(() => sync(client).state === 'live');
    // #then: a timeout armed again on each return would end it 500 ms after the start.
    expect(Date.now() - started).toBeLessThan(450);
  });
  test('a role change with no party change asks with a new nonce', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    client.platform.setRole('PLAYER', { rejoin: false });
    await waitUntil(() => requestsOf(room, 'gm-a').length === 2);
    // #then
    expect(new Set(requestsOf(room, 'gm-a')).size).toBe(2);
  });
  test('a role change asks with a new nonce and drops the parts of the old answer', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const client = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 1500 } });
    const old = lastRequest(room, 'gm-b');
    room.post(GHOST, stateMessage(old, [], 1, 2));
    // #when
    client.platform.setRole('PLAYER');
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);
    room.post(GHOST, stateMessage(old, [], 2, 2));
    await pause(50);
    // #then
    expect({ fresh: lastRequest(room, 'gm-b') !== old, sync: sync(client).state }).toEqual({
      fresh: true,
      sync: 'catching-up',
    });
  });
  test('a higher generation from a GM asks with a new nonce, once per generation', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    const client = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 1500 } });
    const old = lastRequest(room, 'gm-b');
    const higher = { n: 1, a: 'imp' };
    // #when
    room.post(GHOST, commit([sheet('liza', 1, GHOST)], higher));
    room.post(GHOST, commit([sheet('nika', 1, GHOST)], higher));
    await waitUntil(() => requestsOf(room, 'gm-b').length === 2);
    await pause(50);
    // #then
    expect({
      requests: requestsOf(room, 'gm-b').length,
      fresh: lastRequest(room, 'gm-b') !== old,
      merged: shown(client, 'blk:liza'),
      sync: sync(client).state,
    }).toEqual({ requests: 2, fresh: true, merged: undefined, sync: 'catching-up' });
  });
});

describe('pending queue', () => {
  test('a queued GM command gets one answered outcome when replay applies it', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    const id = send(client, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(client, 'blk:brok') !== undefined);
    // #when
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);
    await pause(10);
    // #then
    expect({
      outcome: outcome(client, id),
      answers: client.local.filter(
        (message) =>
          (Object(message).t === 'command-done' || Object(message).t === 'command-rejected') &&
          Object(message).id === id,
      ).length,
    }).toEqual({ outcome: { kind: 'answered', answer: undefined }, answers: 1 });
  });
  test('a GM edit shows at once, is not saved or sent, and takes c on exit', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    // #when
    send(client, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(client, 'blk:brok') !== undefined);

    const during = {
      shown: shown(client, 'blk:brok')?.d,
      stored: storedRecord(client, 'blk:brok'),
      commits: heardOf(room, 'gm-a', 'commit'),
    };

    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);

    // #then
    const written: VersionedRecord = {
      k: 'blk:brok',
      d: { set: 'pc', order: 0, cells: { str: [12, 2, 'gm-a'] } },
      c: 2,
      a: 'gm-a',
      l: [1, 'seed'],
    };

    expect({
      during,
      after: {
        shown: shown(client, written.k),
        stored: storedRecord(client, written.k),
        commits: heardOf(room, 'gm-a', 'commit'),
      },
    }).toEqual({
      during: {
        shown: { set: 'pc', order: 0, cells: { str: [12, 2, 'gm-a'] } },
        stored: BROK,
        commits: [],
      },
      after: { shown: written, stored: written, commits: [commit([written])] },
    });
  });
  test('two edits of one row combine into one entry, and both fields apply with one version', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    // #when
    send(client, patch(ROW_STR, 'str', 12));
    send(client, patch(ROW_STR, 'str_tired', true));
    send(client, patch(ROW_STR, 'str', 14));
    await waitUntil(() => shown(client, 'blk:brok')?.d !== undefined);
    await waitUntil(() => JSON.stringify(shown(client, 'blk:brok')?.d).includes('14'));
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length === 1);
    // #then
    expect(heardOf(room, 'gm-a', 'commit')).toEqual([
      commit([
        {
          k: 'blk:brok',
          d: {
            set: 'pc',
            order: 0,
            cells: { str: [14, 2, 'gm-a'], str_tired: [true, 2, 'gm-a'] },
          },
          c: 2,
          a: 'gm-a',
          l: [1, 'seed'],
        },
      ]),
    ]);
  });
  test('a create shows its sheet at once, and create, rename, patch and block add replay in order', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    // #when
    send(client, { type: 'sheet-create', sheetId: 'liza', set: 'pc' });
    await waitUntil(() => shown(client, 'blk:liza') !== undefined);
    const createdAtOnce = shown(client, 'blk:liza')?.d;
    send(client, {
      type: 'field-patch',
      sheetId: 'liza',
      target: ROW_NAME,
      fieldId: 'name',
      value: 'Лиза Смелая',
    });
    send(client, {
      type: 'field-patch',
      sheetId: 'liza',
      target: ROW_NOTES,
      fieldId: 'notes',
      value: 'Лучница',
    });
    send(client, {
      type: 'repeat-block-add',
      sheetId: 'liza',
      sectionId: 'attack',
      instanceId: 'i1',
    });
    await waitUntil(() => shown(client, 'blk:liza:attack:i1') !== undefined);
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(() => sync(client).state === 'live');
    await waitUntil(() => heardOf(room, 'gm-a', 'commit').length > 0);

    // #then
    const keys = heardOf(room, 'gm-a', 'commit').flatMap((message) =>
      recordSchema
        .array()
        .parse(Object(message).records)
        .map((record) => [record.k, record.c]),
    );

    expect({
      createdAtOnce,
      sheet: storedRecord(client, 'blk:liza')?.d,
      name: storedRecord(client, 'blk:liza')?.d,
      notes: storedRecord(client, 'blk:liza')?.d,
      block: storedRecord(client, 'blk:liza:attack:i1')?.d,
      keys,
    }).toEqual({
      createdAtOnce: { set: 'pc', order: 1, cells: {} },
      sheet: {
        set: 'pc',
        order: 1,
        cells: {
          name: ['Лиза Смелая', 2, 'gm-a'],
          notes: ['Лучница', 2, 'gm-a'],
        },
      },
      name: {
        set: 'pc',
        order: 1,
        cells: {
          name: ['Лиза Смелая', 2, 'gm-a'],
          notes: ['Лучница', 2, 'gm-a'],
        },
      },
      notes: {
        set: 'pc',
        order: 1,
        cells: {
          name: ['Лиза Смелая', 2, 'gm-a'],
          notes: ['Лучница', 2, 'gm-a'],
        },
      },
      block: { order: 0, cells: {} },
      keys: [
        ['blk:liza', 2],
        ['blk:liza:attack:i1', 1],
      ],
    });
  });
  test('an intent the pending view refuses is rejected at once, and so is a preset upload', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    // #when
    const unknown = send(client, patch(ROW_STR, 'nope', 1));

    const upload = send(client, {
      type: 'preset-upload',
      data: encodePreset(PRESET),
      expectedCount: 0,
      expectedSheets: 0,
      expectedDigest: '811c9dc5',
    });

    await waitUntil(
      () => outcome(client, unknown) !== undefined && outcome(client, upload) !== undefined,
    );
    // #then
    expect({
      unknown: rejection(client, unknown),
      upload: rejection(client, upload),
      sync: sync(client).state,
    }).toEqual({ unknown: 'unknown-field', upload: 'catching-up', sync: 'catching-up' });
  });
  test('a replay refusal sends a rejection with the original command id', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    const sent = send(client, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(client, 'blk:brok') !== undefined);
    // #when: another GM deleted Брок while this client was away.
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), [fixturePatch(BROK, null, 5, GHOST)]));
    await waitUntil(() => rejection(client, sent) !== undefined);
    // #then
    expect({
      reason: rejection(client, sent),
      outcome: outcome(client, sent),
      answers: client.local.filter(
        (message) =>
          (Object(message).t === 'command-done' || Object(message).t === 'command-rejected') &&
          Object(message).id === sent,
      ).length,
      stored: storedRecord(client, 'blk:brok'),
      commits: heardOf(room, 'gm-a', 'commit'),
    }).toEqual({
      reason: 'deleted-sheet',
      outcome: {
        kind: 'refused',
        rejection: { t: 'command-rejected', id: sent, reason: 'deleted-sheet' },
      },
      answers: 1,
      stored: fixturePatch(BROK, null, 5, GHOST),
      commits: [],
    });
  });
  test('a key that leaves the pending view shows its replica record again while catching up', async () => {
    // #given
    const seededStr: VersionedRecord = {
      k: 'blk:brok',
      d: { order: 0, cells: { str: [3, 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, BROK, seededStr],
      timing: { catchUpTimeoutMs: 1500 },
      until: 'live',
    });

    room.join(GHOST, 'GM');
    client.engine.catchUp();
    await waitUntil(() => requestsOf(room, 'gm-a').length === 2);
    send(client, patch(ROW_STR, 'str', 12));
    await waitUntil(() => JSON.stringify(shown(client, 'blk:brok')?.d).includes('12'));
    // #when: one part of two says another GM deleted Брок.
    room.post(
      GHOST,
      stateMessage(lastRequest(room, 'gm-a'), [fixturePatch(BROK, null, 5, GHOST)], 1, 2),
    );
    await waitUntil(() => shown(client, BROK.k)?.d === null);
    await pause(30);
    // #then
    expect({ str: shown(client, 'blk:brok'), sync: sync(client).state }).toEqual({
      str: fixturePatch(BROK, null, 5, GHOST),
      sync: 'catching-up',
    });
  });
  test('a closing page applies and sends the pending intents before its queues flush', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    send(client, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(client, 'blk:brok') !== undefined);
    // #when: well before the timeout, as a closing page has no time to wait.
    client.engine.flushNow();
    await pause(50);

    // #then
    const written: VersionedRecord = {
      k: 'blk:brok',
      d: { set: 'pc', order: 0, cells: { str: [12, 2, 'gm-a'] } },
      c: 2,
      a: 'gm-a',
      l: [1, 'seed'],
    };

    expect({
      stored: storedRecord(client, written.k),
      commits: heardOf(room, 'gm-a', 'commit'),
    }).toEqual({ stored: written, commits: [commit([written])] });
  });
  test('a GM made a player during catch-up gets not-allowed for each pending intent', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    const edit = send(client, patch(ROW_STR, 'str', 12));
    const create = send(client, { type: 'sheet-create', sheetId: 'liza', set: 'pc' });
    await waitUntil(() => shown(client, 'blk:liza') !== undefined);
    // #when
    client.platform.setRole('PLAYER');
    await waitUntil(() => requestsOf(room, 'gm-a').length === 3);
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-a'), []));
    await waitUntil(
      () => outcome(client, edit) !== undefined && outcome(client, create) !== undefined,
    );
    await pause(30);
    // #then
    expect({
      reasons: [rejection(client, edit), rejection(client, create)],
      outcomes: [outcome(client, edit), outcome(client, create)],
      shown: [shown(client, 'blk:brok'), shown(client, 'blk:liza')],
      stored: [storedRecord(client, 'blk:brok'), storedRecord(client, 'blk:liza')],
      commits: heardOf(room, 'gm-a', 'commit'),
    }).toEqual({
      reasons: ['not-allowed', 'not-allowed'],
      outcomes: [
        {
          kind: 'refused',
          rejection: { t: 'command-rejected', id: edit, reason: 'not-allowed' },
        },
        {
          kind: 'refused',
          rejection: { t: 'command-rejected', id: create, reason: 'not-allowed' },
        },
      ],
      shown: [BROK, undefined],
      stored: [BROK, null],
      commits: [],
    });
  });
  test('a window that opens during catch-up gets the pending view in its projection', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await catchingUpAgain(room, 'gm-a');
    send(client, patch(ROW_STR, 'str', 12));
    await waitUntil(() => shown(client, 'blk:brok') !== undefined);
    // #when
    const page = client.openWindow();
    const { store } = page;
    await waitUntil(() => store.$loaded.get());
    // #then
    expect(store.$records.get().get('blk:brok')?.d).toEqual({
      set: 'pc',
      order: 0,
      cells: { str: [12, 2, 'gm-a'] },
    });
  });
});

describe('role and generation', () => {
  test('a player made GM catches up and then persists every held record under its generation', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    room.post(GHOST, commit([PRESET_RECORD, BROK]));
    await waitUntil(() => shown(client, BROK.k) !== undefined);
    const storedAsPlayer = client.backing.keys();
    // #when
    client.platform.setRole('GM');
    await waitUntil(() => sync(client).state === 'catching-up');
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect({
      storedAsPlayer,
      stored: [storedRecord(client, 'preset'), storedRecord(client, BROK.k)],
    }).toEqual({ storedAsPlayer: [], stored: [PRESET_RECORD, BROK] });
  });
  test('a player made GM opens the highest generation in its storage', async () => {
    // #given
    const room = roomRig.openRoom();
    const higher = { n: 2, a: 'imp' };
    const liza = sheet('liza');
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    client.backing.set(storageKey(liza.k, { n: 2, a: 'imp' }), JSON.stringify(liza));
    // #when
    client.platform.setRole('GM');
    await waitUntil(() => requestsOf(room, 'player-p').length === 2);
    // The role change starts a new projection stream, so the window takes one more round trip.
    await waitUntil(() => shown(client, liza.k) !== undefined);
    // #then
    expect({
      liza: shown(client, liza.k),
      generation: Object(heardOf(room, 'player-p', 'state-request').at(-1)).g,
    }).toEqual({ liza, generation: higher });
  });
  test('a player at the initial generation takes the generation of the answer to its own request', async () => {
    // #given
    const room = roomRig.openRoom();
    const higher = { n: 2, a: 'imp' };
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 1500 },
    });

    // #when
    room.post(
      GHOST,
      stateMessage(lastRequest(room, 'player-p'), [PRESET_RECORD, BROK], 1, 1, higher),
    );
    await waitUntil(() => sync(client).state === 'live');
    room.post(GHOST, commit([sheet('liza', 1, GHOST)], higher));
    await waitUntil(() => shown(client, 'blk:liza') !== undefined);
    // #then
    expect({ brok: shown(client, BROK.k), stored: client.backing.keys() }).toEqual({
      brok: BROK,
      stored: [],
    });
  });
  test('a GM client adopts a complete state of a higher generation that answers its request', async () => {
    // #given
    const room = roomRig.openRoom();
    const higher = { n: 1, a: 'x' };
    const liza = sheet('liza');
    room.join(GHOST, 'GM');
    const client = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 1500 } });
    // #when
    room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), [liza], 1, 1, higher));
    await waitUntil(() => sync(client).state === 'live');
    // #then: the old generation's records are gone from the replica and the storage, and the new
    // generation keeps its marker.
    expect({
      liza: shown(client, liza.k),
      brok: shown(client, BROK.k) ?? null,
      stored: client.backing.keys().sort(),
    }).toEqual({
      liza,
      brok: null,
      stored: [
        storageKey('#generation', { n: 1, a: 'x' }),
        storageKey('blk:liza', { n: 1, a: 'x' }),
      ],
    });
  });
});

test('a complete answer ends the first catch-up, and the window learns it', async () => {
  // #given
  const room = roomRig.openRoom();
  room.join(GHOST, 'GM');
  const client = await startClient(room, 'gm-b', { timing: { catchUpTimeoutMs: 1500 } });
  const before = sync(client);
  // #when
  room.post(GHOST, stateMessage(lastRequest(room, 'gm-b'), []));
  await waitUntil(() => sync(client).state === 'live');
  // #then
  expect({ before, after: sync(client) }).toEqual({
    before: {
      state: 'catching-up',
      firstCatchUpDone: false,
      gmAnswered: false,
      gmLink: 'offline',
      role: 'GM',
    },
    after: { ...LIVE, gmAnswered: true, gmLink: 'online' },
  });
});

describe('player visibility', () => {
  // A row of the hidden single sheet "npc", whose sheet id is its template id.
  const skeletonHp: VersionedRecord = {
    k: 'blk:npc',
    d: { order: 0, cells: { hp: [7, 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  const brokStr: VersionedRecord = {
    k: 'blk:brok',
    d: { set: 'pc', order: 0, cells: { str: [14, 1, 'seed'] } },
    c: 1,
    a: 'seed',
    l: [1, 'seed'],
  };

  // A sheet of the hidden sheet set "mon", with its name row.
  const goblin: VersionedRecord = {
    k: 'blk:gob',
    d: { set: 'mon', order: 0, cells: {} },
    c: 1,
    a: GHOST,
    l: [1, 'seed'],
  };

  const goblinName: VersionedRecord = {
    k: 'blk:gob',
    d: { order: 0, cells: { title: ['Гоблин', 1, GHOST] } },
    c: 1,
    a: GHOST,
    l: [1, 'seed'],
  };

  const goblinWithName: VersionedRecord = {
    ...goblin,
    d: {
      set: 'mon',
      order: 0,
      cells: { title: ['Гоблин', 1, GHOST] },
    },
  };

  // A player that a GM answered with a sheet of the visible sheet set and the hidden single sheet.
  async function answeredPlayer(room: Room, catchUpTimeoutMs = 1500): Promise<Client> {
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs },
    });

    room.post(
      GHOST,
      stateMessage(lastRequest(room, 'player-p'), [PRESET_RECORD, brokStr, skeletonHp]),
    );
    await waitUntil(() => sync(client).state === 'live');

    return client;
  }

  test('a player window gets the preset and the visible sheets with their rows, and no hidden sheet', async () => {
    // #given
    const room = roomRig.openRoom();
    // #when
    const client = await answeredPlayer(room);
    // #then
    expect({
      keys: [...client.store.$records.get().keys()].sort(),
      sync: sync(client),
    }).toEqual({
      keys: ['blk:brok', 'preset'],
      sync: { ...LIVE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });
  test('a sheet a GM creates in a hidden sheet set, and a hidden single sheet edit, never reach a player window', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await answeredPlayer(room);
    const edited: VersionedRecord = fixturePatch(brokStr, { str: 16 }, 2, GHOST);
    // #when: the edit after the hidden ones shows that their commits were handled.
    room.post(GHOST, commit([goblinWithName]));
    room.post(GHOST, commit([fixturePatch(skeletonHp, { hp: 3 }, 2, GHOST)]));
    room.post(GHOST, commit([edited]));
    await waitUntil(() => shown(client, brokStr.k)?.c === 2);
    // #then
    expect([...client.store.$records.get().keys()].sort()).toEqual(['blk:brok', 'preset']);
  });
  test('a GM made a player gets a fresh projection with no hidden sheet in it', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, BROK, skeletonHp, goblinWithName],
      until: 'live',
    });

    const before = [shown(client, skeletonHp.k), shown(client, goblin.k)];
    // #when
    client.platform.setRole('PLAYER');
    await waitUntil(
      () => sync(client).role === 'PLAYER' && shown(client, skeletonHp.k) === undefined,
    );
    // #then
    expect({
      before,
      keys: [...client.store.$records.get().keys()].sort(),
    }).toEqual({ before: [skeletonHp, goblinWithName], keys: ['blk:brok', 'preset'] });
  });
  test('a player made GM gets a fresh projection with the hidden sheets in it', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await answeredPlayer(room);
    // #when
    client.platform.setRole('GM');
    await waitUntil(() => sync(client).role === 'GM' && shown(client, skeletonHp.k) !== undefined);
    // #then
    expect(shown(client, skeletonHp.k)).toEqual(skeletonHp);
  });
  test('a demoted player does not persist a later room commit', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    client.platform.setRole('PLAYER');
    await waitUntil(() => sync(client).role === 'PLAYER');
    const changed: VersionedRecord = { ...BROK, c: 2, a: GHOST };
    // #when
    room.post(GHOST, commit([changed]));
    await waitUntil(() => shown(client, BROK.k)?.c === 2);
    // #then
    expect(storedRecord(client, BROK.k)).toEqual(BROK);
  });
  test('a failed storage probe on promotion keeps persistence disabled and shows the notice', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
    });

    client.platform.setFailingStorageOperations(['list']);
    // #when
    client.platform.setRole('GM');
    await waitUntil(() => sync(client).role === 'GM');
    await pause(30);
    // #then
    expect(client.store.$notices.get()).toEqual(['local-save-failed']);
  });
  test('re-reads its role on a party change even without a role-change event', async () => {
    // #given
    const room = roomRig.openRoom();
    let currentRole: PlayerRole = 'GM';

    const client = await startClient(room, 'gm-a', {
      platform: (platform) => ({
        ...platform,
        player: { ...platform.player, getRole: () => Promise.resolve(currentRole) },
      }),
      until: 'live',
    });

    currentRole = 'PLAYER';
    // #when
    room.join('new-player', 'PLAYER');
    await pause(30);
    // #then
    expect(sync(client).role).toBe('PLAYER');
  });
  test('keeps the newest result when two role reads resolve out of order', async () => {
    // #given
    const room = roomRig.openRoom();
    const reads: ((role: PlayerRole) => void)[] = [];
    let initial = true;

    const client = await startClient(room, 'gm-a', {
      platform: (platform) => ({
        ...platform,
        player: {
          ...platform.player,
          getRole: () => {
            if (initial) {
              initial = false;

              return Promise.resolve('GM');
            }

            return new Promise<PlayerRole>((resolve) => {
              reads.push(resolve);
            });
          },
        },
      }),
      until: 'live',
    });

    room.join('first-change', 'PLAYER');
    await waitUntil(() => reads.length === 1);
    room.join('second-change', 'PLAYER');
    await waitUntil(() => reads.length === 2);
    // #when
    reads[1]?.('PLAYER');
    await waitUntil(() => sync(client).role === 'PLAYER');
    reads[0]?.('GM');
    await pause(30);
    // #then
    expect(sync(client).role).toBe('PLAYER');
  });
  test('persists promotion data once, not on every later catch-up', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await answeredPlayer(room, 100);
    client.platform.setRole('GM');
    await waitUntil(() => sync(client).role === 'GM' && sync(client).state === 'live');
    await waitUntil(() => storedRecord(client, BROK.k) !== undefined);
    const changed: VersionedRecord = { ...BROK, c: 2, a: GHOST };
    room.post(GHOST, commit([changed]));
    await waitUntil(() => shown(client, BROK.k)?.c === 2);
    client.backing.set(storageKey(BROK.k), JSON.stringify(BROK));
    client.platform.setFailingStorageOperations(['write']);
    // #when
    client.engine.catchUp();
    await waitUntil(() => sync(client).state === 'catching-up');
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect(client.store.$notices.get()).toEqual([]);
  });
  test('keeps an empty adopted generation when a promoted client restarts', async () => {
    // #given
    const room = roomRig.openRoom();
    const generation: Generation = { n: 1, a: GHOST };
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
    });

    room.post(GHOST, { v: 4, g: generation, t: 'reset' });
    await waitUntil(() => sync(client).state === 'catching-up');
    room.post(GHOST, stateMessage(lastRequest(room, 'player-p'), [], 1, 1, generation));
    await waitUntil(() => sync(client).state === 'live');
    client.platform.setRole('GM');
    await waitUntil(() => sync(client).role === 'GM' && sync(client).state === 'live');
    await pause(20);
    const marker = generationMarkerKey(client.platform.metadata.getRoomId(), generation);
    expect(marker.isOk() ? client.backing.get(marker.value) : null).toBe('1');
    room.room.leave(GHOST);
    await pause(20);
    client.engine.stop();
    await client.startEngine();
    // #when
    const id = send(client, { type: 'wipe' });
    await waitUntil(() => outcome(client, id) !== undefined);
    await waitUntil(() => heardOf(room, 'player-p', 'reset').length === 1);
    // #then
    expect(Object(heardOf(room, 'player-p', 'reset')[0]).g).toEqual({ n: 2, a: 'player-p' });
  });
  test('a catch-up that ends by timeout leaves gmAnswered false', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    // #when
    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    // #then
    expect(sync(client)).toEqual({ ...LIVE, role: 'PLAYER' });
  });
  test('a two-part answer with rows before their sheets shows the visible rows and no hidden record', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 1500 },
    });

    const r = lastRequest(room, 'player-p');

    const skeletonLink: VersionedRecord = {
      k: 'link:token-2',
      d: { s: 'npc', c: 'token' },
      c: 1,
      a: 'seed',
    };

    // #when: the first part holds the rows, the second their sheets.
    room.post(GHOST, stateMessage(r, [skeletonHp, skeletonLink, goblinName, brokStr], 1, 2));
    room.post(GHOST, stateMessage(r, [PRESET_RECORD, goblin, BROK], 2, 2));
    await waitUntil(() => sync(client).state === 'live');
    await waitUntil(() => shown(client, brokStr.k) !== undefined);
    // #then
    expect([...client.store.$records.get().keys()].sort()).toEqual(['blk:brok', 'preset']);
  });
  test('a link that a GM points from a visible sheet to a hidden one leaves the player window', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 1500 },
    });

    const link: VersionedRecord = {
      k: 'link:token-1',
      d: { s: 'brok', c: 'token' },
      c: 1,
      a: 'seed',
    };

    room.post(
      GHOST,
      stateMessage(lastRequest(room, 'player-p'), [PRESET_RECORD, brokStr, skeletonHp, link]),
    );
    await waitUntil(() => shown(client, link.k) !== undefined);
    // #when: the edit after the link shows that the link commit was handled.
    room.post(GHOST, commit([fixturePatch(link, { s: 'npc', c: 'token' }, 2, GHOST)]));
    room.post(GHOST, commit([fixturePatch(brokStr, { str: 16 }, 2, GHOST)]));
    await waitUntil(() => shown(client, brokStr.k)?.c === 2);
    // #then
    expect(shown(client, link.k)).toBeUndefined();
  });
  test('gmAnswered stays true during and after a later catch-up that times out', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await answeredPlayer(room, 300);
    // #when
    client.engine.catchUp();
    await waitUntil(() => sync(client).state === 'catching-up');
    const during = sync(client).gmAnswered;
    await waitUntil(() => sync(client).state === 'live');
    // #then
    expect({ during, after: sync(client).gmAnswered }).toEqual({ during: true, after: true });
  });
  test('a catch-up answered after an earlier one timed out sets gmAnswered', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    const before = sync(client).gmAnswered;
    // #when
    client.engine.catchUp();
    await waitUntil(() => requestsOf(room, 'player-p').length === 2);
    room.post(GHOST, stateMessage(lastRequest(room, 'player-p'), [PRESET_RECORD]));
    await waitUntil(() => sync(client).gmAnswered);
    // #then
    expect({ before, after: sync(client) }).toEqual({
      before: false,
      after: { ...LIVE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });
  test('a complete answer that comes after the timeout sets gmAnswered', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    const before = sync(client).gmAnswered;
    // #when
    room.post(GHOST, stateMessage(lastRequest(room, 'player-p'), [PRESET_RECORD]));
    await waitUntil(() => sync(client).gmAnswered);
    // #then
    expect({ before, preset: shown(client, 'preset'), sync: sync(client) }).toEqual({
      before: false,
      preset: PRESET_RECORD,
      sync: { ...LIVE, gmAnswered: true, gmLink: 'online', role: 'PLAYER' },
    });
  });
});
