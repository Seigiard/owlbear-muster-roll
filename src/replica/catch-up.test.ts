import { describe, expect, test } from 'bun:test';

import type { AliveMessage, StateMessage } from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import { createCatchUp, type CatchUp, type CatchUpDecision } from '@/replica/catch-up';

const INITIAL: Generation = { n: 0, a: '' };
const NEXT: Generation = { n: 1, a: 'gm-a' };

type Harness = {
  catchUp: CatchUp;
  setRole: (role: 'GM' | 'PLAYER') => void;
  setVouches: (value: boolean) => void;
  setGeneration: (value: Generation) => void;
  setDigest: (value: number) => void;
  setUnsent: (value: boolean) => void;
  setData: (value: boolean) => void;
  setNow: (value: number) => void;
  saved: Generation[];
};

function createHarness(
  options: { role?: 'GM' | 'PLAYER'; random?: number; save?: boolean } = {},
): Harness {
  let role = options.role ?? 'PLAYER';
  let vouches = true;
  let generation = INITIAL;
  let digest = 10;
  let unsent = false;
  let hasData = true;
  let now = 0;
  let nextId = 0;
  const saved: Generation[] = [];

  return {
    catchUp: createCatchUp({
      timing: {
        catchUpTimeoutMs: 100,
        stateAnswerDelayMinMs: 10,
        stateAnswerDelayMaxMs: 30,
        gmLinkTimeoutMs: 80,
        incompleteRequestStartMs: 40,
        incompleteRequestMaxMs: 160,
      },
      random: () => options.random ?? 0.5,
      newId: () => `r-${++nextId}`,
      now: () => now,
      role: () => role,
      vouches: () => vouches,
      generation: () => generation,
      digest: () => digest,
      commitsUnsent: () => unsent,
      hasData: () => hasData,
      saveAdoption: (target) => {
        saved.push(target);

        return options.save ?? true;
      },
    }),
    setRole: (value) => {
      role = value;
    },
    setVouches: (value) => {
      vouches = value;
    },
    setGeneration: (value) => {
      generation = value;
    },
    setDigest: (value) => {
      digest = value;
    },
    setUnsent: (value) => {
      unsent = value;
    },
    setData: (value) => {
      hasData = value;
    },
    setNow: (value) => {
      now = value;
    },
    saved,
  };
}

function state(r: string, i = 1, n = 1, g: Generation = INITIAL): StateMessage {
  return { v: 3, g, t: 'state', r, i, n, records: 'eA==' };
}

function alive(digest: number): AliveMessage {
  return { v: 3, g: INITIAL, t: 'alive', digest };
}

function start(harness: Harness): string {
  const decisions = harness.catchUp.enter('start');
  const read = decisions.find((decision) => decision.type === 'read-room-copy');

  if (read?.type !== 'read-room-copy') {
    throw new Error('start must read the room copy');
  }

  return read.r;
}

function becomeLive(harness: Harness): string {
  const r = start(harness);
  harness.catchUp.stateMerged(state(r), 'gm-a', 'equal');

  return r;
}

function decisionTypes(decisions: readonly CatchUpDecision[]): string[] {
  return decisions.map((decision) => decision.type);
}

describe('catch-up', () => {
  test('starts with a fresh nonce, timeout, copy read, and GM link watch', () => {
    // #given
    const harness = createHarness();

    // #when
    const decisions = [...harness.catchUp.enter('start'), ...harness.catchUp.watch()];

    // #then
    expect(decisions).toEqual([
      { type: 'entered', trigger: 'start', fresh: true },
      { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
      { type: 'read-room-copy', r: 'r-1', fresh: true },
      { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
      { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
    ]);
  });

  test('ignores a room-copy read for an old nonce', () => {
    // #given
    const harness = createHarness();
    start(harness);

    // #when
    const decisions = harness.catchUp.roomCopyRead('old', true);

    // #then
    expect(decisions).toEqual([]);
  });

  test('a GM alone leaves unanswered after its room copy read', () => {
    // #given
    const harness = createHarness({ role: 'GM' });
    const r = start(harness);

    // #when
    const decisions = harness.catchUp.partyRead(r, []);

    // #then
    expect({ decisions, view: harness.catchUp.view() }).toEqual({
      decisions: [
        { type: 'disarm', timer: { kind: 'catch-up' } },
        { type: 'caught-up', exit: 'unanswered' },
      ],
      view: { state: 'live', firstCatchUpDone: true, gmAnswered: false, gmLink: 'offline' },
    });
  });

  test.each<[string, readonly { connectionId: string; role: 'GM' | 'PLAYER' }[] | null, boolean]>([
    ['a failed party read', null, false],
    ['another GM', [{ connectionId: 'gm-b', role: 'GM' }], false],
    ['an adoption in progress', [], true],
  ])('a GM alone stays catching up after %s', (_name, players, adopting) => {
    // #given
    const harness = createHarness({ role: 'GM' });
    const r = start(harness);

    const current = adopting
      ? harness.catchUp
          .generationHeard(NEXT, false)
          .find((decision) => decision.type === 'read-room-copy')
      : undefined;

    // #when
    const decisions = harness.catchUp.partyRead(
      current?.type === 'read-room-copy' ? current.r : r,
      players,
    );

    // #then
    expect({ decisions, live: harness.catchUp.live() }).toEqual({ decisions: [], live: false });
  });

  test('a complete answer from one sender leaves answered', () => {
    // #given
    const harness = createHarness();
    const r = start(harness);

    // #when
    const decisions = harness.catchUp.stateMerged(state(r), 'gm-a', 'equal');

    // #then
    expect({ decisions, view: harness.catchUp.view() }).toEqual({
      decisions: [
        { type: 'disarm', timer: { kind: 'answer', r } },
        { type: 'disarm', timer: { kind: 'catch-up' } },
        { type: 'caught-up', exit: 'answered' },
      ],
      view: { state: 'live', firstCatchUpDone: true, gmAnswered: true, gmLink: 'offline' },
    });
  });

  test.each<[string, (harness: Harness, r: string) => CatchUpDecision[]]>([
    [
      'a partial answer',
      (harness, r) => harness.catchUp.stateMerged(state(r, 1, 2), 'gm-a', 'equal'),
    ],
    [
      'parts from mixed senders',
      (harness, r) => {
        harness.catchUp.stateMerged(state(r, 1, 2), 'gm-a', 'equal');

        return harness.catchUp.stateMerged(state(r, 2, 2), 'gm-b', 'equal');
      },
    ],
    ['an old nonce', (harness) => harness.catchUp.stateMerged(state('old'), 'gm-a', 'equal')],
  ])('does not leave for %s', (_name, merge) => {
    // #given
    const harness = createHarness();
    const r = start(harness);

    // #when
    const decisions = merge(harness, r);

    // #then
    expect({ types: decisionTypes(decisions), live: harness.catchUp.live() }).toEqual({
      types: ['disarm'],
      live: false,
    });
  });

  test('a catch-up timeout leaves unanswered but retains gmAnswered', () => {
    // #given
    const harness = createHarness();
    const r = start(harness);
    harness.catchUp.stateMerged(state(r, 1, 2), 'gm-a', 'equal');

    // #when
    const decisions = harness.catchUp.fired({ kind: 'catch-up' });

    // #then
    expect({ decisions, view: harness.catchUp.view() }).toEqual({
      decisions: [
        { type: 'disarm', timer: { kind: 'catch-up' } },
        { type: 'caught-up', exit: 'unanswered' },
      ],
      view: { state: 'live', firstCatchUpDone: true, gmAnswered: false, gmLink: 'offline' },
    });
  });

  test('a timeout after catch-up already exited decides nothing', () => {
    // #given
    const harness = createHarness();
    becomeLive(harness);

    // #when
    const decisions = harness.catchUp.fired({ kind: 'catch-up' });

    // #then
    expect(decisions).toEqual([]);
  });

  test('a late complete answer marks a live client answered without ignoring later drift', () => {
    // #given
    const harness = createHarness();
    const r = start(harness);
    harness.catchUp.fired({ kind: 'catch-up' });
    harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    harness.setNow(41);

    // #when
    const decisions = [
      ...harness.catchUp.stateMerged(state(r), 'gm-a', 'equal'),
      ...harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal'),
    ];

    // #then
    expect({ decisions, view: harness.catchUp.view() }).toEqual({
      decisions: [
        { type: 'disarm', timer: { kind: 'answer', r } },
        { type: 'show', projectedOnly: false },
        { type: 'entered', trigger: 'drift', fresh: true },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
        { type: 'read-room-copy', r: 'r-2', fresh: true },
      ],
      view: { state: 'catching-up', firstCatchUpDone: true, gmAnswered: true, gmLink: 'offline' },
    });
  });

  test('a late answer to the last nonce brings the GM link online without a gm-return catch-up', () => {
    // #given
    const harness = createHarness();
    const r = start(harness);
    harness.catchUp.fired({ kind: 'catch-up' });

    // #when
    const decisions = harness.catchUp.heard('GM', { t: 'state', r });

    // #then
    expect(decisions).toEqual([
      { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
      { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
      { type: 'gm-back' },
      { type: 'show', projectedOnly: true },
    ]);
  });

  test('a page return while live starts a fresh catch-up', () => {
    // #given
    const harness = createHarness();
    becomeLive(harness);

    // #when
    const decisions = harness.catchUp.enter('page-return');

    // #then
    expect(decisions).toEqual([
      { type: 'entered', trigger: 'page-return', fresh: true },
      { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
      { type: 'read-room-copy', r: 'r-2', fresh: true },
    ]);
  });

  test.each<[string, boolean, CatchUpDecision[]]>([
    [
      'while nothing answered',
      false,
      [
        { type: 'entered', trigger: 'page-return', fresh: false },
        { type: 'read-room-copy', r: 'r-1', fresh: false },
      ],
    ],
    [
      'after an answer part',
      true,
      [
        { type: 'entered', trigger: 'page-return', fresh: false },
        { type: 'read-room-copy', r: 'r-1', fresh: false },
      ],
    ],
  ])('a page return %s keeps the nonce and timeout', (_name, answered, expected) => {
    // #given
    const harness = createHarness();
    const r = start(harness);

    if (answered) {
      harness.catchUp.stateMerged(state(r, 1, 2), 'gm-a', 'equal');
    }

    // #when
    const decisions = harness.catchUp.enter('page-return');

    // #then
    expect(decisions).toEqual(expected);
  });

  test('a role change starts over and drops old answer parts', () => {
    // #given
    const harness = createHarness();
    const r = start(harness);
    harness.catchUp.stateMerged(state(r, 1, 2), 'gm-a', 'equal');

    // #when
    const decisions = [
      ...harness.catchUp.enter('role'),
      ...harness.catchUp.stateMerged(state('r-2', 2, 2), 'gm-a', 'equal'),
    ];

    // #then
    expect({ decisions, live: harness.catchUp.live() }).toEqual({
      decisions: [
        { type: 'entered', trigger: 'role', fresh: true },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
        { type: 'read-room-copy', r: 'r-2', fresh: true },
        { type: 'disarm', timer: { kind: 'answer', r: 'r-2' } },
      ],
      live: false,
    });
  });

  test.each<[string, Partial<{ role: 'GM' | 'PLAYER'; vouches: boolean }>, CatchUpDecision[]]>([
    [
      'a live vouching GM',
      { role: 'GM' },
      [{ type: 'arm', timer: { kind: 'answer', r: 'ask' }, delayMs: 20 }],
    ],
    ['a player', { role: 'PLAYER' }, []],
    ['a GM that cannot vouch', { role: 'GM', vouches: false }, []],
  ])('answers a request only for %s', (_name, setup, expected) => {
    // #given
    const harness = createHarness({ role: setup.role });
    becomeLive(harness);
    harness.setVouches(setup.vouches ?? true);

    // #when
    const decisions = harness.catchUp.stateRequested('ask');

    // #then
    expect(decisions).toEqual(expected);
  });

  test('an observed answer cancels an armed answer, and a repeat request arms again', () => {
    // #given
    const harness = createHarness({ role: 'GM' });
    becomeLive(harness);
    harness.catchUp.stateRequested('ask');

    // #when
    const decisions = [
      ...harness.catchUp.stateMerged(state('ask'), 'gm-b', 'equal'),
      ...harness.catchUp.stateRequested('ask'),
    ];

    // #then
    expect(decisions).toEqual([
      { type: 'disarm', timer: { kind: 'answer', r: 'ask' } },
      { type: 'arm', timer: { kind: 'answer', r: 'ask' }, delayMs: 20 },
    ]);
  });

  test('a GM in ordinary catch-up holds a request and answers it only if still unanswered on exit', () => {
    // #given
    const harness = createHarness({ role: 'GM' });
    const r = start(harness);
    harness.catchUp.stateRequested('held');
    harness.catchUp.stateMerged(state('held'), 'gm-b', 'equal');

    // #when
    const decisions = harness.catchUp.stateMerged(state(r), 'gm-a', 'equal');

    // #then
    expect(decisions).toEqual([
      { type: 'disarm', timer: { kind: 'answer', r } },
      { type: 'disarm', timer: { kind: 'catch-up' } },
      { type: 'caught-up', exit: 'answered' },
    ]);
  });

  test('a GM retains only the newest 256 held requests', () => {
    // #given
    const harness = createHarness({ role: 'GM' });
    const r = start(harness);

    for (let index = 0; index < 257; index += 1) {
      harness.catchUp.stateRequested(`held-${index}`);
    }

    // #when
    const decisions = harness.catchUp.stateMerged(state(r), 'gm-a', 'equal');

    // #then
    expect(decisions.filter((decision) => decision.type === 'arm')).toEqual(
      Array.from({ length: 256 }, (_, index) => ({
        type: 'arm',
        timer: { kind: 'answer', r: `held-${index + 1}` },
        delayMs: 20,
      })),
    );
  });

  test('a GM in drift catch-up answers requests but not pings', () => {
    // #given
    const harness = createHarness({ role: 'GM' });
    becomeLive(harness);
    harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    harness.setNow(41);
    harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');

    // #when
    const decisions = [harness.catchUp.stateRequested('ask'), harness.catchUp.pingReceived()];

    // #then
    expect(decisions).toEqual([
      [{ type: 'arm', timer: { kind: 'answer', r: 'ask' }, delayMs: 20 }],
      [],
    ]);
  });

  test('only a GM-origin message brings the link online and arms its watches', () => {
    // #given
    const harness = createHarness();

    // #when
    const decisions = [
      ...harness.catchUp.heard('PLAYER', { t: 'commit' }),
      ...harness.catchUp.heard('GM', { t: 'commit' }),
    ];

    // #then
    expect({ decisions, view: harness.catchUp.view() }).toEqual({
      decisions: [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
        { type: 'gm-back' },
        { type: 'show', projectedOnly: true },
      ],
      view: { state: 'catching-up', firstCatchUpDone: false, gmAnswered: false, gmLink: 'online' },
    });
  });

  test('GM silence takes the link offline and only shows a projected link', () => {
    // #given
    const harness = createHarness();
    harness.catchUp.heard('GM', { t: 'commit' });

    // #when
    const decisions = harness.catchUp.fired({ kind: 'gm-silence' });

    // #then
    expect(decisions).toEqual([{ type: 'show', projectedOnly: true }]);
  });

  test('a live player starts a delayed gm-return catch-up but a GM stays live', () => {
    // #given
    const player = createHarness({ random: 0.5 });
    becomeLive(player);
    const gm = createHarness({ role: 'GM' });
    becomeLive(gm);

    // #when
    const decisions = [
      player.catchUp.heard('GM', { t: 'commit' }),
      gm.catchUp.heard('GM', { t: 'commit' }),
    ];

    // #then
    expect(decisions).toEqual([
      [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
        { type: 'gm-back' },
        { type: 'entered', trigger: 'gm-return', fresh: true },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
        { type: 'read-room-copy', r: 'r-2', fresh: true },
      ],
      [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
        { type: 'show', projectedOnly: true },
      ],
    ]);
  });

  test.each<[string, boolean, boolean, CatchUpDecision[]]>([
    [
      'after a sent unanswered request',
      true,
      false,
      [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
        { type: 'gm-back' },
        { type: 'request', r: 'r-1' },
        { type: 'show', projectedOnly: true },
      ],
    ],
    [
      'after an answer',
      true,
      true,
      [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
        { type: 'gm-back' },
        { type: 'show', projectedOnly: true },
      ],
    ],
    [
      'before a request is sent',
      false,
      false,
      [
        { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 },
        { type: 'arm', timer: { kind: 'gm-silence' }, delayMs: 80 },
        { type: 'gm-back' },
        { type: 'show', projectedOnly: true },
      ],
    ],
  ])('a returning GM asks again only %s', (_name, sent, answered, expected) => {
    // #given
    const harness = createHarness();
    const r = start(harness);

    if (sent) {
      harness.catchUp.roomCopyRead(r, true);
    }

    if (answered) {
      harness.catchUp.stateMerged(state(r, 1, 2), 'gm-a', 'equal');
    }

    harness.catchUp.heard('GM', { t: 'commit' });
    harness.catchUp.fired({ kind: 'gm-silence' });

    // #when
    const decisions = harness.catchUp.heard('GM', { t: 'commit' });

    // #then
    expect(decisions).toEqual(expected);
  });

  test('ping fires and rearms, and only a live vouching GM answers it', () => {
    // #given
    const harness = createHarness({ role: 'GM' });
    becomeLive(harness);

    // #when
    const decisions = [harness.catchUp.fired({ kind: 'ping' }), harness.catchUp.pingReceived()];

    // #then
    expect(decisions).toEqual([
      [{ type: 'ping' }, { type: 'arm', timer: { kind: 'ping' }, delayMs: 50 }],
      [{ type: 'alive' }],
    ]);
  });

  test.each<[string, (harness: Harness) => void]>([
    [
      'a burst in one window',
      (harness) => {
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
      },
    ],
    [
      'a match between differences',
      (harness) => {
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
        harness.setNow(41);
        harness.catchUp.aliveReceived(alive(10), 'gm-a', 'equal');
        harness.setNow(82);
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
      },
    ],
    [
      'differences from two GMs',
      (harness) => {
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
        harness.setNow(41);
        harness.catchUp.aliveReceived(alive(11), 'gm-b', 'equal');
      },
    ],
    [
      'another generation',
      (harness) => {
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'lower');
        harness.setNow(41);
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'lower');
      },
    ],
    [
      'a GM with unsent commits',
      (harness) => {
        harness.setUnsent(true);
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
        harness.setNow(41);
        harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
      },
    ],
  ])('does not start drift from %s', (_name, receive) => {
    // #given
    const harness = createHarness({ role: _name === 'a GM with unsent commits' ? 'GM' : 'PLAYER' });
    becomeLive(harness);

    // #when
    receive(harness);

    // #then
    expect(harness.catchUp.view().state).toBe('live');
  });

  test('two different alive values from one GM in separate windows start drift catch-up', () => {
    // #given
    const harness = createHarness();
    becomeLive(harness);
    harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    harness.setNow(41);

    // #when
    const decisions = harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');

    // #then
    expect(decisions).toEqual([
      { type: 'entered', trigger: 'drift', fresh: true },
      { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
      { type: 'read-room-copy', r: 'r-2', fresh: true },
    ]);
  });

  test('an answered exit ignores the responder and drift starter, but a timeout ignores neither', () => {
    // #given
    const answered = createHarness();
    becomeLive(answered);
    answered.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    answered.setNow(41);
    answered.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    answered.catchUp.stateMerged(state('r-2'), 'gm-b', 'equal');
    const timeout = createHarness();
    becomeLive(timeout);
    timeout.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    timeout.setNow(41);
    timeout.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    timeout.catchUp.fired({ kind: 'catch-up' });

    // #when
    answered.setNow(82);
    answered.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    answered.setNow(123);
    timeout.setNow(82);
    timeout.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    timeout.setNow(123);

    const decisions = [
      answered.catchUp.aliveReceived(alive(11), 'gm-a', 'equal'),
      timeout.catchUp.aliveReceived(alive(11), 'gm-a', 'equal'),
    ];

    // #then
    expect(decisions).toEqual([
      [],
      [
        { type: 'entered', trigger: 'drift', fresh: true },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
        { type: 'read-room-copy', r: 'r-3', fresh: true },
      ],
    ]);
  });

  test('a higher generation adopts, forgets drift, and enters with a fresh nonce', () => {
    // #given
    const harness = createHarness();
    becomeLive(harness);
    harness.setData(false);

    // #when
    const decisions = harness.catchUp.generationHeard(NEXT, false);

    // #then
    expect({ decisions, target: harness.catchUp.adopting() }).toEqual({
      decisions: [
        { type: 'adopt', generation: NEXT, previous: null, keepNonce: false, hadData: false },
        { type: 'entered', trigger: 'generation', fresh: true },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 35 },
        { type: 'read-room-copy', r: 'r-2', fresh: true },
      ],
      target: NEXT,
    });
  });

  test('an answer part of another generation cannot complete an adoption', () => {
    // #given
    const harness = createHarness();
    becomeLive(harness);
    harness.catchUp.generationHeard(NEXT, false);

    // #when
    const decisions = [
      ...harness.catchUp.stateMerged(state('r-2', 1, 2, INITIAL), 'gm-a', 'equal'),
      ...harness.catchUp.stateMerged(state('r-2', 2, 2, NEXT), 'gm-a', 'higher'),
    ];

    // #then
    expect({ decisions, live: harness.catchUp.live(), target: harness.catchUp.adopting() }).toEqual(
      {
        decisions: [{ type: 'disarm', timer: { kind: 'answer', r: 'r-2' } }],
        live: false,
        target: NEXT,
      },
    );
  });

  test('an adoption timeout backs off, rereads, and stays not live', () => {
    // #given
    const harness = createHarness({ random: 0.5 });
    becomeLive(harness);
    harness.catchUp.generationHeard(NEXT, false);

    // #when
    const decisions = harness.catchUp.fired({ kind: 'catch-up' });

    // #then
    expect({ decisions, live: harness.catchUp.live() }).toEqual({
      decisions: [
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 70 },
        { type: 'read-room-copy', r: 'r-2', fresh: true },
      ],
      live: false,
    });
  });

  test.each<[string, boolean, CatchUpDecision[]]>([
    [
      'a saved complete answer',
      true,
      [
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
        { type: 'disarm', timer: { kind: 'catch-up' } },
        { type: 'caught-up', exit: 'answered' },
      ],
    ],
    ['a failed adoption save', false, []],
  ])('ends adoption after %s', (_name, save, expected) => {
    // #given
    const harness = createHarness({ save });
    becomeLive(harness);
    harness.catchUp.generationHeard(NEXT, false);

    // #when
    const decisions = harness.catchUp.stateMerged(state('r-2', 1, 1, NEXT), 'gm-a', 'higher');

    // #then
    expect({ decisions, target: harness.catchUp.adopting(), saved: harness.saved }).toEqual({
      decisions: expected,
      target: save ? null : NEXT,
      saved: [NEXT],
    });
  });

  test('an equal answer of an adoption target after a role change finishes adoption', () => {
    // #given
    const harness = createHarness();
    becomeLive(harness);
    harness.catchUp.generationHeard(NEXT, false);
    harness.setRole('GM');
    harness.setGeneration(NEXT);
    harness.catchUp.enter('role');

    // #when
    const decisions = harness.catchUp.stateMerged(state('r-3', 1, 1, NEXT), 'gm-a', 'equal');

    // #then
    expect({ decisions, saved: harness.saved, target: harness.catchUp.adopting() }).toEqual({
      decisions: [
        { type: 'disarm', timer: { kind: 'answer', r: 'r-3' } },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
        { type: 'disarm', timer: { kind: 'catch-up' } },
        { type: 'caught-up', exit: 'answered' },
      ],
      saved: [NEXT],
      target: null,
    });
  });

  test('a successful adoption forgets earlier digests without a save callback into the module', () => {
    // #given
    const harness = createHarness();
    becomeLive(harness);
    harness.catchUp.generationHeard(NEXT, false);
    harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    harness.catchUp.stateMerged(state('r-2', 1, 1, NEXT), 'gm-a', 'higher');
    harness.setNow(41);
    harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');
    harness.setNow(82);

    // #when
    const decisions = harness.catchUp.aliveReceived(alive(11), 'gm-a', 'equal');

    // #then
    expect({ decisions, saved: harness.saved, view: harness.catchUp.view() }).toEqual({
      decisions: [
        { type: 'entered', trigger: 'drift', fresh: true },
        { type: 'arm', timer: { kind: 'catch-up' }, delayMs: 100 },
        { type: 'read-room-copy', r: 'r-3', fresh: true },
      ],
      saved: [NEXT],
      view: { state: 'catching-up', firstCatchUpDone: true, gmAnswered: true, gmLink: 'offline' },
    });
  });

  test.each<[string, (harness: Harness) => CatchUpDecision[]]>([
    ['while catching up', (harness) => harness.catchUp.closing()],
    ['while live', (harness) => harness.catchUp.closing()],
  ])('closing %s follows its state rule', (_name, close) => {
    // #given
    const harness = createHarness();

    if (_name === 'while live') {
      becomeLive(harness);
    } else {
      start(harness);
    }

    // #when
    const decisions = close(harness);

    // #then
    expect(decisions).toEqual(
      _name === 'while catching up'
        ? [
            { type: 'disarm', timer: { kind: 'catch-up' } },
            { type: 'caught-up', exit: 'unanswered' },
          ]
        : [],
    );
  });
});
