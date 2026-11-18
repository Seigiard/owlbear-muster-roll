import { Context, Data, Effect, Layer, Match, Queue, Ref } from 'effect';
export class SendFailure extends Data.TaggedError('SendFailure')<{ reason: string }> {}
export class Broadcast extends Context.Service<
  Broadcast,
  { send(d: unknown): Effect.Effect<void, SendFailure> }
>()('x/Broadcast') {}
type Eff = { kind: 'a' } | { kind: 'b' };
const run = Match.type<Eff>().pipe(
  Match.discriminator('kind')('a', () => Effect.void),
  Match.discriminator('kind')('b', () => Effect.sleep(10)),
  Match.exhaustive,
);
export const main = Effect.gen(function* () {
  const q = yield* Queue.unbounded<Eff>();
  const r = yield* Ref.make(0);
  const b = yield* Broadcast;
  yield* b.send(1).pipe(Effect.catchTag('SendFailure', () => Effect.void));
  yield* Effect.forever(
    Effect.flatMap(Queue.take(q), (e) => Effect.andThen(run(e), Ref.update(r, (n) => n + 1))),
  ).pipe(Effect.forkScoped);
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.succeed(Broadcast, Broadcast.of({ send: () => Effect.void }))),
);
export const start = () => Effect.runFork(main);
