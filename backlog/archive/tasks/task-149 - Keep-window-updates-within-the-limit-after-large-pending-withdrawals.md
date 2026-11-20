---
id: TASK-149
title: Keep window updates within the limit after large pending withdrawals
status: To Do
assignee: []
created_date: '2026-11-20T13:56:00Z'
updated_date: '2026-11-20T15:58:00Z'
labels: []
dependencies: []
references:
  - src/replica/window-publisher.ts
documentation:
  - >-
    _bmad-output/implementation-artifacts/spec-task-106-delete-parent-descendants.md
priority: low
type: bug
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-106 review found an existing projection limit. After the GM queues a deletion during catch-up, the window can hold a pending record for every affected block. At catch-up completion, `window-publisher.ts` puts all withdrawn keys in one delta envelope. If those keys alone exceed the message limit, `sendDelta` sends nothing, but `publish` advances its held state. The window may keep its old projection and catch-up header. The same path already exists for sheet deletion. This is a source-level finding; no browser occurrence was observed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After catch-up completes, a GM window that holds pending keys whose withdrawals exceed one message receives the current room state and leaves catch-up without a reload.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Archived 2026-11-20 by the owner's decision ("149 архивировать"). The path needs a GM to queue deletions of so many blocks during catch-up that the withdrawn keys alone exceed one window message. It is a source-level finding with no browser occurrence, the same class of minimal-probability case the owner does not spend code on.
<!-- SECTION:NOTES:END -->
