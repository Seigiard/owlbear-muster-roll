import { Context, Effect, Layer, Match, Queue, Ref, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { step } from './machine';
import { gmLink, type Effect as GmEffect, type Event, type Phase } from './gm-link';

export class SendFailure extends Schema.TaggedError<SendFailure>()('SendFailure', {
  reason: Schema.Literals(['rate-limited', 'failed']),
  channel: Schema.String,
}) {}

export class StorageFailure extends Schema.TaggedError<StorageFailure>()('StorageFailure', {
  operation: Schema.Literals(['read', 'write', 'remove', 'list']),
  reason: Schema.String,
}) {}

export class Broadcast extends Context.Service<
  Broadcast,
  {
    send(channel: string, data: unknown): Effect.Effect<void, SendFailure>;
  }
>()('muster-roll/replica/Broadcast') {}

export class Publisher extends Context.Service<
  Publisher,
  {
    publish(): Effect.Effect<void>;
  }
>()('muster-roll/replica/Publisher') {}

// One interpreter per machine effect; Match.exhaustive fails to compile when an effect kind is unhandled.
const interpret = (events: Queue.Queue<Event>) =>
  Match.type<GmEffect>().pipe(
    Match.discriminator('kind')('request', ({ nonce }) =>
      Effect.gen(function* () {
        const broadcast = yield* Broadcast;
        yield* broadcast.send('app.muster-roll/sync', { t: 'state-request', r: nonce });
      }),
    ),
    Match.discriminator('kind')('arm', ({ delayMs }) =>
      Effect.sleep(delayMs).pipe(
        Effect.andThen(Queue.offer(events, { kind: 'silence' })),
        Effect.forkScoped,
        Effect.asVoid,
      ),
    ),
    Match.discriminator('kind')('show', () => Effect.flatMap(Publisher, (p) => p.publish())),
    Match.exhaustive,
  );

export const runGmLink = Effect.gen(function* () {
  const events = yield* Queue.unbounded<Event>();
  const phase = yield* Ref.make<Phase>({ kind: 'initializing' });
  const run = interpret(events);

  yield* Queue.offer(events, { kind: 'start' });

  const loop = Effect.gen(function* () {
    const event = yield* Queue.take(events);
    const current = yield* Ref.get(phase);
    const next = step(gmLink, current, event);
    yield* Ref.set(phase, next.phase);
    for (const effect of next.effects) {
      // A failed send is reported once, here, with its typed cause; the loop goes on.
      yield* run(effect).pipe(
        Effect.catchTag('SendFailure', (failure) => Effect.logWarning('send failed', failure)),
      );
    }
  });

  yield* Effect.forever(loop).pipe(Effect.forkScoped);
  return { phase: Ref.get(phase), events };
});

export const testLayer = Layer.mergeAll(
  Layer.succeed(Broadcast, Broadcast.of({ send: () => Effect.void })),
  Layer.succeed(Publisher, Publisher.of({ publish: () => Effect.void })),
  TestClock.layer(),
);

// A smoke run: start -> catching-up; answered(r1) -> live online; 20s of test time -> offline.
export const smoke = Effect.gen(function* () {
  const machine = yield* runGmLink;
  yield* Effect.yieldNow;
  yield* Queue.offer(machine.events, { kind: 'answered', nonce: 'r1' });
  yield* Effect.yieldNow;
  yield* Queue.offer(machine.events, { kind: 'gm-heard' });
  yield* Effect.yieldNow;
  const live = yield* machine.phase;
  yield* TestClock.adjust('20 seconds');
  yield* Effect.yieldNow;
  const after = yield* machine.phase;
  return { live, after };
}).pipe(Effect.scoped, Effect.provide(testLayer));
