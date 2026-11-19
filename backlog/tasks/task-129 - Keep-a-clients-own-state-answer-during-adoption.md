---
id: TASK-129
title: Keep a client's own state answer during adoption
status: To Do
assignee: []
created_date: '2026-11-19T15:32:00Z'
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
- [ ] #1 A state message that answers the client's active nonce counts as answersOwn while the client is in the adopting phase, as it did on master
- [ ] #2 A client adopting G2 that receives a G3 state answer to its own request keeps that nonce and merges the answer into the G3 adoption, with no second state-request
- [ ] #3 A test in src/replica/catch-up.test.ts pins answersOwn in the adopting phase
<!-- AC:END -->
