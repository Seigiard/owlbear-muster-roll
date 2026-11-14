---
id: TASK-61.8
title: Run the link picker through a pure reducer
status: In Progress
assignee:
  - '@opencode'
created_date: '2026-11-14T08:28:00Z'
updated_date: '2026-11-14T18:21:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.7
references:
  - src/ui/picker/link-picker.tsx
  - prototypes/ui-second-flow/picker-flow.ts
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
  - >-
    _bmad-output/implementation-artifacts/spec-4-7-offer-the-sheet-name-as-the-token-label.md
parent_task_id: TASK-61
type: task
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The link picker in src/ui/picker/link-picker.tsx keeps its rules in four effects and three refs: read the token label once, block picks while reading, send the link, finish only when the matching record reaches the replica (not on the command answer), write the label only while still GM, notify before close, allow a new pick after a rejected close. TASK-61.6 wrote the same rules as a pure transition in prototypes/ui-second-flow/picker-flow.ts and found the one thing that differs from navigation: a retry can target the same token, so the operation identity is a local attempt counter, not a fresh domain key. ADR 0002 and the CLAUDE.md block fix the production shape: a reducer module, useReducer in the component, and the ports and effects in that component. The prototype's effect-running caller is a test harness and is not carried over. The label write and the popover close go through Owlbear ports that the mock cannot prove.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reducer module under src/ui/picker/ imports only types and core functions and owns: read gating and the offer default, arrival-over-answer priority, the GM check before the label write, notify-before-close, and attempt identity for same-target retries
- [x] #2 link-picker.tsx holds the reducer with useReducer; the label read, link command, label write, failure notice and close, with their two bounded waits, run in the component's handlers and effects; there is no caller or runner module and no effect ids
- [x] #3 tests/link.e2e.ts and src/ui/picker/link-picker.test.tsx pass unchanged; reducer unit tests cover the TASK-61.6 matrix: arrival before answer, refused link, label write failure, demotion before the write, close rejection with a same-target retry, and a stale completion from an earlier attempt
- [x] #4 prototypes/ui-second-flow/README.md names the production module as the owner of the rules, or the prototype is removed
- [ ] #5 The owner checked label write and popover close in a live Owlbear room and the result is in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the link-picker transition rules into a pure reducer under src/ui/picker and migrate the prototype rule matrix into adjacent reducer tests without changing existing component or browser tests.
2. Wire useReducer into link-picker.tsx while keeping Owlbear commands, ports, bounded waits, notices, and close effects in the component.
3. Add the required task spec, update prototype README ownership wording, run mutation controls and all required checks with durable evidence, and commit the concern slices.

4. Fix terminal picker eligibility from the reducer selectors while preserving rejected-close retries; verify the locked regression before final checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented production picker reducer and useReducer integration; migrated reducer matrix tests, updated prototype ownership README, and added task spec. Existing picker component/e2e test files remain unchanged. Mutation controls are under the TDD controls directory and catch five faithful reducer regressions.

Batch 2 review fix is limited to successful-close terminal eligibility; the locked reducer test is the independent regression oracle.

Batch 2 terminal-eligibility fix is verified: canPick and canOffer are false after successful close, rendered target and label controls use those selectors, and rejected close still permits same-target retry. Focused picker suite passed 49 tests; full six checks passed with durable log /Users/seigiard/.cache/herdr-run/task618-attempt2-full.log. Fresh five mutation controls all failed their intended assertions and restored the reducer exactly; logs and git-apply-compatible patches are in /Users/seigiard/.claude/artifacts/tdd-20261114-618/61.8/controls/. Review triage, the stable-prop lifetime limitation, and the unverified demotion interval are recorded in the task spec/deferred-work. AC5 remains pending the owner live Owlbear check; no live room was used.

Final confirming review completed on 33c6c4461b1f6eeedee736ce37ef3f8459ebbb67: focused round found the successful-close eligibility regression, the locked regression test failed before the fix and passed after it, and final-profile review reported no blocking findings with 2/2 sources and no degraded coverage. The stable-prop limitation and unverified intermediate role-delivery interval remain documented. AC5 still requires the owner to verify token label persistence and popover closure in a live Owlbear room; no deployment or live-room write was performed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The production link picker now runs its rules through a pure reducer while React keeps commands, ports and bounded waits. Existing component and e2e tests are unchanged. The full check passed: 2992 unit tests, one environment-only skip, 520 browser tests, format, lint, types and build. Five mutation controls failed the intended assertions and restored the source. The review-found post-close eligibility regression is fixed and final review reported no blocking findings. AC1-AC4 are verified; AC5 remains unchecked and the task stays In Progress pending the owner live Owlbear check. Stable-prop lifetime and the unverified intermediate demotion interval are documented limits.
<!-- SECTION:FINAL_SUMMARY:END -->
