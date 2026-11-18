# Transition table and tagged-result spike

A spike for ADR-0004 (`docs/adr/0004-replica-machines-are-complete-transition-tables-with-tagged-results.md`). It is not shipped and not part of the repository checks: `prototypes/**` is excluded from lint, format and `tsconfig.json`. It has its own `package.json`.

What it proves, each with a command:

| Claim | File | Command |
| --- | --- | --- |
| A transition table whose type requires one cell per phase-event pair; a missing cell is TS2741. Plain TypeScript, no library | `machine.ts`, `gm-link.ts`, `incomplete.ts` | `bun run check` passes; delete the `@ts-expect-error` line in `incomplete.ts` and it fails |
| `better-result`: tagged error classes, `Result.gen` with `yield*`, `tryPromise` with a typed `catch`, exhaustive `.match` | `better-result-errors.ts` | `bun run check`; `bun run size` prints its gzip bytes last |
| Deferred option, Effect: an effect interpreter with `Match.exhaustive`, a queue-fed runner with `Ref` phase, timers as `Effect.sleep` that put an event back, `TestClock` | `runner.ts`, `run.ts` | `bun run smoke` prints `live/online`, then `live/offline` after 20 virtual seconds |
| Bundle cost of the Effect runtime with `Data.TaggedError` versus `Schema.TaggedError` | `size-data-errors.ts`, `size-schema-errors.ts` | `bun run size` prints their gzip bytes first and second |

Measured on 2026-11-18 with `effect@4.1.4`, `better-result@3.0.1`, `typescript@7.0.2`, `bun@1.4.4`: Effect with data errors 17.0 KB gzip, Effect with schema errors 30.9 KB, better-result 3.4 KB.

Run `bun install` in this directory first.
