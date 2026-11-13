---
id: TASK-48
title: Make catch-up and the GM link one state machine
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T02:11:00Z'
updated_date: '2026-11-12T18:17:00Z'
labels: []
dependencies: []
references:
  - src/replica/engine.ts
  - src/replica/engine-catch-up.test.ts
  - src/replica/engine-liveness.test.ts
  - src/replica/engine-no-gm.test.ts
priority: low
type: task
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The AD-6 and AD-7 rules are a state machine spread over about 25 functions (`enterCatchUp` to `leaveCatchUp`, `receiveStateRequest`, `answerState`, `hearGm`, `watchGmSilence`, `receivePing`, `receiveAlive`) and about 20 variables in `src/replica/engine.ts` (lines ~415-470: `sync`, `ownNonce`, `answers`, `heldRequests`, `gmLink`, `gmSilenceTimer`, ...). Unrelated paths read those variables: `runCommand`, `receiveProposal`, `canWriteRoomCopy`. Commit f8a8d0e (answer player catch-ups that reach a GM still catching up) changed 138 lines of the engine and four test files; the bug was in how answering, holding and re-asking interact. The tests (`engine-catch-up` 1511 lines, `engine-liveness` 889, `engine-no-gm` 781) need several full engines and real timeouts. The cut line is open: the machine is tangled with generation adoption (`seeGeneration`, `adoptTarget`, `incomplete*`), so this task starts with a design pass. Found in the architecture review of 2026-11-12 (candidate 4, Worth exploring).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A design note records where the cut goes relative to generation adoption before code changes
- [x] #2 Catch-up and GM link rules live in one module that takes events and returns decisions; timers only schedule calls into it, as CLAUDE.md requires
- [x] #3 That module has deterministic tests with no full engine and no real-time waits, covering the f8a8d0e case
- [x] #4 Other engine paths read the catch-up state through that module, not through shared variables
- [x] #5 AD-1 (no leader), AD-6, AD-7 and AD-9 behavior is unchanged; terms such as catch-up are added to GLOSSARY.md if the module is named after them; the full check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-48-catch-up-state-machine.md (written against master 7b05722; refresh after TASK-46 lands).
1. Merge master after TASK-46; baseline junit list of bun test, e2e pass list, wall time of the three catch-up test files.
2. Phase A: add src/replica/catch-up.ts (sync event -> decisions state machine: catch-up, answers, GM link, drift, adoption gate); engine runs decisions, owns timers and async reads; no test file changes; junit list equals baseline; mutations M1-M12 fail the same tests before and after. Add Catch-up to GLOSSARY.md.
3. Phase B: src/replica/catch-up.test.ts, one deterministic test per matrix row, no engine, no real time.
4. Phase C: retire the 8 named drift-rule tests of engine-liveness.test.ts, each mapped to its owner.
5. AD-7 spine line naming src/replica/catch-up, committed on its own; full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design pass (AC #1): the cut goes around the adoption gate, not its data. adoptTarget !== null implies catching-up (seeGeneration always ends in catching-up; leaveCatchUp refuses while a target is set), so adoption is a sub-state of catch-up. The module owns the target generation and the incomplete-retry backoff; the engine keeps incoming, staging, the save, the replica swap, dropping pending work and the notice. Completion goes through an injected saveAdoption(generation, fromCopy): boolean. Rejected: gate in the engine (adopting() query plus two-step completion), data in the module (touches persistence, replica, windows, pending work), effectful module with injected schedule/send (async continuations need an effect sink). For TASK-50: canWriteRoomCopy becomes role GM && persistence && catchUp.live(); the adoptTarget term is redundant.

Evidence. AC1: Design Notes of spec-task-48 (ec83965) and the design-pass note above, before code. AC2: src/replica/catch-up.ts (ef03b8b) is synchronous; its events return decisions; the engine's timer table only calls catchUp.fired(timer). AC3: src/replica/catch-up.test.ts has 48 tests with deterministic fakes, no engine, no room-rig, no timer. f8a8d0e is covered by the matrix rows 'f8a8d0e hold', 'GM return' and 'ask again' (tests 'a GM in ordinary catch-up holds a request and answers it only if still unanswered on exit' and 'a returning GM asks again only ...'). Mutations M1-M12 each fail at least one module test. AC4: rg for ownNonce|answerTimers|heldRequests|gmSilenceTimer|digestMismatches|adoptTarget|incompleteRetryMs in engine.ts finds nothing; canWriteRoomCopy reads catchUp.live(). AC5: after phase A, the junit list of the whole bun test equals the baseline. Mutations M1-M12 fail the same engine tests as at the baseline, except for an M5 timing race that exists on both sides (deferred-work.md). GLOSSARY.md gains Catch-up. Full check at cba09c2: oxfmt, lint, typecheck, bun test 2721 pass, test:browser 492 pass, build ok. Code review: round 1 (9 sources) had 1 major and 11 minors, all fixed through the tdd chain; round 2 (final) found nothing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Catch-up, the GM link, drift, held requests and the adoption gate (AD-6, AD-7, AD-9) now live in one synchronous state machine, src/replica/catch-up.ts. Its events return decisions. The engine runs them and owns the timers and async reads. 48 deterministic module tests replace 8 drift-rule engine tests. Every M1-M12 rule mutation fails a module test. Room behavior is unchanged: the phase-A junit list equals the baseline, and the full check passes (bun test 2721, test:browser 492, build). The spine names src/replica/catch-up as the AD-6/AD-7 owner. Risk: under mutation M5, some two-GM engine tests are racy, before and after (deferred-work.md). Unblocks TASK-50: canWriteRoomCopy needs only catchUp.live().
<!-- SECTION:FINAL_SUMMARY:END -->
