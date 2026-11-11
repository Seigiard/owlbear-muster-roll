import {
  DICE_PLUS_ERROR_CHANNEL,
  DICE_PLUS_NO_GM,
  DICE_PLUS_NOT_PERMITTED,
  DICE_PLUS_READY_CHANNEL,
  DICE_PLUS_REQUEST_ACCESS_CHANNEL,
  DICE_PLUS_RESULT_CHANNEL,
  DICE_PLUS_ROLL_REQUEST_CHANNEL,
  dicePlusAccessRequestSchema,
  dicePlusReadyProbeSchema,
  dicePlusRollRequestSchema,
  type DicePlusAccessRequest,
  type DicePlusAccessStatus,
  type DicePlusRollRequest,
} from '@/core/dice-plus';
import type { JsonValue } from '@/core/json';
import type { BroadcastOptions, BroadcastPort } from '@/platform/ports';

import type { FakeDiceAccess } from './client-params';

const LOCAL: BroadcastOptions = { destination: 'LOCAL' };

const DICE_TERM = /^(\d+)d(\d+)$/;

// The order of `dicex`'s standard dice set, in which it rolls and reports dice.
const DICEX_SET_ORDER = [4, 6, 8, 10, 12, 20, 100];

// How the fake answers a roll request. `faces` gives each die the next listed face, in the order
// `dicex` rolls them (its dice set order), from the start of the list for every request, and the
// last face to every die past its end. `result` sends the
// result the function makes, well formed or not. `error` sends a roll error, and `silent` nothing.
export type FakeDiceAnswer =
  | { kind: 'faces'; faces: readonly number[] }
  | { kind: 'result'; result: (request: DicePlusRollRequest) => JsonValue }
  | { kind: 'error' }
  | { kind: 'silent' };

// `dicex`'s `ACCESS_DECISION_TIMEOUT_MS`: how long it holds a request for the GM's answer.
const PROMPT_TIMEOUT_MS = 25000;

// What the GM does with the extension's prompt: answers it, or leaves it until `dicex` stops
// waiting.
export type FakePromptAnswer = 'allowed' | 'denied' | 'timeout';

export type FakeDiceExtension = {
  // Every roll request it took, oldest first, also the ones it holds for the GM's answer.
  requests: () => DicePlusRollRequest[];
  // Every probe it heard, answered or not, and the request id of the latest.
  probes: () => number;
  lastProbeId: () => string | null;
  // Every access request it heard, oldest first.
  accessRequests: () => DicePlusAccessRequest[];
  answerWith: (answer: FakeDiceAnswer) => void;
  // `false` leaves probes unanswered, as a room with no dice extension.
  setReady: (ready: boolean) => void;
  // `false`: no GM is in the room, so a source with no answer gets `no-gm`, and so does every
  // request held for the GM.
  setGmInRoom: (gmInRoom: boolean) => void;
  // Changes the room's answer, as a GM does in `dicex`'s GM tools. It answers no held request.
  setAccess: (access: FakeDiceAccess) => void;
  // Ends the open prompt: every held access request and roll gets the answer, and `allowed` or
  // `denied` becomes the room's answer.
  answerPrompt: (answer: FakePromptAnswer) => void;
  stop: () => void;
};

// `access`: the room's answer it starts with, `allowed` by default. `promptTimeoutMs`: how long it
// holds a request for the GM's answer before it counts as `timeout`, `dicex`'s 25 s by default.
export type FakeDiceOptions = { access?: FakeDiceAccess; promptTimeoutMs?: number };

// A Dice+ dice extension on one client's LOCAL broadcast, as `dicex` behaves: it answers a probe,
// and rolls only a request for its own player. It lets a source roll by the room's answer: with
// none and a GM in the room it holds an access request and a roll until `answerPrompt`, or until
// the prompt times out, as `dicex` holds them while the GM's prompt is open.
export function startFakeDiceExtension(
  broadcast: BroadcastPort,
  playerId: string,
  answer: FakeDiceAnswer,
  options: FakeDiceOptions = {},
): FakeDiceExtension {
  const taken: DicePlusRollRequest[] = [];
  const asked: DicePlusAccessRequest[] = [];
  const heldAccess: DicePlusAccessRequest[] = [];
  const heldRolls: DicePlusRollRequest[] = [];
  let current = answer;
  let decision = options.access ?? 'allowed';
  let promptTimer: ReturnType<typeof setTimeout> | undefined;
  let ready = true;
  let gmInRoom = true;
  let probes = 0;
  let lastProbeId: string | null = null;

  function send(channel: string, data: JsonValue): void {
    broadcast.sendMessage(channel, data, LOCAL).catch((error) => {
      console.error('The fake dice extension could not answer', error);
    });
  }

  const unsubscribeReady = broadcast.onMessage(DICE_PLUS_READY_CHANNEL, (event) => {
    const probe = dicePlusReadyProbeSchema.safeParse(event.data);

    // Its own answer comes back on the same channel, and carries `ready`.
    if (!probe.success || Object.hasOwn(Object(event.data), 'ready')) {
      return;
    }

    probes += 1;
    lastProbeId = probe.data.requestId;

    if (!ready) {
      return;
    }

    const reply = { requestId: probe.data.requestId, ready: true, timestamp: Date.now() };

    // A caller that names no source gets the reply of old, with no word on access.
    send(
      DICE_PLUS_READY_CHANNEL,
      decision === 'unmanaged' || probe.data.source === undefined
        ? reply
        : { ...reply, permitted: decision === 'allowed' },
    );
  });

  const unsubscribeAccess = broadcast.onMessage(DICE_PLUS_REQUEST_ACCESS_CHANNEL, (event) => {
    const request = dicePlusAccessRequestSchema.safeParse(event.data);

    if (!request.success || decision === 'unmanaged') {
      return;
    }

    asked.push(request.data);

    if (decision !== 'unknown') {
      sendAccess(request.data, decision);
    } else if (!gmInRoom) {
      sendAccess(request.data, 'no-gm');
    } else {
      sendAccess(request.data, 'pending');
      heldAccess.push(request.data);
      openPrompt();
    }
  });

  const unsubscribeRoll = broadcast.onMessage(DICE_PLUS_ROLL_REQUEST_CHANNEL, (event) => {
    const request = dicePlusRollRequestSchema.safeParse(event.data);

    if (!request.success || request.data.playerId !== playerId) {
      return;
    }

    taken.push(request.data);

    if (decision === 'allowed' || decision === 'unmanaged') {
      answerRequest(request.data);
    } else if (decision === 'denied') {
      refuse(request.data, DICE_PLUS_NOT_PERMITTED);
    } else if (!gmInRoom) {
      refuse(request.data, DICE_PLUS_NO_GM);
    } else {
      heldRolls.push(request.data);
      openPrompt();
    }
  });

  // One prompt serves every held request, as `dicex` asks the GM once per source.
  function openPrompt(): void {
    if (promptTimer === undefined) {
      promptTimer = setTimeout(() => {
        answerHeld('timeout', DICE_PLUS_NOT_PERMITTED);
      }, options.promptTimeoutMs ?? PROMPT_TIMEOUT_MS);
    }
  }

  // Every held access request gets `status`, and every held roll is rolled or refused with `error`.
  function answerHeld(status: DicePlusAccessStatus, error: string | null): void {
    clearTimeout(promptTimer);
    promptTimer = undefined;

    for (const request of heldAccess.splice(0)) {
      sendAccess(request, status);
    }

    for (const request of heldRolls.splice(0)) {
      if (error === null) {
        answerRequest(request);
      } else {
        refuse(request, error);
      }
    }
  }

  function sendAccess(request: DicePlusAccessRequest, status: DicePlusAccessStatus): void {
    send(`${request.source}/access`, { requestId: request.requestId, status });
  }

  function refuse(request: DicePlusRollRequest, error: string): void {
    send(DICE_PLUS_ERROR_CHANNEL, {
      rollId: request.rollId,
      error,
      notation: request.diceNotation,
    });
  }

  function answerRequest(request: DicePlusRollRequest): void {
    if (current.kind === 'silent') {
      return;
    }

    if (current.kind === 'error') {
      send(DICE_PLUS_ERROR_CHANNEL, {
        rollId: request.rollId,
        error: 'the fake dice extension refused the roll',
        notation: request.diceNotation,
      });

      return;
    }

    const result =
      current.kind === 'result' ? current.result(request) : rolledResult(request, current.faces);

    send(DICE_PLUS_RESULT_CHANNEL, result);
  }

  return {
    requests: () => [...taken],
    probes: () => probes,
    lastProbeId: () => lastProbeId,
    accessRequests: () => [...asked],
    answerWith: (next) => {
      current = next;
    },
    setReady: (next) => {
      ready = next;
    },
    setGmInRoom: (next) => {
      gmInRoom = next;

      if (!gmInRoom) {
        answerHeld('no-gm', DICE_PLUS_NO_GM);
      }
    },
    setAccess: (next) => {
      decision = next;
    },
    answerPrompt: (prompt) => {
      if (decision === 'unknown' && prompt !== 'timeout') {
        decision = prompt;
      }

      answerHeld(prompt, prompt === 'allowed' ? null : DICE_PLUS_NOT_PERMITTED);
    },
    stop: () => {
      clearTimeout(promptTimer);
      unsubscribeReady();
      unsubscribeAccess();
      unsubscribeRoll();
    },
  };
}

// The result `dicex` sends for a basic roll. It rolls its dice in dice set order with the counts of
// each type merged, whatever the notation's order, and reports a d10 that shows 10 as 0 and a d100
// as a d100 of the tens beside a d10 of the ones. It then fills each notation term's group from the
// next dice of its type, and leaves a group short when the next die is of another type. Each die
// takes the next listed face in that rolling order.
function rolledResult(request: DicePlusRollRequest, faces: readonly number[]): JsonValue {
  const terms = request.diceNotation.split('+').map((term) => {
    const match = DICE_TERM.exec(term);

    return { term, count: Number(match?.[1] ?? 0), sides: Number(match?.[2] ?? 0) };
  });

  const rolled: { diceType: string; value: number }[] = [];
  let next = 0;

  for (const sides of DICEX_SET_ORDER) {
    const count = terms
      .filter((term) => term.sides === sides)
      .reduce((sum, term) => sum + term.count, 0);

    for (let index = 0; index < count; index += 1) {
      const face = faces[Math.min(next, faces.length - 1)] ?? 1;

      next += 1;
      rolled.push(...dicexDice(sides, face));
    }
  }

  let cursor = 0;

  const groups = terms.map(({ term, count, sides }) => {
    const dice: { value: number; kept: boolean }[] = [];

    while (dice.length < count && rolled[cursor]?.diceType === `d${sides}`) {
      dice.push({ value: rolled[cursor]?.value ?? 0, kept: true });
      cursor += 1;
    }

    const total = dice.reduce((sum, die) => sum + die.value, 0);

    return { description: term, diceType: `d${sides}`, dice, total, isNegative: false };
  });

  const totalValue = groups.reduce((sum, group) => sum + group.total, 0);

  return {
    rollId: request.rollId,
    playerId: request.playerId,
    playerName: request.playerName,
    rollTarget: request.rollTarget,
    result: {
      totalValue,
      rollSummary: `${groups.map((group) => group.total).join(' + ')} = ${totalValue}`,
      groups,
    },
  };
}

// The dice `dicex` records for one die of `sides` that shows `face`.
function dicexDice(sides: number, face: number): { diceType: string; value: number }[] {
  if (sides === 100) {
    const ones = face % 10;

    return [
      { diceType: 'd100', value: face === 100 ? 0 : face - ones },
      { diceType: 'd10', value: ones },
    ];
  }

  return [{ diceType: `d${sides}`, value: sides === 10 && face === 10 ? 0 : face }];
}
