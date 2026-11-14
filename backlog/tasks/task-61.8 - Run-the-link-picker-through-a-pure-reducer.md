---
id: TASK-61.8
title: Run the link picker through a pure reducer
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T08:28:00Z'
updated_date: '2026-11-14T19:52:00Z'
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
  - https://github.com/Seigiard/owlbear-muster-roll/pull/18
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
- [x] #5 The owner checked label write and popover close in a live Owlbear room and the result is in the task notes
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

Owner live verification after merged PR #18: the owner reported “1 работает”, “2 работает”, “3 работает”, and “4 работает” against the four-case Owlbear checklist. The cases covered an empty token label receiving the sheet name, an existing label remaining unchanged with the offer unchecked, explicit replacement after checking the offer, and a repeat block supplying its own name. Each case included saving the link and automatic popover closure. This is owner-reported live evidence, not a mock result. The owner then withdrew the request to change the checkbox default after noticing that the token already had a label, and confirmed that the current behavior is correct. AC5 is satisfied; no code or checkbox-default change is part of this update.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The link-picker reducer extraction was merged in PR #18. The owner confirmed all four live Owlbear label and popover-close checks, completing AC5; all five acceptance criteria are now verified and TASK-61.8 is Done. The existing checkbox default remains unchanged: checked for an empty readable label, unchecked for an existing label, with manual override. Automated verification on the merged implementation passed format, lint, types, build, 3009 unit tests (one environment-only skip) and 520 browser tests. Documented deferred limits remain separate from this completed task.
<!-- SECTION:FINAL_SUMMARY:END -->
