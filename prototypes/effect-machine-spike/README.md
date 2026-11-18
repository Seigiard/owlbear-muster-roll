# Effect machine spike

A spike for ADR-0004 (`docs/adr/0004-the-replica-runs-effect-machines-with-complete-transition-tables.md`). It is not shipped and not part of the repository checks: `prototypes/**` is excluded from lint, format and `tsconfig.json`. It has its own `package.json`.

What it proves, each with a command:

| Claim | File | Command |
| --- | --- | --- |
| A transition table whose type requires one cell per phase-event pair; a missing cell is TS2741 | `machine.ts`, `gm-link.ts`, `incomplete.ts` | `bun run check` passes; delete the `@ts-expect-error` line in `incomplete.ts` and it fails |
| An effect interpreter with `Match.exhaustive`; an unhandled effect kind is a compile error | `runner.ts` | `bun run check` |
| A queue-fed runner with `Ref` phase, timers as `Effect.sleep` that put an event back, and `TestClock` | `runner.ts`, `run.ts` | `bun run smoke` prints `live/online`, then `live/offline` after 20 virtual seconds |
| Bundle cost of the Effect runtime with `Data.TaggedError` versus `Schema.TaggedError` | `size-data-errors.ts`, `size-schema-errors.ts` | `bun run size` prints two gzip byte counts |

Measured on 2026-11-18 with `effect@4.1.4`, `typescript@7.0.2`, `bun@1.4.4`: the data-errors bundle is 17.0 KB gzip, the schema-errors bundle 30.9 KB gzip.

Run `bun install` in this directory first.
