import { expect, test } from 'bun:test';
import { Result } from 'better-result';
import type { CatchUpDecision, CatchUpTimer, PartyMember } from './catch-up';
import { createCatchUpEffects, type CatchUpEffectsPorts } from './catch-up-effects';
import type { ReplicaFailure } from './failures';
import type { Schedule } from './timers';

type Scheduled = {
  readonly ms: number;
  readonly fn: () => void;
};

type Subject = {
  readonly controller: AbortController;
  readonly effects: ReturnType<typeof createCatchUpEffects>;
  readonly log: string[];
  readonly scheduled: Scheduled[];
  readonly reported: ReplicaFailure[];
};

type SubjectOptions = {
  readonly fired?: (timer: CatchUpTimer) => CatchUpDecision[];
  readonly roomCopyRead?: (r: string, fresh: boolean) => CatchUpDecision[];
  readonly partyRead?: (r: string, players: readonly PartyMember[]) => CatchUpDecision[];
  readonly readRoomCopy?: () => Promise<void>;
  readonly readParty?: () => Promise<readonly PartyMember[]>;
};

type Pending = {
  readonly promise: Promise<void>;
  readonly release: () => void;
};

const REQUEST: CatchUpTimer = { kind: 'request', r: 'request-1' };
const ANSWER: CatchUpTimer = { kind: 'answer', r: 'request-1' };
const CATCH_UP: CatchUpTimer = { kind: 'catch-up' };
const PING: CatchUpTimer = { kind: 'ping' };
const PLAYER: PartyMember = { connectionId: 'player-1', role: 'PLAYER' };

function createSubject(options: SubjectOptions = {}): Subject {
  const controller = new AbortController();
  const log: string[] = [];
  const scheduled: Scheduled[] = [];
  const reported: ReplicaFailure[] = [];

  const schedule: Schedule = (_signal: AbortSignal, ms: number, fn: () => void) => {
    const entry: Scheduled = { ms, fn };
    scheduled.push(entry);
    log.push(`schedule:${ms}`);

    return () => {
      log.push(`cancel:${ms}`);
    };
  };

  const ports: CatchUpEffectsPorts = {
    signal: controller.signal,
    schedule,
    report: (failure) => reported.push(failure),
    catchUp: {
      fired: (timer: CatchUpTimer) => {
        log.push(`fired:${timer.kind}${'r' in timer ? `:${timer.r}` : ''}`);

        return options.fired?.(timer) ?? [];
      },
      roomCopyRead: (r: string, fresh: boolean) => {
        log.push(`room-copy-read:${r}:${fresh}`);

        return options.roomCopyRead?.(r, fresh) ?? [];
      },
      partyRead: (r: string, players: readonly PartyMember[]) => {
        log.push(`party-read:${r}:${players.map((player) => player.connectionId).join(',')}`);

        return options.partyRead?.(r, players) ?? [];
      },
    },
    mergePersisted: () => {
      log.push('merge-persisted');
    },
    publish: () => {
      log.push('publish');
    },
    readRoomCopy: async () => {
      log.push('read-room-copy');
      await (options.readRoomCopy?.() ?? Promise.resolve());
    },
    readParty: async () => {
      log.push('read-party');

      return Result.ok(await (options.readParty?.() ?? []));
    },
    sendStateRequest: (r: string) => {
      log.push(`request:${r}`);
    },
    sendStateAnswer: (r: string) => {
      log.push(`answer:${r}`);
    },
    sendAlive: () => {
      log.push('alive');
    },
    sendPing: () => {
      log.push('ping');
    },
    caughtUp: (exit: 'answered' | 'unanswered') => {
      log.push(`caught-up:${exit}`);
    },
    gmBack: () => {
      log.push('gm-back');
    },
    clearStaged: (hadData: boolean, keepNonce: boolean) => {
      log.push(`adopt:${hadData}:${keepNonce}`);
    },
  };

  return { controller, effects: createCatchUpEffects(ports), log, scheduled, reported };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function pending() {
  let resolve: () => void;

  const promise = new Promise<void>((next) => {
    resolve = next;
  });

  return { promise, release: () => resolve() } satisfies Pending;
}

test('re-arming one timer ignores its stale callback and runs its replacement', async () => {
  // #given
  const subject = createSubject({
    fired: () => [{ type: 'ping' }],
  });

  // #when
  await subject.effects.run([{ type: 'arm', timer: REQUEST, delayMs: 10 }]);
  await subject.effects.run([{ type: 'arm', timer: REQUEST, delayMs: 20 }]);
  subject.scheduled[0]?.fn();
  subject.scheduled[1]?.fn();
  subject.scheduled[1]?.fn();
  await flush();

  // #then
  expect(subject.log).toEqual([
    'schedule:10',
    'cancel:10',
    'schedule:20',
    'fired:request:request-1',
    'ping',
  ]);
});

test('disarming a timer prevents its callback from reaching catch-up', async () => {
  // #given
  const subject = createSubject();

  // #when
  await subject.effects.run([{ type: 'arm', timer: REQUEST, delayMs: 10 }]);
  await subject.effects.run([{ type: 'disarm', timer: REQUEST }]);
  subject.scheduled[0]?.fn();
  await flush();

  // #then
  expect(subject.log).toEqual(['schedule:10', 'cancel:10']);
});

test('request and answer timers with one nonce keep separate keys', async () => {
  // #given
  const subject = createSubject({
    fired: () => [{ type: 'ping' }],
  });

  // #when
  await subject.effects.run([
    { type: 'arm', timer: REQUEST, delayMs: 10 },
    { type: 'arm', timer: ANSWER, delayMs: 20 },
    { type: 'disarm', timer: REQUEST },
  ]);
  subject.scheduled[0]?.fn();
  subject.scheduled[1]?.fn();
  await flush();

  // #then
  expect(subject.log).toEqual([
    'schedule:10',
    'schedule:20',
    'cancel:10',
    'fired:answer:request-1',
    'ping',
  ]);
});

test('nonce-free timers keep separate keys', async () => {
  // #given
  const subject = createSubject({
    fired: () => [{ type: 'ping' }],
  });

  // #when
  await subject.effects.run([
    { type: 'arm', timer: CATCH_UP, delayMs: 10 },
    { type: 'arm', timer: PING, delayMs: 20 },
    { type: 'disarm', timer: CATCH_UP },
  ]);
  subject.scheduled[0]?.fn();
  subject.scheduled[1]?.fn();
  await flush();

  // #then
  expect(subject.log).toEqual(['schedule:10', 'schedule:20', 'cancel:10', 'fired:ping', 'ping']);
});

test('run dispatches every synchronous catch-up decision to its port', async () => {
  // #given
  const subject = createSubject();

  // #when
  await subject.effects.run([
    { type: 'entered', trigger: 'start', fresh: true },
    { type: 'entered', trigger: 'page-return', fresh: false },
    { type: 'request', r: 'request-1' },
    { type: 'answer', r: 'request-1' },
    { type: 'alive' },
    { type: 'ping' },
    { type: 'caught-up', exit: 'answered' },
    { type: 'caught-up', exit: 'unanswered' },
    { type: 'show', projectedOnly: false },
    { type: 'gm-back' },
    {
      type: 'adopt',
      generation: { n: 1, a: 'gm-1' },
      previous: null,
      hadData: true,
      keepNonce: false,
    },
  ]);

  // #then
  expect(subject.log).toEqual([
    'publish',
    'merge-persisted',
    'publish',
    'request:request-1',
    'answer:request-1',
    'alive',
    'ping',
    'caught-up:answered',
    'caught-up:unanswered',
    'publish',
    'gm-back',
    'adopt:true:false',
  ]);
});

test('run waits for started reads and interprets their results', async () => {
  // #given
  const roomCopyRead = pending();

  const subject = createSubject({
    readRoomCopy: () => roomCopyRead.promise,
    readParty: async () => [PLAYER],
    roomCopyRead: () => [{ type: 'request', r: 'room-copy-result' }],
    partyRead: () => [{ type: 'alive' }],
  });

  // #when
  const run = subject.effects.run([
    { type: 'read-room-copy', r: 'request-1', fresh: true },
    { type: 'read-party', r: 'request-1' },
  ]);

  await flush();

  const settledBeforeRoomCopy = await Promise.race([
    run.then(() => 'settled'),
    Promise.resolve('waiting'),
  ]);

  roomCopyRead.release();

  await run;

  // #then
  expect([settledBeforeRoomCopy, subject.log]).toEqual([
    'waiting',
    [
      'read-room-copy',
      'read-party',
      'party-read:request-1:player-1',
      'alive',
      'room-copy-read:request-1:true',
      'request:room-copy-result',
    ],
  ]);
});

test('aborting after a read starts drops its continuation', async () => {
  // #given
  const roomCopyRead = pending();

  const subject = createSubject({
    readRoomCopy: () => roomCopyRead.promise,
    roomCopyRead: () => [{ type: 'ping' }],
  });

  // #when
  const run = subject.effects.run([{ type: 'read-room-copy', r: 'request-1', fresh: true }]);

  subject.controller.abort();
  roomCopyRead.release();

  await run;

  // #then
  expect(subject.log).toEqual(['read-room-copy']);
});

test('an aborted interpreter does not run direct decisions', async () => {
  // #given
  const subject = createSubject();
  subject.controller.abort();

  // #when
  await subject.effects.run([{ type: 'arm', timer: REQUEST, delayMs: 10 }, { type: 'ping' }]);

  // #then
  expect(subject.log).toEqual([]);
});

test('a failed read logs its failure and leaves the interpreter resolved', async () => {
  // #given
  const subject = createSubject({
    readRoomCopy: async () => Promise.reject(new Error('room-copy-failed')),
    readParty: async () => Promise.reject(new Error('party-read-failed')),
  });

  // #when
  await subject.effects.run([
    { type: 'read-room-copy', r: 'request-1', fresh: true },
    { type: 'read-party', r: 'request-1' },
  ]);

  // #then
  expect(subject.reported.map((failure) => failure._tag)).toEqual([
    'message-rejected',
    'PartyReadFailure',
  ]);
});

test('a failed timer continuation logs its failure', async () => {
  // #given
  const subject = createSubject({
    fired: () => {
      throw new Error('timer-failed');
    },
  });

  // #when
  await subject.effects.run([{ type: 'arm', timer: REQUEST, delayMs: 10 }]);
  subject.scheduled[0]?.fn();
  await flush();

  // #then
  expect(subject.reported.map((failure) => failure._tag)).toEqual(['message-rejected']);
});
