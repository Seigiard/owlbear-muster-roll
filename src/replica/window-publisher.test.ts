import type { JsonValue } from '@/core/json';
import { assembleRecords } from '@/core/merge';
import { fixtureRecord } from '../../tests/support/block-fixtures';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { jsonByteLength } from '@/core/message-size';
import { decodePreset, encodePreset, type Preset } from '@/core/preset';
import { presetDataSchema, type VersionedRecord } from '@/core/records';
import { TIMING } from '@/core/timing';
import {
  parseEngineMessage,
  parseWindowMessage,
  UI_CHANNEL,
  type EngineMessage,
  type RoomCopyStatus,
  type SyncState,
} from '@/core/ui-messages';
import { createMemoryBus, createMockPlatform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import {
  createWindowPublisher,
  type WindowPublisher,
  type WindowPublisherState,
} from '@/replica/window-publisher';
import {
  createProjectionStore,
  startReplicaClient,
  type RigPage,
} from '../../tests/support/room-rig';

const PRESET: Preset = {
  v: 4,
  templates: [
    {
      id: 'party',

      title: 'Party',
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
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'secret',

      title: 'Secret',
      visibility: 'gm',
      tabs: [{ sections: [{ rows: [{ cells: [{ kind: 'field', type: 'text', id: 'note' }] }] }] }],
    },
  ],
};

const PRESET_RECORD: VersionedRecord = { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'gm' };
const ROOM_COPY: RoomCopyStatus = { state: 'none', usedBytes: 0, freeBytes: 15500, outcome: null };

const LIVE_SYNC: Omit<SyncState, 'role'> = {
  state: 'live',
  firstCatchUpDone: true,
  gmAnswered: true,
  gmLink: 'online',
};

type Harness = {
  source: WindowPublisherState;
  publisher: WindowPublisher;
  messages: EngineMessage[];
  openWindow: (id: string) => {
    client: RigPage['window'];
    store: RigPage['store'];
  };
  stopRequests: () => void;
  stop: () => void;
};

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('window publisher', () => {
  test('sends a record-free delta from its engine before the first projection when records change', async () => {
    // #given
    const harness = publisherHarness(source('GM', [PRESET_RECORD]));
    harness.source.replica = records(PRESET_RECORD, record('blk:hero', { name: 'Ada' }, 2));
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect(
      harness.messages.flatMap((message) =>
        message.t === 'delta'
          ? [
              {
                engine: message.engine,
                records: message.records,
                pending: message.pending,
                withdrawn: message.withdrawn,
              },
            ]
          : [],
      ),
    ).toEqual([{ engine: 'engine-1', records: [], pending: [], withdrawn: [] }]);
  });
  test('sends nothing before the first projection for a header-only or unchanged source', () => {
    // #given
    const harness = publisherHarness(source('GM', [PRESET_RECORD]));
    harness.source.notices = ['new-version'];
    // #when
    harness.publisher.publish();
    harness.publisher.publish();
    // #then
    expect(harness.messages).toEqual([]);
  });
  test('opens a window with the full visible projection', async () => {
    // #given
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const name = record('blk:hero', { name: 'Ada' });
    const harness = publisherHarness(source('GM', [PRESET_RECORD, hero, name]));
    // #when
    const window = harness.openWindow('open');
    await settle();
    // #then
    expect([...window.store.$records.get().values()]).toEqual([
      PRESET_RECORD,
      records(hero, name).get(hero.k)!,
    ]);
  });
  test('answers a projection nonce once while its first projection is queued', () => {
    // #given
    let release: (() => void) | undefined;

    const queued = new Promise<void>((resolve) => {
      release = resolve;
    });

    const sent: EngineMessage[] = [];

    const publisher = createWindowPublisher({
      send: async (message) => {
        sent.push(message);
        await queued;
      },
      newId: () => 'engine',
      presetOf: presetOf,
      state: () => source('GM', [PRESET_RECORD]),
    });

    // #when
    const answered = [publisher.project('repeat'), publisher.project('repeat')];
    release?.();
    // #then
    expect({ answered, projections: sent.length }).toEqual({
      answered: [true, false],
      projections: 1,
    });
  });
  test('answers a projection nonce again after its first projection has sent', async () => {
    // #given
    const harness = publisherHarness(source('GM', [PRESET_RECORD]));
    // #when
    const first = harness.publisher.project('again');
    await settle();
    const second = harness.publisher.project('again');
    await settle();
    // #then
    expect({
      answers: [first, second],
      projections: harness.messages
        .filter((message) => message.t === 'projection')
        .map((message) => message.nonce),
    }).toEqual({ answers: [true, true], projections: ['again', 'again'] });
  });
  test('leaves an oversized projection nonce free after the source shrinks', async () => {
    // #given
    const oversized = record('blk:large', { value: 'ы'.repeat(7000) });
    const harness = publisherHarness(source('GM', [oversized]));
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    harness.source.party = party(100);
    // #when
    const rejected = harness.publisher.project('retry');
    harness.source.party = [];
    const accepted = harness.publisher.project('retry');
    await settle();
    // #then
    expect({
      answers: [rejected, accepted],
      errors: error.mock.calls.length,
      projections: harness.messages.filter((message) => message.t === 'projection').length,
    }).toEqual({ answers: [false, true], errors: 1, projections: 1 });
    error.mockRestore();
  });
  test('sends only a changed record and leaves the window at the new version', async () => {
    // #given
    const before = record('blk:hero', { name: 'Ada' });
    const after = record('blk:hero', { name: 'Bea' }, 2);
    const harness = publisherHarness(source('GM', [PRESET_RECORD, before]));
    const window = harness.openWindow('change');
    await settle();
    harness.source.replica = records(PRESET_RECORD, after);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      delta: deltas(harness.messages),
      window: [...window.store.$records.get().values()],
    }).toEqual({
      delta: [{ records: [after], pending: [], withdrawn: [] }],
      window: [PRESET_RECORD, after],
    });
  });
  test('does not send a second delta when the visible state is unchanged', async () => {
    // #given
    const original = record('blk:hero', { name: 'Ada' });
    const replacement = record('blk:hero', { name: 'Ada' });
    const harness = publisherHarness(source('GM', [original]));
    harness.openWindow('steady');
    await settle();
    harness.source.replica = records(replacement);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect(deltas(harness.messages)).toEqual([]);
  });
  test('sends a record-free delta and new notices for a changed header', async () => {
    // #given
    const harness = publisherHarness(source('GM', [PRESET_RECORD]));
    const window = harness.openWindow('header');
    await settle();
    harness.source.notices = ['new-version'];
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({ deltas: deltas(harness.messages), notices: window.store.$notices.get() }).toEqual({
      deltas: [{ records: [], pending: [], withdrawn: [] }],
      notices: ['new-version'],
    });
  });
  test('withdraws hidden player records and sends them again when their template becomes visible', async () => {
    // #given
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const name = record('blk:hero', { name: 'Ada' });
    const privatePreset = record('preset', encodePreset(presetWithPartyVisibility()), 2);
    const visiblePreset = record('preset', encodePreset(PRESET), 3);
    const harness = publisherHarness(source('PLAYER', [PRESET_RECORD, hero, name]));
    const window = harness.openWindow('player');
    await settle();
    harness.source.replica = records(privatePreset, hero, name);
    // #when
    harness.publisher.publish();
    await settle();
    harness.source.replica = records(visiblePreset, hero, name);
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      deltas: deltas(harness.messages),
      keys: [...window.store.$records.get().keys()],
    }).toEqual({
      deltas: [
        {
          records: [privatePreset],
          pending: [],
          withdrawn: ['blk:hero'],
        },
        { records: [visiblePreset, records(hero, name).get(hero.k)!], pending: [], withdrawn: [] },
      ],
      keys: ['preset', 'blk:hero'],
    });
  });
  test('withdraws a player link when the pending view tombstones its repeat block', async () => {
    // #given
    const preset = record('preset', encodePreset(tokenPreset()));
    const hero = record('blk:brok', { set: 'party', order: 0 });
    const name = record('blk:brok', { name: 'Brok' });
    const block = record('blk:brok:item:i1', { order: 0, cells: { item: 'Sword' } });
    const pendingBlock = record('blk:brok:item:i1', null, 2, 'player');
    const link = record('link:t1', { s: 'brok', path: ['item', 'i1'], c: 'token' });
    const harness = publisherHarness(source('PLAYER', [preset, hero, name, block, link]));
    const window = harness.openWindow('pending-link');
    await settle();
    const initial = [...window.store.$records.get().keys()];
    harness.source.pendingView = records(pendingBlock);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      initial,
      delta: deltas(harness.messages),
      window: [...window.store.$records.get().keys()],
    }).toEqual({
      initial: ['preset', 'blk:brok', 'blk:brok:item:i1', 'link:t1'],
      delta: [{ records: [], pending: [pendingBlock], withdrawn: ['link:t1'] }],
      window: ['preset', 'blk:brok', 'blk:brok:item:i1'],
    });
  });
  test('does not send a row before the delta that brings its sheet', async () => {
    // #given
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const name = record('blk:hero', { name: 'Ada' });
    const harness = publisherHarness(source('PLAYER', [PRESET_RECORD, name]));
    const window = harness.openWindow('row-before-sheet');
    await settle();
    harness.source.replica = records(PRESET_RECORD, name, hero);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      deltas: deltas(harness.messages),
      records: [...window.store.$records.get().values()],
    }).toEqual({
      deltas: [{ records: [records(name, hero).get(hero.k)!], pending: [], withdrawn: [] }],
      records: [PRESET_RECORD, records(name, hero).get(hero.k)!],
    });
  });
  test('withdraws nothing from a GM when a template becomes GM-only', async () => {
    // #given
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const privatePresetRecord = record('preset', encodePreset(presetWithPartyVisibility()), 2);
    const harness = publisherHarness(source('GM', [PRESET_RECORD, hero]));
    const window = harness.openWindow('gm-visibility');
    await settle();
    harness.source.replica = records(privatePresetRecord, hero);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      deltas: deltas(harness.messages),
      records: [...window.store.$records.get().values()],
    }).toEqual({
      deltas: [{ records: [privatePresetRecord], pending: [], withdrawn: [] }],
      records: [privatePresetRecord, hero],
    });
  });
  test('a pending cell stays in the window when its replica cell is withdrawn', async () => {
    // #given
    const applied = record('blk:hero', { name: 'Ada' });
    const pending = record('blk:hero', { name: 'Bea' }, 2, 'player');
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const harness = publisherHarness(source('PLAYER', [PRESET_RECORD, hero, applied], [pending]));
    const window = harness.openWindow('pending');
    await settle();
    harness.source.replica = records(PRESET_RECORD, hero);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      delta: deltas(harness.messages),
      window: [...window.store.$records.get().values()],
    }).toEqual({
      delta: [{ records: [hero], pending: [], withdrawn: [] }],
      window: [PRESET_RECORD, records(hero, pending).get(hero.k)!],
    });
  });
  test('sends pending entries when they enter, change, and leave the pending view', async () => {
    // #given
    const applied = record('blk:hero', { name: 'Ada' });
    const entered = record('blk:hero', { name: 'Bea' }, 2, 'player');
    const changed = record('blk:hero', { name: 'Cy' }, 3, 'player');
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const harness = publisherHarness(source('PLAYER', [PRESET_RECORD, hero, applied]));
    const window = harness.openWindow('pending-views');
    await settle();
    harness.source.pendingView = records(entered);
    // #when
    harness.publisher.publish();
    harness.source.pendingView = records(changed);
    harness.publisher.publish();
    harness.source.pendingView = new Map();
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      deltas: deltas(harness.messages).filter(
        (delta) =>
          delta.records.length > 0 || delta.pending.length > 0 || delta.withdrawn.length > 0,
      ),
      records: [...window.store.$records.get().values()],
    }).toEqual({
      deltas: [
        { records: [], pending: [entered], withdrawn: [] },
        { records: [], pending: [changed], withdrawn: [] },
        { records: [records(hero, applied).get(hero.k)!], pending: [], withdrawn: ['blk:hero'] },
      ],
      records: [PRESET_RECORD, records(hero, applied).get(hero.k)!],
    });
  });
  test('splits a large delta under the limit and withdraws only in its first part', async () => {
    // #given
    const gone = record('blk:gone', { value: 'before' });
    const wideA = record('blk:wide', { a: 'ы'.repeat(4000) });
    const wideB = record('blk:wide', { b: 'ы'.repeat(4000) });
    const wideC = record('blk:wide', { c: 'ы'.repeat(4000) });
    const wide = [wideA, wideB, wideC];
    const harness = publisherHarness(source('GM', [gone]));
    const window = harness.openWindow('large');
    await settle();
    harness.source.replica = assembleRecords(wide);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      parts: deltas(harness.messages),
      window: [...window.store.$records.get().keys()],
    }).toEqual({
      parts: [
        { records: [wideA], pending: [], withdrawn: ['blk:gone'] },
        { records: [wideB], pending: [], withdrawn: [] },
        { records: [wideC], pending: [], withdrawn: [] },
      ],
      window: ['blk:wide'],
    });
    expect(harness.messages.every((message) => jsonByteLength(message) < 15000)).toBe(true);
  });
  test('sends a later record after one delta cannot fit', async () => {
    // #given
    const oversized = record('blk:large', { value: 'ы'.repeat(7000) });
    const later = record('blk:later', { value: 'Ada' }, 2);
    const harness = publisherHarness(source('GM'));
    const window = harness.openWindow('too-large');
    await settle();
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    harness.source.party = Array.from({ length: 100 }, (_, index) => ({
      id: `player-${index}`,
      name: 'Player',
      role: 'PLAYER' as const,
    }));
    harness.source.replica = records(oversized);
    // #when
    harness.publisher.publish();
    harness.source.replica = records(oversized, later);
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      errors: error.mock.calls.length,
      deltas: deltas(harness.messages),
      window: [...window.store.$records.get().values()],
    }).toEqual({
      errors: 1,
      deltas: [{ records: [later], pending: [], withdrawn: [] }],
      window: [later],
    });
    error.mockRestore();
  });
  test('rejects a delta with an oversized pending record but sends the fitting control', async () => {
    // #given
    const changed = record('blk:changed', { value: 'Ada' }, 2);
    const oversized = record('blk:pending', { value: 'ы'.repeat(7000) }, 2, 'player');
    const fitting = record('blk:pending', { value: 'Bea' }, 2, 'player');
    const rejected = publisherHarness(source('GM'));
    const control = publisherHarness(source('GM'));
    rejected.openWindow('pending-too-large');
    control.openWindow('pending-fits');
    await settle();
    rejected.source.party = party(100);
    rejected.source.replica = records(changed);
    rejected.source.pendingView = records(oversized);
    control.source.replica = records(changed);
    control.source.pendingView = records(fitting);
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    // #when
    rejected.publisher.publish();
    control.publisher.publish();
    await settle();
    // #then
    expect({
      errors: error.mock.calls.length,
      rejected: deltas(rejected.messages),
      control: deltas(control.messages),
    }).toEqual({
      errors: 1,
      rejected: [],
      control: [
        { records: [changed], pending: [], withdrawn: [] },
        { records: [], pending: [fitting], withdrawn: [] },
      ],
    });
    error.mockRestore();
  });
  test('rejects a counter-sized projection and sends the nearby fitting control', async () => {
    // #given
    const boundary = counterRecords(9505, 9496);
    const fitting = counterRecords(9503, 9495);
    const rejected = publisherHarness(source('GM', boundary.replica, boundary.pending));
    const control = publisherHarness(source('GM', fitting.replica, fitting.pending));
    rejected.source.party = party(100);
    control.source.party = party(100);
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    // #when
    const rejectedAnswer = rejected.publisher.project('counter-projection');
    const controlAnswer = control.publisher.project('counter-projectioz');
    await settle();
    await settle();
    await settle();

    // #then
    const controlMessages = control.messages.filter(
      (
        message,
      ): message is Extract<
        EngineMessage,
        {
          t: 'projection';
        }
      > => message.t === 'projection',
    );

    expect({
      errors: error.mock.calls.length,
      rejected: { answer: rejectedAnswer, sends: rejected.messages.length },
      control: {
        answer: controlAnswer,
        envelopeBytes: controlMessages.map(bodyFreeMessageBytes),
        messageBytes: controlMessages.map(jsonByteLength),
      },
    }).toEqual({
      errors: 1,
      rejected: { answer: false, sends: 0 },
      control: {
        answer: true,
        envelopeBytes: [5398, 5398, 5398, 5398, 5398, 5398, 5398, 5398, 5398, 5399],
        messageBytes: [14998, 14998, 14998, 14998, 14998, 14998, 14998, 14998, 14998, 14999],
      },
    });
    expect(controlMessages.every((message) => jsonByteLength(message) < 15000)).toBe(true);
    error.mockRestore();
  });
  test('rejects a counter-sized delta and sends the nearby fitting control', async () => {
    // #given
    const boundary = counterRecords(9537, 9529);
    const fitting = counterRecords(9535, 9527);
    const rejected = publisherHarness(source('GM'));
    const control = publisherHarness(source('GM'));
    rejected.publisher.project('ready');
    control.publisher.project('ready');
    await settle();
    rejected.source.party = party(100);
    control.source.party = party(100);
    rejected.source.replica = records(...boundary.replica);
    rejected.source.pendingView = records(...boundary.pending);
    control.source.replica = records(...fitting.replica);
    control.source.pendingView = records(...fitting.pending);
    const error = spyOn(console, 'error').mockImplementation(() => undefined);
    // #when
    rejected.publisher.publish();
    control.publisher.publish();
    await settle();
    await settle();
    await settle();

    // #then
    const controlMessages = control.messages.filter(
      (
        message,
      ): message is Extract<
        EngineMessage,
        {
          t: 'delta';
        }
      > => message.t === 'delta',
    );

    expect({
      errors: error.mock.calls.length,
      rejected: { sends: deltas(rejected.messages).length },
      control: {
        envelopeBytes: controlMessages.map(bodyFreeMessageBytes),
        messageBytes: controlMessages.map(jsonByteLength),
      },
    }).toEqual({
      errors: 1,
      rejected: { sends: 0 },
      control: {
        envelopeBytes: [5366, 5366, 5366, 5366, 5366, 5366, 5366, 5366, 5366, 5367],
        messageBytes: [14998, 14998, 14998, 14998, 14998, 14998, 14998, 14998, 14998, 14999],
      },
    });
    expect(controlMessages.every((message) => jsonByteLength(message) < 15000)).toBe(true);
    error.mockRestore();
  });
  test('sends a restart cue once and stays silent until the next projection', async () => {
    // #given
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const harness = publisherHarness(source('GM', [PRESET_RECORD, hero]));
    harness.openWindow('restart');
    await settle();
    harness.stopRequests();
    harness.publisher.restart();
    // #when
    harness.publisher.publish();
    harness.publisher.publish();
    await settle();
    // #then
    expect(deltas(harness.messages)).toEqual([{ records: [], pending: [], withdrawn: [] }]);
  });
  test('reprojects a restarted window from the new engine id', async () => {
    // #given
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const harness = publisherHarness(source('GM', [PRESET_RECORD, hero]));
    const window = harness.openWindow('reproject');
    await settle();
    harness.publisher.restart();
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect({
      cue: harness.messages.find(
        (
          message,
        ): message is Extract<
          EngineMessage,
          {
            t: 'delta';
          }
        > => message.t === 'delta' && message.engine === 'engine-2',
      )?.engine,
      projection: harness.messages.find(
        (
          message,
        ): message is Extract<
          EngineMessage,
          {
            t: 'projection';
          }
        > => message.t === 'projection' && message.engine === 'engine-2',
      )?.engine,
      records: [...window.store.$records.get().values()],
    }).toEqual({ cue: 'engine-2', projection: 'engine-2', records: [PRESET_RECORD, hero] });
  });
  test('asks a new publisher for a projection when its pre-projection records change', async () => {
    // #given
    const before = record('blk:hero', { name: 'Ada' });
    const after = record('blk:hero', { name: 'Bea' }, 2);
    const bus = createMemoryBus();
    const first = publisherHarness(source('GM', [PRESET_RECORD, before]), bus, ids('engine-a'));
    const window = first.openWindow('new-publisher');
    await settle();
    first.stopRequests();
    const next = publisherHarness(source('GM', [PRESET_RECORD, before]), bus, ids('engine-b'));
    next.source.replica = records(PRESET_RECORD, after);
    // #when
    next.publisher.publish();
    await settle();
    // #then
    expect({
      stream: next.messages.flatMap((message) =>
        message.t === 'delta' || message.t === 'projection'
          ? [{ engine: message.engine, type: message.t }]
          : [],
      ),
      records: [...window.store.$records.get().values()],
    }).toEqual({
      stream: [
        { engine: 'engine-b', type: 'delta' },
        { engine: 'engine-b', type: 'projection' },
      ],
      records: [PRESET_RECORD, after],
    });
  });
  test('sends a record-free delta after its restart cue when visible records change', async () => {
    // #given
    const hero = record('blk:hero', { set: 'party', order: 0 });
    const name = record('blk:hero', { name: 'Ada' });
    const harness = publisherHarness(source('GM', [PRESET_RECORD, hero]));
    harness.openWindow('restart-change');
    await settle();
    harness.stopRequests();
    harness.publisher.restart();
    harness.publisher.publish();
    harness.source.replica = records(PRESET_RECORD, hero, name);
    // #when
    harness.publisher.publish();
    await settle();
    // #then
    expect(
      harness.messages.flatMap((message) =>
        message.t === 'delta'
          ? [
              {
                engine: message.engine,
                records: message.records,
                pending: message.pending,
                withdrawn: message.withdrawn,
              },
            ]
          : [],
      ),
    ).toEqual([
      { engine: 'engine-2', records: [], pending: [], withdrawn: [] },
      { engine: 'engine-2', records: [], pending: [], withdrawn: [] },
    ]);
  });
  test('sends one restart cue with no earlier projection and then stays silent', async () => {
    // #given
    const harness = publisherHarness(source('GM', [PRESET_RECORD]));
    harness.publisher.restart();
    // #when
    harness.publisher.publish();
    harness.publisher.publish();
    await settle();
    // #then
    expect(
      harness.messages.flatMap((message) =>
        message.t === 'delta'
          ? [
              {
                engine: message.engine,
                records: message.records,
                pending: message.pending,
                withdrawn: message.withdrawn,
              },
            ]
          : [],
      ),
    ).toEqual([{ engine: 'engine-2', records: [], pending: [], withdrawn: [] }]);
  });
  test('brings an existing and a newly opened window to the current source', async () => {
    // #given
    const before = record('blk:hero', { name: 'Ada' });
    const after = record('blk:hero', { name: 'Bea' }, 2);
    const harness = publisherHarness(source('GM', [before]));
    const first = harness.openWindow('first');
    await settle();
    harness.source.replica = records(after);
    // #when
    const second = harness.openWindow('second');
    await settle();
    // #then
    expect({
      first: [...first.store.$records.get().values()],
      second: [...second.store.$records.get().values()],
    }).toEqual({ first: [after], second: [after] });
  });
});

function publisherHarness(
  initial: WindowPublisherState,
  bus = createMemoryBus(),
  newId: () => string = ids('engine-1', 'engine-2'),
): Harness {
  const engine = createMockPlatform(bus).broadcast;
  const windowPlatform = createMockPlatform(bus).broadcast;
  const sendQueue = createSendQueue(engine, { ...TIMING, sendSpacingMs: 0 });
  const currentState = initial;
  const messages: EngineMessage[] = [];

  const publisher = createWindowPublisher({
    send: (message) => sendQueue.enqueue(UI_CHANNEL, message, { destination: 'LOCAL' }),
    newId,
    presetOf,
    state: () => currentState,
  });

  const unlistenMessages = bus.subscribe(UI_CHANNEL, (event) => {
    const message = parseEngineMessage(event.data);

    if (message.ok && (message.value.t === 'projection' || message.value.t === 'delta')) {
      messages.push(message.value);
    }
  });

  const unlistenRequests = bus.subscribe(UI_CHANNEL, (event) => {
    const message = parseWindowMessage(event.data);

    if (message.ok && message.value.t === 'projection-request') {
      publisher.project(message.value.nonce);
    }
  });

  cleanups.push(unlistenMessages, unlistenRequests);

  return {
    source: currentState,
    publisher,
    messages,
    openWindow: (id) => {
      const store = createProjectionStore();

      const client = startReplicaClient(
        windowPlatform,
        createSendQueue(windowPlatform, { ...TIMING, sendSpacingMs: 0 }),
        store,
        { ...TIMING, projectionRequestRepeatMs: 10000 },
        ids(id),
      );

      cleanups.push(client.stop);

      return { client, store };
    },
    stopRequests: unlistenRequests,
    stop: () => {
      unlistenMessages();
      unlistenRequests();
    },
  };
}

function source(
  role: WindowPublisherState['role'],
  replica: readonly VersionedRecord[] = [],
  pending: readonly VersionedRecord[] = [],
): WindowPublisherState {
  return {
    role,
    replica: records(...replica),
    pendingView: records(...pending),
    notices: [],
    sync: LIVE_SYNC,
    roomCopy: ROOM_COPY,
    party: [],
  };
}

function record(k: string, d: JsonValue, c = 1, a = 'gm'): VersionedRecord {
  // SAFETY: fixtures use only keys and data shapes that this file's publisher scenarios need.
  return fixtureRecord(k, d, c, a);
}

function records(...entries: readonly VersionedRecord[]): Map<string, VersionedRecord> {
  return assembleRecords(entries);
}

function presetOf(presetRecord: VersionedRecord | undefined): Preset | null {
  const data = presetDataSchema.safeParse(presetRecord?.d);

  if (!data.success) {
    return null;
  }

  const decoded = decodePreset(data.data);

  return decoded.ok ? decoded.value : null;
}

function presetWithPartyVisibility(): Preset {
  return {
    v: PRESET.v,
    templates: PRESET.templates.map((template) =>
      template.id === 'party' ? Object.assign({}, template, { visibility: 'gm' }) : template,
    ),
  };
}

function tokenPreset(): Preset {
  return {
    v: 4,
    templates: [
      {
        id: 'party',
        title: 'Party',
        repeat: { nameField: 'name' },
        tabs: [
          {
            sections: [
              { rows: [{ cells: [{ kind: 'field', type: 'text', id: 'name' }] }] },
              {
                repeat: { id: 'item', nameField: 'item' },
                rows: [
                  {
                    cells: [
                      { kind: 'field', type: 'text', id: 'item' },
                      { kind: 'token', id: 'token' },
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
}

function party(count: number): WindowPublisherState['party'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index}`,
    name: 'Player',
    role: 'PLAYER' as const,
  }));
}

function counterRecords(recordLength: number, pendingLength: number) {
  return {
    replica: Array.from({ length: 5 }, (_, index) =>
      record(`blk:counter-${index}`, { value: 'x'.repeat(recordLength) }),
    ),
    pending: Array.from({ length: 5 }, (_, index) =>
      record(`blk:pending-${index}`, { value: 'x'.repeat(pendingLength) }, 1, 'player'),
    ),
  };
}

function bodyFreeMessageBytes(
  message: Extract<
    EngineMessage,
    {
      t: 'projection' | 'delta';
    }
  >,
): number {
  return jsonByteLength({ ...message, records: [], pending: [] });
}

function deltas(messages: readonly EngineMessage[]): Array<
  Pick<
    Extract<
      EngineMessage,
      {
        t: 'delta';
      }
    >,
    'records' | 'pending' | 'withdrawn'
  >
> {
  return messages.flatMap((message) =>
    message.t === 'delta'
      ? [{ records: message.records, pending: message.pending, withdrawn: message.withdrawn }]
      : [],
  );
}

function ids(...values: string[]): () => string {
  return () => values.shift() ?? 'unused';
}

function settle(): Promise<void> {
  return Array.from({ length: 12 }).reduce<Promise<void>>(
    (next) => next.then(() => undefined),
    Promise.resolve(),
  );
}
