---
id: TASK-129
title: Keep a client's own state answer during adoption
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T15:32:00Z'
updated_date: '2026-11-19T18:02:00Z'
labels: []
dependencies: []
references:
  - src/replica/catch-up.ts
  - src/replica/room-protocol.ts
  - _bmad-output/implementation-artifacts/deferred-work.md
priority: medium
type: bug
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Regression from TASK-115.1, found by the closing review of epic TASK-115 (PR #63) and shipped on the owner's decision. On master before the epic, adoption was a mode of the catching-up phase, so catch-up's answersOwn(r) was true for the active nonce while a client adopted. The transition table made adoption its own phase kind 'adopting', and answersOwn in src/replica/catch-up.ts still checks only 'catching-up'. When a client adopting generation G2 gets a state answer to its own request from a GM already at G3 (a second import or wipe during adoption), room-protocol.ts passes keepNonce=false to seeGeneration: the client mints a new nonce, drops the valid answer and its parts, and asks again, so every GM sends its full state once more. No data is lost; adoption finishes one answer delay later. room-protocol.ts:164-165 documents the contract this breaks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A state message that answers the client's active nonce counts as answersOwn while the client is in the adopting phase, as it did on master
- [x] #2 A client adopting G2 that receives a G3 state answer to its own request keeps that nonce and merges the answer into the G3 adoption, with no second state-request
- [x] #3 A test in src/replica/catch-up.test.ts pins answersOwn in the adopting phase
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. answersOwn in catch-up.ts counts the active nonce in the adopting phase too.
2. Pin it in catch-up.test.ts and in a room-level test: an adopting client keeps its nonce on a higher-generation answer to its own request, merges it, and sends no second state-request.
3. Make the fix the replica-catch-up model's AnswersOwn (SKILL.md finding 5), move sync commits of the models covering catch-up.ts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix in 064e178: answersOwn uses isCatchingUp (exported from catch-up-table.ts), so the adopting phase counts its active nonce. AC1 and AC3: catch-up.test.ts 'answersOwn is true only for the active nonce of an adopting client' (red before the fix, and red for an answersOwn true for any r while adopting). AC2: engine-import.test.ts 'an adopting client keeps its request when a GM of a still higher generation answers it' (red before: one more state-request and the old data kept; green after: live, no new request, generation 2 records shown and stored). Model: formal/catch-up AnswersOwn is the fixed behavior; the finding became mutations/answers-own-ordinary-only.cfg; imports.cfg and imports-gm.cfg check OwnAnswerKeepsRequest. Checks: oxfmt, lint, typecheck, bun test 3605 pass, test:browser 587 pass, build, mutants 53/53 killed, formal check.sh.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An adopting client now keeps its request when a GM of a higher generation answers it: answersOwn counts the active nonce in the adopting phase as well as in an ordinary catch-up, through the same isCatchingUp check enterFromGeneration uses. Before, such a client took a new nonce, dropped the answer and asked every GM for full state again (no data loss, one extra answer delay). Unit and engine tests pin the behavior; the catch-up TLA+ model now checks OwnAnswerKeepsRequest in the two-import rooms and keeps the old behavior as a mutation that must fail. Full check set green.
<!-- SECTION:FINAL_SUMMARY:END -->
