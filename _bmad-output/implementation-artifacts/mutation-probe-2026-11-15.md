# Mutation probe of the replica modules, 2026-11-15

## Why this probe ran

`tools/mutants/` holds 36 hand-written mutation controls for `src/replica/catch-up.ts`, `src/replica/room-copy.ts` and `src/replica/window-publisher.ts`. The author of the tests also chose those 36 rules. So the controls cannot show a rule that the author did not think of. This probe generated mutants mechanically to find those rules.

## Method

- Commit: `d761c53`. The three modules did not change up to `d3adb61`, so the line numbers below are also valid there.
- Generator: a TypeScript AST walk (script in the last section). Operators:
  - swap `===`/`!==`, `<`/`<=`, `>`/`>=`, `&&`/`||`, numeric `+`/`-`;
  - `true`/`false`;
  - drop a `!`;
  - replace an `if` condition with `true` and with `false`;
  - delete a call, an assignment or an increment statement.
- Pass 1: each mutant against the unit test of its module, `bun test --bail`, 30-second limit.
- Pass 2: each pass-1 survivor against the whole `src/replica/` suite, 180-second limit.
- Triage: one agent for each module read every pass-2 survivor and gave a verdict. For each gap, the agent wrote a temporary test. The test passed on the original code and failed under the mutant. The temporary tests are not in the repository.

| Module | Mutants | Pass-1 survivors | Pass-2 survivors | Gap | Equivalent | Unreachable |
|---|---|---|---|---|---|---|
| `catch-up.ts` | 327 | 76 | 50 | 27 | 16 | 7 |
| `room-copy.ts` | 334 | 95 | 71 | 39 | 27 | 5 |
| `window-publisher.ts` | 117 | 25 | 25 | 16 | 6 | 3 |
| Total | 778 | 196 | 146 | 82 | 49 | 15 |

Three room-copy mutants timed out in pass 1 and count as killed.

Verdicts:

- **Gap**: the mutant changes behavior that a caller or a user can see, and no test fails.
- **Equivalent**: the mutant changes no behavior that anything can see. Each one names the earlier check or the overwrite that makes it so.
- **Unreachable**: the branch cannot run, given how `engine.ts` drives the module.

The ids below are the generator's numbers. The appendix maps each id to its line and mutation.

## Confirmed defect: an answer armed before a catch-up is lost

A live GM hears a `state-request` and arms an answer timer. The delay is between `stateAnswerDelayMinMs` and `stateAnswerDelayMaxMs`. Then the GM enters an ordinary catch-up before the timer fires, for example on `page-return`. When the timer fires, `canAnswer()` is false, so `fired({ kind: 'answer' })` returns `[]`. The request is not in `heldRequests`, so the GM does not answer it when the catch-up ends either.

The comment on `heldRequests` (`catch-up.ts:171`) says that held requests are answered at the end of the catch-up, "as nobody asks again". A request that was armed before the catch-up does not get that guarantee. So a player whose request arrived in that window can stay without state until a later catch-up.

Reproduction against `createCatchUp`, with the harness timing of `catch-up.test.ts`:

1. Role GM; `enter('start')`; `stateMerged(state(r), 'gm-a', 'equal')`. The client is now live.
2. `stateRequested('x')` returns `arm answer x, 20 ms`.
3. `enter('page-return')` returns `entered page-return`, `arm catch-up`, `read-room-copy`.
4. `fired({ kind: 'answer', r: 'x' })` returns `[]`.
5. `fired({ kind: 'catch-up' })` returns only `disarm catch-up`, `caught-up unanswered`. There is no `arm answer x`.

Catch-up gap #306 is related: a GM that becomes unable to answer, because its new generation is incomplete (AD-9), must not answer when an armed timer fires. A fix must keep that rule.

## Gaps in catch-up.ts

**A. An answer seen to the own `r` suppresses a request sent again.** #35 (`markAnswerSeen`), #107 (`enter`, adopting branch), #257 (`stateMerged`, higher branch).
- Only an answer to this client's own `r` sets `answerSeen`. After that, no request is sent again.
- #35: player in `start`, request sent. A `state` for another `r` arrives. Then `enter('page-return')`, `roomCopyRead(r, false)`. Expected: `[request r]`.
- #107: the player adopts `NEXT` with a new `r` and requested it. Then page-return, `roomCopyRead(r, false)`. Expected: `[request r]`.
- #257: as #107, but first part `n=2` of the `NEXT` answer arrives with relation `higher`. Expected: `[]`.
- Near M3, but M3 does not pin when `answerSeen` is set.

**B. A `gm-return` request waits for a random delay.** #42, #45 (`ask`).
- On `gm-return`, the request goes through a timer with a random delay. It is not sent at once.
- Scenario: live player, `heard('GM', {t:'commit'})`, then `roomCopyRead('r-2', true)`. Expected: exactly `[arm {request, r-2}, delayMs: random * stateAnswerDelayMaxMs]`.

**C. `answersOwn` is true only for the own `state`.** #200 (`heard`).
- A `state` for another `r` must start `gm-return` when the GM link was offline.
- Scenario: live player, link offline, `heard('GM', {t:'state', r:'other'})`. Expected: `entered gm-return`.
- M4 pins the opposite direction: the own `r` does not start a catch-up.

**D. GM answers and held requests.** #28, #72, #209, #306.
- #28: the same `r` again while its answer is armed does not arm it again. Scenario: live GM, `stateRequested('x')` two times. The second call returns `[]`.
- #72: held requests are served once, at the exit of the catch-up that held them. Scenario: GM without vouches, `start`, `stateRequested('x')`, exit by timeout. Then vouches true, `enter('role')`, timeout again. Expected: only `[disarm catch-up, caught-up]`, with no `arm answer x`.
- #209: a request heard again moves to the end of the queue, so the 256 limit does not drop it. Scenario: GM in catch-up holds `x`, then `a1`..`a255`, then `x` again, then `a256`. At exit, `arm answer x` is present.
- #306: the answer timer sends no `state` when the GM can no longer answer. Scenario: live GM, `stateRequested('x')`, `generationHeard(NEXT, false)`, `fired({answer, x})`. Expected: `[]` (AD-9).
- Near M1 and M2, but they do not pin these rules.

**E. A stale `r` does not act on a new catch-up.** #188, #189 (`partyRead`), #302 (`fired` request).
- #188, #189: GM in `start` exits by timeout, then `enter('page-return')` gives `r-2`. `partyRead('r-1', [])` must return `[]`. The mutant ends `r-2` as unanswered.
- #302: player in `gm-return` with a request timer for `r-2`. Then `generationHeard(NEXT, false)`, then `fired({request, r-2})`. Expected: `[]`. In the live phase the mutant also throws a TypeError.

**F. Generation adoption.** #162, #169, #197, #321.
- #162: with `keepNonce`, the answer parts of the old generation are dropped. Scenario: part `1/2` of `INITIAL` from `gm-a`, then `generationHeard(NEXT, true)`, then part `2/2` of `NEXT` from `gm-a`. `saveAdoption` is not called. Near M7.
- #169: with `keepNonce`, the `adopt` decision carries `keepNonce: true`. Without it, `engine.ts` does not call `publish()` after it resets the pending view. Scenario: `start`, then `generationHeard(NEXT, true)`. Expected: `[adopt … keepNonce: true]`.
- #197: `generationRead` during a catch-up keeps `r`. Scenario: `start`, then `generationRead(NEXT)`. Expected: only `[adopt keepNonce: true]`, with no new `entered`.
- #321, high impact: `answersOwn` on a live client returns `false`. The mutant throws a TypeError, which stops `handleRoomMessage` at `engine.ts:2371`. Then a live client does not start adoption on a `state` of a higher generation. Scenario: `answersOwn('x')` on a live client returns `false`; in a catch-up, `answersOwn('other')` returns `false`.

**G. Digest bookkeeping for drift.** #230, #239, #240, #311, #313, #315, #325, #326, #327.
- #230: an ignored digest stops being ignored when the same GM sent a different digest. Scenario: `gm-a` ignored with digest 11, then alive 12, then, after more than `gmLinkTimeoutMs / 2`, alive 11. Expected: drift.
- #239: exactly `gmLinkTimeoutMs / 2` starts a new burst window. Scenario: alive 11 at t=0 and at t=40 (timeout 80). Expected: drift.
- #240: the burst window is a time difference. Scenario: alive 11 at t=1000 and at t=1010. Expected: `[]`. Near M8, whose test starts the clock at 0 and so cannot see this.
- #311, #313: `partyChanged` keeps the entries of GMs that are still present. Scenario: `gm-a` ignored with 11, `partyChanged([gm-a, gm-b])`, then alive 11 two times. Expected: `[]`.
- #315, #326: `replicaReplaced` forgets ignored digests. The engine path is an import at `engine.ts:1278` on a live client, with no `enter`. Scenario: `gm-a` ignored with 11, `replicaReplaced()`, alive 11 two times. Expected: drift.
- #325: `replicaReplaced` resets mismatch counts. Scenario: one mismatch, `replicaReplaced()`, one more mismatch. Expected: `[]`.
- #327: `forgetDigests` clears `driftStarter`. Scenario: drift catch-up from `gm-a`, `generationRead(NEXT)` with `keepNonce`, `adoptionStaged()`. Then `gm-a` sends alive 11 and `gm-b` answers in full. Later, two alive 11 from `gm-a` must give drift. Partly near M9.

**H. Low value.** #181: `roomCopyRead` on a player emits an extra `read-party`. In the engine this is one extra `getPlayers()` call, and `partyRead` returns `[]` for a non-GM. An exact decision-list assertion, as in B, kills it.

## Gaps in room-copy.ts

**A. A stop during a write that is in progress.** #17, #22, #24, #25, #26 (`finishWrite`), #162 (`writeImportCopy`).
- #22, #24, #25, #26: `stop()` leaves a stale `active` in `lifecycle`. An import that waits for a routine write at that time loops forever on microtasks in `waitForWrite`. The page hangs.
- #17, #162: after a stop, the module becomes `idle` again. Then `read()` merges records and calls `changed`, although the module stopped. For #162 the engine blocks the write itself, because `importSuperseded` includes `stopped`. Only the restart of the module remains.
- Scenario T3: `holdWrite`, `pageHidden`, wait for `writes === 1`, `writeImport(HIGHER)`, `stop()`, `releaseWrite`. Expected: `await imported` completes and `writes === 1`.
- Scenario T2/T22: stop during a held write, or `writeImport(..., () => true)` after `stop()`. Then put a copy of the own generation and call `read()`. Expected: `received` is empty.

**B. `waitForWrite` waits for the wrong thing.** #81, #91.
- #81: a routine write has no `completion`. The import loops on microtasks and waits for a promise that already resolved. If the write ends in a macrotask (in real OBR it is a `postMessage`), the page hangs.
- #91: the import waits for only one write. It overlaps the rerun that starts right after that write.
- Scenario T4: hold a write and release it from `setTimeout`. Expected: `writeImport` completes.
- Scenario T5: held write A, a second `pageHidden` (rerun), then `writeImport`. Hold write B through `afterWrite`. Expected: while B is held, `writes === 2` and `peakWrites === 1`.
- Partly near R3. R3 removes the wait completely; here the wait exists but is wrong.

**C. The owed-write bookkeeping (`deferred.owed`).** #4, #154, #155, #190, #191, #315.
- #4: a new module already owes a write, so the first `caughtUp(false)` writes with no cause. Scenario T1: new module, `caughtUp(false)`. Expected: `delays []`.
- #154, #155: after a verified routine write, the debt stays, and each catch-up writes again. Scenario T11: `pageHidden` until saved, then `caughtUp(false)`. Expected: `delays []`.
- #190, #191: a failed import leaves no debt. Scenario T13: import with `dropWrite`, then `caughtUp(false)`. Expected: `delays [12]`.
- #315 (weak): `demoted()` does not cancel the pause. The timer fires and sets the debt again. Scenario T20: `edited`, `demoted`, timer fires with the gate closed, then `caughtUp(false)`. Expected: `delays [12]`.
- Near R5, R11, R12 and R13, but none of them covers these cases.

**D. The not-saved notice.** #127, #184.
- #127: a write rejected after the gate closed still raises not-saved, for example on a demoted GM. Scenario T10: held write with `rejectWrite`, `writable(false)`, release. Expected: `none` and empty `notices`.
- #184: a verified import does not clear the notice of an earlier failure. Scenario T12: a failed write, then a verified import. Expected: `saved` and empty `notices`.
- Near R16, the opposite case.

**E. Sizes and the `exists` flag (`noteRoomCopy`).** #55, #246, #247, #275, #313.
- #55: reading a copy of the own generation does not give `saved` and does not update the sizes. Scenario T18: `read()` of an `INITIAL` copy. Expected: `saved` and `usedBytes > 0`.
- #275: a failure that has metadata (over the limit, unreadable copy, read-back mismatch) does not update `usedBytes` and `freeBytes`. Scenario T17: the setup of the over-limit test. Expected: `usedBytes > 0`.
- #313: `replaced(true)` does not set `exists`. Scenario T19: `replaced(true)`. Expected: `saved`.
- #246, #247: a failed import over a copy of the own or a higher generation does not update the sizes. Under #247, `exists` becomes `true`, which shows after `demoted()`. Scenario T8c: `dropWrite` import over a `HIGHER` copy. Expected: `usedBytes > 0`, and `none` after `demoted()`.

**F. `removeLowerCopy` and the import read-back.** #220, #235, #236, #238, #252, #253, #254, #255, #256, #257, #258, #259.
- Root cause: no unit test runs lines 511–528, which remove a lower copy. No test covers read failures in the import path either.
- #220, #235, #236, #253, #254, #255: a read failure calls `readSnapshot(null)`, which throws a TypeError. So `writeImport` rejects, and in the engine `replaceGeneration` sends no `reset`.
- #238, #257: windows get no not-saved notice, because `changed()` is not called.
- #252, #255, #256, #258: after the copy is removed, the sizes are stale.
- #259: `exists` stays `true`.
- Scenario T6: import with `rejectReadAt=2`. Expected: completes without an exception, state `failed`.
- Scenario T7: `dropWrite` and `rejectReadAt=3`. Expected: `failed`, `changed` up by 1.
- Scenario T8: an `INITIAL` copy in the room, `followed` records the sizes, `afterWrite` replaces the read-back with `INITIAL`. Expected: the copy is removed, `usedBytes 0`, `changed` up by 1, `none` after `demoted()`.
- Scenario T8b: as T8, plus `rejectReadAt=4`. Expected: no exception, `changed` up by 1.
- R8 and R9 cover nearby conditions, not these.

**G. Write scheduling.** #70, #79, #178.
- #70: a write does not cancel the pause timer, so one more write follows. Scenario T15: `edited`, `pageHidden`, `runScheduled(0)`. Expected: `writes 1`.
- #79 (weak): with the gate closed, metadata is still read. If the gate opens during the read, the write runs before the catch-up. Scenario T16: `writable: false`, `pageHidden`. Expected: `reads 0`.
- #178: a superseded import still starts its deferred rerun. Scenario T14: a trigger during the import, then `superseded` becomes `true`. Expected: `writes 1`.
- Near R10, the opposite case.

**H. The size limit boundary.** #121, #212.
- Metadata of exactly 15500 bytes must be saved. The `>=` mutant rejects it.
- Scenarios T9, T9b: fill metadata through `roomMetadataBytes` to exactly 15500. Expected: `saved`, for a routine write and for an import.

**I. The publisher signal on a read failure.** #31 (weak).
- `read()` with a rejected read does not call `changed()`. In the engine, the publish at the end of the catch-up shows the result later, so the only effect is a delay.
- Scenario T21: `rejectRead`, `read()`. Expected: `changed === 1`.

## Gaps in window-publisher.ts

None of these gaps can show a sheet of a GM-only template to a player.

**A. A player's `known` map ignores the pending overlay.** #60, #61, #62, #63 (`visibleState`).
- A player's records are judged against the replica only, not against the replica with the pending view over it. So visibility that depends on the player's own pending records is wrong.
- Scenario P1: role PLAYER. Template `pc` has a repeat section with `tokens: true`. The replica holds `sheet:brok`, `rep:brok:item:sword` and `link:t1 {s:'brok', i:'sword'}`. The pending view holds a tombstone for `rep:brok:item:sword` (d null, c 2), the player's pending delete of that block. Expected: the projected window does not hold `link:t1`. Under the mutants the link shows.
- Second effect: when a GM is demoted during a catch-up with queued intents, a pending `sheet-create` and its rows are hidden from the window, which is now a player's.
- The overlay only adds or removes `row:` and `rep:` records, or the intents of a demoted GM. It never moves a sheet into a GM-only template, so this is not a hidden-sheet leak.

**B. A projection that cannot fit.** #38, #40, #41 (`project`).
- When `splitParts` returns null, the projection must send nothing, log once, return false and keep the nonce free.
- #38: `null.map` throws after `projected`, `held` and the nonce are set, so every repeat of that window gets `false`.
- #41 returns `true`, so the engine sends one more `deliverOpen`.
- #40 drops the log.
- Scenario P3: GM with 100 party entries and one record of 7000 × 'ы'. `project('n')` returns `false`, sends nothing and calls `console.error` once. Then make the party smaller; `project('n')` returns `true` and sends one projection.
- M6 covers only the "already answering" branch.

**C. The nonce is released after the projection is sent.** #49, #50 (`project`).
- After the sends of all parts resolve, the nonce must leave `answeringNonces`, so a request with the same nonce is answered again.
- `sendQueue.enqueue` resolves even when it gives up on a message, and it never rejects. So a lost projection resolves, and the window repeats the same nonce while it is in the `requesting` phase. Under the mutant, that window never gets a projection.
- Scenario P4: `project('again')`, settle, `project('again')` returns `true`, and a second projection is sent.
- This is the complement of M6, which pins the refusal while the projection is queued.

**D. The pre-projection comparison is reset on restart.** #57 (`restart`).
- After a restart with no earlier projection, the publisher stays silent even when records changed before the restart. The engine does this near line 1395: it replaces the replica and calls `restart()` with no `publish()` between them. The mutant sends one cue delta with no records from the new engine id.
- Scenario P2: GM source; change the replica; `restart()`; `publish()`. Expected: no messages.
- Open question for the owner, before this is pinned: the current silence means that a replica replacement does not cue a window that is still live on an older engine. The mutant's behavior, which cues that window, can be the intended one.
- Decision, 2026-11-15: the owner chose the cue. A restart always cues the next `publish()`, so a window on an older engine's stream asks again. The TASK-49 spec already required a cue for "a window open across a background restart"; this case slipped past it. The owner could not reproduce a background restart with an open popover in a live room, and the cue is cheap. TASK-66.4 owns the change.

**E. A pending record that is too large.** #114 (`splitParts`).
- A pending-view record that cannot fit must fail the whole delta or projection with an error, as a replica record does. The mutant drops the pending part and sends the rest.
- Scenario P5: GM with 100 party entries. Change the replica (small record) and the pending view (record of 7000 × 'ы'). `publish()` calls `console.error` once and sends no delta.
- It mirrors the test "sends a later record after one delta cannot fit".

**F. The size estimate for the largest counters.** #35, #36 (`project`, `largestCount`); #65, #66, #67 (`sendDelta`, `seq`). Low severity.
- The envelope is measured at the largest `i`, `n` and `seq`, so each part stays under `MESSAGE_BYTE_LIMIT`. The mutants estimate too few digits, and a part can reach 15000 bytes or more.
- Scenarios S1, S2: GM; 5 replica and 5 pending records, each 1 byte over the original capacity. The original refuses the split. The mutant sends a tenth part of 15000 bytes or more. Assert that no sent message has `jsonByteLength >= 15000`.
- It needs an envelope larger than 512 bytes (a GM with a party list), because `recordFitsOneMessage` already limits records to 14488 bytes. The excess is 1 or 2 bytes, probably still under the real Owlbear broadcast limit.

## Survivors that are not gaps

### catch-up.ts

- #3 equivalent: `disarm` is called only with `catch-up` and `answer`; `armedAnswers.delete(undefined)` does nothing.
- #29, #31 equivalent: every call of `request()` already ensures catching-up and `nonce === r` (lines 521, 734, 460–461).
- #48, #49 equivalent: all five callers of `leave()` already ensure an ordinary catch-up.
- #55 equivalent: `lastAliveDigests` has no `null` or `undefined` key, so the digest is `undefined` either way.
- #58, #60, #61 equivalent: the keys of `ignoredDigests` are a subset of the keys of `lastAliveDigests`, and both are deleted together.
- #66 equivalent: `driftStarter` is overwritten before the next read (`enter()` lines 397–398 or `aliveReceived` line 636).
- #163 equivalent: no digest is read during adoption (`aliveReceived` returns at line 601), and `finishAdoption` calls `forgetDigests` before the live phase.
- #187 equivalent: the guard in `leave` (line 272) stops a GM in adoption; a player emits no `read-party`; a role change gives a new `r`.
- #285 equivalent: an extra `show` leads to `publisher.publish()`, which sends nothing when nothing changed.
- #301 equivalent: `setGmLink` reads `answersOwn` only for `online`.
- #312, #314 equivalent: only memory changes, because connection ids that left are not read again. This holds while OBR does not reuse a connection id, as the code comment says.
- #78, #79 unreachable: the engine calls `adoptionStaged` only when `adopting() !== null` (`engine.ts:2026–2030`).
- #112, #114 unreachable: in a drift catch-up, a non-drift `enter` comes only through `role` or `generation`, and `forgetDigests` runs before both.
- #251, #252, #253 unreachable: `receiveState` (`engine.ts:2245–2250`) calls `stateMerged` with relation `higher` only during adoption and when `message.g` equals the target.

### room-copy.ts

- #6 equivalent: only `cancelScheduledWrite` reads `deferred.scheduled`; a stale value cancels a timer that is already cancelled, and line 202 overwrites it.
- #63 equivalent: `writeRoomCopy` calls `cancelScheduledWrite()` at line 212 right after.
- #15, #322 equivalent: in `stopped`, only `waitForWrite` in an import reads `activeWrite()`, and the import returns at the `stopped` check on line 371.
- #46, #48 equivalent in the engine: `adoptFromCopy` for a generation not above the own one does nothing. The `adopt` callback is still called, which a unit test can see. If "a lower copy is not touched" is a contract, one unit test is enough.
- #314 equivalent: the only caller (`engine.ts:2132`) calls `publisher.publish()` on line 2134.
- #165 equivalent: `await run` overwrites the value before its only read.
- #320 equivalent: the fired timer calls `writeRoomCopy`, which returns at the `stopped` check on line 208.
- #124, #133, #194, #213, #216, #233, #248, #251 equivalent: only `isActiveWrite` reads `phase`, and reading, writing and verifying are all active for it.
- #37, #65, #104, #126, #175, #204, #215, #250, #303, #330 equivalent: only a `console.error` is removed.
- #21, #23 unreachable: the difference needs another active write in `lifecycle` when one write ends. The engine's `importing` flag refuses a second import or wipe, and routine writes start only from macrotasks or from the rerun chain that `waitForWrite` checks again.
- #68 unreachable: the engine's `writable()` includes `!stopped`, and `stopped` is set before `roomCopy.stop()`.
- #281 unreachable: `engine.stop()` unsubscribes `onMetadataChange` synchronously, and `adoptFromCopy` checks `stopped`.
- #164 unreachable: only a second `writeImport` waits for an import's `completion`, and the engine refuses it while `importing` is set.

### window-publisher.ts

- #45 equivalent: `publish()` at line 138 already clears `restartPending`, which can be true only while `projected` is false.
- #46 equivalent: `restartPending` is read only while `projected` is false, and only `restart()` returns there, which overwrites it.
- #54 equivalent: the window compares `seq` with the projection's `seq`, and the engine id changes at the same time.
- #59 equivalent: for a GM, `known` feeds only `presetOf`, and `visibleRecords` returns every record for a GM first.
- #72, #78 equivalent: nothing uses the return value of `sendDelta`.
- #51, #76 unreachable: the engine's `send` is `sendQueue.enqueue`, which never rejects.
- #77 unreachable: `enqueue` is async, so it cannot throw synchronously into the `try`.

## Appendix: pass-2 survivors

### catch-up

| id | line | function | mutation | original |
|---|---|---|---|---|
| 3 | 192 | `disarm` | if→true | `timer.kind === 'answer'` |
| 28 | 233 | `scheduleAnswer` | drop statement | `armedAnswers.add(r);` |
| 29 | 239 | `request` | if→true | `phase.kind === 'catching-up' && phase.active.nonce === r` |
| 31 | 239 | `request` | &&→\|\| | `&&` |
| 35 | 251 | `markAnswerSeen` | if→true | `phase.kind === 'catching-up' && phase.active.nonce === r` |
| 45 | 262 | `ask` | !==→=== | `!==` |
| 42 | 262 | `ask` | if→true | `phase.kind !== 'catching-up' \|\| phase.active.trigger !== 'gm-return'` |
| 48 | 272 | `leave` | if→false | `phase.kind !== 'catching-up' \|\| phase.mode.kind === 'adopting'` |
| 49 | 272 | `leave` | \|\|→&& | `\|\|` |
| 55 | 282 | `leave` | \|\|→&& | `\|\|` |
| 61 | 284 | `leave` | &&→\|\| | `&&` |
| 58 | 284 | `leave` | if→true | `gm !== undefined && gm !== null && digest !== undefined` |
| 60 | 284 | `leave` | &&→\|\| | `&&` |
| 66 | 290 | `leave` | drop assignment | `driftStarter = null;` |
| 72 | 308 | `leave` | drop statement | `heldRequests.clear();` |
| 78 | 327 | `finishAdoption` | if→false | `phase.kind !== 'catching-up' \|\| phase.mode.kind !== 'adopting'` |
| 79 | 327 | `finishAdoption` | \|\|→&& | `\|\|` |
| 107 | 389 | `enter` | false→true | `false` |
| 112 | 397 | `enter` | if→false | `trigger !== 'drift'` |
| 114 | 398 | `enter` | drop assignment | `driftStarter = null;` |
| 162 | 488 | `enterFromGeneration` | drop assignment | `answers = new Map();` |
| 163 | 489 | `enterFromGeneration` | drop statement | `forgetDigests();` |
| 169 | 502 | `enterFromGeneration` | true→false | `true` |
| 181 | 531 | `roomCopyRead` | if→true | `options.role() === 'GM'` |
| 189 | 543 | `partyRead` | \|\|→&& | `\|\|` |
| 188 | 544 | `partyRead` | \|\|→&& | `\|\|` |
| 187 | 545 | `partyRead` | \|\|→&& | `\|\|` |
| 197 | 554 | `generationRead` | ===→!== | `===` |
| 200 | 560 | `heard` | &&→\|\| | `&&` |
| 209 | 572 | `stateRequested` | drop statement | `heldRequests.delete(r);` |
| 230 | 611 | `aliveReceived` | drop statement | `ignoredDigests.delete(sender);` |
| 239 | 624 | `aliveReceived` | <→<= | `<` |
| 240 | 624 | `aliveReceived` | -→+ | `-` |
| 251 | 646 | `stateMerged` | if→false | `phase.kind !== 'catching-up' \|\| phase.mode.kind !== 'adopting' \|\| comp` |
| 253 | 646 | `stateMerged` | \|\|→&& | `\|\|` |
| 252 | 647 | `stateMerged` | \|\|→&& | `\|\|` |
| 257 | 653 | `stateMerged` | drop statement | `markAnswerSeen(message.r);` |
| 285 | 694 | `stateMerged` | if→true | `!knowledge.gmAnswered` |
| 301 | 732 | `fired` | false→true | `false` |
| 302 | 734 | `fired` | &&→\|\| | `&&` |
| 306 | 740 | `fired` | &&→\|\| | `&&` |
| 312 | 755 | `partyChanged` | if→false | `!present.has(connection)` |
| 313 | 755 | `partyChanged` | drop ! | `!present.has(connection)` |
| 311 | 755 | `partyChanged` | if→true | `!present.has(connection)` |
| 314 | 756 | `partyChanged` | drop statement | `map.delete(connection);` |
| 315 | 762 | `replicaReplaced` | drop statement | `forgetDigests();` |
| 321 | 771 | `answersOwn` | &&→\|\| | `&&` |
| 325 | 776 | `forgetDigests` | drop statement | `digestMismatches.clear();` |
| 326 | 777 | `forgetDigests` | drop statement | `ignoredDigests.clear();` |
| 327 | 778 | `forgetDigests` | drop assignment | `driftStarter = null;` |

### room-copy

| id | line | function | mutation | original |
|---|---|---|---|---|
| 4 | 82 | `createRoomCopy` | false→true | `false` |
| 6 | 90 | `cancelScheduledWrite` | drop assignment | `deferred.scheduled = undefined;` |
| 15 | 103 | `activeWrite` | ===→!== | `===` |
| 17 | 119 | `finishWrite` | if→true | `lifecycle === operation` |
| 25 | 121 | `finishWrite` | ===→!== | `===` |
| 21 | 121 | `finishWrite` | if→true | `lifecycle.phase === 'stopped' && lifecycle.active === operation` |
| 22 | 121 | `finishWrite` | if→false | `lifecycle.phase === 'stopped' && lifecycle.active === operation` |
| 23 | 121 | `finishWrite` | &&→\|\| | `&&` |
| 24 | 121 | `finishWrite` | ===→!== | `===` |
| 26 | 122 | `finishWrite` | drop assignment | `lifecycle = { phase: 'stopped' };` |
| 31 | 133 | `mergeRoomCopy` | drop statement | `options.changed();` |
| 37 | 147 | `mergeReadRoomCopy` | drop statement | `console.error('Muster Roll could not read the room copy', read.error);` |
| 48 | 166 | `mergeReadRoomCopy` | >→>= | `>` |
| 46 | 166 | `mergeReadRoomCopy` | if→true | `compareGenerations(copy.g, options.generation()) > 0` |
| 55 | 181 | `mergeReadRoomCopy` | drop statement | `noteRoomCopy(metadata, sameGeneration);` |
| 63 | 196 | `scheduleRoomCopy` | drop assignment | `deferred.scheduled = undefined;` |
| 65 | 198 | `scheduleRoomCopy` | drop statement | `console.error('Muster Roll could not write the room copy', error);` |
| 68 | 208 | `writeRoomCopy` | if→false | `lifecycle.phase === 'stopped'` |
| 70 | 212 | `writeRoomCopy` | drop statement | `cancelScheduledWrite();` |
| 79 | 221 | `writeRoomCopy` | if→false | `!options.writable()` |
| 81 | 227 | `writeRoomCopy` | drop assignment | `operation.completion = run.catch(() => undefined);` |
| 91 | 249 | `waitForWrite` | drop statement | `await waitForWrite();` |
| 104 | 271 | `runRoomCopyWrite` | drop statement | `console.error('Muster Roll could not read the room copy', read.error);` |
| 121 | 298 | `runRoomCopyWrite` | >→>= | `>` |
| 124 | 313 | `verifyRoomCopyWrite` | drop assignment | `operation.phase = 'writing';` |
| 126 | 318 | `verifyRoomCopyWrite` | drop statement | `console.error('Muster Roll could not write the room copy', error);` |
| 127 | 320 | `verifyRoomCopyWrite` | if→true | `options.writable()` |
| 133 | 331 | `verifyRoomCopyWrite` | drop assignment | `operation.phase = 'verifying';` |
| 154 | 359 | `verifyRoomCopyWrite` | drop assignment | `deferred.owed = false;` |
| 155 | 359 | `verifyRoomCopyWrite` | false→true | `false` |
| 162 | 371 | `writeImportCopy` | if→false | `lifecycle.phase === 'stopped'` |
| 164 | 377 | `writeImportCopy` | drop assignment | `operation.completion = run.then(() => undefined).catch(() => undefined` |
| 165 | 378 | `writeImportCopy` | false→true | `false` |
| 175 | 389 | `writeImportCopy` | drop statement | `console.error('Muster Roll could not write the room copy', error);` |
| 178 | 402 | `runImportCopy` | true→false | `true` |
| 184 | 407 | `runImportCopy` | drop assignment | `notSaved = false;` |
| 190 | 411 | `runImportCopy` | drop assignment | `deferred.owed = true;` |
| 191 | 411 | `runImportCopy` | true→false | `true` |
| 194 | 425 | `importCopyVerified` | drop assignment | `operation.phase = 'reading';` |
| 204 | 435 | `importCopyVerified` | drop statement | `console.error('Muster Roll could not replace the room copy of a newer ` |
| 212 | 449 | `importCopyVerified` | >→>= | `>` |
| 213 | 453 | `importCopyVerified` | drop assignment | `operation.phase = 'writing';` |
| 215 | 458 | `importCopyVerified` | drop statement | `console.error('Muster Roll could not write the room copy', error);` |
| 216 | 463 | `importCopyVerified` | drop assignment | `operation.phase = 'verifying';` |
| 220 | 466 | `importCopyVerified` | \|\|→&& | `\|\|` |
| 233 | 494 | `removeLowerCopy` | drop assignment | `operation.phase = 'reading';` |
| 235 | 497 | `removeLowerCopy` | if→false | `metadata === null \|\| superseded()` |
| 236 | 497 | `removeLowerCopy` | \|\|→&& | `\|\|` |
| 238 | 498 | `removeLowerCopy` | drop statement | `options.changed();` |
| 246 | 506 | `removeLowerCopy` | drop statement | `noteRoomCopy(metadata, false);` |
| 247 | 506 | `removeLowerCopy` | false→true | `false` |
| 248 | 511 | `removeLowerCopy` | drop assignment | `operation.phase = 'writing';` |
| 250 | 516 | `removeLowerCopy` | drop statement | `console.error('Muster Roll could not remove the replaced room copy', e` |
| 251 | 519 | `removeLowerCopy` | drop assignment | `operation.phase = 'verifying';` |
| 252 | 522 | `removeLowerCopy` | if→true | `after === null \|\| lifecycle.phase === 'stopped'` |
| 253 | 522 | `removeLowerCopy` | if→false | `after === null \|\| lifecycle.phase === 'stopped'` |
| 254 | 522 | `removeLowerCopy` | \|\|→&& | `\|\|` |
| 255 | 522 | `removeLowerCopy` | ===→!== | `===` |
| 256 | 522 | `removeLowerCopy` | ===→!== | `===` |
| 257 | 523 | `removeLowerCopy` | drop statement | `options.changed();` |
| 258 | 528 | `removeLowerCopy` | drop statement | `noteRoomCopy(after, false);` |
| 259 | 528 | `removeLowerCopy` | false→true | `false` |
| 275 | 551 | `failRoomCopy` | if→true | `metadata === null` |
| 281 | 562 | `followMetadata` | if→false | `lifecycle.phase === 'stopped'` |
| 303 | 593 | `pageHidden` | drop statement | `console.error('Muster Roll could not write the room copy', error);` |
| 313 | 615 | `replaced` | drop assignment | `exists = fromCopy;` |
| 314 | 616 | `replaced` | drop statement | `options.changed();` |
| 315 | 619 | `demoted` | drop statement | `cancelScheduledWrite();` |
| 320 | 625 | `stop` | drop statement | `cancelScheduledWrite();` |
| 322 | 626 | `stop` | ===→!== | `===` |
| 330 | 657 | `readMetadata` | drop statement | `console.error('Muster Roll could not read the room metadata', error);` |

### window-publisher

| id | line | function | mutation | original |
|---|---|---|---|---|
| 35 | 141 | `project` | +→- | `+` |
| 36 | 141 | `project` | +→- | `+` |
| 38 | 164 | `project` | if→false | `parts === null` |
| 40 | 165 | `project` | drop statement | `console.error('Muster Roll could not split a projection');` |
| 41 | 167 | `project` | false→true | `false` |
| 45 | 172 | `project` | drop assignment | `restartPending = false;` |
| 46 | 172 | `project` | false→true | `false` |
| 49 | 183 | `project` | drop statement | `Promise.all(sends) .then(() => { answeringNonces.delete(nonce); }) .ca` |
| 50 | 185 | `project` | drop statement | `answeringNonces.delete(nonce);` |
| 51 | 188 | `project` | drop statement | `console.error('Muster Roll could not send a projection', error);` |
| 54 | 198 | `restart` | drop assignment | `sequence = 0;` |
| 57 | 200 | `restart` | drop assignment | `lastComparison = visibleState();` |
| 59 | 211 | `visibleState` | if→true | `source.role !== 'GM'` |
| 60 | 211 | `visibleState` | if→false | `source.role !== 'GM'` |
| 61 | 211 | `visibleState` | !==→=== | `!==` |
| 62 | 215 | `visibleState` | drop statement | `playerKnown.set(key, record);` |
| 63 | 218 | `visibleState` | drop assignment | `known = playerKnown;` |
| 65 | 260 | `sendDelta` | +→- | `+` |
| 66 | 260 | `sendDelta` | +→- | `+` |
| 67 | 260 | `sendDelta` | +→- | `+` |
| 72 | 275 | `sendDelta` | false→true | `false` |
| 76 | 286 | `sendDelta` | drop statement | `console.error('Muster Roll could not send a delta', error);` |
| 77 | 289 | `sendDelta` | drop statement | `console.error('Muster Roll could not send a delta', error);` |
| 78 | 293 | `sendDelta` | true→false | `true` |
| 114 | 357 | `splitParts` | if→false | `pendingParts !== null && !pendingParts.ok` |


## Appendix: the generator

Run with `bun probe.ts <tree> <out.jsonl> [--dry] [--tests unit|replica] [--only ids.json]` from a folder that has `typescript@5` installed. The project uses TypeScript 7, which has no JavaScript compiler API. Run it on a clean checkout: it edits the target files in place and restores them.

```ts
// Mutation probe: generates operator mutants for chosen modules and records which survive their tests.
// Usage: bun probe.ts <tree-root> <out.jsonl> [--dry] [--tests unit|replica] [--only ids.json]
import ts from 'typescript';

const [root, out, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');
const scope = flags.includes('--tests') ? flags[flags.indexOf('--tests') + 1] : 'unit';
const onlyPath = flags.includes('--only') ? flags[flags.indexOf('--only') + 1] : null;
const only: Set<string> | null = onlyPath ? new Set(JSON.parse(await Bun.file(onlyPath).text())) : null;

const modules: Record<string, string[]> = {
  'src/replica/catch-up.ts': ['src/replica/catch-up.test.ts'],
  'src/replica/room-copy.ts': ['src/replica/room-copy.test.ts'],
  'src/replica/window-publisher.ts': ['src/replica/window-publisher.test.ts'],
};

type Mutant = { id: string; file: string; line: number; fn: string; op: string; before: string; after: string; start: number; end: number; text: string };

const swaps: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: '!==',
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: '===',
  [ts.SyntaxKind.LessThanToken]: '<=',
  [ts.SyntaxKind.LessThanEqualsToken]: '<',
  [ts.SyntaxKind.GreaterThanToken]: '>=',
  [ts.SyntaxKind.GreaterThanEqualsToken]: '>',
  [ts.SyntaxKind.AmpersandAmpersandToken]: '||',
  [ts.SyntaxKind.BarBarToken]: '&&',
  [ts.SyntaxKind.PlusToken]: '-',
  [ts.SyntaxKind.MinusToken]: '+',
};

function fnName(node: ts.Node): string {
  const names: string[] = [];
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) names.unshift(n.name.getText());
    else if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent) {
      const p = n.parent;
      if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) names.unshift(p.name.getText());
    }
  }
  return names.join(' > ') || '<module>';
}

function generate(file: string, source: string): Mutant[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const list: Mutant[] = [];
  const add = (node: ts.Node, op: string, start: number, end: number, text: string) => {
    const line = sf.getLineAndCharacterOfPosition(start).line + 1;
    const before = source.slice(start, end);
    list.push({ id: '', file, line, fn: fnName(node), op, before: before.slice(0, 120), after: text.slice(0, 120), start, end, text });
  };
  const visit = (node: ts.Node) => {
    if (ts.isBinaryExpression(node)) {
      const to = swaps[node.operatorToken.kind];
      const stringy = (e: ts.Expression) => ts.isStringLiteral(e) || ts.isTemplateExpression(e) || ts.isNoSubstitutionTemplateLiteral(e);
      if (to && !((to === '-' || to === '+') && (stringy(node.left) || stringy(node.right)))) {
        add(node, `${node.operatorToken.getText()}→${to}`, node.operatorToken.getStart(), node.operatorToken.getEnd(), to);
      }
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      add(node, 'drop !', node.getStart(), node.getEnd(), node.operand.getText());
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) add(node, 'true→false', node.getStart(), node.getEnd(), 'false');
    if (node.kind === ts.SyntaxKind.FalseKeyword) add(node, 'false→true', node.getStart(), node.getEnd(), 'true');
    if (ts.isIfStatement(node)) {
      add(node.expression, 'if→true', node.expression.getStart(), node.expression.getEnd(), 'true');
      add(node.expression, 'if→false', node.expression.getStart(), node.expression.getEnd(), 'false');
    }
    if (ts.isExpressionStatement(node)) {
      let e = node.expression;
      if (ts.isAwaitExpression(e) || ts.isVoidExpression(e)) e = e.expression;
      const assign = ts.isBinaryExpression(e) && e.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && e.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
      if (ts.isCallExpression(e) || assign || ts.isPostfixUnaryExpression(e) || ts.isPrefixUnaryExpression(e)) {
        add(node, assign ? 'drop assignment' : 'drop statement', node.getStart(), node.getEnd(), ';');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return list;
}

const all: Mutant[] = [];
for (const file of Object.keys(modules)) {
  const source = await Bun.file(`${root}/${file}`).text();
  const seen = new Set<string>();
  for (const m of generate(file, source)) {
    const key = `${m.start}:${m.end}:${m.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    m.id = `${file.split('/').pop()!.replace('.ts', '')}#${seen.size}`;
    all.push(m);
  }
}

const selected = only ? all.filter((m) => only.has(m.id)) : all;
console.log(`mutants: ${selected.length}`, Object.fromEntries(Object.keys(modules).map((f) => [f, selected.filter((m) => m.file === f).length])));
if (dry) process.exit(0);

let current: { path: string; original: string } | null = null;
const restore = () => { if (current) require('node:fs').writeFileSync(current.path, current.original); };
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });

const sink = Bun.file(out).writer();
let done = 0;
for (const m of selected) {
  const path = `${root}/${m.file}`;
  const original = await Bun.file(path).text();
  current = { path, original };
  await Bun.write(path, original.slice(0, m.start) + m.text + original.slice(m.end));
  const tests = scope === 'replica' ? ['src/replica/'] : modules[m.file];
  const proc = Bun.spawn({ cmd: ['bun', 'test', '--bail', ...tests], cwd: root, stdout: 'ignore', stderr: 'ignore' });
  const timer = setTimeout(() => proc.kill('SIGKILL'), scope === 'replica' ? 180_000 : 30_000);
  const code = await proc.exited;
  clearTimeout(timer);
  await Bun.write(path, original);
  current = null;
  const result = proc.signalCode === 'SIGKILL' ? 'timeout' : code === 0 ? 'survived' : 'killed';
  const { start, end, text, ...row } = m;
  sink.write(JSON.stringify({ ...row, result }) + '\n');
  sink.flush();
  done += 1;
  if (done % 25 === 0) console.log(`${done}/${selected.length}`);
}
await sink.end();
console.log('done');
```
