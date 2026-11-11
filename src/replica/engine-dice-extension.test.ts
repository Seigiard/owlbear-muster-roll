import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { DICE_PLUS_ERROR_CHANNEL, DICE_PLUS_RESULT_CHANNEL } from '@/core/dice-plus';
import type { JsonValue } from '@/core/json';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { SYNC_CHANNEL } from '@/core/room-messages';
import type { DiceExtensionTiming, Timing } from '@/core/timing';
import type { RollOutcome } from '@/core/ui-messages';
import {
  createMemoryBus,
  createMemoryRoom,
  createMockPlatform,
  startFakeDiceExtension,
  type FakeDiceAnswer,
  type FakeDiceExtension,
  type MockPlatform,
  type MockRoom,
  type MockStorageBacking,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine, type ReplicaEngine } from '@/replica/engine';
import { copy } from '@/ui/copy';
import { createProjectionStore, type ProjectionStore } from '@/ui/projection-store';
import { startReplicaClient, type ReplicaClient, type RollRequest } from '@/ui/replica-client';

const TIMING: Timing = {
  sendSpacingMs: 0,
  rateLimitBackoffStartMs: 1,
  rateLimitBackoffMaxMs: 2,
  projectionRequestRepeatMs: 25,
  projectionIncompleteTimeoutMs: 80,
  fieldSavePauseMs: 1,
  catchUpTimeoutMs: 200,
  stateAnswerDelayMinMs: 0,
  stateAnswerDelayMaxMs: 5,
  gmLinkTimeoutMs: 60000,
  snapshotPauseMs: 60000,
  snapshotJitterMs: 0,
  openRequestTtlMs: 15000,
  proposeResendStartMs: 2000,
  proposeResendMaxMs: 30000,
  editDeniedQuietMs: 2000,
  pendingMarkDelayMs: 1000,
  presetRequestTimeoutMs: 15000,
  incompleteRequestStartMs: 2000,
  incompleteRequestMaxMs: 30000,
  snapshotImportTimeoutMs: 60000,
};

// Waits far past any test unless a test shortens one.
const DICE_TIMING: DiceExtensionTiming = {
  probeWaitMs: 1000,
  probeMaxAgeMs: 60000,
  resultTimeoutMs: 60000,
  startProbeRetries: 0,
  startProbeRetryMs: 60000,
};

const STORAGE_PREFIX = 'mr1:mock-room:0::';
const WAIT_LIMIT_MS = 2000;
const POLL_MS = 2;

// A local die shows floor(0.3 * sides) + 1: a d20 7, a d6 2, a d3 1, a d1000 301.
const LOCAL_RANDOM = (): number => 0.3;

const PRESET: Preset = {
  v: 1,
  character: {
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
            { kind: 'text', text: 'Удар' },
            { kind: 'dice', formula: '1d20 + str' },
          ],
          [
            { kind: 'text', text: 'Залп' },
            { kind: 'dice', formula: '2d6 + 1d8 - 1d4' },
          ],
          [
            { kind: 'text', text: 'Число' },
            { kind: 'dice', formula: 'str + 2' },
          ],
          [
            { kind: 'text', text: 'Тройка' },
            { kind: 'dice', formula: '1d3 + str' },
          ],
          [
            { kind: 'text', text: 'Тысяча' },
            { kind: 'dice', formula: '1d1000' },
          ],
          [
            { kind: 'text', text: 'Тридцать' },
            { kind: 'dice', formula: '30d6' },
          ],
          [
            { kind: 'text', text: 'Шестьдесят' },
            { kind: 'dice', formula: '20d6 + 20d6 + 20d6' },
          ],
          [
            { kind: 'text', text: 'Кости' },
            { kind: 'dice', formula: '1d20 + 1d4' },
          ],
          [
            { kind: 'text', text: 'Смесь' },
            { kind: 'dice', formula: '2d6 + 1d8 - 1d6' },
          ],
          [
            { kind: 'text', text: 'Десятка' },
            { kind: 'dice', formula: '1d10' },
          ],
          [
            { kind: 'text', text: 'Сотня' },
            { kind: 'dice', formula: '1d100' },
          ],
          [
            { kind: 'text', text: 'Деление' },
            { kind: 'dice', formula: '10 / (1d6 - 3)' },
          ],
        ],
      },
    ],
  },
  npc: {
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
};

// `dex` is empty, so "Ловкость" gives the field error.
const SEEDED: VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { kind: 'pc', name: 'Брок', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:str', d: { str: 14, str_tired: true }, c: 1, a: 'seed' },
  { k: 'sheet:skel', d: { kind: 'npc', name: 'Скелет', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:skel:hp', d: { hp: 5 }, c: 1, a: 'seed' },
];

const HIT_POINTS: RollRequest = {
  sheetId: 'skel',
  place: { sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: null },
  shown: {},
};

type ClientOptions = {
  role?: PlayerRole;
  name?: string;
  // The client's fake dice extension, started before its engine. None: no extension.
  dice?: FakeDiceAnswer;
  diceReady?: boolean;
  diceTiming?: Partial<DiceExtensionTiming>;
  // The background's first sends fail, one per entry, from its start.
  failFirstSends?: number;
};

type Client = {
  platform: MockPlatform;
  engine: ReplicaEngine;
  store: ProjectionStore;
  window: ReplicaClient;
  // Sends LOCAL on the client's own broadcast, as another extension of it would.
  local: MockPlatform;
  dice: FakeDiceExtension | null;
};

type Room = { room: MockRoom; rolls: JsonValue[] };

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }

  mock.restore();
});

function createBacking(): MockStorageBacking {
  const entries = new Map<string, string>();

  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
    keys: () => [...entries.keys()],
  };
}

// A connection in the room and not in the party: it hears every roll.
function openRoom(): Room {
  const room = createMemoryRoom();

  const observer = createMockPlatform(createMemoryBus(), createBacking(), {
    room,
    connectionId: 'observer',
    playerId: 'observer',
    name: 'observer',
    role: 'PLAYER',
  });

  const rolls: JsonValue[] = [];

  cleanups.push(
    observer.broadcast.onMessage(SYNC_CHANNEL, (event) => {
      if (Object(event.data).t === 'roll') {
        rolls.push(event.data);
      }
    }),
  );

  return { room, rolls };
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const backing = createBacking();
  const bus = createMemoryBus();

  const identity = {
    room: room.room,
    connectionId,
    playerId: connectionId,
    name: options.name ?? connectionId,
    role: options.role ?? 'GM',
  };

  const platform = createMockPlatform(bus, backing, identity);
  const local = createMockPlatform(bus, backing, identity);

  for (const record of SEEDED) {
    backing.set(`${STORAGE_PREFIX}${record.k}`, JSON.stringify(record));
  }

  platform.joinParty();

  const dice =
    options.dice === undefined
      ? null
      : startFakeDiceExtension(local.broadcast, connectionId, options.dice);

  dice?.setReady(options.diceReady ?? true);
  platform.failNextSends(
    Array.from({ length: options.failFirstSends ?? 0 }, () => ({
      kind: 'failed' as const,
      reason: 'test',
    })),
  );

  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING), {
    timing: TIMING,
    diceTiming: { ...DICE_TIMING, ...options.diceTiming },
    random: LOCAL_RANDOM,
    rollCopy: copy,
  });

  const store = createProjectionStore();
  const windowPlatform = createMockPlatform(bus, backing, identity);

  const window = startReplicaClient(
    windowPlatform.broadcast,
    createSendQueue(windowPlatform.broadcast, TIMING),
    store,
    TIMING,
  );

  cleanups.push(engine.stop, window.stop, () => dice?.stop());
  await waitUntil(() => store.$loaded.get() && store.$sync.get().state === 'live');
  // The fake answers a probe as it hears it, so the engine knows it is ready once it is counted.
  await waitUntil(() => dice === null || dice.probes() > 0 || (options.failFirstSends ?? 0) > 0);

  return { platform, engine, store, window, local, dice };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('the condition never became true');
    }

    // Polling is the point here: each round has to let the paced queues run.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// The dice cell of a character row, by its row and cell index.
function characterRow(rowIndex: number, cellIndex: number): RollRequest {
  return {
    sheetId: 'brok',
    place: { sectionIndex: 0, rowIndex, cellIndex, instanceId: null },
    shown: {},
  };
}

const STRENGTH = characterRow(0, 3);
const DEXTERITY = characterRow(1, 2);
const STRIKE = characterRow(2, 1);
const VOLLEY = characterRow(3, 1);
const NUMBER = characterRow(4, 1);
const THREE = characterRow(5, 1);
const THOUSAND = characterRow(6, 1);
const THIRTY = characterRow(7, 1);
const SIXTY = characterRow(8, 1);
const BONES = characterRow(9, 1);
const MIX = characterRow(10, 1);
const TEN = characterRow(11, 1);
const HUNDRED = characterRow(12, 1);
const DIVISION = characterRow(13, 1);

async function roll(client: Client, request: RollRequest): Promise<RollOutcome> {
  const sent = client.window.requestRoll(request);

  if (!sent.ok) {
    throw new Error(`the window refused the roll: ${sent.error}`);
  }

  await waitUntil(() => client.store.$rollOutcomes.get().has(sent.value));

  const outcome = client.store.$rollOutcomes.get().get(sent.value)?.outcome;

  if (outcome === undefined) {
    throw new Error('the roll has no outcome');
  }

  return outcome;
}

function shown(client: Client): string[] {
  return client.platform.shownNotifications();
}

function requests(client: Client): JsonValue[] {
  return client.dice?.requests() ?? [];
}

// A result for the request in the Dice+ format, from groups of `[diceType, faces]`.
function resultOf(rollId: string, groups: [string, number[]][]): JsonValue {
  return {
    rollId,
    result: {
      totalValue: 0,
      rollSummary: '',
      groups: groups.map(([diceType, faces]) => ({
        description: diceType,
        diceType,
        dice: faces.map((value) => ({ value, kept: true })),
        total: 0,
        isNegative: false,
      })),
    },
  };
}

describe('a roll with a dice extension in the client', () => {
  test("of a character asks the extension for the formula's dice and shows its face everywhere", async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
    });

    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    // #when
    const outcome = await roll(gm, STRIKE);

    await waitUntil(() => shown(player).length === 1);

    // #then: 17 + str 14.
    expect({ outcome, requests: requests(gm), shown: [gm, player].map(shown) }).toEqual({
      outcome: { code: 'rolled' },
      requests: [
        {
          rollId: expect.any(String),
          playerId: 'gm-a',
          playerName: 'Мастер',
          rollTarget: 'everyone',
          diceNotation: '1d20',
          showResults: false,
          timestamp: expect.any(Number),
          source: 'app.muster-roll',
        },
      ],
      shown: [['Мастер: Брок, Удар — 31'], ['Мастер: Брок, Удар — 31']],
    });
  });

  test('of an NPC shows the dice to GM clients only, and the notification on GM clients only', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
    });

    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    // #when: the character roll after it reaches the player after it.
    await roll(gm, HIT_POINTS);
    await roll(gm, STRIKE);
    await waitUntil(() => shown(player).length === 1);

    // #then
    expect({
      targets: requests(gm).map((request) => Object(request).rollTarget),
      shown: [gm, player].map(shown),
    }).toEqual({
      targets: ['gm_only', 'everyone'],
      shown: [
        ['Мастер: Скелет, Хиты — 22', 'Мастер: Брок, Удар — 31'],
        ['Мастер: Брок, Удар — 31'],
      ],
    });
  });

  test("with a comparison compares the extension's face", async () => {
    // #given: the target is str 14 - 2 * 1 = 12, and a local die would show 7, a success.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [15] },
    });

    // #when
    await roll(gm, STRENGTH);

    // #then
    expect({ shown: shown(gm), rolls: room.rolls.map((sent) => Object(sent).result) }).toEqual({
      shown: ['Мастер: Брок, Сила — 15, провал'],
      rolls: [{ roll: 15, faces: [15], target: 12, targetFaces: [], outcome: 'failure' }],
    });
  });

  test('with several terms asks for each positive in dice set order and subtracts the d4 itself', async () => {
    // #given: dicex rolls the d4 first, then the d6s, then the d8.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [3, 6, 5, 8] },
    });

    // #when
    await roll(gm, VOLLEY);

    // #then: 6 + 5 + 8 - 3.
    expect({
      notation: requests(gm).map((request) => Object(request).diceNotation),
      shown: shown(gm),
    }).toEqual({ notation: ['1d4+2d6+1d8'], shown: ['Мастер: Брок, Залп — 16'] });
  });

  test.each<[string, RollRequest, number[], string, number[], string]>([
    ['out of the dice set order', BONES, [3, 17], '1d4+1d20', [17, 3], 'Кости — 20'],
    ['with repeated sides', MIX, [1, 2, 6, 8], '3d6+1d8', [1, 2, 8, 6], 'Смесь — 5'],
    ['on a d10 that shows 10', TEN, [10], '1d10', [10], 'Десятка — 10'],
  ])(
    'with terms %s takes the faces back in tree order',
    async (_name, request, faces, notation, treeFaces, text) => {
      // #given: the fake answers in the shapes dicex sends.
      const room = openRoom();

      const gm = await startClient(room, 'gm-a', {
        name: 'Мастер',
        dice: { kind: 'faces', faces },
      });

      // #when
      await roll(gm, request);

      // #then
      expect({
        notation: requests(gm).map((sent) => Object(sent).diceNotation),
        faces: room.rolls.map((sent) => Object(Object(sent).result).faces),
        shown: shown(gm),
      }).toEqual({ notation: [notation], faces: [treeFaces], shown: [`Мастер: Брок, ${text}`] });
    },
  );

  test('whose extension faces give an arithmetic error refuses the roll and rolls nothing locally', async () => {
    // #given: a local d6 would show 2, which divides; the extension's 3 divides by zero.
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { dice: { kind: 'faces', faces: [3] } });

    // #when
    const outcome = await roll(gm, DIVISION);

    // #then
    expect({ outcome, requests: requests(gm).length, rolls: room.rolls, shown: shown(gm) }).toEqual(
      {
        outcome: { code: 'arithmetic' },
        requests: 1,
        rolls: [],
        shown: [],
      },
    );
  });

  test('waits for the roll before it, as dicex keeps one request at a time', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер', dice: { kind: 'silent' } });
    const first = roll(gm, STRIKE);
    const second = roll(gm, STRENGTH);

    await waitUntil(() => requests(gm).length === 1);
    await pause(20);

    const waiting = requests(gm).length;
    const LOCAL = { destination: 'LOCAL' } as const;

    // #when
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_RESULT_CHANNEL,
      resultOf(String(Object(requests(gm)[0]).rollId), [['d20', [17]]]),
      LOCAL,
    );
    await waitUntil(() => requests(gm).length === 2);
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_RESULT_CHANNEL,
      resultOf(String(Object(requests(gm)[1]).rollId), [['d20', [15]]]),
      LOCAL,
    );

    // #then
    expect({
      waiting,
      outcomes: await Promise.all([first, second]),
      shown: shown(gm),
    }).toEqual({
      waiting: 1,
      outcomes: [{ code: 'rolled' }, { code: 'rolled' }],
      shown: ['Мастер: Брок, Удар — 31', 'Мастер: Брок, Сила — 15, провал'],
    });
  });

  test.each([
    ['no dice', NUMBER, 'Число — 16'],
    ['a d3', THREE, 'Тройка — 15'],
    ['a d1000', THOUSAND, 'Тысяча — 301'],
    ['30 dice in one term', THIRTY, 'Тридцать — 60'],
    ['60 dice in all', SIXTY, 'Шестьдесят — 120'],
  ])('with %s rolls locally and asks the extension nothing', async (_name, request, text) => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [6] },
    });

    // #when
    await roll(gm, request);

    // #then
    expect({ requests: requests(gm), shown: shown(gm) }).toEqual({
      requests: [],
      shown: [`Мастер: Брок, ${text}`],
    });
  });

  test('with a field error shows the error and asks the extension nothing', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { dice: { kind: 'faces', faces: [17] } });

    // #when
    const outcome = await roll(gm, DEXTERITY);

    // #then
    expect({ outcome, requests: requests(gm), rolls: room.rolls }).toEqual({
      outcome: { code: 'field', field: 'Ловкость' },
      requests: [],
      rolls: [],
    });
  });
});

describe('a roll falls back to a local roll', () => {
  test('with no extension that answers, at once, while the probe still waits', async () => {
    // #given: the probe at start waits far past the roll.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceReady: false,
      diceTiming: { probeWaitMs: 60000 },
    });

    // #when
    const outcome = await roll(gm, STRIKE);

    // #then
    expect({ outcome, requests: requests(gm), shown: shown(gm) }).toEqual({
      outcome: { code: 'rolled' },
      requests: [],
      shown: ['Мастер: Брок, Удар — 21'],
    });
  });

  test('on an error reply, and logs its reason', async () => {
    // #given
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер', dice: { kind: 'error' } });

    // #when
    await roll(gm, STRIKE);

    // #then
    expect({
      requests: requests(gm).length,
      shown: shown(gm),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      requests: 1,
      shown: ['Мастер: Брок, Удар — 21'],
      reasons: ['the extension refused the roll: the fake dice extension refused the roll'],
    });
  });

  test('at once on an error reply that carries only its roll id', async () => {
    // #given: the result wait is far past the test's wait limit.
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'silent' },
    });

    const outcome = roll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);

    // #when
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_ERROR_CHANNEL,
      { rollId: String(Object(requests(gm)[0]).rollId) },
      { destination: 'LOCAL' },
    );

    // #then
    expect({
      outcome: await outcome,
      shown: shown(gm),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      outcome: { code: 'rolled' },
      shown: ['Мастер: Брок, Удар — 21'],
      reasons: ['the extension refused the roll: no reason given'],
    });
  });

  test.each<[string, [string, number[]][], string]>([
    ['no group', [], 'the result has 0 dice groups, not 1'],
    [
      'two groups for one term',
      [
        ['d20', [5]],
        ['d20', [6]],
      ],
      'the result has 2 dice groups, not 1',
    ],
    ['a group of another die', [['d12', [5]]], 'group 1 is not d20'],
    ['two dice for one', [['d20', [5, 6]]], 'group 1 has 2 dice, not 1'],
    ['a face of 0', [['d20', [0]]], 'group 1 has the face 0'],
    ['a face of 21', [['d20', [21]]], 'group 1 has the face 21'],
    ['a face of 2.5', [['d20', [2.5]]], 'group 1 has the face 2.5'],
  ])('on a result with %s, and logs its reason', async (_name, groups, reason) => {
    // #given
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'result', result: (request) => resultOf(request.rollId, groups) },
    });

    // #when
    await roll(gm, STRIKE);

    // #then
    expect({ shown: shown(gm), reasons: fallbackReasons(errors.mock.calls) }).toEqual({
      shown: ['Мастер: Брок, Удар — 21'],
      reasons: [reason],
    });
  });

  test('when no result comes in time, and logs its reason', async () => {
    // #given
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'silent' },
      diceTiming: { resultTimeoutMs: 50 },
    });

    // #when
    const outcome = await roll(gm, STRIKE);

    // #then
    expect({
      outcome,
      requests: requests(gm).length,
      shown: shown(gm),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      outcome: { code: 'rolled' },
      requests: 1,
      shown: ['Мастер: Брок, Удар — 21'],
      reasons: ['no result in time'],
    });
  });

  test('at once when the roll request cannot be sent, well before the result wait', async () => {
    // #given: the result wait is far past the test's wait limit.
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер', dice: { kind: 'silent' } });

    gm.platform.failNextSends([{ kind: 'failed', reason: 'test' }]);

    // #when
    const outcome = await roll(gm, STRIKE);

    // #then
    expect({
      outcome,
      requests: requests(gm).length,
      shown: shown(gm),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      outcome: { code: 'rolled' },
      requests: 0,
      shown: ['Мастер: Брок, Удар — 21'],
      reasons: ['the roll request was not sent'],
    });
  });

  test('for a d100, which dicex reports as tens only', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [57] },
    });

    // #when
    await roll(gm, HUNDRED);

    // #then: floor(0.3 * 100) + 1.
    expect({ requests: requests(gm), shown: shown(gm) }).toEqual({
      requests: [],
      shown: ['Мастер: Брок, Сотня — 31'],
    });
  });

  test('and never after a valid result: a late result changes nothing', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
    });

    await roll(gm, STRIKE);

    const rollId = String(Object(requests(gm)[0]).rollId);

    // #when: the same roll answered again, with an error and with other faces.
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_ERROR_CHANNEL,
      { rollId, error: 'late', notation: '1d20' },
      { destination: 'LOCAL' },
    );
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_RESULT_CHANNEL,
      resultOf(rollId, [['d20', [2]]]),
      { destination: 'LOCAL' },
    );
    await pause(20);

    // #then
    expect({ shown: shown(gm), rolls: room.rolls.length }).toEqual({
      shown: ['Мастер: Брок, Удар — 31'],
      rolls: 1,
    });
  });
});

describe('the dice extension client', () => {
  test('ignores replies to other rolls and messages it cannot read', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { name: 'Мастер', dice: { kind: 'silent' } });
    const outcome = roll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);

    const rollId = String(Object(requests(gm)[0]).rollId);
    const LOCAL = { destination: 'LOCAL' } as const;

    // #when
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_RESULT_CHANNEL,
      resultOf('other', [['d20', [3]]]),
      LOCAL,
    );
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_ERROR_CHANNEL,
      { rollId: 'other', error: 'x', notation: '' },
      LOCAL,
    );
    await gm.local.broadcast.sendMessage(DICE_PLUS_RESULT_CHANNEL, 'not a result', LOCAL);
    await gm.local.broadcast.sendMessage(DICE_PLUS_ERROR_CHANNEL, { error: 'no roll id' }, LOCAL);
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_RESULT_CHANNEL,
      resultOf(rollId, [['d20', [12]]]),
      LOCAL,
    );

    // #then: 12 + str 14.
    expect({ outcome: await outcome, shown: shown(gm) }).toEqual({
      outcome: { code: 'rolled' },
      shown: ['Мастер: Брок, Удар — 26'],
    });
  });

  test('probes at start, and a roll does not probe again within the max age', async () => {
    // #given
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { dice: { kind: 'faces', faces: [17] } });

    // #when
    await roll(gm, STRIKE);
    await roll(gm, STRIKE);

    // #then
    expect({ probes: gm.dice?.probes(), requests: requests(gm).length }).toEqual({
      probes: 1,
      requests: 2,
    });
  });

  test('a roll after the max age probes again and waits for an extension that answered last time', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceTiming: { probeMaxAgeMs: 0 },
    });

    // #when
    await roll(gm, STRIKE);

    // #then
    expect({ probes: gm.dice?.probes(), shown: shown(gm) }).toEqual({
      probes: 2,
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test('a roll after the max age with no extension last time rolls locally and refreshes in the background', async () => {
    // #given: the probe at start went unanswered.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceReady: false,
      diceTiming: { probeWaitMs: 10, probeMaxAgeMs: 0 },
    });

    await pause(30);
    gm.dice?.setReady(true);

    // #when
    await roll(gm, STRIKE);
    await waitUntil(() => gm.dice?.probes() === 2);
    await roll(gm, STRIKE);

    // #then: the first roll is local, the second uses the extension the refresh found.
    expect({ requests: requests(gm).length, shown: shown(gm) }).toEqual({
      requests: 1,
      shown: ['Мастер: Брок, Удар — 21', 'Мастер: Брок, Удар — 31'],
    });
  });

  test('a roll after the max age waits out the probe of a removed extension and rolls locally', async () => {
    // #given: the extension answered at start, then went away.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceTiming: { probeWaitMs: 30, probeMaxAgeMs: 0 },
    });

    gm.dice?.setReady(false);

    // #when
    await roll(gm, STRIKE);

    // #then
    expect({ requests: requests(gm).length, shown: shown(gm) }).toEqual({
      requests: 0,
      shown: ['Мастер: Брок, Удар — 21'],
    });
  });

  test('a roll with no result in time marks the extension gone and probes again', async () => {
    // #given: the extension answered at start, then went away.
    spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'silent' },
      diceTiming: { resultTimeoutMs: 50 },
    });

    gm.dice?.setReady(false);

    // #when
    await roll(gm, STRIKE);
    await roll(gm, STRIKE);

    // #then: the second roll asks nothing, and the probe after the first one is the only new one.
    expect({ requests: requests(gm).length, probes: gm.dice?.probes(), shown: shown(gm) }).toEqual({
      requests: 1,
      probes: 2,
      shown: ['Мастер: Брок, Удар — 21', 'Мастер: Брок, Удар — 21'],
    });
  });

  test('a probe that cannot be sent counts as no extension, and a later roll probes again', async () => {
    // #given: the probe at start is the background's first send.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      failFirstSends: 1,
    });

    const probesAtStart = gm.dice?.probes();

    // #when
    await roll(gm, STRIKE);
    await waitUntil(() => gm.dice?.probes() === 1);
    await roll(gm, STRIKE);

    // #then
    expect({ probesAtStart, requests: requests(gm).length, shown: shown(gm) }).toEqual({
      probesAtStart: 0,
      requests: 1,
      shown: ['Мастер: Брок, Удар — 21', 'Мастер: Брок, Удар — 31'],
    });
  });

  test('an extension that loads after the start is found by a start probe retry', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceReady: false,
      diceTiming: { probeWaitMs: 10, startProbeRetries: 2, startProbeRetryMs: 20 },
    });

    gm.dice?.setReady(true);

    // #when
    await waitUntil(() => gm.dice?.probes() === 2);
    await roll(gm, STRIKE);

    // #then
    expect({ requests: requests(gm).length, shown: shown(gm) }).toEqual({
      requests: 1,
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test('a page that stops while a roll waits for its dice logs no local roll and sends nothing', async () => {
    // #given
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();
    const gm = await startClient(room, 'gm-a', { dice: { kind: 'silent' } });

    gm.window.requestRoll(STRIKE);
    await waitUntil(() => requests(gm).length === 1);

    // #when
    gm.engine.stop();
    await pause(20);

    // #then
    expect({ reasons: fallbackReasons(errors.mock.calls), rolls: room.rolls }).toEqual({
      reasons: [],
      rolls: [],
    });
  });

  test("a player's roll asks for its own player", async () => {
    // #given
    const room = openRoom();
    await startClient(room, 'gm-a');

    const player = await startClient(room, 'player', {
      role: 'PLAYER',
      name: 'Лиза',
      dice: { kind: 'faces', faces: [17] },
    });

    // #when
    await roll(player, STRIKE);

    // #then
    expect(requests(player).map((request) => Object(request).playerId)).toEqual(['player']);
  });
});

// The reasons logged for each roll that fell back to a local one, oldest first.
function fallbackReasons(calls: readonly (readonly JsonValue[])[]): JsonValue[] {
  return calls.flatMap((call) =>
    call[0] === 'Muster Roll rolled locally, as the dice extension gave no faces:'
      ? [call[1] ?? null]
      : [],
  );
}
