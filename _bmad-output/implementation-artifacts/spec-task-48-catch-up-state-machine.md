---
title: 'TASK-48: make catch-up and the GM link one state machine'
type: 'refactor'
created: '2026-11-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3fb9dde2f413c79178f37b173338c3ceffc923a5'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-45-pending-edits-module.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The AD-6 and AD-7 rules, and the AD-9 rules that gate them while a generation is adopted, are spread over about 25 functions and 21 variables inside `startReplicaEngine` (`src/replica/engine.ts`). Unrelated paths read those variables directly. Commit f8a8d0e had to change 138 engine lines for one bug in how answering, holding and asking again interact. The only tests run several full engines with real timeouts.

**Approach:** Add one module, `src/replica/catch-up.ts`. It owns the catch-up state, the answer rules, the GM link, drift and the adoption gate. It is synchronous. It takes events and returns decisions. The engine runs each decision, owns the timers and the async reads, and calls back into the module when a timer fires or a read ends. The adoption data stays in the engine: staged records, saving, and replacing the replica. Behaviour does not change.

## Boundaries & Constraints

**Always:**
- Written against master `7b05722`, refreshed on master `3d8a197` (TASK-46 merged). The baseline is `3d8a197`: 2681 tests, 8803 assertions, 492 e2e tests.
- Phase A moves code and changes no test file. The junit list of `bun test` (test name and assertion count) equals the baseline, and every e2e test passes. Phase B adds `src/replica/catch-up.test.ts`. Phase C retires only the engine tests named in Tasks.
- Calibrate each mutation in Verification twice: at the baseline in `engine.ts` and after phase A in `catch-up.ts`. Both runs must fail the same tests. After phase B, each mutation fails at least one `catch-up.test.ts` test. Record in the notes a mutation that survives at the baseline.
- Order of effects stays as today. Examples: a GM-origin message changes the link before the engine dispatches it. A complete answer of the adopted generation saves it before catch-up ends. Exit effects run in `live`.
- Every external reader asks the module (`live()`, `view()`, `adopting()`). This covers `runCommand`, `handlePresetDiff`, `handleSnapshotCheck`, `receiveProposal`, `clearDeletedLinks`, `refreshTokenMenu`, `followWindowSize`, `canWriteRoomCopy`, `importSuperseded`, the `catchingUp` option of `pending-edits`, projections and deltas, and `flushNow`.
- Add **Catch-up** to `GLOSSARY.md` in the commit that adds the module.
- A red test is a defect report (`~/.claude/shared/testing.md`). Follow the CLAUDE.md test rules (`bun:test`, `#given` / `#when` / `#then`), the oxlint rules and the TypeScript rules.

**Never:**
- No change to room traffic, records, storage, the room copy format, `src/core/`, `src/ui/`, `src/platform/`, `pending-edits.ts` or e2e tests.
- No timer, `Date.now`, `performance.now`, `Math.random`, promise or platform port inside `catch-up.ts`.
- No full engine and no real-time wait in `catch-up.test.ts`.
- The room copy write loop is not moved. TASK-50 owns that.

## I/O & Edge-Case Matrix

Each row is a group of tests in `catch-up.test.ts`. Fakes supply role, vouching, generation, digest, unsent commits, `saveAdoption`, `random`, `newId` and `now`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start | `enter('start')` | `catching-up`, new `r`; the decisions enter, arm the timeout, read the copy and arm the link watch. `roomCopyRead(r)` asks; a GM also reads the party | a read for an old `r` decides nothing |
| GM alone | `partyRead` lists no other GM | leaves `unanswered`, `firstCatchUpDone` | a failed read (`null`), another GM present, or an adoption in progress: stays |
| Complete answer | all `n` parts from one sender for own `r` | leaves `answered`, `gmAnswered` | partial, mixed senders, or an older `r`: no exit |
| Timeout | catch-up timer fires | leaves `unanswered`; `gmAnswered` keeps its value | the timer fires after the exit: nothing |
| Late answer | complete answer for the last `r` while live | `gmAnswered`, shown; no new catch-up, no ignored digest | N/A |
| Page return | live / catching-up | new `r` / same `r`, asks again only when nothing answered; the timeout is not put off | N/A |
| Role change | `enter('role')` | new `r`; the old answer parts and the drift counts drop | N/A |
| Answering | a live GM that vouches hears a request | answers after `min + random * (max - min)`, once | an answer to `r` seen first cancels it; a repeated request answers again; a player or a GM that does not vouch never answers |
| f8a8d0e: hold | GM in catch-up (not drift) hears a request | holds it; on exit answers each held `r` with no answer seen meanwhile, after the usual delay | at most 256 held, the oldest drops |
| Drift answer | GM in a drift catch-up | answers requests, not pings | N/A |
| GM link | GM message / player message / silence | online with ping and silence timers armed again / no change / offline after the timeout, shown only once a projection was sent | N/A |
| f8a8d0e: GM return | live player, link offline → online, not an answer to the last `r` | `gm-return` catch-up; the request waits `random * maxDelay` | a GM client stays live; a request timer for an old `r` sends nothing |
| f8a8d0e: ask again | catching-up, request sent, nothing answered, link → online | asks again with the same `r` | answer seen, or no request sent yet: nothing |
| Ping | ping timer fires / a live, vouching GM hears a ping | ping, armed again at `timeout/2 + random * timeout/4` / `alive` | a GM in catch-up or a player does not answer |
| Drift | two differing `alive` of the own generation from one GM, a counting window apart | drift catch-up | burst in one window, a match between, two GMs, another generation, catching-up, a GM with unsent commits: no count; an ignored digest is skipped until it changes; a connection that left is forgotten |
| Ignore | answered exit | the responder's and the drift starter's last digests are ignored | an exit by timeout ignores nothing |
| Adoption start | higher generation heard or read | `adopt` decision with the previous target; drift forgotten; catch-up with new `r`, or the same `r` when the message answers it (copy: when catching up) | not above the target or the own generation: nothing |
| Adoption wait | catching-up while adopting | the timer arms the backoff (`start`, doubling to `max`, minus `random * ¼`) and reads the copy again with a fresh ask; `live()` stays false; no answers | answers of another generation do not count |
| Adoption end | complete answer of the target / staged copy | `saveAdoption` true: gate clear, drift forgotten, then exit `answered` / the normal timeout armed again | `saveAdoption` false: stays adopting and catching-up |
| Closing | `closing()` while catching-up | leaves `unanswered` | live or adopting: nothing |

</frozen-after-approval>

## Code Map

Line numbers are at `3d8a197`.

- `src/replica/engine.ts` -- to move: variables 389-442 (`sync` to `catchUpTrigger`), 473 and 476 (`adoptTarget`, `incompleteRetryMs`). Functions: `enterCatchUp` 2261, `askAfterRoomCopy` 2308 (only its decision part), `ask`, `requestState` 2790-2814, `armCatchUpTimeout` 2816, `leaveIfAlone` 2846 (only its decision part), `leaveCatchUp` 2873 down to `ownNonce = null` (2901), `receiveStateRequest` to `answerState` 3009-3123, the bookkeeping of `receiveState` 3125, `countAnswerPart` 3168, `hearGm` to `receiveAlive` 3275-3413. Also the gate part of `seeGeneration` 2576 and of `completeAdoption` 2661. Module scope: `AnswerParts`, `CatchUpTrigger`, `CatchUpState`, `DRIFT_ALIVE_COUNT`, `DigestMismatches`, `CatchUpExit`, `RECENT_NONCE_LIMIT`.
- `src/replica/engine.ts` -- stays in the engine: `mergePersisted`, `mergeRoomCopy`, the party read, `stage`, `incoming`, `highestSeenGeneration`, `persistAllOnExit`, `notifyDataReplaced`, `replaceReplica` (without `forgetDigests`), and `handleRoomMessage` 3425, which keeps its order: generation seen, gate, GM heard, dispatch.
- TASK-46 code that the executors take over unchanged. The exit effects of `leaveCatchUp`, from `const changed` (2903) on, become the `caught-up` executor: persist all, `replayPending()` (2172, returns `{ applied, completed }`), `pendingEdits.caughtUp`, the delta, then `commandDone(id)` (548) for each `completed` id after the delta, `sendCommits(applied)`, `followReplica`, `clearDeletedLinks`, and the room copy when `roomCopyOwed || applied.length > 0`. `dropPendingWork` (2617, refuses each queued window id with `data-replaced`) runs inside the `adopt` executor. `flushNow` (about 3612) calls `closing()`; its `caught-up` replays and answers the queued intents as today.
- `src/replica/pending-edits.ts` -- the precedent: injected queries, small results. It is not changed.
- `src/core/bounded-id-set.ts` -- `createBoundedIdSet` for the answered nonces. `src/core/merge.ts` -- `compareGenerations`. `src/core/room-messages.ts` -- `RoomMessage`, `StateMessage`, `GenerationRelation`.
- Tests that stay as evidence: `engine-catch-up.test.ts`, `engine-liveness.test.ts`, `engine-no-gm.test.ts`, `engine-import.test.ts`, `engine-wipe.test.ts` (adoption), and `src/replica/room-rig.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Baseline -- at `3d8a197` (worktree with its own `bun install`): 2681 tests, 8803 assertions, 0 failures. Wall time: `engine-catch-up` 3.55 s (45 tests), `engine-liveness` 5.66 s (25), `engine-no-gm` 4.05 s (19). Files: `/private/tmp/claude-501/-Users-seigiard-Projects-owlbear-muster-roll-prototypes-owlbear-probe/cb274a81-7b80-4b9c-8a25-e8e948de01b1/scratchpad/baseline.xml` and `baseline-list.tsv` beside it (file, classname, name, assertions, sorted; made by `junit-list.py` beside it). Make the after-list with the same script and `diff` the two.
- [x] `src/replica/catch-up.ts` -- create the module per Design Notes from the moved code -- phase A.
- [x] `src/replica/engine.ts` -- add the decision runner and the timer table, route every event, and delete the moved code -- phase A. Commit when the junit list equals the baseline.
- [x] `GLOSSARY.md` -- add **Catch-up** under "Keeping room data", in the phase A commit.
- [x] `src/replica/catch-up.test.ts` -- one test per matrix row and per error case, with deterministic fakes -- phase B.
- [x] `src/replica/engine-liveness.test.ts` -- retire the drift rule tests that a module test now owns: `a burst of differing alive…`, `a digest that differs once and then matches…`, `differences from two GMs…`, `differences do not carry across a catch-up`, `an alive of another generation…`, `drift from one GM answered in full by another…`, `a catch-up that ends by timeout starts no ignore`, `a complete answer that comes late, while live, starts no ignore`. In the notes, map each one to its owner -- phase C.

**Acceptance Criteria:**
- Given phase A, when `bun test` runs, then its junit list equals the baseline.
- Given the branch, when `rg -n "ownNonce|answerTimers|heldRequests|gmSilenceTimer|digestMismatches|adoptTarget|incompleteRetryMs" src/replica/engine.ts` runs, then nothing matches.
- Given `catch-up.test.ts`, when it runs, then no test starts an engine, waits on real time, or imports `room-rig`.

## Design Notes

**Cut line (AC #1).** Adoption is a sub-state of catching-up. `seeGeneration` always ends in catching-up. `leaveCatchUp` refuses while a target is set. So `adoptTarget !== null` implies catching-up. The module owns the gate: the target generation and the incomplete-retry backoff. Six rules read the gate: the timer, the alone check, the exit, `canAnswer`, answer counting, and entry. The engine keeps the data: `incoming`, staging, the save, the replica swap, dropping pending work, and the notice. Rejected cuts:
- The gate stays in the engine. The module would then need an `adopting()` query and a two-step completion.
- The data moves too. The save touches persistence, the replica, windows and pending work.
- An effectful module with injected `schedule` and `send`. Async continuations would need an effect sink, and AC #2 asks for returned decisions.

**Interface** (names may change; capabilities may not be dropped):

```ts
createCatchUp(options: { timing; random; newId; now; role(); vouches() /* persistence !== null */;
  generation(); digest(); commitsUnsent(); saveAdoption(g: Generation, fromCopy: boolean): boolean })
// events, each returns Decision[]
enter('start' | 'page-return' | 'role'); roomCopyRead(r, fresh); partyRead(r, players | null);
generationHeard(message); generationRead(g); adoptionStaged();      // copy path: read, engine stages, then this
heard(message, sender, senderRole, relation);   // every admitted message, before dispatch
stateMerged(message, sender, relation);         // after the engine merged or staged its records
fired(timer); closing(); partyChanged(players) /* void */; replicaReplaced() /* void: import path */
// reads
view(): Omit<SyncState, 'role'>; live(): boolean; adopting(): Generation | null
type Timer = { kind: 'catch-up' | 'ping' | 'gm-silence' } | { kind: 'request' | 'answer'; r: string }
type Decision = arm{timer, delayMs} | disarm{timer} | entered{trigger, fresh} | read-room-copy{r, fresh}
  | read-party{r} | request{r} | answer{r} | alive | ping | caught-up{exit} | show{projectedOnly}
  | gm-back | adopt{generation, previous}
```

- The engine runs decisions in order. `arm` replaces a running timer with the same key. A fired timer calls `fired`. `stop` clears every timer and refuses new ones, and the engine makes no module call after `stop`. `run` returns a promise of the reads it started. The start awaits it as `settledWithin` does today.
- `entered`: merge stored records unless the trigger is `start`. Then send a delta when `fresh`, or when something changed. `caught-up` runs the exit effects. `adopt` resets `incoming`, drops the outbox and the pending work, and shows the notice when there was data. `saveAdoption` is the data part of `completeAdoption`, and it must not call the module.
- `canWriteRoomCopy` becomes `!stopped && role === 'GM' && persistence !== null && catchUp.live()`. The `adoptTarget` term is redundant, and the Adoption wait row proves why. For TASK-50, the room copy module needs one query for this check and no adoption state. Its higher-copy path routes through `generationRead` and `adoptionStaged`.

## Verification

**Commands:**
- `bun test --reporter=junit --reporter-outfile=<scratch>/after.xml` -- phase A: equal to the baseline; after phase C: only the named retirements and the new tests differ.
- Mutations, one at a time, reverted: M1 a GM in catch-up drops requests instead of holding them; M2 held requests are answered even when an answer was seen; M3 no ask again when a GM comes online; M4 a late answer to the last `r` starts a `gm-return` catch-up; M5 a GM client catches up on a GM return; M6 the timeout ends catch-up while adopting; M7 answers of another generation count while adopting; M8 a burst counts twice; M9 an answered exit does not ignore the drift starter; M10 a GM in a drift catch-up does not answer; M11 a GM in catch-up answers a ping; M12 a page return while catching up takes a new `r`.
- Wall time of the three engine test files, before and after.
- Full check: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`.

**Docs (build session, after implementation):** AD-7 in the architecture spine names `src/replica/catch-up` as the owner of every catch-up and GM link decision, as AD-4 names `pending-edits`. Commit it on its own.

## Implementation Notes

- Run directory: `~/.claude/artifacts/tdd-20261112-160659/task-48-catch-up-state-machine/` (`ticket.md`, controls, review rounds).
- Phase A: the junit list of the whole `bun test` equals the baseline. Mutations M1-M12 fail the same engine tests as at the baseline, except M5. Under M5, `engine-sync :: remote record :: that loses to the local one sends no delta and writes nothing` races on both sides: 17/20 baseline runs failed and 18/20 module runs failed, with the same order of effects. Recorded in `deferred-work.md`.
- Phase B: `catch-up.test.ts` has 48 tests. Each one fails under a faithful mutation of the rule it protects. Each of M1-M12 fails at least one of them. M2, M7, M10 and M11 survived the engine suite at the baseline, and the module tests now kill them.
- Phase C, retired tests and their owners in `catch-up.test.ts`:
  - a burst of differing alive within one window starts no catch-up -> does not start drift from a burst in one window
  - a digest that differs once and then matches starts no catch-up -> does not start drift from a match between differences
  - differences from two GMs do not add up -> does not start drift from differences from two GMs
  - differences do not carry across a catch-up -> a role change starts over and drops old answer parts
  - an alive of another generation is not compared -> does not start drift from another generation
  - drift from one GM answered in full by another ignores the drifting GM too -> an answered exit ignores the responder and drift starter, but a timeout ignores neither
  - a catch-up that ends by timeout starts no ignore -> an answered exit ignores the responder and drift starter, but a timeout ignores neither
  - a complete answer that comes late, while live, starts no ignore -> a late complete answer marks a live client answered without ignoring later drift
- Wall time, before -> after: `engine-catch-up` 3.55 s -> 3.48 s (45 tests); `engine-liveness` 5.66 s -> 4.02 s (25 -> 17); `engine-no-gm` 4.05 s -> 4.21 s (19); `catch-up.test.ts` 0.02 s (48).
- Code review: round 1 (`mixed-terra`, 9/9 sources) found one major. The retired late-answer test had no module owner that held its assertion. Round 1 also found 11 minors. Two of them were behavior gaps against the baseline. First, a complete answer of the adoption target finished the adoption only when its relation was `higher`. Second, `saveAdoption` called back into the module. All were fixed through the tdd chain. Round 2 (`final`, 2/2 sources) found nothing.
- Full check at the final state: oxfmt, lint, typecheck, `bun test` (2721 pass), `bun run test:browser` (492 pass), `bun run build`.

## Spec Change Log

## Review Triage Log

- Step 04 ran only the `code-review-carryover` layer, because the override turns the BMAD reviewer layers off. It returned no findings. code-review has no open decision, no unresolved critical or major, no deferred finding, and no corrected criterion (`review-01.md`, `review-02.md`).
