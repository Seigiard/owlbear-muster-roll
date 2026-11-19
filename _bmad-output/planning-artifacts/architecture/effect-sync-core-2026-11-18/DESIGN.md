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
| 1, simpler core | tables replace state switches and closure variables in the machine shells. `Result.gen` and `.isErr()` replace old result checks | the two above |
| 1, lifecycle (`stopped`, timers) | one `AbortSignal` from the engine replaces lifecycle flags. `stop()` only aborts. The outbox discards held commits and acknowledgements on abort. `flushNow()` on page hide sends them instead. `schedule(signal, ms, fn)` cancels its timer on abort | none |
| 1, superseded answers (the five epoch counters) | stay as they are; they answer "did a newer request of the same kind start meanwhile", not "did the client stop" | `effect` fibers, named in the revisit conditions |
| 1, time | `Platform.clock` supplies `now` and `schedule` to the replica. Both adapters use wall time (`Date.now()`) even for elapsed durations. A wall-clock change can affect dice readiness, probe age and pending-edit timing. The dice protocol and diagnostics need wall time. The mock rig also offers explicit time | none |
| 1, sequencing (`roomMessages` chain) | deferred | `effect` `Queue`, when the ADR's revisit conditions hold |

## Findings folded in from the second review

A parallel review of the same three goals (report of 2026-11-18, `https://reports.1218217.xyz/reports/owlbear-muster-roll/20261118T191918Z-ceea5a4b/index.html`) added facts this design now carries. Reports are cited by link, because candidate numbers differ between reports.

| Finding | Where in the code | What the design does with it |
| --- | --- | --- |
| Two definitions of an online GM: `knowledge.gmLink` from GM-origin messages (the glossary's meaning) and `gmInRoom()` from the party list, used by the roll flow when dice readiness is unknown | `catch-up.ts:159-163`, `engine.ts:1040`, `roll-flow.ts:210` | They answer different questions. Owner decision of 2026-11-18: the party one is renamed `gmInParty`, the roll flow's behavior does not change, and both terms go to `GLOSSARY.md` |
| Eight phase-event cases with a silent return, including the `fired` fallthrough | `catch-up.ts:285, 340, 489, 534, 554-562, 649-655, 738-740, 753` | The table gives each case an explicit `'ignore'` cell or a branch within a cell. The diagram omits `'ignore'` cells |
| The decision interpreter and the timer registry live in the engine: `catchUpTimers` keyed by string, `arm`/`disarm`, a 17-branch `runCatchUp` | `engine.ts:310, 517-558, 560-683` | Step 0b moves the interpreter and timer registry to `catch-up-effects.ts`. The engine loses 128 lines and keeps the four send ports |
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

`catch-up.ts` keeps the `CatchUp` interface and holds the current phase. `catch-up-table.ts` defines four rows: `initializing`, `catching-up`, `adopting`, and `live`. The table keeps the data that used to sit in closure variables in the phase records. `CatchUpDecision` retains its `type` discriminant. Phases and events use `kind`.

`livenessTable` is the second table in `catch-up-table.ts`. It starts `offline` and has no `unknown` phase. A silence event when already `offline` emits nothing. The shell feeds `heard`, `fired`, and `watch` to `catchUpTable` first and then to `livenessTable`. The tables do not call each other. `catchUpTable` handles incoming `ping` and decides whether to answer `alive`; `livenessTable` decides `gmLink`. The roll flow's `gmInParty` check still reads the party list. Step 0 renamed that predicate in the engine but left the catch-up wiring in place.

The catch-up shell calls `saveAdoption` synchronously and feeds its result into the table as `adoption-saved`. The `answersOwn` check stays in `catch-up.ts`. The room protocol uses it when a GM's higher-generation `state` answers this client's request. Generation flow receives `keepNonce`, not the nonce.

The step 0 checklist came from the old `catch-up.ts`: `enter` while adopting, adoption staged outside adopting, a generation not higher than the target, stale nonces for party reads, room-copy reads, state parts and request timers, and the `fired` fallthrough. The table makes each case an ignored cell or a decision within a cell.

`catch-up-effects.ts` runs the returned decisions and maps each timer key to its cancel function. `Platform.clock.schedule(signal, ms, fn)` knows no timer keys. A timer feeds `fired` with the timer in its payload and the cell decides what to do. The engine keeps the `state-request`, `state`, `alive`, and `ping` send ports because they use the send queue, generation or replica. Step 0b first used the controller for the interpreter alone. Step 2 extended that signal across the engine's helpers. Step 4 redirected the interpreter's failure tests from the console to `report`.

Boundary of the completeness check: a conditional no-op inside a cell, such as a stale nonce returning `{ phase, effects: [] }`, is a decision of that cell and is covered by its table test in `*-table.test.ts`, not by `machine-check`. `machine-check` sees cells, not branches inside them.

### machine-check

`tests/support/machine-check.ts` exports one function:

```ts
export function checkMachine<Phase extends Tagged<string>, Event extends Tagged<string>, Effect extends { readonly type: string }>(spec: {
  name: string;
  table: TransitionTable<Phase, Event, Effect>;
  phases: { [K in Phase['kind']]: fc.Arbitrary<Extract<Phase, { kind: K }>> };
  events: { [K in Event['kind']]: fc.Arbitrary<Extract<Event, { kind: K }>> };
  allowedEffects: { [K in Phase['kind']]: readonly Effect['type'][] };   // effects a step may emit when it lands in K
  invariants: readonly { name: string; holds: (phase: Phase) => boolean }[];
  diagram: string;   // path under docs/machines/
}): void;
```

For each non-`ignore` cell, `checkMachine` samples phases and events with a fixed seed. It checks that the result phase has a row, that the result phase allows every emitted effect `type`, and that each invariant holds. The Mermaid diagram draws an arrow for each sampled destination, labelled by event `kind`. It does not draw `'ignore'` cells or branches the samples miss. The table tests cover those branches. The checker compares the generated diagram with the committed file and prints the replacement if it differs.

For example, catch-up checks that `active.sentNonce` is `null` or equals `active.nonce`. Room copy allows `write-metadata` when the result phase is `writing`, never when it is `stopped`.

## Part 2: better-result

### The swap

`src/core/result.ts` goes; `import { Result, TaggedError } from 'better-result'` replaces it. The shapes differ:

| Today | better-result |
| --- | --- |
| `{ ok: true, value }` / `{ ok: false, error }` | `Result.ok(value)` / `Result.err(error)`, `status: 'ok' \| 'err'`, `.value`, `.error` |
| `if (!r.ok) return r` | `yield* r` inside `Result.gen`, or `r.isErr()` |
| `ok(v)`, `err(e)` | `Result.ok(v)`, `Result.err(e)` |

The swap changes in-memory results, not the wire format. Engine tests now compare `Result` instances or read `.isOk()` instead of comparing the old object literals. The expected payloads did not change.

### Failures

`src/platform/ports.ts` defines the `TaggedError` classes that both adapters construct. The port contract tests of TASK-64.3 assert their tags and fields. Send and storage types still accept plain failure data from older test doubles. The replica normalizes those values before reporting them.

`party.getPlayers`, `player.getRole`, `metadata.getMetadata`, and `notification.show` return `Result` values in their promises. The OBR adapter uses `Result.tryPromise` for those calls. `metadata.setMetadata` still returns `Promise<void>` and can reject. The room-copy shell reports a rejected write as `MetadataFailure` with operation `write`. A rejected `action.setSize` reports `message-rejected`. There is no dedicated window-size failure class.

Three kinds of outcome, kept apart:

| Kind | Example | Channel |
| --- | --- | --- |
| Expected failure of a port | quota, rate limit, a party read that rejects | `Result.err(new XFailure(...))` |
| Domain verdict | `denied`, `stale`, `invalid-message`, `older-version` | a value in the ok channel, as today (`RejectMessage`, `RoomMessageFailure`) |
| Bug | an unknown command, a cell that returns an impossible phase | thrown; `better-result` wraps a throw inside `gen` or `try` as `Panic` |

### Policy in the module, delivery in one sink

The module decides what a failure means for its flow. For example, a failed role read keeps the old role, and a failed `state` send waits for the next `state-request`. The sink uses exhaustive `.match` to turn each `ReplicaFailure` tag into diagnostic detail. `createPartyRoster` takes a single options object with the party port, required `report` and `signal`, and an optional `onReplace`.

`createFailureSink` in `src/replica/failures.ts` accepts tagged port and replica failures through its `report` callback. It keeps a bounded list of timestamped diagnostics. The engine publishes the list as the `diagnostics` field of the window projection. Only GMs see the collapsed «Диагностика» block in Settings. Player banners do not change. The text lives in `src/copy.ts`. Tests that check failure delivery read reports or diagnostics. Tests with console spies that only silenced expected output no longer use those spies or assert the tags. The engine's console subscriber is the replica's only `console.error` call.

Domain verdicts keep their reason. `deniesEdit` in `pending-edits.ts` returns the denial cause. The player sees a different notification for `too-large` than for a lack of write access. Parse failures and oversized records can reach the sink as `message-rejected` and `record-too-large`.

The port error classes stay in `src/platform/ports.ts`. Core uses `Result` without importing the platform.

## Machine catalog

The tables are the source of truth for their cells. The catalog names the phases and points to each diagram. The remaining rows describe why those flows do not need a table.

| Machine | Phases (kinds) | Events it takes | Effects it emits | Verdict |
| --- | --- | --- | --- | --- |
| Catch-up (AD-7, AD-9 gate) | `initializing`, `catching-up`, `adopting`, `live` | `Event` in `catch-up-table.ts`, including `adoption-saved` | `CatchUpDecision`, unchanged | `catchUpTable`, [diagram](../../../../docs/machines/catch-up.md) |
| GM link (AD-6) | `offline`, `online` | `heard`, `fired`, `watch` | `arm`, `ping`, `show`, `gm-back` | `livenessTable` in `catch-up-table.ts`, [diagram](../../../../docs/machines/liveness.md) |
| Room copy (AD-8) | `idle`, `reading`, `writing`, `verifying`, `stopped` | `Event` in `room-copy-table.ts`, including `stop` and `edited` with import data | `Effect` in `room-copy-table.ts` | `roomCopyTable` in the `room-copy.ts` shell, [diagram](../../../../docs/machines/room-copy.md) |
| Generation and adoption (AD-9) | `settled`, `importing`, `staged`, `saving` | `Event` in `generation-table.ts` | `Effect` in `generation-table.ts` | `generationTable` in the `generation-flow.ts` shell, [diagram](../../../../docs/machines/generation.md). `saveAdoption` stays synchronous |
| Pending edits (AD-4) | No phase table | edits, replies, catch-up exit, and resend | queue proposals, publish, or notify | stays linear (TASK-115.10). An entry either waits for a version or has one. The denial quiet window spans keys |
| Room protocol (AD-5) | No phase table | incoming room messages | validate, dispatch, and reply as needed | stays linear (TASK-115.10). Fragment assembly belongs to one edit tuple, not to a protocol phase |
| Roll (AD-13) | No phase table | roll request and dice or room replies | roll, send, reply, or notify | stays a linear function |

Ordinary and import writes share the room-copy phase as their mutex. An import attaches its data to `edited` rather than adding an event kind. The `stopped` phase retains an in-flight write. A write sent before `stop()` can finish its read-back, publish status and resolve a waiting import. It cannot write again, merge records or arm the pause timer. The dice result code `'stopped'` also remains. It means the background stopped while a roll waited, not that a lifecycle flag remains.

`pending-edits` stays a linear function. Each live entry in `proposal-queue` either waits for a version or has a version. The `sent` bit tracks whether any version was composed for sending. The denial quiet window spans keys and starts only when a notice is shown; it is not an entry phase. An entry without a version cannot match an acknowledgement or be resent. Other decisions use the current records or match the exact edit tuple. `proposal-queue` stays separate: resend timing and send-time composition belong to the queue. The cross-module rules (an edit applied at most once, an older answer never clearing a newer edit) are the subject of `formal/edit-delivery/`, not of a table.

`room-protocol` stays a linear function. `roomMessages` serializes handler dispatch even when a sender lookup is slow. An incomplete proposal belongs to one sender, generation and edit tuple, and does not change how the protocol handles other messages. The fragment assembler expires incomplete sets when a later fragment arrives. AD-5 already lists the allowed messages by sender role and generation relation. The `roomMessages` promise chain stays unchanged until the Effect revisit.

Not machines: `command-routing` stays a pure router; `composers`, `record-store`, `version-minter`, `party-roster` and `window-publisher` are libraries. The token menu, scene watch and open requests stay engine wiring, as doc-4 left them.

## Tests and their boundaries

| Level | Runs | Proves |
| --- | --- | --- |
| Table tests, `src/replica/*-table.test.ts` | `step()` on the table | a cell's decision |
| machine-check, one `bun:test` file per machine | every cell with generated data | completeness, invariants, diagram freshness |
| Module tests, existing `catch-up.test.ts`, `room-copy.test.ts`, `generation-flow.test.ts` | the module shell over its table, fake ports | unchanged module behavior |
| Engine tests, `src/replica/engine-*.test.ts` | the room rig and mock platform. `engine-catch-up`, `engine-liveness`, and `engine-no-gm` use `createRoomRig({ clock: 'manual' })` and `rig.advance(ms)`. The other files keep real time and `pause()` | room behavior. Catch-up elapsed-time assertions use `roomRig.now()` with the original bounds |
| Port contract, TASK-64.3 | mock and Chromium | tagged failures where literal failures were |

## Migration

The implementation PRs land in `epic/task-115`. The [epic PR #63](https://github.com/Seigiard/owlbear-muster-roll/pull/63) targets `master`.

| Step | Task | Status and PR | Change | Oracle |
| --- | --- | --- | --- | --- |
| 0 | TASK-115.1 | Done [#62](https://github.com/Seigiard/owlbear-muster-roll/pull/62) | `machine.ts`, `machine-check.ts`, `catchUpTable`, and `livenessTable`. Renamed `gmInParty` without changing catch-up wiring | catch-up tests and both generated diagrams |
| 0b | TASK-115.2 | Done [#66](https://github.com/Seigiard/owlbear-muster-roll/pull/66) | Moved interpretation and timer keys to `catch-up-effects.ts` | interpreter tests with a fake scheduler and engine tests |
| 1 | TASK-115.3 | Done [#58](https://github.com/Seigiard/owlbear-muster-roll/pull/58) | `better-result` replaced `src/core/result.ts` | unit and browser test lists against baseline. Engine tests use `Result` instances without changing the expected payloads |
| 2 | TASK-115.4 | Done [#68](https://github.com/Seigiard/owlbear-muster-roll/pull/68) | One engine `AbortController`. `stop()` aborts and the outbox discards held commits and acknowledgements. Epoch counters still reject superseded answers | engine tests, including no held commit after stop. Lifecycle tests renamed to describe abort. `stopped` remains a room-copy phase and a dice result code, not a flag |
| 3 | TASK-115.5 | Done [#70](https://github.com/Seigiard/owlbear-muster-roll/pull/70) | OBR and mock implement `Platform.clock`. `Date.now`, `performance.now`, and `setTimeout` are absent from replica production code. The platform send queue and mock keep their own timers | engine tests and the five scheduler tests, moved unchanged to `src/platform/schedule.test.ts` |
| 4 | TASK-115.6 | Done [#67](https://github.com/Seigiard/owlbear-muster-roll/pull/67) | Tagged port failures, the failure sink and projection diagnostics | port contract and engine tests. The send-queue test now says it reports a failure. The room gate test now expects a valid v4 `ping` to get an answer without a rejection |
| 4b | TASK-115.7 | Done [#69](https://github.com/Seigiard/owlbear-muster-roll/pull/69) | GM-only «Диагностика» in Settings | settings and browser tests |
| 5 | TASK-115.8 | Done [#71](https://github.com/Seigiard/owlbear-muster-roll/pull/71) | `room-copy-table.ts` | room-copy table, shell and engine tests, including completion of a write sent before stop |
| 6 | TASK-115.9 | Done [#74](https://github.com/Seigiard/owlbear-muster-roll/pull/74) | `generation-table.ts`. Synchronous adoption and the catch-up nonce check stay at their module boundaries | generation table, shell and engine tests |
| 7 | TASK-115.10 | Done [#73](https://github.com/Seigiard/owlbear-muster-roll/pull/73) | Kept `pending-edits` and `room-protocol` linear and left `proposal-queue` separate | existing module and engine tests |
| 8 | TASK-115.11 | Done [#75](https://github.com/Seigiard/owlbear-muster-roll/pull/75) | Aligned the architecture spine, DESIGN, and ADR-0004 with the code. The glossary already defined both GM terms | docs checks |
| Rig | TASK-116 | Done [#72](https://github.com/Seigiard/owlbear-muster-roll/pull/72) | Three engine test files moved to manual time. The rest can migrate file by file | unchanged elapsed-time bounds in `engine-catch-up` |

The baseline records test names, not unchanged source literals. Steps 2 and 4 include the renames noted above. `deferred-work.md` records isolated browser reruns for steps 0b, 1, and 4. They do not change the replica design.

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
| The `Result` swap changes the in-memory representation | tests compare the new representation with the same expected payloads |
| A table that turns `'ignore'` into a silent drop | the table declares `'ignore'` in each ignored cell. The diagram omits those cells, so read the table to see the drops |
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
