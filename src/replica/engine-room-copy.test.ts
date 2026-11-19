import { fixtureRecord } from '../../tests/support/block-fixtures';
import { describe, expect, spyOn, test } from 'bun:test';
import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import { NOTHING_ERASED } from '@/core/preset-migrate';
import { blockDataSchema, type VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { WireCommand, Notice, RoomCopyStatus } from '@/core/ui-messages';
import type { MockPlatform } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  copyValue,
  createRoomRig,
  pause,
  roomCopyOf,
  send,
  shown,
  storageKey,
  storedRecord,
  type RigClient,
  type RigRoom,
  waitUntil,
} from '../../tests/support/room-rig';

// Short enough to see the write, long enough to see that nothing was written before it.
const SHORT_PAUSE: Partial<Timing> = { snapshotPauseMs: 60, snapshotJitterMs: 0 };

// The key and the limit of the 2.5 spec, written out by hand.
const KEY = 'app.muster-roll/snapshot';
const LIMIT = 15500;
const INITIAL: Generation = { n: 0, a: '' };
const HIGHER: Generation = { n: 1, a: 'importer' };
const GHOST = 'ghost-gm';
const ROW_STR = { kind: 'row', rowId: 'str' } as const;

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
                { cells: [{ kind: 'field', type: 'text', id: 'name' }] },
                { cells: [{ kind: 'field', type: 'number', id: 'str' }] },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'npc',

      title: 'NPC',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' };
const BROK = sheet('brok');
const MIRA = sheet('mira', 1);
const GONE: VersionedRecord = { k: 'link:token-1', d: null, c: 4, a: 'seed' };
const ACL: VersionedRecord = { k: 'acl:brok:p1', d: { name: 'Лиза' }, c: 2, a: 'seed' };

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  timing?: Partial<Timing>;
  until?: 'loaded' | 'live';
  platform?: (platform: MockPlatform) => MockPlatform;
  random?: () => number;
};

type Client = RigClient;

type Room = RigRoom;

// Calls to the metadata port, so a test can hold a read, drop a write or have it fail.
type MetadataGate = {
  writes: number;
  // Resolves the next read only when the test releases it.
  heldRead: Promise<void> | null;
  holdNextRead: () => {
    release: () => void;
  };
  dropWrites: boolean;
  rejectWrites: boolean;
};

function sheet(id: string, order = 0, c = 1, a = 'seed'): VersionedRecord {
  return { k: `blk:${id}`, d: { set: 'pc', order, cells: {} }, c, a, l: [1, 'seed'] };
}

function brokWithStr(value: number, c: number, a: string): VersionedRecord {
  return {
    k: 'blk:brok',
    d: { set: 'pc', order: 0, cells: { str: [value, c, a] } },
    c,
    a,
    l: [1, 'seed'],
  };
}

const roomRig = createRoomRig({
  seeded: [PRESET_RECORD, BROK],
  timing: { stateAnswerDelayMaxMs: 5 },
});

function gated(gate: MetadataGate): (platform: MockPlatform) => MockPlatform {
  return (platform) => ({
    ...platform,
    metadata: {
      ...platform.metadata,
      getMetadata: async () => {
        const held = gate.heldRead;
        gate.heldRead = null;
        await held;

        return platform.metadata.getMetadata();
      },
      setMetadata: (update) => {
        gate.writes += 1;

        if (gate.rejectWrites) {
          return Promise.reject(new Error('metadata write failed'));
        }

        // Owlbear reports success for a write it drops.
        return gate.dropWrites ? Promise.resolve() : platform.metadata.setMetadata(update);
      },
    },
  });
}

function createGate(): MetadataGate {
  const gate: MetadataGate = {
    writes: 0,
    heldRead: null,
    dropWrites: false,
    rejectWrites: false,
    holdNextRead: () => {
      let release = (): void => undefined;
      gate.heldRead = new Promise((resolve) => {
        release = resolve;
      });

      return { release };
    },
  };

  return gate;
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  return roomRig.startClient(room, connectionId, {
    ...options,
    engine: { random: options.random ?? (() => 0) },
  });
}

function setStr(value: number): WireCommand {
  return { type: 'field-patch', sheetId: 'brok', target: ROW_STR, fieldId: 'str', value };
}

function notices(client: Client): readonly Notice[] {
  return client.store.$notices.get();
}

function roomCopyStatus(client: Client): RoomCopyStatus {
  return client.store.$roomCopy.get();
}

function requestsOf(room: Room, from: string): JsonValue[] {
  return room.heard.flatMap((message) =>
    message.from === from && Object(message.data).t === 'state-request' ? [message.data] : [],
  );
}

function metadataBytes(room: Room): number {
  return new TextEncoder().encode(JSON.stringify(room.room.getMetadata())).length;
}

// Lets every promise that is already settled run its handlers.
async function settle(): Promise<void> {
  await pause(0);
}

describe('writer triggers', () => {
  test('a failed multi-record command does not owe an unchanged room-copy write', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);
    const room = roomRig.openRoom();
    const gate = createGate();

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      seeded: [PRESET_RECORD, brokWithStr(12, 1, 'seed'), ACL],
      timing: { snapshotPauseMs: 10 },
      until: 'live',
    });

    client.platform.setFailingStorageOperations(['write']);
    gate.rejectWrites = true;
    // #when
    send(client, { type: 'sheet-delete', sheetId: 'brok' });
    await waitUntil(() => notices(client).includes('local-save-failed'));
    await pause(50);
    // #then
    expect({ writes: gate.writes, notices: notices(client) }).toEqual({
      writes: 0,
      notices: ['local-save-failed'],
    });
  });
  test('catch-up with no replayed records does not owe an unchanged room-copy write', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);
    const room = roomRig.openRoom();
    const gate = createGate();

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { snapshotPauseMs: 10 },
      until: 'live',
    });

    gate.rejectWrites = true;
    // #when
    client.engine.catchUp();
    await pause(50);
    // #then
    expect({ writes: gate.writes, notices: notices(client) }).toEqual({
      writes: 0,
      notices: [],
    });
  });
  test('a failed preset batch does not owe an unchanged room-copy write', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);
    const room = roomRig.openRoom();
    const gate = createGate();

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { snapshotPauseMs: 10 },
      until: 'live',
    });

    const renamed: Preset = {
      ...PRESET,
      templates: PRESET.templates.map((template) =>
        template.id === 'pc' ? { ...template, title: 'Герои' } : template,
      ),
    };

    client.platform.setFailingStorageOperations(['write']);
    gate.rejectWrites = true;
    // #when
    send(client, {
      type: 'preset-upload',
      data: encodePreset(renamed),
      expectedCount: 0,
      expectedSheets: 0,
      expectedDigest: NOTHING_ERASED,
    });
    await waitUntil(() => notices(client).includes('local-save-failed'));
    await pause(50);
    // #then
    expect({ writes: gate.writes, notices: notices(client) }).toEqual({
      writes: 0,
      notices: ['local-save-failed'],
    });
  });
  test('a live GM writes every record with its tombstones, versions and generation, sorted by key, once edits pause', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, MIRA, BROK, GONE, ACL],
      timing: SHORT_PAUSE,
      until: 'live',
    });

    // #when
    send(client, setStr(14));
    await waitUntil(() => shown(client, 'blk:brok') !== undefined);
    const beforePause = roomCopyOf(room);
    await waitUntil(() => roomCopyOf(room) !== null);
    // #then
    expect({ beforePause, copy: roomCopyOf(room) }).toEqual({
      beforePause: null,
      copy: {
        v: 4,
        g: INITIAL,
        records: [ACL, brokWithStr(14, 2, 'gm-a'), MIRA, GONE, PRESET_RECORD],
      },
    });
  });
  test('each edit puts the write off by the whole pause again', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      timing: { snapshotPauseMs: 150, snapshotJitterMs: 0 },
      until: 'live',
    });

    // #when
    send(client, setStr(1));
    await pause(100);
    send(client, setStr(2));
    await pause(100);
    const midway = roomCopyOf(room);
    await waitUntil(() => roomCopyOf(room) !== null);
    // #then
    expect({ midway, written: roomCopyOf(room)?.records }).toEqual({
      midway: null,
      written: [brokWithStr(2, 3, 'gm-a'), PRESET_RECORD],
    });
  });
  test('a live GM writes at once when its page becomes hidden, with no edit and no pause', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    client.engine.pageHidden();
    await waitUntil(() => roomCopyOf(room) !== null);
    // #then
    expect(roomCopyOf(room)?.records).toEqual([BROK, PRESET_RECORD]);
  });
  test('a player never writes the room copy', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'player-p', { role: 'PLAYER', until: 'live' });
    // #when
    client.engine.pageHidden();
    await pause(50);
    // #then
    expect(room.room.getMetadata()).toEqual({});
  });
});

describe('writer read and merge', () => {
  test('merges a copy of its generation before it writes, so records from the copy stay', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });
    // #when
    client.engine.pageHidden();
    await waitUntil(
      () => roomCopyOf(room)?.records !== undefined && shown(client, MIRA.k) !== undefined,
    );
    // #then
    expect({
      copy: roomCopyOf(room)?.records,
      shown: shown(client, MIRA.k),
      saved: storedRecord(client, MIRA.k),
    }).toEqual({
      copy: [BROK, MIRA, PRESET_RECORD],
      shown: MIRA,
      saved: MIRA,
    });
  });
  test('a GM of a higher generation leaves a lower-generation copy unmerged and replaces it', async () => {
    // #given
    const room = roomRig.openRoom();
    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });
    // A new device: no stored record, so it takes the copy's generation at start.
    const client = await startClient(room, 'gm-a', { seeded: [], until: 'live' });
    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });
    // #when
    client.engine.pageHidden();
    await waitUntil(
      () =>
        Object(Object(roomCopyOf(room)).g).n === HIGHER.n &&
        Object(Object(roomCopyOf(room)).g).a === HIGHER.a,
    );
    // #then
    expect({ copy: roomCopyOf(room), mira: shown(client, MIRA.k) ?? null }).toEqual({
      copy: { v: 4, g: HIGHER, records: [BROK, PRESET_RECORD] },
      mira: null,
    });
  });
  test('a copy of a higher generation is not overwritten: the GM adopts it in place of its own data', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    const higher = copyValue(HIGHER, [PRESET_RECORD, MIRA]);
    room.join(GHOST, 'GM');
    room.room.setMetadata({ [KEY]: higher });
    await waitUntil(() => shown(client, MIRA.k) !== undefined);
    // #when
    client.engine.pageHidden();
    await settle();
    // #then
    expect({
      copy: room.room.getMetadata()[KEY],
      mira: shown(client, MIRA.k),
      brok: shown(client, BROK.k) ?? null,
    }).toEqual({ copy: higher, mira: MIRA, brok: null });
  });
  test.each<[string, JsonValue, Notice[]]>([
    ['a higher v', { v: 5, data: 'from a newer build' }, ['room-copy-not-saved', 'new-version']],
    ['data that does not decode', { v: 4, data: 'bm90IGRlZmxhdGU=' }, ['room-copy-not-saved']],
  ])(
    'a copy with %s stops the write, keeps the copy and raises its notices',
    async (_name, value, expectedNotices) => {
      // #given
      spyOn(console, 'error').mockImplementation(() => undefined);
      const room = roomRig.openRoom();
      const client = await startClient(room, 'gm-a', { until: 'live' });
      room.room.setMetadata({ [KEY]: value });
      // #when
      client.engine.pageHidden();
      await waitUntil(() => notices(client).includes('room-copy-not-saved'));
      // #then
      expect({
        copy: room.room.getMetadata()[KEY],
        status: roomCopyStatus(client).state,
        notices: notices(client),
      }).toEqual({ copy: value, status: 'failed', notices: expectedNotices });
    },
  );
});

// AD-12, CAP-31: no migration reads a copy of an older format. Only a wipe or an import replaces
// it.
describe('a room copy of an older format', () => {
  test.each([1, 2])(
    'format %i: a GM that reads it at catch-up shows the older-format notice and outcome older, and its writes never replace it',
    async (format) => {
      // #given
      spyOn(console, 'error').mockImplementation(() => undefined);
      const room = roomRig.openRoom();
      const gate = createGate();
      const older = copyValue(INITIAL, [MIRA], format);
      room.room.setMetadata({ [KEY]: older });

      const client = await startClient(room, 'gm-a', {
        platform: gated(gate),
        timing: SHORT_PAUSE,
        until: 'live',
      });

      // #when: an edit after the pause and a hidden page each try a write.
      send(client, setStr(14));
      client.engine.pageHidden();
      await waitUntil(() => shown(client, 'blk:brok') !== undefined);
      await pause(150);
      // #then
      expect({
        writes: gate.writes,
        copy: room.room.getMetadata()[KEY],
        notices: notices(client),
        status: roomCopyStatus(client),
        mira: shown(client, MIRA.k) ?? null,
      }).toEqual({
        writes: 0,
        copy: older,
        notices: ['room-copy-older-format'],
        status: expect.objectContaining({ state: 'none', outcome: 'older' }),
        mira: null,
      });
    },
  );
  test.each([1, 2])(
    'format %i: a player with no GM gets outcome older and no older-format notice',
    async (format) => {
      // #given
      spyOn(console, 'error').mockImplementation(() => undefined);
      const room = roomRig.openRoom();
      room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK], format) });

      // #when
      const client = await startClient(room, 'player-p', {
        role: 'PLAYER',
        seeded: [],
        timing: { catchUpTimeoutMs: 100 },
        until: 'live',
      });

      // #then
      expect({
        outcome: roomCopyStatus(client).outcome,
        notices: notices(client),
        brok: shown(client, BROK.k) ?? null,
      }).toEqual({ outcome: 'older', notices: [], brok: null });
    },
  );
});

describe('size check', () => {
  test('over the limit with all metadata counted, the write is skipped, the previous copy stays and the notice shows', async () => {
    // #given
    const room = roomRig.openRoom();
    const previous = copyValue(INITIAL, [PRESET_RECORD]);
    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(15400), [KEY]: previous });
    const client = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));
    // #then
    expect({ copy: room.room.getMetadata()[KEY], status: roomCopyStatus(client).state }).toEqual({
      copy: previous,
      status: 'failed',
    });
  });
});

describe('interruption and rescheduling', () => {
  test('a stopped GM does not merge a held equal-generation metadata read', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    const read = gate.holdNextRead();
    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK, MIRA]) });
    client.engine.catchUp();
    await settle();
    // #when
    client.engine.stop();
    read.release();
    await pause(20);
    // #then
    expect({
      mira: shown(client, MIRA.k) ?? null,
      stored: storedRecord(client, MIRA.k),
      writes: gate.writes,
    }).toEqual({
      mira: null,
      stored: null,
      writes: 0,
    });
  });
  test('a live GM merges the same held equal-generation metadata read', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    const read = gate.holdNextRead();
    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK, MIRA]) });
    client.engine.catchUp();
    await settle();
    // #when
    read.release();
    await waitUntil(() => shown(client, MIRA.k) !== undefined);
    // #then
    expect({ mira: shown(client, MIRA.k), stored: storedRecord(client, MIRA.k) }).toEqual({
      mira: MIRA,
      stored: MIRA,
    });
  });
  test('a resume between the read and the write stops the write, also once the GM is live again', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    // Alone, so the resume's catch-up ends before the read returns: only the page change can stop
    // the write.
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    const read = gate.holdNextRead();
    client.engine.pageHidden();
    await settle();
    // #when
    client.engine.catchUp();
    await waitUntil(() => requestsOf(room, 'gm-a').length === 2);
    await pause(20);
    read.release();
    await settle();
    // #then
    expect(gate.writes).toBe(0);
  });
  test('a hidden page during a pause write stops that write and writes on its own', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    const read = gate.holdNextRead();
    client.engine.pageHidden();
    await settle();
    // #when
    client.engine.pageHidden();
    read.release();
    await waitUntil(() => roomCopyOf(room) !== null);
    await settle();
    // #then
    expect(gate.writes).toBe(1);
  });
  test('a stopped write is written again once catch-up ends', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { ...SHORT_PAUSE, catchUpTimeoutMs: 100 },
      until: 'live',
    });

    const read = gate.holdNextRead();
    client.engine.pageHidden();
    await settle();
    client.engine.catchUp();
    read.release();
    await settle();
    const afterStop = gate.writes;
    // #when
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await waitUntil(() => roomCopyOf(room) !== null);
    // #then
    expect({ afterStop, copy: roomCopyOf(room)?.records }).toEqual({
      afterStop: 0,
      copy: [BROK, PRESET_RECORD],
    });
  });
  test('a trigger during catch-up writes nothing then, and writes once catch-up ends', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { ...SHORT_PAUSE, catchUpTimeoutMs: 300 },
    });

    // #when
    client.engine.pageHidden();
    await pause(100);
    const during = { state: client.store.$sync.get().state, copy: roomCopyOf(room) };
    await waitUntil(() => roomCopyOf(room) !== null);
    // #then
    expect({ during, copy: roomCopyOf(room)?.records }).toEqual({
      during: { state: 'catching-up', copy: null },
      copy: [BROK, PRESET_RECORD],
    });
  });
});

describe('read-back', () => {
  test('a write the room dropped fails the read-back and raises the notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    gate.dropWrites = true;
    // #when
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));
    // #then
    expect({
      writes: gate.writes,
      copy: roomCopyOf(room),
      status: roomCopyStatus(client).state,
    }).toEqual({
      writes: 1,
      copy: null,
      status: 'failed',
    });
  });
  test('the next verified write clears the notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    gate.dropWrites = true;
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));
    gate.dropWrites = false;
    // #when
    client.engine.pageHidden();
    await waitUntil(() => !notices(client).includes('room-copy-not-saved'));
    // #then
    expect({ notices: notices(client), status: roomCopyStatus(client).state }).toEqual({
      notices: [],
      status: 'saved',
    });
  });
});

describe('catch-up merge', () => {
  test('a GM merges the copy before it broadcasts state-request on a later catch-up', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { catchUpTimeoutMs: 50 },
      until: 'live',
    });

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });
    // The stored records at the moment the second request goes out.
    let storedAtRequest: VersionedRecord | null | undefined;
    roomRig.cleanup(
      room.room.onRemote(SYNC_CHANNEL, 'listener', (event) => {
        if (Object(event.data).t === 'state-request' && storedAtRequest === undefined) {
          storedAtRequest = storedRecord(client, MIRA.k);
        }
      }),
    );
    // #when
    client.engine.catchUp();
    await waitUntil(() => storedAtRequest !== undefined);
    // #then
    expect(storedAtRequest).toEqual(MIRA);
  });
  test('a GM alone in the room merges the copy and leaves catching-up with no wait', async () => {
    // #given
    const room = roomRig.openRoom();
    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });
    // #when
    const client = await startClient(room, 'gm-a', { timing: { catchUpTimeoutMs: 1500 } });
    await waitUntil(() => client.store.$sync.get().state === 'live');
    // #then
    expect({ mira: shown(client, MIRA.k), brok: shown(client, BROK.k) }).toEqual({
      mira: MIRA,
      brok: BROK,
    });
  });
  test('a GM on a new device with no other GM gets the data from the copy and saves it', async () => {
    // #given
    const room = roomRig.openRoom();

    const writer = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, BROK, MIRA],
      until: 'live',
    });

    writer.engine.pageHidden();
    await waitUntil(() => roomCopyOf(room) !== null);
    writer.engine.stop();
    room.room.leave('gm-a');
    // #when
    const newDevice = await startClient(room, 'gm-b', { seeded: [], until: 'live' });
    // #then
    expect({
      shown: [shown(newDevice, BROK.k), shown(newDevice, MIRA.k), shown(newDevice, 'preset')],
      saved: storedRecord(newDevice, MIRA.k),
    }).toEqual({ shown: [BROK, MIRA, PRESET_RECORD], saved: MIRA });
  });
  test('a player with no data takes the copy of a higher generation, merges it and asks in it', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');
    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });
    // #when
    const client = await startClient(room, 'player-p', { role: 'PLAYER', seeded: [] });
    await waitUntil(() => shown(client, BROK.k) !== undefined);
    // #then
    expect(requestsOf(room, 'player-p').map((request) => Object(request).g)).toEqual([HIGHER]);
  });
  test('a client that holds records of its generation does not merge a copy of a lower one', async () => {
    // #given
    const room = roomRig.openRoom();
    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });
    const client = await startClient(room, 'gm-a', { seeded: [], until: 'live' });
    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [MIRA]) });
    // #when
    client.engine.catchUp();
    await waitUntil(() => client.store.$sync.get().state === 'live');
    await settle();
    // #then
    expect(shown(client, MIRA.k) ?? null).toBeNull();
  });
});

describe('room copy status in the projection', () => {
  test('with no copy yet it is none, with the limit less all room metadata free', async () => {
    // #given
    const room = roomRig.openRoom();
    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(1000) });
    // #when
    const client = await startClient(room, 'gm-a', { until: 'live' });
    // #then
    // {"other.extension/data":"xxx…"} is 1000 bytes of x and 27 of JSON around them.
    expect(roomCopyStatus(client)).toEqual({
      state: 'none',
      usedBytes: 0,
      freeBytes: LIMIT - 1027,
      outcome: 'none',
    });
  });
  test('after a verified write it is saved, with the copy key bytes used and the rest free', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    client.engine.pageHidden();
    await waitUntil(() => roomCopyStatus(client).state === 'saved');
    // #then
    const total = metadataBytes(room);
    // The copy is the only key: all its bytes but the two braces are its own.
    expect(roomCopyStatus(client)).toEqual({
      state: 'saved',
      usedBytes: total - 2,
      freeBytes: LIMIT - total,
      // The start catch-up found no copy; a write is not a catch-up read.
      outcome: 'none',
    });
  });
});

describe('review cases', () => {
  test('a start whose room copy read never ends still starts, and catch-up ends on the timeout', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    gate.holdNextRead();

    // #when
    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    // #then
    expect(client.store.$sync.get()).toMatchObject({ state: 'live', firstCatchUpDone: true });
  });
  test('an edit queued during catch-up lands in the room copy after catch-up ends', async () => {
    // #given
    const room = roomRig.openRoom();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      timing: { ...SHORT_PAUSE, catchUpTimeoutMs: 200 },
    });

    // #when
    send(client, setStr(21));
    await waitUntil(() => roomCopyOf(room) !== null);
    // #then
    expect(roomCopyOf(room)?.records).toEqual([brokWithStr(21, 2, 'gm-a'), PRESET_RECORD]);
  });
  test('the jitter puts the write off past the pause', async () => {
    // #given
    const room = roomRig.openRoom();

    const client = await startClient(room, 'gm-a', {
      timing: { snapshotPauseMs: 50, snapshotJitterMs: 100 },
      random: () => 1,
      until: 'live',
    });

    // #when
    send(client, setStr(3));
    await pause(100);
    const early = roomCopyOf(room);
    await pause(100);
    // #then
    expect({ early, late: roomCopyOf(room) !== null }).toEqual({ early: null, late: true });
  });
  test('a GM that takes a higher generation from the copy saves under that generation', async () => {
    // #given
    const room = roomRig.openRoom();
    room.room.setMetadata({ [KEY]: copyValue(HIGHER, [PRESET_RECORD, BROK]) });
    // #when
    const client = await startClient(room, 'gm-a', { seeded: [], until: 'live' });
    // #then
    expect(JSON.parse(client.backing.get(storageKey('blk:brok', HIGHER)) ?? 'null')).toEqual(BROK);
  });
  test('a demotion clears the not-saved notice', async () => {
    // #given
    const room = roomRig.openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    gate.dropWrites = true;
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));
    // #when
    client.platform.setRole('PLAYER');
    await waitUntil(() => client.store.$sync.get().role === 'PLAYER');
    // #then
    expect(notices(client)).toEqual([]);
  });
  test('a rejected write raises the notice and the failed state', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);
    const room = roomRig.openRoom();
    const gate = createGate();
    const client = await startClient(room, 'gm-a', { platform: gated(gate), until: 'live' });
    gate.rejectWrites = true;
    // #when
    client.engine.pageHidden();
    await waitUntil(() => notices(client).includes('room-copy-not-saved'));
    // #then
    expect(roomCopyStatus(client).state).toBe('failed');
  });
  test('a player with no GM reads the sheet set from the copy, and no value of a GM-only single sheet reaches its window', async () => {
    // #given
    const room = roomRig.openRoom();

    const goblin: VersionedRecord = {
      k: 'blk:npc',
      d: { order: 0, cells: { hp: [7, 1, 'seed'] } },
      c: 1,
      a: 'seed',
      l: [1, 'seed'],
    };

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [PRESET_RECORD, BROK, goblin]) });

    // #when
    const client = await startClient(room, 'player-p', {
      role: 'PLAYER',
      seeded: [],
      timing: { catchUpTimeoutMs: 100 },
      until: 'live',
    });

    // #then
    expect({ brok: shown(client, BROK.k), goblin: shown(client, goblin.k) ?? null }).toEqual({
      brok: BROK,
      goblin: null,
    });
  });
  test('the writer adopts a copy of a higher generation it reads, and writes none of its own', async () => {
    // #given: the copy appears with no change event, as one another GM wrote while this one slept.
    const room = roomRig.openRoom();
    const gate = createGate();
    room.join(GHOST, 'GM');

    const client = await startClient(room, 'gm-a', {
      platform: gated(gate),
      timing: { catchUpTimeoutMs: 50 },
      until: 'live',
    });

    const higher = copyValue(HIGHER, [PRESET_RECORD, MIRA]);
    const writes = gate.writes;
    room.room.setMetadata({ [KEY]: higher });
    // #when
    client.engine.pageHidden();
    await waitUntil(() => shown(client, MIRA.k) !== undefined);
    await waitUntil(() => client.store.$sync.get().state === 'live');
    // #then
    expect({
      writes: gate.writes - writes,
      copy: room.room.getMetadata()[KEY],
      brok: shown(client, BROK.k) ?? null,
    }).toEqual({ writes: 0, copy: higher, brok: null });
  });
  test('a GM that cannot read the copy at catch-up shows the failed state', async () => {
    // #given
    spyOn(console, 'error').mockImplementation(() => undefined);
    const room = roomRig.openRoom();
    room.room.setMetadata({ [KEY]: { v: 4, data: 'bm90IGRlZmxhdGU=' } });
    // #when
    const client = await startClient(room, 'gm-a', { until: 'live' });
    // #then
    expect(roomCopyStatus(client).state).toBe('failed');
  });
  test('another extension taking room metadata updates the free size, with no write', async () => {
    // #given
    const room = roomRig.openRoom();
    const client = await startClient(room, 'gm-a', { until: 'live' });
    // #when
    room.room.setMetadata({ 'other.extension/data': 'x'.repeat(1000) });
    await waitUntil(() => roomCopyStatus(client).freeBytes !== LIMIT - 2);
    // #then
    // {"other.extension/data":"xxx…"} is 1000 bytes of x and 27 of JSON around them.
    expect({ status: roomCopyStatus(client), copy: roomCopyOf(room) }).toEqual({
      status: { state: 'none', usedBytes: 0, freeBytes: LIMIT - 1027, outcome: 'none' },
      copy: null,
    });
  });
  test('a commit merged from another GM schedules this GM to write the copy', async () => {
    // #given
    const room = roomRig.openRoom();
    const a = await startClient(room, 'gm-a', { timing: SHORT_PAUSE, until: 'live' });
    const b = await startClient(room, 'gm-b', { until: 'live' });
    // #when
    send(b, setStr(9));
    await waitUntil(() => shown(a, 'blk:brok') !== undefined);
    await waitUntil(() => roomCopyOf(room) !== null);
    // #then
    expect(roomCopyOf(room)?.records).toEqual([brokWithStr(9, 2, 'gm-b'), PRESET_RECORD]);
  });
});

// TASK-37 AC 2: records stored before new ids got shorter, under 21-character nanoid ids.
describe('ids made before TASK-37', () => {
  test('records under 21-character ids load, merge, sync, take an edit and reach the room copy', async () => {
    // #given: the room copy and the writer's storage hold competing versions of two old-id keys.
    const room = roomRig.openRoom();
    const sheetId = 'V1StGXR8_Z5jdHi6B-myT';
    const repKey = `blk:${sheetId}:attack:Uakgb_J5m9g-0JDMbcJqL`;
    const rowKey = `blk:${sheetId}`;
    const copiedSheet = sheet(sheetId, 1, 4, 'other');
    const storedRep: VersionedRecord = fixtureRecord(repKey, { order: 0, cells: {} }, 3, 'seed');
    const copiedRep: VersionedRecord = fixtureRecord(repKey, { order: 5, cells: {} }, 2, 'other');

    const storedRoot: VersionedRecord = fixtureRecord(
      rowKey,
      { set: 'pc', order: 0, cells: { str: 5 } },
      2,
      'seed',
    );

    room.room.setMetadata({ [KEY]: copyValue(INITIAL, [copiedSheet, copiedRep]) });

    const writer = await startClient(room, 'gm-a', {
      seeded: [PRESET_RECORD, storedRoot, storedRep],
      until: 'live',
    });

    const newDevice = await startClient(room, 'gm-b', { seeded: [], until: 'live' });
    // #when
    send(newDevice, { type: 'field-patch', sheetId, target: ROW_STR, fieldId: 'str', value: 12 });
    await waitUntil(
      () => blockDataSchema.safeParse(shown(writer, rowKey)?.d).data?.cells.str?.[0] === 12,
    );
    writer.engine.pageHidden();
    await waitUntil(() => JSON.stringify(roomCopyOf(room)).includes('"str":[12,5,"gm-b"]'));

    // #then: the higher version of each key wins, and the edit raises the row's counter.
    const editedRoot: VersionedRecord = fixtureRecord(
      rowKey,
      { set: 'pc', order: 1, cells: { str: 12 } },
      5,
      'gm-b',
    );

    const mergedRep: VersionedRecord = fixtureRecord(repKey, { order: 5, cells: {} }, 3, 'seed');
    expect({
      synced: [shown(newDevice, rowKey), shown(newDevice, repKey)],
      copy: roomCopyOf(room)?.records,
    }).toEqual({
      synced: [editedRoot, mergedRep],
      copy: [editedRoot, mergedRep, PRESET_RECORD],
    });
  });
});
