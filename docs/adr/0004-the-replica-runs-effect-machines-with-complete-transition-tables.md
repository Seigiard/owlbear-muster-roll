---
status: proposed
---

# The replica runs Effect machines with complete transition tables

At proposal time, `src/replica` holds the room's state machines in four shapes: a decision-list module (`catch-up`), injected-port modules (`generation-flow`, `room-protocol`, `roll-flow`, `room-copy`, `pending-edits`), a pure router (`command-routing`) and 1500 lines of wiring in `engine.ts`. Each module hand-rolls the same mechanics: a `stopped` flag read at 126 places, 86 `console.error` calls as the only failure channel, promise chains for sequencing, and `switch` statements whose completeness only `never` helpers guard. The owner asked for a rewrite with three goals: a simpler core, typed errors, and state machines whose completeness is checked automatically.

The proposal: the replica layer runs on Effect (`effect@4`). Every machine is a pure transition table, `(phase, event) -> { phase, effects }`, whose type requires one cell per phase-event pair. One small runner feeds each machine from a queue and interprets its effects through Effect services that wrap the existing platform ports. Core, UI, builder and the platform adapters do not change.

## Consequences

- Only `src/replica` imports `effect`; a lint rule rejects it elsewhere. Core keeps zod and `Result`. The ports in `src/platform/ports.ts` keep their Promise and `Result` signatures; `src/replica/services/` wraps each port in a `Context.Service` with tagged errors. Adapters and the port contract tests stay as they are.
- A machine is a `TransitionTable<Phase, Event, Effect>` in its own module. A cell is a function or the literal `'ignore'`. A missing cell is a compile error (TS2741 in the spike). An effect union is interpreted with `Match.exhaustive`, so an effect kind without an interpreter is a compile error too. A shared check in `tests/support/machine-check.ts` walks every cell with generated data, asserts each machine's invariants and keeps a Mermaid diagram of the table in sync with the code.
- Failures are `Data.TaggedError` classes with the port's failure fields. A machine's effects fail with typed errors; one policy table in the runner decides retry, notice, log or ignore. `console.error` leaves the replica. Bugs stay defects (`Effect.die`), not errors.
- Timers remain schedulers: a timer effect only puts an event back on the machine's queue after `Effect.sleep`. The rule in CLAUDE.md holds, and module tests run on `TestClock`.
- One `Scope` owns the engine. `stop()` closes it; interruption and finalizers replace the `stopped` flags and the stop list. Cross-machine seams become events sent through the runner, not callbacks.
- This supersedes the TASK-63 and TASK-64 criterion "no shared state-machine runtime is introduced". The runtime is one module of about 60 lines plus the table type; the goal of checked completeness needs the uniform shape it imposes.
- Cost: about 17 KB gzip on the background page (97 KB today), measured with `Data.TaggedError`. `Schema.TaggedError` would add 14 KB more and a second schema library, so it is not used.
- The migration is a strangler: the catch-up machine first, then services and the error channel, then protocol, generation, room copy, pending edits and roll, then the engine as a `Layer`. Each step keeps the 20000 lines of engine tests green with a junit list equal to the baseline, as TASK-48 did.
- ADR-0002 stays the shape for UI flows. Effect does not enter `src/ui` or `src/builder`.

## Considered options

- **Continue the TASK-64 shapes without a library.** Tables and the walk-every-cell check work in plain TypeScript, so goal 3 is reachable. Goals 1 and 2 are not: typed errors, interruption, sequencing and test time would stay hand-rolled per module.
- **XState v5.** Gives a visualizer and actors, but a transition left out of a config is silent at compile time, and it would be a second effect model beside Effect or beside the promise code.
- **Effect without tables.** Linear `Effect.gen` pipelines as `roll-flow` is today. Typed errors and scoping, but the completeness of phase handling stays a `switch` per module.

The design, the machine catalog, the type sketches and the migration order live in `_bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md`. The spike that produced the measurements is `prototypes/effect-machine-spike/`.
