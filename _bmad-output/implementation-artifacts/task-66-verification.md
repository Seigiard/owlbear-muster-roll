# TASK-66 verification

## Scope and revisions

The change retains a delayed state request through ordinary catch-up and cues an
open window after replica replacement. It also pins the original probe's 82 gaps.
Production changed only in `src/replica/catch-up.ts` and
`src/replica/window-publisher.ts`. Room-copy and engine startup are unchanged.

- Base: `476e8f0284f103d092c1b7363a56393e1433a617`.
- Verified integration: `ab010576183cdce13d3dae4db627da284786075d`.
- Final source/test tip: `676dff1362ec238c997688b71043fbd7f5131945`.
  The integration adds only task metadata and the deferred cold-start note.
- Original inventory and generator: [mutation probe](mutation-probe-2026-11-15.md).
- Approved intent: [specification](spec-task-66-replica-mutation-gaps.md).

## Integrated checks

These commands ran on the clean verified integration. Every command exited 0.

| Command | Observed result |
|---|---|
| `bun run mutants catch-up room-copy window-publisher` | 53 killed; 0 survived; 0 stale |
| `bunx oxfmt --ignore-path .gitignore --check .` | Passed for matched files |
| `bun run lint` | Passed; warnings are not counted as errors |
| `bun run typecheck` | Passed |
| `bun test` | 3089 pass; 1 skip; 0 fail; 112 files |
| `bun run test:browser` | 521 pass |
| `bun run build` | Passed |

The source was restored after mutation controls. The checkout was clean before
and after the checks. The skipped unit test is not used by the matrix audit.
Markdown and Backlog files are excluded by the formatter configuration.

## Matrix-to-executed-test audit

Each owner below appears as `(pass)` in the integrated `bun test` output. None
was skipped, filtered out or disabled. Paths are relative to the repository root.

| Approved matrix row | Executed test owner | Verified observable result |
|---|---|---|
| Answer crosses ordinary catch-up | `src/replica/catch-up.test.ts`: `a GM re-arms an answer whose timer fires during ordinary catch-up`; `an observed answer suppresses an armed answer whose timer fired during ordinary catch-up` | Exit re-arms the held nonce with the answer delay; an observed answer prevents it |
| Incomplete generation | `src/replica/catch-up.test.ts`: `an armed answer does not fire during incomplete adoption`; `an answer timer held during adoption is not armed after adoption completes` | No answer decision escapes the AD-9 adoption boundary |
| Routine write blocks import | `src/replica/room-copy.test.ts`: `a healthy observer receives stopped-write import completion before its deadline`; `a healthy observer sees an import wait for a routine write in a later macrotask`; `a healthy observer sees an import wait through a non-overlapping routine rerun` | Import completes after stop; held writes and reruns do not overlap |
| Import verification fails | `src/replica/room-copy.test.ts`: `an import read-back failure completes and signals the failed status`; both `a failed import removes a lower copy and refreshes status when cleanup read` cases; `a higher import read-back is adopted and left in the room` | Read failure settles without throwing and reports failed status; removal preserves a newer copy and updates sizes/signals |
| Exact metadata limit | `src/replica/room-copy.test.ts`: `routine write saves metadata at the exact 15500-byte limit`; `import write saves metadata at the exact 15500-byte limit`; `metadata above 15500 bytes keeps the previous copy and fails` | Equality succeeds; excess fails without replacing the previous copy |
| Restart before any projection | `src/replica/window-publisher.test.ts`: `sends one restart cue with no earlier projection and then stays silent`; `src/replica/engine-client.test.ts`: `re-requests a projection when a new engine replaces its replica before projecting` | One record-free cue changes engine id; the existing client requests and receives replacement records |
| Projection delivery and capacity | `src/replica/window-publisher.test.ts`: nonce retry, pending-dependent link withdrawal, oversized pending and both `counter-sized` tests | Nonce can retry after send; visibility uses pending state; unsplit content sends nothing and logs; fitting control messages stay below 15000 bytes |

The cumulative implementation diff was read against the fixed base. The audit
checks actual test execution, not just the presence of test declarations.

## Original gap calibration

| Ticket | Original gaps or defect | Accepted calibration |
|---|---|---|
| TASK-66.1 | Answer timer fires during ordinary catch-up | The regression fails before the fix and passes after it; separate faithful controls pin suppression and AD-9 |
| TASK-66.2 | 39 room-copy gaps, clusters A–I | All 39 faithful patches reach assertion-red in the bounded whole-module replay; restored module runs pass |
| TASK-66.3 | 27 catch-up gaps, clusters A–H | All 27 faithful patches reach their behavior assertions; restored module run passes |
| TASK-66.4 | 16 publisher gaps, clusters A–F | All behavior changes are detected, except original D is reclassified under the approved cue contract |

Room-copy starvation is observed by a healthy parent test process. A separate
Bun process runs the real room-copy module and must emit the expected completion
event within 500 ms. A hung child therefore fails a parent assertion instead of
blocking the test runner. The parent terminates and reaps its child.

Publisher B38 is **behavioral exception-red**, not downstream assertion-red:
the faithful mutation makes the real `project()` call throw at `parts.map` when
splitting returns null. That violates its boolean-return/no-throw boundary.
The other B controls separately cover refusal and logging.

The first F fixture masked five size-estimate mutations. It was replaced by
separate projection and delta scenarios with nearby enabled bus-delivered
controls. Each faithful F35/F36/F66/F67/F68 mutation then failed at the protected
behavior assertion. The final mechanical unit pass also detects all five.

## Mechanical probe

The original TypeScript AST generator ran with isolated TypeScript 5. Pass 1
runs each module's unit test with a 30-second limit. Pass 2 runs every unit
survivor against `src/replica/` with a 180-second limit. Each mutation runs in
one disposable checkout and restores the original file before the next row.
The three pass-2 checkouts use the verified integration revision.

The full replica baseline passed: 948 tests, 0 failures. Reused earlier unit
results have byte-identical module, test, helper, dependency and setup inputs.

| Module | Inventory | Unit killed | Unit survived | Unit timeout |
|---|---:|---:|---:|---:|
| Catch-up | 336 | 301 | 35 | 0 |
| Room-copy | 334 | 286 | 45 | 3 |
| Window publisher | 118 | 108 | 10 | 0 |
| Total | 788 | 695 | 90 | 3 |

| Module | Replica-pass inputs | Additional killed | Final survivors | Replica timeout |
|---|---:|---:|---:|---:|
| Catch-up | 35 | 12 | 23 | 0 |
| Room-copy | 45 | 13 | 32 | 0 |
| Window publisher | 10 | 0 | 10 | 0 |
| Total | 90 | 25 | 65 | 0 |

Across both passes, 720 mutations fail tests, 65 survive and 3 time out.
Every survivor is classified below: 50 equivalent and 15 unreachable under the
current engine call contract. This is not a claim that every possible mutation
is covered. All three probe checkouts ended clean, with supervisor exit 0.

Room-copy #83/#85/#86 cause an unbounded routine rerun. They remain timeout
observations, not assertion-red evidence. They were also timeout cases in the
original probe. Unlike that probe's combined killed count, the table separates
timeouts from test failures.

### Catch-up survivors

The replica pass detects 12 of the 35 unit survivors. The remaining 23 match the
original 16 equivalent and 7 unreachable mutations. No new gap remains.
Mapping uses the operation and function/source anchor, not a numeric offset.

| Final IDs | Original IDs | Anchor | Verdict and reason |
|---|---|---|---|
| 3 | 3 | `disarm`: force answer branch | Equivalent: callers disarm only catch-up or answer timers; deleting `undefined` changes nothing |
| 35, 37 | 29, 31 | `request`: weaken current-nonce guard | Equivalent: every caller already has an active catch-up with that nonce |
| 54, 55 | 48, 49 | `leave`: weaken phase/adoption guard | Equivalent: all internal callers already establish ordinary catch-up |
| 61 | 55 | `leave`: change null/undefined digest choice | Equivalent: `lastAliveDigests` has neither a null nor an undefined key |
| 64, 66, 67 | 58, 60, 61 | `leave`: weaken ignored-digest guard | Equivalent: ignored keys come from last-alive keys and are removed together; an absent digest produces no observable ignore |
| 72 | 66 | `leave`: retain `driftStarter` | Equivalent: entry or the next drift decision overwrites it before another read |
| 84, 85 | 78, 79 | `finishAdoption`: weaken adoption guard | Unreachable: the engine calls `adoptionStaged` only while adopting; the state-answer caller checks adoption too |
| 118, 120 | 112, 114 | `enter`: retain drift starter on non-drift entry | Unreachable: role and generation transitions forget digests before this could affect a drift exit |
| 169 | 163 | `enterFromGeneration`: omit `forgetDigests()` | Equivalent: adoption reads no drift digest, and `finishAdoption` clears them before live operation |
| 193 | 187 | `partyRead`: weaken role/adoption guard | Equivalent: `leave` still blocks adoption; a player emits no party read, and a role change changes the nonce |
| 252, 253, 254 | 251, 252, 253 | `stateMerged`: weaken higher-generation adoption-target guard | Unreachable: the engine supplies relation `higher` here only during adoption of this exact target |
| 286 | 285 | `stateMerged`: always show completed answer | Equivalent: the extra publisher call emits nothing when visible state is unchanged |
| 302 | 301 | `fired`: pass true for offline `answersOwn` | Equivalent: `setGmLink` consults that argument only for the online transition |
| 321, 323 | 312, 314 | `partyChanged`: retain departed connections | Equivalent under the existing connection-id contract: departed connection ids are not reused or read again |

### Room-copy survivors

The replica pass detects 13 of the 45 unit survivors. The remaining 32 match the
original 27 equivalent and 5 unreachable cases. Room-copy production is unchanged,
so final and original IDs agree; function and operation anchors also agree.

| Final/original IDs | Anchor | Verdict and reason |
|---|---|---|
| 6 | `cancelScheduledWrite`: retain scheduled handle | Equivalent: only cancellation reads the handle; recancelling a cancelled timer is harmless, and scheduling overwrites it |
| 15, 322 | `activeWrite`/`stop`: invert stopped/active check | Equivalent: after stop, only a waiting import reads active write state and then exits at its stopped guard |
| 21, 23 | `finishWrite`: weaken stopped-operation guard | Unreachable: the difference needs a different simultaneous operation; engine import exclusion and the serialized routine/rerun chain prevent it |
| 46, 48 | `mergeReadRoomCopy`: adopt an equal/lower generation too | Equivalent at the engine boundary: `adoptFromCopy` does not change state for that generation; a standalone callback spy can still observe an extra call |
| 63 | `scheduleRoomCopy`: retain fired scheduled handle | Equivalent: `writeRoomCopy` immediately cancels/clears it |
| 68 | `writeRoomCopy`: omit stopped guard | Unreachable: the engine's writable callback includes `!stopped`, set before `roomCopy.stop()` |
| 164 | `writeImportCopy`: omit completion assignment | Unreachable: only a second import would wait on that completion; the engine refuses it while importing |
| 165 | `writeImportCopy`: initialize superseded true | Equivalent: `await run` overwrites the value before its only read |
| 124, 133, 194, 213, 216, 233, 248, 251 | Routine/import/cleanup phase assignments | Equivalent: only `isActiveWrite` reads these phases, and reading, writing and verifying are all active |
| 281 | `followMetadata`: omit stopped guard | Unreachable: stop unsubscribes metadata synchronously; adoption also checks stopped |
| 314 | `replaced`: omit changed callback | Equivalent: the only engine caller immediately invokes `publisher.publish()` |
| 320 | `stop`: omit scheduled cancellation | Equivalent: any fired timer reaches `writeRoomCopy` and returns at the stopped guard |
| 37, 65, 104, 126, 175, 204, 215, 250, 303, 330 | Remove the console-error statement at the named original anchor | Equivalent for the task's caller-visible behavior: only diagnostic logging changes; status, notices and error handling remain |

The diagnostic-only cases retain the original probe's definition of equivalence.
They are not assertions that log output is byte-identical.

### Publisher survivors

All ten unit survivors also survive the replica pass. Each is accounted for
below. IDs refer to the final inventory; anchors distinguish shifted IDs.

| Final ID | Original ID | Anchor | Verdict and reason |
|---|---|---|---|
| 45 | 45 | `project`: drop `restartPending = false` | Equivalent: `project()` calls `publish()` first, which clears the pending cue |
| 46 | 46 | `project`: `false` to `true` at `restartPending` | Equivalent: the flag is read only before projection; the next `restart()` overwrites it |
| 51 | 51 | `project`: drop send-rejection log | Unreachable: the engine uses `sendQueue.enqueue`, which resolves even after delivery failure |
| 54 | 54 | `restart`: drop `sequence = 0` | Equivalent: the new engine id separates streams; clients compare deltas to the new projection's sequence |
| 57 | 57 | `restart`: drop `lastComparison = visibleState()` | Equivalent under the approved new contract: the unconditional restart cue updates comparison before sending; later unchanged publishes stay silent |
| 60 | 59 | `visibleState`: force player-overlay branch | Equivalent: GM visibility returns every record; the permitted pending overlay does not replace the preset |
| 73 | 72 | `sendDelta`: return true when splitting fails | Equivalent: no caller reads the return value |
| 77 | 76 | `sendDelta`: drop asynchronous rejection log | Unreachable: the engine send queue does not reject |
| 78 | 77 | `sendDelta`: drop synchronous throw log | Unreachable: the engine send queue is async and cannot throw into this catch |
| 79 | 78 | `sendDelta`: return false after sending | Equivalent: no caller reads the return value |

The old D gap is not claimed as killed. The replacement regression instead pins
the owner's chosen unconditional cue. This is an explicit reclassification.

## Evidence and remaining closure

Durable local evidence is under
`~/.claude/artifacts/implement-spec-66-20261115-093432/`: ticket calibration
patches/logs, `integration-checks/`, and `probe-*-pass*.jsonl`.
The supervisor verdicts use labels `spec66-integration-checks` and
`spec66-{room-copy,catch-up,publisher}-probe-pass2`.

Closing review is pending. This note does not yet claim parent-task completion.
The live Owlbear background-restart lifecycle was not verified. The constructed
cold-start scenario without replica replacement remains in
[deferred work](deferred-work.md); engine startup was not changed.
