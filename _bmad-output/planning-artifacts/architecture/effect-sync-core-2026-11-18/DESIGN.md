# Replica machines as tables, failures as tagged results

Status: accepted, 2026-11-18. Decision record: `docs/adr/0004-replica-machines-are-complete-transition-tables-with-tagged-results.md`. Spike: `prototypes/effect-machine-spike/`.

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
| 1, lifecycle (`stopped`, timers) | one `AbortSignal` from the engine replaces the `stopped` getters; one timer helper `schedule(signal, ms, fn)` that cancels itself on `abort` | none; Effect's `Scope` later becomes a mechanical swap |
| 1, superseded answers (the five epoch counters) | stay as they are; they answer "did a newer request of the same kind start meanwhile", not "did the client stop" | `effect` fibers, named in the revisit conditions |
| 1, time | one clock port `{ now, schedule }` with the OBR and mock adapters; the rig keeps real time, and its move to explicit time is a later task | none; Effect's `TestClock` is the later form |
| 1, sequencing (`roomMessages` chain) | deferred | `effect` `Queue`, when the ADR's revisit conditions hold |

## Findings folded in from the second review

A parallel review of the same three goals (report of 2026-11-18, `https://reports.1218217.xyz/reports/owlbear-muster-roll/20261118T191918Z-ceea5a4b/index.html`) added facts this design now carries. Reports are cited by link, because candidate numbers differ between reports.

| Finding | Where in the code | What the design does with it |
| --- | --- | --- |
| Two definitions of an online GM: `knowledge.gmLink` from GM-origin messages (the glossary's meaning) and `gmInRoom()` from the party list, used by the roll flow when dice readiness is unknown | `catch-up.ts:159-163`, `engine.ts:1040`, `roll-flow.ts:210` | They answer different questions. Owner decision of 2026-11-18: the party one is renamed `gmInParty`, the roll flow's behavior does not change, and both terms go to `GLOSSARY.md` |
| Eight phase-event pairs answered by a silent `return []`, plus the `fired` fallthrough that `deferred-work.md` already lists | `catch-up.ts:285, 340, 489, 534, 554-562, 649-655, 738-740, 753` | Each becomes an `'ignore'` cell or a transition in the table. The list is the step 0 checklist; the generated diagram shows every `'ignore'` to the reviewer |
| The decision interpreter and the timer registry live in the engine: `catchUpTimers` keyed by string, `arm`/`disarm`, a 17-branch `runCatchUp` | `engine.ts:310, 517-558, 560-683` | Step 0b: `catch-up-effects.ts` with an injected scheduler; the engine loses about 180 lines. After step 0 is green, so the oracle sees one change at a time |
| Seven failure patterns: `Result` up to the composition seam; `.catch` to console (about 40, 23 in the engine); `try/catch`, log, `null`; sentinel strings in `problemKeys`; a domain enum collapsed to one text (`too-large` shown as "Нет прав на правку"); silent zod rejections; silent drops of oversized messages | `engine.ts:80-84, 931, 1030-1038, 1343-1349`, `room-copy.ts:651`, `party-roster.ts:38`, `send-queue.ts:102, 121, 188`, `pending-edits.ts:561`, `room-protocol.ts:144-150, 285, 314, 332`, `dice-extension.ts:109, 126`, `commit-outbox.ts:73, 107` | Part 2 covers port failures. Domain verdicts keep their reason: `deniesEdit` returns the cause and the window shows `too-large` apart from `denied`. Silent drops become reported failures with a tag each |
| Where the window never learns of a failure: a failed `commit`, `state` or `propose` send; a metadata read; a role read that leaves the old role; a party read; `action.open()` losing an open request; a GM not in `live` dropping a `propose` | `engine.ts:746-749, 1229`, `room-protocol.ts:271` | Each is a `ReplicaFailure` tag; the sink below publishes them |
| `stopped` in six modules, four styles of timer ownership, five epoch counters, a `stop()` of thirteen calls, construction order held by a comment | `engine.ts:303, 1393-1413`, `room-copy.ts`, `commit-outbox.ts:42`, `scene-watch.ts:24`, `dice-extension.ts:97`, `proposal-queue.ts:389`, `party-roster.ts:21` | The lifecycle step below takes `stopped` and the timer styles. Owner decision of 2026-11-18: the five epoch counters stay, because they detect a superseded answer, not a stop; they are the first item of the Effect revisit condition |
| Two time sources, `Date.now` and `performance.now`, five timer styles, and a rig that polls every 2 ms up to 2000 ms | `catch-up.ts:316`, `engine.ts:744, 771`, `room-protocol.ts:283`, `pending-edits.ts:212`, `dice-extension.ts:216, 312, 392`, `tests/support/room-rig.ts:37-38` | The clock port step below |
| TASK-114.2 touches `engine.ts:740-797` and `1343-1349` and adds one more silent parse drop on purpose; its spec forbids merging `proposal-queue` into `pending-edits` there | spec-task-114-2 | The failure sink lands after TASK-114.2, so the new drop goes through `report` from the start. The catch-up table and the `AbortSignal` step run in parallel with TASK-114; the `AbortSignal` step leaves the `heldOpen` block at `engine.ts:740-797` untouched until TASK-114.2 is merged |
| Helper port fans: `GenerationFlowPorts` 22, `RoomProtocolPorts` 24, `CommandRoutingPorts` 22, `RollFlowPorts` 15; `role`, `stopped`, `records`, `publish` repeat three to four times; about 300 lines of wiring | `engine.ts` | Recorded under the Effect option: a `Layer` graph before the modules are recut renames the fan without narrowing it |

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

Timer rule: `fired(timer)` is one event kind with the timer in its payload. The cell decides; the engine still owns `setTimeout` until step 0b.

GM link: a second table, `livenessTable`, in the same module, with phases `unknown`, `online`, `offline`. The shell feeds each event to the catch-up table first and then to the liveness table, synchronously, so no runner is needed and the two tables never call each other. The `catching-up` phase still decides whether a GM answers `alive`; the liveness table only decides the link. `gmInRoom()` in the engine is a different question, whether a GM is in the party at all, asked by the roll flow when dice readiness is unknown; it is renamed `gmInParty` and both terms land in `GLOSSARY.md`. The owner confirmed the two tables in one shell, the rename and step 0b on 2026-11-18, in the first grilling round on catch-up; the ADR moves to accepted after the second reviewer's read of this document, and the backlog epic is created from the migration table then.

Step 0 checklist, the silent pairs that become declared cells: `catch-up.ts:285` (`enter` while adopting), `:340` (adoption staged outside adopting), `:489` (a generation not higher than the target), `:534` (a party read for another nonce), `:554-562` (room-copy read outside the active request), `:649-655` (a state part for another nonce), `:738-740` (a request timer for another nonce), `:753` (the `fired` fallthrough).

Step 0b: `catch-up-effects.ts` takes the 17-branch `runCatchUp`, `catchUpTimers`, `armCatchUpTimer` and `disarmCatchUpTimer` out of the engine. Timers go through the one replica timer helper, `schedule(signal, ms, fn)`, which returns a cancel function and cancels itself on `abort`; the helper knows no keys, so the map from a `CatchUpTimer` key to its cancel function stays inside `catch-up-effects.ts`. The interpreter is tested with a fake helper and the engine loses about 180 lines. It lands only after step 0 is green, so the engine suite sees one change at a time.

Boundary of the completeness check: a conditional no-op inside a cell, such as a stale nonce returning `{ phase, effects: [] }`, is a decision of that cell and is covered by its table test in `*-table.test.ts`, not by `machine-check`. `machine-check` sees cells, not branches inside them.

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

### Policy in the module, delivery in one sink

The module decides what a failure means for its flow, because only it knows: a failed room-copy write retries on the existing backoff, a failed role read keeps the old role, a failed `state` send waits for the next `state-request`. That decision is an exhaustive `failure.match({...})` per module, so adding a failure class to a port's union fails to compile until every module that sees it answers.

Delivery is one place: `src/replica/failures.ts` exports `ReplicaFailure`, the union of every port failure class plus the replica's own tags (`send-dropped`, `record-too-large`, `message-rejected`, `open-request-lost`, `propose-dropped`), and `report(failure)`. The engine holds a bounded list of recent failures and publishes it in the projection as a `diagnostics` notice, beside the four notices that exist. The window shows it to a GM only, as a collapsed block «Диагностика» in the settings; the banners players see do not change; the text lives in `src/copy.ts`. Tests read the list instead of `spyOn(console, 'error')`, which about 15 tests do today and which pins the console as the sink. The console keeps one subscriber. The 86 `console.error` calls become `match` arms or `report` calls, or disappear where a typed result is handled upstream.

Domain verdicts keep their reason. `deniesEdit` in `pending-edits.ts` collapses `gone` and `too-large` into one boolean and one text; it returns the cause instead, and the window shows "too large" apart from "no write access". The silent zod rejections in `engine.ts`, `room-protocol.ts` and `dice-extension.ts`, and the silent drops of oversized messages, become `message-rejected` and `record-too-large` reports.

The error classes are `Error` subclasses and live in `src/platform/ports.ts`, not in `src/core`; core receives only `Result` values, which are plain data, so ADR-0003's rule for core holds.

## Machine catalog

The phase and event sets below are the starting point. Each machine's ticket fixes its table from the module tests that exist today, and the table, not this document, is then the source of truth.

| Machine | Phases (kinds) | Events it takes | Effects it emits | Verdict |
| --- | --- | --- | --- | --- |
| Catch-up and GM link (AD-6, AD-7, AD-9 gate) | `initializing`, `live`, `catching-up/ordinary`, `catching-up/adopting` | `enter`, `watch`, `room-copy-read`, `party-read`, `generation-heard`, `generation-read`, `adoption-staged`, `heard`, `state-requested`, `ping`, `alive`, `state-merged`, `fired(timer)`, `closing`, `party-changed`, `replica-replaced` | `CatchUpDecision`, unchanged | first table; already decision-shaped, 48 tests |
| GM link (AD-6), `livenessTable` in the same module | `unknown`, `online`, `offline` | `heard(GM)`, `fired(gm-silence)`, `fired(ping)`, `role` | `arm`, `disarm`, `ping`, `show`, `gm-back` | first, beside the catch-up table; fed by the same shell |
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
| 0 | `src/replica/machine.ts`, `tests/support/machine-check.ts`, `docs/machines/`. `catch-up.ts` becomes a shell over `catch-up-table.ts` and `livenessTable`; the eight silent pairs become declared cells; `gmInParty` named; the engine does not change | `catch-up.test.ts` and the engine suite; the generated `docs/machines/catch-up.md` |
| 0b | `catch-up-effects.ts`: the interpreter and the timer registry leave the engine behind the one timer helper `schedule(signal, ms, fn)` | engine suite; interpreter tests on a fake helper |
| 1 | `better-result` replaces `src/core/result.ts` in 48 files, one mechanical PR, no behavior change. Owner decision of 2026-11-18 | `bun test`, `bun run test:browser` junit lists equal to the baseline |
| 2 | Lifecycle, one PR over all six modules, after step 0b, in parallel with TASK-114, leaving `engine.ts:740-797` (`heldOpen`) untouched until TASK-114.2 is merged: the engine owns one `AbortController`; helpers take `signal` instead of `stopped: () => boolean`; one helper `schedule(signal, ms, fn)` replaces the four timer styles; subscriptions hang on `abort`; a read that returns after `stop()` is dropped by `signal.aborted`; `stop()` is one `abort()` plus the outbox flush. The five epoch counters stay | engine suite; `grep -c stopped src/replica` down to the `room-copy` phase name; one `setTimeout` call site in `src/replica` |
| 3 | Clock port `{ now, schedule }` in `ports.ts` with the OBR and mock adapters; the engine and the timer helper take time from it; `Date.now` and `performance.now` leave `src/replica`. Owner decision of 2026-11-18: moving the rig to `advance(ms)` and replacing `pause()` and `waitUntil` is not part of this step; it is a later task, file by file | engine suite unchanged, `waitUntil` as it is; `grep -c "Date.now\|performance.now" src/replica` down to 0 |
| 4 | Tagged failures in `ports.ts`; the four rejecting port methods return results; both adapters and the port contract updated; `failures.ts` with `ReplicaFailure`, `report` and the bounded list published in the projection as the `diagnostics` notice; `deniesEdit` returns its cause; `console.error` in `src/replica` replaced, the console one subscriber. After TASK-114.2. Owner decision of 2026-11-18: the hybrid as written in part 2, policy in the module, delivery in one sink | port contract, engine suite, `grep -c console.error src/replica` down to 1 |
| 4b | The window shows `diagnostics` to a GM only, as a collapsed block «Диагностика» in the settings; player banners do not change; the text lives in `src/copy.ts`. Owner decision of 2026-11-18 | `window-view` and settings tests; the e2e suite for a player sees no new banner |
| 5 | `room-copy` as a table | `room-copy.test.ts`, `engine-room-copy` |
| 6 | `generation-flow` as a table | `generation-flow.test.ts`, `engine-import`, `engine-catch-up` |
| 7 | `pending-edits` and `room-protocol` judged; tables where the ticket finds more than two phases. After TASK-114.2, whose spec forbids merging `proposal-queue` into `pending-edits` | their module tests, `engine-propose`, `engine-client` |
| 8 | Spine: the Replica row names `machine.ts`, the table rule, the signal and the clock port; `GLOSSARY.md` gains the two GM terms; ADR-0004 to accepted | docs checks |

Each step is one backlog task under the epic TASK-115: steps 0 to 8 are TASK-115.1 to TASK-115.11 in table order, and the rig's move to explicit time is TASK-116. Order, as the owner set it on 2026-11-18: steps 0, 0b, 2 and 3 do not depend on `better-result` and run in parallel with TASK-114; step 1 lands after TASK-114.3 is merged, so after all three block-address PRs; step 4 follows step 1, and steps 4b and 7 also wait for TASK-114.2. Steps 5 to 7 are independent once 0 to 4 are in. The rig's move to explicit time is a task of its own, outside this table.

## When Effect comes back

Reopen the deferred part when one of these is true, and then measure before deciding:

- The engine tests stay racy after the clock port lands. Evidence today: the two-GM cases under mutation M5 in `deferred-work.md` (TASK-48). `TestClock` is the fuller form of the clock port.
- After the `AbortSignal` step, places remain where one signal is not enough. The five epoch counters (`scene-watch.ts:27`, `party-roster.ts:21`, `engine.ts:302`, `room-copy.ts:86`, `proposal-queue.ts:80`) are the known ones: each drops an answer superseded by a newer request of the same kind, which a fiber interrupted by its successor expresses without a counter. A read that must outlive the client, or a cancellation that needs an order, counts too. `Scope` and interruption are the fix.
- The `roomMessages` promise chain, the room-copy write mutex or the six hand-written backoffs need a second copy. `Queue` and `Schedule` are the fix.

The spike's `runner.ts` is the shape to start from: the same tables, a `Queue` per machine, `Match.exhaustive` over effects, services over ports. Cost measured: 17 KB gzip with `Data.TaggedError`. One argument against going earlier: the helper port fans (`GenerationFlowPorts` 22, `RoomProtocolPorts` 24, `CommandRoutingPorts` 22, `RollFlowPorts` 15) hand the engine's private state to each helper; a `Layer` graph before those modules are recut renames the fan without narrowing it. Two shapes in the engine do not fit structured concurrency and stay as they are under any path: `flushNow` on `pagehide` starts every send and waits for none, and broadcast sends are one-way, answered by a later room message rather than a promise.

## Risks and what bounds them

| Risk | Bound |
| --- | --- |
| `better-result` is a one-author library at 3.0.1 | zero dependencies, 3.4 KB, MIT; its `Result` is a small surface the repo could vendor if it stalls |
| The `Result` swap touches 48 files | mechanical, one PR, no behavior change, lists equal to the baseline |
| A table that turns `'ignore'` into a silent drop | `'ignore'` is written per cell on purpose; `machine-check`'s diagram shows the dropped events to a reviewer |
| A conditional no-op inside a cell, such as a stale nonce returning `{ phase, effects: [] }`, hides from `machine-check` | Owner decision of 2026-11-18: this is the check's boundary. Such branches are covered by the cell's table test in `*-table.test.ts`; a reviewer reads them as code, not as a diagram arrow |
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
