import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';

import {
  DICE_PLUS_ACCESS_CHANNEL,
  DICE_PLUS_ERROR_CHANNEL,
  DICE_PLUS_READY_CHANNEL,
  DICE_PLUS_REQUEST_ACCESS_CHANNEL,
  DICE_PLUS_RESULT_CHANNEL,
} from '@/core/dice-plus';
import type { JsonValue } from '@/core/json';
import { err } from '@/core/result';
import { encodePreset, type Preset } from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import type { DiceExtensionTiming } from '@/core/timing';
import { UI_CHANNEL, type RollOutcome } from '@/core/ui-messages';
import {
  startFakeDiceExtension,
  type FakeDiceAccess,
  type FakeDiceAnswer,
  type FakeDiceExtension,
  type MockPlatform,
  type MockRoom,
} from '@/platform/current';
import type { PlayerRole } from '@/platform/ports';
import {
  createRoomRig,
  outcome,
  pause,
  requestRoll as trackedRoll,
  waitUntil,
  type RigClient,
} from '@/replica/room-rig';
import { copy } from '@/copy';

// Waits far past any test unless a test shortens one.
const DICE_TIMING: DiceExtensionTiming = {
  probeWaitMs: 1000,
  probeMaxAgeMs: 60000,
  resultTimeoutMs: 60000,
  startProbeRetries: 0,
  startProbeRetryMs: 60000,
  accessWaitMs: 60000,
};

const rollOutcomeMessageSchema = z.strictObject({
  t: z.literal('roll-outcome'),
  id: z.string(),
  outcome: z.discriminatedUnion('code', [
    z.strictObject({ code: z.literal('waiting-access') }),
    z.strictObject({ code: z.literal('rolled') }),
    z.strictObject({ code: z.literal('field'), field: z.string() }),
    z.strictObject({ code: z.literal('arithmetic') }),
    z.strictObject({ code: z.literal('refused') }),
    z.strictObject({ code: z.literal('failed') }),
  ]),
});

// A local die shows floor(0.3 * sides) + 1: a d20 7, a d6 2, a d3 1, a d1000 301.
const LOCAL_RANDOM = (): number => 0.3;

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
          title: 'Основное',
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
            { rows: [[{ kind: 'field', type: 'text', id: 'name' }]] },
          ],
        },
        {
          title: 'Заметки мастера',
          visibility: 'gm',
          sections: [
            {
              rows: [
                [
                  { kind: 'text', text: 'Секрет' },
                  { kind: 'field', type: 'number', id: 'secret' },
                  { kind: 'dice', formula: '1d20 + secret' },
                ],
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
      tabs: [
        {
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
    },
  ],
};

// `dex` is empty, so "Ловкость" gives the field error.
const SEEDED: VersionedRecord[] = [
  { k: 'preset', d: encodePreset(PRESET), c: 1, a: 'seed' },
  { k: 'sheet:brok', d: { set: 'pc', order: 0 }, c: 1, a: 'seed' },
  { k: 'row:brok:name', d: { name: 'Брок' }, c: 1, a: 'seed' },
  { k: 'row:brok:str', d: { str: 14, str_tired: true }, c: 1, a: 'seed' },
  { k: 'row:brok:secret', d: { secret: 4 }, c: 1, a: 'seed' },
  { k: 'row:npc:hp', d: { hp: 5 }, c: 1, a: 'seed' },
];

// A roll of the GM-only single sheet "npc".
const HIT_POINTS: RollRequest = {
  sheetId: 'npc',
  place: { tabIndex: 0, sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: null },
  shown: {},
};

const HIDDEN_SECRET: RollRequest = {
  sheetId: 'brok',
  place: { tabIndex: 1, sectionIndex: 0, rowIndex: 0, cellIndex: 2, instanceId: null },
  shown: {},
};

type ClientOptions = {
  role?: PlayerRole;
  name?: string;
  // The client's fake dice extension, started before its engine. None: no extension.
  dice?: FakeDiceAnswer;
  diceReady?: boolean;
  // The GM's answer for Muster Roll the extension starts with, and whether a GM is in the room.
  diceAccess?: FakeDiceAccess;
  gmInRoom?: boolean;
  // How long the extension holds a request for the GM's answer.
  promptTimeoutMs?: number;
  // The background's first access requests fail to send, one per entry.
  failAccessRequests?: number;
  diceTiming?: Partial<DiceExtensionTiming>;
  // The background's first sends fail, one per entry, from its start.
  failFirstSends?: number;
};

type Client = Omit<RigClient, 'local'> & {
  // Sends LOCAL on the client's own broadcast, as another extension of it would.
  local: MockPlatform;
  dice: FakeDiceExtension | null;
  // Every roll outcome the engine sent its windows, oldest first, by request id.
  outcomes: Map<string, RollOutcome[]>;
};

type RollRequest = Parameters<RigClient['window']['requestRoll']>[0];

type Room = { room: MockRoom; rolls: JsonValue[] };

const roomRig = createRoomRig({
  seeded: SEEDED,
  timing: { catchUpTimeoutMs: 200, stateAnswerDelayMaxMs: 5 },
  until: 'live',
});

// The path each roll took, as the engine logs it, oldest first.
let rollPaths: JsonValue[] = [];

beforeEach(() => {
  rollPaths = [];
  spyOn(console, 'info').mockImplementation((line: JsonValue) => {
    rollPaths.push(line);
  });
});

// A connection in the room and not in the party: it hears every roll.
function openRoom(): Room {
  const rigRoom = roomRig.openRoom();

  return {
    room: rigRoom.room,
    get rolls() {
      return rigRoom.heard.flatMap((message) =>
        Object(message.data).t === 'roll' ? [message.data] : [],
      );
    },
  };
}

async function startClient(
  room: Room,
  connectionId: string,
  options: ClientOptions = {},
): Promise<Client> {
  const outcomes = new Map<string, RollOutcome[]>();
  let accessFailures = options.failAccessRequests ?? 0;
  let dice: FakeDiceExtension | null = null;

  const client = roomRig.createClient(room.room, connectionId, {
    role: options.role,
    name: options.name,
    engine: {
      diceTiming: { ...DICE_TIMING, ...options.diceTiming },
      random: LOCAL_RANDOM,
      rollCopy: copy,
    },
  });

  const pagePlatform = client.newPage();
  dice =
    options.dice === undefined
      ? null
      : startFakeDiceExtension(pagePlatform.broadcast, connectionId, options.dice, {
          access: options.diceAccess,
          promptTimeoutMs: options.promptTimeoutMs,
        });
  dice?.setReady(options.diceReady ?? true);
  dice?.setGmInRoom(options.gmInRoom ?? true);
  roomRig.cleanup(
    pagePlatform.broadcast.onMessage(UI_CHANNEL, (event) => {
      const message = rollOutcomeMessageSchema.safeParse(event.data);

      if (!message.success) {
        return;
      }

      outcomes.set(message.data.id, [
        ...(outcomes.get(message.data.id) ?? []),
        message.data.outcome,
      ]);
    }),
  );
  roomRig.cleanup(() => dice?.stop());

  client.platform.failNextSends(
    Array.from({ length: options.failFirstSends ?? 0 }, () => ({
      kind: 'failed' as const,
      reason: 'test',
    })),
  );
  const sendMessage = client.platform.broadcast.sendMessage;
  client.platform.broadcast.sendMessage = async (channel, data, sendOptions) => {
    if (channel === DICE_PLUS_REQUEST_ACCESS_CHANNEL && accessFailures > 0) {
      accessFailures -= 1;

      return err({ kind: 'failed', reason: 'test' });
    }

    return sendMessage(channel, data, sendOptions);
  };

  await client.startEngine();
  client.openWindow();
  await roomRig.waitUntil(
    () => client.store.$loaded.get() && client.store.$sync.get().state === 'live',
  );

  return { ...client, local: pagePlatform, dice, outcomes };
}

// The dice cell of a character row, by its row and cell index.
function characterRow(rowIndex: number, cellIndex: number): RollRequest {
  return {
    sheetId: 'brok',
    place: { tabIndex: 0, sectionIndex: 0, rowIndex, cellIndex, instanceId: null },
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
  return finalOutcome(client, requestRoll(client, request));
}

// The request id of a roll the window sent.
function requestRoll(client: Client, request: RollRequest): string {
  return trackedRoll(client, request);
}

// The outcome that ends the roll. Waiting for the GM is none.
async function finalOutcome(client: Client, id: string): Promise<RollOutcome> {
  const final = (): RollOutcome | undefined => {
    const settled = outcome(client, id);

    return settled?.kind === 'answered'
      ? rollOutcomeMessageSchema.shape.outcome.parse(settled.answer)
      : undefined;
  };

  await waitUntil(() => final() !== undefined);

  const settledRoll = final();

  if (settledRoll === undefined) {
    throw new Error('the roll has no outcome');
  }

  return settledRoll;
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

    await waitUntil(() => shown(player).includes('Мастер: Брок, Удар — 31'));

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

  test('of a hidden single sheet shows the dice to GM clients only, and the notification on GM clients only', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
    });

    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    // #when: the sheet set roll after it reaches the player after it.
    await roll(gm, HIT_POINTS);
    await roll(gm, STRIKE);
    await waitUntil(() => shown(player).includes('Мастер: Брок, Удар — 31'));

    // #then
    expect({
      targets: requests(gm).map((request) => Object(request).rollTarget),
      shown: [gm, player].map(shown),
    }).toEqual({
      targets: ['gm_only', 'everyone'],
      shown: [['Мастер: NPC, Хиты — 22', 'Мастер: Брок, Удар — 31'], ['Мастер: Брок, Удар — 31']],
    });
  });

  test('from a hidden tab sends gm_only to the dice extension and no notification to a player', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
    });

    const player = await startClient(room, 'player', { role: 'PLAYER', name: 'Лиза' });

    // #when: the visible roll after it proves the player handled the hidden roll first.
    await roll(gm, HIDDEN_SECRET);
    await roll(gm, STRIKE);
    await waitUntil(() => shown(player).includes('Мастер: Брок, Удар — 31'));

    // #then
    expect({
      targets: requests(gm).map((request) => Object(request).rollTarget),
      shown: [gm, player].map(shown),
    }).toEqual({
      targets: ['gm_only', 'everyone'],
      shown: [
        ['Мастер: Брок, Секрет — 21', 'Мастер: Брок, Удар — 31'],
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
  test('with no extension that answers, after a fresh probe gets no answer, and logs why', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceReady: false,
      diceTiming: { probeWaitMs: 30 },
    });

    await pause(40);

    const probesBefore = gm.dice?.probes();

    // #when
    const outcome = await roll(gm, STRIKE);

    // #then
    expect({
      outcome,
      probes: (gm.dice?.probes() ?? 0) - (probesBefore ?? 0),
      requests: requests(gm),
      shown: shown(gm),
      paths: rollPaths,
    }).toEqual({
      outcome: { code: 'rolled' },
      probes: 1,
      requests: [],
      shown: ['Мастер: Брок, Удар — 21'],
      paths: ['Muster Roll rolled locally: no dice extension answered'],
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

  test('a roll with no extension last time waits for a fresh probe and uses the extension it finds', async () => {
    // #given: the probe at start went unanswered, as for an extension that loads after the start.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceReady: false,
      diceTiming: { probeWaitMs: 10 },
    });

    await pause(30);
    gm.dice?.setReady(true);

    // #when
    await roll(gm, STRIKE);

    // #then
    expect({
      probes: gm.dice?.probes(),
      requests: requests(gm).length,
      shown: shown(gm),
      paths: rollPaths,
    }).toEqual({
      probes: 2,
      requests: 1,
      shown: ['Мастер: Брок, Удар — 31'],
      paths: ['Muster Roll rolled with the dice extension'],
    });
  });

  test('a ready answer that comes after the probe wait still counts for the next roll', async () => {
    // #given: the extension answers the start probe late.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceReady: false,
      diceTiming: { probeWaitMs: 20 },
    });

    const probeIds: string[] = [];

    roomRig.cleanup(
      gm.local.broadcast.onMessage(DICE_PLUS_READY_CHANNEL, (event) => {
        const message = Object(event.data);

        if (message.ready === undefined) {
          probeIds.push(String(message.requestId));
        }
      }),
    );

    // The start probe went before the listener, so a roll's probe, after the start probe's wait,
    // gives the id to answer late.
    await pause(30);

    const first = roll(gm, STRIKE);

    await waitUntil(() => probeIds.length === 1);
    await first;
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_READY_CHANNEL,
      { requestId: probeIds[0] ?? '', ready: true, timestamp: 0, permitted: true },
      { destination: 'LOCAL' },
    );

    // #when
    await roll(gm, STRIKE);

    // #then: the first roll is local, the second uses the extension the late answer found.
    expect({ probes: gm.dice?.probes(), requests: requests(gm).length, shown: shown(gm) }).toEqual({
      probes: 2,
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

    // #then
    expect({
      probesAtStart,
      probes: gm.dice?.probes(),
      requests: requests(gm).length,
      shown: shown(gm),
    }).toEqual({
      probesAtStart: 0,
      probes: 1,
      requests: 1,
      shown: ['Мастер: Брок, Удар — 31'],
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

const DENIED_REASON = 'the GM has not allowed Muster Roll to roll dice in this room';

const NO_GM_REASON = 'no GM is in the room to allow Muster Roll to roll dice';

describe('a dice extension that lets Muster Roll roll only after the GM allows it', () => {
  test('is asked for access once by a GM client, though a second probe still finds no access', async () => {
    // #given: every roll probes again.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      diceTiming: { probeMaxAgeMs: 0 },
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);

    // #when: the roll's probe finds no access while the GM's prompt is open.
    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);
    gm.dice?.answerPrompt('allowed');
    await finalOutcome(gm, id);

    // #then
    expect({ probes: gm.dice?.probes(), accessRequests: gm.dice?.accessRequests() }).toEqual({
      probes: 2,
      accessRequests: [{ requestId: expect.any(String), source: 'app.muster-roll' }],
    });
  });

  test('that the GM allows at start rolls the first roll with no wait for the GM', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);
    gm.dice?.answerPrompt('allowed');
    await pause(20);

    // #when
    const id = requestRoll(gm, STRIKE);

    await finalOutcome(gm, id);

    // #then
    expect({ outcomes: gm.outcomes.get(id), shown: shown(gm) }).toEqual({
      outcomes: [{ code: 'rolled' }],
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test('keeps access learned from a roll over a probe answer that started before it', async () => {
    // #given: a player client, which never asks for access itself, learned of the GM's answer from
    // its first roll, after its start probe found no access.
    const room = openRoom();
    await startClient(room, 'gm-a');

    const player = await startClient(room, 'player', {
      role: 'PLAYER',
      name: 'Лиза',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    const first = requestRoll(player, STRIKE);

    await waitUntil(() => requests(player).length === 1);
    player.dice?.answerPrompt('allowed');
    await finalOutcome(player, first);

    // #when: the start probe's answer comes again, late.
    await player.local.broadcast.sendMessage(
      DICE_PLUS_READY_CHANNEL,
      { requestId: player.dice?.lastProbeId() ?? '', ready: true, timestamp: 0, permitted: false },
      { destination: 'LOCAL' },
    );

    const second = requestRoll(player, STRIKE);

    await finalOutcome(player, second);

    // #then
    expect(player.outcomes.get(second)).toEqual([{ code: 'rolled' }]);
  });

  test('is asked again by a GM client when a probe finds that the extension forgot its access', async () => {
    // #given: the GM allowed at start, and every roll probes again.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      diceTiming: { probeMaxAgeMs: 0 },
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);
    gm.dice?.answerPrompt('allowed');
    await roll(gm, STRIKE);
    gm.dice?.setAccess('unknown');

    // #when
    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 2);
    gm.dice?.answerPrompt('allowed');
    await finalOutcome(gm, id);

    // #then
    expect({
      accessRequests: gm.dice?.accessRequests().length,
      outcomes: gm.outcomes.get(id),
    }).toEqual({
      accessRequests: 2,
      outcomes: [{ code: 'waiting-access' }, { code: 'rolled' }],
    });
  });

  test("lets a player's next roll go with no wait for the GM once a roll came back", async () => {
    // #given: the player's probe found no access, and the GM allowed during the first roll.
    const room = openRoom();
    await startClient(room, 'gm-a');

    const player = await startClient(room, 'player', {
      role: 'PLAYER',
      name: 'Лиза',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    const first = requestRoll(player, STRIKE);

    await waitUntil(() => requests(player).length === 1);
    player.dice?.answerPrompt('allowed');
    await finalOutcome(player, first);

    // #when: within the probe's max age, so no probe tells the player of the answer.
    const second = requestRoll(player, STRIKE);

    await finalOutcome(player, second);

    // #then
    expect([first, second].map((id) => player.outcomes.get(id))).toEqual([
      [{ code: 'waiting-access' }, { code: 'rolled' }],
      [{ code: 'rolled' }],
    ]);
  });

  test.each<[string, FakeDiceAccess]>([
    ['that already allowed Muster Roll', 'allowed'],
    ['that knows no access, as the commercial Dice+', 'unmanaged'],
  ])('%s is not asked for access, and rolls with no wait for the GM', async (_name, access) => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: access,
    });

    // #when
    const id = requestRoll(gm, STRIKE);

    await finalOutcome(gm, id);

    // #then
    expect({
      accessRequests: gm.dice?.accessRequests(),
      outcomes: gm.outcomes.get(id),
      shown: shown(gm),
    }).toEqual({
      accessRequests: [],
      outcomes: [{ code: 'rolled' }],
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test("is never asked for access by a player client, whose roll waits for the GM's answer", async () => {
    // #given
    const room = openRoom();
    await startClient(room, 'gm-a');

    const player = await startClient(room, 'player', {
      role: 'PLAYER',
      name: 'Лиза',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    const id = requestRoll(player, STRIKE);

    await waitUntil(() => requests(player).length === 1 && player.outcomes.has(id));

    // #when
    player.dice?.answerPrompt('allowed');
    await finalOutcome(player, id);

    // #then
    expect({
      accessRequests: player.dice?.accessRequests(),
      outcomes: player.outcomes.get(id),
      shown: shown(player),
    }).toEqual({
      accessRequests: [],
      outcomes: [{ code: 'waiting-access' }, { code: 'rolled' }],
      shown: ['Лиза: Брок, Удар — 31'],
    });
  });

  test('takes a roll while the GM has not answered, and the window hears it waits until the GM allows it', async () => {
    // #given
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1 && gm.outcomes.has(id));

    const waiting = gm.outcomes.get(id);

    // #when
    gm.dice?.answerPrompt('allowed');
    await finalOutcome(gm, id);

    // #then
    expect({ waiting, outcomes: gm.outcomes.get(id), shown: shown(gm) }).toEqual({
      waiting: [{ code: 'waiting-access' }],
      outcomes: [{ code: 'waiting-access' }, { code: 'rolled' }],
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test('refuses a waiting roll when the GM denies, and it rolls locally', async () => {
    // #given
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);

    // #when
    gm.dice?.answerPrompt('denied');
    await finalOutcome(gm, id);

    // #then
    expect({
      outcomes: gm.outcomes.get(id),
      shown: shown(gm),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      outcomes: [{ code: 'waiting-access' }, { code: 'rolled' }],
      shown: ['Мастер: Брок, Удар — 21'],
      reasons: [DENIED_REASON],
    });
  });

  test('refuses a waiting roll when the GM does not answer in time, and it rolls locally', async () => {
    // #given: the GM's prompt for the start's access request timed out already.
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      promptTimeoutMs: 30,
    });

    await pause(50);

    // #when
    const id = requestRoll(gm, STRIKE);

    await finalOutcome(gm, id);

    // #then
    expect({
      outcomes: gm.outcomes.get(id),
      shown: shown(gm),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      outcomes: [{ code: 'waiting-access' }, { code: 'rolled' }],
      shown: ['Мастер: Брок, Удар — 21'],
      reasons: [DENIED_REASON],
    });
  });

  test('with no GM in the room refuses a roll at once, the window hears no wait for a GM, and the next roll asks nothing', async () => {
    // #given: the GM left after the player loaded the sheets, so neither the extension nor the
    // party has a GM. The result wait is far past the test's wait limit.
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();
    const gm = await startClient(room, 'gm-a');

    const player = await startClient(room, 'player', {
      role: 'PLAYER',
      name: 'Лиза',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      gmInRoom: false,
    });

    gm.engine.stop();
    gm.platform.leaveParty();
    await pause(20);

    // #when
    const ids = [requestRoll(player, STRIKE)];

    await finalOutcome(player, ids[0] ?? '');
    ids.push(requestRoll(player, STRIKE));
    await finalOutcome(player, ids[1] ?? '');

    // #then
    expect({
      outcomes: ids.map((id) => player.outcomes.get(id)),
      requests: requests(player).length,
      shown: shown(player),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      outcomes: [[{ code: 'rolled' }], [{ code: 'rolled' }]],
      requests: 1,
      shown: ['Лиза: Брок, Удар — 21', 'Лиза: Брок, Удар — 21'],
      reasons: [NO_GM_REASON],
    });
  });

  test('answers a GM client with no-gm, so it rolls locally at once and asks again on a later probe', async () => {
    // #given: the extension sees no GM, and every roll probes again.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      gmInRoom: false,
      diceTiming: { probeMaxAgeMs: 0 },
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);
    await pause(20);

    // #when
    const id = requestRoll(gm, STRIKE);

    await finalOutcome(gm, id);

    // #then
    expect({
      accessRequests: gm.dice?.accessRequests().length,
      outcomes: gm.outcomes.get(id),
      requests: requests(gm).length,
      shown: shown(gm),
    }).toEqual({
      accessRequests: 2,
      outcomes: [{ code: 'rolled' }],
      requests: 0,
      shown: ['Мастер: Брок, Удар — 21'],
    });
  });

  test('that takes access back refuses the roll, a GM client asks again, and the next roll asks nothing', async () => {
    // #given: a roll went through, then the GM denied Muster Roll in the extension.
    const errors = spyOn(console, 'error').mockImplementation(() => undefined);
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
    });

    await roll(gm, STRIKE);
    gm.dice?.setAccess('denied');

    // #when
    const revoked = requestRoll(gm, STRIKE);

    await finalOutcome(gm, revoked);
    await waitUntil(() => gm.dice?.accessRequests().length === 1);
    await pause(20);
    await roll(gm, STRIKE);

    // #then
    expect({
      revoked: gm.outcomes.get(revoked),
      requests: requests(gm).length,
      shown: shown(gm),
      reasons: fallbackReasons(errors.mock.calls),
    }).toEqual({
      revoked: [{ code: 'rolled' }],
      requests: 2,
      shown: ['Мастер: Брок, Удар — 31', 'Мастер: Брок, Удар — 21', 'Мастер: Брок, Удар — 21'],
      reasons: [DENIED_REASON],
    });
  });

  test('is asked again by a GM client whose access request got no answer in time', async () => {
    // #given: the extension holds the request far past the client's own wait, and every roll
    // probes again.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      diceTiming: { probeWaitMs: 20, probeMaxAgeMs: 0, accessWaitMs: 30 },
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);
    await pause(80);

    // #when
    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);
    gm.dice?.answerPrompt('allowed');
    await finalOutcome(gm, id);

    // #then
    expect({ accessRequests: gm.dice?.accessRequests().length, shown: shown(gm) }).toEqual({
      accessRequests: 2,
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test('is asked again on a later probe when the access request could not be sent', async () => {
    // #given: every roll probes again.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      diceTiming: { probeMaxAgeMs: 0 },
      failAccessRequests: 1,
    });

    await pause(20);

    const atStart = gm.dice?.accessRequests().length;

    // #when
    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);
    gm.dice?.answerPrompt('allowed');
    await finalOutcome(gm, id);

    // #then
    expect({ atStart, accessRequests: gm.dice?.accessRequests().length }).toEqual({
      atStart: 0,
      accessRequests: 1,
    });
  });

  test('is asked for access by a client that becomes a GM', async () => {
    // #given
    const room = openRoom();
    await startClient(room, 'gm-a');

    const player = await startClient(room, 'player', {
      role: 'PLAYER',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    await pause(20);

    const asPlayer = player.dice?.accessRequests().length;

    // #when
    player.platform.setRole('GM');
    await waitUntil(() => player.dice?.accessRequests().length === 1);

    // #then
    expect({ asPlayer, asGm: player.dice?.accessRequests().length }).toEqual({
      asPlayer: 0,
      asGm: 1,
    });
  });

  test("starts a queued roll's result wait when its request goes out", async () => {
    // #given: the second roll waits behind the first longer than a result wait.
    const room = openRoom();
    const LOCAL = { destination: 'LOCAL' } as const;

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'silent' },
      diceTiming: { resultTimeoutMs: 100 },
    });

    const first = requestRoll(gm, STRIKE);
    const second = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);
    await pause(70);
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_RESULT_CHANNEL,
      resultOf(String(Object(requests(gm)[0]).rollId), [['d20', [17]]]),
      LOCAL,
    );
    await waitUntil(() => requests(gm).length === 2);
    await pause(50);

    // #when: 120 ms after the second roll was asked for, 50 ms after its request went out.
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_RESULT_CHANNEL,
      resultOf(String(Object(requests(gm)[1]).rollId), [['d20', [15]]]),
      LOCAL,
    );
    await Promise.all([finalOutcome(gm, first), finalOutcome(gm, second)]);

    // #then
    expect(shown(gm)).toEqual(['Мастер: Брок, Удар — 31', 'Мастер: Брок, Удар — 29']);
  });

  test('that the GM denied earlier gets no roll: each rolls locally at once, and a GM client does not ask again', async () => {
    // #given: the start probe asked, and the extension answered with the stored denial. Every roll
    // probes again.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'denied',
      diceTiming: { probeMaxAgeMs: 0 },
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);
    await pause(20);

    // #when
    const ids = [requestRoll(gm, STRIKE)];

    await finalOutcome(gm, ids[0] ?? '');
    ids.push(requestRoll(gm, STRIKE));
    await finalOutcome(gm, ids[1] ?? '');

    // #then
    expect({
      probes: gm.dice?.probes(),
      accessRequests: gm.dice?.accessRequests().length,
      requests: requests(gm).length,
      outcomes: ids.map((id) => gm.outcomes.get(id)),
      shown: shown(gm),
      paths: rollPaths,
    }).toEqual({
      probes: 3,
      accessRequests: 1,
      requests: 0,
      outcomes: [[{ code: 'rolled' }], [{ code: 'rolled' }]],
      shown: ['Мастер: Брок, Удар — 21', 'Мастер: Брок, Удар — 21'],
      paths: [
        'Muster Roll rolled locally: access refused',
        'Muster Roll rolled locally: access refused',
      ],
    });
  });

  test('is asked again by a GM client after a timeout answer, when a later probe still finds no access', async () => {
    // #given: the start probe asked, and the GM let the prompt time out.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      diceTiming: { probeMaxAgeMs: 0 },
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);
    gm.dice?.answerPrompt('timeout');
    await pause(20);

    // #when: the roll probes again.
    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);
    gm.dice?.answerPrompt('allowed');
    await finalOutcome(gm, id);

    // #then
    expect({ accessRequests: gm.dice?.accessRequests().length, shown: shown(gm) }).toEqual({
      accessRequests: 2,
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test('gets the access wait on top of the result wait for a roll the GM has not allowed', async () => {
    // #given: the GM answers after the result wait alone, and within it with the access wait.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
      diceTiming: { resultTimeoutMs: 50, accessWaitMs: 1000 },
    });

    const id = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);
    await pause(100);

    // #when
    gm.dice?.answerPrompt('allowed');

    // #then
    expect({ outcome: await finalOutcome(gm, id), shown: shown(gm) }).toEqual({
      outcome: { code: 'rolled' },
      shown: ['Мастер: Брок, Удар — 31'],
    });
  });

  test("takes only its own access request's allowed answer as access, never pending", async () => {
    // #given: the GM's prompt is open, and stray answers come on the access channel.
    const room = openRoom();

    const gm = await startClient(room, 'gm-a', {
      name: 'Мастер',
      dice: { kind: 'faces', faces: [17] },
      diceAccess: 'unknown',
    });

    await waitUntil(() => gm.dice?.accessRequests().length === 1);

    const LOCAL = { destination: 'LOCAL' } as const;
    const ownId = String(gm.dice?.accessRequests()[0]?.requestId);

    await gm.local.broadcast.sendMessage(
      DICE_PLUS_ACCESS_CHANNEL,
      { requestId: 'other', status: 'allowed' },
      LOCAL,
    );
    await gm.local.broadcast.sendMessage(
      DICE_PLUS_ACCESS_CHANNEL,
      { requestId: ownId, status: 'yes' },
      LOCAL,
    );
    await gm.local.broadcast.sendMessage(DICE_PLUS_ACCESS_CHANNEL, 'allowed', LOCAL);

    const first = requestRoll(gm, STRIKE);

    await waitUntil(() => requests(gm).length === 1);

    // #when: the GM allows, which answers the access request too.
    gm.dice?.answerPrompt('allowed');
    await finalOutcome(gm, first);

    const second = requestRoll(gm, STRIKE);

    await finalOutcome(gm, second);

    // #then
    expect([first, second].map((id) => gm.outcomes.get(id))).toEqual([
      [{ code: 'waiting-access' }, { code: 'rolled' }],
      [{ code: 'rolled' }],
    ]);
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
