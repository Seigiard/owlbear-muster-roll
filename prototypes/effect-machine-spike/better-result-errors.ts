import { Result, TaggedError } from 'better-result';
export class StorageFailure extends TaggedError('StorageFailure')<{ operation: 'read' | 'write'; reason: string }> {}
export class SendFailure extends TaggedError('SendFailure')<{ kind: 'rate-limited' | 'failed' }> {}
export const save = (ok: boolean) => (ok ? Result.ok(1) : Result.err(new StorageFailure({ operation: 'write', reason: 'quota' })));
export const send = async (ok: boolean) => Result.tryPromise({ try: async () => { if (!ok) throw new Error('x'); return 1; }, catch: () => new SendFailure({ kind: 'failed' }) });
export const flow = (ok: boolean) => Result.gen(async function* () {
  const a = yield* save(ok);
  const b = yield* Result.await(send(ok));
  return Result.ok(a + b);
});
export const report = (e: StorageFailure | SendFailure) => e.match({ StorageFailure: (f) => f.reason, SendFailure: (f) => f.kind });
