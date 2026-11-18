# Replica machines as tables, failures as tagged results

Status: proposed, 2026-11-18. Decision record: `docs/adr/0004-replica-machines-are-complete-transition-tables-with-tagged-results.md`. Spike: `prototypes/effect-machine-spike/`.

## Goals, as the owner set them

1. A simpler core: fewer hand-rolled mechanics in `src/replica`.
2. Better errors: a failure has a type, a place that decides what to do with it, and a reader who learns what failed.
3. Completeness of every state machine is checked automatically.

Not goals: a change to any AD rule in the architecture spine, to the wire protocol, to the ports' meaning, to `src/ui` flows or `src/builder`.

## Where the replica stands

Facts measured on `master` at 1aa5fb6:

| Fact | Value |
| --- | --- |
| `src/replica` production lines | 8600 in 21 modules; `engine.ts` 1508, `composers.ts` 1218 |
| Engine test lines | 20700 in 19 `engine-*.test.ts` files, run on the room rig with real timers |
| `stopped` reads | 126 in `src/replica` |
| `console.error` calls | 86 in `src/replica` |
| Shapes of state handling | four: decision list (`catch-up`), injected ports (`generation-flow`, `room-protocol`, `roll-flow`, `room-copy`, `pending-edits`, `dice-extension`), pure router (`command-routing`), wiring (`engine.ts`) |
| Completeness guard | `never` helpers in three modules (`composers`, `pending-edits`, `room-protocol`); none for phase-event pairs |
| `Result` today | `src/core/result.ts`, 9 lines; imported by 48 files (20 core, 17 replica, 5 platform, 3 ui, 2 builder); 314 `.ok` checks |
| Background page | 97 KB gzip (`background` 25, `core` 57, `obr` 14, `send-queue` 1) |

TASK-64 (doc-4) mapped the machines and chose per-module shapes. Goal 3 needs one shape for the state, because a completeness check written once has to apply to every machine. The modules' boundaries and their injected ports stay.

## What each goal gets

| Goal | Mechanism | Library |
| --- | --- | --- |
| 3, completeness | `TransitionTable` type plus `machine-check` | none; `fast-check` is already present |
| 2, errors | `TaggedError` classes, exhaustive `.match`, `Result.gen` for linear chains | `better-result` 3.0.1, 3.4 KB gzip |
| 1, simpler core | the table replaces each module's `switch` and closure variables; `Result.gen` replaces `if (!x.ok) return x` ladders | the two above |
| 1, lifecycle (`stopped`, timers, sequencing) | deferred; Effect's `Scope`, `Queue`, `TestClock` | `effect`, when the ADR's revisit conditions hold |

## Part 1: the table

### Type

Proven in the spike (`prototypes/effect-machine-spike/machine.ts`):

```ts
export type Tagged<K extends string> = { readonly kind: K };
export type Step<Phase, Effect> = { readonly phase: Phase; readonly effects: readonly Effect[] };

// 'ignore' is an explicit answer: the machine saw the event and drops it on purpose.
export type Cell<P, E, Phase, Effect> = 'ignore' | ((phase: P, event: E) => Step<Phase, Effect>);

export type TransitionTable<Phase extends Tagged<string>, Event extends Tagged<string>, Effect> = {
  readonly [P in Phase['kind']]: {
    readonly [E in Event['kind']]: Cell<Extract<Phase, { kind: P }>, Extract<Event, { kind: E }>, Phase, Effect>;
  };
};

export function step<Phase extends Tagged<string>, Event extends Tagged<string>, Effect>(
  table: TransitionTable<Phase, Event, Effect>, phase: Phase, event: Event,
): Step<Phase, Effect>;
```

What the type buys: a row per phase kind and a column per event kind, both derived from the unions. Adding a phase or an event without filling its cells is TS2741 (`prototypes/effect-machine-spike/incomplete.ts` holds the `@ts-expect-error` proof). A cell receives the narrowed phase and event, so `phase.active.nonce` needs no guard inside a `catching-up` cell.

What it does not buy: a cell may return a phase of any kind, and may emit any effect. Which phases a transition may lead to and which effects a phase may emit are checked by `machine-check`, not by the type.

### Where the table sits in a module

A module today, `catch-up.ts` for instance, is `createCatchUp(options): CatchUp` with twelve event methods, a `phase` variable and eight closure variables for knowledge, nonces, held requests and digests. After:

```ts
// catch-up-table.ts: pure, imports core only
export type Phase = ...;   // phase kind plus the knowledge that used to live in closure variables
export type Event = ...;   // one kind per former method: enter, heard, fired, stateMerged, ...
export type Effect = CatchUpDecision;   // unchanged: the engine already interprets these
export const catchUpTable: TransitionTable<Phase, Event, Effect> = { ... };

// catch-up.ts: the existing CatchUp interface, now a thin shell
export function createCatchUp(options: CatchUpOptions): CatchUp {
  let phase: Phase = initial(options);
  const feed = (event: Event) => { const next = step(catchUpTable, phase, event); phase = next.phase; return next.effects; };
  return { enter: (trigger) => feed({ kind: 'enter', trigger }), heard: (role, message) => feed({ kind: 'heard', role, message }), ... };
}
```

The engine, `runCatchUp` and the 48 module tests do not change. Module-private state moves into the phase record, so a cell is a pure function of its inputs and `machine-check` can generate it.

Timer rule: `fired(timer)` is one event kind with the timer in its payload. The cell decides; the engine still owns `setTimeout`.

### machine-check

`tests/support/machine-check.ts` exports one function:

```ts
export function checkMachine<Phase extends Tagged<string>, Event extends Tagged<string>, Effect extends Tagged<string>>(spec: {
  name: string;
  table: TransitionTable<Phase, Event, Effect>;
  phases: { [K in Phase['kind']]: fc.Arbitrary<Extract<Phase, { kind: K }>> };
  events: { [K in Event['kind']]: fc.Arbitrary<Extract<Event, { kind: K }>> };
  allowedEffects: { [K in Phase['kind']]: readonly Effect['kind'][] };   // effects a step may emit when it lands in K
  invariants: readonly { name: string; holds: (phase: Phase) => boolean }[];
  diagram: string;   // path under docs/machines/
}): void;
```

For every cell it runs `fc.assert` over the generated phase and event and asserts: the result phase kind is a row of the table; each emitted effect kind is allowed for the result phase; every invariant holds on the result. Then it renders the table to Mermaid `stateDiagram-v2`, one arrow per non-`ignore` cell labelled with the event kind, and compares with the committed file; a stale file fails and the message prints the new text. A `bun:test` file per machine calls it once.

Example invariants from today's code: `adopting` implies `catching-up`; `active.sentNonce` is `null` or equals `active.nonce`; a `write-metadata` effect appears only when the result phase is `writing`.

## Part 2: better-result

### The swap

`src/core/result.ts` goes; `import { Result, TaggedError } from 'better-result'` replaces it. The shapes differ:

| Today | better-result |
| --- | --- |
| `{ ok: true, value }` / `{ ok: false, error }` | `Result.ok(value)` / `Result.err(error)`, `status: 'ok' \| 'err'`, `.value`, `.error` |
| `if (!r.ok) return r` | `yield* r` inside `Result.gen`, or `r.isErr()` |
| `ok(v)`, `err(e)` | `Result.ok(v)`, `Result.err(e)` |

One mechanical change over 48 files; the junit list of `bun test` and `bun run test:browser` equals the baseline. The zod schemas in `ui-messages` and `room-messages` that serialize a `Result`-like shape on the wire, if any, keep their own wire shape; the swap is in memory only.

### Failures

```ts
export class StorageFailure extends TaggedError('StorageFailure')<{ operation: StorageOperation; reason: string; key?: string }> {}
export class SendFailure    extends TaggedError('SendFailure')<{ kind: 'rate-limited' | 'failed'; reason?: string; channel: string }> {}
export class PartyReadFailure extends TaggedError('PartyReadFailure')<{ cause: unknown }> {}
export class PlayerReadFailure extends TaggedError('PlayerReadFailure')<{ field: 'role' | 'name' | 'id'; cause: unknown }> {}
export class MetadataFailure extends TaggedError('MetadataFailure')<{ operation: 'read' | 'write'; cause: unknown }> {}
export class DiceExtensionFailure extends TaggedError('DiceExtensionFailure')<{ reason: string }> {}
```

They live in `src/platform/ports.ts` beside the port they belong to, because both adapters construct them. The port contract tests of TASK-64.3 assert the tag and fields instead of the literal shape.

Port methods that reject today (`party.getPlayers`, `player.getRole`, `metadata.getMetadata`, `notification.show`) return `Promise<Result<T, XFailure>>` through `Result.tryPromise({ try, catch })` in the adapter, so a rejection has a type at the boundary and the replica stops writing `.catch((error) => console.error(...))`.

Three kinds of outcome, kept apart:

| Kind | Example | Channel |
| --- | --- | --- |
| Expected failure of a port | quota, rate limit, a party read that rejects | `Result.err(new XFailure(...))` |
| Domain verdict | `denied`, `stale`, `invalid-message`, `older-version` | a value in the ok channel, as today (`RejectMessage`, `RoomMessageFailure`) |
| Bug | an unknown command, a cell that returns an impossible phase | thrown; `better-result` wraps a throw inside `gen` or `try` as `Panic` |

### One place per failure

Each module gets a `report(failure)` that is an exhaustive `failure.match({...})` returning what to do: a `Notice` for the windows, a retry through the existing backoff, or a log line with the machine, phase and effect. Adding a failure class to a port's union fails to compile until every module that sees it answers. The 86 `console.error` calls become those `match` arms or disappear where a typed result is handled upstream.

## Machine catalog

The phase and event sets below are the starting point. Each machine's ticket fixes its table from the module tests that exist today, and the table, not this document, is then the source of truth.

| Machine | Phases (kinds) | Events it takes | Effects it emits | Verdict |
| --- | --- | --- | --- | --- |
| Catch-up and GM link (AD-6, AD-7, AD-9 gate) | `initializing`, `live`, `catching-up/ordinary`, `catching-up/adopting` | `enter`, `watch`, `room-copy-read`, `party-read`, `generation-heard`, `generation-read`, `adoption-staged`, `heard`, `state-requested`, `ping`, `alive`, `state-merged`, `fired(timer)`, `closing`, `party-changed`, `replica-replaced` | `CatchUpDecision`, unchanged | first table; already decision-shaped, 48 tests |
| Room copy (AD-8) | `idle`, `reading`, `writing`, `verifying`, `stopped` | `edited`, `caught-up`, `page-hidden`, `page-returned`, `fired(pause)`, `read-done`, `write-done`, `verify-done`, `failed` | `read-metadata`, `write-metadata`, `arm`, `publish-status`, `replaced` | second; `WritePhase` exists |
| Generation and adoption (AD-9) | `settled`, `importing`, `staged`, `saving` | `import`, `wipe`, `check-snapshot`, `adopt-from-copy`, `see-generation`, `stage`, `clear-staged`, `save-adoption`, `store-written`, `store-failed`, `role-changed` | `write-store`, `remove-store`, `replace-replica`, `write-import`, `send-reset`, `flush-outbox`, `drop-pending`, `notice`, `reply` | third; keep the synchronous `saveAdoption` contract with `catch-up` |
| Pending edits (AD-4) | per entry: `waiting`, `sent(attempt)`, `denied-quiet` | `edit`, `answered`, `rejected`, `gm-back`, `caught-up`, `fired(resend)`, `drain` | `enqueue-propose`, `arm`, `notice-denied`, `publish` | judged by its ticket |
| Room protocol (AD-5) | `idle`, `assembling(proposals)` | `message`, `sender-known`, `fired(retention)` | `catch-up-event`, `apply`, `reject`, `commit`, `deliver-roll`, `see-generation`, `stage` | judged by its ticket; the promise chain stays until Effect |
| Roll (AD-13) | `idle`, `awaiting-dice` | `roll-request`, `dice-ready`, `dice-result`, `dice-failed`, `roll-received` | `check-dice`, `roll-dice`, `send-roll`, `reply-outcome`, `notify` | stays a linear function with `Result.gen`; two phases add nothing |

Not machines: `command-routing` stays a pure router; `composers`, `record-store`, `version-minter`, `party-roster` and `window-publisher` are libraries. The token menu, scene watch and open requests stay engine wiring, as doc-4 left them.

## Tests and their boundaries

| Level | Runs | Proves |
| --- | --- | --- |
| Table tests, `src/replica/*-table.test.ts` | `step()` on the table | a cell's decision |
| machine-check, one `bun:test` file per machine | every cell with generated data | completeness, invariants, diagram freshness |
| Module tests, existing `catch-up.test.ts`, `room-copy.test.ts`, `generation-flow.test.ts` | the module shell over its table, fake ports | unchanged module behavior |
| Engine tests, `src/replica/engine-*.test.ts` | the rig, mock platform, real clock | unchanged room behavior, junit list equal to the baseline per step |
| Port contract, TASK-64.3 | mock and Chromium | tagged failures where literal failures were |

## Migration

One step per PR, the full check and a junit list equal to the baseline on each:

| Step | Change | Oracle |
| --- | --- | --- |
| 0 | `src/replica/machine.ts`, `tests/support/machine-check.ts`, `docs/machines/`. `catch-up.ts` becomes a shell over `catch-up-table.ts`; the engine does not change | `catch-up.test.ts` and the engine suite; the generated `docs/machines/catch-up.md` |
| 1 | `better-result` replaces `src/core/result.ts` in 48 files, no behavior change | `bun test`, `bun run test:browser` lists equal to the baseline |
| 2 | Tagged failures in `ports.ts`; the four rejecting port methods return results; both adapters and the port contract updated; `console.error` in `src/replica` replaced by `match` arms | port contract, engine suite, `grep -c console.error src/replica` down to 0 |
| 3 | `room-copy` as a table | `room-copy.test.ts`, `engine-room-copy` |
| 4 | `generation-flow` as a table | `generation-flow.test.ts`, `engine-import`, `engine-catch-up` |
| 5 | `pending-edits` and `room-protocol` judged; tables where the ticket finds more than two phases | their module tests, `engine-propose`, `engine-client` |
| 6 | Spine: the Replica row names `machine.ts` and the table rule; ADR-0004 to accepted | docs checks |

Each step is one backlog task under one epic, created when the owner accepts the ADR. Steps 3 to 5 are independent once 0 to 2 are in.

## When Effect comes back

Reopen the deferred part when one of these is true, and then measure before deciding:

- The engine tests stay racy under real timers after the tables land. Evidence today: the two-GM cases under mutation M5 in `deferred-work.md` (TASK-48). `TestClock` is the fix Effect offers; the spike runs it.
- A second module grows its own `stopped` and timer bookkeeping beyond `room-copy`'s lifecycle. `Scope` and interruption are the fix.
- The owner wants `engine-*.test.ts` on virtual time.

The spike's `runner.ts` is the shape to start from: the same tables, a `Queue` per machine, `Match.exhaustive` over effects, services over ports. Cost measured: 17 KB gzip with `Data.TaggedError`.

## Risks and what bounds them

| Risk | Bound |
| --- | --- |
| `better-result` is a one-author library at 3.0.1 | zero dependencies, 3.4 KB, MIT; its `Result` is a small surface the repo could vendor if it stalls |
| The `Result` swap touches 48 files | mechanical, one PR, no behavior change, lists equal to the baseline |
| A table that turns `'ignore'` into a silent drop | `'ignore'` is written per cell on purpose; `machine-check`'s diagram shows the dropped events to a reviewer |
| Phase records grow when closure variables move into them | the module tests already name every variable; the record mirrors them |
| The adoption contract between `catch-up` and `generation-flow` | unchanged in this design: `saveAdoption` stays a synchronous callback |

## Measurements behind this document

From `prototypes/effect-machine-spike/`, run on 2026-11-18 with `bun@1.4.4` and `typescript@7.0.2`:

| Check | Result |
| --- | --- |
| `tsc` with the missing-cell file | passes; the missing cell is TS2741 under `@ts-expect-error` |
| `better-result@3.0.1`: tagged errors, `Result.gen`, `tryPromise`, exhaustive `match` | compiles; 3.4 KB gzip (10.7 KB raw) |
| `effect@4.1.4` runner + Queue + Ref + Match + Layer + `Data.TaggedError` | 17.0 KB gzip (50.4 KB raw); `TestClock.adjust('20 seconds')` fires the silence timer |
| The same with `Schema.TaggedError` | 30.9 KB gzip (93.6 KB raw) |
| Background page today | 97 KB gzip across its four chunks |
