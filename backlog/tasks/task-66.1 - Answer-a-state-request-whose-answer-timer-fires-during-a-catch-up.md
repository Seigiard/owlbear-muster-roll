---
id: TASK-66.1
title: Answer a state request whose answer timer fires during a catch-up
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-15T08:12:00Z'
updated_date: '2026-11-15T09:01:00Z'
labels:
  - replica
  - catch-up
dependencies: []
documentation:
  - _bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md
parent_task_id: TASK-66
priority: high
type: bug
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A live GM arms a delayed answer to a `state-request`. If the GM enters an ordinary catch-up (for example on page return) before the timer fires, `fired({ kind: 'answer' })` returns nothing because `canAnswer()` is false, and the request never enters `heldRequests`. So the GM does not answer it at the end of the catch-up either. The comment on `heldRequests` (`src/replica/catch-up.ts:171`) promises that held requests are answered at exit "as nobody asks again"; a request armed just before the catch-up misses that promise, and the asking player can stay without state until a later catch-up. The probe document, section "Confirmed defect", has the exact reproduction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A request whose answer was armed while live, and whose timer fires while the GM cannot answer because of an ordinary catch-up, is answered through the same delay and suppression as a held request when that catch-up ends, unless an answer to it was seen meanwhile.
- [ ] #2 A GM whose new generation is incomplete (AD-9) still sends no answer when an armed timer fires.
- [ ] #3 A unit test in `src/replica/catch-up.test.ts` reproduces the defect: it fails on the current code and passes after the fix.
- [ ] #4 A mutation control in `tools/mutants/catch-up.json` protects the rule, and `bun run mutants catch-up` kills it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock a regression for an armed answer whose timer fires during ordinary catch-up, with suppression and AD-9 controls.
2. Retain the request through the existing held-request rule and add a mutation control.
3. Run focused and repository checks, then finalize this task after validation.
<!-- SECTION:PLAN:END -->
