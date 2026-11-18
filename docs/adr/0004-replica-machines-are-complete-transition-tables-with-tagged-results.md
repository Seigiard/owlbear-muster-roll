---
status: proposed
---

# Replica machines are complete transition tables; failures are tagged results; Effect waits

At proposal time, `src/replica` holds the room's state machines in four shapes: a decision-list module (`catch-up`), injected-port modules (`generation-flow`, `room-protocol`, `roll-flow`, `room-copy`, `pending-edits`), a pure router (`command-routing`) and 1500 lines of wiring in `engine.ts`. Nothing checks that every phase answers every event: `switch` statements guarded by `never` helpers cover message kinds, not phase-event pairs. Failures leave the replica through 86 `console.error` calls; the port failures `SendFailure` and `StorageFailure` are object literals with no exhaustive handling. The owner asked for a simpler core, typed errors, and state machines whose completeness is checked automatically.

The decision has three parts, in the order they land:

1. **Every replica state machine is a transition table.** A module exports `Phase`, `Event` and `Effect` unions and a `TransitionTable<Phase, Event, Effect>` whose type requires one cell per phase-event pair; a cell is a function or the literal `'ignore'`. A missing cell is a compile error (TS2741 in the spike). A shared check walks every cell with generated data, asserts each machine's invariants and keeps a Mermaid diagram of the table in sync with the code. The modules keep running their own effects, as they do today; the table replaces the `switch` and the closure variables, not the module boundary.
2. **`better-result` replaces `src/core/result.ts` across the project.** Failures become `TaggedError` classes with the port's failure fields and an exhaustive `.match`. Port methods that return `Result` or reject return tagged results; the replica handles them where they arise or passes them up typed. `console.error` leaves the replica. Bugs stay thrown, which the library reports as `Panic`.
3. **Effect is deferred.** It would add a fiber runtime, `Scope` for the `stopped` flags, `Queue` for sequencing and `TestClock` for the engine tests, at 17 KB gzip and a rewrite of the engine. Those gains are real but not asked for yet. The decision is reopened when one of these holds: the engine tests stay racy under real timers after the tables land, a second module needs its own interruption bookkeeping, or the owner wants deterministic time in `engine-*.test.ts`.

## Consequences

- `machine.ts` (the table type and `step`) and `tests/support/machine-check.ts` are plain TypeScript with `fast-check`, already a dev dependency. No runtime library enters for part 1.
- `catch-up` is the first table, because it already returns decisions as data and has 48 module tests. `room-copy`, which already names its phases, and `generation-flow` follow. `room-protocol`, `pending-edits` and `roll-flow` are judged one by one: a machine with two phases may stay a linear function.
- `better-result` is the one `Result` in the repository. Its shape differs from the current type (`status === 'ok'`, `.value`, `.error`), so the swap is one mechanical change over 48 files and 314 `.ok` checks, with no behavior change. Cost: 3.4 KB gzip, zero dependencies, TypeScript 7.0.2 compiles it.
- Core keeps zod for the wire and the preset. UI flows keep the ADR-0002 reducer shape; a UI reducer may use the same table type when a flow has more than one phase, but nothing requires it.
- The TASK-63 and TASK-64 criterion "no shared state-machine runtime is introduced" stands: a table type and a test helper are not a runtime. What changes is the shape rule: one shape for the state of every replica machine, so one check covers them all.
- Timers remain schedulers, as CLAUDE.md requires: a timer fires an event into the table; the cell decides.

## Considered options

- **Effect now** (`effect@4.1.4`). The spike proved the runner, `Match.exhaustive` over effects and `TestClock`, and measured 17 KB gzip with `Data.TaggedError` or 31 KB with `Schema.TaggedError`. It is the only option that removes the `stopped` flags and the promise chains, and it costs a rewrite of 8600 lines whose only oracle is 20700 lines of room-simulation tests. Deferred with the revisit conditions above.
- **XState v5.** A visualizer and actors, but a transition left out of a config is silent at compile time, and it is a second model of effects.
- **Continue the TASK-64 shapes.** Each module keeps its own shape and its own `never` guards. No completeness check is possible without a shared shape.

The design, the machine catalog, the type sketches and the migration order live in `_bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md`. The spike that produced the measurements is `prototypes/effect-machine-spike/`.
