import { describe, expect, spyOn, test } from 'bun:test';
import { deflateToBase64 } from '@/core/deflate';
import { encodePreset, type Preset, type PresetSection } from '@/core/preset';
import { NOTHING_ERASED } from '@/core/preset-migrate';
import type { VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import type { Timing } from '@/core/timing';
import type { WireCommand } from '@/core/ui-messages';
import type { MockPlatform, WindowSizeCall, MockRoom } from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  copyValue,
  createRoomRig,
  diagnostics,
  pause,
  send,
  waitUntil,
  type RigClient,
  type RigClientOptions,
} from '../../tests/support/room-rig';

const SNAPSHOT_KEY = 'app.muster-roll/snapshot';
const GENERATION: Generation = { n: 0, a: '' };

// The sizes of the 5.4 spec, written out by hand.
const DEFAULT: WindowSizeCall = { width: 600, height: 600 };
const WIDE: WindowSizeCall = { width: 900, height: 700 };

const NAME_SECTION: PresetSection = {
  rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }],
};

const STR_SECTION: PresetSection = {
  rows: [{ cells: [{ kind: 'field', type: 'number', id: 'str' }] }],
};

const PLAIN: Preset = {
  v: 4,
  templates: [
    {
      id: 'pc',

      title: 'Персонажи',
      repeat: { nameField: 'name' },
      tabs: [{ sections: [NAME_SECTION, STR_SECTION] }],
    },
    {
      id: 'npc',

      title: 'NPC',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'number', id: 'hp' }] }] }] }],
    },
  ],
};

const SIZED: Preset = { ...PLAIN, window: WIDE };

// The same size as SIZED, and a new section title.
const SIZED_RETITLED: Preset = {
  ...SIZED,
  templates: SIZED.templates.map((template) =>
    template.id === 'pc'
      ? { ...template, tabs: [{ sections: [NAME_SECTION, { ...STR_SECTION, title: 'Сила' }] }] }
      : template,
  ),
};

type Client = RigClient;

type ClientOptions = {
  role?: PlayerRole;
  seeded?: readonly VersionedRecord[];
  beforeStart?: (platform: MockPlatform) => void;
  timing?: Partial<Timing>;
  // 'loaded': the client is returned while its first catch-up may still run.
  until?: 'loaded' | 'live';
};

const roomRig = createRoomRig({
  timing: { catchUpTimeoutMs: 150, proposeResendStartMs: 60000, proposeResendMaxMs: 60000 },
});

describe('the window size at start', () => {
  test('a GM that holds a preset with a size takes that size', async () => {
    // #when
    const gm = await startClient(openRoom(), 'gm-a', { seeded: [presetRecord(SIZED)] });
    // #then
    expect(gm.platform.actionSizes()).toEqual([WIDE]);
  });
  test('a GM that holds a preset with no size takes 600 by 600', async () => {
    // #when
    const gm = await startClient(openRoom(), 'gm-a', { seeded: [presetRecord(PLAIN)] });
    // #then
    expect(gm.platform.actionSizes()).toEqual([DEFAULT]);
  });
  test('a GM in a room with no preset takes 600 by 600', async () => {
    // #when
    const gm = await startClient(openRoom(), 'gm-a', { seeded: [] });
    // #then
    expect(gm.platform.actionSizes()).toEqual([DEFAULT]);
  });
  test('a player takes the size of the preset a GM sends, and no size before it', async () => {
    // #given
    const room = openRoom();
    await startClient(room, 'gm-a', { seeded: [presetRecord(SIZED)] });
    // #when
    const player = await startClient(room, 'player-a', { role: 'PLAYER' });
    await waitUntil(() => player.store.$records.get().has('preset'));
    // #then
    expect(player.platform.actionSizes()).toEqual([WIDE]);
  });
  test('a GM with no saved data takes the size of the preset another GM sends, and no size before it', async () => {
    // #given
    const room = openRoom();
    await startClient(room, 'gm-a', { seeded: [presetRecord(SIZED)] });
    // #when
    const second = await startClient(room, 'gm-b', { seeded: [] });
    // #then
    expect(second.platform.actionSizes()).toEqual([WIDE]);
  });
});

describe('the window size during the first catch-up', () => {
  test('a GM with a saved preset with a size has that size while its first catch-up runs', async () => {
    // #given: another GM that never answers keeps the catch-up open.
    const room = openRoom();
    room.join({ id: 'gm-ghost', connectionId: 'gm-ghost', name: 'gm-ghost', role: 'GM' });

    // #when
    const gm = await startClient(room, 'gm-a', {
      seeded: [presetRecord(SIZED)],
      timing: { catchUpTimeoutMs: 60000 },
      until: 'loaded',
    });

    // #then
    expect({ state: gm.store.$sync.get().state, sizes: gm.platform.actionSizes() }).toEqual({
      state: 'catching-up',
      sizes: [WIDE],
    });
  });
  test('a player in a room with no preset gets one 600 by 600, and only when its first catch-up ends', async () => {
    // #given: no GM answers, so the catch-up ends at its timeout.
    const player = await startClient(openRoom(), 'player-a', {
      role: 'PLAYER',
      until: 'loaded',
    });

    const during = player.platform.actionSizes();
    // #when
    await waitUntil(() => player.store.$sync.get().state === 'live');
    await pause(20);
    // #then
    expect({ during, after: player.platform.actionSizes() }).toEqual({
      during: [],
      after: [DEFAULT],
    });
  });
});

describe('the window size after a preset change', () => {
  test('an upload with a new size resizes the GM and the player', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(PLAIN));
    // #when
    send(gm, upload(SIZED));
    await waitUntil(() => player.platform.actionSizes().length === 2);
    // #then
    expect({
      gm: gm.platform.actionSizes(),
      player: player.platform.actionSizes(),
    }).toEqual({ gm: [DEFAULT, WIDE], player: [DEFAULT, WIDE] });
  });
  test('an upload with no size takes every client back to 600 by 600', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(SIZED));
    // #when
    send(gm, upload(PLAIN));
    await waitUntil(() => player.platform.actionSizes().length === 2);
    // #then
    expect({
      gm: gm.platform.actionSizes(),
      player: player.platform.actionSizes(),
    }).toEqual({ gm: [WIDE, DEFAULT], player: [WIDE, DEFAULT] });
  });
  test('an upload with the same size asks for no size again', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(SIZED));
    const before = gm.store.$records.get().get('preset');
    // #when
    send(gm, upload(SIZED_RETITLED));
    await waitUntil(() => player.store.$records.get().get('preset')?.c === (before?.c ?? 0) + 1);
    // #then
    expect({
      gm: gm.platform.actionSizes(),
      player: player.platform.actionSizes(),
    }).toEqual({ gm: [WIDE], player: [WIDE] });
  });
  test('a preset this build cannot read keeps the current size', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [presetRecord(SIZED)] });

    const newer: VersionedRecord = {
      k: 'preset',
      d: deflateToBase64(JSON.stringify({ v: 4, layout: 'unknown' })),
      c: 2,
      a: 'gm-x',
    };

    room.join({ id: 'gm-x', connectionId: 'gm-x', name: 'gm-x', role: 'GM' });
    // #when
    room.postRemote(SYNC_CHANNEL, { v: 4, g: GENERATION, t: 'commit', records: [newer] }, 'gm-x');
    await waitUntil(() => gm.store.$records.get().get('preset')?.c === 2);
    await pause(20);
    // #then
    expect(gm.platform.actionSizes()).toEqual([WIDE]);
  });
  test('a stopped engine asks for no size for records that come later', async () => {
    // #given
    const { gm, player } = await gmAndPlayer(presetRecord(PLAIN));
    player.engine.stop();
    // #when
    send(gm, upload(SIZED));
    await waitUntil(() => gm.platform.actionSizes().length === 2);
    await pause(20);
    // #then
    expect(player.platform.actionSizes()).toEqual([DEFAULT]);
  });
  test('a GM that adopts an imported generation takes the size of its preset', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-b', { seeded: [presetRecord(PLAIN)] });
    const generation: Generation = { n: 1, a: 'gm-a' };
    const imported: VersionedRecord = { k: 'preset', d: encodePreset(SIZED), c: 1, a: 'gm-a' };
    // #when
    room.setMetadata({ [SNAPSHOT_KEY]: copyValue(generation, [imported]) });
    await waitUntil(() => gm.platform.actionSizes().length === 2);
    // #then
    expect(gm.platform.actionSizes()).toEqual([DEFAULT, WIDE]);
  });
  test('a wipe returns a sized window to the default size', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { seeded: [presetRecord(SIZED)] });
    // #when
    send(gm, { type: 'wipe' });
    await pause(50);
    // #then
    expect(gm.platform.actionSizes()).toEqual([WIDE, DEFAULT]);
  });
  test('a size that failed is logged and asked for again on the next replica change', async () => {
    // #given
    const gm = await startClient(openRoom(), 'gm-a', {
      seeded: [presetRecord(SIZED)],
      beforeStart: (platform) => platform.failNextActionSize(),
    });

    // #when
    send(gm, { type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => gm.store.$records.get().has('blk:brok'));
    // #then
    expect({
      diagnostics: diagnostics(gm).map(({ tag }) => tag),
      sizes: gm.platform.actionSizes(),
    }).toEqual({
      diagnostics: ['message-rejected'],
      sizes: [WIDE, WIDE],
    });
  });
  test('an unrelated replica change does not schedule an in-flight size retry before rejection', async () => {
    // #given
    const sizes: WindowSizeCall[] = [];
    let rejectFirst = (_error: Error): void => undefined;

    const firstSize = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });

    const gm = await startClient(openRoom(), 'gm-a', {
      seeded: [presetRecord(SIZED)],
      beforeStart: (platform) => {
        spyOn(platform.action, 'setSize').mockImplementation((width, height) => {
          sizes.push({ width, height });

          return sizes.length === 1 ? firstSize : Promise.resolve();
        });
      },
    });

    // #when
    send(gm, { type: 'sheet-create', sheetId: 'brok', set: 'pc' });
    await waitUntil(() => gm.store.$records.get().has('blk:brok'));
    rejectFirst(new Error('first size failed'));
    await pause(20);
    const afterRejection = [...sizes];
    send(gm, { type: 'sheet-create', sheetId: 'anya', set: 'pc' });
    await waitUntil(() => gm.store.$records.get().has('blk:anya'));
    await pause(20);
    // #then
    expect({
      afterRejection,
      afterNextChange: sizes,
      diagnostics: diagnostics(gm).map(({ tag }) => tag),
    }).toEqual({
      afterRejection: [WIDE],
      afterNextChange: [WIDE, WIDE],
      diagnostics: ['message-rejected'],
    });
  });
});

async function gmAndPlayer(preset: VersionedRecord): Promise<{
  gm: Client;
  player: Client;
}> {
  const room = openRoom();
  const gm = await startClient(room, 'gm-a', { seeded: [preset] });
  const player = await startClient(room, 'player-a', { role: 'PLAYER' });
  await waitUntil(() => player.platform.actionSizes().length === 1);

  return { gm, player };
}

async function startClient(
  room: MockRoom,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const clientOptions: RigClientOptions = {
    ...options,
    until: options.until ?? 'live',
    engine: { random: () => 0 },
    platform: options.beforeStart
      ? (platform) => {
          options.beforeStart?.(platform);

          return platform;
        }
      : undefined,
  };

  const client = await roomRig.startClient(room, connectionId, clientOptions);

  return client;
}

function openRoom(): MockRoom {
  return roomRig.openRoom().room;
}

function presetRecord(preset: Preset): VersionedRecord {
  return { k: 'preset', d: encodePreset(preset), c: 1, a: 'seed' };
}

// An upload that erases nothing, as every preset of this file keeps the same fields.
function upload(preset: Preset): WireCommand {
  return {
    type: 'preset-upload',
    data: encodePreset(preset),
    expectedCount: 0,
    expectedSheets: 0,
    expectedDigest: NOTHING_ERASED,
  };
}
