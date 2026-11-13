import { describe, expect, spyOn, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { MockStorageBacking } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  copyValue,
  createRoomRig,
  heardOf,
  outcome,
  pause,
  rejection,
  roomCopyOf,
  send,
  storageKey,
  type RigClient,
  type RigRoom,
} from '@/replica/room-rig';

// The strings and keys of the spec, written out by hand.
const DATA_REPLACED = 'Данные комнаты заменены';
const KEY = 'app.muster-roll/snapshot';
const OLD_PREFIX = storageKey('', { n: 0, a: '' });
const INITIAL: Generation = { n: 0, a: '' };
const WIPED: Generation = { n: 1, a: 'gm-a' };
const GHOST = 'ghost-gm';

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
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK: VersionedRecord = { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' };
const BROK_STR: VersionedRecord = { k: 'row:brok:str', d: { str: 10 }, c: 3, a: 'seed' };
const ACL: VersionedRecord = { k: 'acl:brok:player-p', d: { name: 'Лиза' }, c: 2, a: 'seed' };
const ROOM: readonly VersionedRecord[] = [PRESET_RECORD, BROK, BROK_STR, ACL];

// Keys of storage format 1 for this room and for another one, as an older build left them.
const OTHER_ROOM_KEY = storageKey('preset', { n: 0, a: '' }, { roomId: 'other-room', format: 1 });
const OTHER_ROOM_VALUE = '{"k":"preset","d":"x","c":1,"a":"seed"}';

const FORMAT_1 = {
  [storageKey('preset', { n: 0, a: '' }, { format: 1 })]: '{"k":"preset","d":"x","c":1,"a":"seed"}',
  [storageKey('sheet:brok', { n: 0, a: '' }, { format: 1 })]:
    '{"k":"sheet:brok","d":{"kind":"pc"},"c":1,"a":"seed"}',
  [OTHER_ROOM_KEY]: OTHER_ROOM_VALUE,
} satisfies Readonly<Record<string, string>>;

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  // Raw storage entries next to the seeded records, as another build or generation left them.
  entries?: Readonly<Record<string, string>>;
  // The storage of an earlier run, for a reload.
  backing?: MockStorageBacking;
  timing?: Partial<Timing>;
  until?: 'loaded' | 'live';
};

type Client = RigClient;

type Room = RigRoom & {
  // What happened in the room, in order: `copy` for a room copy write, and each `t` heard.
};

const roomRig = createRoomRig({
  waitLimitMs: 3000,
  seeded: ROOM,
  timing: {
    catchUpTimeoutMs: 150,
    stateAnswerDelayMaxMs: 5,
    incompleteRequestStartMs: 60,
    incompleteRequestMaxMs: 240,
  },
});

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  return roomRig.startClient(room, connectionId, {
    ...options,
    engine: { random: () => 0, dataReplaced: DATA_REPLACED },
  });
}

// The window's outcome from the wipe, reduced to the value these tests inspect.
async function wipe(client: Client): Promise<JsonValue> {
  const id = send(client, { type: 'wipe' });

  await roomRig.waitUntil(() => outcome(client, id) !== undefined);

  const reason = rejection(client, id);

  const kind = outcome(client, id)?.kind;

  if (reason !== undefined) {
    return { kind: 'refused', reason };
  }

  if (kind === undefined) {
    throw new Error('the wipe has no outcome');
  }

  return { kind };
}

function shownKeys(client: Client): string[] {
  return [...client.store.$records.get().keys()].sort();
}

function roomKeys(client: Client): string[] {
  return client.backing
    .keys()
    .filter(
      (key) =>
        key.startsWith(storageKey('', INITIAL, { format: 1 }).slice(0, -3)) ||
        key.startsWith(storageKey('', INITIAL).slice(0, -3)),
    )
    .sort();
}

describe('a wipe', () => {
  test('empties the room in a new generation, writes its empty copy over an older-format one, then sends reset and answers', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD], 1) });

    const gm = await startClient(room, 'gm-a', { until: 'live' });
    const eventsBefore = room.events.length;

    // #when
    const answer = await wipe(gm);

    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    // The window asks for the new engine's projection, which reaches it after the answer.
    await roomRig.waitUntil(() => shownKeys(gm).length === 0);

    // #then
    expect({
      answer,
      shown: shownKeys(gm),
      copy: roomCopyOf(room),
      events: room.events.slice(eventsBefore).filter((one) => one === 'copy' || one === 'reset'),
      reset: heardOf(room, 'gm-a', 'reset'),
    }).toEqual({
      answer: { kind: 'answered' },
      shown: [],
      copy: { v: 3, g: WIPED, records: [] },
      events: ['copy', 'reset'],
      reset: [{ v: 3, g: WIPED, t: 'reset' }],
    });
  });

  test('takes the older-format notice away', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);

    const room = roomRig.openRoom();

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD], 1) });

    const gm = await startClient(room, 'gm-a', { until: 'live' });
    const before = gm.store.$notices.get();

    // #when
    await wipe(gm);
    // The delta with the notices reaches the window after the answer.
    await pause(30);

    // #then
    expect({ before, after: gm.store.$notices.get() }).toEqual({
      before: ['room-copy-older-format'],
      after: [],
    });
  });

  test("deletes this room's keys of every format and generation, and leaves other rooms' keys", async () => {
    // #given: keys of format 1, and the records of generation 0.
    const room = roomRig.openRoom();

    const gm = await startClient(room, 'gm-a', { entries: FORMAT_1, until: 'live' });

    // #when
    await wipe(gm);
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);

    // #then
    expect({ room: roomKeys(gm), other: gm.backing.get(OTHER_ROOM_KEY) }).toEqual({
      room: [storageKey('#generation', WIPED)],
      other: OTHER_ROOM_VALUE,
    });
  });

  test('keeps its empty generation over a reload with no room copy', async () => {
    // #given: the copy is gone, so only the stored marker can name generation 1.
    const room = roomRig.openRoom();
    const first = await startClient(room, 'gm-a', { until: 'live' });

    await wipe(first);
    await roomRig.waitUntil(() => heardOf(room, 'gm-a', 'reset').length === 1);
    first.engine.stop();
    room.room.setMetadata({ [KEY]: undefined });

    // #when
    const reloaded = await startClient(room, 'gm-a', {
      backing: first.backing,
      seeded: [],
      until: 'live',
    });

    // The copy it writes names the generation it loaded.
    reloaded.engine.pageHidden();
    await roomRig.waitUntil(() => roomCopyOf(room) !== null);

    // #then
    expect({ shown: shownKeys(reloaded), copy: roomCopyOf(room) }).toEqual({
      shown: [],
      copy: { v: 3, g: WIPED, records: [] },
    });
  });

  test('another GM adopts the empty room, drops its own older-format keys and is notified', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });
    const other = await startClient(room, 'gm-b', { entries: FORMAT_1, until: 'live' });

    // #when
    await wipe(gm);
    await roomRig.waitUntil(
      () =>
        shownKeys(other).length === 0 &&
        other.store.$sync.get().state === 'live' &&
        roomKeys(other).every((key) => !key.startsWith(OLD_PREFIX)),
    );

    // #then
    expect({
      keys: roomKeys(other),
      other: other.backing.get(OTHER_ROOM_KEY),
      notified: other.platform.shownNotifications(),
    }).toEqual({
      keys: [storageKey('#generation', WIPED)],
      other: OTHER_ROOM_VALUE,
      notified: [DATA_REPLACED],
    });
  });

  test('a player sees an empty room', async () => {
    // #given
    const room = roomRig.openRoom();
    const gm = await startClient(room, 'gm-a', { until: 'live' });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
    });

    await roomRig.waitUntil(() => shownKeys(player).includes(BROK.k));

    // #when
    await wipe(gm);
    await roomRig.waitUntil(() => shownKeys(player).length === 0);

    // #then
    expect({
      shown: shownKeys(player),
      notified: player.platform.shownNotifications(),
    }).toEqual({ shown: [], notified: [DATA_REPLACED] });
  });

  test('is refused while the GM client is catching up', async () => {
    // #given: another GM that never answers keeps the catch-up open.
    const room = roomRig.openRoom();

    room.join(GHOST, 'GM');

    const gm = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 2000 } });

    // #when
    const answer = await wipe(gm);

    // #then
    expect({ reason: Object(answer).reason, shown: shownKeys(gm) }).toEqual({
      reason: 'catching-up',
      shown: [ACL.k, PRESET_RECORD.k, BROK_STR.k, BROK.k],
    });
  });

  test("is refused to a player's window", async () => {
    // #given
    const room = roomRig.openRoom();

    await startClient(room, 'gm-a', { until: 'live' });

    const player = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      until: 'live',
    });

    // #when
    const answer = await wipe(player);

    // #then
    expect({ reason: Object(answer).reason, resets: heardOf(room, 'player-p', 'reset') }).toEqual({
      reason: 'not-allowed',
      resets: [],
    });
  });
});
