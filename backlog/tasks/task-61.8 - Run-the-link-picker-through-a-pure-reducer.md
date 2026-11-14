---
id: TASK-61.8
title: Run the link picker through a pure reducer
status: To Do
assignee: []
created_date: '2026-11-14T08:28:00Z'
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
- [ ] #1 A reducer module under src/ui/picker/ imports only types and core functions and owns: read gating and the offer default, arrival-over-answer priority, the GM check before the label write, notify-before-close, and attempt identity for same-target retries
- [ ] #2 link-picker.tsx holds the reducer with useReducer; the label read, link command, label write, failure notice and close, with their two bounded waits, run in the component's handlers and effects; there is no caller or runner module and no effect ids
- [ ] #3 tests/link.e2e.ts and src/ui/picker/link-picker.test.tsx pass unchanged; reducer unit tests cover the TASK-61.6 matrix: arrival before answer, refused link, label write failure, demotion before the write, close rejection with a same-target retry, and a stale completion from an earlier attempt
- [ ] #4 prototypes/ui-second-flow/README.md names the production module as the owner of the rules, or the prototype is removed
- [ ] #5 The owner checked label write and popover close in a live Owlbear room and the result is in the task notes
<!-- AC:END -->
