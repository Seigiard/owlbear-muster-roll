---
id: TASK-48
title: Make catch-up and the GM link one state machine
status: To Do
assignee: []
created_date: '2026-11-12T02:11:00Z'
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
- [ ] #1 A design note records where the cut goes relative to generation adoption before code changes
- [ ] #2 Catch-up and GM link rules live in one module that takes events and returns decisions; timers only schedule calls into it, as CLAUDE.md requires
- [ ] #3 That module has deterministic tests with no full engine and no real-time waits, covering the f8a8d0e case
- [ ] #4 Other engine paths read the catch-up state through that module, not through shared variables
- [ ] #5 AD-1 (no leader), AD-6, AD-7 and AD-9 behavior is unchanged; terms such as catch-up are added to GLOSSARY.md if the module is named after them; the full check passes
<!-- AC:END -->
